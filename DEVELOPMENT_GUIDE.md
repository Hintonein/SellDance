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

## 12. Phased Roadmap and Owner Collaboration Plan

This chapter defines the delivery roadmap from Phase 2 onward and the collaboration model for the three owners.

From Phase 2 onward, development should move forward through three parallel lanes:

- Owner 1: Asset / Agent / Architecture
- Owner 2: Script / Storyboard
- Owner 3: Intelligent Creation / Editing

The roadmap is not a serial handoff from Asset to Script/Storyboard to Creation. Each phase should produce a usable cross-module increment. Asset-first creation can start before the script and storyboard module is fully complete. Storyboard-driven creation can be connected later through the same EditingPlan and render pipeline.

Owner 1 provides stable asset, recall, provider, and architecture contracts. Owner 2 builds the structured script and storyboard layer against those contracts. Owner 3 builds the creation pipeline first from assets and slices, then later connects storyboard scenes as another input source.

---

### 12.1 Owner Responsibility Model

#### Owner 1: Asset / Agent / Architecture Owner

Owner 1 owns the asset foundation and the cross-module technical contracts.

Responsibilities:

- Asset upload, storage, list, detail, edit, delete, analysis, search, and recall.
- AssetSlice model, storage, slicing, thumbnail generation, and lifecycle.
- Asset metadata, tags, analysis result, embedding fields, and provider integration.
- Asset Search and Asset Recall APIs consumed by Script, Storyboard, and Creation modules.
- Provider and agent boundaries.
- Global architecture consistency, route/service/provider layering, compatibility rules, and documentation governance.

Main files:

- `backend/src/routes/assets.routes.js`
- `backend/src/routes/materials.compat.routes.js`
- `backend/src/services/asset.service.js`
- `backend/src/services/asset-slice.service.js`
- `backend/src/services/asset-analysis.service.js`
- `backend/src/services/asset-search.service.js`
- `backend/src/services/model-provider.service.js`
- `backend/src/services/agent.service.js`
- `backend/src/providers/*`
- `frontend/src/api/assets.api.js`
- `frontend/src/components/assets/*`
- `DEVELOPMENT_GUIDE.md`
- `AGENTS.md`

#### Owner 2: Script / Storyboard Owner

Owner 2 owns the narrative, script, storyboard, and scene-level creative planning layer.

Responsibilities:

- Script model and structured script generation.
- Storyboard and StoryboardScene model.
- Scene-level asset requirements.
- Reference video and creative template models.
- Script-to-storyboard conversion.
- Storyboard-to-asset matching contract.
- Scene-level regeneration and editing.
- Calling Asset Search / Asset Recall instead of directly accessing asset storage.

Main files:

- `backend/src/routes/scripts.routes.js`
- `backend/src/routes/storyboards.routes.js`
- `backend/src/routes/templates.routes.js`
- `backend/src/routes/reference-videos.routes.js`
- `backend/src/services/script.service.js`
- `backend/src/services/storyboard.service.js`
- `backend/src/services/template.service.js`
- `backend/src/services/reference-video.service.js`
- `frontend/src/api/scripts.api.js`
- `frontend/src/api/storyboards.api.js`
- `frontend/src/api/templates.api.js`
- `frontend/src/components/scripts/*`
- `frontend/src/components/storyboards/*`

#### Owner 3: Intelligent Editing / Creation Owner

Owner 3 owns the intelligent video creation pipeline.

Responsibilities:

- Asset-first intelligent editing.
- Storyboard-driven intelligent editing.
- EditingPlan model and timeline generation.
- Scene-to-asset and scene-to-slice matching integration.
- Render task lifecycle.
- FFmpeg render pipeline.
- Preview, export, retry, and cancel.
- Recording which assets, slices, scripts, and storyboard scenes were used in each output.

Main files:

