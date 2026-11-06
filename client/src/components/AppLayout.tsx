import { Link, Outlet, useNavigate } from "react-router";
import { GuestNav, PageShell } from "../../../src/shared/components/PageShell.tsx";
import { useLogout, useMe } from "../api.ts";
import { FlashNotice } from "./Notice.tsx";
import { useRouteFlash } from "./flash.ts";

/** Header + footer around every SPA page. The page itself renders in <Outlet />. */
export function AppLayout() {
  const me = useMe();
  const flash = useRouteFlash();
  const loggedIn = Boolean(me.data?.user);

  return (
    <PageShell
      brandHref={loggedIn ? "/dashboard" : "/"}
      brand={
        loggedIn ? (
          <Link className="brand" to="/dashboard">
            <span className="mark">P</span> Pundit
          </Link>
        ) : undefined
      }
      nav={loggedIn ? <UserNav /> : <GuestNav />}
      notice={<FlashNotice flash={flash} />}
    >
      <Outlet />
    </PageShell>
  );
}

function UserNav() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  const onLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => navigate("/login", { replace: true }),
    });

  return (
    <>
      <Link to="/dashboard">Leagues</Link>
      <Link to="/channels">Channels</Link>
      {me.data?.user?.isAdmin && <Link to="/admin">Admin</Link>}
      <button type="button" onClick={onLogout} disabled={logout.isPending}>
        Log out
      </button>
    </>
  );
}
