# API JSON examples

All example identities and records below are synthetic.

Employee headers: `X-Role: employee`, `X-Employee-Id: SYN_E001`.
HR headers: `X-Role: hr`, `X-Employee-Id: SYN_HR001`.
POST requests use `Content-Type: application/json`.

## GET /api/employees/SYN_E001

200 response:

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

## GET /api/employees/SYN_E001/recommendations

200 response with no `LLM_API_KEY`:

```json
{
  "employee_id": "SYN_E001",
  "status": "not_implemented",
  "source": "mock",
  "recommendations": [],
  "gaps": []
}
```

## POST /api/employees/SYN_E001/complete

Request:

```json
{"event_id": "SYN_EV001", "completion_id": "synthetic-request-001"}
```

501 response (skills are unchanged):

```json
{
  "employee_id": "SYN_E001",
  "event_id": "SYN_EV001",
  "completion_id": "synthetic-request-001",
  "status": "not_implemented",
  "skills": {"SK_PYTHON": 1, "SK_SQL": 1, "SK_API": 0, "SK_TEAMWORK": 2}
}
```

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

501 response (nothing is imported):

```json
{
  "status": "not_implemented",
  "employees_received": 1,
  "history_received": 1,
  "employees_imported": 0,
  "history_imported": 0
}
```

## GET /api/hr/summary

HR-only 200 response:

```json
{
  "status": "not_implemented",
  "total_employees": null,
  "total_events": null,
  "completed_activities": null,
  "employees_by_grade": null
}
```

## GET /api/employees

HR-only 200 response: `{"employees": [Employee, ...], "total": 10}` for the
default fixtures. Each item uses the complete Employee shape shown above.

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
