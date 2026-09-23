# Career Quest backend foundation

Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.x and SQLite. The active backend
lives in `backend/app/`. The older `career-quest-backend/` scaffold is not used.

## Run

From `backend/`:

```sh
uv sync --locked
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Swagger: <http://127.0.0.1:8000/docs>. CORS allows `http://localhost:5173`.

Configuration uses environment variables (see `.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATA_DIR` | `backend/data/synthetic` (absolute) | Dataset directory |
| `DATABASE_URL` | SQLite `backend/career_quest.db` (absolute) | Database location |
| `LLM_API_KEY` | Unset | Without a key: local scoring, `source=fallback` |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `LLM_MODEL` | `gpt-4o-mini` | Model used for candidate selection |

Relative environment paths resolve against the working directory. `.env` is not
loaded automatically; use `uv run --env-file .env uvicorn app.main:app` if needed.
Recommendations include next-grade gap calculation, fallback scoring and optional
validated LLM selection. Completion, import and HR aggregation remain stubs in
this checkout.

## Data and persistence

Startup reads `employees.json`, `events.json`, `skills.json` and
`activity_history.csv` from `DATA_DIR`. JSON files use dataset envelopes with
`meta` plus `employees`, `events`, or `skills`/`role_profiles`. Optional dataset
fields are preserved. CSV empty optional values are converted to null.

Event input accepts dataset fields `target_roles`, `target_grades`,
`develops_skills`; the API uses `audience: {roles, grades}` and
`skills: [{skill_id, gain, max_level}]`. Skill levels are integers from 0 to 5.

The default fixtures are explicitly synthetic: 10 employees, 8 events, 15 skills,
8 role/grade profiles and 12 history rows. Each record has `synthetic: true`.
Missing employee skills remain absent in profiles and count as zero in gap and
recommendation calculations.

SQLAlchemy creates employees, employee_skills, skills, grade_requirements, events,
activity_history and completions tables. Foreign keys are enabled. Completions
have the unique key `(employee_id, event_id, completion_id)` and a reserved response
column for future replay support. The completion endpoint does not yet write or
replay completions.

Loading validates schemas, duplicate IDs and references before writing. The seed
transaction only inserts missing IDs; repeated startup preserves existing data
and does not apply history to skills. Missing/invalid dataset files stop startup.
To switch datasets, use a separate `DATABASE_URL`; changing `DATA_DIR` does not
replace previously loaded records. There are no migrations in this foundation.

## API contract

Every `/api` request requires `X-Role: employee|hr` and `X-Employee-Id`.
Employees may access only their own ID; HR may access all employees and HR routes.
The HR header ID need not correspond to an employee record. These are trusted
development headers, not production authentication; a trusted authentication
layer must supply them before external deployment.

| Method | Path | Access | Current behavior |
| --- | --- | --- | --- |
| GET | `/api/employees/{id}` | Self / HR | 200, Employee from SQLite |
| GET | `/api/employees/{id}/recommendations` | Self / HR | 200, scored recommendations or explicit empty state |
| POST | `/api/employees/{id}/complete` | Self / HR | 501, explicit stub, no writes |
| POST | `/api/import` | HR | 501, validates employees + history, no writes |
| GET | `/api/hr/summary` | HR | 200, explicit stub, null metrics |
| GET | `/api/employees` | HR | 200, `{employees, total}` from SQLite |

Stubs return `status: not_implemented`. Recommendations return `source: fallback`
unless a valid LLM selection is used (`source: llm`). Missing headers return 401,
forbidden access 403, missing records
404, and schema/header validation errors 422. Validation errors use FastAPI's
standard `HTTPValidationError`; other errors use `{detail: string}`.

See [JSON examples](docs/examples.md) and [exported OpenAPI](docs/openapi.json).
See [recommendation scoring and LLM contract](docs/recommendations.md) for all
weights, eligibility rules, response states and explanation validation.

## Verification and OpenAPI export

```sh
uv run python -m scripts.export_openapi
uv run pytest -q
uv run ruff check app scripts tests
uv run ruff format --check app scripts tests
```

OpenAPI export does not start the app, read the dataset, or create a database.
Tests use temporary databases and check authorization, validation, CORS,
startup seeding, rollback, completion uniqueness, stub immutability, recommendation
ranking traps, LLM failure/timeout handling, and OpenAPI consistency. LLM tests use
mock HTTP transports and do not send dataset records to external services.
