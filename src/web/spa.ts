/**
 * Production serving of the built React app (client/dist). In development Vite serves it and
 * this module isn't used.
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "hono";

export const DEFAULT_SPA_DIR = fileURLToPath(new URL("../../client/dist", import.meta.url));

const MIME: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

export interface Spa {
  /** Serves files from dist/assets (hashed names, so cached forever). */
  asset(c: Context): Promise<Response>;
  /** Returns index.html for client-side routes. */
  index(c: Context): Response;
}

export function createSpa(dir: string): Spa {
  const indexPath = join(dir, "index.html");
  const assetsDir = join(dir, "assets");
  let indexHtml: string | undefined;

  const missingBuild = (c: Context) =>
    c.text("The web app hasn't been built. Run `npm run build` and restart the server.", 500);

  return {
    async asset(c) {
      const rel = decodeURIComponent(c.req.path.replace(/^\/assets\//, ""));
      const file = normalize(join(assetsDir, rel));
      if (!file.startsWith(assetsDir + sep)) return c.notFound();
      try {
        const body = await readFile(file);
        c.header("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
        c.header("Cache-Control", "public, max-age=31536000, immutable");
        return c.body(body);
      } catch {
        return c.notFound();
      }
    },
    index(c) {
      if (indexHtml === undefined) {
        if (!existsSync(indexPath)) return missingBuild(c);
        indexHtml = readFileSync(indexPath, "utf8");
      }
      c.header("Cache-Control", "no-cache");
      return c.html(indexHtml);
    },
  };
}
