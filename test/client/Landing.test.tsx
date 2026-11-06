// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Landing } from "../../src/shared/components/Landing.tsx";

afterEach(cleanup);

const SAMPLE = "<h2>Sample bulletin</h2>";

describe("Landing", () => {
  it("sends visitors to sign up", () => {
    render(<Landing loggedIn={false} sampleHtml={SAMPLE} />);
    expect(screen.getByRole("link", { name: "Get your first bulletin" }).getAttribute("href")).toBe("/signup");
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
  });

  it("sends logged-in users to their leagues", () => {
    render(<Landing loggedIn sampleHtml={SAMPLE} />);
    expect(screen.getByRole("link", { name: "Go to your leagues" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
  });

  it("shows the sample bulletin", () => {
    render(<Landing loggedIn={false} sampleHtml={SAMPLE} />);
    expect(screen.getByRole("heading", { name: "Sample bulletin" })).toBeTruthy();
  });
});
