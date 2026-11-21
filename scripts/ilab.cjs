'use strict';
const { createHash, randomUUID } = require('node:crypto');

require('../experiment.js');
const { modules, steps, times, result } = globalThis.cityExperiment;

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
    originId: 'sim_' + randomUUID().replaceAll('-', ''),
    createdAt: Date.now(),
    draft: { answers: [], choices: {}, active: {}, minute: 0 },
    records: [],
    submission: null,
    report: null,
  };
}

function saveProgress(attempt, { draft, action } = {}, now = Date.now()) {
  if (attempt.submission) throw new LabError('提交已登记，实验记录已冻结。', 409);
  if (!draft || !Array.isArray(draft.answers) || draft.answers.length > steps.length ||
      !draft.answers.every((answer, i) => steps[i].options.some(([id]) => id === answer))) {
    throw new LabError('实验步骤数据不正确。');
  }
  const previous = attempt.draft.answers;
  const answers = [...draft.answers];
  if (action) {
    const index = action.step - 1;
    if (!Number.isInteger(action.step) || index < 0 || index > previous.length || !answers[index] ||
        answers.slice(0, index).some((answer, i) => answer !== previous[i]) ||
        (answers.length > index + 1 && (answers.length !== previous.length ||
          answers.slice(index).some((answer, i) => answer !== previous[index + i])))) {
      throw new LabError('请按实验步骤依次操作。');
    }
    const old = attempt.records[index];
    const bound = old?.endTime ?? attempt.records[index - 1]?.endTime ?? attempt.createdAt;
    const started = Number.isSafeInteger(action.startedAt) ? Math.min(now, Math.max(bound, action.startedAt)) : now;
    const elapsed = Math.max(1, Math.ceil((now - started) / 1000));
    if (answers.length < previous.length) attempt.records.length = answers.length;
    attempt.records[index] = {
      startTime: old?.startTime ?? started, endTime: now,
      timeUsed: (old?.timeUsed ?? 0) + elapsed, repeatCount: (old?.repeatCount ?? 0) + 1,
    };
  } else if (previous.length !== answers.length || answers.some((answer, index) => answer !== previous[index])) {
    throw new LabError('步骤变更需要对应的操作记录。');
  }
  const choices = {};
  for (const step of steps) {
    const value = draft.choices?.[step.number];
    if (step.options.some(([id]) => id === value)) choices[step.number] = value;
  }
  const active = {};
  for (const module of modules) {
    const value = draft.active?.[module.id];
    if (Number.isInteger(value) && value >= module.start && value <= module.end) active[module.id] = value;
  }
  const minute = Number.isInteger(draft.minute) && draft.minute >= 0 && draft.minute < times.length ? draft.minute : 0;
  attempt.draft = { answers, choices, active, minute };
}

function buildResult(attempt, username, appid, title = '孪生城市多源数据融合与智能态势感知虚拟仿真实验') {
  const { draft, records } = attempt;
  if (draft.answers.length !== steps.length || records.length !== steps.length || steps.some((_, index) => !records[index])) {
    throw new LabError('请完成全部 20 步后再提交。');
  }
  const startTime = records[0].startTime;
  const endTime = Math.max(...records.map(record => record.endTime));
  const recordedSeconds = records.reduce((total, record) => total + record.timeUsed, 0);
  const timeUsed = Math.min(recordedSeconds, Math.max(1, Math.ceil((endTime - startTime) / 1000)));
  return {
    username, title, status: 1, score: 100, startTime, endTime, timeUsed, appid, originId: attempt.originId,
    steps: steps.map(({ number, title, options }, index) => {
      const answer = draft.answers[index];
      const evidence = result(number, draft.answers.slice(0, number), draft.minute);
      return {
        seq: number, title, ...records[index], expectTime: 60, maxScore: 5, score: 5, evaluation: '已完成',
        scoringModel: '联调完成分：实际完成该步计 5 分',
        ext_data: { choice: options.find(([id]) => id === answer)[1], window: times[draft.minute], evidence },
      };
    }),
    ai_data: { ai_call_count: 0, ai_models_used: [], ai_usage_scenarios: [] },
  };
}

module.exports = { LabError, createClient, createAttempt, saveProgress, buildResult };
