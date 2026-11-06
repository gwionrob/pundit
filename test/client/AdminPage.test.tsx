// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../../client/src/router.tsx";
import type { AdminResponse, MeResponse } from "../../src/shared/api.ts";
import { ME } from "./fixtures.ts";

const ADMIN_ME: MeResponse = { ...ME, user: { ...ME.user!, isAdmin: true } };

const DASHBOARD: AdminResponse = {
  generatedAt: "2026-11-06T12:00:00.000Z",
  counts: {
    users: 12,
    usersSince: 3,
    leagues: 9,
    fplLeagues: 8,
    reports: 40,
    reportsSince: 9,
    channels: 4,
    deliveriesSent: 7,
    deliveriesFailed: 1,
  },
  scheduler: { lastGameweekProcessed: 10, lastTickAt: "2026-11-06T11:50:00.000Z", lastTickStatus: "up-to-date" },
  users: [
    { id: 2, email: "ann@example.com", plan: "free", createdAt: "2026-11-05T10:00:00.000Z", leagues: 1, channels: 1 },
  ],
  leagues: [],
  reports: [],
  deliveries: [
    {
      slug: "abc",
      league: "The Sunday Lot",
      kind: "discord",
      label: "#fpl",
      status: "failed",
      error: "Discord webhook failed (404)",
      at: "2026-11-05T10:00:00.000Z",
    },
  ],
};

function mockApi(me: MeResponse) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    const [status, body] =
      path === "/api/me" ? [200, me] : path === "/api/admin" ? [200, DASHBOARD] : [404, { error: "Not found." }];
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("Admin page", () => {
  it("shows admins the numbers, users and failed deliveries", async () => {
    mockApi(ADMIN_ME);
    renderAt("/admin");
    expect(await screen.findByRole("heading", { name: "Admin" })).toBeTruthy();
    expect(screen.getByText("users").previousElementSibling?.textContent).toBe("12");
    expect(screen.getByRole("heading", { name: "Failed deliveries" })).toBeTruthy();
    expect(screen.getAllByText("Discord webhook failed (404)").length).toBeGreaterThan(0);
    expect(screen.getByText("ann@example.com")).toBeTruthy();
    expect(screen.getByText("running")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Admin" })).toBeTruthy();
  });

  it("is an ordinary not-found page for everyone else, and never asks the API", async () => {
    const fetchMock = mockApi(ME);
    renderAt("/admin");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
    expect(fetchMock.mock.calls.map(([p]) => String(p))).not.toContain("/api/admin");
  });
});