- `backend/src/routes/creation.routes.js`
- `backend/src/routes/generation-tasks.routes.js`
- `backend/src/services/creation.service.js`
- `backend/src/services/creation-planning.service.js`
- `backend/src/services/scene-asset-matching.service.js`
- `backend/src/services/render.service.js`
- `backend/src/services/generation-task.service.js`
- `frontend/src/api/creation.api.js`
- `frontend/src/api/generationTasks.api.js`
- `frontend/src/components/creation/*`

---

### 12.2 Cross-owner Collaboration Rules

- Owner 1 owns asset contracts. Owner 2 and Owner 3 consume assets through Asset Search / Asset Recall APIs instead of directly reading asset storage.
- Owner 2 owns Script, Storyboard, and StoryboardScene contracts. Owner 3 consumes `StoryboardScene`, `assetRequirements`, `selectedAssetIds`, and `selectedAssetSliceIds` when using storyboard-driven creation.
- Owner 3 owns EditingPlan, CreationTask, and render task contracts. Owner 1 and Owner 2 should not modify render task internals without coordination.
- Asset-first creation is a first-class path. It should work from selected assets and selected slices without requiring script or storyboard data.
- Storyboard-driven creation is another input path into the same creation pipeline. It should reuse EditingPlan and render task infrastructure instead of creating a separate render system.
- Business services must call `model-provider.service.js`, not raw provider clients.
- Agent orchestration must call services and model-provider boundaries, not storage files or vendor clients directly.
- `/assets` is the canonical asset API. `/materials` remains a deprecated compatibility alias until migration is fully complete.
- Each owner should preserve compatibility endpoints unless this guide explicitly marks them as removable.
- Each owner must update the guide sections, API notes, schema notes, and module documentation affected by their own changes. Documentation is not owned only by Owner 1.
- Each phase should keep the project runnable with `npm run lint`, `npm run test`, `npm run build`, `npm run dev:backend`, and `npm run dev:frontend`.

---

### 12.3 Cross-module Contract Versioning

These contracts are shared by at least two owners and should be treated as stable once another module consumes them:

- `Asset`
- `AssetSlice`
- `AssetSearchQuery`
- `AssetRecallQuery`
- `AssetRecallResult`
- `Script`
- `Storyboard`
- `StoryboardScene`
- `SceneAssetRequirement`
- `CreationInputMode`
- `EditingPlan`
- `CreationTask`
- `RenderOutput`
- `TaskStatus`

Rules:

- Prefer backward-compatible field additions.
- Do not rename, remove, or change the meaning of shared fields without updating all consumers in the same change.
- If a breaking change is unavoidable, add a compatibility adapter or migration path first.
- Keep deprecated fields readable until frontend and backend consumers have migrated.
- Document every shared contract change in this guide and, when relevant, `.env.example` or `AGENTS.md`.

---

### 12.4 Phase Definition of Done

Every phase should meet this minimum bar before handoff:

- New or changed routes are documented in this guide.
- New backend behavior lives in service files, not directly inside the route mount layer.
- New frontend API calls live under `frontend/src/api/`; `frontend/src/services/api.js` remains a compatibility export layer.
- Mock fallback remains available for local development unless the feature is explicitly disabled.
- Cross-module access goes through service methods or API clients, not direct JSON file reads from another owner's module.
- New environment variables are documented in `.env.example` and no real keys are committed.
- `npm run lint`, `npm run test`, and `npm run build` pass, or any failure is documented with the exact reason.
- Backend and frontend dev servers can start.
- New API behavior is verified with curl or an equivalent manual check.
- Existing project, asset, script, storyboard, and creation flows do not regress.

---

### 12.5 Completed Milestones

#### Phase 0: Code Organization and Documentation

Status: Completed.

Completed scope:

- Documented current code and boundaries.
- Added/maintained `DEVELOPMENT_GUIDE.md`.
- Added/maintained `AGENTS.md` for handoff rules.
- Added `.env.example`.
- Kept the current app runnable.

Acceptance:

- Project starts with existing commands.
- Root has `DEVELOPMENT_GUIDE.md`.
- Next development entry points are clear.

#### Phase 1: Asset Library Base Loop

