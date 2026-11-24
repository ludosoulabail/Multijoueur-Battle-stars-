// game.js — SIMULATION AUTORITAIRE de Battle Stars (JavaScript pur, sans API Cloudflare : testable dans Node).
// Le serveur décide de TOUT : déplacements, tirs, collisions, dégâts, éliminations, scores. Les joueurs n'envoient que leurs intentions.
export const MW=1600,MH=1200;
export const CH={
 leo:{hp:3800,dmg:560,sp:3.1,rg:300,rl:700,t:'shot'},max:{hp:7000,dmg:380,sp:2.3,rg:160,rl:900,t:'shotgun'},
 zara:{hp:2900,dmg:330,sp:3.9,rg:240,rl:650,t:'burst'},mia:{hp:3600,dmg:430,sp:3,rg:290,rl:750,t:'heal'},
 boum:{hp:4200,dmg:900,sp:2.5,rg:300,rl:1150,t:'bomb'},ange:{hp:3000,dmg:700,sp:3.7,rg:380,rl:550,t:'heal'},
 ombre:{hp:3200,dmg:1000,sp:4.5,rg:250,rl:950,t:'dagger'},kmien:{hp:5000,dmg:650,sp:3,rg:105,rl:600,t:'melee'},
 snip:{hp:2500,dmg:1000,sp:2.3,rg:560,rl:1500,t:'snip'},grond:{hp:3300,dmg:500,sp:3,rg:210,rl:800,t:'twin'},
 miner:{hp:3500,dmg:500,sp:3.1,rg:330,rl:850,t:'drill'},kira:{hp:2500,dmg:1100,sp:2.8,rg:480,rl:1200,t:'sniper'}};
const R=Math.random,rnd=(a,b)=>a+R()*(b-a),D=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=(v,d=0)=>Number.isFinite(+v)?+v:d;
const W0=[[300,300,200,40],[700,200,40,200],[560,560,160,40],[200,640,40,180],[800,400,120,40],[420,880,220,40],[1000,300,40,120]];
const B0=[[500,450,70],[260,900,80],[1000,700,70],[700,1000,60],[150,200,60]];
export function buildMap(mode){
 if(mode==='fb')return{walls:[{x:760,y:200,w:80,h:40},{x:760,y:960,w:80,h:40},{x:600,y:580,w:40,h:40},{x:960,y:580,w:40,h:40}],bush:[]};
 const walls=[],bush=[];for(const w of W0){walls.push({x:w[0],y:w[1],w:w[2],h:w[3]});walls.push({x:MW-w[0]-w[2],y:MH-w[1]-w[3],w:w[2],h:w[3]})}
 for(const b of B0){bush.push({x:b[0],y:b[1],r:b[2]});bush.push({x:MW-b[0],y:MH-b[1],r:b[2]})}return{walls,bush}}
