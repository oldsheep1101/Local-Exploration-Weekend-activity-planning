"""LLM 服务 - DeepSeek API 调用"""

import os
import json
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import requests
from dotenv import load_dotenv

# 在模块加载时就加载 .env
_basedir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_env_path = os.path.join(_basedir, '.env')
if os.path.exists(_env_path):
    load_dotenv(_env_path)
else:
    _env_path = os.path.join(_basedir, '..', '.env')
    if os.path.exists(_env_path):
        load_dotenv(_env_path)


class LLMService:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
        self.base_url = os.getenv("OPENAI_API_BASE") or "https://api.deepseek.com"
        self.model = os.getenv("LLM_MODEL") or "deepseek-chat"

    def chat(self, messages: List[Dict[str, str]], temperature: float = 0.7, max_tokens: int = 2000) -> Dict[str, Any]:
        if not self.api_key:
            raise ValueError("API key 未配置")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=120
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"LLM API 调用失败: {str(e)}")

    def _convert_chinese_number(self, value):
        """转换中文数字到阿拉伯数字"""
        if value is None or value == "":
            return value
        if isinstance(value, (int, float)):
            return value
        if isinstance(value, str):
            # 中文数字映射
            cn_map = {'零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}
            try:
                # 如果已经是阿拉伯数字，直接返回
                return int(value)
            except ValueError:
                # 处理中文数字
                result = 0
                temp = 0
                unit = 1
                for char in reversed(value):
                    if char in cn_map:
                        temp += cn_map[char] * unit
                    elif char == '十':
                        unit = 10
                        result += temp
                        temp = 0
                    elif char == '百':
                        unit = 100
                        result += temp
                        temp = 0
                    elif char == '千':
                        unit = 1000
                        result += temp
                        temp = 0
                    elif char == '万':
                        unit = 10000
                        result += temp * unit
                        temp = 0
                result += temp
                return result if result > 0 else value
        return value

    def generate_plan(self, prompt: str) -> Dict[str, Any]:
        messages = [
            {"role": "system", "content": """你是一个周末活动规划助手。用户描述需求后，生成一个 JSON 格式的规划方案。
必须返回有效的 JSON，包含字段：summary(摘要), steps(步骤数组，每项有time_range/duration_minutes/title/description/location/type)"""},
            {"role": "user", "content": prompt}
        ]
        response = self.chat(messages, temperature=0.8)
        content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
        try:
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            return json.loads(content.strip())
        except json.JSONDecodeError:
            return {"raw": content}

    def parse_query(self, query: str, city: str, current_time: str = None) -> Dict[str, Any]:
        """解析用户输入，提取出行日期、出发时间、人数、预算、场景"""
        
        # 如果没有传当前时间，默认用系统时间
        if not current_time:
            now = datetime.now()
            current_time = now.strftime("%Y-%m-%d %H:%M")
            # 默认出发时间：如果用户没说具体时间，"今天"用现在+1小时取整，"明天及以后"默认14:00
            # 判断逻辑由 LLM 解析 date 字段后决定，这里先存基准值
            default_time_str = "14:00"  # 默认值，LLM 解析 date 时会参考当前时间决定是否用这个
        else:
            default_time_str = "14:00"
        
        messages = [
            {"role": "system", "content": f"""你是一个出行需求解析助手。从用户的自然语言中提取以下字段。

## 字段说明及默认值

1. **出行日期** (date)
   - 默认值：用户说"今天""下午"→ 今天（{current_time[:10]}）
   - "明天""周六""周日"→ 推算具体日期
   - 完全没有时间词 → 默认今天
   - 格式：YYYY-MM-DD

2. **出发时间** (departure_time)
   - 默认值："{default_time_str}"（只有明天及以后才用这个；今天的默认是现在+1小时取整）
   - 规则：
     - 用户说"今天"+没给具体时间 → 看当前时间（{current_time[:10]}），当前时间+1小时，取整到半点（如现在15:20则默认16:00）
     - 用户说"明天""后天""周六"或任何具体未来日期+没给时间 → 默认 14:00
     - 用户说"上午" → 09:00，"下午" → 14:00，"傍晚" → 17:00，"晚上" → 19:00
     - 明确说了时间（"3点""三点半""15:00"）→ 直接用用户的时间
     - "现在就走""马上出发"→ 当前时间+1小时取整

3. **出行人数** (party_size)
   - 默认值：1
   - "和朋友""和同学""几个人"→ 提取具体数字
   - "一家人""全家"→ 3人
   - "带孩子""带老婆"→ 至少2-3人
   - 提到孩子年龄 → 记录在 constraints 里

4. **人均预算** (budget_per_person)
   - 默认值：null（表示不限）
   - "便宜""实惠"→ 50
   - "人均100""预算200以内"→ 提取数字
   - "吃好点""随便花""不限"→ null
   - 返回数字或 null

5. **出行场景** (scenario)
   - 默认值："casual"
   - 关键词判断：
     - 孩子/宝宝/带娃/亲子 → "family"
     - 朋友/同学/闺蜜/兄弟/哥们 → "friends"
     - 老婆/老公/男女朋友/约会 → "couple"
     - 一个人/自己/独自 → "solo"
     - 没有明确提示 → "casual"

6. **约束条件** (constraints)
   - 特殊要求以字符串数组返回
   - 例如：["离家近", "有儿童餐", "低卡", "安静", "评分高"]
   - 没有特殊要求 → 空数组 []

## 输出格式
严格返回 JSON，不要任何额外文字：
{{
  "date": "YYYY-MM-DD",
  "departure_time": "HH:MM",
  "party_size": 数字,
  "budget_per_person": 数字或null,
  "scenario": "family|friends|couple|solo|casual",
  "constraints": ["约束1", "约束2"]
}}"""},
            {"role": "user", "content": f"""当前时间：{current_time}
用户所在城市：{city}
用户输入：{query}

请提取信息并返回 JSON。"""}
        ]
        
        response = self.chat(messages, temperature=0.1, max_tokens=500)
        content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
        print(f"🔍 LLM 原始返回: {content}")

        try:
            # 清理可能的 markdown 代码块
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            result = json.loads(content.strip())

            # 清洗 budget_per_person：如果返回的是字符串（如"五十"、"50元"）则提取数字
            if "budget_per_person" in result and result["budget_per_person"] is not None:
                bp = result["budget_per_person"]
                if isinstance(bp, str):
                    import re
                    match = re.search(r'\d+', bp)
                    if match:
                        result["budget_per_person"] = int(match.group())
                    else:
                        # 纯中文数字映射
                        cn_num = {"零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "百": 100}
                        if bp in cn_num:
                            result["budget_per_person"] = cn_num[bp]
                        else:
                            result["budget_per_person"] = None

            # 确保必填字段有默认值
            now = datetime.now()
            default_departure = now + timedelta(hours=1)
            default_departure = default_departure.replace(
                minute=(default_departure.minute // 30) * 30,
                second=0,
                microsecond=0
            )
            
            defaults = {
                "date": now.strftime("%Y-%m-%d"),
                "departure_time": default_departure.strftime("%H:%M"),
                "party_size": 1,
                "budget_per_person": None,
                "scenario": "casual",
                "constraints": []
            }
            
            for key, default_value in defaults.items():
                if key not in result or result[key] is None or result[key] == "":
                    result[key] = default_value

            # 转换中文数字
            result["party_size"] = self._convert_chinese_number(result.get("party_size"))
            result["budget_per_person"] = self._convert_chinese_number(result.get("budget_per_person"))

            return result
            
        except json.JSONDecodeError:
            # 解析失败返回全默认值
            now = datetime.now()
            default_departure = now + timedelta(hours=1)
            default_departure = default_departure.replace(
                minute=(default_departure.minute // 30) * 30,
                second=0,
                microsecond=0
            )
            return {
                "date": now.strftime("%Y-%m-%d"),
                "departure_time": default_departure.strftime("%H:%M"),
                "party_size": 1,
                "budget_per_person": None,
                "scenario": "casual",
                "constraints": []
            }


_llm_service = None

def get_llm() -> LLMService:
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service