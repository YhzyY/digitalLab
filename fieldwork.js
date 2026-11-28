'use strict';

globalThis.cityFieldwork = (() => {
  const devices = {
    'D-01': { name: '路侧检测器', site: '路口立杆', field: 'veh_count', metric: '车流量', unit: '辆/分', height: '4.6 m', photo: 1 },
    'C-01': { name: '路口摄像机', site: '路口摄像杆', field: 'track_id', metric: '车辆轨迹', unit: '轨迹编号', height: '7.3 m', photo: 1 },
    'W-01': { name: '河岸水位计', site: '河边水尺', field: 'water_level', metric: '水面高程', unit: 'm', height: '水尺零点见高程台账', photo: 2 },
  };
  const ids = Object.keys(devices);
  const requirements = {
    ...surveyWork.requirements,
    12: ids.map(id => [id, '登记 ' + id]),
    13: ids.map(id => [id, '关联 ' + id]),
    14: ids.map(id => [id, '接入 ' + id]),
    ...monitoringWork.requirements,
  };

  function add(parent, tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  }

  function button(parent, label, handler) {
    const node = add(parent, 'button', label);
    node.type = 'button';
    node.onclick = handler;
    return node;
  }


  function installationPoint(visual, id) {
    // Rounded survey coordinates for the two traffic cross-sections and gauge.
    const points = visual.route === 'b' ? [[-81.55, -10], [-94.6, -24]] : [[-48, 32.6], [-60, 45.65]];
    const [x, z] = id === 'W-01' ? [64.63, 10] : points[id === 'D-01' ? 0 : 1];
    const preliminary = visual.answers?.[11] === 'map';
    return { x: x + (preliminary ? .85 : 0), z: z + (preliminary ? 1.25 : 0) };
  }

  function signal(kit, id, label, progress) {
    kit.signal?.({ kind: id, label, progress, position: installationPoint(kit.visual, id) });
  }

  function open(number, kit) {
    if (number < 12) return surveyWork.open(number, kit);
    if (number > 14) return monitoringWork.open(number, kit);
    const body = add(kit.body, 'div');
    body.className = 'device-work';
    if (number === 13) {
      add(body, 'p', '按设备实际观测的物体建立关系。两台交通设备观测同一断面，水位计观测河段。');
      const options = [['a', '临江大道 · 断面 A'], ['b', '云桥路 · 断面 B'], ['water', 'H-01 · 河段水面']];
      for (const id of ids) {
        const row = add(body, 'div');
        row.className = 'device-row';
        const target = appendChoice(row, id + ' ' + devices[id].name, options);
        const expected = id === 'W-01' ? 'water' : kit.chosen;
        if (kit.completed.has(id)) target.value = expected;
        const status = add(row, 'small', kit.completed.has(id) ? '已建立关联' : '');
        status.setAttribute('role', 'status');
        target.onchange = () => signal(kit, id, '预览关联 · ' + target.selectedOptions[0].textContent, 0.5);
        button(row, '建立关联', () => {
          if (target.value !== expected) {
            status.textContent = id === 'W-01' ? '查阅水尺台账，选择它观测的河段。' : '请核对上方所选断面和交通设备的观测方向。';
            return;
          }
          kit.record(id);
          status.textContent = id + ' → ' + target.selectedOptions[0].textContent;
          signal(kit, id, status.textContent, 1);
        });
      }
      return;
    }
    add(body, 'p', number === 12 ? '点击场景中的设备标签，查看安装记录并登记安装位置。' : '点击场景中的设备标签，核对观测字段，接入本次实验的三路样例记录。');
    const group = add(body, 'div');
    group.className = 'device-picks';
    for (const id of ids) button(group, id + ' ' + devices[id].name, () => kit.inspect(id));
  }

  function inspect(number, kit, id) {
    const device = devices[id];
    if (!device) return;
    const body = add(kit.body, 'div');
    body.className = 'device-work';
    add(body, 'strong', id + ' · ' + device.name);
    signal(kit, id, '定位 ' + id + ' · ' + device.site, 0.25);
    if (id === 'C-01' && number >= 14) {
      const canvas = add(body, 'canvas');
      canvas.width = 640;
      canvas.height = 360;
      canvas.setAttribute('aria-label', '固定路口机位实时渲染的模拟监控画面');
      kit.attachCamera(canvas);
      add(body, 'small', '模拟监控 · 固定机位');
    } else {
      const img = add(body, 'img');
      img.src = kit.photoUrl(device.photo);
      img.alt = device.site + '的模拟现场照片';
    }
    const observed = kit.visual;
    const observationTime = cityExperiment.times[observed.minute];
    if (number === 12) {
      const point = installationPoint(observed, id);
      add(body, 'p', device.site + ' · ' + device.height + ' · ' + (kit.chosen === 'field' ? '现场复测' : '底图初测'));
      add(body, 'small', '局部坐标 · 东 ' + point.x.toFixed(1) + ' m，北 ' + (-point.z).toFixed(1) + ' m');
    } else {
      const value = id === 'D-01' ? (observed.forward + observed.duplicate) + ' 辆正向通过，平均速度 ' + observed.speed + ' km/h'
        : id === 'W-01' ? observed.riverLevel.toFixed(2) + ' m，采用街区统一高程基准'
        : '正向 ' + observed.cameraForward + ' 条、反向 ' + observed.cameraReverse + ' 条轨迹';
      add(body, 'p', observationTime + ' · ' + value);
      add(body, 'small', device.field + '　' + device.metric + '（' + device.unit + '）');
    }
    if ((number !== 12 && number !== 14) || kit.locked) return;
    const isInventory = number === 12;
    const select = appendChoice(body, isInventory ? '安装位置' : '映射观测字段', ids.map(key => [key, isInventory ? devices[key].site : devices[key].field + ' · ' + devices[key].unit]));
    const status = add(body, 'small', kit.completed.has(id) ? '已登记' : '');
    status.setAttribute('role', 'status');
    select.onchange = () => signal(kit, id, select.selectedOptions[0].textContent, 0.6);
    button(body, isInventory ? '登记安装点' : '接入这路观测', () => {
      if (select.value !== id) {
        status.textContent = isInventory ? '请根据照片和台账核对安装位置。' : '请核对原始记录的字段名和单位。';
        return;
      }
      kit.record(id);
      status.textContent = id + (isInventory ? ' 已登记安装点。' : ' 的观测已关联到当前时间窗口。');
      signal(kit, id, status.textContent, 1);
    });
  }

  return { requirements, open, inspect };
})();