Status: Completed.

Completed scope:

- Completed upload, list, detail, edit, delete.
- Unified asset naming around `/assets` while preserving `/materials` compatibility.
- Supported image/video type, source, tags, and metadata.
- Normalized canonical Asset fields.
- Kept existing frontend flow working.

Acceptance:

- Upload image/video.
- View asset list and detail.
- Edit asset metadata.
- Delete asset and local file consistently where possible.
- Refresh does not show deleted asset.
- Existing `/materials` compatibility remains.

#### Phase 1.5: Module Boundaries and Collaboration Groundwork

Status: Completed.

Completed scope:

- Split backend API routes into domain routes.
- Kept legacy routes compatible.
- Introduced independent `asset-slice.service.js` and `asset-slices.json` storage.
- Added slice list/detail/update/delete APIs.
- Added asset recall API.
- Added `model-provider.service.js` and `agent.service.js` boundaries.
- Added mock and Volcengine provider boundaries.
- Added script, storyboard, template, reference-video, creation, render, and task service boundaries.
- Added frontend API modules and component boundaries.
- Updated collaboration guide and handoff rules.

Acceptance:

- `backend/src/routes/api.js` is a mount-only or near mount-only router.
- Business handlers live in domain route files.
- AssetSlice is managed independently from Asset.
- Embedded `asset.slices` is deprecated but still read as fallback.
- `POST /api/projects/:projectId/assets/recall` exists.
- Asset recall returns `{ asset, slices, score, reason }`.
- Provider and agent boundaries exist.
- `asset_first` and `storyboard_driven` creation paths are defined by contract.
- Frontend API clients are split by domain.
- `/materials` compatibility remains available.

---

## Phase 2: Parallel MVP Foundation

Goal:

Build the first usable parallel foundation for structured assets, structured script/storyboard contracts, and asset-first intelligent creation.

Phase 2 should produce three usable results:

- Asset module can provide structured assets, slices, search, and recall.
- Script/storyboard module can produce structured scene contracts and asset requirements.
- Creation module can generate an EditingPlan and basic preview/export directly from selected assets or slices.

### Owner 1 Tasks: Asset Structuring, Search, and Recall

Owner 1 should improve the asset system from file management into a structured asset foundation.

Tasks:

1. Improve first-class AssetSlice persistence.
   - Store slices independently.
   - Support `projectId + assetId + sliceId` queries.
   - Cascade delete slices when an asset is deleted.
   - Keep legacy embedded `asset.slices` as read-only fallback only.

2. Implement video metadata extraction.
   - Use FFmpeg/ffprobe to read duration, width, height, fps, codec, and format.
   - Save video metadata into Asset metadata and/or analysis fields.
   - Return clear errors when ffprobe is unavailable or extraction fails.

3. Implement basic video slicing.
   - Generate fixed-window slices, for example 2-3 seconds per slice.
   - Save `startTime`, `endTime`, `duration`, `thumbnailUrl`, `tags`, and `metadata`.
   - Generate thumbnails for slices when possible.
   - Do not require physically cutting separate MP4 files in the first version; time ranges are enough.

4. Define product/video/slice tag taxonomy.
   - Separate `systemTags` and `userTags`.
   - Normalize tags to lowercase canonical names.
   - Add alias mapping for common Chinese labels, for example `特写 -> close_up`.
   - Support product-level, video-level, and slice-level tags.

5. Enhance asset search.
   - Support keyword, tag, type, source, mediaType, and analysisStatus.
   - Search both Asset and AssetSlice.
   - Return matched slices, score, and reason.
   - Support topK/limit/offset.

6. Enhance asset recall.
   - Implement rule-based scoring before embedding is available.
   - Return `{ asset, matchedSlices, score, reason, usageSuggestion }`.
   - Support downstream query fields from script/storyboard/creation modules.
   - Return 501 or a clear request-level error for embedding search until implemented.

