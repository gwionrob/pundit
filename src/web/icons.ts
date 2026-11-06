/**
 * Favicon and home-screen icon, served by the Hono server so they work on every page
 * (server-rendered and React app) in both dev and production.
 *
 * Source of truth is static/favicon.svg. The PNG/ICO were rendered from it; regenerate them
 * if the SVG changes.
 */
import { readFileSync } from "node:fs";
import type { Hono } from "hono";
import type { Env } from "./context.ts";

const ICONS: Record<string, { file: string; type: string }> = {
  "/favicon.svg": { file: "favicon.svg", type: "image/svg+xml" },
  "/favicon.ico": { file: "favicon.ico", type: "image/x-icon" },
  "/apple-touch-icon.png": { file: "apple-touch-icon.png", type: "image/png" },
};

/** <link> tags for a page's <head>, shared by the server-rendered pages. */
export const ICON_LINKS = [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
] as const;

export function mountIcons(app: Hono<Env>): void {
  for (const [path, { file, type }] of Object.entries(ICONS)) {
    const body = readFileSync(new URL(`static/${file}`, import.meta.url));
    app.get(path, (c) =>
      c.body(body, 200, {
        "Content-Type": type,
        // Not content-hashed, so cache for a day rather than forever.
        "Cache-Control": "public, max-age=86400",
      }),
    );
  }
}
