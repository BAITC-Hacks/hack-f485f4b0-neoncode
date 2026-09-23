"use client";
import { useCareer } from "@/features/career/career-context";
import { data } from "@/lib/career";
export function HistoryScreen() {
  const { t, date, statusNames, filter, setFilter, employee, own } =
    useCareer();

  return (
    <section className="panel">
      <div className="toolbar">
        <select
          aria-label={t("Статус активности")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">{t("Все статусы")}</option>
          {Object.entries(statusNames).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="subtle">
          {t("История профиля {0}", [employee.employee_id])}
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Активность")}</th>
              <th>{t("Дата")}</th>
              <th>{t("Статус")}</th>
              <th>{t("Прогресс")}</th>
            </tr>
          </thead>
          <tbody>
            {own
              .filter((h) => filter === "all" || h.status === filter)
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((h) => (
                <tr key={h.record_id}>
                  <td>
                    {t(
                      data.events.find((e) => e.event_id === h.event_id)
                        ?.title ?? h.event_id,
                    )}
                  </td>
                  <td>{date(h.date)}</td>
                  <td>
                    <span
                      className={`pill ${h.status === "completed" ? "" : "neutral"}`}
                    >
                      {statusNames[h.status]}
                    </span>
                  </td>
                  <td>{h.completion_pct}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!own.some((h) => filter === "all" || h.status === filter) && (
        <div className="empty">
          {t("Пока нет активностей с таким статусом.")}
        </div>
      )}
    </section>
  );
}
