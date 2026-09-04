import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, access, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg) throw new Error('Informe o arquivo SQLite de origem e o destino do backup.');
const source = resolve(sourceArg);
const target = resolve(targetArg);
if (source === target) throw new Error('Origem e destino devem ser diferentes.');
await access(source);
await mkdir(dirname(target), { recursive: true });
try { await access(target); throw new Error('O destino já existe; escolha outro nome.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const db = new DatabaseSync(source, { readOnly: true });
try {
  // SQLite backup API takes a consistent snapshot, including committed WAL data.
  await backup(db, target);
} finally { db.close(); }
const snapshot = new DatabaseSync(target, { readOnly: true });
try {
  const check = snapshot.prepare('PRAGMA integrity_check').all();
  if (check.some(row => row.integrity_check !== 'ok')) throw new Error('Falha de integridade do backup.');
  const counts = {};
  for (const {name} of snapshot.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    const quoted = '"' + name.replaceAll('"', '""') + '"';
    counts[name] = snapshot.prepare(`SELECT count(*) AS total FROM ${quoted}`).get().total;
  }
  if (!Object.hasOwn(counts, 'ledger_entries')) throw new Error('O arquivo não contém o banco financeiro esperado.');
  const sha256 = createHash('sha256').update(await readFile(target)).digest('hex');
  await writeFile(target + '.manifest.json', JSON.stringify({createdAt:new Date().toISOString(), integrity:'ok', sha256, counts}, null, 2), {flag:'wx'});
  console.log('Backup consistente criado, integridade verificada e manifesto SHA-256 salvo.');
} finally { snapshot.close(); }
