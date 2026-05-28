# SellDance

A maintainable starter platform for AI-generated e-commerce product videos.

This repository includes a full-stack implementation designed for TikTok Shop and online sellers. It keeps mock AI script/storyboard generation, while using a real local FFmpeg pipeline to render downloadable MP4 exports.

## Features in this starter

- **Product material management**: upload and organize product images, videos, and reference assets.
- **AI script generation (mock)**: create sales scripts from product info, selling points, target audience, and marketing style.
- **Storyboard generation (mock)**: split script into scenes and match scenes with uploaded assets.
- **Video creation workflow**: scene-level asset assignment, subtitle burn-in, optional background music, real MP4 export, preview, and download.
- **Task management**: queued/processing/rendering/completed/failed statuses, progress updates, retry support, and error messages.
- **UI pages**:
  - Project creation
  - Material upload
  - Script editing
  - Storyboard editing
  - Video preview/generation
  - Generation history

## Tech stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Persistence**: local JSON files (mock storage, no external DB required)

## Project structure

```text
SellDance/
├─ backend/
│  ├─ src/
│  │  ├─ routes/          # REST API routes
│  │  ├─ services/        # mock AI/video/business services
│  │  └─ config/          # path/configuration helpers
│  ├─ data/
│  │  ├─ assets/          # uploaded material metadata
│  │  ├─ scripts/         # generated/edited scripts
│  │  ├─ storyboards/     # generated/edited storyboard scenes
│  │  ├─ generation-tasks/# render task status and history
│  │  └─ projects/        # project records
│  └─ uploads/            # uploaded files (local only)
├─ frontend/
│  └─ src/
│     ├─ pages/           # page-level UI modules
│     ├─ components/      # shared UI components
│     └─ services/        # API client layer
└─ package.json           # workspace-level run scripts
```

## Getting started

### 0) Install FFmpeg (required)

Verify FFmpeg is available:

```bash
ffmpeg -version
```

If missing, install it:

- macOS (Homebrew): `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt-get update && sudo apt-get install -y ffmpeg`
- Windows (winget): `winget install Gyan.FFmpeg`

### 1) Install dependencies

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

### 2) Run both frontend and backend

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`

### 3) Build frontend

```bash
npm run build
```

## Validation commands

```bash
npm run lint
npm run build
npm run test
```

## API overview

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId/materials`
- `POST /api/projects/:projectId/materials`
- `GET /api/projects/:projectId/script`
- `POST /api/projects/:projectId/script/generate`
- `PUT /api/projects/:projectId/script`
- `GET /api/projects/:projectId/storyboard`
- `POST /api/projects/:projectId/storyboard/generate`
- `PUT /api/projects/:projectId/storyboard`
- `GET /api/projects/:projectId/video-tasks`
- `POST /api/projects/:projectId/video-tasks`
- `POST /api/video-tasks/:taskId/retry`

`GET /api/video-tasks/:taskId` returns full task details including:

- `status` (`queued`, `processing`, `rendering`, `completed`, `failed`)
- `progress` (0-100)
- `errorMessage`
- `videoUrl` (final MP4 URL when completed)
- `exportFile` (stored path under `backend/outputs/<projectId>/`)

## P0 demo flow (end-to-end)

1. Create a project in **Project creation**.
2. Upload at least one image or video in **Material upload** (optional: upload an audio file for BGM).
3. Generate and/or edit script in **Script editing**.
4. Generate storyboard in **Storyboard editing**.
5. Edit each scene:
   - `sceneOrder`
   - `durationSeconds`
   - `scriptText` / `subtitleText`
   - `layout` / `transition`
   - manually assigned `selectedAssetIds`
6. Save storyboard.
7. Open **Video preview & generation** and start generation.
8. Polling updates task status/progress automatically.
9. When completed, preview the rendered MP4 and download it.

## How to extend

- Replace mock script/storyboard services with real LLM providers.
- Replace local JSON storage with a real database and object storage.
- Replace the local FFmpeg renderer with a distributed render worker queue.
- Add authentication/authorization for multi-user teams.
- Add automated tests for API flows and UI components.
