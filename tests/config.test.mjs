import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authSettings } from '../app/server-config.ts';
test('auth configuration requires a safe HTTPS origin and key', () => {
  assert.deepEqual(
    authSettings({
      SUPABASE_URL: 'https://example.invalid/',
      SUPABASE_PUBLISHABLE_KEY: 'test',
    }),
    { url: 'https://example.invalid', key: 'test' },
  );
  for (const url of [
    'http://example.invalid',
    'https://user:pass@example.invalid',
    'https://example.invalid/?key=secret',
    'https://example.invalid/auth',
    '',
  ]) {
    assert.throws(() =>
      authSettings({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: 'test' }),
    );
  }
  assert.throws(() =>
    authSettings({ SUPABASE_URL: 'https://example.invalid' }),
  );
});
test('env example has no populated values', () => {
  const source = readFileSync(
    new URL('../.env.example', import.meta.url),
    'utf8',
  );
  for (const line of source
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#')))
    assert.match(line, /^[A-Z_][A-Z_0-9]*=$/);
});
