// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../../client/src/router.tsx";
import type { ChannelsResponse } from "../../src/shared/api.ts";
import { ME } from "./fixtures.ts";

type Handler = (init: RequestInit | undefined) => { status: number; body: unknown };

function mockApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const { status, body } = handlers[key]?.(init) ?? { status: 404, body: { error: `No mock for ${key}` } };
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderChannels() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/channels"] })} />
    </QueryClientProvider>,
  );
}

const NONE: ChannelsResponse = { channels: [] };
const EMAIL_ON: ChannelsResponse = {
  channels: [{ id: 7, kind: "email", label: "me@example.com", active: true, createdAt: "2026-11-01T10:00:00.000Z" }],
};

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("Channels page", () => {
  it("shows the email address in the description, not squeezed into the button", async () => {
    const fetchMock = mockApi({
      "GET /api/me": () => ({ status: 200, body: ME }),
      "GET /api/channels": () => ({ status: 200, body: NONE }),
      "PUT /api/channels/email": () => ({ status: 200, body: EMAIL_ON }),
    });
    renderChannels();

    const turnOn = await screen.findByRole("button", { name: "Turn on" });
    expect(screen.getByText("me@example.com")).toBeTruthy();
    fireEvent.click(turnOn);

    expect(await screen.findByRole("button", { name: "Turn off" })).toBeTruthy();
    expect((await screen.findByRole("status")).textContent).toBe("We'll email me@example.com for new bulletins.");
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(put?.[1]?.body).toBe(JSON.stringify({ enabled: true }));
  });

  it("opens the Discord form on demand and closes it after linking", async () => {
    mockApi({
      "GET /api/me": () => ({ status: 200, body: ME }),
      "GET /api/channels": () => ({ status: 200, body: NONE }),
      "POST /api/channels/discord": () => ({
        status: 201,
        body: { id: 9, kind: "discord", label: "#fpl", active: true, createdAt: "2026-11-01T10:00:00.000Z" },
      }),
    });
    renderChannels();

    expect(screen.queryByLabelText("Webhook URL")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Add a webhook" }));
    fireEvent.change(screen.getByLabelText("Webhook URL"), {
      target: { value: "https://discord.com/api/webhooks/1/abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Discord channel" }));

    expect((await screen.findByRole("status")).textContent).toBe("Linked #fpl. We sent a test message there.");
    expect(screen.queryByLabelText("Webhook URL")).toBeNull();
  });

  it("says Telegram is coming soon when the bot isn't configured", async () => {
    mockApi({
      "GET /api/me": () => ({ status: 200, body: ME }),
      "GET /api/channels": () => ({ status: 200, body: NONE }),
    });
    renderChannels();
    expect(await screen.findByText("Coming soon")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Link a group" })).toBeNull();
  });
});
