"use client";
import { useEffect, useRef, useState } from "react";
import {
  data,
  grades,
  levels,
  parseHistory,
  progress,
  recommendations,
  skillName,
  target,
  today,
  validateEmployees,
  type Employee,
  type Event,
  type History,
} from "@/lib/career";
const tabs = [
  "Обзор",
  "Моя траектория",
  "Каталог активностей",
  "История развития",
  "HR-аналитика",
  "Импорт данных",
];
const typeNames: Record<string, string> = {
  course: "Курс",
  workshop: "Воркшоп",
  mentoring: "Менторство",
  certification: "Сертификация",
  meetup: "Встреча",
  compliance: "Обязательное обучение",
  onboarding: "Онбординг",
};
const statusNames: Record<string, string> = {
  completed: "Завершено",
  in_progress: "В процессе",
  dropped: "Прервано",
  no_show: "Пропущено",
  declined: "Отказ",
  overdue: "Просрочено",
};
const formatNames: Record<string, string> = {
  online: "Онлайн",
  offline: "Очно",
  self_paced: "В своём темпе",
};
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
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label="Соответствие требованиям"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
export default function CareerApp() {
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
        setEmployees(validateEmployees(state.employees));
        if (Array.isArray(state.history)) setHistory(state.history);
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
      if (
        nextHistory.some(
          (h) =>
            !h.record_id ||
            !nextEmployees.some((e) => e.employee_id === h.employee_id) ||
            !data.events.some((e) => e.event_id === h.event_id) ||
            !statusNames[h.status] ||
            !/^\d{4}-\d{2}-\d{2}$/.test(h.date) ||
            !Number.isFinite(Number(h.completion_pct)) ||
            Number(h.completion_pct) < 0 ||
            Number(h.completion_pct) > 100,
        )
      )
        throw new Error(
          "История содержит неизвестные ID, статусы или некорректные даты и проценты.",
        );
      setEmployees(nextEmployees);
      setHistory(nextHistory);
      setNotice(
        "Данные импортированы. Профили, аналитика и рекомендации обновлены.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось прочитать файлы.");
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
            {formatNames[event.format]} <span>·</span> {event.duration_hours} ч.
          </div>
          <h3>{event.title}</h3>
          <p>
            {reason
              ? `${skillName(reason.gains[0].id)}: ${reason.gains[0].current} → ${Math.min(reason.gains[0].current + reason.gains[0].gain, 5)}. Цель — ${reason.gains[0].required}.`
              : event.description}
          </p>
          {reason && (
            <span className="pill">
              {reason.gains.some((g) => g.critical)
                ? "Для ключевого навыка"
                : "Ближе к вашей цели"}
            </span>
          )}
          <button className="card-link" onClick={() => setSelected(event)}>
            {started
              ? "В вашем плане"
              : done
                ? "Пройдено · подробнее"
                : "Подробнее"}{" "}
            <span>↗</span>
          </button>
        </div>
      </article>
    );
  }
  const catalog = data.events.filter(
    (e) =>
      (filter === "all" || e.type === filter) &&
      `${e.title} ${e.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const hrEmployees = employees.filter((e) =>
    `${e.full_name} ${e.department}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const deficits = data.skills
    .map((s) => ({
      ...s,
      count: employees.filter((e) => {
        const req = (target(e).required_skills as Partial<Record<string, number>>)[
          s.skill_id
        ];
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
            <small>ПРОСТРАНСТВО РАЗВИТИЯ</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">H</span>
          <div>
            Halyk Bank<small>Корпоративное пространство</small>
          </div>
          <span className="online-dot" />
        </div>
        <div className="nav-label">ЛИЧНОЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Главная навигация">
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
            В своём темпе.
            <br />В своём направлении.
          </strong>
          <p>Каждый небольшой шаг — часть большого пути.</p>
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
              {employee.grade} · {employee.role}
            </small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Моё развитие</span>
            <span className="slash">/</span>
            {tabs[tab]}
          </div>
          <div className="topbar-right">
            <span className="demo-tag">Демо-пространство</span>
            <span className="date-label">1 октября 2026</span>
            <span className="avatar small">{employee.full_name[0]}</span>
          </div>
        </header>
        <main>
          <div className="profile-switch">
            <label htmlFor="profile">Демо-профиль</label>
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
                  {e.full_name} · {e.grade}
                </option>
              ))}
            </select>
          </div>
          {notice && (
            <div role="status" className="notice">
              {notice}
              <button
                aria-label="Закрыть уведомление"
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
                  ? "ВАШ СЛЕДУЮЩИЙ ШАГ НАЧИНАЕТСЯ ЗДЕСЬ"
                  : "CAREER QUEST / РАЗВИТИЕ"}
              </div>
              <h1>
                {tab === 0
                  ? `Рады видеть вас, ${employee.full_name.split(" ")[0]}`
                  : tabs[tab]}
                {tab === 0 && <span className="greeting-dot">.</span>}
              </h1>
              <p>
                {
                  [
                    "Развивайте сильные стороны. Открывайте новые возможности.",
                    "Понятная цель и навыки, которые помогут к ней прийти.",
                    "Найдите подходящий формат для следующего шага.",
                    "Ваш опыт, маленькие победы и движение вперёд.",
                    "Общий взгляд на развитие команды — без рейтингов сотрудников.",
                    "Добавьте проверочные профили и историю в формате стартового датасета.",
                  ][tab]
                }
              </p>
            </div>
            {tab === 0 && (
              <button className="button secondary" onClick={() => navigate(1)}>
                Моя траектория <span>↗</span>
              </button>
            )}
          </div>
          {tab === 0 && (
            <>
              <section className="overview-grid">
                <article className="journey-card">
                  <div>
                    <span className="pill light">ВАША КАРЬЕРНАЯ ЦЕЛЬ</span>
                    <h2>
                      Следующая остановка —<br />
                      {goal.grade} {goal.role}
                    </h2>
                    <p>
                      Не просто новый грейд.
                      <br />
                      Больше уверенности, масштаба и возможностей.
                    </p>
                    <button
                      className="journey-link"
                      onClick={() => navigate(1)}
                    >
                      Посмотреть путь <span>→</span>
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
                      ВЫ НА ВЕРНОМ ПУТИ
                    </span>
                  </div>
                </article>
                <article className="progress-card">
                  <div className="section-top">
                    <h3>Готовность к цели</h3>
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
                      <span>навыков для цели</span>
                    </div>
                  </div>
                  <p>
                    {
                      requirements.filter(([id, n]) => (current[id] ?? 0) >= n)
                        .length
                    }{" "}
                    из {requirements.length} навыков на нужном уровне
                  </p>
                  <span className="subtle">
                    Рассчитано по требованиям грейда
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
                    <span>активностей завершено</span>
                  </div>
                </div>
                <div>
                  <span className="stat-icon sand">
                    <Icon name={3} />
                  </span>
                  <div>
                    <strong>{active.length}</strong>
                    <span>в процессе развития</span>
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
                    <span>ключевых навыков для роста</span>
                  </div>
                </div>
              </section>
              <div className="section-title">
                <div>
                  <div className="eyebrow green">
                    С УЧЁТОМ ВАШЕГО ОПЫТА И ЦЕЛИ
                  </div>
                  <h2>
                    Подобрано для вас{" "}
                    <span className="count">{recs.length}</span>
                  </h2>
                  <p>
                    Шаги, которые помогут сократить расстояние до следующего
                    грейда.
                  </p>
                </div>
                <button className="text-button" onClick={() => navigate(2)}>
                  Все активности →
                </button>
              </div>
              <div className="recommendation-note">
                ✧ Демо-подбор по навыкам, цели и истории. AI-сервис ещё не
                подключён.
              </div>
              <div className="event-grid">
                {recs.map((r, i) => eventCard(r.event, i, r))}
              </div>
              {!recs.length && (
                <div className="empty">
                  Подходящих новых активностей пока нет. Проверьте текущий план
                  или изучите каталог.
                </div>
              )}
              <section className="bottom-grid">
                <article className="panel">
                  <div className="section-top">
                    <h3>Навыки в фокусе</h3>
                    <button className="text-button" onClick={() => navigate(1)}>
                      Все навыки ↗
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
                  <span className="eyebrow">РАЗВИТИЕ — ЭТО ПУТЬ</span>
                  <h2>
                    Не обязательно видеть
                    <br />
                    всю лестницу.
                    <br />
                    Сделайте первый шаг.
                  </h2>
                  <p>
                    Выбирайте то, что интересно именно вам.
                    <br />
                    Ваше развитие остаётся вашим выбором.
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
                    <span className="eyebrow">{goal.role}</span>
                    <h2>Ваш путь к {goal.grade}</h2>
                  </div>
                  <strong className="green">{percent}% готовности</strong>
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
                      <strong>{g}</strong>
                      <small>
                        {g === employee.grade
                          ? "Вы здесь"
                          : g === goal.grade
                            ? "Ваша цель"
                            : "Этап карьеры"}
                      </small>
                    </div>
                  ))}
                </div>
                <p className="subtle">
                  Готовность — сумма достигнутых уровней, ограниченных
                  требованиями цели, делённая на сумму требуемых уровней. Она не
                  гарантирует повышение.
                </p>
              </section>
              <section className="panel spaced">
                <div className="section-top">
                  <h2>Карта навыков</h2>
                  <span className="pill">Шкала 0–5</span>
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
                          ? "Ключевой навык для перехода"
                          : "Дополняет вашу экспертизу"}
                        {(current[id] ?? 0) >= n ? " · Цель достигнута" : ""}
                      </small>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel spaced">
                <h2>Мой план развития</h2>
                {active.length ? (
                  active.map((h) => (
                    <div className="plan-row" key={h.record_id}>
                      <div>
                        <strong>
                          {
                            data.events.find((e) => e.event_id === h.event_id)
                              ?.title
                          }
                        </strong>
                        <p>
                          {statusNames[h.status]} · {h.completion_pct}%
                        </p>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => complete(h)}
                      >
                        Завершить в демо
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    План пока пуст. Выберите первую активность в каталоге.
                  </div>
                )}
              </section>
            </>
          )}
          {tab === 2 && (
            <>
              <div className="toolbar">
                <input
                  aria-label="Поиск активностей"
                  placeholder="Поиск по названию или теме…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="Тип активности"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Все форматы</option>
                  {Object.entries(typeNames).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <span className="subtle">Найдено: {catalog.length}</span>
              </div>
              <div className="event-grid">
                {catalog.map((e, i) => eventCard(e, i))}
              </div>
              {!catalog.length && (
                <div className="empty">
                  Ничего не найдено. Попробуйте другой запрос.
                </div>
              )}
            </>
          )}
          {tab === 3 && (
            <section className="panel">
              <div className="toolbar">
                <select
                  aria-label="Статус активности"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Все статусы</option>
                  {Object.entries(statusNames).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <span className="subtle">
                  История профиля {employee.employee_id}
                </span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Активность</th>
                      <th>Дата</th>
                      <th>Статус</th>
                      <th>Прогресс</th>
                    </tr>
                  </thead>
                  <tbody>
                    {own
                      .filter((h) => filter === "all" || h.status === filter)
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((h) => (
                        <tr key={h.record_id}>
                          <td>
                            {data.events.find((e) => e.event_id === h.event_id)
                              ?.title ?? h.event_id}
                          </td>
                          <td>{h.date}</td>
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
                  Пока нет активностей с таким статусом.
                </div>
              )}
            </section>
          )}
          {tab === 4 && (
            <>
              <div className="recommendation-note">
                Демонстрационный HR-экран на синтетических данных. Разграничение
                доступа требует серверной авторизации.
              </div>
              <section className="hr-stats">
                <article className="panel">
                  <span className="subtle">Сотрудников</span>
                  <strong>{employees.length}</strong>
                </article>
                <article className="panel">
                  <span className="subtle">Средняя готовность к цели</span>
                  <strong>
                    {Math.round(
                      employees.reduce((n, e) => n + progress(e, history), 0) /
                        employees.length,
                    )}
                    %
                  </strong>
                </article>
                <article className="panel">
                  <span className="subtle">Без завершений за 90 дней</span>
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
                <h2>Где команде нужна поддержка</h2>
                <p className="subtle">
                  Число сотрудников с разрывом относительно личной карьерной
                  цели.
                </p>
                {deficits.map((s) => (
                  <div className="skill-row" key={s.skill_id}>
                    <div>
                      <strong>{s.name}</strong>
                      <span>{s.count} сотрудников</span>
                    </div>
                    <Meter value={(s.count / employees.length) * 100} />
                  </div>
                ))}
              </section>
              <section className="panel spaced">
                <div className="toolbar">
                  <h2>Развитие команды</h2>
                  <input
                    aria-label="Поиск сотрудников"
                    placeholder="Имя или подразделение…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Сотрудник</th>
                        <th>Подразделение</th>
                        <th>Грейд → цель</th>
                        <th>Готовность</th>
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
                          <td>{e.department}</td>
                          <td>
                            {e.grade} → {target(e).grade}
                          </td>
                          <td>{progress(e, history)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!hrEmployees.length && (
                  <div className="empty">Сотрудники не найдены.</div>
                )}
              </section>
            </>
          )}
          {tab === 5 && (
            <section className="panel import-panel">
              <span className="upload-icon">
                <Icon name={5} size={36} />
              </span>
              <h2>Новые данные. Более точный путь.</h2>
              <p>
                Выберите employees.json и activity_history.csv вместе или по
                отдельности.
                <br />
                Записи с существующими ID будут обновлены, новые — добавлены.
              </p>
              <label className="button primary file-label">
                Выбрать файлы
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
                  {error}
                </p>
              )}
              <div className="import-info">
                <div>
                  <strong>01 / Профили</strong>
                  <p>
                    Объект с массивом employees или массив профилей. Используйте
                    схему стартового датасета.
                  </p>
                </div>
                <div>
                  <strong>02 / История</strong>
                  <p>
                    CSV с заголовками: record_id, employee_id, event_id, date,
                    status, completion_pct.
                  </p>
                </div>
                <div>
                  <strong>03 / Результат</strong>
                  <p>
                    Данные сохраняются в этом браузере. Навыки, рекомендации и
                    HR-срез пересчитываются автоматически.
                  </p>
                </div>
              </div>
              <p className="subtle">
                Загружено: {employees.length} профилей · {history.length}{" "}
                записей истории
              </p>
            </section>
          )}
          <footer>
            <span>
              careerquest <span className="footer-dot">·</span> Развитие со
              смыслом
            </span>
            <span>Синтетические данные · HackAlem 2026</span>
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
              aria-label="Закрыть"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <span className="pill">
              {typeNames[selected.type]} · {formatNames[selected.format]}
            </span>
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>
            <div className="detail-meta">
              <span>{selected.duration_hours} часов</span>
              <span>
                {selected.format === "self_paced"
                  ? "Можно начать в любое время"
                  : `Ближайшая сессия: ${selected.upcoming_sessions.find((d) => d >= today) ?? "не назначена"}`}
              </span>
            </div>
            <h3>Что даст эта активность</h3>
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
                <strong>Почему это подходит вам</strong>
                <p>
                  {recs
                    .find((r) => r.event.event_id === selected.event_id)!
                    .gains.map(
                      (g) =>
                        `${skillName(g.id)}: уровень ${g.current} при требуемых ${g.required}${g.critical ? " (ключевой навык)" : ""}`,
                    )
                    .join(". ")}
                  .
                </p>
                <p>
                  В этом формате завершено:{" "}
                  {
                    recs.find((r) => r.event.event_id === selected.event_id)!
                      .completed
                  }
                  ; пропусков и отказов:{" "}
                  {
                    recs.find((r) => r.event.event_id === selected.event_id)!
                      .skipped
                  }
                  . Учтены длительность и условия участия.
                </p>
              </div>
            )}
            <p className="subtle">
              Для {selected.target_grades.join(", ")} ·{" "}
              {selected.target_roles.join(", ")}
            </p>
            {Object.entries(selected.prerequisites).length > 0 && (
              <p>
                Условия:{" "}
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
                Перейти к моему плану →
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
                Добавить в план развития →
              </button>
            )}
            <p className="subtle">
              Запись доступна при соответствии роли, грейду и условиям участия.
              Завершённые и обязательные активности повторно не назначаются.
            </p>
          </>
        )}
      </dialog>
    </div>
  );
}
