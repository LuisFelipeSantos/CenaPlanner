import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  financeService,
  currentPeriod,
  dateAt,
} from '../app/finance-service.ts';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(
      readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'),
    );
  const db = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        execute() {
          return sqlite.prepare(sql).run(...args);
        },
        async run() {
          return this.execute();
        },
        async first() {
          return sqlite.prepare(sql).get(...args) || null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...args) };
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map((s) => s.execute());
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { sqlite, db, service: financeService(db, 'user-a') };
}
async function setup() {
  const ctx = database();
  await ctx.service.saveProfile({
    name: 'Teste',
    monthlySalary: 2500,
    initialPeriod: '2020-01',
  });
  return ctx;
}
function month(service, period) {
  return service.listEntries(
    new URLSearchParams({
      year: period.slice(0, 4),
      month: String(Number(period.slice(5))),
    }),
  );
}
function draft(overrides = {}) {
  return {
    name: 'Aluguel',
    category: 'Moradia',
    amount: 125.55,
    type: 'expense',
    status: 'pago',
    date: '2020-12-31',
    repeat: 'forever',
    intervalMonths: 1,
    requestId: crypto.randomUUID(),
    ...overrides,
  };
}

test('batch payments and deletions affect only selected occurrences and preserve payment timestamps', async () => {
  const { service, db, sqlite } = await setup();
  await service.createEntry(
    draft({ repeat: 'count', repetitionCount: 3, status: 'pendente' }),
  );
  const ids = sqlite
    .prepare(
      'SELECT id FROM ledger_entries WHERE template_id IS NOT NULL ORDER BY period',
    )
    .all()
    .map((r) => r.id);
  const timed = financeService(
    db,
    'user-a',
    () => new Date('2026-09-04T12:00:00Z'),
  );
  await timed.batchEntries({ ids: [ids[0], ids[1], ids[1]], action: 'pay' });
  assert.equal(
    sqlite
      .prepare(
        "SELECT count(*) AS n FROM ledger_entries WHERE template_id IS NOT NULL AND status='pago'",
      )
      .get().n,
    2,
  );
  assert.equal(
    sqlite.prepare('SELECT paid_at FROM ledger_entries WHERE id=?').get(ids[0])
      .paid_at,
    '2026-09-04T12:00:00.000Z',
  );
  await assert.rejects(
    timed.batchEntries({ ids: [ids[0], 'missing'], action: 'delete' }),
  );
  assert.equal(
    sqlite
      .prepare('SELECT deleted_at FROM ledger_entries WHERE id=?')
      .get(ids[0]).deleted_at,
    null,
  );
  await timed.batchEntries({ ids: [ids[0]], action: 'delete' });
  assert.equal(
    sqlite
      .prepare('SELECT deleted_at FROM ledger_entries WHERE id=?')
      .get(ids[2]).deleted_at,
    null,
  );
  await assert.rejects(timed.batchEntries({ ids: [], action: 'pay' }));
  await assert.rejects(
    timed.batchEntries({ ids: Array(101).fill(ids[2]), action: 'pay' }),
  );
  await assert.rejects(
    timed.batchEntries({ ids: [ids[2]], action: 'anything' }),
  );
});

test('batch rejects foreign ids before writes and rolls back a failed batch', async () => {
  const { service, db, sqlite } = await setup();
  await service.createEntry(draft({ repeat: 'once', status: 'pendente' }));
  const id = sqlite
    .prepare("SELECT id FROM ledger_entries WHERE source_key LIKE 'manual:%'")
    .get().id;
  const other = financeService(db, 'user-b');
  await other.saveProfile({
    name: 'Outro',
    monthlySalary: 1,
    initialPeriod: '2020-01',
  });
  await assert.rejects(other.batchEntries({ ids: [id], action: 'pay' }));
  assert.equal(
    sqlite.prepare('SELECT status FROM ledger_entries WHERE id=?').get(id)
      .status,
    'pendente',
  );
  await service.createEntry(draft({ repeat: 'once', status: 'pendente' }));
  const ids = sqlite
    .prepare("SELECT id FROM ledger_entries WHERE source_key LIKE 'manual:%'")
    .all()
    .map((r) => r.id);
  sqlite.exec(
    `CREATE TRIGGER stop_payment BEFORE UPDATE OF status ON ledger_entries WHEN new.id='${ids[1]}' BEGIN SELECT RAISE(ABORT,'test rollback'); END`,
  );
  await assert.rejects(service.batchEntries({ ids, action: 'pay' }));
  assert.equal(
    sqlite.prepare('SELECT status FROM ledger_entries WHERE id=?').get(ids[0])
      .status,
    'pendente',
  );
});

