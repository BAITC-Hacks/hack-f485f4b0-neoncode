"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { formatDate, isLocale, translate, type Locale } from "./i18n";
const storageKey = "career-quest-locale";
type LocaleContextValue = {
  locale: Locale;
  setLocale: (value: Locale) => void;
  t: (key: string, values?: readonly (string | number)[]) => string;
  date: (value: string) => string;
};
const LocaleContext = createContext<LocaleContextValue | null>(null);
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("ru");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      // Restore the browser preference after the matching server/client first render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isLocale(saved)) updateLocale(saved);
    } catch {
      /* Language switching still works when browser storage is disabled. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, "ÖSU — ваше развитие");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        translate(locale, "Осмысленные шаги к следующему этапу карьеры"),
      );
  }, [locale]);
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale(next) {
        updateLocale(next);
        try {
          localStorage.setItem(storageKey, next);
        } catch {
          /* Keep the session usable without storage. */
        }
      },
      t: (key, values) => translate(locale, key, values),
      date: (value) => formatDate(locale, value),
    }),
    [locale],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale requires LocaleProvider");
  return context;
}
