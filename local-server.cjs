'use strict';
const { createServer } = require('node:http');
const { createHash, randomBytes } = require('node:crypto');
const { createReadStream, statSync, readFileSync, writeFileSync, mkdirSync, renameSync } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { homedir, platform } = require('node:os');
const path = require('node:path');
const { LabError, createClient, createAttempt, currentAttempt, saveProgress, buildResult } = require('./scripts/ilab.cjs');

const cookie = 'city_ilab';
const sessionSeconds = 7 * 24 * 3600;
const fileLimit = 5 * 1024 * 1024;
const staticFiles = new Set([
  'index.html', 'lab.js', 'lab.css', 'survey-work.js', 'survey-work.css', 'monitoring-work.js',
  'scope.js', 'engineering-maps.js', 'source-materials.js', 'reference-work.js', 'field-survey.js', 'coverage-work.js', 'survey-plan.js', 'survey-map.js', 'survey-map.css', 'fieldwork.js', 'fieldwork.css', 'city-view.js', 'city-simulation.js', 'experiment.js',
]);
const fileTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

function defaultStateFile() {
  const home = homedir();
  const directory = platform() === 'darwin' ? path.join(home, 'Library', 'Application Support')
    : process.env.LOCALAPPDATA || process.env.XDG_STATE_HOME || path.join(home, '.local', 'state');
  return path.join(directory, 'digital-city-ilab', 'state.json');
}

function createStore(filename) {
  let state;
  try { state = JSON.parse(readFileSync(filename, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = { sessions: {}, students: {} };
  }
  mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  return {
    state,
    save() {
      const temp = filename + '.tmp';
      writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
      renameSync(temp, filename);
    },
  };
}

async function readBody(req, limit = 64 * 1024) {
  if (Number(req.headers['content-length']) > limit) throw new LabError('请求内容超过大小限制。', 413);
  const chunks = [];
  let size = 0;
  let overflow = false;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) overflow = true;
    if (!overflow) chunks.push(chunk);
  }
  if (overflow) throw new LabError('请求内容超过大小限制。', 413);
  return Buffer.concat(chunks, size);
}

