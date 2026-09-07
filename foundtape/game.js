/* ======================================================================
   FOUND TAPE — SUBLEVEL 0   (mobile)
   Spielbare Fassung des Fundstücks: Camcorder, Bänder, Ausgang,
   und etwas, das die Gänge mit dir teilt.

   Aufbau dieser Datei
     1  Einstellungen, Qualität, Zufall
     2  Renderer, Texturen, Materialien
     3  Grundriss, Begehbarkeit, Wegfindung
     4  Aufbau der Halle (Wände, Licht, Requisiten, Fundstücke)
     5  Der nachgebaute Ort aus dem Originalfoto
     6  Die Gestalt
     7  Bild (Fischauge, Band, Nachtsicht) und Anzeige
     8  Ton
     9  Steuerung (Touch, Maus, Tastatur)
    10  Spielablauf
   ====================================================================== */
'use strict';

/* ============================ 1  Grundlagen ============================ */

const PARAMS = new URLSearchParams(location.search);
const QUALITY = {
  low:  { renderH:320, lights:4, shadows:false, dust:260,  aniso:1, fixtures:0.55 },
  mid:  { renderH:432, lights:6, shadows:false, dust:650,  aniso:4, fixtures:0.8  },
  high: { renderH:600, lights:8, shadows:true,  dust:1200, aniso:8, fixtures:1.0  }
};
const IS_TOUCH = matchMedia('(hover: none)').matches || 'ontouchstart' in window;

const CFG = {
  seed:       +(PARAMS.get('seed') || (Math.random()*1e9|0)),
  grid:       20,
  cell:       4.2,
  wallH:      3.2,
  eye:        1.62,
  radius:     0.40,

  walk:       2.35,
  sprint:     4.65,
  staminaMax: 6.0,
  staminaRegen: 0.95,

  tapes:      6,
  batteries:  5,

  monWalk:    1.45,   // streift umher
  monHunt:    3.35,   // jagt (langsamer als Sprint, schneller als Gehen)
  monCatch:   1.15,
  dirMin:     12,
  dirRnd:     8,
  verlier:    6.5,
  steigerung: 0.075,
  monSight:   26,
  monCone:    Math.cos(1.28),   // ~147° Sichtfeld

  drainIdle:  0.030,  // Akku %/s
  drainNv:    0.62,
  batteryGain: 26,

  exposure:   0.66,
  lightPower: 5.2,
  fog:        0.038,
  vhs:        0.42,
  yellow:     PARAMS.has('yellow') ? +PARAMS.get('yellow') : 1.0,   // Gelbstich, 0 = aus, 1 = voll
  lens:       0.34
};

let quality = QUALITY[localStorage.getItem('ft_q') || (IS_TOUCH ? 'mid' : 'high')] || QUALITY.mid;

/* Schwierigkeitsgrade. Die Etage wird immer mit der größten Zahl an Fundstücken
   gebaut; überzählige werden beim Start abgeschaltet. So lässt sich der Grad
   noch im Menü wechseln, ohne alles neu zu erzeugen. */
const MAXTAPES = 8, MAXBATT = 7;
const DIFFS = {
  baby: {
    tapes:4, batts:6, hunt:2.75, sight:18, cone:Math.cos(1.00), fang:1.00,
    stamina:8.0, regen:1.30, drainNv:0.45, dirMin:20, dirRnd:12, verlier:4.5, steigerung:0.03
  },
  normal: {
    tapes:6, batts:5, hunt:3.35, sight:26, cone:Math.cos(1.28), fang:1.15,
    stamina:6.0, regen:0.95, drainNv:0.62, dirMin:12, dirRnd:8,  verlier:6.5, steigerung:0.075
  },
  extreme: {
    tapes:8, batts:4, hunt:3.95, sight:34, cone:Math.cos(1.55), fang:1.35,
    stamina:4.5, regen:0.70, drainNv:0.85, dirMin:7,  dirRnd:5,  verlier:9.0, steigerung:0.11
  }
};
let diffKey = localStorage.getItem('ft_diff') || 'normal';
if(!DIFFS[diffKey]) diffKey = 'normal';

/* Zufall mit Seed — dasselbe Band ergibt dieselbe Etage */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
let rnd = mulberry32(CFG.seed);
const ri = n => (rnd()*n)|0;
const pick = arr => arr[ri(arr.length)];
const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const lerp = (a,b,t) => a+(b-a)*t;

const $ = id => document.getElementById(id);

/* Dateipfade laufen über diese Stelle. In der Einzeldatei-Fassung liegt in
   window.FT_ASSETS für jeden Pfad der eingebettete Inhalt. */
const A = u => (window.FT_ASSETS && window.FT_ASSETS[u]) || u;

/* ====================== 2  Renderer und Material ====================== */

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance' });
renderer.setPixelRatio(1);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = CFG.exposure;
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const FOGCOL = 0x0a0803;      // Tiefe läuft ins Schwarz, nicht in gelben Dunst
scene.fog = new THREE.FogExp2(FOGCOL, CFG.fog);
scene.background = new THREE.Color(FOGCOL);

const camera = new THREE.PerspectiveCamera(74, 16/9, 0.06, 200);
camera.rotation.order = 'YXZ';

const ANISO = Math.min(quality.aniso, renderer.capabilities.getMaxAnisotropy());

const loadMgr = new THREE.LoadingManager();
const texLoader = new THREE.TextureLoader(loadMgr);

function cv(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
function grain(ctx,w,h,amt){
  const im=ctx.getImageData(0,0,w,h), d=im.data;
  for(let i=0;i<d.length;i+=4){ const n=(Math.random()-0.5)*amt; d[i]+=n; d[i+1]+=n; d[i+2]+=n*0.8; }
  ctx.putImageData(im,0,0);
}
function blobs(ctx,w,h,n,col,r0,r1){
  for(let i=0;i<n;i++){
    const x=Math.random()*w, y=Math.random()*h, r=r0+Math.random()*(r1-r0);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,col); g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
  }
}
function fromCanvas(c,rx,ry){
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
  t.encoding=THREE.sRGBEncoding; t.anisotropy=ANISO;
  return t;
}
function fromFile(url,rx,ry){
  const t=texLoader.load(url);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
  t.encoding=THREE.sRGBEncoding; t.anisotropy=ANISO;
  return t;
}

