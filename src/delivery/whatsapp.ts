/**
 * WhatsApp delivery is deliberately "one tap" rather than automated: there is
 * no official API for posting into ordinary group chats, so we build a
 * wa.me link that opens WhatsApp with the bulletin pre-filled and the user
 * picks the group themselves.
 */

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function reportUrl(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/+$/, "")}/r/${slug}`;
}

/** Footer appended to shared bulletins — doubles as the growth loop. */
export function reportFooter(appUrl: string, slug: string): string {
  return `📰 Full bulletin: ${reportUrl(appUrl, slug)}\nMade with Pundit`;
}
