import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./provider";
import type { ImportFiles, ImportRequest } from "./client";
import type { components } from "./types";

export function useEmployee(id: string) {
  const { client, identity } = useApi();
  return useQuery({
    queryKey: ["api", identity.role, identity.employeeId, "employee", id],
    queryFn: ({ signal }) => client.employee(id, signal),
    enabled: Boolean(id),
  });
}

export function useRecommendations(id: string) {
  const { client, identity } = useApi();
  return useQuery({
    queryKey: [
      "api",
      identity.role,
      identity.employeeId,
      "recommendations",
      id,
    ],
    queryFn: ({ signal }) => client.recommendations(id, signal),
    enabled: Boolean(id),
  });
}

export function useEmployees() {
  const { client, identity } = useApi();
  return useQuery({
    queryKey: ["api", identity.role, identity.employeeId, "employees"],
    queryFn: ({ signal }) => client.employees(signal),
    enabled: identity.role === "hr",
  });
}

export function useHrSummary() {
  const { client, identity } = useApi();
  return useQuery({
    queryKey: ["api", identity.role, identity.employeeId, "summary"],
    queryFn: ({ signal }) => client.summary(signal),
    enabled: identity.role === "hr",
  });
}

export function useComplete(id: string) {
  const { client } = useApi();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (body: components["schemas"]["CompleteRequest"]) =>
      client.complete(id, body),
    // Refetch canonical state: an idempotent replay can contain an older skill snapshot.
    onSuccess: () => queries.invalidateQueries({ queryKey: ["api"] }),
  });
}

export function useImport() {
  const { client } = useApi();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportRequest | ImportFiles) => client.import(body),
    onSuccess: () => queries.invalidateQueries({ queryKey: ["api"] }),
  });
}
