import { Navigate, Outlet, useLocation } from "react-router";
import { useMe } from "../api.ts";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";

/** Shown while we find out whether the visitor is logged in. */
function Loading() {
  return <p className="muted">Loading…</p>;
}

/** Only for logged-in users; everyone else goes to /login. */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Loading />;
  if (!me.data?.user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Only for visitors; logged-in users go straight to their dashboard. */
export function GuestOnly() {
  const me = useMe();
  if (me.isPending) return <Loading />;
  if (me.data?.user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/**
 * Only for admins. Everyone else (logged out included) sees the ordinary not-found page, so
 * the route gives nothing away. The real check is on the server: /api/admin 404s non-admins.
 */
export function RequireAdmin() {
  const me = useMe();
  if (me.isPending) return <Loading />;
  if (!me.data?.user?.isAdmin) return <NotFoundPage />;
  return <Outlet />;
}
