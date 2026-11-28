'use strict';

const { modules, steps, times, result, visual, previewVisual, importedMaterials } = globalThis.cityExperiment;
const root = document.querySelector('#app');
let storageKey;
let session = { answers: [], choices: {}, active: {}, tasks: {}, bounds: null, pendingBounds: null, purposes: [], surveyPoints: [], minute: 0 };
let saved = true;
let city;
let remote;
let pending = [];
let syncing;
let syncError = '';
let ilabMessage = '';
let stepClock;

function setChoiceOptions(select, options, savedValue = '') {
  select.required = true;
  const placeholder = new Option('请选择', '');
  placeholder.disabled = true;
  select.add(placeholder);
  for (const [value, label] of options) select.add(new Option(label, value));
  select.value = savedValue;
  if (select.selectedIndex === -1) select.value = '';
  return select;
}

function appendChoice(parent, label, options) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label + ' ';
  const select = document.createElement('select');
  wrapper.append(select);
  parent.append(wrapper);
  return setChoiceOptions(select, options);
}

async function ilabRequest(path, options) {
  const response = await fetch('/api/ilab/' + path, options);
  const data = await response.json();
  if (!response.ok) {
    if (data.attempt?.originId === remote?.originId && data.attempt?.submission) remote = data.attempt;
    throw new Error(data.error || '实验空间操作失败。');
  }
  return data;
}

function savePending() {
  try { localStorage.setItem(storageKey, JSON.stringify(pending)); }
  catch { /* 云端保存继续运行。 */ }
}

function syncLabel() {
  if (remote) return syncError || (pending.length ? '正在保存本地服务进度' : '已保存到本地服务');
  return saved ? '本机自动保存' : '浏览器未能保存进度';
}

async function uploadPending() {
  syncError = '';
  while (pending.length) {
    const entry = pending[0];
    entry.revision ??= remote.revision;
    savePending();
    try {
      const { attempt } = await ilabRequest('progress?originId=' + remote.originId, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
      });
      remote = attempt;
    } catch (error) {
      syncError = error.message;
      break;
    }
    pending.shift();
    savePending();
  }
  const status = root.querySelector('[data-ilab-save]');
  if (status) status.textContent = syncLabel();
  const retry = root.querySelector('#retry-save');
  if (retry) retry.hidden = !syncError;
  return !pending.length;
}

function flush() {
  syncing ??= uploadPending().finally(() => { syncing = undefined; });
  return syncing;
}

async function ilabAction(operation, file) {
  try {
    if (!await flush()) throw new Error(syncError || '请先保存进度。');
    const parameters = new URLSearchParams({ originId: remote.originId });
    if (file) parameters.set('filename', file.name);
    const query = parameters.toString();
    if (operation === 'result') {
      const reply = await ilabRequest(operation + '?' + query);
      ilabMessage = reply.found ? '实验空间已查到记录，成绩 ' + reply.score + ' 分，步骤 ' + reply.steps + ' 条。'
        : '实验空间暂未查到本次实验结果。';
    } else {
      const { attempt } = await ilabRequest(operation + '?' + query, {
        method: 'POST', body: file,
      });
      remote = attempt;
      ilabMessage = operation === 'submit' ? '实验成绩已回传。' : 'PDF 实验报告已上传。';
    }
  } catch (error) {
    ilabMessage = error.message;
  }
  render();
}

