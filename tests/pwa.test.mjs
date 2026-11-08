import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('manifest declares installable CenaPlanner identity and icons', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.name, 'CenaPlanner');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
});

test('service worker excludes APIs and every non-GET request from caching', () => {
  const worker = readFileSync('public/sw.js', 'utf8');
  assert.match(worker, /request\.method !== 'GET'/);
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.doesNotMatch(worker, /localStorage|finance_access_token|finance_refresh_token/);
  assert.match(worker, /fetch\(request\)\.catch/);
  assert.match(worker, /offline\.html/);
});

test('layout exposes manifest and iPhone installation metadata', () => {
  const layout = readFileSync('app/layout.tsx', 'utf8');
  assert.match(layout, /manifest: '\/manifest\.webmanifest'/);
  assert.match(layout, /apple-mobile-web-app-capable/);
  assert.match(layout, /apple-touch-icon\.png/);
  assert.match(layout, /themeColor: '#184e3a'/);
});
