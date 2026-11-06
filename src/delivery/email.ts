export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailConfig {
  RESEND_API_KEY?: string | undefined;
  EMAIL_FROM: string;
}

/** Sends via Resend's HTTP API when configured; otherwise logs to the console. */
export async function sendEmail(cfg: EmailConfig, msg: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!cfg.RESEND_API_KEY) {
    console.log(`[email:dev] to=${msg.to} subject=${JSON.stringify(msg.subject)}\n${msg.text}\n[/email]`);
    return;
  }
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: cfg.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status}) ${body.slice(0, 200)}`);
  }
}
