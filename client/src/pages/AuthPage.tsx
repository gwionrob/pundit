import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { button, Card, Input, Label } from "../../../src/shared/components/ui.tsx";
import { errorMessage, useLogin, useSignup } from "../api.ts";
import { Notice } from "../components/Notice.tsx";

/** Log in and sign up share one form. */
export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const login = useLogin();
  const signup = useSignup();
  const auth = isSignup ? signup : login;

  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    auth.mutate({ email, password }, { onSuccess: () => navigate(from, { replace: true }) });
  };

  return (
    <Card className="mx-auto my-6 max-w-[420px]">
      <title>{isSignup ? "Sign up · Pundit" : "Log in · Pundit"}</title>
      <h1 className="text-[1.6rem]">{isSignup ? "Create your account" : "Welcome back"}</h1>
      {isSignup && <p className="text-muted">Free during beta, with up to 3 leagues.</p>}
      {auth.isError && <Notice kind="err">{errorMessage(auth.error)}</Notice>}

      <form className="space-y-3" onSubmit={onSubmit}>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {isSignup && <p className="mt-1.5 text-sm text-muted">At least 8 characters.</p>}
        </div>
        <button className={button({ variant: "primary", full: true })} type="submit" disabled={auth.isPending}>
          {auth.isPending ? "One moment…" : isSignup ? "Sign up" : "Log in"}
        </button>
      </form>

      <p className="mt-4 mb-0 text-center text-sm text-muted">
        {isSignup ? (
          <>
            Already have an account? <Link to="/login">Log in</Link>
          </>
        ) : (
          <>
            New here? <Link to="/signup">Create an account</Link>
          </>
        )}
      </p>
    </Card>
  );
}
