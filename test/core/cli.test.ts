import { describe, expect, it } from "vitest";
import {
  clipboardCommands,
  openCommand,
  parseCli,
  resolveOutput,
  UsageError,
  whatsappShareUrl,
} from "../../src/cli/args.ts";

const usage = (argv: string[]) => {
  try {
    parseCli(argv);
  } catch (err) {
    expect(err).toBeInstanceOf(UsageError);
    return (err as UsageError).message;
  }
  throw new Error("expected a UsageError");
};

describe("parseCli", () => {
  it("parses a gameweek command with defaults", () => {
    expect(parseCli(["gameweek", "340312"])).toEqual({
      kind: "report", command: "gameweek", leagueId: 340312,
      gameweek: undefined, month: undefined, year: undefined, top: undefined,
      format: undefined, copy: false, whatsapp: false,
    });
  });

  it("rejects --copy with terminal format (colour codes don't belong in a clipboard)", () => {
    expect(usage(["gameweek", "1", "--copy", "--format", "terminal"])).toMatch(/can't copy terminal colours/);
  });

  it("accepts league URLs and command flags in any order", () => {
    expect(parseCli(["--month", "10", "monthly", "https://fantasy.premierleague.com/leagues/340312/standings/c", "--year", "2026", "--copy"]))
      .toMatchObject({ command: "monthly", leagueId: 340312, month: 10, year: 2026, copy: true });
    expect(parseCli(["standings", "1", "--top", "5", "--format", "discord"])).toMatchObject({ top: 5, format: "discord" });
    expect(parseCli(["gameweek", "1", "--gw", "9", "--whatsapp"])).toMatchObject({ gameweek: 9, whatsapp: true });
  });

  it("handles help and version", () => {
    expect(parseCli([])).toEqual({ kind: "help", topic: undefined });
    expect(parseCli(["-h"])).toEqual({ kind: "help", topic: undefined });
    expect(parseCli(["help", "monthly"])).toEqual({ kind: "help", topic: "monthly" });
    expect(parseCli(["standings", "--help"])).toEqual({ kind: "help", topic: "standings" });
    expect(parseCli(["-v"])).toEqual({ kind: "version" });
    expect(parseCli(["--version", "gameweek"])).toEqual({ kind: "version" });
  });

  it("rejects bad usage with clear messages", () => {
    expect(usage(["fixtures", "1"])).toMatch(/Unknown command "fixtures"/);
    expect(usage(["help", "nope"])).toMatch(/Unknown command "nope"/);
    expect(usage(["gameweek"])).toMatch(/Missing <league>/);
    expect(usage(["gameweek", "abc"])).toMatch(/isn't a league ID/);
    expect(usage(["gameweek", "1", "2"])).toMatch(/Unexpected argument "2"/);
    expect(usage(["gameweek", "1", "--month", "3"])).toMatch(/--month doesn't apply to "gameweek"/);
    expect(usage(["monthly", "1", "--month", "13"])).toMatch(/--month must be a whole number from 1 to 12/);
    expect(usage(["gameweek", "1", "--gw", "x"])).toMatch(/--gw must be/);
    expect(usage(["standings", "1", "--top", "0"])).toMatch(/--top must be/);
    expect(usage(["gameweek", "1", "--format", "html"])).toMatch(/Unknown format "html"/);
    expect(usage(["gameweek", "1", "--format", "discord", "--whatsapp"])).toMatch(/--whatsapp always uses WhatsApp/);
    expect(usage(["gameweek", "1", "--nope"])).toMatch(/Unknown option '--nope'/);
  });

  it("attaches the command to usage errors so main can show its help", () => {
    try {
      parseCli(["monthly", "1", "--top", "3"]);
    } catch (err) {
      expect((err as UsageError).topic).toBe("monthly");
    }
  });
});

describe("platform helpers", () => {
  it("builds a WhatsApp share link", () => {
    expect(whatsappShareUrl("*GW9* & co\nline 2")).toBe("https://api.whatsapp.com/send?text=*GW9*%20%26%20co%0Aline%202");
  });

  it("picks clipboard tools per platform", () => {
    expect(clipboardCommands("darwin")).toEqual([["pbcopy", []]]);
    expect(clipboardCommands("win32")).toEqual([["clip", []]]);
    expect(clipboardCommands("linux").map(([c]) => c)).toEqual(["wl-copy", "xclip", "xsel"]);
  });

  it("picks an opener per platform", () => {
    expect(openCommand("darwin", "u")).toEqual(["open", ["u"]]);
    expect(openCommand("linux", "u")).toEqual(["xdg-open", ["u"]]);
    expect(openCommand("win32", "u")[0]).toBe("rundll32");
  });
});

describe("resolveOutput", () => {
  const tty = { isTTY: true, noColor: false, forceColor: false };
  const pipe = { isTTY: false, noColor: false, forceColor: false };
  const plain = { copy: false, whatsapp: false };

  it("on screen: readable terminal format with colour and the share tip", () => {
    expect(resolveOutput(plain, tty)).toEqual({ stdout: { format: "terminal", color: true }, share: "whatsapp", tip: true });
  });

  it("piped: WhatsApp markup, no colour, no tip", () => {
    expect(resolveOutput(plain, pipe)).toEqual({ stdout: { format: "whatsapp", color: false }, share: "whatsapp", tip: false });
  });

  it("respects NO_COLOR and FORCE_COLOR", () => {
    expect(resolveOutput(plain, { ...tty, noColor: true }).stdout).toEqual({ format: "terminal", color: false });
    expect(resolveOutput({ ...plain, format: "terminal" }, { ...pipe, forceColor: true }).stdout).toEqual({ format: "terminal", color: true });
  });

  it("an explicit --format wins on screen", () => {
    expect(resolveOutput({ ...plain, format: "discord" }, tty)).toMatchObject({ stdout: { format: "discord" }, tip: false });
  });

  it("--copy / --whatsapp: share WhatsApp text, preview it readably on screen only", () => {
    expect(resolveOutput({ copy: true, whatsapp: false }, tty)).toEqual({ stdout: { format: "terminal", color: true }, share: "whatsapp", tip: false });
    expect(resolveOutput({ copy: false, whatsapp: true }, pipe)).toEqual({ stdout: null, share: "whatsapp", tip: false });
    expect(resolveOutput({ copy: true, whatsapp: false, format: "telegram" }, tty).share).toBe("telegram");
  });
});