async function readJson(req) {
  const body = await readBody(req);
  try { return JSON.parse(body.toString('utf8')); }
  catch { throw new LabError('请求格式不正确。'); }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function digest(value) { return createHash('sha256').update(value).digest('hex'); }

function cookies(req) {
  const raw = req.headers.cookie?.match(/(?:^|;\s*)city_ilab=([a-f0-9]{64})(?:;|$)/)?.[1];
  return raw ? digest(raw) : null;
}

function summary(attempt) {
  const { draft, originId, submission, report } = attempt;
  return {
    draft, originId, curriculumVersion: attempt.curriculumVersion, revision: attempt.revision || 0,
    submission: submission ? { status: submission.status, receipt: submission.receipt } : null,
    report: report ? { receipt: report.receipt } : null,
  };
}

function createApp({ client, stateFile = defaultStateFile(), title = process.env.ILAB_TITLE }) {
  const store = createStore(stateFile);
  const locks = new Map();
  const { state } = store;
  function studentFor(req) {
    const session = state.sessions[cookies(req)];
    return session && session.expiresAt > Date.now() && state.students[session.studentKey];
  }

  function exclusive(student, action) {
    const key = student.key;
    if (locks.has(key)) throw new LabError('操作正在处理，请稍候再试。', 409);
    const task = Promise.resolve().then(action);
    locks.set(key, task);
    return task.finally(() => locks.delete(key));
  }

  async function enter(res, url) {
    const ticket = url.searchParams.get('ticket');
    if (!ticket || url.searchParams.getAll('ticket').length !== 1 || ticket.length > 4096) {
      throw new LabError('请从实验空间的「我要做实验」重新进入。');
    }
    const auth = await client.exchange(ticket);
    const key = client.appid + ':' + auth.un;
    const student = state.students[key] ||= { key, username: auth.un, attempts: [] };
    currentAttempt(student.attempts);
    if (student.credentials?.original !== auth.access_token) {
      student.credentials = { original: auth.access_token, current: auth.access_token, expiresAt: auth.expires_time, count: 0 };
    }
    const token = randomBytes(32).toString('hex');
    for (const [id, session] of Object.entries(state.sessions)) {
      if (session.expiresAt < Date.now()) delete state.sessions[id];
    }
    state.sessions[digest(token)] = { studentKey: key, expiresAt: Date.now() + sessionSeconds * 1000 };
    store.save();
    res.writeHead(303, {
      Location: '/', 'Cache-Control': 'no-store',
      'Set-Cookie': cookie + '=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + sessionSeconds,
    });
    res.end();
  }

  async function refresh(student) {
    const credentials = student.credentials;
    if (credentials.count >= 2) throw new LabError('凭证已过期，请从实验空间重新进入。', 401);
    let response;
    try { response = await client.refresh(credentials.original); }
    catch (error) {
      if ([3, 4, 5].includes(error.code)) throw new LabError('凭证已过期，请从实验空间重新进入。', 401, error.code);
      throw error;
    }
    credentials.current = response.access_token;
    credentials.expiresAt = response.expires_time;
    credentials.count++;
    store.save();
  }

  async function withToken(student, expiryCode, invoke) {
    const credentials = student.credentials;
    let renewed = false;
    if (credentials.expiresAt <= Date.now()) {
      await refresh(student);
      renewed = true;
    }
    try { return await invoke(credentials.current); }
    catch (error) {
      if (renewed || error.code !== expiryCode) throw error;
      await refresh(student);
      return invoke(credentials.current);
    }
  }

  function lookup(student, attempt) {
    return withToken(student, 3, async token => {
      const { data } = await client.query(token, attempt.originId);
      return data.find(row => row.originId === attempt.originId && row.username === student.username) || null;
    });
  }

  function markSubmitted(attempt, receipt) {
    attempt.submission.status = 'complete';
    attempt.submission.receipt = receipt || attempt.originId;
    store.save();
  }

  async function reconcile(student, attempt) {
    const existing = await lookup(student, attempt);
    if (!existing || Number(existing.status) !== 1) return false;
    if (Number(existing.score) !== attempt.submission.payload.score ||
        existing.steps?.length !== attempt.submission.payload.steps.length) {
      throw new LabError('实验空间已有同编号记录，内容与本站提交不符，请核对。', 409);
    }
    markSubmitted(attempt, existing.id);
    return true;
  }

  async function submit(student, attempt) {
    if (attempt.submission?.status === 'complete') return;
    if (!attempt.submission) {
      attempt.submission = { status: 'ready', payload: buildResult(attempt, student.username, client.appid, title) };
      store.save();
    }
    if (attempt.submission.status === 'sending' && await reconcile(student, attempt)) return;
    attempt.submission.status = 'sending';
    store.save();
    try {
      const reply = await withToken(student, 2, token => client.upload(token, attempt.submission.payload));
      markSubmitted(attempt, reply.id);
    } catch (error) {
      if (error.code === 15) {
        if (await reconcile(student, attempt)) return;
      } else if (error.code != null) {
        attempt.submission.status = 'ready';
        store.save();
      }
      throw error;
    }
  }

  async function uploadReport(req, student, attempt, url) {
    if (attempt.submission?.status !== 'complete') throw new LabError('请先回传成绩，再上传实验报告。', 409);
    if (attempt.report) return;
    const filename = url.searchParams.get('filename');
    if (!filename || filename.length > 150 || /[\\/\u0000-\u001f]/.test(filename) || !/\.pdf$/i.test(filename)) {
      throw new LabError('请选择 PDF 实验报告。');
    }
    const bytes = await readBody(req, fileLimit);
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new LabError('请选择有效的 PDF 实验报告。');
    try {
      const uploaded = await withToken(student, 3, token => client.attach(token, attempt.originId, filename, bytes));
      attempt.report = { receipt: uploaded.id || attempt.originId };
    } catch (error) {
      if (error.code !== 6 || !(await lookup(student, attempt))?.attachment) throw error;
      attempt.report = { receipt: attempt.originId };
    }
    store.save();
  }

  async function handleApi(req, res, url) {
    const student = studentFor(req);
    let attempt;
    if (student) {
      const previous = student.attempts.at(-1);
      attempt = currentAttempt(student.attempts);
      if (attempt !== previous) store.save();
    }
    if (req.method === 'GET' && url.pathname === '/api/ilab/session') {
      return json(res, 200, { connected: Boolean(student), attempt: attempt ? summary(attempt) : null });
    }
    if (!student) throw new LabError('请通过实验空间的「我要做实验」进入。', 401);
    if (url.searchParams.get('originId') !== attempt.originId) throw new LabError('本页实验记录已变更，请刷新页面。', 409);
    if (req.method === 'GET' && url.pathname === '/api/ilab/result') {
      const existing = await exclusive(student, () => lookup(student, attempt));
      return json(res, 200, { found: Boolean(existing), status: existing?.status, score: existing?.score,
        steps: existing?.steps?.length, attachment: Boolean(existing?.attachment), originId: attempt.originId });
    }
    if (req.method !== 'POST' || req.headers.origin !== url.origin) throw new LabError('请求来源不正确。', 403);

    await exclusive(student, async () => {
      switch (url.pathname) {
        case '/api/ilab/progress': {
          const data = await readJson(req);
          if (typeof data?.operationId !== 'string' || !/^[a-f0-9-]{36}$/.test(data.operationId)) {
            throw new LabError('缺少有效的保存操作编号。');
          }
          if (data.operationId === attempt.lastOperation) break;
          if (data?.revision !== (attempt.revision || 0)) throw new LabError('另一页面已保存进度，请刷新后继续。', 409);
          saveProgress(attempt, data);
          attempt.revision = (attempt.revision || 0) + 1;
          attempt.lastOperation = data.operationId;
          store.save();
          break;
        }
        case '/api/ilab/submit':
          await submit(student, attempt);
          break;
        case '/api/ilab/report':
          await uploadReport(req, student, attempt, url);
          break;
        case '/api/ilab/restart':
          if (attempt.submission && attempt.submission.status !== 'complete') {
            throw new LabError('请先确认当前提交的回传结果。', 409);
          }
          student.attempts.push(createAttempt());
          store.save();
          break;
        default:
          throw new LabError('找不到本地接口。', 404);
      }
    });
    return json(res, 200, { attempt: summary(student.attempts.at(-1)) });
  }

  return createServer(async (req, res) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    let url;
    try {
      if (!/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(req.headers.host || '')) throw new LabError('请通过本机地址访问。', 403);
      url = new URL(req.url, 'http://' + req.headers.host);
      if (url.host !== req.headers.host) throw new LabError('请通过本机地址访问。', 403);
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method === 'GET' && (url.pathname === '/entry' || url.pathname === '/' && url.searchParams.has('ticket'))) {
        return await enter(res, url);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new LabError('请求方式不受支持。', 405);
      const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const ext = path.extname(name).toLowerCase();
      const directory = name.split('/')[0];
      const file = path.resolve(__dirname, name);
      const asset = ['assets', 'videos'].includes(directory) && file.startsWith(path.join(__dirname, directory) + path.sep);
      if (!staticFiles.has(name) && !(asset && Object.hasOwn(fileTypes, ext))) throw new LabError('找不到网页。', 404);
      const info = statSync(file);
      if (!info.isFile()) throw new LabError('找不到网页。', 404);
      const headers = { 'Content-Type': fileTypes[ext], 'Cache-Control': 'no-store', 'Content-Length': info.size };
      const media = fileTypes[ext].startsWith('video/');
      if (media) headers['Accept-Ranges'] = 'bytes';
      let slice;
      if (media && req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (match && (match[1] || match[2])) {
          const start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
          const end = match[1] && match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
          if (start <= end) slice = { start, end };
        }
        if (!slice) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + info.size });
          return res.end();
        }
        headers['Content-Range'] = 'bytes ' + slice.start + '-' + slice.end + '/' + info.size;
        headers['Content-Length'] = slice.end - slice.start + 1;
      }
      res.writeHead(slice ? 206 : 200, headers);
      if (req.method === 'HEAD') return res.end();
      await pipeline(createReadStream(file, slice), res);
    } catch (error) {
      if (res.headersSent || res.destroyed) return res.destroy();
      const known = error instanceof LabError;
      const status = known ? error.status : error.code === 'ENOENT' ? 404 : 500;
      const message = known ? error.message : status === 404 ? '找不到网页。' : '本地服务处理失败。';
      if (url?.pathname.startsWith('/api/')) {
        json(res, status, { error: message, code: known ? error.code : null,
          attempt: studentFor(req) ? summary(studentFor(req).attempts.at(-1)) : null });
      } else {
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(message);
      }
    }
  });
}