7. Add Seed 2.0 multimodal analysis provider boundary.
   - Add `AI_ASSET_ANALYSIS_PROVIDER=mock|seed2`.
   - Keep mock provider as default.
   - When `seed2` is enabled and env is complete, image analysis should be able to call Seed 2.0 through the provider boundary.
   - For video, extract representative frames first, then pass them to the analysis provider.
   - Normalize model output into `AssetAnalysis`.
   - Never hard-code or print API keys.
   - Missing keys should fail only the related analysis request, not backend startup.
   - If the exact Seed 2.0 request format is not confirmed yet, keep a clear provider TODO/placeholder, but do not call raw provider clients from business services.

8. Reserve embedding integration.
   - Keep embedding fields in AssetAnalysis and AssetSlice.
   - Keep semantic query fields in API shape.
   - Do not block Phase 2 on vector database integration.
   - If an embedding provider is available, first implement local cosine similarity over stored JSON vectors.

Owner 1 acceptance criteria:

- Uploaded videos can generate slice records.
- Video metadata is extracted and stored.
- Each generated slice has start time, end time, duration, and thumbnail when possible.
- Asset and slice tags are searchable.
- `/assets/search` returns asset-level and slice-level matches.
- `/assets/recall` returns matched slices, score, reason, and usage suggestion.
- Asset deletion deletes related slices.
- Mock analysis still works.
- Seed 2.0 analysis can be enabled by env without changing business services.
- Missing Seed 2.0 env produces a clear request-level error.
- Lint, build, test, backend startup, and frontend startup pass.

### Owner 2 Tasks: Script and Storyboard Contract Foundation

Owner 2 should prepare the structured narrative layer so scripts and storyboard scenes can connect to assets and creation.

Tasks:

1. Define canonical script and storyboard schemas.
   - Define `Script`, `ScriptScene`, `Storyboard`, and `StoryboardScene`.
   - Support scene id, order, duration, voiceover, subtitle, visual description, and selling point.
   - Keep the schema easy for frontend editing.

2. Define `StoryboardScene.assetRequirements`.
   - Include preferred media type.
   - Include required tags and optional tags.
   - Include keywords, duration, role, visual intent, and fallback strategy.
   - Include fields that can be converted into an Asset Recall query.

3. Define scene-level selected assets and slices.
   - Add `selectedAssetIds`.
   - Add `selectedAssetSliceIds`.
   - Support candidate assets and candidate slices returned from recall.

4. Replace round-robin mock asset matching.
   - Storyboard matching should call Asset Recall.
   - It should not directly read asset JSON files.
   - It should attach candidate assets/slices to scenes.
   - If recall returns no result, use a clear fallback result instead of crashing.

5. Prepare structured generation and editing endpoints.
   - Full real script generation is not required in Phase 2.
   - Mock generation should already return structured scenes.
   - Add or reserve edit/save endpoints for structured script/storyboard JSON.

6. Provide recall query examples to Owner 1.
   - Hook scene.
   - Product close-up.
   - Usage demonstration.
   - Selling point scene.
   - Comparison scene.
   - Call-to-action scene.

Owner 2 acceptance criteria:

- Script and storyboard schemas are structured and editable.
- `StoryboardScene` can express asset requirements.
- `StoryboardScene` can store selected asset IDs and selected slice IDs.
- Mock storyboard generation can produce structured scenes.
- Storyboard matching calls Asset Recall instead of directly reading asset storage.
- Scene data can be consumed by the Creation module.
- Full real script generation is not required in Phase 2.

### Owner 3 Tasks: Asset-first Intelligent Creation Foundation

Owner 3 should build the first usable intelligent creation path directly from selected assets and slices.

Tasks:

1. Implement `asset_first` creation mode.
   - Accept selected asset IDs.
   - Accept selected slice IDs.
   - Support direct creation without script or storyboard input.
   - Validate that selected assets/slices belong to the current project.

2. Generate a basic EditingPlan timeline.
   - Convert selected assets/slices into ordered timeline clips.
   - Prefer slice `startTime`, `endTime`, and `duration` when slices are available.
   - Fallback to whole assets when no slices are selected.
   - Keep 9:16 as the default output format.

