# Recommendations

`GET /api/employees/{id}/recommendations` requires the same identity headers as the
profile endpoint. Employees can only access their own recommendations; HR can
access any employee. Recommendations do not change skills or history.

## Candidate selection

The target is the nearest higher grade defined for the employee's current role,
using Junior, Middle, Senior, Lead order. For every required skill:

```text
deficit = max(0, required_level - current_level)
after = min(5, max(current_level, min(current_level + gain, max_level)))
effective_gain = after - current_level
covered_deficit = min(deficit, effective_gain)
```

Missing skills count as level zero. A candidate must cover at least one positive
deficit. A low-level skill unrelated to the target grade does not improve the score.
Gains beyond the requirement do not earn additional deficit credit.

Both role and current grade must be in the event audience. Mandatory events,
unmet prerequisites, and events completed in activity history or the completions
table are excluded. Empty audience lists match nobody. Completed identical events
are excluded regardless of whether the historical gain was reflected in skills.

## Explicit score

All components, weights, affected skills and intermediate counts are returned in
`recommendations[].factors`. Let `D` be the sum of all target-grade deficits and
`C` the deficit this event covers. A critical skill has importance 2; other
required skills have importance 1. `WD` and `WC` are the corresponding weighted
totals. `G` is the number of distinct grades in the eligible event's audience.

```text
deficit_score    = 100 * C / D
importance_score = 30 * WC / WD
grade_score       = 5 / G
history_penalty  = min(30, 10 * no_show_count + 15 * declined_count)
score            = deficit_score + importance_score + grade_score - history_penalty
```

Components and the total score are rounded to 6 decimal places. Explanations use
the same numeric component values as the response. Descending score determines
fallback order, with event ID as the stable tie-breaker. Return at most 3 events.

History includes only this employee's records. An event is similar when it shares
at least one developed skill with the candidate, including the candidate itself.
`no_show` and `declined` count participation records, not distinct events.
Other statuses do not add a penalty. A shared event type alone is not similarity.
The penalty is a factual score adjustment, not a judgment about motivation.
`similar_event_ids` makes the scope visible.

The grade component rewards a more focused audience after exact grade eligibility
has been checked. All candidates match the current grade; a one-grade audience
receives 5 points and a four-grade audience receives 1.25.

Every recommendation includes four templated `reasons` and an `explanation`:
current/next grade, covered deficit, concrete target requirements and gains,
and counts of similar-event no-shows/declines. Explanations make no personality
or motivation claims.

## Response states

| Status | Meaning |
| --- | --- |
| `ready` | 1 to 3 eligible recommendations |
| `requirements_met` | A next grade exists and every required skill level is met |
| `no_suitable_event` | Gaps exist but no eligible event helps, or no next grade is defined |

For the last case, `next_grade: null` distinguishes absence of a target grade.
Empty states return no recommendations and `source: fallback`, without calling LLM.
The `gaps` list includes zero deficits and is sorted by descending deficit, then ID.

Example state when every requirement is already satisfied (synthetic example):

```json
{
  "employee_id": "SYN_READY",
  "status": "requirements_met",
  "source": "fallback",
  "next_grade": "Senior",
  "recommendations": [],
  "gaps": [
    {"skill_id": "SYSTEM_DESIGN", "current_level": 4, "required_level": 4, "deficit": 0}
  ]
}
```

## Optional LLM

Set `LLM_API_KEY`, optionally `LLM_BASE_URL` and `LLM_MODEL`, then restart the API.
The base URL is an OpenAI-compatible `/v1` root; the client appends
`/chat/completions`. `.env` loading is explicit:

```sh
uv run --env-file .env uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Only recommendation requests use the external API. They send role, grade, tenure,
skills, target deficits, relevant participation history, and the top 8 candidates
with scores/factors. Names, employee IDs, managers, unrelated history and the full
dataset are not sent. Configure a key only for a provider permitted to process
these recommendation inputs.

The request uses JSON mode as described in the
[official OpenAI documentation](https://developers.openai.com/api/docs/guides/structured-outputs).
The model chooses 1 to 3 unique candidate IDs, orders them, and composes its
explanation from all four supplied factual sentences in any order. The JSON shape is:

```json
{
  "recommendations": [
    {"event_id": "SYN_EV001", "explanation": "All four candidate fact sentences, verbatim."}
  ]
}
```

The example explanation above describes the format; actual output must contain
the candidate's exact sentences. Free paraphrases are intentionally rejected:
checking digit presence alone cannot detect swapped levels or unsupported
judgments. Local validation checks the complete sentence content, unique IDs,
candidate membership, result count and JSON schema. Untrusted model output cannot
change scores, factors or event data. This conservative contract may fall back
when an otherwise plausible free-text answer does not follow the supplied wording.

There is one attempt, no retries, and an 8-second overall async deadline as well
as HTTP timeouts. Non-success HTTP responses, malformed JSON, refusals, truncated
output, unknown/duplicate IDs, changed numbers, missing factors, and additional
claims return the original fallback ranking. `source: llm` is set only after all
validation passes; otherwise `source: fallback`. No live provider call is needed
for the automated tests.

## Ranking traps covered by tests

1. Public Speaking is weakest, but three similar-event no-shows penalize it while
   System Design is critical for the next grade: System Design ranks first.
2. An event advertises a large gain but its cap prevents any increase in the
   deficient skill; gains in unrelated skills cannot make it a candidate.
3. A large nominal gain mostly exceeds a nearly met requirement, and another
   attractive event is already completed: the useful critical-skill event ranks first.
