# 周末闲时活动规划

一个 AI 驱动的周末活动规划助手，根据你的需求自动生成完整的周末出行方案。

<img width="1456" height="794" alt="截屏2026-05-22 01 07 32" src="https://github.com/user-attachments/assets/19635906-b5e9-4be8-9a2d-adc2f6011ed7" />


## 核心功能

### 1. 智能需求解析
- 输入自然语言描述（"明天下午4个朋友聚会，预算200"）
- AI 自动提取：出行日期、时间、人数、场景类型、预算、特殊约束

### 2. 行程确认卡片
- 以"小票"形式展示解析结果
- 支持手动修改所有参数（日期、时间、人数、预算、场景）
- 显示目标日期的天气预报和出行建议

### 3. AI 规划方案
- 基于 DeepSeek LLM 生成个性化方案
- **智能天气适配**：极端天气（中雨/高温/雾霾等）自动切换为室内版，小雨/阴天室外方案带风险提示
- 同时提供室内版/室外版两个版本，可自由切换（带倾斜动画）
- 每一步包含：
  - 活动时间、地点
  - **通勤时间**：后端实时计算公交上下车站（地铁10号线(豫园→老西门)），短距离自动切换步行

### 4. 完整路线展示
- 时间线视图展示全天行程（含通勤时间）
- 地图可视化路线
- 室内版/室外版 Tab 切换（12度倾斜色块动画）
- 周边替代选项提示

## 技术栈

| 前端 | 后端 |
|------|------|
| React + TypeScript | FastAPI |
| Tailwind CSS | DeepSeek API |
| Ant Design | 高德地图 JS API |
| Motion React | |

## 快速开始

### 前端

```bash
npm install
npm run dev
# 访问 http://localhost:3000
```

### 后端

```bash
cd backend
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 配置

创建 `.env` 文件：

```env
OPENAI_API_KEY=your_deepseek_key
OPENAI_API_BASE=https://api.deepseek.com
VITE_AMAP_WEB_JS_KEY=your_amap_key
```

## 项目结构

```
├── src/
│   ├── components/ConfirmCard.tsx   # 行程确认卡片
│   ├── views/ResultView.tsx         # 规划结果页
│   ├── services/api.ts              # API 调用
│   └── App.tsx                      # 主应用
├── backend/
│   ├── agents/planner_agent.py     # AI 规划 Agent
│   ├── services/llm_service.py      # DeepSeek API
│   └── api/routes/plan.py           # API 路由
```

## 使用流程

1. **输入需求** → 在首页输入框描述你的周末计划
2. **确认解析** → 查看并修改 AI 解析出的出行参数
3. **查看方案** → 在结果页切换室内/室外版本，浏览完整时间线
4. **执行规划** → 查看活动详情、导航到目的地

## License

MIT
