import { useEffect, useRef, useState } from "react";

/**
 * Copy text to the clipboard. `copied` is true for ~2 seconds afterwards so the button can
 * say "Copied ✓". Falls back to a hidden textarea where the Clipboard API isn't available
 * (e.g. plain http on a phone).
 */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        copyWithTextarea(text);
      }
    } catch {
      copyWithTextarea(text);
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return { copy, copied };
}

function copyWithTextarea(text: string) {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand("copy");
  } finally {
    el.remove();
  }
}
