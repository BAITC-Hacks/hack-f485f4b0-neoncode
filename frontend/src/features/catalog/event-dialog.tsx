"use client";
import { useCareer } from "@/features/career/career-context";
import { today, enrollmentBlock } from "@/lib/career";
import { useEffect, useRef } from "react";
export function EventDialog() {
  const {
    t,
    date,
    skillName,
    typeNames,
    formatNames,
    selected,
    setSelected,
    employee,
    own,
    current,
    recs,
    history,
    importing,
    ready,
    navigate,
    enroll,
  } = useCareer();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="event-dialog-title"
      onCancel={() => setSelected(null)}
      onClick={(e) => {
        if (e.target === dialog.current) setSelected(null);
      }}
    >
      {selected && (
        <>
          <button
            className="dialog-close"
            aria-label={t("Закрыть")}
            onClick={() => setSelected(null)}
          >
            ×
          </button>
          <span className="pill">
            {typeNames[selected.type]} · {formatNames[selected.format]}
          </span>
          <h2 id="event-dialog-title">{t(selected.title)}</h2>
          <p>{t(selected.description)}</p>
          <div className="detail-meta">
            <span>{t("{0} ч.", [selected.duration_hours])}</span>
            <span>
              {selected.format === "self_paced"
                ? t("Можно начать в любое время")
                : t("Ближайшая сессия: {0}", [
                    selected.upcoming_sessions.find((d) => d >= today)
                      ? date(
                          selected.upcoming_sessions.find((d) => d >= today)!,
                        )
                      : t("не назначена"),
                  ])}
            </span>
          </div>
          <h3>{t("Что даст эта активность")}</h3>
          {selected.develops_skills.map((s) => (
            <div className="detail-skill" key={s.skill_id}>
              <span>{skillName(s.skill_id)}</span>
              <strong>
                {current[s.skill_id] ?? 0} →{" "}
                {Math.max(
                  current[s.skill_id] ?? 0,
                  Math.min(s.max_level, (current[s.skill_id] ?? 0) + s.gain),
                )}
                <small> / 5</small>
              </strong>
            </div>
          ))}
          {recs.find((r) => r.event.event_id === selected.event_id) && (
            <div className="explanation">
              <strong>{t("Почему это подходит вам")}</strong>
              <p>
                {recs
                  .find((r) => r.event.event_id === selected.event_id)!
                  .gains.map((g) =>
                    t("{0}: уровень {1} при требуемых {2}{3}", [
                      skillName(g.id),
                      g.current,
                      g.required,
                      g.critical ? t(" (ключевой навык)") : "",
                    ]),
                  )
                  .join(". ")}
                .
              </p>
              <p>
                {t(
                  "В этом формате завершено: {0}; пропусков и отказов: {1}. Учтены длительность и условия участия.",
                  [
                    recs.find((r) => r.event.event_id === selected.event_id)!
                      .completed,
                    recs.find((r) => r.event.event_id === selected.event_id)!
                      .skipped,
                  ],
                )}
              </p>
            </div>
          )}
          <p className="subtle">
            {t("Для")} {selected.target_grades.map((g) => t(g)).join(", ")} ·{" "}
            {selected.target_roles.map((r) => t(r)).join(", ")}
          </p>
          {Object.entries(selected.prerequisites).length > 0 && (
            <p>
              {t("Условия:")}{" "}
              {Object.entries(selected.prerequisites)
                .map(([id, n]) => `${skillName(id)} ≥ ${n}`)
                .join(", ")}
            </p>
          )}
          {own.some(
            (h) =>
              h.event_id === selected.event_id && h.status === "in_progress",
          ) ? (
            <button
              className="button primary"
              onClick={() => {
                setSelected(null);
                navigate(1);
              }}
            >
              {t("Перейти к моему плану →")}
            </button>
          ) : (
            <button
              className="button primary"
              disabled={
                !ready ||
                importing ||
                enrollmentBlock(employee, history, selected) !== null
              }
              aria-describedby="enrollment-reason"
              onClick={() => enroll(selected)}
            >
              {t("Добавить в план развития →")}
            </button>
          )}
          <p id="enrollment-reason" className="subtle">
            {enrollmentBlock(employee, history, selected)
              ? t(enrollmentBlock(employee, history, selected)!)
              : t("Вы можете добавить эту активность в план.")}
          </p>
          <p className="subtle">
            {t(
              "Запись доступна при соответствии роли, грейду и условиям участия. Завершённые и обязательные активности повторно не назначаются.",
            )}
          </p>
        </>
      )}
    </dialog>
  );
}