const BOTN=['Nova','Rex','Pixel','Volt','Kiwi','Moka','Flash','Bolt','Zed','Luna','Echo','Rio'];
const clean=s=>String(s||'Joueur').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,14)||'Joueur';
export class Game{
 constructor({mode='show',size}={}){
  this.mode=mode;this.tm=mode!=='show';this.size=size||(mode==='show'?10:6);const m=buildMap(mode);this.walls=m.walls;this.bush=m.bush;
  this.phase='wait';this.t=0;this.cd=0;this.intro=0;this.f=[];this.b=[];this.mn=[];this.cubes=[];this.evs=[];this.acc=new Map();
  this.sc=[0,0];this.zone=900;this.ball={x:MW/2,y:MH/2,vx:0,vy:0,lt:null};this.nid=1;this.over=false;this.result=null}
 // ---------- joueurs ----------
 mkF(id,ch,team,human,name,icon,pw,tr){const c=CH[ch],lv=human?clamp(Math.round(num(pw,1)),1,11)-1:0,H=c.hp*(1+.05*lv);
  return{id,ch,c,x:0,y:0,hp:H,max:H,team,human,name,icon:clamp(num(icon)|0,0,11),tr:Math.max(0,num(tr)|0),ang:0,ammo:3,ar:0,sup:0,alive:true,lastAct:-9,shield:4,cubes:0,buff:0,kills:0,deaths:0,goals:0,rs:0,mx:0,my:0,dm:1+.05*lv,nf:0,root:0,slow:0,kb:null,dash:null,ai:{t:0,sx:1,tx:MW/2,ty:MH/2},q:[],seq:0}}
 pickTeam(){const h=this.size/2,a=this.f.filter(f=>f.team===0).length,b=this.f.filter(f=>f.team===1).length;return a<=b?(a<h?0:1):(b<h?1:0)}
 addHuman({name,icon,char,pw,tr}){if(this.phase!=='wait'||this.f.length>=this.size)return null;const id=this.nid++,f=this.mkF(id,CH[char]?char:'leo',this.tm?this.pickTeam():id,true,clean(name),icon,pw,tr);this.f.push(f);return f}
 setTeam(id,t){const f=this.f.find(x=>x.id===id);if(!f||this.phase!=='wait'||!this.tm||(t!==0&&t!==1))return;if(this.f.filter(x=>x.team===t&&x!==f).length<this.size/2)f.team=t}
 removeHuman(id){const i=this.f.findIndex(f=>f.id===id);if(i<0)return;if(this.phase==='wait')this.f.splice(i,1);else{const f=this.f[i];f.human=false;f.q.length=0;f.name=f.name.slice(0,9)+' (bot)'}}
 humans(){return this.f.filter(f=>f.human).length}
 start(){if(this.phase!=='wait')return;const keys=Object.keys(CH);let bi=0;
  while(this.f.length<this.size){const id=this.nid++,team=this.tm?this.pickTeam():id;this.f.push(this.mkF(id,keys[Math.floor(R()*keys.length)],team,false,BOTN[bi++%BOTN.length]+(bi>BOTN.length?bi:''),Math.floor(R()*12),1,0))}
  this.f.forEach((f,i)=>{const p=this.mode==='show'?this.spot(MW/2+Math.cos(i/this.f.length*6.283)*520,MH/2+Math.sin(i/this.f.length*6.283)*400,60):this.base(f.team);f.x=p.x;f.y=p.y});
  this.phase='intro';this.intro=3.2;this.cd=2.6}
 input(id,m){const f=this.f.find(x=>x.id===id);if(!f||!f.human||!f.alive)return;f.mx=clamp(num(m.mx),-1,1);f.my=clamp(num(m.my),-1,1);if(m.ang!==undefined)f.ang=num(m.ang);f.seq=num(m.seq)|0;
  if(m.fire&&f.q.length<3)f.q.push({k:'f',a:num(m.fire.a),d:clamp(num(m.fire.d),0,2000)});if(m.sup&&f.q.length<3)f.q.push({k:'s',a:num(m.sup.a),d:clamp(num(m.sup.d),0,2000)})}
 // ---------- géométrie ----------
 hitW(x,y,r){for(const w of this.walls){const cx=Math.max(w.x,Math.min(x,w.x+w.w)),cy=Math.max(w.y,Math.min(y,w.y+w.h));if((x-cx)**2+(y-cy)**2<r*r)return w}return null}
 move(f,dx,dy){const r=18;let nx=f.x+dx;if(!this.hitW(nx,f.y,r)&&nx>r&&nx<MW-r)f.x=nx;let ny=f.y+dy;if(!this.hitW(f.x,ny,r)&&ny>r&&ny<MH-r)f.y=ny}
 spot(cx,cy,rad){for(let i=0;i<40;i++){const x=cx+rnd(-rad,rad),y=cy+rnd(-rad,rad);if(x>40&&x<MW-40&&y>40&&y<MH-40&&!this.hitW(x,y,30))return{x,y}}return{x:cx,y:cy}}
 base(team){if(this.mode==='fb')return team?this.spot(1250,600,120):this.spot(350,600,120);return team?this.spot(1350,250,110):this.spot(250,950,110)}
 inBush(f){return this.bush.some(b=>(f.x-b.x)**2+(f.y-b.y)**2<b.r*b.r)}
 foe(f,e){return e.alive&&e!==f&&e.team!==f.team}
 cm(f){return(1+.1*f.cubes)*(f.dm||1)}
 ev(o){this.evs.push(o)}
 // ---------- armes ----------
 bul(f,a,sp,life,dm,o){this.b.push(Object.assign({sx:f.x,sy:f.y,mul:this.cm(f),x:f.x+Math.cos(a)*22,y:f.y+Math.sin(a)*22,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:Math.max(.03,life-22/sp),dm,f,r:8,kd:0},o||{}))}
 fire(f,ang,dist){if(f.ammo<1||!f.alive||this.t<f.nf)return;const c=f.c,dm=c.dmg*this.cm(f);f.nf=this.t+.35;f.ammo--;f.lastAct=this.t;f.ang=ang;
  switch(c.t){
  case'shot':this.bul(f,ang,560,c.rg/560,dm);break;
  case'shotgun':for(let i=-2;i<=2;i++)this.bul(f,ang+i*.16,470,c.rg/470,dm,{r:5});break;
  case'burst':for(let i=-1;i<=1;i++)this.bul(f,ang+i*.07,700,c.rg/700,dm,{r:6,kd:3});break;
  case'heal':this.bul(f,ang,520,c.rg/520,dm,{heal:1,kd:5});break;
  case'sniper':this.bul(f,ang,880,c.rg/880,dm,{pierce:1,r:6,kd:2});break;
  case'dagger':this.bul(f,ang,820,c.rg/820,dm,{r:6,kd:3});break;
  case'melee':this.blast(f.x+Math.cos(ang)*70,f.y+Math.sin(ang)*70,58,dm,f);break;
  case'snip':this.bul(f,ang,950,c.rg/950,0,{r:6,kd:2,tr:[300,600,1000],rng:c.rg});break;
  case'twin':for(const q of[-1,1])this.bul(f,ang+q*.13,520,c.rg/520,dm,{r:9,kb:1});break;
  case'drill':this.bul(f,ang,500,c.rg/500,dm,{pierce:1,under:1,end:1,r:14,kd:4});break;
  case'bomb':{const d=Math.max(80,Math.min(dist||c.rg,c.rg));this.bul(f,ang,400,d/400,dm,{bomb:1,r:11,kd:1})}break}}
 zup(f,ang,dist){if(f.sup<1||!f.alive)return;const c=f.c,id=f.ch,dm=c.dmg*this.cm(f);f.sup=0;f.lastAct=this.t;f.ang=ang;this.ev({k:'sup',id:f.id});
  if(id==='leo')for(let i=0;i<14;i++)this.bul(f,i/14*6.283,560,.75,dm*.7);
  if(id==='max'){f.buff=4;this.heal(f,f.max*.2)}
  if(id==='zara'){for(let i=0;i<16;i++)this.move(f,Math.cos(ang)*14,Math.sin(ang)*14);this.blast(f.x,f.y,100,dm*1.6,f)}
  if(id==='mia'){this.ev({k:'blast',x:f.x,y:f.y,r:230,h:1});for(const e of this.f){if(!e.alive||D(e,f)>230)continue;if(e===f||(this.tm&&e.team===f.team))this.heal(e,e.max*.4);else this.hurt(e,dm,f)}}
  if(id==='boum')for(let i=0;i<6;i++)this.bul(f,ang+rnd(-.5,.5),420,rnd(.3,.75),dm*.8,{bomb:1,r:11,kd:1});
  if(id==='kira')this.bul(f,ang,1000,1.1,dm*2.4,{pierce:1,r:16,kd:2});
  if(id==='ange')this.mn.push({id:this.nid++,x:f.x+Math.cos(ang)*40,y:f.y+Math.sin(ang)*40,hp:1500,max:1500,team:f.team,own:f,alive:true,mn:1,life:9,ang:ang});
  if(id==='ombre'){const d=Math.min(dist||c.rg,c.rg),tx=f.x+Math.cos(ang)*d,ty=f.y+Math.sin(ang)*d;this.ev({k:'blast',x:tx,y:ty,r:160,s:1});for(const e of this.f)if(this.foe(f,e)&&Math.hypot(e.x-tx,e.y-ty)<160){e.root=5;e.rootBy=f}}
  if(id==='kmien'){let t=null,bd=520;for(const e of this.f)if(this.foe(f,e)&&D(f,e)<bd){bd=D(f,e);t=e}if(!t){f.sup=1;return}f.dash={e:t,t:.9}}
  if(id==='snip')this.blast(f.x,f.y,160,400*this.cm(f),f,380);
  if(id==='grond')this.blast(f.x,f.y,170,350*this.cm(f),f,420,3);
  if(id==='miner'){const d=Math.min(dist||250,300);this.mn=this.mn.filter(m=>!(m.tur&&m.own===f));this.mn.push({id:this.nid++,x:f.x+Math.cos(ang)*d,y:f.y+Math.sin(ang)*d,hp:1500,max:1500,team:f.team,own:f,alive:true,mn:1,tur:1,life:10,ang:0})}}
 blast(x,y,rad,dm,f,kb,slow){this.ev({k:'blast',x:Math.round(x),y:Math.round(y),r:rad});
  if(this.mode==='fb'){const bl=this.ball,d=Math.hypot(bl.x-x,bl.y-y);if(d<rad+20){bl.vx+=(bl.x-x)/(d||1)*600;bl.vy+=(bl.y-y)/(d||1)*600;bl.lt=f}}
  for(const e of this.f.concat(this.mn))if(this.foe(f,e)&&Math.hypot(e.x-x,e.y-y)<rad+18){this.hurt(e,dm,f);if(kb&&!e.mn)this.push(e,e.x-x,e.y-y,kb,.25);if(slow&&!e.mn)e.slow=slow}}
 push(e,vx,vy,pw,t){const l=Math.hypot(vx,vy)||1;e.kb={vx:vx/l*pw,vy:vy/l*pw,t}}
 heal(e,n){const b=e.hp;e.hp=Math.min(e.max,e.hp+n);this.num(e,null,e.hp-b,1)}
 // chiffres de dégâts/soins regroupés (envoyés seulement aux joueurs concernés)
 num(e,src,a,h){if(a<=0)return;const k=(src?src.id:0)+':'+e.id+':'+(h?1:0);let q=this.acc.get(k);if(!q){q={id:e.id,s:src?src.id:0,d:0,t:this.t,h:h?1:0};this.acc.set(k,q)}q.d+=a}
 flush(force){for(const[k,q]of this.acc){if(force||this.t-q.t>=.3){this.acc.delete(k);if(q.d>=1)this.ev({k:q.h?'heal':'hit',id:q.id,s:q.s,d:Math.round(q.d),v:q.s?[q.id,q.s]:[q.id]})}}}
 hurt(e,a,src){if(e.mn){if(e.alive&&!this.over){e.hp-=a;if(src&&src.own)0}return}
  if(!e.alive||this.over||this.phase!=='play'||this.t<e.shield)return;if(e.buff>0)a*=.5;e.hp-=a;e.lastAct=this.t;
  if(src&&src!==e){src.sup=Math.min(1,src.sup+a/(src.c.dmg*7))}this.num(e,src&&src!==e?src:null,a,0);if(e.hp<=0)this.die(e,src)}
 die(e,src){this.flush(true);e.alive=false;e.hp=0;e.deaths++;e.q.length=0;e.dash=null;this.ev({k:'kill',a:src&&src!==e?src.id:0,v:e.id});
  if(src&&src!==e){src.kills++;if(this.mode==='show'&&src.alive){src.cubes++;src.max+=src.c.hp*.1;src.hp+=src.c.hp*.1}}
  if(this.mode==='show'){for(let i=0;i<1+e.cubes;i++)this.cubes.push({x:e.x+rnd(-30,30),y:e.y+rnd(-30,30)});e.place=this.f.filter(x=>x.alive).length+1;if(this.f.filter(x=>x.alive).length<=1)this.finish()}
  else{if(this.mode==='kn'&&src&&src!==e)this.sc[src.team]++;e.rs=3;if(this.mode==='kn'&&(this.sc[0]>=10||this.sc[1]>=10))this.finish()}}
 respawn(f){const p=this.base(f.team);f.x=p.x;f.y=p.y;f.hp=f.max;f.alive=true;f.ammo=3;f.shield=this.t+3;f.root=0;f.slow=0;f.kb=null}
 finish(){if(this.over)return;this.over=true;this.phase='over';const f=this.f;let win=null,rank;
  if(this.mode==='show'){rank=[...f].sort((a,b)=>(b.alive-a.alive)||((b.alive&&a.alive)?b.hp-a.hp:(b.place||99)*-1+(a.place||99)*-1)||0);rank=[...f].sort((a,b)=>(+b.alive-+a.alive)||(+b.alive?b.hp-a.hp:(b.place||0)-(a.place||0)));rank.forEach((x,i)=>x.place=i+1);win=rank[0].id}
  else win=this.sc[0]===this.sc[1]?-1:this.sc[0]>this.sc[1]?0:1;
  this.result={mode:this.mode,win,sc:this.sc,t:Math.round(this.t),players:f.map(x=>({id:x.id,name:x.name,icon:x.icon,char:x.ch,team:x.team,human:x.human,kills:x.kills,deaths:x.deaths,goals:x.goals,place:x.place||0}))}}
 // ---------- ballon (football) ----------
 ballUpd(dt){const g=this,b=g.ball;
  for(const f of g.f){if(!f.alive)continue;const dx=b.x-f.x,dy=b.y-f.y,d=Math.hypot(dx,dy)||1;if(d<34){const nx=dx/d,ny=dy/d,sp=f.c.sp*62;b.vx=nx*340+f.mx*sp;b.vy=ny*340+f.my*sp;b.x=f.x+nx*35;b.y=f.y+ny*35;b.lt=f}}
  const k=Math.exp(-1.3*dt),v=Math.hypot(b.vx,b.vy);b.vx*=k*(v>900?900/v:1);b.vy*=k*(v>900?900/v:1);
  let nx=b.x+b.vx*dt,ny=b.y+b.vy*dt;const gy=ny>480&&ny<720;
  if(g.hitW(nx,b.y,14)){b.vx*=-.8;nx=b.x}if(g.hitW(nx,ny,14)){b.vy*=-.8;ny=b.y}
  if(ny<14||ny>MH-14){b.vy*=-.8;ny=clamp(ny,14,MH-14)}if((nx<14||nx>MW-14)&&!gy){b.vx*=-.8;nx=clamp(nx,14,MW-14)}
  b.x=nx;b.y=ny;
  if(b.x<-10||b.x>MW+10){const t=b.x>MW?0:1;g.sc[t]++;if(b.lt&&b.lt.team===t)b.lt.goals++;g.ev({k:'goal',team:t,by:b.lt?b.lt.id:0});
   if(g.sc[t]>=2){g.finish();return}
   b.x=MW/2;b.y=MH/2;b.vx=b.vy=0;b.lt=null;g.phase='count';g.cd=2.2;for(const f of g.f){const p=g.base(f.team);f.x=p.x;f.y=p.y;f.hp=f.max;f.alive=true;f.ammo=3;f.shield=g.t+3;f.dash=null;f.kb=null}g.bu=[]}}
 // ---------- IA des bots (aussi utilisée quand un joueur se déconnecte) ----------
 ai(f,dt){const g=this,a=f.ai;a.t-=dt;let tg=null,bd=1e9;
  for(const e of g.f)if(g.foe(f,e)){const d=D(f,e);if(d<bd&&!(g.inBush(e)&&d>110)){bd=d;tg=e}}
  if(a.t<=0){a.t=rnd(.4,.9);a.sx=R()<.5?1:-1;if(g.mode==='show'){a.tx=MW/2+rnd(-320,320);a.ty=MH/2+rnd(-250,250)}else{a.tx=(f.team?250:1350)+rnd(-120,120);a.ty=(f.team?950:250)+rnd(-120,120)}}
  let dx,dy;
  if(g.mode==='fb'&&!(tg&&bd<230)){const b=g.ball,dir=f.team?-1:1;let tx,ty;if((f.x-b.x)*dir<-15){tx=b.x+dir*80;ty=b.y+(MH/2-b.y)*.3}else{tx=b.x-dir*90;ty=b.y+(f.y>b.y?70:-70)}dx=tx-f.x;dy=ty-f.y;f.ang=Math.atan2(b.y-f.y,b.x-f.x);if(D(f,b)<f.c.rg*.8&&R()<dt*2)g.fire(f,f.ang,D(f,b))}
  else if(tg&&bd<650){const ang=Math.atan2(tg.y-f.y,tg.x-f.x);f.ang=ang;const want=f.c.t==='shotgun'?80:f.c.rg*.7,k=bd>want+30?1:bd<want-60?-1:0;
   dx=Math.cos(ang)*k+Math.cos(ang+1.57)*a.sx*.8;dy=Math.sin(ang)*k+Math.sin(ang+1.57)*a.sx*.8;
   if(bd<f.c.rg&&R()<dt*3)g.fire(f,ang+rnd(-.08,.08),bd);if(f.sup>=1&&bd<f.c.rg*1.1&&R()<dt*2)g.zup(f,ang,bd)}
  else{dx=a.tx-f.x;dy=a.ty-f.y;f.ang=Math.atan2(dy,dx)}
  if(g.mode==='show'&&Math.hypot(f.x-MW/2,f.y-MH/2)>g.zone-70){dx=MW/2-f.x;dy=MH/2-f.y}
  f.mx=dx;f.my=dy}
 // ---------- boucle de simulation ----------
 tick(dt){if(this.over)return;
  if(this.phase==='intro'){this.intro-=dt;if(this.intro<=0)this.phase='count';return}
  if(this.phase==='count'){this.cd-=dt;if(this.cd<=0)this.phase='play';return}
  if(this.phase!=='play')return;const g=this;g.t+=dt;
  if(g.mode==='show'&&g.t>12)g.zone=Math.max(220,900-(g.t-12)*7);
  if(g.mode==='fb'){g.ballUpd(dt);if(g.phase!=='play')return}
  for(const f of g.f){
   if(!f.alive){if(g.tm&&f.rs>0){f.rs-=dt;if(f.rs<=0)g.respawn(f)}continue}
   if(f.ammo<3){f.ar+=dt*1000;if(f.ar>=f.c.rl){f.ar=0;f.ammo++}}else f.ar=0;
   if(g.t-f.lastAct>2.5&&f.hp<f.max)g.heal(f,f.max*.12*dt);
   if(f.human){while(f.q.length){const a=f.q.shift();if(a.k==='f')g.fire(f,a.a,a.d);else g.zup(f,a.a,a.d)}}else g.ai(f,dt);
   if(g.over)return;
   let l=Math.hypot(f.mx,f.my);if(l>1){f.mx/=l;f.my/=l}
   const sp=f.c.sp*62*(f.buff>0?1.3:1)*(f.slow>0?.5:1);if(f.root>0&&f.rootBy&&!f.rootBy.alive)f.root=0;
   if(!(f.root>0)&&!f.dash)g.move(f,f.mx*sp*dt,f.my*sp*dt);if(f.root>0)f.root-=dt;if(f.slow>0)f.slow-=dt;if(f.buff>0)f.buff-=dt;
   if(f.kb){g.move(f,f.kb.vx*dt,f.kb.vy*dt);f.kb.t-=dt;if(f.kb.t<=0)f.kb=null}
   if(f.dash){const d=f.dash,t=d.e;if(!t.alive||d.t<=0||Math.hypot(t.x-f.x,t.y-f.y)<34){g.blast(f.x,f.y,95,f.c.dmg*1.6*g.cm(f),f);f.dash=null}else{const a=Math.atan2(t.y-f.y,t.x-f.x),px=f.x,py=f.y;g.move(f,Math.cos(a)*900*dt,Math.sin(a)*900*dt);d.t-=dt;f.ang=a;if(Math.hypot(f.x-px,f.y-py)<1)d.t-=dt*3}}
   if(g.mode==='show'){if(Math.hypot(f.x-MW/2,f.y-MH/2)>g.zone)g.hurt(f,380*dt,null);if(!f.alive)continue;for(let i=g.cubes.length-1;i>=0;i--)if(Math.hypot(g.cubes[i].x-f.x,g.cubes[i].y-f.y)<30){g.cubes.splice(i,1);f.cubes++;f.max+=f.c.hp*.1;f.hp+=f.c.hp*.1}}
   if(g.over)return}
  // projectiles (déplacés par petits pas pour ne jamais traverser une cible)
  for(let i=g.b.length-1;i>=0;i--){const b=g.b[i];b.life-=dt;let rm=b.life<=0;
   if(b.bomb){b.x+=b.vx*dt;b.y+=b.vy*dt;if(rm)g.blast(b.x,b.y,85,b.dm,b.f)}
   else{const n=Math.max(1,Math.ceil(Math.hypot(b.vx,b.vy)*dt/10)),sx=b.vx*dt/n,sy=b.vy*dt/n;
    for(let s=0;s<n&&!rm;s++){b.x+=sx;b.y+=sy;
     if((!b.under&&g.hitW(b.x,b.y,2))||b.x<0||b.y<0||b.x>MW||b.y>MH){if(g.mode==='fb'&&b.y>0&&b.y<MH&&(b.x<0||b.x>MW)){}rm=true;break}
     if(g.mode==='fb'&&Math.hypot(g.ball.x-b.x,g.ball.y-b.y)<b.r+16){g.ball.vx+=b.vx*.9;g.ball.vy+=b.vy*.9;g.ball.lt=b.f;if(!b.pierce){rm=true;break}}
     for(const e of g.f.concat(g.mn)){if(!e.alive||e===b.f||Math.hypot(e.x-b.x,e.y-b.y)>b.r+18)continue;
      if(b.heal&&g.tm&&e.team===b.f.team){if(e.mn)e.hp=Math.min(e.max,e.hp+b.dm*.9);else g.heal(e,b.dm*.9);rm=true;break}
      if(g.foe(b.f,e)){if(b.pierce){if(!b.hit)b.hit=[];if(b.hit.includes(e))continue;b.hit.push(e)}
       g.hurt(e,b.tr?b.tr[Math.min(2,Math.floor(Math.hypot(b.x-b.sx,b.y-b.sy)/b.rng*3))]*b.mul:b.dm,b.f);if(b.kb&&!e.mn)g.push(e,b.vx,b.vy,300,.18);if(!b.pierce){rm=true;break}}}
     if(g.over)return}
    if(rm&&b.end&&!b.exo){b.exo=1;g.blast(b.x,b.y,75,b.dm,b.f,260)}}
   if(rm)g.b.splice(i,1)}
  // minions : ange (corps à corps) et tourelle (zone)
  for(const m of g.mn){if(!m.alive)continue;m.life-=dt;if(m.life<=0||m.hp<=0){m.alive=false;continue}
   if(m.tur){for(const e of g.f)if(g.foe(m,e)&&Math.hypot(e.x-m.x,e.y-m.y)<260)g.hurt(e,100*dt,m.own);continue}
   let t=null,bd=1e9;for(const e of g.f)if(g.foe(m,e)&&!(g.inBush(e)&&D(m,e)>110)){const d=D(m,e);if(d<bd){bd=d;t=e}}
   m.mv=0;if(t){const a=Math.atan2(t.y-m.y,t.x-m.x);m.ang=a;if(bd>36){g.move(m,Math.cos(a)*260*dt,Math.sin(a)*260*dt);m.mv=1}else g.hurt(t,2500*dt,m.own)}}
  g.mn=g.mn.filter(m=>m.alive);g.flush(false);
  if(g.tm&&g.t>=120&&!g.over)g.finish();if(g.mode==='show'&&g.t>=300&&!g.over)g.finish()}
 // ---------- état envoyé aux clients (le brouillard des buissons est calculé ICI : pas de triche possible) ----------
 drainEv(){const e=this.evs;this.evs=[];return e}
 snap(id,evs){const v=this.f.find(x=>x.id===id),vt=v?v.team:-1,mates=this.f.filter(x=>x.alive&&x.team===vt),
  vis=f=>f===v||f.team===vt||!this.inBush(f)||mates.some(m=>D(m,f)<110),r=n=>Math.round(n*10)/10,
  ph={wait:0,intro:1,count:2,play:3,over:4}[this.phase];
  return{t:'snap',ph,tm:r(this.t),cd:r(this.cd),it:r(this.intro),zone:Math.round(this.zone),sc:this.sc,ack:v?v.seq:0,
   f:this.f.filter(f=>vis(f)).map(f=>[f.id,r(f.x),r(f.y),Math.round(f.ang*100)/100,Math.round(f.hp),Math.round(f.max),f.ammo,Math.round(f.sup*100),(f.alive?1:0)|(this.t<f.shield?2:0)|(f.root>0?4:0)|(f.slow>0?8:0)|(f.buff>0?16:0)|(f.dash?32:0),f.team,f.kills,f.deaths,f.goals,Math.round(f.rs*10)/10]),
   b:this.b.filter(b=>b.bomb||!this.bushHide(b,vt,mates)).map(b=>[r(b.x),r(b.y),Math.round(b.vx),Math.round(b.vy),b.r,b.kd,(b.under?1:0)|(b.heal?2:0)|(b.pierce?4:0),b.f.id]),
   mn:this.mn.map(m=>[m.id,r(m.x),r(m.y),Math.round(m.hp),m.max,m.tur?1:0,m.own.id,m.team,Math.round(m.ang*100)/100,m.life|0]),
   cu:this.cubes.map(c=>[Math.round(c.x),Math.round(c.y)]),ball:this.mode==='fb'?[r(this.ball.x),r(this.ball.y)]:null,
   ev:evs.filter(e=>!e.v||e.v.includes(id))}}
 bushHide(b,vt,mates){return false}
}
