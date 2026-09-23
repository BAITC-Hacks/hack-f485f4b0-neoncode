import { createContext, useContext, useState, type ReactNode } from "react";
import { ApiProvider } from "@/api/provider";
import type { Identity } from "@/api/client";

export const SESSION_KEY = "career-quest-api-session-v1";
type Session = Identity & { employeeIds: string[] };
function validId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length <= 128 && /^\S+$/.test(value)
  );
}
const configuredEmployeeId = import.meta.env.VITE_DEFAULT_EMPLOYEE_ID;
const defaultEmployeeId = validId(configuredEmployeeId)
  ? configuredEmployeeId
  : "SYN_E001";
const empty: Session = {
  role: "employee",
  employeeId: defaultEmployeeId,
  employeeIds: [defaultEmployeeId],
};
function restore(): { session: Session; warning: boolean } {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return { session: empty, warning: false };
    const value = JSON.parse(raw);
    if (
      (value.role !== "hr" && value.role !== "employee") ||
      (value.employeeId !== "" && !validId(value.employeeId)) ||
      !Array.isArray(value.employeeIds) ||
      !value.employeeIds.every(validId)
    ) {
      return { session: empty, warning: true };
    }
    const session: Session = value;
    if (session.role === "employee" && !session.employeeId) {
      return {
        session: {
          ...session,
          employeeId: defaultEmployeeId,
          employeeIds: Array.from(
            new Set([defaultEmployeeId, ...session.employeeIds]),
          ),
        },
        warning: false,
      };
    }
    return { session, warning: false };
  } catch {
    return { session: empty, warning: true };
  }
}
const SessionContext = createContext<{
  session: Session;
  warning: boolean;
  update: (change: Partial<Session>) => void;
} | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(restore);
  function update(change: Partial<Session>) {
    const session = { ...state.session, ...change };
    let warning = state.warning;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      warning = true;
    }
    setState({ session, warning });
  }
  const identity: Identity = {
    role: state.session.role,
    employeeId:
      state.session.role === "hr" ? "DEMO_HR" : state.session.employeeId,
  };
  return (
    <SessionContext.Provider value={{ ...state, update }}>
      <ApiProvider
        key={`${identity.role}:${identity.employeeId}`}
        identity={identity}
      >
        {children}
      </ApiProvider>
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("SessionProvider is required");
  return context;
}