3. Connect EditingPlan to render task.
   - Create render tasks from an EditingPlan.
   - Generate preview/export from selected assets or slices.
   - Use FFmpeg for the first local render pipeline where possible.
   - Return clear task errors when rendering fails.

4. Improve creation task lifecycle.
   - Support task status query.
   - Support retry for failed tasks.
   - Implement or complete cancel endpoint for queued/running tasks.
   - Keep task status transitions consistent.

5. Record asset and slice usage.
   - Store used assetIds and sliceIds in output metadata.
   - Prepare for future feedback and optimization.
   - Include render settings and output format in task metadata.

6. Keep storyboard-driven mode contract-compatible.
   - Do not require full storyboard-driven creation in Phase 2.
   - Reserve input shape for `StoryboardScene.selectedAssetIds` and `StoryboardScene.selectedAssetSliceIds`.
   - Reuse the same EditingPlan structure for future storyboard-driven creation.

Owner 3 acceptance criteria:

- User can select assets/slices and generate an EditingPlan.
- Creation can render a basic preview/export from selected assets/slices.
- Render task status is queryable.
- Failed task can retry.
- Queued/running task can cancel.
- Output metadata records used assetIds and sliceIds.
- `storyboard_driven` mode remains compatible with future storyboard inputs.

### Phase 2 Integration Acceptance

Phase 2 is complete when:

- Asset Search and Asset Recall can be called through stable APIs.
- Structured storyboard scenes can express asset requirements and selected slices.
- Asset-first creation works without requiring completed script/storyboard generation.
- The EditingPlan shape can later accept storyboard-driven inputs.
- The project remains runnable through the standard development commands.

---

## Phase 3: Structured Intelligence Upgrade

Goal:

Upgrade each lane from basic contracts and mock behavior into more intelligent structured behavior while keeping the Phase 2 contracts stable.

### Owner 1 Tasks: Better Asset Intelligence

Tasks:

1. Improve asset analysis fields.
   - Extract richer object, scene, product, action, and composition tags.
   - Improve video frame sampling for analysis.
   - Store normalized analysis results.

2. Improve recall quality.
   - Improve rule-based scoring.
   - Support stronger scene-intent matching.
   - Support duration-aware slice matching.
   - Support product-focused recall fields.

3. Add local embedding search when possible.
   - Store embedding vectors in JSON or lightweight local storage.
   - Implement local cosine similarity before introducing a vector database.
   - Keep embedding integration optional.

4. Support additional fields requested by Owner 2 and Owner 3.
   - Add recall query fields only through versioned or backward-compatible API changes.
   - Keep existing consumers working.

Owner 1 acceptance criteria:

- Asset recall quality is better than simple keyword matching.
- Slice-level recall works for scene requirements.
- Optional embedding search does not break mock or rule-based recall.
- Owner 2 and Owner 3 can keep using the same API shape.

### Owner 2 Tasks: Structured Script and Storyboard Generation

Tasks:

1. Implement canonical Script model.
2. Implement canonical Storyboard and StoryboardScene model.
3. Generate structured scenes directly instead of text-only scripts.
4. Support script modes:
   - `free`
   - `template`
   - `reference_rewrite`
   - `automated`

5. Add JSON edit/save endpoint.
6. Add single-scene regenerate endpoint.
7. Add reference-video and template models as needed.
8. Use Asset Recall for scene asset matching.

Owner 2 acceptance criteria:

- Product input generates structured scenes.
- Scenes include visual description, subtitle, voiceover, asset requirements, and duration.
- User can edit and save structured script JSON.
- User can regenerate one scene.
- Storyboard scenes can call Asset Recall.
- Storyboard scenes can store selected asset slices.

### Owner 3 Tasks: Smarter EditingPlan and Storyboard Input

Tasks:

