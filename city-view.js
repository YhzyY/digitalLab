'use strict';
globalThis.createCityView = function createCityView() {
  const root = document.createElement('div');
  root.className = 'interactive-city';
  root.innerHTML = `<canvas class="city-gl" tabindex="0" aria-label="三维城市，拖动旋转，滚轮缩放，方向键调整视角"></canvas>
  <div class="city-pins" style="position:absolute;inset:0;overflow:hidden;pointer-events:none"></div>
  <div class="city-tools" aria-label="场景视角"><button type="button" data-camera="home" aria-label="重置为全景">全景</button>
  <button type="button" data-camera="street" aria-label="街道视角">街道</button><button type="button" data-camera="in" aria-label="放大">＋</button><button type="button" data-camera="out" aria-label="缩小">−</button></div>
  <div class="simulation-tools"><button type="button" id="simulation-control">暂停仿真</button><span class="map-tip">拖动旋转 · 滚轮缩放</span></div>
  <div class="city-error" role="alert" hidden></div>`;
  const canvas = root.querySelector('canvas'), pins = root.querySelector('.city-pins'), control = root.querySelector('#simulation-control');
  const T = globalThis.THREE;
  let cadGround, flightFootprints, flightOutlines, surveyPick, keyboardTarget;
  const cadHeight = .18;
  const keyboardCursor = document.createElement('span');
  keyboardCursor.className = 'survey-keyboard-cursor';
  keyboardCursor.setAttribute('aria-hidden','true');
  keyboardCursor.hidden = true;
  root.append(keyboardCursor);
  let renderer, scene, camera, monitor, city, sun, ground;
  let visual = { stage: 0, answers: [] }, preview = false, streetTarget = null, onPick, monitorCanvas = null, monitorCtx = null;
  let raf = 0, last = 0, lastMonitor = -Infinity, drag = null, tagKey = '', shadowKey = '', preset = '';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing = !reduced, previewPlaying = !reduced;
  const start = { azimuth: .23, elevation: .86, zoom: 1, street: false, x: -15, y: 4, z: 17 };
  const pose = { ...start };
  const showcase = { ...start, zoom: 1.2 };
  const view = () => preview ? showcase : pose;
  function init() {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = T.PCFShadowMap;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(30, 1, .3, 2500);
    monitor = new T.PerspectiveCamera(58, 16 / 9, .25, 1300);
    scene.add(new T.HemisphereLight('#f3fbff', '#e5decc', 1.64));
    const fill = new T.DirectionalLight('#eaf5ff', .48);
    fill.position.set(100, 100, 70);
    scene.add(fill);
    sun = new T.DirectionalLight('#fff2d9', 2.2);
    sun.position.set(-126, 230, 104);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -210, right: 210, top: 193, bottom: -193, near: 1, far: 530 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.normalBias = .18;
    sun.shadow.bias = -.00025;
    scene.add(sun);
    ground = new T.Mesh(new T.PlaneGeometry(2000, 2000), new T.ShadowMaterial({ opacity: .14 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -5.28;
    ground.receiveShadow = true;
    scene.add(ground);
    city = createCitySimulation(scene);
    root.dataset.modelReady = 'true';
  }
  let bounds = null;
  let scopeKey = '';
  let operation = null;
  let workMarker;
  const cutPlanes = T ? [
    new T.Plane(new T.Vector3(1, 0, 0)), new T.Plane(new T.Vector3(-1, 0, 0)),
    new T.Plane(new T.Vector3(0, 0, 1)), new T.Plane(new T.Vector3(0, 0, -1)),
  ] : [];

  function enableCadBasemap(enabled) {
    if (!scene) return;
    if (enabled && !cadGround) {
      const { minX, maxX, minZ, maxZ } = citySurveyMap.extent;
      const sheet = document.createElement('canvas');
      const {toMap} = drawEngineeringMap(sheet,'cad');
      const [x1,y1] = toMap(minX,minZ), [x2,y2] = toMap(maxX,maxZ);
      const crop = document.createElement('canvas');
      crop.width = x2-x1;
      crop.height = y2-y1;
      crop.getContext('2d').drawImage(sheet,x1,y1,crop.width,crop.height,0,0,crop.width,crop.height);
      const texture = new T.CanvasTexture(crop);
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      cadGround = new T.Mesh(new T.PlaneGeometry(maxX-minX,maxZ-minZ),new T.MeshBasicMaterial({map:texture,toneMapped:false}));
      cadGround.rotation.x = -Math.PI/2;
      cadGround.position.set((minX+maxX)/2,cadHeight,(minZ+maxZ)/2);
      scene.add(cadGround);
    }
    if (cadGround) cadGround.visible = enabled;
    root.dataset.basemap = enabled ? 'cad' : '';
  }

  function setFlightFootprints(footprints) {
    if (!scene || (!flightFootprints && !footprints.length)) return;
    const limit = 160;
    if (!flightFootprints) {
      flightFootprints = new T.InstancedMesh(
        new T.PlaneGeometry(1,1),
        new T.MeshBasicMaterial({color:'#377ea4',transparent:true,opacity:.09,depthWrite:false}),
        limit
      );
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(limit*8*3),3));
      flightOutlines = new T.LineSegments(geometry,
        new T.LineBasicMaterial({color:'#23678c',transparent:true,opacity:.5,depthWrite:false}));
      flightFootprints.frustumCulled = flightOutlines.frustumCulled = false;
      flightOutlines.renderOrder = 1;
      scene.add(flightFootprints,flightOutlines);
    }
    const tile = new T.Object3D();
    tile.rotation.x = -Math.PI/2;
    const edges = flightOutlines.geometry.attributes.position;
    footprints.slice(0,limit).forEach(({x,z,w,d},i) => {
      const y = cadHeight+.08+i*.0005;
      tile.position.set(x+w/2,y,z+d/2);
      tile.scale.set(w,d,1);
      tile.updateMatrix();
      flightFootprints.setMatrixAt(i,tile.matrix);
      const corners = [[x,z],[x+w,z],[x+w,z+d],[x,z+d]];
      corners.forEach(([x1,z1],edge) => {
        const [x2,z2] = corners[(edge+1)%corners.length];
        edges.setXYZ(i*8+edge*2,x1,y+.02,z1);
        edges.setXYZ(i*8+edge*2+1,x2,y+.02,z2);
      });
    });
    const count = Math.min(limit,footprints.length);
    flightFootprints.count = count;
    flightFootprints.instanceMatrix.needsUpdate = edges.needsUpdate = true;
    flightOutlines.geometry.setDrawRange(0,count*8);
    root.dataset.flightFootprints = String(count);
    request();
  }

  function setSurveyPlacement(kind, pick) {
    surveyPick = kind ? pick : null;
    keyboardTarget = null;
    keyboardCursor.hidden = true;
    root.dataset.placement = kind;
    if (surveyPick) {
      canvas.focus({preventScroll:true});
      canvas.scrollIntoView({block:'nearest'});
    }
  }

  const raycaster = T ? new T.Raycaster() : null;
  const cadPlane = T ? new T.Plane(new T.Vector3(0,1,0),-cadHeight) : null;
  function pickCad(x,y) {
    if (!surveyPick || !cadGround?.visible || !camera) return;
    raycaster.setFromCamera(new T.Vector2(x*2-1,1-y*2),camera);
    const intersection = raycaster.ray.intersectPlane(cadPlane,new T.Vector3());
    surveyPick(intersection?.x,intersection?.z);
  }

  function overview() {
    if (!bounds) return start;
    const w = bounds.maxX - bounds.minX, d = bounds.maxZ - bounds.minZ;
    return {...start, x: (bounds.minX + bounds.maxX) / 2, y: visual.cadBasemap && visual.flightSettings ? 16 : start.y, z: (bounds.minZ + bounds.maxZ) / 2 + d * .05,
      zoom: Math.min(339 / w, 240 / d)};
  }
  function applyScope(next) {
    const map = globalThis.citySurveyMap;
    bounds = preview || !next.stage ? null : map.valid(next.bounds) ? next.bounds : map.presets[next.answers?.[0]] || map.extent;
    const key = JSON.stringify(bounds);
    if (key === scopeKey) return;
    scopeKey = key;
    if (bounds) {
      const offsets = [-bounds.minX, bounds.maxX, -bounds.minZ, bounds.maxZ];
      cutPlanes.forEach((plane, i) => plane.constant = offsets[i]);
    }
    if (renderer) renderer.clippingPlanes = bounds ? cutPlanes : [];
    if (ground) {
      ground.scale.set(bounds ? (bounds.maxX-bounds.minX)/2000 : 1, bounds ? (bounds.maxZ-bounds.minZ)/2000 : 1, 1);
      ground.position.x = bounds ? (bounds.minX+bounds.maxX)/2 : 0;
      ground.position.z = bounds ? (bounds.minZ+bounds.maxZ)/2 : 0;
    }
    root.dataset.scope = key;
    Object.assign(pose, overview());
  }

  function setOperation(op) {
    operation = op;
    if (!scene) return;
    if (!workMarker) {
      workMarker = new T.Mesh(new T.RingGeometry(2, 3.2, 36), new T.MeshBasicMaterial({
        color: '#f18794', transparent: true, opacity: .86, side: T.DoubleSide, depthTest: false,
      }));
      workMarker.rotation.x = -Math.PI / 2;
      workMarker.renderOrder = 9;
      scene.add(workMarker);
    }
    workMarker.visible = !!op && !preview;
    if (op) {
      const anchors = [[0,0],[-48,0],[-42,32],[-42,32],[-42,32],[32,8],[45,6],[-42,32],[-48,0],[-62,81],[-48,0],[-8,39],[-60,45],[-48,39],[-60,45],[-57,39],[-48,39],[-6,35],[60,10],[68,4],[73,0],[-60,45]];
      let anchor = anchors[op.step] || [0,0];
      const progress = Math.max(0, Math.min(1, Number(op.progress) || 0));
      if (op.kind === 'flight' || op.kind === 'cloud' || op.kind === 'matching') {
        const b = bounds || globalThis.citySurveyMap.extent;
        anchor = [b.minX + (b.maxX-b.minX) * (.12 + .76*progress),
          b.minZ + (b.maxZ-b.minZ) * (.5 + .32*Math.sin(progress * 3*Math.PI))];
      }
      const device = city?.devicePoint(op.kind);
      if (device) anchor = [device[0], device[2]];
      const point = op.position || anchor;
      const x = point.x ?? point[0] ?? anchor[0];
      const z = point.z ?? point[2] ?? point[1] ?? anchor[1];
      workMarker.position.set(bounds ? Math.max(bounds.minX+3, Math.min(bounds.maxX-3, x)) : x, 1,
        bounds ? Math.max(bounds.minZ+3, Math.min(bounds.maxZ-3, z)) : z);
      workMarker.scale.setScalar(1.2 + Math.max(0, Math.min(1, Number(op.progress) || 0)) * 1.4);
    }
    request();
  }

  function toolbar() {
    const active = preview ? previewPlaying : playing;
    control.textContent = preview ? (active ? '暂停预览' : '播放预览') : (active ? '暂停仿真' : '播放仿真');
    control.setAttribute('aria-pressed', String(active));
  }
  function setCamera(action) {
    const p = view();
    if (action === 'home')
      Object.assign(p, overview());
    if (action === 'street' && !preview) {
      if (streetTarget === 'b')
        Object.assign(p, { x: -88, y: 3.4, z: -13, azimuth: .05, elevation: .055, zoom: 1, street: true });
      else
        Object.assign(p, { x: -41, y: 3.4, z: 39, azimuth: -1.53, elevation: .055, zoom: 1, street: true });
    }
    if (action === 'in')
      p.zoom = Math.min(6.8, p.zoom * 1.2);
    if (action === 'out')
      p.zoom = Math.max(.48, p.zoom / 1.2);
    request();
  }
  function positionCamera(width, height) {
    const p = view(), aspect = width / height;
    camera.aspect = aspect;
    camera.fov = p.street ? 57 : 30;
    const frustumHeight = Math.max(239, 405 / aspect);
    const distance = p.street ? 31 / p.zoom : frustumHeight / (2 * Math.tan(Math.PI / 12)) / .87 / p.zoom;
    const horizontal = distance * Math.cos(p.elevation);
    camera.position.set(p.x + horizontal * Math.sin(p.azimuth), p.y + distance * Math.sin(p.elevation), p.z + horizontal * Math.cos(p.azimuth));
    camera.lookAt(p.x, p.y, p.z);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    root.dataset.camera = [p.azimuth, p.elevation, p.zoom].map(n => n.toFixed(3)).join(',');
    root.dataset.cameraType = 'perspective';
  }
  const point = T ? new T.Vector3() : null;
  function updatePins(markers, width, height) {
    const key = JSON.stringify([markers, visual.draft, visual.draftStep]);
    if (key !== tagKey) {
      tagKey = key;
      pins.replaceChildren();
      for (const m of markers) {
        const el = document.createElement(m.id ? 'button' : 'span');
        el.textContent = m.text;
        el.className = 'city-pin';
        const pink = visual.draft && visual.draftStep === m.step;
        el.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;pointer-events:${m.id ? 'auto' : 'none'};font:650 11px/1.3 system-ui,sans-serif;color:${pink ? '#773954' : '#214c49'};padding:4px 8px;border:1px solid ${pink ? '#dd94ad' : '#88aca0'};border-radius:5px;background:${pink ? '#ffe3ec' : '#fffffff2'};box-shadow:0 2px 6px #294c4120;`;
        if (m.id) {
          el.type = 'button';
          el.dataset.device = m.id;
          el.setAttribute('aria-label', '查看设备 ' + m.id);
          el.style.cursor = 'pointer';
          el.onclick = () => onPick?.(m.id);
        }
        if (m.kind) {
          el.className = 'city-pin survey-flag';
          el.dataset.surveyFlag = m.kind;
          el.removeAttribute('style');
        }
        const stem = document.createElement('i');
        stem.setAttribute('aria-hidden', 'true');
        stem.style.cssText = 'position:absolute;left:50%;top:100%;width:1px;height:8px;background:#547e72';
        el.append(stem);
        pins.append(el);
      }
    }
    const rects = [];
    root.hotspots = [];
    markers.forEach((m, i) => {
      const el = pins.children[i];
      point.fromArray(m.point).project(camera);
      const x = (point.x * .5 + .5) * width, y = (-point.y * .5 + .5) * height;
      const show = Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1;
      el.style.display = show ? '' : 'none';
      if (!show)
        return;
      const w = el.offsetWidth, h = el.offsetHeight, left = Math.max(3, Math.min(width - w - 3, x - w / 2));
      let top = Math.max(3, y - h - 8);
      for (let n = 0; n < markers.length; n++) {
        const hit = rects.find(r => left < r.x + r.w + 2 && left + w + 2 > r.x && top < r.y + r.h + 1 && top + h + 1 > r.y);
        if (!hit)
          break;
        top = Math.max(1, hit.y - h - 3);
      }
      el.style.transform = `translate(${left.toFixed(1)}px,${top.toFixed(1)}px)`;
      if (m.kind) el.firstElementChild.style.background = 'var(--flag-color)';
      el.firstElementChild.style.height = Math.max(3, y - (top + h)) + 'px';
      el.firstElementChild.style.left = Math.max(1, Math.min(w - 1, x - left)) + 'px';
      rects.push({ x: left, y: top, w, h });
      if (m.id)
        root.hotspots.push({ id: m.id, x, y });
    });
  }
  function showMonitor(time, width, height, dpr) {
    if (!monitorCanvas || !monitorCtx || !monitorCanvas.isConnected || time - lastMonitor < 110)
      return;
    lastMonitor = time;
    const w = Math.min(width, 480), h = Math.min(height, Math.round(w * 9 / 16));
    if (!w || !h)
      return;
    const p = city.cameraPose();
    monitor.position.fromArray(p.eye);
    monitor.lookAt(...p.target);
    monitor.aspect = w / h;
    monitor.updateProjectionMatrix();
    renderer.setViewport(0, 0, w, h);
    renderer.setScissor(0, 0, w, h);
    renderer.setScissorTest(true);
    renderer.setClearColor('#bbdff1', 1);
    city.monitorTraffic(true);
    renderer.render(scene, monitor);
    city.monitorTraffic(false);
    if (monitorCanvas.width !== 480 || monitorCanvas.height !== 270) {
      monitorCanvas.width = 480;
      monitorCanvas.height = 270;
    }
    monitorCtx.drawImage(canvas, 0, canvas.height - Math.round(h * dpr), Math.round(w * dpr), Math.round(h * dpr), 0, 0, 480, 270);
    renderer.setScissorTest(false);
    renderer.setClearColor(0x000000, 0);
    renderer.setViewport(0, 0, width, height);
  }
  function draw(time) {
    raf = 0;
    if (!renderer || !root.isConnected) {
      last = 0;
      return;
    }
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) {
      last = 0;
      return;
    }
    const dpr = Math.min(1.65, devicePixelRatio || 1);
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
    }
    const dt = last ? Math.min(.1, (time - last) / 1000) : 0;
    last = time;
    const active = preview ? previewPlaying : playing;
    if (preview && active && !drag)
      showcase.azimuth += dt * .036;
    positionCamera(width, height);
    const report = city.update(visual, active ? dt : 0, preview, !!monitorCanvas?.isConnected);
    const sk = report.visible.join(',') + visual.answers?.slice(0, 12).join('|');
    if (sk !== shadowKey) {
      renderer.shadowMap.needsUpdate = true;
      shadowKey = sk;
    }
    ground.visible = report.stage >= 8;
    root.style.background = report.stage >= 8 ? 'linear-gradient(155deg,#bceaff 0%,#92d9f7 54%,#b5e5f8 100%)' : 'linear-gradient(155deg,#f1f7f7,#dcebee)';
    showMonitor(time, width, height, dpr);
    renderer.render(scene, camera);
    const markers = report.markers.filter(({point: [x, , z]}) => !bounds ||
      (x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ));
    if (!preview && visual.stage < 8 && (visual.cadBasemap || visual.stage >= 4) && visual.surveyPoints?.length) {
      for (const {x,z,name,kind} of cityExperiment.surveyRows(visual.surveyPoints)) {
        markers.push({point:[x,cadHeight,z],text:name,kind,step:4});
      }
    }
    if (operation && workMarker?.visible && operation.label) markers.push({
      point: workMarker.position.toArray(), text: operation.label, step: operation.step,
    });
    updatePins(markers, width, height);
    Object.assign(root.dataset, { visualStep: String(visual.stage), layers: report.visible.join(','), vehicles: String(report.count), firstVehiclePosition: report.first, dronePosition: report.dronePosition?.join(',') || '', waterHeight: report.waterHeight.toFixed(2), roadDepth: String(report.depth), markers: markers.map(m => m.text).join(' | ') });
    if (active && (preview || report.animated) || monitorCanvas?.isConnected)
      request();
  }
  function request() { if (!raf)
    raf = requestAnimationFrame(draw); }
  root.querySelectorAll('[data-camera]').forEach(b => b.onclick = () => setCamera(b.dataset.camera));
  control.onclick = () => {
    if (preview)
      previewPlaying = !previewPlaying;
    else
      playing = !playing;
    toolbar();
    request();
  };
  canvas.onpointerdown = e => {
    if (e.button !== 0)
      return;
    drag = { x: e.clientX, y: e.clientY, moved: false };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = e => {
    if (!drag)
      return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) < 2)
      return;
    const p = view();
    p.azimuth -= dx * .007;
    p.elevation = Math.max(.025, Math.min(1.48, p.elevation + dy * .006));
    drag = { x: e.clientX, y: e.clientY, moved: true };
    request();
  };
  canvas.onpointerup = e => {
    if (drag && !drag.moved) {
      const rect = canvas.getBoundingClientRect();
      if (surveyPick) {
        pickCad((e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height);
        drag = null;
        return;
      }
      const hit = root.hotspots?.find(m => Math.hypot(m.x - e.clientX + rect.left, m.y - e.clientY + rect.top) < 14);
      if (hit)
        onPick?.(hit.id);
    }
    drag = null;
  };
  canvas.onpointercancel = () => { drag = null; };
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    setCamera(e.deltaY < 0 ? 'in' : 'out');
  }, { passive: false });
  canvas.onkeydown = e => {
    if (surveyPick) {
      const arrows = {ArrowLeft:[-.04,0],ArrowRight:[.04,0],ArrowUp:[0,-.04],ArrowDown:[0,.04]};
      keyboardTarget ??= [.5,.5];
      if (Object.hasOwn(arrows,e.key)) {
        const [dx,dy] = arrows[e.key];
        keyboardTarget = [Math.min(.99,Math.max(.01,keyboardTarget[0]+dx)),Math.min(.99,Math.max(.01,keyboardTarget[1]+dy))];
        keyboardCursor.style.left = keyboardTarget[0]*100 + '%';
        keyboardCursor.style.top = keyboardTarget[1]*100 + '%';
        keyboardCursor.hidden = false;
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        pickCad(...keyboardTarget);
        e.preventDefault();
        return;
      }
    }
    const p = view();
    switch (e.key) {
      case 'ArrowLeft':
        p.azimuth -= .13;
        break;
      case 'ArrowRight':
        p.azimuth += .13;
        break;
      case 'ArrowUp':
        p.elevation = Math.min(1.48, p.elevation + .1);
        break;
      case 'ArrowDown':
        p.elevation = Math.max(.025, p.elevation - .1);
        break;
      case '+':
      case '=':
        setCamera('in');
        break;
      case '-':
        setCamera('out');
        break;
      default: return;
    }
    e.preventDefault();
    request();
  };
  try {
    init();
  }
  catch (e) {
    console.error('三维场景初始化失败', e);
    const error = root.querySelector('.city-error');
    error.hidden = false;
    error.textContent = '无法打开三维场景，请检查浏览器的图形加速设置。';
  }
  new ResizeObserver(request).observe(root);
  toolbar();
  return { root, update(next, pick, mode = 'training', road = null) {
      const wasPreview = preview;
      preview = mode === 'preview';
      if (preview || next.stage !== visual.stage) setOperation(null);
      const cadFlightChanged = Boolean(visual.cadBasemap && visual.flightSettings) !== Boolean(next.cadBasemap && next.flightSettings);
      visual = next;
      applyScope(next);
      if (!preview && cadFlightChanged) Object.assign(pose,overview());
      enableCadBasemap(!preview && Boolean(next.cadBasemap));
      onPick = pick;
      if (wasPreview !== preview) {
        drag = null;
        last = 0;
        toolbar();
      }
      const requestedPreset = !preview && next.stage === 8 && next.answers?.[7] === 'ortho' ? 'ortho' : !preview && next.stage === 19 && next.answers?.[18] === 'water' ? 'water' : '';
      if (requestedPreset !== preset) {
        preset = requestedPreset;
        if (preset === 'ortho')
          Object.assign(pose, start, { azimuth: 0, elevation: 1.56, x: -5, z: 0 });
        else if (preset === 'water')
          Object.assign(pose, start, { azimuth: .57, elevation: .70, x: 51, y: 1, z: 4, zoom: 2.35 });
        else
          Object.assign(pose, overview());
      }
      if (streetTarget !== road) {
        streetTarget = road;
        if (road)
          setCamera('street');
        else if (pose.street)
          setCamera('home');
      }
      root.dataset.mode = mode;
      root.dataset.draft = String(!!next.draft);
      request();
    },
    setOperation,
    setSurveyPlacement,
    setFlightFootprints,
    attachCamera(target) {
      monitorCanvas = target || null;
      monitorCtx = monitorCanvas?.getContext('2d') || null;
      lastMonitor = -Infinity;
      request();
    } };
};
