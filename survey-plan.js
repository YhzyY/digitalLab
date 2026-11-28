'use strict';

// Plan and selection overlays use the same local metre coordinates as the 3D city.
globalThis.drawSurveyPlan = function drawSurveyPlan(canvas) {
  const { extent, required, roadsX, roadsZ, leftBank, rightBank } = globalThis.citySurveyMap;
  const width = extent.maxX - extent.minX;
  const height = extent.maxZ - extent.minZ;
  canvas.width = width * 6;
  canvas.height = height * 6;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(6, 6);
  ctx.translate(-extent.minX, -extent.minZ);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  function line(points, color = '#42494a', weight = .28, dashed = false) {
    ctx.strokeStyle = color;
    ctx.lineWidth = weight * 1.8;
    ctx.setLineDash(dashed ? [2, 1.5] : []);
    ctx.beginPath();
    points.forEach(([x, z], i) => i ? ctx.lineTo(x, z) : ctx.moveTo(x, z));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function rect(x, z, w, d, fill = '#fafafa', color = '#444c4c') {
    ctx.fillStyle = fill;
    ctx.fillRect(x - w / 2, z - d / 2, w, d);
    line([[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2],[x-w/2,z-d/2]], color);
  }
  function text(label, x, z, size = 1.6, color = '#42494a', angle = 0) {
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(angle);
    ctx.font = size + 'px "Songti SC", SimSun, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
  function ring(x, z, rx, rz = rx) {
    const points = Array.from({ length: 49 }, (_, i) => {
      const a = i * Math.PI / 24;
      const r = 1 + .07 * Math.cos(3*a) + .055 * Math.sin(2*a);
      return [x + rx*r*Math.cos(a), z + rz*r*Math.sin(a)];
    });
    line(points);
  }
  function tree(x, z) {
    ctx.beginPath();
    ctx.arc(x, z, .85, 0, Math.PI*2);
    ctx.strokeStyle = '#737d73';
    ctx.lineWidth = .36;
    ctx.stroke();
    line([[x-.3,z],[x+.3,z]], '#737d73', .18);
    line([[x,z-.3],[x,z+.3]], '#737d73', .18);
  }
  function building(x, z, w, d) {
    rect(x, z, w, d, '#f6f6f4', '#424a4a');
    rect(x, z, w-.8, d-.8, '#fafaf9', '#858c8c');
    if (w > d) {
      line([[x-w/2+.5,z-d/2+.5],[x-w/2+2,z],[x+w/2-2,z],[x+w/2-.5,z+d/2-.5]]);
    } else {
      line([[x-w/2+.5,z-d/2+.5],[x,z-d/2+2],[x,z+d/2-2],[x+w/2-.5,z+d/2-.5]]);
    }
    text('砼', x, z, 1.5);
  }
  // A faint local survey grid keeps the drawing readable without geographic imagery.
  for (let x = -150; x < extent.maxX; x += 50) line([[x,extent.minZ],[x,extent.maxZ]], '#daddda', .1);
  for (let z = -100; z < extent.maxZ; z += 50) line([[extent.minX,z],[extent.maxX,z]], '#daddda', .1);

  const samples = Array.from({length:121}, (_,i) => -120+i*2);
  for (const bank of [leftBank, rightBank]) {
    line(samples.map(z=>[bank(z),z]), '#59666a', .3);
    line(samples.map(z=>[bank(z)+(bank===leftBank?-2:2),z]), '#8f999b', .15);
  }
  for (let z=-115; z<120; z+=10) {
    for (const x of [leftBank(z)-5,rightBank(z)+5]) tree(x,z);
    line([[37,z],[42,z]], '#929fa3', .12);
  }

  for (let i=0; i<roadsX.length-1; i++) {
    for (let j=0; j<roadsZ.length-1; j++) {
      if (i===2) continue;
      const x=(roadsX[i]+roadsX[i+1])/2, z=(roadsZ[j]+roadsZ[j+1])/2;
      const w=roadsX[i+1]-roadsX[i]-16, d=roadsZ[j+1]-roadsZ[j]-16;
      rect(x,z,w,d,'#fff','#727a77');
      rect(x,z,w-2,d-2,'#fff','#939c91');
      if (i===1 && j===1) {
        ring(-48,0,24,23);
        ring(-46,1,15.1,11);
        text('湖',-46,1,2.2);
        text('街 区 公 园',-48,-26,2);
        for (let k=0;k<24;k++) {
          const a=k*Math.PI/12;
          tree(-48+27*Math.cos(a),27*Math.sin(a));
        }
        continue;
      }
      line([[x-w/2+2,z],[x+w/2-2,z]],'#90988d',.15);
      line([[x,z-d/2+2],[x,z+d/2-2]],'#90988d',.15);
      for (const side of [-1,1]) {
        const rear=j===0 && side===-1 && i!==3;
        if (rear) {
          building(x-12,z+side*(d/2-9),9,10);
          if (i===0) building(x+9,z+side*(d/2-9),10,10);
          else building(x+11,z+side*(d/2-9),20,9);
        } else {
          building(x-10,z+side*(d/2-8),w*.48,9.1);
          building(x+w*.27,z+side*(d/2-8),w*.21,8.8);
        }
        building(x+side*(w/2-7),z,8.8,Math.max(14,d-36));
        for (let k=-2;k<=2;k++) tree(x+k*8.2,z+side*3.9);
      }
    }
  }
  // Streets and bridges share the completed city's road centres and widths.
  for (const x of roadsX) {
    rect(x,0,10.6,height,'#fff','#424b4e');
    line([[x,extent.minZ],[x,extent.maxZ]],'#899493',.12,true);
  }
  for (const z of roadsZ) {
    rect(-5.5,z,width,10.6,'#fff','#424b4e');
    line([[extent.minX,z],[extent.maxX,z]],'#899493',.12,true);
  }
  text('临 江 大 道',-48,39,2.1);
  text('云 桥 路',-88,0,2.1,'#606767',-Math.PI/2);
  text('河 道',40,0,2.5,'#7d898d',Math.PI/2);
  // Dimensions are derived from the actual course core, in local metres.
  const {minX,maxX,minZ,maxZ}=required;
  const dimensionZ=minZ-4;
  line([[minX,minZ],[minX,dimensionZ-2]]);
  line([[maxX,minZ],[maxX,dimensionZ-2]]);
  line([[minX,dimensionZ],[maxX,dimensionZ]],'#555f5f',.2);
  text((maxX-minX).toFixed(2)+' m',(minX+maxX)/2,dimensionZ-2,1.7);
  for (const [x,z] of [[minX,minZ],[maxX,minZ],[maxX,maxZ],[minX,maxZ]]) {
    line([[x-1,z],[x+1,z]],'#8ea897',.2);
    line([[x,z-1],[x,z+1]],'#8ea897',.2);
    const label='E '+x.toFixed(2)+' / N '+(-z).toFixed(2);
    text(label,x<0?x-15:x+17,z-2,1.3,'#7f9c86');
  }
  // The scale is in map coordinates, so it stays accurate when the page resizes.
  rect(-139,-91,50,5,'#fff','#8b9090');
  for(let i=0;i<4;i++) rect(-157.75+i*12.5,-91,12.5,5,i%2?'#fff':'#7b8181','#8b9090');
  text('0',-164,-96,1.6);
  text('25',-139,-96,1.6);
  text('50 m',-114,-96,1.6);
  text('尺寸单位：米 · 课程局部坐标',-122,116,1.7,'#787f7f');
};
