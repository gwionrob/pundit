import type { Report } from "../core/index.ts";

/** Static example bulletin shown on the landing page. Names are made up. */
export const SAMPLE_REPORT: Report = {
  kind: "gameweek",
  leagueId: 0,
  leagueName: "The Sunday Lot",
  title: "Gameweek 9 Bulletin",
  subtitle: "The Sunday Lot · league avg 52 · global avg 47",
  period: { gameweek: 9 },
  generatedAt: "2026-11-02T22:00:00.000Z",
  sections: [
    {
      heading: "🏆 Gameweek winner",
      lines: [{ segments: [{ bold: "Priya S." }, " (Kane Train) — ", { bold: "88 pts" }] }],
    },
    {
      heading: "🥄 Wooden spoon",
      lines: [{ segments: [{ bold: "Dan M." }, " (Ctrl Alt De Bruyne) — 29 pts. Rough one."] }],
    },
    {
      heading: "📈 Movers",
      lines: [
        { segments: ["⬆️ ", { bold: "Owen T." }, " up 4 places to 3rd"] },
        { segments: ["⬇️ ", { bold: "Sam K." }, " down 3 places to 8th"] },
      ],
    },
    {
      heading: "©️ Captaincy",
      lines: [
        { segments: ["Best: ", { bold: "Priya S." }, " — Haaland (C) 26 pts"] },
        { segments: ["Flop: ", { bold: "Dan M." }, " — Saka (C) 2 pts"] },
      ],
    },
    {
      heading: "🪑 Bench of shame",
      lines: [{ segments: [{ bold: "Lewis R." }, " left 21 pts on the bench"] }],
    },
    {
      heading: "📊 Top of the table",
      lines: [
        { segments: ["1. ", { bold: "Priya S." }, " — 612"] },
        { segments: ["2. ", { bold: "Lewis R." }, " — 598"] },
        { segments: ["3. ", { bold: "Owen T." }, " — 590"] },
      ],
    },
  ],
};
