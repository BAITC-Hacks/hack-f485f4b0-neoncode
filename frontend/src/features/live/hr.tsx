import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEmployees, useHrSummary } from "@/api/hooks";
import { ErrorState, Loading, recommendationLabels } from "./states";
import type { components } from "@/api/types";

function DeficiencyChart({
  items,
}: {
  items: components["schemas"]["SkillDeficiency"][];
}) {
  if (!items.length)
    return <p className="api-empty">Дефициты следующего грейда не найдены.</p>;

  return (
    <div
      className="api-chart"
      role="img"
      aria-label="Количество сотрудников с дефицитом по навыкам"
    >
      <ResponsiveContainer width="100%" height={Math.max(240, items.length * 48)}>
        <BarChart
          data={items}
          layout="vertical"
          margin={{ top: 8, right: 24, bottom: 8, left: 16 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            formatter={(value) => [value, "Сотрудников не дотягивают"]}
          />
          <Bar
            dataKey="employees_affected"
            name="Сотрудников не дотягивают"
            fill="#008a5b"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HrScreen() {
  const summary = useHrSummary();
  return (
    <>
      <header className="api-page-heading">
        <div>
          <p className="subtle">Сводка без рейтингов сотрудников</p>
          <h1>Развитие команды</h1>
        </div>
        <Link className="button secondary" to="/hr/import">
          Импорт данных
        </Link>
      </header>
      {summary.isPending && <Loading label="Загрузка HR-сводки" />}
      {summary.isError && (
        <ErrorState
          error={summary.error}
          retry={() => void summary.refetch()}
        />
      )}
      {summary.data && (
        <>
          <dl className="api-totals">
            <div><dt>Сотрудники</dt><dd>{summary.data.total_employees}</dd></div>
            <div><dt>События</dt><dd>{summary.data.total_events}</dd></div>
            <div><dt>Завершённые участия</dt><dd>{summary.data.completed_activities}</dd></div>
          </dl>
          <section className="api-section">
            <h2>Проседающие навыки</h2>
            <p className="subtle">
              Сколько сотрудников пока не дотягивают до требований следующего грейда.
            </p>
            <DeficiencyChart items={summary.data.next_grade_skill_gaps} />
          </section>
          <section className="api-section">
            <h2>Без рекомендованного шага</h2>
            <div className="api-columns">
              {(["requirements_met", "no_suitable_event"] as const).map(
                (status) => (
                  <div key={status}>
                    <h3>{recommendationLabels[status]}</h3>
                    {!summary.data.employees_without_step[status].length ? (
                      <p className="api-empty">Нет сотрудников.</p>
                    ) : (
                      <ul className="api-people">
                        {summary.data.employees_without_step[status].map(
                          (employee) => (
                            <li key={employee.employee_id}>
                              <Link
                                to={`/hr/employees/${encodeURIComponent(employee.employee_id)}`}
                              >
                                {employee.full_name ?? employee.employee_id}
                              </Link>
                              <span>
                                {employee.role} · {employee.grade}
                                {employee.next_grade === null
                                  ? " · следующего грейда нет"
                                  : ` → ${employee.next_grade}`}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                ),
              )}
            </div>
          </section>
          <section className="api-section">
            <h2>Участие в активностях</h2>
            {!summary.data.participation_by_event.length ? (
              <p className="api-empty">Данных об участии пока нет.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Событие</th><th>Записано</th><th>Завершено</th>
                      <th>Пропущено</th><th>Отказ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.data.participation_by_event.map((item) => (
                      <tr key={item.event_id}>
                        <td>{item.title ?? item.event_id}</td>
                        <td>{item.enrolled}</td>
                        <td>{item.completed}</td>
                        <td>{item.missed}</td>
                        <td>{item.declined}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

export function EmployeesScreen() {
  const employees = useEmployees();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const roles = Array.from(
    new Set(employees.data?.employees.map((employee) => employee.role) ?? []),
  ).sort((a, b) => a.localeCompare(b));
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered =
    employees.data?.employees.filter(
      (employee) =>
        (!normalizedSearch ||
          employee.employee_id.toLocaleLowerCase().includes(normalizedSearch)) &&
        (!role || employee.role === role),
    ) ?? [];

  return (
    <>
      <header className="api-page-heading">
        <div>
          <p className="subtle">Поиск без ранжирования</p>
          <h1>Сотрудники</h1>
        </div>
      </header>
      {employees.isPending && <Loading label="Загрузка списка сотрудников" />}
      {employees.isError && (
        <ErrorState
          error={employees.error}
          retry={() => void employees.refetch()}
        />
      )}
      {employees.data && !employees.data.employees.length && (
        <p className="api-empty">Сотрудников пока нет.</p>
      )}
      {employees.data && employees.data.employees.length > 0 && (
        <>
          <div className="api-filters">
            <label>
              Поиск по ID
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Например, EMP_001"
              />
            </label>
            <label>
              Роль
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="">Все роли</option>
                {roles.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          {!filtered.length ? (
            <p className="api-empty">По заданным условиям сотрудники не найдены.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>ID</th><th>Роль</th><th>Грейд</th><th>Статус рекомендаций</th></tr>
                </thead>
                <tbody>
                  {filtered.map((employee) => (
                    <tr key={employee.employee_id}>
                      <td>
                        <Link to={`/hr/employees/${encodeURIComponent(employee.employee_id)}`}>
                          {employee.employee_id}
                        </Link>
                      </td>
                      <td>{employee.role}</td>
                      <td>{employee.grade}</td>
                      <td>{recommendationLabels[employee.recommendation_status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
