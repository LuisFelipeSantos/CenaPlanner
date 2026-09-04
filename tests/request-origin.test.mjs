import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, publicAppOrigin } from '../app/request-origin.ts';
const publicUrl = 'https://example.onrender.com';
const req = (origin, extra = {}) => new Request('http://localhost:10000/api/auth/login', { headers: { ...(origin ? { origin } : {}), ...extra } });
test('proxy accepts configured public origin, rejects foreign origins and spoofed forwarding', () => {
  assert.equal(isAllowedOrigin(req(publicUrl), publicUrl), true);
  for (const origin of ['https://evil.example', 'null', publicUrl + '.evil.example', 'http://example.onrender.com']) {
    assert.equal(isAllowedOrigin(req(origin, { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' }), publicUrl), false);
  }
  assert.equal(isAllowedOrigin(req('http://localhost:10000'), publicUrl), false);
  assert.equal(isAllowedOrigin(req(null), publicUrl), true);
  assert.equal(isAllowedOrigin(req(publicUrl), 'invalid'), false);
});
test('local development preserves same-origin validation', () => {
  assert.equal(isAllowedOrigin(req('http://localhost:10000'), ''), true);
  assert.equal(isAllowedOrigin(req(publicUrl), ''), false);
});
test('Render server-provided URL is used automatically', () => {
  const previous = process.env.RENDER_EXTERNAL_URL;
  process.env.RENDER_EXTERNAL_URL = publicUrl;
  try { assert.equal(isAllowedOrigin(req(publicUrl)), true); }
  finally { if (previous === undefined) delete process.env.RENDER_EXTERNAL_URL; else process.env.RENDER_EXTERNAL_URL = previous; }
});
test('public application origin is safe and excludes paths', () => {
  assert.equal(publicAppOrigin(new Request(`${publicUrl}/api/auth/signup`)), publicUrl);
});
