// Trust server configuration, never client-provided forwarded headers.
export function isAllowedOrigin(request: Request, configuredOrigin?: string): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const configured = configuredOrigin ?? (typeof process !== 'undefined'
    ? process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL ||
      (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : undefined)
    : undefined);
  try {
    const expected = new URL(configured || request.url);
    if (!['https:', 'http:'].includes(expected.protocol)) return false;
    return origin === expected.origin;
  } catch { return false; }
}

export function publicAppOrigin(request: Request): string {
  const configured = typeof process !== 'undefined'
    ? process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL ||
      (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : undefined)
    : undefined;
  const url = new URL(configured || request.url);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid application origin');
  return url.origin;
}