// Deckenplatten mit sichtbarem Raster
function ceilTex(){
  const s=512, c=cv(s,s), x=c.getContext('2d');
  x.fillStyle='#cfc9a8'; x.fillRect(0,0,s,s);
  for(let i=0;i<2200;i++){
    x.fillStyle='rgba('+(150+Math.random()*60|0)+','+(146+Math.random()*55|0)+',120,.10)';
    x.fillRect(Math.random()*s,Math.random()*s,3,2);
  }
  blobs(x,s,s,10,'rgba(120,104,52,.20)',20,90);
  x.strokeStyle='rgba(96,90,64,.75)'; x.lineWidth=5; x.strokeRect(0,0,s,s);
  x.beginPath(); x.moveTo(s/2,0); x.lineTo(s/2,s); x.moveTo(0,s/2); x.lineTo(s,s/2); x.stroke();
  x.strokeStyle='rgba(232,228,204,.5)'; x.lineWidth=2;
  x.beginPath(); x.moveTo(s/2+3,0); x.lineTo(s/2+3,s); x.moveTo(0,s/2+3); x.lineTo(s,s/2+3); x.stroke();
  grain(x,s,s,16);
  return c;
}
function ventTex(){
  const w=128,h=64,c=cv(w,h),x=c.getContext('2d');
  x.fillStyle='#1c1a13'; x.fillRect(0,0,w,h);
  x.fillStyle='#4a463a';
  for(let i=4;i<h-3;i+=6) x.fillRect(4,i,w-8,3);
  grain(x,w,h,20);
  return c;
}
function slatTex(){
  const w=256,h=256,c=cv(w,h),x=c.getContext('2d');
  x.fillStyle='#d9d2b0'; x.fillRect(0,0,w,h);
  for(let i=0;i<w;i+=7){
    x.fillStyle='rgba(120,112,80,0.28)'; x.fillRect(i,0,2,h);
    x.fillStyle='rgba(255,250,225,0.30)'; x.fillRect(i+3,0,2,h);
  }
  grain(x,w,h,14);
  return c;
}
function stainAlpha(){
  const s=192, c=cv(s,s), x=c.getContext('2d');
  x.fillStyle='#000'; x.fillRect(0,0,s,s);
  x.globalCompositeOperation='lighter';
  for(let i=0;i<14;i++){
    const px=s/2+(Math.random()-0.5)*s*0.34, py=s/2+(Math.random()-0.5)*s*0.34;
    const r=s*(0.16+Math.random()*0.2);
    const g=x.createRadialGradient(px,py,0,px,py,r);
    g.addColorStop(0,'rgba(255,255,255,0.55)');
    g.addColorStop(0.55,'rgba(255,255,255,0.28)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g; x.beginPath(); x.arc(px,py,r,0,7); x.fill();
  }
  return c;
}
function labelTex(){
  const w=256,h=160,c=cv(w,h),x=c.getContext('2d');
  x.fillStyle='#141210'; x.fillRect(0,0,w,h);
  x.fillStyle='#cfc6a4'; x.fillRect(16,18,w-32,64);
  x.fillStyle='#1a1712'; x.font='bold 26px "Courier New",monospace';
  x.fillText('SUBLEVEL 0', 26, 58);
  x.fillStyle='#2a2620'; x.fillRect(16,96,w-32,44);
  x.fillStyle='#8a8266'; x.font='16px "Courier New",monospace';
  x.fillText('VHS · SP · 120', 26, 126);
  grain(x,w,h,10);
  return c;
}

const CS = CFG.cell, G = CFG.grid, WH = CFG.wallH, SPAN = G*CS;

const ceilMap  = fromCanvas(ceilTex(), G, G);
const wallMap  = fromFile(A('assets/wall.jpg'), 1.6, 1.15);
const wall2Map = fromFile(A('assets/wall2.jpg'), 1.2, 1.0);
const floorMap = fromFile(A('assets/floor.jpg'), G*4, G*4);
const stainMap = new THREE.CanvasTexture(stainAlpha());

const MAT = {
  wall:  new THREE.MeshStandardMaterial({ map:wallMap, roughness:0.94, metalness:0,
                                          bumpMap:wallMap, bumpScale:0.006 }),
  wall2: new THREE.MeshStandardMaterial({ map:wall2Map, roughness:0.93, metalness:0 }),
  floor: new THREE.MeshStandardMaterial({ map:floorMap, roughness:0.99, metalness:0,
                                          color:0xc3b988, bumpMap:floorMap, bumpScale:0.03 }),
  ceil:  new THREE.MeshStandardMaterial({ map:ceilMap, roughness:0.96, metalness:0,
                                          emissive:0x121009, emissiveMap:ceilMap }),
  base:  new THREE.MeshStandardMaterial({ color:0xd8cd8e, roughness:0.55, metalness:0.05 }),
  hous:  new THREE.MeshStandardMaterial({ color:0xb3ad90, roughness:0.5, metalness:0.25 }),
  tube:  new THREE.MeshBasicMaterial({ color:0xfff6e0, fog:false }),
  vent:  new THREE.MeshStandardMaterial({ map:fromCanvas(ventTex(),1,1), roughness:0.7, metalness:0.3 }),
  chair: new THREE.MeshStandardMaterial({ color:0x4b3c20, roughness:0.7, metalness:0.05 }),
  stain: new THREE.MeshStandardMaterial({ color:0x2e2612, roughness:1, metalness:0,
                                          alphaMap:stainMap, transparent:true, opacity:0.9,
                                          depthWrite:false, polygonOffset:true,
                                          polygonOffsetFactor:-2, polygonOffsetUnits:-2 }),
  slat:  new THREE.MeshStandardMaterial({ map:fromCanvas(slatTex(),4,1), roughness:0.85, metalness:0.05 }),
  rail:  new THREE.MeshStandardMaterial({ color:0xb99a52, roughness:0.5, metalness:0.1 }),
  rad:   new THREE.MeshStandardMaterial({ color:0xc9c2a4, roughness:0.6, metalness:0.3 }),
  plug:  new THREE.MeshStandardMaterial({ color:0xd8d2b4, roughness:0.6, metalness:0 }),
  black: new THREE.MeshBasicMaterial({ color:0x000000, fog:false }),
  dark:  new THREE.MeshBasicMaterial({ color:0x070605, fog:false }),
  tapeBody: new THREE.MeshStandardMaterial({ color:0x1a1712, roughness:0.55, metalness:0.1 }),
  tapeLbl:  new THREE.MeshStandardMaterial({ map:fromCanvas(labelTex(),1,1), roughness:0.7, metalness:0 }),
  batt:  new THREE.MeshStandardMaterial({ color:0x2a2a2e, roughness:0.5, metalness:0.4,
                                          emissive:0x113311, emissiveIntensity:0.6 }),
  door:  new THREE.MeshStandardMaterial({ color:0x6d6a5c, roughness:0.45, metalness:0.6 }),
  signOn:  new THREE.MeshBasicMaterial({ color:0x39d15a, fog:false }),
  signOff: new THREE.MeshBasicMaterial({ color:0x3a1414, fog:false }),
  photo: new THREE.MeshStandardMaterial({ map:fromFile(A('assets/photo.jpg'),1,1), roughness:0.8, metalness:0 })
};
const TUBECOL = new THREE.Color(2.15, 1.98, 1.6);

/* ================= 3  Grundriss, Begehbarkeit, Wegfindung ================= */

const idx = (x,y) => y*G + x;
const blocked = new Uint8Array(G*G);        // Pfeilerzellen
const wallV   = new Uint8Array((G+1)*G);    // Wand westlich von (x,y)
const wallHz  = new Uint8Array(G*(G+1));    // Wand nördlich von (x,y)
const vi = (x,y) => y*(G+1) + x;
const hi = (x,y) => y*G + x;

for(let y=0;y<G;y++){ wallV[vi(0,y)]=1; wallV[vi(G,y)]=1; }
for(let x=0;x<G;x++){ wallHz[hi(x,0)]=1; wallHz[hi(x,G)]=1; }

// Innenwände als lange Züge mit Durchgängen
const RUNS = Math.round(G*G/11);
for(let r=0;r<RUNS;r++){
  const horiz = rnd()<0.5;
  const len = 3 + ri(6);
  const x = 1 + ri(G-2), y = 1 + ri(G-2);
  const gap1 = ri(len), gap2 = ri(len);
  for(let k=0;k<len;k++){
    if(k===gap1 || k===gap2) continue;      // Türöffnung
    if(horiz){ const cx=x+k; if(cx<1||cx>=G-1) continue; wallHz[hi(cx,y)]=1; }
    else     { const cy=y+k; if(cy<1||cy>=G-1) continue; wallV[vi(x,cy)]=1; }
  }
}

// Pfeilerreihen prägen die großen Hallen
const PILLARS = [];
for(let r=0;r<Math.round(G/2.2);r++){
  const horiz = rnd()<0.5;
  const len = 3 + ri(5);
  const x = 2 + ri(G-4), y = 2 + ri(G-4);
  for(let k=0;k<len;k++){
    const cx = horiz ? x+k*2 : x, cy = horiz ? y : y+k*2;
    if(cx<1||cy<1||cx>=G-1||cy>=G-1) continue;
    blocked[idx(cx,cy)] = 1;
  }
}
for(let i=0;i<G*G;i++) if(!blocked[i] && rnd()<0.02) blocked[i]=1;

/* Der nachgebaute Ort aus dem Originalfoto bekommt einen freigeräumten Block */
const LM = { bx: 2 + ri(G-9), by: 2 + ri(G-9) };
for(let y=LM.by;y<LM.by+4;y++) for(let x=LM.bx;x<LM.bx+4;x++){
  blocked[idx(x,y)] = 0;
  if(x>LM.bx) wallV[vi(x,y)] = 0;
  if(y>LM.by) wallHz[hi(x,y)] = 0;
}
for(let y=LM.by;y<LM.by+4;y++){ wallV[vi(LM.bx,y)]=1; wallV[vi(LM.bx+4,y)]=1; }
for(let x=LM.bx;x<LM.bx+4;x++) wallHz[hi(x, LM.by+4)] = 1;
for(let x=LM.bx;x<LM.bx+4;x++) wallHz[hi(x, LM.by)] = (x === LM.bx+2) ? 0 : 1;   // ein Durchgang
LM.cell = idx(LM.bx+2, LM.by);
LM.vx = (LM.bx+2)*CS + CS/2;
LM.vz = LM.by*CS + CS/2;

/* Die Wandzüge können Zellen komplett einmauern. Alles, was nicht am
   größten Bereich hängt, wird angebunden — sonst steht der Spieler in
   einer versiegelten Kammer und die Etage hat keine Bänder. */
function ensureConnected(){
  const comp = new Int32Array(G*G).fill(-1);
  const nb = [];
  const sizes = [];
  let nc = 0;
  for(let i=0;i<G*G;i++){
    if(blocked[i] || comp[i] >= 0) continue;
    const q=[i]; comp[i]=nc; let n=0;
    for(let h=0;h<q.length;h++){
      const c=q[h]; n++;
      for(const k of neighbours(c, nb)) if(comp[k] < 0){ comp[k]=nc; q.push(k); }
    }
    sizes.push(n); nc++;
  }
  if(nc <= 1) return;
  let main = 0;
  for(let k=1;k<nc;k++) if(sizes[k] > sizes[main]) main = k;

  const relabel = from => { for(let i=0;i<G*G;i++) if(comp[i] === from) comp[i] = main; };
  const openWall = (x,y,nx,ny) => {
    if(nx === x+1) wallV[vi(x+1,y)] = 0;
    else if(nx === x-1) wallV[vi(x,y)] = 0;
    else if(ny === y+1) wallHz[hi(x,y+1)] = 0;
    else wallHz[hi(x,y)] = 0;
  };

  for(let pass=0; pass<3; pass++){
    let open = false;
    for(let y=0;y<G;y++) for(let x=0;x<G;x++){
      const i = idx(x,y);
      if(blocked[i] || comp[i] < 0 || comp[i] === main) continue;
      const dirs = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
      for(const d of dirs){
        const nx=d[0], ny=d[1];
        if(nx<0||ny<0||nx>=G||ny>=G) continue;
        const j = idx(nx,ny);
        if(blocked[j]){
          // Pfeiler dahinter: nur aufbrechen, wenn dahinter der Hauptbereich liegt
          const ax = nx + (nx-x), ay = ny + (ny-y);
          if(ax<0||ay<0||ax>=G||ay>=G) continue;
          if(comp[idx(ax,ay)] !== main) continue;
          blocked[j] = 0; comp[j] = main;
          openWall(x,y,nx,ny); openWall(nx,ny,ax,ay);
        } else if(comp[j] === main){
          openWall(x,y,nx,ny);
        } else continue;
        relabel(comp[i]);
        open = true;
        break;
      }
    }
    if(!open) break;
  }
}
ensureConnected();

for(let y=0;y<G;y++) for(let x=0;x<G;x++) if(blocked[idx(x,y)]) PILLARS.push([x,y]);

function canGo(x,y,nx,ny){
  if(nx<0||ny<0||nx>=G||ny>=G) return false;
  if(blocked[idx(nx,ny)]) return false;
  if(nx===x+1) return !wallV[vi(x+1,y)];
  if(nx===x-1) return !wallV[vi(x,y)];
  if(ny===y+1) return !wallHz[hi(x,y+1)];
  if(ny===y-1) return !wallHz[hi(x,y)];
  return false;
}
function neighbours(i, out){
  const x=i%G, y=(i/G)|0; out.length=0;
  if(canGo(x,y,x+1,y)) out.push(idx(x+1,y));
  if(canGo(x,y,x-1,y)) out.push(idx(x-1,y));
  if(canGo(x,y,x,y+1)) out.push(idx(x,y+1));
  if(canGo(x,y,x,y-1)) out.push(idx(x,y-1));
  return out;
}
const nbuf = [];
function bfs(start){
  const prev = new Int32Array(G*G).fill(-1);
  const dist = new Int32Array(G*G).fill(-1);
  dist[start]=0; const q=[start];
  for(let h=0; h<q.length; h++){
    const cur=q[h];
    for(const n of neighbours(cur, nbuf)) if(dist[n]<0){ dist[n]=dist[cur]+1; prev[n]=cur; q.push(n); }
  }
  return { prev, dist };
}
/* Die Zellensuche kennt nur Wandkanten und Pfeiler. Die frei stehenden Wände
   des nachgebauten Ortes stecken dagegen in SOLIDS — für die Gestalt muss die
   Verbindung zweier Zellen deshalb zusätzlich am Begehbarkeitsraster geprüft
   werden, sonst plant sie Wege quer durch diese Wände. */
function kanteOffen(x, y, nx, ny){
  if(!OCC_M) return true;
  const ax = x*CS+CS/2, az = y*CS+CS/2, bx = nx*CS+CS/2, bz = ny*CS+CS/2;
  for(let i=0;i<=8;i++){
    const t = i/8;
    if(!freeIn(OCC_M, ax+(bx-ax)*t, az+(bz-az)*t)) return false;
  }
  return true;
}
function nachbarnMon(i, out){
  const x=i%G, y=(i/G)|0; out.length=0;
  if(canGo(x,y,x+1,y) && kanteOffen(x,y,x+1,y)) out.push(idx(x+1,y));
  if(canGo(x,y,x-1,y) && kanteOffen(x,y,x-1,y)) out.push(idx(x-1,y));
  if(canGo(x,y,x,y+1) && kanteOffen(x,y,x,y+1)) out.push(idx(x,y+1));
  if(canGo(x,y,x,y-1) && kanteOffen(x,y,x,y-1)) out.push(idx(x,y-1));
  return out;
}
/* Weg für die Gestalt. Findet sich keiner (etwa weil sie in einer Nische
   steht), wird auf die grobe Suche zurückgefallen. */
function pathToMon(from, to){
  const prev = new Int32Array(G*G).fill(-1);
  const dist = new Int32Array(G*G).fill(-1);
  const buf = [];
  dist[from] = 0;
  const q = [from];
  for(let h=0; h<q.length; h++){
    const cur = q[h];
    if(cur === to) break;
    for(const n of nachbarnMon(cur, buf)) if(dist[n] < 0){ dist[n]=dist[cur]+1; prev[n]=cur; q.push(n); }
  }
  if(dist[to] < 0) return pathTo(from, to);
  const out = []; let c = to;
  while(c >= 0 && c !== from){ out.push(c); c = prev[c]; }
  out.reverse();
  return out;
}

// Weg als Liste von Zellen (start ausgenommen)
function pathTo(from, to){
  const { prev, dist } = bfs(from);
  if(dist[to] < 0) return null;
  const out=[]; let c=to;
  while(c>=0 && c!==from){ out.push(c); c=prev[c]; }
  out.reverse();
  return out;
}

/* Startzelle: möglichst mittig und frei */
let startCell = -1;
{
  let best = 1e9;
  for(let i=0;i<G*G;i++){
    if(blocked[i]) continue;
    const x=i%G, y=(i/G)|0;
    const d = Math.abs(x-G/2) + Math.abs(y-G/2);
    if(d < best){ best=d; startCell=i; }
  }
}
const REACH = bfs(startCell).dist;
const FREE = [];
for(let i=0;i<G*G;i++) if(REACH[i] > 2) FREE.push(i);
if(!FREE.length) for(let i=0;i<G*G;i++) if(REACH[i] >= 0) FREE.push(i);
if(!FREE.length) FREE.push(startCell);

const cellCenter = (i, y) => new THREE.Vector3((i%G)*CS+CS/2, y||0, ((i/G)|0)*CS+CS/2);

/* --------- Begehbarkeitsraster: Wände um einen Radius aufgeblasen --------- */
const SUB = 8, SG = G*SUB, SC = CS/SUB;
const SOLIDS = [];   // zusätzliche Klötze (Landmarke, Tür): [cx, cz, halfX, halfZ]

function buildOcc(clear){
  const occ = new Uint8Array(SG*SG);
  const mark = (cx,cz,hw,hd) => {
    const x0=Math.max(0,Math.floor((cx-hw)/SC)), x1=Math.min(SG-1,Math.floor((cx+hw)/SC));
    const z0=Math.max(0,Math.floor((cz-hd)/SC)), z1=Math.min(SG-1,Math.floor((cz+hd)/SC));
    for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++) occ[z*SG+x]=1;
  };
  for(let y=0;y<G;y++) for(let x=0;x<=G;x++)
    if(wallV[vi(x,y)]) mark(x*CS, y*CS+CS/2, 0.12+clear, CS/2+0.05);
  for(let y=0;y<=G;y++) for(let x=0;x<G;x++)
    if(wallHz[hi(x,y)]) mark(x*CS+CS/2, y*CS, CS/2+0.05, 0.12+clear);
  for(const p of PILLARS) mark(p[0]*CS+CS/2, p[1]*CS+CS/2, 0.78+clear, 0.78+clear);
  for(const s of SOLIDS)  mark(s[0], s[1], s[2]+clear, s[3]+clear);
  return occ;
}
/* Für den Spieler wird gegen die echten Klötze geprüft. Das Raster hat
   Stufen von einer halben Zelle — an einer Wand entlang zu rennen hat
   sich dadurch angefühlt, als hake man alle paar Schritte ein. */
const BOXES = [];
const BGRID = [];
function buildBoxes(){
  BOXES.length = 0;
  for(let y=0;y<G;y++) for(let x=0;x<=G;x++)
    if(wallV[vi(x,y)]) BOXES.push({x:x*CS, z:y*CS+CS/2, hx:0.12, hz:CS/2});
  for(let y=0;y<=G;y++) for(let x=0;x<G;x++)
    if(wallHz[hi(x,y)]) BOXES.push({x:x*CS+CS/2, z:y*CS, hx:CS/2, hz:0.12});
  for(const p of PILLARS) BOXES.push({x:p[0]*CS+CS/2, z:p[1]*CS+CS/2, hx:0.78, hz:0.78});
  for(const s of SOLIDS)  BOXES.push({x:s[0], z:s[1], hx:s[2], hz:s[3]});

  BGRID.length = 0;
  for(let i=0;i<G*G;i++) BGRID.push(null);
  for(const b of BOXES){
    const x0=Math.max(0,Math.floor((b.x-b.hx-1)/CS)), x1=Math.min(G-1,Math.floor((b.x+b.hx+1)/CS));
    const z0=Math.max(0,Math.floor((b.z-b.hz-1)/CS)), z1=Math.min(G-1,Math.floor((b.z+b.hz+1)/CS));
    for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++){
      const i = idx(x,z);
      (BGRID[i] || (BGRID[i] = [])).push(b);
    }
  }
}
/* Schiebt einen Kreis aus allen Klötzen heraus, die er berührt. */
const _near = [];
function resolveCircle(px, pz, r){
  _near.length = 0;
  const cx0 = clamp(Math.floor(px/CS), 0, G-1), cz0 = clamp(Math.floor(pz/CS), 0, G-1);
  for(let z=cz0-1; z<=cz0+1; z++) for(let x=cx0-1; x<=cx0+1; x++){
    if(x<0||z<0||x>=G||z>=G) continue;
    const l = BGRID[idx(x,z)];
    if(l) for(const b of l) if(_near.indexOf(b) < 0) _near.push(b);
  }
  for(let pass=0; pass<2; pass++){
    for(const b of _near){
      const dx = px-b.x, dz = pz-b.z;
      const nx = clamp(dx, -b.hx, b.hx), nz = clamp(dz, -b.hz, b.hz);
      const ox = dx-nx, oz = dz-nz;
      const d2 = ox*ox + oz*oz;
      if(d2 >= r*r) continue;
      if(d2 > 1e-9){
        const d = Math.sqrt(d2);
        px += ox/d*(r-d); pz += oz/d*(r-d);
      } else {                        // Mittelpunkt im Klotz: kürzesten Weg raus
        const ax = b.hx + r - Math.abs(dx), az = b.hz + r - Math.abs(dz);
        if(ax < az) px += (dx < 0 ? -ax : ax);
        else        pz += (dz < 0 ? -az : az);
      }
    }
  }
  return [px, pz];
}

let OCC_RAW, OCC_P, OCC_M;
function rebuildOcc(){
  buildBoxes();
  OCC_RAW = buildOcc(0.02);        // Sichtlinien
  OCC_P   = buildOcc(CFG.radius);  // Spieler
  OCC_M   = buildOcc(0.55);        // Gestalt
}
function freeIn(occ,x,z){
  const ix=Math.floor(x/SC), iz=Math.floor(z/SC);
  return ix>=0 && iz>=0 && ix<SG && iz<SG && !occ[iz*SG+ix];
}
const freeP = (x,z) => freeIn(OCC_P,x,z);
const freeM = (x,z) => freeIn(OCC_M,x,z);
function losClear(ax,az,bx,bz){
  const dx=bx-ax, dz=bz-az, n=Math.ceil(Math.hypot(dx,dz)/0.28);
  for(let i=1;i<n;i++){ const t=i/n; if(!freeIn(OCC_RAW, ax+dx*t, az+dz*t)) return false; }
  return true;
}

/* ==================== 4  Aufbau der Halle ==================== */

const floorM = new THREE.Mesh(new THREE.PlaneGeometry(SPAN,SPAN), MAT.floor);
floorM.rotation.x = -Math.PI/2; floorM.position.set(SPAN/2, 0, SPAN/2);
floorM.receiveShadow = true; scene.add(floorM);