test('category budget is optional, normalized, persisted and preserved by entry saves', async () => {
  const { service, db } = await setup();
  await service.saveCategory({ name: ' Mercado ', monthlyBudget: 800 });
  await service.saveCategory({ name: 'mercado' });
  assert.equal(
    (await service.listCategories()).find((c) => c.key === 'mercado')
      .monthlyBudget,
    800,
  );
  await service.createEntry(draft({ category: 'MERCADO', repeat: 'once' }));
  assert.equal(
    (await service.listCategories()).find((c) => c.key === 'mercado')
      .monthlyBudget,
    800,
  );
  await assert.rejects(
    service.saveCategory({ name: 'Mercado', monthlyBudget: -1 }),
  );
  await assert.rejects(
    service.saveCategory({ name: 'Mercado', monthlyBudget: 0 }),
  );
  await service.saveCategory({ name: 'Mercado', monthlyBudget: null });
  assert.equal(
    (await service.listCategories()).find((c) => c.key === 'mercado')
      .monthlyBudget,
    null,
  );
  const other = financeService(db, 'user-b');
  await other.saveProfile({
    name: 'Outro',
    monthlySalary: 1,
    initialPeriod: '2020-01',
  });
  assert.ok(!(await other.listCategories()).some((c) => c.key === 'mercado'));
});

test('payment timestamps persist, preserve retries, clear on pending and isolate users', async () => {
  const { db, service } = await setup();
  await service.createEntry(draft({ repeat: 'once', status: 'pendente' }));
  const entry = (await month(service, '2020-12')).find((e) => !e.isSalary);
  const paid = financeService(
    db,
    'user-a',
    () => new Date('2026-09-04T13:00:00Z'),
  );
  await paid.changeEntry({ id: entry.id, status: 'pago' });
  assert.equal(
    (await month(service, '2020-12')).find((e) => e.id === entry.id).paidAt,
    '2026-09-04T13:00:00.000Z',
  );
  const later = financeService(
    db,
    'user-a',
    () => new Date('2026-09-05T13:00:00Z'),
  );
  await later.changeEntry({ id: entry.id, status: 'pago' });
  assert.equal(
    (await month(service, '2020-12')).find((e) => e.id === entry.id).paidAt,
    '2026-09-04T13:00:00.000Z',
  );
  await assert.rejects(
    financeService(db, 'other').changeEntry({ id: entry.id, status: 'pago' }),
  );
  await later.changeEntry({ id: entry.id, status: 'pendente' });
  assert.equal(
    (await month(service, '2020-12')).find((e) => e.id === entry.id).paidAt,
    null,
  );
  await later.changeEntry({ id: entry.id, status: 'pago' });
  assert.equal(
    (await month(service, '2020-12')).find((e) => e.id === entry.id).paidAt,
    '2026-09-05T13:00:00.000Z',
  );
  await later.createEntry(draft({ repeat: 'once', type: 'income' }));
  assert.ok(
    (await month(service, '2020-12')).find(
      (e) => e.type === 'income' && !e.isSalary,
    ).paidAt,
  );
});

