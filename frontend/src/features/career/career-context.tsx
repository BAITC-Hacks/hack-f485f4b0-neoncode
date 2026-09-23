"use client";
import { createContext, useContext, type ReactNode } from "react";
import { useCareerState } from "./use-career-state";
const Context = createContext<ReturnType<typeof useCareerState> | null>(null);
export function CareerProvider({ children }: { children: ReactNode }) {
  const state = useCareerState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useCareer() {
  const value = useContext(Context);
  if (!value) throw new Error("CareerProvider is required");
  return value;
}
