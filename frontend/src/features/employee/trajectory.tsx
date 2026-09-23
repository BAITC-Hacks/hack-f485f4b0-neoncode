"use client";
import { useCareer } from "@/features/career/career-context";
import { data } from "@/lib/career";
import { GoalEditor, GoalNotice } from "./goal-editor";
import { Meter } from "@/components/ui/primitives";
export function TrajectoryScreen() {
  const {
    t,
    skillName,
    statusNames,
    employee,
    current,
    goal,
    percent,
    requirements,
    active,
    complete,
    ready,
    importing,
  } = useCareer();

  return (
    <>
      <GoalEditor />
      <GoalNotice />
      <section className="panel spaced">
        <div className="section-top">
          <div>
            <span className="eyebrow">{t(goal.role)}</span>
            <h2>
              {employee.career_goal
                ? t("Ваш путь к {0}", [t(goal.grade)])
                : t("Развитие в текущей роли")}
            </h2>
          </div>
          <strong className="green">{t("{0}% готовности", [percent])}</strong>
        </div>
        <div className="grade-path">
          <div className="current-grade">
            <span>●</span>
            <strong>{t(employee.role)}</strong>
            <strong>{t(employee.grade)}</strong>
            <small>{t("Вы здесь")}</small>
          </div>
          {employee.career_goal && (
            <div className="target-grade">
              <span>◎</span>
              <strong>{t(goal.role)}</strong>
              <strong>{t(goal.grade)}</strong>
              <small>{t("Ваша цель")}</small>
            </div>
          )}
        </div>
        <p className="subtle">
          {t(
            "Готовность — сумма достигнутых уровней, ограниченных требованиями цели, делённая на сумму требуемых уровней. Она не гарантирует повышение.",
          )}
        </p>
      </section>
      <section className="panel spaced">
        <div className="section-top">
          <h2>{t("Карта навыков")}</h2>
          <span className="pill">{t("Шкала 0–5")}</span>
        </div>
        <div className="skill-grid">
          {requirements.map(([id, n]) => (
            <div className="skill-row" key={id}>
              <div>
                <strong>{skillName(id)}</strong>
                <span>
                  {current[id] ?? 0} / {n}
                </span>
              </div>
              <Meter value={Math.min(100, ((current[id] ?? 0) / n) * 100)} />
              <small>
                {goal.critical_skills.includes(id)
                  ? t("Ключевой навык для выбранного направления")
                  : t("Дополняет вашу экспертизу")}
                {(current[id] ?? 0) >= n ? t(" · Цель достигнута") : ""}
              </small>
            </div>
          ))}
        </div>
      </section>
      <section className="panel spaced">
        <h2>{t("Мой план развития")}</h2>
        {active.length ? (
          active.map((h) => (
            <div className="plan-row" key={h.record_id}>
              <div>
                <strong>
                  {t(
                    data.events.find((e) => e.event_id === h.event_id)?.title ??
                      h.event_id,
                  )}
                </strong>
                <p>
                  {statusNames[h.status]} · {h.completion_pct}%
                </p>
              </div>
              <button
                className="button secondary"
                disabled={!ready || importing}
                onClick={() => complete(h)}
              >
                {t("Завершить в демо")}
              </button>
            </div>
          ))
        ) : (
          <div className="empty">
            {t("План пока пуст. Выберите первую активность в каталоге.")}
          </div>
        )}
      </section>
    </>
  );
}
