// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY_TEXT_ID, ReportView } from "../../src/shared/components/ReportView.tsx";
import { REPORT } from "./fixtures.ts";

afterEach(cleanup);

describe("ReportView", () => {
  it("links the WhatsApp button to the share URL", () => {
    render(<ReportView data={REPORT} onCopy={() => {}} />);
    const wa = screen.getByRole("link", { name: "Send to WhatsApp" });
    expect(wa.getAttribute("href")).toBe(REPORT.whatsappUrl);
    expect(wa.getAttribute("target")).toBe("_blank");
    expect(wa.getAttribute("rel")).toContain("noopener");
  });

  it("renders the pre-escaped bulletin html", () => {
    render(<ReportView data={REPORT} onCopy={() => {}} />);
    expect(screen.getByRole("heading", { name: "Gameweek 9 Bulletin" })).toBeTruthy();
  });

  it("client mode: calls onCopy and shows Copied ✓", () => {
    const onCopy = vi.fn();
    const { rerender } = render(<ReportView data={REPORT} onCopy={onCopy} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy text" }));
    expect(onCopy).toHaveBeenCalledOnce();
    rerender(<ReportView data={REPORT} onCopy={onCopy} copied />);
    expect(screen.getByRole("button", { name: "Copied ✓" })).toBeTruthy();
    expect(document.getElementById(COPY_TEXT_ID)).toBeNull();
  });

  it("server mode: renders the data-copy-target button and hidden text for the inline script", () => {
    const html = renderToStaticMarkup(<ReportView data={REPORT} />);
    expect(html).toContain(`data-copy-target="${COPY_TEXT_ID}"`);
    expect(html).toContain(`<pre id="${COPY_TEXT_ID}" class="visually-hidden">`);
    expect(html).toContain("*Priya* — 88 pts");
    expect(html).not.toContain("Copied");
  });

  it("renders extra actions", () => {
    render(<ReportView data={REPORT} onCopy={() => {}} actions={<p>Owner panel</p>} />);
    expect(screen.getByText("Owner panel")).toBeTruthy();
  });
});