test('onboarding persists completion, default settings, categories and first salary atomically', async () => {
  const { service, sqlite } = await setup();
  const profile = await service.getProfile();
  assert.equal(profile.name, 'Teste');
  assert.ok(profile.onboardingCompletedAt);
  assert.equal(profile.initialPeriod, '2020-01');
  assert.equal(
    sqlite.prepare('SELECT currency FROM financial_users').get().currency,
    'BRL',
  );
  assert.equal(
    sqlite.prepare('SELECT count(*) AS n FROM categories').get().n,
    6,
  );
  assert.equal((await month(service, '2020-01'))[0].amount, 2500);
  await service.saveProfile({
    name: 'Teste',
    monthlySalary: 2500,
    initialPeriod: '2020-01',
  });
  await Promise.all([
    service.openMonth('2020-01'),
    service.openMonth('2020-01'),
  ]);
  assert.equal((await month(service, '2020-01')).length, 1);
});
test('global salary changes overwrite future cycles but preserve current and past periods', async () => {
  const { service } = await setup();
  await service.openMonth('2099-01');
  await service.openMonth(currentPeriod());
  await service.saveProfile({ name: 'Teste', monthlySalary: 4000 });
  await service.openMonth('2099-02');
  await service.openMonth('2020-02');
  assert.equal((await month(service, '2020-01'))[0].amount, 2500);
  assert.equal((await month(service, '2020-02'))[0].amount, 2500);
  assert.equal((await month(service, currentPeriod()))[0].amount, 2500);
  assert.equal((await month(service, '2099-01'))[0].amount, 4000);
  assert.equal((await month(service, '2099-02'))[0].amount, 4000);
});
test('manual salary edit affects only explicitly selected cycle', async () => {
  const { service } = await setup();
  await service.setMonthlySalary('2020-01', 1800);
  await service.openMonth('2020-02');
  assert.equal((await month(service, '2020-01'))[0].amount, 1800);
  assert.equal((await month(service, '2020-02'))[0].amount, 2500);
  assert.equal((await service.getProfile()).monthlySalary, 2500);
});
for (const type of ['expense', 'income'])
  test(`${type}: recurring snapshots cross years, clamp month end and stay independent`, async () => {
    const { service } = await setup();
    const data = draft({ type });
    await service.createEntry(data);
    await service.createEntry(data);
    await service.openMonth('2021-02');
    await service.openMonth('2021-02');
    const first = (await month(service, '2020-12')).find((e) => e.templateId);
    const feb = (await month(service, '2021-02')).find((e) => e.templateId);
    assert.equal(
      (await month(service, '2020-12')).filter((e) => e.templateId).length,
      1,
    );
    assert.equal(feb.entryDate, '2021-02-28');
    assert.equal(feb.status, 'pendente');
    assert.equal(first.status, 'pago');
    await service.changeEntry({ id: feb.id, amount: 999 });
    await service.changeEntry({ id: feb.id, status: 'pago' });
    await service.openMonth('2021-03');
    assert.equal(
      (await month(service, '2021-03')).find((e) => e.templateId).amount,
      125.55,
    );
    assert.equal(
      (await month(service, '2020-12')).find((e) => e.templateId).amount,
      125.55,
    );
  });
test('bounded recurrence respects inclusive end date and intervals', async () => {
  const { service } = await setup();
  await service.createEntry(
    draft({ repeat: 'until', intervalMonths: 2, endDate: '2021-04-30' }),
  );
  for (const period of ['2021-01', '2021-02', '2021-04', '2021-06'])
    await service.openMonth(period);
  assert.equal(
    (await month(service, '2021-01')).filter((e) => e.templateId).length,
    0,
  );
  assert.equal(
    (await month(service, '2021-02')).filter((e) => e.templateId).length,
    1,
  );
  assert.equal(
    (await month(service, '2021-04')).filter((e) => e.templateId).length,
    1,
  );
  assert.equal(
    (await month(service, '2021-06')).filter((e) => e.templateId).length,
    0,
  );
});
test('one-off entries do not repeat', async () => {
  const { service } = await setup();
  await service.createEntry(draft({ repeat: 'once' }));
  await service.openMonth('2021-01');
  assert.equal(
    (await month(service, '2020-12')).filter((e) => !e.isSalary).length,
    1,
  );
  assert.equal(
    (await month(service, '2021-01')).filter((e) => !e.isSalary).length,
    0,
  );
});
for (const type of ['income', 'expense'])
  test(`${type}: single deletion never regenerates, future deletion preserves past`, async () => {
    const { service } = await setup();
    await service.createEntry(draft({ type }));
    for (const p of ['2021-01', '2021-02', '2021-03'])
      await service.openMonth(p);
    const jan = (await month(service, '2021-01')).find((e) => e.templateId);
    await service.deleteEntry({ id: jan.id, scope: 'single' });
    await service.openMonth('2021-01');
    assert.equal(
      (await month(service, '2021-01')).filter((e) => e.templateId).length,
      0,
    );
    const feb = (await month(service, '2021-02')).find((e) => e.templateId);
    await service.deleteEntry({ id: feb.id, scope: 'future' });
    await service.openMonth('2021-02');
    await service.openMonth('2021-03');
    await service.openMonth('2022-01');
    assert.equal(
      (await month(service, '2020-12')).filter((e) => e.templateId).length,
      1,
    );
    for (const p of ['2021-02', '2021-03', '2022-01'])
      assert.equal(
        (await month(service, p)).filter((e) => e.templateId).length,
        0,
      );
  });
