# SellDance Agent Guide

## Project Name

SellDance: 电商场景 AIGC 带货视频生成系统。

## Project Goal

SellDance targets TikTok Shop, cross-border commerce, and social commerce merchants. The system should provide a runnable end-to-end workflow for generating short-form product selling videos from product assets.

The core merchant workflow must support:

1. End-to-end video generation.
2. Asset import and management.
3. Prompt adjustment.
4. Storyboard intervention.
5. Asset remixing.
6. Long-running task progress.
7. Failure retry.
8. Video preview and export.
9. Future data feedback loops for generation quality iteration.

## Current Technical Stack

Keep the existing stack unless there is a strong reason to change it:

- Frontend: React + Vite.
- Backend: Node.js + Express.
- AI orchestration: centralized mock services with provider adapters.
- Video rendering: local FFmpeg/mock pipeline plus Volcengine Ark Seedance adapter.
- Persistence: local JSON files under `backend/data`.

Do not introduce dependencies that require complex external configuration. Real AI/video providers must be added behind service adapters rather than hard-coded into routes or React components.

## Workspace

Use this repository path as the default working directory for all future commands and file edits:

```bash
/Users/shuwei/PycharmProjects/SellDance
```

Do not use `node_modules` as the working directory for normal development. Run project commands from the repository root unless a package-specific command explicitly requires `--prefix backend` or `--prefix frontend`.

## Development Guide First

Before implementing new features, read `DEVELOPMENT_GUIDE.md`. It is the phase plan and current-state map for future work. If code changes alter architecture, APIs, providers, data models, or phase priorities, update `DEVELOPMENT_GUIDE.md` in the same change.

## Architecture Constraints

- Keep frontend and backend separated.
- Keep backend route, service, persistence, and provider responsibilities separated.
- Keep mock AI/video logic centralized in backend services.
- Keep API access centralized in frontend API modules or `frontend/src/services/api.js` until the API client is split.
- Preserve existing runnable behavior when adding P1/P2 features.
- Avoid scattering mock data in React components.
- Keep runtime-generated JSON and uploaded/generated media out of commits. They live under `backend/data`, `backend/uploads`, and `backend/outputs`.
- `nodemon` must not watch runtime data/media directories, otherwise generation tasks can restart the backend and break active HTTP requests.
- Do not break existing `/materials` or `/assets` APIs while migrating names.

## Security And Provider Rules

- Never hard-code API keys or commit real `.env` values.
- Keep `.env.example` safe and documentation-only.
- Backend startup may log enabled providers and model/endpoint IDs, but must never log API keys.
- Mock provider and real provider paths must be switchable by configuration.
- Keep Volcengine/Ark-specific calls inside provider/client files, not inside routes or React components.
- AI image generation remains disabled until Seedream access and product scope are confirmed.

## Third-Party Reference Video Rules

- Third-party public videos may be used only as references for structured analysis.
- Store source platform, source URL, source declaration, and analysis output.
- Do not download, copy, remix, or directly reuse third-party original video content as SellDance generation material.
- User-uploaded owned reference videos can be stored as assets, but should still keep source and usage metadata.

## Phase 1 Asset Rules

- Prefer `assets` over `materials` for new code.
- Keep `materials` routes as compatibility aliases until frontend migration is complete.
- Asset deletion must remove both records and local files when possible.
- New asset analysis should remain mock until Phase 5 unless explicitly instructed.
- Vector/embedding search is reserved for Phase 2; do not silently fake real similarity search.

## Module Ownership Rules

- `backend/src/routes/api.js` should only mount sub-routers.
- New backend business logic must live in module service files.
- New frontend API calls must live under `frontend/src/api/`.
- `frontend/src/services/api.js` is a compatibility export layer.
- Do not call provider clients directly from business services; use `model-provider.service.js`.
- Do not store new AssetSlice records inside Asset; use `asset-slice.service.js`.
- Keep `materials` routes as compatibility aliases.
- Creation must support both `asset_first` and `storyboard_driven` input modes.
- Asset-first creation can be developed before the script/storyboard pipeline is complete.
- Do not directly read or write another module's JSON data files.

## Current Asset Library Direction

The current self-owned asset library supports:

