"use client";
import { useCareer } from "@/features/career/career-context";
import { Icon } from "@/components/ui/primitives";
export function ImportScreen() {
  const { t, employees, history, error, importFiles, importing, ready } =
    useCareer();

  return (
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
        {t("Записи с существующими ID будут обновлены, новые — добавлены.")}
      </p>
      <label className="button primary file-label">
        {t(importing ? "Импортируем данные…" : "Выбрать файлы")}
        <input
          type="file"
          disabled={importing || !ready}
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
  );
}
