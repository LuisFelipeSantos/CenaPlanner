import { cookies } from 'next/headers';
import { isAllowedOrigin } from '../../../request-origin.ts';
import { clearSession, supabaseRequest } from '@/app/supabase-auth';
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return Response.json({ error: 'Solicitação não permitida.' }, { status: 403 });
  const token = (await cookies()).get('finance_access_token')?.value;
  try { if (token) await supabaseRequest('/logout?scope=local', { method: 'POST' }, token); }
  catch { /* Local logout must still work when the provider is unavailable. */ }
  await clearSession();
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
