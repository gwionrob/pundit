import type { RenderFormat, Report, Segment } from "./types.ts";

export interface RenderOptions {
  /** Optional line appended at the end, e.g. "📰 Full bulletin: <url>" */
  footer?: string;
}

interface Markup {
  text(s: string): string;
  bold(s: string): string;
  heading(s: string): string;
  title(s: string): string;
  subtitle(s: string): string;
  line(s: string): string;
  join(blocks: string[]): string;
  section(heading: string, lines: string[]): string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const escapeTelegram = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Apply `fn` to the non-URL parts of `s`, leaving URLs untouched so links still work. */
const outsideUrls = (fn: (s: string) => string) => (s: string) =>
  s.split(/(https?:\/\/\S+)/).map((part, i) => (i % 2 ? part : fn(part))).join("");

// Discord markdown specials (inline): \ * _ ~ ` | >
const escapeDiscord = outsideUrls((s) => s.replace(/([\\*_~`|>])/g, "\\$1"));

// WhatsApp has no escape syntax, so swap formatting characters for look-alikes
// so names like "*Salah*" or "the_gaffer" can't break bold/italic runs.
const WA_LOOKALIKE: Record<string, string> = { "*": "∗", _: "ˍ", "~": "∼", "`": "ˋ" };
const sanitiseWhatsapp = outsideUrls((s) => s.replace(/[*_~`]/g, (c) => WA_LOOKALIKE[c]!));

const textMarkup = (opts: {
  text: (s: string) => string;
  bold: (s: string) => string;
}): Markup => ({
  text: opts.text,
  bold: opts.bold,
  heading: (s) => opts.bold(opts.text(s)),
  title: (s) => opts.bold(opts.text(s)),
  subtitle: (s) => opts.text(s),
  line: (s) => s,
  join: (blocks) => blocks.join("\n\n"),
  section: (heading, lines) => [heading, ...lines].join("\n"),
});

const MARKUPS: Record<RenderFormat, Markup> = {
  whatsapp: textMarkup({ text: sanitiseWhatsapp, bold: (s) => (s.trim() ? `*${s}*` : s) }),
  telegram: textMarkup({ text: escapeTelegram, bold: (s) => `<b>${s}</b>` }),
  discord: textMarkup({ text: escapeDiscord, bold: (s) => (s.trim() ? `**${s}**` : s) }),
  plain: textMarkup({ text: (s) => s, bold: (s) => s }),
  html: {
    text: escapeHtml,
    bold: (s) => `<strong>${s}</strong>`,
    heading: (s) => `<h3>${escapeHtml(s)}</h3>`,
    title: (s) => `<h2>${escapeHtml(s)}</h2>`,
    subtitle: (s) => `<p class="subtitle">${escapeHtml(s)}</p>`,
    line: (s) => `<p>${s}</p>`,
    join: (blocks) => blocks.join("\n"),
    section: (heading, lines) => `<section>\n${heading}\n${lines.join("\n")}\n</section>`,
  },
};

function renderSegments(segments: Segment[], m: Markup): string {
  return segments
    .map((seg) => (typeof seg === "string" ? m.text(seg) : m.bold(m.text(seg.bold))))
    .join("");
}

export function renderReport(report: Report, format: RenderFormat, opts: RenderOptions = {}): string {
  const m = MARKUPS[format];
  const header = [m.title(report.title)];
  if (report.subtitle) header.push(m.subtitle(report.subtitle));

  const blocks = [
    header.join("\n"),
    ...report.sections.map((s) =>
      m.section(m.heading(s.heading), s.lines.map((l) => m.line(renderSegments(l.segments, m)))),
    ),
  ];
  if (opts.footer) blocks.push(m.line(m.text(opts.footer)));
  return m.join(blocks);
}
