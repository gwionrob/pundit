import { Link } from "react-router";
import { button, Card } from "../../../src/shared/components/ui.tsx";

export function NotFoundPage() {
  return (
    <Card className="mx-auto mt-10 max-w-[480px] text-center">
      <title>Not found · Pundit</title>
      <h1 className="text-[1.6rem]">Page not found</h1>
      <p className="text-muted">That page doesn't exist, or the link is wrong.</p>
      <Link className={button({ variant: "primary" })} to="/dashboard">
        Go to your leagues
      </Link>
    </Card>
  );
}
