/**
 * Pundit's UI building blocks: the few styles that repeat across pages, as Tailwind classes in
 * one place. SSR-safe (no router, no browser APIs), so both the React app and the
 * server-rendered pages use them.
 *
 * Buttons are a class-name function rather than a component, so the same look works on a
 * <button>, a plain <a> and a router <Link>:  <Link className={button({ variant: "primary" })}>
 */
import type { ComponentProps, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names, skipping falsy ones, and lets later classes win conflicts:
 * cx("p-5 mb-4", cond && "p-0") gives "mb-4 p-0". That's what makes `className` overrides on
 * Card, Pill, Input and button() reliable.
 */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(" "));
}

const BUTTON_BASE =
  "inline-flex max-w-full cursor-pointer items-center justify-center gap-2 text-center rounded-[10px] border font-semibold no-underline disabled:cursor-progress disabled:opacity-60 aria-busy:cursor-progress aria-busy:opacity-60";

const BUTTON_VARIANTS = {
  default: "border-line bg-surface text-ink hover:bg-surface-2",
  primary: "border-accent bg-accent text-accent-ink hover:brightness-110",
  danger: "border-danger bg-surface text-danger hover:bg-danger-soft",
  whatsapp: "border-wa bg-wa text-white hover:brightness-110",
} as const;

const BUTTON_SIZES = {
  sm: "min-h-[34px] px-3 py-1.5 text-sm",
  md: "min-h-[42px] px-4 py-2.5 text-[15px]",
  lg: "px-[22px] py-3.5 text-[17px]",
} as const;

export function button({
  variant = "default",
  size = "md",
  full = false,
  className,
}: {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  /** full width */
  full?: boolean;
  className?: string;
} = {}): string {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], full && "w-full", className);
}

/** The white rounded box most page content sits in. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("mb-4 rounded-xl border border-line bg-surface p-5 shadow-card", className)} {...props} />;
}

const PILL_TONES = {
  default: "bg-surface-2 text-muted",
  on: "bg-accent-soft text-accent",
  bad: "bg-danger-soft text-danger",
} as const;

/** Small rounded label: a channel kind, "Auto weekly", "failed"… */
export function Pill({
  tone = "default",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: keyof typeof PILL_TONES }) {
  return (
    <span
      className={cx("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", PILL_TONES[tone], className)}
      {...props}
    />
  );
}

export function Label(props: ComponentProps<"label">) {
  return <label className="mb-1.5 block text-sm font-semibold" {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "w-full rounded-[10px] border border-line bg-surface px-3 py-[11px] text-ink placeholder:text-muted/70",
        className,
      )}
      {...props}
    />
  );
}

/** A checkbox with its label text: <Checkbox checked onChange>After every gameweek</Checkbox> */
export function Checkbox({ children, ...props }: Omit<ComponentProps<"input">, "type"> & { children: ReactNode }) {
  return (
    <label className="my-2 flex items-center gap-2.5 text-[15px] font-medium">
      <input type="checkbox" className="size-[18px] accent-accent" {...props} />
      <span>{children}</span>
    </label>
  );
}

/** A divided list: <List><li>…</li></List> */
export function List({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cx("divide-y divide-line [&>li]:py-2.5", className)} {...props} />;
}

/** Space-between row that wraps on narrow screens. */
export function Spread({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("flex flex-wrap items-center justify-between gap-2.5", className)} {...props} />;
}

/** Things side by side with a gap, wrapping on narrow screens. */
export function Row({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("flex flex-wrap items-center gap-2.5", className)} {...props} />;
}
