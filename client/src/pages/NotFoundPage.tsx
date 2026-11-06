import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="card center" style={{ maxWidth: 480, margin: "40px auto" }}>
      <title>Not found · Pundit</title>
      <h1 style={{ fontSize: "1.6rem" }}>Page not found</h1>
      <p className="muted">That page doesn't exist, or the link is wrong.</p>
      <Link className="btn primary" to="/dashboard">
        Go to your leagues
      </Link>
    </div>
  );
}
