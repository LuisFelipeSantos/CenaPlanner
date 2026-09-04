import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { financeService } from '../app/finance-service.ts';
import { notificationService, localDate } from '../app/notification-service.ts';
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(
      readFileSync(new URL('../drizzle/' + f, import.meta.url), 'utf8'),
    );
  const db = {
    prepare(sql) {
      let args = [];
      return {
        bind(...v) {
          args = v;
          return this;
        },
        execute() {
          return sqlite.prepare(sql).run(...args);
        },
        async run() {
          return this.execute();
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...args) };
        },
        async first() {
          return sqlite.prepare(sql).get(...args) || null;
        },
      };
    },
    async batch(stmts) {
      sqlite.exec('BEGIN');
      try {
        const r = stmts.map((s) => s.execute());
        sqlite.exec('COMMIT');
        return r;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return {
    sqlite,
    db,
    finance: financeService(db, 'a'),
    notifications: notificationService(db),
  };
}
const draft = (extra = {}) => ({
  name: 'Energia',
  category: 'Casa',
  amount: 100,
  type: 'expense',
  status: 'pendente',
  date: '2026-12-01',
  dueDate: '2026-12-15',
  repeat: 'count',
  repetitionCount: 3,
  requestId: crypto.randomUUID(),
  ...extra,
});
async function initialized() {
  const ctx = setup();
  await ctx.finance.saveProfile({
    name: 'Teste',
    monthlySalary: 2000,
    initialPeriod: '2026-12',
  });
  await ctx.notifications.preferences('a', 'teste@example.invalid');
  return ctx;
}
test('count eagerly persists all months across year boundaries without freezing future salaries', async () => {
  const { finance, sqlite } = await initialized();
  await finance.createEntry(draft());
  const entries = sqlite
    .prepare(
      'SELECT * FROM ledger_entries WHERE template_id IS NOT NULL ORDER BY period',
    )
    .all();
  assert.deepEqual(
    entries.map((e) => e.period),
    ['2026-12', '2027-01', '2027-02'],
  );
  assert.deepEqual(
    entries.map((e) => e.due_date),
    ['2026-12-15', '2027-01-15', '2027-02-15'],
  );
  assert.equal(
    sqlite.prepare('SELECT count(*) AS n FROM monthly_cycles').get().n,
    1,
  );
  await finance.openMonth('2027-03');
  assert.equal(
    sqlite
      .prepare(
        "SELECT count(*) AS n FROM ledger_entries WHERE template_id IS NOT NULL AND period='2027-03'",
      )
      .get().n,
    0,
  );
});
test('future amount cascade preserves earlier rows, and monthly override stays isolated', async () => {
  const { finance, sqlite } = await initialized();
  await finance.createEntry(draft());
  const rows = sqlite
    .prepare(
      'SELECT * FROM ledger_entries WHERE template_id IS NOT NULL ORDER BY period',
    )
    .all();
  await finance.changeEntry({ id: rows[1].id, amount: 250, scope: 'future' });
  assert.deepEqual(
    sqlite
      .prepare(
        'SELECT amount_cents FROM ledger_entries WHERE template_id IS NOT NULL ORDER BY period',
      )
      .all()
      .map((r) => r.amount_cents),
    [10000, 25000, 25000],
  );
  await finance.changeEntry({ id: rows[1].id, amount: 99, scope: 'single' });
  assert.deepEqual(
    sqlite
      .prepare(
        'SELECT amount_cents FROM ledger_entries WHERE template_id IS NOT NULL ORDER BY period',
      )
      .all()
      .map((r) => r.amount_cents),
    [10000, 9900, 25000],
  );
});
test('lazy legacy series uses effective value only at or after cascade boundary', async () => {
  const { finance, sqlite } = await initialized();
  await finance.createEntry(draft({ repeat: 'forever' }));
  await finance.openMonth('2027-02');
  const feb = sqlite
    .prepare(
      "SELECT * FROM ledger_entries WHERE template_id IS NOT NULL AND period='2027-02'",
    )
    .get();
  await finance.changeEntry({ id: feb.id, amount: 444, scope: 'future' });
  await finance.openMonth('2027-01');
  await finance.openMonth('2028-01');
  assert.equal(
    sqlite
      .prepare(
        "SELECT amount_cents FROM ledger_entries WHERE template_id IS NOT NULL AND period='2027-01'",
      )
      .get().amount_cents,
    10000,
  );
  assert.equal(
    sqlite
      .prepare(
        "SELECT amount_cents FROM ledger_entries WHERE template_id IS NOT NULL AND period='2028-01'",
      )
      .get().amount_cents,
    44400,
  );
});
test('due date is optional and exclusive to expenses', async () => {
  const { finance, sqlite } = await initialized();
  await finance.createEntry(draft({ dueDate: null }));
  assert.equal(
    sqlite
      .prepare(
        'SELECT count(*) AS n FROM ledger_entries WHERE due_date IS NOT NULL',
      )
      .get().n,
    0,
  );
  await assert.rejects(() => finance.createEntry(draft({ type: 'income' })));
  await finance.createEntry(draft({ type: 'income', dueDate: null }));
});
test('count invalid values fail before financial writes', async () => {
  const { finance, sqlite } = await initialized();
  for (const repetitionCount of [0, 121, 2.5, '3'])
    await assert.rejects(() => finance.createEntry(draft({ repetitionCount })));
  assert.equal(
    sqlite.prepare('SELECT count(*) AS n FROM recurrence_templates').get().n,
    0,
  );
});
test('due notifications are generated exactly once at D-7 D-3 D-1 and D0', async () => {
  const { finance, notifications, sqlite } = await initialized();
  await finance.createEntry(draft({ repeat: 'once' }));
  for (const date of [
    '2026-12-08',
    '2026-12-08',
    '2026-12-12',
    '2026-12-12',
    '2026-12-13',
    '2026-12-14',
    '2026-12-15',
  ])
    await notifications.scan(date, 'a');
  const list = await notifications.list('a');
  assert.equal(list.unread, 4);
  assert.equal(
    sqlite.prepare('SELECT count(*) AS n FROM notification_jobs').get().n,
    4,
  );
  await notifications.markRead('b', list.items[0].id);
  assert.equal((await notifications.list('a')).unread, 4);
  await notifications.markRead('a', list.items[0].id);
  assert.equal((await notifications.list('a')).unread, 3);
});
test('paid deleted and undated expenses do not notify', async () => {
  const { finance, notifications } = await initialized();
  await finance.createEntry(draft({ repeat: 'once', status: 'pago' }));
  await finance.createEntry(draft({ repeat: 'once', dueDate: null }));
  const created = await finance.createEntry(draft({ repeat: 'once' }));
  await finance.deleteEntry({ id: created.id, scope: 'single' });
  await notifications.scan('2026-12-12', 'a');
  assert.equal((await notifications.list('a')).unread, 0);
});
test('preferences allow only email and bell with independent opt-outs', async () => {
  const { notifications, finance, sqlite } = await initialized();
  await assert.rejects(() =>
    notifications.savePreferences('a', 'a@example.invalid', {
      inApp: 'yes',
      emailEnabled: false,
    }),
  );
  await notifications.savePreferences('a', 'a@example.invalid', {
    inApp: false,
    emailEnabled: true,
  });
  await finance.createEntry(draft({ repeat: 'once' }));
  await notifications.scan('2026-12-08', 'a');
  assert.equal((await notifications.list('a')).unread, 0);
  assert.deepEqual(
    sqlite
      .prepare('SELECT channel FROM notification_jobs')
      .all()
      .map((r) => r.channel),
    ['email'],
  );
});
test('external dispatcher blocks missing provider and never falsely marks sent', async () => {
  const { notifications, finance, sqlite } = await initialized();
  await notifications.savePreferences('a', 'a@example.invalid', {
    inApp: true,
    emailEnabled: true,
  });
  await finance.createEntry(draft({ repeat: 'once' }));
  await notifications.scan('2026-12-12', 'a');
  await notifications.dispatch({}, new Date('2026-12-12T12:00:00Z'));
  assert.equal(
    sqlite
      .prepare("SELECT status FROM notification_jobs WHERE channel='email'")
      .get().status,
    'blocked',
  );
});
test('dispatcher honors preferences again and cancels expenses paid after scan', async () => {
  const { notifications, finance, sqlite } = await initialized();
  await notifications.savePreferences('a', 'a@example.invalid', {
    inApp: true,
    emailEnabled: true,
  });
  const entry = await finance.createEntry(draft({ repeat: 'once' }));
  await notifications.scan('2026-12-12', 'a');
  await finance.changeEntry({ id: entry.id, status: 'pago' });
  let sent = 0;
  await notifications.dispatch(
    {
      email: async () => {
        sent++;
      },
    },
    new Date('2026-12-12T12:00:00Z'),
  );
  assert.equal(sent, 0);
  assert.equal(
    sqlite
      .prepare("SELECT status FROM notification_jobs WHERE channel='email'")
      .get().status,
    'cancelled',
  );
});
test('dispatcher uses linked email and stable idempotency key, with no duplicate send', async () => {
  const { notifications, finance } = await initialized();
  await notifications.savePreferences('a', 'linked@example.invalid', {
    inApp: true,
    emailEnabled: true,
  });
  await finance.createEntry(draft({ repeat: 'once' }));
  await notifications.scan('2026-12-12', 'a');
  const deliveries = [];
  const senders = { email: async (message) => deliveries.push(message) };
  await notifications.dispatch(senders, new Date('2026-12-12T12:00:00Z'));
  await notifications.dispatch(senders, new Date('2026-12-12T12:00:00Z'));
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].to, 'linked@example.invalid');
  assert.ok(deliveries[0].idempotencyKey);
});
test('failed provider retries with backoff and preserves idempotency key', async () => {
  const { notifications, finance, sqlite } = await initialized();
  await notifications.savePreferences('a', 'a@example.invalid', {
    inApp: true,
    emailEnabled: true,
  });
  await finance.createEntry(draft({ repeat: 'once' }));
  await notifications.scan('2026-12-12', 'a');
  const calls = [];
  await notifications.dispatch(
    {
      email: async (d) => {
        calls.push(d);
        throw new Error('private');
      },
    },
    new Date('2026-12-12T12:00:00Z'),
  );
  await notifications.dispatch(
    { email: async (d) => calls.push(d) },
    new Date('2026-12-12T12:00:30Z'),
  );
  assert.equal(calls.length, 1);
  await notifications.dispatch(
    { email: async (d) => calls.push(d) },
    new Date('2026-12-12T12:02:00Z'),
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
  assert.equal(
    sqlite
      .prepare("SELECT status FROM notification_jobs WHERE channel='email'")
      .get().status,
    'sent',
  );
});
test('business dates use Sao Paulo near UTC midnight', () => {
  assert.equal(localDate(new Date('2026-12-13T01:00:00Z')), '2026-12-12');
});

test('category normalization combines case and whitespace; selected categories are OR filters and user scoped', async () => {
  const { finance, db } = await initialized();
  await finance.createEntry(
    draft({ repeat: 'once', category: '  Mercado   Mensal  ', amount: 10 }),
  );
  await finance.createEntry(
    draft({ repeat: 'once', category: 'MERCADO mensal', amount: 20 }),
  );
  await finance.createEntry(
    draft({ repeat: 'once', category: 'Combustível', amount: 30 }),
  );
  const other = financeService(db, 'b');
  await other.saveProfile({
    name: 'Outro',
    monthlySalary: 0,
    initialPeriod: '2026-12',
  });
  await other.createEntry(
    draft({ repeat: 'once', category: 'Mercado mensal', amount: 999 }),
  );
  const rows = await finance.listEntries(
    new URLSearchParams(
      'from=2026-12-01&to=2026-12-31&category=mercado%20mensal&category=combustível',
    ),
  );
  assert.equal(rows.length, 3);
  assert.equal(
    rows.reduce((s, r) => s + r.amount, 0),
    60,
  );
  const categories = await finance.listCategories();
  assert.equal(categories.filter((c) => c.key === 'mercado mensal').length, 1);
});
test('category archive keeps history and category/due edits are isolated from amount cascade', async () => {
  const { finance, sqlite } = await initialized();
  const created = await finance.createEntry(draft());
  await finance.saveCategory({ name: '  CASA  ', archived: true });
  assert.equal(
    (await finance.listCategories()).find((c) => c.key === 'casa').archived,
    true,
  );
  await finance.changeEntry({
    id: created.id,
    amount: 200,
    scope: 'future',
    category: 'Nova',
    dueDate: null,
  });
  const rows = sqlite
    .prepare(
      'SELECT category,due_date,amount_cents FROM ledger_entries WHERE template_id IS NOT NULL ORDER BY period',
    )
    .all();
  assert.deepEqual(
    rows.map((r) => r.category),
    ['Nova', 'Casa', 'Casa'],
  );
  assert.deepEqual(
    rows.map((r) => r.amount_cents),
    [20000, 20000, 20000],
  );
  assert.equal(rows[0].due_date, null);
});