- Uploading merchant assets through the existing `/materials` and `/assets` APIs.
- Deleting assets by either `id` or `assetId`, including best-effort deletion of local `/uploads/...` files and thumbnails.
- AI generated video assets only. AI image generation is intentionally disabled for now because the current account does not have Seedream access.
- Seedance text-to-video generation through Volcengine Ark, with mock fallback when `ARK_API_KEY` is absent.
- Async asset generation tasks with frontend polling: `queued`, `generating`, `downloading`, `indexed`, `ready`, `failed`.
- Compliance review records for AI generated assets.

Volcengine/Seed environment variables are loaded from the repository root `.env` and, for compatibility, `backend/.env`.

Required/optional variables:

```dotenv
ARK_API_KEY=...
ARK_BASE_URL=https://ark.cn-beijing.volces.com
SEEDANCE_ENDPOINT_ID=ep-...
SEEDANCE_MODEL=...
SEED_ENDPOINT_ID=ep-...
SEED_CLASSIFICATION_ENDPOINT_ID=ep-...
ARK_POLL_ATTEMPTS=24
ARK_POLL_INTERVAL_MS=5000
```

Notes:

- `SEEDANCE_ENDPOINT_ID` is preferred over `SEEDANCE_MODEL` because some Ark accounts must call custom endpoints rather than model IDs.
- `SEED_ENDPOINT_ID` is supported for Seed 2.0 prompt classification. `SEED_CLASSIFICATION_ENDPOINT_ID` is the clearer alias and takes precedence.
- Before Seedance video generation, the backend should classify/enrich the prompt using project context such as `productCategory`, `sellingPoints`, `targetAudience`, `tone`, and `style`.
- If Seed 2.0 classification fails, fallback to mock classification and continue video generation.
- Keep provider-specific Ark calls inside `backend/src/services/volcengine-ark.service.js`.
- Keep generation orchestration inside `backend/src/services/asset-generation.service.js`.

## Core Business Flow

```text
Project creation
-> Product/asset upload
-> Asset structured analysis
-> Script generation
-> Storyboard generation
-> Video generation task creation
-> Task progress display
-> Video preview
-> Export
```

P0 must keep this chain runnable even when AI and rendering are mocked.

## P0 Scope

P0 is mandatory and has priority over refactors:

- Project create/list/detail/edit/archive.
- Asset upload/list/detail/delete with structured mock analysis.
- Script generation, prompt refinement, version saving, version listing, and version selection for storyboard generation.
- Storyboard generation and per-scene editing.
- Generation task state machine compatible with `queued`, `running`, `completed`, `failed`.
- Mock/real local render progress, retry, preview URL, and export presets.
- README that matches actual commands.

## P1 Extension Points

Code should leave interfaces open for:

- Asset tags and embedding search.
- Intelligent editing agent.
- Scene-level editor.
- TTS, subtitles, BGM.
- Multi-language dubbing.
- Failure retry policy.
- Generation trace.
- Mock analytics dashboard.
- Asset slicing.
- Scene refresh without full re-render.

## P2 Ideas

- Multi-factor attribution.
- Agent orchestration.
- A/B generation.
- CI/CD.
- Observability.
- Advanced long-task UX.
- Compliance review flow.
- Comment-driven second creation.
- Viral video DNA extraction and reuse.
- Prompt marketplace.
- AIGC ad cold-start acceleration.

## Development Rules

- Read existing files before changing behavior.
- Make incremental changes that preserve the runnable flow.
- Keep data structures explicit and consistent across API/UI.
- Prefer small services over route-heavy business logic.
- Run available checks before handing off.
- If a command is missing or fails, report the real result.

## Handoff Notes For Future Agents

1. Start by reading this file, `DEVELOPMENT_GUIDE.md`, `README.md`, `package.json`, and backend services.
2. Verify the P0 flow from the browser before expanding scope.
3. Add real AI/video providers by implementing service adapters, not by changing UI workflow code.
4. Treat `backend/data`, `backend/uploads`, and `backend/outputs` as local mock/runtime state.
5. If dev requests hang up through Vite proxy, first check whether port `4000` is occupied by an old Node process and whether `nodemon` is watching runtime directories.
6. Keep final summaries concrete: changed files, checks run, remaining gaps.
