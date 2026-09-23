"use client";
import { useCareer } from "@/features/career/career-context";
import { Icon } from "@/components/ui/primitives";
import type { Event } from "@/lib/career";
import type { recommendations } from "@/lib/career";
export function EventCard({
  event,
  index,
  reason,
}: {
  event: Event;
  index: number;
  reason?: ReturnType<typeof recommendations>[number];
}) {
  const { t, skillName, typeNames, formatNames, setSelected, own } =
    useCareer();
  const done = own.some(
      (h) => h.event_id === event.event_id && h.status === "completed",
    ),
    started = own.some(
      (h) => h.event_id === event.event_id && h.status === "in_progress",
    );
  return (
    <article className="event-card" key={event.event_id}>
      <div className={`event-art art-${index % 3}`}>
        <Icon name={index + 1} size={34} />
        <span>{typeNames[event.type]}</span>
        <div className="art-lines" />
      </div>
      <div className="event-body">
        <div className="eyebrow">
          {formatNames[event.format]} <span>·</span> {event.duration_hours}{" "}
          {t("ч.")}
        </div>
        <h3>{t(event.title)}</h3>
        <p>
          {reason
            ? t("{0}: {1} → {2}. Цель — {3}.", [
                skillName(reason.gains[0].id),
                reason.gains[0].current,
                Math.min(reason.gains[0].current + reason.gains[0].gain, 5),
                reason.gains[0].required,
              ])
            : t(event.description)}
        </p>
        {reason && (
          <span className="pill">
            {reason.gains.some((g) => g.critical)
              ? t("Для ключевого навыка")
              : t("Ближе к вашей цели")}
          </span>
        )}
        <button className="card-link" onClick={() => setSelected(event)}>
          {started
            ? t("В вашем плане")
            : done && event.event_id !== "EV_036"
              ? t("Пройдено · подробнее")
              : t("Подробнее")}{" "}
          <span>↗</span>
        </button>
      </div>
    </article>
  );
}
