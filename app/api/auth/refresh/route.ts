import { cookies } from 'next/headers';
import { isAllowedOrigin } from '../../../request-origin.ts';
import { clearSession, setSession, supabaseRequest } from '@/app/supabase-auth';
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return Response.json({ error: 'Solicitação não permitida.' }, { status: 403 });
  const refresh = (await cookies()).get('finance_refresh_token')?.value;
  if (!refresh) return Response.json({ ok: false }, { status: 401 });
  try {
    const response = await supabaseRequest('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refresh }) });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) await clearSession();
      return Response.json({ ok: false }, { status: response.status >= 500 ? 503 : response.status });
    }
    const data = await response.json() as { access_token: string; refresh_token: string; expires_in: number };
    if (!data.access_token || !data.refresh_token) throw new Error('Invalid session');
    await setSession(data.access_token, data.refresh_token, data.expires_in);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ ok: false }, { status: 503 }); }
}
