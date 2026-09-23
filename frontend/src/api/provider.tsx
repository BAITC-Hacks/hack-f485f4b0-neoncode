import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createApiClient, type Identity } from "./client";

const ApiContext = createContext<{
  identity: Identity;
  client: ReturnType<typeof createApiClient>;
} | null>(null);

export function ApiProvider({
  identity,
  children,
}: {
  identity: Identity;
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  const [value] = useState(() => ({
    identity,
    client: createApiClient(identity),
  }));
  useEffect(() => () => queryClient.clear(), [queryClient]);
  return (
    <ApiContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApi() {
  const context = useContext(ApiContext);
  if (!context) throw new Error("ApiProvider is required");
  return context;
}
