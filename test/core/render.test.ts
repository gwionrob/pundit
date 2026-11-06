import { describe, expect, it } from "vitest";
import { renderReport } from "../../src/core/render.ts";
import type { Report } from "../../src/core/types.ts";

const report: Report = {
  kind: "gameweek",
  leagueId: 1,
  leagueName: "Tom & Jerry <3",
  title: "Gameweek 9 Bulletin",
  subtitle: "Tom & Jerry <3",
  period: { gameweek: 9 },
  generatedAt: "2026-11-06T00:00:00Z",
  sections: [
    {
      heading: "🏆 Gameweek winner",
      lines: [{ segments: [{ bold: "*Mo*_the_~king~`" }, " (A&B <FC>) — ", { bold: "78 pts" }] }],
    },
    { heading: "📊 Averages", lines: [{ segments: ["League: 50 > Global: 47 | #1 [link](x)"] }] },
  ],
};

describe("renderReport", () => {
  it("whatsapp: bold title/headings, neutralises formatting chars in names", () => {
    const out = renderReport(report, "whatsapp");
    expect(out.split("\n")[0]).toBe("*Gameweek 9 Bulletin*");
    expect(out).toContain("*🏆 Gameweek winner*");
    expect(out).toContain("*∗Mo∗ˍtheˍ∼king∼ˋ*"); // formatting chars swapped for look-alikes
    expect(out).toContain("*78 pts*");
    // No raw formatting characters other than our own bold markers.
    const winnerLine = out.split("\n").find((l) => l.includes("78 pts"))!;
    expect(winnerLine.replace(/\*[^*\n]+\*/g, "")).not.toMatch(/[*_~`]/);
    expect(out.split("\n\n")).toHaveLength(3);
  });

  it("telegram: HTML-escapes & < > and uses <b>", () => {
    const out = renderReport(report, "telegram");
    expect(out).toContain("<b>Gameweek 9 Bulletin</b>");
    expect(out).toContain("Tom &amp; Jerry &lt;3");
    expect(out).toContain("(A&amp;B &lt;FC&gt;)");
    expect(out).toContain("League: 50 &gt; Global: 47");
    expect(out).not.toMatch(/<(?!\/?b>)/);
  });

  it("discord: escapes markdown specials and uses **", () => {
    const out = renderReport(report, "discord");
    expect(out).toContain("**Gameweek 9 Bulletin**");
    expect(out).toContain("**\\*Mo\\*\\_the\\_\\~king\\~\\`**");
    expect(out).toContain("League: 50 \\> Global: 47 \\| #1");
  });

  it("plain: no markup", () => {
    const out = renderReport(report, "plain");
    expect(
      out.startsWith("Gameweek 9 Bulletin\nTom & Jerry <3\n\n🏆 Gameweek winner\n*Mo*_the_~king~` (A&B <FC>) — 78 pts"),
    ).toBe(true);
  });

  it("html: fully escaped fragment", () => {
    const out = renderReport(report, "html");
    expect(out).toContain("<h2>Gameweek 9 Bulletin</h2>");
    expect(out).toContain('<p class="subtitle">Tom &amp; Jerry &lt;3</p>');
    expect(out).toContain("<strong>78 pts</strong>");
    expect(out).toContain("(A&amp;B &lt;FC&gt;)");
    expect(out).toContain("<section>");
  });

  it("appends a footer without mangling URLs", () => {
    const footer = "📰 Full bulletin: https://example.com/r/a_b*c";
    expect(renderReport(report, "whatsapp", { footer }).endsWith("\n\n" + footer)).toBe(true);
    expect(renderReport(report, "discord", { footer }).endsWith("https://example.com/r/a_b*c")).toBe(true);
    expect(renderReport(report, "html", { footer })).toContain("<p>📰 Full bulletin: https://example.com/r/a_b*c</p>");
  });

  it("terminal (no colour): no markup characters added, lines indented under headings", () => {
    const out = renderReport(report, "terminal", { color: false });
    expect(out.split("\n")[0]).toBe("Gameweek 9 Bulletin");
    expect(out).toContain("🏆 Gameweek winner\n  *Mo*_the_~king~` (A&B <FC>) — 78 pts"); // names untouched, no added *
    expect(out).not.toContain("\x1b[");
  });

  it("terminal (colour): ANSI bold/colour that nests cleanly, arrows coloured", () => {
    const moves: Report = {
      ...report,
      sections: [
        {
          heading: "🔝 Top 5",
          lines: [{ segments: ["1. ", { bold: "Ann" }, " — 627 (▲1)"] }, { segments: ["2. Ben — 612 (▼2)"] }],
        },
      ],
    };
    const out = renderReport(moves, "terminal");
    expect(out).toContain("\x1b[1;35mGameweek 9 Bulletin\x1b[22;39m");
    expect(out).toContain("\x1b[1;36m🔝 Top 5\x1b[22;39m");
    expect(out).toContain("  1. \x1b[1mAnn\x1b[22m — 627 (\x1b[32m▲1\x1b[39m)");
    expect(out).toContain("(\x1b[31m▼2\x1b[39m)");
    expect(out).not.toContain("\x1b[0m"); // no full resets that would cancel outer styles
  });
});
