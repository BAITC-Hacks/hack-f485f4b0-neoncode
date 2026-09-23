import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { ContactRound, UserRound, UsersRound, Upload } from "lucide-react";
import { useEmployees } from "@/api/hooks";
import { SessionProvider, useSession } from "./session";
import { EmployeeScreen } from "./employee";
import { EmployeesScreen, HrScreen } from "./hr";
import { ImportScreen } from "./import";
import { ErrorState } from "./states";
import { ApiError } from "@/api/client";
import "./live.css";

function Layout() {
  const { session, update, warning } = useSession();
  const employees = useEmployees();
  const navigate = useNavigate();
  const available =
    employees.data?.employees.map((employee) => ({
      id: employee.employee_id,
      label: `${employee.full_name ?? employee.employee_id} (${employee.employee_id})`,
    })) ?? session.employeeIds.map((id) => ({ id, label: id }));
  const choices =
    available.some((choice) => choice.id === session.employeeId) ||
    !session.employeeId
      ? available
      : [{ id: session.employeeId, label: session.employeeId }, ...available];
  function changeRole(role: "employee" | "hr") {
    const employeeId = session.employeeId || available[0]?.id || "";
    update({
      role,
      employeeId,
      employeeIds: choices.map((choice) => choice.id),
    });
    navigate(role === "hr" ? "/hr" : "/me");
  }
  return (
    <div className="api-app">
      <header className="api-header">
        <NavLink className="brand" to={session.role === "hr" ? "/hr" : "/me"}>
          <span className="brand-mark">Ö</span>
          <span>ÖSU</span>
        </NavLink>
        <div className="api-controls">
          <div className="api-segmented" role="group" aria-label="Демо-роль">
            <button
              aria-pressed={session.role === "employee"}
              onClick={() => changeRole("employee")}
            >
              <UserRound size={16} aria-hidden="true" />
              Сотрудник
            </button>
            <button
              aria-pressed={session.role === "hr"}
              onClick={() => changeRole("hr")}
            >
              <UsersRound size={16} aria-hidden="true" />
              HR
            </button>
          </div>
          <label className="api-select">
            Сотрудник
            <select
              aria-label="Выбор сотрудника"
              value={session.employeeId}
              disabled={session.role === "hr" && employees.isPending}
              onChange={(event) => {
                update({
                  employeeId: event.target.value,
                  employeeIds: choices.map((choice) => choice.id),
                });
                if (session.role === "employee") navigate("/me");
              }}
            >
              <option value="" disabled>
                {employees.isLoading ? "Загрузка…" : "Выберите сотрудника"}
              </option>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <div className="api-layout">
        <nav className="api-nav" aria-label="Навигация">
          <NavLink to="/me">
            <UserRound size={18} aria-hidden="true" />
            Мой профиль
          </NavLink>
          {session.role === "hr" && (
            <>
              <NavLink to="/hr" end>
                <UsersRound size={18} aria-hidden="true" />
                Сводка
              </NavLink>
              <NavLink to="/hr/employees" end>
                <ContactRound size={18} aria-hidden="true" />
                Сотрудники
              </NavLink>
              <NavLink to="/hr/import">
                <Upload size={18} aria-hidden="true" />
                Импорт
              </NavLink>
            </>
          )}
        </nav>
        <main className="api-main">
          {warning && (
            <p className="api-warning" role="status">
              Хранилище браузера недоступно или повреждено. Выбор действует в
              текущей сессии.
            </p>
          )}
          {employees.isError && session.role === "hr" && (
            <ErrorState
              error={employees.error}
              retry={() => void employees.refetch()}
            />
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function MyProfile() {
  const { session } = useSession();
  return <EmployeeScreen key={session.employeeId} id={session.employeeId} />;
}
function HrEmployee() {
  const { id = "" } = useParams();
  return <EmployeeScreen key={id} id={id} />;
}
function HrOnly() {
  const { session } = useSession();
  return session.role === "hr" ? (
    <Outlet />
  ) : (
    <ErrorState error={new ApiError(403, "Раздел доступен только роли HR.")} />
  );
}
function Start() {
  const { session } = useSession();
  return <Navigate replace to={session.role === "hr" ? "/hr" : "/me"} />;
}
export default function LiveApp() {
  return (
    <SessionProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Start />} />
          <Route path="me" element={<MyProfile />} />
          <Route element={<HrOnly />}>
            <Route path="hr" element={<HrScreen />} />
            <Route path="hr/employees" element={<EmployeesScreen />} />
            <Route path="hr/employees/:id" element={<HrEmployee />} />
            <Route path="hr/import" element={<ImportScreen />} />
          </Route>
          <Route
            path="*"
            element={
              <div className="api-empty">
                <h1>Страница не найдена</h1>
                <NavLink to="/me">К профилю</NavLink>
              </div>
            }
          />
        </Route>
      </Routes>
    </SessionProvider>
  );
}
