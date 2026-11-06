/**
 * Builds the publishable `pundit-cli` npm package into dist-cli/:
 *   dist-cli/pundit.js     single-file ESM bundle (no runtime dependencies, Node built-ins only)
 *   dist-cli/package.json  minimal manifest: just the CLI, none of the web app's dependencies
 *   dist-cli/README.md     CLI-focused readme shown on npmjs.com
 *
 * Publish with: npm run build:cli && npm publish ./dist-cli
 */
import { build } from "esbuild";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const out = new URL("dist-cli/", root);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as {
  version: string;
  description: string;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [new URL("src/cli/main.ts", root).pathname],
  outfile: new URL("pundit.js", out).pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false, // keep stack traces readable for bug reports
  legalComments: "none",
  banner: { js: "#!/usr/bin/env node" },
  define: { __PUNDIT_VERSION__: JSON.stringify(pkg.version) },
});
chmodSync(new URL("pundit.js", out), 0o755);

const manifest = {
  name: "pundit-cli",
  version: pkg.version,
  description: pkg.description,
  type: "module",
  bin: { pundit: "pundit.js" },
  files: ["pundit.js", "README.md", "LICENSE"],
  engines: { node: ">=22" },
  // The CLI is MIT; the web app in this repo is not (see README "Licence").
  license: "MIT",
  repository: { type: "git", url: "git+https://github.com/gwionrob/pundit.git" },
  homepage: "https://github.com/gwionrob/pundit#cli",
  bugs: "https://github.com/gwionrob/pundit/issues",
  keywords: ["fpl", "fantasy-premier-league", "fantasy-football", "mini-league", "whatsapp", "cli"],
};
writeFileSync(new URL("package.json", out), JSON.stringify(manifest, null, 2) + "\n");

writeFileSync(
  new URL("README.md", out),
  `# pundit

Weekly bulletins for your Fantasy Premier League mini-league, straight from the terminal:
gameweek winner, wooden spoon, captain hauls and flops, bench of shame, movers, and Manager of the Month.

\`\`\`sh
npx pundit-cli gameweek <league ID or league URL>
# or install it:
npm i -g pundit-cli        # or: brew install gwionrob/tap/pundit
\`\`\`

\`\`\`sh
pundit gameweek 123456                 # this gameweek's bulletin
pundit monthly 123456 --month 10       # Manager of the Month
pundit standings 123456 --top 5
pundit gameweek 123456 --whatsapp      # opens WhatsApp with it pre-written; pick your group and send
pundit gameweek 123456 --copy          # copy to clipboard
pundit gameweek 123456 --format telegram   # whatsapp | telegram | discord | plain
\`\`\`

Find your league ID in the address bar when you open your league on the FPL website.
\`pundit --help\` lists everything. Requires Node 22+.

Want it delivered automatically every gameweek? See [Pundit](https://github.com/gwionrob/pundit).

_Not affiliated with the Premier League or Fantasy Premier League._
`,
);

writeFileSync(new URL("LICENSE", out), readFileSync(new URL("LICENSE-CLI", root), "utf8"));

console.log(`Built pundit-cli@${pkg.version} → dist-cli/`);
