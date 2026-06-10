# SellDance

SellDance is an AI-assisted e-commerce video production system for short-form selling videos. It combines product assets, public-video inspiration mining, script generation, storyboard video generation, smart editing, and final MP4 rendering into one merchant-facing workflow.

The project is designed for practical commerce-video production rather than a one-off demo: assets are indexed, scripts are versioned, storyboard scenes are editable, long-running AI jobs are tracked, and final rendering is handled by a backend pipeline.

## Technical Highlights

- End-to-end AI video workflow: project setup, asset library, reference-video search, methodology extraction, script generation, storyboard generation, smart editing, and final render.
- Seed 2.0 orchestration: used for asset analysis, inspiration relevance scoring, public-video breakdown reports, methodology/template extraction, script generation, storyboard-scene planning, and editing-plan generation.
- SeedDance 1.5 Pro integration: used for storyboard-scene video generation from script, product context, selected assets, and Seed 2.0 generated prompts.
- MediaCrawler integration: SellDance can launch MediaCrawler as a backend task, search public Douyin videos, import public metadata, keep crawler logs, support cancellation, and rank results by relevance plus engagement.
- Compliance-first public-video library: the app stores only public metadata, source links, source declarations, and structured analysis. It does not save, copy, remix, or reuse public videos as project assets.
- Structured methodology mining: selected public-video analyses are summarized into reusable strategy and factor templates while retaining source IDs and compliance notes.
- Script versioning: generated scripts are saved as versions, can be refined into new versions, selected for storyboard generation, and deleted from the UI.
- Storyboard timeline editor: scenes are shown as a horizontal timeline, can be reordered, opened in detail, regenerated, deleted, and previewed as a generated-video sequence.
- Smart editing agent: plans clip order, scene-to-asset matching, transitions, caption drafts, BGM guidance, and final render settings from storyboard scenes and project assets.
- Async task status: crawler, inspiration analysis, template generation, script generation, storyboard generation, smart editing, one-click video, and render tasks are surfaced in the floating Status panel.
- Browser-safe media preview: uploaded MOV/QuickTime or non-H.264 videos keep the original file, while upload-time preview generation can create a 720p H.264 MP4 preview for browser playback. Historical assets are not auto-transcoded on page load.
- Audio-aware rendering: generated scene audio is preserved by default; uploaded BGM can be mixed under source audio or replace it depending on asset metadata.
- Local-first persistence: JSON storage keeps the project easy to inspect and portable during development.

## Product Workflow

1. Create or select a project with product name, selling points, target audience, platform, style, and duration.
2. Upload owned product images, videos, audio, and reference material in Assets.
3. Search public inspiration videos in Script References through MediaCrawler.
4. Analyze selected public videos with Seed 2.0 and extract a methodology template.
5. Generate a versioned script from product info, methodology, and compliance constraints.
6. Generate storyboard scenes and SeedDance-ready prompts from the selected script version.
7. Generate storyboard scene videos with SeedDance 1.5 Pro.
8. Use Creation to generate a smart editing plan or run one-click video.
9. Render the final MP4, preview it in the browser, and export.

## Architecture

```text
SellDance/
├─ backend/
│  ├─ src/
│  │  ├─ agents/                 # agent boundaries for script, storyboard, compliance
│  │  ├─ providers/              # Seed 2.0 / SeedDance / mock provider clients
│  │  ├─ routes/                 # Express API routes
│  │  ├─ services/               # workflow, media, crawler, generation, rendering logic
│  │  └─ config/                 # env and path configuration
│  ├─ data/                      # local JSON records
│  ├─ uploads/                   # uploaded and derived local media
│  └─ outputs/                   # generated render outputs
├─ frontend/
│  └─ src/
│     ├─ api/                    # API clients
│     ├─ components/             # reusable UI and media preview components
│     ├─ pages/                  # Project, Assets, Script, Creation, History
│     └─ services/               # frontend service facade
├─ MediaCrawler/                 # sibling crawler project, invoked by backend
└─ README.md
```

## Backend Modules

Key service modules include:

- `crawler.service`: starts Chrome/CDP, runs MediaCrawler, imports ranked JSONL metadata, tracks logs, timeout, and cancellation.
- `inspiration-video.service`: stores public-video metadata, source declarations, relevance scores, engagement metrics, and ranking.
- `video-analysis.service`: creates Seed 2.0 breakdown reports from public-video metadata and optional sampled slices.
- `inspiration-template.service`: extracts methodology templates from multiple analyzed videos.
- `script-generation.service`: generates compliant structured scripts from product info and methodology templates.
- `script.service`: manages current script, versions, refinement, scene regeneration, and language consistency.
- `storyboard.service`: creates editable storyboard scenes from selected script versions.
- `storyboard-scene-planning.service`: asks Seed 2.0 to select product/reference assets and write SeedDance prompts per scene.
- `storyboard-video-generation.service`: runs bounded-concurrency SeedDance scene generation and stores outputs outside the project asset library.
- `creation-agent.service`: builds smart editing plans from scripts, storyboard scenes, and assets.
- `video-render.service`: renders final MP4 with FFmpeg, preserves generated scene audio, and supports optional BGM mixing.
- `asset.service`: manages global/project assets, upload metadata, analysis state, audio metadata, and browser-safe video preview URLs.

## Frontend Experience

The UI is organized around five top-level areas:

- Project: project metadata and active project selection.
- Assets: project assets, upload, search, AI generated assets, and global asset library.
- Script: public-video references, methodology extraction, script versions, and storyboard timeline editor.
- Creation: Smart Editing, One-click Video, and Preview & Export.
- History: task details and generated-output history.

