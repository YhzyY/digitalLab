'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const { createClient, buildResult, createAttempt, currentAttempt, saveProgress } = require('./ilab.cjs');

const fieldPoints = [
  {kind:'control',x:-92,z:-38}, {kind:'control',x:-80,z:30}, {kind:'control',x:80,z:60},
  {kind:'check',x:-98,z:58}, {kind:'check',x:90,z:-28}, {kind:'check',x:105,z:0},
];

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

test('a returning student starts the current curriculum once and keeps the previous attempt', () => {
  for (const submission of [null, { status: 'sending', payload: { steps: [] } }, { status: 'complete', receipt: 'stored' }]) {
    const legacy = { originId: 'old', draft: { answers: ['core'] }, records: [{ repeatCount: 1 }], submission };
    const historical = structuredClone(legacy);
    const attempts = [legacy];
    const fresh = currentAttempt(attempts);
    assert.equal(fresh.curriculumVersion, 'v2.2');
    assert.deepEqual(fresh.draft.tasks, {});
    assert.deepEqual(attempts[0], historical);
    assert.notEqual(fresh.originId, legacy.originId);
    assert.equal(currentAttempt(attempts), fresh);
    assert.equal(attempts.length, 2);
  }
});

test('builds a full result with task evidence, actual operations and exactly 100 points', () => {
  const { steps, times } = globalThis.cityExperiment;
  const attempt = createAttempt();
  assert.equal(steps.length, 21);
  assert.throws(() => buildResult(attempt, 'test1', '10000'), new RegExp(steps.length + ' 步'));
  const draft = structuredClone(attempt.draft);
  draft.purposes = ['traffic'];
  for (const step of steps) {
    draft.minute = step.number % times.length;
    draft.tasks[step.number] = (globalThis.cityFieldwork.requirements[step.number] || []).map(([id]) => id);
    draft.answers.push(step.options[0][0]);
    if (step.number === 4) draft.surveyPoints = fieldPoints;
    if (step.number === 1) draft.bounds = globalThis.citySurveyMap.presets[draft.answers[0]];
    saveProgress(attempt, { draft, action: { step: step.number, startedAt: Date.now() - 1500 } });
  }
  // Preview a different option after completion. The result uses the submitted
  // step actions, while the student's unfinished review remains a draft.
  const workInProgress = structuredClone(draft);
  const review = steps.find(step => step.options.length > 1 && draft.tasks[step.number].length);
  workInProgress.choices[review.number] = review.options[1][0];
  workInProgress.tasks[review.number] = [];
  saveProgress(attempt, { draft: workInProgress });
  const payload = buildResult(attempt, 'test1', '10000');
  assert.equal(payload.status, 1);
  assert.equal(payload.score, 100);
  assert.equal(payload.steps.length, steps.length);
  assert.equal(payload.steps.reduce((sum, step) => sum + step.score, 0), 100);
  assert.equal(payload.steps.reduce((sum, step) => sum + step.maxScore, 0), 100);
  for (const step of payload.steps) {
    assert.ok(step.startTime <= step.endTime && step.timeUsed >= 1 && step.expectTime >= 1);
    assert.deepEqual(step.ext_data.tasks, draft.tasks[step.seq]);
    assert.equal(step.ext_data.window, times[step.seq % times.length]);
  }
  assert.deepEqual(payload.ai_data, { ai_call_count: 0, ai_models_used: [], ai_usage_scenarios: [] });
  assert.match(payload.originId, /^sim_[a-f0-9]{32}$/);
});

test('partial tasks survive a save and incomplete work cannot create a scored record', () => {
  const { steps } = globalThis.cityExperiment;
  const { requirements } = globalThis.cityFieldwork;
  const attempt = createAttempt();
  const draft = structuredClone(attempt.draft);
  draft.purposes = ['traffic'];
  const target = steps.find(step => requirements[step.number]?.length >= 2);
  assert.ok(target);
  for (const step of steps.slice(0, target.number - 1)) {
    draft.tasks[step.number] = (requirements[step.number] || []).map(([id]) => id);
    draft.answers.push(step.options[0][0]);
    if (step.number === 4) draft.surveyPoints = fieldPoints;
    if (step.number === 1) draft.bounds = globalThis.citySurveyMap.presets[draft.answers[0]];
    saveProgress(attempt, { draft, action: { step: step.number } });
  }
  const first = requirements[target.number][0][0];
  draft.tasks[target.number] = [first, first, 'unknown'];
  saveProgress(attempt, { draft });
  assert.deepEqual(attempt.draft.tasks[target.number], [first]);
  const saved = structuredClone(attempt);
  draft.answers.push(target.options[0][0]);
  assert.throws(() => saveProgress(attempt, { draft, action: { step: target.number } }), /训练任务/);
  assert.deepEqual(attempt, saved);
});

