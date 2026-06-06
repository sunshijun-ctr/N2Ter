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
copy .env.example .env   # then fill in LLM keys (optional)
docker compose up --build
```

The stack runs `api`, `worker` (Celery), `postgres`, `redis`, and a `chroma`
server. Notes:

- **Build context is the repo root** so the image includes `backend/` plus
  `db/ddl.sql` (replayed by the first Alembic migration).
- The `api` container **runs `alembic upgrade head` on start**, so the schema is
  created automatically.
- Images install the `[pdf,vector]` extras and WeasyPrint's GTK native libs +
  `fonts-noto-cjk`, so **PDF export and vector retrieval work in-container**.
- The app talks to the **Chroma server** via `CHROMA_HOST=chroma` (HTTP client);
  data persists in the `chroma_data` volume. Uploads/exports persist in
  `app_storage`.
- `ASYNC_TASKS_ENABLED` defaults to `true` in compose (a worker is present).
- LLM/embedding/rerank credentials come from `docker/.env` via `${VAR}`
  substitution; leave `LLM_API_KEY` empty to run in fallback mode.

## AI Pipeline

The backend works fully offline with deterministic fallbacks, and upgrades to
real AI behaviour the moment an LLM endpoint is configured — no code changes.

| Capability | Disabled (no key) | Enabled |
|------------|-------------------|---------|
| Preprocessing (`run_preprocess`) | regex summaries + paragraph split | LLM summary / scene segmentation / character arcs / foreshadowing / genre + vectorisation + auto overview |
| Episode generation (`generate_episode`) | deterministic template | LLM screenplay against the target schema |
| Overview (Stage 6) | template from chapter summaries | LLM overview document |
| Retrieval (`chapter_search`) | SQL substring search | embedding + Chroma + rerank |
| Conversation (websocket) | echo | tool-calling agent loop over the 7 registered tools |

### Enable real AI

Set these in `.env` (OpenAI-compatible Chat Completions):

```
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```

Embedding (`/embeddings`) reuses the LLM credentials unless overridden with
`EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL`. Rerank is enabled
with `RERANK_URL`. Vector search needs the optional dependency:

```powershell
E:\miniconda3\envs\N2Ter\python.exe -m pip install -e ".[vector]"
```

### Celery worker

```powershell
cd backend
E:\miniconda3\envs\N2Ter\python.exe -m celery -A app.workers.celery_app worker -l info
```

Tasks: `preprocess_novel`, `generate_episode`, `export_screenplay`.

### Export (YAML / PDF / ZIP)

`POST /screenplays/{id}/export` with `export_format` = `yaml`, `pdf`, or `zip`
(ZIP bundles the YAML plus a PDF when available). PDF uses WeasyPrint with a
per-schema layout.

PDF needs WeasyPrint **and** its GTK native libraries. On Windows/conda:

```powershell
E:\miniconda3\envs\N2Ter\python.exe -m pip install -e ".[pdf]"
conda install -n N2Ter -c conda-forge pango
```

`app/pdf_runtime.py` auto-detects the conda `Library/bin`, wires the DLL search
path + fontconfig, and maps WeasyPrint's library names onto the conda filenames —
no admin rights or PATH changes needed. If the native libs are absent, PDF export
fails gracefully (ZIP still produces the YAML) and `pdf_exporter.available()`
returns `False`.

### Conversation auto-compression

When a conversation's active (un-compressed) messages exceed
`CONTEXT_WINDOW_TOKENS × COMPRESSION_TRIGGER_RATIO` (default `200000 × 0.6 =
120000` estimated tokens), it is auto-compressed on the next message: the
middle span (excluding the last `COMPRESSION_KEEP_RECENT` messages and any
pinned ones) is summarised into a `compressed_segment` and those messages are
flagged `is_compressed`. Summaries use the `summarizer_agent` LLM when
configured, else a deterministic fallback. Disable with
`AUTO_COMPRESS_ENABLED=false`.

### Conversation auto-title

After `AUTO_TITLE_AFTER_MESSAGES` (default 6 = 3 rounds), a conversation still
carrying the placeholder title `新对话` is auto-titled from its content — via a
cheap LLM call when configured, else the first user message. A user-supplied
title is never overwritten. Disable with `AUTO_TITLE_ENABLED=false`.

### Auto-pin key decisions

User messages containing a decision keyword (`确认方案`, `改编方案`, `集数`,
`风格`, `题材`, `切换 Schema` by default) are auto-pinned (`is_pinned=true`) so
compression never drops them. Configure via `PINNED_KEYWORDS`; disable with
`AUTO_PIN_ENABLED=false`.

### Synchronous vs. async execution

By default `POST /novels/{id}/preprocess`, `POST /episodes/{id}/generate`, and
`POST /screenplays/{id}/export` run inline and return a completed task/export.
Set `ASYNC_TASKS_ENABLED=true` (with a worker running) to dispatch them to Celery
and return a `pending` task/export instead (handy when PDF rendering is slow —
clients poll `GET /exports/{id}`). Track progress via:

- `GET /tasks/{task_id}` — task status / progress
- `GET /novels/{novel_id}/progress` — full progress-event log (polling)
- `WS /ws/novels/{novel_id}/progress` — live progress stream (replays existing
  events on connect, then tails new ones until completion)
