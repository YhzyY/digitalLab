'use strict';

globalThis.createCitySimulation = function createCitySimulation(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const materials = {
    pole: new THREE.MeshStandardMaterial({ color: 0x687780, roughness: .62, metalness: .48 }),
    box: new THREE.MeshStandardMaterial({ color: 0xd7dedc, roughness: .7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x273f4e, roughness: .32, metalness: .3 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x20252a, roughness: .91 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe6f0ee, emissive: 0x779296, emissiveIntensity: .18 }),
    red: new THREE.MeshStandardMaterial({ color: 0x882822, emissive: 0xa62019, emissiveIntensity: .25 }),
  };
  const trafficColors = [0xe0dfda, 0x586e83, 0x9f3228, 0x818c88, 0x303844, 0xc3ae86, 0x6d767f, 0x384e62];
  const trafficLimit = 48;
  const dummy = new THREE.Object3D();
  const heading = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  const offset = new THREE.Vector3();

  function roundedCar() {
    const profile = new THREE.Shape();
    profile.moveTo(-2.18, .38);
    profile.quadraticCurveTo(-2.18, .17, -1.91, .17);
    profile.lineTo(1.91, .17);
    profile.quadraticCurveTo(2.18, .17, 2.18, .38);
    profile.lineTo(2.03, .87);
    profile.quadraticCurveTo(1.95, 1.03, 1.63, 1.03);
    profile.lineTo(-1.66, 1.04);
    profile.quadraticCurveTo(-2.14, .97, -2.18, .38);
    const geometry = new THREE.ExtrudeGeometry(profile, { depth: 1.69, bevelEnabled: true, bevelSegments: 2, bevelSize: .115, bevelThickness: .115, steps: 1, curveSegments: 4 });
    geometry.translate(0, 0, -.845);
    return geometry;
  }

  const wheel = new THREE.CylinderGeometry(.34, .34, .25, 10);
  wheel.rotateX(Math.PI / 2);
  const windshield = new THREE.Shape();
  windshield.moveTo(-1.43, .93);
  windshield.lineTo(-.78, 1.53);
  windshield.quadraticCurveTo(-.71, 1.60, -.51, 1.60);
  windshield.lineTo(.53, 1.60);
  windshield.quadraticCurveTo(.72, 1.58, .81, 1.47);
  windshield.lineTo(1.24, .98);
  windshield.lineTo(-1.43, .93);
  const cabin = new THREE.ExtrudeGeometry(windshield, {
    depth: 1.45, bevelEnabled: true, bevelSegments: 2, bevelSize: .06, bevelThickness: .055, steps: 1, curveSegments: 5,
  });
  cabin.translate(0, 0, -.725);
  const light = new THREE.BoxGeometry(.13, .19, .42);
  const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .38, metalness: .23 });
  const contactGeometry = new THREE.CircleGeometry(1, 20);
  contactGeometry.rotateX(-Math.PI / 2);
  contactGeometry.scale(2.55, 1, 1.23);
  const contactMaterial = new THREE.MeshBasicMaterial({ color: 0x161d1d, transparent: true, opacity: .40, depthWrite: false });
  const pieces = [
    { name: 'body', shape: roundedCar(), preset: paint, offsets: [[0, 0, 0]] },
    { name: 'roof', shape: new THREE.BoxGeometry(1.32, .064, 1.48), preset: paint, offsets: [[-.02, 1.62, 0]] },
    { name: 'cabin', shape: cabin, preset: materials.glass, offsets: [[0, 0, 0]] },
    { name: 'wheel', shape: wheel, preset: materials.tire, offsets: [[1.34, .35, -.83], [1.34, .35, .83], [-1.35, .35, -.83], [-1.35, .35, .83]] },
    { name: 'head', shape: light, preset: materials.white, offsets: [[2.13, .67, -.55], [2.13, .67, .55]] },
    { name: 'rear', shape: light, preset: materials.red, offsets: [[-2.13, .68, -.53], [-2.13, .68, .53]] },
    { name: 'contact', shape: contactGeometry, preset: contactMaterial, offsets: [[0, -.018, 0]] },
  ].map(piece => {
    const mesh = new THREE.InstancedMesh(piece.shape, piece.preset, trafficLimit * piece.offsets.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    root.add(mesh);
    return { ...piece, mesh };
  });
  for (let index = 0; index < trafficLimit; index++) {
    const color = new THREE.Color(trafficColors[(index * 5) % trafficColors.length]);
    pieces[0].mesh.setColorAt(index, color);
    pieces[1].mesh.setColorAt(index, color);
  }

  const roadLayout = {
    a: { from: -203, length: 406, cross: 0 },
    b: { from: -173, length: 346, cross: 0 },
  };
  const fleet = { a: [], b: [] };
  let firstVehiclePosition = '';
  let paintState;

  function resetLane(road, count, sampledDirection) {
    const layout = roadLayout[road];
    const previous = fleet[road];
    if (previous.length === count && previous.every(vehicle => vehicle.direction === (sampledDirection || vehicle.direction))) return;
    fleet[road] = Array.from({ length: count }, (_, index) => {
      const direction = sampledDirection || (index % 2 ? -1 : 1);
      const laneIndex = sampledDirection ? index : Math.floor(index / 2);
      const laneCount = sampledDirection ? count : Math.ceil(count / 2);
      return {
        direction,
        position: previous[index]?.direction === direction ? previous[index].position
          : (laneIndex + (direction > 0 ? .18 : .65)) * layout.length / Math.max(1, laneCount),
        speed: previous[index]?.speed || 8,
      };
    });
  }

  function applyTraffic(state, delta, elapsed) {
    const flows = state?.traffic || {};
    resetLane('a', Math.min(24, flows.a?.count || 0), flows.a?.direction);
    resetLane('b', Math.min(24, flows.b?.count || 0), flows.b?.direction);
    const draftRoads = state?.draft?.traffic || [];
    const paintKey = [fleet.a.length, fleet.b.length, ...draftRoads].join(',');
    if (paintKey !== paintState) {
      paintState = paintKey;
      const pink = new THREE.Color('#f3979c');
      for (let i = 0; i < fleet.a.length + fleet.b.length; i++) {
        const color = new THREE.Color(trafficColors[(i * 5) % trafficColors.length]);
        if (draftRoads.includes(i < fleet.a.length ? 'a' : 'b')) color.lerp(pink, .65);
        pieces[0].mesh.setColorAt(i, color);
        pieces[1].mesh.setColorAt(i, color);
      }
      pieces[0].mesh.instanceColor.needsUpdate = true;
      pieces[1].mesh.instanceColor.needsUpdate = true;
    }
    let index = 0;
    firstVehiclePosition = '';
    for (const road of ['a', 'b']) {
      const { from, length, cross } = roadLayout[road];
      const horizontal = road === 'a';
      const greenSignal = (Math.floor(elapsed / 13) % 2 === 0) === horizontal;
      for (const [laneIndex, vehicle] of fleet[road].entries()) {
        const target = flows[road].speed / 3.6;
        const coordinate = from + (vehicle.direction > 0 ? vehicle.position : length - vehicle.position);
        const distanceToStop = (cross - coordinate) * vehicle.direction - 11;
        const sameLane = fleet[road].filter(other => other !== vehicle && other.direction === vehicle.direction);
        const gap = sameLane.reduce((nearest, other) => Math.min(nearest, (other.position - vehicle.position + length) % length), length);
        const approached = !greenSignal && distanceToStop >= -.8 && distanceToStop < 16;
        const speedLimit = approached ? Math.max(0, distanceToStop * .62) : target;
        const preferred = Math.min(speedLimit, Math.max(0, (gap - 4.7) * 1.5));
        vehicle.speed += (preferred - vehicle.speed) * Math.min(1, 2.7 * delta);
        vehicle.position = (vehicle.position + vehicle.speed * delta) % length;
        const position = from + (vehicle.direction > 0 ? vehicle.position : length - vehicle.position);
        if (index === 0) firstVehiclePosition = road + ':' + position.toFixed(3);
        const lane = vehicle.direction * (horizontal ? 5.75 : -5.25);
        const yaw = horizontal ? (vehicle.direction > 0 ? 0 : Math.PI) : (vehicle.direction > 0 ? -Math.PI / 2 : Math.PI / 2);
        heading.setFromAxisAngle(axis, yaw);
        for (const piece of pieces) for (let part = 0; part < piece.offsets.length; part++) {
          offset.fromArray(piece.offsets[part]).applyQuaternion(heading);
          dummy.position.set((horizontal ? position : lane) + offset.x, .12 + offset.y, (horizontal ? lane : position) + offset.z);
          dummy.quaternion.copy(heading);
          const size = laneIndex % 7 === 0 ? 1.07 : 1;
          dummy.scale.setScalar(size);
          dummy.updateMatrix();
          piece.mesh.setMatrixAt(index * piece.offsets.length + part, dummy.matrix);
        }
        index++;
      }
    }
    for (const piece of pieces) {
      piece.mesh.count = index * piece.offsets.length;
      piece.mesh.instanceMatrix.needsUpdate = index > 0;
    }
    return index;
  }

  function mesh(geometry, material, parent, position) {
    const object = new THREE.Mesh(geometry, material);
    if (position) object.position.set(...position);
    parent.add(object);
    return object;
  }

  function makeSensor(color, height, lens = false) {
    const group = new THREE.Group();
    root.add(group);
    mesh(new THREE.CylinderGeometry(.115, .18, height, 10), materials.pole, group, [0, height / 2, 0]);
    mesh(new THREE.BoxGeometry(.63, .68, .44), materials.box, group, [0, height - .15, 0]);
    if (lens) mesh(new THREE.BoxGeometry(.39, .33, .1), materials.glass, group, [0, height - .14, .26]);
    mesh(new THREE.SphereGeometry(.135, 8, 7), new THREE.MeshBasicMaterial({ color }), group, [0, height + .24, 0]);
    return group;
  }

  const detector = makeSensor('#a4f5cf', 4.8, true);
  const video = makeSensor('#ffd18a', 6.5, true);
  const gauge = makeSensor('#65c7ed', 3.4);
  const checkpoints = new THREE.Group();
  root.add(checkpoints);
  const ringGeometry = new THREE.RingGeometry(.9, 1.14, 28);
  ringGeometry.rotateX(-Math.PI / 2);
  const checkpoint = mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xf7b652, side: THREE.DoubleSide }), checkpoints);
  const cameraGate = new THREE.Group();
  root.add(cameraGate);
  const gateMaterial = new THREE.MeshBasicMaterial({ color: 0xffc369, transparent: true, opacity: .8 });
  mesh(new THREE.BoxGeometry(.24, .05, 17), gateMaterial, cameraGate, [-56, .14, 0]);
  const beams = Array.from({ length: 12 }, (_, index) => {
    const object = mesh(new THREE.SphereGeometry(.37, 8, 6), new THREE.MeshBasicMaterial({ color: 0xa1ffdd }), root);
    object.userData.index = index;
    return object;
  });

  const signal = new THREE.Group();
  root.add(signal);
  const signalLights = [0xff6862, 0xff6862].map(color =>
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .9 }));
  for (const [x, z, direction] of [[-11, 10, 0], [11, -10, 0], [-11, -10, 1], [11, 10, 1]]) {
    mesh(new THREE.CylinderGeometry(.12, .16, 5, 9), materials.pole, signal, [x, 2.5, z]);
    mesh(new THREE.BoxGeometry(.32, .94, .32), materials.glass, signal, [x, 4.9, z]);
    mesh(new THREE.SphereGeometry(.19, 8, 7), signalLights[direction], signal, [x, 5.07, z + .2]);
  }

  const waterShape = new THREE.Shape();
  waterShape.moveTo(-43, -3.1);
  waterShape.bezierCurveTo(-39, -7.6, -22, -7.1, -12, -4.5);
  waterShape.bezierCurveTo(1, -8.1, 27, -7.0, 42, -3.1);
  waterShape.bezierCurveTo(50, -.4, 41, 4.6, 24, 5.1);
  waterShape.bezierCurveTo(9, 7.5, -28, 7.4, -43, 3.5);
  waterShape.quadraticCurveTo(-49, .5, -43, -3.1);
  const surface = new THREE.ShapeGeometry(waterShape, 14);
  surface.rotateX(-Math.PI / 2);
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 0 }, draft: { value: 0 } },
    vertexShader: 'varying vec2 local; void main() {local=position.xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float time; uniform float opacity; uniform float draft; varying vec2 local;
      void main() {
        float waves = .52 + .13*sin(local.x*1.64 + local.y*1.75 + time*2.1)
          + .077*sin(local.x*.89 - local.y*2.85 - time*1.6);
        float edge = 1. - smoothstep(1., 6., abs(local.y));
        vec3 color = mix(vec3(.16,.29,.34), vec3(.49,.70,.76), waves);
        gl_FragColor = vec4(mix(color, vec3(.96,.59,.61), draft*.65),
          opacity * (.5 + .28*edge + waves*.12));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const water = mesh(surface, waterMaterial, root);
  let waterHeight = 0;
  let waterFade = 0;

  const smokeCanvas = document.createElement('canvas');
  smokeCanvas.width = smokeCanvas.height = 64;
  const context = smokeCanvas.getContext('2d');
  const gradient = context.createRadialGradient(30, 31, 1, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(76,78,81,.65)');
  gradient.addColorStop(.38, 'rgba(104,107,110,.35)');
  gradient.addColorStop(1, 'rgba(128,133,136,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const smokeMap = new THREE.CanvasTexture(smokeCanvas);
  const smoke = Array.from({ length: 10 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeMap, transparent: true, depthWrite: false, opacity: .55 }));
    root.add(sprite);
    return sprite;
  });

  let elapsed = 0;
  let previousStage = 0;
  let currentSensor = new THREE.Vector3(-25, 0, -5);
  let active = false;
  let animated = false;
  const tinted = new WeakMap();

  function previewObject(group, draft) {
    if (group.userData.draft === draft) return;
    group.userData.draft = draft;
    group.traverse(object => {
      if (!object.isMesh) return;
      let pair = tinted.get(object);
      if (!pair && draft) {
        const original = object.material;
        const overlay = original.clone();
        overlay.color.lerp(new THREE.Color('#f3979c'), .68);
        pair = { original, overlay };
        tinted.set(object, pair);
      }
      if (pair) object.material = draft ? pair.overlay : pair.original;
    });
  }

  return {
    update(state, delta, snap = false) {
      const stage = state?.stage || 0;
      if (stage !== previousStage) {
        if (stage < 5) currentSensor.set(-25, 0, -5);
        previousStage = stage;
      }
      elapsed += delta;
      active = stage >= 5;
      const draft = state?.draft;
      previewObject(detector, Boolean(draft?.detector));
      previewObject(video, Boolean(draft?.video));
      previewObject(gauge, Boolean(draft?.gauge));
      previewObject(signal, Boolean(draft?.signal));
      signal.visible = stage >= 2;
      for (const [direction, lamp] of signalLights.entries()) {
        const green = stage >= 7 && Math.floor(elapsed / 13) % 2 === direction;
        lamp.color.set(green ? 0x38e790 : 0xff6262);
        lamp.emissive.copy(lamp.color);
      }
      const physicalCars = applyTraffic(state, delta, elapsed);
      const nextSensor = state?.sensor || [-25, 0, -5];
      currentSensor.lerp(offset.set(nextSensor[0], 0, nextSensor[2]), snap ? 1 : Math.min(1, delta * 4.4));
      detector.visible = active;
      detector.position.copy(currentSensor);
      checkpoints.visible = stage === 5;
      checkpoint.position.set(-55, .22, -20);
      checkpoint.scale.setScalar(1 + .17 * Math.sin(elapsed * 4));
      video.visible = stage >= 10;
      if (state?.route === 'b') video.position.set(9, 0, -59);
      else video.position.set(-59, 0, -9);
      gauge.visible = stage >= 14;
      gauge.position.set(15, 0, -37);
      cameraGate.visible = stage === 10;
      cameraGate.rotation.y = state?.route === 'b' ? -Math.PI / 2 : 0;
      gateMaterial.opacity = .47 + Math.sin(elapsed * 4.3) * .27;

      const vectors = state?.packetPaths || [];
      for (const beam of beams) {
        const index = beam.userData.index;
        const pathIndex = index % (vectors.length || 1);
        const path = vectors[pathIndex];
        beam.visible = Boolean(path && index < path.count * vectors.length);
        if (!beam.visible) continue;
        const t = (elapsed * .6 + index * .217) % 1;
        beam.position.fromArray(path.from).lerp(offset.fromArray(path.to), t);
        beam.material.color.set(state.draft?.paths[pathIndex] ? state.draft.color : path.color);
      }

      const waterTarget = state?.water?.depth || 0;
      waterHeight += (waterTarget - waterHeight) * (snap ? 1 : Math.min(1, delta * 3.4));
      waterFade += ((waterTarget > 0 ? .83 : 0) - waterFade) * (snap ? 1 : Math.min(1, delta * 4.2));
      water.visible = waterFade > .012;
      const route = state?.water?.road || 'b';
      water.position.set(route === 'a' ? -66 : 0, .13 + waterHeight / 76, route === 'a' ? 0 : -59);
      water.rotation.y = route === 'a' ? 0 : Math.PI / 2;
      water.scale.set(1, 1, .54 + waterHeight / 46);
      waterMaterial.uniforms.time.value = elapsed;
      waterMaterial.uniforms.opacity.value = waterFade;
      waterMaterial.uniforms.draft.value = Number(Boolean(state?.draft?.water));

      for (const [index, sprite] of smoke.entries()) {
        sprite.visible = Boolean(state?.smoke);
        if (!sprite.visible) continue;
        const t = (elapsed * .32 + index * .1) % 1;
        sprite.position.set(70 + t * 11 + Math.sin(index * 2) * 2.1, 30 + t * 21, -43 - t * 8);
        sprite.scale.setScalar(2.7 + 10 * t);
        sprite.material.color.set(state.draft?.smoke ? state.draft.color : '#ffffff');
        sprite.material.opacity = Math.sin(Math.PI * t) * .62;
      }
      animated = stage === 5 || vectors.length > 0 || physicalCars > 0 || water.visible || Boolean(state?.smoke) ||
        (active && currentSensor.distanceToSquared(offset.set(nextSensor[0], 0, nextSensor[2])) > .02);
      return {
        animated, vehicles: physicalCars, firstVehiclePosition, waterHeight,
        sensorPosition: currentSensor.toArray().map(value => value.toFixed(1)).join(','),
        transmitting: beams.filter(beam => beam.visible).length, smoke: Boolean(state?.smoke),
      };
    },
  };
};
