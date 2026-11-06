import { describe, expect, it, vi } from "vitest";
import { FplClient, FplError } from "../../src/core/fpl-client.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("FplClient", () => {
  it("retries 5xx/429 with backoff then succeeds", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("oops", { status: 502 }))
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(json({ events: [], elements: [] }));
    const client = new FplClient({ fetch, backoffMs: 1 });
    await expect(client.bootstrap()).resolves.toEqual({ events: [], elements: [] });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("maps 'game is being updated' to code updating without retrying", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('"The game is being updated."', { status: 503 }));
    const client = new FplClient({ fetch, backoffMs: 1 });
    await expect(client.bootstrap()).rejects.toMatchObject({ code: "updating" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("maps 404 on standings to a friendly not_found", async () => {
    const client = new FplClient({ fetch: vi.fn().mockResolvedValue(new Response("", { status: 404 })), backoffMs: 1 });
    const err = await client.standings(42).catch((e) => e);
    expect(err).toBeInstanceOf(FplError);
    expect(err).toMatchObject({ code: "not_found" });
    expect(err.message).toContain("42");
  });

  it("follows standings pagination and caches", async () => {
    const page = (n: number, has_next: boolean) =>
      json({ league: { id: 7, name: "L" }, standings: { page: n, has_next, results: [{ entry: n }] } });
    const fetch = vi
      .fn()
      .mockImplementation(async (url: string) => (url.endsWith("page_standings=1") ? page(1, true) : page(2, false)));
    const client = new FplClient({ fetch });
    const s = await client.standings(7);
    expect(s.results.map((r) => r.entry)).toEqual([1, 2]);
    await client.standings(7);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("doesn't cache failures", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(json({ current: [], chips: [] }));
    const client = new FplClient({ fetch });
    await expect(client.entryHistory(1)).rejects.toBeInstanceOf(FplError);
    await expect(client.entryHistory(1)).resolves.toEqual({ current: [], chips: [] });
  });

  it("limits concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetch = vi.fn().mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return json({ current: [], chips: [] });
    });
    const client = new FplClient({ fetch, concurrency: 2 });
    await Promise.all([1, 2, 3, 4, 5].map((id) => client.entryHistory(id)));
    expect(peak).toBe(2);
  });
});