1. Improve EditingPlan generation.
   - Add smarter ordering.
   - Add clip duration control.
   - Add transition placeholders.
   - Add subtitle placeholders.
   - Add music/audio placeholders where appropriate.

2. Connect storyboard-driven creation.
   - Accept storyboard ID or storyboard scene list.
   - Read selected asset IDs and selected slice IDs from scenes.
   - Generate an EditingPlan from storyboard scenes.
   - Fallback to Asset Recall when a scene has requirements but no selected assets.

3. Keep asset-first mode working.
   - Asset-first creation should remain independent.
   - Existing asset-first inputs should remain compatible.

Owner 3 acceptance criteria:

- Asset-first EditingPlan quality is improved.
- Storyboard-driven input can generate an EditingPlan.
- Storyboard scenes can map to clips.
- Asset-first mode continues to work.
- Rendering can remain basic if the EditingPlan structure is correct.

### Phase 3 Integration Acceptance

Phase 3 is complete when:

- Structured script and storyboard generation works.
- Storyboard scenes include asset requirements and candidate assets/slices.
- Asset-first creation still works.
- Storyboard-driven creation can generate an EditingPlan.
- All modules still communicate through service/API contracts instead of storage internals.

---

## Phase 4: End-to-end Creation and Render Flow

Goal:

Turn the structured asset, storyboard, and creation contracts into a usable end-to-end production flow.

### Owner 1 Tasks: Asset Stability and Usage Support

Tasks:

1. Stabilize AssetSlice, Asset Search, and Asset Recall.
2. Provide asset/slice metadata required by render and creation.
3. Add asset usage logging support.
4. Improve provider error handling.
5. Preserve compatibility with `/materials` until migration is complete.

Owner 1 acceptance criteria:

- Creation can reliably fetch asset and slice metadata.
- Used assets and slices can be logged.
- Asset recall remains stable for script/storyboard/creation consumers.
- Provider failures do not crash unrelated flows.

### Owner 2 Tasks: Creation-ready Storyboard Output

Tasks:

1. Ensure storyboard scenes are creation-ready.
2. Validate scene durations, subtitles, voiceover, visual intent, and selected assets.
3. Improve template/reference rewrite quality.
4. Ensure every scene has either selected assets/slices or asset requirements for recall.
5. Expose final storyboard output for creation.

Owner 2 acceptance criteria:

- Storyboard output can be passed directly to the Creation module.
- Scenes have valid durations and visual requirements.
- User edits are preserved.
- Missing selected assets can be resolved through recall.

### Owner 3 Tasks: Render Task and Export Completion

Tasks:

1. Complete asset-first creation.
2. Complete storyboard-driven creation.
3. Generate EditingPlan from selected assets/slices or storyboard scenes.
4. Implement render task lifecycle.
5. Implement preview/export.
6. Implement retry and cancel.
7. Support 9:16 default output.
8. Record used script/storyboard/assets/slices.

Owner 3 acceptance criteria:

- User can create a render task from selected assets/slices.
- User can create a render task from storyboard scenes.
- Task status is queryable.
- Completed task returns `outputUrl`.
- Failed task can retry.
- Running/queued task can cancel.
- 9:16 output works.
- Output metadata records used assets, slices, scripts, and storyboard scenes.

### Phase 4 Integration Acceptance

Phase 4 is complete when:

- Asset-first creation can produce an output video.
- Storyboard-driven creation can produce an output video.
- Render task lifecycle is complete.
- Output metadata links back to all used inputs.
- The frontend can complete the main user flow from project assets to video export.

---

## Phase 5: Real Model Provider Integration

Goal:

Replace mock logic with real provider calls where needed, while preserving fallback behavior and clean provider boundaries.

### Owner 1 Tasks: Provider Infrastructure

Tasks:

1. Finalize model-provider abstraction.
2. Integrate Seed 2.0 for asset analysis and multimodal support where needed.
3. Integrate SeedDance 1.5 for generated video assets if access is confirmed.
4. Keep Seedream disabled unless product access is confirmed.
5. Add request-level provider errors.
6. Save model responses structurally.
7. Ensure `.env` can switch mock/real providers.

