/* =========================================================
 * 孪生城市虚拟仿真实验 · 公共模块
 * 状态管理 / 顶栏渲染 / Three.js 城市场景引擎
 * ========================================================= */

/* ---------------- 状态管理 ---------------- */
const DC = {
  KEY: 'dc_state_v2',
  _mem: null,

  defaults() {
    return {
      startedAt: null,
      stage: 0,
      student: { name: '', sid: '', cls: '' },
      scene: { buildings: [], sensors: [], links: [], done: false },
      fusion: { sources: [], window: 5, align: 'nearest', minQuality: 60, done: false, results: null },
      situation: { fire: null, traffic: null, flood: null, done: false },
      evidence: []
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) return Object.assign(this.defaults(), JSON.parse(raw));
    } catch (e) {}
    return this._mem || this.defaults();
  },

  save(s) {
    this._mem = s;
    try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch (e) {}
  },

  reset() {
    this._mem = this.defaults();
    try { localStorage.removeItem(this.KEY); } catch (e) {}
  },

  addEvidence(stage, action, detail) {
    const s = this.load();
    s.evidence.push({
      t: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      stage, action, detail
    });
    this.save(s);
  },

  toast(msg, type) {
    let el = document.getElementById('dc-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dc-toast';
      el.className = 'dc-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'dc-toast show ' + (type || '');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'dc-toast'; }, 2400);
  },

  go(page) { location.href = page; }
};

/* ---------------- 顶栏渲染 ---------------- */
const STAGES = [
  { n: 1, name: '场景建模', page: 'scene.html' },
  { n: 2, name: '数据融合', page: 'fusion.html' },
  { n: 3, name: '态势感知', page: 'situation.html' },
  { n: 4, name: '实验报告', page: 'report.html' }
];

function renderHeader(activeStage) {
  const s = DC.load();
  const done = {
    1: s.scene.done, 2: s.fusion.done, 3: s.situation.done, 4: s.situation.done
  };
  const steps = STAGES.map((st, i) => {
    const cls = ['step-item'];
    if (st.n === activeStage) cls.push('active');
    else if (done[st.n]) cls.push('done');
    const sep = i > 0 ? '<div class="step-sep"></div>' : '';
    return sep + `<div class="${cls.join(' ')}">
      <span class="num">${done[st.n] && st.n !== activeStage ? '✓' : st.n}</span>${st.name}
    </div>`;
  }).join('');

  const host = document.getElementById('header-host');
  if (!host) return;
  host.innerHTML = `
    <header class="topbar">
      <div class="tb-left">
        <div class="logo">◆</div>
        <div style="min-width:0">
          <div class="tb-title">孪生城市多源数据融合与智能态势感知虚拟仿真实验</div>
          <div class="tb-sub">Digital Twin City · Fusion & Situation Awareness</div>
        </div>
      </div>
      <div class="tb-steps">${steps}</div>
    </header>`;
}

