'use strict';

function mountFieldSurvey({body,setPlacement,bounds,points,done,locked,savePoints,finish}) {
  const { surveyKinds, surveyLimit, surveyPointsInBounds, surveyRows } = cityExperiment;
  let mode = '', busy = false;
  body.innerHTML = `<div class="field-survey-actions">
    ${Object.entries(surveyKinds).map(([kind,label]) =>
      `<div><button type="button" class="button secondary" data-place="${kind}" aria-pressed="false">布设${label}</button>
      <span data-point-count="${kind}"></span></div>`).join('')}
    </div>
    <p class="field-survey-status" role="status"></p>
    <button type="button" class="button source-import" data-field-measure>
      <span class="source-fill"></span><span data-field-label>派出外业人员并获取坐标</span>
    </button>
    <p class="field-measure-result" role="status"></p>`;
  const measure = body.querySelector('[data-field-measure]');
  const status = body.querySelector('.field-survey-status');
  const output = body.querySelector('.field-measure-result');
  const count = kind => points.filter(point => point.kind === kind).length;

  function refresh() {
    for (const kind of Object.keys(surveyKinds)) {
      const button = body.querySelector('[data-place="' + kind + '"]');
      button.disabled = busy || done || locked || count(kind) >= surveyLimit;
      button.setAttribute('aria-pressed',String(mode === kind));
      body.querySelector('[data-point-count="' + kind + '"]').textContent = count(kind) + ' / ' + surveyLimit;
    }
    measure.disabled = busy || done || locked || points.length !== surveyLimit * 2;
  }
  function place(x,z) {
    const next = surveyPointsInBounds([...points,{kind:mode,x,z}],bounds);
    if (next.length === points.length) {
      status.textContent = '请选择测区内与已有点位相距至少 1 米的位置。';
      return;
    }
    points = next;
    savePoints(points);
    const label = surveyKinds[mode], total = count(mode);
    if (total === surveyLimit) {
      mode = '';
      setPlacement('');
      status.textContent = points.length === surveyLimit * 2
        ? '六个点位已布设，可以派出外业人员。' : label + '已布设，请继续布设另一类点位。';
    } else status.textContent = label + total + '已布设，请在 CAD 图上选择' + label + (total+1) + '。';
    refresh();
  }

  body.querySelectorAll('[data-place]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.place;
    status.textContent = '请在 CAD 图的测区内点击布设' + surveyKinds[mode] + '，共 3 个点。';
    setPlacement(mode,place);
    refresh();
  }));
  measure.addEventListener('click',async () => {
    if (measure.disabled) return;
    busy = true;
    measure.setAttribute('aria-busy','true');
    body.querySelector('[data-field-label]').textContent = '外业测量中';
    refresh();
    await fillSourceProgress(measure);
    if (body.isConnected) finish();
  });
  if (done && points.length === surveyLimit * 2) {
    measure.dataset.imported = '';
    body.querySelector('[data-field-label]').textContent = '外业测量完成';
    output.textContent = '成功布设3个控制点，3个检查点，已生成外业测量记录表。';
    const table = document.createElement('table');
    table.className = 'field-record';
    const rows = surveyRows(points).sort((a,b) => Number(b.kind === 'control') - Number(a.kind === 'control'));
    table.innerHTML = `<caption>外业测量记录表（教学仿真坐标，单位 m）</caption>
      <thead><tr><th scope="col">点位</th><th scope="col">平面坐标（X, Y）</th><th scope="col">海拔高（H）</th></tr></thead>
      <tbody>${rows.map(({name,X,Y,H}) => `<tr><th scope="row">${name}</th>
        <td>${X.toFixed(2)}, ${Y.toFixed(2)}</td><td>${H.toFixed(2)}</td></tr>`).join('')}</tbody>`;
    body.append(table);
  } else if (done) output.textContent = '已按先前的实验流程完成本步。';
  refresh();
}
