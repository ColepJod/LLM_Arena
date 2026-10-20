# Model Arena

Model Arena is a side-by-side LLM comparison app. Pick two free models, enter
one prompt, and watch both answers stream live in parallel.

A FastAPI backend runs both model calls concurrently and merges their output
into a single NDJSON response. A Next.js frontend parses that stream, keeps
each pane independent, and renders metrics, errors, and cancellations as they
happen.

```
Browser
  │
  ├── GET /providers, GET /models
  └── POST /compare ── NDJSON stream ──┐
                                      │
                              FastAPI backend
                                ├── Groq
                                ├── OpenRouter
                                └── Gemini
```

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/routes/       # providers, models, compare
│   │   ├── core/             # settings, logging, rate limiting
│   │   ├── schemas/          # request and event models
│   │   └── services/         # catalog, LLM factory, stream merge
│   ├── tests/
│   │   ├── fake_app.py       # test-only streaming server
│   │   └── test_*.py
│   ├── .env.example
│   └── pyproject.toml
├── frontend/
│   ├── app/                  # Next.js App Router entry point
│   ├── components/           # arena shell, pickers, response panels
│   ├── hooks/useCompare.ts   # custom NDJSON stream state
│   ├── lib/                  # API client and NDJSON parser
│   ├── types/
│   └── .env.example
└── README.md
```

## Requirements

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Node.js 22+
- npm
- At least one API key from [Groq](https://console.groq.com/keys),
  [OpenRouter](https://openrouter.ai/keys), or
  [Google AI Studio](https://aistudio.google.com/apikey)

## Setup

### Backend

```bash
cd backend
uv sync
cp .env.example .env
```

Add the API keys you have to `backend/.env`:

```dotenv
GROQ_API_KEY=
OPENROUTER_API_KEY=
GEMINI_API_KEY=
ALLOWED_ORIGINS=http://localhost:3000
OPENROUTER_SITE_URL=
OPENROUTER_APP_NAME=Model Arena
```

Providers without a key stay disabled in the UI. A comparison can still start
if one pane is unavailable; that pane receives an error while the other pane
continues streaming.

Start the API:

```bash
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`NEXT_PUBLIC_API_URL` defaults to `http://localhost:8000`. To point the browser
at another backend, set it in `frontend/.env.local` and restart the dev server.

## Environment Variables

### Backend

| Variable              | Required | Description                                                        |
| --------------------- | -------- | ------------------------------------------------------------------ |
| `GROQ_API_KEY`        | No       | Enables Groq models.                                               |
| `OPENROUTER_API_KEY`  | No       | Enables OpenRouter free models.                                    |
| `GEMINI_API_KEY`      | No       | Enables Gemini models.                                             |
| `ALLOWED_ORIGINS`     | No       | Comma-separated CORS origins. Defaults to `http://localhost:3000`. |
| `OPENROUTER_SITE_URL` | No       | Optional OpenRouter `HTTP-Referer` header.                         |
| `OPENROUTER_APP_NAME` | No       | Optional OpenRouter `X-Title` header.                              |

### Frontend

| Variable              | Required | Description                                |
| --------------------- | -------- | ------------------------------------------ |
| `NEXT_PUBLIC_API_URL` | No       | Backend base URL. Defaults to port `8000`. |

## API

### `GET /providers`

Returns provider availability and display names.

```json
{
  "providers": [
    {
      "id": "groq",
      "name": "Groq",
      "available": true
    },
    {
      "id": "openrouter",
      "name": "OpenRouter",
      "available": false
    }
  ]
}
```

### `GET /models?provider=groq`

Returns the curated model catalog for one provider.

```json
{
  "provider": "groq",
  "models": [
    {
      "id": "openai/gpt-oss-120b",
      "name": "GPT-OSS 120B"
    }
  ]
}
```

### `POST /compare`

Request:

```json
{
  "prompt": "Explain recursion with a small example.",
  "a": { "provider": "groq", "model": "openai/gpt-oss-120b" },
  "b": { "provider": "gemini", "model": "gemini-3.8-flash" }
}
```

Response content type is `application/x-ndjson`. Each line is one event:

```text
{"side":"a","type":"start"}
{"side":"b","type":"start"}
{"side":"a","type":"delta","text":"Recursion is "}
{"side":"b","type":"delta","text":"A recursive "}
{"side":"a","type":"done","ttft_ms":420,"total_ms":3810,"output_chars":842}
{"side":"b","type":"error","message":"Rate limit reached for this model."}
```

The backend starts both sides concurrently, emits events as tokens arrive, and
isolates failures with a per-side `error` event. One failed model never stops
the other.

`ttft_ms` is the time from side start to the first visible token. `total_ms`
includes the full generation. Token counts are approximate and calculated by
the frontend from the streamed text.

## Models

The catalog is intentionally small and curated in
`backend/app/services/catalog.py`. It currently contains free models from Groq,
OpenRouter, and Gemini.

Model IDs were checked against provider documentation on **2026-10-20**. Free
model availability can change. If a provider retires a model, update the
catalog entry and the catalog tests together.

## Behavior

- **Single-turn only.** No chat history, accounts, database, or saved prompts.
- **No AI SDK `useChat`.** The frontend parses NDJSON with a custom hook.
- **Same model allowed.** Both panes can select the same provider and model.
- **Turn selection is saved.** Provider and model choices persist in
  `localStorage`; prompts and responses are not saved.
- **Both streams cancel.** Stop or clearing the arena aborts the HTTP request
  and cancels both upstream tasks.
- **Thinking blocks are hidden.** Qwen-style `<think>...</think>` reasoning blocks
  are filtered out before deltas reach the browser.
- **Rate limiting is in memory.** The default is 10 compare requests per minute
  per client IP. This resets when the backend restarts and is not suitable for
  multi-process deployments.
- **Errors are safe.** Upstream error details and API keys are not sent to the
  browser or written to logs.

## Quality Checks

Backend:

```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy app
```

Frontend:

```bash
cd frontend
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Testing Without Real API Keys

`backend/tests/fake_app.py` is a test-only FastAPI app that streams fake tokens
and can fail one side on purpose. Start it instead of the real backend:

```bash
cd backend
$env:GROQ_API_KEY="fake-groq"
$env:GEMINI_API_KEY="fake-gemini"
uv run uvicorn tests.fake_app:app --port 8000 --reload
```

The frontend can then exercise loading, streaming, per-side errors, stop, and
clear without making provider calls. The fake app is not part of the production
application.

## Future Extensions

- Compare three or more models at once.
- Add conversation history.
- Add response voting and a leaderboard.
- Create shareable comparison links.
- Use an LLM judge to score both answers automatically.

## Out of Scope

This project does not include Docker, Kubernetes, deployment manifests,
authentication, billing, or persistent storage. It is designed to run locally
as a focused comparison tool.
