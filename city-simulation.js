'use strict';
// All measurements are in the same local engineering coordinate system (metres).
// Repeated architectural details, foliage and road furniture share GPU instances.
globalThis.createCitySimulation = function createCitySimulation(scene) {
  const T = THREE;
  const { roadsX, roadsZ, leftBank, rightBank, bankProfile, parcels, lake: parkLake, shoreShape } = citySurveyMap;
  const groups = {}, batches = new Map(), dummy = new T.Object3D();
  const positions = [], pointColors = [], footprints = [];
  const cube = new T.BoxGeometry(1, 1, 1);
  const foliage = new T.IcosahedronGeometry(1, 0);
  const crown = new T.IcosahedronGeometry(1, 1);
  const round = new T.CylinderGeometry(1, 1, 1, 12);
  const cone = new T.ConeGeometry(1, 1, 6);
  const hillRoof = new T.BufferGeometry();
  const roofVertices = [
    [-.5, 0, -.5], [.5, 0, -.5], [.5, 0, .5], [-.5, 0, .5], [-.39, 1, 0], [.39, 1, 0],
  ];
  hillRoof.setAttribute('position', new T.Float32BufferAttribute([0, 4, 5, 0, 5, 1, 1, 5, 2, 2, 5, 4, 2, 4, 3, 3, 4, 0].flatMap(i => roofVertices[i]), 3));
  hillRoof.computeVertexNormals();
  const solid = new T.MeshLambertMaterial({ side: T.DoubleSide, flatShading: true });
  const color = new T.Color();
  let seed = 789002;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function layer(id) {
    if (!groups[id]) {
      groups[id] = new T.Group();
      groups[id].name = id;
      scene.add(groups[id]);
    }
    return groups[id];
  }
  function part(id, geo, tint, x, y, z, w, h, d, ry = 0, rz = 0, rx = 0) {
    const key = id + '|' + geo.uuid;
    if (!batches.has(key))
      batches.set(key, { id, geo, parts: [] });
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz, 'YXZ');
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    batches.get(key).parts.push([dummy.matrix.clone(), tint]);
  }
  const box = (id, tint, x, y, z, w, h, d, ry = 0) => part(id, cube, tint, x, y, z, w, h, d, ry);
  function strip(id, rows, tint) {
    const points = [], idx = [];
    rows.forEach((row, i) => {
      points.push(...row[0], ...row[1]);
      if (i) {
        const n = i * 2;
        idx.push(n - 2, n, n - 1, n - 1, n, n + 1);
      }
    });
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    geometry.setIndex(idx);
    geometry.computeVertexNormals();
    const mat = new T.MeshLambertMaterial({ color: tint, side: T.DoubleSide, flatShading: true });
    const mesh = new T.Mesh(geometry, mat);
    mesh.receiveShadow = true;
    layer(id).add(mesh);
    return mesh;
  }
  function stroke(id, path, width, tint) {
    const rows = path.map(([x, y, z], i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(i + 1, path.length - 1)];
      const l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      const dx = (b[2] - a[2]) / l * width / 2, dz = (a[0] - b[0]) / l * width / 2;
      return [[x + dx, y, z + dz], [x - dx, y, z - dz]];
    });
    return strip(id, rows, tint);
  }
  function outline(id, x, z, w, d, y, tint, width = .55) {
    box(id, tint, x, y, z - d / 2, w, .09, width);
    box(id, tint, x, y, z + d / 2, w, .09, width);
    box(id, tint, x - w / 2, y, z, width, .09, d);
    box(id, tint, x + w / 2, y, z, width, .09, d);
  }
  function tree(x, z, s = 1, flower = false) {
    const y = .56;
    const trunk = 3.1 * s;
    part('landscape', round, '#947457', x, y + trunk / 2, z, .32 * s, trunk, .32 * s);
    const palette = flower ? ['#ed95ae', '#f9b9cc', '#e0879a'] : ['#6caa46', '#8fbb44', '#5d9c42', '#a6c751', '#83aa45', '#538e49'];
    const tint = palette[Math.floor(random() * palette.length)];
    part('landscape', crown, tint, x, y + trunk + 1.25 * s, z, 2.12 * s, (2.5 + random()) * s, 2.04 * s, random() * 6);
    part('landscape', foliage, tint, x + 1.22 * s, y + trunk + .5 * s, z + .27 * s, 1.52 * s, 1.73 * s, 1.6 * s, random() * 6);
    part('landscape', foliage, palette[(Math.floor(random() * palette.length))], x - .98 * s, y + trunk + .6 * s, z - .64 * s, 1.43 * s, 1.87 * s, 1.48 * s, random() * 6);
  }
  const road = '#778592', walk = '#e9ded0', marking = '#fcfbeb', grass = '#9ec870';
  const crest = z => bankProfile(z)[4][1];
  const zSamples = Array.from({ length: 121 }, (_, i) => -120 + i * 2);
  box('terrain', '#b5a890', -82, -2.65, 0, 186, 5, 240);
  box('terrain', '#b5a890', 118, -2.65, 0, 92, 5, 240);
  box('terrain', '#91c16c', -82, -.1, 0, 186, .28, 240);
  box('terrain', grass, 118, -.1, 0, 92, .28, 240);
  function bankStrip(fn, tint) { return strip('terrain', zSamples.map(z => fn(z).map(([x, y]) => [x, y, z])), tint); }
  const bankColors = [grass, '#87af60', '#87bcb0', '#a2b370', '#acd177', '#a3c779'];
  bankColors.forEach((tint, index) => bankStrip(z => bankProfile(z).slice(index, index + 2), tint));
  for (const z of [-120, 120]) {
    const edges = [[10, .04], [leftBank(z) - 3, 1.5], [leftBank(z) + 1, -1.82], [rightBank(z) - 1, -1.82], [rightBank(z) + 3, crest(z)], [72, .19]];
    strip('terrain', edges.map(([x, y]) => [[x, -5, z], [x, y, z]]), '#b5a890');
  }
  stroke('landscape', zSamples.map(z => [leftBank(z) - 5, 1.48, z]), 1.6, '#ede4c9');
  for (let z = -115; z < 118; z += 4.4) {
    if (roadsZ.some(v => Math.abs(v - z) < 10))
      continue;
    tree(leftBank(z) - 7, z, .63 + random() * .3);
    if (Math.abs(z) > 35)
      tree(rightBank(z) + 5, z, .76 + random() * .28);
    if (random() > .35) {
      tree((leftBank(z) - 7) * .57 + 4.5, z + 1.6, .73 + random() * .35);
    }
    for (let j = 0; j < 3; j++) {
      const r = .62 + random() * .52;
      part('landscape', foliage, ['#8cb14a', '#639d41', '#c4c758'][j], leftBank(z) - 3.4 + random() * 1.5, 1.52, z + j * 1.17, r, r * .8, r * 1.3);
    }
  }
  const bridgeY = x => .30 + 2.35 * Math.max(0, Math.min(1, (x - 1) / 19, (71 - x) / 13));
  function bridge(z) {
    const steps = Array.from({ length: 36 }, (_, i) => 1 + i * 2);
    const rows = offset => steps.map(x => [x, bridgeY(x) + offset, z]);
    stroke('roads', rows(-.1), 12.8, '#c0c3be');
    stroke('roads', rows(.025), 10.65, road);
    for (const side of [-1, 1]) {
      stroke('roads', steps.map(x => [x, bridgeY(x) + .15, z + side * 6]), 1.18, walk);
      stroke('roads', steps.map(x => [x, bridgeY(x) + 1.12, z + side * 6.45]), .25, '#f6efe3');
      for (let x = 1; x <= 71; x += 2.8)
        box('roads', '#f5eee4', x, bridgeY(x) + .58, z + side * 6.45, .22, 1.08, .24);
    }
    for (const x of [26, 42, 56])
      for (const dz of [-4.3, 4.3])
        part('roads', round, '#c2c5b8', x, .02, z + dz, .85, 5.1, .85);
  }
  for (const x of roadsX) {
    box('roads', walk, x, .12, 0, 15, .20, 240);
    box('roads', road, x, .25, 0, 10.6, .12, 240);
  }
  for (const z of roadsZ) {
    for (const [lo, hi] of [[-175, 1], [71, 164]]) {
      box('roads', walk, (lo + hi) / 2, .14, z, hi - lo, .24, 14.4);
      box('roads', road, (lo + hi) / 2, .29, z, hi - lo, .10, 10.6);
    }
    bridge(z);
  }
  // Intersections have a continuous asphalt surface and independent pedestrian crossings.
  const lightHeads = [];
  for (const x of roadsX)
    for (const z of roadsZ) {
      box('roads', road, x, .337, z, 11, .03, 14.5);
      for (const side of [-1, 1])
        for (let n = -4; n < 5; n += 1.17) {
          box('roads', marking, x + n, .37, z + side * 8.1, .53, .04, 1.65);
          box('roads', marking, x + side * 8.1, .37, z + n, 1.65, .04, .53);
        }
      for (const side of [-1, 1]) {
        const sx = x + 6.7 * side, sz = z + 6.65 * side;
        part('roads', round, '#677c84', sx, 2.4, sz, .12, 4.5, .12);
        box('roads', '#354955', sx, 4.48, sz, .58, 1.18, .46);
        lightHeads.push({ sx, sz, x, z, horizontal: side > 0 });
      }
    }
  const lamps = new T.InstancedMesh(cube, new T.MeshBasicMaterial(), lightHeads.length);
  lightHeads.forEach(({ sx, sz }, i) => {
    dummy.position.set(sx, 4.52, sz + .26);
    dummy.scale.set(.30, .31, .11);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
    lamps.setColorAt(i, color.set('#77dc9e'));
  });
  layer('signals').add(lamps);
  function greenAxis(x, z, phase) { return (phase + roadsX.indexOf(x) + roadsZ.indexOf(z)) % 2 === 0; }
  let lastSignalPhase = -1;
  function signals(elapsed) {
    const phase = Math.floor(elapsed / 7);
    if (phase === lastSignalPhase)
      return;
    lightHeads.forEach(({ x, z, horizontal }, i) => lamps.setColorAt(i, color.set(greenAxis(x, z, phase) === horizontal ? '#77efa0' : '#ff776b')));
    lamps.instanceColor.needsUpdate = true;
    lastSignalPhase = phase;
  }
  for (const x of roadsX)
    for (let z = -117; z < 120; z += 5.4) {
      if (roadsZ.every(v => Math.abs(v - z) > 10))
        box('roads', '#f2deb0', x, .35, z, .22, .04, 2.3);
    }
  for (const z of roadsZ)
    for (let x = -173; x < 164; x += 5.4) {
      if (roadsX.every(v => Math.abs(v - x) > 10))
        box('roads', '#f2deb0', x, bridgeY(x) + .075, z, 2.2, .035, .22);
    }
  const facade = ['#f1e6cf', '#f3d5b6', '#ede4d7', '#e6d7c4', '#f2dfc8'];
  const trims = ['#d8826a', '#c98f69', '#7b9b9b', '#9daebb', '#d4a26e'];
  const roofs = ['#5688b2', '#6d9abe', '#78a2bf', '#618caf', '#85a8be'];
  const glass = ['#4a667e', '#7999ad', '#4e778c', '#91afbd', '#67879c'];
  let buildings = 0;
  function building(x, z, w, d, floors, turned = false, tower = false) {
    const id = 'buildings', phi = turned ? Math.PI / 2 : 0, c = Math.cos(phi), s = Math.sin(phi);
    const coord = (a, b) => [x + a * c + b * s, z - a * s + b * c];
    const local = (tint, a, y, b, W, H, D, geo = cube) => {
      const [xx, zz] = coord(a, b);
      part(id, geo, tint, xx, y, zz, W, H, D, phi);
    };
    const h = floors * 2.5 + .55, base = .48, tint = facade[buildings % facade.length], accent = trims[buildings % trims.length];
    const roof = roofs[buildings % roofs.length];
    buildings++;
    footprints.push({ x, z, w: turned ? d : w, d: turned ? w : d, h });
    local('#d0c4b5', 0, .42, 0, w + .65, .48, d + .65);
    local(tint, 0, base + h / 2, 0, w, h, d);
    for (const side of [-1, 1]) {
      const cols = Math.max(2, Math.floor(w / 2.65));
      const rows = Math.max(2, Math.floor(d / 2.8));
      for (let f = 0; f < floors; f++) {
        for (let k = 0; k < cols; k++) {
          const px = ((k + .5) / cols - .5) * w, py = base + 1.52 + 2.5 * f;
          local(glass[(k + f + buildings) % 5], px, py, side * (d / 2 + .035), w / cols * .70, 1.43, .10);
          if ((k === 1 || k === cols - 2) && f > 0) {
            local('#f4ebd9', px, py - .45, side * (d / 2 + .34), w / cols * .95, .32, .65);
            local(accent, px, py - .18, side * (d / 2 + .63), w / cols * .95, .29, .10);
          }
        }
        for (let k = 0; k < rows; k++)
          local(glass[(k + f + buildings) % 5], side * (w / 2 + .035), base + 1.52 + 2.5 * f, ((k + .5) / rows - .5) * d, .10, 1.28, d / rows * .57);
      }
      local(accent, -w * .29, base + h / 2, side * (d / 2 + .08), .56, h, .15);
      for (const dx of [-1, 1])
        local('#f5ecd9', dx * (w / 2 - .24), base + h / 2, side * (d / 2 + .09), .37, h, .17);
    }
    for (const side of [-1, 1]) {
      const b = side * (d / 2 + .40);
      local('#a9b7b6', 0, base + 1.0, b, 1.27, 1.95, .15);
      local(accent, 0, base + 2.25, b + side * .45, 3.3, .24, 1.8);
      local('#e9dfc4', 0, .52, b + side * .62, 3.5, .18, 2.2);
    }
    local('#f9f0df', 0, base + h - .1, 0, w + .55, .46, d + .55);
    if (!tower) {
      local('#f3e9d6', 0, base + 2.65, 0, w + .46, .29, d + .46);
      local('#d2e0e1', 0, base + h + 1.98, 0, w * .79, .16, .30);
    }
    local(roof, 0, h + base + .05, 0, w + .7, tower ? .27 : 1.9, d + .75, tower ? cube : hillRoof);
    if (tower) {
      local('#c8d8db', 0, h + base + .64, 0, w * .69, 1.24, d * .7);
      local(roof, 0, h + base + 1.39, 0, w * .74, .28, d * .76);
      local('#a4b5bb', -w * .12, h + base + 2.04, 0, 1.4, 1.3, 1.4);
    }
    else {
      for (let i = -1; i < 2; i++) {
        local('#afc4cc', i * w * .26, h + base + 1.15, d * .14, 1.3, 1.4, 1.9);
        local('#566f84', i * w * .26, h + base + 1.91, d * .14, 1.65, .18, 2.05);
      }
    }
  }
  for (const {i, j, park, x, z, w, d} of parcels) {
    if (park) continue;
    box('landscape', '#dfd8c6', x, .18, z, w, .26, d);
    box('landscape', '#aaca7f', x, .34, z, w - 2, .20, d - 2);
    box('landscape', '#e9dfc8', x, .47, z, w - 4, .075, 1.75);
    box('landscape', '#e9dfc8', x, .47, z, 1.8, .075, d - 4);
    // Courtyard paving, gardens and bays distinguish the surrounding residential blocks.
    if ((i + j) % 2 === 0) {
      box('landscape', '#cad0c2', x - 9, .48, z, 12, .08, 9);
      for (let k = 0; k < 4; k++)
        box('landscape', '#f7f2dc', x - 14 + k * 2.85, .54, z, .18, .04, 7);
      for (let k = 0; k < 3; k++) {
        box('landscape', ['#b7cad8', '#e7b5a0', '#e3e4dd'][k], x - 12.7 + k * 2.85, .92, z, 1.5, .7, 3.2);
        box('landscape', '#7a8d98', x - 12.7 + k * 2.85, 1.35, z, 1.26, .35, 1.68);
      }
    }
    else {
      box('landscape', '#e9d7bb', x + 9, .49, z, 9, .1, 9);
      part('landscape', round, '#6fa166', x + 9, .76, z, 3.35, .5, 3.35);
      tree(x + 9, z, 1.07);
    }
    for (const side of [-1, 1]) {
      const rear = j === 0 && side === -1 && i !== 3;
      if (rear) {
        building(x - 12, z + side * (d / 2 - 9), 9, 10, 11 + i, false, true);
        if (i === 0)
          building(x + 9, z + side * (d / 2 - 9), 10, 10, 13, false, true);
        else
          building(x + 11, z + side * (d / 2 - 9), 20, 9, 5);
      }
      else {
        building(x - 10, z + side * (d / 2 - 8), w * .48, 9.1, 4 + Math.floor(random() * 3));
        building(x + w * .27, z + side * (d / 2 - 8), w * .21, 8.8, 3 + Math.floor(random() * 2));
      }
      building(x + side * (w / 2 - 7), z, Math.max(14, d - 36), 8.8, 4 + Math.floor(random() * 3), true);
      for (let k = -2; k <= 2; k++) {
        tree(x + k * 8.2, z + side * 3.9, .57 + random() * .18, k === 1 && j === 2);
      }
      for (let k = -2; k <= 2; k++) {
        tree(x + side * (w / 2 - 1.8), z + k * d * .18, .62 + random() * .18);
      }
      for (let k = -2; k <= 2; k++) {
        tree(x + k * w * .19, z + side * (d / 2 - 1.5), .77 + random() * .28);
      }
    }
  }
  const px = -48, pz = 0;
  box('landscape', '#b7d785', px, .23, pz, 63, .35, 62);
  box('landscape', '#a1c86a', px, .42, pz, 60, .17, 59);
  function parkLoop(rx, rz, dx = 0, dz = 0) {
    return Array.from({ length: 97 }, (_, i) => {
      const a = i * Math.PI / 48, r = shoreShape(a);
      return [px + dx + rx * r * Math.cos(a), .55, pz + dz + rz * r * Math.sin(a)];
    });
  }
  stroke('landscape', parkLoop(24, 23), 2.7, '#efe1c3');
  stroke('landscape', parkLoop(17.1, 13.0, 2, 1), 1.85, '#f3e8c9');
  for (const a of [0, 1.58, 3.15, 4.7]) {
    const p = [];
    for (let i = 0; i <= 20; i++) {
      const r = 16 + i * .78;
      p.push([px + Math.cos(a + .14 * Math.sin(i * .2)) * r, .56, pz + Math.sin(a + .14 * Math.sin(i * .2)) * r]);
    }
    stroke('landscape', p, 1.85, '#f1e6c9');
  }
  const lake = parkLoop(15.8, 11.8, 2, 1);
  const inner = parkLoop(parkLake.rx, parkLake.rz, parkLake.x - px, parkLake.z - pz);
  strip('landscape', lake.map((p, i) => [p, [...inner[i]]]), '#badb9a');
  strip('landscape', inner.map(p => [[parkLake.x, parkLake.level, parkLake.z], [p[0], parkLake.level, p[2]]]), '#45c6bb');
  for (let k = 0; k < 162; k++) {
    const x = px + (random() - .5) * 58, z = (random() - .5) * 58, rad = Math.hypot((x - px) / 24, z / 23);
    if (rad < .77 || Math.abs(rad - 1) < .13 || Math.abs(x - px) < 1.5 || Math.abs(z) < 1.5)
      continue;
    tree(x, z, .64 + random() * .59, k % 7 === 0);
  }
  for (let i = 0; i < 10; i++) {
    const a = i * .65, x = px + 20.2 * Math.cos(a), z = 18.7 * Math.sin(a);
    for (let j = 0; j < 13; j++) {
      const b = j * .68, r = Math.sqrt(j) * .54;
      part('landscape', foliage, j % 3 === 0 ? '#e9a1b2' : j % 3 === 1 ? '#e3c45b' : '#70a448', x + r * Math.cos(b), .72, z + r * Math.sin(b), .55, .4, .49);
    }
  }
  for (let i = 0; i < 22; i++) {
    const q = inner[(i * 13) % 96];
    part('landscape', foliage, '#ccd6ae', q[0], .65, q[2], .58, .37, .46);
  }
  for (let i = 0; i < 9; i++) {
    const a = i * .71;
    const x = px + 23 * Math.cos(a), z = 23 * Math.sin(a);
    box('landscape', '#aa7650', x, .90, z, 2.4, .29, .64, -a);
    box('landscape', '#aa7650', x, 1.33, z + .24, 2.4, .46, .17, -a);
  }
  // Survey observations occupy the coordinates of the completed site.
  outline('boundary', -5.5, 0, 339, 240, .11, '#279b8b', 1.15);
  for (const f of footprints) {
    outline('documents', f.x, f.z, f.w, f.d, .16, '#a2aaa5', .42);
    for (let i = 0; i < Math.ceil((f.w + f.d) * f.h / 6); i++) {
      const a = random(), b = random();
      let x = f.x + (random() - .5) * f.w, z = f.z + (random() - .5) * f.d, y = .5 + b * f.h;
      if (a < .25)
        x = f.x - f.w / 2;
      else if (a < .5)
        x = f.x + f.w / 2;
      else if (a < .7)
        z = f.z - f.d / 2;
      else if (a < .9)
        z = f.z + f.d / 2;
      else
        y = f.h + .5;
      positions.push(x, y, z);
      color.set(y > f.h ? '#7495b2' : a < .3 ? '#c4b29f' : '#638c84');
      pointColors.push(color.r, color.g, color.b);
    }
  }
  for (const x of roadsX)
    outline('documents', x, 0, 10.6, 240, .14, '#b5bdb9', .6);
  for (const z of roadsZ)
    outline('documents', -5.5, z, 339, 10.6, .14, '#b5bdb9', .6);
  stroke('documents', zSamples.map(z => [leftBank(z), .15, z]), .85, '#51a8b3');
  stroke('documents', zSamples.map(z => [rightBank(z), .15, z]), .85, '#51a8b3');
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(pointColors, 3));
  const cloud = new T.Points(geometry, new T.PointsMaterial({ size: .77, vertexColors: true }));
  layer('cloud').add(cloud);
  for (const [x, z, t] of [[-150, -95, '#399c84'], [-150, 95, '#ec8c52'], [140, -94, '#4398be'], [140, 91, '#399c84'], [-42, 32, '#ec8c52'], [73, 0, '#4398be']]) {
    part('stations', round, t, x, .26, z, 2.2, .4, 2.2);
    box('stations', '#ffeed1', x, .52, z, 3.6, .1, .51);
    box('stations', '#ffeed1', x, .52, z, .51, .1, 3.6);
    part('stations', cone, t, x, 2.05, z, .66, 3, .66);
  }
  const gorigin = [-146, .9, 88];
  for (const [end, tint] of [[[40, .9, 88], '#d67f70'], [[-146, 45, 88], '#438d68'], [[-146, .9, -66], '#4b8dc3']]) {
    const a = new T.Vector3(...gorigin), b = new T.Vector3(...end), delta = b.clone().sub(a);
    layer('axes').add(new T.ArrowHelper(delta.clone().normalize(), a, delta.length(), tint, 4, 2.2));
  }
  layer('flight-grid');
  layer('flight-oblique');
  const routeMaterials = {
    edge: new T.MeshBasicMaterial({color:'#244755',side:T.DoubleSide,toneMapped:false}),
    center: new T.MeshBasicMaterial({color:'#edab43',side:T.DoubleSide,toneMapped:false}),
    transfer: new T.MeshBasicMaterial({color:'#56727a',side:T.DoubleSide,toneMapped:false}),
  };
  let flightKey = '', flightSegments = [], flightLength = 0, flightDistance = 0;
  function layFlight(b, choice, settings) {
    const {height:plannedHeight,side} = cityExperiment.normalizeFlightSettings(settings);
    const key = JSON.stringify([b,choice,plannedHeight,side]);
    if (key === flightKey) return;
    flightKey = key;
    for (const id of ['flight-grid','flight-oblique']) {
      groups[id].children.forEach(line => line.geometry.dispose());
      groups[id].clear();
    }
    const id = 'flight-' + choice;
    const {passes} = cityExperiment.planSurveyFlight(b,choice,settings);
    // Compress displayed altitude so the CAD ground and drone share the same view.
    const height = plannedHeight * .45;
    flightSegments = [];
    flightLength = flightDistance = 0;
    function drawLine(path, width, material) {
      const line = stroke(id,path,width,'#ffffff');
      line.material.dispose();
      line.material = material;
    }
    function segment([x1,z1],[x2,z2], survey) {
      const length = Math.hypot(x2-x1,z2-z1);
      if (length < .05) return;
      const from = new T.Vector3(x1,height,z1), to = new T.Vector3(x2,height,z2);
      flightSegments.push({from,to,length,end:flightLength+=length});
      if (survey) {
        drawLine([from.toArray(),to.toArray()],3,routeMaterials.edge);
        drawLine([[x1,height+.06,z1],[x2,height+.06,z2]],1.1,routeMaterials.center);
      } else {
        for (let start=0; start<length; start+=8) {
          const a = from.clone().lerp(to,start/length);
          const b = from.clone().lerp(to,Math.min(start+4,length)/length);
          drawLine([a.toArray(),b.toArray()],.9,routeMaterials.transfer);
        }
      }
    }
    passes.forEach(([from,to],i) => {
      segment(from,to,true);
      const nextIndex = (i+1)%passes.length;
      const [next] = passes[nextIndex];
      const transferCorner = nextIndex >= 2 ? [to[0],next[1]] : [next[0],to[1]];
      segment(to,transferCorner,false);
      segment(transferCorner,next,false);
    });
  }
  const drone = new T.Group();
  layer('drone').add(drone);
  function mesh(parent, geometry, color, x, y, z, sx, sy, sz) {
    const o = new T.Mesh(geometry, new T.MeshLambertMaterial({ color }));
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    parent.add(o);
    return o;
  }
  drone.scale.setScalar(1.35);
  mesh(drone, cube, '#173449', 0, 0, 0, 4, 1.6, 3.6);
  mesh(drone, cube, '#ff9d10', 0, 1.1, .3, 3.4, .75, 2.75);
  for (const v of [-1, 1]) {
    const arm = mesh(drone, cube, '#173449', 0, .08, 0, 9.4, .65, .78);
    arm.rotation.y = v * Math.PI / 4;
    for (const w of [-1, 1])
      mesh(drone, round, '#be4f16', w * 3.05, .55, w * v * 3.05, 2.7, .32, 2.7);
  }
  function surveyFrame(name, x, z, dir) {
    const tip = [x, 2, z], pts = [[x - 5, 2, z + dir * 9], [x + 5, 2, z + dir * 9], [x + 5, 8, z + dir * 9], [x - 5, 8, z + dir * 9]];
    const path = [];
    for (let i = 0; i < 4; i++) {
      path.push(...tip, ...pts[i], ...pts[i], ...pts[(i + 1) % 4]);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(path, 3));
    layer(name).add(new T.LineSegments(g, new T.LineBasicMaterial({ color: '#2c918a' })));
    part(name, round, '#466979', x, 1.1, z, .42, 2.2, .42);
  }
  for (const i of [-1, 0, 1]) {
    surveyFrame('ground-bank', 65, i * 39 + 9, -1);
    surveyFrame('ground-corner', -88 + i * 78, 52, -1);
  }
  for (const [x, z] of [[-116, -60], [-62, 81], [102, 68]]) {
    box('errors-plane', '#ee9478', x, 3, z, 7, .8, .9);
    box('errors-plane', '#ee9478', x, 3, z, .9, .8, 7);
    part('errors-height', cone, '#e3ac67', x, 20, z, 2.5, 7, 2.5);
    box('errors-height', '#e3ac67', x, 10, z, .47, 17, .47);
  }
  for (const [name, x, z, w, d] of [['codes-transport', -88, 0, 12, 73], ['codes-transport', -48, 39, 70, 11], ['codes-water', 39, 0, 31, 54], ['codes-water', px, 0, 61, 62]])
    outline(name, x, z, w, d, .76, '#4eba9c', .95);
  // The device markers, road associations and optional CCTV share the same positions.
  const deviceCoords = { 'D-01': [-48, .4, 32.6], 'C-01': [-60, .4, 45.65], 'W-01': [rightBank(10) + 3.2, crest(10), 10] };
  function addDevice(id) {
    const g = layer(id);
    const c = id === 'W-01' ? '#4aa6b4' : id === 'C-01' ? '#d88b61' : '#65957d';
    const h = id === 'C-01' ? 7.3 : 4.6;
    mesh(g, round, '#ecdfc7', 0, .22, 0, 1.0, .44, 1);
    mesh(g, round, '#586c75', 0, h / 2, 0, .21, h, .21);
    mesh(g, cube, c, 0, h * .6, 0, 1.22, 1.7, 1);
    if (id === 'C-01') {
      mesh(g, cube, '#546a75', 0, h, 1, .3, .36, 2.25);
      mesh(g, cube, '#f2ede2', 0, h - .22, 2, 1.22, .83, 1.94);
      mesh(g, cube, '#3d5363', 0, h - .22, 1, 1.02, .63, .1);
    }
    else if (id === 'W-01') {
      mesh(g, cube, '#f3e9c6', 0, 1.8, 0, .85, 3.4, .42);
      for (let i = 0; i < 7; i++)
        mesh(g, cube, '#c57162', 0, .4 + i * .43, .24, .65, .15, .12);
    }
    else
      mesh(g, cube, '#f3f4df', 0, h, 0, 1.55, .67, 1.2);
  }
  Object.keys(deviceCoords).forEach(addDevice);
  const routes = { a: { d: [-48, .4, 32.6], c: [-60, .4, 45.65], p: [-48, .41, 39], line: [[-57, .45, 33.85], [-57, .45, 44.15]] }, b: { d: [-81.55, .4, -10], c: [-94.6, .4, -24], p: [-88, .41, -10], line: [[-93.1, .45, -17], [-82.9, .45, -17]] } };
  for (const [name, r] of Object.entries(routes)) {
    stroke('assoc-' + name, [r.d, r.p, r.c], .59, '#49b8a5');
    outline('assoc-' + name, r.p[0], r.p[2], name === 'a' ? 29 : 10, name === 'a' ? 10 : 29, .4, '#48b6aa', .57);
    stroke('line-' + name, r.line, .88, '#f8b24e');
    const o = r.line.map(([x, y, z]) => [x + (name === 'a' ? 4 : 0), y, z + (name === 'b' ? 4 : 0)]);
    stroke('line-extra-' + name, o, .75, '#66cfcd');
  }
  const hub = [-6, 10, 35];
  const packets = Array.from({ length: 12 }, (_, i) => mesh(layer('streams'), foliage, ['#38bda3', '#f1b55f', '#64c2e3'][i % 3], 0, 0, 0, .77, .77, .77));
  const fusion = mesh(layer('fusion'), crown, '#64c4aa', ...hub, 2, 2, 2);
  outline('assembled', -5.5, 0, 339, 240, .48, '#a0c2ac', .47);
  for (const [x, z] of [[-11, 44], [70, 44], [70, -34], [-90, -32]]) {
    box('accessible', '#f1deae', x, .39, z, 2.3, .12, 3.3);
  }
  const river = strip('river', zSamples.map(z => [[leftBank(z), 0, z], [rightBank(z), 0, z]]), '#41bfb7');
  const spill = strip('river', zSamples.map(z => [[rightBank(z) + 3, 0, z], [rightBank(z) + 3, 0, z]]), '#71ccce');
  spill.material = new T.MeshBasicMaterial({ color: '#77d3d1', transparent: true, opacity: .63, depthWrite: false, side: T.DoubleSide });
  const waterGeo = river.geometry;
  const riverColors = [];
  for (let i = 0; i < zSamples.length; i++) {
    for (const c of ['#60cfc2', '#259ead']) {
      color.set(c);
      riverColors.push(color.r, color.g, color.b);
    }
  }
  waterGeo.setAttribute('color', new T.Float32BufferAttribute(riverColors, 3));
  river.material = new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide });
  const ripplePositions = new Float32Array(330 * 6);
  const ripGeo = new T.BufferGeometry();
  ripGeo.setAttribute('position', new T.BufferAttribute(ripplePositions, 3));
  const ripples = new T.LineSegments(ripGeo, new T.LineBasicMaterial({ color: '#a2e2d3', transparent: true, opacity: .64 }));
  layer('river').add(ripples);
  const waveSeeds = Array.from({ length: 330 }, () => [random(), random(), random()]);
  let currentLevel = NaN;
  function waterLevel(level, depth, elapsed) {
    const height = level > 3.1 ? .32 + (level - 3.1) * .57 : .32 + (level - 3.1);
    if (currentLevel !== level + depth * 10) {
      const p = river.geometry.attributes.position;
      zSamples.forEach((z, i) => {
        const L = leftBank(z), R = rightBank(z), c = crest(z);
        const left = L + 1 - (height + 1.8) * 4 / 3.3;
        let right = R - 1 + Math.min(1, (height + 1.8) / (c + 1.8)) * 4;
        const edge = depth > 0 && height > c ? right + (81.6 - right) * Math.min(1, (height - c) / .14) : right;
        const q = spill.geometry.attributes.position;
        q.setXYZ(2 * i, right, height, z);
        q.setXYZ(2 * i + 1, edge, height, z);
        p.setXYZ(i * 2, left, height, z);
        p.setXYZ(i * 2 + 1, right, height, z);
      });
      p.needsUpdate = true;
      spill.geometry.attributes.position.needsUpdate = true;
      spill.geometry.computeBoundingSphere();
      river.geometry.computeBoundingSphere();
      currentLevel = level + depth * 10;
    }
    const p = ripGeo.attributes.position;
    for (let i = 0; i < waveSeeds.length; i++) {
      const [u, v, w] = waveSeeds[i], z = ((v * 240 + elapsed * .55) % 240) - 120, L = leftBank(z) + 3, R = rightBank(z) - 2;
      const x = L + u * (R - L);
      p.setXYZ(i * 2, x, height + .027, z);
      p.setXYZ(i * 2 + 1, x + .20 + w * .63, height + .027, z + .44 + w * .78);
    }
    p.needsUpdate = true;
    return height;
  }
  // Rounded, lane-offset closed routes travel through intersections and around corners.
  function makeRoute(nodes, reverse = false) {
    if (reverse)
      nodes = nodes.slice().reverse();
    const pts = nodes.map(([x, z]) => new T.Vector3(x, 0, z));
    const route = new T.CurvePath(), r = 5.5, lane = 2.55;
    const sides = pts.map((p, i) => {
      const next = pts[(i + 1) % pts.length], dir = next.clone().sub(p).normalize(), off = new T.Vector3(-dir.z * lane, 0, dir.x * lane);
      return { dir, start: p.clone().add(off).addScaledVector(dir, r), end: next.clone().add(off).addScaledVector(dir, -r), off };
    });
    sides.forEach((side, i) => {
      const next = sides[(i + 1) % sides.length], corner = pts[(i + 1) % pts.length].clone().add(side.off).add(next.off);
      route.add(new T.LineCurve3(side.start, side.end));
      route.add(new T.QuadraticBezierCurve3(side.end, corner, next.start));
    });
    const len = route.getLength(), n = Math.ceil(len / .75), samples = [];
    for (let j = 0; j < n; j++)
      samples.push(route.getPoint(j / n));
    return { len, n, samples };
  }
  const circuits = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) {
      const a = roadsX[i], b = roadsX[i + 1], c = roadsZ[j], d = roadsZ[j + 1];
      circuits.push(makeRoute([[a, c], [b, c], [b, d], [a, d]], (i + j) % 2 === 0));
    }
  circuits.push(makeRoute([[-167, -39], [155, -39], [155, 39], [-167, 39]]), makeRoute([[-88, -110], [73, -110], [73, 110], [-88, 110]], true));
  const paints = ['#ec825c', '#64b5c4', '#d2bc7c', '#fff2da', '#4983ab', '#e397a4', '#507481', '#e3e1c7'];
  const cars = [], maxCars = 80;
  for (let i = 0; i < maxCars; i++) {
    const route = circuits[(i * 9) % circuits.length];
    cars.push({ route, distance: random() * route.len, rate: .86 + random() * .22, speed: 0, x: 0, z: 0, dx: 1, dz: 0 });
  }
  const carParts = [[cube, 0, .61, 0, 3.55, .82, 1.58, null], [cube, -.14, 1.15, 0, 1.84, .62, 1.39, '#536a7c'], [cube, -.12, 1.49, 0, 1.36, .085, 1.42, null],
    ...[-1.05, 1.05].flatMap(x => [-.81, .81].map(z => [round, x, .33, z, .34, .20, .34, '#46505a'])),
    ...[-.49, .49].map(z => [cube, 1.79, .67, z, .065, .21, .36, '#fff2c6'])];
  const carMeshes = carParts.map(([geo, ox, oy, oz, w, h, d, tint]) => {
    const m = new T.InstancedMesh(geo, new T.MeshLambertMaterial(), maxCars);
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    for (let i = 0; i < maxCars; i++)
      m.setColorAt(i, color.set(tint || paints[i % paints.length]));
    layer('traffic').add(m);
    return { m, ox, oy, oz, w, h, d, wheel: geo === round };
  });
  function locateCar(car) {
    const r = car.route, t = car.distance * r.n / r.len, k = Math.floor(t), a = r.samples[k], b = r.samples[(k + 1) % r.n];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    car.x = a.x + (b.x - a.x) * (t - k);
    car.z = a.z + (b.z - a.z) * (t - k);
    car.dx = (b.x - a.x) / length;
    car.dz = (b.z - a.z) / length;
  }
  function drive(count, speed, delta) {
    const phase = Math.floor(elapsed / 7);
    for (let i = 0; i < count; i++)
      locateCar(cars[i]);
    for (let i = 0; i < count; i++) {
      const car = cars[i];
      let preferred = speed / 3.6 * car.rate;
      const horizontal = Math.abs(car.dx) > .96, vertical = Math.abs(car.dz) > .96;
      if (horizontal || vertical) {
        const crossRoads = horizontal ? roadsX : roadsZ, sameRoads = horizontal ? roadsZ : roadsX;
        const along = horizontal ? car.x : car.z, across = horizontal ? car.z : car.x, direction = Math.sign(horizontal ? car.dx : car.dz);
        const street = sameRoads.find(v => Math.abs(v - across) < 4.8);
        for (const cross of crossRoads) {
          const distance = (cross - along) * direction - 8;
          if (street === undefined || distance < -.15 || distance > 15)
            continue;
          if (greenAxis(horizontal ? cross : street, horizontal ? street : cross, phase) !== horizontal)
            preferred = Math.min(preferred, Math.max(0, distance) * .95);
        }
      }
      for (let j = 0; j < count; j++) {
        const other = cars[j];
        if (i === j || car.dx * other.dx + car.dz * other.dz < .86)
          continue;
        const dx = other.x - car.x, dz = other.z - car.z, along = dx * car.dx + dz * car.dz, lateral = Math.abs(dx * car.dz - dz * car.dx);
        if (along > 0 && along < 14 && lateral < 1.3)
          preferred = Math.min(preferred, Math.max(0, (along - 4.15) * 1.12));
      }
      car.speed += (preferred - car.speed) * Math.min(1, delta * (preferred < car.speed ? 5 : 1.35));
      car.distance = (car.distance + car.speed * delta) % car.route.len;
    }
    let first = '';
    for (let i = 0; i < count; i++) {
      const car = cars[i];
      locateCar(car);
      const x = car.x, z = car.z, yaw = -Math.atan2(car.dz, car.dx), cs = Math.cos(yaw), sn = Math.sin(yaw);
      const y = roadsZ.some(v => Math.abs(z - v) < 7) ? bridgeY(x) + .05 : .35;
      for (const { m, ox, oy, oz, w, h, d, wheel } of carMeshes) {
        dummy.position.set(x + ox * cs + oz * sn, y + oy, z - ox * sn + oz * cs);
        dummy.rotation.set(wheel ? Math.PI / 2 : 0, yaw, 0, 'YXZ');
        dummy.scale.set(w, h, d);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      }
      if (!i)
        first = [x, z].map(v => v.toFixed(3)).join(',');
    }
    for (const { m } of carMeshes) {
      m.count = count;
      m.instanceMatrix.needsUpdate = true;
    }
    return first;
  }
  for (const { id, geo, parts } of batches.values()) {
    const m = new T.InstancedMesh(geo, solid, parts.length);
    parts.forEach(([matrix, tint], i) => {
      m.setMatrixAt(i, matrix);
      m.setColorAt(i, color.set(tint));
    });
    m.castShadow = id === 'buildings' || id === 'landscape';
    m.receiveShadow = true;
    layer(id).add(m);
  }
  batches.clear();
  const bars = [0, 1].map(i => mesh(layer('aligned'), cube, i ? '#d6ab71' : '#62bba8', 0, 0, 0, 1.6, 1, 1.6));
  const states = mesh(layer('state'), round, '#7bc5a5', 0, 1, 0, 3.2, .24, 3.2);
  const status = mesh(layer('status'), round, '#eaa565', 73, .56, 3, 1.8, .20, 1.8);
  const receipt = mesh(layer('receipt'), cube, '#57a78f', 0, 0, 0, 1.8, 4.6, 1.8);
  stroke('history', zSamples.map(z => [rightBank(z) + 5, .33, z]), 1.1, '#60b6c0');
  const draftMaterials = new WeakMap();
  function highlight(group, enabled) {
    if (group.userData.highlight === enabled)
      return;
    group.userData.highlight = enabled;
    group.traverse(o => {
      if (!o.material || Array.isArray(o.material))
        return;
      if (!o.userData.standardMaterial)
        o.userData.standardMaterial = o.material;
      const orig = o.userData.standardMaterial;
      if (!enabled) {
        o.material = orig;
        return;
      }
      let tint = draftMaterials.get(orig);
      if (!tint) {
        tint = orig.clone();
        tint.color?.set('#ffb4cc');
        if (tint.emissive)
          tint.emissive.set('#a34e6c').multiplyScalar(.32);
        tint.onBeforeCompile = shader => { shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n#if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )\n vColor.rgb = mix(vec3(1.), vColor.rgb, .13);\n#endif'); };
        draftMaterials.set(orig, tint);
      }
      o.material = tint;
    });
  }
  const project = (point, text, id, step) => ({ point, text, id, step });
  let elapsed = 0, active = {}, markers = [], record = {}, key = '', currentRoute = 'a';
  function configure(v, preview) {
    const stage = preview ? 21 : v.stage || 0, a = v.answers || [], r = routes[v.route || 'a'], route = v.route || 'a';
    currentRoute = route;
    const map = globalThis.citySurveyMap;
    const b = preview ? map.extent : map.valid(v.bounds) ? v.bounds : map.presets[a[0]] || map.extent;
    const sx = (b.maxX - b.minX) / 339, sz = (b.maxZ - b.minZ) / 240;
    const ox = b.minX + 175 * sx, oz = b.minZ + 120 * sz;
    // Flight plans and planned control points are laid out within the survey.
    for (const id of ['errors-plane', 'errors-height']) {
      groups[id].scale.set(sx, 1, sz);
      groups[id].position.set(ox, 0, oz);
    }
    const on = (id, step) => { active[id] = step; };
    active = {};
    markers = [];
    const mark = (point, text, id, step) => markers.push(project(point, text, id, step));
    if (stage >= 1 && stage < 8) {
      on('boundary', 1);
      const sx = (b.maxX - b.minX - 1.5) / 339, sz = (b.maxZ - b.minZ - 1.5) / 240;
      groups.boundary.scale.set(sx, 1, sz);
      groups.boundary.position.set((b.minX + b.maxX) / 2 + 5.5 * sx, 0, (b.minZ + b.maxZ) / 2);
    }
    if (!v.cadBasemap && stage >= 2 && stage < 8) {
      on('documents', 2);
      if (a[1] === 'full')
        on('history', 2);
    }
    if (stage >= 3 && stage < 8) {
      on('axes', 3);
      groups.axes.scale.set(sx, 1, sz);
      groups.axes.position.set(ox + (a[2] === 'local' ? 3 : 0), a[2] === 'local' ? .8 : 0, oz - (a[2] === 'local' ? 4 : 0));
    }
    if (!v.cadBasemap && ((stage >= 4 && stage <= 7) || (stage === 11 && a[10] === 'survey'))) {
      if (a[3] !== 'field') {
        on('stations', 4);
        const factor = a[3] === 'cluster' ? .38 : 1;
        groups.stations.scale.set(sx * factor, 1, sz);
        groups.stations.position.set(ox - (a[3] === 'cluster' ? 85 * sx : 0), 0, oz);
        mark([groups.stations.position.x - 42 * sx * factor, 3, oz + 32 * sz], '独立检查点', null, 4);
      }
    }
    if (stage === 5 || stage === 6) {
      layFlight(b,a[4] || 'grid',v.flightSettings);
      on('flight-' + (a[4] || 'grid'), 5);
      on('drone', 5);
    }
    if (stage === 6) {
      if (a[5] !== 'corner') on('ground-bank', 6);
      if (a[5] !== 'bank') on('ground-corner', 6);
    }
    if (stage === 7) {
      on('cloud', 7);
      cloud.position.set(a[6] === 'position' ? 3 : 0, 0, a[6] === 'position' ? -4 : 0);
    }
    if (stage >= 8) {
      for (const id of ['terrain', 'roads', 'signals', 'buildings', 'landscape', 'river'])
        on(id, 8);
    }
    const flat = stage === 8 && a[7] === 'ortho';
    groups.buildings.scale.y = flat ? .025 : 1;
    if (stage === 9) {
      on('errors-' + (a[8] || 'plane'), 9);
      mark([ox - 62 * sx, 7, oz + 81 * sz], a[8] === 'height' ? '检查点 · 高程残差' : '检查点 · 平面残差', null, 9);
    }
    if (stage === 10) {
      on('codes-' + (a[9] || 'transport'), 10);
      mark([-48, 1, 0], 'G-01 · 公园', null, 10);
      mark([-120, 14, 64], 'B-01 · 建筑', null, 10);
      mark([-50, .5, 39], 'R-01 · 道路', null, 10);
      if (a[9] === 'water')
        mark([40, 2, -30], 'H-01 · 河段', null, 10);
    }
    if (stage >= 11) {
      on('accessible', 11);
      if (stage === 11) {
        on('assembled', 11);
        mark([-8, 1, 39], a[10] === 'survey' ? '测绘核查 · v1' : '运行监测 · v1', null, 11);
      }
    }
    deviceCoords['D-01'] = r.d;
    deviceCoords['C-01'] = r.c;
    for (const [id, p] of Object.entries(deviceCoords)) {
      const g = groups[id];
      g.position.fromArray(p);
      if (a[11] === 'map') {
        g.position.x += .85;
        g.position.z += 1.25;
      }
      if (id === 'C-01')
        g.rotation.y = route === 'b' ? -2.88 : -1.36;
      if (stage >= 12 && !preview) {
        on(id, stage === 13 && id !== 'W-01' ? 13 : 12);
        const pos = g.position.toArray();
        pos[1] += id === 'C-01' ? 7.65 : 4.8;
        mark(pos, id, id, 12);
      }
    }
    if (!preview && stage >= 13 && stage <= 18)
      on('assoc-' + route, 13);
    if (!preview && stage >= 14 && stage <= 17)
      on('streams', 14);
    if (!preview && stage >= 15 && stage <= 17) {
      on('line-' + route, 15);
      if (a[14] === 'both')
        on('line-extra-' + route, 15);
      if (stage === 15)
        mark(r.p, '过线 ' + (v.videoCount ?? 0) + ' 辆', null, 15);
    }
    if (stage === 16) {
      on('aligned', 16);
      [v.detectorCount, v.videoCount].forEach((value, i) => {
        const h = (value || 1) * .26;
        bars[i].scale.y = h;
        bars[i].position.set(r.p[0] + 3 * i, h / 2 + .5, r.p[2] + 5);
      });
      mark([r.p[0], 13, r.p[2]], '同窗 ' + v.detectorCount + ' / ' + v.videoCount + ' 辆', null, 16);
    }
    if (stage === 17) {
      on('fusion', 17);
      mark(hub, '融合 ' + v.trafficCount + ' 辆/分', null, 17);
    }
    if (stage === 18) {
      on('state', 18);
      const water = a[17] === 'water', p = water ? [68, 1, 3] : r.p;
      states.position.fromArray(p);
      mark([p[0], 5, p[2]], water ? '水位 ' + v.riverLevel + ' m' : v.trafficCount + ' 辆/分', null, 18);
    }
    if (preview || (stage >= 19 && a[18] !== 'water'))
      on('traffic', 19);
    if (stage >= 19 && !preview) {
      if (v.draftStep === 19)
        active.river = 19;
      mark([52, 1, -21], v.riverLevel.toFixed(2) + ' m · 河面', null, 19);
    }
    if (stage >= 20 && !preview) {
      on('status', 20);
      status.userData.standardMaterial?.color.set(v.roadDepth ? '#f1a05c' : '#72bc9a');
      mark([72, .7, 3], v.waterStatus + ' · ' + v.roadDepth + ' cm', null, 20);
    }
    if (stage === 21 && !preview) {
      on('receipt', 21);
      receipt.position.fromArray(r.c);
      receipt.position.x += 2.1;
      receipt.position.y += 2.4;
      mark([r.c[0] + 2, 10, r.c[2]], a[20] === 'update' ? 'v2 · 朝向已更新' : 'v1 · 待复核', null, 21);
    }
    for (const [id, g] of Object.entries(groups)) {
      g.visible = id in active;
      highlight(g, !!(v.draft && active[id] === v.draftStep && id !== 'drone' && !id.startsWith('flight-')));
    }
    record = { stage, flat, markers, visible: Object.keys(active), deviceCoords };
  }
  return {
    update(v, dt, preview, monitorOpen = false) {
      const sig = JSON.stringify([preview, v.stage, v.answers, v.minute, v.draft, v.draftStep, v.bounds, v.cadBasemap, v.flightSettings]);
      if (sig !== key) {
        configure(v, preview);
        key = sig;
      }
      elapsed += dt;
      const a = v.answers || [], s = record.stage;
      if (active.signals)
        signals(elapsed);
      if (active.drone) {
        flightDistance = (flightDistance + dt*42)%flightLength;
        const leg = flightSegments.find(item => flightDistance < item.end) || flightSegments.at(-1);
        drone.position.copy(leg.from).lerp(leg.to,1-(leg.end-flightDistance)/leg.length);
        drone.rotation.y = Math.atan2(leg.to.x-leg.from.x,leg.to.z-leg.from.z);
      }
      if (active.streams)
        packets.forEach((p, i) => {
          const source = deviceCoords[Object.keys(deviceCoords)[i % 3]], t = (elapsed * (a[13] === 'archive' ? .18 : .45) + Math.floor(i / 3) * .25) % 1;
          p.position.fromArray(source).lerp(new T.Vector3(...hub), t);
          p.position.y += 2 + Math.sin(t * Math.PI) * 7;
        });
      if (active.fusion)
        fusion.rotation.y = elapsed;
      const level = (!preview && s >= 19) ? (v.riverLevel ?? 2.1) : 2.1, depth = (!preview && s >= 19) ? (v.roadDepth || 0) : 0;
      const waterHeight = active.river ? waterLevel(level, depth, elapsed) : 0;
      const count = (active.traffic || monitorOpen) ? Math.min(maxCars, preview ? 48 : Math.max(0, Math.round(v.trafficCount ?? 24))) : 0;
      const first = count ? drive(count, preview ? 34 : (v.speed ?? 34), dt) : '';
      return { ...record, first, waterHeight, count, depth, dronePosition: active.drone ? drone.getWorldPosition(dummy.position).toArray() : null, animated: !!(active.river || active.drone || active.streams || active.traffic) };
    },
    devicePoint(id) { return Object.hasOwn(deviceCoords, id) ? groups[id].position.toArray() : null; },
    monitorTraffic(show) { groups.traffic.visible = show || !!active.traffic; },
    cameraPose() {
      const p = groups['C-01'].position;
      return currentRoute === 'b' ? { eye: [p.x + 1, p.y + 7, p.z], target: [p.x + 8, .7, p.z + 30] } : { eye: [p.x, p.y + 7, p.z - 1], target: [p.x + 32, .7, p.z - 8] };
    },
  };
};
