"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale } from "@/lib/locale-context";

/** A short, skippable opening. CSS also clears it if hydration is unavailable. */
export function OpeningExperience({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(true);
  const content = useRef<HTMLDivElement>(null);
  const opening = useRef<HTMLElement>(null);
  const skip = useRef<HTMLButtonElement>(null);

  const finish = useCallback(() => {
    const page = content.current;
    page?.removeAttribute("inert");
    if (opening.current?.contains(document.activeElement)) {
      page?.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) {
      // Resolve the browser-only preference after the matching server render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(false);
      return;
    }
    const page = content.current;
    const previousOverflow = document.body.style.overflow;
    page?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    skip.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    const onMotion = () => {
      if (motion.matches) finish();
    };
    const timer = window.setTimeout(finish, 2800);
    document.addEventListener("keydown", onKey);
    motion.addEventListener("change", onMotion);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      motion.removeEventListener("change", onMotion);
      page?.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
    };
  }, [visible, finish]);

  return (
    <div className="opening-experience">
      {visible && (
        <section
          className="opening"
          ref={opening}
          aria-label={t("Добро пожаловать в ÖSU")}
        >
          <div className="opening-top">
            <span className="opening-wordmark">ÖSU</span>
            <span className="opening-edition">
              Halyk Bank · {t("Пространство развития")}
            </span>
          </div>
          <svg
            className="opening-drawing"
            viewBox="0 0 1440 900"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            <path
              className="opening-trail"
              pathLength="1"
              d="M-80 750C170 890 140 500 340 600S660 880 775 555 1050 480 1100 260 1310 40 1510 180"
            />
            <path
              className="opening-trail echo"
              pathLength="1"
              d="M-80 770C160 900 155 520 345 620S680 900 794 568 1066 489 1118 267 1320 60 1510 199"
            />
            <g className="opening-flower" transform="translate(1140 550)">
              <path d="M0-115C40-120 32-42 14-19 60-72 106-79 114-48S70 6 25 9C95 17 117 47 99 73S34 55 9 28C44 92 26 122-4 119S-28 55-19 26C-58 83-104 81-114 52S-60 8-28 5C-93-6-121-39-97-66S-35-42-13-21C-39-78-33-112 0-115Z" />
              <circle r="14" />
            </g>
            <circle className="opening-sun" cx="334" cy="598" r="13" />
            <path
              className="opening-arrow"
              d="m1300 140 28-22-4 35m4-35-47 64"
            />
          </svg>
          <div className="opening-copy">
            <span className="opening-kicker">
              {t("БОЛЬШОЕ НАЧИНАЕТСЯ С МАЛОГО")}
            </span>
            <h2>
              <span>{t("Ваш путь.")}</span>
              <em>{t("Ваш почерк.")}</em>
            </h2>
            <p>{t("Каждый небольшой шаг — часть большого пути.")}</p>
          </div>
          <div className="opening-bottom">
            <span className="opening-caption">
              <span />
              {t("В своём темпе. В своём направлении.")}
            </span>
            <button ref={skip} type="button" onClick={finish}>
              {t("Перейти к пространству")} <span aria-hidden="true">↗</span>
            </button>
          </div>
        </section>
      )}
      <div ref={content}>{children}</div>
    </div>
  );
}
