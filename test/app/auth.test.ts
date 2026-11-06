import { describe, expect, it } from "vitest";
import { endSession, hashPassword, RateLimiter, startSession, userForToken, verifyPassword } from "../../src/web/auth.ts";
import { memRepo } from "./helpers.ts";

const SECRET = "test-secret-test-secret";

describe("passwords", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("correct horse");
    expect(h).toMatch(/^scrypt\$/);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong horse", h)).toBe(false);
  });
  it("uses a unique salt", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("sessions", () => {
  it("starts, resolves, expires and ends", () => {
    const repo = memRepo();
    const user = repo.createUser("a@b.com", "h");
    const now = new Date("2026-11-01T00:00:00Z");
    const { token, expires } = startSession(repo, user.id, SECRET, now);
    expect(userForToken(repo, token, SECRET, now)?.id).toBe(user.id);
    // token is stored hashed, not raw
    const raw = repo.db.prepare("SELECT token_hash FROM sessions").get() as { token_hash: string };
    expect(raw.token_hash).not.toBe(token);
    // wrong secret / unknown token
    expect(userForToken(repo, token, "other-secret", now)).toBeUndefined();
    expect(userForToken(repo, "nope", SECRET, now)).toBeUndefined();
    // expiry
    expect(userForToken(repo, token, SECRET, new Date(expires.getTime() + 1))).toBeUndefined();
    endSession(repo, token, SECRET);
    expect(userForToken(repo, token, SECRET, now)).toBeUndefined();
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and resets after the window", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.take("k", 0)).toBe(true);
    expect(rl.take("k", 1)).toBe(true);
    expect(rl.take("k", 2)).toBe(false);
    expect(rl.take("other", 2)).toBe(true);
    expect(rl.take("k", 1001)).toBe(true);
  });
});
