'use strict';

const { modules, steps, times, result, visual } = globalThis.cityExperiment;
const root = document.querySelector('#app');
let storageKey;
let session = { answers: [], choices: {}, active: {}, minute: 0 };
let saved = true;
let city;

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
      choices: data.choices && typeof data.choices === 'object' ? data.choices : {},
      active: data.active && typeof data.active === 'object' ? data.active : {},
      minute: Number.isInteger(data.minute) && data.minute >= 0 && data.minute < times.length ? data.minute : 0,
    };
  } catch { saved = false; }
}
function save() {
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

function renderHome() {
  root.innerHTML = `<header class="header"><div class="container topbar"><a href="#home" class="brand"><span>城</span>孪生城市实验室</a><a href="#modules">实验模块 ↓</a></div></header>
  <main class="container">
    <section class="hero"><div class="hero-copy"><h1>孪生城市<br>虚拟仿真实验</h1>
    <p>从一片空白场景开始，逐步建起城市，接入多源观测并验证火警、拥堵和积水状态。</p><a class="button light" href="#modules">查看实验模块 ↓</a></div>
    <figure><img src="assets/city.webp" width="1360" height="870" alt="带建筑纹理、绿化和道路标线的教学街区俯视图"><figcaption>搭建完成后的样例街区</figcaption></figure></section>
    <section id="modules" class="modules"><div class="section-title"><h2>实验模块</h2><div class="module-actions"><p>共 20 步 · 同一浏览器自动恢复实验进度</p>
    ${session.answers.length ? '<button type="button" id="restart">从空场景重做</button>' : ''}</div></div>
    <div class="cards">${modules.map(module => {
      const count = countComplete(module), total = module.end - module.start + 1;
      return `<article><div class="card-top"><span class="module-icon">${module.icon}</span><small>${count === total ? '已完成' : count ? count + ' / ' + total + ' 已完成' : '未开始'}</small></div>
      <h3>${module.name}</h3><p>${module.description}</p><a href="${moduleLink(module)}">进入训练 →</a></article>`;
    }).join('')}</div></section>
  </main>`;
  root.querySelector('#restart')?.addEventListener('click', () => {
    if (!confirm('重新开始会清除本机的实验进度。是否继续？')) return;
    session = { answers: [], choices: {}, active: {}, minute: 0 };
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
  const data = JSON.stringify({ dataset: '教学样例街区 v2', evidence }, null, 2);
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
  const step = steps[number - 1];
  const stage = blocked ? progress : Math.min(progress, number);
  const view = session.answers.slice(0, stage);
  const chosen = session.choices[number] || session.answers[number - 1] || (step.single ? step.options[0][0] : '');
  const output = result(number, view, session.minute);
  const done = stage === number;
  const dirty = done && chosen !== session.answers[number - 1];
  const nextNumber = number + 1;
  const nextModule = modules.find(item => nextNumber >= item.start && nextNumber <= item.end);
  const waitModule = modules.find(item => progress + 1 >= item.start && progress + 1 <= item.end);
  const currentSteps = steps.slice(module.start - 1, module.end);
  const selectMarkup = step.single ? `<div class="selected-input">${step.options[0][1]}</div>` : `<select id="choice">
    <option value="" disabled${chosen ? '' : ' selected'}>请选择</option>
    ${step.options.map(([id, label]) => `<option value="${id}"${chosen === id ? ' selected' : ''}>${label}</option>`).join('')}
    </select>`;
  root.innerHTML = `<header class="header training"><div class="container topbar">
    <a href="#home">← 返回首页</a><h1>${module.name}</h1>
    <span class="save" role="status">${saved ? '本机自动保存' : '浏览器未能保存进度'}</span></div></header>
  <main class="container workspace">
    <section class="map" aria-label="三维仿真场景">
      <div class="map-head"><strong>教学样例街区</strong><span data-testid="stage">场景阶段 ${stage} / ${steps.length}</span></div>
      <div id="city-mount"></div>
      <div class="timeline"><strong>观测时间</strong>${stage < 7 ?
        '<span class="time-hint">接入观测后可回放</span>' : `<div>${times.map((time, minute) =>
          `<button type="button" data-minute="${minute}" aria-pressed="${minute === session.minute}">${time}</button>`).join('')}</div>`}</div>
    </section>
    <aside class="controls" aria-label="训练操作">
      <div class="step-count">第 ${number} 步 · 共 ${steps.length} 步</div>
      <h2>${step.title}</h2><p>${step.description}</p>
      ${blocked ? `<div class="control-group"><p>请先完成前序搭建。当前场景显示你已完成的阶段。</p>
        <a class="button" href="${moduleLink(waitModule)}">继续第 ${progress + 1} 步 →</a></div>` :
        `<div class="control-group">
          <label${step.single ? '' : ' for="choice"'}>${step.label}</label>
          ${selectMarkup}
          <button class="button" id="apply" type="button"${!chosen ? ' disabled' : ''}>${dirty ? '重新应用并更新场景' : '应用并更新场景'}</button>
          <p class="notice" role="status">${message || (dirty ? '参数草稿已修改。应用后更新场景。' : '')}</p>
        </div>
        <div class="control-group evidence-panel" id="evidence">
          <h3>当前步骤结果</h3><div class="reading"><strong>${output.headline}</strong></div>
          <p class="evidence">${output.detail}</p>
          ${done && nextModule ? `<button type="button" class="button secondary" id="next">下一步 →</button>` : ''}
          ${done && number === steps.length ? '<button type="button" class="button secondary" id="export">导出实验结果</button>' : ''}
        </div>`}
      <nav class="step-nav" aria-label="本模块步骤">${currentSteps.map(item =>
        `<button type="button" data-step="${item.number}"${canView(item.number) ? '' : ' disabled'}${item.number === number ? ' aria-current="step"' : ''}>
          <span>${item.number}</span>${item.title}<small>${item.number <= progress ? '✓' : ''}</small></button>`).join('')}
      </nav>
    </aside>
  </main>`;
  city ??= createCityView();
  root.querySelector('#city-mount').append(city.root);
  city.update(visual(view, session.minute), () => root.querySelector('#evidence')?.scrollIntoView({ block: 'nearest' }));
  root.querySelector('#choice')?.addEventListener('change', event => {
    session.choices[number] = event.target.value;
    session.active[module.id] = number;
    save();
    render();
    root.querySelector('#choice')?.focus();
  });
  root.querySelector('#apply')?.addEventListener('click', () => {
    if (!step.options.some(([id]) => id === chosen)) return;
    if (number < progress && chosen !== session.answers[number - 1]) {
      if (!confirm('更改前序参数会清除后续计算结果。是否重新从这一步开始？')) return;
      session.answers.length = number - 1;
    }
    session.answers[number - 1] = chosen;
    session.active[module.id] = number;
    save();
    render('已应用。查看三维场景中的变化。');
    root.querySelector('#apply')?.focus();
  });
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
      session.minute = Number(button.dataset.minute);
      save();
      render();
      root.querySelector(`[data-minute="${button.dataset.minute}"]`)?.focus();
    });
  });
}

function render(message) {
  const module = modules.find(item => location.hash === moduleLink(item));
  if (module) renderTraining(module, message);
  else renderHome();
}
async function start() {
  const query = new URLSearchParams(location.search);
  const token = query.get('token');
  let identity = query.get('demo') === '1' ? 'demo' : '';
  if (token) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    identity = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  try {
    if (identity) sessionStorage.setItem('city-lab-identity', identity);
    else identity = sessionStorage.getItem('city-lab-identity');
  } catch { /* Some browsers disallow storage for local files. */ }
  if (!identity) {
    root.innerHTML = '<main class="container access"><h1>孪生城市虚拟仿真实验</h1><p>请使用课程入口链接，或打开本地演示。</p><a class="button" href="?demo=1">打开演示</a></main>';
    return;
  }
  storageKey = 'city-lab:v2:' + identity;
  if (token) {
    try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* local file */ }
  }
  restore();
  window.addEventListener('hashchange', () => {
    render();
    if (location.hash !== '#modules') window.scrollTo(0, 0);
  });
  render();
}
start().catch(() => {
  root.textContent = '无法打开实验。请通过本地文件或 HTTPS 地址访问。';
});
