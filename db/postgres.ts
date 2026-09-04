import pg from 'pg';
import { readFileSync } from 'node:fs';

// Keep the existing prepared-query service contract while using real PostgreSQL transactions.
export function postgresSql(sql: string) {
  let index = 0;
  return sql
    .replace(/CASE WHEN \? THEN/g, 'CASE WHEN ?=1 THEN')
    .replace(/\bAS ([a-z]+[A-Z][A-Za-z]*)\b/g, 'AS "$1"')
    .replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (token) =>
      token === '?' ? '$' + ++index : token,
    );
}
let pool: pg.Pool | undefined;
function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.delete('sslmode');
  pool = new pg.Pool({
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 12000,
    idleTimeoutMillis: 30000,
    options: '-c search_path=cenaplanner -c statement_timeout=15000',
    ssl: {
      rejectUnauthorized: true,
      ...(process.env.PGSSLROOTCERT
        ? { ca: readFileSync(process.env.PGSSLROOTCERT, 'utf8') }
        : {}),
    },
    types: {
      getTypeParser: (oid, format) =>
        [20, 1700].includes(oid)
          ? (value: string) => Number(value)
          : pg.types.getTypeParser(oid, format),
    },
  });
  pool.on('error', () => {
    console.error('PostgreSQL pool connection error');
  });
  return pool;
}
class Statement {
  readonly sql: string;
  readonly args: unknown[];
  constructor(sql: string, args: unknown[] = []) {
    this.sql = sql;
    this.args = args;
  }
  bind(...args: unknown[]) {
    return new Statement(this.sql, args);
  }
  async execute(client: pg.Pool | pg.PoolClient = getPool()) {
    const result = await client.query(postgresSql(this.sql), this.args);
    return {
      results: result.rows,
      success: true,
      meta: { changes: result.rowCount ?? 0 },
    };
  }
  all<T>() {
    return this.execute() as Promise<{
      results: T[];
      success: boolean;
      meta: { changes: number };
    }>;
  }
  run() {
    return this.execute();
  }
  async first<T>(column?: string) {
    const result = await this.execute();
    const row = result.results[0];
    return ((column ? row?.[column] : row) as T) ?? null;
  }
}
export const postgresDb = {
  prepare(sql: string) {
    return new Statement(sql);
  },
  async batch(statements: Statement[]) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const statement of statements)
        results.push(await statement.execute(client));
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
} as unknown as D1Database;
