// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../../client/src/router.tsx";
import { ME, NO_LEAGUES } from "./fixtures.ts";

type Handler = (init: RequestInit | undefined) => { status: number; body: unknown };

/** Minimal fake API: "METHOD /path" -> handler. Unknown routes are 404s. */
function mockApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const handler = handlers[key];
    const { status, body } = handler ? handler(init) : { status: 404, body: { error: `No mock for ${key}` } };
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("Dashboard", () => {
  it("shows the API's error when adding a league fails", async () => {
    const fetchMock = mockApi({
      "GET /api/me": () => ({ status: 200, body: ME }),
      "GET /api/leagues": () => ({ status: 200, body: NO_LEAGUES }),
      "GET /api/channels": () => ({ status: 200, body: { channels: [] } }),
      "POST /api/leagues": () => ({
        status: 503,
        body: { error: "FPL is updating right now. Try again in a few minutes.", code: "fpl_updating" },
      }),
    });

    renderAt("/dashboard");
    fireEvent.change(await screen.findByLabelText("Add a league"), { target: { value: " 340312 " } });
    fireEvent.click(screen.getByRole("button", { name: "Add league" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "FPL is updating right now. Try again in a few minutes.",
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[1]?.body).toBe(JSON.stringify({ league: "340312" }));
    expect(new Headers(post?.[1]?.headers).get("Content-Type")).toBe("application/json");
  });

  it("shows plan usage", async () => {
    mockApi({
      "GET /api/me": () => ({ status: 200, body: ME }),
      "GET /api/leagues": () => ({ status: 200, body: NO_LEAGUES }),
      "GET /api/channels": () => ({ status: 200, body: { channels: [] } }),
    });
    renderAt("/dashboard");
    expect(await screen.findByText(/0 of 3 leagues/)).toBeTruthy();
  });

  it("sends logged-out visitors to the login page", async () => {
    mockApi({ "GET /api/me": () => ({ status: 200, body: { ...ME, user: null } }) });
    const router = renderAt("/dashboard");
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
  });
});
