import type { ReactNode } from "react";

export interface Flash {
  kind: "ok" | "err";
  text: string;
}

/** Green (ok) or red (err) message box. Announced to screen readers. */
export function Notice({ kind, children }: { kind: Flash["kind"]; children: ReactNode }) {
  return (
    <div
      className={`mb-4 rounded-[10px] px-3.5 py-3 text-[15px] ${kind === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}
      role={kind === "err" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

/** Renders a Flash if there is one. */
export function FlashNotice({ flash }: { flash: Flash | null | undefined }) {
  return flash ? <Notice kind={flash.kind}>{flash.text}</Notice> : null;
}
