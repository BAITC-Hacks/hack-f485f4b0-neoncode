"use client";
import { useCareer } from "@/features/career/career-context";
import { target } from "@/lib/career";
import { useMemo } from "react";
import { teamAnalytics } from "./analytics";
import { Meter } from "@/components/ui/primitives";
export function HrScreen() {
  const { t, employees, history, setEmployeeId, query, setQuery, navigate } =
    useCareer();
  const hrEmployees = employees.filter((e) =>
    [e.full_name, t(e.department), e.department]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const analytics = useMemo(
    () => teamAnalytics(employees, history),
    [employees, history],
  );
  const { deficits } = analytics;
  return (
    <>
      <div className="recommendation-note">
        {t(
          "Демонстрационный HR-экран на синтетических данных. Разграничение доступа требует серверной авторизации.",
        )}
      </div>
      <section className="hr-stats">
        <article className="panel">
          <span className="subtle">{t("Сотрудников")}</span>
          <strong>{employees.length}</strong>
        </article>
        <article className="panel">
          <span className="subtle">{t("Средняя готовность к цели")}</span>
          <small>
            {t("Только для выбранных целей: {0}", [analytics.selectedTotal])}
          </small>
          <strong>
            {analytics.average === null ? "—" : `${analytics.average}%`}
          </strong>
        </article>
        <article className="panel">
          <span className="subtle">{t("Без завершений за 90 дней")}</span>
          <strong>{analytics.inactive}</strong>
        </article>
      </section>
      <section className="panel spaced">
        <h2>{t("Где команде нужна поддержка")}</h2>
        <p className="subtle">
          {t(
            "Разрывы относительно выбранной цели, а без цели — текущей роли и уровня.",
          )}
        </p>
        {!deficits.length && (
          <p className="empty">{t("Разрывов по навыкам нет.")}</p>
        )}
        {deficits.map((s) => (
          <div className="skill-row" key={s.skill_id}>
            <div>
              <strong>{t(s.name)}</strong>
              <span>
                {s.count} {t("сотрудников")}
              </span>
            </div>
            <Meter
              label={t("Доля сотрудников с разрывом по навыку")}
              value={(s.count / employees.length) * 100}
            />
          </div>
        ))}
      </section>
      <section className="panel spaced">
        <div className="toolbar">
          <h2>{t("Развитие команды")}</h2>
          <input
            aria-label={t("Поиск сотрудников")}
            placeholder={t("Имя или подразделение…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Сотрудник")}</th>
                <th>{t("Подразделение")}</th>
                <th>{t("Грейд → цель")}</th>
                <th>{t("Готовность")}</th>
              </tr>
            </thead>
            <tbody>
              {hrEmployees.map((e) => (
                <tr key={e.employee_id}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => {
                        setEmployeeId(e.employee_id);
                        navigate(1);
                      }}
                    >
                      {e.full_name}
                    </button>
                  </td>
                  <td>{t(e.department)}</td>
                  <td>
                    {t(e.grade)} →{" "}
                    {e.career_goal
                      ? `${t(target(e).role)} · ${t(target(e).grade)}`
                      : t("Цель не выбрана")}
                  </td>
                  <td>
                    {analytics.profiles.get(e.employee_id)?.readiness}%
                    {!e.career_goal && (
                      <small className="subtle">
                        {" "}
                        · {t("текущий уровень")}
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!hrEmployees.length && (
          <div className="empty">{t("Сотрудники не найдены.")}</div>
        )}
      </section>
    </>
  );
}
