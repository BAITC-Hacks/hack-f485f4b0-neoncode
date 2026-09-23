import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { useComplete, useEmployee, useRecommendations } from "@/api/hooks";
import {
  ErrorState,
  historyLabels,
  Loading,
  recommendationLabels,
} from "./states";
import type { components } from "@/api/types";

type Schemas = components["schemas"];
type Recommendation = Schemas["Recommendation"];

function CompletionPanel({
  result,
  recommendation,
}: {
  result: Schemas["CompletionResponse"];
  recommendation?: Recommendation;
}) {
  const limits = new Map(
    recommendation?.event.skills.map((skill) => [
      skill.skill_id,
      skill.max_level,
    ]),
  );
  const changed = Object.entries(result.skills_after).filter(
    ([skill, after]) => result.skills_before[skill] !== after,
  );

  return (
    <aside className="api-completion-panel" role="status">
      <h3>Активность выполнена</h3>
      {changed.length ? (
        <ul>
          {changed.map(([skill, after]) => {
            const maximum = limits.get(skill);
            return (
              <li key={skill}>
                <strong>{skill}</strong>: {result.skills_before[skill] ?? 0} →{" "}
                {after}
                {maximum !== undefined && after >= maximum
                  ? ` · достигнут максимум события (${maximum})`
                  : ""}
              </li>
            );
          })}
        </ul>
      ) : (
        <p>Уровни навыков не изменились.</p>
      )}
      <p>
        До требования следующего грейда осталось:{" "}
        <strong>{result.progress_after.remaining_points}</strong>
      </p>
      <p className="subtle">
        Грейд обновляется только сервером и не пересчитывается на этой странице.
      </p>
    </aside>
  );
}

