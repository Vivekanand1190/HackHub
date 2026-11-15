/**
 * Download a file from an authenticated API route.
 *
 * These routes require `Authorization: Bearer …`, and a plain navigation —
 * `<a href>` or `window.location.href` — cannot send a custom header. The
 * browser therefore hit them without a token and got a 401, which is why the
 * ZIP export silently failed. Fetch the bytes with the header, then hand them
 * to the browser as a blob download.
 */
export interface DownloadResult {
  ok: boolean;
  error?: string;
  filename?: string;
}

export async function downloadWithAuth(path: string, fallbackName: string): Promise<DownloadResult> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('hackhub_token') : null;

    const res = await fetch(path, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.error || '';
      } catch {
        /* not JSON */
      }
      return { ok: false, error: detail || `Download failed (HTTP ${res.status})` };
    }

    const blob = await res.blob();

    // Prefer the server's filename, so the archive is named after the team.
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    const filename = match ? match[1] : fallbackName;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoke on the next tick so Safari has time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return { ok: true, filename };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Download failed' };
  }
}
