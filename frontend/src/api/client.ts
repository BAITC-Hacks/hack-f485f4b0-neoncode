import type { components, paths } from "./types";

export type Identity = { role: "employee" | "hr"; employeeId: string };
export type ImportRequest =
  paths["/api/import"]["post"]["requestBody"]["content"]["application/json"];
export type ImportFiles = {
  [
    K in keyof paths["/api/import"]["post"]["requestBody"]["content"]["multipart/form-data"]
  ]: File;
};
export type FieldError = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: FieldError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validationMessage(message: string): string {
  if (message === "Field required") return "Обязательное поле";
  if (message === "Extra inputs are not permitted") return "Неизвестное поле";
  return message;
}

export function responseError(status: number, body: unknown): ApiError {
  const detail = isRecord(body) ? body.detail : undefined;
  const messages: Record<number, string> = {
    400: "Запрос отклонён. Проверьте данные и доступность события.",
    401: "Не удалось определить пользователя. Выберите роль и сотрудника.",
    403: "Нет доступа. Сотрудник может просматривать только свой профиль; раздел HR доступен роли HR.",
    404: "Сотрудник или событие не найдены.",
    409: "Не удалось повторить завершение. Обратитесь к HR.",
    413: "Файл слишком большой. Максимальный размер: 10 МиБ.",
    415: "Неподдерживаемый формат. Выберите JSON или файлы датасета.",
    422: "Проверьте отмеченные поля.",
  };
  const fields: FieldError[] = [];
  if (status === 422 && Array.isArray(detail)) {
    for (const issue of detail) {
      if (!isRecord(issue) || typeof issue.msg !== "string") continue;
      const location = Array.isArray(issue.loc)
        ? issue.loc.filter(
            (part) => typeof part === "string" || typeof part === "number",
          )
        : [];
      if (location[0] === "body") location.shift();
      fields.push({
        path: location.join(".") || "body",
        message: validationMessage(issue.msg),
      });
    }
  }
  return new ApiError(
    status,
    status >= 500
      ? "Сервер временно недоступен. Повторите запрос позже."
      : (messages[status] ??
          (typeof detail === "string"
            ? detail
            : "Не удалось выполнить запрос.")),
    fields,
  );
}

type Schemas = components["schemas"];

export function createApiClient(
  identity: Identity,
  baseUrl = import.meta.env.VITE_API_URL || "/api",
) {
  const base = baseUrl.replace(/\/+$/, "");
  async function request<T>(
    path: string,
    options: {
      method?: "GET" | "POST";
      body?: unknown;
      signal?: AbortSignal;
    } = {},
  ): Promise<T> {
    const headers = new Headers({
      Accept: "application/json",
      "X-Role": identity.role,
      "X-Employee-Id": identity.employeeId,
    });
    const multipart = options.body instanceof FormData;
    if (options.body !== undefined && !multipart)
      headers.set("Content-Type", "application/json");
    const deadline = AbortSignal.timeout(15_000);
    const signal = options.signal
      ? AbortSignal.any([options.signal, deadline])
      : deadline;
    try {
      const response = await fetch(`${base}${path}`, {
        method: options.method ?? "GET",
        headers,
        body:
          options.body === undefined
            ? undefined
            : multipart
              ? (options.body as FormData)
              : JSON.stringify(options.body),
        signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw responseError(response.status, body);
      if (body === null)
        throw new ApiError(502, "Сервер вернул некорректный ответ.");
      return body as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (options.signal?.aborted) throw error;
      throw new ApiError(
        0,
        deadline.aborted
          ? "Сервер не ответил вовремя. Повторите запрос."
          : "Нет связи с сервером. Проверьте подключение и повторите запрос.",
      );
    }
  }
  const employeePath = (id: string) => `/employees/${encodeURIComponent(id)}`;
  return {
    employee: (id: string, signal?: AbortSignal) =>
      request<Schemas["EmployeeProfile"]>(employeePath(id), { signal }),
    recommendations: (id: string, signal?: AbortSignal) =>
      request<Schemas["RecommendationsResponse"]>(
        `${employeePath(id)}/recommendations`,
        { signal },
      ),
    complete: (id: string, body: Schemas["CompleteRequest"]) =>
      request<Schemas["CompletionResponse"]>(`${employeePath(id)}/complete`, {
        method: "POST",
        body,
      }),
    employees: (signal?: AbortSignal) =>
      request<Schemas["EmployeesResponse"]>("/employees", { signal }),
    summary: (signal?: AbortSignal) =>
      request<Schemas["HRSummaryResponse"]>("/hr/summary", { signal }),
    import: (body: ImportRequest | ImportFiles) => {
      if ("employees_file" in body) {
        const form = new FormData();
        form.set("employees_file", body.employees_file);
        form.set("history_file", body.history_file);
        return request<Schemas["ImportResponse"]>("/import", {
          method: "POST",
          body: form,
        });
      }
      return request<Schemas["ImportResponse"]>("/import", {
        method: "POST",
        body,
      });
    },
  };
}