function Recommendations({ id }: { id: string }) {
  const query = useRecommendations(id);
  const complete = useComplete(id);
  const keys = useRef(new Map<string, string>());
  const busy = useRef(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [completedRecommendation, setCompletedRecommendation] =
    useState<Recommendation>();

  function finish(item: Recommendation) {
    if (busy.current) return;
    const eventId = item.event.event_id;
    let completionId = keys.current.get(eventId);
    const storageKey = `career-quest-completion-v1:${id}:${eventId}`;
    if (!completionId) {
      try {
        completionId = localStorage.getItem(storageKey) || undefined;
      } catch {
        setStorageWarning(true);
      }
      completionId ??= crypto.randomUUID();
      keys.current.set(eventId, completionId);
      try {
        localStorage.setItem(storageKey, completionId);
      } catch {
        setStorageWarning(true);
      }
    }
    busy.current = true;
    setCompletedRecommendation(item);
    complete.mutate(
      { event_id: eventId, completion_id: completionId },
      { onSettled: () => void (busy.current = false) },
    );
  }

  return (
    <section className="api-section" aria-labelledby="recommendations-title">
      <h2 id="recommendations-title">Рекомендации</h2>
      {query.isPending && <Loading label="Подбираем рекомендации" />}
      {query.isError && (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      )}
      {complete.isError && <ErrorState error={complete.error} />}
      {storageWarning && (
        <p className="api-warning" role="status">
          Сохранение идентификатора недоступно. Повторить запрос можно, пока
          страница открыта.
        </p>
      )}
      {complete.data && (
        <CompletionPanel
          result={complete.data}
          recommendation={completedRecommendation}
        />
      )}
      {query.data && query.data.status !== "ready" && (
        <div className="api-empty api-message">
          <h3>{recommendationLabels[query.data.status]}</h3>
          <p>
            {query.data.status === "requirements_met"
              ? "Дополнительный шаг сейчас не нужен: требования следующего грейда уже выполнены."
              : "Для текущих дефицитов нет подходящей активности. Обратитесь к HR, чтобы подобрать другой формат развития."}
          </p>
        </div>
      )}
      {query.data?.status === "ready" &&
        !query.data.recommendations.length && (
          <p className="api-empty">Рекомендации пока не сформированы.</p>
        )}
      <div className="api-recommendations">
        {query.data?.recommendations.slice(0, 3).map((item) => (
          <article className="api-event" key={item.event.event_id}>
            <div className="api-section-heading">
              <span className="api-tag">{item.event.type}</span>
              <span className="api-tag api-source">
                {query.data.source === "llm" ? "AI" : "Скоринг"}
              </span>
            </div>
            <h3>{item.event.title ?? item.event.event_id}</h3>
            {item.event.description && <p>{item.event.description}</p>}
            <div>
              <h4>Прокачает навыки</h4>
              <ul className="api-impacts">
                {item.factors.skill_impacts.map((skill) => (
                  <li key={skill.skill_id}>
                    <strong>{skill.skill_id}</strong>: +{skill.effective_gain}{" "}
                    ({skill.current_level} → {skill.level_after})
                    {skill.level_after >= skill.max_level
                      ? ` · максимум события ${skill.max_level}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
            <p className="api-explanation">{item.explanation}</p>
            <div>
              <h4>Факторы</h4>
              <ul className="api-impacts">
                {item.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
                <li>
                  Закрывает дефицит: {item.factors.covered_deficit} из{" "}
                  {item.factors.total_deficit}
                </li>
                {(item.factors.no_show_count > 0 ||
                  item.factors.declined_count > 0) && (
                  <li>
                    История: пропуски — {item.factors.no_show_count}, отказы —{" "}
                    {item.factors.declined_count}
                  </li>
                )}
              </ul>
            </div>
            <button
              className="button primary"
              disabled={complete.isPending}
              onClick={() => finish(item)}
            >
              <Check size={16} aria-hidden="true" />
              {complete.isPending &&
              complete.variables?.event_id === item.event.event_id
                ? "Сохраняем…"
                : "Выполнил"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Profile({ profile }: { profile: Schemas["EmployeeProfile"] }) {
  const { progress } = profile;
  const requirements = progress.requirements?.required_skills ?? {};
  const gaps = new Map(progress.gaps.map((gap) => [gap.skill_id, gap]));
  const skills = Array.from(
    new Set([...Object.keys(profile.skills), ...Object.keys(requirements)]),
  )
    .map((skillId) => {
      const current = profile.skills[skillId] ?? 0;
      const required = requirements[skillId];
      return {
        skillId,
        current,
        required,
        deficit:
          gaps.get(skillId)?.deficit ??
          Math.max(0, (required ?? 0) - current),
      };
    })
    .sort(
      (a, b) => b.deficit - a.deficit || a.skillId.localeCompare(b.skillId),
    );

  return (
    <>
      <header className="api-page-heading api-profile-heading">
        <div>
          <p className="subtle">
            {profile.employee_id}
            {profile.synthetic ? " · Synthetic" : ""}
          </p>
          <h1>{profile.full_name ?? profile.employee_id}</h1>
        </div>
        <dl className="api-profile-facts">
          <div>
            <dt>Роль</dt><dd>{profile.role}</dd>
          </div>
          <div>
            <dt>Грейд</dt><dd>{profile.grade}</dd>
          </div>
          <div>
            <dt>Стаж</dt><dd>{profile.tenure_months} мес.</dd>
          </div>
          <div>
            <dt>Следующий грейд</dt><dd>{progress.next_grade ?? "Не определён"}</dd>
          </div>
        </dl>
      </header>
      <section className="api-section">
        <h2>Навыки и требования</h2>
        <p className="api-progress-summary">
          {progress.status === "no_next_grade"
            ? "Для этой роли следующего грейда нет."
            : progress.status === "requirements_met"
              ? "Все требования следующего грейда закрыты."
              : `До требований следующего грейда: ${progress.remaining_points} уровней навыков.`}
        </p>
        {!skills.length ? (
          <p className="api-empty">Навыки пока не указаны.</p>
        ) : (
          <div className="api-skills">
            {skills.map((skill) => (
              <article className="api-skill" key={skill.skillId}>
                <div className="api-skill-heading">
                  <strong>{skill.skillId}</strong>
                  <span>
                    {skill.current} / 5
                    {skill.required === undefined
                      ? " · требования нет"
                      : ` · требуется ${skill.required}`}
                  </span>
                  {skill.deficit > 0 && (
                    <span className="api-deficit">Дефицит {skill.deficit}</span>
                  )}
                </div>
                <div
                  className="api-skill-track"
                  role="progressbar"
                  aria-label={`${skill.skillId}: ${skill.current} из 5`}
                  aria-valuemin={0}
                  aria-valuemax={5}
                  aria-valuenow={skill.current}
                >
                  <span style={{ width: `${skill.current * 20}%` }} />
                  {skill.required !== undefined && (
                    <i
                      style={{ left: `${skill.required * 20}%` }}
                      title={`Требование: ${skill.required}`}
                    />
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function EmployeeScreen({ id }: { id: string }) {
  const query = useEmployee(id);
  if (!id)
    return (
      <div className="api-empty">
        <h1>Профиль не выбран</h1>
        <p>Переключитесь в HR и выберите сотрудника из списка.</p>
      </div>
    );
  return (
    <>
      {query.isPending && <Loading label="Загрузка профиля" />}
      {query.isError && (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      )}
      {query.data && <Profile profile={query.data} />}
      <Recommendations key={id} id={id} />
      {query.data && (
        <section className="api-section">
          <h2>История активностей</h2>
          {!query.data.history.length ? (
            <p className="api-empty">Активностей пока нет.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Событие</th><th>Дата</th><th>Статус</th></tr>
                </thead>
                <tbody>
                  {query.data.history.map((record, index) => (
                    <tr key={record.record_id ?? `${record.event_id}-${index}`}>
                      <td>{record.event_id}</td>
                      <td>{record.date}</td>
                      <td>
                        <span className={`api-status api-status-${record.status}`}>
                          {historyLabels[record.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
