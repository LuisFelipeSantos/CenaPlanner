import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryKey,
  categoryTotals,
  visibleCategories,
} from '../app/category-utils.ts';

test('category visibility separates active, archived and all without modifying data', () => {
  const rows = [
    { name: 'Ativa', archived: false },
    { name: 'Antiga', archived: true },
  ];
  assert.deepEqual(visibleCategories(rows, 'active'), [rows[0]]);
  assert.deepEqual(visibleCategories(rows, 'archived'), [rows[1]]);
  assert.deepEqual(visibleCategories(rows, 'all'), rows);
  assert.equal(rows.length, 2);
});

test('category identity normalizes case, unicode and extra whitespace', () => {
  assert.equal(
    categoryKey('  ALIMENTAÇÃO \t mensal  '),
    categoryKey('alimentação mensal'),
  );
  assert.equal(categoryKey('Cafe\u0301'), categoryKey('CAFÉ'));
});
test('category report combines income and expense without floating point drift', () => {
  const rows = categoryTotals([
    { category: ' Mercado ', type: 'expense', amount: 0.1 },
    { category: 'MERCADO', type: 'expense', amount: 0.2 },
    { category: 'mercado', type: 'income', amount: 1.5 },
    { category: 'Combustível', type: 'expense', amount: 100 },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.find((r) => categoryKey(r.name) === 'mercado'),
    { name: 'Mercado', income: 150, expense: 30, balance: 120 },
  );
  assert.equal(
    rows.reduce((s, r) => s + r.expense, 0),
    10030,
  );
});
test('empty recut has no invented categories or totals', () => {
  assert.deepEqual(categoryTotals([]), []);
});
