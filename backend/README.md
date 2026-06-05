# N2Ter Backend

FastAPI backend scaffold for the AI novel-to-screenplay tool.

## Run Locally

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

API health check: `GET /health`

## Docker

```powershell
cd backend\docker
docker compose up --build
```
