"use client";
import { useCareer } from "@/features/career/career-context";
import { GoalNotice } from "./goal-editor";
import { Icon, Meter } from "@/components/ui/primitives";
import { EventCard } from "@/features/catalog/event-card";
export function OverviewScreen() {
  const {
    t,
    skillName,
    employee,
    current,
    goal,
    percent,
    recs,
    requirements,
    active,
    completed,
    navigate,
  } = useCareer();

  return (
    <>
      <GoalNotice />
      <section className="overview-grid">
        <article className="journey-card">
          <div>
            <span className="pill light">
              {t(
                employee.career_goal
                  ? "ВАША КАРЬЕРНАЯ ЦЕЛЬ"
                  : "РАЗВИТИЕ В ТЕКУЩЕЙ РОЛИ",
              )}
            </span>
            <h2>
              {t(
                employee.career_goal
                  ? "Выбранное направление —"
                  : "Укрепляйте свою экспертизу",
              )}
              <br />
              {t(goal.grade)} · {t(goal.role)}
            </h2>
            <p>
              {t("Ваше развитие — ваш выбор.")}
              <br />
              {t("Больше уверенности, масштаба и возможностей.")}
            </p>
            <button className="journey-link" onClick={() => navigate(1)}>
              {t(employee.career_goal ? "Посмотреть путь" : "Выбрать цель")}
              <span>→</span>
            </button>
          </div>
          <div className="journey-illustration" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="step step-one" />
            <div className="step step-two" />
            <div className="step step-three" />
            <div className="flag">✦</div>
            <span className="illustration-label">{t("ВЫ НА ВЕРНОМ ПУТИ")}</span>
          </div>
        </article>
        <article className="progress-card">
          <div className="section-top">
            <h3>
              {t(
                employee.career_goal
                  ? "Готовность к цели"
                  : "Соответствие текущему уровню",
              )}
            </h3>
            <Icon name={1} />
          </div>
          <div
            className="ring"
            style={{
              background: `conic-gradient(var(--green) ${percent}%, var(--green-soft) 0)`,
            }}
          >
            <div>
              <strong>
                {percent}
                <small>%</small>
              </strong>
              <span>
                {t(
                  employee.career_goal
                    ? "навыков для цели"
                    : "требований выполнено",
                )}
              </span>
            </div>
          </div>
          <p>
            {t("{0} из {1} навыков на нужном уровне", [
              requirements.filter(([id, n]) => (current[id] ?? 0) >= n).length,
              requirements.length,
            ])}
          </p>
          <span className="subtle">
            {t("Рассчитано по требованиям грейда")}
          </span>
        </article>
      </section>
      <section className="stats-strip">
        <div>
          <span className="stat-icon">
            <Icon name={2} />
          </span>
          <div>
            <strong>{completed.length}</strong>
            <span>{t("активностей завершено")}</span>
          </div>
        </div>
        <div>
          <span className="stat-icon sand">
            <Icon name={3} />
          </span>
          <div>
            <strong>{active.length}</strong>
            <span>{t("в процессе развития")}</span>
          </div>
        </div>
        <div>
          <span className="stat-icon blue">
            <Icon name={1} />
          </span>
          <div>
            <strong>
              {
                requirements.filter(
                  ([id, n]) =>
                    (current[id] ?? 0) < n && goal.critical_skills.includes(id),
                ).length
              }
            </strong>
            <span>{t("ключевых навыков для роста")}</span>
          </div>
        </div>
      </section>
      <div className="section-title">
        <div>
          <div className="eyebrow green">
            {t("С УЧЁТОМ ВАШЕГО ОПЫТА И ЦЕЛИ")}
          </div>
          <h2>
            {t("Подобрано для вас")}{" "}
            <span className="count">{recs.length}</span>
          </h2>
          <p>{t("Шаги для выбранного направления развития.")}</p>
        </div>
        <button className="text-button" onClick={() => navigate(2)}>
          {t("Все активности →")}
        </button>
      </div>
      <div className="recommendation-note">
        {t(
          "✧ Демо-подбор по навыкам, цели и истории. AI-сервис ещё не подключён.",
        )}
      </div>
      <div className="event-grid">
        {recs.map((r, i) => (
          <EventCard
            key={r.event.event_id}
            event={r.event}
            index={i}
            reason={r}
          />
        ))}
      </div>
      {!recs.length && (
        <div className="empty">
          {t(
            "Подходящих новых активностей пока нет. Проверьте текущий план или изучите каталог.",
          )}
        </div>
      )}
      <section className="bottom-grid">
        <article className="panel">
          <div className="section-top">
            <h3>{t("Навыки в фокусе")}</h3>
            <button className="text-button" onClick={() => navigate(1)}>
              {t("Все навыки ↗")}
            </button>
          </div>
          {requirements
            .filter(([id, n]) => (current[id] ?? 0) < n)
            .slice(0, 3)
            .map(([id, n]) => (
              <div className="skill-row" key={id}>
                <div>
                  <strong>{skillName(id)}</strong>
                  <span>
                    {current[id] ?? 0} <span className="subtle">/ {n}</span>
                  </span>
                </div>
                <Meter value={Math.min(100, ((current[id] ?? 0) / n) * 100)} />
              </div>
            ))}
        </article>
        <article className="quote-panel">
          <span className="eyebrow">{t("РАЗВИТИЕ — ЭТО ПУТЬ")}</span>
          <h2>
            {t("Не обязательно видеть")}
            <br />
            {t("всю лестницу.")}
            <br />
            {t("Сделайте первый шаг.")}
          </h2>
          <p>
            {t("Выбирайте то, что интересно именно вам.")}
            <br />
            {t("Ваше развитие остаётся вашим выбором.")}
          </p>
        </article>
      </section>
    </>
  );
}
