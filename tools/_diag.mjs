import { readFileSync } from 'node:fs';
const doc = JSON.parse(readFileSync('public/levels/levels.json','utf8'));
const lv = doc.levels.find(l=>l.id===28);
const d2s=(px,py,x0,y0,x1,y1)=>{const dx=x1-x0,dy=y1-y0,l2=dx*dx+dy*dy||1;
  const t=Math.max(0,Math.min(1,((px-x0)*dx+(py-y0)*dy)/l2));return Math.hypot(px-(x0+t*dx),py-(y0+t*dy));};
const target=[402.5,420];
let best=[];
lv.walls.forEach((w,wi)=>{
  for(let i=0;i<w.points.length-1;i++){
    const d=d2s(target[0],target[1],...w.points[i],...w.points[i+1]);
    if(d<40) best.push({wall:wi, seg:i, d:d.toFixed(1), a:w.points[i], b:w.points[i+1], n:w.points.length});
  }
});
console.log('near walls:', JSON.stringify(best.slice(0,8),null,1));
// which spawn group owns it
lv.spawns.forEach((s,si)=>{ s.items.forEach(it=>{ if(Math.abs(it[0]-402.5)<1&&Math.abs(it[1]-420)<1) console.log('group',si,s.type,'items',JSON.stringify(s.items)); }); });
console.log('wall count', lv.walls.length, 'pts of wall in question');
