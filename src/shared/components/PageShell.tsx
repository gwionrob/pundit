/**
 * Site chrome (header, main, footer) shared by the React app and the server-rendered pages.
 *
 * SSR-safe: plain props in, markup out. No router, no browser APIs. The caller supplies the
 * nav contents, so the server can pass plain <a> links and the React app can pass <Link>s.
 */
import type { ReactNode } from "react";

export function Brand({ href }: { href: string }) {
  return (
    <a className="brand" href={href}>
      <span className="mark">P</span> Pundit
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="site">
      <div className="wrap">
        Pundit — the weekly bulletin for your Fantasy Premier League mini-league. Not affiliated with the Premier
        League.
      </div>
    </footer>
  );
}

/** Nav for visitors who aren't logged in (plain links: works with or without the router). */
export function GuestNav() {
  return (
    <>
      <a href="/login">Log in</a>
      <a className="btn primary sm" href="/signup">
        Sign up free
      </a>
    </>
  );
}

export function PageShell(props: {
  /** where the logo links to: "/" for visitors, "/dashboard" when logged in */
  brandHref: string;
  /** contents of the header nav */
  nav: ReactNode;
  /** rendered above the page content, e.g. a flash message */
  notice?: ReactNode;
  /** optional custom brand element (the React app passes a router <Link>) */
  brand?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="top">
        <div className="wrap">
          {props.brand ?? <Brand href={props.brandHref} />}
          <nav className="links">{props.nav}</nav>
        </div>
      </header>
      <main>
        <div className="wrap">
          {props.notice}
          {props.children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
