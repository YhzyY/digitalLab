'use strict';

function mountReferenceWork({body, toolbar, mount, completed, done, locked, record, verify}) {
  const { materials, referenceInputs, alignLakeReference } = cityExperiment;
  const { lake, shoreShape, extent } = citySurveyMap;
  const prerequisites = referenceInputs.map(([id]) => id);
  let conversion = completed.has('converted') ? alignLakeReference() : null;
  let busy = false;
  let active = materials[0][0];
  let drag = null;
  let keyboardPoint = null;
  const figures = new Map();

  body.innerHTML = `<fieldset class="reference-group reference-frames">
    <legend>确认参考框架 <span class="reference-warning" role="status">请确认所有参考框架</span></legend>
    ${referenceInputs.slice(0,2).map(([id,label]) =>
      `<label><span>${label}</span><input type="checkbox" data-frame="${id}"></label>`).join('')}
    </fieldset>
    <fieldset class="reference-group reference-points">
      <legend>选取公共点<span class="reference-point-hint">（在不同图纸中点选景观湖位置）</span></legend>
      <ol class="reference-checklist">
        ${materials.map(([id,label]) => `<li><div class="reference-point-row">
          <span>${label}</span>
          <span class="reference-point-actions">
            <button type="button" class="reference-jump" data-reference-jump="${id}" aria-label="跳转到图纸：${label}">跳转到图纸</button>
            <span class="reference-checkmark" data-lake-state="${id}" role="img" aria-label="已选湖泊" hidden>✓</span>
          </span>
        </div></li>`).join('')}
      </ol>
    </fieldset>
    <div class="reference-actions">
      <button type="button" class="button source-import" data-convert>
        <span class="source-fill"></span><span data-convert-label>坐标转换</span>
      </button>
      <button type="button" class="button secondary" data-verify hidden>核对</button>
    </div>
    <p class="reference-result" role="status"></p>`;

  const caption = document.createElement('p');
  caption.className = 'reference-map-status';
  caption.id = 'reference-map-status';
  caption.setAttribute('aria-live','polite');
  const surface = document.createElement('div');
  surface.className = 'reference-map';
  surface.setAttribute('role','group');
  surface.setAttribute('aria-label','公共点选区');
  const overlay = document.createElement('div');
  overlay.className = 'reference-selection';
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden','true');
  surface.append(overlay);
  mount.append(surface,caption);

  const frames = body.querySelector('.reference-frames');
  const warning = body.querySelector('.reference-warning');
  const convert = body.querySelector('[data-convert]');
  const check = body.querySelector('[data-verify]');
  const status = body.querySelector('.reference-result');
  const confirmed = () => frames.querySelectorAll('input:checked').length === 2;
  const canPick = () => confirmed() && !locked && !done && !busy && !completed.has('converted');

  toolbar.innerHTML = materials.map(([id,label]) =>
    `<button type="button" data-reference-view="${id}" aria-pressed="false">${label}</button>`).join('');
  function mapStatus() {
    caption.textContent = completed.has(active) ? '已框选景观湖，公共点为湖心。'
      : done || locked ? '查看资料图。'
      : !confirmed() ? '勾选两项参考框架后可选取公共点。'
      : '请在图中选中湖泊';
  }
  function update() {
    const frozen = done || locked || busy || completed.has('converted');
    frames.disabled = frozen;
    warning.hidden = done || locked || confirmed();
    surface.toggleAttribute('data-selectable', canPick());
    body.querySelectorAll('[data-lake-state]').forEach(mark => {
      mark.hidden = !completed.has(mark.dataset.lakeState);
    });
    convert.disabled = frozen || prerequisites.some(id => !completed.has(id));
    convert.toggleAttribute('data-imported', completed.has('converted'));
    convert.querySelector('[data-convert-label]').textContent = completed.has('converted') ? '坐标统一完成' : busy ? '转换中' : '坐标统一';
    check.hidden = !completed.has('converted');
    check.disabled = done || locked;
    if (completed.has('verified')) status.textContent = '核对无误';
    else if (done && !conversion) status.textContent = '已按先前的实验流程完成本步。';
  }

  function renderBox(a, b, mode) {
    const {canvas, projection} = figures.get(active);
    const [x1,y1] = projection.toMap(...a), [x2,y2] = projection.toMap(...b);
    overlay.style.left = Math.min(x1,x2) / canvas.width * 100 + '%';
    overlay.style.top = Math.min(y1,y2) / canvas.height * 100 + '%';
    overlay.style.width = Math.abs(x2-x1) / canvas.width * 100 + '%';
    overlay.style.height = Math.abs(y2-y1) / canvas.height * 100 + '%';
    overlay.dataset.mode = mode;
    overlay.hidden = false;
  }
  function renderSelection() {
    overlay.hidden = !completed.has(active);
    if (!overlay.hidden) {
      renderBox([lake.x-lake.rx*1.1,lake.z-lake.rz*1.1],[lake.x+lake.rx*1.1,lake.z+lake.rz*1.1],'selected');
    }
  }
  function show(id) {
    active = id;
    drag = null;
    keyboardPoint = null;
    if (!figures.has(id)) {
      const canvas = document.createElement('canvas');
      canvas.tabIndex = 0;
      canvas.setAttribute('aria-label',materials.find(([key]) => key === id)[1] + '，湖泊公共点选区');
      canvas.setAttribute('aria-describedby',caption.id);
      canvas.setAttribute('aria-description','可点击湖面或拖框圈定湖泊。用键盘操作时，按方向键移动光标，按 Enter 确认。');
      const projection = drawEngineeringMap(canvas,id);
      figures.set(id,{canvas,projection});
    }
    surface.querySelector('canvas')?.remove();
    surface.prepend(figures.get(id).canvas);
    toolbar.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed',String(button.dataset.referenceView === active));
    });
    renderSelection();
    mapStatus();
  }
  function worldPosition(event) {
    const {canvas,projection} = figures.get(active);
    const rect = canvas.getBoundingClientRect();
    return projection.toWorld((event.clientX-rect.left)/rect.width*canvas.width,
      (event.clientY-rect.top)/rect.height*canvas.height);
  }
  function accept(a, b = a) {
    const dx = (a[0]-lake.x)/lake.rx, dz = (a[1]-lake.z)/lake.rz;
    const isPoint = Math.hypot(a[0]-b[0],a[1]-b[1]) < 3;
    const covers = (p,q,center,radius) => {
      const lo = Math.min(p,q), hi = Math.max(p,q);
      return lo <= center-radius*.5 && hi >= center+radius*.5 &&
        lo >= center-radius*2.2 && hi <= center+radius*2.2;
    };
    const hit = isPoint ? Math.hypot(dx,dz) <= shoreShape(Math.atan2(dz,dx))
      : covers(a[0],b[0],lake.x,lake.rx) && covers(a[1],b[1],lake.z,lake.rz);
    if (hit) {
      record(active);
      update();
      mapStatus();
    } else {
      caption.textContent = '未选中景观湖，请点选湖面，或拖出贴近湖岸的框。';
    }
    renderSelection();
  }

  toolbar.addEventListener('click',event => {
    const button = event.target.closest('[data-reference-view]');
    if (button) show(button.dataset.referenceView);
  });
  body.querySelectorAll('[data-reference-jump]').forEach(button => {
    button.addEventListener('click',() => {
      show(button.dataset.referenceJump);
      surface.querySelector('canvas').focus({preventScroll:true});
      toolbar.scrollIntoView({block:'nearest'});
    });
  });
  surface.addEventListener('pointerdown',event => {
    if (event.button !== 0 || !canPick()) return;
    drag = {id:event.pointerId, start:worldPosition(event)};
    surface.setPointerCapture(event.pointerId);
    renderBox(drag.start,drag.start,'drag');
  });
  surface.addEventListener('pointermove',event => {
    if (drag?.id === event.pointerId) renderBox(drag.start,worldPosition(event),'drag');
  });
  surface.addEventListener('pointerup',event => {
    if (drag?.id !== event.pointerId) return;
    const {start} = drag;
    drag = null;
    if (canPick()) accept(start,worldPosition(event));
    else renderSelection();
  });
  surface.addEventListener('pointercancel',() => { drag = null; renderSelection(); });
  surface.addEventListener('keydown',event => {
    if (!canPick()) return;
    if (!keyboardPoint) keyboardPoint = [(extent.minX+extent.maxX)/2,(extent.minZ+extent.maxZ)/2];
    const arrows = {ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1]};
    if (event.key === 'Enter' || event.key === ' ') accept(keyboardPoint);
    else if (Object.hasOwn(arrows,event.key)) {
      const [dx,dz] = arrows[event.key], step = event.shiftKey ? 1 : 5;
      const [x,z] = keyboardPoint;
      keyboardPoint = [Math.min(extent.maxX,Math.max(extent.minX,x+step*dx)),
        Math.min(extent.maxZ,Math.max(extent.minZ,z+step*dz))];
      renderBox(keyboardPoint,keyboardPoint,'cursor');
    } else return;
    event.preventDefault();
  });
  frames.querySelectorAll('input').forEach(input => {
    input.checked = completed.has(input.dataset.frame);
    input.addEventListener('change',() => {
      record(input.dataset.frame,{selected:input.checked});
      update();
      mapStatus();
    });
  });
  convert.addEventListener('click',async () => {
    if (convert.disabled) return;
    busy = true;
    update();
    convert.setAttribute('aria-busy','true');
    await fillSourceProgress(convert);
    if (!body.isConnected) return;
    conversion = alignLakeReference();
    record('converted');
    busy = false;
    convert.removeAttribute('aria-busy');
    update();
    status.textContent = '转换完成，请核对三份资料的公共点。';
    check.focus();
  });
  check.addEventListener('click',() => {
    if (check.hidden || check.disabled || !conversion) return;
    const {target, aligned} = conversion;
    const matches = aligned.every(([e,n,h]) =>
      Math.hypot(e-target[0], n-target[1]) < .005 && Math.abs(h-target[2]) < .005
    );
    if (matches) verify();
    else status.textContent = '公共点未重合，请重新检查资料。';
  });
  show(active);
  update();
}
