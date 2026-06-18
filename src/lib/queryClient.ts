import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data "fresh" for 30s so quick navigations don't refetch.
      staleTime: 30_000,
      // Keep cached data around for 5min after the last consumer unmounts.
      gcTime: 5 * 60 * 1000,
      // We already trigger refetches on tab visibility where it matters
      // (home screen). Default focus refetches add noise without help.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
