// Trust server configuration, never client-provided forwarded headers.
export function isAllowedOrigin(request: Request, configuredOrigin?: string): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const configured = configuredOrigin ?? (typeof process !== 'undefined'
    ? process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL : undefined);
  try {
    const expected = new URL(configured || request.url);
    if (!['https:', 'http:'].includes(expected.protocol)) return false;
    return origin === expected.origin;
  } catch { return false; }
}
