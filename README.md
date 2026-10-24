# StudyFlow - Student Task Manager

A small full-stack academic task manager based on the project synopsis. Students can register, log in, create and manage academic tasks, sort their work by priority/deadline, and monitor pending, completed, overdue, and upcoming work.

## Stack

- Frontend: React, Vite, HTML, CSS, JavaScript
- Backend: Node.js, Express, REST API
- Database: PostgreSQL (`pg`)
- Authentication: bcrypt password hashes checked against the `users` table on each API request; credentials stay in the current browser tab

The project includes GitHub Actions checks, Cloudflare Pages deployment for the frontend, and backend container publishing to GitHub Container Registry.

## Features

- Account registration and sign-in
- Per-user task isolation
- Create, edit, delete, and track tasks as pending, completed, or overdue
- Subject, notes, date and time deadlines, priority, and recurrence (daily, weekly, monthly, yearly)
- Recurring task occurrences are stored through a rolling 90-day horizon and extended by the backend
- Frontend calendar and task history/activity views
- Dashboard counts, completion rate, on-time completion streak, upcoming deadlines, and overdue identification
- Optional in-app priority reminders: high (24 hours and 1 hour), medium (12 hours and 1 hour), and low (1 hour)
- Notification bell with task preferences and notification events persisted in PostgreSQL
- Search, priority filter, and status filter
- Backend startup does not create or alter database tables

## Run locally

### 1. Create a PostgreSQL database

Create a database named `student_tasks` in your local PostgreSQL installation (or use any database you already have access to).

### 2. Configure environment files

Create `backend/.env` with `PORT`, `DATABASE_URL`, `DATABASE_SSL`, and `CLIENT_URL`. Set `DATABASE_URL` to your PostgreSQL connection string.

Create `frontend/.env` with `VITE_PORT` and `VITE_API_URL`. For local development, use `VITE_API_URL=http://localhost:5001/api`.

### 3. Update the Supabase schema

Run [`supabase/notifications_persistence.sql`](supabase/notifications_persistence.sql) manually in the Supabase SQL Editor to ensure `tasks.notify_me` exists and create the in-app notification history table. The backend never reads or runs these files and does not create or alter tables on startup.

If legacy email or push notification tables were previously configured, run [`supabase/remove_notifications.sql`](supabase/remove_notifications.sql) once to remove those old tables. It does not remove the active `task_notifications` table.


### 4. Install and run

```powershell
cd student-task-manager
npm install
npm run dev
```

Open `http://localhost:5174`. The API health endpoint is `http://localhost:5001/api/health`.

## Run in containers

Docker Desktop must be running. Make sure `backend/.env` has the database connection and runtime settings from the previous section, then run from the project root:

```powershell
docker compose up --build
```

Open `http://localhost:5174`; check the backend at `http://localhost:5001/api/health`. Compose waits for the backend health check before starting the frontend. Stop the containers with `Ctrl+C`, or run `docker compose down` in another terminal.

The frontend container is an Nginx static site with SPA route fallback. Its API URL is baked into the frontend image at build time. Override it when building for a hosted backend:

```powershell
$env:VITE_API_URL = "https://your-backend-host/api"
docker compose build frontend
docker compose up
```

## API overview

| Route | Purpose |
| --- | --- |
| `POST /api/auth/register` | Create account |
| `POST /api/auth/login` | Sign in |
| `GET /api/auth/me` | Current user |
| `GET /api/tasks` | List user tasks; supports `status`, `priority`, `subject`, `search` |
| `POST /api/tasks` | Create task |
| `PUT /api/tasks/:id` | Update task |
| `PATCH /api/tasks/:id/status` | Set a task to pending or completed |
| `DELETE /api/tasks/:id` | Delete task |
| `GET /api/tasks/history` | Current task statuses and recent task activity |
| `GET /api/dashboard` | Task metrics and upcoming work |
| `GET /api/notifications` | List the signed-in user's notification history |
| `POST /api/notifications` | Save a notification event once |

The calendar is rendered in the frontend from the normal task list; it does not use a dedicated calendar API.

## Demo tests

Run the backend Jest and Supertest demo checks from the project root:

```powershell
npm test
```

The suite checks the API health route, authentication protection on task routes, and basic task validation. It does not connect to Supabase or modify database data.

## CI/CD setup

The workflow in `.github/workflows/ci-cd.yml` runs `npm ci`, backend tests, and the frontend production build for pull requests and pushes to `main` or `master`. On those branch pushes, it deploys the frontend to Cloudflare Pages when configured and publishes the backend container image to GHCR. It can also call an optional backend hosting deploy hook.

To verify CI, push a branch and open a pull request in GitHub, then open **Actions → CI and CD**. The **Test and build** job must pass before merging. A push to `main` or `master` then runs the deployment jobs. Check the job logs for a Cloudflare Pages deployment URL and the GHCR image tag. The deploy jobs require the variables and secrets listed below.

Configure these GitHub repository variables for Pages deployment:

- `VITE_API_URL`: Public backend API URL ending in `/api`.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.
- `CLOUDFLARE_PAGES_PROJECT_NAME`: Existing Pages project name.

Add a `CLOUDFLARE_API_TOKEN` repository secret with permission to deploy Pages. Optionally add `BACKEND_DEPLOY_HOOK_URL` as a secret if your backend host provides a deployment webhook. Without a hook, the workflow publishes `ghcr.io/<owner>/<repository>/task-manager-api:latest`; configure your Node/container host to run that image with `DATABASE_URL`, `DATABASE_SSL`, and `CLIENT_URL`.

The backend image requires `DATABASE_URL`, `DATABASE_SSL`, and `CLIENT_URL` at runtime. The Pages build uses `VITE_API_URL` so the browser calls the hosted backend instead of localhost.
