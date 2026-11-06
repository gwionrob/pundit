/**
 * Parse a classic league id from user input: a bare number or an FPL league
 * URL such as https://fantasy.premierleague.com/leagues/123456/standings/c
 */
export function parseLeagueId(input: string): number | null {
  const s = input.trim();
  if (/^\d{1,10}$/.test(s)) return toId(s);

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/(?:^|\.)fantasy\.premierleague\.com$/i.test(url.hostname)) return null;
  const match = url.pathname.match(/\/leagues(?:-classic)?\/(\d{1,10})(?:\/|$)/);
  return match ? toId(match[1]!) : null;
}

function toId(s: string): number | null {
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
