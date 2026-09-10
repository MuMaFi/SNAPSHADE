import * as T from 'three';

/* ======================================================================
   FOUND TAPE · EBENE 1 — POOLROOMS
   Ein geflutetes Hallenbad. Der Notausstieg liegt zu hoch, um ihn zu
   erreichen; drei Schieber lassen Wasser herein, und mit jedem Schieber
   steigt der Pegel um 1.10 m. Das Wasser ist also nicht Kulisse, sondern
   der Weg — und gleichzeitig die Gefahr, denn was hier unten wohnt,
   erreicht dich nur, solange du schwimmst.

   Alles in dieser Datei ist selbst gebaut: Kacheln, Rost, Wellen, Kaustik.
   Es wird nichts nachgeladen außer three.js.
   ====================================================================== */

/* ======================= 1  Rahmen ======================= */

const QUAL = {
  low:  { spiegel:0,    brechung:0, kaustik:1, schatten:false, wellen:2, sicht:0.80 },
  mid:  { spiegel:0.40, brechung:0, kaustik:1, schatten:true,  wellen:3, sicht:0.92 },
  high: { spiegel:0.62, brechung:0.6, kaustik:1, schatten:true, wellen:4, sicht:1.0 },
};
const IS_TOUCH = matchMedia('(hover: none)').matches || 'ontouchstart' in window;
let qKey = localStorage.getItem('pr_q') || (IS_TOUCH ? 'low' : 'high');
if(!QUAL[qKey]) qKey = 'mid';
let Q = QUAL[qKey];

const GRADE = {
  ruhig:  { luft:34, jagd:1.85, wittert:0.55, name:'Ruhig' },
  normal: { luft:24, jagd:2.25, wittert:1.00, name:'Normal' },
  tief:   { luft:18, jagd:2.62, wittert:1.45, name:'Tief' },
};
let gKey = localStorage.getItem('pr_diff') || 'normal';
if(!GRADE[gKey]) gKey = 'normal';
let GR = GRADE[gKey];

const $ = id => document.getElementById(id);
const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const lerp  = (a,b,t) => a+(b-a)*t;
const smoothstep = (a,b,x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };

const canvas = $('c');
const renderer = new T.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance' });
renderer.setClearColor(0x172a2e, 1);
renderer.outputColorSpace = T.SRGBColorSpace;
/* Neutral statt ACES: ACES zieht helle Flächen ins Orange, und in einem
   Haus aus weißen Kacheln sieht man diesen Gelbstich sofort. */
renderer.toneMapping = T.NeutralToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.shadowMap.enabled = Q.schatten;
renderer.shadowMap.type = T.PCFSoftShadowMap;

const scene  = new T.Scene();
const camera = new T.PerspectiveCamera(72, 16/9, 0.05, 260);

const LUFT_NEBEL   = new T.Color(0x172a2e);
const WASSER_NEBEL = new T.Color(0x0b383e);
scene.fog = new T.FogExp2(LUFT_NEBEL.getHex(), 0.019);

/* ======================= 2  Der Bau ======================= */
/* Ein Hallenbad aus Rundformen: eine Rotunde mit einer Schale aus Stufen,
   ein Überlaufkanal, eine Säulenhalle, eine große Kuppelhalle mit einem
   Sims ringsum. Räume sind Rechtecke oder Kreise, Böden entstehen aus
   Ringen, Sektoren und Rampen — aus derselben Beschreibung kommen Anzeige
   und Kollision, es gibt keine zweite Wahrheit über die Form des Hauses. */

const G2 = Math.PI/180;
const norm = a => { a %= Math.PI*2; return a < 0 ? a + Math.PI*2 : a; };
function winkelIn(a, a0, a1){
  const d = norm(a - a0), l = norm(a1 - a0);
  return d <= l;
}

const RAEUME = [
  { id:'A', art:'kreis', cx:12, cz:11, r:10.4, boden:1.8,  decke:7.6 },
  { id:'K', art:'rect', x0:22.0, z0:9.4,  x1:28.2, z1:12.6, boden:1.8,  decke:5.4 },
  { id:'B', art:'rect', x0:28.2, z0:3.6,  x1:43.0, z1:18.4, boden:0.6,  decke:6.2 },
  { id:'R', art:'rect', x0:10.2, z0:21.2, x1:13.8, z1:24.0, boden:0.10, decke:5.6 },
  { id:'C', art:'rect', x0:4.0,  z0:24.0, x1:22.0, z1:36.0, boden:1.0,  decke:7.2 },
  { id:'T', art:'rect', x0:2.2,  z0:28.2, x1:4.0,  z1:29.8, boden:-3.2, decke:-1.6 },
  { id:'P', art:'rect', x0:0.4,  z0:26.6, x1:2.2,  z1:32.2, boden:-3.2, decke:2.2, luft:0.85 },
  { id:'D', art:'kreis', cx:34, cz:25, r:11.0, boden:-1.0, decke:10.5 },
  { id:'G', art:'rect', x0:22.0, z0:25.0, x1:24.6, z1:28.6, boden:-1.0, decke:6.6,
    rampe:{ achse:'x', ya:1.0, yb:-1.0 } },
];
const RAUM = {}; for(const r of RAEUME) RAUM[r.id] = r;

/* Bodenflicken übersteuern den Raumboden; später gewinnt. */
const FLICKEN = [
  /* Die Schale der Ankunftsrotunde: sechs Bänder vom Deck bis auf den Grund */
  { art:'kreis', cx:12, cz:11, r:2.6, y:-2.4 },
  { art:'ring',  cx:12, cz:11, ri:2.6, ra:3.6, yi:-2.4, ya:-1.0 },
  { art:'ring',  cx:12, cz:11, ri:3.6, ra:4.8, yi:-1.0, ya:-1.0 },
  { art:'ring',  cx:12, cz:11, ri:4.8, ra:5.6, yi:-1.0, ya:0.35 },
  { art:'ring',  cx:12, cz:11, ri:5.6, ra:6.6, yi:0.35, ya:0.35 },
  { art:'ring',  cx:12, cz:11, ri:6.6, ra:7.2, yi:0.35, ya:1.8 },
  /* Überlaufkanal: ein Keil aus der Schale nach Süden durch die Wand */
  { art:'sektor', cx:12, cz:11, ri:4.4, ra:6.6,  a0:80*G2, a1:100*G2, yi:-1.0, ya:0.10 },
  { art:'sektor', cx:12, cz:11, ri:6.6, ra:10.7, a0:80*G2, a1:100*G2, yi:0.10, ya:0.10 },
  /* Schwimmerbecken in der Umkleidehalle */
  { art:'rect', x0:33.2, z0:7.5, x1:40.0, z1:15.0, y:-0.9 },
  { art:'rampe', x0:31.5, z0:7.5, x1:33.2, z1:15.0, achse:'x', ya:0.6, yb:-0.9 },
  /* Tauchbecken und Podest in der Säulenhalle */
  { art:'rect', x0:4.0, z0:27.0, x1:8.4, z1:31.0, y:-3.2 },
  { art:'ring',  cx:17.5, cz:31.0, ri:2.8, ra:3.7, yi:2.6, ya:1.0 },
  { art:'kreis', cx:17.5, cz:31.0, r:2.8, y:2.6 },
  /* Große Halle: Insel in der Mitte, drei Trittinseln, Sims am Rand */
  { art:'sektor', cx:34, cz:25, ri:9.3, ra:11.0, a0:210*G2, a1:150*G2, yi:4.3, ya:4.3 },
  { art:'ring',  cx:34, cz:25, ri:2.8, ra:4.2, yi:4.5, ya:-1.0 },
  { art:'kreis', cx:34, cz:25, r:2.8, y:4.5 },
  { art:'kreis', cx:27.62, cz:26.71, r:1.5, y:3.9 },
  { art:'kreis', cx:29.33, cz:20.33, r:1.5, y:3.9 },
  { art:'kreis', cx:37.30, cz:19.28, r:1.5, y:3.9 },
];

/* Öffnungen: bei Rechtecken eine Kante mit Spanne, bei Kreisen ein
   Winkelabschnitt. 'sturz' ist die Unterkante des Mauerwerks darüber. */
const OEFFNUNGEN = [
  { raum:'A', art:'bogen', a0:-9.5*G2, a1:9.5*G2, sturz:5.4 },      // A -> Gang
  { raum:'A', art:'bogen', a0:79*G2,  a1:101*G2,  sturz:5.6 },      // A -> Überlaufkanal
  { raum:'K', kante:'o', s0:9.4,  s1:12.6, sturz:5.4 },             // Gang -> Umkleide
  { raum:'R', kante:'n', s0:10.2, s1:13.8, sturz:5.6 },             // Kanal -> Rotunde
  { raum:'R', kante:'s', s0:10.4, s1:13.6, sturz:5.6, bruestung:1.9 },  // Kanal -> Säulenhalle
  { raum:'C', kante:'o', s0:25.0, s1:28.6, sturz:5.6 },             // C -> Treppe zur großen Halle
  { raum:'C', kante:'w', s0:28.2, s1:29.8, sturz:-1.6 },            // C -> Fluttunnel
  { raum:'T', kante:'w', s0:28.2, s1:29.8, sturz:-1.6 },            // Tunnel -> Pumpenkeller
  { raum:'D', art:'bogen', a0:159*G2, a1:182*G2, sturz:5.8 },       // D -> Treppe
];

/* ---------- Wo ist welcher Boden? ---------- */
const AUSSEN = 999;
const inRect = (o,x,z) => x>=o.x0 && x<=o.x1 && z>=o.z0 && z<=o.z1;
function inRaum(r,x,z){
  return r.art === 'kreis' ? Math.hypot(x-r.cx, z-r.cz) <= r.r : inRect(r,x,z);
}
function raumBoden(r,x,z){
  if(r.rampe){
    const t = r.rampe.achse === 'x' ? (x-r.x0)/(r.x1-r.x0) : (z-r.z0)/(r.z1-r.z0);
    return lerp(r.rampe.ya, r.rampe.yb, clamp(t,0,1));
  }
  return r.boden;
}
function flickenHoehe(f,x,z){
  if(f.art === 'rect')  return inRect(f,x,z) ? f.y : null;
  if(f.art === 'rampe'){
    if(!inRect(f,x,z)) return null;
    const t = f.achse === 'x' ? (x-f.x0)/(f.x1-f.x0) : (z-f.z0)/(f.z1-f.z0);
    return lerp(f.ya, f.yb, clamp(t,0,1));
  }
  const d = Math.hypot(x-f.cx, z-f.cz);
  if(f.art === 'kreis') return d <= f.r ? f.y : null;
  if(d < f.ri || d > f.ra) return null;
  if(f.art === 'sektor' && !winkelIn(Math.atan2(z-f.cz, x-f.cx), f.a0, f.a1)) return null;
  return lerp(f.yi, f.ya, (d-f.ri)/(f.ra-f.ri));
}
function bodenBei(x, z){
  let h = AUSSEN;
  for(const r of RAEUME) if(inRaum(r,x,z)) h = raumBoden(r,x,z);
  for(const f of FLICKEN){ const y = flickenHoehe(f,x,z); if(y !== null) h = y; }
  return h;
}
function raumBei(x, z){
  let g = null;
  for(const r of RAEUME) if(inRaum(r,x,z)) g = r;
  return g;
}
function deckeBei(x, z){ const r = raumBei(x,z); return r ? r.decke : 0; }
/* Nur die rechteckigen Teile — daraus entstehen die geraden Absätze. */
function bodenRect(x, z){
  let h = AUSSEN;
  for(const r of RAEUME) if(r.art === 'rect' && inRect(r,x,z)) h = raumBoden(r,x,z);
  for(const f of FLICKEN){
    if(f.art !== 'rect' && f.art !== 'rampe') continue;
    const y = flickenHoehe(f,x,z); if(y !== null) h = y;
  }
  return h;
}
/* Der Pumpenkeller hält seine Luft: alle seine Öffnungen liegen unter
   dieser Höhe, das eingeschlossene Polster trägt das Wasser nicht weiter. */
function pegelBei(x, z){
  const r = raumBei(x,z);
  if(r && r.luft !== undefined) return Math.min(WASSER.h, r.luft);
  return WASSER.h;
}

const KARTE = { x0:0, z0:0, x1:45.6, z1:36.6 };
const KB = KARTE.x1 - KARTE.x0, KT = KARTE.z1 - KARTE.z0;

/* ---------- Wände ---------- */
/* Jede Wand ist ein gedrehter Kasten. Runde Wände werden in Sehnen zerlegt;
   damit prüft die Kollision überall dasselbe. */
const WAENDE = [];
const DICKE = 0.30;
function wandStueck(x0,z0, x1,z1, y0,y1, ry0,ry1){
  const dx = x1-x0, dz = z1-z0, l = Math.hypot(dx,dz);
  if(l < 0.02 || ry1-ry0 < 0.05) return;
  WAENDE.push({
    cx:(x0+x1)/2, cz:(z0+z1)/2, hw:l/2, hd:DICKE/2,
    co:dx/l, si:dz/l, y0, y1, ry0, ry1,
  });
}
function spanAbzug(a0, a1, loecher){
  let teile = [[a0,a1]];
  for(const [h0,h1] of loecher){
    const neu = [];
    for(const [t0,t1] of teile){
      if(h1<=t0 || h0>=t1){ neu.push([t0,t1]); continue; }
      if(t0 < h0) neu.push([t0,h0]);
      if(h1 < t1) neu.push([h1,t1]);
    }
    teile = neu;
  }
  return teile.filter(t => t[1]-t[0] > 0.03);
}
function beidseits(achse, wert, a0, a1){
  const d = 0.30;
  let bo = AUSSEN, de = -AUSSEN;
  for(let i=0;i<=9;i++){
    const m = lerp(a0+0.02, a1-0.02, i/9);
    const pk = achse==='x' ? [[wert-d,m],[wert+d,m]] : [[m,wert-d],[m,wert+d]];
    for(const [x,z] of pk){
      const r = raumBei(x,z);
      if(!r) continue;
      bo = Math.min(bo, bodenBei(x,z)); de = Math.max(de, r.decke);
    }
  }
  if(bo === AUSSEN){ bo = 0; de = 6; }
  return [bo-0.8, de];
}
const KANTEN = { n:'z0', s:'z1', w:'x0', o:'x1' };
const LINIEN = OEFFNUNGEN.filter(o => o.kante).map(o => {
  const r = RAUM[o.raum];
  return { achse:(o.kante==='w'||o.kante==='o')?'x':'z', wert:r[KANTEN[o.kante]],
           s0:o.s0, s1:o.s1, sturz:o.sturz, bruestung:o.bruestung };
});
const gesehen = new Set();
function kantenWand(achse, wert, t0, t1, y0, y1, ry0, ry1){
  const k = [achse, wert.toFixed(2), t0.toFixed(2), t1.toFixed(2), y0.toFixed(2), y1.toFixed(2)].join('|');
  if(gesehen.has(k)) return;
  gesehen.add(k);
  if(achse === 'x') wandStueck(wert, t0, wert, t1, y0, y1, ry0, ry1);
  else              wandStueck(t0, wert, t1, wert, y0, y1, ry0, ry1);
}
for(const r of RAEUME){
  if(r.art === 'kreis'){
    const auf = OEFFNUNGEN.filter(o => o.raum === r.id && o.art === 'bogen');
    const n = Math.ceil(2*Math.PI*r.r / 1.05);
    for(let i=0;i<n;i++){
      const a0 = i/n*Math.PI*2, a1 = (i+1)/n*Math.PI*2, am = (a0+a1)/2;
      const p0x = r.cx + r.r*Math.cos(a0), p0z = r.cz + r.r*Math.sin(a0);
      const p1x = r.cx + r.r*Math.cos(a1), p1z = r.cz + r.r*Math.sin(a1);
      const mx = r.cx + (r.r-0.4)*Math.cos(am), mz = r.cz + (r.r-0.4)*Math.sin(am);
      const bo = bodenBei(mx,mz), de = r.decke;
      const ry0 = (bo === AUSSEN ? r.boden : Math.min(bo, r.boden)) - 0.8;
      const loch = auf.find(o => winkelIn(am, o.a0, o.a1));
      if(!loch) wandStueck(p0x,p0z,p1x,p1z, -20, 20, ry0, de);
      else {
        if(loch.sturz < de-0.02) wandStueck(p0x,p0z,p1x,p1z, loch.sturz, 20, loch.sturz, de);
        if(loch.bruestung !== undefined)
          wandStueck(p0x,p0z,p1x,p1z, -20, loch.bruestung, ry0, loch.bruestung);
      }
    }
    continue;
  }
  const kanten = [
    { achse:'x', wert:r.x0, a0:r.z0, a1:r.z1 },
    { achse:'x', wert:r.x1, a0:r.z0, a1:r.z1 },
    { achse:'z', wert:r.z0, a0:r.x0, a1:r.x1 },
    { achse:'z', wert:r.z1, a0:r.x0, a1:r.x1 },
  ];
  for(const e of kanten){
    const auf = LINIEN.filter(l => l.achse===e.achse && Math.abs(l.wert-e.wert)<0.02
                                   && l.s1>e.a0+0.01 && l.s0<e.a1-0.01);
    for(const [t0,t1] of spanAbzug(e.a0, e.a1, auf.map(l=>[l.s0,l.s1]))){
      /* Liegt hinter dem Stück ein anderer Raum auf gleicher Höhe, ist da
         keine Wand nötig — dann überlappen sich zwei Räume absichtlich. */
      const [ry0, ry1] = beidseits(e.achse, e.wert, t0, t1);
      kantenWand(e.achse, e.wert, t0, t1, -20, 20, ry0, ry1);
    }
    for(const l of auf){
      const s0 = Math.max(l.s0, e.a0), s1 = Math.min(l.s1, e.a1);
      if(s1-s0 < 0.03) continue;
      const [ry0, ry1] = beidseits(e.achse, e.wert, s0, s1);
      if(l.sturz < ry1-0.02) kantenWand(e.achse, e.wert, s0, s1, l.sturz, 20, l.sturz, ry1);
      if(l.bruestung !== undefined)
        kantenWand(e.achse, e.wert, s0, s1, -20, l.bruestung, ry0, l.bruestung);
    }
  }
}
/* Räume, die absichtlich ineinanderragen (Gang in die Rotunde, Treppe in
   die große Halle), dürfen dort keine Wand haben. */
{
  const durchlass = [
    { x0:21.4, z0:9.2,  x1:22.6, z1:12.8 },
    { x0:21.4, z0:24.8, x1:24.8, z1:28.8 },
    { x0:10.0, z0:20.6, x1:14.0, z1:21.8 },
  ];
  for(let i=WAENDE.length-1;i>=0;i--){
    const w = WAENDE[i];
    if(w.y1 < 19) continue;                       // Stürze bleiben stehen
    for(const d of durchlass)
      if(w.cx>d.x0 && w.cx<d.x1 && w.cz>d.z0 && w.cz<d.z1){ WAENDE.splice(i,1); break; }
  }
}

