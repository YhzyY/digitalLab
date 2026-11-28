'use strict';

globalThis.mountSurveyMap = function mountSurveyMap(container, controls, { chosen, bounds, appliedBounds, appliedChoice, purposes = [], locked = false, onSelect, onInvalid, onEditing, onPurposesChange }) {
  const { extent, presets, required, valid } = globalThis.citySurveyMap;
  const width = extent.maxX - extent.minX;
  const height = extent.maxZ - extent.minZ;
  let choice = Object.hasOwn(presets, chosen) || chosen === 'manual' ? chosen : '';
  let selection = valid(bounds) ? { ...bounds } : choice ? { ...presets[choice] } : null;
  let drag = null;
  let drawing = false;
  container.innerHTML = `<section class="survey-photo" aria-label="研究区域规划红线图">
    <div class="survey-photo__surface">
      <canvas class="survey-plan" role="img" aria-label="教学街区规划红线图，灰色线划表示道路、建筑轮廓、公园和河道，浅红线框表示核心监测区"></canvas>
      <span class="survey-photo__north" aria-label="上方为北">↑ 北</span>
      <div class="survey-photo__required"><span>核心监测区</span></div>
      <div class="survey-photo__box" hidden>
        ${['nw','ne','sw','se'].map(c => `<i data-corner="${c}"></i>`).join('')}
      </div>
    </div>
  </section>`;
  controls.innerHTML = `<div class="survey-photo__controls">
      <div class="survey-photo__meta"><strong>从规划红线图中圈选研究区域</strong><span>浅红色线框内为核心监测区</span></div>
      <div class="survey-photo__actions">
        <button type="button" data-scope="river">滨水测区</button>
        <button type="button" data-scope="block">完整街区</button>
        <button type="button" data-draw aria-pressed="false">手动圈选</button>
      </div>
      <p class="survey-photo__help" id="scope-help"></p>
      <output aria-live="polite"></output>
    </div>
    <fieldset class="survey-purposes"${locked ? ' disabled' : ''}>
      <legend>系统用途（至少选一项，可多选）</legend>
      ${globalThis.cityExperiment.purposes.map(([id, label]) => `<label>
        <input type="checkbox" name="purpose" value="${id}"${purposes.includes(id) ? ' checked' : ''}>
        <span>${label}</span>
      </label>`).join('')}
    </fieldset>`;
  const purposeGroup = controls.querySelector('.survey-purposes');
  purposeGroup.addEventListener('change', () => {
    if (!locked) onPurposesChange?.([...purposeGroup.querySelectorAll('input:checked')].map(input => input.value));
  });
  const surface = container.querySelector('.survey-photo__surface');
  drawSurveyPlan(surface.querySelector('.survey-plan'));
  const box = surface.querySelector('.survey-photo__box');
  const status = controls.querySelector('output');
  const actions = controls.querySelector('.survey-photo__actions');
  const help = controls.querySelector('.survey-photo__help');
  surface.style.aspectRatio = width + ' / ' + height;
  help.textContent = locked ? '查看已保存的测区。' : '在规划图上长按鼠标左键圈选研究范围，拖边角调整，拖框内移动。确定范围后，点击“应用并更新场景”。';
  actions.hidden = locked;
  surface.tabIndex = locked ? -1 : 0;
  surface.setAttribute('role', 'group');
  surface.setAttribute('aria-describedby', help.id);
  surface.setAttribute('aria-label', '规划图选区，方向键移动，Shift 加方向键调整大小');
  function position(node, rect) {
    node.style.left = ((rect.minX - extent.minX) / width * 100) + '%';
    node.style.top = ((rect.minZ - extent.minZ) / height * 100) + '%';
    node.style.width = ((rect.maxX - rect.minX) / width * 100) + '%';
    node.style.height = ((rect.maxZ - rect.minZ) / height * 100) + '%';
  }
  position(surface.querySelector('.survey-photo__required'), required);
  function paint() {
    status.classList.remove('is-error');
    box.hidden = !selection;
    const presetSelected = !drawing && selection && Object.hasOwn(presets, choice) &&
      Object.keys(extent).every(key => selection[key] === presets[choice][key]);
    actions.querySelectorAll('[data-scope]').forEach(button =>
      button.setAttribute('aria-pressed', String(Boolean(presetSelected && button.dataset.scope === choice))));
    actions.querySelector('[data-draw]').setAttribute('aria-pressed', String(drawing || Boolean(selection && !presetSelected)));
    if (!selection) {
      status.textContent = '请圈定调查范围，或选用一个预设测区。';
      return;
    }
    position(box, selection);
    box.classList.toggle('is-invalid', !valid(selection));
    const applied = locked || (choice === appliedChoice && valid(appliedBounds) &&
      Object.keys(extent).every(key => selection[key] === appliedBounds[key]));
    box.classList.toggle('is-applied', applied);
    const w = selection.maxX - selection.minX, h = selection.maxZ - selection.minZ;
    status.textContent = `${w} × ${h} m · ${(w * h / 10000).toFixed(2)} 公顷 · ` +
      (applied ? '已应用的建模边界。' : valid(selection) ? '边界预览，应用后按此范围建模。' : '请扩大选框，完整覆盖浅红色线框内的监测区。');
  }
  function commit() {
    if (!locked && valid(selection)) {
      onSelect({ choice: choice || 'block', bounds: { ...selection } });
    }
  }
  paint();
  if (locked) return;
  actions.querySelectorAll('[data-scope]').forEach(button => {
    button.onclick = () => {
      choice = button.dataset.scope;
      selection = { ...presets[choice] };
      paint();
      commit();
    };
  });
  const drawButton = actions.querySelector('[data-draw]');
  drawButton.onclick = () => {
    drawing = true;
    choice = 'manual';
    onEditing?.();
    paint();
    status.textContent = '从规划图的一角拖到对角，圈选新的建模范围。';
    surface.focus();
  };
  const limit = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function world(event) {
    const r = surface.getBoundingClientRect();
    return {
      x: Math.round(extent.minX + limit((event.clientX - r.left) / r.width, 0, 1) * width),
      z: Math.round(extent.minZ + limit((event.clientY - r.top) / r.height, 0, 1) * height),
    };
  }
  function move(original, dx, dz) {
    dx = limit(dx, extent.minX - original.minX, extent.maxX - original.maxX);
    dz = limit(dz, extent.minZ - original.minZ, extent.maxZ - original.maxZ);
    return { minX: original.minX + dx, maxX: original.maxX + dx,
      minZ: original.minZ + dz, maxZ: original.maxZ + dz };
  }
  function update(end) {
    const { start, original, mode } = drag;
    if (mode === 'move') selection = move(original, end.x - start.x, end.z - start.z);
    else {
      let x = start.x, z = start.z;
      if (mode !== 'draw') {
        x = mode.endsWith('w') ? original.maxX : original.minX;
        z = mode.startsWith('n') ? original.maxZ : original.minZ;
      }
      selection = { minX: Math.min(x, end.x), maxX: Math.max(x, end.x),
        minZ: Math.min(z, end.z), maxZ: Math.max(z, end.z) };
    }
    paint();
  }
  surface.onpointerdown = e => {
    if (e.button !== 0 || drag) return;
    const original = selection && { ...selection };
    const mode = drawing ? 'draw' : e.target.dataset.corner || (box.contains(e.target) ? 'move' : 'draw');
    choice = 'manual';
    onEditing?.();
    drag = { id: e.pointerId, start: world(e), mode, original };
    surface.setPointerCapture(e.pointerId);
    surface.focus({ preventScroll: true });
    e.preventDefault();
  };
  surface.onpointermove = e => {
    if (drag?.id === e.pointerId) update(world(e));
  };
  surface.onpointerup = e => {
    if (drag?.id !== e.pointerId) return;
    update(world(e));
    drag = null;
    surface.releasePointerCapture(e.pointerId);
    if (!valid(selection)) {
      selection = null;
      choice = '';
      drawing = true;
      paint();
      status.classList.add('is-error');
      status.textContent = '本次边界未覆盖核心监测区，请重新圈选。';
      onInvalid?.();
      return;
    }
    drawing = false;
    commit();
  };
  surface.onpointercancel = () => {
    if (drag) { selection = drag.original; drag = null; paint(); }
  };
  surface.onkeydown = e => {
    const delta = {ArrowLeft:[-3,0],ArrowRight:[3,0],ArrowUp:[0,-3],ArrowDown:[0,3]}[e.key];
    if (!delta) return;
    e.preventDefault();
    selection ??= { ...presets.river };
    choice = 'manual';
    const [x,z] = delta;
    if (e.shiftKey) {
      selection.maxX = limit(selection.maxX + x, required.maxX, extent.maxX);
      selection.maxZ = limit(selection.maxZ + z, required.maxZ, extent.maxZ);
    } else {
      const dx = limit(x, required.maxX - selection.maxX, required.minX - selection.minX);
      const dz = limit(z, required.maxZ - selection.maxZ, required.minZ - selection.minZ);
      selection = move(selection, dx, dz);
    }
    paint();
    commit();
    document.querySelector('.survey-photo__surface')?.focus({ preventScroll: true });
  };
};
