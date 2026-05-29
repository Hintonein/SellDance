# SellDance

SellDance 是面向 TikTok Shop、跨境电商与社媒电商商家的 AIGC 带货短视频生成系统。

参赛课题：电商场景 AIGC 带货视频生成。

核心业务价值：把商品信息、素材、Prompt、脚本、分镜和长任务渲染串成一条可运行的商家端自动出片链路。

## 功能说明

- 项目管理：创建、查看、选择、归档带货视频项目。
- 素材管理：上传商品图片、商品视频、参考素材、Logo 等，自动生成 mock 结构化分析。
- 脚本工作台：根据商品信息、卖点、目标人群、风格和 Prompt 生成脚本。
- 脚本版本：支持保存脚本版本、查看版本、选择版本，并通过 Prompt 微调生成新版本。
- 分镜编辑：从脚本生成分镜，支持编辑时长、旁白、字幕、视觉描述、镜头运动、转场、BGM 提示和素材引用。
- 一键成片：创建视频生成任务，展示状态、进度、当前步骤、错误信息和重试入口。
- 预览导出：完成后预览 MP4，并展示 9:16、16:9 导出入口。

## 技术栈

- Frontend：React + Vite
- Backend：Node.js + Express
- AI 编排：集中在 mock service，后续可替换为真实 LLM/TTS/图生视频/文生视频 adapter
- 视频渲染：本地 FFmpeg pipeline
- 数据存储：本地 JSON 文件，位于 `backend/data`

## 项目结构

```text
SellDance/
├─ AGENTS.md
├─ backend/
│  ├─ src/
│  │  ├─ routes/
│  │  ├─ services/
│  │  └─ config/
│  ├─ data/
│  └─ uploads/
├─ frontend/
│  └─ src/
│     ├─ pages/
│     ├─ components/
│     └─ services/
└─ package.json
```

## 本地启动

### 1. 安装 FFmpeg

视频渲染需要本地 FFmpeg：

```bash
ffmpeg -version
```

如果缺失：

- macOS：`brew install ffmpeg`
- Ubuntu/Debian：`sudo apt-get update && sudo apt-get install -y ffmpeg`
- Windows：`winget install Gyan.FFmpeg`

### 2. 安装依赖

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

### 3. 启动前后端

```bash
npm run dev
```

也可以分别启动：

```bash
npm run dev:backend
npm run dev:frontend
```

默认地址：

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`

## 检查命令

```bash
npm run lint
npm run build
npm run test
```

当前仓库是 JavaScript 实现，没有独立 `typecheck` 命令。

## Mock 数据说明

- 项目记录：`backend/data/projects`
- 素材元数据：`backend/data/assets`
- AI 素材生成任务：`backend/data/asset-generation-tasks.json`
- 合规审核记录：`backend/data/compliance-reviews.json`
- 脚本版本：`backend/data/scripts`
- 分镜：`backend/data/storyboards`
- 生成任务：`backend/data/generation-tasks`
- 上传文件：`backend/uploads`

素材上传后会生成 mock 结构化分析字段：

- 主体 `subject`
- 类目 `category`
- 颜色 `colors`
- 场景 `scene`
- 风格 `style`
- 标签 `tags`
- 摘要 `summary`
- `embedding` / `vector`

## API 简要说明

### Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`

### Assets

- `GET /api/projects/:projectId/assets`
- `POST /api/projects/:projectId/assets`
- `GET /api/projects/:projectId/assets/:assetId`
- `DELETE /api/projects/:projectId/assets/:assetId`
- `POST /api/projects/:projectId/assets/generate`
- `GET /api/projects/:projectId/assets/generation-tasks/:taskId`
- `POST /api/projects/:projectId/assets/:assetId/reanalyze`

兼容旧接口：

- `GET /api/projects/:projectId/materials`
- `POST /api/projects/:projectId/materials`

### Scripts

- `GET /api/projects/:projectId/scripts`
- `POST /api/projects/:projectId/scripts/generate`
- `POST /api/projects/:projectId/scripts/:scriptId/refine`
- `GET /api/projects/:projectId/scripts/:scriptId`

兼容旧接口：

- `GET /api/projects/:projectId/script`
- `POST /api/projects/:projectId/script/generate`
- `PUT /api/projects/:projectId/script`