function restore() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!data || !Array.isArray(data.answers)) return;
    const answers = [];
    for (const [index, answer] of data.answers.entries()) {
      if (!steps[index]?.options.some(([id]) => id === answer)) break;
      answers.push(answer);
    }
    session = {
      answers,
      purposes: cityExperiment.purposes.filter(([id]) => Array.isArray(data.purposes) && data.purposes.includes(id)).map(([id]) => id),
      tasks: data.tasks || {}, bounds: data.bounds || null, pendingBounds: data.pendingBounds || null,
      choices: data.choices && typeof data.choices === 'object' ? data.choices : {},
      active: data.active && typeof data.active === 'object' ? data.active : {},
      surveyPoints: cityExperiment.surveyPointsInBounds(data.surveyPoints, data.bounds),
      flightSettings: data.flightSettings, appliedFlightSettings: data.appliedFlightSettings,
      minute: Number.isInteger(data.minute) && data.minute >= 0 && data.minute < times.length ? data.minute : 0,
    };
  } catch { saved = false; }
}
function save(action) {
  if (remote) {
    if (remote.submission) return;
    pending.push({ operationId: crypto.randomUUID(), draft: JSON.parse(JSON.stringify(session)), action });
    savePending();
    void flush();
    return;
  }
  try { localStorage.setItem(storageKey, JSON.stringify(session)); saved = true; }
  catch { saved = false; }
}
function setActive(module, number) {
  session.active[module.id] = number;
  save();
  render();
}
function countComplete(module) {
  return Math.max(0, Math.min(module.end, session.answers.length) - module.start + 1);
}
function moduleLink(module) { return '#' + module.id; }

function revealCurrentStep() {
  const nav = root.querySelector('.step-nav');
  if (!nav || nav.scrollWidth <= nav.clientWidth) return;
  const track = nav.getBoundingClientRect();
  const step = nav.querySelector('[aria-current="step"]').getBoundingClientRect();
  if (step.left < track.left) nav.scrollLeft += step.left - track.left - 9;
  else if (step.right > track.right) nav.scrollLeft += step.right - track.right + 9;
}

function renderHome() {
  stepClock = undefined;
  root.innerHTML = `<header class="header"><div class="container topbar"><a href="#home" class="brand"><span>LAB</span>数字孪生城市实验室</a><a href="#modules">实验模块 ↓</a></div></header>
  <main class="container">
    <section class="hero"><div class="hero-copy"><h1>数字孪生城市<br>虚拟仿真实验</h1>
    <p>从航拍底图圈定测区，重建滨水街区，接入交通与水位观测，回放车流和涨水漫岸的过程。</p><a class="button light" href="#modules">查看实验模块 ↓</a></div>
    <figure class="hero-preview"><img src="assets/city.webp" width="1360" height="870" alt="带建筑纹理、绿化和道路标线的教学街区俯视图"><figcaption>搭建完成后的样例街区</figcaption></figure></section>
    <section id="modules" class="modules"><div class="section-title"><h2>实验模块</h2><div class="module-actions"><p>共 ${steps.length} 步 · ${remote ? '已接入实验空间，进度保存在本地服务' : '同一浏览器自动恢复实验进度'}</p>
    ${session.answers.length ? '<button type="button" id="restart">从空场景重做</button>' : ''}</div></div>
    <div class="cards">${modules.map(module => {
      const count = countComplete(module), total = module.end - module.start + 1;
      return `<article><div class="card-top"><span class="module-icon">${module.icon}</span><small>${count === total ? '已完成' : count ? count + ' / ' + total + ' 已完成' : '未开始'}</small></div>
      <h3>${module.name}</h3><p>${module.description}</p><a href="${moduleLink(module)}">进入实验 →</a></article>`;
    }).join('')}</div></section>
  </main>`;
  const showcase = visual(steps.map(step => step.options[0][0]), 0);
  city ??= createCityView();
  city.root.hidden = false;
  root.querySelector('.hero-preview').prepend(city.root);
  city.update({ ...showcase, lines: [], markers: [] }, null, 'preview');
  root.querySelector('#restart')?.addEventListener('click', async () => {
    if (!confirm(remote ? '重新开始会创建新的实验记录。是否继续？' : '重新开始会清除本机的实验进度。是否继续？')) return;
    if (remote) {
      try {
        if (!await flush()) throw new Error(syncError);
        const { attempt } = await ilabRequest('restart?originId=' + remote.originId, { method: 'POST' });
        remote = attempt;
        storageKey = 'city-ilab:pending:' + attempt.originId;
        ilabMessage = '';
      } catch (error) { alert(error.message); return; }
    }
    session = { answers: [], choices: {}, active: {}, tasks: {}, bounds: null, pendingBounds: null, purposes: [], surveyPoints: [], minute: 0 };
    save();
    location.hash = modules[0].id;
  });
  if (location.hash === '#modules') document.querySelector('#modules').scrollIntoView();
}