const ceilM = new THREE.Mesh(new THREE.PlaneGeometry(SPAN,SPAN), MAT.ceil);
ceilM.rotation.x = Math.PI/2; ceilM.position.set(SPAN/2, WH, SPAN/2);
scene.add(ceilM);

const segs = [];   // [x, z, rotY]
for(let y=0;y<G;y++) for(let x=0;x<=G;x++) if(wallV[vi(x,y)]) segs.push([x*CS, y*CS+CS/2, Math.PI/2]);
for(let y=0;y<=G;y++) for(let x=0;x<G;x++) if(wallHz[hi(x,y)]) segs.push([x*CS+CS/2, y*CS, 0]);

const m4=new THREE.Matrix4(), qt=new THREE.Quaternion(), vv=new THREE.Vector3(), s1=new THREE.Vector3(1,1,1);
function place(mesh, i, x, y, z, rot){
  qt.setFromEuler(new THREE.Euler(0, rot, 0));
  vv.set(x,y,z);
  mesh.setMatrixAt(i, m4.compose(vv,qt,s1));
}

const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CS, WH, 0.24), MAT.wall, segs.length);
const baseMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CS, 0.13, 0.32), MAT.base, segs.length);
segs.forEach((s,i)=>{ place(wallMesh,i,s[0],WH/2,s[1],s[2]); place(baseMesh,i,s[0],0.065,s[1],s[2]); });
wallMesh.castShadow = wallMesh.receiveShadow = quality.shadows;
baseMesh.receiveShadow = quality.shadows;
scene.add(wallMesh, baseMesh);

const PW = 1.55;
const pilMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(PW, WH, PW), MAT.wall2, Math.max(1,PILLARS.length));
const pilBase = new THREE.InstancedMesh(new THREE.BoxGeometry(PW+0.16, 0.13, PW+0.16), MAT.base, Math.max(1,PILLARS.length));
PILLARS.forEach((p,i)=>{
  const x=p[0]*CS+CS/2, z=p[1]*CS+CS/2;
  place(pilMesh,i,x,WH/2,z,0); place(pilBase,i,x,0.065,z,0);
});
pilMesh.count = pilBase.count = PILLARS.length;
pilMesh.castShadow = pilMesh.receiveShadow = quality.shadows;
scene.add(pilMesh, pilBase);

/* ---------- Deckenleuchten, mit toten Zonen ---------- */
const tubeGeo  = new THREE.PlaneGeometry(1.45, 0.17);
const panelGeo = new THREE.PlaneGeometry(1.15, 0.58);
const tubeHous = new THREE.BoxGeometry(1.6, 0.09, 0.3);
const panHous  = new THREE.BoxGeometry(1.3, 0.09, 0.72);
const fixtures = [];
const housT = [], housP = [];

// drei Bereiche, in denen das Licht ganz ausgefallen ist
const DARKZONES = [];
for(let i=0;i<3;i++){
  const c = pick(FREE);
  DARKZONES.push({ x:(c%G)*CS+CS/2, z:((c/G)|0)*CS+CS/2, r:8.5+rnd()*4 });
}
const inDark = (x,z) => DARKZONES.some(d => (x-d.x)**2 + (z-d.z)**2 < d.r*d.r);

function addFixture(geo, hg, cx, cz, rot){
  const m = new THREE.Mesh(geo, MAT.tube.clone());
  m.rotation.x = Math.PI/2; m.rotation.z = rot;
  m.position.set(cx, WH-0.045, cz);
  scene.add(m);
  hg.push([cx, cz, rot]);
  const dead = inDark(cx,cz);
  fixtures.push({ pos:new THREE.Vector3(cx, WH-0.30, cz), mesh:m, dead:dead,
                  broken: !dead && rnd()<0.12, f:2+rnd()*7, ph:rnd()*6.28, on: dead?0:1 });
}
for(let y=0;y<G;y++) for(let x=0;x<G;x++){
  const cx = x*CS+CS/2, cz = y*CS+CS/2;
  if(y % 3 === 1){ if(rnd() <= quality.fixtures) addFixture(tubeGeo, housT, cx, cz, 0); }
  else if((x+y) % 5 === 0 && rnd()<0.8) addFixture(panelGeo, housP, cx, cz, rnd()<0.5?0:Math.PI/2);
}
function housingMesh(geo, list){
  if(!list.length) return;
  const im = new THREE.InstancedMesh(geo, MAT.hous, list.length);
  list.forEach((h,i)=> place(im, i, h[0], WH-0.06, h[1], h[2]));
  scene.add(im);
}
housingMesh(tubeHous, housT);
housingMesh(panHous,  housP);

for(let i=0;i<Math.round(G*G/26);i++){
  const x=1+ri(G-2), y=1+ri(G-2);
  const v=new THREE.Mesh(new THREE.PlaneGeometry(1.0,0.42), MAT.vent);
  v.rotation.x=Math.PI/2; v.rotation.z = rnd()<0.5?0:Math.PI/2;
  v.position.set(x*CS+CS/2, WH-0.02, y*CS+CS/2);
  scene.add(v);
}

/* ---------- Licht ---------- */
const rig = [];
for(let i=0;i<quality.lights;i++){
  const pl = new THREE.PointLight(0xffd894, 0, 14, 2);
  if(quality.shadows && i<1){
    pl.castShadow=true; pl.shadow.mapSize.set(512,512);
    pl.shadow.bias=-0.005; pl.shadow.camera.near=0.4; pl.shadow.camera.far=13;
  }
  scene.add(pl); rig.push(pl);
}
scene.add(new THREE.HemisphereLight(0xffe0a4, 0x2a2109, 0.035));
scene.add(new THREE.AmbientLight(0x050403, 1.0));

// Nachtsicht-Aufheller am Camcorder
const nvLight = new THREE.PointLight(0xcfe4ff, 0, 15, 1.8);
scene.add(nvLight);

let sortT = 0;
function updateLights(dt, t, danger){
  for(const f of fixtures){
    let v;
    if(f.dead) v = 0;
    else if(f.broken){
      const s = Math.sin(t*f.f + f.ph) + Math.sin(t*f.f*2.6 + f.ph*1.7);
      v = s > 0.75 ? 1 : (Math.random()<0.28 ? 0.45 : 0.02);
    } else {
      v = 0.96 + Math.sin(t*118 + f.ph)*0.04;
      if(Math.random() < 0.0035) v = 0.28;
    }
    if(danger > 0 && Math.random() < 0.25*danger) v *= 0.12;
    if(SCARE.blitz > 0) v = Math.min(2.4, v + 1.6);        // eine Röhre platzt
    f.on = v;
    f.mesh.material.color.copy(TUBECOL).multiplyScalar(v);
  }
  sortT -= dt;
  if(sortT <= 0){
    sortT = 0.25;
    fixtures.sort((a,b)=> a.pos.distanceToSquared(camera.position) - b.pos.distanceToSquared(camera.position));
  }
  for(let i=0;i<rig.length;i++){
    const f = fixtures[i], pl = rig[i];
    if(!f){ pl.intensity = 0; continue; }
    pl.position.copy(f.pos);
    pl.intensity = CFG.lightPower * f.on;
    pl.color.setHex(danger > 0.5 ? 0xff6a34 : 0xffd894);
  }
}

/* ---------- Requisiten ---------- */
function chairMesh(){
  const g=new THREE.Group(), M=MAT.chair;
  const add=m=>{ m.castShadow=quality.shadows; g.add(m); return m; };
  const s=new THREE.Mesh(new THREE.BoxGeometry(.46,.06,.46),M); s.position.y=.44; add(s);
  const b=new THREE.Mesh(new THREE.BoxGeometry(.46,.5,.05),M); b.position.set(0,.69,-.21); add(b);
  [[-.19,-.19],[.19,-.19],[-.19,.19],[.19,.19]].forEach(p=>{
    const l=new THREE.Mesh(new THREE.BoxGeometry(.045,.44,.045),M);
    l.position.set(p[0],.22,p[1]); add(l);
  });
  return g;
}
const props = new THREE.Group(); scene.add(props);
for(let i=0;i<G*G;i++){
  if(blocked[i] || rnd()>0.09) continue;
  const cx=(i%G)*CS+CS/2, cz=((i/G)|0)*CS+CS/2;
  const ox=(rnd()-0.5)*2.2, oz=(rnd()-0.5)*2.2;
  const k = rnd();
  const ch = chairMesh();
  ch.position.set(cx+ox, 0, cz+oz);
  ch.rotation.y = rnd()*6.28;
  if(k<0.20){ ch.rotation.z = Math.PI/2; ch.position.y=0.23; }
  else if(k<0.30){
    for(let s=1;s<2+ri(3);s++){
      const c2=chairMesh(); c2.position.set(cx+ox+(rnd()-.5)*.1, s*0.41, cz+oz+(rnd()-.5)*.1);
      c2.rotation.y=ch.rotation.y+(rnd()-.5)*0.5; props.add(c2);
    }
  } else if(k<0.36){ ch.position.y = WH-0.02; ch.rotation.x = Math.PI; }
  props.add(ch);
}
for(let i=0;i<Math.round(G*G/9);i++){
  const r0=0.5+rnd()*1.1;
  const st=new THREE.Mesh(new THREE.PlaneGeometry(r0*2, r0*2*(0.7+rnd()*0.6)), MAT.stain);
  st.rotation.x=-Math.PI/2; st.rotation.z=rnd()*6.28;
  st.position.set(rnd()*SPAN, 0.012, rnd()*SPAN);
  props.add(st);
}
for(let i=0;i<30;i++){
  const s = pick(segs);
  const st=new THREE.Mesh(new THREE.PlaneGeometry(0.7+rnd()*1.6, 0.5+rnd()*1.5), MAT.stain);
  const side = rnd()<0.5 ? 0.14 : -0.14;
  st.position.set(s[0] + (s[2]===0 ? (rnd()-0.5)*CS*0.6 : side),
                  0.3+rnd()*1.9,
                  s[1] + (s[2]===0 ? side : (rnd()-0.5)*CS*0.6));
  st.rotation.y = s[2] + (side<0 ? Math.PI : 0);
  props.add(st);
}

/* ---------- Staub ---------- */
const dustN = quality.dust;
const dustGeo = new THREE.BufferGeometry();
const dpos = new Float32Array(dustN*3);
for(let i=0;i<dustN;i++){
  dpos[i*3]   = (Math.random()-0.5)*30;
  dpos[i*3+1] =  Math.random()*WH;
  dpos[i*3+2] = (Math.random()-0.5)*30;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos,3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  color:0xffeec4, size:0.034, sizeAttenuation:true, transparent:true,
  opacity:0.42, depthWrite:false, fog:true }));
dust.frustumCulled = false;
scene.add(dust);

/* ============ 5  Der nachgebaute Ort aus dem Originalfoto ============ */
{
  const vx = LM.vx, vz = LM.vz;
  const parts = [
    ['wall',  vx+1.75, 1.6,  vz+1.10,  0.25, 3.2, 5.00],
    ['wall',  vx-2.35, 1.6,  vz+0.50,  0.25, 3.2, 3.80],
    ['wall',  vx-2.95, 1.6,  vz+13.50, 11.10, 3.2, 0.25],
    ['pil',   vx-6.30, 1.6,  vz+5.60,  1.55, 3.2, 1.55],
    ['base',  vx-2.95, 0.065, vz+13.35, 11.10, 0.13, 0.33],
    ['base',  vx+1.60, 0.065, vz+1.10,  0.33, 0.13, 5.00],
    ['base',  vx-2.20, 0.065, vz+0.50,  0.33, 0.13, 3.80],
    ['rad',   vx-4.20, 0.26, vz+13.22,  4.80, 0.52, 0.26],
    ['rail',  vx-2.21, 1.05, vz+0.50,   0.06, 0.09, 3.80],
    ['plug',  vx+1.61, 0.34, vz+1.60,   0.03, 0.13, 0.09]
  ];
  const M = { wall:MAT.wall, pil:MAT.wall2, base:MAT.base, rad:MAT.rad, rail:MAT.rail, plug:MAT.plug };
  for(const p of parts){
    const m = new THREE.Mesh(new THREE.BoxGeometry(p[4],p[5],p[6]), M[p[0]]);
    m.position.set(p[1],p[2],p[3]);
    m.castShadow = m.receiveShadow = quality.shadows;
    scene.add(m);
  }
  const q = new THREE.Mesh(new THREE.PlaneGeometry(3.80, 2.10), MAT.slat);
  q.position.set(vx-4.30, 1.35, vz+13.34); q.rotation.y = Math.PI;
  scene.add(q);

  for(let k=0;k<5;k++){
    addFixture(tubeGeo, [], vx-0.50, vz+3.0+k*2.6, Math.PI/2);
    addFixture(tubeGeo, [], vx-5.40, vz+3.4+k*2.6, Math.PI/2);
  }
  // die Trennwände blockieren den Weg
  SOLIDS.push([vx+1.75, vz+1.10, 0.13, 2.50],
              [vx-2.35, vz+0.50, 0.13, 1.90],
              [vx-2.95, vz+13.50, 5.55, 0.13],
              [vx-6.30, vz+5.60, 0.78, 0.78]);
  LM.view = new THREE.Vector3(vx, 1.50, vz);
}

/* ==================== 6  Ausgang und Fundstücke ==================== */

// Ausgang: freie Randzelle möglichst weit weg vom Start
const EXIT = {};
{
  let best=-1, bestD=-1, side=0;
  for(let i=0;i<G*G;i++){
    if(blocked[i] || REACH[i] < 0) continue;
    const x=i%G, y=(i/G)|0;
    const isEdge = (x===0||y===0||x===G-1||y===G-1);
    if(!isEdge) continue;
    if(REACH[i] > bestD){ bestD=REACH[i]; best=i; side = x===0?0 : x===G-1?1 : y===0?2:3; }
  }
  if(best < 0){ best = FREE[FREE.length-1]; side = 0; }
  if(best === undefined) best = startCell;
  const x=best%G, y=(best/G)|0;
  EXIT.cell = best;
  EXIT.pos = new THREE.Vector3(x*CS+CS/2, 0, y*CS+CS/2);
  // Position und Ausrichtung in der Außenwand
  if(side===0){ EXIT.pos.x = 0.18;        EXIT.rot = Math.PI/2; }
  if(side===1){ EXIT.pos.x = SPAN-0.18;   EXIT.rot = -Math.PI/2; }
  if(side===2){ EXIT.pos.z = 0.18;        EXIT.rot = 0; }
  if(side===3){ EXIT.pos.z = SPAN-0.18;   EXIT.rot = Math.PI; }

  const g = new THREE.Group();
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.15, 0.10), MAT.door);
  door.position.y = 1.075; g.add(door);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.42, 2.42, 0.06), MAT.base);
  frame.position.set(0, 1.21, -0.04); g.add(frame);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.28,0.07), MAT.rail);
  handle.position.set(0.42, 1.05, 0.09); g.add(handle);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.28), MAT.signOff);
  sign.position.set(0, 2.62, 0.06); g.add(sign);
  EXIT.sign = sign;
  g.position.copy(EXIT.pos);
  g.rotation.y = EXIT.rot;
  scene.add(g);
  EXIT.group = g;
  // Der Türblock steht ein Stück in den Raum
  EXIT.door = door;
}

