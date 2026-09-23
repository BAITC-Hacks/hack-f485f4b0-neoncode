# HR endpoints and import

All three HR endpoints require `X-Role: hr` and a nonempty `X-Employee-Id`, for
example `SYN_HR001`. The employee role receives 403, including for file uploads.

## GET /api/hr/summary

The response contains aggregate metrics only; it does not rank or score employees.

- `current_grade_skill_gaps`: deficits against each employee's current role/grade.
- `next_grade_skill_gaps`: deficits against the next grade defined for that role.
- `employees_without_step.requirements_met`: employees who meet every next-grade requirement.
- `employees_without_step.no_suitable_event`: employees with no eligible useful event,
  including those with no defined next grade (`next_grade: null`).
- `participation_by_event`: participation counts for every catalog event, including zero counts.
- `total_employees`, `total_events`, `completed_activities`, `employees_by_grade`: overview counts.

For each skill, the response provides its ID/name, `employees_affected`,
`employees_assessed` (employees with a requirement for this skill), and `total_deficit`.
Only skills with positive deficits appear. Missing employee skills count as zero.
Skill lists are sorted by affected-employee count descending, then skill ID.
Employee groups are sorted by employee ID and contain no employee scores.

Participation counts refer to history rows, not distinct employees:

| Field | Definition |
| --- | --- |
| `enrolled` | All participation records, including completed and unsuccessful participation |
| `completed` | `status=completed` |
| `missed` | `status=no_show` |
| `declined` | `status=declined` |
| `in_progress`, `dropped`, `overdue` | Corresponding dataset statuses |

The dataset has no separate `registered` status. `enrolled` therefore represents
all recorded participation, not just active enrollments. The other six counts
are mutually exclusive and sum to `enrolled`. Completions are not counted again
from the completions table.

## GET /api/employees

Returns `{employees, total}`. Each employee includes the dataset profile fields,
`grade`, `next_grade`, and `recommendation_status`: `ready`, `requirements_met`,
or `no_suitable_event`. Ordering is by employee ID, without performance rankings.

Both HR GET endpoints compute status using the existing recommendation rules
locally. They never call LLM, even when `LLM_API_KEY` is configured. Catalog and
participation data are loaded in batches rather than queried once per employee.

## POST /api/import

Choose `application/json` or `multipart/form-data` in Swagger's request body.

### JSON

Use the [three-profile synthetic example](import-example.json) as the request body.
Both `employees` and `history` arrays are required; either may be empty. `meta` is
optional. Employee fields match `employees.json`; history objects use the dataset
CSV column names, with JSON null for empty optional values.

```sh
curl -X POST http://127.0.0.1:8000/api/import \
  -H 'X-Role: hr' -H 'X-Employee-Id: SYN_HR001' \
  -H 'Content-Type: application/json' \
  --data-binary @docs/import-example.json
```

### Files

Upload both fields:

- `employees_file`: UTF-8 JSON, either `{meta, employees}` or an Employee array.
- `history_file`: UTF-8 `.csv` with dataset headers, or JSON `{meta, history}` or
  an ActivityHistory array. An empty array imports no history.

```sh
curl -X POST http://127.0.0.1:8000/api/import \
  -H 'X-Role: hr' -H 'X-Employee-Id: SYN_HR001' \
  -F 'employees_file=@data/synthetic/employees.json;type=application/json' \
  -F 'history_file=@data/synthetic/activity_history.csv;type=text/csv'
```

Each file has a 10 MiB limit. CSV requires `employee_id,event_id,date,status`;
optional dataset columns are accepted, and empty optional cells become null.
Synthetic metadata marks all records in its JSON document as synthetic. The CSV
can use a `synthetic` column, as the bundled fixtures do.

### Upsert and validation

Import validates all schemas and references before writing and commits the whole
batch in one SQLite transaction. Any validation or write error rolls everything
back. Roles/grades and skills must already exist in the loaded catalog; managers
and history employee references may point to existing employees or profiles in
the same batch. History event IDs must exist. Duplicate employee/history IDs in
one batch are rejected with field paths.

An existing `employee_id` replaces the full profile and its skill map. Omitted
optional fields reset to their defaults; omitted skills are removed, so import
is not a partial patch. History does not apply additional skill growth: the
supplied skills are the imported profile snapshot.

An existing `record_id` updates that history record. Its employee/event identity
cannot be reassigned. Without `record_id`, a deterministic content hash prevents
duplicates when exactly the same record is imported again; changing its content
creates a new record. Supply `record_id` when an existing participation must be
updated. History records omitted from an import are retained.

The 200 response reports received/imported counts and `employees_created`,
`employees_updated`, `history_created`, `history_updated`. Existing IDs count as
updated even if their content is identical. Retrying the same import does not
duplicate database records. Profiles and recommendations are available as soon
as the response is returned, without restart or background processing.

Errors use HTTP 422 with a path to each field, for example:

```json
{
  "detail": [
    {
      "loc": ["body", "employees", 1, "skills", "UNKNOWN_SKILL"],
      "msg": "Unknown skill_id",
      "type": "unknown_reference"
    }
  ]
}
```

Array indices are zero-based; `history[0]` corresponds to the first CSV data row.
Malformed multipart envelopes can return 400; oversized files return 413 and
unsupported request content types return 415.

## Quick manual checks

1. Import `docs/import-example.json` with HR headers: expect 3 created profiles.
2. GET `/api/employees`: the new IDs have a grade and recommendation status.
3. GET `/api/employees/SYN_DEMO_001/recommendations` with employee headers matching
   that ID. Without an LLM key, expect a ready fallback response immediately.
4. Import the same JSON again: expect 0 created, 3 updated, no duplicate employees.
5. Set a skill level to 6: expect 422 with its field path, without partial writes.
6. Switch `X-Role` to `employee` for HR endpoints: expect 403.

The performance regression test measures the import of three profiles plus three
fallback recommendation requests together, requiring a total below 2 seconds.
