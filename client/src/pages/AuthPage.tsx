import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
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
    <div className="card narrow">
      <title>{isSignup ? "Sign up · Pundit" : "Log in · Pundit"}</title>
      <h1 style={{ fontSize: "1.6rem" }}>{isSignup ? "Create your account" : "Welcome back"}</h1>
      {isSignup && <p className="muted">Free during beta, with up to 3 leagues.</p>}
      {auth.isError && <Notice kind="err">{errorMessage(auth.error)}</Notice>}

      <form className="stack" onSubmit={onSubmit}>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {isSignup && (
            <p className="small muted" style={{ marginTop: 6 }}>
              At least 8 characters.
            </p>
          )}
        </div>
        <button className="btn primary" type="submit" style={{ width: "100%" }} disabled={auth.isPending}>
          {auth.isPending ? "One moment…" : isSignup ? "Sign up" : "Log in"}
        </button>
      </form>

      <p className="small muted center" style={{ marginTop: 16 }}>
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
    </div>
  );
}
