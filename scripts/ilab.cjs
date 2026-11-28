'use strict';
const { createHash, randomUUID } = require('node:crypto');

require('../scope.js');
require('../experiment.js');
require('../survey-work.js');
require('../monitoring-work.js');
require('../fieldwork.js');
const { modules, steps, times, result, importedMaterials, surveyPointsInBounds, surveyRows, surveyLimit, normalizeFlightSettings, coverageCasesForBounds } = globalThis.cityExperiment;
const { requirements } = globalThis.cityFieldwork;
const curriculumVersion = 'v2.2';

class LabError extends Error {
  constructor(message, status = 400, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function createClient({ base, appid, secret, fetch: send = fetch }) {
  const sign = value => createHash('md5').update(value + appid + secret, 'utf8').digest('hex').toUpperCase();

  async function request(path, fields, options = {}) {
    const url = new URL('/open/api/v2/' + path, base);
    url.search = new URLSearchParams(fields);
    let response;
    try {
      response = await send(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(12000), ...options });
    } catch {
      throw new LabError('暂时无法连接实验空间，请稍后重试。', 502);
    }
    const object = await response.json().catch(() => null);
    if (!response.ok || !object || typeof object !== 'object') {
      throw new LabError('实验空间没有返回有效的接口响应。', 502);
    }
    if (path === 'data_get' && Array.isArray(object.data) && (object.code == null || object.code === 0)) return object;
    if (object.code !== 0) {
      const code = Number.isInteger(object.code) ? object.code : null;
      throw new LabError('实验空间接口未成功' + (code === null ? '。' : '，返回码 ' + code + '。'), 502, code);
    }
    return object;
  }

  function credentials(object, exchange) {
    if (typeof object.access_token !== 'string' || !object.access_token ||
        !Number.isSafeInteger(object.expires_time) ||
        (exchange && (typeof object.un !== 'string' || !object.un))) {
      throw new LabError('实验空间未返回完整的身份凭证。', 502);
    }
    return object;
  }

  return {
    appid,
    async exchange(ticket) {
      return credentials(await request('token', { ticket, appid, signature: sign(ticket) }), true);
    },
    async refresh(original) {
      return credentials(await request('token/refresh', { access_token: original, appid, signature: sign(original) }), false);
    },
    upload(token, payload) {
      return request('data_upload', { access_token: token }, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
    },
    query(token, originId) {
      return request('data_get', { access_token: token, appid, signature: sign(token), originId });
    },
    attach(token, originId, filename, bytes) {
      return request('attachment_upload', { access_token: token, appid, originId, filename, title: '虚拟仿真实验报告' }, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes,
      });
    },
  };
}

function createAttempt() {
  return {
    curriculumVersion,
    originId: 'sim_' + randomUUID().replaceAll('-', ''),
    createdAt: Date.now(),
    draft: { answers: [], choices: {}, active: {}, minute: 0, tasks: {}, bounds: null, pendingBounds: null, purposes: [], surveyPoints: [] },
    records: [],
    submission: null,
    report: null,
  };
}

function currentAttempt(attempts) {
  if (attempts.at(-1)?.curriculumVersion !== curriculumVersion) attempts.push(createAttempt());
  return attempts.at(-1);
}

function checkedBounds(value) {
  if (value == null) return null;
  if (!globalThis.citySurveyMap.valid(value)) throw new LabError('测区边界无效，请在航拍底图上重新圈定。');
  const { minX, maxX, minZ, maxZ } = value;
  return { minX, maxX, minZ, maxZ };
}

function saveProgress(attempt, { draft, action } = {}, now = Date.now()) {
  if (attempt.submission) throw new LabError('提交已登记，实验记录已冻结。', 409);
  if (!draft || !Array.isArray(draft.answers) || draft.answers.length > steps.length ||
      !draft.answers.every((answer, i) => steps[i].options.some(([id]) => id === answer))) {
    throw new LabError('实验步骤数据不正确。');
  }
  const previous = attempt.draft.answers;
  const answers = [...draft.answers];
  const minute = Number.isInteger(draft.minute) && draft.minute >= 0 && draft.minute < times.length ? draft.minute : 0;
  // Older records used the selected preset without storing its coordinates.
  const oldBounds = checkedBounds(attempt.draft.bounds ?? globalThis.citySurveyMap.presets[previous[0]]);
  const bounds = checkedBounds(draft.bounds === undefined ? oldBounds : draft.bounds);
  const pendingBounds = checkedBounds(draft.pendingBounds);
  const selectedPurposes = draft.purposes ?? attempt.draft.purposes;
  const purposes = globalThis.cityExperiment.purposes
    .filter(([id]) => Array.isArray(selectedPurposes) && selectedPurposes.includes(id))
    .map(([id]) => id);
  if (action?.step === 1 && !purposes.length) {
    throw new LabError('请至少勾选一个系统用途。');
  }
  const geometryChanged = JSON.stringify(bounds) !== JSON.stringify(oldBounds);
  if ((geometryChanged && action?.step !== 1) || (answers.length && !bounds)) {
    throw new LabError('请在第一步圈定测区并应用范围。');
  }
  const appliedBefore = normalizeFlightSettings(attempt.draft.appliedFlightSettings);
  const flightDraft = normalizeFlightSettings(draft.flightSettings ?? attempt.draft.flightSettings ?? appliedBefore);
  const flightChanged = action?.step === 5 && Object.keys(appliedBefore).some(id => flightDraft[id] !== appliedBefore[id]);
  const changed = action && action.step <= previous.length &&
    (answers[action.step - 1] !== previous[action.step - 1] || geometryChanged || flightChanged);
  const lastAccessible = changed ? action.step : Math.min(answers.length + 1, steps.length);
  const surveyPoints = lastAccessible >= 4 ? surveyPointsInBounds(draft.surveyPoints ?? attempt.draft.surveyPoints, bounds) : [];
  if (action?.step === 4 && answers[3] === 'field' && surveyPoints.length !== surveyLimit * 2) {
    throw new LabError('请先布设 3 个控制点和 3 个检查点。');
  }
  const choices = {}, tasks = {}, active = {};
  for (const step of steps) {
    if (step.number > lastAccessible) break;
    const value = draft.choices?.[step.number];
    if (step.options.some(([id]) => id === value)) choices[step.number] = value;
    const marks = draft.tasks?.[step.number];
    const legacyCoverage = step.number === 6 && ['bank','corner'].includes(answers[5]);
    const expected = step.number === 6
      ? (legacyCoverage ? ['supplement'] : coverageCasesForBounds(bounds))
      : (requirements[step.number] || []).map(([id]) => id);
    const completed = step.number === 2 ? importedMaterials(marks, previous[1])
      : Array.isArray(marks) ? expected.filter(id => marks.includes(id)) : [];
    if (step.number === action?.step && completed.length !== expected.length) {
      throw new LabError('请先完成第 ' + step.number + ' 步的训练任务。');
    }
    if (completed.length) tasks[step.number] = completed;
  }
  for (const module of modules) {
    const value = draft.active?.[module.id];
    if (Number.isInteger(value) && value >= module.start && value <= Math.min(module.end, lastAccessible)) {
      active[module.id] = value;
    }
  }
  if (action) {
    const index = action.step - 1;
    if (!Number.isInteger(action.step) || index < 0 || index > previous.length || !answers[index] ||
        answers.slice(0, index).some((answer, i) => answer !== previous[i]) ||
        (changed && answers.length !== action.step) ||
        (!changed && answers.length !== Math.max(previous.length, action.step)) ||
        answers.slice(index + 1).some((answer, i) => answer !== previous[index + 1 + i])) {
      throw new LabError('请按实验步骤依次操作。');
    }
    const old = attempt.records[index];
    const bound = old?.endTime ?? attempt.records[index - 1]?.endTime ?? attempt.createdAt;
    const started = Number.isSafeInteger(action.startedAt) ? Math.min(now, Math.max(bound, action.startedAt)) : now;
    const elapsed = Math.max(1, Math.ceil((now - started) / 1000));
    attempt.records.length = answers.length;
    attempt.records[index] = {
      startTime: old?.startTime ?? started, endTime: now, minute, tasks: tasks[action.step] || [],
      timeUsed: (old?.timeUsed ?? 0) + elapsed, repeatCount: (old?.repeatCount ?? 0) + 1,
    };
  } else if (previous.length !== answers.length || answers.some((answer, index) => answer !== previous[index])) {
    throw new LabError('步骤变更需要对应的操作记录。');
  }
  attempt.draft = { answers, choices, active, minute, tasks, bounds, pendingBounds, purposes, surveyPoints,
    ...(lastAccessible >= 5 ? {flightSettings:flightDraft} : {}),
    ...(answers[4] ? {appliedFlightSettings:action?.step === 5 ? flightDraft : appliedBefore} : {}),
  };
}

function buildResult(attempt, username, appid, title = '孪生城市多源数据融合与智能态势感知虚拟仿真实验') {
  const { draft, records } = attempt;
  if (draft.answers.length !== steps.length || records.length !== steps.length || steps.some((_, index) => !records[index])) {
    throw new LabError('请完成全部 ' + steps.length + ' 步后再提交。');
  }
  const startTime = records[0].startTime;
  const endTime = Math.max(...records.map(record => record.endTime));
  const recordedSeconds = records.reduce((total, record) => total + record.timeUsed, 0);
  const timeUsed = Math.min(recordedSeconds, Math.max(1, Math.ceil((endTime - startTime) / 1000)));
  const scoredSteps = steps.map(({ number, title, options }, index) => {
    const answer = draft.answers[index];
    const { minute, tasks, ...record } = records[index];
    const evidence = result(number, draft.answers.slice(0, number), minute);
    const maxScore = Math.floor(100 / steps.length) + (index < 100 % steps.length ? 1 : 0);
    return {
      seq: number, title, ...record, expectTime: 60, maxScore, score: maxScore, evaluation: '已完成',
      scoringModel: '联调完成分：完成该步训练任务并应用参数计 ' + maxScore + ' 分',
      ext_data: { choice: options.find(([id]) => id === answer)[1], window: times[minute],
        tasks, evidence, ...(number === 4 && answer === 'field' ? { surveyMeasurements: surveyRows(draft.surveyPoints ?? []) } : {}),
        ...(number === 5 && draft.appliedFlightSettings ? { flightSettings:draft.appliedFlightSettings } : {}),
        ...(number === 1 ? { bounds: draft.bounds ?? globalThis.citySurveyMap.presets[answer], purposes: draft.purposes || [] } : {}) },
    };
  });
  return {
    username, title, status: 1, score: scoredSteps.reduce((sum, step) => sum + step.score, 0),
    startTime, endTime, timeUsed, appid, originId: attempt.originId, steps: scoredSteps,
    ai_data: { ai_call_count: 0, ai_models_used: [], ai_usage_scenarios: [] },
  };
}

module.exports = { LabError, createClient, createAttempt, currentAttempt, saveProgress, buildResult };
