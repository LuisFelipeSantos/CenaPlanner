import { env } from 'cloudflare:workers';
import { getAppUser } from './supabase-auth';
import { notificationService, PreferenceError } from './notification-service';
export async function notificationApi(
  request: Request,
  action: (
    service: ReturnType<typeof notificationService>,
    user: { userId: string; email: string },
    body: Record<string, unknown>,
  ) => Promise<unknown>,
) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const user = await getAppUser();
    if (!user)
      return reply(
        { error: 'Entre novamente para acessar notificações.' },
        401,
      );
    if (
      request.method !== 'GET' &&
      request.headers.get('origin') &&
      request.headers.get('origin') !== new URL(request.url).origin
    )
      return reply({ error: 'Solicitação não permitida.' }, 403);
    let body: Record<string, unknown> = {};
    if (request.method !== 'GET') {
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch (error) {
        if (error instanceof PreferenceError)
          return reply({ error: error.message }, 400);
        return reply({ error: 'Dados inválidos.' }, 400);
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        return reply({ error: 'Dados inválidos.' }, 400);
    }
    return reply(await action(notificationService(env.DB), user, body));
  } catch {
    return reply(
      { error: 'Não foi possível processar as notificações. Tente novamente.' },
      503,
    );
  }
}
