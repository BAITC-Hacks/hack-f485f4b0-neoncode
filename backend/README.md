# Career Quest backend foundation

Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.x and SQLite. The active backend
lives in `backend/app/`. The older `career-quest-backend/` scaffold is not used.

## Run

From `backend/`:

```sh
uv sync --locked
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Swagger: <http://127.0.0.1:8000/docs>. CORS allows the Next.js development origins `http://localhost:3000` and
`http://127.0.0.1:3000`.

Configuration uses environment variables (see `.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATA_DIR` | `backend/data/synthetic` (absolute) | Dataset directory |
| `DATABASE_URL` | SQLite `backend/career_quest.db` (absolute) | Database location |
| `LLM_API_KEY` | Unset | `source=mock`; when set, `source=fallback` in this scaffold |

Relative environment paths resolve against the working directory. `.env` is not
loaded automatically; use `uv run --env-file .env uvicorn app.main:app` if needed.
Next-grade gaps and event completion are implemented. LLM calls, ranking, import
and HR aggregation remain stubs.

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
Missing employee skills remain absent in profiles and count as level zero when
calculating gaps or applying event gains.

SQLAlchemy creates employees, employee_skills, skills, grade_requirements, events,
activity_history and completions tables. Foreign keys are enabled. Completions
have the unique key `(employee_id, event_id, completion_id)` and store the response
for exact replay. Completion applies skill changes, appends a completed history
record and saves the response in one transaction. SQLite `BEGIN IMMEDIATE` locks
before any reads so concurrent completions cannot double-apply or lose progress.

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
| GET | `/api/employees/{id}` | Self / HR | 200, profile, progress and history |
| GET | `/api/employees/{id}/recommendations` | Self / HR | 200, explicit stub, empty lists |
| POST | `/api/employees/{id}/complete` | Self / HR | 200, skill growth or saved response |
| POST | `/api/import` | HR | 501, validates employees + history, no writes |
| GET | `/api/hr/summary` | HR | 200, explicit stub, null metrics |
| GET | `/api/employees` | HR | 200, `{employees, total}` from SQLite |

Stubs return `status: not_implemented`. A configured key does not mean an LLM was
called: `source: fallback` is reserved for the future local scorer and results
remain empty. Missing headers return 401, forbidden access 403, missing records
404, and schema/header validation errors 422. Validation errors use FastAPI's
standard `HTTPValidationError`; other errors use `{detail: string}`.

### Grade progress

`GET /api/employees/{id}` extends the dataset Employee with `progress` and `history`.
The HR employee list and import Employee schema keep the dataset shape.
History is ordered by descending date, then record ID, and contains only this employee.

`progress.next_grade` is the nearest higher grade defined for the employee's role,
using `Junior`, `Middle`, `Senior`, `Lead` order. `requirements` contains its role
profile. `gaps` contains every required skill, including zero deficits, sorted by
descending `deficit`, then skill ID. Each deficit is `max(0, required - current)`.
`remaining_points` is their sum, not a number of events or months until promotion.

- `needs_development`: at least one requirement has a positive deficit.
- `requirements_met`: the next grade exists and all requirements are satisfied.
- `no_next_grade`: no higher grade is defined for this role; next grade and
  requirements are null, gaps are empty and remaining points are zero.

### Completion

Send `{"event_id": "SYN_EV001", "completion_id": "request-001"}`. The event must
exist and both the employee role and current grade must be in its audience.
An empty audience list matches nobody. An audience mismatch returns 400.
Eligibility here checks audience only, not prerequisites or scheduled dates.
For each event skill, growth is:

```text
new = min(5, max(current, min(current + gain, max_level)))
```

The 200 response contains `skills_before`, `skills_after`, and `progress_after`
with next-grade requirements, deficits and remaining points. Grade never changes
automatically, including when all requirements are met.

Reusing the same employee/event/completion key returns the original response,
including its original snapshots and `status: completed`, even after subsequent
progress. It adds no history and applies no gains. A new completion ID represents
a new completion; event repeat restrictions are not part of this endpoint yet.
A legacy completion without a saved response returns 409 without applying gains.

See [JSON examples](docs/examples.md) and [exported OpenAPI](docs/openapi.json).

## Verification and OpenAPI export

```sh
uv run python -m scripts.export_openapi
uv run pytest -q
uv run ruff check app scripts tests
uv run ruff format --check app scripts tests
```

OpenAPI export does not start the app, read the dataset, or create a database.
Tests use temporary databases and check authorization, validation, CORS,
startup seeding, rollback, completion uniqueness and replay, concurrent completions,
gain caps, grade progress, import stub immutability, and OpenAPI consistency.