rebuildOcc();

/* ---------- Fundstücke verteilen ---------- */
function spreadCells(count, minSteps, minFromStart){
  const out = [];
  let cand = FREE.filter(i => REACH[i] >= minFromStart && i !== EXIT.cell);
  if(cand.length < 2) cand = FREE.slice();
  for(let n=0; n<count; n++){
    let best=-1, bestScore=-1;
    for(let t=0;t<220;t++){
      const c = pick(cand);
      const cx=c%G, cy=(c/G)|0;
      let near = 1e9;
      for(const o of out) near = Math.min(near, Math.abs(cx-o%G) + Math.abs(cy-(o/G|0)));
      if(near < minSteps) continue;
      const score = near + rnd()*3;
      if(score > bestScore){ bestScore=score; best=c; }
    }
    if(best<0) best = cand.length ? pick(cand) : pick(FREE);
    out.push(best);
  }
  return out;
}

const items = [];      // { kind, obj, pos, taken }
function addItem(kind, obj, pos){
  obj.position.copy(pos);
  scene.add(obj);
  items.push({ kind, obj, pos:pos.clone(), taken:false, spin: rnd()*6.28 });
}
function tapeMesh(){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.032, 0.105), MAT.tapeBody);
  g.add(body);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.085), MAT.tapeLbl);
  lbl.rotation.x = -Math.PI/2; lbl.position.y = 0.0175;
  g.add(lbl);
  return g;
}
function battMesh(){
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.055, 0.16), MAT.batt);
  g.add(b);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.04,0.012), MAT.signOn);
  led.rotation.x = -Math.PI/2; led.position.set(0, 0.029, 0.05);
  g.add(led);
  return g;
}
{
  const tapeCells = spreadCells(MAXTAPES, 4, 4);
  for(const c of tapeCells){
    const p = cellCenter(c, 0.045);
    p.x += (rnd()-0.5)*1.8; p.z += (rnd()-0.5)*1.8;
    if(!freeP(p.x,p.z)){ p.copy(cellCenter(c, 0.045)); }
    const m = tapeMesh(); m.rotation.y = rnd()*6.28;
    addItem('tape', m, p);
  }
  const battCells = spreadCells(MAXBATT, 3, 3);
  for(const c of battCells){
    const p = cellCenter(c, 0.03);
    p.x += (rnd()-0.5)*1.6; p.z += (rnd()-0.5)*1.6;
    if(!freeP(p.x,p.z)){ p.copy(cellCenter(c, 0.03)); }
    const m = battMesh(); m.rotation.y = rnd()*6.28;
    addItem('batt', m, p);
  }
  // Das Originalfoto liegt am nachgebauten Ort
  const ph = new THREE.Group();
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.225), MAT.photo);
  card.rotation.x = -Math.PI/2; ph.add(card);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.006, 0.245), MAT.base);
  back.position.y = -0.006; ph.add(back);
  const pp = new THREE.Vector3(LM.vx-0.6, 0.03, LM.vz+2.4);
  ph.rotation.y = 0.4;
  addItem('photo', ph, pp);
}

/* ======================== 7  Die Gestalt ======================== */

function fallbackMonster(){
  const g=new THREE.Group(), D=MAT.black;
  const put=(w,h,d,y)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),D); m.position.y=y; g.add(m); return m; };
  put(.52,1.25,.30, 1.75); put(.40,.34,.30, 1.02); put(.16,.30,.16, 2.50); put(.30,.40,.30, 2.78);
  const limb=(w,h,px,py)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),D);
    m.geometry.translate(0,-h/2,0); m.position.set(px,py,0); g.add(m); return m; };
  limb(.10,1.35,-.33,2.32); limb(.10,1.35,.33,2.32);
  limb(.13,1.05,-.14,1.02); limb(.13,1.05,.14,1.02);
  return g;
}

const MON = {
  group: new THREE.Group(),
  body:  null,
  pos:   new THREE.Vector3(),
  dir:   new THREE.Vector3(0,0,1),
  state: 'roam',
  path:  null,
  pathIdx: 0,
  repath: 0,
  lastSeen: new THREE.Vector3(),
  seenT: -99,
  searchT: 0,
  stuck: 0,
  dirT: 12,
  sndT: 2,
  height: 2.55
};
MON.group.visible = false;
scene.add(MON.group);

{
  const fb = fallbackMonster();
  MON.group.add(fb); MON.body = fb;
  const loader = new THREE.GLTFLoader(loadMgr);
  loader.load(A('assets/monster.glb'), gl => {
    const m = gl.scene;
    const box = new THREE.Box3().setFromObject(m), sz = new THREE.Vector3();
    box.getSize(sz);
    m.scale.setScalar(MON.height / (sz.y || 1));
    box.setFromObject(m);
    m.position.y = -box.min.y;
    m.traverse(o => { if(o.isMesh){ o.material = MAT.black; o.frustumCulled = false; o.castShadow = false; } });
    MON.group.remove(fb);
    MON.group.add(m);
    MON.body = m;
  }, undefined, () => { /* Notfigur bleibt stehen */ });
}

// Startpunkt: möglichst weit weg vom Spieler
{
  let far=-1, farD=-1;
  for(const i of FREE){
    if(i === EXIT.cell || REACH[i] <= farD) continue;
    const c = cellCenter(i);
    if(!freeM(c.x, c.z)) continue;          // zu eng für die Gestalt
    farD = REACH[i]; far = i;
  }
  if(far < 0) for(const i of FREE){ const c = cellCenter(i); if(freeM(c.x,c.z)){ far=i; break; } }
  if(far < 0) far = startCell;
  const p = cellCenter(far, 0);
  MON.pos.copy(p);
  MON.group.position.copy(p);
}

const cellOf = (x,z) => idx(clamp(Math.floor(x/CS),0,G-1), clamp(Math.floor(z/CS),0,G-1));

function monSetPath(toCell){
  const from = cellOf(MON.pos.x, MON.pos.z);
  const p = pathToMon(from, toCell);
  MON.path = (p && p.length) ? p : null;
  MON.pathIdx = 0;
}
function monRoam(){
  let c = pick(FREE), t=0;
  while(t++ < 12 && cellCenter(c).distanceTo(MON.pos) < 12) c = pick(FREE);
  MON.state = 'roam';
  monSetPath(c);
}

const _mv = new THREE.Vector3();
function monUnstick(){
  if(freeM(MON.pos.x, MON.pos.z)) return;
  const c = cellCenter(cellOf(MON.pos.x, MON.pos.z));
  if(freeM(c.x, c.z)){ MON.pos.set(c.x, 0, c.z); MON.path=null; return; }
  for(const i of FREE){
    const p = cellCenter(i);
    if(freeM(p.x, p.z)){ MON.pos.set(p.x, 0, p.z); MON.path=null; return; }
  }
}

/* Etwas hat die Gestalt aufmerksam gemacht — sie geht der Stelle nach. */
function monAlert(x, z, lange){
  MON.lastSeen.set(x, 0, z);
  if(MON.state === 'hunt') return;
  MON.state = 'search';
  MON.searchT = Math.max(MON.searchT, lange ? 16 : 11);
  MON.repath = 0;
}

function updateMonster(dt, player, noiseRadius){
  monUnstick();
  const toP = _mv.set(player.x - MON.pos.x, 0, player.z - MON.pos.z);
  const distP = toP.length();
  const sees = distP < CFG.monSight &&
               (distP < 6 || toP.clone().normalize().dot(MON.dir) > CFG.monCone) &&
               losClear(MON.pos.x, MON.pos.z, player.x, player.z);

  if(sees){
    MON.seenT = 0;
    MON.lastSeen.set(player.x, 0, player.z);
    if(MON.state !== 'hunt'){ MON.state = 'hunt'; MON.repath = 0; onMonsterSpots(); }
  } else {
    MON.seenT += dt;
  }
  // Lärm: rennende Schritte tragen weit
  if(!sees && noiseRadius > 0 && distP < noiseRadius){
    MON.lastSeen.set(player.x, 0, player.z);
    if(MON.state === 'roam'){ MON.state = 'search'; MON.searchT = 12; MON.repath = 0; }
    else if(MON.state === 'search'){ MON.searchT = Math.max(MON.searchT, 10); MON.repath = Math.min(MON.repath, 0.2); }
  }

  /* Regie: die Gestalt darf nicht ewig am anderen Ende der Etage kreisen.
     Zieht sie zu lange ihre Bahnen, wandert sie in die Gegend des Spielers —
     nah genug für eine Begegnung, ohne dass sie direkt auf ihn zuläuft. */
  MON.dirT -= dt;
  if(MON.dirT <= 0){
    MON.dirT = CFG.dirMin + Math.random()*CFG.dirRnd;
    if(MON.state === 'roam' && distP > 26){
      const pc = cellOf(player.x, player.z), px = pc%G, py = (pc/G)|0;
      for(let t=0;t<40;t++){
        const cx = clamp(px + (Math.random()*15|0) - 7, 0, G-1);
        const cy = clamp(py + (Math.random()*15|0) - 7, 0, G-1);
        const c = idx(cx,cy);
        if(blocked[c] || REACH[c] < 0) continue;
        const ring = Math.abs(cx-px) + Math.abs(cy-py);
        if(ring < 3 || ring > 8) continue;      // in die Gegend, nicht auf den Schoß
        monSetPath(c);
        break;
      }
    }
  }

  // Schwere Schritte, sobald sie in Hörweite ist — das kündigt sie an
  MON.sndT -= dt;
  if(MON.sndT <= 0){
    const hear = MON.state === 'hunt' ? 26 : 17;
    if(distP < hear){
      const nah = 1 - distP/hear;
      MON.sndT = MON.state === 'hunt' ? 0.42 : 0.9 + Math.random()*0.5;
      burst(0.16, 120 + nah*90, 0.05 + nah*0.20);
    } else MON.sndT = 1.5;
  }

  MON.repath -= dt;
  if(MON.state === 'hunt'){
    if(MON.seenT > CFG.verlier){ MON.state='search'; MON.searchT=12; MON.repath=0; }
    else if(MON.repath <= 0){ MON.repath = 0.55; monSetPath(cellOf(MON.lastSeen.x, MON.lastSeen.z)); }
  } else if(MON.state === 'search'){
    MON.searchT -= dt;
    if(MON.searchT <= 0) monRoam();
    else if(MON.repath <= 0 || !MON.path){
      MON.repath = 2.5;
      const base = cellOf(MON.lastSeen.x, MON.lastSeen.z);
      const bx = clamp((base%G) + ri(5)-2, 0, G-1), by = clamp(((base/G)|0) + ri(5)-2, 0, G-1);
      monSetPath(blocked[idx(bx,by)] ? base : idx(bx,by));
    }
  } else if(!MON.path || MON.pathIdx >= MON.path.length){
    monRoam();
  }

  // Bewegung entlang des Weges
  const hunted = CFG.monHunt + (S.tapes || 0)*CFG.steigerung;   // mit jedem Band wird sie zäher
  const speed = MON.state==='hunt' ? hunted : (MON.state==='search' ? CFG.monWalk*1.6 : CFG.monWalk*1.15);
  let tx, tz;
  if(MON.state === 'hunt' && distP < 7 && losClear(MON.pos.x, MON.pos.z, player.x, player.z)){
    tx = player.x; tz = player.z;                       // in Sichtweite direkt drauf zu
  } else if(MON.path && MON.pathIdx < MON.path.length){
    const c = MON.path[MON.pathIdx];
    tx = (c%G)*CS+CS/2; tz = ((c/G)|0)*CS+CS/2;
    if((MON.pos.x-tx)**2 + (MON.pos.z-tz)**2 < 0.55){ MON.pathIdx++; MON.stuck = 0; }
  } else { monRoam(); return distP; }

  const dx = tx-MON.pos.x, dz = tz-MON.pos.z, dl = Math.hypot(dx,dz) || 1;
  const step = speed*dt;
  const nx = MON.pos.x + dx/dl*step, nz = MON.pos.z + dz/dl*step;
  let moved = false;
  if(freeM(nx,nz)){ MON.pos.x=nx; MON.pos.z=nz; moved=true; }
  else if(freeM(nx, MON.pos.z)){ MON.pos.x=nx; moved=true; }
  else if(freeM(MON.pos.x, nz)){ MON.pos.z=nz; moved=true; }
  if(!moved){
    MON.stuck += dt;
    if(MON.stuck > 0.7){ MON.stuck=0; MON.repath=0; if(MON.state==='roam') monRoam(); }
  }

  // Ausrichtung weich nachziehen
  const want = Math.atan2(dx, dz);
  const cur = MON.group.rotation.y;
  let d = want - cur;
  while(d >  Math.PI) d -= Math.PI*2;
  while(d < -Math.PI) d += Math.PI*2;
  MON.group.rotation.y = cur + d*Math.min(dt*4.5, 1);
  MON.dir.set(Math.sin(MON.group.rotation.y), 0, Math.cos(MON.group.rotation.y));

  // schwerer Gang
  const w = performance.now()*0.001 * (MON.state==='hunt' ? 11 : 5.5);
  MON.group.position.set(MON.pos.x, Math.abs(Math.sin(w))*0.11, MON.pos.z);
  if(MON.body){
    MON.body.rotation.z = Math.sin(w)*0.05;
    MON.body.rotation.x = 0.06 + Math.sin(w*2)*0.028;
  }
  MON.group.visible = distP < 42;
  return distP;
}

/* ---------- Eine Gestalt am Gangende, die verschwindet ---------- */
const glimpse = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 1.98), MAT.dark);
glimpse.visible = false;
glimpse.position.y = 0.99;
scene.add(glimpse);

const SCARE = { t: 22 + Math.random()*18, glimpseT: 0, blitz: 0 };

/* Sucht einen Platz im Blickfeld, auf den freie Sicht besteht. */
function platzImBlick(minD, maxD){
  for(let v=0; v<26; v++){
    const ab = (Math.random()-0.5) * 0.9;                  // bis ±26° zur Blickachse
    const d  = minD + Math.random()*(maxD-minD);
    const y  = S.yaw + ab;
    const x  = S.pos.x - Math.sin(y)*d, z = S.pos.z - Math.cos(y)*d;
    if(!freeP(x, z)) continue;
    if(!losClear(S.pos.x, S.pos.z, x, z)) continue;
    return { x, z, d };
  }
  return null;
}

