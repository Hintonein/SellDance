# SellDance Development Guide

## 1. Current Project State

SellDance is a runnable prototype for e-commerce AIGC short-video generation. The current code already covers a minimal P0 flow:

```text
Project -> Asset upload / AI video asset generation -> Mock script -> Mock storyboard -> FFmpeg render task -> Preview / export
```

The implementation is intentionally lightweight and file-based. It is useful for demo validation, but several domains are still mock, mixed in naming, or concentrated in oversized files.

### Checked Files

- Root: `package.json`, `.gitignore`, `README.md`, `AGENTS.md`.
- Backend: `backend/package.json`, `backend/nodemon.json`, `backend/src/app.js`, `backend/src/server.js`, `backend/src/routes/api.js`, `backend/src/config/*.js`, `backend/src/services/*.js`, `backend/scripts/seed-mock-data.js`.
- Frontend: `frontend/package.json`, `frontend/vite.config.js`, `frontend/src/App.jsx`, `frontend/src/services/api.js`, `frontend/src/pages/*.jsx`, `frontend/src/App.css`.
- Runtime storage shape: `backend/data/*`, `backend/uploads/*`, `backend/outputs/*`.

## 2. Current Architecture

```text
frontend/src/App.jsx
  -> page components under frontend/src/pages
  -> centralized frontend API client: frontend/src/services/api.js
  -> Vite proxy /api, /uploads, /outputs to backend:4000

backend/src/server.js
  -> backend/src/app.js
  -> one combined API router: backend/src/routes/api.js
  -> services under backend/src/services
  -> JSON file persistence under backend/data
  -> uploaded/generated media under backend/uploads
  -> rendered MP4 outputs under backend/outputs
```

Current backend layering exists but is partial:

- Route layer: all API endpoints are in `backend/src/routes/api.js`.
- Service layer: projects, materials/assets, scripts, storyboards, video tasks, rendering, Ark adapter, compliance review.
- Persistence layer: `backend/src/services/storage.service.js` reads/writes local JSON files.
- Provider layer: Volcengine Ark calls are mostly isolated in `backend/src/services/volcengine-ark.service.js`, but a cleaner provider abstraction is still needed.

## 3. Current Capability Matrix

| Area | Status | Notes |
| --- | --- | --- |
| Project create/list/detail/update/archive | Done | `DELETE /api/projects/:projectId` marks archived. IDs now allow hyphen/underscore. |
| Material/asset upload | Done | `/materials` and `/assets` both upload with `multer`; metadata stored in `backend/data/assets/<projectId>.json`. |
| Asset list/detail/delete | Done | Delete supports `id` and `assetId`; local `/uploads/...` file deletion is best-effort. |
| Asset structured analysis | Mock | `buildMockAnalysis` generates tags, summary, vector fields. No real multimodal analysis or slicing yet. |
| Asset search | Missing | No keyword/tag/vector search endpoint yet. |
| AI-generated assets | Half done | Only Seedance text-to-video is enabled. Async task + polling exists. Seedream image generation is disabled in UI/business flow. |
| Compliance review | Half done | AI-generated assets create review records in `backend/data/compliance-reviews.json`; no UI/review workflow yet. |
| Script generation | Mock | `ai-script.service.js` uses template logic, not real Seed 2.0. Versions are stored. |
| Script edit/refine | Half done | Text edit and refine create versions; no structured JSON editor or scene-level script regeneration. |
| Storyboard generation | Mock | Splits script sentences and round-robin matches assets. Basic scene edit exists. |
| Storyboard asset matching | Mock | Matches by index, not asset tags/slices/requirements. |
| Video render task | Done for local demo | Uses FFmpeg to render 9:16 MP4 with subtitles. Needs stronger error handling and format presets. |
| Task progress/retry/history | Done for demo | Async task state and polling are available. Cancel is missing. |
| Reference video library | Missing | No entities/APIs yet. Must not download or reuse third-party videos; store only analysis and source declaration. |
| Creative templates/factors | Missing | No template/factor data model or UI yet. |
| Data feedback loop | Missing/postpone | Seed data includes distribution/conversion events, but no API or UI. |

## 4. Current API Routes

All routes currently live in `backend/src/routes/api.js`.