test('cannot read, edit or delete another user records', async () => {
  const { service, db } = await setup();
  const other = financeService(db, 'user-b');
  await other.saveProfile({
    name: 'Outro',
    monthlySalary: 1,
    initialPeriod: '2020-01',
  });
  const row = (await month(service, '2020-01'))[0];
  await assert.rejects(
    () => other.deleteEntry({ id: row.id, scope: 'single' }),
    /não encontrado/,
  );
  await assert.rejects(
    () => other.changeEntry({ id: row.id, amount: 20 }),
    /não encontrado/,
  );
  assert.equal((await month(other, '2020-01'))[0].amount, 1);
});
test('invalid payloads have no financial side effects', async () => {
  const { service, sqlite } = await setup();
  for (const changes of [
    { amount: 1.111 },
    { amount: -10 },
    { date: '2021-02-31' },
    { intervalMonths: 0 },
    { repeat: 'until', endDate: '2019-01-01' },
    { type: 'bad' },
  ])
    await assert.rejects(() => service.createEntry(draft(changes)));
  assert.equal(
    sqlite.prepare('SELECT count(*) AS n FROM ledger_entries').get().n,
    1,
  );
});
test('salary deletion stays deleted unless explicitly restored for the month', async () => {
  const { service } = await setup();
  const row = (await month(service, '2020-01'))[0];
  await service.deleteEntry({ id: row.id, scope: 'single' });
  await service.openMonth('2020-01');
  assert.equal((await month(service, '2020-01')).length, 0);
  await service.setMonthlySalary('2020-01', 1234);
  assert.equal((await month(service, '2020-01'))[0].amount, 1234);
});
test('migration preserves legacy entries and snapshots without inventing recurrence series', async () => {
  const { service, sqlite } = database();
  sqlite
    .prepare('INSERT INTO profiles VALUES(?,?,?,?)')
    .run('user-a', 'Legado', 2000, '2020-01-01');
  sqlite
    .prepare(
      'INSERT INTO entries(user_id,name,category,amount,type,status,due_day,month,year,recurring,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      'user-a',
      'Energia',
      'Casa',
      100,
      'expense',
      'pago',
      31,
      2,
      2020,
      1,
      '2020-01-01',
    );
  await service.getProfile();
  await service.getProfile();
  const rows = await month(service, '2020-02');
  assert.equal(rows.length, 2);
  assert.equal(rows.find((e) => !e.isSalary).entryDate, '2020-02-29');
  assert.equal(rows.find((e) => !e.isSalary).templateId, null);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM entries').get().n, 1);
});
test('schema creation and onboarding batches roll back together on failure', async () => {
  const { db, sqlite } = database();
  const broken = {
    ...db,
    async batch(statements) {
      return db.batch([
        ...statements,
        db.prepare('INSERT INTO no_such_table VALUES(1)'),
      ]);
    },
  };
  await assert.rejects(() =>
    financeService(broken, 'user-a').saveProfile({
      name: 'Teste',
      monthlySalary: 2000,
      initialPeriod: '2020-01',
    }),
  );
  assert.equal(
    sqlite.prepare('SELECT count(*) AS n FROM financial_users').get().n,
    0,
  );
});
test('end of month calculation supports leap years', () => {
  assert.equal(dateAt('2024-02', 31), '2024-02-29');
  assert.equal(dateAt('2025-02', 31), '2025-02-28');
});
test('new series populates already opened later cycles without changing their salaries', async () => {
  const { service } = await setup();
  await service.openMonth('2021-01');
  await service.setMonthlySalary('2021-01', 2222);
  await service.createEntry(draft());
  const rows = await month(service, '2021-01');
  assert.equal(rows.find((e) => e.templateId).amount, 125.55);
  assert.equal(rows.find((e) => e.isSalary).amount, 2222);
});
test('reports read stored instances and never create new monthly snapshots', async () => {
  const { service, sqlite } = await setup();
  await service.listEntries(new URLSearchParams({ year: '2099' }));
  await service.listEntries(
    new URLSearchParams({ from: '2020-01-01', to: '2099-12-31' }),
  );
  assert.equal(
    sqlite.prepare('SELECT count(*) AS n FROM monthly_cycles').get().n,
    1,
  );
});
test('request retries do not resurrect a deleted occurrence or stopped future series', async () => {
  const { service } = await setup();
  const data = draft();
  await service.createEntry(data);
  const first = (await month(service, '2020-12')).find((e) => e.templateId);
  await service.deleteEntry({ id: first.id, scope: 'future' });
  await service.createEntry(data);
  await service.openMonth('2021-01');
  assert.equal(
    (await month(service, '2020-12')).filter((e) => e.templateId).length,
    0,
  );
  assert.equal(
    (await month(service, '2021-01')).filter((e) => e.templateId).length,
    0,
  );
});

