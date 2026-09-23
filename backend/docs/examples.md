# API JSON examples

All example identities and records below are synthetic.

Employee headers: `X-Role: employee`, `X-Employee-Id: SYN_E001`.
HR headers: `X-Role: hr`, `X-Employee-Id: SYN_HR001`.
POST requests use `Content-Type: application/json`.

## GET /api/employees/SYN_E001

200 response excerpt (profile fields shown; `progress` and `history` follow below):

```json
{
  "synthetic": true,
  "employee_id": "SYN_E001",
  "role": "Backend Engineer",
  "grade": "Junior",
  "tenure_months": 2,
  "skills": {"SK_PYTHON": 1, "SK_SQL": 1, "SK_API": 0, "SK_TEAMWORK": 2},
  "full_name": "Synthetic Employee 01",
  "department": null,
  "manager_id": null,
  "hire_date": null,
  "work_format": null,
  "preferred_language": null,
  "career_goal": null,
  "last_review_date": null
}
```

The same response also contains:

```json
{
  "progress": {
    "status": "needs_development",
    "next_grade": "Middle",
    "requirements": {
      "role": "Backend Engineer",
      "grade": "Middle",
      "required_skills": {"SK_PYTHON": 3, "SK_SQL": 2, "SK_API": 2, "SK_TESTING": 2},
      "critical_skills": ["SK_PYTHON", "SK_API"],
      "synthetic": true
    },
    "gaps": [
      {"skill_id": "SK_API", "current_level": 0, "required_level": 2, "deficit": 2},
      {"skill_id": "SK_PYTHON", "current_level": 1, "required_level": 3, "deficit": 2},
      {"skill_id": "SK_TESTING", "current_level": 0, "required_level": 2, "deficit": 2},
      {"skill_id": "SK_SQL", "current_level": 1, "required_level": 2, "deficit": 1}
    ],
    "remaining_points": 7
  },
  "history": [
    {
      "synthetic": true,
      "employee_id": "SYN_E001",
      "event_id": "SYN_EV001",
      "date": "2026-09-01",
      "status": "in_progress",
      "record_id": "SYN_R011",
      "due_date": null,
      "completion_pct": 35,
      "score": null,
      "feedback_rating": null,
      "assigned_by": "self"
    },
    {
      "synthetic": true,
      "employee_id": "SYN_E001",
      "event_id": "SYN_EV007",
      "date": "2026-08-01",
      "status": "completed",
      "record_id": "SYN_R001",
      "due_date": "2026-08-15",
      "completion_pct": 100,
      "score": 90,
      "feedback_rating": 4,
      "assigned_by": "hr"
    }
  ]
}
```

## GET /api/employees/SYN_E001/recommendations

With no `LLM_API_KEY`, the endpoint returns `source: fallback`, `status: ready`,
`next_grade: Middle`, calculated gaps, and 2 recommendations for the initial
SYN_E001 fixture: SYN_EV001 (score 22.240259), then SYN_EV002 (score 19.512987).
Each recommendation contains `event`, `score`, `factors`, 4 factual `reasons`, and
their combined `explanation`. See [the complete scoring contract](recommendations.md).

For a Lead employee without a next-grade requirement, the response is:

```json
{
  "employee_id": "SYN_E005",
  "status": "no_suitable_event",
  "source": "fallback",
  "next_grade": null,
  "recommendations": [],
  "gaps": []
}
```

## POST /api/employees/SYN_E001/complete

Request:

```json
{"event_id": "SYN_EV001", "completion_id": "synthetic-request-001"}
```

200 response for a fresh synthetic database:

```json
{
  "employee_id": "SYN_E001",
  "event_id": "SYN_EV001",
  "completion_id": "synthetic-request-001",
  "status": "completed",
  "skills_before": {"SK_PYTHON": 1, "SK_SQL": 1, "SK_API": 0, "SK_TEAMWORK": 2},
  "skills_after": {"SK_PYTHON": 2, "SK_SQL": 1, "SK_API": 0, "SK_TEAMWORK": 2},
  "progress_after": {
    "status": "needs_development",
    "next_grade": "Middle",
    "requirements": {
      "role": "Backend Engineer",
      "grade": "Middle",
      "required_skills": {"SK_PYTHON": 3, "SK_SQL": 2, "SK_API": 2, "SK_TESTING": 2},
      "critical_skills": ["SK_PYTHON", "SK_API"],
      "synthetic": true
    },
    "gaps": [
      {"skill_id": "SK_API", "current_level": 0, "required_level": 2, "deficit": 2},
      {"skill_id": "SK_TESTING", "current_level": 0, "required_level": 2, "deficit": 2},
      {"skill_id": "SK_PYTHON", "current_level": 2, "required_level": 3, "deficit": 1},
      {"skill_id": "SK_SQL", "current_level": 1, "required_level": 2, "deficit": 1}
    ],
    "remaining_points": 6
  }
}
```

Repeat the exact request: the response stays identical and Python remains at 2.
GET the profile again to see the saved skill level and a new completed history row.
The employee's grade is still Junior. The remaining points measure skill deficits,
not a count of events. For a Lead profile, progress has `status: no_next_grade`.

## POST /api/import

HR request; `employees` contains dataset Employee records, `history` contains
JSON objects using the activity history CSV column names:

```json
{
  "meta": {"dataset": "Synthetic import example", "synthetic": true},
  "employees": [
    {
      "employee_id": "SYN_NEW",
      "role": "Backend Engineer",
      "grade": "Junior",
      "tenure_months": 0,
      "skills": {"SK_PYTHON": 1},
      "synthetic": true
    }
  ],
  "history": [
    {
      "record_id": "SYN_NEW_HISTORY",
      "employee_id": "SYN_NEW",
      "event_id": "SYN_EV001",
      "date": "2026-09-23",
      "status": "completed",
      "completion_pct": 100,
      "synthetic": true
    }
  ]
}
```

200 response for a first import:

```json
{
  "status": "imported",
  "employees_received": 1,
  "history_received": 1,
  "employees_imported": 1,
  "history_imported": 1,
  "employees_created": 1,
  "employees_updated": 0,
  "history_created": 1,
  "history_updated": 0
}
```

## GET /api/hr/summary

HR-only 200 response excerpt for the original fixtures (the full response also
contains `employees_by_grade`, `current_grade_skill_gaps`, `next_grade_skill_gaps`,
`employees_without_step` and `participation_by_event`):

```json
{
  "status": "ready",
  "total_employees": 10,
  "total_events": 8,
  "completed_activities": 6
}
```

## GET /api/employees

HR-only 200 response: `{"employees": [Employee, ...], "total": 10}` for the
default fixtures. Each item extends the Employee shape with `recommendation_status`
(`ready`, `requirements_met`, `no_suitable_event`) and `next_grade` (or null).
Employees are sorted by ID, not performance. See [HR and import guide](hr.md).

## Event and skill contracts

Canonical Event input example (dataset aliases are also accepted by the loader):

```json
{
  "event_id": "SYN_EV001",
  "type": "course",
  "audience": {"roles": ["Backend Engineer"], "grades": ["Junior"]},
  "skills": [{"skill_id": "SK_PYTHON", "gain": 1, "max_level": 3}],
  "synthetic": true
}
```

Grade requirements are stored separately from skill definitions, as in the dataset:

```json
{
  "role": "Backend Engineer",
  "grade": "Middle",
  "required_skills": {"SK_PYTHON": 3, "SK_SQL": 2},
  "critical_skills": ["SK_PYTHON"],
  "synthetic": true
}
```