if (require.main === module) {
  const { ILAB_API_BASE, ILAB_APPID, ILAB_SECRET, ILAB_STATE_FILE } = process.env;
  if ([ILAB_API_BASE, ILAB_APPID, ILAB_SECRET].some(Boolean) && ![ILAB_API_BASE, ILAB_APPID, ILAB_SECRET].every(Boolean)) {
    throw new Error('自定义接口地址时，请同时填写 ILAB_API_BASE、ILAB_APPID、ILAB_SECRET。');
  }
  // Public credentials published on the official “测试对接” page.
  const client = createClient({
    base: ILAB_API_BASE || 'http://39.105.173.29',
    appid: ILAB_APPID || '10000',
    secret: ILAB_SECRET || 'DDO7jw9TAZlLwRLRKSpBWXIlYZe9PKaD5Wc1S5ZQ0U8=',
  });
  const port = Number(process.env.PORT || 4173);
  const app = createApp({ client, stateFile: ILAB_STATE_FILE });
  app.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? '端口已占用，可通过 PORT 指定其他端口。' : '无法启动本地实验服务。');
    process.exitCode = 1;
  });
  app.listen(port, '127.0.0.1', () => {
    console.log('实验首页 http://127.0.0.1:' + app.address().port);
    console.log('实验空间跳转地址 http://127.0.0.1:' + app.address().port + '/entry');
    console.log(ILAB_API_BASE ? '使用自定义接口配置。' : '使用实验空间官方公开测试配置。');
  });
}
module.exports = { createApp };