The interface uses a consistent tabbed workspace pattern instead of long stacked forms. Detail views stay inside the same app route and keep the main navigation visible.

## Public Video Compliance

SellDance treats public videos as inspiration metadata, not reusable media.

The system may store:

- platform and public video ID
- title, description, author metadata, engagement metrics
- source URL and source declaration
- structured breakdown reports
- extracted abstract strategy and creative factors

The system must not:

- download public videos into the project asset library
- save or reuse public-video footage as owned material
- copy subtitles, wording, shot order, music, or unique expression
- remix or reproduce original public videos

Generated scripts and storyboard prompts may only use abstract strategies and factors.

## AI Providers

SellDance is built around provider boundaries so real APIs and mocks can coexist.

Primary configured providers:

- Seed 2.0 through Volcengine Ark for multimodal analysis and structured JSON planning.
- SeedDance 1.5 Pro for text/image-to-video storyboard-scene generation.
- Mock providers for local fallback when real providers are unavailable.

The current implementation reuses the existing unified Seed 2.0 invocation interface. Route handlers and React components do not call provider clients directly.

## MediaCrawler Integration

The backend runs MediaCrawler through a controlled task service:

- starts Chrome/CDP before crawler execution
- runs `uv run python main.py` in the MediaCrawler directory
- passes platform, keyword, count, output path, comment flags, and headless settings
- imports JSONL rows by Douyin search order up to the requested count
- stores crawler task status, logs, error messages, and result counts
- supports task cancellation and timeout handling
- ranks displayed videos by combined Seed 2.0 semantic relevance and engagement score

Chrome startup is environment-sensitive. On headless Linux, `DISPLAY=:99` or an equivalent display server is required if using non-headless Chrome.

## Media Handling Notes

- Uploaded video metadata is probed with `ffprobe`.
- Browser previews should use `previewUrl` when present.
- MOV/QuickTime, HEVC, and other browser-unfriendly uploads are not reliable in `<video>` directly.
- Upload-time preview generation produces a 720p H.264 MP4 preview and keeps the original file for analysis/rendering.
- Historical assets are not automatically transcoded on list/detail page load to avoid unexpected CPU spikes on servers without GPU acceleration.
- Seed 2.0 video analysis uses sampled frames instead of sending full videos.

## API Overview

Representative routes:

```text
GET    /api/projects
POST   /api/projects
PATCH  /api/projects/:projectId

GET    /api/projects/:projectId/assets
POST   /api/projects/:projectId/assets
POST   /api/projects/:projectId/assets/search
POST   /api/projects/:projectId/assets/:assetId/analyze

POST   /api/projects/:projectId/inspiration-videos/search
GET    /api/projects/:projectId/inspiration-videos
DELETE /api/projects/:projectId/inspiration-videos
POST   /api/projects/:projectId/inspiration-videos/:videoId/analyze
POST   /api/projects/:projectId/inspiration-videos/analyze-and-template

POST   /api/projects/:projectId/inspiration-templates/generate
GET    /api/projects/:projectId/inspiration-templates
DELETE /api/projects/:projectId/inspiration-templates/:templateId

GET    /api/projects/:projectId/scripts
POST   /api/projects/:projectId/scripts/generate
POST   /api/projects/:projectId/scripts/:scriptId/refine
POST   /api/projects/:projectId/scripts/:scriptId/regenerate
DELETE /api/projects/:projectId/scripts/:scriptId/versions/:versionId

GET    /api/projects/:projectId/storyboards
POST   /api/projects/:projectId/storyboards/generate
PATCH  /api/projects/:projectId/storyboards/:storyboardId/scenes/:sceneId
POST   /api/projects/:projectId/storyboards/:storyboardId/scenes/:sceneId/regenerate

POST   /api/projects/:projectId/creation/smart-edit
POST   /api/projects/:projectId/creation/one-click
POST   /api/projects/:projectId/creation/render
GET    /api/projects/:projectId/creation/tasks
POST   /api/projects/:projectId/creation/tasks/:taskId/cancel
POST   /api/projects/:projectId/creation/tasks/:taskId/retry
```

## Local Setup

Install dependencies:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

Start the full app:

```bash
npm run dev
```

Default URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`

Run frontend checks:

```bash
npm run build --prefix frontend
npm run lint --prefix frontend
```

Run backend tests:

```bash
npm test --prefix backend
```

Some backend tests use FFmpeg. Avoid running media-transcode-heavy tests on constrained servers.

## Environment

Create a local `.env` file for real provider access. Do not commit it.

Common variables:

```dotenv
ARK_API_KEY=your-api-key
ARK_BASE_URL=https://ark.cn-beijing.volces.com
SEED_ENDPOINT_ID=your-seed-2-endpoint-id
SEEDANCE_ENDPOINT_ID=your-seedance-endpoint-id
SEEDANCE_MODEL=doubao-seedance-1-5-pro
AI_ASSET_ANALYSIS_PROVIDER=seed2
```

The backend loads environment variables from the project root and backend directory. `.env` is intentionally local-only.

## Operational Notes

- Long-running work is modeled as tasks and surfaced in Status.
- Failed tasks preserve error messages for UI display.
- Generated storyboard videos are workflow outputs, not project assets.
- Final rendered videos are served from `/outputs`.
- Uploaded media and preview derivatives are served from `/uploads`.
- The repo should not commit `.env`, `AGENTS.md`, `DEVELOPMENT_GUIDE.md`, generated crawler runs, uploads, or render outputs.

## License

See `LICENSE`.
