/** /api/me, /api/signup, /api/login, /api/logout */
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { User } from "../../db/repo.ts";
import type { MeResponse } from "../../shared/api.ts";
import {
  endSession,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  SESSION_COOKIE,
  SESSION_DAYS,
  startSession,
  validateEmail,
  verifyPassword,
} from "../auth.ts";
import { apiError, clientKey, isAdmin, parseJson, type Env, type WebContext } from "../context.ts";
import { toUserDto } from "../dto.ts";

const MAX_PASSWORD_LENGTH = 200;

const AuthBody = z.object({
  email: z.string().transform((s) => s.trim().toLowerCase()),
  password: z.string(),
});

export function authRoutes(ctx: WebContext) {
  const { config, repo, authLimiter } = ctx;
  const app = new Hono<Env>();

  const me = (user: User | undefined): MeResponse => ({
    user: user ? toUserDto(user, isAdmin(config, user)) : null,
    features: {
      telegram: config.telegramEnabled,
      telegramBotUsername: config.telegramEnabled ? (config.TELEGRAM_BOT_USERNAME ?? null) : null,
      // Without a Resend key emails are only logged, which is fine in dev but not in production.
      email: Boolean(config.RESEND_API_KEY) || config.NODE_ENV !== "production",
    },
  });

  const logIn = (c: Context<Env>, user: User) => {
    const { token } = startSession(repo, user.id, config.SESSION_SECRET);
    setCookie(c, SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: config.secureCookies,
      maxAge: SESSION_DAYS * 86_400,
    });
  };

  app.get("/me", (c) => c.json(me(c.get("user"))));

  app.post("/signup", async (c) => {
    if (!authLimiter.take(`signup:${clientKey(c, config.TRUST_PROXY)}`)) {
      return apiError(c, 429, "Too many attempts. Try again later.", "rate_limited");
    }
    const body = await parseJson(c, AuthBody);
    if (body instanceof Response) return body;
    const { email, password } = body;
    if (!validateEmail(email)) return apiError(c, 422, "Please enter a valid email address.", "validation");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return apiError(c, 422, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, "validation");
    }
    if (password.length > MAX_PASSWORD_LENGTH) return apiError(c, 422, "Password is too long.", "validation");
    // Admin emails can't be claimed by signing up: without email verification, anyone could
    // otherwise create the admin account before its owner does. Same message as a taken email.
    if (repo.getUserByEmail(email) || config.adminEmails.has(email)) {
      return apiError(c, 409, "An account with that email already exists. Try logging in.", "conflict");
    }
    const user = repo.createUser(email, await hashPassword(password));
    logIn(c, user);
    return c.json(me(user), 201);
  });

  app.post("/login", async (c) => {
    const body = await parseJson(c, AuthBody);
    if (body instanceof Response) return body;
    const { email, password } = body;
    if (!authLimiter.take(`login:${clientKey(c, config.TRUST_PROXY)}`) || !authLimiter.take(`login-email:${email}`)) {
      return apiError(c, 429, "Too many attempts. Try again later.", "rate_limited");
    }
    const user = repo.getUserByEmail(email);
    // Hash anyway for unknown emails so response time doesn't reveal which accounts exist.
    const ok = user
      ? await verifyPassword(password, user.password_hash)
      : await hashPassword(password).then(() => false);
    if (!user || !ok) return apiError(c, 401, "Wrong email or password.", "unauthorized");
    logIn(c, user);
    return c.json(me(user));
  });

  app.post("/logout", (c) => {
    endSession(repo, getCookie(c, SESSION_COOKIE), config.SESSION_SECRET);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true as const });
  });

  return app;
}
