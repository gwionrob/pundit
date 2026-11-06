import type { ReportKind } from "../../src/shared/api.ts";

export const KIND_LABEL: Record<ReportKind, string> = { gameweek: "Gameweek", monthly: "Monthly", standings: "Standings" };

/** "6 Nov, 14:05" in UK time, matching the server-rendered pages. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}
