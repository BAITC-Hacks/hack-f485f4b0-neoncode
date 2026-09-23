import type { Employee, History } from "./domain";
import { parseHistory, validateEmployees, validateHistory } from "./validation";
/** Read first, validate the entire batch, then let the caller commit both collections. */
export async function mergeImports(
  files: readonly File[],
  employees: Employee[],
  history: History[],
) {
  const profiles = new Map(employees.map((e) => [e.employee_id, e]));
  const records = new Map<string, unknown>(
    history.map((h) => [h.record_id, h]),
  );
  const profileIds = new Set<string>(),
    recordIds = new Set<string>();
  for (const file of files) {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".json")) {
      for (const employee of validateEmployees(JSON.parse(text))) {
        if (profileIds.has(employee.employee_id))
          throw new Error("В выбранных файлах повторяются ID записей.");
        profileIds.add(employee.employee_id);
        profiles.set(employee.employee_id, employee);
      }
    } else if (file.name.toLowerCase().endsWith(".csv")) {
      for (const record of parseHistory(text)) {
        if (recordIds.has(record.record_id))
          throw new Error("В CSV повторяются record_id.");
        recordIds.add(record.record_id);
        records.set(record.record_id, record);
      }
    } else
      throw new Error("Поддерживаются только JSON профилей и CSV истории.");
  }
  const nextEmployees = [...profiles.values()];
  const nextHistory = validateHistory([...records.values()], nextEmployees).map(
    (record) => {
      // Imported skill assessments replace the previous baseline for local completions.
      if (profileIds.has(record.employee_id)) {
        const restored = { ...record };
        delete restored.demo_completion;
        return restored;
      }
      return record;
    },
  );
  return { employees: nextEmployees, history: nextHistory };
}
