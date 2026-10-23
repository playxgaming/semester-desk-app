import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './index.js';

async function withServer(options, fn) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const post = (url, body) => fetch(`${url}/api/solve-problem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('no credentials: health works and AI gives actionable 503', async () => {
  await withServer({ apiKey: '' }, async url => {
    assert.equal((await (await fetch(`${url}/api/health`)).json()).aiConfigured, false);
    const response = await post(url, { problem: '2+2' });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /GEMINI_API_KEY/);
  });
});
test('tutor validates input and returns the provider solution', async () => {
  let calls = 0;
  await withServer({ generate: async () => { calls++; return { text: 'Solution: $4$' }; } }, async url => {
    assert.equal((await post(url, { problem: '' })).status, 400);
    assert.equal((await post(url, { problem: 'x'.repeat(8001) })).status, 400);
    assert.equal(calls, 0);
    assert.deepEqual(await (await post(url, { problem: '2+2', subject: 'Maths' })).json(), { result: 'Solution: $4$' });
  });
});
test('scanner handles JSON, rejects files and limits uploads', async () => {
  await withServer({ generate: async () => ({ text: JSON.stringify([{ title: 'Math', type: 'class', dayOfWeek: 1 }]) }) }, async url => {
    const form = new FormData(); form.append('document', new Blob(['image'], { type: 'image/png' }), 'sample.png');
    assert.equal((await (await fetch(`${url}/api/scan-document`, { method: 'POST', body: form })).json()).result[0].type, 'class');
    const invalid = new FormData(); invalid.append('document', new Blob(['text'], { type: 'text/plain' }), 'file.txt');
    assert.equal((await fetch(`${url}/api/scan-document`, { method: 'POST', body: invalid })).status, 400);
    const large = new FormData(); large.append('document', new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
    assert.equal((await fetch(`${url}/api/scan-document`, { method: 'POST', body: large })).status, 400);
  });
});
test('malformed provider output fails without leaking its content', async () => {
  await withServer({ generate: async () => ({ text: 'private provider diagnostic' }) }, async url => {
    const form = new FormData(); form.append('document', new Blob(['image'], { type: 'image/png' }), 'sample.png');
    const response = await fetch(`${url}/api/scan-document`, { method: 'POST', body: form });
    assert.equal(response.status, 502);
    assert.doesNotMatch(JSON.stringify(await response.json()), /private provider/);
  });
});
test('AI requests are rate limited', async () => {
  await withServer({ generate: async () => ({ text: '4' }) }, async url => {
    for (let i = 0; i < 12; i++) assert.equal((await post(url, { problem: '2+2' })).status, 200);
    assert.equal((await post(url, { problem: '2+2' })).status, 429);
  });
});
