"use client";
import { useLocale } from "@/lib/locale-context";
export function Icon({ name, size = 20 }: { name: number; size?: number }) {
  const paths = [
    "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    "M5 20V10m7 10V4m7 16v-7M3 7l7-5 6 6 5-3",
    "M4 4h6l2 2 2-2h6v15h-6l-2 2-2-2H4z M12 6v15",
    "M4 5v5h5 M4 10a8 8 0 1 1 0 5 M12 7v5l3 2",
    "M4 20V9h4v11m4 0V3h4v17m4 0V12h2v8",
    "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name % paths.length]} />
    </svg>
  );
}
export function Meter({ value, label }: { value: number; label?: string }) {
  const { t } = useLocale();
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label ?? t("Соответствие требованиям")}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
