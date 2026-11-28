'use strict';

function drawEngineeringMap(canvas, kind) {
  const { extent, roadsX, roadsZ, parcels, leftBank, rightBank, bankProfile, lake, shoreShape, groundElevation } = citySurveyMap;
  const cad = kind === 'cad', traffic = kind === 'traffic', dem = kind === 'dem';
  const scale = 3, width = extent.maxX - extent.minX, height = extent.maxZ - extent.minZ;
  const mapX = 59, mapY = 116, mapW = width * scale, mapH = height * scale;
  const side = 1110;
  const titles = { cad: 'CAD 总平面图', traffic: '交通网络图', dem: '数字高程模型' };
  const ink = '#26343b', muted = '#4c5a60', rule = '#a3aeb2';
  const roadColors = { main: '#a03a48', local: '#40668b' };
  canvas.width = 1440;
  canvas.height = 928;
  const ctx = canvas.getContext('2d');
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';

  function text(value, x, y, size = 18, { color = ink, weight = 400, align = 'left', angle = 0, halo = false } = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = weight + ' ' + size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (halo) {
      ctx.strokeStyle = '#ffffffeb';
      ctx.lineWidth = 4;
      ctx.strokeText(value, 0, 0);
    }
    ctx.fillStyle = color;
    ctx.fillText(value, 0, 0);
    ctx.restore();
  }
  function line(points, color = ink, weight = 1, dash = []) {
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function box(x, y, w, h, fill, stroke = null, weight = 1) {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x,y,w,h);
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = weight;
      ctx.strokeRect(x,y,w,h);
    }
  }
  function area(points, fill) {
    ctx.beginPath();
    points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function circle(x, y, radius, fill, edge = ink) {
    ctx.beginPath();
    ctx.arc(x,y,radius,0,2 * Math.PI);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const toMap = (x,z) => [mapX + (x - extent.minX) * scale, mapY + (z - extent.minZ) * scale];
  const path = points => points.map(([x,z]) => toMap(x,z));
  const worldLine = (points, ...style) => line(path(points), ...style);
  const worldText = (value,x,z,...style) => text(value,...toMap(x,z),...style);
  const worldBox = (x,z,w,d,...style) => box(...toMap(x-w/2,z-d/2),w*scale,d*scale,...style);
  const bank = fn => Array.from({length:121}, (_,i) => {
    const z = extent.minZ + i * 2;
    return [fn(z),z];
  });
  const { minX, maxX, minZ, maxZ } = extent;
  const left = bank(leftBank), right = bank(rightBank);
  const lakeEdge = Array.from({length:97}, (_,i) => {
    const angle = Math.PI * i / 48;
    return [lake.x + lake.rx * shoreShape(angle) * Math.cos(angle), lake.z + lake.rz * shoreShape(angle) * Math.sin(angle)];
  });

  box(0,0,canvas.width,canvas.height,'#fff');
  box(24,24,1392,880,null,ink);
  text(titles[kind],59,63,34,{weight:700});
  text('教学样例街区  /  完整街区',1382,66,21,{align:'right'});
  line([[59,95],[1381,95]],rule);
  ctx.save();
  ctx.beginPath();
  ctx.rect(mapX,mapY,mapW,mapH);
  ctx.clip();

  function drawContext() {
    box(mapX,mapY,mapW,mapH, cad ? '#fcfcfa' : '#f7f7f3');
    const water = cad ? '#e4eff1' : '#d8e7ee';
    area(path([...left,...[...right].reverse()]),water);
    for (const edge of [left,right]) worldLine(edge,'#879da7',1.4);
    if (cad) {
      for (const index of [1,4]) worldLine(bank(z => bankProfile(z)[index][0]),'#688590',1,[5,3]);
    }
    let number = 0;
    function building(x,z,w,d) {
      number++;
      worldBox(x,z,w,d,cad ? '#e3e5e4' : '#e5e6e2',cad ? '#26343b' : '#c7cdca',cad ? 1.7 : .7);
      if (!cad) return;
      const [a,b] = toMap(x-w/2,z-d/2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(a+1,b+1,w*scale-2,d*scale-2);
      ctx.clip();
      for (let offset=-d*scale; offset<w*scale; offset+=7) {
        line([[a+offset,b+d*scale],[a+offset+d*scale,b]],'#a2aaad',.7);
      }
      ctx.restore();
      worldText('B' + String(number).padStart(2,'0'),x,z,11,{align:'center',weight:600,halo:true});
    }
    for (const {i,j,park,x,z,w,d} of parcels) {
      worldBox(x,z,w,d,park ? '#e6ece1' : cad ? '#f6f7f1' : '#f1f1ec',cad ? '#899284' : '#d9dbd3',.85);
      if (park) {
        area(path(lakeEdge),water);
        worldLine(lakeEdge,'#839ba9',1);
        worldText('街区公园',x,z-19,17,{align:'center',weight:600});
        worldText('景观湖',lake.x,lake.z,14,{align:'center'});
        if (cad) {
          const walk = Array.from({length:97}, (_,k) => {
            const angle = Math.PI * k / 48, r = shoreShape(angle);
            return [x+24*r*Math.cos(angle),z+23*r*Math.sin(angle)];
          });
          worldLine(walk,'#8f9782',1.4);
        }
        continue;
      }
      if (cad) {
        worldLine([[x-w/2+2,z],[x+w/2-2,z]],'#a2a891',.9);
        worldLine([[x,z-d/2+2],[x,z+d/2-2]],'#a2a891',.9);
      }
      for (const direction of [-1,1]) {
        const rear = j === 0 && direction === -1 && i !== 3;
        if (rear) {
          building(x-12,z+direction*(d/2-9),9,10);
          if (i === 0) building(x+9,z+direction*(d/2-9),10,10);
          else building(x+11,z+direction*(d/2-9),20,9);
        } else {
          building(x-10,z+direction*(d/2-8),w*.48,9.1);
          building(x+w*.27,z+direction*(d/2-8),w*.21,8.8);
        }
        building(x+direction*(w/2-7),z,8.8,Math.max(14,d-36));
        if (cad) for (let k=-2;k<=2;k++) {
          const point = toMap(x+k*8.2,z+direction*3.9);
          circle(...point,3.5,null,'#657e5f');
          line([[point[0]-2,point[1]],[point[0]+2,point[1]]],'#657e5f',.7);
        }
      }
    }

    const paths = [
      ...roadsX.map(x => ({ points:[[x,minZ],[x,maxZ]], main:x===-88, width:15 })),
      ...roadsZ.map(z => ({ points:[[minX,z],[maxX,z]], main:z===39, width:14.4 })),
    ];
    for (const {points,width} of paths) worldLine(points,cad ? '#798187' : '#dbddd7',width*scale+2);
    for (const {points,width} of paths) worldLine(points,cad ? '#f1f1ee' : '#fff',width*scale);
    if (cad) {
      for (const {points} of paths) worldLine(points,'#9ba0a0',10.6*scale+1);
      for (const {points} of paths) worldLine(points,'#fff',10.6*scale);
      for (const x of roadsX) for (const z of roadsZ) {
        for (const direction of [-1,1]) for (let stripe = -4; stripe < 5; stripe += 1.17) {
          worldBox(x+stripe,z+direction*8.1,.53,1.65,'#a0a7a8');
          worldBox(x+direction*8.1,z+stripe,1.65,.53,'#a0a7a8');
        }
      }
    }
    for (const {points,main} of paths) {
      if (traffic) worldLine(points,main ? roadColors.main : roadColors.local,main ? 8 : 4.5);
      else worldLine(points,'#7e8488',1,[18,5,3,5]);
    }
    roadsZ.forEach((z, index) => {
      const detail = traffic ? 3.2 : 6.4;
      for (const offset of [-detail,detail]) worldLine([[1,z+offset],[71,z+offset]],ink,traffic ? 1.4 : 2);
      worldText('桥 ' + String(index+1).padStart(2,'0'),39,z+(index===3?-8:8),13,{align:'center',halo:true});
      if (traffic) for (const x of roadsX) circle(...toMap(x,z),4.5,'#fff','#304f68');
    });
    worldText('临江大道',-135,32,19,{weight:600,halo:true});
    worldText('云桥路',-95,-4,19,{angle:-Math.PI/2,weight:600,halo:true});
    worldText('河 道',39,15,18,{align:'center',halo:true});
    if (traffic) {
      worldLine([[-57,33.85],[-57,44.15]],ink,2.4);
      worldLine([[-93.1,-17],[-82.9,-17]],ink,2.4);
      worldText('断面 A',-55,48,13,{halo:true});
      worldText('断面 B',-80,-17,13,{halo:true});
    } else {
      const bounds = [[minX,minZ],[maxX,minZ],[maxX,maxZ],[minX,maxZ],[minX,minZ]];
      worldLine(bounds,'#a2494e',3,[14,4,3,4]);
      worldLine([[-82.7,13],[-82.7,23]],'#69727a',1);
      worldLine([[-93.3,13],[-93.3,23]],'#69727a',1);
      worldLine([[-93.3,21],[-82.7,21]],'#69727a',1);
      worldText('10.60',-88,17,12,{align:'center',halo:true});
    }
  }

  const colors = [
    [-1.8,[78,110,144]], [-1,[119,153,176]], [0,[201,215,203]],
    [.35,[219,221,195]], [.7,[222,203,161]], [1.25,[183,149,105]], [1.75,[140,105,75]],
  ];
  function rgb(height, shade = 1) {
    const last = colors.length - 1;
    const index = Math.max(1, colors.findIndex(([elevation]) => height <= elevation));
    if (height >= colors[last][0]) return colors[last][1].map(value => Math.round(value*shade));
    const [lo,a] = colors[index-1], [hi,b] = colors[index];
    const t = Math.max(0,(height-lo)/(hi-lo));
    return a.map((channel,i) => Math.min(255,Math.round((channel + (b[i]-channel)*t)*shade)));
  }
  function drawDem() {
    const raster = document.createElement('canvas');
    raster.width = width;
    raster.height = height;
    const bitmap = raster.getContext('2d');
    const grid = Float32Array.from({length:width*height}, (_,i) =>
      groundElevation(minX + i % width + .5, minZ + Math.floor(i/width) + .5));
    const pixels = bitmap.createImageData(width,height);
    for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
      const index = y*width+x;
      const dx = (grid[y*width+Math.min(width-1,x+1)] - grid[y*width+Math.max(0,x-1)]) / 2;
      const dy = (grid[Math.min(height-1,y+1)*width+x] - grid[Math.max(0,y-1)*width+x]) / 2;
      const shade = Math.max(.78,Math.min(1.13,(1 + .58*dx + .5*dy) / Math.hypot(1,dx,dy)));
      pixels.data.set([...rgb(grid[index],shade),255],index*4);
    }
    bitmap.putImageData(pixels,0,0);
    ctx.drawImage(raster,mapX,mapY,mapW,mapH);

    // Context linework registers the terrain raster to the same street plan.
    for (const x of roadsX) worldLine([[x,minZ],[x,maxZ]],'#4a555b65',1,[5,4]);
    for (const z of roadsZ) worldLine([[minX,z],[maxX,z]],'#4a555b65',1,[5,4]);
    worldLine(lakeEdge,'#466477',1.3);
    worldText('景观湖',lake.x,lake.z,15,{align:'center',halo:true});
    worldText('河床',40,-39,16,{align:'center',halo:true});
    worldText('临江大道',-135,33,15,{halo:true});
    worldText('云桥路',-95,-9,15,{angle:-Math.PI/2,halo:true});
    worldLine([[0,4],[85,4]],'#313a42',1.8,[9,4]);
    worldText('A',-3,4,16,{align:'right',halo:true});
    worldText('A′',88,4,16,{halo:true});
    const lowX = bankProfile(4)[4][0];
    circle(...toMap(lowX,4),4,'#fff','#713b2e');
    worldLine([[lowX,4],[70,18],[84,18]],'#713b2e',1.5);
    worldText('东岸低点',86,18,16,{halo:true});
  }

  if (dem) drawDem();
  else drawContext();
  ctx.restore();
  box(mapX,mapY,mapW,mapH,null,ink);
  const ticks = cad || dem ? [-150,-100,-50,0,50,100,150] : [];
  for (const x of ticks) {
    const [px] = toMap(x,0);
    line([[px,mapY+mapH],[px,mapY+mapH+5]],ink);
    text(String(x),px,851,13,{align:'center'});
  }
  if (ticks.length) for (const z of [-100,-50,0,50,100]) {
    const [,py] = toMap(0,z);
    line([[mapX-5,py],[mapX,py]],ink);
    text(String(-z),mapX-8,py,12,{align:'right'});
  }

  // Graphic scale remains valid when the canvas is fitted to a screen or printed.
  const sy = 879;
  for (let i=0;i<4;i++) box(mapX+i*37.5,sy,37.5,6,i%2 ? '#fff' : ink,ink);
  [0,25,50].forEach((n,i) => text(n + (i===2?' m':''),mapX+i*75,sy-9,12,{align:'center'}));
  text('课程局部坐标（m）   E 向右 · N 向上',mapX+223,sy+2,14,{color:muted});
  text('339 × 240 m',mapX+mapW,sy+2,14,{align:'right',color:muted});

  text('N',side+249,134,17,{weight:700,align:'center'});
  area([[side+249,151],[side+240,181],[side+249,175],[side+258,181]],ink);
  text('图例',side,176,24,{weight:700});
  line([[side,198],[1380,198]],rule);
  function legendRow(y,label,symbol) {
    symbol(side+26,y);
    text(label,side+60,y,17);
  }
  if (cad || traffic) {
    if (cad) {
      legendRow(229,'建筑轮廓 / 课程编号',(x,y) => box(x-18,y-8,36,16,'#e3e5e4',ink));
      legendRow(265,'道路中心线',(x,y) => line([[x-18,y],[x+18,y]],ink,1.2,[10,3,2,3]));
      legendRow(301,'完整街区边界',(x,y) => line([[x-18,y],[x+18,y]],'#a2494e',2,[9,3,2,3]));
      legendRow(337,'绿地及庭院',(x,y) => box(x-18,y-8,36,16,'#e6ece1','#899284'));
    } else {
      legendRow(229,'重点监测道路',(x,y) => line([[x-18,y],[x+18,y]],roadColors.main,8));
      legendRow(265,'其他街区道路',(x,y) => line([[x-18,y],[x+18,y]],roadColors.local,4.5));
      legendRow(301,'跨河桥梁',(x,y) => [-5,5].forEach(dy => line([[x-18,y+dy],[x+18,y+dy]],ink,1.4)));
      legendRow(337,'道路交叉口',(x,y) => circle(x,y,4.5,'#fff','#304f68'));
    }
    legendRow(373,'水系',(x,y) => box(x-18,y-8,36,16,'#d8e7ee','#879da7'));
    line([[side,422],[1380,422]],rule);
    text(cad ? '制图说明' : '路网统计',side,452,20,{weight:700});
    const notes = cad
      ? ['建筑按模型外轮廓绘制。','尺寸单位为米。','道路宽度标注为车行道。']
      : ['南北向道路  5 条','东西向道路  4 条','道路交叉口  20 处','跨河桥梁  4 座'];
    notes.forEach((note,i) => text(note,side,487+30*i,16,{color:muted}));
  } else {
    text('局部地面高程（m）',side,224,18);
    const ramp = ctx.createLinearGradient(side,0,1380,0);
    colors.forEach(([level,color]) => ramp.addColorStop((level+1.8)/3.55,'rgb('+color.join(',')+')'));
    ctx.fillStyle = ramp;
    ctx.fillRect(side,246,270,16);
    [-1.8,-1,0,1,1.75].forEach(level => {
      const x = side+(level+1.8)/3.55*270;
      line([[x,262],[x,268]],ink);
      text(level.toFixed(2),x,283,13,{align:'center'});
    });
    legendRow(320,'道路中心线',(x,y) => line([[x-18,y],[x+18,y]],ink,1,[5,4]));
    legendRow(352,'地形剖切线',(x,y) => line([[x-18,y],[x+18,y]],ink,1.8,[9,4]));
    line([[side,387],[1380,387]],rule);
    text('A–A′ 地形剖面',side,416,20,{weight:700});
    const px = x => side+31+x/85*230, py = y => 534-y*39;
    for (const level of [-2,-1,0,1,2]) {
      line([[px(0),py(level)],[px(85),py(level)]],'#ced5d8');
      text(String(level),px(0)-8,py(level),12,{align:'right'});
    }
    line([[px(0),py(2)],[px(0),py(-2)],[px(85),py(-2)]],ink);
    const profile = Array.from({length:341},(_,i)=>i/4)
      .map(x=>[px(x),py(groundElevation(x,4))]);
    line(profile,'#32556a',1.8);
    const [lowX,lowY] = bankProfile(4)[4];
    circle(px(lowX),py(lowY),3,'#fff','#713b2e');
    text('+' + lowY.toFixed(2),px(lowX)+6,py(lowY)-12,13,{color:'#713b2e'});
    text('0',px(0),629,12,{align:'center'});
    text('85 m',px(85),629,12,{align:'right'});
    text('1 m 栅格 · 仿真局部高程',side,674,16,{color:muted});
    text('河道采用模型河床；湖区采用水面。',side,704,14,{color:muted});
    text('桥面、建筑屋顶和树冠不计入地形。',side,730,14,{color:muted});
  }

  line([[side,788],[1380,788]],rule);
  text('数字孪生城市虚拟仿真实验',side,815,16,{weight:600});
  text('图源  街区仿真模型',side,843,15,{color:muted});
  return {
    toMap,
    toWorld: (x,y) => [extent.minX + (x - mapX) / scale, extent.minZ + (y - mapY) / scale],
  };
}
