# N2Ter

N2Ter 是一个 AI 小说转剧本工具，面向小说改编、短剧/影视剧本创作和 AI 视频脚本生产。系统支持上传小说、章节拆分、预处理分析、改编方案生成、剧本生成、多轮对话修改和导出。

## 项目流程

1. **上传小说**
   - 用户上传小说文本，并选择题材。
   - 后端保存原文，自动拆分章节，生成小说项目。

2. **预处理**
   - 对章节进行摘要、关键事件提取和场景切片。
   - 分析全书摘要、角色弧光、伏笔信息。
   - 对场景文本做向量化，写入 Chroma，供后续检索使用。
   - 自动生成一版概览剧本，让用户先看到整体改编效果。

3. **生成改编方案**
   - 根据小说章节生成集数规划。
   - 每集会记录来源章节、标题和剧情概述，作为后续生成剧本的基础。

4. **选择剧本 Schema**
   - `ai_video`：面向 AI 视频生成，强调镜头、画面、角色一致性。
   - `screenwriter`：面向编剧工作流，强调场景、动作、对白和可编辑性。
   - `overview`：面向快速浏览，保留核心冲突、角色和剧情结果。

5. **生成剧本**
   - 后端按集生成剧本内容。
   - 生成过程会结合章节原文、摘要、角色档案、前文记忆和检索结果。
   - 没有配置 LLM 时，系统会使用确定性 fallback，保证基础流程可运行。

6. **编辑与对话修改**
   - 用户可以直接编辑剧本内容。
   - 也可以通过对话让 Agent 查询章节、读取剧本、改写集数、更新剧本记忆。

7. **导出**
   - 支持导出 `YAML`、`PDF`、`DOCX` 和 `ZIP`。
   - `ZIP` 会打包结构化文件和可阅读文档，便于提交或二次加工。

## 技术栈

- 前端：React、Vite、TypeScript、Tailwind CSS
- 后端：FastAPI、SQLAlchemy、Alembic
- 数据库：PostgreSQL
- 异步任务：Redis、Celery
- 向量库：Chroma
- AI 接入：OpenAI-compatible Chat Completions、Embeddings、可选 Rerank
- 导出：YAML、WeasyPrint PDF、python-docx

## Docker 部署

推荐使用 Docker Compose 一键启动完整后端依赖，包括 API、Worker、PostgreSQL、Redis 和 Chroma。

### 1. 准备环境变量

进入后端 Docker 目录：

```powershell
cd backend\docker
```

如果没有 `.env`，复制示例文件后填写：

```powershell
copy .env.example .env
```

关键配置：

```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=
LLM_MODEL=gpt-4o-mini

EMBEDDING_BASE_URL=
EMBEDDING_API_KEY=
EMBEDDING_MODEL=bge-m3

RERANK_URL=
RERANK_API_KEY=
ASYNC_TASKS_ENABLED=true
```

`LLM_API_KEY` 为空时，系统会进入 fallback 模式，不调用外部 AI，但上传、预处理、生成、导出等主流程仍可演示。

### 2. 启动后端服务

开发模式启动，带热更新：

```powershell
docker compose up --build
```

生产风格启动，不加载 override：

```powershell
docker compose -f docker-compose.yml up -d --build
```

启动后可访问：

- API 文档：http://localhost:8000/docs
- 健康检查：http://localhost:8000/health
- PostgreSQL：localhost:55432
- Chroma：localhost:8001

API 容器启动时会自动执行 Alembic 迁移。

### 3. 启动前端

另开终端：

```powershell
cd frontend
npm install
npm run dev
```

默认访问：

```text
http://localhost:5173
```

## 本地开发部署

不使用 Docker 时，需要本机已有 PostgreSQL、Redis，并按需启动 Chroma。

### 后端

```powershell
cd backend
E:\miniconda3\envs\N2Ter\python.exe -m pip install -e ".[dev,pdf,vector]"
E:\miniconda3\envs\N2Ter\python.exe -m alembic upgrade head
E:\miniconda3\envs\N2Ter\python.exe -m uvicorn app.main:app --reload
```

如果要启用异步任务，再启动 Celery Worker：

```powershell
cd backend
E:\miniconda3\envs\N2Ter\python.exe -m celery -A app.workers.celery_app worker -l info
```

### 前端

```powershell
cd frontend
npm install
npm run dev
```

## 验证方式

后端测试：

```powershell
cd backend
E:\miniconda3\envs\N2Ter\python.exe -m pytest
```

前端构建：

```powershell
cd frontend
npm run build
```

基础接口验证：

```powershell
curl http://localhost:8000/health
```

返回 `status: ok` 即表示 API 服务正常。

## 注意事项

- 不要提交真实 `.env`、API Key、数据库密码等敏感信息。
- Docker Compose 默认包含 Worker，建议 `ASYNC_TASKS_ENABLED=true`。
- PDF 导出依赖 WeasyPrint 及系统字体/原生库；Docker 镜像中已安装相关依赖。
- 本地 Windows/Conda 环境如需 PDF 导出，可按 `backend/README.md` 中说明安装 `pango`。
