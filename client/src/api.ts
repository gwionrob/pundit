/**
 * Talking to the Pundit API.
 *
 * - `request()` is a tiny typed fetch wrapper. It throws `ApiRequestError` for any non-2xx
 *   response, carrying the HTTP status and the server's `{ error, code }` body.
 * - Below it, one TanStack Query hook per endpoint. Components only use these hooks.
 *   Query keys live in `keys` so invalidation is easy to follow.
 *
 * Debugging tip: open React Query Devtools (the flower button, bottom corner in dev) to see
 * every query, its cached data and its status.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddLeagueRequest,
  AdminResponse,
  ApiError,
  AuthRequest,
  ChannelDto,
  ChannelsResponse,
  DiscordRequest,
  EmailToggleRequest,
  GenerateRequest,
  LeagueDetail,
  LeagueSummary,
  LeaguesResponse,
  MeResponse,
  ReportResponse,
  TelegramLinkResponse,
  UpdateLeagueRequest,
} from "../../src/shared/api.ts";

// ---------- fetch wrapper ----------

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiError["code"] | undefined;

  constructor(status: number, body: Partial<ApiError>) {
    super(body.error ?? `Request failed (${status})`);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = body.code;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", headers: { Accept: "application/json" } };
  if (method !== "GET") {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(body ?? {});
  }

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiRequestError(0, { error: "Couldn't reach the server. Check your connection and try again." });
  }

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiRequestError(res.status, data as Partial<ApiError>);
  return data as T;
}

/** A friendly message for any error thrown by a query or mutation. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

// ---------- query keys ----------

export const keys = {
  me: ["me"] as const,
  leagues: ["leagues"] as const,
  league: (id: number) => ["leagues", id] as const,
  report: (slug: string) => ["reports", slug] as const,
  channels: ["channels"] as const,
  admin: ["admin"] as const,
};

// ---------- auth ----------

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => request<MeResponse>("GET", "/api/me"), staleTime: 60_000 });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AuthRequest) => request<MeResponse>("POST", "/api/login", body),
    onSuccess: (me) => qc.setQueryData(keys.me, me),
  });
}

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AuthRequest) => request<MeResponse>("POST", "/api/signup", body),
    onSuccess: (me) => qc.setQueryData(keys.me, me),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<{ ok: true }>("POST", "/api/logout"),
    onSuccess: () => {
      // Forget everything cached for this user, then mark them logged out.
      const me = qc.getQueryData<MeResponse>(keys.me);
      qc.clear();
      if (me) qc.setQueryData<MeResponse>(keys.me, { ...me, user: null });
    },
  });
}

// ---------- leagues ----------

export function useLeagues() {
  return useQuery({ queryKey: keys.leagues, queryFn: () => request<LeaguesResponse>("GET", "/api/leagues") });
}

export function useLeague(id: number) {
  return useQuery({
    queryKey: keys.league(id),
    queryFn: () => request<LeagueDetail>("GET", `/api/leagues/${id}`),
    enabled: Number.isInteger(id),
  });
}

export function useAddLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddLeagueRequest) => request<LeagueSummary>("POST", "/api/leagues", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.leagues }),
  });
}

export function useUpdateLeague(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateLeagueRequest) => request<LeagueDetail>("PATCH", `/api/leagues/${id}`, body),
    onSuccess: (league) => {
      qc.setQueryData(keys.league(id), league);
      void qc.invalidateQueries({ queryKey: keys.leagues, exact: true });
    },
  });
}

export function useDeleteLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<{ ok: true }>("DELETE", `/api/leagues/${id}`),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: keys.league(id) });
      void qc.invalidateQueries({ queryKey: keys.leagues, exact: true });
    },
  });
}

export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leagueId, ...body }: GenerateRequest & { leagueId: number }) =>
      request<ReportResponse>("POST", `/api/leagues/${leagueId}/generate`, body),
    onSuccess: (report) => {
      qc.setQueryData(keys.report(report.slug), report);
      // Prefix match: refreshes the league list and every league's detail (new report in its history).
      void qc.invalidateQueries({ queryKey: keys.leagues });
    },
  });
}

// ---------- reports ----------

export function useReport(slug: string) {
  return useQuery({ queryKey: keys.report(slug), queryFn: () => request<ReportResponse>("GET", `/api/reports/${slug}`) });
}

export function useDeliverReport(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<ReportResponse>("POST", `/api/reports/${slug}/deliver`),
    onSuccess: (report) => qc.setQueryData(keys.report(slug), report),
  });
}

// ---------- channels ----------

export function useChannels() {
  return useQuery({ queryKey: keys.channels, queryFn: () => request<ChannelsResponse>("GET", "/api/channels") });
}

/** Channels changed: refresh the list and anything that shows linked channels. */
function invalidateChannels(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: keys.channels });
  void qc.invalidateQueries({ queryKey: keys.leagues });
}

export function useTelegramLink() {
  return useMutation({ mutationFn: () => request<TelegramLinkResponse>("POST", "/api/channels/telegram/link") });
}

export function useAddDiscord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DiscordRequest) => request<ChannelDto>("POST", "/api/channels/discord", body),
    onSuccess: () => invalidateChannels(qc),
  });
}

export function useToggleEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EmailToggleRequest) => request<ChannelsResponse>("PUT", "/api/channels/email", body),
    onSuccess: (data) => {
      qc.setQueryData(keys.channels, data);
      void qc.invalidateQueries({ queryKey: keys.leagues });
    },
  });
}

export function useTestChannel() {
  return useMutation({ mutationFn: (id: number) => request<{ ok: true }>("POST", `/api/channels/${id}/test`) });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<{ ok: true }>("DELETE", `/api/channels/${id}`),
    onSuccess: () => invalidateChannels(qc),
  });
}

// ---------- admin ----------

/** The read-only admin dashboard. Only call for users with `isAdmin`; the server 404s everyone else. */
export function useAdminDashboard() {
  return useQuery({ queryKey: keys.admin, queryFn: () => request<AdminResponse>("GET", "/api/admin") });
}
