import type {
  RawBootstrap,
  RawEntryHistory,
  RawLive,
  RawPicks,
  RawStandings,
  RawStandingsPage,
} from "./fpl-types.ts";

const BASE_URL = "https://fantasy.premierleague.com/api";
const USER_AGENT = "Pundit/0.1";

export type FplErrorCode = "not_found" | "updating" | "rate_limited" | "network" | "bad_response";

export class FplError extends Error {
  constructor(
    readonly code: FplErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FplError";
  }
}

export interface FplClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  concurrency?: number;
  fetch?: typeof fetch;
  /** Base backoff in ms (doubled each retry). */
  backoffMs?: number;
}

const MINUTE = 60_000;
const TTL = {
  bootstrap: 5 * MINUTE,
  standings: 5 * MINUTE,
  history: 10 * MINUTE,
  /** picks/live for gameweeks that are finished and data-checked never change */
  final: 24 * 60 * MINUTE,
  live: 2 * MINUTE,
} as const;

/** Simple promise-based semaphore limiting in-flight requests. */
class Limiter {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FplClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: Limiter;
  private readonly cache = new Map<string, { expires: number; value: Promise<unknown> }>();

  constructor(opts: FplClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? BASE_URL;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.backoffMs = opts.backoffMs ?? 500;
    this.fetchImpl = opts.fetch ?? fetch;
    this.limiter = new Limiter(opts.concurrency ?? 5);
  }

  clearCache(): void {
    this.cache.clear();
  }

  bootstrap(): Promise<RawBootstrap> {
    return this.cached("bootstrap", TTL.bootstrap, () => this.get<RawBootstrap>("/bootstrap-static/"));
  }

  /**
   * Standings rows for a classic league, following pagination (50 rows/page)
   * up to `maxPages`. Reports only need page 1; member counts need more.
   */
  standings(leagueId: number, maxPages = 20): Promise<RawStandings> {
    return this.cached(`standings:${leagueId}:${maxPages}`, TTL.standings, async () => {
      const results: RawStandings["results"] = [];
      let league: RawStandings["league"] | undefined;
      for (let page = 1; page <= maxPages; page++) {
        const data = await this.get<RawStandingsPage>(
          `/leagues-classic/${leagueId}/standings/?page_standings=${page}`,
        ).catch((err) => {
          if (err instanceof FplError && err.code === "not_found") {
            throw new FplError("not_found", `League ${leagueId} not found. Check it's a classic league ID.`, 404);
          }
          throw err;
        });
        if (!data?.standings?.results || !data.league) {
          throw new FplError("bad_response", `Unexpected standings response for league ${leagueId}`);
        }
        league = data.league;
        results.push(...data.standings.results);
        if (!data.standings.has_next) break;
      }
      return { league: league!, results };
    });
  }

  entryHistory(entryId: number): Promise<RawEntryHistory> {
    return this.cached(`history:${entryId}`, TTL.history, () =>
      this.get<RawEntryHistory>(`/entry/${entryId}/history/`),
    );
  }

  /** @param final set true when the gameweek is finished + data checked (enables long cache) */
  picks(entryId: number, gameweek: number, final = false): Promise<RawPicks> {
    return this.cached(`picks:${entryId}:${gameweek}`, final ? TTL.final : TTL.live, () =>
      this.get<RawPicks>(`/entry/${entryId}/event/${gameweek}/picks/`),
    );
  }

  live(gameweek: number, final = false): Promise<RawLive> {
    return this.cached(`live:${gameweek}`, final ? TTL.final : TTL.live, () =>
      this.get<RawLive>(`/event/${gameweek}/live/`),
    );
  }

  private cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.expires > now) return hit.value as Promise<T>;
    const value = load();
    this.cache.set(key, { expires: now + ttl, value });
    // Don't cache failures.
    value.catch(() => {
      if (this.cache.get(key)?.value === value) this.cache.delete(key);
    });
    return value;
  }

  private get<T>(path: string): Promise<T> {
    return this.limiter.run(() => this.getWithRetry<T>(path));
  }

  private async getWithRetry<T>(path: string): Promise<T> {
    let lastError: FplError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(this.backoffMs * 2 ** (attempt - 1));
      try {
        return await this.fetchOnce<T>(path);
      } catch (err) {
        if (!(err instanceof FplError)) throw err;
        lastError = err;
        const retryable = err.code === "rate_limited" || err.code === "network" ||
          (err.code === "bad_response" && (err.status ?? 0) >= 500);
        if (!retryable) throw err;
      }
    }
    throw lastError!;
  }

  private async fetchOnce<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.baseUrl + path, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new FplError("network", `Network error fetching ${path}: ${(err as Error).message}`);
    }

    if (res.status === 404) throw new FplError("not_found", `Not found: ${path}`, 404);
    if (res.status === 429) throw new FplError("rate_limited", `Rate limited: ${path}`, 429);

    const text = await res.text();
    if (/game is being updated/i.test(text)) {
      throw new FplError("updating", "The FPL game is being updated. Try again shortly.", res.status);
    }
    if (!res.ok) {
      throw new FplError("bad_response", `FPL responded ${res.status} for ${path}`, res.status);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new FplError("bad_response", `Invalid JSON from ${path}`, res.status);
    }
  }
}

export const defaultClient = new FplClient();
