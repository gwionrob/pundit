import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import "../../src/shared/styles.css";
import { ApiRequestError, keys } from "./api.ts";
import { router } from "./router.tsx";

const queryClient = new QueryClient({
  // If any request says we're logged out (e.g. the session expired), re-check who we are;
  // the route guards then send the user to /login.
  queryCache: new QueryCache({
    onError: (err) => {
      if (err instanceof ApiRequestError && err.status === 401) void queryClient.invalidateQueries({ queryKey: keys.me });
    },
  }),
  defaultOptions: {
    queries: {
      // Don't retry client errors (404, 401, validation); retry network/server errors once.
      retry: (failures, err) => !(err instanceof ApiRequestError && err.status >= 400 && err.status < 500) && failures < 1,
      refetchOnWindowFocus: false,
    },
  },
});

// React Query Devtools: dev only, lazy-loaded so they're left out of the production bundle.
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() => import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })))
  : () => null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Suspense fallback={null}>
        <ReactQueryDevtools initialIsOpen={false} />
      </Suspense>
    </QueryClientProvider>
  </StrictMode>,
);
