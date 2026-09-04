import pg from 'pg';
import {readFileSync} from 'node:fs';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL ausente.');
const parsed = new URL(url);
parsed.searchParams.delete('sslmode');
const client = new pg.Client({connectionString:parsed.toString(), ssl:{rejectUnauthorized:true, ...(process.env.PGSSLROOTCERT ? {ca:readFileSync(process.env.PGSSLROOTCERT,'utf8')} : {})}, connectionTimeoutMillis:12000});
try {
  await client.connect();
  const result = await client.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('public','cenaplanner') ORDER BY 1,2");
  console.log(JSON.stringify({connected:true,tables:result.rows}));
} catch(error) {
  // Never log the connection string, query parameters or raw server messages.
  console.error(JSON.stringify({connected:false,code:error.code || 'CONNECTION_FAILED'}));
  process.exitCode=1;
} finally { await client.end().catch(()=>{}); }