### Existing Project Routes

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId` archives project

### Existing Asset Routes

- `GET /api/projects/:projectId/materials`
- `POST /api/projects/:projectId/materials`
- `GET /api/projects/:projectId/assets`
- `POST /api/projects/:projectId/assets`
- `GET /api/projects/:projectId/assets/:assetId`
- `DELETE /api/projects/:projectId/assets/:assetId`
- `POST /api/projects/:projectId/assets/:assetId/reanalyze`
- `POST /api/projects/:projectId/assets/generate`
- `GET /api/projects/:projectId/assets/generation-tasks/:taskId`

Notes:

- `/materials` is legacy naming and should remain compatible until the UI and docs fully migrate to `/assets`.
- AI image generation is intentionally not exposed now.

### Existing Script Routes

- `GET /api/projects/:projectId/script`
- `PUT /api/projects/:projectId/script`
- `POST /api/projects/:projectId/script/generate`
- `GET /api/projects/:projectId/scripts`
- `POST /api/projects/:projectId/scripts/generate`
- `GET /api/projects/:projectId/scripts/:scriptId`
- `POST /api/projects/:projectId/scripts/:scriptId/refine`

Notes:

- Singular and plural script routes both exist. Keep compatibility, but migrate new code to plural REST-style routes.

### Existing Storyboard Routes

- `GET /api/projects/:projectId/storyboard`
- `PUT /api/projects/:projectId/storyboard`
- `POST /api/projects/:projectId/storyboard/generate`
- `GET /api/projects/:projectId/storyboards`
- `POST /api/projects/:projectId/storyboards/generate`
- `GET /api/projects/:projectId/storyboards/:storyboardId`
- `PATCH /api/projects/:projectId/storyboards/:storyboardId/scenes/:sceneId`

### Existing Video Task Routes

- `GET /api/projects/:projectId/video-tasks`
- `POST /api/projects/:projectId/video-tasks`
- `GET /api/projects/:projectId/tasks`
- `POST /api/projects/:projectId/tasks`
- `GET /api/projects/:projectId/tasks/:taskId`
- `POST /api/projects/:projectId/tasks/:taskId/retry`
- `GET /api/video-tasks/:taskId`
- `POST /api/video-tasks/:taskId/retry`

Notes:

- `/video-tasks` and `/tasks` both exist. Prefer future `/creation/tasks` naming for video creation tasks.

## 5. Current Data Storage

Persistence is local JSON:

```text
backend/data/projects/<projectId>.json
backend/data/assets/<projectId>.json
backend/data/scripts/<projectId>.json
backend/data/storyboards/<projectId>.json
backend/data/generation-tasks/<taskId>.json
backend/data/asset-generation-tasks.json
backend/data/compliance-reviews.json
backend/data/distribution-events.json
backend/data/conversion-events.json
```

Media files:

```text
backend/uploads/*
backend/outputs/<projectId>/<taskId>.mp4
```

Important constraints:

- Runtime JSON/media should not be committed.
- `nodemon` must not watch runtime data/media directories.
- JSON persistence is acceptable for Phase 0/1; introduce SQLite or a real DB only after model boundaries stabilize.

## 6. Current Model and Env State

Current env loading:

- `backend/src/config/env.js` loads root `.env`, then `backend/.env` if present.
- Existing code uses `ARK_API_KEY`, `ARK_BASE_URL`, `SEEDANCE_ENDPOINT_ID`, `SEEDANCE_MODEL`, `SEED_ENDPOINT_ID`, `SEED_CLASSIFICATION_ENDPOINT_ID`, `ARK_POLL_ATTEMPTS`, `ARK_POLL_INTERVAL_MS`.

Current provider behavior:

- Seedance video generation: half done through `POST /api/v3/contents/generations/tasks` and polling.
- Seed 2.0 classification: half done through Ark chat completions with endpoint/model from `SEED_CLASSIFICATION_ENDPOINT_ID` or `SEED_ENDPOINT_ID`.
- Seedream image generation: adapter function still exists, but business/UI should not enable it until account access and product decision are confirmed.
- Script generation: mock only, not using Seed 2.0 yet.
- Asset analysis: mock only, not using real multimodal analysis yet.

Recommended future env design:

```dotenv
ARK_BASE_URL=https://ark.cn-beijing.volces.com
ARK_API_KEY=your_ark_api_key

SEED2_API_KEY=
SEED2_MODEL=
SEED2_ENDPOINT_ID=

SEEDDANCE_API_KEY=
SEEDDANCE_MODEL=
SEEDDANCE_ENDPOINT_ID=

SEEDREAM_API_KEY=
SEEDREAM_MODEL=
SEEDREAM_ENDPOINT_ID=

AI_SCRIPT_PROVIDER=mock
AI_ASSET_ANALYSIS_PROVIDER=mock
AI_VIDEO_PROVIDER=seedance
AI_IMAGE_PROVIDER=disabled
ARK_POLL_ATTEMPTS=24
ARK_POLL_INTERVAL_MS=5000
```

Rules:

- Never hard-code API keys.
- Do not commit `.env` with real values.
- Add and maintain `.env.example` with field descriptions.
- Backend startup should print enabled providers and model/endpoint IDs, but never print keys.
- Missing keys should fail only the related real-provider request, not backend startup.
- Model calls should go through a future `model-provider.service.js` abstraction.
- Keep script generation, image generation, video generation, and multimodal analysis as separate provider domains.

## 7. Recommended Backend Structure

Move gradually. Do not split every file in one pass.

```text
backend/src/
  routes/
    projects.routes.js
    assets.routes.js
    scripts.routes.js
    storyboards.routes.js
    creation.routes.js
    templates.routes.js
    reference-videos.routes.js
    generation-tasks.routes.js
    index.js

  services/
    project.service.js
    asset.service.js
    asset-analysis.service.js
    asset-search.service.js
    asset-generation.service.js
    script.service.js
    template.service.js
    reference-video.service.js
    storyboard.service.js
    creation.service.js
    render.service.js
    model-provider.service.js
    storage.service.js
    compliance-review.service.js

  models/
    project.model.js
    asset.model.js
    asset-slice.model.js
    script.model.js
    storyboard.model.js
    template.model.js
    reference-video.model.js
    generation-task.model.js

  providers/
    volcengine/
      ark.client.js
      seedance.client.js
      seedream.client.js
      seed2.client.js

  utils/
    env.js
    ids.js
    errors.js
    validators.js
```

Why this split:

- Routes should only validate request/response and call services.
- Services should own business workflow.
- Providers should own vendor-specific API details.
- Models should document canonical fields and normalization logic.
- `storage.service.js` should stay generic and not contain business rules.

## 8. Recommended Frontend Structure

Move gradually from the current page-level implementation.

```text
frontend/src/
  pages/
    ProjectsPage/
    ProjectDetailPage/
    AssetLibraryPage/
    ScriptStudioPage/
    TemplateLibraryPage/
    VideoCreationPage/
    RenderTasksPage/

  components/
    assets/
    scripts/
    storyboards/
    templates/
    creation/
    common/

  api/
    projects.api.js
    assets.api.js
    scripts.api.js
    templates.api.js
    creation.api.js
    generationTasks.api.js

  types/
    project.js
    asset.js
    script.js
    storyboard.js
    template.js
    creation.js
    generationTask.js
```

Current frontend is small enough that full TypeScript migration should be deferred. First split API files and reusable components, then consider `.ts/.tsx` migration.

## 9. Recommended Data Models

### Project

```js
{
  id,
  name,
  productTitle,
  productUrl,
  category,
  targetAudience,
  sellingPoints,
  createdAt,
  updatedAt
}
```

Current aliases to normalize later: `projectId`, `projectName`, `productName`, `productCategory`, `expectedDuration`.

### Asset

```js
{
  id,
  projectId,
  type, // product_image | detail_image | product_video | reference_image | reference_video | logo | other
  mediaType, // image | video | audio | document | other
  source, // upload | url | ai | reference | mock
  fileUrl,
  thumbnailUrl,
  title,
  tags,
  metadata,
  analysisStatus, // pending | analyzing | completed | failed
  analysis,
  createdAt,
  updatedAt
}
```

### AssetAnalysis

```js
{
  subject,
  category,
  colors,
  material,
  sellingPoints,
  usageScenarios,
  visualStyle,
  summary,
  tags,
  embedding,
  provider,
  model,
  rawResponseRef
}
```

### AssetSlice

```js
{
  id,
  assetId,
  projectId,
  startTime,
  endTime,
  thumbnailUrl,
  transcript,
  visualDescription,
  subject,
  action,
  cameraMovement,
  tags,
  embedding,
  metadata
}
```

### ReferenceVideo

```js
{
  id,
  sourcePlatform,
  sourceUrl,
  sourceDeclaration,
  category,
  title,
  analysisReport,
  hook,
  sellingPoints,
  storyboard,
  style,
  reusableFactors,
  createdAt
}
```

Compliance rule: store only structured analysis and source declaration for third-party public videos. Do not download, copy, remix, or reuse original third-party video content as material.

### CreativeTemplate

```js
{
  id,
  name,
  category,
  strategy,
  factors,
  constraints,
  exampleReferenceVideoIds,
  createdAt
}
```

### Script

```js
{
  id,
  projectId,
  mode, // free | reference_rewrite | template | automated
  productInfo,
  strategy,
  factors,
  constraints,
  scenes,
  totalDuration,
  versions,
  createdAt,
  updatedAt
}
```

### Scene / StoryboardScene

```js
{
  id,
  scriptId,
  index,
  duration,
  visualDescription,
  cameraMovement,
  subtitle,
  voiceover,
  bgm,
  assetRequirements,
  selectedAssetSliceIds,
  generationPrompt
}
```

### CreationTask / GenerationTask

```js
{
  id,
  projectId,
  scriptId,
  storyboardId,
  status, // queued | running | completed | failed | canceled
  progress,
  taskType, // asset_generation | render | export | analysis
  outputUrl,
  error,
  createdAt,
  updatedAt
}
```

### Data Feedback Models

Reserve these for later:

- `video_performance_metrics`
- `script_performance_metrics`
- `asset_usage_logs`
- `generation_feedback`
- `user_edit_logs`

## 10. Recommended API Design

### Asset Module

- `GET /api/projects/:projectId/assets`
- `POST /api/projects/:projectId/assets`
- `GET /api/projects/:projectId/assets/:assetId`
- `DELETE /api/projects/:projectId/assets/:assetId`
- `POST /api/projects/:projectId/assets/:assetId/analyze`
- `GET /api/projects/:projectId/assets/:assetId/slices`
- `POST /api/projects/:projectId/assets/search`
- `POST /api/projects/:projectId/assets/generate-video`
- `GET /api/projects/:projectId/assets/generation-tasks/:taskId`

Keep `/materials` as deprecated compatibility until UI and docs no longer depend on it.

### Reference Videos and Templates

- `POST /api/reference-videos`
- `GET /api/reference-videos`
- `GET /api/reference-videos/:id`
- `POST /api/reference-videos/:id/analyze`
- `GET /api/templates`
- `POST /api/templates`
- `GET /api/templates/:id`

### Script Module

- `POST /api/projects/:projectId/scripts/generate`
- `GET /api/projects/:projectId/scripts`
- `GET /api/projects/:projectId/scripts/:scriptId`
- `PATCH /api/projects/:projectId/scripts/:scriptId`
- `POST /api/projects/:projectId/scripts/:scriptId/regenerate`
- `POST /api/projects/:projectId/scripts/:scriptId/scenes/:sceneId/regenerate`

### Creation Module

- `POST /api/projects/:projectId/creation/render`
- `GET /api/projects/:projectId/creation/tasks`
- `GET /api/projects/:projectId/creation/tasks/:taskId`
- `POST /api/projects/:projectId/creation/tasks/:taskId/retry`
- `POST /api/projects/:projectId/creation/tasks/:taskId/cancel`
- `GET /api/projects/:projectId/creation/outputs`

## 11. Module Development Guide

### Asset Library

Current priority: finish the foundation before adding advanced analysis.

Immediate tasks:

- Normalize `materials` vs `assets` naming without breaking old endpoints.
- Add canonical `Asset` model normalization.
- Add `mediaType`, `source`, `analysisStatus`, `tags`, `metadata` consistently.
- Add detail view route/UI if needed.
- Add search endpoint for keyword/tag/type filtering.
- Add AssetSlice model and mock slicing for videos.

Defer:

- Real vector search.
- Full multimodal slicing.
- Complex asset editor.

### Script Module

Current priority: move from plain text to structured script JSON.

Immediate tasks:

- Define canonical `Script` and `Scene` shape.
- Generate script scenes directly instead of generating text then splitting sentences.
- Add modes: `free`, `template`, `reference_rewrite`, `automated`.
- Add JSON edit/save endpoint.
- Add single-scene regenerate endpoint.

Defer:

- Real external reference-video crawling.
- Clustering and automated strategy mining.

### Creation Module

Current priority: keep FFmpeg render reliable and tied to storyboard scenes/assets.

Immediate tasks:

- Rename video task domain to creation/render tasks while keeping compatibility.
- Store selected asset slice IDs per scene.
- Enforce default total duration <= 15 seconds.
- Add cancel endpoint.
- Make export presets real outputs instead of duplicate URLs.

Defer:

- TTS, dubbing, advanced BGM.
- Scene-level partial re-render.

### Data Feedback Module

Current priority: reserve data structures only.

Immediate tasks:

- Add storage/service placeholders for asset usage logs and user edit logs.
- When rendering, record which script/scenes/assets were used.

Defer:

- Performance dashboards.
- Attribution and optimization loops.

## 12. Phased Roadmap

### Phase 0: Code Organization and Documentation

Goal:

- Document current code and boundaries.
- Avoid feature regression.
- Mark mock/TODO/deprecated areas clearly.

Tasks:

- Maintain `DEVELOPMENT_GUIDE.md`.
- Update `AGENTS.md` for handoff rules.
- Add `.env.example`.
- Keep current app runnable.

Acceptance:

- Project starts with existing commands.
- Root has `DEVELOPMENT_GUIDE.md`.
- Next development entry points are clear.

### Phase 1: Asset Library Base Loop

Goal:

- Complete upload, list, detail, delete.
- Unify asset naming.
- Support image/video type/source/tags/metadata.

Files:

- `backend/src/routes/api.js` then later `backend/src/routes/assets.routes.js`.
- `backend/src/services/material.service.js` then later `asset.service.js`.
- `frontend/src/pages/MaterialPage.jsx` then later `AssetLibraryPage`.
- `frontend/src/services/api.js` then later `frontend/src/api/assets.api.js`.

Acceptance:

- Upload image/video.
- View asset list and detail.
- Delete asset and local file consistently.
- Refresh does not show deleted asset.
- Existing `/materials` compatibility remains.

### Phase 2: Asset Structuring and Search

Goal:

- Add AssetSlice.
- Add mock video slicing.
- Add keyword/tag/type search.
- Reserve embedding search.

Files:

- `asset-analysis.service.js`
- `asset-search.service.js`
- `asset-slice.model.js`
- `assets.routes.js`

Acceptance:

- Video assets can generate slice records.
- Asset and slice tags are searchable.
- Script/creation code can call asset search API.
- Mock analysis can be swapped with real provider.

### Phase 3: Script Generation Module

Goal:

- Generate structured scripts from product info.
- Support template and reference rewrite modes.
- Add templates/reference-video models.
- Support edit and regenerate.

Files:

- `script.service.js`
- `template.service.js`
- `reference-video.service.js`
- `scripts.routes.js`
- `templates.routes.js`
- `reference-videos.routes.js`

Acceptance:

- Product input generates structured scenes.
- Scenes include visual, subtitle, voiceover, asset requirements, duration.
- User can edit/save script.
- User can regenerate one scene.

### Phase 4: Creation and Render Tasks

Goal:

- Create video from script/storyboard/assets.
- Keep FFmpeg or mock render as first backend.
- Add task status, progress, retry, cancel.
- Support preview/export.

Files:

- `creation.service.js`
- `render.service.js`
- `generation-task.model.js`
- `creation.routes.js`
- `VideoCreationPage`
- `RenderTasksPage`

Acceptance:

- User creates render task from script/storyboard.
- Task status is queryable.
- Completed task returns `outputUrl`.
- 9:16 output works.
- Failed task can retry.

### Phase 5: Real Model Provider Integration

Goal:

- Seed 2.0 for script generation, reference analysis, asset analysis.
- Seedance 1.5 for generated video assets.
- Seedream optional later.
- All calls through provider abstraction.

Files:

- `model-provider.service.js`
- `providers/volcengine/*.js`
- `.env.example`

Acceptance:

- `.env` can switch mock/real providers.
- Missing key gives clear request-level error.
- Failed model call does not crash backend.
- Model responses are saved structurally.

### Phase 6: Data Feedback and Optimization

Goal:

- Record asset/script/template usage and performance.
- Support future feedback loops.

Files:

- `asset-usage-log.service.js`
- `user-edit-log.service.js`
- `performance-metrics.service.js`

Acceptance:

- Output video links to used assets/scripts/templates.
- User edits are recorded.
- External performance metrics can be imported.

## 13. Priority Fix List

P0:

- Keep asset deletion tested for both `id` and `assetId`.
- Add `.env.example` and startup provider logging without keys.
- Prevent `nodemon` restarts from data/upload/output writes.
- Keep `/materials` and `/assets` compatible until migration completes.

P1:

- Split `backend/src/routes/api.js` by domain.
- Introduce canonical model normalization for Project/Asset/Script/Scene/Task.
- Add asset search and slice storage.
- Move frontend API client into domain files.

P2:

- TypeScript migration.
- SQLite or real DB.
- Full provider SDK integration.
- Observability and CI.

## 14. Current Mock Logic Checklist

- Asset analysis: `backend/src/services/material.service.js` -> `buildMockAnalysis`.
- Asset generation fallback: `backend/src/services/asset-generation.service.js` -> `generateMockLocalAsset`.
- Seed 2.0 classification fallback: `buildMockClassification`.
- Script generation: `backend/src/services/ai-script.service.js`.
- Storyboard generation/matching: `backend/src/services/storyboard-matcher.service.js`.
- Export presets: `video-task.service.js` decorates one output URL as multiple presets.
- Seed data: `backend/scripts/seed-mock-data.js`.

## 15. Local Runbook

Install once:

```bash
npm install
```

Run both frontend and backend:

```bash
npm run dev
```

Run separately:

```bash
npm run dev:backend
npm run dev:frontend
```

Seed mock data:

```bash
npm run seed:mock
```

Checks:

```bash
npm run lint
npm run build
npm run test
```

Frontend default URL: `http://localhost:5173`.
Backend default health check: `http://localhost:4000/api/health`.

## 16. Human Confirmation Needed

Before real model work continues, confirm these values in `.env`:

- Which endpoint ID should be used for Seedance video generation: `SEEDANCE_ENDPOINT_ID`.
- Which endpoint ID should be used for Seed 2.0 classification/script/analysis: prefer `SEED_CLASSIFICATION_ENDPOINT_ID`, keep `SEED_ENDPOINT_ID` as compatibility.
- Whether the account has Seedream access. Until confirmed, keep AI image generation disabled.
- Whether generated videos should use model IDs or endpoint IDs. Current Ark errors indicate endpoint IDs are required for this account.

## 17. Phase 1 Completion Update

Phase 1 status: completed for the basic asset-library loop.

### Completed Phase 1 Capabilities

- Canonical asset service added in `backend/src/services/asset.service.js`.
- `/assets` is now the preferred API naming.
- `/materials` remains as a deprecated compatibility alias.
- Upload supports multipart image/video files with `title`, `type`, `source`, `tags`, `metadata`, and `description` fields.
- Assets are normalized on read to include `id`, `assetId`, `materialId`, `projectId`, `type`, `assetType`, `mediaType`, `source`, `title`, `description`, `fileUrl`, `thumbnailUrl`, `mimeType`, `size`, `tags`, `metadata`, `analysisStatus`, `analysis`, `slices`, `createdAt`, and `updatedAt`.
- Asset list supports `type`, `source`, `keyword`, `tag`, `limit`, and `offset`.
- Asset detail, edit, delete, search, mock analyze, and slices endpoints are available.
- Delete removes the JSON record and best-effort deletes local `/uploads/...` file and thumbnail.
- Mock analyze marks `processing`, writes mock analysis, then marks `completed`; videos receive mock slice records.
- Frontend asset page supports upload, title/tags/type entry, search/reset, detail view, edit/save, mock analyze, delete, image/video preview, loading states, and errors.

### Formal Assets APIs

- `GET /api/projects/:projectId/assets`
- `POST /api/projects/:projectId/assets`
- `GET /api/projects/:projectId/assets/:assetId`
- `PATCH /api/projects/:projectId/assets/:assetId`
- `DELETE /api/projects/:projectId/assets/:assetId`
- `POST /api/projects/:projectId/assets/search`
- `POST /api/projects/:projectId/assets/:assetId/analyze`
- `POST /api/projects/:projectId/assets/:assetId/reanalyze`
- `GET /api/projects/:projectId/assets/:assetId/slices`
- `POST /api/projects/:projectId/assets/generate`
- `GET /api/projects/:projectId/assets/generation-tasks/:taskId`

### Materials Compatibility APIs

- `GET /api/projects/:projectId/materials`
- `POST /api/projects/:projectId/materials`
- `GET /api/projects/:projectId/materials/:materialId`
- `PATCH /api/projects/:projectId/materials/:materialId`
- `DELETE /api/projects/:projectId/materials/:materialId`
- `POST /api/projects/:projectId/materials/search`
- `POST /api/projects/:projectId/materials/:materialId/analyze`
- `GET /api/projects/:projectId/materials/:materialId/slices`

### Still Mock After Phase 1

- Asset multimodal analysis is mock and lives in `backend/src/services/asset-analysis.service.js`.
- Video slice generation is mock and only stores coarse placeholder slices.
- Embedding/vector values are placeholder arrays.
- Vector search is not implemented; `embeddingQuery` returns 501.
- Script generation and storyboard matching remain mock.
- Seedance AI video asset generation remains partially implemented and should not be expanded in Phase 1.
- Seedream image generation remains disabled.

### Delete Verification Expectations

To verify deletion, upload an asset, capture `id`, then call:

```bash
curl -X DELETE "http://localhost:4000/api/projects/<projectId>/assets/<assetId>"
curl "http://localhost:4000/api/projects/<projectId>/assets"
curl "http://localhost:4000/api/projects/<projectId>/assets/<assetId>"
```

Expected result:

- Delete returns `{ "success": true, "deletedId": "..." }`.
- List no longer contains the asset.
- Detail returns 404.
- Local `/uploads/...` file is deleted when it exists and is safely ignored when missing.

### Phase 2 Entry Point

Start Phase 2 from:

1. Persisting AssetSlice as first-class records rather than embedding slices inside Asset.
2. Implementing actual video slicing with FFmpeg metadata and thumbnails.
3. Defining a stable tag taxonomy for product/video/slice levels.
4. Adding keyword + tag retrieval for downstream script/storyboard calls.
5. Creating a Seed 2.0 multimodal analysis provider interface, still mock by default.

## 18. Phase 1.5 Completion Update

Phase 1.5 status: completed for module-boundary and collaboration groundwork.

### Backend Modular Routes

`backend/src/routes/api.js` is now a mount-only router. Business handlers moved into:

- `health.routes.js`
- `projects.routes.js`
- `assets.routes.js`
- `materials.compat.routes.js`
- `scripts.routes.js`
- `storyboards.routes.js`
- `templates.routes.js`
- `reference-videos.routes.js`
- `creation.routes.js`
- `generation-tasks.routes.js`

Legacy singular routes remain compatible through `projects.routes.js`: `/script`, `/storyboard`, `/video-tasks`, and `/tasks`.

### Independent AssetSlice

AssetSlice is now managed by `backend/src/services/asset-slice.service.js` and stored in `backend/data/asset-slices.json` through `storage.service.js`.

Available slice APIs:

- `GET /api/projects/:projectId/assets/:assetId/slices`
- `GET /api/projects/:projectId/assets/:assetId/slices/:sliceId`
- `PATCH /api/projects/:projectId/assets/:assetId/slices/:sliceId`
- `DELETE /api/projects/:projectId/assets/:assetId/slices/:sliceId`
- `GET /api/projects/:projectId/materials/:materialId/slices`

Compatibility rule: embedded `asset.slices` is deprecated but still read as fallback when independent slice records do not exist.

### Asset Recall

`POST /api/projects/:projectId/assets/recall` is available for script, storyboard, and creation modules.

Current mode: `keyword_tag_mock`.

It returns `{ asset, slices, score, reason }` records using keyword/tag/type filters. `embeddingQuery` returns 501 until Phase 2.

### Provider And Agent Boundary

New provider and agent boundary files:

- `backend/src/services/model-provider.service.js`
- `backend/src/services/agent.service.js`
- `backend/src/providers/index.js`
- `backend/src/providers/mock/*`
- `backend/src/providers/volcengine/*`

Rules:

- Business services must call `model-provider.service.js`, not raw provider clients.
- Agent orchestration must call services/model-provider, not storage files or provider clients directly.
- SeedDance partial provider remains compatible for AI video asset generation.
- Seedream stays disabled.

### Script / Storyboard / Template / Reference / Creation Boundaries

Service boundaries now exist for:

- `script.service.js`
- `storyboard.service.js`
- `template.service.js`
- `reference-video.service.js`
- `creation.service.js`
- `creation-planning.service.js`
- `scene-asset-matching.service.js`
- `render.service.js`
- `generation-task.service.js`

Templates and reference videos are lightweight JSON/mock boundaries. Creation planning is mock but returns a stable `EditingPlan` shape.

### Creation Paths

SellDance supports two creation paths by contract:

```text
Path A: asset_first
Asset Library / AI-generated assets -> Intelligent Editing -> Preview / Export

Path B: storyboard_driven
Product Info -> Script -> StoryboardScene[] -> Asset Matching -> Intelligent Editing -> Preview / Export
```

`POST /api/projects/:projectId/creation/plan` supports both `asset_first` and `storyboard_driven` payloads and returns a mock `EditingPlan`.

### Frontend Boundary

New frontend API modules:

- `frontend/src/api/http.js`
- `frontend/src/api/projects.api.js`
- `frontend/src/api/assets.api.js`
- `frontend/src/api/materials.compat.api.js`
- `frontend/src/api/scripts.api.js`
- `frontend/src/api/storyboards.api.js`
- `frontend/src/api/templates.api.js`
- `frontend/src/api/creation.api.js`
- `frontend/src/api/generationTasks.api.js`

`frontend/src/services/api.js` is now a compatibility export layer.

New frontend component boundaries:

- `frontend/src/components/assets/AssetPreview.jsx`
- `frontend/src/components/assets/AssetAnalyzeButton.jsx`
- `frontend/src/components/common/EmptyState.jsx`
- `frontend/src/components/creation/CreationModeSelector.jsx`
- `frontend/src/components/creation/AssetFirstCreationPanel.jsx`
- `frontend/src/components/creation/EditingPlanPreview.jsx`

### Three-owner Collaboration Model

Phase is the delivery sequence, not the ownership model.

Owner 1: Asset + Agent + Architecture Owner

- Owns Asset, AssetSlice, search, recall, analysis, provider/agent conventions, and cross-module schemas.
- Main files: `asset.service.js`, `asset-slice.service.js`, `asset-search.service.js`, `asset-analysis.service.js`, `model-provider.service.js`, `agent.service.js`, `assets.routes.js`, `materials.compat.routes.js`, `providers/*`.

Owner 2: Script & Storyboard Owner

- Owns ReferenceVideo, CreativeTemplate, Script, Storyboard, StoryboardScene, strategy/factors, script generation, storyboard generation, and scene requirements.
- Main files: `script.service.js`, `storyboard.service.js`, `template.service.js`, `reference-video.service.js`, `scripts.routes.js`, `storyboards.routes.js`, `templates.routes.js`, `reference-videos.routes.js`.

Owner 3: Intelligent Editing / Creation Owner

- Owns asset-first editing, storyboard-driven editing, editing plans, scene-to-asset matching, render task lifecycle, FFmpeg pipeline, preview/export, retry/cancel.
- Main files: `creation.service.js`, `creation-planning.service.js`, `scene-asset-matching.service.js`, `render.service.js`, `generation-task.service.js`, `creation.routes.js`, `generation-tasks.routes.js`.

### Cross-module Contracts

Stable contracts to protect:

- Asset -> Script/Storyboard/Creation: `Asset`, `AssetSlice`, `AssetSearchQuery`, `AssetRecallQuery`, `AssetRecallResult`.
- Script -> Storyboard: `Script`, `NarrativeBeat`, `CreativeStrategy`, `CreativeFactor`, `Constraint`.
- Storyboard -> Creation: `Storyboard`, `StoryboardScene`, `SceneAssetRequirement`, `selectedAssetSliceIds`.
- Creation -> UI: `CreationInputMode`, `EditingPlan`, `CreationTask`, `RenderOutput`, `TaskStatus`.

### Mock / Placeholder Status

Formal and usable:

- Asset upload/list/detail/edit/delete/search/analyze.
- Materials compatibility aliases.
- Independent slice list/detail/update/delete after mock analyze creates slices.
- Asset recall with keyword/tag mock scoring.
- Creation plan endpoint with mock EditingPlan.

Mock:

- Asset analysis and slice analysis.
- Asset recall score/reason.
- Creation planning.
- Template/reference-video analysis.
- Provider/agent responses unless explicitly using existing SeedDance asset generation path.

Placeholder / 501:

- Embedding recall/search.
- Creation task cancel.
- Generic task mutation methods.
- Scene regeneration.
- Seedream image generation.

### Next Phase 2 Entry

Start from independent AssetSlice persistence and build:

1. Real video slice generation metadata.
2. Product/video/slice tag taxonomy.
3. Keyword + tag retrieval for downstream modules.
4. Asset recall scoring improvements.
5. Seed 2.0 multimodal analysis provider interface, mock by default.

Owner 3 can proceed in parallel with asset-first intelligent editing: selected assets -> EditingPlan -> render task -> preview/export.
