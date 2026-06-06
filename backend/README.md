# N2Ter Backend

FastAPI backend scaffold for the AI novel-to-screenplay tool.

## Run Locally

```powershell
cd backend
E:\miniconda3\envs\N2Ter\python.exe -m pip install -e ".[dev]"
E:\miniconda3\envs\N2Ter\python.exe -m uvicorn app.main:app --reload
```

API health check: `GET /health`

## Database

The first migration reuses `../db/ddl.sql`.
The Docker PostgreSQL service is published on local port `55432` to avoid
colliding with a locally installed PostgreSQL on `5432`.

```powershell
cd backend
E:\miniconda3\envs\N2Ter\python.exe -m alembic upgrade head
```

## Docker

```powershell
cd backend\docker
docker compose up --build
```