test('changing an earlier answer discards later tasks, choices, records and active steps', () => {
  const { steps, modules } = globalThis.cityExperiment;
  const attempt = createAttempt();
  const draft = structuredClone(attempt.draft);
  draft.purposes = ['traffic'];
  const editable = steps.find(step => step.options.length > 1);
  for (const step of steps.slice(0, editable.number + 1)) {
    const choice = step.options[0][0];
    draft.answers.push(choice);
    if (step.number === 4) draft.surveyPoints = fieldPoints;
    if (step.number === 1) draft.bounds = globalThis.citySurveyMap.presets[choice];
    draft.choices[step.number] = choice;
    draft.tasks[step.number] = (globalThis.cityFieldwork.requirements[step.number] || []).map(([id]) => id);
    saveProgress(attempt, { draft, action: { step: step.number } });
  }
  const later = editable.number + 1;
  const module = modules.find(module => module.start <= later && later <= module.end);
  draft.active[module.id] = later;
  draft.answers.length = editable.number;
  draft.choices[editable.number] = draft.answers[editable.number - 1] = editable.options[1][0];
  saveProgress(attempt, { draft, action: { step: editable.number } });
  assert.equal(attempt.records.length, editable.number);
  assert.equal(attempt.draft.tasks[later], undefined);
  assert.equal(attempt.draft.choices[later], undefined);
  assert.equal(attempt.draft.active[module.id], undefined);
  assert.equal(attempt.records.at(-1).repeatCount, 2);
});

test('saves photo selections separately and invalidates later work after a same-purpose boundary change', () => {
  const { presets } = globalThis.citySurveyMap;
  const attempt = createAttempt();
  const draft = structuredClone(attempt.draft);
  draft.purposes = ['traffic'];
  draft.pendingBounds = { ...presets.river };
  draft.tasks[1] = ['bounds'];
  saveProgress(attempt, { draft });
  assert.deepEqual(attempt.draft.pendingBounds, presets.river);
  assert.equal(attempt.draft.bounds, null);

  draft.bounds = draft.pendingBounds;
  draft.pendingBounds = null;
  draft.answers = ['river'];
  saveProgress(attempt, { draft, action: { step: 1 } });
  draft.answers.push('base');
  draft.tasks[2] = ['cad', 'traffic', 'dem'];
  saveProgress(attempt, { draft, action: { step: 2 } });

  draft.pendingBounds = { ...presets.block };
  saveProgress(attempt, { draft });
  assert.deepEqual(attempt.draft.bounds, presets.river);
  const changed = { ...draft, bounds: draft.pendingBounds, pendingBounds: null };
  assert.throws(() => saveProgress(attempt, { draft: changed }), /第一步/);
  assert.throws(() => saveProgress(attempt, { draft: changed, action: { step: 1 } }), /依次操作/);
  assert.throws(() => saveProgress(attempt, { draft: { ...draft, pendingBounds: { ...presets.river, minX: -1e6 } } }), /边界无效/);
  changed.answers = ['river'];
  saveProgress(attempt, { draft: changed, action: { step: 1 } });
  assert.equal(attempt.records.length, 1);
  assert.equal(attempt.draft.tasks[2], undefined);
  assert.deepEqual(attempt.draft.bounds, presets.block);
});


test('step one requires at least one valid purpose before applying', () => {
  const attempt = createAttempt();
  const draft = {
    ...structuredClone(attempt.draft),
    answers: ['river'],
    tasks: { 1: ['bounds'] },
    bounds: { ...globalThis.citySurveyMap.presets.river },
  };
  saveProgress(attempt, { draft: { ...draft, answers: [], bounds: null } });
  for (const purposes of [[], ['unknown']]) {
    assert.throws(() => saveProgress(attempt, {
      draft: { ...draft, purposes }, action: { step: 1 },
    }), /至少勾选一个系统用途/);
    assert.equal(attempt.draft.answers.length, 0);
    assert.equal(attempt.records.length, 0);
  }
  saveProgress(attempt, {
    draft: { ...draft, purposes: ['traffic'] }, action: { step: 1 },
  });
  assert.deepEqual(attempt.draft.purposes, ['traffic']);
  assert.deepEqual(attempt.draft.answers, ['river']);
});

