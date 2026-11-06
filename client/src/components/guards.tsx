import { Navigate, Outlet, useLocation } from "react-router";
import { useMe } from "../api.ts";

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
