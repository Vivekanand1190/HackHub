/**
 * Base URL of the HackHub backend API.
 *
 * Dynamically resolves to the active hostname (e.g. 192.168.x.x or Tailscale IP)
 * if NEXT_PUBLIC_API_URL is not set, so local network / remote peer devices
 * can communicate with the backend seamlessly.
 */
export const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:8888`;
  }
  return 'http://localhost:8888';
};

export const API_BASE = getApiBase();

/** Join a path onto the API base, e.g. apiUrl('/api/teams') -> `${API_BASE}/api/teams`. */
export const apiUrl = (path: string): string => {
  const base = typeof window !== 'undefined' ? getApiBase() : API_BASE;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};
