import { describe, expect, it } from "vitest";
import { parseLeagueId } from "../../src/core/league-id.ts";

describe("parseLeagueId", () => {
  it.each([
    ["123456", 123456],
    ["  123456 ", 123456],
    ["https://fantasy.premierleague.com/leagues/123456/standings/c", 123456],
    ["fantasy.premierleague.com/leagues/314/standings/c", 314],
    ["https://fantasy.premierleague.com/leagues/auto-join/abc", null],
    ["https://example.com/leagues/123456/standings/c", null],
    ["abc", null],
    ["", null],
    ["0", null],
    ["12.5", null],
  ])("%j -> %j", (input, expected) => {
    expect(parseLeagueId(input)).toBe(expected);
  });
});
