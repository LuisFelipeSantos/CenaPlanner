import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { postgresSql } from '../db/postgres.ts';
import { financeService } from '../app/finance-service.ts';
import { notificationService } from '../app/notification-service.ts';

test('PostgreSQL SQL translation preserves literals and camel-case aliases', () => {
  assert.equal(
    postgresSql("SELECT '?' AS value, ? AS monthlySalary"),
    'SELECT \'?\' AS value, $1 AS "monthlySalary"',
  );
});
test(
  'PostgreSQL transaction validates finance and notifications without retaining test data',
  { skip: !process.env.DATABASE_URL },
  async () => {
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.delete('sslmode');
    const client = new pg.Client({
      connectionString: url.toString(),
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(process.env.PGSSLROOTCERT, 'utf8'),
      },
      types: {
        getTypeParser: (oid, format) =>
          [20, 1700].includes(oid)
            ? Number
            : pg.types.getTypeParser(oid, format),
      },
    });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL search_path=cenaplanner');
      const db = {
        prepare(sql) {
          let args = [];
          return {
            bind(...values) {
              args = values;
              return this;
            },
            async all() {
              return {
                results: (await client.query(postgresSql(sql), args)).rows,
              };
            },
            async first() {
              return (await this.all()).results[0] ?? null;
            },
            async run() {
              const r = await client.query(postgresSql(sql), args);
              return { meta: { changes: r.rowCount }, results: r.rows };
            },
          };
        },
        async batch(statements) {
          await client.query('SAVEPOINT service_batch');
          try {
            const r = [];
            for (const s of statements) r.push(await s.run());
            await client.query('RELEASE SAVEPOINT service_batch');
            return r;
          } catch (e) {
            await client.query('ROLLBACK TO SAVEPOINT service_batch');
            throw e;
          }
        },
      };
      const userId = crypto.randomUUID(),
        service = financeService(
          db,
          userId,
          () => new Date('2026-09-04T12:00:00Z'),
        );
      await service.saveProfile({
        name: 'Teste transacional',
        monthlySalary: 2500,
        initialPeriod: '2026-09',
      });
      assert.equal((await service.getProfile()).monthlySalary, 2500);
      await service.saveCategory({ name: 'Teste', monthlyBudget: 800 });
      assert.equal(
        (await service.listCategories()).find((c) => c.key === 'teste')
          .monthlyBudget,
        800,
      );
      await service.createEntry({
        name: 'Teste',
        category: 'Teste',
        amount: 100,
        type: 'expense',
        status: 'pendente',
        date: '2026-09-04',
        dueDate: '2026-09-07',
        repeat: 'count',
        repetitionCount: 3,
        requestId: crypto.randomUUID(),
      });
      let rows = await service.listEntries(
        new URLSearchParams({ year: '2026' }),
      );
      const items = rows.filter((e) => !e.isSalary);
      assert.equal(items.length, 3);
      await service.changeEntry({
        id: items[0].id,
        amount: 120,
        scope: 'future',
      });
      await service.batchEntries({ ids: [items[0].id], action: 'pay' });
      rows = await service.listEntries(new URLSearchParams({ year: '2026' }));
      assert.ok(rows.find((e) => e.id === items[0].id).paidAt);
      assert.equal(rows.find((e) => e.id === items[1].id).amount, 120);
      await service.batchEntries({ ids: [items[1].id], action: 'delete' });
      const notifications = notificationService(db);
      await notifications.preferences(userId, 'test@example.invalid');
      await notifications.scan('2026-09-04', userId);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  },
);
