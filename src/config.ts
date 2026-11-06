import { z } from "zod";

const DEFAULT_SECRET = "dev-insecure-secret-change-me";

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  APP_URL: z.preprocess(emptyToUndefined, z.url().default("http://localhost:3000")),
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(3000)),
  DATABASE_PATH: z.preprocess(emptyToUndefined, z.string().default("./data/app.db")),
  SESSION_SECRET: z.preprocess(emptyToUndefined, z.string().default(DEFAULT_SECRET)),
  TELEGRAM_BOT_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),
  TELEGRAM_BOT_USERNAME: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .transform((s) => s.replace(/^@/, ""))
      .optional(),
  ),
  TRUST_PROXY: z.preprocess(
    emptyToUndefined,
    z.enum(["true", "false", "1", "0"]).default("false").transform((v) => v === "true" || v === "1"),
  ),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  EMAIL_FROM: z.preprocess(
    emptyToUndefined,
    z.string().default("Pundit <pundit@example.com>"),
  ),
});

export type Config = z.infer<typeof schema> & {
  appUrl: string;
  secureCookies: boolean;
  telegramEnabled: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const c = parsed.data;
  const insecure = c.SESSION_SECRET === DEFAULT_SECRET || c.SESSION_SECRET === "change-me";
  if (c.NODE_ENV === "production" && (insecure || c.SESSION_SECRET.length < 32)) {
    throw new Error("SESSION_SECRET must be set to a random value in production (openssl rand -hex 32)");
  }
  const appUrl = c.APP_URL.replace(/\/+$/, "");
  return {
    ...c,
    appUrl,
    secureCookies: appUrl.startsWith("https://"),
    telegramEnabled: Boolean(c.TELEGRAM_BOT_TOKEN && c.TELEGRAM_BOT_USERNAME),
  };
}