/* ---------------- Three.js 城市引擎 ---------------- */
function createDigitalCity(container, options) {
  options = options || {};
  const mode = options.mode || 'city';      // 'city' | 'build'
  const W = container.clientWidth || 800;
  const H = container.clientHeight || 600;

  if (typeof THREE === 'undefined') {
    container.innerHTML = '<div style="display:grid;place-items:center;height:100%;color:#ff4d6d;font-family:monospace;padding:40px;text-align:center">' +
      '⚠ Three.js 资源加载失败<br><span style="font-size:12px;color:#7a94ad">请检查网络连接后刷新页面</span></div>';
    return null;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040910);
  scene.fog = new THREE.FogExp2(0x040910, 0.0055);

  const camera = new THREE.PerspectiveCamera(48, W / H, 0.5, 4000);
  camera.position.set(0, 105, 145);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 40;
  controls.maxDistance = 340;
  controls.maxPolarAngle = Math.PI / 2.12;
  controls.target.set(0, 6, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.28;

  /* --- 灯光 --- */
  scene.add(new THREE.AmbientLight(0x1b3350, 1.7));
  const keyLight = new THREE.DirectionalLight(0x9fdcff, 1.15);
  keyLight.position.set(90, 160, 70);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x2b6cff, 0.65);
  rimLight.position.set(-120, 70, -90);
  scene.add(rimLight);
  const pl1 = new THREE.PointLight(0x00d4ff, 2.4, 480);
  pl1.position.set(-100, 30, 100); scene.add(pl1);
  const pl2 = new THREE.PointLight(0xff3b6b, 1.1, 420);
  pl2.position.set(130, 26, -80); scene.add(pl2);
  const pl3 = new THREE.PointLight(0x8b5cf6, 1.2, 420);
  pl3.position.set(0, 40, -160); scene.add(pl3);

  /* --- 地面 --- */
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x061424, roughness: 0.88, metalness: 0.35 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new THREE.GridHelper(900, 90, 0x0d4a68, 0x082432);
  grid.position.y = 0.06;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);

  /* --- 道路 --- */
  const roadGroup = new THREE.Group();
  scene.add(roadGroup);

  const roadData = [
    { id: 'EW-01', x: 0, z: 0, w: 22, d: 900, rot: 0 },
    { id: 'NS-01', x: 0, z: 0, w: 22, d: 900, rot: Math.PI / 2 },
    { id: 'EW-02', x: 0, z: 80, w: 14, d: 760, rot: 0 },
    { id: 'NS-02', x: -80, z: 0, w: 14, d: 760, rot: Math.PI / 2 }
  ];

  const roadMeshes = {};
  roadData.forEach(r => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a2233, roughness: 0.7, metalness: 0.5,
      emissive: 0x00d4ff, emissiveIntensity: 0.04
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = r.rot;
    m.position.set(r.x, 0.15, r.z);
    m.userData = { type: 'road', id: r.id, baseColor: 0x0a2233 };
    roadGroup.add(m);
    roadMeshes[r.id] = m;

    /* 道路中线（虚线） */
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x00d4ff, dashSize: 5, gapSize: 5, transparent: true, opacity: 0.55
    });
    const pts = [];
    const half = r.d / 2;
    if (r.rot === 0) {
      pts.push(new THREE.Vector3(-half, 0.2, r.z), new THREE.Vector3(half, 0.2, r.z));
    } else {
      pts.push(new THREE.Vector3(r.x, 0.2, -half), new THREE.Vector3(r.x, 0.2, half));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, lineMat);
    line.computeLineDistances();
    roadGroup.add(line);
  });

  /* --- 建筑生成 --- */
  const buildingGroup = new THREE.Group();
  scene.add(buildingGroup);
  const buildingMeshes = {};
  let buildingIdx = 0;

  const gridPos = [];
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      if (i === 0 || j === 0) continue;
      gridPos.push([i * 42, j * 42]);
    }
  }
  /* 打乱固定顺序（可复现） */
  const seed = [7, 3, 11, 5, 13, 2, 17, 9, 1, 19, 6, 15, 4, 21, 8, 23, 10, 25, 12, 27];
  gridPos.sort((a, b) => (seed[(a[0] + 200) % seed.length] || 0) - (seed[(b[0] + 200) % seed.length] || 0));

  function makeBuilding(x, z, opts) {
    opts = opts || {};
    const w = opts.w || (10 + Math.random() * 10);
    const d = opts.d || (10 + Math.random() * 10);
    const h = opts.h || (12 + Math.random() * 46);
    const color = opts.color || 0x00a8d6;

    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0b1c2e, emissive: color, emissiveIntensity: 0.08,
      roughness: 0.45, metalness: 0.7
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;

    /* 发光轮廓 */
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({
      color: color, transparent: true, opacity: 0.85
    });
    const line = new THREE.LineSegments(edges, lineMat);
    mesh.add(line);

    /* 顶部发光小方块 */
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.6, 2),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 })
    );
    cap.position.y = h / 2 + 0.5;
    mesh.add(cap);

    mesh.userData = {
      type: 'building',
      id: opts.id || ('BLD-' + String(++buildingIdx).padStart(2, '0')),
      baseColor: color,
      baseEmissive: 0.08,
      h
    };
    buildingGroup.add(mesh);
    buildingMeshes[mesh.userData.id] = mesh;
    return mesh;
  }

  /* 城市模式：铺满建筑；建模模式：只留候选地块 */
  const plots = [];
  if (mode === 'city') {
    gridPos.forEach((p, idx) => {
      if (idx > 34) return;
      makeBuilding(p[0], p[1], {});
    });
  } else {
    /* 建模模式：预置已有个位数建筑 + 8 个候选地块 */
    const preset = gridPos.slice(0, 3);
    preset.forEach((p, i) => {
      makeBuilding(p[0], p[1], { id: 'BLD-' + String(i + 1).padStart(2, '0') });
    });
    const candidate = gridPos.slice(3, 11);
    candidate.forEach((p, i) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(6.5, 8, 48),
        new THREE.MeshBasicMaterial({
          color: 0x00d4ff, side: THREE.DoubleSide,
          transparent: true, opacity: 0.55
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p[0], 0.35, p[1]);
      ring.userData = { type: 'plot', plotId: 'PLOT-' + (i + 1), x: p[0], z: p[1], used: false };
      scene.add(ring);
      plots.push(ring);

      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.9, 16),
        new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.9 })
      );
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(p[0], 0.4, p[1]);
      scene.add(dot);
    });
  }

  /* --- 数据流粒子 --- */
  const flowGroup = new THREE.Group();
  scene.add(flowGroup);
  const flowParticles = [];
  const FLOW_COUNT = 90;
  const flowGeo = new THREE.SphereGeometry(0.7, 8, 8);
  for (let i = 0; i < FLOW_COUNT; i++) {
    const isEW = Math.random() > 0.5;
    const mat = new THREE.MeshBasicMaterial({
      color: isEW ? 0x00d4ff : 0x00ffa3,
      transparent: true, opacity: 0.85
    });
    const m = new THREE.Mesh(flowGeo, mat);
    const lane = [-4, -1.5, 1.5, 4][Math.floor(Math.random() * 4)];
    if (isEW) {
      m.position.set(-380 + Math.random() * 760, 1.2, lane + (Math.random() > 0.5 ? 0 : 0));
    } else {
      m.position.set(lane, 1.2, -380 + Math.random() * 760);
    }
    m.userData = { isEW, speed: 0.3 + Math.random() * 0.9 };
    flowGroup.add(m);
    flowParticles.push(m);
  }

  /* --- 扫描环 --- */
  const scanRing = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 1.2, 64),
    new THREE.MeshBasicMaterial({
      color: 0x00d4ff, side: THREE.DoubleSide, transparent: true, opacity: 0.35
    })
  );
  scanRing.rotation.x = -Math.PI / 2;
  scanRing.position.y = 0.5;
  scene.add(scanRing);
  let scanT = 0;

  /* --- 渲染循环 --- */
  const clock = new THREE.Clock();
  let rafId = 0;
  function animate() {
    rafId = requestAnimationFrame(animate);
    const dt = clock.getDelta();

    /* 粒子流动 */
    flowParticles.forEach(p => {
      if (p.userData.isEW) {
        p.position.x += p.userData.speed * 2.4;
        if (p.position.x > 380) p.position.x = -380;
      } else {
        p.position.z += p.userData.speed * 2.4;
        if (p.position.z > 380) p.position.z = -380;
      }
    });

    /* 扫描环 */
    scanT += dt * 0.45;
    const r = 10 + (scanT % 1) * 320;
    scanRing.scale.set(r, r, r);
    scanRing.material.opacity = 0.3 * (1 - (scanT % 1));

    /* 地块脉动 */
    plots.forEach((p, i) => {
      const k = 1 + Math.sin(performance.now() * 0.003 + i) * 0.08;
      p.scale.set(k, k, 1);
    });

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  /* --- 尺寸自适应 --- */
  function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);
  setTimeout(onResize, 50);
  setTimeout(onResize, 300);

  /* --- 公开 API --- */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  return {
    scene, camera, renderer, controls, plots, roadMeshes, buildingMeshes,

    setAutoRotate(v) { controls.autoRotate = v; },

    setRoadState(id, color, intensity) {
      const m = roadMeshes[id];
      if (!m) return;
      if (color === null) {
        m.material.emissive.setHex(0x00d4ff);
        m.material.emissiveIntensity = 0.04;
        m.material.color.setHex(0x0a2233);
      } else {
        m.material.emissive.setHex(color);
        m.material.emissiveIntensity = intensity || 0.9;
        m.material.color.setHex(color);
        m.material.color.multiplyScalar(0.25);
      }
    },

    setBuildingState(id, color, intensity) {
      const m = buildingMeshes[id];
      if (!m) return;
      if (color === null) {
        m.material.emissive.setHex(m.userData.baseColor);
        m.material.emissiveIntensity = m.userData.baseEmissive;
      } else {
        m.material.emissive.setHex(color);
        m.material.emissiveIntensity = intensity || 1.2;
      }
    },

    addBuildingAt(plotId, spec) {
      const plot = plots.find(p => p.userData.plotId === plotId);
      if (!plot || plot.userData.used) return null;
      plot.userData.used = true;
      plot.visible = false;
      const b = makeBuilding(plot.userData.x, plot.userData.z, spec);
      return b.userData;
    },

    addSensorAt(plotId, spec) {
      const plot = plots.find(p => p.userData.plotId === plotId);
      if (!plot || plot.userData.used) return null;
      plot.userData.used = true;
      plot.visible = false;

      const g = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.5, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x1a3a52, metalness: 0.8, roughness: 0.3 })
      );
      pole.position.y = 6;
      g.add(pole);

      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x00ffa3, transparent: true, opacity: 0.9 })
      );
      orb.position.y = 12.5;
      g.add(orb);

      const halo = new THREE.Mesh(
        new THREE.RingGeometry(2, 3.2, 32),
        new THREE.MeshBasicMaterial({
          color: 0x00ffa3, side: THREE.DoubleSide,
          transparent: true, opacity: 0.5
        })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.6;
      g.add(halo);

      g.position.set(plot.userData.x, 0, plot.userData.z);
      g.userData = {
        type: 'sensor',
        id: spec.id || ('SEN-' + plotId),
        x: plot.userData.x, z: plot.userData.z
      };
      scene.add(g);
      return g.userData;
    },

    addLink(a, b) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, 3, a.z),
        new THREE.Vector3(b.x, 3, b.z)
      ]);
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
        color: 0x8b5cf6, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.8
      }));
      line.computeLineDistances();
      scene.add(line);
      return line;
    },

    pick(clientX, clientY, targetObjects) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const objs = targetObjects || plots;
      return raycaster.intersectObjects(objs, true);
    },

    flyTo(x, y, z, tx, ty, tz) {
      controls.target.set(tx || 0, ty || 6, tz || 0);
      camera.position.set(x, y, z);
    },

    destroy() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      container.innerHTML = '';
    }
  };
}

/* 颜色常量 */
const C = {
  cyan: 0x00d4ff, green: 0x00ffa3, red: 0xff4d6d,
  amber: 0xffb800, violet: 0x8b5cf6, blue: 0x2b6cff
};