/* Regie für die kleinen Schrecken zwischendurch. Sie greift nur, wenn die
   Gestalt gerade nicht ohnehin hinter einem her ist. */
function scareTick(dt){
  // Die Gestalt am Gangende wieder einsammeln
  if(glimpse.visible){
    SCARE.glimpseT -= dt;
    glimpse.lookAt(camera.position.x, 0.99, camera.position.z);
    const nah = camera.position.distanceTo(glimpse.position) < 7;
    if(SCARE.glimpseT <= 0 || nah){
      glimpse.visible = false;
      if(nah) burst(0.20, 900, 0.10, 'highpass');          // ein Rascheln, dann weg
    }
  }
  if(SCARE.blitz > 0) SCARE.blitz -= dt;

  if(MON.state === 'hunt') return;
  SCARE.t -= dt;
  if(SCARE.t > 0) return;
  SCARE.t = 28 + Math.random()*34;

  const wahl = Math.random();
  if(wahl < 0.45){
    // Jemand steht am Ende des Ganges
    const p = platzImBlick(11, 24);
    if(p){
      glimpse.position.set(p.x, 0.99, p.z);
      glimpse.visible = true;
      SCARE.glimpseT = 1.1 + Math.random()*1.3;
      burst(0.5, 220, 0.10);
      S.glitch = Math.max(S.glitch, 0.55);
    }
  } else if(wahl < 0.78){
    // Eine Röhre platzt
    let f = null, best = 1e9;
    for(const k of fixtures){
      if(k.dead) continue;
      const d = k.pos.distanceTo(camera.position);
      if(d < 3 || d > 16) continue;
      if(!losClear(S.pos.x, S.pos.z, k.pos.x, k.pos.z)) continue;
      if(d < best){ best = d; f = k; }
    }
    if(f){
      f.dead = true;
      SCARE.blitz = 0.12;
      burst(0.10, 5200, 0.34, 'highpass');                 // Knall
      setTimeout(() => burst(0.7, 300, 0.16), 90);          // Nachhall
      S.glitch = Math.max(S.glitch, 0.8);
      if(navigator.vibrate) navigator.vibrate(45);
    }
  } else {
    // Irgendwo fällt etwas um
    burst(0.7, 170, 0.30);
    setTimeout(() => burst(0.35, 120, 0.18), 260);
    S.glitch = Math.max(S.glitch, 0.45);
  }
}

/* ============ 8  Bild: Fischauge, Bandfehler, Nachtsicht ============ */

let RT_W = 640, RT_H = 360;
const rt = new THREE.WebGLRenderTarget(RT_W, RT_H, {
  minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat });
rt.texture.encoding = THREE.sRGBEncoding;

let HUD_W = 640, HUD_H = 360;
const hudC = cv(HUD_W, HUD_H), hudX = hudC.getContext('2d');
const hudTex = new THREE.CanvasTexture(hudC);
hudTex.minFilter = THREE.LinearFilter;

const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const postMat = new THREE.ShaderMaterial({
  uniforms:{
    tDiffuse:{value:rt.texture}, tHud:{value:hudTex},
    uTime:{value:0}, uGlitch:{value:0.06}, uStatic:{value:0}, uFade:{value:0},
    uRed:{value:0}, uNv:{value:0}, uVhs:{value:CFG.vhs}, uLens:{value:CFG.lens},
    uYellow:{value:CFG.yellow},
    uRes:{value:new THREE.Vector2(RT_W,RT_H)}
  },
  vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader:[
    'uniform sampler2D tDiffuse, tHud;',
    'uniform float uTime,uGlitch,uStatic,uFade,uRed,uNv,uVhs,uLens,uYellow;',
    'uniform vec2 uRes;',
    'varying vec2 vUv;',
    'float rand(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453); }',
    'vec3 hi(vec2 p){ return max(texture2D(tDiffuse, clamp(p,0.002,0.998)).rgb - 0.80, 0.0); }',
    'vec3 bloom(vec2 p){',
    '  vec2 r = vec2(0.008,0.011);',
    '  vec3 s = hi(p+vec2(r.x,0.))+hi(p-vec2(r.x,0.))+hi(p+vec2(0.,r.y))+hi(p-vec2(0.,r.y))',
    '        + hi(p+r*0.7)+hi(p-r*0.7)+hi(p+vec2(r.x,-r.y)*0.7)+hi(p+vec2(-r.x,r.y)*0.7);',
    '  vec2 w = r*2.8;',
    '  s += hi(p+vec2(w.x,0.))+hi(p-vec2(w.x,0.))+hi(p+vec2(0.,w.y))+hi(p-vec2(0.,w.y));',
    '  return s/12.0;',
    '}',
    'void main(){',
    '  float V = uVhs;',
    '  vec2 uv = vUv;',
    '  vec2 cc = uv-0.5;',
    '  float r2 = dot(cc,cc);',
    '  uv = 0.5 + cc*(1.0 + uLens*r2)/(1.0 + uLens*0.22);',
    '  uv.x += sin(uv.y*88.0 + uTime*2.4)*0.0011*V*(1.0+uGlitch*3.0);',
    '  float bandPos = fract(uTime*0.10);',
    '  float band = smoothstep(0.045,0.0,abs(uv.y-bandPos))*V;',
    '  uv.x += band*(rand(vec2(uv.y,floor(uTime*30.0)))-0.5)*0.028*(0.3+uGlitch*1.4);',
    '  float row = floor(uv.y*48.0);',
    '  float blk = step(0.995-uGlitch*0.30, rand(vec2(row, floor(uTime*14.0))));',
    '  uv.x += blk*(rand(vec2(row,uTime))-0.5)*0.15*uGlitch*(0.35+V);',
    '  uv = clamp(uv, 0.002, 0.998);',
    '  float ca = (0.0010 + uGlitch*0.006 + band*0.002)*(0.4+V*0.6);',
    '  vec3 col;',
    '  col.r = texture2D(tDiffuse, uv + vec2(ca,0.0)).r;',
    '  col.g = texture2D(tDiffuse, uv).g;',
    '  col.b = texture2D(tDiffuse, uv - vec2(ca,0.0)).b;',
    '  col += bloom(uv) * vec3(1.0,0.95,0.80) * 1.05;',
    '  float lum = dot(col, vec3(0.299,0.587,0.114));',
    '  col = mix(col, vec3(lum), 0.10*V);',
    '  col *= mix(vec3(1.0), vec3(1.06,1.0,0.86), V);',
    // Farbgebung nach dem Vorbild der Aufnahmen: beleuchtete Flächen warm und
    // kräftig, die Tiefe dahinter schwarz, die Röhren bleiben weiß ausgebrannt.
    '  if(uYellow > 0.001){',
    '    float ly = dot(col, vec3(0.32,0.55,0.13));',
    '    col = max(col - 0.020, 0.0);',                 // Schwarzpunkt: Ecken laufen zu
    '    col = pow(col, vec3(1.16));',                  // Mitten runter, mehr Kontrast
    '    vec3 warm = vec3(ly*1.16, ly*0.88, ly*0.14);',
    '    float lit  = smoothstep(0.006, 0.12, ly);',    // alles, worauf Licht fällt
    // Gerechnet wird in 8 Bit, alles über 1 ist längst abgeschnitten. Die Röhren
    // erkennt man deshalb an ihrer Helligkeit, nicht an einem Wert über 1.
    '    float blow = smoothstep(0.72, 0.95, ly);',     // Lampen bleiben weiß
    '    col = mix(col, warm, uYellow * lit * (1.0 - blow));',
    '    col *= 1.0 + 0.15*uYellow*lit*(1.0 - blow);',
    '  }',
    // Nachtsicht: alles ins Grüne, dunkle Bereiche hochgezogen
    '  if(uNv > 0.001){',
    '    float e = 1.0 - exp(-lum*3.6);',
    '    float g = pow(e, 0.85) * 1.04 + 0.02;',
    '    g += (rand(uv*uRes*1.3 + fract(uTime)*37.1)-0.5)*0.16;',
    '    vec3 nv = vec3(g*0.20, g*1.06, g*0.34);',
    '    col = mix(col, nv, uNv);',
    '  }',
    '  col = mix(col, vec3(0.9,0.15,0.1)*lum*1.6, uRed);',
    '  col += 0.018*V;',
    '  col *= 1.0 - 0.07*V*(0.5-0.5*sin(uv.y*uRes.y*3.14159));',
    '  col *= 1.0 - 0.03*V*rand(vec2(floor(uv.y*uRes.y), floor(uTime*24.0)));',
    // Filmkorn: eine feine und eine gröbere Lage, in den Schatten kräftiger —
    // so liegt es im Bild statt nur darüber.
    '  float lf = clamp(dot(col, vec3(0.299,0.587,0.114)), 0.0, 1.0);',
    '  float g1 = rand(uv*uRes + fract(uTime)*91.7) - 0.5;',
    '  float g2 = rand(floor(uv*uRes*0.30) + fract(uTime*0.83)*57.3) - 0.5;',
    '  float korn = (g1*0.085 + g2*0.075) * (0.45 + 0.95*(1.0 - lf));',
    '  col += korn * (0.85 + 0.7*V + uGlitch*0.8);',
    '  float vig = dot(vUv-0.5, vUv-0.5);',
    '  col *= 1.0 - vig*(1.05+0.60*V);',
    '  vec4 hud = texture2D(tHud, vUv + vec2(ca,0.0));',
    '  col = mix(col, hud.rgb*(1.0-uNv*0.35), hud.a*0.95);',
    '  col = mix(col, vec3(rand(uv*uRes*0.7+uTime*57.3)), uStatic);',
    '  gl_FragColor = vec4(col*uFade, 1.0);',
    '}'
  ].join('\n')
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), postMat));

/* ==================== 9  Anzeige im Sucher ==================== */

const HUDS = { tapes:0, battery:100, stamina:1, signal:0, nv:false, time:0, exit:null };
function drawHud(){
  const W = HUD_W, H = HUD_H;
  hudX.clearRect(0,0,W,H);
  const F = Math.round(H*0.048), PAD = Math.round(H*0.062);
  hudX.textBaseline = 'top';
  hudX.shadowColor = 'rgba(0,0,0,0.8)'; hudX.shadowBlur = Math.max(3, F*0.28);
  hudX.font = 'bold ' + F + 'px "Courier New",monospace';

  /* --- oben links: Aufnahme --- */
  if(Math.sin(HUDS.time*3.2) > 0){
    hudX.fillStyle = 'rgba(206,52,42,0.96)';
    hudX.beginPath(); hudX.arc(PAD+F*0.42, PAD+F*0.5, F*0.30, 0, 7); hudX.fill();
    hudX.fillStyle = 'rgba(244,242,232,0.96)';
    hudX.fillText('REC', PAD+F*1.05, PAD);
  }
  hudX.fillStyle = 'rgba(238,234,214,0.86)';
  hudX.fillText(HUDS.nv ? 'NIGHTSHOT' : 'SP', PAD, PAD + F*1.3);

  /* --- oben rechts: Datum und Zeitcode (Platz für die Pausentaste) --- */
  const sec = HUDS.time + 42.7;
  const hh = String(11 + ((sec/3600)|0)).padStart(2,'0'),
        mm = String((13 + ((sec/60|0)%60))%60).padStart(2,'0'),
        ss = String(sec%60|0).padStart(2,'0'),
        ff = String(Math.floor((sec%1)*30)).padStart(2,'0');
  const rightPad = PAD + Math.round(W*0.085);
  hudX.fillStyle = 'rgba(248,246,236,0.94)';
  const d1 = '10/17/1989', d2 = hh+':'+mm+':'+ss+':'+ff;
  hudX.fillText(d1, W-rightPad-hudX.measureText(d1).width, PAD);
  hudX.fillText(d2, W-rightPad-hudX.measureText(d2).width, PAD + F*1.3);

  /* --- unten links: Bänder, Signal, Ausdauer, Akku --- */
  const bw = Math.round(W*0.17), bh = Math.round(F*0.60);
  const bx = PAD, by = H - PAD - bh;
  hudX.strokeStyle = 'rgba(232,226,200,0.8)'; hudX.lineWidth = 2;
  hudX.strokeRect(bx, by, bw, bh);
  hudX.fillStyle = 'rgba(232,226,200,0.8)';
  hudX.fillRect(bx+bw+2, by+bh*0.28, 4, bh*0.44);
  const lvl = clamp(HUDS.battery/100, 0, 1);
  hudX.fillStyle = lvl > 0.25 ? 'rgba(230,224,196,0.9)'
                 : (Math.sin(HUDS.time*7) > 0 ? 'rgba(220,74,56,0.95)' : 'rgba(90,30,24,0.6)');
  hudX.fillRect(bx+3, by+3, Math.max(0,(bw-6)*lvl), bh-6);
  hudX.font = 'bold ' + Math.round(F*0.68) + 'px "Courier New",monospace';
  hudX.fillStyle = 'rgba(226,220,192,0.8)';
  hudX.fillText(Math.round(HUDS.battery) + '%', bx + bw + 12, by + bh*0.10);

  const sy = by - F*0.62;                        // Ausdauer
  hudX.fillStyle = 'rgba(150,142,110,0.34)'; hudX.fillRect(bx, sy, bw, 4);
  // Wer rennen will, aber nicht mehr kann, sieht den Balken blinken
  const leer = HUDS.ausgepustet && Math.sin(HUDS.time*14) > 0;
  hudX.fillStyle = leer ? 'rgba(226,90,60,0.95)'
                 : (HUDS.stamina > 0.2 ? 'rgba(206,196,156,0.75)' : 'rgba(206,120,80,0.8)');
  hudX.fillRect(bx, sy, bw*Math.max(clamp(HUDS.stamina,0,1), leer ? 0.12 : 0), 4);

  if(HUDS.signal > 0.01){                        // Bandsignal
    const gy = sy - F*0.72;
    hudX.fillStyle = 'rgba(150,142,110,0.30)'; hudX.fillRect(bx, gy, bw, 5);
    hudX.fillStyle = 'rgba(228,208,132,0.9)';   hudX.fillRect(bx, gy, bw*clamp(HUDS.signal,0,1), 5);
    hudX.fillStyle = 'rgba(228,214,164,0.7)';
    hudX.fillText('SIGNAL', bx + bw + 12, gy - F*0.22);
  }
  hudX.font = 'bold ' + F + 'px "Courier New",monospace';
  hudX.fillStyle = 'rgba(242,236,206,0.92)';
  hudX.fillText('BÄNDER ' + HUDS.tapes + '/' + CFG.tapes, bx, by - F*2.6);

  /* --- oben Mitte: Richtung zum Ausgang, sobald das Foto gefunden ist --- */
  if(HUDS.exit !== null && HUDS.exit !== undefined){
    const cx = W/2, cy = PAD + F*0.95, R = F*0.8;
    hudX.save();
    hudX.translate(cx, cy);
    hudX.rotate(HUDS.exit);
    hudX.fillStyle = 'rgba(228,208,132,0.78)';
    hudX.beginPath();
    hudX.moveTo(0,-R); hudX.lineTo(R*0.52, R*0.5); hudX.lineTo(0, R*0.18); hudX.lineTo(-R*0.52, R*0.5);
    hudX.closePath(); hudX.fill();
    hudX.restore();
    hudX.font = 'bold ' + Math.round(F*0.62) + 'px "Courier New",monospace';
    hudX.fillStyle = 'rgba(228,208,132,0.6)';
    const lab = 'AUSGANG';
    hudX.fillText(lab, cx - hudX.measureText(lab).width/2, cy + F*0.95);
  }
  hudTex.needsUpdate = true;
}