test('step two saves partial imports and requires all three before applying', () => {
  const attempt = createAttempt();
  const draft = structuredClone(attempt.draft);
  draft.answers = ['block'];
  draft.bounds = { ...globalThis.citySurveyMap.presets.block };
  draft.purposes = ['traffic'];
  draft.tasks[1] = ['bounds'];
  saveProgress(attempt, { draft, action: { step: 1 } });
  draft.tasks[2] = ['cad'];
  saveProgress(attempt, { draft });
  assert.deepEqual(attempt.draft.tasks[2], ['cad']);
  draft.answers.push('base');
  assert.throws(() => saveProgress(attempt, { draft, action: { step: 2 } }), /第 2 步/);
  draft.tasks[2] = ['cad', 'traffic', 'dem'];
  saveProgress(attempt, { draft, action: { step: 2 } });
  assert.deepEqual(attempt.records[1].tasks, ['cad', 'traffic', 'dem']);
});

test('street-block DEM follows ground surfaces and keeps bridge decks out of river elevations', () => {
  const { groundElevation } = globalThis.citySurveyMap;
  assert.equal(groundElevation(-175, -120), .04);
  assert.equal(groundElevation(-48, 39), .34);
  assert.equal(groundElevation(39, 39), -1.8);
  assert.equal(groundElevation(39, 4), -1.8);
  assert.ok(Math.abs(groundElevation(63.1047, 4) - .32) < .02);
  assert.equal(groundElevation(-46, 1), .565);
});

test('step three cannot complete until all three lake selections and verification are recorded', () => {
  const attempt = createAttempt();
  const draft = structuredClone(attempt.draft);
  draft.bounds = { ...globalThis.citySurveyMap.presets.block };
  draft.purposes = ['traffic'];
  for (const answer of ['block', 'base']) {
    draft.answers.push(answer);
    const step = draft.answers.length;
    draft.tasks[step] = globalThis.cityFieldwork.requirements[step].map(([id]) => id);
    saveProgress(attempt, { draft, action: { step } });
  }
  draft.tasks[3] = ['plane', 'height', 'cad', 'traffic', 'dem', 'converted'];
  saveProgress(attempt, { draft });
  assert.deepEqual(attempt.draft.tasks[3], draft.tasks[3]);
  draft.answers.push('transform');
  assert.throws(() => saveProgress(attempt, { draft, action: { step: 3 } }), /第 3 步/);
  draft.tasks[3].push('verified');
  saveProgress(attempt, { draft, action: { step: 3 } });
  assert.deepEqual(attempt.records[2].tasks, draft.tasks[3]);
});

test('field survey requires and persists three control points and three check points', () => {
  const attempt = createAttempt();
  const draft = structuredClone(attempt.draft);
  draft.bounds = { ...globalThis.citySurveyMap.presets.block };
  draft.purposes = ['traffic'];
  for (const answer of ['block', 'base', 'transform']) {
    draft.answers.push(answer);
    const step = draft.answers.length;
    draft.tasks[step] = globalThis.cityFieldwork.requirements[step].map(([id]) => id);
    saveProgress(attempt, { draft, action: { step } });
  }
  draft.surveyPoints = fieldPoints.slice(0,5);
  saveProgress(attempt, { draft });
  assert.deepEqual(attempt.draft.surveyPoints, fieldPoints.slice(0,5));
  draft.answers.push('field');
  draft.tasks[4] = ['control'];
  assert.throws(() => saveProgress(attempt, { draft, action: { step:4 } }), /3 个控制点/);
  draft.surveyPoints = fieldPoints;
  saveProgress(attempt, { draft, action: { step:4 } });
  assert.deepEqual(attempt.draft.surveyPoints, fieldPoints);
});

test('flight defaults use the marked values and draft changes preserve the recorded configuration', () => {
  const {normalizeFlightSettings, steps} = globalThis.cityExperiment;
  assert.deepEqual(normalizeFlightSettings(), {height:100, forward:80, side:60});
  const attempt = createAttempt();
  const draft = structuredClone(attempt.draft);
  draft.purposes = ['traffic'];
  draft.bounds = globalThis.citySurveyMap.presets.block;
  draft.surveyPoints = fieldPoints;
  for (const step of steps.slice(0,5)) {
    draft.answers.push(step.number === 1 ? 'block' : step.options[0][0]);
    draft.tasks[step.number] = globalThis.cityFieldwork.requirements[step.number].map(([id]) => id);
    saveProgress(attempt, {draft, action:{step:step.number}});
  }
  draft.flightSettings = {height:120, forward:75, side:65};
  saveProgress(attempt, {draft});
  assert.deepEqual(attempt.draft.flightSettings, draft.flightSettings);
  assert.deepEqual(attempt.draft.appliedFlightSettings, {height:100, forward:80, side:60});
  saveProgress(attempt, {draft, action:{step:5}});
  assert.deepEqual(attempt.draft.appliedFlightSettings, draft.flightSettings);
});

