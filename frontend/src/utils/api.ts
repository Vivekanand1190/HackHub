/**
 * Base URL of the HackHub backend API.
 *
 * Configure it per-environment with NEXT_PUBLIC_API_URL (see frontend/.env.example).
 * Falls back to the local dev server so `npm run dev` works out of the box.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8888').replace(/\/+$/, '');

/** Join a path onto the API base, e.g. apiUrl('/api/teams') -> `${API_BASE}/api/teams`. */
export const apiUrl = (path: string): string => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
