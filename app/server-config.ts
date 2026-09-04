type Settings = { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string };
export function authSettings(settings: Settings) {
  const key = settings.SUPABASE_PUBLISHABLE_KEY?.trim();
  const raw = settings.SUPABASE_URL?.trim();
  if (!raw || !key)
    throw new Error('Configure a autenticação no ambiente do servidor.');
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  )
    throw new Error('A URL de autenticação deve ser uma origem HTTPS válida.');
  return { url: url.origin, key };
}