Owner 1 acceptance criteria:

- `.env` can switch mock/real providers.
- Missing key gives clear request-level error.
- Failed model call does not crash backend.
- Model responses are saved structurally.
- Business services do not call raw provider clients directly.

### Owner 2 Tasks: Real Script and Reference Generation

Tasks:

1. Use provider abstraction for script generation.
2. Use provider abstraction for reference rewrite.
3. Use provider abstraction for template-assisted generation.
4. Normalize model output into structured Script and Storyboard models.
5. Keep mock fallback available.

Owner 2 acceptance criteria:

- Script generation can use mock or real provider.
- Reference rewrite can use mock or real provider.
- Provider output is normalized before saving.
- Raw vendor clients are not called from script/storyboard services.

### Owner 3 Tasks: Provider-aware Creation Support

Tasks:

1. Use provider abstraction only when creation requires model calls.
2. Keep FFmpeg render pipeline independent from provider availability.
3. Support generated video assets if SeedDance 1.5 integration is available.
4. Save provider-generated creation outputs as normal assets when appropriate.

Owner 3 acceptance criteria:

- Creation does not depend on provider availability for local rendering.
- Provider-generated clips can be attached to the project as assets when supported.
- Provider failures produce clear task-level errors.
- Render task lifecycle remains stable.

### Phase 5 Integration Acceptance

Phase 5 is complete when:

- Mock and real provider modes can be switched by env.
- Provider errors are request-level or task-level, not startup-level.
- Script, asset analysis, and creation modules all use provider boundaries consistently.
- The project can still run without real provider keys.

---

## Phase 6: Data Feedback and Optimization

Goal:

Record usage and performance data so later versions can optimize scripts, assets, templates, and creation strategies.

### Owner 1 Tasks: Data Contracts and Storage Boundaries

Tasks:

1. Define asset usage log schema.
2. Define user edit log schema.
3. Define performance metrics schema.
4. Provide storage/service boundaries.
5. Support future import of external performance metrics.

Owner 1 acceptance criteria:

- Usage logs can reference assets and slices.
- Edit logs can reference scripts, storyboards, and scenes.
- Performance metrics can be stored without blocking the main flow.
- Storage boundaries are clear.

### Owner 2 Tasks: Script and Storyboard Feedback

Tasks:

1. Record script edits.
2. Record scene regeneration.
3. Record selected strategy and creative factors.
4. Record template/reference usage.
5. Prepare data for future script optimization.

Owner 2 acceptance criteria:

- Script edits are recorded.
- Scene regeneration history is recorded.
- Template/reference usage is traceable.
- Feedback data does not block script generation.

### Owner 3 Tasks: Creation and Render Feedback

Tasks:

1. Record creation outputs.
2. Record used assets and slices.
3. Record used scripts and storyboard scenes.
4. Record render settings.
5. Record export metadata and task outcomes.

Owner 3 acceptance criteria:

- Output video links to used assets, slices, scripts, storyboards, and templates.
- Render settings are recorded.
- Task success/failure is recorded.
- Feedback data does not block preview/export.

### Phase 6 Integration Acceptance

Phase 6 is complete when:

- Output video links to used assets, slices, scripts, storyboards, and templates.
- User edits are recorded.
- Creation choices and render outputs are recorded.
- External performance metrics can be imported later.
- No analytics feature blocks the basic creation flow.

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

Chapter 12 is the canonical source for owner responsibilities, cross-owner rules, contract versioning, and phase Definition of Done. Phase 1.5 established the code boundaries needed for that collaboration model:

- Owner 1 owns asset, AssetSlice, search, recall, provider/agent conventions, and cross-module contract governance.
- Owner 2 owns script, storyboard, template, reference-video, and scene-level asset requirement contracts.
- Owner 3 owns asset-first creation, storyboard-driven creation, EditingPlan, render task lifecycle, preview/export, retry/cancel, and usage recording.

