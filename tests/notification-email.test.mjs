import test from 'node:test';
import assert from 'node:assert/strict';
import { financialEmail } from '../app/notification-email.ts';
test('email template escapes user text and includes accessible plain text', () => {
  const email = financialEmail('due', [{ name: '<script>alert(1)</script>', dueDate: '2026-12-15', amountCents: 125000 }], 3);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /1\.250,00/);
  assert.match(email.text, /15\/12\/2026/);
  assert.match(email.subject, /3 dias/);
});
