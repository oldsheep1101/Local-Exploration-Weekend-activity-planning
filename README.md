# 周末闲时活动规划系统

多用户协同的周末活动规划助手，支持 @mentions 多人偏好、地理区域约束、和动态规划策略。

<img width="1456" height="794" alt="截屏2026-05-22 01 07 32" src="https://github.com/user-attachments/assets/19635906-b5e9-4be8-9a2d-adc2f6011ed7" />

## 核心功能

### 1. 多人协同规划
- 输入 `@alice @bob 下午出行` 多人出行
- 系统从数据库读取各人偏好向量和硬约束
- 偏好自动聚合（平均），硬约束合并（任一人有则应用）

### 2. 多通道召回（Multi-channel Recall）
- **Activity Pool**：独立搜索玩乐/参观/运动类 POI
- **Food Pool**：独立搜索餐饮类 POI
- **Optional Pool**：独立搜索可选/备用 POI
- 保证每个池子都有候选，解决"规划里没有餐厅"的问题

### 3. LLM 批量 Tagging（一次调用）
- 一次 LLM 请求给所有 POI 打 13 维语义标签
- aesthetic / social / spicy / light_diet / family_friendly / romantic / active / indoor / outdoor / popular / budget_friendly / quiet / trendy

### 4. Pool 内 Ranking（纯代码，0ms）
- 按用户偏好向量加权打分
- 硬约束过滤（如：不能吃辣 → 高 spicy POI 被拒绝）
- indoor/outdoor 互斥标签正确处理

### 5. Area Grouping（地理区域约束）
- 上海 16 个区域中心坐标 + 相邻区域映射
- 优先选同区 POI，通勤超过阈值自动放宽
- 避免"活动在浦东、餐厅在松江"这种跨城规划

### 6. Feasibility Loop（约束放宽）
- Level 1：同区 + 30min 通勤
- Level 2：放宽到 45min
- Level 3：取消 optional pool
- Level 4：只保 activity + food，放弃 area 过滤

### 7. LLM Slot 顺序决策
- LLM 只参与"哪个时间 slot 放哪个 pool 的第几个 POI"
- 不生成 POI，只决定顺序
- 输出结构化 JSON slots

### 8. 纯代码时间轴拼接
- 根据 slot 顺序 + duration 计算开始/结束时间
- 高德 API 插入真实通勤（transport steps）

### 9. Validator 修正
- 天气极端时自动切换室内方案
- 热门餐厅加排队提示
- 辣味约束加 risk_note

## 架构（7 层流水线）

```
用户输入 + @mentions
         ↓
1. Multi-channel Recall（分池独立搜索）
         ↓
2. Tagging（一次 LLM 批量打标签）
         ↓
3. Pool 内 Ranking（纯代码加权打分）
         ↓
4. Area Grouping（按区域聚类）
         ↓
5. Feasibility Loop（约束放宽重试）
         ↓
6. LLM Slot 决策（决定 slot 顺序）
         ↓
7. Planner Timeline（纯代码时间轴 + 通勤）
         ↓
8. Validator（修正冲突）
```

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + TailwindCSS + Ant Design + Motion |
| 后端 | FastAPI + Python |
| LLM | DeepSeek API（一次 tagging + 一次 slot 决策） |
| POI | 高德地图 Web JS API + 地理编码 API + 公交 API |
| 数据 | SQLite（用户偏好 + 规划历史） |

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
python3 run.py
# 启动 http://localhost:8000
```

### 配置（.env）

```env
OPENAI_API_KEY=your_deepseek_key
OPENAI_API_BASE=https://api.deepseek.com
VITE_AMAP_WEB_JS_KEY=your_amap_key
AMAP_API_KEY=your_amap_key
VITE_QWEATHER_KEY=your_qweather_key
```

## 项目结构

```
src/
├── App.tsx                      # 首页 + 活动卡片
├── components/
│   └── ConfirmCard.tsx         # 行程确认弹窗
├── views/
│   ├── ResultView.tsx          # 规划结果页
│   └── PlanResult.tsx          # 方案展示
└── services/
    ├── api.ts                   # API 调用

backend/app/
├── agents/
│   ├── planner_agent.py        # 多通道规划 + LLM slot 决策
│   ├── ranking_engine.py        # 偏好打分 + 硬约束过滤
│   ├── validator_agent.py       # 天气/排队/约束修正
│   └── area_grouping.py        # 地理区域聚类 + Feasibility Loop
├── services/
│   ├── poi_service.py           # 高德 POI 搜索 + 分池召回
│   ├── tagging_service.py       # LLM 批量打标签
│   ├── llm_service.py           # DeepSeek API
│   └── user_db.py              # SQLite 用户数据库
└── api/routes/
    ├── plan.py                  # /api/plan 入口
    └── users.py                 # /api/users 用户管理
```

## API 示例

### 生成规划

```bash
curl -X POST http://localhost:8000/api/plan \
  -H "Content-Type: application/json" \
  -d '{"query": "@alice @bob 下午2点出发带孩子", "city": "上海"}'
```

### 管理用户

```bash
# 初始化默认用户（alice/bob/carol）
curl -X POST http://localhost:8000/api/users/init

# 查看所有用户
curl http://localhost:8000/api/users/

# 更新用户偏好
curl -X POST http://localhost:8000/api/users/ \
  -H "Content-Type: application/json" \
  -d '{"user_id": "alice", "preferences": {"aesthetic": 0.9, "social": 0.3}, "constraints": {"cannot_eat_spicy": true}}'
```

## 设计原则

- **LLM 只做它最擅长的事**：打标签、决定顺序
- **Ranking 和 Planner 是纯代码**： deterministic、可解释
- **结构保证系统**：分池召回从源头保证各类型有候选
- **约束放宽优于报错**：Feasibility Loop 自动重试

## License

MIT