### Storyboards

- `GET /api/projects/:projectId/storyboards`
- `POST /api/projects/:projectId/storyboards/generate`
- `PATCH /api/projects/:projectId/storyboards/:storyboardId/scenes/:sceneId`
- `GET /api/projects/:projectId/storyboards/:storyboardId`

兼容旧接口：

- `GET /api/projects/:projectId/storyboard`
- `POST /api/projects/:projectId/storyboard/generate`
- `PUT /api/projects/:projectId/storyboard`

### Generation Tasks

- `GET /api/projects/:projectId/tasks`
- `POST /api/projects/:projectId/tasks`
- `GET /api/projects/:projectId/tasks/:taskId`
- `POST /api/projects/:projectId/tasks/:taskId/retry`

兼容旧接口：

- `GET /api/projects/:projectId/video-tasks`
- `POST /api/projects/:projectId/video-tasks`
- `GET /api/video-tasks/:taskId`
- `POST /api/video-tasks/:taskId/retry`

## Demo 流程

1. 在 Project 页面创建项目，填写商品名、链接/ID、类目、卖点、目标人群、风格、平台和时长。
2. 在 Materials 页面上传商品主图、视频、参考素材或 Logo。
3. 查看素材 mock 分析结果和标签。
4. 在 Script 页面输入 Prompt 并生成脚本。
5. 使用 refine prompt 微调脚本并保存新版本。
6. 选择脚本版本后生成分镜。
7. 在 Storyboard 页面编辑每个分镜的文案、时长、视觉描述和素材引用。
8. 在 Video Preview 页面创建生成任务。
9. 查看任务进度、当前步骤、失败错误或重试入口。
10. 完成后预览视频，并打开 9:16 或 16:9 导出链接。

## 自建素材库与 AI 生成

素材页支持上传素材、mock 生成素材、火山方舟生成素材。无 `ARK_API_KEY` 时会自动 fallback 到 mock provider，保证本地可跑。

在项目根目录新建 `.env`，或在启动后端前设置环境变量：

```dotenv
ARK_API_KEY=your-api-key
SEED_ENDPOINT_ID=ep-your-seed-2-classifier-endpoint
SEEDANCE_ENDPOINT_ID=ep-your-seedance-endpoint
SEEDANCE_MODEL=seedance-1.5-pro
ARK_BASE_URL=https://ark.cn-beijing.volces.com
```

后端启动时会读取项目根目录 `.env`，也兼容 `backend/.env`。火山方舟账号如果不允许直接用模型 ID 调用，请填写控制台中的自定义 Endpoint ID；后端会优先使用 `SEEDANCE_ENDPOINT_ID`，没有配置时才 fallback 到 `SEEDANCE_MODEL`。

`SEED_ENDPOINT_ID` 用于生成视频前的 Seed 2.0 Prompt 分类/结构化。系统会把项目里的 `productCategory`、`sellingPoints`、`targetAudience`、`style` 与用户 prompt 一起送入分类器，得到 `category/tags/sellingPoints/summary/enhancedPrompt`，再用增强 prompt 调用 Seedance。也兼容更明确的变量名 `SEED_CLASSIFICATION_ENDPOINT_ID`。

素材页的 AI 生成入口仅保留 `seed_dance · 文生视频`。AI 文生图模块已关闭；商品图片仍可通过上传素材入库。

Seed 数据：

```bash
npm run seed:mock
```

mock 视频生成依赖 `backend/uploads/demo-product-video.mp4`。seed 脚本会优先尝试用 FFmpeg 自动生成一个 demo MP4；如果失败，请手动放置该文件后重试。

## 源代码仓库

`git@github.com:Hintonein/SellDance.git`

## 后续规划

- P1：素材标签与 Embedding 检索、智能剪辑 Agent、分镜级复杂编辑器、TTS/字幕/BGM、多语言 dubbing、失败重试策略、生成 trace、mock 数据看板、素材切片、局部分镜刷新。
- P2：多因子归因、Agent 编排、A/B 自动出片对比、CI/CD、可观测性、合规审核流、评论驱动二次创作、爆款视频 DNA 提取、Prompt 市场、投流冷启动加速。