/* ========================== 10  Ton ========================== */

const SND = { on:true, ctx:null };
function initAudio(){
  if(SND.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) { SND.on = false; return; }
  const ac = new AC();
  SND.ctx = ac;
  SND.master = ac.createGain(); SND.master.gain.value = 1; SND.master.connect(ac.destination);

  // Netzbrummen
  const g = ac.createGain(); g.gain.value = 0.05; g.connect(SND.master);
  [50,100,150].forEach((f,i)=>{
    const o=ac.createOscillator(); o.type='sawtooth'; o.frequency.value=f;
    const gg=ac.createGain(); gg.gain.value=0.35/(i+1);
    const lp=ac.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=300;
    o.connect(gg); gg.connect(lp); lp.connect(g); o.start();
  });
  SND.hum = g;

  // Bandrauschen
  const buf = ac.createBuffer(1, ac.sampleRate*2, ac.sampleRate), d = buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1)*0.5;
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const hg = ac.createGain(); hg.gain.value = 0.030;
  const hp = ac.createBiquadFilter(); hp.type='highpass'; hp.frequency.value = 2400;
  src.connect(hp); hp.connect(hg); hg.connect(SND.master); src.start();
  SND.hiss = hg;

  // Bedrohung
  const o2 = ac.createOscillator(); o2.type='sawtooth'; o2.frequency.value = 41;
  const dg = ac.createGain(); dg.gain.value = 0;
  const lp2 = ac.createBiquadFilter(); lp2.type='lowpass'; lp2.frequency.value = 190;
  o2.connect(lp2); lp2.connect(dg); dg.connect(SND.master); o2.start();
  SND.drone = dg;
  SND.noiseBuf = buf;
}
function burst(dur, cut, vol, type){
  const ac = SND.ctx;
  if(!ac || !SND.on) return;
  const n = Math.floor(ac.sampleRate*dur);
  const b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for(let i=0;i<n;i++) d[i] = (Math.random()*2-1)*Math.pow(1-i/n, 3);
  const s = ac.createBufferSource(); s.buffer = b;
  const f = ac.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = cut;
  const g = ac.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(SND.master); s.start();
}
function beep(freq, dur, vol, type){
  const ac = SND.ctx;
  if(!ac || !SND.on) return;
  const o = ac.createOscillator(); o.type = type || 'square'; o.frequency.value = freq;
  const g = ac.createGain(); g.gain.value = 0;
  g.gain.setTargetAtTime(vol, ac.currentTime, 0.005);
  g.gain.setTargetAtTime(0, ac.currentTime + dur*0.5, dur*0.25);
  o.connect(g); g.connect(SND.master); o.start(); o.stop(ac.currentTime + dur + 0.3);
}
const sndStep    = () => burst(0.11, 520, 0.20);
const sndRunStep = () => burst(0.13, 700, 0.30);
const sndClunk   = () => burst(0.5, 190, 0.26);
const sndPickup  = () => { beep(880, 0.06, 0.08); setTimeout(()=>beep(1320,0.09,0.07), 70); };
const sndDenied  = () => beep(180, 0.16, 0.09, 'sawtooth');
const sndTick    = () => beep(2100, 0.02, 0.035, 'square');
const sndDoor    = () => { burst(0.7, 260, 0.30); setTimeout(()=>burst(0.35,150,0.22), 320); };
function sndScream(){
  const ac = SND.ctx; if(!ac || !SND.on) return;
  const o = ac.createOscillator(); o.type='sawtooth';
  o.frequency.setValueAtTime(320, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(70, ac.currentTime+0.9);
  const g = ac.createGain(); g.gain.value = 0.0;
  g.gain.setTargetAtTime(0.22, ac.currentTime, 0.02);
  g.gain.setTargetAtTime(0.0, ac.currentTime+0.5, 0.25);
  const dist = ac.createBiquadFilter(); dist.type='bandpass'; dist.frequency.value=420; dist.Q.value=1.4;
  o.connect(dist); dist.connect(g); g.connect(SND.master); o.start(); o.stop(ac.currentTime+1.6);
  burst(0.8, 900, 0.18, 'bandpass');
}
/* ---------- Hintergrundmusik ---------- */
const MUSIC = {
  list: [], idx: 0, el: null, vol: 0, gap: 0, base: 0.40,
  gain: null, quelle: null, alle: [],
  on: localStorage.getItem('ft_music') !== '0'
};
fetch(A('assets/music/tracks.json'))
  .then(r => r.json())
  .then(j => {
    MUSIC.list = (j.tracks || []).filter(t => t && t.file);
    for(let i=MUSIC.list.length-1; i>0; i--){            // mischen
      const k = Math.random()*(i+1)|0;
      const tmp = MUSIC.list[i]; MUSIC.list[i] = MUSIC.list[k]; MUSIC.list[k] = tmp;
    }
  })
  .catch(() => {});

function musikAn(){
  if(MUSIC.el) return;             // läuft schon, kein zweites Stück obendrauf
  MUSIC.gap = 0;
  musicNext();
}

function musicNext(){
  if(!MUSIC.list.length || !MUSIC.on) return;
  // Erst aufräumen: sonst läuft ein vergessenes Stück unhörbar weiter mit
  if(MUSIC.el){ try { MUSIC.el.pause(); } catch(e){} }
  const t = MUSIC.list[MUSIC.idx % MUSIC.list.length];
  MUSIC.idx++;
  const a = new Audio(A('assets/music/' + t.file));
  a.preload = 'auto';
  const done = wartezeit => {
    if(MUSIC.el === a){ MUSIC.el = null; MUSIC.quelle = null; }
    MUSIC.gap = wartezeit;
  };
  a.addEventListener('ended', () => done(14 + Math.random()*22));   // Stille zwischen den Stücken
  a.addEventListener('error', () => done(20));

  /* Android regelt die Lautstärke am Gerät, nicht am Element: audio.volume
     bleibt dort wirkungslos. Der Ton läuft deshalb über die Tonleitung, dort
     lässt er sich zuverlässig ein- und ausblenden. */
  if(SND.ctx){
    if(!MUSIC.gain){
      MUSIC.gain = SND.ctx.createGain();
      MUSIC.gain.gain.value = 0;
      MUSIC.gain.connect(SND.master);
    }
    try {
      MUSIC.quelle = SND.ctx.createMediaElementSource(a);
      MUSIC.quelle.connect(MUSIC.gain);
    } catch(e){ MUSIC.quelle = null; }
  }

  const pr = a.play();
  if(pr && pr.catch) pr.catch(() => done(20));
  MUSIC.el = a;
  MUSIC.alle.push(a);
  if(MUSIC.alle.length > 8) MUSIC.alle.splice(0, MUSIC.alle.length - 8);
  MUSIC.vol = 0;
  setzeLautstaerke(0);
}

/* Lautstärke setzen — über die Tonleitung, wo vorhanden, sonst am Element. */
function setzeLautstaerke(v){
  if(MUSIC.gain && SND.ctx){
    MUSIC.gain.gain.setTargetAtTime(v, SND.ctx.currentTime, 0.05);
  }
  if(MUSIC.el){
    try { MUSIC.el.volume = clamp(v / Math.max(MUSIC.base, 0.001), 0, 1); } catch(e){}
  }
}

function musicUpdate(dt, danger, ausblenden){
  const aus = (!MUSIC.on || ausblenden || !SND.on);
  if(!MUSIC.el){
    if(aus || !MUSIC.list.length) return;
    MUSIC.gap -= dt;
    if(MUSIC.gap <= 0) musicNext();
    return;
  }
  const ziel = aus ? 0 : MUSIC.base * (1 + danger*0.30);
  MUSIC.vol += (ziel - MUSIC.vol) * Math.min(dt * (aus ? 3.2 : 0.55), 1);
  if(aus && MUSIC.vol < 0.02) MUSIC.vol = 0;
  setzeLautstaerke(MUSIC.vol);
  if(aus && MUSIC.vol <= 0){
    // Nicht nur leise drehen: im Spiel soll das Stück wirklich stehen.
    try { MUSIC.el.pause(); } catch(e){}
    MUSIC.el = null; MUSIC.quelle = null;
    MUSIC.gap = 1.2;
  }
}

/* Hart anhalten: kein Ausblenden abwarten, das Stück steht sofort. */
function musikStopp(){
  // Alles anhalten, was je gestartet wurde - nicht nur das zuletzt gestartete
  for(const a of MUSIC.alle){
    try { a.pause(); a.currentTime = 0; } catch(e){}
  }
  MUSIC.alle.length = 0;
  MUSIC.el = null;
  MUSIC.quelle = null;
  MUSIC.vol = 0;
  setzeLautstaerke(0);
  MUSIC.gap = 1.2;
}

function setMusic(on){
  MUSIC.on = on;
  localStorage.setItem('ft_music', on ? '1' : '0');
  if(on){
    if(!MUSIC.el) MUSIC.gap = 0.4;
  } else {
    musicUpdate(1.0, 0, true);      // sofort ausblenden und anhalten
  }
}

function setSound(on){
  SND.on = on;
  if(!SND.ctx) return;
  SND.master.gain.setTargetAtTime(on?1:0, SND.ctx.currentTime, 0.05);
}

/* ======================= 11  Steuerung ======================= */

const IN = { mx:0, mz:0, dyaw:0, dpitch:0, run:false, nv:false, use:false };
const KEY = {};

const elHud   = $('hud');
const elStick = $('stick'), elKnob = $('knob');
const zMove = $('zoneMove'), zLook = $('zoneLook');
const bRun = $('bRun'), bNv = $('bNv'), bUse = $('bUse'), bMenu = $('bMenu');

let moveId = null, moveOx = 0, moveOy = 0;
let lookId = null, lookLx = 0, lookLy = 0;
const STICK_R = 52;

zMove.addEventListener('pointerdown', e => {
  if(moveId !== null) return;
  moveId = e.pointerId; moveOx = e.clientX; moveOy = e.clientY;
  elStick.style.left = e.clientX + 'px';
  elStick.style.top  = e.clientY + 'px';
  elStick.classList.add('on');
  zMove.setPointerCapture(e.pointerId);
  e.preventDefault();
});
zMove.addEventListener('pointermove', e => {
  if(e.pointerId !== moveId) return;
  let dx = e.clientX - moveOx, dy = e.clientY - moveOy;
  const l = Math.hypot(dx,dy);
  if(l > STICK_R){ dx = dx/l*STICK_R; dy = dy/l*STICK_R; }
  elKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  IN.mx = dx/STICK_R;
  IN.mz = dy/STICK_R;
  if(l > STICK_R*1.55) IN.run = true;          // weit durchdrücken = rennen
  e.preventDefault();
});
function endMove(e){
  if(e.pointerId !== moveId) return;
  moveId = null; IN.mx = IN.mz = 0; IN.run = bRun.classList.contains('held');
  elKnob.style.transform = 'translate(0,0)';
  elStick.classList.remove('on');
}
zMove.addEventListener('pointerup', endMove);
zMove.addEventListener('pointercancel', endMove);

zLook.addEventListener('pointerdown', e => {
  if(lookId !== null) return;
  lookId = e.pointerId; lookLx = e.clientX; lookLy = e.clientY;
  zLook.setPointerCapture(e.pointerId);
  e.preventDefault();
});
zLook.addEventListener('pointermove', e => {
  if(e.pointerId !== lookId) return;
  IN.dyaw   -= (e.clientX - lookLx) * 0.0042;
  IN.dpitch -= (e.clientY - lookLy) * 0.0034;
  lookLx = e.clientX; lookLy = e.clientY;
  e.preventDefault();
});
function endLook(e){ if(e.pointerId === lookId) lookId = null; }
zLook.addEventListener('pointerup', endLook);
zLook.addEventListener('pointercancel', endLook);

function holdBtn(el, on, off){
  el.addEventListener('pointerdown', e => { el.classList.add('held'); on(); e.preventDefault(); });
  ['pointerup','pointercancel','pointerleave'].forEach(t =>
    el.addEventListener(t, () => { if(el.classList.contains('held')){ el.classList.remove('held'); off(); } }));
}
holdBtn(bRun, ()=>IN.run=true, ()=>IN.run=false);

/* Ein Knopf muss auch dann gehen, wenn schon ein Finger auf dem Stick liegt.
   Android schickt bei einer zweiten Berührung kein click mehr - deshalb hängt
   die Auslösung an pointerdown; click bleibt für Maus und Tastatur daneben. */
function tapBtn(el, fn){
  let zuletzt = 0;
  const ausloesen = e => {
    const jetzt = performance.now();
    if(jetzt - zuletzt < 350) return;      // nicht doppelt zählen
    zuletzt = jetzt;
    if(e.cancelable) e.preventDefault();
    e.stopPropagation();
    fn();
  };
  el.addEventListener('pointerdown', ausloesen);
  el.addEventListener('click', ausloesen);
}
tapBtn(bNv,   () => toggleNv());
tapBtn(bUse,  () => { IN.use = true; });
tapBtn(bMenu, () => pauseGame());

addEventListener('keydown', e => {
  KEY[e.code] = true;
  const k = e.key.toLowerCase();
  if(k === 'f') toggleNv();
  if(k === 'e') IN.use = true;
  if(k === 'm') setSound(!SND.on);
  if(e.code === 'Escape') { if(S.phase==='play') pauseGame(); }
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].indexOf(e.code) >= 0) e.preventDefault();
});
addEventListener('keyup', e => { KEY[e.code] = false; });

// Maussteuerung am Rechner
canvas.addEventListener('click', () => {
  if(S.phase === 'play' && !IS_TOUCH && document.pointerLockElement !== canvas)
    canvas.requestPointerLock && canvas.requestPointerLock();
});
addEventListener('mousemove', e => {
  if(document.pointerLockElement !== canvas) return;
  IN.dyaw   -= e.movementX * 0.0022;
  IN.dpitch -= e.movementY * 0.0020;
});

function toggleNv(){
  IN.nv = !IN.nv;
  bNv.classList.toggle('act', IN.nv);
  beep(IN.nv ? 1400 : 700, 0.05, 0.05);
}

/* ======================= 12  Spielablauf ======================= */