/* ======================= 3  Oberflächen ======================= */
/* Poolrooms sind hell. Fast weiße Platten, türkise Mosaikkacheln, ein
   Licht, das von überall und nirgends kommt. Dunkel ist hier nichts. */
function cv(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
function rauschen(ctx,w,h,amt){
  const d = ctx.getImageData(0,0,w,h), p = d.data;
  for(let i=0;i<p.length;i+=4){
    const n = (Math.random()-0.5)*amt;
    p[i]=clamp(p[i]+n,0,255); p[i+1]=clamp(p[i+1]+n,0,255); p[i+2]=clamp(p[i+2]+n,0,255);
  }
  ctx.putImageData(d,0,0);
}
function flecken(g,w,h,n,farbe,r0,r1){
  for(let i=0;i<n;i++){
    const x=Math.random()*w, y=Math.random()*h, r=r0+Math.random()*(r1-r0);
    const grad=g.createRadialGradient(x,y,0,x,y,r);
    grad.addColorStop(0,farbe); grad.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=grad; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
  }
}
/* Weiße Kachel mit heller Fuge und leicht gerundeten Ecken — genau die
   Wand, die man aus jedem Hallenbad kennt. Jede Kachel bekommt einen
   Hauch eigenen Ton und einen weichen Verlauf, sonst wirkt die Fläche
   wie bedrucktes Papier. */
function kachelTex(px, n, basis, streu, fuge, fugeBreite, schmutz){
  const c = cv(px,px), g = c.getContext('2d');
  const s = px/n, rad = s*0.09, luecke = fugeBreite;
  g.fillStyle = fuge; g.fillRect(0,0,px,px);
  const rundRect = (x,y,w,h,r) => {
    g.beginPath();
    g.moveTo(x+r, y);
    g.lineTo(x+w-r, y); g.quadraticCurveTo(x+w, y, x+w, y+r);
    g.lineTo(x+w, y+h-r); g.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    g.lineTo(x+r, y+h);   g.quadraticCurveTo(x, y+h, x, y+h-r);
    g.lineTo(x, y+r);     g.quadraticCurveTo(x, y, x+r, y);
    g.closePath();
  };
  for(let y=0;y<n;y++) for(let x=0;x<n;x++){
    const v = (Math.random()-0.5)*streu;
    const [r0,g0,b0] = basis;
    const px0 = x*s+luecke, py0 = y*s+luecke, w = s-luecke*2;
    const hell = `rgb(${clamp(r0+v+3,0,255)|0},${clamp(g0+v+3,0,255)|0},${clamp(b0+v+3,0,255)|0})`;
    const dunkel = `rgb(${clamp(r0+v-4,0,255)|0},${clamp(g0+v-4,0,255)|0},${clamp(b0+v-4,0,255)|0})`;
    const vl = g.createLinearGradient(px0, py0, px0+w*0.35, py0+w);
    vl.addColorStop(0, hell); vl.addColorStop(0.75, dunkel);
    g.fillStyle = vl;
    rundRect(px0, py0, w, w, rad); g.fill();
    /* schmaler Glanz an der oberen Kante, wie glasierter Ton */
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(1, s*0.02);
    g.beginPath(); g.moveTo(px0+rad, py0+1); g.lineTo(px0+w-rad, py0+1); g.stroke();
  }
  rauschen(g,px,px,3);
  return c;
}
function betonTex(px, hell){
  const c = cv(px,px), g = c.getContext('2d');
  g.fillStyle = hell; g.fillRect(0,0,px,px);
  rauschen(g,px,px,6);
  return c;
}
function rostTex(px){
  const c = cv(px,px), g = c.getContext('2d');
  g.fillStyle='#a9ada7'; g.fillRect(0,0,px,px);
  rauschen(g,px,px,10);
  return c;
}
function textur(c, wx, wy){
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(wx, wy);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
const texDeck   = kachelTex(1024, 6,  [210,212,208], 3, '#adb1ac', 4);
const texWand   = kachelTex(1024, 8,  [219,222,218], 3, '#b6bab6', 4);
const texBecken = kachelTex(512,  10, [ 82,172,167], 7, '#6a9c99', 2);
const texBeton  = betonTex(512, '#84877f');
const texHell   = betonTex(512, '#aab0a7');
const texRost   = rostTex(256);

const UNI = {
  uZeit:     { value: 0 },
  uWasser:   { value: 1.6 },
  uKaustik:  { value: Q.kaustik },
  uTiefFarbe:{ value: new T.Color(0x6ec9c6) },
};
const KAUSTIK_GLSL = `
float prKaustik(vec2 p, float t){
  vec2 q = p * 0.85;
  float a = sin(q.x*2.10 + t*0.70) + sin(q.y*2.40 - t*0.55);
  float b = sin((q.x+q.y)*1.70 + t*0.90) + sin((q.x-q.y)*1.95 - t*0.62);
  float k = pow(clamp(a*b*0.25 + 0.5, 0.0, 1.0), 7.0);
  float a2 = sin(q.x*4.3 - t*1.1) + sin(q.y*4.7 + t*0.9);
  k += 0.45 * pow(clamp(a2*0.25+0.5, 0.0, 1.0), 9.0);
  return k;
}`;
function nass(mat){
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, UNI);
    sh.vertexShader = 'varying vec3 vPrW;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n vPrW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader =
      'varying vec3 vPrW;\nuniform float uZeit;\nuniform float uWasser;\nuniform float uKaustik;\nuniform vec3 uTiefFarbe;\n'
      + KAUSTIK_GLSL + '\n' + sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float prT = uWasser - vPrW.y;
       if(prT > 0.0){
         diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uTiefFarbe,
                                clamp(prT*0.20, 0.0, 0.80));
         if(uKaustik > 0.5){
           float k = prKaustik(vPrW.xz + vec2(vPrW.y*0.12), uZeit);
           diffuseColor.rgb += vec3(0.34,0.48,0.45) * k * exp(-prT*0.20) * 0.16;
         }
       }`);
  };
  mat.customProgramCacheKey = () => 'prNass';
  return mat;
}
function flaeche(map, rau, metall, farbe){
  return nass(new T.MeshStandardMaterial({ map, roughness:rau, metalness:metall, color:farbe||0xffffff }));
}
const MAT = {
  deck:   flaeche(textur(texDeck,   1, 1), 0.70, 0.02),
  wand:   flaeche(textur(texWand,   1, 1), 0.74, 0.02),
  becken: flaeche(textur(texBecken, 1, 1), 0.28, 0.06),
  beton:  flaeche(textur(texBeton,  1, 1), 0.88, 0.0),
  decke:  flaeche(textur(texHell,   1, 1), 0.92, 0.0),
  rost:   flaeche(textur(texRost,   1, 1), 0.66, 0.45),
  dunkel: nass(new T.MeshStandardMaterial({ color:0xa8b4ae, roughness:0.85 })),
};

/* ---------- Sammeln und verschmelzen ---------- */
const welt = new T.Group(); scene.add(welt);
const sammlung = { deck:[], wand:[], becken:[], beton:[], decke:[], rost:[], dunkel:[] };
const roh = {}; for(const k in sammlung) roh[k] = { p:[], n:[], u:[] };
const nimm = (topf, geo) => sammlung[topf].push(geo);

const _a = new T.Vector3(), _b = new T.Vector3(), _n = new T.Vector3();
function dreieck(topf, ax,ay,az, bx,by,bz, cx,cy,cz, kachel){
  _a.set(bx-ax, by-ay, bz-az); _b.set(cx-ax, cy-ay, cz-az);
  _n.crossVectors(_a,_b);
  if(_n.lengthSq() < 1e-12) return;
  _n.normalize();
  const r = roh[topf];
  const ny = Math.abs(_n.y), nx = Math.abs(_n.x), nz = Math.abs(_n.z);
  const p = [[ax,ay,az],[bx,by,bz],[cx,cy,cz]];
  for(const [x,y,z] of p){
    r.p.push(x,y,z); r.n.push(_n.x,_n.y,_n.z);
    if(ny > 0.5)      r.u.push(x/kachel, z/kachel);
    else if(nx > nz)  r.u.push(z/kachel, y/kachel);
    else              r.u.push(x/kachel, y/kachel);
  }
}
function viereck(topf, p0,p1,p2,p3, kachel){
  dreieck(topf, p0[0],p0[1],p0[2], p1[0],p1[1],p1[2], p2[0],p2[1],p2[2], kachel);
  dreieck(topf, p0[0],p0[1],p0[2], p2[0],p2[1],p2[2], p3[0],p3[1],p3[2], kachel);
}
function verschmelze(geos){
  let n = 0;
  for(const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n*3), nor = new Float32Array(n*3), uv = new Float32Array(n*2);
  let o = 0, o2 = 0;
  for(const g of geos){
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    uv.set(g.attributes.uv.array, o2);
    o += g.attributes.position.array.length; o2 += g.attributes.uv.array.length;
    g.dispose();
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos,3));
  geo.setAttribute('normal',   new T.BufferAttribute(nor,3));
  geo.setAttribute('uv',       new T.BufferAttribute(uv,2));
  geo.computeBoundingSphere();
  return geo;
}
function entIndex(g){ return g.index ? g.toNonIndexed() : g; }
function platte(x0,z0,x1,z1,y, kachel, unten){
  const g = new T.PlaneGeometry(x1-x0, z1-z0, 1, 1);
  g.rotateX(unten ? Math.PI/2 : -Math.PI/2);
  g.translate((x0+x1)/2, y, (z0+z1)/2);
  const uv = g.attributes.uv;
  const su = (x1-x0)/kachel, sv = (z1-z0)/kachel;
  for(let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*su + x0/kachel, uv.getY(i)*sv + z0/kachel);
  return entIndex(g);
}
function kasten(x0,y0,z0,x1,y1,z1, kachel){
  const g = new T.BoxGeometry(x1-x0, y1-y0, z1-z0);
  g.translate((x0+x1)/2, (y0+y1)/2, (z0+z1)/2);
  const ng = entIndex(g);
  const p = ng.attributes.position, nn = ng.attributes.normal, uv = ng.attributes.uv;
  for(let i=0;i<p.count;i++){
    const nx = Math.abs(nn.getX(i)), ny = Math.abs(nn.getY(i));
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    if(ny > 0.5)      uv.setXY(i, x/kachel, z/kachel);
    else if(nx > 0.5) uv.setXY(i, z/kachel, y/kachel);
    else              uv.setXY(i, x/kachel, y/kachel);
  }
  return ng;
}

/* ======================= 4  Das Haus bauen ======================= */

const _q1 = new T.Vector3(), _q2 = new T.Vector3(), _qn = new T.Vector3();
/* Vierecke immer so herum, dass die Normale in die gewünschte Richtung zeigt. */
function quad(topf, p0,p1,p2,p3, kachel, rx,ry,rz){
  _q1.set(p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]);
  _q2.set(p2[0]-p0[0], p2[1]-p0[1], p2[2]-p0[2]);
  _qn.crossVectors(_q1,_q2);
  if(_qn.x*rx + _qn.y*ry + _qn.z*rz < 0) viereck(topf, p0,p3,p2,p1, kachel);
  else                                   viereck(topf, p0,p1,p2,p3, kachel);
}
const topfFuerHoehe = h => h < 1.25 ? 'becken' : 'deck';

/* ---------- Runde Räume: Boden als Polarnetz, exakt an den Bändern ---------- */
function polarBoden(r, sekN){
  const konz = FLICKEN.filter(f => f.cx !== undefined
      && Math.abs(f.cx-r.cx)<0.01 && Math.abs(f.cz-r.cz)<0.01);
  const rs = new Set([0.02, r.r]);
  for(const f of konz){ if(f.art==='kreis') rs.add(f.r); else { rs.add(f.ri); rs.add(f.ra); } }
  const radien = [...rs].filter(v => v <= r.r+1e-6).sort((a,b)=>a-b);
  const bands = [];
  for(let i=0;i<radien.length-1;i++){
    const a = radien[i], b = radien[i+1];
    const ha = bodenBei(r.cx+a+0.03, r.cz), hb = bodenBei(r.cx+b-0.03, r.cz);
    const n = Math.abs(hb-ha) > 0.05 ? 4 : 1;
    for(let k=0;k<n;k++) bands.push([lerp(a,b,k/n), lerp(a,b,(k+1)/n)]);
  }
  const eps = 0.015;
  const hoehe = (rr, tt) => {
    const x = r.cx + rr*Math.cos(tt), z = r.cz + rr*Math.sin(tt);
    let h = bodenBei(x,z);
    if(h === AUSSEN) h = r.boden;
    return [x, h, z];
  };
  for(const [ra,rb] of bands){
    const ri = ra + (ra > 0.05 ? eps : 0), ro = rb - eps;
    for(let s=0;s<sekN;s++){
      const t0 = s/sekN*Math.PI*2, t1 = (s+1)/sekN*Math.PI*2;
      const p0 = hoehe(ri,t0), p1 = hoehe(ri,t1), p2 = hoehe(ro,t1), p3 = hoehe(ro,t0);
      const topf = topfFuerHoehe((p0[1]+p2[1])/2);
      quad(topf, p0,p1,p2,p3, topf==='becken'?0.5:1.0, 0,1,0);
    }
    /* Absatz am äußeren Rand des Bandes */
    for(let s=0;s<sekN;s++){
      const t0 = s/sekN*Math.PI*2, t1 = (s+1)/sekN*Math.PI*2;
      const a0 = hoehe(rb-eps,t0), a1 = hoehe(rb-eps,t1);
      const b0 = hoehe(rb+eps,t0), b1 = hoehe(rb+eps,t1);
      if(Math.abs(a0[1]-b0[1]) < 0.04 && Math.abs(a1[1]-b1[1]) < 0.04) continue;
      const nachAussen = a0[1] > b0[1] ? 1 : -1;
      const topf = topfFuerHoehe(Math.min(a0[1], b0[1]));
      quad(topf, a0,a1,[b1[0],b1[1],b1[2]],[b0[0],b0[1],b0[2]], topf==='becken'?0.5:1.0,
        Math.cos((t0+t1)/2)*nachAussen, 0, Math.sin((t0+t1)/2)*nachAussen);
    }
  }
}
/* ---------- Erhabene runde Flicken (Podest, Insel, Trittsteine) ---------- */
function insel(f, sekN){
  const y = f.y, n = sekN || 26;
  for(let s=0;s<n;s++){
    const t0 = s/n*Math.PI*2, t1 = (s+1)/n*Math.PI*2;
    const p0 = [f.cx, y, f.cz];
    const p1 = [f.cx + f.r*Math.cos(t0), y, f.cz + f.r*Math.sin(t0)];
    const p2 = [f.cx + f.r*Math.cos(t1), y, f.cz + f.r*Math.sin(t1)];
    const topf = topfFuerHoehe(y);
    dreieck(topf, p0[0],p0[1],p0[2], p2[0],p2[1],p2[2], p1[0],p1[1],p1[2], topf==='becken'?0.5:1.0);
    const aussen = bodenBei(f.cx + (f.r+0.15)*Math.cos((t0+t1)/2), f.cz + (f.r+0.15)*Math.sin((t0+t1)/2));
    const unten = (aussen === AUSSEN ? y-1 : aussen) - 0.05;
    if(y - unten < 0.05) continue;
    const m0 = [p1[0], y, p1[2]], m1 = [p2[0], y, p2[2]];
    const u0 = [p1[0], unten, p1[2]], u1 = [p2[0], unten, p2[2]];
    quad('wand', m0,m1,u1,u0, 1.0, Math.cos((t0+t1)/2), 0, Math.sin((t0+t1)/2));
  }
}

/* ---------- Rechteckige Räume: Boden mit ausgestanzten Flicken ---------- */
function abzug(liste, h){
  const raus = [];
  for(const r of liste){
    if(h.x1<=r.x0 || h.x0>=r.x1 || h.z1<=r.z0 || h.z0>=r.z1){ raus.push(r); continue; }
    const lz0 = Math.max(r.z0,h.z0), lz1 = Math.min(r.z1,h.z1);
    const lx0 = Math.max(r.x0,h.x0), lx1 = Math.min(r.x1,h.x1);
    if(r.z0 < lz0) raus.push({...r, z1:lz0});
    if(lz1 < r.z1) raus.push({...r, z0:lz1});
    if(r.x0 < lx0) raus.push({...r, x0:r.x0, x1:lx0, z0:lz0, z1:lz1});
    if(lx1 < r.x1) raus.push({...r, x0:lx1, x1:r.x1, z0:lz0, z1:lz1});
  }
  return raus;
}
{
  let stuecke = RAEUME.filter(r => r.art === 'rect')
    .map(r => ({ x0:r.x0, z0:r.z0, x1:r.x1, z1:r.z1, raum:r }));
  for(const f of FLICKEN){
    if(f.art !== 'rect' && f.art !== 'rampe') continue;
    stuecke = abzug(stuecke, f);
    stuecke.push({ x0:f.x0, z0:f.z0, x1:f.x1, z1:f.z1, flicken:f });
  }
  for(const s of stuecke){
    if(s.x1-s.x0 < 0.03 || s.z1-s.z0 < 0.03) continue;
    const eck = [[s.x0+0.01,s.z0+0.01],[s.x1-0.01,s.z0+0.01],[s.x1-0.01,s.z1-0.01],[s.x0+0.01,s.z1-0.01]];
    const p = eck.map(([x,z]) => [x, bodenBei(x,z), z]);
    if(p.some(v => v[1] === AUSSEN)) continue;
    const topf = topfFuerHoehe((p[0][1]+p[2][1])/2);
    const k = topf === 'becken' ? 0.5 : (s.raum && (s.raum.id==='T'||s.raum.id==='P') ? 2.0 : 1.0);
    quad(topf === 'becken' ? 'becken' : (s.raum && (s.raum.id==='T'||s.raum.id==='P') ? 'beton' : topf),
         p[0],p[1],p[2],p[3], k, 0,1,0);
  }
}
/* Absätze zwischen den rechteckigen Böden */
{
  const XS = new Set(), ZS = new Set();
  for(const r of RAEUME) if(r.art==='rect'){ XS.add(r.x0); XS.add(r.x1); ZS.add(r.z0); ZS.add(r.z1); }
  for(const f of FLICKEN) if(f.art==='rect'||f.art==='rampe'){ XS.add(f.x0); XS.add(f.x1); ZS.add(f.z0); ZS.add(f.z1); }
  const xs = [...XS].sort((a,b)=>a-b), zs = [...ZS].sort((a,b)=>a-b);
  const e = 0.03;
  function absatz(achse, wert, a0, a1){
    const n = Math.max(1, Math.ceil((a1-a0)/0.4));
    for(let i=0;i<n;i++){
      const b0 = a0 + (a1-a0)*i/n, b1 = a0 + (a1-a0)*(i+1)/n;
      const m = (b0+b1)/2;
      const pa = achse==='x' ? [wert-e,m] : [m,wert-e];
      const pb = achse==='x' ? [wert+e,m] : [m,wert+e];
      const ha = bodenRect(pa[0],pa[1]), hb = bodenRect(pb[0],pb[1]);
      if(ha===AUSSEN || hb===AUSSEN || Math.abs(ha-hb) < 0.05) continue;
      const ho = Math.max(ha,hb), hu = Math.min(ha,hb);
      const nx = achse==='x' ? (ha>hb ? 1 : -1) : 0;
      const nz = achse==='z' ? (ha>hb ? 1 : -1) : 0;
      const topf = topfFuerHoehe(hu);
      const p = achse==='x'
        ? [[wert,ho,b0],[wert,ho,b1],[wert,hu,b1],[wert,hu,b0]]
        : [[b0,ho,wert],[b1,ho,wert],[b1,hu,wert],[b0,hu,wert]];
      quad(topf, p[0],p[1],p[2],p[3], topf==='becken'?0.5:1.0, nx,0,nz);
    }
  }
  for(const x of xs) for(let i=0;i<zs.length-1;i++) absatz('x', x, zs[i], zs[i+1]);
  for(const z of zs) for(let i=0;i<xs.length-1;i++) absatz('z', z, xs[i], xs[i+1]);
}

/* ---------- Runde Böden und Inseln ---------- */
polarBoden(RAUM.A, 72);
polarBoden(RAUM.D, 96);
for(const f of FLICKEN){
  if(f.art !== 'kreis') continue;
  if(Math.abs(f.cx-12)<0.01 && Math.abs(f.cz-11)<0.01) continue;   // konzentrisch, schon im Polarnetz
  if(Math.abs(f.cx-34)<0.01 && Math.abs(f.cz-25)<0.01) continue;
  insel(f, 26);
}

/* ---------- Wände ---------- */
for(const w of WAENDE){
  if(w.ry1 - w.ry0 < 0.05) continue;
  const g = new T.BoxGeometry(w.hw*2, w.ry1-w.ry0, w.hd*2);
  const ng = entIndex(g);
  const p = ng.attributes.position, nn = ng.attributes.normal, uv = ng.attributes.uv;
  for(let i=0;i<p.count;i++){
    const ny = Math.abs(nn.getY(i)), nx = Math.abs(nn.getX(i));
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    if(ny > 0.5)      uv.setXY(i, (w.cx+x)/1.0, (w.cz+z)/1.0);
    else if(nx > 0.5) uv.setXY(i, z, y + (w.ry0+w.ry1)/2);
    else              uv.setXY(i, x + w.cx*w.co + w.cz*w.si, y + (w.ry0+w.ry1)/2);
  }
  ng.rotateY(-Math.atan2(w.si, w.co));
  ng.translate(w.cx, (w.ry0+w.ry1)/2, w.cz);
  const beton = w.cx < 4.6 && w.cz > 25.5 && w.ry1 < 3.0;
  nimm(beton ? 'beton' : 'wand', ng);
}

/* ---------- Decken ---------- */
for(const r of RAEUME){
  if(r.art === 'kreis'){
    const n = 64;
    for(let s=0;s<n;s++){
      const t0 = s/n*Math.PI*2, t1 = (s+1)/n*Math.PI*2;
      dreieck('decke', r.cx, r.decke, r.cz,
        r.cx + r.r*Math.cos(t0), r.decke, r.cz + r.r*Math.sin(t0),
        r.cx + r.r*Math.cos(t1), r.decke, r.cz + r.r*Math.sin(t1), 2.0);
    }
  } else {
    nimm(r.id==='T'||r.id==='P' ? 'beton' : 'decke', platte(r.x0,r.z0,r.x1,r.z1, r.decke, 2.0, true));
  }
}

/* ---------- Säulen und Arkaden ---------- */
function saeule(x, z, y0, y1, br){
  const g = entIndex(new T.CylinderGeometry(br*0.46, br*0.52, y1-y0, 14, 1, true));
  g.translate(x, (y0+y1)/2, z);
  const uv = g.attributes.uv, p = g.attributes.position;
  const umfang = 2*Math.PI*br*0.49;
  for(let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*umfang, p.getY(i));
  nimm('wand', g);
  nimm('deck', kasten(x-br*0.62, y1-0.34, z-br*0.62, x+br*0.62, y1, z+br*0.62, 1.0));
  nimm('deck', kasten(x-br*0.60, y0, z-br*0.60, x+br*0.60, y0+0.22, z+br*0.60, 1.0));
}
function bogenRippe(x0,z0,x1,z1,y, dicke){
  const dx = x1-x0, dz = z1-z0, l = Math.hypot(dx,dz);
  const g = entIndex(new T.TorusGeometry(l/2, dicke, 7, 20, Math.PI));
  g.scale(1, 0.54, 1);              // flacher Segmentbogen, sonst stößt er an die Decke
  g.rotateY(-Math.atan2(dz, dx));
  g.translate((x0+x1)/2, y, (z0+z1)/2);
  nimm('wand', g);
}
function arkade(cx, cz, r, n, y0, yKapitell, br, bogenHoch){
  const pt = [];
  for(let i=0;i<n;i++){
    const t = i/n*Math.PI*2;
    const x = cx + r*Math.cos(t), z = cz + r*Math.sin(t);
    pt.push([x,z]);
    saeule(x, z, y0, yKapitell, br);
  }
  for(let i=0;i<n;i++){
    const a = pt[i], b = pt[(i+1)%n];
    bogenRippe(a[0],a[1], b[0],b[1], yKapitell - 0.36, 0.19);
  }
  if(bogenHoch){
    const g = entIndex(new T.TorusGeometry(r, 0.22, 6, n*4));
    g.rotateX(Math.PI/2); g.translate(cx, yKapitell + 0.16, cz);
    nimm('deck', g);
  }
}
arkade(12, 11, 8.8, 12, 1.8, 6.2, 0.62, true);
arkade(34, 25, 7.9, 12, -1.0, 8.2, 0.86, true);
for(const [x,z] of [[30.5,5.6],[30.5,16.4],[41.0,5.6],[41.0,16.4]]) saeule(x, z, 0.6, 5.6, 0.6);
for(const [x,z] of [[7.0,25.6],[7.0,34.4],[12.5,25.6],[12.5,34.4],[19.5,25.6],[19.5,34.4]])
  saeule(x, z, 1.0, 6.6, 0.56);

/* ---------- Blendbögen: die Arkadenwand der Poolrooms ---------- */
function blendbogen(achse, wert, a0, a1, y0, hoehe, breite, nachInnen){
  const n = Math.floor((a1-a0)/(breite*1.5));
  if(n < 1) return;
  const luecke = (a1-a0)/n;
  const form = new T.Shape();
  const b = breite/2, schaft = hoehe - b;
  form.moveTo(-b, 0); form.lineTo(-b, schaft);
  form.absarc(0, schaft, b, Math.PI, 0, true);
  form.lineTo(b, 0); form.lineTo(-b, 0);
  for(let i=0;i<n;i++){
    const m = a0 + luecke*(i+0.5);
    const g = entIndex(new T.ExtrudeGeometry(form, { depth:0.18, bevelEnabled:false, curveSegments:10 }));
    g.translate(0,0,-0.18);
    if(achse === 'x'){ g.rotateY(nachInnen>0 ? Math.PI/2 : -Math.PI/2); g.translate(wert, y0, m); }
    else             { g.rotateY(nachInnen>0 ? 0 : Math.PI);            g.translate(m, y0, wert); }
    const uv = g.attributes.uv;
    for(let k=0;k<uv.count;k++) uv.setXY(k, uv.getX(k)*0.85, uv.getY(k)*0.85);
    nimm('dunkel', g);
  }
}
blendbogen('z', 3.75,  29.0, 42.0, 0.6, 3.2, 1.7,  1);   // Nordwand Umkleide
blendbogen('z', 18.25, 29.0, 42.0, 0.6, 3.2, 1.7, -1);   // Südwand Umkleide
blendbogen('z', 35.85, 5.0, 21.0, 1.0, 3.0, 1.6, -1);    // Südwand Säulenhalle
blendbogen('x', 4.15,  30.6, 35.4, 1.0, 3.0, 1.6,  1);   // Westwand Säulenhalle

/* ---------- Beckenlinien: ohne sie liest kein Auge ein Schwimmbad ---------- */
MAT.strich = nass(new T.MeshStandardMaterial({ color:0x18414a, roughness:0.5 }));
sammlung.strich = [];
roh.strich = { p:[], n:[], u:[] };
for(const rr of [3.6, 4.8, 5.6, 6.6]){
  const n = 72;
  for(let s=0;s<n;s++){
    const t0 = s/n*Math.PI*2, t1 = (s+1)/n*Math.PI*2;
    const h0 = bodenBei(12+rr*Math.cos(t0), 11+rr*Math.sin(t0));
    if(h0 === AUSSEN || h0 > 1.5) continue;
    const p = [];
    for(const [r2,t2] of [[rr-0.09,t0],[rr-0.09,t1],[rr+0.09,t1],[rr+0.09,t0]])
      p.push([12+r2*Math.cos(t2), bodenBei(12+r2*Math.cos(t2), 11+r2*Math.sin(t2)) + 0.012,
              11+r2*Math.sin(t2)]);
    quad('strich', p[0],p[1],p[2],p[3], 1.0, 0,1,0);
  }
}
for(const z of [8.9, 10.6, 12.3, 14.0]){
  const y = -0.888;      // Beckenboden -0.90, zwei Zentimeter darüber
  const p = [[33.4,y,z-0.08],[39.9,y,z-0.08],[39.9,y,z+0.08],[33.4,y,z+0.08]];
  quad('strich', p[0],p[1],p[2],p[3], 1.0, 0,1,0);
}

/* ---------- Leuchtdecken: die Quelle des Lichts ist die Decke selbst ---------- */
const leuchtMat = new T.MeshBasicMaterial({ color:0x24322f });   // die Leuchtdecken sind tot
function leuchtScheibe(cx,cz,r,y){
  const m = new T.Mesh(new T.CircleGeometry(r, 48), leuchtMat);
  m.rotation.x = Math.PI/2; m.position.set(cx, y, cz); welt.add(m);
}
function leuchtRing(cx,cz,ri,ra,y){
  const m = new T.Mesh(new T.RingGeometry(ri, ra, 56), leuchtMat);
  m.rotation.x = Math.PI/2; m.position.set(cx, y, cz); welt.add(m);
}
function leuchtFeld(x,z,br,ti,y){
  const m = new T.Mesh(new T.PlaneGeometry(br, ti), leuchtMat);
  m.rotation.x = Math.PI/2; m.position.set(x, y, z); welt.add(m);
}
leuchtScheibe(12, 11, 2.6, 7.54);
leuchtRing(12, 11, 4.4, 6.6, 7.54);
for(let i=0;i<8;i++){
  const t = (i+0.5)/8*Math.PI*2;
  leuchtFeld(12+9.5*Math.cos(t), 11+9.5*Math.sin(t), 1.3, 1.3, 7.53);
}
leuchtScheibe(34, 25, 5.4, 10.44);
leuchtRing(34, 25, 7.4, 8.8, 10.44);
for(const [x,z] of [[31.5,7.0],[38.0,7.0],[31.5,15.0],[38.0,15.0],[34.7,11.0]])
  leuchtFeld(x, z, 3.6, 1.0, 6.14);
for(const [x,z] of [[8.0,27.0],[15.0,27.0],[8.0,33.0],[15.0,33.0],[19.0,30.0]])
  leuchtFeld(x, z, 3.2, 0.9, 7.14);
leuchtFeld(25.0, 11.0, 2.6, 0.8, 5.34);
leuchtFeld(23.3, 26.8, 2.2, 0.8, 6.54);
const kellerBirne = new T.Mesh(new T.SphereGeometry(0.08, 8, 6), leuchtMat);
kellerBirne.position.set(1.3, 1.95, 29.4); welt.add(kellerBirne);

/* ---------- Geländer, Leitern, Schilder ---------- */
function rohr(x0,y0,z0, x1,y1,z1, r){
  const a = new T.Vector3(x0,y0,z0), b = new T.Vector3(x1,y1,z1);
  const l = a.distanceTo(b);
  if(l < 0.01) return;
  const g = entIndex(new T.CylinderGeometry(r, r, l, 8, 1));
  g.translate(0, l/2, 0);
  const m = new T.Mesh(g, MAT.rost);
  m.position.copy(a); m.lookAt(b); m.rotateX(Math.PI/2);
  welt.add(m);
}
function leiter(cx, cz, winkel, oben, unten){
  const dx = Math.cos(winkel), dz = Math.sin(winkel);
  const qx = -dz, qz = dx;
  for(const s of [-0.26, 0.26]){
    const x = cx + qx*s, z = cz + qz*s;
    rohr(x, oben+0.95, z, x, oben+0.05, z, 0.035);
    rohr(x, oben+0.05, z, x+dx*0.55, oben-0.45, z+dz*0.55, 0.035);
    rohr(x+dx*0.55, oben-0.45, z+dz*0.55, x+dx*0.55, unten+0.1, z+dz*0.55, 0.035);
  }
  for(let y = oben-0.62; y > unten+0.2; y -= 0.42)
    rohr(cx+dx*0.55+qx*0.26, y, cz+dz*0.55+qz*0.26, cx+dx*0.55-qx*0.26, y, cz+dz*0.55-qz*0.26, 0.028);
}
leiter(12 + 6.9*Math.cos(3.6), 11 + 6.9*Math.sin(3.6), 3.6 + Math.PI, 0.35, -1.0);
leiter(12 + 6.9*Math.cos(5.8), 11 + 6.9*Math.sin(5.8), 5.8 + Math.PI, 0.35, -1.0);
leiter(33.3, 11.0, Math.PI, 0.6, -0.9);

function schildTex(zeilen, grund, tinte){
  const c = cv(512, 256), g = c.getContext('2d');
  g.fillStyle = grund; g.fillRect(0,0,512,256);
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 7; g.strokeRect(4,4,504,248);
  g.fillStyle = tinte; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = zeilen.length;
  zeilen.forEach((z, i) => {
    g.font = `700 ${z.gross ? 74 : 42}px ui-monospace, Menlo, monospace`;
    g.fillText(z.t, 256, 128 + (i - (n-1)/2) * (n>1 ? 76 : 0));
  });
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function schild(x,y,z, gier, br, ho, zeilen, grund, tinte){
  const m = new T.Mesh(new T.PlaneGeometry(br, ho),
    nass(new T.MeshStandardMaterial({ map:schildTex(zeilen, grund||'#eef1ea', tinte||'#1d2422'), roughness:0.65 })));
  m.position.set(x,y,z); m.rotation.y = gier; welt.add(m);
  return m;
}

/* ---------- Die drei Schieber ---------- */
const SCHIEBER = [];
function schieberBau(nr, x, y, z, gier){
  const gr = new T.Group();
  gr.position.set(x,y,z); gr.rotation.y = gier;
  const flansch = new T.Mesh(entIndex(new T.CylinderGeometry(0.3,0.3,0.16,16)), MAT.rost);
  flansch.rotation.x = Math.PI/2; flansch.position.z = 0.08; gr.add(flansch);
  const achse = new T.Mesh(entIndex(new T.CylinderGeometry(0.05,0.05,0.36,8)), MAT.rost);
  achse.rotation.x = Math.PI/2; achse.position.z = 0.27; gr.add(achse);
  const rad = new T.Group(); rad.position.z = 0.42; gr.add(rad);
  rad.add(new T.Mesh(entIndex(new T.TorusGeometry(0.38, 0.048, 8, 24)), MAT.rost));
  for(let i=0;i<4;i++){
    const sp = new T.Mesh(entIndex(new T.BoxGeometry(0.74, 0.06, 0.048)), MAT.rost);
    sp.rotation.z = i*Math.PI/4; rad.add(sp);
  }
  const nabe = new T.Mesh(entIndex(new T.CylinderGeometry(0.1,0.1,0.11,12)), MAT.rost);
  nabe.rotation.x = Math.PI/2; rad.add(nabe);
  const r1 = new T.Mesh(entIndex(new T.CylinderGeometry(0.14,0.14,1.6,12)), MAT.rost);
  r1.position.set(0, -0.9, 0.12); gr.add(r1);
  const rot = new T.Mesh(new T.SphereGeometry(0.055, 8, 6), new T.MeshBasicMaterial({ color:0xd8452e }));
  rot.position.set(0.36, 0.36, 0.44); gr.add(rot);
  welt.add(gr);
  const s = { nr, gruppe:gr, rad, lampe:rot, offen:false, dreht:0, pos:new T.Vector3(x,y,z), gier };
  SCHIEBER.push(s);
  return s;
}
schieberBau(1, 42.55, 1.90, 11.00, -Math.PI/2);
schieberBau(2, 18.30, 3.55, 31.00, -Math.PI/2);
schieberBau(3,  0.58, 1.15, 29.40,  Math.PI/2);

schild(42.72, 3.1, 11.0, -Math.PI/2, 1.6, 0.8, [{t:'SCHIEBER I',gross:true}], '#e9e2c9', '#20261f');
schild(18.45, 4.6, 31.0, -Math.PI/2, 1.5, 0.75, [{t:'SCHIEBER II',gross:true}], '#e9e2c9', '#20261f');
schild(0.44, 1.95, 29.4,  Math.PI/2, 1.2, 0.6, [{t:'SCHIEBER III',gross:true}], '#e9e2c9', '#20261f');
schild(12.0, 4.2, 1.0, 0, 3.4, 1.7, [{t:'HALLENBAD'},{t:'RIESELSTRASSE 14'}], '#eef1ea', '#232a26');
schild(12.0, 3.2, 21.05, 0, 2.8, 1.4, [{t:'ÜBERLAUF'},{t:'NUR SCHWIMMEND'}], '#e4d49a', '#241f12');
schild(28.05, 3.2, 11.0, -Math.PI/2, 1.8, 0.9, [{t:'UMKLEIDE'},{t:'SCHIEBER I'}], '#eef1ea', '#232a26');
schild(22.05, 3.6, 26.8, -Math.PI/2, 2.6, 1.3, [{t:'GROSSE HALLE'},{t:'NOTAUSSTIEG OST'}], '#eef1ea', '#232a26');
schild(4.25, 1.9, 29.0, Math.PI/2, 1.5, 0.75, [{t:'FLUTTUNNEL'},{t:'TAUCHEN'}], '#e4d49a', '#241f12');
schild(17.5, 3.0, 33.9, 0, 2.2, 1.1, [{t:'SPRUNGBECKEN'},{t:'3,20 m'}], '#eef1ea', '#232a26');

/* ---------- Die Luke ---------- */
const LUKE = { pos:new T.Vector3(44.72, 5.45, 25.0), offen:false };
{
  const gr = new T.Group();
  gr.position.copy(LUKE.pos); gr.rotation.y = -Math.PI/2;
  const rahmen = new T.Mesh(entIndex(new T.BoxGeometry(2.0, 2.6, 0.18)), MAT.rost);
  rahmen.position.z = -0.06; gr.add(rahmen);
  const tuer = new T.Mesh(entIndex(new T.BoxGeometry(1.6, 2.2, 0.14)),
    nass(new T.MeshStandardMaterial({ color:0x8fa89a, roughness:0.55, metalness:0.5 })));
  tuer.position.z = 0.07; gr.add(tuer);
  const rad = new T.Group(); rad.position.set(0, -0.1, 0.22); gr.add(rad);
  rad.add(new T.Mesh(entIndex(new T.TorusGeometry(0.32, 0.045, 7, 22)), MAT.rost));
  for(let i=0;i<3;i++){
    const sp = new T.Mesh(entIndex(new T.BoxGeometry(0.62, 0.055, 0.045)), MAT.rost);
    sp.rotation.z = i*Math.PI/3; rad.add(sp);
  }
  welt.add(gr);
  LUKE.gruppe = gr; LUKE.rad = rad; LUKE.tuer = tuer;
  schild(44.7, 7.2, 25.0, -Math.PI/2, 2.0, 1.0, [{t:'NOTAUSSTIEG',gross:true}], '#3f7a4a', '#eaf4ea');
}
/* Pegelleiter neben der Luke: man soll sehen, wie weit es noch fehlt */
{
  const c = cv(128, 1024), g = c.getContext('2d');
  g.fillStyle='#eef1ea'; g.fillRect(0,0,128,1024);
  for(let m=0;m<=9;m++){
    const y = 1024 - m*1024/9;
    g.fillStyle='#1c2320'; g.fillRect(0, y-3, 92, 6);
    g.font='700 42px ui-monospace, monospace'; g.textBaseline='top';
    if(m<9) g.fillText(m+'', 14, y+8);
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  const m = new T.Mesh(new T.PlaneGeometry(0.34, 9),
    nass(new T.MeshStandardMaterial({ map:t, roughness:0.8 })));
  m.position.set(44.86, 3.5, 27.4); m.rotation.y = -Math.PI/2; welt.add(m);
}

/* ---------- Alles verschmelzen ---------- */
for(const k in roh){
  const r = roh[k];
  if(!r.p.length) continue;
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(r.p), 3));
  g.setAttribute('normal',   new T.BufferAttribute(new Float32Array(r.n), 3));
  g.setAttribute('uv',       new T.BufferAttribute(new Float32Array(r.u), 2));
  sammlung[k].push(g);
  roh[k] = null;
}
for(const k in sammlung){
  if(!sammlung[k] || !sammlung[k].length) continue;
  const m = new T.Mesh(verschmelze(sammlung[k]), MAT[k]);
  m.castShadow = m.receiveShadow = Q.schatten;
  welt.add(m);
  sammlung[k] = null;
}

/* ---------- Licht: hell, quellenlos, ohne einen dunklen Winkel ---------- */
/* Der Boden dieses Hauses ist weiße Kachel — von unten kommt fast so viel
   Licht zurück wie von oben. Mit einem dunklen Bodenton wurde jede nach
   unten gerichtete Fläche schwarz: Decken, Stürze, die Unterseiten der
   Bögen. */
/* Der Strom in diesem Haus ist längst weg. Was übrig bleibt, ist ein
   Rest Streulicht — und das, was du selbst mitbringst. */
scene.add(new T.HemisphereLight(0x63807e, 0x2c3c3c, 0.16));
scene.add(new T.AmbientLight(0x516a6a, 0.055));
function lampe(x,y,z, farbe, staerke, weite){
  const l = new T.PointLight(farbe, staerke, weite, 1.4);
  l.position.set(x,y,z); scene.add(l);
  return l;
}
lampe(12.0, 6.6, 11.0, 0xdcefff, 16, 20);
/* Die Lampen hängen weit oben unter der Decke. Tief gesetzt brennen sie
   die nächste Fläche weiß aus — das sah aus wie ein Loch in der Wand. */
lampe(34.0, 9.4, 25.0, 0xdcefff, 26, 34);
lampe(29.0, 8.6, 21.0, 0xdcefff, 9, 20);
lampe(29.0, 8.6, 29.0, 0xdcefff, 9, 20);
lampe(39.5, 8.6, 25.0, 0xdcefff, 9, 20);
lampe(34.8, 5.4, 11.0, 0xdcefff, 12, 18);
lampe(12.0, 6.0, 30.0, 0xdcefff, 13, 18);
lampe(25.0, 4.0, 11.0, 0xdcefff,  6, 10);
lampe(1.30, 1.90, 29.4, 0xffc98a,  5, 7);
if(Q.schatten){
  const s = new T.DirectionalLight(0xbcd2d6, 0.07);
  s.position.set(20, 26, 6); s.target.position.set(26, 0, 22);
  s.castShadow = true;
  s.shadow.mapSize.set(1024,1024);
  s.shadow.camera.left = -26; s.shadow.camera.right = 26;
  s.shadow.camera.top = 26; s.shadow.camera.bottom = -26;
  s.shadow.camera.far = 80; s.shadow.bias = -0.0015;
  scene.add(s); scene.add(s.target);
}
/* ======================= 5  Das Wasser ======================= */
/* Ein Höhenbild des Bodens liegt als Textur bereit. Damit kennt der Shader
   an jeder Stelle die Wassertiefe auf den Zentimeter genau — daraus kommen
   Farbe, Durchsicht und der Schaumsaum am Rand, ohne einen einzigen
   zusätzlichen Bilddurchgang. */
const HX = 344, HZ = 248;
const hoehenDaten = new Uint16Array(HX*HZ);
function halb(f){                       // float32 -> float16, von Hand
  const b = new Float32Array(1); b[0] = f;
  const i = new Int32Array(b.buffer)[0];
  const s = (i>>16)&0x8000, e = ((i>>23)&0xff)-127, m = i&0x7fffff;
  if(e < -14) return s;
  if(e > 15)  return s|0x7bff;
  return s | ((e+15)<<10) | (m>>13);
}
for(let j=0;j<HZ;j++) for(let i=0;i<HX;i++){
  const x = KARTE.x0 + (i+0.5)/HX*KB, z = KARTE.z0 + (j+0.5)/HZ*KT;
  let h = bodenBei(x,z);
  if(h === AUSSEN) h = 40;
  hoehenDaten[j*HX+i] = halb(h);
}
const hoehenTex = new T.DataTexture(hoehenDaten, HX, HZ, T.RedFormat, T.HalfFloatType);
hoehenTex.minFilter = hoehenTex.magFilter = T.LinearFilter;
hoehenTex.wrapS = hoehenTex.wrapT = T.ClampToEdgeWrapping;
hoehenTex.needsUpdate = true;

const ZEIT = { t: 0 };
const WASSER = { h:1.6, ziel:1.6, steigt:0 };
const RIPPEL_N = 8;
const rippel = [];
for(let i=0;i<RIPPEL_N;i++) rippel.push(new T.Vector3(0,0,-99));
let rippelNext = 0;
function rippeln(x, z){
  const r = rippel[rippelNext];
  rippelNext = (rippelNext+1) % RIPPEL_N;
  r.set(x, z, ZEIT.t);
}

const WELLE_GLSL = `
void prWelle(inout float h, inout vec2 g, vec2 p, float t, vec2 d, float f, float a, float s){
  float ph = dot(p,d)*f + t*s;
  h += a*sin(ph);
  g += a*f*cos(ph)*d;
}
void prRippel(inout float h, inout vec2 g, vec2 p, float t, vec3 r){
  if(r.z < -50.0) return;
  float alter = t - r.z;
  if(alter < 0.0 || alter > 6.0) return;
  vec2 dv = p - r.xy;
  float d = length(dv) + 1e-4;
  float front = alter * 2.05;
  float w = exp(-alter*0.75) * exp(-abs(d-front)*2.2) * 0.055;
  float ph = (d - front) * 8.5;
  h += w * sin(ph);
  g += w * 8.5 * cos(ph) * (dv/d);
}
float prFeld(vec2 p, float t, int lagen, out vec2 grad){
  float h = 0.0; vec2 g = vec2(0.0);
  prWelle(h, g, p, t, vec2(0.94, 0.34), 1.05, 0.030, 0.85);
  prWelle(h, g, p, t, vec2(-0.42, 0.91), 1.48, 0.021, 1.15);
  if(lagen > 2) prWelle(h, g, p, t, vec2(0.63,-0.78), 2.55, 0.011, 1.65);
  if(lagen > 3) prWelle(h, g, p, t, vec2(-0.88,-0.47), 3.90, 0.006, 2.30);
  grad = g;
  return h;
}`;

function wasserMaterial(spiegelTex){
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, fog: false,
    uniforms: {
      uZeit:     { value: 0 },
      uWasser:   { value: 1.6 },
      uHoehe:    { value: hoehenTex },
      uKarte:    { value: new T.Vector4(KARTE.x0, KARTE.z0, 1/KB, 1/KT) },
      uKamera:   { value: new T.Vector3() },
      uSpiegel:  { value: spiegelTex },
      uSpiegelAn:{ value: 0 },
      uSpiegelM: { value: new T.Matrix4() },
      uRippel:   { value: rippel },
      uLagen:    { value: Q.wellen },
      uTief:     { value: new T.Color(0x073c44) },
      uFlach:    { value: new T.Color(0x2e8f8a) },
      uHimmel:   { value: new T.Color(0x2e4448) },
      uAusschnitt:{ value: new T.Vector4(0,0,-1,-1) },   // dieser Kasten wird ausgelassen
      uDeckel:   { value: 40.0 },
      uBlick:    { value: new T.Vector3(0,0,-1) },
      uLampe:    { value: 1 },
      uKegel:    { value: 0.50 },
    },
    vertexShader: `
      uniform float uZeit, uWasser; uniform int uLagen;
      uniform vec3 uRippel[${RIPPEL_N}];
      uniform mat4 uSpiegelM;
      varying vec3 vW; varying vec4 vSp; varying vec2 vGrad;
      ${WELLE_GLSL}
      void main(){
        vec3 p = position;
        vec2 g;
        float h = prFeld(p.xz, uZeit, uLagen, g);
        for(int i=0;i<${RIPPEL_N};i++) prRippel(h, g, p.xz, uZeit, uRippel[i]);
        p.y = uWasser + h;
        vGrad = g;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vW = wp.xyz;
        vSp = uSpiegelM * wp;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      precision highp float;
      uniform float uZeit, uWasser, uDeckel; uniform int uLagen;
      uniform sampler2D uHoehe, uSpiegel;
      uniform vec4 uKarte, uAusschnitt;
      uniform vec3 uKamera, uTief, uFlach, uHimmel, uBlick;
      uniform float uSpiegelAn, uLampe, uKegel;
      uniform vec3 uRippel[${RIPPEL_N}];
      varying vec3 vW; varying vec4 vSp; varying vec2 vGrad;
      ${WELLE_GLSL}
      void main(){
        if(vW.x > uAusschnitt.x && vW.x < uAusschnitt.z &&
           vW.z > uAusschnitt.y && vW.z < uAusschnitt.w) discard;
        vec2 uv = vec2((vW.x - uKarte.x) * uKarte.z, (vW.z - uKarte.y) * uKarte.w);
        float boden = texture2D(uHoehe, uv).r;
        float tiefe = uWasser - boden;
        if(tiefe < 0.035 || boden > 30.0) discard;
        if(uWasser > uDeckel + 0.01) discard;

        /* Feinere Wellen nur für die Normale, die kosten im Netz nichts */
        vec2 g2 = vGrad;
        float hh = 0.0;
        prWelle(hh, g2, vW.xz, uZeit, vec2(0.31, 0.95), 6.4, 0.0032, 3.1);
        prWelle(hh, g2, vW.xz, uZeit, vec2(-0.97, 0.24), 9.1, 0.0018, 4.2);
        float saum = 1.0 - smoothstep(0.0, 0.55, tiefe);
        vec3 N = normalize(vec3(-g2.x, 1.0, -g2.y));

        vec3 V = normalize(vW - uKamera);
        bool oben = uKamera.y > uWasser;
        float ndv = clamp(dot(N, -V), 0.0, 1.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

        vec3 farbe; float alpha;
        if(oben){
          vec3 sp = uHimmel * (0.75 + 0.35*N.y);
          if(uSpiegelAn > 0.5){
            vec2 spuv = vSp.xy / max(vSp.w, 1e-4) + N.xz * (0.035 + 0.05*saum);
            sp = mix(sp, texture2D(uSpiegel, clamp(spuv, 0.002, 0.998)).rgb, 0.94);
          }
          vec3 tint = mix(uFlach, uTief, clamp(tiefe*0.30, 0.0, 1.0));
          float durch = exp(-tiefe*0.62);
          farbe = tint;
          alpha = mix(0.94, 0.18, durch);
          farbe = mix(farbe, sp, clamp(fres, 0.0, 0.92));
          alpha = mix(alpha, 1.0, fres*0.9);
          /* Glanzlicht: ohne das wirkt Wasser wie Gelee */
          vec3 L = normalize(vec3(0.35, 0.86, -0.36));
          float glanz = pow(max(dot(reflect(V, N), L), 0.0), 220.0);
          farbe += vec3(1.0, 0.99, 0.94) * glanz * 1.5;
        } else {
          float w = pow(ndv, 1.3);
          farbe = mix(uTief*0.55, vec3(0.68,0.90,0.93), w);
          alpha = mix(0.97, 0.30, w);
          float glitzer = pow(max(0.0, 1.0 - length(g2)*3.0), 6.0) * w;
          farbe += vec3(0.20,0.30,0.30) * glitzer;
        }
        /* Der Kegel der Handlampe auf der Oberfläche: ein weiches Feld
           und ein harter Glanzpunkt darin. Ohne den ist Wasser im Dunkeln
           ein schwarzes Loch. */
        if(uLampe > 0.01){
          vec3 zum = vW - uKamera;
          float dd = length(zum);
          vec3 dir = zum / max(dd, 0.001);
          float wink = acos(clamp(dot(dir, uBlick), -1.0, 1.0));
          float kegel = 1.0 - smoothstep(uKegel*0.35, uKegel, wink);
          float abfall = 1.0 / (1.0 + dd*dd*0.055);
          float glanz = pow(max(dot(reflect(dir, N), -dir), 0.0), 60.0);
          farbe += uLampe * kegel * abfall *
                   (vec3(0.30,0.44,0.46)*0.55 + vec3(1.0,0.99,0.95)*glanz*2.2);
          alpha = min(1.0, alpha + uLampe*kegel*abfall*0.25);
        }
        /* Schaumsaum, wo das Wasser die Kacheln trifft */
        float wellenSaum = saum * (0.55 + 0.45*sin(tiefe*26.0 - uZeit*2.4 + vGrad.x*10.0));
        farbe = mix(farbe, vec3(0.90,0.96,0.95), clamp(wellenSaum*0.75, 0.0, 0.8));
        alpha = mix(alpha, 0.92, clamp(saum*0.8, 0.0, 0.85));
        gl_FragColor = vec4(farbe, clamp(alpha, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/* ---------- Spiegelbild: eine gespiegelte Kamera, ein halbes Bild ---------- */
const spiegelRT = Q.spiegel > 0
  ? new T.WebGLRenderTarget(16, 16, { minFilter:T.LinearFilter, magFilter:T.LinearFilter,
      type:T.HalfFloatType, depthBuffer:true })
  : null;
if(spiegelRT) spiegelRT.texture.colorSpace = T.NoColorSpace;

const wasserGeo = new T.PlaneGeometry(KB, KT, Math.ceil(KB/0.5), Math.ceil(KT/0.5));
wasserGeo.rotateX(-Math.PI/2);
wasserGeo.translate(KARTE.x0 + KB/2, 0, KARTE.z0 + KT/2);
const wasserMat = wasserMaterial(spiegelRT ? spiegelRT.texture : null);
wasserMat.uniforms.uAusschnitt.value.set(RAUM.P.x0-0.2, RAUM.P.z0-0.2, RAUM.P.x1+0.2, RAUM.P.z1+0.2);
const wasserNetz = new T.Mesh(wasserGeo, wasserMat);
wasserNetz.frustumCulled = false;
wasserNetz.renderOrder = 5;
scene.add(wasserNetz);

/* Der Pumpenkeller hat sein eigenes, tieferes Wasser — die Luft darin
   kommt nicht heraus. */
const kellerGeo = new T.PlaneGeometry(RAUM.P.x1-RAUM.P.x0, RAUM.P.z1-RAUM.P.z0, 8, 14);
kellerGeo.rotateX(-Math.PI/2);
kellerGeo.translate((RAUM.P.x0+RAUM.P.x1)/2, 0, (RAUM.P.z0+RAUM.P.z1)/2);
const kellerMat = wasserMaterial(null);
kellerMat.uniforms.uHimmel.value.setHex(0x9fb0a8);
const kellerNetz = new T.Mesh(kellerGeo, kellerMat);
kellerNetz.frustumCulled = false; kellerNetz.renderOrder = 5;
scene.add(kellerNetz);

/* ======================= 6  Bildnachbearbeitung ======================= */
/* Das Band läuft noch. Körnung, Zeilen, ein bisschen Farbversatz — und
   unter Wasser legt sich alles schief und grün darüber. */
/* Halbe Fließkomma: three schaltet Tonemapping ab, sobald in ein
   Zwischenbild gerendert wird. Die Spitzen müssen also ungeklemmt hier
   ankommen und werden erst im Nachbearbeitungsschritt belichtet — sonst
   brennt jede helle Fläche zu reinem Weiß aus. */
const bildRT = new T.WebGLRenderTarget(16, 16, {
  minFilter:T.LinearFilter, magFilter:T.LinearFilter, type:T.HalfFloatType });
const postScene = new T.Scene();
const postCam = new T.OrthographicCamera(-1,1,1,-1,0,1);
const postMat = new T.ShaderMaterial({
  uniforms: {
    uBild:   { value: bildRT.texture },
    uZeit:   { value: 0 },
    uNass:   { value: 0 },     // 0..1 Kopf unter Wasser
    uLuft:   { value: 1 },     // 1 = voll
    uNah:    { value: 0 },     // Gefahr
    uSpul:   { value: 0 },     // Bandrücklauf beim Tod
    uVhs:    { value: 0.42 },  // dieselben Werte wie in Ebene 0
    uLens:   { value: 0.34 },
    uPixel:  { value: new T.Vector2(1,1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    precision highp float;
    uniform sampler2D uBild;
    uniform float uZeit, uNass, uLuft, uNah, uSpul, uVhs, uLens;
    uniform vec2 uPixel;
    varying vec2 vUv;
    float lrm(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 hi(vec2 p){ return max(texture2D(uBild, clamp(p,0.002,0.998)).rgb - 0.80, 0.0); }
    vec3 bloom(vec2 p){
      vec2 r = vec2(0.008,0.011);
      vec3 s = hi(p+vec2(r.x,0.))+hi(p-vec2(r.x,0.))+hi(p+vec2(0.,r.y))+hi(p-vec2(0.,r.y))
            + hi(p+r*0.7)+hi(p-r*0.7)+hi(p+vec2(r.x,-r.y)*0.7)+hi(p+vec2(-r.x,r.y)*0.7);
      vec2 w = r*2.8;
      s += hi(p+vec2(w.x,0.))+hi(p-vec2(w.x,0.))+hi(p+vec2(0.,w.y))+hi(p-vec2(0.,w.y));
      return s/12.0;
    }
    void main(){
      float V = uVhs;
      vec2 uv = vUv;
      /* Linse: dieselbe Tonne wie in Ebene 0 */
      vec2 cc = uv - 0.5;
      float r2 = dot(cc,cc);
      uv = 0.5 + cc*(1.0 + uLens*r2)/(1.0 + uLens*0.22);
      /* Unter Wasser schiebt sich das Bild in langsamen Wellen */
      if(uNass > 0.001){
        uv.x += sin(uv.y*11.0 + uZeit*1.7) * 0.0045 * uNass;
        uv.y += sin(uv.x*13.0 - uZeit*1.3) * 0.0035 * uNass;
      }
      /* Kopfspur, Bandlauf, Blockversatz */
      uv.x += sin(uv.y*88.0 + uZeit*2.4)*0.0011*V*(1.0 + uSpul*3.0);
      float bandPos = fract(uZeit*0.10);
      float band = smoothstep(0.045, 0.0, abs(uv.y-bandPos))*V;
      uv.x += band*(lrm(vec2(uv.y, floor(uZeit*30.0)))-0.5)*0.028*(0.3 + uSpul*1.4);
      float row = floor(uv.y*48.0);
      float blk = step(0.995 - uSpul*0.30, lrm(vec2(row, floor(uZeit*14.0))));
      uv.x += blk*(lrm(vec2(row,uZeit))-0.5)*0.15*(0.06 + uSpul)*(0.35 + V);
      uv = clamp(uv, 0.002, 0.998);
      float ca = (0.0010 + uSpul*0.006 + band*0.002 + uNass*0.0015)*(0.4 + V*0.6);
      vec3 col;
      col.r = texture2D(uBild, uv + vec2(ca,0.0)).r;
      col.g = texture2D(uBild, uv).g;
      col.b = texture2D(uBild, uv - vec2(ca,0.0)).b;
      col += bloom(uv) * vec3(1.0,0.98,0.94) * 1.0;
      float lum = dot(col, vec3(0.299,0.587,0.114));
      col = mix(col, vec3(lum), 0.10*V);
      if(uNass > 0.001) col = mix(col, col * vec3(0.55,1.06,1.02) + vec3(0.0,0.03,0.04), uNass*0.85);
      if(uNah > 0.001){
        float grau = dot(col, vec3(0.33));
        col = mix(col, vec3(grau)*vec3(1.10,0.86,0.84), uNah*0.34);
      }
      /* Ab hier wird belichtet — Korn und Zeilen gehören auf das fertige Bild */
      col = toneMapping(col);
      col += 0.018*V;
      col *= 1.0 - 0.07*V*(0.5 - 0.5*sin(uv.y*uPixel.y*3.14159));
      col *= 1.0 - 0.018*V*lrm(vec2(floor(uv.y*uPixel.y), floor(uZeit*24.0)));
      float lf = clamp(dot(col, vec3(0.299,0.587,0.114)), 0.0, 1.0);
      float g1 = lrm(uv*uPixel + fract(uZeit)*91.7) - 0.5;
      float g2 = lrm(floor(uv*uPixel*0.30) + fract(uZeit*0.83)*57.3) - 0.5;
      float korn = (g1*0.020 + g2*0.014) * (0.55 + 0.45*(1.0 - lf));
      col += korn * (0.75 + 0.5*V + uSpul*0.9);
      /* Luft wird knapp: der Rand zieht sich zu und pocht */
      if(uLuft < 0.34){
        float puls = 0.5 + 0.5*sin(uZeit*(7.0 + (0.34-uLuft)*22.0));
        float k = (0.34 - uLuft)/0.34;
        col = mix(col, vec3(0.26,0.02,0.02), k*k*0.45*puls);
      }
      float vig = dot(vUv-0.5, vUv-0.5);
      col *= 1.0 - vig*(0.85 + 0.60*V + 1.5*(1.0-uLuft)*(1.0-uLuft));
      col = mix(col, vec3(lrm(uv*uPixel*0.7 + uZeit*57.3)), uSpul*0.55);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
});
postScene.add(new T.Mesh(new T.PlaneGeometry(2,2), postMat));

/* ---------- Die Lampe am Camcorder ---------- */
/* Sie sitzt nicht in der Mitte, sondern etwas rechts unter der Linse —
   deshalb wandert der Kegel beim Gehen ein Stück gegen die Blickrichtung.
   Genau das macht eine Handlampe aus. */
const LAMPE = new T.SpotLight(0xeaf2ff, 95, 34, 0.52, 0.42, 1.15);
LAMPE.castShadow = Q.schatten;
if(Q.schatten){
  LAMPE.shadow.mapSize.set(1024,1024);
  LAMPE.shadow.camera.near = 0.3; LAMPE.shadow.camera.far = 30;
  LAMPE.shadow.bias = -0.0013;
}
scene.add(LAMPE); scene.add(LAMPE.target);
const NAHLICHT = new T.PointLight(0xdfeaf6, 3.2, 6.0, 1.6);
scene.add(NAHLICHT);
const LAMPENZUSTAND = { flacker: 1, naechster: 6 + Math.random()*12, dauer: 0 };
const _lampRicht = new T.Vector3(), _lampRechts = new T.Vector3(), _lampPos = new T.Vector3();
function lampeSchritt(dt){
  LAMPENZUSTAND.naechster -= dt;
  if(LAMPENZUSTAND.dauer > 0){
    LAMPENZUSTAND.dauer -= dt;
    LAMPENZUSTAND.flacker = 0.18 + Math.random()*0.8;
    if(LAMPENZUSTAND.dauer <= 0) LAMPENZUSTAND.flacker = 1;
  } else if(LAMPENZUSTAND.naechster <= 0){
    LAMPENZUSTAND.naechster = 9 + Math.random()*22;
    LAMPENZUSTAND.dauer = 0.18 + Math.random()*0.5;
  }
  blickRichtung(_lampRicht);
  _lampRechts.set(Math.cos(P.gier), 0, -Math.sin(P.gier));
  _lampPos.copy(camera.position)
    .addScaledVector(_lampRechts, 0.17)
    .addScaledVector(_lampRicht, 0.10);
  _lampPos.y -= 0.13;
  LAMPE.position.copy(_lampPos);
  LAMPE.target.position.copy(_lampPos).addScaledVector(_lampRicht, 12);
  LAMPE.target.updateMatrixWorld();
  NAHLICHT.position.copy(camera.position);
  const nass = kopfNass();
  /* Unter Wasser trägt der Kegel kaum, dafür streut er blau. */
  LAMPE.distance = nass ? 12 : 34;
  LAMPE.angle = nass ? 0.62 : 0.50;
  LAMPE.color.setHex(nass ? 0xa8dcf0 : 0xeaf2ff);
  LAMPE.intensity = (nass ? 48 : 95) * LAMPENZUSTAND.flacker;
  NAHLICHT.intensity = (nass ? 2.0 : 3.2) * LAMPENZUSTAND.flacker;
}

/* ======================= 7  Die Figur ======================= */

const AUGEN = 1.58, KOPF = 1.68, RADIUS = 0.29, STUFE = 0.46;
const SCHWIMM_TIEFE = 1.35;        // ab hier trägt das Wasser — und ab hier bist du erreichbar
const SCHWIMM_UNTER = 0.55;        // so tief hängt der Körper beim Schwimmen

const P = {
  x: 3.4, z: 11.0, y: 1.8,         // y = Fußhöhe (an Land) bzw. Augenhöhe beim Tauchen
  vy: 0,
  gier: -Math.PI/2, nick: 0,
  modus: 'gehen',
  taucht: false, tauchY: 0,
  luft: GR.luft, kraft: 1,
  bob: 0, schrittWeg: 0,
  laerm: 0,
  halt: { x:3.4, z:11.0, y:1.8 },  // letzter trockener Stand
  tot: 0, tode: 0,
};

function wandTrifft(x, z, fuss, kopf){
  if(bodenBei(x,z) === AUSSEN) return true;
  for(const w of WAENDE){
    if(kopf <= w.y0 || fuss >= w.y1) continue;
    const dx = x-w.cx, dz = z-w.cz;
    const laengs = dx*w.co + dz*w.si, quer = -dx*w.si + dz*w.co;
    if(Math.abs(laengs) < w.hw+RADIUS && Math.abs(quer) < w.hd+RADIUS) return true;
  }
  return false;
}
/* Der ganze Rest des Hauses steckt in dieser einen Frage: darf die Figur
   an diese Stelle? Gehen scheitert an einer zu hohen Stufe, Schwimmen an
   einem Boden über der Oberfläche, Tauchen am Sturz über dem Kopf. */
function darfHin(x, z, modus, fussJetzt){
  const b = bodenBei(x,z);
  if(b === AUSSEN) return false;
  const w = pegelBei(x,z);
  let fuss, kopf;
  if(modus === 'tauchen'){ fuss = P.tauchY - 0.5; kopf = P.tauchY + 0.22; }
  else if(modus === 'schwimmen'){
    if(b > w + 0.32) return false;
    fuss = w - SCHWIMM_UNTER; kopf = w + 0.25;
  } else {
    if(b - fussJetzt > STUFE) return false;
    fuss = Math.max(b, fussJetzt) - 0.02; kopf = Math.max(b, fussJetzt) + KOPF;
  }
  /* Ohne diese Zeile konnte man im Fels über dem Fluttunnel schwimmen:
     dort steht zwar Wasser, aber die Decke liegt bei -1.60. */
  if(kopf > deckeBei(x,z) - 0.05) return false;
  return !wandTrifft(x, z, fuss, kopf);
}
function schiebe(dx, dz, modus){
  const f = P.y;
  if(darfHin(P.x+dx, P.z+dz, modus, f)){ P.x += dx; P.z += dz; return; }
  if(darfHin(P.x+dx, P.z, modus, f)) P.x += dx;
  if(darfHin(P.x, P.z+dz, modus, f)) P.z += dz;
}

/* ---------- Was die Figur gerade tut ---------- */
const TEMPO = { gehen:2.45, rennen:4.35, schwimmen:1.62, tauchen:1.98 };
const _v3 = new T.Vector3(), _v3b = new T.Vector3();

function tiefeHier(){ return pegelBei(P.x,P.z) - bodenBei(P.x,P.z); }
function fussHoehe(){
  if(P.modus === 'schwimmen') return pegelBei(P.x,P.z) - SCHWIMM_UNTER;
  if(P.modus === 'tauchen')   return P.tauchY - 0.5;
  return P.y;
}
function augenHoehe(){
  if(P.modus === 'tauchen')   return P.tauchY;
  if(P.modus === 'schwimmen') return pegelBei(P.x,P.z) + 0.05;
  return P.y + AUGEN;
}
function kopfNass(){ return augenHoehe() < pegelBei(P.x,P.z) - 0.02; }

function spielerSchritt(dt){
  P.gier += IN.dyaw; IN.dyaw = 0;
  P.nick = clamp(P.nick + IN.dpitch, -1.35, 1.35); IN.dpitch = 0;

  let vor = -IN.mz, quer = IN.mx;
  if(KEY.KeyW || KEY.ArrowUp)    vor += 1;
  if(KEY.KeyS || KEY.ArrowDown)  vor -= 1;
  if(KEY.KeyD || KEY.ArrowRight) quer += 1;
  if(KEY.KeyA || KEY.ArrowLeft)  quer -= 1;
  const l = Math.hypot(vor, quer);
  if(l > 1){ vor /= l; quer /= l; }
  const gas = Math.min(1, l);

  const b = bodenBei(P.x, P.z), w = pegelBei(P.x, P.z);
  const tiefe = w - b;
  P.taucht = IN.tauch || !!KEY.Space;

  /* --- Zustandswechsel --- */
  if(P.modus === 'gehen' && tiefe >= SCHWIMM_TIEFE && P.y <= w - SCHWIMM_TIEFE + 0.05){
    P.modus = 'schwimmen'; P.vy = 0; platsch(1.0);
  }
  if(P.modus === 'schwimmen'){
    if(tiefe < SCHWIMM_TIEFE){ P.modus = 'gehen'; P.y = b; P.vy = 0; }
    else if(P.taucht && tiefe > 1.75){ P.modus = 'tauchen'; P.tauchY = w - 0.3; }
  }
  if(P.modus === 'tauchen' && !P.taucht && P.tauchY > w - 0.30 && deckeBei(P.x,P.z) > w + 0.2){
    P.modus = 'schwimmen'; luftHolen();
  }

  /* --- Bewegung --- */
  const sin = Math.sin(P.gier), cos = Math.cos(P.gier);
  if(P.modus === 'tauchen'){
    const cn = Math.cos(P.nick), sn = Math.sin(P.nick);
    _v3.set(-sin*cn, sn, -cos*cn).multiplyScalar(vor);
    _v3b.set(cos, 0, -sin).multiplyScalar(quer);
    _v3.add(_v3b);
    const tempo = TEMPO.tauchen;
    schiebe(_v3.x*tempo*dt, _v3.z*tempo*dt, 'tauchen');
    const auftrieb = P.taucht ? -0.62 : 1.05;
    let ny = P.tauchY + (_v3.y*tempo + auftrieb) * dt;
    const nb = bodenBei(P.x,P.z), nd = deckeBei(P.x,P.z), nw = pegelBei(P.x,P.z);
    ny = clamp(ny, nb + 0.52, Math.min(nd - 0.26, nw + 0.02));
    P.tauchY = ny;
    P.y = nb;
    P.laerm = gas > 0.1 ? 7 : 3;
  } else if(P.modus === 'schwimmen'){
    _v3.set(-sin, 0, -cos).multiplyScalar(vor);
    _v3b.set(cos, 0, -sin).multiplyScalar(quer);
    _v3.add(_v3b);
    const tempo = TEMPO.schwimmen;
    schiebe(_v3.x*tempo*dt, _v3.z*tempo*dt, 'schwimmen');
    P.y = bodenBei(P.x,P.z);
    P.laerm = gas > 0.1 ? 20 : 7;
    P.schrittWeg += gas * tempo * dt;
    if(P.schrittWeg > 1.5){ P.schrittWeg = 0; zug(); rippeln(P.x, P.z); }
  } else {
    const nass = clamp((tiefe - 0.35) / (SCHWIMM_TIEFE - 0.35), 0, 1);
    const darfRennen = IN.run && nass < 0.55 && P.kraft > 0.05;
    let tempo = (darfRennen ? TEMPO.rennen : TEMPO.gehen) * lerp(1, 0.40, nass);
    P.kraft = clamp(P.kraft + (darfRennen && gas>0.1 ? -0.23 : 0.16)*dt, 0, 1);
    _v3.set(-sin, 0, -cos).multiplyScalar(vor);
    _v3b.set(cos, 0, -sin).multiplyScalar(quer);
    _v3.add(_v3b);
    schiebe(_v3.x*tempo*dt, _v3.z*tempo*dt, 'gehen');
    const nb = bodenBei(P.x,P.z);
    if(nb > P.y) P.y = Math.min(nb, P.y + Math.max(0.2, STUFE) );
    if(P.y > nb + 0.02){
      P.vy -= 11.0*dt; P.y += P.vy*dt;
      if(P.y <= nb){ P.y = nb; if(P.vy < -3.5) rumms(-P.vy); P.vy = 0; }
    } else { P.y = nb; P.vy = 0; }
    P.laerm = gas < 0.1 ? 2 : (darfRennen ? 24 : 9) * lerp(1, 1.7, nass);
    P.schrittWeg += gas * tempo * dt;
    const schrittLaenge = darfRennen ? 1.15 : 0.85;
    if(P.schrittWeg > schrittLaenge){
      P.schrittWeg = 0;
      schrittTon(nass);
      if(nass > 0.05) rippeln(P.x, P.z);
    }
    P.bob = P.bob*0.85 + gas*(darfRennen?0.055:0.032)*0.15;
  }

  /* --- Luft --- */
  if(kopfNass()){
    P.luft -= dt;
    if(P.luft <= 0){ P.luft = 0; ertrinken(); }
  } else if(P.luft < GR.luft){
    P.luft = Math.min(GR.luft, P.luft + dt*4.2);
  }

  /* --- Sicherer Halt: wo man trocken steht, spult das Band hin zurück --- */
  if(P.modus === 'gehen' && tiefe < 0.5 && MON.abstand > 7.5){
    P.halt.x = P.x; P.halt.z = P.z; P.halt.y = P.y;
  }

  /* --- Kamera: sie liegt in einer Hand, nicht auf einem Stativ --- */
  /* Drei Sinus mit unrunden Frequenzen überlagern sich nie sichtbar zu
     einem Muster — das liest sich als Hand, nicht als Maschine. */
  const t = ZEIT.t;
  const stark = P.modus === 'schwimmen' ? 1.45
              : P.modus === 'tauchen'   ? 1.15
              : (0.55 + gas * (IN.run ? 1.85 : 1.0));
  const wGier = (Math.sin(t*1.31) * 0.42 + Math.sin(t*0.57 + 1.7) * 0.30
               + Math.sin(t*2.63 + 0.4) * 0.16) * 0.0125 * stark;
  const wNick = (Math.sin(t*1.07 + 2.1) * 0.40 + Math.sin(t*2.21 + 0.9) * 0.22
               + Math.sin(t*0.43) * 0.34) * 0.0105 * stark;
  const wRoll = (Math.sin(t*0.83 + 1.2) * 0.55 + Math.sin(t*1.77 + 2.6) * 0.25)
               * 0.016 * stark;
  const schritt = P.modus === 'gehen'
    ? Math.sin(P.schrittWeg * 6.4) * 0.012 * gas * (IN.run ? 1.8 : 1)
    : 0;
  const ay = augenHoehe();
  camera.position.set(
    P.x + Math.sin(t*0.61)*0.012*stark,
    ay + Math.sin(ZEIT.t*7.4)*P.bob + schritt
       + Math.sin(t*0.94 + 0.3)*0.014*stark
       + (P.modus==='schwimmen' ? Math.sin(t*1.6)*0.045 : 0),
    P.z + Math.sin(t*0.73 + 2.2)*0.012*stark);
  camera.rotation.set(P.nick + wNick, P.gier + wGier, wRoll, 'YXZ');
}

/* ======================= 8  Was im Wasser wohnt ======================= */
/* Es hat kein Gesicht und keinen Namen. Es hört, es schwimmt schneller als
   du, und es kommt nirgends hin, wo du stehen kannst. */
const NG = 0.5;
const NX = Math.ceil(KB/NG), NZ = Math.ceil(KT/NG);
const navFrei = new Uint8Array(NX*NZ);
const navDist = new Int32Array(NX*NZ);
const navSchlange = new Int32Array(NX*NZ);
const nxy = (i,j) => j*NX + i;
const navX = i => KARTE.x0 + (i+0.5)*NG;
const navZ = j => KARTE.z0 + (j+0.5)*NG;
let navFuer = -99;

function navBau(){
  const w = WASSER.h;
  const u = w - 0.62, o = w + 0.18;
  for(let j=0;j<NZ;j++) for(let i=0;i<NX;i++){
    const x = navX(i), z = navZ(j);
    const b = bodenBei(x,z);
    let frei = 0;
    if(b !== AUSSEN){
      const pw = pegelBei(x,z);
      if(pw - b >= SCHWIMM_TIEFE && deckeBei(x,z) > pw + 0.25){
        frei = 1;
        for(const wd of WAENDE){
          if(o <= wd.y0 || u >= wd.y1) continue;
          const dx = x-wd.cx, dz = z-wd.cz;
          const la = dx*wd.co + dz*wd.si, qu = -dx*wd.si + dz*wd.co;
          if(Math.abs(la) < wd.hw+0.34 && Math.abs(qu) < wd.hd+0.34){ frei = 0; break; }
        }
      }
    }
    navFrei[nxy(i,j)] = frei;
  }
  navFuer = w;
}
function navBfs(sx, sz){
  navDist.fill(-1);
  let si = clamp(Math.round((sx-KARTE.x0)/NG - 0.5), 0, NX-1);
  let sj = clamp(Math.round((sz-KARTE.z0)/NG - 0.5), 0, NZ-1);
  if(!navFrei[nxy(si,sj)]){
    // nächstes offenes Feld in wachsenden Ringen suchen
    let gefunden = false;
    for(let r=1; r<=14 && !gefunden; r++){
      for(let dj=-r; dj<=r && !gefunden; dj++) for(let di=-r; di<=r; di++){
        if(Math.max(Math.abs(di),Math.abs(dj)) !== r) continue;
        const i = si+di, j = sj+dj;
        if(i<0||j<0||i>=NX||j>=NZ) continue;
        if(navFrei[nxy(i,j)]){ si = i; sj = j; gefunden = true; break; }
      }
    }
    if(!gefunden) return false;
  }
  let kopf = 0, ende = 0;
  const s = nxy(si,sj);
  navDist[s] = 0; navSchlange[ende++] = s;
  while(kopf < ende){
    const c = navSchlange[kopf++];
    const i = c % NX, j = (c/NX)|0, d = navDist[c];
    for(let k=0;k<4;k++){
      const ni = i + (k===0?1:k===1?-1:0), nj = j + (k===2?1:k===3?-1:0);
      if(ni<0||nj<0||ni>=NX||nj>=NZ) continue;
      const n = nxy(ni,nj);
      if(navDist[n] >= 0 || !navFrei[n]) continue;
      navDist[n] = d+1; navSchlange[ende++] = n;
    }
  }
  return true;
}

/* Es hat keinen Namen. Es ist blass wie die Kacheln, viel zu lang, und
   es hat kein Gesicht. Meistens treibt es mit dem Gesicht nach unten an
   der Oberfläche und rührt sich nicht. Wenn es dich gehört hat, richtet
   es sich langsam auf — erst der Hinterkopf, dann die Schultern — und
   dann geht es unter. Stehen kann es überall, wo du auch stehen könntest;
   holen kann es dich nur, solange du schwimmst. Wenn du dich rettest,
   kommt es bis an den Rand deines trockenen Flecks und bleibt dort
   stehen und sieht dich an. */
const MON = {
  x: 12.0, z: 11.0, y: 0.9, gier: 0,
  wach: false, jagt: 0, weissX: 12, weissZ: 11, weissT: -99,
  abstand: 99, rippelT: 0, tempo: 0,
  lage: 0,            // 0 = treibt auf dem Bauch, 1 = aufgerichtet
  zustand: 'treibt',  // treibt | richtet | jagt | steht
  wartet: 0, atemT: 0, treibDrift: Math.random()*6.3,
};
{
  const haut = new T.MeshStandardMaterial({ color:0xcdd2cb, roughness:0.34, metalness:0.02 });
  const dunkel = new T.MeshStandardMaterial({ color:0x1a1f21, roughness:0.9 });
  const g = new T.Group();
  const koerper = new T.Group(); g.add(koerper);
  const rumpf = new T.Mesh(new T.CapsuleGeometry(0.155, 0.66, 4, 10), haut);
  rumpf.position.y = 0.86; koerper.add(rumpf);
  const becken = new T.Mesh(new T.CapsuleGeometry(0.135, 0.14, 3, 8), haut);
  becken.position.y = 0.50; koerper.add(becken);
  const hals = new T.Mesh(new T.CapsuleGeometry(0.052, 0.14, 3, 6), haut);
  hals.position.y = 1.29; koerper.add(hals);
  const kopf = new T.Mesh(new T.SphereGeometry(0.125, 12, 10), haut);
  kopf.scale.set(0.86, 1.12, 0.94); kopf.position.y = 1.45; koerper.add(kopf);
  /* Kein Gesicht, nur zwei Höhlen — das reicht vollkommen. */
  for(const sx of [-0.048, 0.048]){
    const hoehle = new T.Mesh(new T.SphereGeometry(0.032, 8, 6), dunkel);
    hoehle.position.set(sx, 1.47, 0.098); koerper.add(hoehle);
  }
  const arme = [], beine = [];
  for(const sx of [-1, 1]){
    const schulter = new T.Group();
    schulter.position.set(sx*0.17, 1.19, 0); koerper.add(schulter);
    const oben = new T.Mesh(new T.CapsuleGeometry(0.048, 0.42, 3, 7), haut);
    oben.position.y = -0.27; schulter.add(oben);
    const ellbogen = new T.Group(); ellbogen.position.y = -0.50; schulter.add(ellbogen);
    const unten = new T.Mesh(new T.CapsuleGeometry(0.042, 0.46, 3, 7), haut);
    unten.position.y = -0.28; ellbogen.add(unten);
    const hand = new T.Mesh(new T.CapsuleGeometry(0.04, 0.14, 3, 6), haut);
    hand.position.y = -0.56; hand.scale.set(1, 1, 0.55); ellbogen.add(hand);
    arme.push({ schulter, ellbogen, sx });

    const huefte = new T.Group();
    huefte.position.set(sx*0.085, 0.44, 0); koerper.add(huefte);
    const ob = new T.Mesh(new T.CapsuleGeometry(0.062, 0.36, 3, 7), haut);
    ob.position.y = -0.24; huefte.add(ob);
    const knie = new T.Group(); knie.position.y = -0.46; huefte.add(knie);
    const ub = new T.Mesh(new T.CapsuleGeometry(0.052, 0.40, 3, 7), haut);
    ub.position.y = -0.25; knie.add(ub);
    beine.push({ huefte, knie, sx });
  }
  MON.gruppe = g; MON.koerper = koerper; MON.arme = arme; MON.beine = beine;
  MON.kopf = kopf; MON.hoehe = 1.58;
  g.visible = false;
  scene.add(g);
}

/* Eine zweite Gestalt, die es gar nicht gibt: sie steht weit weg am Ende
   einer Halle und ist beim nächsten Hinsehen weg. Sie tut nichts. */
const SPUK = { t: 26 + Math.random()*22, sicht: 0, gruppe: null };
{
  const g = MON.gruppe.clone(true);
  g.traverse(o => { if(o.isMesh) o.material = new T.MeshStandardMaterial({
    color:0xc6ccc5, roughness:0.5, transparent:true, opacity:0.9 }); });
  g.visible = false;
  SPUK.gruppe = g;
  scene.add(g);
}
function spukTick(dt){
  SPUK.t -= dt;
  if(SPUK.sicht > 0){
    SPUK.sicht -= dt;
    /* Sie verschwindet, sobald man wegsieht — oder nach ein paar Sekunden. */
    const dx = SPUK.gruppe.position.x - P.x, dz = SPUK.gruppe.position.z - P.z;
    const d = Math.hypot(dx,dz);
    blickRichtung(_blick);
    const drauf = (dx*_blick.x + dz*_blick.z) / Math.max(d, 0.01);
    if(SPUK.sicht <= 0 || drauf < 0.35){ SPUK.gruppe.visible = false; SPUK.sicht = 0; }
    return;
  }
  if(SPUK.t > 0 || S.phase !== 'spiel') return;
  SPUK.t = 34 + Math.random()*30;
  /* Ein Platz im Blickfeld, weit genug weg, mit Boden knapp unter Wasser */
  blickRichtung(_blick);
  for(let v=0; v<24; v++){
    const w = P.gier + (Math.random()-0.5)*1.1;
    const d = 9 + Math.random()*11;
    const x = P.x - Math.sin(w)*d, z = P.z - Math.cos(w)*d;
    const b = bodenBei(x,z);
    if(b === AUSSEN) continue;
    const tief = WASSER.h - b;
    if(tief < 0.1 || tief > 1.3) continue;
    if(!losFrei(P.x, P.z, x, z)) continue;
    SPUK.gruppe.position.set(x, b, z);
    SPUK.gruppe.rotation.set(0, Math.atan2(P.x-x, P.z-z), 0);
    SPUK.gruppe.visible = true;
    SPUK.sicht = 4.5;
    return;
  }
}
/* Sichtlinie über das Wandraster — grob, aber es reicht, um die Gestalt
   nicht in einer Wand aufzustellen. */
function losFrei(ax, az, bx, bz){
  const n = Math.ceil(Math.hypot(bx-ax, bz-az) / 0.4);
  for(let i=1;i<n;i++){
    const t = i/n, x = ax+(bx-ax)*t, z = az+(bz-az)*t;
    if(bodenBei(x,z) === AUSSEN) return false;
    if(wandTrifft(x, z, WASSER.h + 0.2, WASSER.h + 1.5)) return false;
  }
  return true;
}

/* Haltung: treibend flach auf dem Bauch, aufgerichtet senkrecht. */
function monHaltung(dt){
  const t = ZEIT.t;
  const k = MON.koerper;
  const treibt = MON.zustand === 'treibt';
  const ziel = MON.zustand === 'treibt' ? 0 : (MON.zustand === 'jagt' ? 0.05 : 1);
  MON.lage = lerp(MON.lage, ziel, 1 - Math.exp(-dt * (MON.zustand==='richtet' ? 1.1 : 2.4)));
  /* 0 = waagerecht mit dem Gesicht nach unten, 1 = aufrecht */
  k.rotation.x = lerp(Math.PI/2, 0, MON.lage);
  /* Aufgerichtet steht sie auf den Füßen, treibend liegt sie flach. */
  k.position.y = lerp(-0.16, 0.52, MON.lage);
  const schwung = MON.zustand === 'jagt' ? 1 : 0.12;
  for(const a of MON.arme){
    if(treibt){
      a.schulter.rotation.z = a.sx * (1.15 + Math.sin(t*0.6 + a.sx)*0.05);
      a.schulter.rotation.x = 0.18;
      a.ellbogen.rotation.x = 0.35;
    } else if(MON.zustand === 'jagt'){
      a.schulter.rotation.z = a.sx * 0.55;
      a.schulter.rotation.x = Math.sin(t*3.1 + (a.sx>0?0:Math.PI)) * 1.25 - 0.4;
      a.ellbogen.rotation.x = 0.5 + Math.sin(t*3.1 + a.sx)*0.3;
    } else {
      a.schulter.rotation.z = lerp(a.schulter.rotation.z, a.sx*0.06, dt*3);
      a.schulter.rotation.x = lerp(a.schulter.rotation.x, 0.02, dt*3);
      a.ellbogen.rotation.x = lerp(a.ellbogen.rotation.x, 0.04, dt*3);
    }
  }
  for(const b of MON.beine){
    if(MON.zustand === 'jagt'){
      b.huefte.rotation.x = Math.sin(t*2.6 + (b.sx>0?0:Math.PI)) * 0.5;
      b.knie.rotation.x = 0.3 + Math.sin(t*2.6 + b.sx)*0.25;
    } else {
      b.huefte.rotation.x = lerp(b.huefte.rotation.x, treibt ? 0.12 : 0.0, dt*3);
      b.knie.rotation.x = lerp(b.knie.rotation.x, treibt ? 0.2 : 0.02, dt*3);
    }
  }
}

function monSchritt(dt){
  if(Math.abs(navFuer - WASSER.h) > 0.08) navBau();
  const px = P.x, pz = P.z;
  MON.abstand = Math.hypot(MON.x-px, MON.z-pz);

  /* Hören: der Lärm der Figur reicht so weit, wie sie ihn macht */
  if(P.laerm > MON.abstand * (1/GR.wittert)){
    MON.weissX = px; MON.weissZ = pz; MON.weissT = ZEIT.t;
    MON.jagt = Math.max(MON.jagt, 7.0);
    if(!MON.wach){ MON.wach = true; }
  }
  MON.jagt = Math.max(0, MON.jagt - dt);

  const ziel = MON.jagt > 0 ? { x:MON.weissX, z:MON.weissZ } : { x:MON.weissX, z:MON.weissZ };
  if(!navBfs(ziel.x, ziel.z)){ MON.gruppe.visible = false; return; }

  const i = clamp(Math.round((MON.x-KARTE.x0)/NG - 0.5), 0, NX-1);
  const j = clamp(Math.round((MON.z-KARTE.z0)/NG - 0.5), 0, NZ-1);
  let best = -1, bx = MON.x, bz = MON.z;
  const hier = navDist[nxy(i,j)];
  if(hier < 0){
    // aus dem Trockenen zurück ins Wasser fallen lassen
    for(let r=1;r<=10 && best<0;r++)
      for(let dj=-r; dj<=r; dj++) for(let di=-r; di<=r; di++){
        const ni=i+di, nj=j+dj;
        if(ni<0||nj<0||ni>=NX||nj>=NZ) continue;
        if(navDist[nxy(ni,nj)] >= 0){ best = navDist[nxy(ni,nj)]; bx = navX(ni); bz = navZ(nj); r = 99; break; }
      }
  } else {
    best = hier;
    for(let k=0;k<8;k++){
      const ni = i + [1,-1,0,0,1,1,-1,-1][k], nj = j + [0,0,1,-1,1,-1,1,-1][k];
      if(ni<0||nj<0||ni>=NX||nj>=NZ) continue;
      const d = navDist[nxy(ni,nj)];
      if(d >= 0 && d < best){ best = d; bx = navX(ni); bz = navZ(nj); }
    }
  }
  /* --- Zustände --- */
  const imWasser = P.modus === 'schwimmen' || P.modus === 'tauchen';
  const amZiel = best <= 1;
  if(MON.jagt <= 0){
    MON.zustand = 'treibt';
  } else if(MON.zustand === 'treibt'){
    MON.zustand = 'richtet'; MON.wartet = 2.2;
    auftauchTon();
  } else if(MON.zustand === 'richtet'){
    MON.wartet -= dt;
    if(MON.wartet <= 0) MON.zustand = 'jagt';
  } else if(!imWasser && amZiel && MON.abstand < 12){
    /* Du stehst. Dann steht es auch — am Rand, und sieht dich an. */
    MON.zustand = 'steht';
  } else if(MON.zustand === 'steht' && (imWasser || !amZiel)){
    MON.zustand = 'jagt';
  }

  const dx = bx - MON.x, dz = bz - MON.z, dl = Math.hypot(dx,dz);
  let eile = 0;
  if(MON.zustand === 'jagt') eile = GR.jagd;
  else if(MON.zustand === 'treibt') eile = 0.22;      // es treibt nur
  MON.tempo = lerp(MON.tempo, dl > 0.05 ? eile : 0, 1 - Math.exp(-dt*3));
  if(dl > 0.001 && MON.tempo > 0.001){
    MON.x += dx/dl * MON.tempo * dt;
    MON.z += dz/dl * MON.tempo * dt;
  }
  /* Im Treiben dreht es sich mit der Strömung, sonst sieht es dich an. */
  const zielGier = MON.zustand === 'treibt'
    ? MON.treibDrift + Math.sin(ZEIT.t*0.13)*0.5
    : Math.atan2(P.x - MON.x, P.z - MON.z);
  MON.gier = lerp(MON.gier, zielGier, 1 - Math.exp(-dt*(MON.zustand==='jagt'?4:1.2)));

  /* Höhe: treibend liegt es in der Oberfläche, jagend knapp darunter,
     stehend steht es auf dem Grund, wenn der nah genug ist. */
  const grund = bodenBei(MON.x, MON.z);
  let y;
  if(MON.zustand === 'steht'){
    /* Steht auf dem Grund, wo er trägt — sonst tritt sie Wasser, Kopf und
       Schultern über der Oberfläche. */
    y = (grund !== AUSSEN && WASSER.h - grund < 1.9) ? grund : WASSER.h - 1.78;
  } else if(MON.zustand === 'jagt'){
    /* Waagerecht knapp unter der Oberfläche: nur Rücken und Hinterkopf
       schneiden durch. */
    y = WASSER.h - (MON.abstand < 9 ? 0.10 : 0.30);
  } else if(MON.zustand === 'richtet'){
    y = lerp(WASSER.h - 0.12, WASSER.h - 1.78, MON.lage);
  } else {
    y = WASSER.h - 0.12 + Math.sin(ZEIT.t*0.7)*0.03;
  }
  MON.y = y;
  MON.gruppe.position.set(MON.x, MON.y, MON.z);
  MON.gruppe.rotation.y = MON.gier;
  MON.gruppe.visible = MON.wach;
  monHaltung(dt);

  MON.rippelT -= dt;
  if(MON.rippelT <= 0 && (MON.tempo > 0.4 || MON.zustand === 'richtet')){
    MON.rippelT = MON.zustand === 'jagt' ? 0.24 : 0.6;
    rippeln(MON.x, MON.z);
  }
  /* Atem, wenn es nah ist und du im Wasser bist */
  MON.atemT -= dt;
  if(MON.atemT <= 0 && MON.zustand === 'jagt' && MON.abstand < 11){
    MON.atemT = 2.4;
    atemTon(clamp((11-MON.abstand)/11, 0, 1));
  }
  /* Zugriff — nur wer schwimmt, ist erreichbar */
  if(imWasser && MON.abstand < 1.25 && S.phase === 'spiel') gefressen();
  spukTick(dt);
}

/* ======================= 9  Ton ======================= */
const SND = { an:true, ctx:null };
function tonStart(){
  if(SND.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return;
  const ac = new AC(); SND.ctx = ac;
  SND.master = ac.createGain(); SND.master.gain.value = SND.an ? 0.9 : 0;
  SND.dumpf = ac.createBiquadFilter();          // unter Wasser klingt alles wie durch Watte
  SND.dumpf.type = 'lowpass'; SND.dumpf.frequency.value = 20000; SND.dumpf.Q.value = 0.4;
  SND.master.connect(SND.dumpf); SND.dumpf.connect(ac.destination);

  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i] = Math.random()*2-1;
  SND.rausch = buf;

  // Grundton: tiefes Brummen der leeren Halle
  const o = ac.createOscillator(); o.type='sine'; o.frequency.value = 47;
  SND.brummG = ac.createGain(); SND.brummG.gain.value = 0.045;
  o.connect(SND.brummG); SND.brummG.connect(SND.master); o.start();

  // Wasser, das gegen die Kacheln schwappt
  const q = ac.createBufferSource(); q.buffer = buf; q.loop = true;
  const bp = ac.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value = 640; bp.Q.value = 0.7;
  SND.plaetscher = ac.createGain(); SND.plaetscher.gain.value = 0.03;
  q.connect(bp); bp.connect(SND.plaetscher); SND.plaetscher.connect(SND.master); q.start();
  const lfo = ac.createOscillator(); lfo.type='sine'; lfo.frequency.value = 0.16;
  const lg = ac.createGain(); lg.gain.value = 0.018;
  lfo.connect(lg); lg.connect(SND.plaetscher.gain); lfo.start();

  // Die Nähe von etwas Großem
  const n = ac.createOscillator(); n.type='sawtooth'; n.frequency.value = 33;
  const nf = ac.createBiquadFilter(); nf.type='lowpass'; nf.frequency.value = 130;
  SND.naehe = ac.createGain(); SND.naehe.gain.value = 0;
  n.connect(nf); nf.connect(SND.naehe); SND.naehe.connect(SND.master); n.start();

  // Steigendes Wasser
  const r = ac.createBufferSource(); r.buffer = buf; r.loop = true;
  const rf = ac.createBiquadFilter(); rf.type='lowpass'; rf.frequency.value = 380;
  SND.flut = ac.createGain(); SND.flut.gain.value = 0;
  r.connect(rf); rf.connect(SND.flut); SND.flut.connect(SND.master); r.start();
}
function knall(dauer, cut, vol, typ){
  const ac = SND.ctx; if(!ac || !SND.an) return;
  const s = ac.createBufferSource(); s.buffer = SND.rausch;
  s.playbackRate.value = 0.7 + Math.random()*0.6;
  const f = ac.createBiquadFilter(); f.type = typ || 'lowpass'; f.frequency.value = cut;
  const g = ac.createGain(); g.gain.value = vol;
  g.gain.setTargetAtTime(0.0001, ac.currentTime + dauer*0.25, dauer*0.35);
  s.connect(f); f.connect(g); g.connect(SND.master);
  s.start(); s.stop(ac.currentTime + dauer + 0.1);
}
function piep(hz, dauer, vol, typ){
  const ac = SND.ctx; if(!ac || !SND.an) return;
  const o = ac.createOscillator(); o.type = typ || 'sine'; o.frequency.value = hz;
  const g = ac.createGain(); g.gain.value = 0;
  g.gain.setTargetAtTime(vol, ac.currentTime, 0.008);
  g.gain.setTargetAtTime(0, ac.currentTime + dauer*0.5, dauer*0.4);
  o.connect(g); g.connect(SND.master);
  o.start(); o.stop(ac.currentTime + dauer + 0.2);
}
const schrittTon = nass => nass > 0.05 ? knall(0.22, 900+Math.random()*400, 0.16+nass*0.16)
                                    : knall(0.09, 480, 0.10);
const zug     = () => knall(0.32, 720, 0.15);
const platsch = v => { knall(0.55, 1500, 0.30*v); knall(0.9, 380, 0.20*v); };
const rumms   = v => knall(0.4, 240, Math.min(0.32, v*0.05));
const luftHolen = () => { knall(0.5, 1200, 0.22); piep(220, 0.18, 0.05, 'triangle'); };
function radTon(){
  const ac = SND.ctx; if(!ac || !SND.an) return;
  for(let i=0;i<7;i++) setTimeout(() => knall(0.1, 1700, 0.14, 'bandpass'), i*180);
  knall(1.4, 200, 0.16);
}
function flutTon(){
  if(!SND.ctx || !SND.an) return;
  SND.flut.gain.setTargetAtTime(0.30, SND.ctx.currentTime, 0.5);
}
/* Kein Tiergebrüll. Ein Mensch, der nach Luft schnappt. */
function auftauchTon(){
  const ac = SND.ctx; if(!ac || !SND.an) return;
  knall(0.55, 2600, 0.16, 'bandpass');
  const o = ac.createOscillator(); o.type='sawtooth';
  o.frequency.setValueAtTime(150, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(420, ac.currentTime+0.5);
  const f = ac.createBiquadFilter(); f.type='bandpass'; f.frequency.value=900; f.Q.value=1.4;
  const g = ac.createGain(); g.gain.value = 0;
  g.gain.setTargetAtTime(0.11, ac.currentTime+0.05, 0.09);
  g.gain.setTargetAtTime(0, ac.currentTime+0.45, 0.2);
  o.connect(f); f.connect(g); g.connect(SND.master);
  o.start(); o.stop(ac.currentTime+1.1);
}
function atemTon(nah){
  const ac = SND.ctx; if(!ac || !SND.an) return;
  knall(0.42, 700 + nah*500, 0.05 + nah*0.10, 'bandpass');
  setTimeout(() => knall(0.5, 420, 0.04 + nah*0.08, 'bandpass'), 420);
}
function schreckTon(){
  const ac = SND.ctx; if(!ac || !SND.an) return;
  knall(0.07, 9000, 0.5, 'highpass'); knall(1.2, 600, 0.36);
  const o = ac.createOscillator(); o.type='sawtooth';
  o.frequency.setValueAtTime(950, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(70, ac.currentTime+0.9);
  const g = ac.createGain(); g.gain.value = 0;
  g.gain.setTargetAtTime(0.34, ac.currentTime, 0.005);
  g.gain.setTargetAtTime(0, ac.currentTime+0.5, 0.25);
  o.connect(g); g.connect(SND.master); o.start(); o.stop(ac.currentTime+1.6);
}
let herzT = 0;
function herz(dt){
  if(!SND.ctx || !SND.an) return;
  const k = 1 - P.luft/GR.luft;
  if(k < 0.62) return;
  herzT -= dt;
  if(herzT <= 0){
    herzT = lerp(1.05, 0.52, (k-0.62)/0.38);
    piep(58, 0.10, 0.16, 'sine');
    setTimeout(() => piep(48, 0.09, 0.12, 'sine'), 150);
  }
}
function tonSchalten(an){
  SND.an = an;
  if(SND.ctx) SND.master.gain.setTargetAtTime(an ? 0.9 : 0, SND.ctx.currentTime, 0.05);
  $('bTon').textContent = 'TON: ' + (an ? 'AN' : 'AUS');
}

/* ======================= 10  Schieber, Luke, Pegel ======================= */
const AUFTRAG = { offen: 0 };
const SIMS_H = 4.3;

function offenZahl(){ return SCHIEBER.filter(s => s.offen).length; }
function wasserZiel(){ return 1.6 + 1.1 * offenZahl(); }

function blickRichtung(out){
  const cn = Math.cos(P.nick);
  return out.set(-Math.sin(P.gier)*cn, Math.sin(P.nick), -Math.cos(P.gier)*cn);
}
const _blick = new T.Vector3(), _zuZiel = new T.Vector3();
function zielObjekt(){
  const ax = P.x, ay = augenHoehe(), az = P.z;
  blickRichtung(_blick);
  let besteAbw = 0.45, treffer = null;
  for(const s of SCHIEBER){
    if(s.offen || s.dreht) continue;
    _zuZiel.set(s.pos.x-ax, s.pos.y-ay, s.pos.z-az);
    const d = _zuZiel.length();
    if(d > 2.1) continue;
    const abw = _zuZiel.normalize().dot(_blick);
    if(abw > besteAbw){ besteAbw = abw; treffer = { art:'schieber', s }; }
  }
  _zuZiel.set(LUKE.pos.x-ax, LUKE.pos.y-ay, LUKE.pos.z-az);
  if(_zuZiel.length() < 3.0 && _zuZiel.normalize().dot(_blick) > 0.35)
    treffer = { art:'luke' };
  return treffer;
}
function benutzen(){
  const z = zielObjekt();
  if(!z) return;
  if(z.art === 'schieber'){
    z.s.dreht = 1.5;
    radTon();
    melde('SCHIEBER ' + ['I','II','III'][z.s.nr-1] + ' — DAS RAD GEHT SCHWER', 2.4);
  } else if(z.art === 'luke'){
    if(offenZahl() < 3){
      piep(150, 0.2, 0.09, 'sawtooth');
      melde('VERRIEGELT. DAS WASSER MUSS ERST GANZ HOCH — ' + offenZahl() + '/3 SCHIEBER.', 3.2);
    } else gewonnen();
  }
}
function schieberSchritt(dt){
  for(const s of SCHIEBER){
    if(s.dreht){
      s.dreht = Math.max(0, s.dreht - dt);
      s.rad.rotation.z += dt * 9.0;
      if(s.dreht === 0){
        s.offen = true;
        s.lampe.material = new T.MeshBasicMaterial({ color:0x6fe08a });
        WASSER.ziel = wasserZiel();
        flutTon();
        const n = offenZahl();
        melde(n < 3
          ? 'SCHIEBER ' + ['I','II','III'][s.nr-1] + ' OFFEN · DAS WASSER STEIGT AUF ' + WASSER.ziel.toFixed(2) + ' m'
          : 'ALLE DREI OFFEN · DER PEGEL LÄUFT AUF ' + WASSER.ziel.toFixed(2) + ' m — HOCH ZUM SIMS', 5.0);
        $('schieberZahl').textContent = n + '/3';
      }
    }
    if(s.offen) s.rad.rotation.z += dt * 0.25;
  }
  const alt = WASSER.h;
  if(WASSER.h < WASSER.ziel - 0.001){
    WASSER.h = Math.min(WASSER.ziel, WASSER.h + 0.16*dt);
    WASSER.steigt = 1;
  } else if(WASSER.steigt){
    WASSER.steigt = 0;
    if(SND.ctx) SND.flut.gain.setTargetAtTime(0, SND.ctx.currentTime, 1.2);
  }
  if(WASSER.h !== alt && Math.random() < dt*6) rippeln(P.x + (Math.random()-0.5)*6, P.z + (Math.random()-0.5)*6);
}

/* ======================= 11  Anzeige ======================= */
let meldT = 0;
function melde(txt, sek){
  const el = $('toast');
  el.textContent = txt; el.classList.add('an'); meldT = sek || 2.5;
}
const PEGEL_MAX = 5.6;
function hudBauen(){
  const m = $('markeLuke');
  m.style.bottom = (SIMS_H/PEGEL_MAX*100) + '%';
  const s = $('pegel');
  for(const [h, txt] of [[1.6,'I'],[2.7,'II'],[3.8,'III']]){
    const d = document.createElement('div');
    d.className = 'marke';
    d.style.bottom = (h/PEGEL_MAX*100) + '%';
    d.innerHTML = '<span>' + txt + '</span>';
    s.insertBefore(d, m);
  }
}
function zeit(sek){
  const h = (sek/3600)|0, m = ((sek/60)|0)%60, s = (sek|0)%60;
  const zz = n => (n<10?'0':'')+n;
  return zz(h)+':'+zz(m)+':'+zz(s);
}
let hudAcc = 0;
function hudSchritt(dt){
  hudAcc += dt;
  if(hudAcc < 0.08) return;
  hudAcc = 0;
  $('tc').textContent = zeit(S.t);
  $('pegelText').textContent = WASSER.h.toFixed(2);
  $('fuell').style.height = clamp(WASSER.h/PEGEL_MAX*100, 0, 100) + '%';
  const nass = kopfNass() || P.modus === 'tauchen';
  const lu = $('luft');
  lu.classList.toggle('an', nass || P.luft < GR.luft-0.2);
  lu.classList.toggle('knapp', P.luft < GR.luft*0.34);
  $('luftFuell').style.width = clamp(P.luft/GR.luft*100, 0, 100) + '%';
  const z = zielObjekt();
  const g = $('griff');
  g.classList.toggle('an', !!z && S.phase === 'spiel');
  if(z) g.textContent = z.art === 'luke' ? 'LUKE ÖFFNEN' : 'RAD DREHEN';
  const nah = MON.wach && (P.modus==='schwimmen'||P.modus==='tauchen')
    ? clamp((11 - MON.abstand)/9, 0, 1) : 0;
  $('gefahr').classList.toggle('an', nah > 0.25);
  if(meldT > 0){ meldT -= dt; if(meldT <= 0) $('toast').classList.remove('an'); }
}

/* ======================= 12  Steuerung ======================= */
const IN = { mx:0, mz:0, dyaw:0, dpitch:0, run:false, tauch:false };
const KEY = {};
const elStick = $('stick'), elKnob = $('knob');
const zMove = $('zoneMove'), zLook = $('zoneLook');
const bRun = $('bRun'), bDive = $('bDive'), bUse = $('bUse'), bMenu = $('bMenu');
let moveId = null, moveOx = 0, moveOy = 0, lookId = null, lookLx = 0, lookLy = 0;
const STICK_R = 52;

zMove.addEventListener('pointerdown', e => {
  if(moveId !== null) return;
  moveId = e.pointerId; moveOx = e.clientX; moveOy = e.clientY;
  elStick.style.left = e.clientX+'px'; elStick.style.top = e.clientY+'px';
  elStick.classList.add('on');
  zMove.setPointerCapture(e.pointerId);
  e.preventDefault();
});
zMove.addEventListener('pointermove', e => {
  if(e.pointerId !== moveId) return;
  let dx = e.clientX-moveOx, dy = e.clientY-moveOy;
  const l = Math.hypot(dx,dy);
  if(l > STICK_R){ dx = dx/l*STICK_R; dy = dy/l*STICK_R; }
  elKnob.style.transform = 'translate('+dx+'px,'+dy+'px)';
  IN.mx = dx/STICK_R; IN.mz = dy/STICK_R;
  /* Der Knüppel bewegt nur. Rennen sagt man ausdrücklich mit dem Knopf —
     ein voll durchgedrückter Knüppel darf niemanden losrennen lassen. */
  IN.run = bRun.classList.contains('held');
  e.preventDefault();
});
function endMove(e){
  if(e.pointerId !== moveId) return;
  moveId = null; IN.mx = IN.mz = 0;
  IN.run = bRun.classList.contains('held');
  elKnob.style.transform = 'translate(0,0)';
  elStick.classList.remove('on');
}
zMove.addEventListener('pointerup', endMove);
zMove.addEventListener('pointercancel', endMove);

zLook.addEventListener('pointerdown', e => {
  if(lookId !== null) return;
  lookId = e.pointerId; lookLx = e.clientX; lookLy = e.clientY;
  zLook.setPointerCapture(e.pointerId); e.preventDefault();
});
zLook.addEventListener('pointermove', e => {
  if(e.pointerId !== lookId) return;
  IN.dyaw   -= (e.clientX-lookLx)*0.0042;
  IN.dpitch -= (e.clientY-lookLy)*0.0034;
  lookLx = e.clientX; lookLy = e.clientY; e.preventDefault();
});
function endLook(e){ if(e.pointerId === lookId) lookId = null; }
zLook.addEventListener('pointerup', endLook);
zLook.addEventListener('pointercancel', endLook);

function haltKnopf(el, an, aus){
  el.addEventListener('pointerdown', e => { el.classList.add('held'); an(); e.preventDefault(); });
  ['pointerup','pointercancel','pointerleave'].forEach(t =>
    el.addEventListener(t, () => { if(el.classList.contains('held')){ el.classList.remove('held'); aus(); } }));
}
haltKnopf(bRun,  () => IN.run = true,   () => IN.run = false);
haltKnopf(bDive, () => IN.tauch = true, () => IN.tauch = false);
function tippKnopf(el, fn){
  let zuletzt = 0;
  const los = e => {
    const jetzt = performance.now();
    if(jetzt - zuletzt < 320) return;
    zuletzt = jetzt;
    if(e.cancelable) e.preventDefault();
    e.stopPropagation(); fn();
  };
  el.addEventListener('pointerdown', los);
  el.addEventListener('click', los);
}
tippKnopf(bUse,  () => { if(S.phase === 'spiel') benutzen(); });
tippKnopf(bMenu, () => pause());

function allesLos(){
  for(const k in KEY) KEY[k] = false;
  IN.run = false; IN.tauch = false; IN.mx = IN.mz = 0; IN.dyaw = IN.dpitch = 0;
  bRun.classList.remove('held'); bDive.classList.remove('held');
  moveId = lookId = null;
  elKnob.style.transform = 'translate(0,0)'; elStick.classList.remove('on');
}
addEventListener('blur', allesLos);

addEventListener('keydown', e => {
  KEY[e.code] = true;
  if(e.key.toLowerCase() === 'e' && S.phase === 'spiel') benutzen();
  if(e.key.toLowerCase() === 'm') tonSchalten(!SND.an);
  if(e.code === 'Escape' && S.phase === 'spiel') pause();
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { KEY[e.code] = false; });
addEventListener('keydown', e => { if(e.code === 'ShiftLeft' || e.code === 'ShiftRight') IN.run = true; });
addEventListener('keyup',   e => { if(e.code === 'ShiftLeft' || e.code === 'ShiftRight') IN.run = false; });

canvas.addEventListener('click', () => {
  if(S.phase === 'spiel' && !IS_TOUCH && document.pointerLockElement !== canvas)
    canvas.requestPointerLock && canvas.requestPointerLock();
});
addEventListener('mousemove', e => {
  if(document.pointerLockElement !== canvas) return;
  IN.dyaw   -= e.movementX*0.0022;
  IN.dpitch -= e.movementY*0.0020;
});

/* ======================= 13  Ablauf ======================= */
const S = { phase:'menu', t:0, spulT:0, tode:0, endT:0 };
const scTitle = $('scTitle'), scDiff = $('scDiff'), scBrief = $('scBrief'),
      scPause = $('scPause'), scEnd = $('scEnd');
const MENUES = [scTitle, scDiff, scBrief, scPause, scEnd];
function zeige(el){
  for(const m of MENUES) m.classList.add('hidden');
  if(el) el.classList.remove('hidden');
  $('hud').classList.toggle('an', !el);
  $('steuer').classList.toggle('an', !el && IS_TOUCH);
}
function neuStart(){
  P.x = 3.4; P.z = 11.0; P.y = 1.8; P.vy = 0;
  P.gier = -Math.PI/2; P.nick = -0.04;
  P.modus = 'gehen'; P.luft = GR.luft; P.kraft = 1;
  P.halt = { x:3.4, z:11.0, y:1.8 };
  for(const s of SCHIEBER){
    s.offen = false; s.dreht = 0; s.rad.rotation.z = 0;
    s.lampe.material = new T.MeshBasicMaterial({ color:0xd8452e });
  }
  WASSER.h = WASSER.ziel = 1.6;
  navBau();
  MON.x = 12.0; MON.z = 11.0; MON.wach = true; MON.jagt = 0;
  MON.weissX = 12.0; MON.weissZ = 11.0; MON.abstand = 99;
  S.t = 0; S.tode = 0; S.spulT = 0;
  $('schieberZahl').textContent = '0/3';
  melde('DAS BECKEN VOR DIR IST TIEF. DA IST ETWAS DRIN.', 4.5);
}
function spielStart(){
  tonStart();
  if(SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
  neuStart();
  S.phase = 'spiel';
  zeige(null);
}
function pause(){
  if(S.phase !== 'spiel') return;
  S.phase = 'pause'; allesLos(); zeige(scPause);
  if(document.pointerLockElement) document.exitPointerLock();
}
function weiter(){ if(S.phase === 'pause'){ S.phase = 'spiel'; zeige(null); } }

function zurueckspulen(grund){
  if(S.phase !== 'spiel') return;
  S.phase = 'spult'; S.spulT = 1.9; S.tode++;
  allesLos();
  if(document.pointerLockElement) document.exitPointerLock();
  melde(grund, 3.0);
}
function gefressen(){
  /* Der Blick springt auf sie, und sie ist sofort auf Armeslänge da.
     Kein Suchen, kein Nachziehen — genau das macht den Schreck. */
  P.gier = Math.atan2(MON.x - P.x, MON.z - P.z);
  P.nick = -0.06;
  MON.zustand = 'steht'; MON.lage = 1;
  MON.gruppe.position.set(
    P.x + Math.sin(P.gier)*0.85, WASSER.h - 1.25, P.z + Math.cos(P.gier)*0.85);
  MON.gruppe.rotation.y = P.gier + Math.PI;
  schreckTon();
  if(navigator.vibrate) navigator.vibrate([0,80,50,200]);
  zurueckspulen('SIE HAT DICH IM WASSER ERWISCHT. BAND SPULT ZURÜCK.');
}
function ertrinken(){
  knall(1.6, 300, 0.34);
  zurueckspulen('KEINE LUFT MEHR. BAND SPULT ZURÜCK.');
}
function wiederAufsetzen(){
  P.x = P.halt.x; P.z = P.halt.z; P.y = P.halt.y;
  P.modus = 'gehen'; P.vy = 0; P.luft = GR.luft; P.kraft = 1;
  P.taucht = false;
  MON.jagt = 0; MON.weissX = 12.0; MON.weissZ = 11.0;
  MON.x = 12.0; MON.z = 11.0;
  S.phase = 'spiel'; zeige(null);
}
function endBild(titel, text){
  $('endTitle').textContent = titel;
  $('endText').textContent = text;
  $('endStats').innerHTML =
    'SCHIEBER ' + offenZahl() + '/3 &nbsp;·&nbsp; ZEIT ' + zeit(S.t) +
    '<br>BAND ZURÜCKGESPULT: ' + S.tode + ' ×';
  zeige(scEnd);
  if(document.pointerLockElement) document.exitPointerLock();
}
function gewonnen(){
  if(S.phase !== 'spiel') return;
  S.phase = 'gewonnen'; S.endT = 0;
  LUKE.offen = true;
  piep(520, 0.3, 0.1); setTimeout(()=>piep(780,0.5,0.09), 220);
  knall(1.8, 900, 0.3);
}

/* ======================= 14  Bild ======================= */
const spiegelKamera = new T.PerspectiveCamera();
const _spNormale = new T.Vector3(0,1,0), _spPunkt = new T.Vector3();
const _spBlick = new T.Vector3(), _spZiel = new T.Vector3(), _spDreh = new T.Matrix4();
const _spKamPos = new T.Vector3(), _spSchau = new T.Vector3();
const spiegelM = new T.Matrix4();
const spiegelEbene = new T.Plane(new T.Vector3(0,1,0), 0);

function spiegelZeichnen(){
  _spPunkt.set(0, WASSER.h, 0);
  _spKamPos.setFromMatrixPosition(camera.matrixWorld);
  _spBlick.subVectors(_spPunkt, _spKamPos);
  if(_spBlick.dot(_spNormale) > 0) return false;         // Kamera unter Wasser
  _spBlick.reflect(_spNormale).negate().add(_spPunkt);
  _spDreh.extractRotation(camera.matrixWorld);
  _spSchau.set(0,0,-1).applyMatrix4(_spDreh).add(_spKamPos);
  _spZiel.subVectors(_spPunkt, _spSchau).reflect(_spNormale).negate().add(_spPunkt);
  spiegelKamera.position.copy(_spBlick);
  /* Der Aufwärtsvektor muss VOR dem Spiegeln nach unten zeigen: erst die
     Drehung der echten Kamera, dann an der Wasserebene gespiegelt, ergibt
     wieder ein aufrechtes Bild. Mit (0,1,0) stand das Spiegelbild kopf. */
  spiegelKamera.up.set(0,-1,0).applyMatrix4(_spDreh).reflect(_spNormale);
  spiegelKamera.lookAt(_spZiel);
  spiegelKamera.near = camera.near; spiegelKamera.far = camera.far;
  spiegelKamera.fov = camera.fov; spiegelKamera.aspect = camera.aspect;
  spiegelKamera.updateProjectionMatrix();
  spiegelKamera.updateMatrixWorld();
  spiegelM.set(0.5,0,0,0.5, 0,0.5,0,0.5, 0,0,0.5,0.5, 0,0,0,1);
  spiegelM.multiply(spiegelKamera.projectionMatrix);
  spiegelM.multiply(spiegelKamera.matrixWorldInverse);

  /* Ein paar Zentimeter unter die Oberfläche schneiden: sonst steht am
     Ufer eine zerfranste helle Naht im Spiegelbild. */
  spiegelEbene.constant = -WASSER.h + 0.06;
  wasserNetz.visible = false; kellerNetz.visible = false;
  const altTon = renderer.toneMapping;
  renderer.toneMapping = T.NoToneMapping;               // sonst wird zweimal belichtet
  renderer.clippingPlanes = [spiegelEbene];
  renderer.setRenderTarget(spiegelRT);
  renderer.clear();
  renderer.render(scene, spiegelKamera);
  renderer.setRenderTarget(null);
  renderer.clippingPlanes = [];
  renderer.toneMapping = altTon;
  wasserNetz.visible = true; kellerNetz.visible = true;
  return true;
}

function zeichnen(){
  const nass = kopfNass();
  const kellerH = Math.min(WASSER.h, RAUM.P.luft);
  UNI.uZeit.value = ZEIT.t;
  UNI.uWasser.value = WASSER.h;
  blickRichtung(_blick);
  for(const [m, h] of [[wasserMat, WASSER.h], [kellerMat, kellerH]]){
    m.uniforms.uZeit.value = ZEIT.t;
    m.uniforms.uWasser.value = h;
    m.uniforms.uKamera.value.copy(camera.position);
    m.uniforms.uBlick.value.copy(_blick);
    m.uniforms.uLampe.value = S.phase === 'menu' ? 0.6 : LAMPENZUSTAND.flacker;
    m.uniforms.uKegel.value = LAMPE.angle;
  }
  kellerNetz.visible = kellerH > RAUM.P.boden + 0.05;

  scene.fog.color.copy(nass ? WASSER_NEBEL : LUFT_NEBEL);
  scene.fog.density = nass ? 0.115 : 0.019;
  renderer.setClearColor(nass ? 0x0b383e : 0x172a2e, 1);

  let sp = false;
  if(spiegelRT && !nass && S.phase !== 'menu' && !(window.PR && PR._spiegelAus)) sp = spiegelZeichnen();
  wasserMat.uniforms.uSpiegelAn.value = sp ? 1 : 0;
  wasserMat.uniforms.uSpiegelM.value.copy(spiegelM);

  postMat.uniforms.uZeit.value = ZEIT.t;
  postMat.uniforms.uNass.value = lerp(postMat.uniforms.uNass.value, nass ? 1 : 0, 0.25);
  postMat.uniforms.uLuft.value = clamp(P.luft/GR.luft, 0, 1);
  postMat.uniforms.uSpul.value = S.phase === 'spult' ? clamp(S.spulT/1.9, 0, 1) : 0;
  postMat.uniforms.uNah.value = lerp(postMat.uniforms.uNah.value,
    MON.wach && (P.modus==='schwimmen'||P.modus==='tauchen')
      ? clamp((11-MON.abstand)/9, 0, 1) : 0, 0.12);

  renderer.setRenderTarget(bildRT);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}

function groesse(){
  const w = Math.max(320, innerWidth), h = Math.max(240, innerHeight);
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  camera.aspect = w/h; camera.updateProjectionMatrix();
  const rw = Math.max(320, Math.round(w * Q.sicht)), rh = Math.max(200, Math.round(h * Q.sicht));
  bildRT.setSize(rw, rh);
  postMat.uniforms.uPixel.value.set(rw, rh);
  if(spiegelRT) spiegelRT.setSize(Math.round(w*Q.spiegel), Math.round(h*Q.spiegel));
}
addEventListener('resize', groesse);
groesse();

/* ======================= 15  Schleife ======================= */
const uhr = new T.Clock();
function schritt(dt){
  ZEIT.t += dt;
  if(S.phase === 'spiel'){
    S.t += dt;
    spielerSchritt(dt);
    schieberSchritt(dt);
    lampeSchritt(dt);
    monSchritt(dt);
    herz(dt);
    if(SND.ctx && SND.an){
      const nah = (P.modus==='schwimmen'||P.modus==='tauchen') && MON.wach
        ? clamp((13-MON.abstand)/13, 0, 1) : 0;
      SND.naehe.gain.setTargetAtTime(nah*nah*0.30, SND.ctx.currentTime, 0.25);
      SND.dumpf.frequency.setTargetAtTime(kopfNass() ? 420 : 20000, SND.ctx.currentTime, 0.12);
      SND.plaetscher.gain.setTargetAtTime(WASSER.steigt ? 0.09 : 0.03, SND.ctx.currentTime, 0.6);
    }
    hudSchritt(dt);
  } else if(S.phase === 'spult'){
    S.spulT -= dt;
    postMat.uniforms.uNah.value *= 0.9;
    if(S.spulT <= 0) wiederAufsetzen();
  } else if(S.phase === 'gewonnen'){
    S.endT += dt;
    LUKE.rad.rotation.z += dt*3.0;
    P.nick = lerp(P.nick, 0.1, dt*2);
    camera.rotation.set(P.nick, P.gier, 0, 'YXZ');
    if(S.endT > 2.6){
      endBild('BAND ENDET', 'Die Luke gibt nach. Dahinter ist Treppenhaus, trocken, ' +
        'und ganz oben ein Streifen Tageslicht. Was hinter dir im Wasser bleibt, ' +
        'sieht dir nach.');
      S.phase = 'ende';
    }
  }
}
function bild(){
  requestAnimationFrame(bild);
  const dt = Math.min(0.05, uhr.getDelta());
  schritt(dt);
  if(S.phase !== 'pause' && S.phase !== 'menu') zeichnen();
  else if(S.phase === 'menu') zeichnen();
}

/* ======================= 16  Menü ======================= */
hudBauen();
zeige(scTitle);
camera.position.set(4.6, 3.6, 4.6);
camera.rotation.set(-0.16, -2.35, 0, 'YXZ');

document.querySelectorAll('.chip[data-diff]').forEach(el => {
  el.classList.toggle('sel', el.dataset.diff === gKey);
  el.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-diff]').forEach(o => o.classList.remove('sel'));
    el.classList.add('sel');
    gKey = el.dataset.diff; GR = GRADE[gKey];
    localStorage.setItem('pr_diff', gKey);
    $('diffText').textContent = ({
      ruhig:  'Ruhig — die Luft reicht 34 Sekunden, es sucht dich gemächlich und hört schlecht.',
      normal: 'Normal — die Luft reicht 24 Sekunden, es sucht dich in ruhigem Tempo.',
      tief:   'Tief — 18 Sekunden Luft, es ist schneller als du und hört jeden Zug.',
    })[gKey];
  });
});
document.querySelectorAll('.chip[data-q]').forEach(el => {
  el.classList.toggle('sel', el.dataset.q === qKey);
  el.addEventListener('click', () => {
    localStorage.setItem('pr_q', el.dataset.q);
    location.reload();
  });
});
$('bStart').addEventListener('click', () => { tonStart(); zeige(scDiff); });
$('bZurueck').addEventListener('click', () => zeige(scTitle));
$('bPlay').addEventListener('click', () => zeige(scBrief));
scBrief.addEventListener('click', spielStart);
$('bWeiter').addEventListener('click', weiter);
$('bTon').addEventListener('click', () => tonSchalten(!SND.an));
$('bNeu').addEventListener('click', () => { neuStart(); S.phase = 'spiel'; zeige(null); });
$('bNochmal').addEventListener('click', () => { neuStart(); S.phase = 'spiel'; zeige(null); });
for(const id of ['bRaus','bRaus2'])
  $(id).addEventListener('click', () => location.href = '../foundtape.html');

/* Ladeanzeige: hier wird nichts nachgeladen, aber der Bau der Netze und
   Texturen dauert einen Moment — den zeigen wir ehrlich an. */
{
  const f = $('ladefuell'), b = $('bStart');
  let p = 0;
  const tick = setInterval(() => {
    p = Math.min(100, p + 14 + Math.random()*18);
    f.style.width = p + '%';
    if(p >= 100){
      clearInterval(tick);
      b.disabled = false;
      b.textContent = '▶ BAND ABSPIELEN';
    }
  }, 90);
  if(IS_TOUCH) $('titelHint').textContent = 'LINKS LAUFEN · RECHTS UMSEHEN · KNÖPFE RECHTS UNTEN';
}

/* Prüfhaken: damit sich der Ablauf ohne Hände nachmessen lässt. */
window.PR = {
  stand(){ return { x:+P.x.toFixed(2), z:+P.z.toFixed(2), y:+P.y.toFixed(2),
    modus:P.modus, luft:+P.luft.toFixed(1), wasser:+WASSER.h.toFixed(2),
    ziel:+WASSER.ziel.toFixed(2), offen:offenZahl(), phase:S.phase,
    auge:+augenHoehe().toFixed(2), tiefe:+tiefeHier().toFixed(2),
    mon:+MON.abstand.toFixed(1), tode:S.tode }; },
  setz(x,z,modus){ P.x=x; P.z=z; P.y=bodenBei(x,z); P.modus=modus||'gehen'; P.vy=0; },
  blick(g,n){ P.gier=g; if(n!==undefined) P.nick=n; },
  wasserAuf(h){ WASSER.h = WASSER.ziel = h; navBau(); },
  monWeg(){ MON.x = 12; MON.z = 11; MON.jagt = 0; MON.weissX=12; MON.weissZ=11; },
  boden:(x,z)=>bodenBei(x,z), decke:(x,z)=>deckeBei(x,z),
  spiegelAus(an){ PR._spiegelAus = !an; },
  zeigeSpiegel(an){ postMat.uniforms.uBild.value = an && spiegelRT ? spiegelRT.texture : bildRT.texture; },
  darf:(x,z,m)=>darfHin(x,z,m,P.y),
  darfGehen:(x,z,fuss)=>darfHin(x,z,'gehen',fuss),
  darfTauch(x,z,y){ const alt=P.tauchY; P.tauchY=y; const r=darfHin(x,z,'tauchen',P.y); P.tauchY=alt; return r; },
  pegel:(x,z)=>pegelBei(x,z),
  luke:LUKE, schwimmTiefe:SCHWIMM_TIEFE,
  ziel:()=>{ const z = zielObjekt(); return z ? (z.art==='luke'?'luke':'schieber'+z.s.nr) : null; },
  P, WASSER, MON, S, SCHIEBER, RAEUME, FLICKEN, WAENDE, IN,
};
bild();
