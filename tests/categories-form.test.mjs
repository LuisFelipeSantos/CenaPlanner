import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('category management defaults to active on every open and filters the list', () => {
  const source = readFileSync(
    new URL('../app/dashboard.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /if\s*\(value === 'categories'\)\s*setCategoryVisibility\('active'\)/,
  );
  assert.match(
    source,
    /visibleCategories\(\s*categories,\s*categoryVisibility,?\s*\)\.map/,
  );
  assert.match(source, /c\.archived \? 'Ativar' : 'Inativar'/);
  const controls = readFileSync(
    new URL('../app/category-controls.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(controls.includes('Apenas inativas'));
  assert.ok(!/Arquivada|Arquivar/.test(controls));
});
test('category submit button explicitly submits the form', () => {
  const source = readFileSync(
    new URL('../app/dashboard.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /<Button\s+type="submit"\s+disabled=\{busy\}[\s\S]*?\{busy\s*\?\s*'Cadastrando…'/,
  );
});
