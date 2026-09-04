import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const forbidden =
  /(^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|node_modules|venv|\.venv|dist|build|\.wrangler|\.claude)(?:\/|$)|\.(?:log|sqlite3?|db|pem|key)$/;
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}/,
];
const problems = [];
for (const file of new Set(files)) {
  if (file !== '.env.example' && forbidden.test(file)) {
    problems.push(file + ': arquivo privado/gerado');
    continue;
  }
  if (!/\.(?:tsx?|m?js|json|md|ya?ml|toml|sql|example)$/.test(file)) continue;
  const body = readFileSync(file, 'utf8');
  if (secretPatterns.some((pattern) => pattern.test(body)))
    problems.push(file + ': possível credencial');
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Verificação básica aprovada: nenhum arquivo proibido ou padrão de credencial detectado. Revise também o diff antes de enviar.',
  );
