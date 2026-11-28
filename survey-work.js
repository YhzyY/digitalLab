'use strict';

globalThis.surveyWork = (() => {
  const requirements = {
    1: [['bounds', '落定测区边界']],
    2: cityExperiment.materials,
    3: cityExperiment.referenceTasks,
    4: [['control', '获取外业测量坐标']],
    5: [['capture', '完成航带采集']],
    6: [['bank', '核验滨河步道'], ['corner', '核验建筑转角'], ['glare', '核验桥台护岸']],
    7: [['matching', '配对同名点并解算']],
    8: [['products', '生成网格与正射图']],
    9: [['residuals', '核算检查点误差']],
    10: [['registry', '登记对象类别']],
    11: [['assembly', '装配并发布场景']],
  };

  function element(tag, parent, label, className) {
    const el = document.createElement(tag);
    if (label !== undefined) el.textContent = label;
    if (className) el.className = className;
    parent.append(el);
    return el;
  }

  function action(parent, label, fn) {
    const button = element('button', parent, label);
    button.type = 'button';
    button.addEventListener('click', fn);
    return button;
  }


  function num(parent, label, value) {
    const wrap = element('label', parent, label + ' ');
    const el = element('input', wrap);
    el.type = 'number';
    el.step = 'any';
    el.value = value;
    return el;
  }

  function table(parent, headers, rows) {
    const grid = element('table', parent);
    const head = element('tr', element('thead', grid));
    headers.forEach(label => element('th', head, label).scope = 'col');
    const body = element('tbody', grid);
    rows.forEach(row => {
      const line = element('tr', body);
      row.forEach(cell => element('td', line, cell));
    });
    return grid;
  }

  function plan(parent, label) {
    const node = element('div', parent, '', 'sw-plan');
    node.setAttribute('aria-label', label);
    node.setAttribute('role', 'group');
    const canvas = element('canvas', node);
    canvas.width = 640;
    canvas.height = 300;
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    return {node, ctx};
  }

  function terrain(ctx) {
    ctx.fillStyle = '#e0e8d8';
    ctx.fillRect(0, 0, 640, 300);
    ctx.fillStyle = '#a4cbd2';
    ctx.beginPath(); ctx.moveTo(485, 0); ctx.lineTo(553, 160); ctx.lineTo(534, 300); ctx.lineTo(640, 300); ctx.lineTo(640, 0); ctx.fill();
    ctx.fillStyle = '#b2bfb3';
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        ctx.fillRect(22 + i * 76, 10 + j * 106, 48, 58);
      }
    }
    ctx.fillStyle = '#f8f5ea';
    ctx.fillRect(0, 79, 512, 21);
    ctx.fillRect(241, 0, 18, 300);
    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#486051';
    ctx.fillText('临江大道', 46, 95);
    ctx.fillText('河段', 564, 150);
  }

  function pin(node, x, y, label, fn) {
    const button = action(node, label, fn);
    button.className = 'sw-pin';
    button.style.left = x + '%';
    button.style.top = y + '%';
    return button;
  }

  function extent(ui) {
    ui.hint('在主画面的航拍底图上圈定范围，再应用测区。后续的道路、建筑、河道和设备均按所选边界显示。');
  }

  async function inspectFlightImage(bounds, url) {
    const dialog = document.createElement('dialog');
    dialog.className = 'device-dialog source-dialog flight-image-dialog';
    dialog.setAttribute('aria-label','检查采集图像');
    const close = action(dialog,'关闭 ×',() => dialog.close());
    close.className = 'dialog-close';
    const feedback = element('p',dialog,'正在加载测区航拍图…');
    feedback.setAttribute('role','status');
    document.body.append(dialog);
    dialog.addEventListener('close',() => dialog.remove(),{once:true});
    dialog.showModal();

    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!dialog.open) return;
      const {x,y,width,height} = citySurveyMap.imageCrop(bounds,image.naturalWidth,image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label','第 1 步所选测区的连续航拍影像');
      canvas.getContext('2d').drawImage(image,x,y,width,height,0,0,canvas.width,canvas.height);
      feedback.hidden = true;
      dialog.append(canvas);
      const size = [bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ].map(value=>Number(value.toFixed(1)));
      element('p',dialog,'第 1 步已选测区 · '+size.join(' × ')+' m','flight-image-size');
    } catch {
      feedback.textContent = '暂时无法加载测区航拍图。请关闭后重试。';
    }
  }

  function flight(ui) {
    const {flightParameters, normalizeFlightSettings} = cityExperiment;
    const form = element('div',ui.main,undefined,'flight-parameters');
    const inputs = flightParameters.map(({id,label,unit,min,max,best}) => {
      const row = element('div',form,undefined,'flight-parameter');
      const caption = element('label',row,label);
      caption.htmlFor = 'flight-' + id;
      const value = element('output',caption);
      const scale = element('div',row,undefined,'flight-range');
      const input = element('input',scale);
      Object.assign(input,{id:caption.htmlFor, type:'range', min, max, value:ui.flightSettings[id], disabled:ui.locked});
      value.setAttribute('for',input.id);
      const track = element('div',scale,undefined,'flight-best-track');
      const bestLabel = element('span',track,undefined,'flight-best');
      bestLabel.id = input.id + '-best';
      bestLabel.style.left = (best-min)/(max-min)*100 + '%';
      element('span',bestLabel,'最佳' + label + ' · ' + best + unit);
      input.setAttribute('aria-describedby',bestLabel.id);
      const refresh = () => {
        value.textContent = '（' + input.value + unit + '）';
        input.setAttribute('aria-valuetext',input.value + unit);
      };
      input.addEventListener('input',refresh);
      refresh();
      return [id,input];
    });
    const bounds = ui.visual.bounds || citySurveyMap.extent;
    const readSettings = () => normalizeFlightSettings(Object.fromEntries(inputs.map(([id,input])=>[id,input.valueAsNumber])));
    function draw() {
      const plan = cityExperiment.planSurveyFlight(bounds,ui.chosen,readSettings());
      ui.paintFlight(plan.footprints);
      return plan;
    }
    for (const [,input] of inputs) {
      input.addEventListener('input',() => {
        ui.updateFlightSettings(readSettings());
        draw();
        if (ui.chosen) ui.say('参数已调整，请按新参数飞行采集。');
      });
      input.addEventListener('change',ui.saveFlightSettings);
    }
    ui.hint('图中蓝色框表示照片图幅，颜色较深的区域表示多张照片重叠。');
    const {passes,footprints} = draw();
    if (ui.completed.has('capture')) {
      ui.say('已采集 '+passes.length+' 条航带、'+footprints.length+' 幅模拟影像。 ');
      const inspect = action(ui.status,'检查图像',() => inspectFlightImage(bounds,ui.photoUrl(0)));
      inspect.className = 'flight-inspect';
      inspect.setAttribute('aria-haspopup','dialog');
    }
  }

  function matching(ui) {
    ui.hint('两幅教学像片由同一幅航拍图的重叠裁片生成。先点左片标志，再点右片同一地物；找到两对同名点后解算。');
    const pair=element('div',ui.main,'','sw-pair');
    const targets=[[39,35],[62,54],[51,72]];
    const labels=[['A','B','C'],['γ','α','β']];
    let pending=null;
    const matched=new Set();
    for(let side=0;side<2;side++){
      const section=element('div',pair);
      element('strong',section,side?'右片':'左片');
      const photo=element('div',section,'','sw-match');
      // Each crop shows 80% of the source image, with its origin offset by 0 or 20%.
      photo.style.backgroundImage='url("'+ui.photoUrl(0)+'")';
      photo.style.backgroundPosition=side?'right top':'left top';
      targets.forEach(([x,y],i)=>pin(photo,(x-(side?20:0))/.8,y,labels[side][i],e=>{
        if(!side) {
          pending=i;photo.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===e.currentTarget)));
          ui.say('已选左片 '+labels[0][i]+'。在右片查找同一处地物。');
        } else if(pending===null) ui.say('请先在左片选择标志。');
        else if(pending!==i) ui.say('两处标志不在同一地物上，请比较重叠区域的纹理和邻近标志。');
        else {
          matched.add(i);pending=null;ui.signal?.({kind:'matching',label:'核对同名点 '+labels[0][i],progress:matched.size/targets.length});
          e.currentTarget.setAttribute('aria-pressed','true');
          ui.say('已建立 '+matched.size+' 对独立匹配。');
        }
      }));
    }
    action(ui.main,'运行定位解算',()=>{
      if(matched.size<2) return ui.say('至少需要两对不同地物的匹配以完成此缩略练习。');
      ui.finish('已核对 '+matched.size+' 对特征。其余样例匹配参与模拟解算，'+(ui.chosen==='control'?'引入地面控制点约束。':'采用机载初始位置。'));
    });
  }

  function products(ui) {
    ui.hint('根据同名点采样模型表面，再分别建立三角网和顶视底图。可在生成后切换查看成果。');
    const {ctx}=plan(ui.main,'点云、网格与正射底图预览');
    ctx.fillStyle='#e7eee6';ctx.fillRect(0,0,640,300);
    let cloud=false;
    const products=new Set();
    const nodes=[];
    for(let y=0;y<11;y++){
      const row=[];
      for(let x=0;x<19;x++){
        const roof=((x>1&&x<5)||(x>8&&x<12)) && y>2&&y<7;
        const z=roof?53:3*Math.sin(x*.35+y*.62);
        row.push([150+x*20-y*8,113+y*12+x*2-z]);
      }
      nodes.push(row);
    }
    function render(mesh) {
      ctx.fillStyle='#233b37';ctx.fillRect(0,0,640,300);
      ctx.fillStyle='#bbe4bb';ctx.strokeStyle='#7baf97';ctx.lineWidth=1;
      nodes.forEach((row,y)=>row.forEach(([x,v],i)=>{
        if(mesh && i && y){
          ctx.beginPath();ctx.moveTo(...row[i-1]);ctx.lineTo(x,v);ctx.lineTo(...nodes[y-1][i]);ctx.lineTo(...row[i-1]);ctx.stroke();
        }
        ctx.fillRect(x-1,v-1,3,3);
      }));
    }
    action(ui.main,'生成采样点云',()=>{cloud=true;render(false);ui.signal?.({kind:'cloud',label:'生成表面采样点云',progress:.35});ui.say('已生成 '+nodes.flat().length+' 个教学表面采样点。');});
    [['mesh','构建三角网'],['map','生成正射底图']].forEach(([id,label])=>action(ui.main,label,()=>{
      if(!cloud) return ui.say('请先生成采样点云。');
      products.add(id);ui.signal?.({kind:id,label,progress:(products.size+1)/3});
      if(id==='mesh') render(true); else terrain(ctx);
      const msg=id==='mesh'?'已连接相邻采样点并显示三角网。':'已切换为正射底图示意，显示道路、建筑和岸线。';
      if(products.size===2) ui.finish(msg+' 两项成果均已生成。'); else ui.say(msg+' 请继续生成另一项成果。');
    }));
  }

  function residuals(ui) {
    const plane=ui.chosen==='plane';
    const {points,plane:planeRms,height:heightRms}=ui.visual.accuracy;
    ui.hint('检查点独立于解算。平面 RMSE = √[Σ(ΔE² + ΔN²) / n]，高程 RMSE = √[ΣΔH² / n]。请算出所选指标并判断是否通过。');
    table(ui.main,['检查点','ΔE（m）','ΔN（m）','ΔH（m）'],points.map((row,i)=>['Q-0'+(i+1),...row.map(v=>v.toFixed(2))]));
    const field=num(ui.main,(plane?'平面':'高程')+' RMSE（m，保留两位小数）','');
    const limit=plane?.30:.20;
    const status=appendChoice(ui.main,'限差 '+limit.toFixed(2)+' m',[['yes','通过'],['no','超限']]);
    action(ui.main,'提交误差核算',()=>{
      const rms=plane?planeRms:heightRms;
      if(!Number.isFinite(field.valueAsNumber)||Math.abs(field.valueAsNumber-rms)>0.0051) return ui.say('计算值有误。先对两个检查点分别求误差平方，再取均值并开平方。');
      if(status.value!==(rms<=limit?'yes':'no')) return ui.say('请比较误差与限差重新判断。');
      ui.finish('RMSE '+rms.toFixed(2)+' m，已记录'+(rms<=limit?'通过':'超限')+'。');
    });
  }

  function registry(ui) {
    const water=ui.chosen==='water';
    const fixtures=water ? [
      ['RV-01','河岸断面 · 岸顶高程 3.10 m','river'],['L-01','低洼路面 · 积水深度以 cm 记录','low'],
    ] : [
      ['R-A','临江大道 · 通行方向与道路断面','road'],['B-01','沿街楼体 · 轮廓与屋顶高程','building'],
    ];
    ui.hint('依据原始测绘记录为两个待入库对象确定类别，检查编号和字段后写入对象索引。');
    const options=[['road','道路断面'],['building','建筑'],['river','河段'],['low','低洼路段']];
    const controls=fixtures.map(([id,name])=>{
      const row=element('div',ui.main,'','sw-file');
      element('strong',row,id);element('span',row,name);
      return appendChoice(row,'类别',options);
    });
    action(ui.main,'写入对象索引',()=>{
      const invalid=fixtures.findIndex((obj,i)=>controls[i].value!==obj[2]);
      if(invalid>=0) return ui.say('请复核 '+fixtures[invalid][0]+' 的业务字段和要素类。');
      ui.finish('已归档 '+fixtures.map(obj=>obj[0]).join('、')+'，后续设备关联可按编号定位。');
    });
  }

  function assembly(ui) {
    ui.hint('从底到顶装配图层。先装底图，再装纹理网格，最后挂接对象索引，检查各层后发布。');
    const {ctx}=plan(ui.main,'已装配图层');
    const layers=[];
    function draw(){
      ctx.fillStyle='#edf2ed';ctx.fillRect(0,0,640,300);
      if(layers.length>0) terrain(ctx);
      if(layers.length>1){
        ctx.fillStyle='#81988a';ctx.strokeStyle='#718778';
        for(const [x,y] of [[76,29],[170,172],[322,43],[385,188]]){
          ctx.fillRect(x,y,49,36);ctx.strokeRect(x+5,y-7,49,36);
        }
      }
      if(layers.length>2){
        ctx.font='bold 18px sans-serif';ctx.fillStyle='#22513d';
        ctx.fillText('R-A',300,99);ctx.fillText('B-01',173,162);ctx.fillText('RV-01',532,211);
      }
    }
    draw();
    const names=['正射底图','纹理网格','对象索引'];
    const chosen=appendChoice(ui.main,'待装配资源',[['2',names[2]],['0',names[0]],['1',names[1]]]);
    action(ui.main,'添加到场景',()=>{
      if (!chosen.value) return ui.say('请先选择待装配资源。');
      const i=Number(chosen.value);
      if(layers.includes(i)) return ui.say('该层已加入。');
      if(i!==layers.length) return ui.say('需要先装配'+names[layers.length]+'。');
      layers.push(i);draw();ui.signal?.({kind:'layer',label:'装配'+names[i],progress:layers.length/3});ui.say('当前图层顺序 '+layers.map(index=>names[index]).join(' → '));
    });
    action(ui.main,'发布本地场景 v1',()=>{
      if(layers.length!==3) return ui.say('需先装配全部三层。');
      ui.finish('本地场景 v1 已装配。默认打开'+(ui.chosen==='survey'?'测绘核查':'运行监测')+'视图。');
    });
  }

  const exercises=[extent,null,null,null,flight,null,matching,products,residuals,registry,assembly];
  function open(number,kit) {
    const [id,label]=requirements[number][0];
    const main=element('section',kit.body,'','sw-work');
    const status=element('p',main,kit.completed.has(id)?'已记录 · '+label:'','sw-status');
    status.setAttribute('role','status');
    const ui={...kit,main,status,
      hint:msg=>element('p',main,msg,'sw-hint'),
      say:msg=>{status.textContent=msg;},
      finish:msg=>{kit.signal?.({kind:id,label,progress:1});kit.record(id);status.textContent=msg;status.dataset.done='true';},
    };
    exercises[number-1](ui);
    (kit.statusHost || main).append(status);
  }
  return {requirements,open};
})();
