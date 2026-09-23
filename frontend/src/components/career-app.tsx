"use client";
import { useCareer } from "@/features/career/career-context";
import { today } from "@/lib/career";
import { Icon } from "@/components/ui/primitives";
import { LocaleProvider } from "@/lib/locale-context";
import { CareerProvider } from "@/features/career/career-context";
import { EventDialog } from "@/features/catalog/event-dialog";
import { OverviewScreen } from "@/features/employee/overview";
import { TrajectoryScreen } from "@/features/employee/trajectory";
import { CatalogScreen } from "@/features/catalog/catalog";
import { HistoryScreen } from "@/features/history/history";
import { HrScreen } from "@/features/hr/hr";
import { ImportScreen } from "@/features/import/import";
function CareerContent() {
  const {
    t,
    locale,
    setLocale,
    date,
    tabs,
    employees,
    setEmployeeId,
    tab,
    notice,
    setNotice,
    employee,
    navigate,
    demoRole,
    setDemoRole,
    storageWarning,
  } = useCareer();
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
          {tabs.map(
            (name, i) =>
              (i < 4 || demoRole === "hr") && (
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
              ),
          )}
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
            <label htmlFor="demo-role">{t("Демо-роль")}</label>
            <select
              id="demo-role"
              value={demoRole}
              onChange={(e) => setDemoRole(e.target.value as "employee" | "hr")}
            >
              <option value="employee">{t("Сотрудник")}</option>
              <option value="hr">HR</option>
            </select>
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
          <p className="demo-explanation">
            {t(
              "Демонстрация на синтетических данных. Демо-роль меняет интерфейс и не является авторизацией.",
            )}
          </p>
          {storageWarning && (
            <p role="status" className="storage-warning">
              {t(
                "Браузер не сохраняет изменения. Они доступны только до закрытия страницы.",
              )}
            </p>
          )}
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
          {tab === 0 && <OverviewScreen />}
          {tab === 1 && <TrajectoryScreen />}
          {tab === 2 && <CatalogScreen />}
          {tab === 3 && <HistoryScreen />}
          {tab === 4 && demoRole === "hr" && <HrScreen />}
          {tab === 5 && demoRole === "hr" && <ImportScreen />}
          <footer>
            <span>
              careerquest <span className="footer-dot">·</span>{" "}
              {t("Развитие со смыслом")}
            </span>
            <span>{t("Синтетические данные · HackAlem 2026")}</span>
          </footer>
        </main>
      </div>
      <EventDialog />
    </div>
  );
}
export default function CareerApp() {
  return (
    <LocaleProvider>
      <CareerProvider>
        <CareerContent />
      </CareerProvider>
    </LocaleProvider>
  );
}