const S = {
  phase: 'menu',
  t: 0, endT: 0,
  yaw: 0, pitch: 0, yawT: 0, pitchT: 0, swing: 0, tilt: 0,
  pos: new THREE.Vector3(),
  bob: 0, lastStep: 0, speed: 0, gait: 0, eyeY: CFG.eye, pusteLos: false,
  stamina: CFG.staminaMax,
  battery: 100,
  tapes: 0,
  hasPhoto: false,
  exitOpen: false,
  danger: 0,
  glitch: 0.06,
  heart: 0,
  tick: 0,
  clunk: 6,
  nearDoor: false,
  deathDir: new THREE.Vector3()
};
S.pos.copy(cellCenter(startCell, CFG.eye));
if(!freeP(S.pos.x, S.pos.z)){
  outer:
  for(let r=1;r<6;r++) for(let a=0;a<12;a++){
    const x = S.pos.x + Math.cos(a/12*6.283)*r*0.5, z = S.pos.z + Math.sin(a/12*6.283)*r*0.5;
    if(freeP(x,z)){ S.pos.x=x; S.pos.z=z; break outer; }
  }
}
S.yaw = S.yawT = rnd()*6.28;

/* Setzt einen Schwierigkeitsgrad. Überzählige Fundstücke verschwinden,
   die Werte der Gestalt und des Camcorders wandern in CFG. */
function applyDifficulty(key){
  if(!DIFFS[key]) key = 'normal';
  diffKey = key;
  localStorage.setItem('ft_diff', key);
  const d = DIFFS[key];

  CFG.tapes = d.tapes;       CFG.batteries = d.batts;
  CFG.monHunt = d.hunt;      CFG.monSight = d.sight;
  CFG.monCone = d.cone;      CFG.monCatch = d.fang;
  CFG.staminaMax = d.stamina;CFG.staminaRegen = d.regen;
  CFG.drainNv = d.drainNv;
  CFG.dirMin = d.dirMin;     CFG.dirRnd = d.dirRnd;
  CFG.verlier = d.verlier;   CFG.steigerung = d.steigerung;
  S.stamina = d.stamina;

  let t = 0, b = 0;
  for(const it of items){
    if(it.kind === 'tape'){
      const an = t++ < d.tapes;
      it.taken = !an; it.obj.visible = an;
    } else if(it.kind === 'batt'){
      const an = b++ < d.batts;
      it.taken = !an; it.obj.visible = an;
    }
  }
  const ziel = $('tapeGoal');
  if(ziel) ziel.textContent = d.tapes;
}

const toastEl = $('toast');
let toastT = 0;
function toast(msg, secs){
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  toastT = secs || 2.6;
}

function onMonsterSpots(){
  sndScream();
  toast('ES HAT DICH GESEHEN', 2.2);
  if(SND.drone && SND.ctx) SND.drone.gain.setTargetAtTime(0.22, SND.ctx.currentTime, 0.4);
  if(navigator.vibrate) navigator.vibrate([60,40,120]);
}

/* ---------- Bildschirmgröße ---------- */
function resize(){
  const w = Math.max(320, window.innerWidth), h = Math.max(240, window.innerHeight);
  const scale = Math.min(1, (quality.renderH*1.6) / h);
  renderer.setSize(Math.round(w*scale), Math.round(h*scale), false);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  RT_H = quality.renderH;
  RT_W = Math.round(RT_H * (w/h));
  rt.setSize(RT_W, RT_H);
  postMat.uniforms.uRes.value.set(RT_W, RT_H);
  // Die Anzeige bekommt dasselbe Seitenverhältnis, sonst zieht sie die Schrift breit
  HUD_H = 360;
  HUD_W = clamp(Math.round(HUD_H * (w/h)), 200, 900);
  if(hudC.width !== HUD_W || hudC.height !== HUD_H){
    hudC.width = HUD_W; hudC.height = HUD_H;
    hudTex.needsUpdate = true;
  }
  drawHud();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 300));
resize();

/* ---------- Bewegung mit Wandgleiten ---------- */
function movePlayer(dt, fwd, strafe, speed){
  const sy = Math.sin(S.yaw), cy = Math.cos(S.yaw);
  // Blickrichtung: -z in Kameraraum
  let dx = (-sy*fwd) + (cy*strafe);
  let dz = (-cy*fwd) - (sy*strafe);
  const l = Math.hypot(dx,dz);
  if(l > 0.0001){ dx/=l; dz/=l; } else { dx=0; dz=0; }

  const x0 = S.pos.x, z0 = S.pos.z;
  const step = speed*dt;
  let px = x0 + dx*step, pz = z0 + dz*step;
  const out = resolveCircle(px, pz, CFG.radius);
  S.pos.x = clamp(out[0], 0.3, SPAN-0.3);
  S.pos.z = clamp(out[1], 0.3, SPAN-0.3);
  return Math.hypot(S.pos.x-x0, S.pos.z-z0);
}

/* ---------- Fundstücke ---------- */
function checkItems(dt){
  let bestSignal = 0;
  for(const it of items){
    if(it.taken) continue;
    const dx = it.pos.x - S.pos.x, dz = it.pos.z - S.pos.z;
    const d2 = dx*dx + dz*dz;
    if(it.kind === 'tape'){
      const d = Math.sqrt(d2);
      bestSignal = Math.max(bestSignal, clamp((24-d)/24, 0, 1));
    }
    it.spin += dt*0.9;
    it.obj.rotation.y = it.spin;
    it.obj.position.y = it.pos.y + Math.sin(it.spin*1.6)*0.012;
    if(d2 < 1.1){
      it.taken = true;
      it.obj.visible = false;
      sndPickup();
      if(navigator.vibrate) navigator.vibrate(35);
      if(it.kind === 'tape'){
        S.tapes++;
        monAlert(S.pos.x, S.pos.z, true);   // das hat sie gehört
        if(S.tapes >= CFG.tapes){
          S.exitOpen = true;
          EXIT.sign.material = MAT.signOn;
          toast('ALLE BÄNDER GEFUNDEN\nDER AUSGANG IST ENTRIEGELT', 4.5);
        } else {
          toast('BAND ' + S.tapes + '/' + CFG.tapes + ' GEFUNDEN', 2.2);
        }
      } else if(it.kind === 'batt'){
        S.battery = Math.min(100, S.battery + CFG.batteryGain);
        toast('AKKU +' + CFG.batteryGain + '%', 2.0);
      } else if(it.kind === 'photo'){
        S.hasPhoto = true;
        toast('FOTO GEFUNDEN\nDER AUSGANG STEHT AUF DER RÜCKSEITE', 4.2);
      }
    }
  }
  return bestSignal;
}

/* ---------- Tür ---------- */
function checkDoor(){
  const d = Math.hypot(EXIT.pos.x - S.pos.x, EXIT.pos.z - S.pos.z);
  S.nearDoor = d < 2.6;
  bUse.classList.toggle('on', S.nearDoor && S.phase === 'play');
  bUse.textContent = S.exitOpen ? 'TÜR ÖFFNEN' : 'VERSCHLOSSEN';
  if(IN.use){
    IN.use = false;
    if(S.nearDoor){
      if(S.exitOpen){ sndDoor(); win(); }
      else { sndDenied(); toast('VERSCHLOSSEN — ' + (CFG.tapes-S.tapes) + ' BÄNDER FEHLEN', 2.6); }
    }
  }
}

/* ---------- Zustandswechsel ---------- */
const scPause = $('scPause'), scEnd = $('scEnd');
let wakeLock = null;

