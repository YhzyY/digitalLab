'use strict';

globalThis.cityExperiment = (() => {
  const modules = [
    { id: 'city-twin', name: '数字孪生城市搭建环节', icon: '城', start: 1, end: 7, description: '从空场景建立街区范围、道路、建筑和设备，再验证观测如何更新孪生对象。' },
    { id: 'data-fusion', name: '多源数据融合环节', icon: '融', start: 8, end: 14, description: '治理观测记录，核对视频样例轨迹，统一时空口径，对比单源与融合结果。' },
    { id: 'situation-awareness', name: '智能态势感知数据处理环节', icon: '势', start: 15, end: 20, description: '配置火警、拥堵和积水规则，改变关键观测后复验并追查证据。' },
  ];
  const steps = [
    ['设定街区范围', '选择工程范围', '从空场景建立统一的调查范围，后续道路和建筑将引用同一坐标框架。', [['core', '街区核心区 · 400 × 350 m'], ['extended', '扩展调查区 · 480 × 410 m']]],
    ['导入街区路网', '选择道路数据', '导入道路几何，并观察十字路口、路面和车道标线如何进入场景。', [['main', '主干道与交叉口'], ['all', '完整街区路网']]],
    ['添加建筑模型', '选择建筑范围', '将带立面与屋顶纹理的建筑资产加入场景，定位样例建筑 B-01。', [['sample', '街区建筑模型']], true],
    ['补齐地面和绿化', '选择地面资源', '加入街区地面、步行空间和绿化，区分背景资源与可监测对象。', [['land', '街区地面、绿化与公园']], true],
    ['校核空间参考', '选择设备坐标处理', '检测器样本采用局部米制坐标。将设备坐标变换到城市参考系，检查落点。', [['corrected', '平移东向 −30 m、北向 +15 m'], ['raw', '直接使用原始坐标']]],
    ['关联检测器与路段', '设置目标路段', '选择路段即可从街道视角预览。应用后，检查 D-01 的观测关联线和路段标注。', [['a', '路段 A · 临江大道'], ['b', '路段 B · 云桥路']]],
    ['添加车流并映射观测', '选择显示指标', '根据样例观测生成沿车道行驶的车辆。切换观测时间，比较车流密度和行驶速度。', [['flow', '车流量（辆/分）'], ['speed', '平均速度（km/h）']]],
    ['识别并映射字段', '选择车辆计数字段', '比较车流和速度字段。统一车辆计数输入，以便与视频计数比较。', [['flow', 'veh_count · 车辆数'], ['speed', 'avg_speed · 平均车速']]],
    ['清洗异常记录', '选择质量处理规则', '08:01 的检测器数据包含重复记录与质量标记。比较保留或剔除重复的影响。', [['dedup', '保留最新记录并标记质量'], ['raw', '保留原始记录']]],
    ['设置视频计数线', '选择通过方向', '使用预置样例轨迹核对过线计数。计数线和通行方向会显示在对应断面。', [['forward', '正向过线'], ['reverse', '反向过线']]],
    ['按时间窗口对齐', '设置统计粒度', '把检测器记录和视频计数放进同一时间窗口。比较一分钟与两分钟统计。', [['1', '一分钟 · 左闭右开'], ['2', '两分钟 · 左闭右开']]],
    ['运行多源融合', '选择数据策略', '在对齐的记录中按来源质量选用结果。查看道路当前计数和被采用的来源。', [['quality', '按质量选源'], ['detector', '只用检测器'], ['video', '只用视频']]],
    ['执行对照与消融', '选择对照条件', '在同一窗口内移除一路来源，比较结果，查看融合对缺测和低质量记录的影响。', [['drop-video', '移除视频来源'], ['drop-detector', '移除检测器来源']]],
    ['接入新增监测设备', '关联水位计 W-01', '将水位观测关联到低洼路段或备选路段，后续积水情景会使用此配置。', [['b', '路段 B · 云桥路低洼段'], ['a', '路段 A · 临江大道']]],
    ['生成建筑火警候选', '设置证据组合', '按建筑区域归集烟感、温度和视频烟雾证据，检查候选告警。', [['two', '三项证据至少满足两项'], ['all', '三项证据全部满足']]],
    ['计算拥堵状态', '设置速度阈值', '计算最近三个已完成窗口的平均车速，判断关联道路是否低于教学阈值。', [['35', '平均车速低于 35 km/h'], ['40', '平均车速低于 40 km/h']]],
    ['生成道路积水等级', '设置积水阈值', '将水位观测映射到 W-01 已关联的路段，并用阈值区分正常和积水。', [['15', '15 cm 及以上为积水'], ['20', '20 cm 及以上为积水']]],
    ['注入关键观测缺测', '选择移除的观测', '对样例数据做一次可复验的扰动，观察相应道路或建筑的状态变化。', [['water', '移除水位观测'], ['smoke', '移除烟感记录'], ['speed', '移除连续三个窗口中的一条车速记录']]],
    ['追溯对象与证据', '选择要核验的对象', '定位到实景中的对象，检查原始观测、规则和该次判断之间的关系。', [['water', '核验积水道路'], ['smoke', '核验建筑火警'], ['speed', '核验拥堵道路']]],
    ['前后对照与成果导出', '选择显示的运行', '切换原始和受扰条件，核对状态差异，并导出本次操作、配置和证据。', [['before', '查看扰动前'], ['after', '查看扰动后']]],
  ].map(([title, label, description, options, single], index) => ({ number: index + 1, title, label, description, options, single }));
  const roads = {
    a: { label: '临江大道', points: [[-115, 1, 0], [-15, 1, 0]], marker: [-69, 11, 0] },
    b: { label: '云桥路', points: [[0, 1, -17], [0, 1, -99]], marker: [0, 9, -55] },
  };
  const times = ['08:00', '08:01', '08:02'];
  const detector = [24, 37, 18], speeds = [39, 32, 43], water = [8, 22, 24];
  const sampleTracks = times.map((_, window) => [
    ...Array.from({ length: [20, 34, 22][window] }, (_, id) => ({ id: 'F' + id, from: -77, to: -38 })),
    ...Array.from({ length: [12, 8, 10][window] }, (_, id) => ({ id: 'R' + id, from: -37, to: -78 })),
  ]);

  function stateAt(answers, minute) {
    const a = number => answers[number - 1];
    const route = a(6) || 'a';
    const wetRoad = a(14) || 'b';
    const countTracks = index => sampleTracks[index].filter(track => a(10) === 'reverse'
      ? track.from >= -56 && track.to < -56 : track.from < -56 && track.to >= -56).length;
    const length = Number(a(11) || 1), start = Math.floor(minute / length) * length;
    const windows = [...detector.keys()].slice(start, start + length);
    const pair = windows.map(index => ({
      detector: a(8) === 'speed' ? null : detector[index] + (a(9) === 'raw' && index === 1 ? 11 : 0),
      video: countTracks(index),
      quality: index !== 1,
    }));
    const choose = (pair, mode) => mode === 'video' || (mode !== 'detector' && (!pair.quality || pair.detector === null))
      ? { value: pair.video, source: '视频' } : { value: pair.detector, source: '检测器' };
    const sum = items => items.every(item => item.value !== null)
      ? items.reduce((total, item) => total + item.value, 0) : null;
    const chosen = pair.map(item => choose(item, a(12)));
    const total = sum(chosen);
    const beforeAfter = kind => {
      const missing = a(20) === 'before' ? null : a(18);
      if (kind === 'water') {
        if (missing === 'water') return { status: '未知', value: '水位缺测', color: '#aa8bb3' };
        const height = water[minute];
        return height >= Number(a(17) || 15)
          ? { status: '积水', value: height + ' cm', color: '#4aaee7' } : { status: '正常', value: height + ' cm', color: '#36c18c' };
      }
      if (kind === 'smoke') {
        const sample = { smokeAlarm: missing === 'smoke' ? null : true, temperature: 67, videoSmoke: false };
        const qualifying = [sample.smokeAlarm === true, sample.temperature >= 60, sample.videoSmoke].filter(Boolean).length;
        const required = a(15) === 'all' ? 3 : 2;
        return qualifying >= required
          ? { status: '火警候选', value: qualifying + '/3 项证据命中', color: '#f08469' }
          : { status: '未触发', value: qualifying + '/3 项证据命中', color: '#80b89d' };
      }
      if (missing === 'speed') return { status: '未知', value: '三个历史窗口证据不完整', color: '#aa8bb3' };
      // The fixture contains three completed history windows preceding each evaluation.
      const history = [[39, 32, 43], [32, 43, 31], [43, 31, 34]][minute];
      const average = history.reduce((total, speed) => total + speed, 0) / 3;
      return average < Number(a(16) || 35)
        ? { status: '拥堵', value: average.toFixed(1) + ' km/h', color: '#f1a258' }
        : { status: '畅通', value: average.toFixed(1) + ' km/h', color: '#36c18c' };
    };
    return { route, wetRoad, countTracks: countTracks(minute), total,
      source: [...new Set(chosen.map(item => item.source))].join('＋'),
      ablation: sum(pair.map(item => choose(item, a(13) === 'drop-detector' ? 'video' : 'detector'))),
      detectorCount: pair[minute - start].detector, beforeAfter, a };
  }

  function result(number, answers, minute) {
    const s = stateAt(answers, minute);
    const option = s.a(number);
    if (!option) return { headline: '等待应用', detail: '完成当前操作后，场景会显示结果。' };
    const units = value => value === null ? '未知' : value + ' 辆';
    switch (number) {
      case 1: return { headline: option === 'extended' ? '480 × 410 m' : '400 × 350 m', detail: '已显示工程边界和地面参考网格。' };
      case 2: return { headline: option === 'all' ? '完整路网已加载' : '主干道已加载', detail: '场景显示道路面、车道标线与中心交叉口。' };
      case 3: return { headline: '建筑模型已加入', detail: '立面、窗户、屋顶和街道形成可旋转的三维街区。' };
      case 4: return { headline: '地面与绿化已加入', detail: '出现绿化、公园步道、街区地面和道路边界。' };
      case 5: return { headline: option === 'corrected' ? '已校正到参考点' : '产生 33.5 m 偏差', detail: '查看原始坐标和校核点之间的虚线。' };
      case 6: return { headline: 'D-01 → ' + roads[s.route].label, detail: '设备位置不变，观测关联线和道路目标随配置更新。' };
      case 7: return { headline: option === 'speed' ? speeds[minute] + ' km/h' : detector[minute] + ' 辆/分', detail: '路网中已生成行驶车辆。切换时间，对比车流密度与速度。' };
      case 8: return { headline: option === 'speed' ? '字段单位不相符' : '车辆计数字段已绑定', detail: option === 'speed' ? 'km/h 不能作为车辆数，后续检测器计数会标记未知。' : 'D-01 的 veh_count 已映射到路段车辆数。' };
      case 9: return { headline: units(s.detectorCount), detail: minute === 1 ? (option === 'raw' ? '08:01 重复观测造成 11 辆偏差。' : '08:01 已剔除重复行，低质量标记继续保留。') : '切换到 08:01 可比较重复记录造成的偏差。' };
      case 10: return { headline: s.countTracks + ' 辆过线', detail: '样例轨迹与计数线按所选方向匹配。' };
      case 11: return { headline: option + ' 分钟统计窗口', detail: '按窗口起点把检测器和样例视频记录配对。' };
      case 12: return { headline: units(s.total), detail: '参与统计的实际来源：' + s.source + '。' };
      case 13: return { headline: units(s.ablation), detail: '对照原融合结果 ' + units(s.total) + '，查看保留来源。' };
      case 14: return { headline: 'W-01 → ' + roads[s.wetRoad].label, detail: '地图显示新增水位计及其绑定道路。' };
      case 15: case 16: case 17: case 18: case 19: case 20: {
        const focus = ({ 15: 'smoke', 16: 'speed', 17: 'water' })[number] || s.a(number) && (number === 19 ? option : s.a(18)) || 'water';
        const evidence = s.beforeAfter(focus);
        return { headline: evidence.status, detail: evidence.value + '。' +
          ({ 18: '当前显示缺测影响。', 19: '已定位核验对象。', 20: option === 'before' ? '正在回看扰动前结果。' : '正在查看扰动后结果。' }[number] || '') };
      }
      default: return { headline: '已应用', detail: '' };
    }
  }

  function visual(answers, minute) {
    const n = answers.length, s = stateAt(answers, minute);
    const layers = [], lines = [], markers = [];
    const addLine = (points, color, width, dashed = false) => lines.push({ points, color, width, dashed });
    const mark = (point, text, color, id, offset) => markers.push({ point, text, color, id, offset });
    const drawRoad = (road, label, color) => {
      addLine(roads[road].points, color, 5);
      mark(roads[road].marker, label, color, road);
    };
    if (n >= 1) {
      if (n < 4) layers.push('grid');
      const [x, z] = s.a(1) === 'extended' ? [240, 205] : [200, 175];
      addLine([[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-x, 0, -z]], '#6d8b7acf', 1.5, true);
      if (n === 1) mark([-x, 0, z], '调查范围', '#258e67');
    }
    if (n >= 2) {
      layers.push('roads-main');
      if (s.a(2) === 'all') layers.push('roads-side');
      if (n === 2) mark([0, 5, 0], '中心交叉口', '#47c497');
    }
    if (n >= 3) {
      layers.push('buildings');
      if (n === 3) mark([70, 28, -43], '样例建筑 B-01', '#3bc49a');
    }
    if (n >= 4) {
      layers.push('land', 'greenery');
      if (n === 4) mark([-67, 8, -55], '街区公园与步道', '#56c98a');
    }
    const reference = [-55, 1, -20], raw = [-25, 1, -5];
    const sensor = s.a(5) === 'corrected' ? reference : raw;
    if (n === 5) {
      addLine([raw, reference], '#f9c56c', 2, true);
      mark(reference, '校核点', '#47c99b');
      mark(raw, s.a(5) === 'corrected' ? '原始位置' : '未校正位置 · 33.5 m', '#f6ab63');
    }
    if (n >= 6) {
      addLine([sensor, roads[s.route].marker], '#aeffdd', 2, true);
      mark([sensor[0], 12, sensor[2]], 'D-01', '#54dea7', s.route, 13);
      if (n <= 13) drawRoad(s.route, n === 6 ? '已关联' :
        n === 7 ? result(n, answers, minute).headline :
        n === 8 ? result(n, answers, minute).headline :
        n === 9 ? '清洗后 ' + result(n, answers, minute).headline :
        n === 10 ? '视频 ' + result(n, answers, minute).headline :
        n === 11 ? s.a(11) + ' 分钟窗' :
        n === 12 ? '融合 ' + result(n, answers, minute).headline :
        '移除一路 ' + result(n, answers, minute).headline, n === 8 && s.a(8) === 'speed' ? '#f1a258' : '#46d4a5');
    }
    if (n === 10) {
      const at = s.route === 'a' ? [-56, 3, 12] : [12, 3, -56];
      mark(at, s.a(10) === 'reverse' ? '反向计数线' : '正向计数线', '#ffca72');
    }
    if (n >= 14) {
      const sensorWater = [22, 12, -38];
      addLine([sensorWater, roads[s.wetRoad].marker], '#9edbff', 2, true);
      mark(sensorWater, 'W-01', '#67bfe9', s.wetRoad, 12);
    }
    if (n >= 15) {
      const finding = s.beforeAfter('smoke');
      mark([69, 36, -47], 'B-01 · ' + finding.status, finding.color, 'smoke');
    }
    if (n >= 16) {
      const finding = s.beforeAfter('speed');
      drawRoad(s.route, finding.status + ' · ' + finding.value, finding.color);
    }
    if (n >= 17) {
      const finding = s.beforeAfter('water');
      const point = [...roads[s.wetRoad].marker];
      point[1] += 7;
      addLine(roads[s.wetRoad].points, finding.color, finding.status === '积水' ? 12 : 6, finding.status === '未知');
      mark(point, finding.status + ' · ' + finding.value, finding.color, 'water', 13);
    }
    if (n >= 18) {
      const focus = s.a(19) || s.a(18);
      const point = focus === 'smoke' ? [69, 58, -47] : focus === 'water' ? [...roads[s.wetRoad].marker] : [...roads[s.route].marker];
      point[1] += 34;
      mark(point, n === 18 ? '已注入缺测' : n === 19 ? '核验对象' : s.a(20) === 'before' ? '扰动前' : '扰动后', '#ffd28f', focus);
    }
    const activeRoad = s.route;
    const otherRoad = activeRoad === 'a' ? 'b' : 'a';
    const windowSize = Number(s.a(11) || 1);
    const appliedCount = n === 10 ? s.countTracks
      : n === 13 ? s.ablation === null ? null : Math.round(s.ablation / windowSize)
      : n >= 12 ? s.total === null ? null : Math.round(s.total / windowSize)
      : n >= 8 ? s.detectorCount : detector[minute];
    const speedState = s.beforeAfter('speed');
    const waterState = s.beforeAfter('water');
    const physicallyWet = n >= 17 && waterState.status === '积水';
    const traffic = n < 7 ? {} : {
      [activeRoad]: {
        count: appliedCount === null ? 0 : Math.min(24, Math.round(appliedCount * .57)),
        speed: n >= 16 && speedState.status === '拥堵' ? 12 : speeds[minute],
        direction: n === 10 ? s.a(10) === 'reverse' ? -1 : 1 : undefined,
      },
      [otherRoad]: { count: [7, 11, 8][minute], speed: [29, 34, 36][minute] },
    };
    if (physicallyWet && traffic[s.wetRoad]) traffic[s.wetRoad].speed = Math.min(traffic[s.wetRoad].speed, 15);

    const packets = [];
    const from = [sensor[0], 5, sensor[2]];
    const to = [roads[activeRoad].marker[0], 1.1, roads[activeRoad].marker[2]];
    const camera = activeRoad === 'a' ? [-59, 6, -9] : [9, 6, -59];
    if (n >= 6 && n <= 14 && n !== 10 && !(n === 12 && s.a(12) === 'video') && !(n === 13 && s.a(13) === 'drop-detector')) {
      const rejected = n === 8 && s.a(8) === 'speed' || n === 9 && s.a(9) === 'dedup' && minute === 1;
      packets.push({ from, to, count: rejected ? 3 : n === 9 && s.a(9) === 'raw' ? 9 : 6, color: rejected ? '#f5ac65' : '#a1ffdd' });
    }
    if (n >= 10 && n <= 13 && !(n === 12 && s.a(12) === 'detector') && !(n === 13 && s.a(13) === 'drop-video')) {
      packets.push({ from: camera, to, count: 6, color: '#ffc67d' });
    }
    if (n >= 14 && !(n >= 18 && s.a(18) === 'water' && s.a(20) !== 'before')) {
      const waterPoint = roads[s.wetRoad].marker;
      packets.push({ from: [15, 3.8, -37], to: [waterPoint[0], 1, waterPoint[2]], count: 4, color: '#83d5ff' });
    }
    return {
      layers, lines, markers, stage: n,
      simulation: {
        stage: n, route: activeRoad, sensor, traffic, packetPaths: packets,
        water: { road: s.wetRoad, depth: physicallyWet ? water[minute] : 0 },
        smoke: n >= 15 && s.beforeAfter('smoke').status === '火警候选',
      },
    };
  }

  function previewVisual(applied, candidate, minute) {
    const current = visual(applied, minute);
    const next = visual(candidate, minute);
    const key = JSON.stringify;
    const flagChanges = (before, after) => {
      const existing = new Set(before.map(key));
      return after.map(item => !existing.has(key(item)));
    };
    const color = '#f3979c';
    const changedLines = flagChanges(current.lines, next.lines);
    const changedMarkers = flagChanges(current.markers, next.markers);
    const draftLayers = next.layers.filter(layer => !current.layers.includes(layer));
    if (!changedMarkers.some(Boolean) && next.markers.length) changedMarkers[changedMarkers.length - 1] = true;
    return {
      ...next,
      draftLayers,
      lines: next.lines.map((line, index) => changedLines[index] ? { ...line, color } : line),
      markers: next.markers.map((marker, index) => changedMarkers[index] ? { ...marker, color, draft: true } : marker),
      simulation: {
        ...next.simulation,
        draft: {
          color,
          traffic: ['a', 'b'].filter(road => key(current.simulation.traffic[road]) !== key(next.simulation.traffic[road])),
          paths: flagChanges(current.simulation.packetPaths, next.simulation.packetPaths),
          signal: current.stage < 2 && next.stage >= 2,
          detector: next.stage >= 5 && (current.stage < 5 || key(current.simulation.sensor) !== key(next.simulation.sensor)),
          video: next.stage >= 10 && (current.stage < 10 || current.simulation.route !== next.simulation.route),
          gauge: current.stage < 14 && next.stage >= 14,
          water: key(current.simulation.water) !== key(next.simulation.water),
          smoke: current.simulation.smoke !== next.simulation.smoke,
        },
      },
    };
  }

  return { modules, steps, times, result, visual, previewVisual };
})();
