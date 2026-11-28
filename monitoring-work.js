'use strict';

globalThis.monitoringWork = (() => {
  const requirements = {
    15: [['tracks', '复核过线轨迹数']],
    16: [['duplicate', '找出重复的设备批次']],
    17: [['source', '选定低质量窗口的计数来源']],
    18: [['mapping', '写入道路与河段属性']],
    19: [['replay', '对照首末帧动态场景']],
    20: [['alerts', '核定首次触发时刻']],
    21: [['acceptance', '完成现场复核与版本处置']],
  };

  function add(parent, tag, text, cls) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    parent.append(el);
    return el;
  }
  function button(parent, text, call) {
    const el = add(parent, 'button', text);
    el.type = 'button'; el.addEventListener('click', call);
    return el;
  }
  function numeric(parent, label) {
    const el = add(add(parent,'label',label+' '),'input');
    el.type='number';el.step='1';el.min='0';
    return el;
  }
  function table(parent, labels, data) {
    const el=add(parent,'table');
    const head=add(add(el,'thead'),'tr');
    labels.forEach(label=>add(head,'th',label).scope='col');
    const rows=add(el,'tbody');
    data.forEach(row=>{const tr=add(rows,'tr');row.forEach(x=>add(tr,'td',x));});
  }
  const time = i => globalThis.cityExperiment.times[i];

  function tracks(ui) {
    const s=ui.visual;
    const forwardOnly=ui.chosen==='forward';
    ui.hint(time(s.minute)+' 的 C-01 模拟轨迹。黄色线为计数断面。逐帧或拖动进度条，按'+(forwardOnly?'正向':'双向')+'口径核对过线车辆。');
    const holder=add(ui.main,'div','','sw-plan');
    const canvas=add(holder,'canvas');
    canvas.width=640; canvas.height=155; canvas.setAttribute('aria-label','C-01 双向车辆轨迹回放，可用下方事件表核对轨迹');
    const ctx=canvas.getContext('2d');
    const events=[];
    for(const [prefix,count] of [['F',s.cameraForward],['R',s.cameraReverse]]) {
      for(let j=0;j<count;j++) events.push({id:prefix+String(j+1).padStart(2,'0'),dir:prefix,t:1+(j+.5)*57/count});
    }
    events.sort((a,b)=>a.t-b.t);
    const controls=add(ui.main,'div','','sw-inputs');
    let position=0, reachedEnd=false, frame=0, running=false;
    const toggle=button(controls,'播放（6 倍速）',()=>{
      if(running) return stop();
      if(position>=60) draw(0);
      running=true;toggle.textContent='暂停';
      let previous=performance.now();
      const tick=now=>{
        if(!canvas.isConnected || !running || canvas.closest('dialog:not([open])')) {stop();return;}
        draw(Math.min(60,position+(now-previous)*.006));previous=now;
        if(position<60) frame=requestAnimationFrame(tick); else stop();
      };
      frame=requestAnimationFrame(tick);
    });
    function stop() {
      running=false;cancelAnimationFrame(frame);toggle.textContent='播放（6 倍速）';
    }
    button(controls,'前进 5 秒',()=>{stop();draw(Math.min(60,position+5));});
    const range=add(add(controls,'label','片内时间 '),'input');range.type='range';range.min='0';range.max='60';range.step='0.1';
    range.addEventListener('input',()=>{stop();draw(range.valueAsNumber);});
    const stamp=add(controls,'output');
    const ledger=add(ui.main,'details');
    add(ledger,'summary','查看已过线的轨迹编号和时间');
    const trackList=add(ledger,'p');trackList.style.maxHeight='9rem';trackList.style.overflow='auto';
    function draw(t){
      if (Math.floor(position / 5) !== Math.floor(t / 5)) ui.signal?.({kind:'tracks',label:'核对过线轨迹 '+Math.floor(t)+' 秒',progress:t/60});
      position=t;reachedEnd ||= t>=60; range.value=String(t);
      stamp.textContent=Math.floor(t)+' / 60 秒';
      ctx.fillStyle='#364741';ctx.fillRect(0,0,640,155);
      ctx.strokeStyle='#d5dbce';ctx.lineWidth=2;ctx.setLineDash([16,13]);ctx.beginPath();ctx.moveTo(0,77);ctx.lineTo(640,77);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#ffdf74';ctx.fillRect(319,0,3,155);
      ctx.font='14px sans-serif';ctx.fillText('正向 →',12,18);ctx.fillText('← 反向',12,151);
      for(const event of events){
        const x=320+(t-event.t)*(event.dir==='F'?84:-84);
        if(x<-25||x>665) continue;
        const top=event.dir==='F'?38:96;
        ctx.fillStyle=event.dir==='F'?'#a3dcca':'#c2d6ed';ctx.fillRect(x-20,top,40,21);
        ctx.fillStyle='#24382f';ctx.fillText(event.id,x-16,top+16);
      }
      trackList.textContent=events.filter(e=>e.t<=t).map(e=>e.id+' @ '+e.t.toFixed(1)+' s').join(' · ') || '尚无过线事件。';
    }
    draw(0);
    const count=numeric(ui.main,forwardOnly?'正向过线数（辆）':'双向合计（辆）');
    button(ui.main,'核对视频计数',()=>{
      if(!reachedEnd) return ui.say('请先回放或拖动到本窗口结束，检查完整一分钟的事件。');
      const expected=s.cameraForward+(forwardOnly?0:s.cameraReverse);
      if(count.valueAsNumber!==expected) return ui.say('计数不符。F 为正向，R 为反向，按本步口径核对事件编号。');
      ui.finish('已核实 '+time(s.minute)+' '+expected+' 辆，保留方向和轨迹编号。');
    });
  }

  function duplicate(ui) {
    const row=ui.at(1), both=row.answers[14]==='both';
    const batches=[
      ['08:01:22','08:01:23','F-01','正向',row.forward-row.duplicate],
      ['08:01:44','08:01:45','F-02','正向',row.duplicate],
      ['08:01:48','08:01:49','R-01','反向',row.reverse],
      ['08:01:44','08:01:52','F-02','正向',row.duplicate],
    ];
    ui.hint('检查 D-01 接收日志。同设备、事件时刻、方向、批次号全部相同的一批可能重传。圈出后到的副本，再对齐到 C-01 的 08:01 窗口。');
    table(ui.main,['行','事件时间','接收时间','批次','方向','车数'],batches.map((b,i)=>[i+1,...b]));
    const line=appendChoice(ui.main,'后到的重复行',batches.map((_,i)=>[String(i+1),'第 '+(i+1)+' 行']));
    const win=appendChoice(ui.main,'对应的视频窗口',[['0',time(0)],['1',time(1)],['2',time(2)]]);
    button(ui.main,ui.chosen==='raw'?'标记并保留对照批次':'标记并剔除重复批次',()=>{
      if(line.value!=='4') return ui.say('对照事件时刻与批次号，标记接收较晚的副本。');
      if(win.value!=='1') return ui.say('请按事件时间归入对应的一分钟窗口。');
      const count=row.forward+(both?row.reverse:0)+(ui.chosen==='raw'?row.duplicate:0);
      ui.finish('F-02 重传 '+row.duplicate+' 辆；所选方向处理后共 '+count+' 辆，仍保留设备质量标记。');
    });
  }

  function source(ui) {
    const row=ui.at(1);
    ui.hint('当前 08:01，两路设备共用同一断面、方向和窗口。根据已选策略挑选来源，填写采纳值，保留证据。');
    table(ui.main,['来源','数据','质量'],[['D-01',row.detectorCount+' 辆','低 · 检测器质量标记'],['C-01',row.videoCount+' 辆','已核对过线轨迹'],['W-01',row.riverLevel.toFixed(2)+' m','河面观测']]);
    const picked=appendChoice(ui.main,'计数来源',[['D-01','D-01 检测器'],['C-01','C-01 视频'],['W-01','W-01 水位计']]);
    const value=numeric(ui.main,'采纳值（辆/分）');
    button(ui.main,'写入融合依据',()=>{
      const video=ui.chosen==='quality';
      if(picked.value!==(video?'C-01':'D-01')) return ui.say(video?'低质量窗口按策略采用视频轨迹计数。':'本次选择了固定检测器策略。');
      if(value.valueAsNumber!==(video?row.videoCount:row.detectorCount)) return ui.say('请填写所选来源在本窗口的计数。');
      ui.finish(time(1)+' 已采纳 '+picked.value+' 的 '+value.value+' 辆/分，来源和质量记录已关联。');
    });
  }

  function mapping(ui) {
    const s=ui.visual;
    const road=s.route==='a'?'临江大道 A 断面':'云桥路 B 断面';
    ui.hint('把本帧的两条观测写入对应对象属性，利用单位、设备类型与断面绑定记录判断。');
    const objects=[['river','河段 · 水面高程（m）'],['road',road+' · 车流量（辆/分）'],['low','低洼路段 · 路面积水（cm）']];
    const c=appendChoice(ui.main,s.source+' · '+s.trafficCount+' 辆/分',objects);
    const w=appendChoice(ui.main,'W-01 · '+s.riverLevel.toFixed(2)+' m',objects);
    button(ui.main,'写入对象属性',()=>{
      if(c.value!=='road'||w.value!=='river')return ui.say('断面接收车流量，河段接收水面高程。低洼路段另有现场积水记录。');
      ui.finish('两条观测均已绑定。当前重点核对'+(ui.chosen==='water'?'河段 RV-01。':road+'。'));
    });
  }

  function timeline(ui,onFrame) {
    const controls=add(ui.main,'div','','sw-inputs');
    const reading=add(ui.main,'output');
    const visited=new Set();
    const buttons=[0,1,2].map(i=>button(controls,time(i),()=>{
      const s=ui.at(i);
      ui.setMinute(i); visited.add(i);ui.signal?.({kind:'replay',label:'回放 '+time(i),progress:i/2});
      buttons.forEach((b,n)=>b.setAttribute('aria-pressed',String(n===i)));
      reading.textContent=time(i)+' · '+s.trafficCount+' 辆/分 · '+s.speed+' km/h · 河面 '+s.riverLevel.toFixed(2)+' m · 路面积水 '+s.roadDepth+' cm';
      if(onFrame)onFrame(i,s);
    }));
    return visited;
  }

  function replay(ui) {
    ui.hint(ui.chosen==='water'?'在主场景沿岸观察水线，比较初始与末帧低洼路段的变化。':'在主场景切换初始与末帧，比较路段通行和滨水路面的变化。');
    const visited=timeline(ui);
    const change=appendChoice(ui.main,'末帧所见',[['clear','河面仍低于岸顶，路面干燥'],['spill','河面超过岸顶，低洼路面有积水'],['unknown','水位缺测']]);
    button(ui.main,'记录动态对照',()=>{
      if(!visited.has(0)||!visited.has(2))return ui.say('请分别在主场景查看 08:00 和 08:02。');
      if(change.value!=='spill')return ui.say('对照末帧 3.40 m 河面、3.10 m 岸顶和低洼段现场样本。');
      const end=ui.at(2);
      ui.finish('已核对首末帧，末帧河面高出岸顶 '+(end.riverLevel-end.bankCrest).toFixed(2)+' m，低洼段同期积水 '+end.roadDepth+' cm。');
    });
  }

  function thresholds(ui) {
    const early=ui.chosen==='early', slow=early?35:30, wet=early?10:15;
    ui.hint('逐帧查看主场景。速度低于 '+slow+' km/h 触发低速，现场水深达到 '+wet+' cm 触发积水提示。找出各自第一次触发的时刻。');
    const visited=timeline(ui);
    const windows=[0,1,2].map(i=>[String(i),time(i)]);
    const speed=appendChoice(ui.main,'首次低速',windows),water=appendChoice(ui.main,'首次积水提示',windows);
    button(ui.main,'核定触发窗口',()=>{
      if(visited.size!==3)return ui.say('请依次检查三个时间窗口的速度与水深。');
      const rows=[0,1,2].map(i=>ui.at(i));
      const firstSpeed=rows.findIndex(s=>s.speed<slow),firstWet=rows.findIndex(s=>s.roadDepth>=wet);
      if(speed.value!==String(firstSpeed)||water.value!==String(firstWet))return ui.say('请分别从首帧开始比较速度和水深，取每条规则最早命中的窗口。');
      ui.finish('低速首次出现在 '+time(firstSpeed)+'，积水提示首次出现在 '+time(firstWet)+'。');
    });
  }

  function acceptance(ui) {
    const last=ui.at(2);
    ui.hint('对照低洼路段末帧属性与现场标尺。再模拟设备离线，区分历史回放和当前可用性，按方案处理 C-01 台账。');
    table(ui.main,['复核项','现场记录'],[['低洼路面标尺','08:02 · '+last.roadDepth+' cm'],['C-01 安装照片','镜头面向正向来车'],['当前台账','v1 · C-01 朝向未填']]);
    const value=numeric(ui.main,'录入现场路面水深（cm）');
    let offline=false;
    button(ui.main,'模拟 C-01 离线',()=>{
      offline=true;ui.signal?.({kind:'offline',label:'C-01 模拟离线',progress:.5});ui.say('心跳中断，当前视频不可用。08:02 的归档轨迹可回放。');
    });
    const state=appendChoice(ui.main,'离线后当前视频状态',[['available','仍可当作实时视频'],['offline','当前不可用，保留历史轨迹']]);
    const version=appendChoice(ui.main,'验收记录处理',[['keep','保留 v1，登记朝向待补录'],['revise','按现场照片补录朝向，生成 v2']]);
    button(ui.main,'保存现场验收记录',()=>{
      if(value.valueAsNumber!==last.roadDepth)return ui.say('请按末帧现场标尺以厘米录入。');
      if(!offline||state.value!=='offline')return ui.say('请先模拟设备离线，再检查当前视频可用性。');
      if(version.value!==(ui.chosen==='update'?'revise':'keep'))return ui.say('版本处置和所选验收方式不一致。');
      ui.finish('已核实 '+last.roadDepth+' cm 积水，留存离线复核结果。'+(ui.chosen==='update'?'已补录朝向并生成 v2。':'v1 保留朝向补录待办。'));
    });
  }

  const exercises={15:tracks,16:duplicate,17:source,18:mapping,19:replay,20:thresholds,21:acceptance};
  function open(number,kit) {
    const [id,label]=requirements[number][0];
    const main=add(kit.body,'section','','sw-work');
    const status=add(main,'p',kit.completed.has(id)?'已记录 · '+label:'','sw-status');
    status.setAttribute('role','status');
    const ui={...kit,main,hint:text=>add(main,'p',text,'sw-hint'),
      say:text=>{status.textContent=text;},
      finish:text=>{kit.signal?.({kind:id,label,progress:1});kit.record(id);status.textContent=text;status.dataset.done='true';},
    };
    exercises[number](ui); main.append(status);
  }
  return {requirements,open};
})();
