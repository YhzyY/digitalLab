'use strict';

globalThis.cityExperiment = (() => {
  const purposes = [
    ['traffic', '交通运行监测'],
    ['water', '河流水位与积水监测'],
    ['facilities', '城市空间与设施管理'],
  ];
  const modules = [
    { id: 'city-twin', name: '数字孪生城市搭建环节', icon: '城', start: 1, end: 11, description: '从调查范围和测量控制开始，采集影像、核验模型，交付可查询的滨水街区。' },
    { id: 'data-fusion', name: '多源数据融合环节', icon: '融', start: 12, end: 17, description: '在现场定位设备，接入车流、视频和水位样本，逐分钟核对融合值及其来源。' },
    { id: 'situation-awareness', name: '智能态势感知数据处理环节', icon: '势', start: 18, end: 21, description: '让观测驱动道路和河面，回放漫岸与低处积水，依据现场样本验收或更新场景。' },
  ];
  const materials = [
    ['cad', 'CAD 总平面图'],
    ['traffic', '交通网络图'],
    ['dem', '数字高程模型'],
  ];
  function importedMaterials(marks, applied) {
    if (!Array.isArray(marks)) return [];
    const legacy = applied && marks.includes('sources');
    return materials.filter(([id]) => legacy || marks.includes(id)).map(([id]) => id);
  }
  const referenceInputs = [
    ['plane', '平面坐标框架：CGCS2000（2000国家大地坐标系）'],
    ['height', '高程框架：1985国家高程基准'],
    ...materials,
  ];
  const referenceTasks = [...referenceInputs, ['converted', '坐标转换完成'], ['verified', '核对无误']];
  function alignLakeReference() {
    const {x, z, level} = citySurveyMap.lake;
    const target = [x, -z, level];
    // Teaching samples reproduce the horizontal and vertical offsets of the exercise.
    const aligned = [[0,0,0], [3,4,0], [3,4,.8]].map(offset => {
      const source = target.map((value, i) => value + offset[i]);
      const translation = source.map((value, i) => target[i] - value);
      return source.map((value, i) => value + translation[i]);
    });
    return {target, aligned};
  }
  const surveyKinds = { control: '控制点', check: '检查点' };
  const surveyLimit = 3;
  function surveyPointsInBounds(points, bounds) {
    if (!Array.isArray(points) || !bounds) return [];
    const accepted = [];
    const counts = { control: 0, check: 0 };
    for (const item of points.slice(0, surveyLimit * 2)) {
      if (!item || !Object.hasOwn(surveyKinds, item.kind)) continue;
      const {kind, x, z} = item;
      if (!Number.isFinite(x) || !Number.isFinite(z) || x < bounds.minX || x > bounds.maxX ||
          z < bounds.minZ || z > bounds.maxZ || counts[kind] >= surveyLimit ||
          accepted.some(point => Math.hypot(point.x - x, point.z - z) < 1)) continue;
      accepted.push({kind,x,z});
      counts[kind]++;
    }
    return accepted;
  }
  function surveyRows(points) {
    const counts = { control: 0, check: 0 };
    return points.map(({kind,x,z}) => ({
      kind, x, z, name: surveyKinds[kind] + ++counts[kind],
      X: x, Y: -z, H: citySurveyMap.groundElevation(x,z) + (bankCrest - citySurveyMap.bankProfile(4)[4][1]),
    }));
  }
  const flightParameters = [
    {id:'height', label:'飞行高度', unit:'m', min:60, max:140, best:100},
    {id:'forward', label:'航向重叠率', unit:'%', min:60, max:90, best:80},
    {id:'side', label:'旁向重叠率', unit:'%', min:30, max:80, best:60},
  ];
  function normalizeFlightSettings(settings) {
    return Object.fromEntries(flightParameters.map(({id,min,max,best}) => {
      const value = settings?.[id];
      return [id, Number.isFinite(value) ? Math.min(max,Math.max(min,Math.round(value))) : best];
    }));
  }
  function planSurveyFlight(bounds, choice, settings) {
    const {height,forward,side} = normalizeFlightSettings(settings);
    const {minX,maxX,minZ,maxZ} = bounds;
    const width = maxX-minX, depth = maxZ-minZ;
    const passes = [], footprints = [];
    for (const northSouth of (choice === 'oblique' ? [false,true] : [false])) {
      const along = northSouth ? depth : width, across = northSouth ? width : depth;
      const length = along*.34*height/100, breadth = across*.43*height/100;
      const begin = along*.04 + length/2, end = along-begin;
      const spacing = length*(1-forward/100);
      const count = Math.ceil((end-begin)/spacing)+1;
      const separation = breadth*(1-side/100);
      const locate = (a,b) => northSouth ? [minX+b,minZ+a] : [minX+a,minZ+b];
      for (const i of [0,1]) {
        const cross = across/2 + (i-.5)*separation;
        const pass = [locate(begin,cross),locate(end,cross)];
        if (i === 1) pass.reverse();
        passes.push(pass);
        for (let exposure=0; exposure<count; exposure++) {
          const [x,z] = locate(Math.min(end,begin+spacing*exposure),cross);
          const w = northSouth ? breadth : length, d = northSouth ? length : breadth;
          footprints.push({x:x-w/2,z:z-d/2,w,d});
        }
      }
    }
    return {passes,footprints};
  }
  // Reference landmarks on the same registered aerial image used to select the survey extent.
  const coverageSites = {
    bank: [.552,.524],
    corner: [.783,.600],
    glare: [.598456,.59318],
  };
  function coverageCasesForBounds(bounds) {
    const crop = citySurveyMap.imageCrop(bounds,1,1);
    return Object.keys(coverageSites).filter(id => {
      const [x,y] = coverageSites[id];
      return x >= crop.x && x <= crop.x+crop.width && y >= crop.y && y <= crop.y+crop.height;
    });
  }
  const steps = [
    ['划定范围和用途', '选择调查范围', '确定项目的边界在哪，以及建出来的模型是给谁用的（是做宏观城市规划，还是微观的交通仿真）。', [['river', '滨水片区 · 岸线与低洼路段'], ['block', '街区片区 · 路口与沿街建筑'], ['manual', '手动圈选区域']]],
    ['收集现有资料', '建立资料清单', '寻找测区内已有的、可复用的基础地理数据，避免重复劳动。', [['base', '导入三份基础资料'], ['full', '基础资料加历史汛情记录']]],
    ['统一坐标与高程', '设置参考系', '确认平面和高程框架，在三张资料图上选择同一处湖泊，再转换并核对。', [['transform', '以景观湖为公共点转换并核对'], ['local', '保留原始坐标以检查偏移']]],
    ['布设控制点与检查点', '安排测量点位', '在街区图上布设 3 个控制点和 3 个检查点，再派出外业人员获取真实三维空间坐标数据。', [['field', '外业测量 3 个控制点和 3 个检查点'], ['spread', '两端布控并留出独立检查点'], ['cluster', '集中布控并留出远端检查点']]],
    ['设计航线并采集', '选择航摄方案', '在工程范围内排布航带，操作无人机（或无人机集群）按照规划航线对测区进行拍照', [['grid', '平行航带 · 垂直摄影'], ['oblique', '交叉航带 · 增加倾斜摄影']]],
    ['检查覆盖情况并补采', '检查航片缺口', '检查测区内的待核查区域，判断航片问题，选择补拍方式，再根据局部影像验收。', [['all', '核查并补采测区内的区域'], ['bank', '加拍岸脚和护岸衔接处'], ['corner', '绕拍楼角和立面遮挡区']]],
    ['对齐照片并定位', '选择解算约束', '自动寻找不同照片里的同一个物体，算出每张照片精确的拍摄位置，并提取出海量密集的“点云”。', [['control', '匹配特征并引入控制点'], ['position', '匹配特征并仅用机载初值定位']]],
    ['生成三维和地图成果', '选择核对成果', '在点云骨架的基础上，构建三角网（把点连成面），再把照片的颜色“贴”上去（纹理映射），生成三维模型。', [['surface', '查看纹理网格和建筑立面'], ['ortho', '查看正射地图和岸线轮廓']]],
    ['检查模型精度', '选择验算指标', '把生成的三维模型拿来，用第4步测的“检查点”去量一下它的平面和高程误差。', [['plane', '检查平面误差 · 限差 0.30 m'], ['height', '检查高程误差 · 限差 0.20 m']]],
    ['城市对象建档', '检查对象属性', '为道路、建筑、河段和低洼区建立稳定编号，选择一组对象核对几何和业务属性。', [['transport', '核对道路与建筑档案'], ['water', '核对河段与低洼区档案']]],
    ['装配场景并发布', '选择发布视图', '装配模型、底图和对象索引，生成可回看的本地教学场景版本，同时保留精度核验记录。', [['survey', '发布测绘核查视图'], ['operations', '发布运行监测视图']]],
    ['盘点和测量设备', '选择设备定位方式', '到交通检测器、摄像机和河边水尺所在位置，核对编号、朝向和安装点，记录定位依据。', [['map', '以底图量取安装点'], ['field', '采用现场复测点位']]],
    ['关联设备与观测对象', '选择道路观测断面', '为检测器与摄像机选择同一处道路断面，检查两条设备关联线。水位计沿用河段测点。', [['a', '断面 A · 临江大道'], ['b', '断面 B · 云桥路']]],
    ['接入设备观测数据', '选择接入方式', '打开三台设备的样例记录，检查时间、单位和来源。检测器提供车数与速度，摄像机提供轨迹，水位计提供河面高程。', [['live', '按时间顺序接入模拟观测'], ['archive', '从归档批次读取模拟观测']]],
    ['从视频提取观测', '选择过线计数口径', '把虚拟摄像机轨迹与断面线相交的事件按方向归类，每个轨迹编号在该分钟只计一次。', [['forward', '只计正向过线'], ['both', '汇总正向与反向过线']]],
    ['清洗并对齐数据', '处理重复记录', '按事件时间对齐到同一分钟，再检查设备、方向和批次编号。08:01 有一批 8 辆的检测记录重复到达。', [['clean', '按批次去重并保留质量标记'], ['raw', '保留重复批次作对照']]],
    ['融合并记录依据', '选择车流取值方法', '在时间和方向均一致的窗口选择统计来源。水位使用河边水尺单列，融合记录保留来源、单位与质量依据。', [['quality', '检测器低质量时采用视频计数'], ['detector', '固定采用检测器并保留质量标记']]],
    ['映射观测到对象', '选择核对的映射', '把车流与速度写入道路断面，把水面高程写入河段；低洼路面积水另取现场样本。选择一条关联检查单位。', [['traffic', '跟踪车流到道路断面'], ['water', '跟踪河面高程到河段']]],
    ['生成动态画面', '选择动态画面', '回放同一时间轴，让车流和速度驱动车辆，河面随水位升高。观察末帧护岸漫溢与低处路面水迹。', [['combined', '联看车流与河面'], ['water', '重点查看河岸和低洼路面']]],
    ['状态判断与时间回放', '选择教学阈值', '逐帧比较路段速度、河面与岸顶的高差及实测路面积水深度，记录首次触发状态的时间。', [['standard', '常规阈值 · 车速低于 30 km/h，积水至少 15 cm'], ['early', '提前提示 · 车速低于 35 km/h，积水至少 10 cm']]],
    ['现场验收与更新', '处置现场复核记录', '现场复核发现 C-01 的安装台账仍缺朝向。对照末帧低洼段水深，选择登记待办或补录摄像机朝向并更新版本。', [['inspect', '保留现场验收记录和待办'], ['update', '补录朝向并发布修订版本']]],
  ].map(([title, label, description, options], index) => ({
    number: index + 1, title, label, description, options,
  }));

  const times = ['08:00', '08:01', '08:02'];
  // Each entry is one minute of a synthetic field exercise. Road depths are
  // separately observed on the low road, independent of the river gauge.
  const samples = [
    { forward: 24, reverse: 7, duplicate: 0, speed: 42, cameraForward: 23, cameraReverse: 6, riverLevel: 2.1, roadDepth: 0 },
    { forward: 36, reverse: 10, duplicate: 8, speed: 32, cameraForward: 34, cameraReverse: 9, riverLevel: 2.8, roadDepth: 0 },
    { forward: 42, reverse: 8, duplicate: 0, speed: 19, cameraForward: 40, cameraReverse: 8, riverLevel: 3.4, roadDepth: 18 },
  ];
  const bankCrest = 3.1;
  function evidence(answers, minute) {
    const row = samples[minute];
    const both = answers[14] === 'both';
    const rawCount = row.forward + (both ? row.reverse : 0) + row.duplicate;
    const detectorCount = rawCount - (answers[15] === 'raw' ? 0 : row.duplicate);
    const videoCount = row.cameraForward + (both ? row.cameraReverse : 0);
    const lowQuality = minute === 1;
    const useVideo = lowQuality && answers[16] === 'quality';
    const early = answers[19] === 'early';
    return {
      ...row, route: answers[12] || 'a', bankCrest, rawCount, detectorCount, videoCount, lowQuality,
      trafficCount: useVideo ? videoCount : detectorCount,
      source: useVideo ? 'C-01' : 'D-01',
      trafficStatus: row.speed < (early ? 35 : 30) ? '低速' : '正常',
      waterStatus: row.roadDepth >= (early ? 10 : 15) ? '积水提示' : '正常',
      overflow: row.riverLevel > bankCrest,
    };
  }

  // Simulated residuals at two held-out checkpoints. Uncorrected reference
  // offsets are common to both checkpoints and remain visible after solving.
  function checkAccuracy(answers) {
    const gain = (answers[3] === 'cluster' ? 3 : 1) * (answers[6] === 'position' ? 4 : 1);
    const raw = answers[2] === 'local';
    const points = [[0.08, 0.06, 0.06], [-0.12, 0.09, -0.08]].map(([x,y,z]) => [
      x * gain + (raw ? 3 : 0), y * gain + (raw ? 4 : 0), z * gain + (raw ? 0.8 : 0),
    ]);
    const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    return { points, plane: rms(points.map(([x,y]) => Math.hypot(x,y))), height: rms(points.map(point => point[2])) };
  }

  function result(number, answers, minute = 0) {
    const choice = answers[number - 1];
    const entry = (headline, detail) => ({ headline, detail });
    if (!choice) return entry('等待操作', '完成本步操作后可查看结果。');
    const time = times[minute];
    const s = evidence(answers, minute);
    const accuracy = checkAccuracy(answers);
    const routeLabel = s.route === 'b' ? '云桥路 B 断面' : '临江大道 A 断面';
    const scope = answers[0] === 'manual' ? '手动圈选区域' : answers[0] === 'block' ? '完整街区' : '滨水测区';
    switch (number) {
      case 1: return entry(scope + '已划定', choice === 'river' ? '调查以岸线、低洼路段和邻近交叉口为重点。' : '调查以路口、沿街建筑和相邻滨水边缘为重点。');
      case 2: return choice === 'full' ? entry('基础与历史资料已登记', '已将底图、路网及高程资料纳入' + scope + '，并保留历史汛情对照记录。') : entry('三份基础资料已登记', '已将 CAD 总平面图、交通网络图和数字高程模型纳入' + scope + '工程资料清单。');
      case 3: return choice === 'transform' ? entry('坐标转换已完成', '教学场景已记录坐标与高程统一结果。') : entry('平面错位 5.00 m', '原始资料还存在 0.80 m 高程偏差，检查点验算将保留这项误差。');
      case 4: if (choice === 'field') return entry('已生成外业测量记录表', '已测量 3 个控制点和 3 个检查点。检查点单独留作核验。');
        return entry(choice === 'spread' ? '控制点分布于测区两端' : '控制点集中于一侧', '两处独立检查点均不参与解算。' + (choice === 'spread' ? '两端均有邻近控制点。' : '远端检查点位于控制点包围范围之外。'));
      case 5: return choice === 'grid' ? entry('平行航带已采集', '垂直影像可用于地面拼接，转角立面需要额外视角。') : entry('交叉航带已采集', '垂直与倾斜影像共同覆盖街区，可比对同一建筑的多个立面。');
      case 6: if (choice === 'all') return entry('测区内待核查区域已补采并验收', '已核对所选测区内的补拍影像。');
        return entry(choice === 'bank' ? '岸脚补采完成' : '建筑转角补采完成', choice === 'bank' ? '增加岸脚斜向影像，建筑转角仍需检查原航带覆盖。' : '增加楼角侧向影像，岸脚仍需检查原航带覆盖。');
      case 7: return entry(choice === 'control' ? '控制点已参与定位' : '已按机载初值定位', '独立检查点平面均方根误差为 ' + accuracy.plane.toFixed(2) + ' m，可在精度检查时对照限差。');
      case 8: return entry(choice === 'surface' ? '已打开三维纹理网格' : '已打开正射底图', '网格和底图共享工程参考系；本次补采集中在' + (answers[5] === 'all' ? '已划定测区内发现覆盖或影像质量问题的位置。' : answers[5] === 'corner' ? '建筑转角。' : '护岸岸脚。'));
      case 9: {
        const plane = choice === 'plane';
        const value = plane ? accuracy.plane : accuracy.height;
        const limit = plane ? 0.30 : 0.20;
        return entry((plane ? '平面' : '高程') + ' RMSE ' + value.toFixed(2) + ' m', '两处独立检查点，教学限差 ' + limit.toFixed(2) + ' m。' + (value <= limit ? '本项通过。' : '本项超限，需复核坐标、控制点分布和定位约束。'));
      }
      case 10: return choice === 'transport' ? entry('已核对道路与建筑档案', '道路断面记录通行方向，建筑记录轮廓与高度，设备可沿对象编号关联。') : entry('已核对河段与低洼区档案', '河段记录岸顶高程 3.10 m，低洼路段单独记录路面积水深度。');
      case 11: {
        const passed = answers[8] === 'height' ? accuracy.height <= 0.20 : accuracy.plane <= 0.30;
        return entry((choice === 'survey' ? '测绘核查视图' : '运行监测视图') + ' · v1', (choice === 'survey' ? '默认查看底图和控制点。' : '默认查看道路和河段对象。') + (passed ? '所验指标通过，核验记录随场景保存。' : '所验指标超限，发布记录标记为待复测。'));
      }
      case 12: return entry(choice === 'field' ? '三台设备已按复测点定位' : '三台设备已按底图初定位', (choice === 'field' ? '采用现场安装点复测记录。' : '安装点来自图上量取，精度标记为初测。') + 'D-01 和 C-01 位于道路断面附近，W-01 位于河岸。');
      case 13: return entry('D-01、C-01 → ' + routeLabel, '已将两路交通观测关联到同一断面；W-01 仍直接观测河段水面。');
      case 14: return entry(time + (choice === 'live' ? ' · 模拟接入' : ' · 归档批次'), 'D-01 正向原始汇总 ' + (s.forward + s.duplicate) + ' 辆、速度 ' + s.speed + ' km/h；C-01 提供双向轨迹；W-01 河面高程 ' + s.riverLevel.toFixed(2) + ' m。');
      case 15: return entry(time + ' · ' + s.videoCount + ' 辆过线', '正向 ' + s.cameraForward + ' 辆，反向 ' + s.cameraReverse + ' 辆。本次' + (choice === 'both' ? '合并两个方向。' : '采用正向计数。'));
      case 16: return entry(time + ' · 检测器 ' + s.detectorCount + ' 辆', '同窗视频 ' + s.videoCount + ' 辆。' + (s.duplicate ? (choice === 'clean' ? '已剔除重复的 8 辆；' : '保留重复的 8 辆；') + '该窗检测器带低质量标记。' : '当前窗口无重复记录；08:01 可检验两种处理的差异。'));
      case 17: return entry(time + ' · ' + s.trafficCount + ' 辆/分', '采用 ' + s.source + '。' + (s.lowQuality ? (choice === 'quality' ? '检测器质量较低，改用同向视频计数。' : '按固定策略保留低质量检测器读数。') : '检测器质量正常。') + ' W-01 水位独立保留。');
      case 18: return entry(choice === 'traffic' ? routeLabel + ' · ' + s.trafficCount + ' 辆/分' : '河段 · ' + s.riverLevel.toFixed(2) + ' m', choice === 'traffic' ? '计数来源 ' + s.source + '，D-01 提供平均速度 ' + s.speed + ' km/h。' : 'W-01 提供河面高程；同期低洼路段现场样本为 ' + s.roadDepth + ' cm。');
      case 19: return entry(choice === 'combined' ? time + ' · 车流与河面' : time + ' · 河岸近景', (choice === 'combined' ? '道路车流 ' + s.trafficCount + ' 辆/分，平均 ' + s.speed + ' km/h。' : '') + '河面 ' + s.riverLevel.toFixed(2) + ' m，' + (s.overflow ? '高于样例岸顶，低洼段同期见水 18 cm。' : '低于样例岸顶，低洼段现场未见积水。'));
      case 20: return entry(time + ' · ' + s.trafficStatus + ' / ' + s.waterStatus, '按所选阈值，回放中首次低速为 ' + (choice === 'early' ? '08:01' : '08:02') + '，首次积水提示为 08:02。当前车速 ' + s.speed + ' km/h，实测积水 ' + s.roadDepth + ' cm。');
      case 21: return entry(choice === 'inspect' ? 'v1 · 已登记待办' : 'v2 · 已更新设备台账', '末帧低洼路段回放值与现场样本均为 18 cm。' + (choice === 'inspect' ? '保留 C-01 朝向待补录事项。' : '按现场照片将 C-01 朝向补录为面向正向来车，保留 v1 供复查。'));
      default: return entry('等待操作', '');
    }
  }

  function visual(answers, minute = 0) {
    return { stage: answers.length, answers: [...answers], minute, draft: false, draftStep: null, accuracy: checkAccuracy(answers), ...evidence(answers, minute) };
  }

  function previewVisual(applied, candidate, minute = 0) {
    const changedIndex = candidate.findIndex((answer, index) => applied[index] !== answer);
    return { ...visual(candidate, minute), draft: true, draftStep: changedIndex === -1 ? candidate.length : changedIndex + 1 };
  }

  return { modules, steps, times, purposes, materials, importedMaterials, referenceInputs, referenceTasks, alignLakeReference, surveyKinds, surveyLimit, surveyPointsInBounds, surveyRows, flightParameters, normalizeFlightSettings, planSurveyFlight, coverageSites, coverageCasesForBounds, result, visual, previewVisual };
})();