test('salary propagation crosses December, stays user scoped and preserves bonuses and deletions', async () => {
  const { db, sqlite } = database();
  const service = financeService(
    db,
    'user-a',
    () => new Date('2026-12-20T12:00:00Z'),
  );
  await service.saveProfile({
    name: 'A',
    monthlySalary: 2000,
    initialPeriod: '2026-11',
  });
  await service.openMonth('2026-12');
  await service.openMonth('2027-01');
  await service.openMonth('2027-02');
  await service.setMonthlySalary('2027-01', 99);
  await service.createEntry(
    draft({
      type: 'income',
      repeat: 'once',
      date: '2027-01-10',
      name: 'Bônus',
    }),
  );
  const deleted = (await month(service, '2027-02')).find((e) => e.isSalary);
  await service.deleteEntry({ id: deleted.id, scope: 'single' });
  const other = financeService(db, 'user-b');
  await other.saveProfile({
    name: 'B',
    monthlySalary: 10,
    initialPeriod: '2027-01',
  });
  await service.saveProfile({ name: 'A', monthlySalary: 3000 });
  assert.equal((await month(service, '2026-11'))[0].amount, 2000);
  assert.equal((await month(service, '2026-12'))[0].amount, 2000);
  assert.equal(
    (await month(service, '2027-01')).find((e) => e.isSalary).amount,
    3000,
  );
  assert.equal(
    (await month(service, '2027-01')).find((e) => !e.isSalary).amount,
    125.55,
  );
  assert.equal((await month(service, '2027-02')).length, 0);
  assert.equal((await month(other, '2027-01'))[0].amount, 10);
  await service.openMonth('2028-01');
  assert.equal((await month(service, '2028-01'))[0].amount, 3000);
  assert.equal(
    sqlite
      .prepare(
        "SELECT initial_salary_cents FROM monthly_cycles WHERE user_id='user-a' AND period='2027-01'",
      )
      .get().initial_salary_cents,
    300000,
  );
});
test('unchanged salary in profile save does not overwrite manual future edits', async () => {
  const { db } = database();
  const service = financeService(
    db,
    'user-a',
    () => new Date('2026-12-20T12:00:00Z'),
  );
  await service.saveProfile({
    name: 'A',
    monthlySalary: 2000,
    initialPeriod: '2026-12',
  });
  await service.setMonthlySalary('2027-01', 55);
  await service.saveProfile({ name: 'Outro nome', monthlySalary: 2000 });
  assert.equal((await month(service, '2027-01'))[0].amount, 55);
});
test('salary change uses Sao Paulo month at UTC year boundary', () => {
  assert.equal(currentPeriod(new Date('2027-01-01T01:00:00Z')), '2026-12');
});
test('salary propagation rolls back all writes on database failure', async () => {
  const { db, sqlite } = database();
  const clock = () => new Date('2026-12-20T12:00:00Z');
  const service = financeService(db, 'user-a', clock);
  await service.saveProfile({
    name: 'A',
    monthlySalary: 2000,
    initialPeriod: '2026-12',
  });
  await service.openMonth('2027-01');
  sqlite.exec(
    "CREATE TRIGGER fail_salary BEFORE UPDATE ON monthly_cycles BEGIN SELECT RAISE(ABORT,'test failure'); END",
  );
  await assert.rejects(() =>
    service.saveProfile({ name: 'Changed', monthlySalary: 3000 }),
  );
  assert.equal((await service.getProfile()).monthlySalary, 2000);
  assert.equal((await service.getProfile()).name, 'A');
  assert.equal((await month(service, '2027-01'))[0].amount, 2000);
});