function downloadResults() {
  const evidence = session.answers.map((answer, index) => ({
    step: index + 1,
    task: steps[index].title,
    setting: steps[index].options.find(([id]) => id === answer)?.[1],
    windows: times.map((time, minute) => ({
      time, ...result(index + 1, session.answers.slice(0, index + 1), minute),
    })),
  }));
  const data = JSON.stringify({ dataset: '滨水街区测绘实验', bounds: session.bounds, purposes: session.purposes || [], surveyMeasurements: cityExperiment.surveyRows(session.surveyPoints ?? []), flightSettings: session.appliedFlightSettings, evidence }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '孪生城市实验记录.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderTraining(module, message = '') {
  const progress = session.answers.length;
  const blocked = progress < module.start - 1;
  const active = session.active[module.id];
  const canView = number => Number.isInteger(number) && number >= module.start && number <= module.end && number <= progress + 1;
  const number = canView(active) ? active : Math.min(module.end, Math.max(module.start, progress + 1));
  if (!blocked && stepClock?.step !== number) stepClock = { step: number, startedAt: Date.now() };
  const step = steps[number - 1];
  const stage = blocked ? progress : Math.min(progress, number);
  const view = session.answers.slice(0, stage);
  const isSources = number === 2 && !blocked;
  const isReference = number === 3 && !blocked;
  const isFieldSurvey = number === 4 && !blocked;
  const isFlight = number === 5 && !blocked;
  const isCoverage = number === 6 && !blocked;
  const surveyBounds = session.bounds || citySurveyMap.presets[session.answers[0]] || citySurveyMap.extent;
  let surveyPoints = cityExperiment.surveyPointsInBounds(session.surveyPoints, surveyBounds);
  const chosen = isSources ? (session.answers[1] || 'base')
    : isReference ? (session.answers[2] || 'transform')
    : isFieldSurvey ? (session.answers[3] || 'field')
    : isFlight ? (session.choices[5] || session.answers[4] || 'grid')
    : isCoverage ? (session.answers[5] || 'all')
    : session.choices[number] || session.answers[number - 1] || '';
  const done = stage === number;
  const scopePending = number === 1 && Boolean(session.pendingBounds);
  const {normalizeFlightSettings} = cityExperiment;
  const appliedFlight = normalizeFlightSettings(session.appliedFlightSettings);
  let flightSettings = normalizeFlightSettings(session.flightSettings || appliedFlight);
  const flightDirty = () => isFlight && Object.keys(appliedFlight).some(id => flightSettings[id] !== appliedFlight[id]);
  const isDirty = () => done && (chosen !== session.answers[number - 1] || scopePending || flightDirty());
  const required = cityFieldwork.requirements[number].filter(([id]) =>
    !isCoverage || cityExperiment.coverageCasesForBounds(surveyBounds).includes(id)
  );
  const completed = new Set(isSources ? importedMaterials(session.tasks?.[number], done) : session.tasks?.[number] || []);
  const tasksDone = () => required.every(([id]) => completed.has(id)) &&
    (number !== 1 || Boolean(session.purposes?.length));
  let capturingFlight = false;
  const canApply = () => !locked && !capturingFlight && Boolean(chosen) && (isFlight || tasksDone());
  const applyText = () => isFlight ? '开始飞行采集' : isCoverage ? '保存补采结果' : isDirty() ? '重新应用并更新场景' : '应用并更新场景';
  const nextNumber = number + 1;
  const nextModule = modules.find(item => nextNumber >= item.start && nextNumber <= item.end);
  const waitModule = modules.find(item => progress + 1 >= item.start && progress + 1 <= item.end);
  const currentSteps = steps.slice(module.start - 1, module.end);
  const isPhoto = number === 1 && !blocked;
  const locked = Boolean(remote?.submission);
  const delivered = remote?.submission?.status === 'complete';
  const hasDraft = () => !isSources && !isReference && !isFieldSurvey && !isCoverage && !blocked && !locked &&
    (!done || isDirty()) && step.options.some(([id]) => id === chosen);
  const showingDraft = hasDraft();
  root.innerHTML = `<header class="header training"><div class="container topbar">
    <a href="#home">← 返回首页</a><h1>${module.name}</h1>
    <span class="save" role="status" data-ilab-save>${remote ? '' : syncLabel()}</span>
    ${remote ? '<button type="button" id="retry-save" hidden>重试保存</button>' : ''}</div></header>
  <main class="container workspace">
    <nav class="step-nav" aria-label="本模块步骤"><ol>${currentSteps.map(item => {
      const completed = item.number <= progress;
      return `<li><button type="button" data-step="${item.number}"${canView(item.number) ? '' : ' disabled'}${item.number === number ? ' aria-current="step"' : ''}
        ${completed ? `class="completed" aria-label="第 ${item.number} 步，${item.title}，已完成"` : ''}>
        <span class="step-badge"${completed ? ' aria-hidden="true"' : ''}>${completed ? '✓' : item.number}</span>
        <span>${item.title}</span></button></li>`;
    }).join('')}</ol></nav>
    <section class="map" aria-label="教学样例街区">
      <div class="map-head"><strong>教学样例街区</strong>${isSources || isReference ? '<div class="source-views" role="group" aria-label="资料视图"></div>' : ''}${showingDraft && !isFlight ? '<span class="draft-label">浅红色 · 尚未应用</span>' : ''}<span data-testid="stage">场景阶段 ${stage} / ${steps.length}</span></div>
      <div id="city-mount"></div><p id="operation-feedback" role="status" hidden></p>
      ${isReference || isFieldSurvey || isCoverage ? '' : `<div class="timeline"><strong>观测时间</strong>${Math.max(stage, showingDraft ? number : 0) < 14 ?
        '<span class="time-hint">接入观测后可回放</span>' : `<div>${times.map((time, minute) =>
          `<button type="button" data-minute="${minute}" aria-pressed="${minute === session.minute}">${time}</button>`).join('')}</div>`}</div>`}
    </section>
    <aside class="controls" aria-label="训练操作">
      <div class="step-count">第 ${number} 步 · 共 ${steps.length} 步</div>
      <h2>${step.title}</h2><p>${step.description}</p>
      ${blocked ? `<div class="control-group"><p>请先完成前序搭建。当前场景显示你已完成的阶段。</p>
        <a class="button" href="${moduleLink(waitModule)}">继续第 ${progress + 1} 步 →</a></div>` :
        `<div class="control-group">
          ${isPhoto || isSources || isReference || isFieldSurvey || isCoverage ? '' : `<label for="choice">${step.label}</label>
          <select id="choice"${locked ? ' disabled' : ''}></select>`}
          <div id="workbench"></div>
          ${isReference || isFieldSurvey ? '' : `<button class="button${isFlight ? ' flight-capture' : ''}" id="apply" type="button"${canApply() ? '' : ' disabled'}>
            ${isFlight ? '<span class="source-fill" aria-hidden="true"></span><span data-flight-label>' + applyText() + '</span>' : applyText()}</button>`}
          ${isFlight ? '<div id="flight-status"></div>' : ''}
          ${isReference || isFieldSurvey || isFlight ? '' : `<p class="notice" role="status">${message || (showingDraft && !isFlight ? '浅红色表示方案预览。完成本步操作后即可应用。' : '')}</p>`}
          ${done && nextModule && (!showingDraft || isFlight) ? `<button type="button" class="button secondary" id="next"${showingDraft ? ' hidden' : ''}>下一步 →</button>` : ''}
          ${done && !showingDraft && number === steps.length ? '<button type="button" class="button secondary" id="export">导出实验结果</button>' : ''}
          ${remote && done && !showingDraft && number === steps.length ? `<div class="control-group">
            ${delivered ? '<strong>成绩已回传实验空间</strong>' : '<button type="button" class="button" id="ilab-submit">' + (locked ? '重试回传' : '提交到实验空间') + '</button>'}
            <button type="button" class="button secondary" id="ilab-result">查询回传结果</button>
            ${delivered && !remote.report ? '<label for="ilab-pdf">实验报告（PDF，可选）</label><input type="file" id="ilab-pdf" accept=".pdf,application/pdf"><button type="button" class="button secondary" id="ilab-report">上传报告</button>' : ''}
            ${remote.report ? '<p>PDF 实验报告已上传</p>' : ''}
            <p id="ilab-feedback" role="status"></p></div>` : ''}
        </div>`}
    </aside>
  </main>`;
  const choiceSelect = root.querySelector('#choice');
  if (choiceSelect) setChoiceOptions(choiceSelect, step.options, chosen);
  revealCurrentStep();
  const mount = root.querySelector('#city-mount');
  const at = minute => ({
    ...(hasDraft() ? previewVisual(view, [...view.slice(0, number - 1), chosen], minute) : visual(view, minute)),
    bounds: session.bounds,
    surveyPoints: isFlight ? [] : surveyPoints,
    cadBasemap: isFieldSurvey || isFlight,
    flightSettings: isFlight ? flightSettings : session.appliedFlightSettings,
  });
  const road = !blocked && number === 13 ? (chosen || 'a') : null;
  function drawScene() {
    if (!isPhoto && !isReference && !isCoverage) city.update(at(session.minute), inspectDevice, 'training', road);
  }
  function setMinute(minute) {
    if (minute !== session.minute) {
      session.minute = minute;
      save();
    }
    drawScene();
    root.querySelectorAll('[data-minute]').forEach(button =>
      button.setAttribute('aria-pressed', String(Number(button.dataset.minute) === minute)));
  }
  function updateApplyState() {
    const button = root.querySelector('#apply');
    if (button) {
      button.disabled = !canApply();
      if (isFlight) {
        button.querySelector('[data-flight-label]').textContent = capturingFlight ? '飞行采集中…' : applyText();
        button.toggleAttribute('data-imported', !capturingFlight && done && !isDirty() && completed.has('capture'));
      } else button.textContent = applyText();
    }
    const next = root.querySelector('#next');
    if (isFlight && next) next.hidden = capturingFlight || isDirty();
  }
  function signal(event) {
    if (!mount.isConnected) return;
    city?.setOperation?.({ ...event, step: number });
    const note = root.querySelector('#operation-feedback');
    note.hidden = !event.label;
    note.textContent = event.label || '';
  }
  function record(id, { selected = true, persist = true } = {}) {
    if (locked || !mount.isConnected || !required.some(([key]) => key === id) || completed.has(id) === selected) return;
    if (selected) completed.add(id);
    else completed.delete(id);
    session.tasks[number] = [...completed];
    if (persist) save();
    updateApplyState();
  }
  const photoUrl = i => i === 0 ? 'assets/survey-ortho-photo.jpg' : 'assets/survey-' + (i + 1) + '.jpg';
  function kit(body) {
    return { body, chosen, completed, record, signal, at, setMinute, visual: at(session.minute),
      paintFlight: footprints => city?.setFlightFootprints(footprints),
      flightSettings,
      statusHost: isFlight ? root.querySelector('#flight-status') : null,
      updateFlightSettings(settings) {
        flightSettings = session.flightSettings = settings;
        record('capture', {selected:false, persist:false});
        updateApplyState();
        drawScene();
      },
      saveFlightSettings: () => save(),
      locked,
      photoUrl,
      inspect: inspectDevice, attachCamera: canvas => city?.attachCamera(canvas) };
  }
  function inspectDevice(id) {
    if (!['D-01','C-01','W-01'].includes(id) || blocked) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'device-dialog';
    dialog.setAttribute('aria-label', id + ' 设备观测');
    dialog.innerHTML = '<button type="button" class="dialog-close">关闭 ×</button><div class="device-body"></div>';
    root.append(dialog);
    dialog.addEventListener('close', () => { city.attachCamera(null); dialog.remove(); }, { once: true });
    dialog.querySelector('button').onclick = () => dialog.close();
    dialog.showModal();
    cityFieldwork.inspect(number, {...kit(dialog.lastElementChild), locked: locked || !chosen}, id);
  }
  if (isPhoto) {
    function resetScopeDraft() {
      session.pendingBounds = null;
      delete session.choices[1];
      completed.clear();
      session.tasks[1] = [];
      save();
      updateApplyState();
      root.querySelector('#next')?.remove();
    }
    mountSurveyMap(mount, root.querySelector('#workbench'), {
      chosen, bounds: session.pendingBounds || session.bounds, appliedBounds: session.bounds, appliedChoice: session.answers[0], purposes: session.purposes || [], locked,
      onPurposesChange(purposes) {
        session.purposes = purposes;
        save();
        updateApplyState();
      },
      onInvalid: resetScopeDraft,
      onEditing: resetScopeDraft,
      onSelect({choice, bounds}) {
        if (locked) return;
        session.pendingBounds = bounds;
        session.choices[1] = choice;
        session.active[module.id] = 1;
        session.tasks[1] = ['bounds'];
        save();
        render('测区已圈定。应用后，后续模型将按此边界生成。');
      }
    });
  } else if (!isReference && !isCoverage) {
    city ??= createCityView();
    city.root.hidden = false;
    mount.append(city.root);
    drawScene();
  }
  if (isSources) {
    mountSourceMaterials({
      body: root.querySelector('#workbench'), toolbar: root.querySelector('.source-views'),
      mount, cityRoot: city.root, completed, locked, record, drawScene,
    });
  }
  if (isReference) {
    mountReferenceWork({
      body: root.querySelector('#workbench'), toolbar: root.querySelector('.source-views'),
      mount, completed, done, locked, record,
      verify() {
        record('verified', { persist: false });
        applyStep();
      },
    });
  }
  if (isFieldSurvey) {
    mountFieldSurvey({
      body: root.querySelector('#workbench'), setPlacement: city.setSurveyPlacement, bounds: surveyBounds, points: surveyPoints, done, locked,
      savePoints(points) {
        surveyPoints = session.surveyPoints = points;
        save();
        drawScene();
      },
      finish() {
        record('control', {persist:false});
        applyStep();
      },
    });
  }
  if (isCoverage) {
    mountCoverageReview({
      mount, body: root.querySelector('#workbench'), bounds: surveyBounds, completed, record,
      flightChoice: session.answers[4], flightSettings: appliedFlight,
      readOnly: done || locked,
    });
  }
  if (!blocked) {
    updateApplyState();
    const body = root.querySelector('#workbench');
    if (isFlight || (chosen && !locked && !isPhoto && !isSources && !isReference && !isFieldSurvey && !isCoverage)) {
      const work = number <= 11 ? surveyWork : number <= 14 ? cityFieldwork : monitoringWork;
      work.open(number, kit(body));
    }
  }
  if (remote) {
    root.querySelector('[data-ilab-save]').textContent = syncLabel();
    const retry = root.querySelector('#retry-save');
    retry.hidden = !syncError;
    retry.addEventListener('click', () => void flush());
    const feedback = root.querySelector('#ilab-feedback');
    if (feedback) feedback.textContent = ilabMessage;
    function bindAction(id, action, getFile) {
      root.querySelector(id)?.addEventListener('click', event => {
        const file = getFile?.();
        if (getFile && !file) {
          feedback.textContent = '请先选择 PDF 实验报告。';
          return;
        }
        event.currentTarget.disabled = true;
        feedback.textContent = '正在处理…';
        void ilabAction(action, file);
      });
    }
    bindAction('#ilab-submit', 'submit');
    bindAction('#ilab-result', 'result');
    bindAction('#ilab-report', 'report', () => root.querySelector('#ilab-pdf').files[0]);
  }
  choiceSelect?.addEventListener('change', event => {
    session.choices[number] = event.target.value;
    session.tasks[number] = [];
    session.active[module.id] = number;
    save();
    render();
    root.querySelector('#choice')?.focus();
  });
  async function applyStep() {
    if (!canApply() || !step.options.some(([id]) => id === chosen)) return;
    const resetLater = number < progress && isDirty();
    if (resetLater && !confirm('更改前序参数会清除后续计算结果。是否重新从这一步开始？')) return;
    if (isFlight) {
      const button = root.querySelector('#apply');
      capturingFlight = true;
      button.setAttribute('aria-busy','true');
      choiceSelect.disabled = true;
      root.querySelectorAll('.flight-parameters input').forEach(input => { input.disabled = true; });
      updateApplyState();
      await fillSourceProgress(button, 1350);
      if (!mount.isConnected) return;
    }
    if (resetLater) {
      session.answers.length = number - 1;
      if (number < 4) session.surveyPoints = [];
      if (number < 5) {
        delete session.flightSettings;
        delete session.appliedFlightSettings;
      }
      for (const store of [session.tasks, session.choices]) {
        for (const key of Object.keys(store)) if (Number(key) > number) delete store[key];
      }
      for (const id of Object.keys(session.active)) if (session.active[id] > number) delete session.active[id];
    }
    if (number === 1) {
      session.bounds = session.pendingBounds || session.bounds || { ...citySurveyMap.presets[chosen] };
      session.pendingBounds = null;
    }
    if (isFlight) {
      session.appliedFlightSettings = flightSettings;
      record('capture', {persist:false});
    }
    session.answers[number - 1] = chosen;
    session.active[module.id] = number;
    save(stepClock);
    stepClock = { step: number, startedAt: Date.now() };
    render(isReference || isFieldSurvey || isFlight ? '' : isCoverage ? '测区内的补采结果已保存。' : isSources ? '三份资料已应用到本次工程。' : '已应用。查看三维场景中的变化。');
    root.querySelector(isFlight ? '.flight-inspect' : isReference || isFieldSurvey ? '#next' : '#apply')?.focus();
  }
  root.querySelector('#apply')?.addEventListener('click', applyStep);
  root.querySelector('#next')?.addEventListener('click', () => {
    session.active[nextModule.id] = nextNumber;
    save();
    if (nextModule.id !== module.id) location.hash = nextModule.id;
    else render();
  });
  root.querySelector('#export')?.addEventListener('click', downloadResults);
  root.querySelectorAll('[data-step]').forEach(button => {
    button.addEventListener('click', () => {
      setActive(module, Number(button.dataset.step));
      root.querySelector(`[data-step="${button.dataset.step}"]`)?.focus();
    });
  });
  root.querySelectorAll('[data-minute]').forEach(button => {
    button.addEventListener('click', () => {
      setMinute(Number(button.dataset.minute));
      render();
      root.querySelector(`[data-minute="${button.dataset.minute}"]`)?.focus();
    });
  });
}

function render(message) {
  city?.setSurveyPlacement('');
  city?.setFlightFootprints([]);
  city?.setOperation?.(null);
  city?.attachCamera(null);
  const module = modules.find(item => location.hash === moduleLink(item));
  if (module) renderTraining(module, message);
  else renderHome();
}
async function start() {
  const query = new URLSearchParams(location.search);
  const token = query.get('token');
  if (location.protocol !== 'file:') {
    const connected = await ilabRequest('session').catch(() => null);
    if (connected?.attempt) {
      remote = connected.attempt;
      storageKey = 'city-ilab:pending:' + remote.originId;
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (!remote.submission && Array.isArray(stored)) pending = stored;
      } catch { /* 以服务端记录恢复。 */ }
      session = pending.at(-1)?.draft || remote.draft;
      window.addEventListener('online', () => void flush());
    }
  }
  if (query.has('ticket') && !remote) {
    root.textContent = '请启动 Node.js 本地服务，再从实验空间进入。';
    return;
  }
  if (!remote) {
    let identity = query.get('demo') === '1' ? 'demo' : '';
    if (token) {
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      identity = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    try {
      if (identity) sessionStorage.setItem('city-lab-identity', identity);
      else identity = sessionStorage.getItem('city-lab-identity');
    } catch { /* Some browsers disallow storage for local files. */ }
    storageKey = 'city-lab:survey-v1:' + (identity || 'demo');
    if (token) {
      try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* local file */ }
    }
    restore();
  }
  window.addEventListener('hashchange', () => {
    render();
    if (location.hash !== '#modules') window.scrollTo(0, 0);
  });
  window.addEventListener('resize', revealCurrentStep);
  render();
  if (remote && pending.length) void flush();
}
start().catch(() => {
  root.textContent = '无法打开实验。请通过本地文件或 HTTPS 地址访问。';
});
