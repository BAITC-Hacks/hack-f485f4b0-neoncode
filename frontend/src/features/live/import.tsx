import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Upload } from "lucide-react";
import { ApiError, type ImportRequest } from "@/api/client";
import { useImport } from "@/api/hooks";
import { ErrorState } from "./states";

export function ImportScreen() {
  const mutation = useImport();
  const [mode, setMode] = useState<"json" | "files">("json");
  const [json, setJson] = useState('{"employees": [], "history": []}');
  const [employees, setEmployees] = useState<File>();
  const [history, setHistory] = useState<File>();
  const [error, setError] = useState<Error>();
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);

  function employeeIds(value: unknown): string[] {
    if (!value || typeof value !== "object") return [];
    const records = (value as { employees?: unknown }).employees;
    if (!Array.isArray(records)) return [];
    return records.flatMap((record) =>
      record &&
      typeof record === "object" &&
      typeof (record as { employee_id?: unknown }).employee_id === "string"
        ? [(record as { employee_id: string }).employee_id]
        : [],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    setError(undefined);
    mutation.reset();
    if (mode === "files") {
      if (!employees || !history) {
        setError(
          new ApiError(422, "Выберите оба файла.", [
            ...(!employees
              ? [{ path: "employees_file", message: "Обязательный файл" }]
              : []),
            ...(!history
              ? [{ path: "history_file", message: "Обязательный файл" }]
              : []),
          ]),
        );
        return;
      }
      try {
        setSubmittedIds(employeeIds(JSON.parse(await employees.text())));
      } catch {
        setSubmittedIds([]);
      }
      mutation.mutate({ employees_file: employees, history_file: history });
    } else {
      try {
        const body = JSON.parse(json) as ImportRequest;
        if (body === null || typeof body !== "object" || Array.isArray(body))
          throw new Error();
        setSubmittedIds(employeeIds(body));
        mutation.mutate(body);
      } catch {
        setError(
          new ApiError(
            422,
            "Некорректный JSON. Ожидается объект employees + history.",
            [{ path: "body", message: "Проверьте JSON" }],
          ),
        );
      }
    }
  }
  return (
    <>
      <header className="api-page-heading">
        <h1>Импорт данных</h1>
        <Link to="/hr">К списку сотрудников</Link>
      </header>
      <form className="api-import" onSubmit={submit}>
        <fieldset disabled={mutation.isPending}>
          <legend>Формат</legend>
          <div className="api-mode">
            {(["json", "files"] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="format"
                  checked={mode === value}
                  onChange={() => {
                    setMode(value);
                    mutation.reset();
                    setError(undefined);
                  }}
                />
                {value === "json" ? "JSON" : "Файлы"}
              </label>
            ))}
          </div>
          {mode === "json" ? (
            <label className="api-field">
              Данные employees + history
              <textarea
                spellCheck={false}
                rows={14}
                value={json}
                onChange={(event) => setJson(event.target.value)}
              />
            </label>
          ) : (
            <div className="api-file-fields">
              <label className="api-field">
                employees_file (JSON)
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => setEmployees(event.target.files?.[0])}
                />
              </label>
              <label className="api-field">
                history_file (CSV или JSON)
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  onChange={(event) => setHistory(event.target.files?.[0])}
                />
              </label>
            </div>
          )}
          <button type="submit" className="button primary">
            <Upload size={16} aria-hidden="true" />
            {mutation.isPending ? "Импортируем…" : "Импортировать"}
          </button>
        </fieldset>
      </form>
      {(error || mutation.error) && (
        <ErrorState error={(error || mutation.error)!} />
      )}
      {mutation.isPending && <p role="status">Сохраняем профили и историю…</p>}
      {mutation.data && (
        <section className="api-import-result" aria-labelledby="import-result-title">
          <div className="api-success" role="status">
            <div>
              <h2 id="import-result-title">Импорт завершён</h2>
              <p>
                Создано сотрудников: {mutation.data.employees_created}; обновлено:{" "}
                {mutation.data.employees_updated}. История: добавлено{" "}
                {mutation.data.history_created}, обновлено{" "}
                {mutation.data.history_updated}.
              </p>
            </div>
          </div>
          {submittedIds.length ? (
            <>
              <h3>Добавленные и обновлённые профили</h3>
              <ul className="api-people">
                {submittedIds.map((id) => (
                  <li key={id}>
                    <Link to={`/hr/employees/${encodeURIComponent(id)}`}>
                      {id}
                    </Link>
                    <span>Открыть профиль и рекомендации</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="api-empty">
              API вернул только итоговые количества; идентификаторы профилей в
              загруженном файле прочитать не удалось.
            </p>
          )}
        </section>
      )}
    </>
  );
}
