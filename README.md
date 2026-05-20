# SellDance

A maintainable starter platform for AI-generated e-commerce product videos.

This repository includes a mock full-stack implementation designed for TikTok Shop and online sellers. It supports project setup, material upload, AI-style script/storyboard generation, and long-running video generation tasks with progress and retry handling.

## Features in this starter

- **Product material management**: upload and organize product images, videos, and reference assets.
- **AI script generation (mock)**: create sales scripts from product info, selling points, target audience, and marketing style.
- **Storyboard generation (mock)**: split script into scenes and match scenes with uploaded assets.
- **Video creation workflow**: subtitle/voiceover/background-music placeholders, scene preview, and export task flow.
- **Task management**: queued/in-progress/completed/failed task status, retry support, and error messages.
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

## How to extend

- Replace mock script/storyboard services with real LLM providers.
- Replace local JSON storage with a real database and object storage.
- Integrate true media rendering/transcoding pipelines for export.
- Add authentication/authorization for multi-user teams.
- Add automated tests for API flows and UI components.