test('cross flight uses two orthogonal pairs and changes spacing with side overlap', () => {
  const {planSurveyFlight} = globalThis.cityExperiment;
  const bounds = globalThis.citySurveyMap.presets.block;
  const flight = planSurveyFlight(bounds,'oblique',{height:100, forward:80, side:60});
  const [first,second,third,fourth] = flight.passes;
  assert.equal(first[0][1],first[1][1]);
  assert.equal(second[0][1],second[1][1]);
  assert.equal(third[0][0],third[1][0]);
  assert.equal(fourth[0][0],fourth[1][0]);
  assert.ok(flight.passes.every(pass => pass.flat().every(Number.isFinite)));
  const tighter = planSurveyFlight(bounds,'oblique',{height:100, forward:80, side:70});
  assert.ok(Math.abs(tighter.passes[0][0][1]-tighter.passes[1][0][1]) < Math.abs(first[0][1]-second[0][1]));
  assert.ok(flight.footprints.length > 0);
});

test('forward overlap controls the spacing of adjacent image footprints', () => {
  const {planSurveyFlight} = globalThis.cityExperiment;
  const bounds = globalThis.citySurveyMap.presets.block;
  const flight = planSurveyFlight(bounds,'grid',{height:100, forward:80, side:60});
  const [first,second] = flight.footprints;
  assert.ok(Math.abs((second.x-first.x)/first.w-.2)<1e-9);
  const more = planSurveyFlight(bounds,'grid',{height:100, forward:90, side:60});
  assert.deepEqual(more.passes,flight.passes);
  assert.ok(more.footprints.length > flight.footprints.length);
});

test('coverage review cannot be applied until the three supplemental images are verified', () => {
  const {steps} = globalThis.cityExperiment;
  const attempt = createAttempt();
  const draft = structuredClone(attempt.draft);
  draft.purposes = ['traffic'];
  draft.bounds = globalThis.citySurveyMap.presets.block;
  draft.surveyPoints = fieldPoints;
  for (const step of steps.slice(0,5)) {
    draft.answers.push(step.number === 1 ? 'block' : step.options[0][0]);
    draft.tasks[step.number] = globalThis.cityFieldwork.requirements[step.number].map(([id]) => id);
    saveProgress(attempt, {draft, action:{step:step.number}});
  }
  draft.tasks[6] = ['bank','corner'];
  saveProgress(attempt, {draft});
  assert.deepEqual(attempt.draft.tasks[6], ['bank','corner']);
  draft.answers.push('all');
  assert.throws(() => saveProgress(attempt, {draft, action:{step:6}}), /第 6 步/);
  draft.tasks[6].push('glare');
  saveProgress(attempt, {draft, action:{step:6}});
  assert.equal(attempt.draft.answers[5],'all');
});

test('flight image crop keeps the complete selected survey extent in image coordinates', () => {
  const {extent, presets, imageCrop} = globalThis.citySurveyMap;
  assert.deepEqual(imageCrop(extent,3390,2400), {x:0,y:0,width:3390,height:2400});
  assert.deepEqual(imageCrop(presets.river,3390,2400), {x:750,y:720,width:2120,height:1120});
  assert.deepEqual(imageCrop({minX:-110,maxX:94,minZ:-59,maxZ:82},3390,2400),
    {x:650,y:610,width:2040,height:1410});
});

test('coverage review only requires cases inside the saved manual survey boundary', () => {
  const {steps} = globalThis.cityExperiment;
  const attempt = createAttempt();
  const draft = structuredClone(attempt.draft);
  draft.purposes = ['traffic'];
  draft.bounds = { ...globalThis.citySurveyMap.required };
  draft.surveyPoints = [
    {kind:'control',x:-80,z:-30},{kind:'control',x:-40,z:-10},{kind:'control',x:65,z:30},
    {kind:'check',x:-60,z:30},{kind:'check',x:66,z:-20},{kind:'check',x:72,z:40},
  ];
  for (const step of steps.slice(0,5)) {
    draft.answers.push(step.number === 1 ? 'manual' : step.options[0][0]);
    draft.tasks[step.number] = globalThis.cityFieldwork.requirements[step.number].map(([id]) => id);
    saveProgress(attempt, {draft, action:{step:step.number}});
  }
  draft.answers.push('all');
  draft.tasks[6] = ['bank','glare'];
  saveProgress(attempt, {draft, action:{step:6}});
  assert.deepEqual(attempt.records[5].tasks,['bank','glare']);
});
