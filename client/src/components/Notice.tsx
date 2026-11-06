import type { ReactNode } from "react";

export interface Flash {
  kind: "ok" | "err";
  text: string;
}

/** Green (ok) or red (err) message box. Announced to screen readers. */
export function Notice({ kind, children }: { kind: Flash["kind"]; children: ReactNode }) {
  return (
    <div className={`flash ${kind}`} role={kind === "err" ? "alert" : "status"}>
      {children}
    </div>
  );
}

/** Renders a Flash if there is one. */
export function FlashNotice({ flash }: { flash: Flash | null | undefined }) {
  return flash ? <Notice kind={flash.kind}>{flash.text}</Notice> : null;
}
