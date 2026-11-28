'use strict';

function fillSourceProgress(button, milliseconds = 720) {
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : milliseconds;
  return button.querySelector('.source-fill').animate(
    [{transform:'scaleX(0)'}, {transform:'scaleX(1)'}], {duration, easing:'linear'}
  ).finished;
}

function createMaterialFigure(id) {
  const [, title] = cityExperiment.materials.find(([key]) => key === id);
  const figure = document.createElement('figure');
  figure.className = 'source-map';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', {
    cad: '完整街区 CAD 总平面图，标出建筑轮廓、公园、河道及道路',
    traffic: '完整街区交通网络图，标出道路、路口和四座跨河桥',
    dem: '完整街区数字高程模型，包含地面高程栅格、河床、护岸、景观湖和东岸低点剖面',
  }[id]);
  drawEngineeringMap(canvas, id);
  const caption = document.createElement('figcaption');
  caption.innerHTML = '<strong>' + title + '</strong><span>' + {
    cad: '完整街区 · 建筑轮廓 / 道路 / 绿化 / 水系',
    traffic: '完整街区 · 重点道路 / 街区道路 / 桥梁',
    dem: '完整街区 · 1 m 高程栅格 / A–A′ 剖面',
  }[id] + '</span>';
  figure.append(canvas, caption);
  return figure;
}

function mountSourceMaterials({body, toolbar, mount, cityRoot, completed, locked, record, drawScene}) {
  const { materials } = cityExperiment;
  const figures = new Map();
  const status = document.createElement('p');
  status.className = 'source-status';
  status.setAttribute('role', 'status');
  let current = '';
  function getFigure(id) {
    if (!figures.has(id)) figures.set(id, createMaterialFigure(id));
    return figures.get(id);
  }
  function show(id) {
    current = id;
    cityRoot.hidden = Boolean(id);
    mount.querySelector('.source-map')?.remove();
    if (id) mount.append(getFigure(id));
    else drawScene();
    toolbar.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.materialView === current));
    });
  }
  function updateToolbar() {
    const focusedView = toolbar.contains(document.activeElement) ? document.activeElement.dataset.materialView : undefined;
    toolbar.innerHTML = completed.size ? [['', '三维场景'], ...materials.filter(([id]) => completed.has(id))].map(([id,label]) =>
      '<button type="button" data-material-view="' + id + '" aria-pressed="' + (id === current) + '">' + label + '</button>'
    ).join('') : '';
    if (focusedView !== undefined) toolbar.querySelector('[data-material-view="' + focusedView + '"]')?.focus();
    status.textContent = '已导入 ' + completed.size + ' / ' + materials.length + ' 项';
  }
  toolbar.addEventListener('click', event => {
    const button = event.target.closest('[data-material-view]');
    if (button) show(button.dataset.materialView);
  });
  body.innerHTML = '<ul class="source-list">' + materials.map(([id, label]) => {
    const imported = completed.has(id);
    return '<li data-source="' + id + '"><strong>' + label + '</strong><div class="source-actions">' +
      '<button type="button" data-preview aria-label="预览 ' + label + '">预览</button>' +
      '<button type="button" class="source-import" data-import aria-label="' + (imported ? '已导入 ' : '导入 ') + label +
      '"' + (imported || locked ? ' disabled' : '') + (imported ? ' data-imported' : '') +
      '><span class="source-fill"></span><span class="source-import-label">' + (imported ? '已导入' : '导入') + '</span></button></div></li>';
  }).join('') + '</ul>';
  body.append(status);
  updateToolbar();
  body.querySelectorAll('[data-source]').forEach(row => {
    const id = row.dataset.source;
    const title = row.querySelector('strong').textContent;
    const preview = row.querySelector('[data-preview]');
    preview.addEventListener('click', () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'device-dialog source-dialog';
      dialog.setAttribute('aria-label', title + '预览');
      dialog.innerHTML = '<button type="button" class="dialog-close">关闭 ×</button>';
      const figure = getFigure(id);
      // The canvas in the simulator stays mounted while the modal is open.
      const copy = figure.cloneNode(true);
      copy.querySelector('canvas').getContext('2d').drawImage(figure.querySelector('canvas'), 0, 0);
      dialog.append(copy);
      body.append(dialog);
      dialog.addEventListener('close', () => { dialog.remove(); preview.focus(); }, {once:true});
      dialog.querySelector('button').addEventListener('click', () => dialog.close());
      dialog.showModal();
    });
    const button = row.querySelector('[data-import]');
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      const label = button.querySelector('.source-import-label');
      label.textContent = '导入中';
      button.setAttribute('aria-label', '正在导入 ' + title);
      await fillSourceProgress(button);
      if (!body.isConnected) return;
      button.removeAttribute('aria-busy');
      button.dataset.imported = '';
      label.textContent = '已导入';
      button.setAttribute('aria-label', '已导入 ' + title);
      record(id);
      updateToolbar();
      show(id);
    });
  });
}
