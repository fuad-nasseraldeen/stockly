import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Many of our core resources (tenants, settings, suppliers, categories)
      // change infrequently. Treat them as warm cache for a few minutes to
      // avoid repeat network calls on every mount and speed up post-login UX.
      staleTime: 5 * 60 * 1000,
    },
  },
});

export function ReactQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
