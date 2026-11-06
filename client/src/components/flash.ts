import { useLocation } from "react-router";
import type { Flash } from "./Notice.tsx";

/**
 * Flash messages that survive a navigation, e.g. "League removed" after redirecting to the
 * dashboard. Pass them as router state: navigate("/dashboard", { state: flashState(...) }).
 */
export function flashState(kind: Flash["kind"], text: string): { flash: Flash } {
  return { flash: { kind, text } };
}

/** The flash message passed to the current page, if any. */
export function useRouteFlash(): Flash | null {
  const location = useLocation();
  const state = location.state as { flash?: Flash } | null;
  return state?.flash ?? null;
}
