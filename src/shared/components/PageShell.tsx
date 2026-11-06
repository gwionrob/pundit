/**
 * Site chrome (header, main, footer) shared by the React app and the server-rendered pages.
 *
 * SSR-safe: plain props in, markup out. No router, no browser APIs. The caller supplies the
 * nav contents, so the server can pass plain <a> links and the React app can pass <Link>s.
 */
import type { ReactNode } from "react";
import { button } from "./ui.tsx";

/** Centred page column. */
export const WRAP = "mx-auto max-w-[880px] px-4";

/** Classes for the logo link, shared with the React app's router <Link>. */
export const BRAND = "flex items-center gap-2 font-extrabold tracking-tight text-ink no-underline";

/** The teal "P" tile in the logo. */
export function BrandMark() {
  return (
    <span className="inline-grid size-7 place-items-center rounded-lg bg-accent text-[15px] text-accent-ink">P</span>
  );
}

export function Brand({ href }: { href: string }) {
  return (
    <a className={BRAND} href={href}>
      <BrandMark /> Pundit
    </a>
  );
}

/** A header nav link or button: <a className={NAV_LINK}>. */
export const NAV_LINK =
  "cursor-pointer rounded-lg px-2.5 py-1.5 text-[15px] text-muted no-underline hover:bg-surface-2 hover:text-ink";

export function SiteFooter() {
  return (
    <footer className="border-t border-line py-6 text-sm text-muted">
      <div className={WRAP}>
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
      <a className={NAV_LINK} href="/login">
        Log in
      </a>
      <a className={button({ variant: "primary", size: "sm" })} href="/signup">
        Sign up free
      </a>
    </>
  );
}

/** Nav for logged-in users on server-rendered pages (the React app has its own, with Log out). */
export function MemberNav() {
  return (
    <>
      <a className={NAV_LINK} href="/dashboard">
        Leagues
      </a>
      <a className={NAV_LINK} href="/channels">
        Channels
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
      <header className="border-b border-line bg-surface">
        <div className={`${WRAP} flex min-h-[60px] flex-wrap items-center justify-between gap-3`}>
          {props.brand ?? <Brand href={props.brandHref} />}
          <nav className="flex flex-wrap items-center gap-1">{props.nav}</nav>
        </div>
      </header>
      <main className="pt-7 pb-16">
        <div className={WRAP}>
          {props.notice}
          {props.children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
