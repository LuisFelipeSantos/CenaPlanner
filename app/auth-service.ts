import { isAllowedOrigin } from './request-origin.ts';
// Framework-independent so tests exercise the same validation as the routes.
type Session = { access_token: string; refresh_token: string; expires_in?: number };
type Dependencies = { request: (path: string, init?: RequestInit) => Promise<Response>; saveSession: (access: string, refresh: string, expires?: number) => Promise<void> };
export function authError(status: number, code?: string): string {
  if (status === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar. Confira também a pasta de spam.';
  if (code === 'signup_disabled') return 'O cadastro está desativado. Entre em contato com o responsável pelo site.';
  if (code === 'weak_password') return 'Escolha uma senha mais forte, com letras, números e símbolos.';
  if (code === 'email_address_invalid') return 'Informe um endereço de e-mail válido.';
  if (code === 'user_already_exists' || code === 'email_exists') return 'Não foi possível cadastrar este e-mail. Se já possui uma conta, tente entrar.';
  if (status >= 500) return 'O serviço de acesso está indisponível. Tente novamente em instantes.';
  return 'Não foi possível concluir. Confira os dados e tente novamente.';
}
export async function handleAuth(request: Request, mode: 'login' | 'signup', deps: Dependencies) {
  const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!isAllowedOrigin(request)) return reply({ error: 'Solicitação não permitida.' }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: 'Dados inválidos. Reenvie o formulário.' }, 400); }
  if (!body || typeof body !== 'object') return reply({ error: 'Dados inválidos.' }, 400);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 256)
    return reply({ error: 'Informe um e-mail válido e sua senha.' }, 400);
  if (mode === 'signup' && (!name || name.length > 100 || password.length < 6))
    return reply({ error: 'Informe seu nome e uma senha com pelo menos 6 caracteres.' }, 400);
  try {
    const response = await deps.request(mode === 'login' ? '/token?grant_type=password' : '/signup', {
      method: 'POST', body: JSON.stringify({ email, password, ...(mode === 'signup' ? { data: { name } } : {}) }),
    });
    const data = await response.json() as Partial<Session> & { code?: string; error_code?: string; id?: string; user?: { id?: string } };
    if (!response.ok) {
      const code = data.error_code || (typeof data.code === 'string' ? data.code : undefined);
      const credentials = mode === 'login' && (code === 'invalid_credentials' || (!code && response.status === 400));
      return reply({ error: credentials ? 'E-mail ou senha incorretos.' : authError(response.status, code) }, response.status === 429 ? 429 : response.status >= 500 ? 503 : 400);
    }
    if (typeof data.access_token === 'string' && typeof data.refresh_token === 'string') {
      await deps.saveSession(data.access_token, data.refresh_token, data.expires_in);
      return reply({ ok: true });
    }
    if (mode === 'signup' && (data.id || data.user?.id)) return reply({ ok: true, needsConfirmation: true });
    return reply({ error: 'O serviço de acesso retornou uma resposta inesperada. Tente novamente.' }, 502);
  } catch {
    return reply({ error: 'Não foi possível conectar ao serviço de acesso. Tente novamente em instantes.' }, 503);
  }
}
