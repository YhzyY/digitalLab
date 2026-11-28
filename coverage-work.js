'use strict';

function mountCoverageReview({mount,body,bounds,completed,record,flightChoice,flightSettings,readOnly}) {
  const ortho = 'assets/survey-ortho-photo.jpg';
  const oblique = 'assets/survey-1.jpg';
  const {coverageSites, coverageCasesForBounds, planSurveyFlight} = cityExperiment;
  const included = coverageCasesForBounds(bounds);
  const crop = citySurveyMap.imageCrop(bounds,1,1);
  const scope = [crop.x,crop.y,crop.width,crop.height];
  const width = bounds.maxX-bounds.minX, height = bounds.maxZ-bounds.minZ;
  const cases = [
    {
      id:'bank', name:'滨河步道', problem:'shade',
      before:[.497,.415,.173,.205], after:[.567,.43,.177,.283], target:[.39,.58],
      evidence:'两张航片里，步道在树冠边缘变暗并断开，靠近岸脚的地面难以辨认。',
      method:'换到可见岸脚的一侧斜拍，选择较均匀的光线', landmark:'滨河步道边线',
    },
    {
      id:'corner', name:'河东建筑', problem:'occlusion',
      before:[.747,.417,.212,.23], after:[.808,.49,.186,.29], target:[.17,.71],
      evidence:'两张图都能看到屋顶，但俯拍视角没有完整记录楼角下方的立面。',
      method:'从两个方向斜拍楼角和相邻立面', landmark:'前排建筑立面转角',
    },
    {
      id:'glare', name:'跨河桥及护岸', problem:'glare',
      before:[.513,.496,.218,.226], sameView:true, target:[.392,.43],
      evidence:'白亮斑在两张图之间移动，西岸的水陆交界线有一段被亮斑遮住。',
      method:'避开反光方向，兼顾桥台和护岸', landmark:'原先被反光遮住的西岸水陆交界线',
    },
  ].filter(({id}) => included.includes(id));
  const diagnoses = [['shade','树荫或树冠影响'],['occlusion','建筑立面遮挡'],['glare','水面反光'],['gap','像片没有覆盖']];
  const methods = [
    ['same','沿原方向、原视角再拍一张'],
    ...cases.map(({id,method}) => [id,method]),
  ];
  const phases = new Map(cases.map(({id}) => [id,completed.has(id) ? 3 : 0]));
  let active;
  mount.innerHTML = `<div class="coverage-toolbar">
    <strong>航片覆盖检查 · ${Number(width.toFixed(1))} × ${Number(height.toFixed(1))} m</strong><label><input type="checkbox" data-footprint-toggle> 叠加第 5 步航片图幅</label>
    </div><div class="coverage-map" style="aspect-ratio:${width}/${height}">
      <img src="${ortho}" style="${imagePlacement(scope)}" alt="第 1 步已划定测区的航拍总览">
      <div class="coverage-footprints" hidden aria-hidden="true"></div>
      ${cases.map(({id},i) => {
        const [x,y] = coverageSites[id];
        return `<button type="button" data-coverage-case="${id}"
          style="left:${(x-crop.x)/crop.width*100}%;top:${(y-crop.y)/crop.height*100}%"
          aria-pressed="false">待核查 ${i+1}</button>`;
      }).join('')}
    </div><div class="coverage-detail" hidden></div>`;
  const overlay = mount.querySelector('.coverage-footprints');
  const detail = mount.querySelector('.coverage-detail');
  for (const {x,z,w,d} of planSurveyFlight(bounds,flightChoice,flightSettings).footprints) {
    const frame = document.createElement('span');
    frame.style.left = (x-bounds.minX)/width*100+'%';
    frame.style.top = (z-bounds.minZ)/height*100+'%';
    frame.style.width = w/width*100+'%';
    frame.style.height = d/height*100+'%';
    overlay.append(frame);
  }
  mount.querySelector('[data-footprint-toggle]').addEventListener('change',event => {
    overlay.hidden = !event.target.checked;
  });

  const instructions = document.createElement('p');
  instructions.className = 'coverage-instructions';
  const fields = document.createElement('div');
  fields.className = 'coverage-controls';
  const feedback = document.createElement('p');
  feedback.className = 'sw-status';
  feedback.setAttribute('role','status');
  body.append(instructions,fields);

  function imagePlacement([x,y,w,h]) {
    return `width:${100/w}%;height:${100/h}%;left:${-x/w*100}%;top:${-y/h*100}%`;
  }

  function visibleCrop(frame,src) {
    const [x,y,w,h] = frame;
    let [sx,sy,sw,sh] = scope;
    if (src===oblique) {
      // Match the view windows at the identified ground landmark across the sample viewpoints.
      const [anchorX,anchorY] = coverageSites[active.id];
      const [, ,baseWidth,baseHeight] = active.before;
      sx = x + ((sx-anchorX)/baseWidth+active.target[0])*w;
      sy = y + ((sy-anchorY)/baseHeight+active.target[1])*h;
      sw = sw/baseWidth*w;
      sh = sh/baseHeight*h;
    }
    const left = Math.max(x,sx), top = Math.max(y,sy);
    const right = Math.min(x+w,sx+sw), bottom = Math.min(y+h,sy+sh);
    return [(left-x)/w,(top-y)/h,(right-left)/w,(bottom-top)/h];
  }

  function bridgeTraffic(src,[viewX,viewY],later) {
    // The junction patch stays registered to the same road in both overlapping frames.
    const [x,y,w,h] = active.before;
    const patches = [[.938,.573,.079,.136,.938,.718]];
    if (later) {
      for (const left of [.06,.432,.775]) patches.push([left,.668,.071,.049,.224,.668]);
      patches.push([.951,.448,.043,.105,.951,.245]);
    }
    const vehicles = later ? [
      {x:.195,y:.694,w:.044,h:.028,color:'#386775'},
      {x:.495,y:.696,w:.100,h:.044,color:'#658e79'},
      {x:.357,y:.820,w:.064,h:.034,color:'#343a66'},
      {x:.736,y:.815,w:.054,h:.031,color:'#8d65a1'},
      {x:.975,y:.316,w:.030,h:.095,color:'#799bbd',vertical:true},
    ] : [];
    return `<span class="coverage-traffic" aria-hidden="true">${patches.map(([left,top,width,height,sourceX,sourceY]) =>
      `<span class="coverage-traffic-patch" style="left:${(left+(x-viewX)/w)*100}%;top:${(top+(y-viewY)/h)*100}%;width:${width*100}%;height:${height*100}%">
        <span style="${imagePlacement([x+sourceX*w,y+sourceY*h,width*w,height*h])};background-image:url('${src}')"></span>
      </span>`).join('')}${vehicles.map(car =>
      `<span class="coverage-later-vehicle${car.vertical ? ' is-vertical' : ''}"
        style="left:${car.x*100}%;top:${car.y*100}%;width:${car.w*100}%;height:${car.h*100}%;--paint:${car.color}"></span>`).join('')}</span>`;
  }

  function imagePanel({src,crop,label,effect,position,mark=false,verified=false,later=false}) {
    const visible = visibleCrop(crop,src);
    const aspect = crop[2]*visible[2]/(crop[3]*visible[3])*(src===ortho ? 1490/1055 : 836/470);
    return `<figure><figcaption>${label}</figcaption><div class="coverage-image" style="aspect-ratio:${aspect}">
      <div class="coverage-frame" style="${imagePlacement(visible)}">
      <img src="${src}" alt="${active.name}，${label}" style="${imagePlacement(crop)}">
      ${active.sameView ? bridgeTraffic(src,crop,later) : ''}
      ${effect ? `<span class="coverage-effect" data-effect="${effect}" data-frame="${position}" aria-hidden="true"></span>` : ''}
      ${mark ? `<span class="coverage-target" data-verified="${verified}" aria-hidden="true"
        style="left:${active.target[0]*100}%;top:${active.target[1]*100}%"></span>` : ''}
      </div></div>${mark ? `<p class="coverage-landmark">${verified ? '已验收' : '框内核对目标'} · ${active.landmark}</p>` : ''}</figure>`;
  }
  function drawDetail() {
    const phase = phases.get(active.id);
    const before = imagePanel({
      src:ortho,crop:active.before,label:phase>=2 ? '补拍前' : '航片 A',
      effect:active.problem,position:'a',
    });
    const crop = [active.before[0]+.018,active.before[1]+.012,active.before[2],active.before[3]];
    const right = phase>=2
      ? imagePanel({
        src:active.sameView ? ortho : oblique, crop:active.sameView ? active.before : active.after,
        label:active.sameView ? '补拍后' : '补拍后 · 斜视样片',mark:true,verified:phase===3,later:active.sameView,
      })
      : imagePanel({src:ortho,crop,label:'航片 B',effect:active.problem,position:'b'});
    detail.innerHTML = `<h3>${active.name}</h3><div class="coverage-pair">${before}${right}</div>
      <p>教学航片样例 · 局部截图与模拟光照效果${active.sameView && phase>=2 ? '，补拍车流为模拟效果' : ''}</p>`;
    detail.hidden = false;
  }
  function addSelect(label,options,value='') {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const select = setChoiceOptions(document.createElement('select'),options,value);
    select.disabled = Boolean(value);
    wrapper.append(select);
    fields.append(wrapper);
    return select;
  }
  function addAction(label,action,secondary=false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = secondary ? 'button secondary' : 'button';
    button.textContent = label;
    button.addEventListener('click',action);
    fields.append(button);
    return button;
  }

  function renderCase() {
    fields.replaceChildren();
    for (const button of mount.querySelectorAll('[data-coverage-case]')) {
      const id = button.dataset.coverageCase;
      button.setAttribute('aria-pressed',String(id===active?.id));
      if (completed.has(id)) {
        button.textContent = '已验收 ✓';
        button.setAttribute('aria-label',cases.find(item=>item.id===id).name+'，已验收');
      }
    }
    if (!active) {
      instructions.textContent = readOnly && !completed.size ? '此前已完成本步，可在总览中查看测区内的航片。'
        : '在航拍总览中点击一处「待核查」。可叠加第 5 步的图幅，区分漏飞与影像质量问题。';
      return;
    }
    drawDetail();
    const phase = phases.get(active.id);
    if (readOnly && phase===0) {
      instructions.textContent = '查看本区航片。';
      return;
    }
    instructions.textContent = phase===0 ? '比较航片 A 和 B，判断影响本区的主要问题。' : '';
    const diagnosis = addSelect('判断问题',diagnoses,phase>0 ? active.problem : '');
    diagnosis.dataset.coverageAnswer = '';
    if (phase===0) {
      addAction('确认问题',() => {
        if (!diagnosis.reportValidity()) return;
        if (diagnosis.value!==active.problem) {
          feedback.textContent = '请再比较两张航片。' + active.evidence;
          return;
        }
        phases.set(active.id,1);
        renderCase();
        fields.querySelector('[data-coverage-method]').focus();
      },true);
      fields.append(feedback);
      return;
    }

    feedback.textContent = '判断正确。' + active.evidence;
    fields.append(feedback);
    const method = addSelect('补拍方式',methods,phase>=2 ? active.id : '');
    method.dataset.coverageMethod = '';
    if (phase===1) {
      method.addEventListener('change',() => method.setCustomValidity(''));
      const execute = addAction('执行补拍',() => {
        if (method.value && method.value!==active.id) method.setCustomValidity('这种方式无法解决本区的问题，请重新选择。');
        if (!method.reportValidity()) return;
        phases.set(active.id,2);
        renderCase();
        fields.querySelector('[data-confirm-review]').focus({preventScroll:true});
        detail.scrollIntoView({block:'nearest'});
      });
      execute.dataset.executeCapture = '';
    } else if (phase===2) {
      const note = document.createElement('p');
      note.className = 'coverage-review-note';
      note.textContent = '对照补拍前后的影像。确认右图黄色框内的' + active.landmark + '清晰可辨后，点击下方按钮。';
      fields.append(note);
      const confirmReview = addAction('确认验收',() => {
        const id = active.id;
        phases.set(id,3);
        record(id);
        renderCase();
        mount.querySelector('[data-coverage-case="' + id + '"]').focus({preventScroll:true});
      });
      confirmReview.dataset.confirmReview = '';
    } else {
      const status = document.createElement('p');
      status.className = 'sw-status';
      status.setAttribute('role','status');
      status.dataset.done = 'true';
      status.textContent = cases.every(({id}) => completed.has(id)) ? '测区内的待核查区域均已验收，可以保存补采结果。' : '本区已验收，请继续核查其他区域。';
      fields.append(status);
    }
  }
  mount.querySelectorAll('[data-coverage-case]').forEach(button => button.addEventListener('click',() => {
    active = cases.find(item=>item.id===button.dataset.coverageCase);
    feedback.textContent = '';
    renderCase();
    detail.scrollIntoView({block:'nearest'});
  }));
  renderCase();
}
