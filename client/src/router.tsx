import { createBrowserRouter } from "react-router";
import { AppLayout } from "./components/AppLayout.tsx";
import { GuestOnly, RequireAuth } from "./components/guards.tsx";
import { AuthPage } from "./pages/AuthPage.tsx";
import { ChannelsPage } from "./pages/ChannelsPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { LeagueSettingsPage } from "./pages/LeagueSettingsPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { ReportPage } from "./pages/ReportPage.tsx";

/**
 * Every page of the logged-in app. "/" (landing) and "/r/:slug" (public bulletin) are
 * server-rendered by Hono and aren't part of this router.
 */
export const routes = [
  {
    element: <AppLayout />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: "/login", element: <AuthPage mode="login" /> },
          { path: "/signup", element: <AuthPage mode="signup" /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/leagues/:id", element: <LeagueSettingsPage /> },
          { path: "/channels", element: <ChannelsPage /> },
        ],
      },
      // Viewable logged out too (the API decides what an owner sees extra).
      { path: "/reports/:slug", element: <ReportPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
