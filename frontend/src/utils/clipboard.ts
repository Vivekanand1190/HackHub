/**
 * Copy text to the clipboard without throwing.
 *
 * `navigator.clipboard` only exists in a secure context. This app is routinely
 * served over plain http:// from a LAN or Tailscale address (see
 * `allowedDevOrigins` in next.config.ts), where the API is undefined - so a
 * bare `navigator.clipboard.writeText(...)` throws before it can even return a
 * promise, and where the API does exist but permission is refused, the returned
 * promise rejects with nothing handling it.
 *
 * This never throws. It reports whether the copy actually succeeded, so callers
 * can show "Copied!" only when something really was copied.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Denied, or the document is not focused. Fall through to the fallback.
    }
  }

  // Fallback for insecure contexts, where the async Clipboard API is absent.
  try {
    if (typeof document === 'undefined') return false;
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.top = '0';
    field.style.left = '0';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}
