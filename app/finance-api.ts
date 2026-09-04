import { env } from 'cloudflare:workers';
import { isAllowedOrigin } from './request-origin.ts';
import { getAppUser } from './supabase-auth';
import { financeService, FinanceError } from './finance-service';
export async function financeApi(
  request: Request,
  action: (
    service: ReturnType<typeof financeService>,
    body: Record<string, unknown>,
  ) => Promise<unknown>,
) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const user = await getAppUser();
    if (!user)
      return reply({ error: 'Sua sessão expirou. Entre novamente.' }, 401);
    if (
      request.method !== 'GET' &&
      !isAllowedOrigin(request)
    )
      return reply({ error: 'Solicitação não permitida.' }, 403);
    let body: Record<string, unknown> = {};
    if (request.method !== 'GET') {
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        throw new FinanceError('Dados inválidos.');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new FinanceError('Dados inválidos.');
    }
    return reply(await action(financeService(env.DB, user.userId), body));
  } catch (error) {
    if (error instanceof FinanceError)
      return reply({ error: error.message }, error.status);
    // Never include financial values or credentials in logs or client errors.
    return reply(
      {
        error: 'Não foi possível salvar ou carregar os dados. Tente novamente.',
      },
      503,
    );
  }
}
