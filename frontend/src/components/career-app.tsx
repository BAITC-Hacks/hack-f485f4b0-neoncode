"use client";
import { LocaleProvider, useLocale } from "@/lib/locale-context";
import { useEffect, useRef, useState } from "react";
import {
  data,
  grades,
  levels,
  parseHistory,
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
function Icon({ name, size = 20 }: { name: number; size?: number }) {
  const paths = [
    "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    "M5 20V10m7 10V4m7 16v-7M3 7l7-5 6 6 5-3",
    "M4 4h6l2 2 2-2h6v15h-6l-2 2-2-2H4z M12 6v15",
    "M4 5v5h5 M4 10a8 8 0 1 1 0 5 M12 7v5l3 2",
    "M4 20V9h4v11m4 0V3h4v17m4 0V12h2v8",
    "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name % paths.length]} />
    </svg>
  );
}
function Meter({ value }: { value: number }) {
  const { t } = useLocale();
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={t("Соответствие требованиям")}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
function CareerContent() {
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
  const [ready, setReady] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
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
      }
    } catch {
      setNotice("Сохранённые данные недоступны. Загружен исходный датасет.");
    }
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(
          "career-quest-v1",
          JSON.stringify({ employees, history }),
        );
      } catch {
        /* The session stays usable when storage is unavailable. */
      }
  }, [employees, history, ready]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  const employee =
    employees.find((e) => e.employee_id === employeeId) ?? employees[0];
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
  const active = own.filter((h) => h.status === "in_progress");
  const completed = own.filter((h) => h.status === "completed");
  function navigate(index: number) {
    setTab(index);
    setQuery("");
    setFilter("all");
  }
  function enroll(event: Event) {
    if (
      own.some(
        (h) =>
          h.event_id === event.event_id &&
          (h.status === "in_progress" ||
            (h.status === "completed" && event.event_id !== "EV_036")),
      )
    )
      return;
    setHistory([
      ...history,
      {
        record_id: `local-${employee.employee_id}-${event.event_id}-${history.length}`,
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
    setHistory(
      history.map((h) =>
        h.record_id === record.record_id
          ? { ...h, status: "completed", completion_pct: "100", date: today }
          : h,
      ),
    );
    setNotice("Активность завершена. Навыки и траектория пересчитаны.");
  }
  async function importFiles(files: FileList | null) {
    setError("");
    if (!files?.length) return;
    try {
      let nextEmployees = [...employees],
        nextHistory = [...history];
      for (const file of Array.from(files)) {
        const text = await file.text();
        if (file.name.endsWith(".json")) {
          const incoming = validateEmployees(JSON.parse(text));
          nextEmployees = [
            ...nextEmployees.filter(
              (e) => !incoming.some((i) => i.employee_id === e.employee_id),
            ),
            ...incoming,
          ];
        } else if (file.name.endsWith(".csv")) {
          const incoming = parseHistory(text);
          if (
            new Set(incoming.map((h) => h.record_id)).size !== incoming.length
          )
            throw new Error("В CSV повторяются record_id.");
          nextHistory = [
            ...nextHistory.filter(
              (h) => !incoming.some((i) => i.record_id === h.record_id),
            ),
            ...incoming,
          ];
        } else
          throw new Error("Поддерживаются только JSON профилей и CSV истории.");
      }
      validateHistory(nextHistory, nextEmployees);
      setEmployees(nextEmployees);
      setHistory(nextHistory);
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
    }
  }
  function eventCard(
    event: Event,
    index: number,
    reason?: (typeof recs)[number],
  ) {
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
              : done
                ? t("Пройдено · подробнее")
                : t("Подробнее")}{" "}
            <span>↗</span>
          </button>
        </div>
      </article>
    );
  }
  const catalog = data.events.filter(
    (e) =>
      (filter === "all" || e.type === filter) &&
      `${t(e.title)} ${t(e.description)} ${e.title} ${e.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const hrEmployees = employees.filter((e) =>
    `${e.full_name} ${t(e.department)}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const deficits = data.skills
    .map((s) => ({
      ...s,
      count: employees.filter((e) => {
        const req = (
          target(e).required_skills as Partial<Record<string, number>>
        )[s.skill_id];
        return req && (levels(e, history)[s.skill_id] ?? 0) < req;
      }).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="#" className="brand" onClick={() => navigate(0)}>
          <span className="brand-mark">
            c<span>q</span>
          </span>
          <span>
            career<span className="brand-light">quest</span>
            <small>{t("ПРОСТРАНСТВО РАЗВИТИЯ")}</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">H</span>
          <div>
            Halyk Bank<small>{t("Корпоративное пространство")}</small>
          </div>
          <span className="online-dot" />
        </div>
        <div className="nav-label">{t("ЛИЧНОЕ ПРОСТРАНСТВО")}</div>
        <nav aria-label={t("Главная навигация")}>
          {tabs.map((name, i) => (
            <button
              key={name}
              className={`nav-item ${tab === i ? "active" : ""} ${i === 4 ? "nav-divider" : ""}`}
              onClick={() => navigate(i)}
              aria-current={tab === i ? "page" : undefined}
            >
              <Icon name={i} />
              {name}
              {i === 0 && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="leaf">✳</span>
          <strong>
            {t("В своём темпе.")}
            <br />
            {t("В своём направлении.")}
          </strong>
          <p>{t("Каждый небольшой шаг — часть большого пути.")}</p>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">
            {employee.full_name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <strong>{employee.full_name}</strong>
            <small>
              {t(employee.grade)} · {t(employee.role)}
            </small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">{t("Моё развитие")}</span>
            <span className="slash">/</span>
            {tabs[tab]}
          </div>
          <div className="topbar-right">
            <div
              className="language-switch"
              role="group"
              aria-label={t("Язык интерфейса")}
            >
              {(
                [
                  { code: "ru", label: "РУС", name: "Русский" },
                  { code: "en", label: "ENG", name: "English" },
                  { code: "kk", label: "ҚАЗ", name: "Қазақша" },
                ] as const
              ).map((language) => (
                <button
                  key={language.code}
                  type="button"
                  lang={language.code}
                  aria-label={language.name}
                  aria-pressed={locale === language.code}
                  onClick={() => setLocale(language.code)}
                >
                  {language.label}
                </button>
              ))}
            </div>
            <span className="demo-tag">{t("Демо-пространство")}</span>
            <span className="date-label">{date(today)}</span>
            <span className="avatar small">{employee.full_name[0]}</span>
          </div>
        </header>
        <main>
          <div className="profile-switch">
            <label htmlFor="profile">{t("Демо-профиль")}</label>
            <select
              id="profile"
              value={employee.employee_id}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setNotice("");
              }}
            >
              {employees.map((e) => (
                <option value={e.employee_id} key={e.employee_id}>
                  {e.full_name} · {t(e.grade)}
                </option>
              ))}
            </select>
          </div>
          {notice && (
            <div role="status" className="notice">
              {t(notice)}
              <button
                aria-label={t("Закрыть уведомление")}
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow green">
                {tab === 0
                  ? t("ВАШ СЛЕДУЮЩИЙ ШАГ НАЧИНАЕТСЯ ЗДЕСЬ")
                  : t("CAREER QUEST / РАЗВИТИЕ")}
              </div>
              <h1>
                {tab === 0
                  ? t("Рады видеть вас, {0}", [
                      employee.full_name.split(" ")[0],
                    ])
                  : tabs[tab]}
                {tab === 0 && <span className="greeting-dot">.</span>}
              </h1>
              <p>
                {
                  [
                    t(
                      "Развивайте сильные стороны. Открывайте новые возможности.",
                    ),
                    t("Понятная цель и навыки, которые помогут к ней прийти."),
                    t("Найдите подходящий формат для следующего шага."),
                    t("Ваш опыт, маленькие победы и движение вперёд."),
                    t(
                      "Общий взгляд на развитие команды — без рейтингов сотрудников.",
                    ),
                    t(
                      "Добавьте проверочные профили и историю в формате стартового датасета.",
                    ),
                  ][tab]
                }
              </p>
            </div>
            {tab === 0 && (
              <button className="button secondary" onClick={() => navigate(1)}>
                {t("Моя траектория")}
                <span>↗</span>
              </button>
            )}
          </div>
          {tab === 0 && (
            <>
              <section className="overview-grid">
                <article className="journey-card">
                  <div>
                    <span className="pill light">
                      {t("ВАША КАРЬЕРНАЯ ЦЕЛЬ")}
                    </span>
                    <h2>
                      {t("Следующая остановка —")}
                      <br />
                      {t(goal.grade)} · {t(goal.role)}
                    </h2>
                    <p>
                      {t("Не просто новый грейд.")}
                      <br />
                      {t("Больше уверенности, масштаба и возможностей.")}
                    </p>
                    <button
                      className="journey-link"
                      onClick={() => navigate(1)}
                    >
                      {t("Посмотреть путь")}
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
                    <span className="illustration-label">
                      {t("ВЫ НА ВЕРНОМ ПУТИ")}
                    </span>
                  </div>
                </article>
                <article className="progress-card">
                  <div className="section-top">
                    <h3>{t("Готовность к цели")}</h3>
                    <Icon name={1} />
                  </div>
                  <div
                    className="ring"
                    style={{
                      background: `conic-gradient(#34785f ${percent}%, #edf0e9 0)`,
                    }}
                  >
                    <div>
                      <strong>
                        {percent}
                        <small>%</small>
                      </strong>
                      <span>{t("навыков для цели")}</span>
                    </div>
                  </div>
                  <p>
                    {t("{0} из {1} навыков на нужном уровне", [
                      requirements.filter(([id, n]) => (current[id] ?? 0) >= n)
                        .length,
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
                            (current[id] ?? 0) < n &&
                            goal.critical_skills.includes(id),
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
                  <p>
                    {t(
                      "Шаги, которые помогут сократить расстояние до следующего грейда.",
                    )}
                  </p>
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
                {recs.map((r, i) => eventCard(r.event, i, r))}
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
                            {current[id] ?? 0}{" "}
                            <span className="subtle">/ {n}</span>
                          </span>
                        </div>
                        <Meter
                          value={Math.min(100, ((current[id] ?? 0) / n) * 100)}
                        />
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
                  <span className="quote-spark">✳</span>
                </article>
              </section>
            </>
          )}
          {tab === 1 && (
            <>
              <section className="panel">
                <div className="section-top">
                  <div>
                    <span className="eyebrow">{t(goal.role)}</span>
                    <h2>{t("Ваш путь к {0}", [t(goal.grade)])}</h2>
                  </div>
                  <strong className="green">
                    {t("{0}% готовности", [percent])}
                  </strong>
                </div>
                <div className="grade-path">
                  {grades.map((g) => (
                    <div
                      key={g}
                      className={
                        g === employee.grade
                          ? "current-grade"
                          : g === goal.grade
                            ? "target-grade"
                            : ""
                      }
                    >
                      <span>
                        {g === employee.grade
                          ? "●"
                          : g === goal.grade
                            ? "◎"
                            : "○"}
                      </span>
                      <strong>{t(g)}</strong>
                      <small>
                        {g === employee.grade
                          ? t("Вы здесь")
                          : g === goal.grade
                            ? t("Ваша цель")
                            : t("Этап карьеры")}
                      </small>
                    </div>
                  ))}
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
                      <Meter
                        value={Math.min(100, ((current[id] ?? 0) / n) * 100)}
                      />
                      <small>
                        {goal.critical_skills.includes(id)
                          ? t("Ключевой навык для перехода")
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
                            data.events.find((e) => e.event_id === h.event_id)
                              ?.title ?? h.event_id,
                          )}
                        </strong>
                        <p>
                          {statusNames[h.status]} · {h.completion_pct}%
                        </p>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => complete(h)}
                      >
                        {t("Завершить в демо")}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    {t(
                      "План пока пуст. Выберите первую активность в каталоге.",
                    )}
                  </div>
                )}
              </section>
            </>
          )}
          {tab === 2 && (
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
                <span className="subtle">
                  {t("Найдено: {0}", [catalog.length])}
                </span>
              </div>
              <div className="event-grid">
                {catalog.map((e, i) => eventCard(e, i))}
              </div>
              {!catalog.length && (
                <div className="empty">
                  {t("Ничего не найдено. Попробуйте другой запрос.")}
                </div>
              )}
            </>
          )}
          {tab === 3 && (
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
          )}
          {tab === 4 && (
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
                  <span className="subtle">
                    {t("Средняя готовность к цели")}
                  </span>
                  <strong>
                    {Math.round(
                      employees.reduce((n, e) => n + progress(e, history), 0) /
                        employees.length,
                    )}
                    %
                  </strong>
                </article>
                <article className="panel">
                  <span className="subtle">
                    {t("Без завершений за 90 дней")}
                  </span>
                  <strong>
                    {
                      employees.filter(
                        (e) =>
                          !history.some(
                            (h) =>
                              h.employee_id === e.employee_id &&
                              h.status === "completed" &&
                              h.date >= "2026-07-03" &&
                              h.date <= today,
                          ),
                      ).length
                    }
                  </strong>
                </article>
              </section>
              <section className="panel spaced">
                <h2>{t("Где команде нужна поддержка")}</h2>
                <p className="subtle">
                  {t(
                    "Число сотрудников с разрывом относительно личной карьерной цели.",
                  )}
                </p>
                {deficits.map((s) => (
                  <div className="skill-row" key={s.skill_id}>
                    <div>
                      <strong>{t(s.name)}</strong>
                      <span>
                        {s.count} {t("сотрудников")}
                      </span>
                    </div>
                    <Meter value={(s.count / employees.length) * 100} />
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
                            {t(e.grade)} → {t(target(e).grade)}
                          </td>
                          <td>{progress(e, history)}%</td>
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
          )}
          {tab === 5 && (
            <section className="panel import-panel">
              <span className="upload-icon">
                <Icon name={5} size={36} />
              </span>
              <h2>{t("Новые данные. Более точный путь.")}</h2>
              <p>
                {t(
                  "Выберите employees.json и activity_history.csv вместе или по отдельности.",
                )}
                <br />
                {t(
                  "Записи с существующими ID будут обновлены, новые — добавлены.",
                )}
              </p>
              <label className="button primary file-label">
                {t("Выбрать файлы")}
                <input
                  type="file"
                  multiple
                  accept=".json,.csv"
                  onChange={(e) => {
                    void importFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {t(error)}
                </p>
              )}
              <div className="import-info">
                <div>
                  <strong>{t("01 / Профили")}</strong>
                  <p>
                    {t(
                      "Объект с массивом employees или массив профилей. Используйте схему стартового датасета.",
                    )}
                  </p>
                </div>
                <div>
                  <strong>{t("02 / История")}</strong>
                  <p>
                    {t(
                      "CSV с заголовками: record_id, employee_id, event_id, date, status, completion_pct.",
                    )}
                  </p>
                </div>
                <div>
                  <strong>{t("03 / Результат")}</strong>
                  <p>
                    {t(
                      "Данные сохраняются в этом браузере. Навыки, рекомендации и HR-срез пересчитываются автоматически.",
                    )}
                  </p>
                </div>
              </div>
              <p className="subtle">
                {t("Загружено: {0} профилей · {1} записей истории", [
                  employees.length,
                  history.length,
                ])}
              </p>
            </section>
          )}
          <footer>
            <span>
              careerquest <span className="footer-dot">·</span>{" "}
              {t("Развитие со смыслом")}
            </span>
            <span>{t("Синтетические данные · HackAlem 2026")}</span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialog}
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
            <h2>{t(selected.title)}</h2>
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
                  selected.mandatory ||
                  !selected.target_roles.includes(employee.role) ||
                  !selected.target_grades.includes(employee.grade) ||
                  Object.entries(selected.prerequisites).some(
                    ([id, n]) => (current[id] ?? 0) < (n as number),
                  ) ||
                  own.some(
                    (h) =>
                      h.event_id === selected.event_id &&
                      h.status === "completed" &&
                      selected.event_id !== "EV_036",
                  ) ||
                  (selected.format !== "self_paced" &&
                    !selected.upcoming_sessions.some((d) => d >= today))
                }
                onClick={() => enroll(selected)}
              >
                {t("Добавить в план развития →")}
              </button>
            )}
            <p className="subtle">
              {t(
                "Запись доступна при соответствии роли, грейду и условиям участия. Завершённые и обязательные активности повторно не назначаются.",
              )}
            </p>
          </>
        )}
      </dialog>
    </div>
  );
}

export default function CareerApp() {
  return (
    <LocaleProvider>
      <CareerContent />
    </LocaleProvider>
  );
}
