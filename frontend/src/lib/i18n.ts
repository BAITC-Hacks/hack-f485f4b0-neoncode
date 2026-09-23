import ru from "./locales/ru.json";
import en from "./locales/en.json";
import kk from "./locales/kk.json";
export const locales = ["ru", "en", "kk"] as const;
export type Locale = (typeof locales)[number];
export const dictionaries: Record<Locale, Record<string, string>> = {
  ru,
  en,
  kk,
};
export const localeTags: Record<Locale, string> = {
  ru: "ru-KZ",
  en: "en-GB",
  kk: "kk-KZ",
};
export function isLocale(value: unknown): value is Locale {
  return locales.some((locale) => locale === value);
}
export function translate(
  locale: Locale,
  key: string,
  values: readonly (string | number)[] = [],
) {
  return (dictionaries[locale][key] ?? key).replace(
    /\{(\d+)\}/g,
    (match, index) => String(values[Number(index)] ?? match),
  );
}
export function formatDate(locale: Locale, value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  // Some Chromium builds lack Kazakh month names in ICU and return "M11".
  // Keep Kazakh dates consistent between the browser and server.
  if (locale === "kk" && !Number.isNaN(parsed.getTime())) {
    const months = [
      "қаңтар",
      "ақпан",
      "наурыз",
      "сәуір",
      "мамыр",
      "маусым",
      "шілде",
      "тамыз",
      "қыркүйек",
      "қазан",
      "қараша",
      "желтоқсан",
    ];
    return `${parsed.getUTCFullYear()} жылғы ${parsed.getUTCDate()} ${months[parsed.getUTCMonth()]}`;
  }
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(localeTags[locale], {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }).format(parsed);
}