async function goFullscreen(){
  try{
    if(IS_TOUCH && document.documentElement.requestFullscreen && !document.fullscreenElement)
      await document.documentElement.requestFullscreen({ navigationUI:'hide' });
    if(screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  }catch(e){}
  try{ if('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); }catch(e){}
}

function startGame(){
  initAudio();
  if(SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
  goFullscreen();
  for(const m of MENUS) if(m) m.classList.add('hidden');
  elHud.classList.remove('hidden');
  musikStopp();                      // im Spiel läuft keine Musik
  S.phase = 'play';
  clock.getDelta();
  toast('BAND LÄUFT', 2.0);
}
function pauseGame(){
  if(S.phase !== 'play') return;
  S.phase = 'pause';
  if(document.pointerLockElement) document.exitPointerLock();
  $('pauseStats').innerHTML =
    'BÄNDER ' + S.tapes + '/' + CFG.tapes + '<br>AKKU ' + Math.round(S.battery) + '%' +
    '<br>ZEIT ' + fmtTime(S.t) + '<br>SEED ' + CFG.seed;
  scPause.classList.remove('hidden');
}
function resumeGame(){
  scPause.classList.add('hidden');
  S.phase = 'play';
  clock.getDelta();
}
function fmtTime(sec){
  const m = String(Math.floor(sec/60)).padStart(2,'0'), s = String(Math.floor(sec%60)).padStart(2,'0');
  return m + ':' + s;
}
function endScreen(title, text){
  $('endTitle').textContent = title;
  $('endText').innerHTML = text;
  $('endStats').innerHTML =
    'BÄNDER ' + S.tapes + '/' + CFG.tapes + ' &nbsp;·&nbsp; ZEIT ' + fmtTime(S.t) +
    '<br>SEED ' + CFG.seed;
  scEnd.classList.remove('hidden');
  elHud.classList.add('hidden');
  bUse.classList.remove('on');
  if(document.pointerLockElement) document.exitPointerLock();
}
/* Der Schrei im Moment des Zugriffs: mehrere Lagen übereinander, laut. */
function jumpscareTon(){
  const ac = SND.ctx;
  if(!ac || !SND.on) return;
  burst(0.06, 9000, 0.55, 'highpass');                     // harter Anschlag
  burst(1.1, 700, 0.34);                                   // Rauschwand
  const kreisch = ac.createOscillator(); kreisch.type = 'sawtooth';
  kreisch.frequency.setValueAtTime(1750, ac.currentTime);
  kreisch.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.7);
  const g1 = ac.createGain(); g1.gain.value = 0;
  g1.gain.setTargetAtTime(0.30, ac.currentTime, 0.004);
  g1.gain.setTargetAtTime(0.0, ac.currentTime + 0.35, 0.18);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
  kreisch.connect(bp); bp.connect(g1); g1.connect(SND.master);
  kreisch.start(); kreisch.stop(ac.currentTime + 1.4);

  const tief = ac.createOscillator(); tief.type = 'square';
  tief.frequency.setValueAtTime(90, ac.currentTime);
  tief.frequency.exponentialRampToValueAtTime(28, ac.currentTime + 1.0);
  const g2 = ac.createGain(); g2.gain.value = 0;
  g2.gain.setTargetAtTime(0.34, ac.currentTime, 0.01);
  g2.gain.setTargetAtTime(0.0, ac.currentTime + 0.6, 0.3);
  tief.connect(g2); g2.connect(SND.master);
  tief.start(); tief.stop(ac.currentTime + 1.8);
}

function die(){
  if(S.phase !== 'play') return;
  S.phase = 'dead'; S.endT = 0;
  // Der Blick springt sofort auf sie - kein Nachziehen, kein Suchen
  const dx = MON.pos.x - S.pos.x, dz = MON.pos.z - S.pos.z;
  S.yaw = S.yawT = Math.atan2(-dx, -dz);
  S.pitch = S.pitchT = 0.12;
  musikStopp();
  jumpscareTon();
  if(navigator.vibrate) navigator.vibrate([0,90,40,180,60,320]);
  if(SND.ctx && SND.on){
    SND.hiss.gain.setTargetAtTime(0.34, SND.ctx.currentTime, 0.05);
    SND.hiss.gain.setTargetAtTime(0.0,  SND.ctx.currentTime+1.6, 0.4);
    SND.hum.gain.setTargetAtTime(0.0,   SND.ctx.currentTime+0.3, 0.3);
    SND.drone.gain.setTargetAtTime(0.5, SND.ctx.currentTime, 0.05);
    SND.drone.gain.setTargetAtTime(0.0, SND.ctx.currentTime+1.1, 0.3);
  }
}
function win(){
  if(S.phase !== 'play') return;
  S.phase = 'won'; S.endT = 0;
  if(SND.ctx && SND.on){
    SND.drone.gain.setTargetAtTime(0.0, SND.ctx.currentTime, 0.3);
    SND.hiss.gain.setTargetAtTime(0.22, SND.ctx.currentTime+0.6, 0.4);
  }
}

/* ---------- Hauptschleife ---------- */
const clock = new THREE.Clock();
let hudAcc = 0;

function step(dt){
  S.t += dt;

  /* Blick: der Finger bewegt das Ziel, die Kamera zieht weich nach und
     schwingt beim Schwenk leicht nach — ein Camcorder in der Hand steht nie
     ganz still und dreht sich nicht auf den Punkt. */
  S.yawT += IN.dyaw; IN.dyaw = 0;
  S.pitchT = clamp(S.pitchT + IN.dpitch, -1.15, 1.15); IN.dpitch = 0;
  const folge = 1 - Math.exp(-dt*11);
  const dYaw = (S.yawT - S.yaw) * folge;
  S.yaw   += dYaw;
  S.pitch += (S.pitchT - S.pitch) * folge;
  const schwenk = dYaw / Math.max(dt, 0.0001);              // rad/s
  S.swing += (clamp(schwenk*0.030, -0.20, 0.20) - S.swing) * Math.min(dt*5.0, 1);
  S.tilt  += (clamp(schwenk*0.012, -0.09, 0.09) - S.tilt)  * Math.min(dt*3.5, 1);

  // Gehen
  let fwd = 0, strafe = 0;
  if(KEY.KeyW || KEY.ArrowUp)    fwd += 1;
  if(KEY.KeyS || KEY.ArrowDown)  fwd -= 1;
  if(KEY.KeyD || KEY.ArrowRight) strafe += 1;
  if(KEY.KeyA || KEY.ArrowLeft)  strafe -= 1;
  fwd += -IN.mz; strafe += IN.mx;
  let mag = Math.hypot(fwd, strafe);
  if(mag > 1){ fwd/=mag; strafe/=mag; mag = 1; }

  /* RENNEN verlangte bisher, dass der Stick über 45 % ausgeschlagen ist. Wer
     den Daumen nur ein Stück bewegt, hielt den Knopf und ging trotzdem im
     Schritt — der Knopf wirkte kaputt. Jetzt genügt eine Bewegungsabsicht,
     und der Knopf schiebt den Ausschlag selbst auf Anschlag. */
  const willRennen = (IN.run || KEY.ShiftLeft || KEY.ShiftRight) && mag > 0.12;
  const wantRun = willRennen && S.stamina > 0.05;
  if(wantRun && mag < 1){ fwd /= mag; strafe /= mag; mag = 1; }
  S.pusteLos = willRennen && !wantRun;        // gedrückt, aber die Luft ist weg

  /* Tempo weich nachziehen. Vorher sprang es hart zwischen Gehen und
     Rennen, und mit ihm Wippen, Blickwinkel und Schrittakt — das hat sich
     angefühlt, als ruckle man vorwärts. */
  const wanted = (wantRun ? CFG.sprint : CFG.walk) * mag;
  S.speed += (wanted - S.speed) * Math.min(dt*7, 1);
  const moved = S.speed > 0.03 ? movePlayer(dt, fwd, strafe, S.speed) : 0;
  const real  = dt > 0 ? moved/dt : 0;            // was tatsächlich zurückgelegt wurde

  if(wantRun && moved > 0.001) S.stamina = Math.max(0, S.stamina - dt);
  else S.stamina = Math.min(CFG.staminaMax, S.stamina + dt*CFG.staminaRegen);

  // Schrittakt hängt am echten Tempo, nicht an einer Stufe — und wird gedämpft,
  // damit ein Streifen an der Wand das Wippen nicht abwürgt.
  S.gait += (real - S.gait) * Math.min(dt*5, 1);
  const g = clamp(S.gait / CFG.walk, 0, 2.1);
  S.bob += dt * 3.35 * Math.max(S.gait, 0.001);
  const bobY = Math.sin(S.bob) * (0.020 + 0.006*g) * Math.min(g, 1.3);
  let noise = 0;
  if(g > 0.15){
    noise = g > 1.35 ? 20 : 9;
    if(Math.sin(S.bob) < -0.9 && S.t - S.lastStep > 0.19){
      S.lastStep = S.t;
      g > 1.35 ? sndRunStep() : sndStep();
    }
  }

  // Augenhöhe zusätzlich dämpfen, das nimmt dem Wippen die Härte
  const eyeTarget = CFG.eye + bobY + Math.sin(S.t*0.5)*0.010;
  S.eyeY += (eyeTarget - S.eyeY) * Math.min(dt*16, 1);
  // ruhiges Wandern der Hand, damit das Bild nie einrastet
  const driftY = Math.sin(S.t*0.37)*0.009 + Math.sin(S.t*0.91)*0.0035;
  const driftP = Math.sin(S.t*0.53 + 1.7)*0.007;
  camera.position.set(S.pos.x, S.eyeY, S.pos.z);
  camera.rotation.set(S.pitch + driftP + S.tilt + Math.sin(S.bob*0.5)*0.005*Math.min(g,1),
                      S.yaw + driftY,
                      -S.swing + Math.cos(S.bob*0.5)*0.007*Math.min(g,1.4));
  camera.fov = 74 + Math.min(g,2)*1.1;
  camera.updateProjectionMatrix();

  // Akku und Nachtsicht
  if(IN.nv && S.battery <= 0){ IN.nv = false; bNv.classList.remove('act'); toast('AKKU LEER', 2.2); }
  S.battery = Math.max(0, S.battery - dt*(CFG.drainIdle + (IN.nv ? CFG.drainNv : 0)));
  const nvTarget = IN.nv ? 1 : 0;
  postMat.uniforms.uNv.value += (nvTarget - postMat.uniforms.uNv.value) * Math.min(dt*6, 1);
  nvLight.position.copy(camera.position);
  nvLight.intensity = postMat.uniforms.uNv.value * 3.1;

  // Fundstücke und Tür
  const signal = checkItems(dt);
  checkDoor();

  scareTick(dt);

  // Die Gestalt
  let distP = updateMonster(dt, S.pos, noise);
  if(!isFinite(distP)) distP = 999;
  if(distP < CFG.monCatch) die();

  const near = clamp((24 - distP)/24, 0, 1);
  const dangerTarget = near * (MON.state === 'hunt' ? 1 : (MON.state === 'search' ? 0.5 : 0.3));
  S.danger += (dangerTarget - S.danger) * Math.min(dt*2.2, 1);

  // Stimmung
  updateLights(dt, S.t, S.danger);
  postMat.uniforms.uRed.value = MON.state === 'hunt' ? S.danger*0.20 : 0;
  renderer.toneMappingExposure = CFG.exposure * (1 - S.danger*0.12);
  scene.fog.density = CFG.fog + S.danger*0.010 - postMat.uniforms.uNv.value*0.008;

  let gl = 0.04 + Math.max(0, Math.sin(S.t*0.37))*0.04 + S.danger*0.42;
  if(Math.random() < 0.006) gl += 0.45;
  S.glitch += (gl - S.glitch) * Math.min(dt*9, 1);

  // Ton
  if(SND.ctx && SND.on){
    SND.drone.gain.value = 0.02 + S.danger*0.34;
    SND.hiss.gain.value  = 0.030 + S.danger*0.02 + postMat.uniforms.uNv.value*0.02;
  }
  S.heart -= dt;
  if(S.danger > 0.32 && S.heart <= 0){
    S.heart = lerp(1.15, 0.42, clamp((S.danger-0.32)/0.68, 0, 1));
    burst(0.10, 90, 0.16 + S.danger*0.2);
    setTimeout(()=>burst(0.08, 80, 0.10 + S.danger*0.14), 150);
  }
  S.tick -= dt;
  if(signal > 0.06 && S.tick <= 0){ S.tick = lerp(1.7, 0.14, signal); sndTick(); }
  S.clunk -= dt;
  if(S.clunk <= 0){ S.clunk = 11 + Math.random()*16; sndClunk(); }

  // Staub um die Kamera halten
  const dp = dustGeo.attributes.position.array;
  for(let i=0;i<dustN;i++){
    const j=i*3;
    dp[j+1] += Math.sin(S.t*0.7 + i)*0.0016;
    if(dp[j+1] > WH) dp[j+1] = 0.1;
    const dx = dp[j] + dust.position.x - camera.position.x;
    const dz = dp[j+2] + dust.position.z - camera.position.z;
    if(dx >  15) dp[j] -= 30; else if(dx < -15) dp[j] += 30;
    if(dz >  15) dp[j+2] -= 30; else if(dz < -15) dp[j+2] += 30;
  }
  dust.position.set(camera.position.x, 0, camera.position.z);
  dustGeo.attributes.position.needsUpdate = true;

  postMat.uniforms.uFade.value = Math.min(S.t*0.8, 1);

  HUDS.tapes = S.tapes; HUDS.battery = S.battery; HUDS.time = S.t;
  HUDS.stamina = S.stamina/CFG.staminaMax; HUDS.signal = signal; HUDS.nv = IN.nv;
  HUDS.ausgepustet = S.pusteLos;
  bRun.classList.toggle('leer', S.stamina < 0.35);
  // Der Pfeil erscheint mit dem Foto — und spätestens, wenn alle Bänder da sind
  HUDS.exit = (S.hasPhoto || S.exitOpen)
    ? (Math.atan2(EXIT.pos.x - S.pos.x, -(EXIT.pos.z - S.pos.z)) + S.yaw) : null;

  if(toastT > 0){ toastT -= dt; if(toastT <= 0) toastEl.classList.remove('on'); }
}

function deathStep(dt){
  S.endT += dt;
  const t = S.endT;

  /* Sie steht im nächsten Bild vor der Linse: der Kopf wandert auf Augenhöhe,
     das Bild schlägt auf, dann reißt das Band. */
  const rein = Math.min(t/0.11, 1);
  const d = lerp(2.2, 0.92, rein);
  const gx = S.pos.x - Math.sin(S.yaw)*d, gz = S.pos.z - Math.cos(S.yaw)*d;
  MON.group.visible = true;
  MON.group.position.set(gx, lerp(0, -0.66, rein), gz);          // Kopf auf Augenhöhe
  MON.group.rotation.y = Math.atan2(S.pos.x - gx, S.pos.z - gz);  // schaut in die Kamera

  const schuett = Math.max(0, 1 - t/0.9);
  camera.position.set(
    S.pos.x + (Math.random()-0.5)*0.10*schuett,
    CFG.eye - Math.min(t*0.35, 0.30) + (Math.random()-0.5)*0.12*schuett,
    S.pos.z + (Math.random()-0.5)*0.10*schuett);
  camera.rotation.set(S.pitch + (Math.random()-0.5)*0.10*schuett,
                      S.yaw + (Math.random()-0.5)*0.10*schuett,
                      (Math.random()-0.5)*0.22*schuett);
  camera.fov = lerp(74, 101, rein) - Math.max(0, t-0.3)*9;
  camera.fov = clamp(camera.fov, 62, 101);
  camera.updateProjectionMatrix();

  updateLights(dt, S.t, 1);
  S.glitch = 1;
  postMat.uniforms.uRed.value = Math.max(0, 0.55 - t*0.5);
  postMat.uniforms.uStatic.value = t < 0.10 ? 1 : (t > 0.55 ? Math.min((t-0.55)*4, 1) : 0);
  if(t > 1.5) postMat.uniforms.uFade.value = Math.max(0, 1-(t-1.5)*1.6);
  if(t > 2.4 && scEnd.classList.contains('hidden')){
    endScreen('END OF TAPE', 'Das Band bricht an dieser Stelle ab.<br>Was danach kommt, hat niemand gesehen.');
  }
}

function winStep(dt){
  S.endT += dt;
  S.glitch = Math.min(1, S.endT*0.8);
  postMat.uniforms.uStatic.value = S.endT > 0.6 ? Math.min((S.endT-0.6)*2, 1) : 0;
  if(S.endT > 1.1) postMat.uniforms.uFade.value = Math.max(0, 1-(S.endT-1.1)*1.8);
  if(S.endT > 2.0 && scEnd.classList.contains('hidden')){
    endScreen('AUSGESTIEGEN',
      'Die Tür fällt hinter dir zu.<br>' + CFG.tapes + ' Bänder, ein Foto und ein Treppenhaus ins Nichts.' +
      (S.hasPhoto ? '' : '<br>Das Foto liegt noch da unten.'));
  }
}

function render(){
  postMat.uniforms.uTime.value = S.t;
  postMat.uniforms.uGlitch.value = S.glitch;
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}

function frame(){
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if(S.phase === 'play') step(dt);
  else if(S.phase === 'dead') deathStep(dt);
  else if(S.phase === 'won')  winStep(dt);
  else if(S.phase === 'menu' || S.phase === 'pause') return;   // Bild einfrieren, Akku sparen
  hudAcc += dt;
  if(hudAcc > 0.08){ hudAcc = 0; drawHud(); }
  render();
}

applyDifficulty(diffKey);        // gespeicherte Wahl gilt sofort

/* ---------- Menüfluss: Vorspann, Titel, Schwierigkeit, Briefing ---------- */
const scSplash = $('scSplash'), scTitle = $('scTitle'), scDiff = $('scDiff'), scBrief = $('scBrief');
const MENUS = [scSplash, scTitle, scDiff, scBrief, scPause, scEnd];
function zeige(el){
  for(const m of MENUS) if(m) m.classList.add('hidden');
  if(el) el.classList.remove('hidden');
}

// Der Vorspann läuft einmal je Sitzung; nach einem Neuladen wegen der
// Bildqualität soll man nicht wieder davorsitzen.
let vorspannLaeuft = sessionStorage.getItem('ft_intro') !== '1';
if(!vorspannLaeuft) zeige(scTitle);
else {
  sessionStorage.setItem('ft_intro', '1');
  setTimeout(() => { if(!scSplash.classList.contains('hidden')) zeige(scTitle); }, 3200);
  scSplash.addEventListener('click', () => zeige(scTitle));
}

document.querySelectorAll('.chip[data-q]').forEach(el => {
  el.addEventListener('click', () => {
    localStorage.setItem('ft_q', el.dataset.q);
    location.search = '?seed=' + CFG.seed;
  });
});
{
  const cur = localStorage.getItem('ft_q') || (IS_TOUCH ? 'mid' : 'high');
  document.querySelectorAll('.chip[data-q]').forEach(el => el.classList.toggle('sel', el.dataset.q === cur));
}

document.querySelectorAll('.diff[data-diff]').forEach(el => {
  el.classList.toggle('sel', el.dataset.diff === diffKey);
  el.addEventListener('click', () => {
    document.querySelectorAll('.diff[data-diff]').forEach(o => o.classList.remove('sel'));
    el.classList.add('sel');
    applyDifficulty(el.dataset.diff);
  });
});

$('bStart').addEventListener('click', () => {
  initAudio();                       // im Klick, sonst blockt der Browser den Ton
  if(SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
  musikAn();
  zeige(scDiff);
});
$('bBackTitle').addEventListener('click', () => zeige(scTitle));
$('bPlay').addEventListener('click', () => {
  applyDifficulty(diffKey);
  zeige(scBrief);
});
scBrief.addEventListener('click', startGame);
$('bResume').addEventListener('click', resumeGame);
{
  const bm = $('bMusic');
  const zeigen = () => { bm.textContent = 'MUSIK: ' + (MUSIC.on ? 'AN' : 'AUS'); bm.classList.toggle('sel', MUSIC.on); };
  zeigen();
  bm.addEventListener('click', () => { setMusic(!MUSIC.on); zeigen(); });
}
$('bQuit').addEventListener('click', () => location.reload());
$('bNewSeed').addEventListener('click', () => { location.search = '?seed=' + (Math.random()*1e9|0); });
$('bAgain').addEventListener('click', () => location.reload());
$('bAgainSeed').addEventListener('click', () => { location.search = '?seed=' + (Math.random()*1e9|0); });
document.addEventListener('visibilitychange', () => { if(document.hidden && S.phase === 'play') pauseGame(); });

/* ---------- Ladeanzeige ---------- */
{
  const fill = $('loadfill'), btn = $('bStart');
  let done = false;
  const ready = () => {
    if(done) return;
    done = true;
    fill.style.width = '100%';
    btn.disabled = false;
    btn.textContent = '● BAND EINLEGEN';
    // Shader einmal übersetzen, damit der erste Schritt nicht ruckelt
    camera.position.copy(S.pos);
    render();
  };
  const poll = setInterval(() => {
    const total = Math.max(1, loadMgr.itemsTotal || 1);
    const p = Math.min(99, Math.round((loadMgr.itemsLoaded/total)*100));
    fill.style.width = p + '%';
    if(loadMgr.itemsTotal > 0 && loadMgr.itemsLoaded >= loadMgr.itemsTotal){ clearInterval(poll); ready(); }
  }, 120);
  setTimeout(() => { clearInterval(poll); ready(); }, 9000);   // Notausstieg
}

/* Die Musik gehört ins Menü. Während des Spiels bleibt es beim Brummen,
   Rauschen und dem, was in den Gängen unterwegs ist. */
let warImSpiel = false;
setInterval(() => {
  const imSpiel = (S.phase === 'play');
  if(warImSpiel && !imSpiel) MUSIC.gap = Math.min(MUSIC.gap, 1.4);   // zurück ins Menü: zügig wieder Musik
  warImSpiel = imSpiel;
  musicUpdate(0.12, 0, imSpiel);
}, 120);

drawHud();
frame();
