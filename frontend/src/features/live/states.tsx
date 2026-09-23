import { RefreshCw } from "lucide-react";
import { ApiError } from "@/api/client";

export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div className="api-error" role="alert">
      <p>{error.message}</p>
      {error instanceof ApiError && error.fields.length > 0 && (
        <ul>
          {error.fields.map((field, i) => (
            <li key={`${field.path}-${i}`}>
              <code>{field.path}</code>: {field.message}
            </li>
          ))}
        </ul>
      )}
      {retry && (
        <button className="button secondary" onClick={retry}>
          <RefreshCw size={16} aria-hidden="true" /> Повторить
        </button>
      )}
    </div>
  );
}

export function Loading({ label = "Загрузка" }: { label?: string }) {
  return (
    <div className="api-skeleton" role="status" aria-label={label}>
      <span />
      <span />
      <span />
      <span className="api-sr-only">{label}</span>
    </div>
  );
}

export const recommendationLabels = {
  ready: "Есть рекомендованный шаг",
  requirements_met: "Требования следующего грейда закрыты",
  no_suitable_event: "Подходящих событий нет",
};

export const historyLabels = {
  completed: "Завершено",
  in_progress: "В процессе",
  no_show: "Пропущено",
  declined: "Отказ",
  dropped: "Прервано",
  overdue: "Просрочено",
};
