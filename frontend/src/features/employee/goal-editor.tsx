"use client";
import { useState } from "react";
import { useCareer } from "@/features/career/career-context";
import { data, suggestedGoal, type Grade } from "@/lib/career";
export function GoalEditor() {
  const { employee } = useCareer();
  return (
    <GoalForm
      key={`${employee.employee_id}:${JSON.stringify(employee.career_goal)}`}
    />
  );
}
function GoalForm() {
  const { t, employee, setGoal, ready, importing } = useCareer();
  const suggestion = suggestedGoal(employee);
  const initial = employee.career_goal ??
    suggestion ?? { target_role: employee.role, target_grade: employee.grade };
  const [role, setRole] = useState(initial.target_role),
    [grade, setGrade] = useState<Grade>(initial.target_grade);
  const roles = [...new Set(data.role_profiles.map((p) => p.role))];
  const grades = data.role_profiles
    .filter((p) => p.role === role)
    .map((p) => p.grade);
  return (
    <section className="panel goal-editor" aria-labelledby="goal-editor-title">
      <div className="section-top">
        <h2 id="goal-editor-title">{t("Выберите направление развития")}</h2>
        <span className="pill">
          {t(employee.career_goal ? "Цель выбрана" : "Цель не выбрана")}
        </span>
      </div>
      <p>
        {t(
          employee.career_goal
            ? "Вы можете изменить цель или продолжить развитие в текущей роли."
            : suggestion
              ? "Следующий уровень — только предложение. Цель появится после вашего выбора."
              : "Вы уже на ведущем уровне. Можно развиваться в своей роли или выбрать новое направление.",
        )}
      </p>
      <form
        className="goal-form"
        onSubmit={(e) => {
          e.preventDefault();
          setGoal({ target_role: role, target_grade: grade });
        }}
      >
        <label>
          {t("Целевая роль")}
          <select
            aria-label={t("Целевая роль")}
            value={role}
            disabled={!ready || importing}
            onChange={(e) => {
              setRole(e.target.value);
              if (
                !data.role_profiles.some(
                  (p) => p.role === e.target.value && p.grade === grade,
                )
              )
                setGrade(
                  data.role_profiles.find((p) => p.role === e.target.value)!
                    .grade,
                );
            }}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(r)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Целевой уровень")}
          <select
            aria-label={t("Целевой уровень")}
            value={grade}
            disabled={!ready || importing}
            onChange={(e) => setGrade(e.target.value as Grade)}
          >
            {grades.map((g) => (
              <option key={g} value={g}>
                {t(g)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button primary"
          disabled={!ready || importing}
          type="submit"
        >
          {t("Сохранить цель")}
        </button>
        {employee.career_goal && (
          <button
            className="button secondary"
            disabled={!ready || importing}
            type="button"
            onClick={() => setGoal(null)}
          >
            {t("Продолжить без цели")}
          </button>
        )}
      </form>
    </section>
  );
}
export function GoalNotice() {
  const { t, employee } = useCareer();
  return (
    <>
      {!employee.career_goal && (
        <p className="recommendation-note goal-note">
          {t(
            "Цель пока не выбрана. Прогресс и рекомендации рассчитаны для текущей роли и уровня.",
          )}
        </p>
      )}
      {employee.career_goal &&
        employee.career_goal.target_role !== employee.role && (
          <p className="recommendation-note goal-note">
            {t(
              "Вы выбрали смену роли. Показываем доступные для вашей текущей роли активности, которые развивают навыки целевой роли. Если подходящих нет, обсудите переходную программу с HR.",
            )}
          </p>
        )}
      {!employee.last_review_date && (
        <p className="recommendation-note goal-note">
          {t(
            "Дата оценки не указана. Исторические завершения не прибавляются к навыкам; новые завершения в демо учитываются.",
          )}
        </p>
      )}
    </>
  );
}
