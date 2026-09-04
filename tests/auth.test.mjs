import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAuth } from '../app/auth-service.ts';
const valid = { email: ' TEST@example.invalid ', password: 'test-only-123', name: ' Teste ' };
function request(body, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
function dependencies(response) {
  const saved = [], calls = [];
  return { saved, calls, request: async (path, init) => { calls.push({ path, body: JSON.parse(init.body) }); if (response instanceof Error) throw response; return response; }, saveSession: async (...values) => { saved.push(values); } };
}
test('rejects malformed input without contacting provider', async () => {
  for (const body of ['{', null, {}, {email: 123, password: []}, { ...valid, email: 'invalid' }]) {
    const deps = dependencies();
    assert.equal((await handleAuth(request(body), 'login', deps)).status, 400);
    assert.equal(deps.calls.length, 0);
  }
});
test('blocks cross-origin submissions', async () => {
  const deps = dependencies();
  assert.equal((await handleAuth(request(valid, 'https://other.invalid'), 'login', deps)).status, 403);
  assert.equal(deps.calls.length, 0);
});
test('validates signup name and password', async () => {
  for (const body of [{ ...valid, name: '' }, { ...valid, password: '123' }]) assert.equal((await handleAuth(request(body), 'signup', dependencies())).status, 400);
});
for (const mode of ['login', 'signup']) test(`${mode}: saves a successful session without exposing tokens`, async () => {
  const deps = dependencies(Response.json({access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600}));
  const response = await handleAuth(request(valid), mode, deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok: true});
  assert.deepEqual(deps.saved, [['fake-access', 'fake-refresh', 3600]]);
  assert.equal(deps.calls[0].body.email, 'test@example.invalid');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('signup requiring email confirmation does not establish a session', async () => {
  const deps = dependencies(Response.json({id: 'fake-user'}));
  assert.deepEqual(await (await handleAuth(request(valid), 'signup', deps)).json(), {ok: true, needsConfirmation: true});
  assert.equal(deps.saved.length, 0);
});
for (const [status, code, text] of [[400,'invalid_credentials','E-mail ou senha incorretos.'],[400,'email_not_confirmed','Confirme seu e-mail'],[429,'over_request_rate_limit','Muitas tentativas'],[500,'unexpected_failure','indisponível']]) test(`handles ${code}`, async () => {
  const deps = dependencies(Response.json({code: status, error_code: code}, {status}));
  const response = await handleAuth(request(valid), 'login', deps);
  assert.ok((await response.json()).error.includes(text));
  assert.equal(deps.saved.length, 0);
});
test('network and non-JSON failures return controlled errors', async () => {
  for (const result of [new Error('private upstream details'), new Response('<html>error</html>', {status: 502})]) {
    const response = await handleAuth(request(valid), 'login', dependencies(result));
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('private upstream details'));
  }
});
test('does not accept incomplete successful provider response', async () => {
  const response = await handleAuth(request(valid), 'login', dependencies(Response.json({})));
  assert.equal(response.status, 502);
});
