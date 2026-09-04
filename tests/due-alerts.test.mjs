import test from 'node:test';
import assert from 'node:assert/strict';
import { dueGroup, dueDays, saoPauloDate } from '../app/due-alerts.ts';
test('vencimento é independente da data contábil e ignora pagos e receitas', () => {
  const entry = {
    type: 'expense',
    status: 'pendente',
    dueDate: '2026-09-03',
    entryDate: '2026-09-04',
  };
  assert.equal(dueGroup(entry, '2026-09-04'), 'overdue');
  assert.equal(dueDays(entry.dueDate, '2026-09-04'), -1);
  assert.equal(dueGroup({ ...entry, status: 'pago' }, '2026-09-04'), null);
  assert.equal(dueGroup({ ...entry, type: 'income' }, '2026-09-04'), null);
  assert.equal(dueGroup({ ...entry, dueDate: null }, '2026-09-04'), null);
});
test('faixas incluem hoje e sete dias, com virada de ano e fuso São Paulo', () => {
  const entry = { type: 'expense', status: 'pendente', dueDate: '2027-01-01' };
  assert.equal(dueGroup(entry, '2026-12-25'), 'soon');
  assert.equal(dueGroup(entry, '2026-12-24'), null);
  assert.equal(dueGroup(entry, '2027-01-01'), 'today');
  assert.equal(saoPauloDate(new Date('2026-09-04T01:00:00Z')), '2026-09-03');
});
