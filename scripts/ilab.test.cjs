'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const { createClient, buildResult, createAttempt, saveProgress } = require('./ilab.cjs');

const secret = 'test-secret';
const digest = value => createHash('md5').update(value, 'utf8').digest('hex').toUpperCase();

test('encodes the query and signs the original ticket and tokens', async () => {
  const seen = [];
  const client = createClient({
    base: 'http://ilab.test', appid: '10000', secret,
    fetch: async (url, options) => {
      seen.push({ url: new URL(url), ...options });
      const body = seen.length === 1 ? { code: 0, un: 'test1', access_token: 'ORIG+/=', expires_time: Date.now() + 5000 }
        : seen.length === 2 ? { code: 0, access_token: 'NEW+/=', expires_time: Date.now() + 5000 }
          : seen.length === 3 ? { code: 0, id: '101' }
            : seen.length === 4 ? { meta: { total: '1' }, data: [{ originId: 'sample_1' }] } : { code: 0, id: '102' };
      return Response.json(body);
    },
  });
  assert.equal((await client.exchange('ticket+/=')).un, 'test1');
  assert.equal((await client.refresh('ORIG+/=')).access_token, 'NEW+/=');
  await client.upload('NEW+/=', { originId: 'sample_1' });
  assert.equal((await client.query('NEW+/=', 'sample_1')).data.length, 1);
  await client.attach('NEW+/=', 'sample_1', '实验.pdf', Buffer.from('%PDF-example'));
  const [entry, refresh, upload, query, report] = seen;
  for (const [call, path] of [[entry,'token'],[refresh,'token/refresh'],[upload,'data_upload'],[query,'data_get'],[report,'attachment_upload']]) {
    assert.equal(call.url.pathname, '/open/api/v2/' + path);
  }
  assert.equal(entry.url.searchParams.get('ticket'), 'ticket+/=');
  assert.equal(entry.url.searchParams.get('signature'), digest('ticket+/=10000' + secret));
  assert.equal(refresh.url.searchParams.get('signature'), digest('ORIG+/=10000' + secret));
  assert.equal(upload.method, 'POST');
  assert.equal(upload.url.searchParams.get('access_token'), 'NEW+/=');
  assert.equal(query.url.searchParams.get('originId'), 'sample_1');
  assert.equal(query.url.searchParams.get('signature'), digest('NEW+/=10000' + secret));
  assert.equal(report.url.searchParams.get('filename'), '实验.pdf');
  assert.deepEqual(report.body, Buffer.from('%PDF-example'));
});

test('builds a complete 20-step result from actual recorded actions and truthful AI data', () => {
  const { steps } = globalThis.cityExperiment;
  const attempt = createAttempt();
  assert.throws(() => buildResult(attempt, 'test1', '10000'), /20 步/);
  const draft = { answers: [], choices: {}, active: {}, minute: 0 };
  for (const step of steps) {
    draft.answers.push(step.options[0][0]);
    saveProgress(attempt, { draft, action: { step: step.number, startedAt: Date.now() - 1500 } });
  }
  const payload = buildResult(attempt, 'test1', '10000');
  assert.equal(payload.status, 1);
  assert.equal(payload.score, 100);
  assert.equal(payload.steps.length, 20);
  assert.equal(payload.steps[0].score, 5);
  assert.ok(payload.steps[0].startTime <= payload.steps[0].endTime);
  assert.ok(payload.steps.every(step => step.timeUsed >= 1 && step.expectTime >= 1));
  assert.deepEqual(payload.ai_data, { ai_call_count: 0, ai_models_used: [], ai_usage_scenarios: [] });
  assert.match(payload.originId, /^sim_[a-f0-9]{32}$/);
});
