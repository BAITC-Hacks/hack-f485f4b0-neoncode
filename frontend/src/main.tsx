import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import LiveApp from "@/features/live/app";
import "@/app/globals.css";

const Demo = lazy(() => import("@/components/career-app"));

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Suspense fallback={<p role="status">Загрузка…</p>}>
      <Routes>
        <Route path="/demo" element={<Demo />} />
        <Route path="/*" element={<LiveApp />} />
      </Routes>
    </Suspense>
  </BrowserRouter>,
);
