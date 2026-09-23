"use client";
import { useCareer } from "@/features/career/career-context";
import { data } from "@/lib/career";
import { EventCard } from "@/features/catalog/event-card";
export function CatalogScreen() {
  const { t, typeNames, query, setQuery, filter, setFilter } = useCareer();
  const catalog = data.events.filter(
    (e) =>
      (filter === "all" || e.type === filter) &&
      [t(e.title), t(e.description), e.title, e.description]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="toolbar">
        <input
          aria-label={t("Поиск активностей")}
          placeholder={t("Поиск по названию или теме…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label={t("Тип активности")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">{t("Все форматы")}</option>
          {Object.entries(typeNames).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="subtle">{t("Найдено: {0}", [catalog.length])}</span>
      </div>
      <div className="event-grid">
        {catalog.map((e, i) => (
          <EventCard key={e.event_id} event={e} index={i} />
        ))}
      </div>
      {!catalog.length && (
        <div className="empty">
          {t("Ничего не найдено. Попробуйте другой запрос.")}
        </div>
      )}
    </>
  );
}
