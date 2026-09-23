"use client";
import { useEffect, useState, useMemo } from "react";
import { mergeImports } from "@/lib/import-data";
import { useLocale } from "@/lib/locale-context";
import {
  data,
  enrollmentBlock,
  type CareerGoal,
  levels,
  progress,
  recommendations,
  skillName as originalSkillName,
  target,
  today,
  validateEmployees,
  validateHistory,
  type Employee,
  type Event,
  type History,
} from "@/lib/career";

export function useCareerState() {
  const { t, locale, setLocale, date } = useLocale();
  const skillName = (id: string) => t(originalSkillName(id));
  const tabs = [
    t("Обзор"),
    t("Моя траектория"),
    t("Каталог активностей"),
    t("История развития"),
    t("HR-аналитика"),
    t("Импорт данных"),
  ];
  const typeNames: Record<string, string> = {
    course: t("Курс"),
    workshop: t("Воркшоп"),
    mentoring: t("Менторство"),
    certification: t("Сертификация"),
    meetup: t("Встреча"),
    compliance: t("Обязательное обучение"),
    onboarding: t("Онбординг"),
  };
  const statusNames: Record<string, string> = {
    completed: t("Завершено"),
    in_progress: t("В процессе"),
    dropped: t("Прервано"),
    no_show: t("Пропущено"),
    declined: t("Отказ"),
    overdue: t("Просрочено"),
  };
  const formatNames: Record<string, string> = {
    online: t("Онлайн"),
    offline: t("Очно"),
    self_paced: t("В своём темпе"),
  };

  const [employees, setEmployees] = useState<Employee[]>(data.employees);
  const [history, setHistory] = useState<History[]>(data.history);
  const [employeeId, setEmployeeId] = useState("E0005");
  const [tab, setTab] = useState(0),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Event | null>(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [demoRole, updateDemoRole] = useState<"employee" | "hr">("employee");
  const [ready, setReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);

  // Hydrate browser-only demo storage after the server-rendered first paint.
  /* eslint-disable react-hooks/set-state-in-effect -- Restore browser storage after hydration. */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("career-quest-v1");
      if (saved) {
        const state = JSON.parse(saved);
        const restoredEmployees = validateEmployees(state.employees);
        const restoredHistory = validateHistory(
          state.history,
          restoredEmployees,
        );
        setEmployees(restoredEmployees);
        setHistory(restoredHistory);
        if (restoredEmployees.some((e) => e.employee_id === state.employeeId))
          setEmployeeId(state.employeeId);
      }
    } catch {
      setNotice("Сохранённые данные недоступны. Загружен исходный датасет.");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(
          "career-quest-v1",
          JSON.stringify({ employees, history, employeeId }),
        );
      } catch {
        setStorageWarning(true);
      }
  }, [employees, history, employeeId, ready]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const employee =
    employees.find((e) => e.employee_id === employeeId) ?? employees[0];
  const { own, current, goal, percent, recs, requirements, active, completed } =
    useMemo(() => {
      const own = history.filter((h) => h.employee_id === employee.employee_id);
      const current = levels(employee, history),
        goal = target(employee),
        percent = progress(employee, history);
      const recs = recommendations(employee, history);
      const requirements = (
        Object.entries(goal.required_skills) as [string, number][]
      ).sort(
        ([a], [b]) =>
          Number(goal.critical_skills.includes(b)) -
          Number(goal.critical_skills.includes(a)),
      );
      return {
        own,
        current,
        goal,
        percent,
        recs,
        requirements,
        active: own.filter((h) => h.status === "in_progress"),
        completed: own.filter((h) => h.status === "completed"),
      };
    }, [employee, history]);
  function setGoal(next: CareerGoal | null) {
    if (importing || !ready) return;
    if (
      next &&
      !data.role_profiles.some(
        (p) => p.role === next.target_role && p.grade === next.target_grade,
      )
    )
      return;
    setEmployees((previous) =>
      previous.map((e) =>
        e.employee_id === employee.employee_id
          ? { ...e, career_goal: next }
          : e,
      ),
    );
    setNotice(
      next
        ? "Карьерная цель сохранена. Рекомендации обновлены."
        : "Цель убрана. Показано развитие в текущей роли.",
    );
  }
  function navigate(index: number) {
    if (index >= 4 && demoRole !== "hr") return;
    setTab(index);
    setQuery("");
    setFilter("all");
  }
  function setDemoRole(role: "employee" | "hr") {
    updateDemoRole(role);
    if (role === "employee" && tab >= 4) {
      setTab(0);
      setQuery("");
      setFilter("all");
    }
  }
  function enroll(event: Event) {
    if (importing || !ready || enrollmentBlock(employee, history, event))
      return;
    let recordId = `local-${employee.employee_id}-${event.event_id}-${history.length}`;
    while (history.some((h) => h.record_id === recordId)) recordId += "-next";
    setHistory([
      ...history,
      {
        record_id: recordId,
        employee_id: employee.employee_id,
        event_id: event.event_id,
        date: today,
        status: "in_progress",
        completion_pct: "0",
      },
    ]);
    setSelected(null);
    setNotice("Активность добавлена в ваш план развития.");
  }
  function complete(record: History) {
    if (
      importing ||
      !ready ||
      record.employee_id !== employee.employee_id ||
      record.status !== "in_progress"
    )
      return;
    setHistory(
      history.map((h) =>
        h.record_id === record.record_id
          ? {
              ...h,
              status: "completed",
              completion_pct: "100",
              date: today,
              demo_completion: true,
            }
          : h,
      ),
    );
    setNotice("Активность завершена. Навыки и траектория пересчитаны.");
  }
  async function importFiles(files: FileList | null) {
    if (!files?.length || importing || !ready || demoRole !== "hr") return;
    setError("");
    setImporting(true);
    try {
      const next = await mergeImports(Array.from(files), employees, history);
      setEmployees(next.employees);
      setHistory(next.history);
      setNotice(
        "Данные импортированы. Профили, аналитика и рекомендации обновлены.",
      );
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "Некорректный JSON. Проверьте формат файла."
          : e instanceof Error
            ? e.message
            : "Не удалось прочитать файлы.",
      );
    } finally {
      setImporting(false);
    }
  }

  return {
    t,
    locale,
    setLocale,
    date,
    skillName,
    tabs,
    typeNames,
    statusNames,
    formatNames,
    employees,
    setEmployees,
    history,
    setHistory,
    employeeId,
    setEmployeeId,
    tab,
    setTab,
    query,
    setQuery,
    filter,
    setFilter,
    selected,
    setSelected,
    notice,
    setNotice,
    error,
    setError,
    ready,
    demoRole,
    setDemoRole,
    importing,
    storageWarning,
    setGoal,
    employee,
    own,
    current,
    goal,
    percent,
    recs,
    requirements,
    active,
    completed,
    navigate,
    enroll,
    complete,
    importFiles,
  };
}
