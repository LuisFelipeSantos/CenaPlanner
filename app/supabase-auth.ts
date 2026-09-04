import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { authSettings } from './server-config';

export type AppUser = {
  userId: string;
  email: string;
  fullName: string | null;
};
const accessCookie = 'finance_access_token';
const refreshCookie = 'finance_refresh_token';

function config() {
  return authSettings(env);
}

export async function supabaseRequest(
  path: string,
  init: RequestInit = {},
  token?: string,
) {
  const { url, key } = config();
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  headers.set('content-type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${url}/auth/v1${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
    headers,
  });
}

export async function setSession(
  accessToken: string,
  refreshToken: string,
  expiresIn = 3600,
) {
  const jar = await cookies();
  const secure = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
  };
  jar.set(accessCookie, accessToken, { ...secure, maxAge: expiresIn });
  jar.set(refreshCookie, refreshToken, {
    ...secure,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(accessCookie);
  jar.delete(refreshCookie);
}

export async function getAppUser(): Promise<AppUser | null> {
  const jar = await cookies();
  const token = jar.get(accessCookie)?.value;
  if (!token) return null;
  try {
    const response = await supabaseRequest('/user', {}, token);
    if (!response.ok) return null;
    const user = (await response.json()) as {
      id: string;
      email?: string;
      user_metadata?: { name?: string };
    };
    return {
      userId: user.id,
      email: user.email || '',
      fullName: user.user_metadata?.name || null,
    };
  } catch {
    return null;
  }
}
