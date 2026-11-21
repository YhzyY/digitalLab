'use strict';

globalThis.createCityView = function createCityView() {
  const root = document.createElement('div');
  root.className = 'interactive-city';
  root.innerHTML = `<canvas class="city-gl" tabindex="0" aria-label="三维城市。拖动旋转，滚轮缩放。方向键调整视角，加减键缩放。"></canvas>
    <canvas class="city-overlay" aria-hidden="true"></canvas>
    <div class="city-tools" aria-label="场景视角">
      <button data-camera="home" type="button" aria-label="重置视角">全景</button>
      <button data-camera="street" type="button" aria-label="街道视角">街道</button>
      <button data-camera="in" type="button" title="放大" aria-label="放大">＋</button>
      <button data-camera="out" type="button" title="缩小" aria-label="缩小">−</button>
    </div><div class="simulation-tools"><button type="button" id="simulation-control">暂停仿真</button>
      <span class="map-tip">拖动旋转 · 滚轮缩放</span></div>
      <div class="city-error" role="alert" hidden></div>`;
  const canvas = root.querySelector('.city-gl');
  const overlay = root.querySelector('.city-overlay');
  const context = overlay.getContext('2d');
  const error = root.querySelector('.city-error');
  const control = root.querySelector('#simulation-control');
  const initialPose = { azimuth: .57, elevation: .57, zoom: 1, street: false };
  const initialPreviewPose = { ...initialPose, elevation: .69 };
  const streetViews = {
    a: { azimuth: 1.49, focusX: -36, focusZ: 0 },
    b: { azimuth: Math.PI - .08, focusX: 0, focusZ: -53 },
  };
  const pose = { ...initialPose };
  const previewPose = { ...initialPreviewPose };
  let visual = { layers: [], lines: [], markers: [] };
  let onPick;
  let drag;
  let frame = 0;
  let previousFrame = 0;
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previewPlaying = playing;
  let preview = false;
  let streetTarget = null;
  let renderer, scene, camera, grid, worldLines, simulation, cityContext;
  const layers = new Map();
  const visibleLayers = new Map();
  let previousLines = '';

  function showError(message) {
    error.hidden = false;
    error.textContent = message;
  }

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#a9c4d3');
    scene.fog = new THREE.Fog('#a9c4d3', 260, 910);
    camera = new THREE.PerspectiveCamera(42, 1, .6, 1600);
    const ambient = new THREE.HemisphereLight('#f1f5ff', '#8d8b7d', 1.2);
    const sunlight = new THREE.DirectionalLight('#fff1d6', 2.05);
    sunlight.position.set(-235, 245, 130);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1536, 1536);
    Object.assign(sunlight.shadow.camera, { left: -310, right: 310, top: 275, bottom: -275, near: 2, far: 670 });
    sunlight.shadow.normalBias = .3;
    scene.add(ambient, sunlight);
    grid = new THREE.GridHelper(400, 16, '#708c7d', '#a8bdb1');
    grid.position.y = -.05;
    scene.add(grid);
    layers.set('grid', grid);
    worldLines = new THREE.Group();
    scene.add(worldLines);
    simulation = createCitySimulation(scene);
    cityContext = createContext();
  }

  function createContext() {
    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: `varying vec3 direction;
        void main() { direction=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec3 direction;
        void main() {
          vec3 ray=normalize(direction);
          float height=max(0.,ray.y);
          vec3 tint=mix(vec3(.70,.81,.86),vec3(.30,.58,.77),smoothstep(0.,.70,height));
          float horizon=1.-smoothstep(.0,.14,height);
          gl_FragColor=vec4(mix(tint,vec3(.87,.89,.86),horizon*.32),1.);
        }`,
    }));
    sky.renderOrder = -2;
    group.add(sky);
    const pavement = new THREE.MeshLambertMaterial({ color: '#79806c' });
    const pavementGeometry = new THREE.PlaneGeometry(2450, 2450);
    pavementGeometry.rotateX(-Math.PI / 2);
    const surface = new THREE.Mesh(pavementGeometry, pavement);
    surface.position.y = -.17;
    surface.receiveShadow = true;
    group.add(surface);
    const road = new THREE.MeshLambertMaterial({ color: '#535b5c' });
    const strips = [[380, 0, 348, 20], [-380, 0, 348, 20], [0, 335, 18, 314], [0, -335, 18, 314]];
    for (const [x, z, width, depth] of strips) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), road);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, .014, z);
      group.add(strip);
    }
    return group;
  }

  async function loadModel() {
    if (typeof globalThis.CITY_MODEL !== 'string') {
      await new Promise((resolve, reject) => {
        const source = document.createElement('script');
        source.src = 'assets/city-model.js';
        source.onload = resolve;
        source.onerror = reject;
        document.head.append(source);
      });
    }
    const source = Uint8Array.from(atob(globalThis.CITY_MODEL), symbol => symbol.charCodeAt(0));
    const header = new DataView(source.buffer);
    const size = header.getUint32(12, true);
    const data = JSON.parse(new TextDecoder().decode(source.subarray(20, 20 + size)));
    const binary = 28 + size;
    function bytes(index) {
      const view = data.bufferViews[index];
      return new Uint8Array(source.buffer, binary + (view.byteOffset || 0), view.byteLength);
    }
    function attribute(index) {
      const accessor = data.accessors[index];
      const block = bytes(accessor.bufferView);
      const Type = accessor.componentType === 5126 ? Float32Array : Uint32Array;
      return new Type(block.buffer, block.byteOffset, block.byteLength / 4);
    }
    const textures = await Promise.all(data.images.map(async image => {
      const bitmap = await createImageBitmap(new Blob([bytes(image.bufferView)], { type: image.mimeType }));
      const texture = new THREE.Texture(bitmap);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate = true;
      return texture;
    }));
    const materials = data.materials.map(({ pbrMetallicRoughness: material }) => new THREE.MeshLambertMaterial({
      map: textures[material.baseColorTexture?.index] || null,
      color: material.baseColorFactor
        ? new THREE.Color(...material.baseColorFactor.slice(0, 3)).convertSRGBToLinear()
        : 0xffffff,
      side: THREE.DoubleSide,
    }));
    for (const primitive of data.meshes[0].primitives) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(attribute(primitive.attributes.POSITION), 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(attribute(primitive.attributes.NORMAL), 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(attribute(primitive.attributes.TEXCOORD_0), 2));
      geometry.setIndex(new THREE.BufferAttribute(attribute(primitive.indices), 1));
      const layer = primitive.extras.layer;
      if (!layers.has(layer)) {
        const group = new THREE.Group();
        scene.add(group);
        layers.set(layer, group);
      }
      const mesh = new THREE.Mesh(geometry, materials[primitive.material]);
      mesh.castShadow = layer === 'buildings' || layer === 'greenery';
      mesh.receiveShadow = true;
      layers.get(layer).add(mesh);
    }
    root.dataset.modelReady = 'true';
    requestDraw();
  }

  function updateLines() {
    const signature = JSON.stringify(visual.lines);
    if (signature === previousLines) return;
    previousLines = signature;
    for (const object of [...worldLines.children]) {
      object.geometry.dispose();
      object.material.dispose();
      worldLines.remove(object);
    }
    for (const line of visual.lines) {
      const points = line.points.map(point => new THREE.Vector3(...point));
      const color = new THREE.Color(line.color.slice(0, 7));
      let shape;
      if (line.width >= 4 && !line.dashed) {
        const path = new THREE.CatmullRomCurve3(points);
        const geometry = new THREE.TubeGeometry(path, Math.max(3, points.length * 3), line.width * .12, 5, false);
        shape = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .58 }));
      } else {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = line.dashed
          ? new THREE.LineDashedMaterial({ color, dashSize: 2.4, gapSize: 2, transparent: true, opacity: .76 })
          : new THREE.LineBasicMaterial({ color });
        shape = new THREE.Line(geometry, material).computeLineDistances();
      }
      worldLines.add(shape);
    }
  }

  function applyLayers(delta) {
    let moving = false;
    for (const [name, group] of layers) {
      const shouldShow = visual.layers.includes(name);
      if (!shouldShow) {
        if (group.visible) renderer.shadowMap.needsUpdate = true;
        group.visible = false;
        visibleLayers.delete(name);
        continue;
      }
      const previous = visibleLayers.get(name) || 0;
      const progress = playing && !preview ? Math.min(1, previous + delta * (name === 'buildings' ? 1.45 : 2.75)) : 1;
      visibleLayers.set(name, progress);
      group.visible = true;
      const eased = 1 - (1 - progress) ** 3;
      if (name === 'buildings') group.scale.y = Math.max(.015, eased);
      if (name.startsWith('roads')) group.scale.set(.67 + .33 * eased, 1, .67 + .33 * eased);
      if (name === 'land') group.position.y = -8 * (1 - eased);
      if (progress !== previous) renderer.shadowMap.needsUpdate = true;
      moving ||= progress < 1;
    }
    return moving;
  }

  function draw(time) {
    frame = 0;
    if (!root.isConnected || !renderer) { previousFrame = 0; return; }
    const gap = previousFrame ? (time - previousFrame) / 1000 : .016;
    const delta = gap > .25 ? .016 : Math.min(.05, gap);
    previousFrame = time;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(1.5, devicePixelRatio || 1);
    const expectedWidth = Math.floor(width * ratio), expectedHeight = Math.floor(height * ratio);
    if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      overlay.width = expectedWidth;
      overlay.height = expectedHeight;
    }
    const previewAnimating = preview && previewPlaying && root.dataset.modelReady === 'true';
    if (previewAnimating && !drag) previewPose.azimuth += delta * .17;
    const view = preview ? previewPose : pose;
    const distance = (view.street ? 95 : (preview ? 720 : 640) * Math.max(1, 1.3 * height / width)) / view.zoom;
    const flat = Math.cos(view.elevation);
    const focusX = view.street ? view.focusX : 0;
    const focusY = view.street ? 5 : 12;
    const focusZ = view.street ? view.focusZ : 0;
    camera.position.set(focusX - Math.sin(view.azimuth) * flat * distance,
      focusY + Math.sin(view.elevation) * distance, focusZ + Math.cos(view.azimuth) * flat * distance);
    camera.lookAt(focusX, focusY, focusZ);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    scene.fog.near = preview ? 1100 : view.street ? 220 : Math.max(260, distance * 1.13);
    scene.fog.far = scene.fog.near + (view.street ? 560 : 470);
    updateLines();
    cityContext.visible = !preview && visual.stage >= 4;
    scene.fog.color.copy(scene.background.set(preview ? '#dce5dc' : '#a9c4d3'));
    const constructing = applyLayers(delta);
    const live = simulation.update(visual.simulation, playing ? delta : 0, !playing);
    root.dataset.vehicles = String(live.vehicles);
    root.dataset.firstVehiclePosition = live.firstVehiclePosition || '';
    root.dataset.waterHeight = live.waterHeight.toFixed(2);
    root.dataset.sensorPosition = live.sensorPosition;
    root.dataset.transmitting = String(live.transmitting);
    root.dataset.smoke = String(live.smoke);
    root.dataset.cameraType = 'perspective';
    root.dataset.camera = [view.azimuth, view.elevation, view.zoom].map(value => value.toFixed(3)).join(',');
    renderer.render(scene, camera);
    if (previewAnimating || (!preview && playing && (constructing || live.animated))) requestDraw();

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const point = new THREE.Vector3();
    const screen = ([x, y, z]) => {
      point.set(x, y, z).project(camera);
      return [(point.x + 1) * width / 2, (1 - point.y) * height / 2];
    };
    root.hotspots = [];
    const placed = [];
    for (const marker of visual.markers) {
      const [x, y] = screen(marker.point);
      const offset = marker.offset || 0;
      context.font = '600 12px system-ui, sans-serif';
      const textWidth = context.measureText(marker.text).width + 16;
      if (x < -30 || y < -30 || x > width + 30 || y > height + 30) continue;
      const left = Math.max(5, Math.min(width - textWidth - 5, x - textWidth / 2));
      let top = Math.max(5, y - 32 - offset);
      const overlaps = () => placed.some(rect =>
        left < rect.right + 4 && left + textWidth > rect.left - 4 &&
        top < rect.bottom + 4 && top + 22 > rect.top - 4);
      while (top >= 5 && overlaps()) top -= 26;
      if (top < 5) {
        top = 5;
        while (top + 22 < height && overlaps()) top += 26;
      }
      if (top + 22 > height) continue;
      placed.push({ left, right: left + textWidth, top, bottom: top + 22 });
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(left + textWidth / 2, top + 22);
      context.strokeStyle = marker.color || '#39d299';
      context.lineWidth = 1;
      context.stroke();
      context.beginPath();
      context.roundRect(left, top, textWidth, 22, 5);
      context.fillStyle = '#16382fed';
      context.fill();
      context.fillStyle = '#fffefa';
      context.textAlign = 'center';
      context.fillText(marker.text, left + textWidth / 2, top + 15);
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fillStyle = marker.color || '#39d299';
      context.fill();
      if (marker.id) root.hotspots.push({ id: marker.id, x, y });
    }
  }

  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function adjust(direction) {
    const view = preview ? previewPose : pose;
    if (direction === 'home') Object.assign(view, preview ? initialPreviewPose : initialPose);
    if (direction === 'street' && !preview) {
      Object.assign(view, streetViews[streetTarget || 'a'], { elevation: .10, zoom: 1, street: true });
    }
    if (direction === 'in') view.zoom = Math.min(5.3, view.zoom * 1.18);
    if (direction === 'out') view.zoom = Math.max(.48, view.zoom / 1.18);
    requestDraw();
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) < 2) return;
    drag = { x: event.clientX, y: event.clientY, moved: true };
    const view = preview ? previewPose : pose;
    view.azimuth += dx * .009;
    view.elevation = Math.max(.035, Math.min(1.38, view.elevation + dy * .007));
    adjust();
  });
  canvas.addEventListener('pointerup', event => {
    if (drag && !drag.moved) {
      const box = canvas.getBoundingClientRect();
      const hit = root.hotspots?.find(pin => Math.hypot(pin.x - event.clientX + box.left, pin.y - event.clientY + box.top) < 23);
      if (hit) onPick?.(hit.id);
    }
    drag = undefined;
  });
  canvas.addEventListener('pointercancel', () => { drag = undefined; });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    adjust(event.deltaY < 0 ? 'in' : 'out');
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    const view = preview ? previewPose : pose;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      view.azimuth += event.key === 'ArrowLeft' ? -.14 : .14;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      view.elevation = Math.max(.035, Math.min(1.38, view.elevation + (event.key === 'ArrowUp' ? .11 : -.11)));
    } else if (event.key === '+' || event.key === '=') adjust('in');
    else if (event.key === '-') adjust('out');
    else return;
    event.preventDefault();
    adjust();
  });
  root.querySelectorAll('[data-camera]').forEach(button => {
    button.addEventListener('click', () => adjust(button.dataset.camera));
  });
  function updatePlaybackControl() {
    const active = preview ? previewPlaying : playing;
    control.textContent = preview ? (active ? '暂停预览' : '播放预览') : (active ? '暂停仿真' : '播放仿真');
    control.setAttribute('aria-pressed', String(active));
  }
  updatePlaybackControl();
  control.addEventListener('click', () => {
    if (preview) previewPlaying = !previewPlaying;
    else playing = !playing;
    previousFrame = 0;
    updatePlaybackControl();
    requestDraw();
  });
  new ResizeObserver(requestDraw).observe(root);
  try {
    init();
    loadModel().catch(() => showError('无法加载街区模型。请确认 assets 目录与网页位于同一目录。'));
  } catch {
    showError('无法初始化三维场景。请检查浏览器的图形加速设置。');
  }

  return {
    root,
    update(next, pick, mode = 'training', road = null) {
      if (preview !== (mode === 'preview')) {
        preview = mode === 'preview';
        previousFrame = 0;
        drag = undefined;
        updatePlaybackControl();
      }
      root.dataset.mode = mode;
      visual = next;
      onPick = pick;
      if (road !== streetTarget) {
        streetTarget = road;
        if (road) adjust('street');
      }
      root.dataset.layers = next.layers.join(',');
      root.dataset.visualStep = String(next.stage);
      root.dataset.markers = next.markers.map(marker => marker.text).join(' | ');
      requestDraw();
    },
  };
};
