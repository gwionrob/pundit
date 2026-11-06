import type { LeaguesResponse, MeResponse, ReportResponse } from "../../src/shared/api.ts";

export const REPORT: ReportResponse = {
  slug: "abc123",
  url: "https://pundit.example/r/abc123",
  report: {
    kind: "gameweek",
    leagueId: 1,
    leagueName: "The Sunday Lot",
    title: "Gameweek 9 Bulletin",
    period: { gameweek: 9 },
    sections: [{ heading: "🏆 Gameweek winner", lines: [{ segments: [{ bold: "Priya" }, " — 88 pts"] }] }],
    generatedAt: "2026-11-02T22:00:00.000Z",
  },
  text: { whatsapp: "*Gameweek 9 Bulletin*\n\n*🏆 Gameweek winner*\n*Priya* — 88 pts", plain: "Gameweek 9 Bulletin" },
  html: "<h2>Gameweek 9 Bulletin</h2><section><h3>🏆 Gameweek winner</h3><p><b>Priya</b> — 88 pts</p></section>",
  whatsappUrl: "https://wa.me/?text=%2AGameweek%209%20Bulletin%2A",
  createdAt: "2026-11-02T22:00:00.000Z",
};

export const FEATURES: MeResponse["features"] = { telegram: false, telegramBotUsername: null, email: false };

export const ME: MeResponse = {
  user: { id: 1, email: "me@example.com", plan: "free", limits: { maxLeagues: 3 } },
  features: FEATURES,
};

export const NO_LEAGUES: LeaguesResponse = { leagues: [], limits: { maxLeagues: 3, used: 0 } };
