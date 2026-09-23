import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ÖSU — ваше развитие",
  description: "Осмысленные шаги к следующему этапу карьеры",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
