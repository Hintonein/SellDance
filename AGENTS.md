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
- AI orchestration: centralized mock services.
- Video rendering: local FFmpeg pipeline with mock orchestration.
- Persistence: local JSON files under `backend/data`.

Do not introduce dependencies that require complex external configuration. Real AI/video providers must be added behind service adapters rather than hard-coded into routes or React components.

## Architecture Constraints

- Keep frontend and backend separated.
- Keep backend route, service, and persistence responsibilities separated.
- Keep mock AI/video logic centralized in backend services.
- Keep API access centralized in `frontend/src/services/api.js`.
- Preserve existing runnable behavior when adding P1/P2 features.
- Avoid scattering mock data in React components.

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

1. Start by reading this file, `README.md`, `package.json`, and backend services.
2. Verify the P0 flow from the browser before expanding scope.
3. Add real AI/video providers by replacing service adapters, not by changing UI workflow code.
4. Treat `backend/data` and `backend/uploads` as local mock/runtime state.
5. Keep final summaries concrete: changed files, checks run, remaining gaps.