Future updates should modify Chapter 12 first and keep this Phase 1.5 section as a historical completion note.

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

## 19. Phase 2 Owner 1 Completion Update

Phase 2 Owner 1 status: completed for the asset structuring/search/recall foundation. This does not complete all Phase 2 work for Owner 2 or Owner 3.

### Completed Owner 1 Capabilities

- /assets remains the canonical asset API. /materials remains available as a deprecated compatibility alias.
- Uploaded video assets are probed with ffprobe; metadata is saved under asset.metadata.video and mirrored into analysis output when analyzed.
- Video metadata fields: duration, width, height, fps, codec, format, bitrate, frameCount, provider.
- AssetSlice is first-class persisted data through asset-slice.service.js; new slices are not written into asset.slices.
- Legacy embedded asset.slices remains a read-only fallback.
- Video analyze creates fixed-window slice records, defaulting to 3-second windows.
- Slice thumbnails are generated with ffmpeg when possible; thumbnail failure does not fail the analyze request.
- Asset delete cascades to slices and makes best-effort deletion of asset files and slice thumbnails.
- Tags are normalized through asset-tag.service.js, with userTags, systemTags, and backward-compatible tags.
- Chinese aliases normalize to canonical English tags, including 特写 -> close_up, 商品 -> product, 使用 -> usage, 开箱 -> unboxing, 细节 -> detail, and 对比 -> comparison.
- POST /api/projects/:projectId/assets/search returns asset-level and slice-level matches with asset, matchedSlices, score, and reason.
- POST /api/projects/:projectId/assets/recall supports downstream query fields and returns asset, matchedSlices, score, reason, and usageSuggestion.
- Embedding query shapes are retained, but embedding search/recall returns a clear 501 until semantic search is implemented.
- AI_ASSET_ANALYSIS_PROVIDER=mock|seed2 is wired through model-provider.service.js; mock remains default.
- Seed 2.0 analysis has an explicit provider boundary and request-level errors. Raw provider calls are not placed in business services.
- Frontend asset page now shows video metadata and slice thumbnails when available.

### Asset Contract After Owner 1 Phase 2

Core fields:

- id, assetId, materialId
- projectId
- type
- assetType
- mediaType
- source
- title, description
- fileUrl, url, filePath, thumbnailUrl
- mimeType, size, duration
- userTags, systemTags, tags
- metadata.video for video probe results
- analysisStatus, analysis, analysisError
- createdAt, updatedAt, uploadedAt

### AssetSlice Contract After Owner 1 Phase 2

Core fields:

- id
- projectId
- assetId
- index
- startTime
- endTime
- duration
- thumbnailUrl
- transcript
- visualDescription
- userTags, systemTags, tags
- embedding
- metadata
- analysisStatus
- createdAt, updatedAt

### Search And Recall Contracts

Search request supports:

- keyword / keywords
- tags / tag / requiredTags
- optionalTags
- type
- source
- mediaType
- analysisStatus
- preferredAssetTypes
- topK / limit / offset
- embeddingQuery reserved with 501 response

Search response returns:

- items[] containing asset, matchedSlices, score, reason
- total, limit, offset, mode

Recall request additionally supports:

- duration
- visualIntent
- sceneRole
- semantic query fields for future embedding recall

Recall response returns:

- items[] containing asset, matchedSlices, score, reason, usageSuggestion
- usageSuggestion values include use_as_hook, use_as_product_closeup, use_as_usage_demo, use_as_detail_cutaway, and use_as_transition

### Phase 2 Owner 1 TODO

- Implement confirmed Seed 2.0 multimodal request format inside backend/src/providers/volcengine/seed2.client.js.
- Add real representative-frame extraction for Seed 2.0 video analysis beyond slice thumbnail generation.
- Add local JSON cosine similarity if embedding vectors become available.
- Add automated backend tests for upload/analyze/search/recall/delete once the test harness is expanded.
- Clean old local mock data if historical corrupted tags are visible; runtime JSON data should not be committed.
