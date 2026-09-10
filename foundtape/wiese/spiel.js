import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skelettKlon } from 'three/addons/utils/SkeletonUtils.js';

/* ======================================================================
   FOUND TAPE · EBENE 2 — DIE WIESE

   Gras bis zum Rand, ein Himmel mit der falschen Farbe, sonst nichts.
   Keine Aufgabe, kein Gegenstand, keine Tür. Nur sechs Minuten Band und
   etwas Hohes, das still steht, solange du hinsiehst.

   Die Wiese ist nicht gebaut, sondern gerechnet: eine Höhenfunktion, aus
   der sowohl das Netz als auch der Boden unter den Füßen kommt. Deshalb
   hört sie nirgends auf.
   ====================================================================== */

/* ======================= 1  Rahmen ======================= */
const QUAL = {
  low:  { netz:96,  weite:210, schatten:false, sicht:0.80 },
  mid:  { netz:128, weite:250, schatten:false, sicht:0.92 },
  high: { netz:176, weite:300, schatten:true,  sicht:1.0 },
};
const IS_TOUCH = matchMedia('(hover: none)').matches || 'ontouchstart' in window;
let qKey = localStorage.getItem('wi_q') || (IS_TOUCH ? 'low' : 'high');
if(!QUAL[qKey]) qKey = 'mid';
const Q = QUAL[qKey];

/* Es gibt genau eine Stellschraube: wie schnell eine unbeobachtete
   Gestalt zum Sprung ansetzt. Alles andere ist Stimmung, nichts, was
   der Spieler verwalten muss. */
const GRADE = {
  fern:   { drang:0.100, ruf:26, name:'Fern' },
  normal: { drang:0.150, ruf:20, name:'Normal' },
  nah:    { drang:0.215, ruf:15, name:'Nah' },
};
let gKey = localStorage.getItem('wi_diff') || 'normal';
if(!GRADE[gKey]) gKey = 'normal';
let GR = GRADE[gKey];

/* Kein Zeitlimit. Das Band läuft mit und endet nicht von allein —
   was zählt, ist der Weg bis zum Mast. */

const $ = id => document.getElementById(id);
const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const lerp  = (a,b,t) => a+(b-a)*t;

const canvas = $('c');
const renderer = new T.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance' });
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.NeutralToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = Q.schatten;

const scene  = new T.Scene();
const camera = new T.PerspectiveCamera(72, 16/9, 0.1, 900);

/* Der Dunst hat genau die Farbe des Horizonts. Dadurch löst sich die
   Wiese am Rand auf, statt an einer Kante aufzuhören. */
const HORIZONT = new T.Color(0x9dc6e8);
/* Wohin der Himmel im Lauf des Bandes rutscht: die Sättigung geht raus,
   ein Grünstich kommt rein. Niemand kann sagen, wann es angefangen hat. */
const FALSCH_OBEN  = new T.Color(0x2a4a6e);
const FALSCH_MITTE = new T.Color(0x5e7c86);
const FALSCH_UNTEN = new T.Color(0x9aa88c);
/* Dichter Dunst: ab hundert Metern sind sie nur noch Umrisse. Genau
   das fehlte — man konnte sich einmal drehen und wusste alles. */
scene.fog = new T.FogExp2(HORIZONT.getHex(), 0.0145);

/* ======================= 2  Der Himmel ======================= */
/* Zu satt, zu gleichmäßig, ohne Sonne. Ein Himmel, den niemand
   fotografiert hat. Die harte Stufe im Verlauf ist Absicht — sie sieht
   aus wie ein Druckfehler, und genau das ist das Unbehagen. */
const himmelMat = new T.ShaderMaterial({
  side: T.BackSide, depthWrite: false, fog: false,
  uniforms: {
    uOben:  { value: new T.Color(0x1e5fd6) },
    uMitte: { value: new T.Color(0x4f8ee4) },
    uUnten: { value: new T.Color(0xa9d2ef) },
    uZeit:  { value: 0 },
  },
  vertexShader: `
    varying vec3 vP;
    void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    precision highp float;
    uniform vec3 uOben, uMitte, uUnten;
    uniform float uZeit;
    varying vec3 vP;
    void main(){
      float h = clamp(normalize(vP).y, -1.0, 1.0);
      float t = clamp(h*1.35 + 0.06, 0.0, 1.0);
      vec3 c = t < 0.42 ? mix(uUnten, uMitte, t/0.42)
                        : mix(uMitte, uOben, (t-0.42)/0.58);
      /* Stufen wie bei einem zu stark gespeicherten Bild */
      /* Feine Stufen: es soll billig aussehen, nicht kaputt. */
      c = floor(c * 46.0 + 0.5) / 46.0;
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
});
const himmel = new T.Mesh(new T.SphereGeometry(600, 24, 16), himmelMat);
himmel.frustumCulled = false;
scene.add(himmel);

/* ======================= 3  Die Wiese ======================= */
/* Eine Höhenfunktion, kein Gelände. Aus ihr kommen die Eckpunkte des
   Netzes und der Boden unter den Füßen — es gibt keine zweite Wahrheit
   darüber, wo die Wiese liegt. */
function mische(i, j){
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/* ---------- Die Wiese wickelt sich ----------
   Sie ist nicht unendlich, sie ist rund. Vierhundertachtzig Meter in
   jede Richtung, dann bist du wieder da, wo du losgelaufen bist — ohne
   Wand, ohne Naht, ohne dass es einem jemand sagt. Deshalb muss jede
   Lage des Rauschens auf ein Gitter passen, das genau in die Welt
   hineingeht: Kachelzahl mal Wellenlänge ergibt immer 480. */
const WELT = 480;
const modW = a => ((a % WELT) + WELT) % WELT;
/* Kürzester Weg auf der Schleife — von hier bis dort geht es womöglich
   rückwärts schneller. */
function dW(von, nach){
  let d = nach - von;
  if(d >  WELT/2) d -= WELT;
  if(d < -WELT/2) d += WELT;
  return d;
}
const abstandW = (ax, az, bx, bz) => Math.hypot(dW(ax,bx), dW(az,bz));

function welleP(x, z, n, ox, oz){
  const w = WELT / n;
  const px = x/w + ox, pz = z/w + oz;
  const i = Math.floor(px), j = Math.floor(pz);
  const fx = px - i, fz = pz - j;
  const sx = fx*fx*(3-2*fx), sz = fz*fz*(3-2*fz);
  const wi = k => ((k % n) + n) % n;
  const a = mische(wi(i),   wi(j)),   b = mische(wi(i+1), wi(j));
  const c = mische(wi(i),   wi(j+1)), d = mische(wi(i+1), wi(j+1));
  return lerp(lerp(a,b,sx), lerp(c,d,sx), sz);
}
function hoeheBei(x, z){
  return 6.4*welleP(x, z,  4, 0.31, 0.77)
       + 2.4*welleP(x, z, 12, 5.13, 2.09)
       + 0.78*welleP(x, z, 30, 1.77, 9.41)
       + 0.20*welleP(x, z, 78, 7.03, 3.55)
       - 4.8;
}
function normaleBei(x, z, out){
  const d = 0.9;
  const hx = hoeheBei(x+d,z) - hoeheBei(x-d,z);
  const hz = hoeheBei(x,z+d) - hoeheBei(x,z-d);
  return out.set(-hx, 2*d, -hz).normalize();
}

/* ---------- Grasnarbe: kurz gemäht, fleckig, nahtlos ---------- */
function grasTextur(px){
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  g.fillStyle = '#4c8a2c'; g.fillRect(0,0,px,px);
  /* Große Flecken zuerst, damit die Halme darüber liegen. Alles wird an
     den Rändern doppelt gezeichnet — sonst hat die Kachel eine Naht. */
  const wickel = (fn) => {
    for(const dx of [0, px, -px]) for(const dz of [0, px, -px]){
      g.save(); g.translate(dx, dz); fn(); g.restore();
    }
  };
  const flecken = [];
  for(let i=0;i<70;i++)
    flecken.push([Math.random()*px, Math.random()*px, px*(0.04+Math.random()*0.13),
                  Math.random()<0.5 ? 'rgba(112,150,58,0.32)' : 'rgba(56,96,30,0.30)']);
  wickel(() => {
    for(const [x,y,r,f] of flecken){
      const gr = g.createRadialGradient(x,y,0,x,y,r);
      gr.addColorStop(0,f); gr.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
    }
  });
  /* Halme: kurze Striche, leicht gedreht, in fünf Grüntönen */
  const toene = ['#6fa83c','#5b9331','#437d24','#83b94e','#38691c','#96c45f'];
  const halme = [];
  const n = Math.round(px*px/26);
  for(let i=0;i<n;i++){
    const x = Math.random()*px, y = Math.random()*px;
    const w = 0.9 + Math.random()*0.7;
    const l = 3 + Math.random()*5;
    const a = (Math.random()-0.5)*1.5 + (Math.random()<0.5 ? 0 : Math.PI);
    halme.push([x,y,w,l,a, toene[(Math.random()*toene.length)|0]]);
  }
  wickel(() => {
    g.lineCap = 'round';
    for(const [x,y,w,l,a,t] of halme){
      g.strokeStyle = t; g.lineWidth = w;
      g.beginPath(); g.moveTo(x,y);
      g.lineTo(x + Math.cos(a)*l, y + Math.sin(a)*l);
      g.stroke();
    }
  });
  /* Etwas Trockenes dazwischen, sonst wirkt es wie Kunstrasen */
  wickel(() => {
    g.globalAlpha = 0.5;
    for(let i=0;i<Math.round(n*0.035);i++){
      const x = Math.random()*px, y = Math.random()*px, a = Math.random()*6.3;
      g.strokeStyle = Math.random()<0.5 ? '#8d9c4a' : '#a5a85c';
      g.lineWidth = 1; g.beginPath(); g.moveTo(x,y);
      g.lineTo(x+Math.cos(a)*4, y+Math.sin(a)*4); g.stroke();
    }
    g.globalAlpha = 1;
  });
  const tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
const grasTex = grasTextur(1024);
grasTex.repeat.set(1,1);

/* ---------- Das Netz, das dem Spieler folgt ---------- */
/* Ein einziges Feld, das mitwandert und bei jedem Schritt über ein
   Raster neu ausgerichtet wird. Weil die Höhe aus einer Funktion kommt,
   fällt der Sprung nicht auf: die Ecken landen wieder auf derselben
   Wiese, nur ein Stück weiter. */
const WEITE = Q.weite, NETZ = Q.netz, RASTER = WEITE / NETZ;
const bodenGeo = new T.PlaneGeometry(WEITE, WEITE, NETZ, NETZ);
bodenGeo.rotateX(-Math.PI/2);
const bodenMat = new T.MeshStandardMaterial({ map: grasTex, roughness: 0.94, metalness: 0.0 });
/* Große, langsame Farbschwankung über die Fläche — ohne sie sieht man
   die Kachel schon aus zehn Metern. */
bodenMat.onBeforeCompile = sh => {
  sh.vertexShader = 'varying vec3 vWiese;\n' + sh.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n vWiese = (modelMatrix * vec4(transformed,1.0)).xyz;');
  sh.fragmentShader = 'varying vec3 vWiese;\n' + sh.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
     float f1 = sin(vWiese.x*0.031 + 1.7) * sin(vWiese.z*0.027 - 0.9);
     float f2 = sin(vWiese.x*0.0091 - 2.3) * sin(vWiese.z*0.0107 + 1.1);
     diffuseColor.rgb *= 1.0 + 0.20*f1 + 0.17*f2;
     diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36,0.49,0.21), clamp(0.10 + 0.12*f2, 0.0, 0.3));`);
};
const boden = new T.Mesh(bodenGeo, bodenMat);
boden.frustumCulled = false;
boden.receiveShadow = Q.schatten;
scene.add(boden);

let bodenAnker = { x: 1e9, z: 1e9 };
function bodenSetzen(px, pz){
  const ax = Math.round(px/RASTER)*RASTER, az = Math.round(pz/RASTER)*RASTER;
  if(ax === bodenAnker.x && az === bodenAnker.z) return;
  bodenAnker = { x:ax, z:az };
  const p = bodenGeo.attributes.position;
  const uv = bodenGeo.attributes.uv;
  for(let i=0;i<p.count;i++){
    const wx = ax + p.getX(i), wz = az + p.getZ(i);
    p.setY(i, hoeheBei(wx, wz));
    /* Weltfeste Kachelung: sonst schwimmt die Textur beim Nachrücken. */
    uv.setXY(i, wx/3.0, wz/3.0);
  }
  p.needsUpdate = true; uv.needsUpdate = true;
  bodenGeo.computeVertexNormals();
  boden.position.set(ax, 0, az);
}

/* Hinter dem Netz eine große Scheibe in Horizontfarbe: damit endet die
   Welt nicht an einer Kante, sondern im Dunst. */
{
  const scheibe = new T.Mesh(new T.CircleGeometry(760, 40),
    new T.MeshBasicMaterial({ color: 0x74a04c, fog: true }));
  scheibe.rotation.x = -Math.PI/2;
  scheibe.position.y = -5.6;
  scheibe.frustumCulled = false;
  scene.add(scheibe);
  scheibe.renderOrder = -1;
  window.__scheibe = scheibe;
}

/* ---------- Wind ----------
   Es wachsen keine Halme. Eine Wiese mit ordentlichen Büscheln sieht aus
   wie eine Wiese; diese hier soll aussehen wie das Bild einer Wiese —
   gleichmäßig, sauber, falsch. Der Wind ist deshalb nur noch zu hören.
   Das macht ihn als Vorzeichen sogar deutlicher: kurz vor einem Sprung
   bricht er ab, und dann ist es vollkommen still. */
const WIND = { value: 0, letzt: 0 };

/* ======================= 4  Licht ======================= */
/* Ein Tag ohne Sonne. Das Licht kommt von überall, wirft kaum Schatten
   und lässt sich nicht orten — man weiß nie, wie spät es ist. */
scene.add(new T.HemisphereLight(0xdff0ff, 0x4c7a2c, 2.05));
scene.add(new T.AmbientLight(0xffffff, 0.18));
const streiflicht = new T.DirectionalLight(0xfff6e2, 0.55);
streiflicht.position.set(-60, 48, 30);
if(Q.schatten){
  streiflicht.castShadow = true;
  streiflicht.shadow.mapSize.set(1024,1024);
  streiflicht.shadow.camera.left = -30; streiflicht.shadow.camera.right = 30;
  streiflicht.shadow.camera.top = 30; streiflicht.shadow.camera.bottom = -30;
  streiflicht.shadow.camera.far = 160; streiflicht.shadow.bias = -0.0016;
}
scene.add(streiflicht); scene.add(streiflicht.target);

/* ======================= 5  Die Figur ======================= */
const AUGEN = 1.66, KOPF = 1.74;
const P = {
  x: 0, z: 0, y: 0, gier: 0, nick: -0.03,
  gierZ: 0, nickZ: -0.03,           // wohin der Finger zeigt; die Kamera zieht nach
  schwung: 0, kipp: 0,
  kraft: 1, schrittWeg: 0, bob: 0, tempo: 0,
  gelaufen: 0,
};
const TEMPO = { gehen: 2.55, rennen: 5.05 };

const IN = { mx:0, mz:0, dyaw:0, dpitch:0, run:false };
/* Empfindlichkeit des Umsehens. Wird über alle Bänder hinweg gemerkt und
   im Pausenbild eingestellt. */
let EMPF = clamp(parseFloat(localStorage.getItem('ft_empf')) || 1, 0.3, 2.5);
const KEY = {};

function spielerSchritt(dt){
  /* Der Finger bewegt das Ziel, die Kamera zieht weich nach und kippt beim
     Schwenk leicht mit — dieselbe Handkamera wie im ersten Band. */
  P.gierZ += IN.dyaw; IN.dyaw = 0;
  P.nickZ = clamp(P.nickZ + IN.dpitch, -1.25, 1.15); IN.dpitch = 0;
  const folge = 1 - Math.exp(-dt*11);
  const dGier = (P.gierZ - P.gier) * folge;
  P.gier += dGier;
  P.nick += (P.nickZ - P.nick) * folge;
  const schwenk = dGier / Math.max(dt, 0.0001);
  P.schwung += (clamp(schwenk*0.030, -0.20, 0.20) - P.schwung) * Math.min(dt*5.0, 1);
  P.kipp    += (clamp(schwenk*0.012, -0.09, 0.09) - P.kipp)    * Math.min(dt*3.5, 1);

  let vor = -IN.mz, quer = IN.mx;
  if(KEY.KeyW || KEY.ArrowUp)    vor += 1;
  if(KEY.KeyS || KEY.ArrowDown)  vor -= 1;
  if(KEY.KeyD || KEY.ArrowRight) quer += 1;
  if(KEY.KeyA || KEY.ArrowLeft)  quer -= 1;
  const l = Math.hypot(vor, quer);
  if(l > 1){ vor /= l; quer /= l; }
  const gas = Math.min(1, l);

  const rennt = IN.run && P.kraft > 0.04 && gas > 0.1;
  P.kraft = clamp(P.kraft + (rennt ? -0.155 : 0.105)*dt, 0, 1);
  const tempo = rennt ? TEMPO.rennen : TEMPO.gehen;
  P.tempo = tempo * gas;

  const sin = Math.sin(P.gier), cos = Math.cos(P.gier);
  const dx = (-sin*vor + cos*quer) * tempo * dt;
  const dz = (-cos*vor - sin*quer) * tempo * dt;
  P.x = modW(P.x + dx); P.z = modW(P.z + dz);
  P.gelaufen += Math.hypot(dx, dz);
  P.y = hoeheBei(P.x, P.z);

  P.schrittWeg += gas * tempo * dt;
  const schrittLaenge = rennt ? 1.35 : 0.95;
  if(P.schrittWeg > schrittLaenge){ P.schrittWeg = 0; grasTon(rennt); }
  P.bob = P.bob*0.86 + gas*(rennt ? 0.055 : 0.032)*0.14;

  bodenSetzen(P.x, P.z);
  streiflicht.position.set(P.x - 60, 48, P.z + 30);
  streiflicht.target.position.set(P.x, 0, P.z);
  streiflicht.target.updateMatrixWorld();
  himmel.position.set(P.x, 0, P.z);
  if(window.__scheibe) window.__scheibe.position.set(P.x, -5.6 + hoeheBei(P.x,P.z)*0.0, P.z);

  /* Kamera in der Hand — dieselbe Unruhe wie in den anderen Bändern. */
  const t = ZEIT.t;
  const stark = 0.55 + gas * (rennt ? 1.9 : 1.0);
  const wGier = (Math.sin(t*1.31)*0.42 + Math.sin(t*0.57+1.7)*0.30 + Math.sin(t*2.63+0.4)*0.16)*0.0125*stark;
  const wNick = (Math.sin(t*1.07+2.1)*0.40 + Math.sin(t*2.21+0.9)*0.22 + Math.sin(t*0.43)*0.34)*0.0105*stark;
  const wRoll = (Math.sin(t*0.83+1.2)*0.55 + Math.sin(t*1.77+2.6)*0.25)*0.016*stark;
  const stoss = Math.sin(P.schrittWeg*6.4)*0.013*gas*(rennt?1.8:1);
  camera.position.set(
    P.x + Math.sin(t*0.61)*0.012*stark,
    P.y + AUGEN + Math.sin(t*7.4)*P.bob + stoss + Math.sin(t*0.94+0.3)*0.014*stark,
    P.z + Math.sin(t*0.73+2.2)*0.012*stark);
  camera.rotation.set(P.nick + wNick + P.kipp, P.gier + wGier, wRoll - P.schwung, 'YXZ');
}

/* ======================= 6  Der Mast ======================= */
/* Das Einzige auf dieser Wiese, was kein Gras ist. Achtzehn Meter, ein
   rotes Licht obendrauf, gut zweihundert Meter weit weg. Man sieht ihn vom
   ersten Bild an — und jeder Schritt dorthin ist ein Schritt mit dem
   Rücken zu ihnen. Mehr Spiel braucht es nicht. */
const MAST = { x:0, z:0, gruppe:null, licht:null, erreicht:false, start:230 };
{
  const g = new T.Group();
  const grau = new T.MeshStandardMaterial({ color:0x4a4f4a, roughness:0.85, metalness:0.25 });
  const schaft = new T.Mesh(new T.CylinderGeometry(0.28, 0.42, 18, 10), grau);
  schaft.position.y = 9; g.add(schaft);
  for(const y of [12.4, 15.2]){
    const arm = new T.Mesh(new T.BoxGeometry(3.4, 0.22, 0.22), grau);
    arm.position.y = y; g.add(arm);
    for(const sx of [-1.5, 1.5]){
      const iso = new T.Mesh(new T.CylinderGeometry(0.13, 0.13, 0.5, 6), grau);
      iso.position.set(sx, y+0.32, 0); g.add(iso);
    }
  }
  /* Das Warnlicht ist dafür gebaut, durch Dunst gesehen zu werden — es
     bleibt der einzige Punkt im Grau, der nicht verschwindet. Erst nah
     dran erkennt man, dass ein Mast darunter steht. */
  const lampe = new T.Mesh(new T.SphereGeometry(0.44, 10, 8),
    new T.MeshBasicMaterial({ color:0xd8352a, fog:false, toneMapped:false }));
  lampe.position.y = 18.3; g.add(lampe);
  MAST.licht = lampe; MAST.gruppe = g;
  scene.add(g);
}
function mastSetzen(){
  /* Auf einer Schleife von 480 m ist der weiteste mögliche Weg 339 m —
     alles darüber wickelt sich und kommt einem wieder entgegen. 230 m
     liegen sicher darunter, also stimmt die Zahl im Sucher auch. */
  MAST.start = 230;
  const w = Math.random()*Math.PI*2;
  MAST.x = modW(P.x + Math.sin(w)*MAST.start);
  MAST.z = modW(P.z + Math.cos(w)*MAST.start);
  MAST.erreicht = false;
  mastNachfuehren();
}
function mastNachfuehren(){
  const x = P.x + dW(P.x, MAST.x), z = P.z + dW(P.z, MAST.z);
  MAST.gruppe.position.set(x, hoeheBei(x,z), z);
}
const mastAbstand = () => abstandW(P.x, P.z, MAST.x, MAST.z);
function mastSchritt(dt){
  mastNachfuehren();
  /* Langsames rotes Blinken. Man sucht es unwillkürlich, sobald man
     sich einmal umgedreht hat. */
  MAST.licht.material.color.setHex((ZEIT.t % 2.4) < 0.7 ? 0xff5a44 : 0x5c1a14);
  if(mastAbstand() < 4.5 && STAND.phase === 'spiel' && !MAST.erreicht){
    MAST.erreicht = true; angekommen();
  }
}

/* ======================= 7  Sie ======================= */
/* Sie gehen nicht. Sie stehen. Und wenn du nicht hinsiehst, stehen sie
   woanders — näher, ohne dass ein Schritt zu sehen war. Weglaufen ist
   deshalb keine Antwort: die Wiese ist rund, und jeder gelaufene Meter
   stellt eine weitere von ihnen auf den Horizont. */
const HOEHE_SIE = 12.0;
const SIE = [];
let sieVorlage = null, sieGeladen = false;
/* Vier Stück, von Anfang an, in vier Richtungen. Genau darin liegt das
   ganze Spiel: du hast ein Paar Augen und vier Richtungen. */
const ANZAHL_SIE = 4;

new GLTFLoader().load('./modelle/sirene.glb', gltf => {
  const g = gltf.scene;
  const box = new T.Box3().setFromObject(g);
  const gr = new T.Vector3(); box.getSize(gr);
  g.scale.setScalar(HOEHE_SIE / Math.max(gr.y, 0.001));
  const box2 = new T.Box3().setFromObject(g);
  g.position.y -= box2.min.y;
  g.traverse(o => {
    if(o.isMesh){
      o.castShadow = Q.schatten; o.frustumCulled = false;
      if(o.material){ o.material.roughness = 0.85; o.material.metalness = 0.0; }
    }
  });
  sieVorlage = { wurzel: g, klippe: gltf.animations || [] };
  sieGeladen = true;
  ladeStand = 1;
}, e => { if(e.total) ladeStand = Math.min(0.95, e.loaded / e.total); },
   () => { sieGeladen = true; ladeStand = 1; });

function neueGestalt(abstand){
  if(!sieVorlage) return null;
  /* Object3D.clone() kopiert bei einem gerigten Modell das Skelett nicht
     mit: die Kopien hängen dann am Skelett des Originals und werden
     irgendwo hin verrechnet — sichtbar war davon nichts. SkeletonUtils
     baut Knochen und Bindung richtig nach. */
  const wurzel = skelettKlon(sieVorlage.wurzel);
  const halter = new T.Group(); halter.add(wurzel);
  scene.add(halter);
  let mixer = null, klipp = null;
  if(sieVorlage.klippe.length){
    mixer = new T.AnimationMixer(wurzel);
    klipp = mixer.clipAction(sieVorlage.klippe[0]);
    klipp.play(); klipp.paused = true;         // sie bewegt sich nie sichtbar
    klipp.time = 0.6 + Math.random()*3.2;      // jede steht ein bisschen anders
    mixer.update(0);
  }
  const w = Math.random()*Math.PI*2;
  const g = {
    halter, mixer, klipp,
    x: modW(P.x + Math.sin(w)*abstand),
    z: modW(P.z + Math.cos(w)*abstand),
    y: 0, gier: 0, drang: 0, abstand: abstand, gesehen: false, spruenge: 0,
  };
  g.y = hoeheBei(g.x, g.z);
  SIE.push(g);
  return g;
}

const _ndc = new T.Vector3();
/* Im Bild, nah genug, und keine Kuppe dazwischen. Der Blick über die
   Höhenfunktion ist wichtig: hinter einer Erhebung nützt Hinsehen nichts. */
function wirdGesehen(g){
  const px = P.x + dW(P.x, g.x), pz = P.z + dW(P.z, g.z);
  const kopf = hoeheBei(g.x, g.z) + HOEHE_SIE*0.72;
  _ndc.set(px, kopf, pz).project(camera);
  if(_ndc.z > 1 || Math.abs(_ndc.x) > 0.92 || Math.abs(_ndc.y) > 0.95) return false;
  /* Weiter als das trägt der Dunst nicht — und was man nicht sieht,
     kann man auch nicht festhalten. Die Regel muss zu dem passen, was
     im Bild ist, sonst hält man Gestalten fest, die gar nicht da sind. */
  if(g.abstand > 140) return false;
  if(DURCH.t > 0) return false;
  const ax = camera.position.x, ay = camera.position.y, az = camera.position.z;
  const n = Math.min(42, Math.max(8, Math.round(g.abstand/4)));
  for(let i=1;i<n;i++){
    const t = i/n;
    const x = lerp(ax, px, t), z = lerp(az, pz, t), y = lerp(ay, kopf, t);
    if(hoeheBei(x,z) > y + 0.3) return false;
  }
  return true;
}

function sieSchritt(dt){
  if(!sieVorlage) return;
  /* Das Lehrstück. Nach zwölf Sekunden springt die erste garantiert —
     und zwar so, dass sie hinterher im Blickfeld steht. Wer den Sprung
     nicht sieht, versteht die Regel nicht und stirbt beim ersten Mal an
     etwas, das sich wie ein Fehler anfühlt statt wie ein Gegner. */
  if(!STAND.gelehrt){
    STAND.lehre -= dt;
    if(STAND.lehre <= 0){
      const frei = SIE.filter(g => !g.gesehen);
      const g = (frei.length ? frei : SIE).sort((a,b) => a.abstand - b.abstand)[0];
      if(g){ g.drang = 1.0; g.lehrsprung = true; STAND.gelehrt = true; }
    }
  }

  let naechste = 999, irgendGesehen = false;
  STAND.luftAn = 0;
  for(const g of SIE){
    g.abstand = abstandW(P.x, P.z, g.x, g.z);
    naechste = Math.min(naechste, g.abstand);
    const gesehen = wirdGesehen(g);
    g.gesehen = gesehen;
    if(gesehen){
      irgendGesehen = true;
      /* Hinsehen hält sie. Mehr passiert nicht — es kostet nichts außer
         der Richtung, in die du gerade nicht schaust. */
      g.drang = Math.max(0, g.drang - dt*0.85);
    } else {
      /* Unbeobachtet wächst der Drang. Nah dran wächst er schneller. */
      const nah = clamp(1 - g.abstand/120, 0, 1);
      g.drang += dt * GR.drang * (0.55 + nah*1.35);
      /* Kurz vor dem Sprung steht die Luft still: der Wind fällt ab, die
         Halme hören auf, sich zu wiegen. Wer das einmal bemerkt hat,
         achtet für den Rest des Bandes auf das Gras. */
      if(g.drang > 0.80) STAND.luftAn = Math.max(STAND.luftAn, (g.drang-0.80)/0.20);
      if(g.drang >= 1){
        g.drang = 0.28; g.spruenge++;
        abdruckSetzen(g.x, g.z);
        /* Sie steht danach ein bisschen schiefer. Nicht viel. */
        g.halter.children[0].rotation.z = (Math.random()-0.5)*0.10;
        g.halter.children[0].rotation.x = (Math.random()-0.5)*0.07;
        /* Kein Schritt. Sie ist einfach näher. */
        const dx = dW(g.x, P.x), dz = dW(g.z, P.z);
        const l = Math.hypot(dx,dz) || 1;
        const neuD = Math.max(2.2, g.abstand * 0.52);
        let rx = -dx/l, rz = -dz/l;
        if(g.lehrsprung){
          /* Sie landet vor dir, nicht hinter dir — sonst lernt niemand
             etwas daraus. Ein Mal, und nie wieder. */
          g.lehrsprung = false;
          const w = P.gier + (Math.random()-0.5)*0.7;
          rx = -Math.sin(w); rz = -Math.cos(w);
          melde('SIE WAR EBEN NOCH WEITER WEG.', 4.5);
        }
        g.x = modW(P.x + rx*neuD);
        g.z = modW(P.z + rz*neuD);
        g.abstand = neuD;
        sprungTon(clamp(1 - neuD/90, 0.15, 1));
        /* Das Band verschluckt sich im Moment des Sprungs. */
        STAND.riss = 0.55;
        if(neuD < 18 && Math.random() < 0.35) durchschlagAusloesen();
        if(neuD <= 3.2 && STAND.phase === 'spiel'){ erwischt(g); return; }
      }
    }
    g.y = hoeheBei(g.x, g.z);
    const px = P.x + dW(P.x, g.x), pz = P.z + dW(P.z, g.z);
    g.halter.position.set(px, g.y, pz);
    g.halter.rotation.y = Math.atan2(dW(g.x, P.x), dW(g.z, P.z));
    /* Je näher, desto größer — nicht wirklich, aber gerade so viel, dass
       das Auge sich nicht traut, es zu behaupten. */
    const wuchs = 1 + clamp(1 - g.abstand/55, 0, 1) * 0.14;
    g.halter.scale.setScalar(wuchs);
    if(g.mixer) g.mixer.update(0);
  }
  abdruckNachfuehren();
  STAND.naechste = naechste;

  /* Ein Atem, der nicht der eigene ist. Nur wenn eine nah steht und man
     gerade nicht hinsieht. */
  STAND.atemT -= dt;
  if(STAND.atemT <= 0 && naechste < 60){
    /* Je näher, desto öfter und desto deutlicher. */
    const nah = clamp(1 - naechste/60, 0, 1);
    STAND.atemT = lerp(6.0, 2.2, nah) + Math.random()*1.6;
    atemTon(Math.max(0.12, nah));
  }

  /* Der Ruf: man hört sie, bevor man sie sieht. */
  STAND.rufT -= dt;
  if(STAND.rufT <= 0 && SIE.length){
    STAND.rufT = GR.ruf * (0.7 + Math.random()*0.6);
    rufTon(clamp(1 - naechste/190, 0.12, 1));
  }
}

/* ---------- Abdrücke ----------
   Wo eine gestanden hat, bleibt das Gras platt und ausgeblichen. Die
   Wiese füllt sich im Lauf der sechs Minuten mit Stellen, an denen sie
   schon einmal war — und man sieht daran, wie oft sie schon näher
   gekommen ist, ohne dass man es bemerkt hat. */
const ABDRUCK = { netz:null, n:48, liste:[] };
{
  const g = new T.CircleGeometry(2.1, 20);
  g.rotateX(-Math.PI/2);
  const m = new T.MeshStandardMaterial({
    color: 0xa39a63, roughness: 1.0, transparent: true, opacity: 0.0,
    depthWrite: false });
  m.onBeforeCompile = sh => {
    /* Der Rand soll ausfransen, keine gestanzte Scheibe sein. */
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float r = length(vUv - 0.5) * 2.0;
       float rau = 0.80 + 0.20*sin(vUv.x*41.0)*sin(vUv.y*37.0);
       diffuseColor.a *= (1.0 - smoothstep(0.55*rau, 1.0*rau, r)) * 0.85;`);
    sh.fragmentShader = 'varying vec2 vUv;\n' + sh.fragmentShader;
    sh.vertexShader = 'varying vec2 vUv;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n vUv = uv;');
  };
  m.customProgramCacheKey = () => 'wiAbdruck';
  m.transparent = true; m.opacity = 1.0;
  ABDRUCK.netz = new T.InstancedMesh(g, m, ABDRUCK.n);
  ABDRUCK.netz.frustumCulled = false;
  ABDRUCK.netz.count = 0;
  ABDRUCK.netz.renderOrder = 1;
  scene.add(ABDRUCK.netz);
}
const _am = new T.Matrix4(), _ap = new T.Vector3(), _aq = new T.Quaternion(), _as = new T.Vector3();
function abdruckSetzen(x, z){
  ABDRUCK.liste.push({ x: modW(x), z: modW(z), gr: 0.85 + Math.random()*0.5,
                       dreh: Math.random()*6.283 });
  if(ABDRUCK.liste.length > ABDRUCK.n) ABDRUCK.liste.shift();
}
function abdruckNachfuehren(){
  const n = ABDRUCK.liste.length;
  ABDRUCK.netz.count = n;
  for(let i=0;i<n;i++){
    const a = ABDRUCK.liste[i];
    const x = P.x + dW(P.x, a.x), z = P.z + dW(P.z, a.z);
    _ap.set(x, hoeheBei(x,z) + 0.03, z);
    _aq.setFromAxisAngle(new T.Vector3(0,1,0), a.dreh);
    _as.set(a.gr, 1, a.gr);
    _am.compose(_ap, _aq, _as);
    ABDRUCK.netz.setMatrixAt(i, _am);
  }
  if(n) ABDRUCK.netz.instanceMatrix.needsUpdate = true;
}

/* ---------- Der Durchschlag ----------
   Mitten im Rauschen, für ein Zehntel einer Sekunde, steht eine direkt
   vor der Linse. Wer blinzelt, verpasst es — und ist sich hinterher
   nicht sicher, ob es da war. */
const DURCH = { netz:null, t:0, geplant:-1 };
function durchschlagVorbereiten(){
  if(DURCH.netz || !sieVorlage) return;
  const g = skelettKlon(sieVorlage.wurzel);
  g.traverse(o => { if(o.isMesh){ o.castShadow = false; o.frustumCulled = false; } });
  DURCH.netz = new T.Group(); DURCH.netz.add(g);
  DURCH.netz.visible = false;
  scene.add(DURCH.netz);
}
function durchschlagSchritt(dt){
  if(!DURCH.netz) return;
  if(DURCH.t > 0){
    DURCH.t -= dt;
    if(DURCH.t <= 0) DURCH.netz.visible = false;
    return;
  }
  DURCH.netz.visible = false;
}
function durchschlagAusloesen(){
  durchschlagVorbereiten();
  if(!DURCH.netz) return;
  const v = new T.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  const x = camera.position.x + v.x*3.6, z = camera.position.z + v.z*3.6;
  DURCH.netz.position.set(x, hoeheBei(x,z), z);
  DURCH.netz.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z);
  DURCH.netz.visible = true;
  DURCH.t = 0.11;
  knall(0.09, 7000, 0.34, 'highpass');
}

/* ======================= 8  Ton ======================= */
const SND = { an:true, ctx:null };
function tonStart(){
  if(SND.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return;
  const ac = new AC(); SND.ctx = ac;
  SND.master = ac.createGain(); SND.master.gain.value = SND.an ? 0.9 : 0;
  SND.master.connect(ac.destination);

  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i] = Math.random()*2-1;
  SND.rausch = buf;

  /* Wind über offener Fläche: gefiltertes Rauschen mit langsamer Atmung */
  const w = ac.createBufferSource(); w.buffer = buf; w.loop = true;
  const wf = ac.createBiquadFilter(); wf.type='lowpass'; wf.frequency.value = 420; wf.Q.value = 0.5;
  SND.wind = ac.createGain(); SND.wind.gain.value = 0.055;
  w.connect(wf); wf.connect(SND.wind); SND.wind.connect(SND.master); w.start();
  const lfo = ac.createOscillator(); lfo.type='sine'; lfo.frequency.value = 0.09;
  const lg = ac.createGain(); lg.gain.value = 0.03;
  lfo.connect(lg); lg.connect(SND.wind.gain); lfo.start();

  /* Ihre Nähe: ein Brummen, das nichts erklärt */
  const n = ac.createOscillator(); n.type='sawtooth'; n.frequency.value = 28;
  const nf = ac.createBiquadFilter(); nf.type='lowpass'; nf.frequency.value = 110;
  SND.naehe = ac.createGain(); SND.naehe.gain.value = 0;
  n.connect(nf); nf.connect(SND.naehe); SND.naehe.connect(SND.master); n.start();

  /* Bandrauschen, wenn das Bild kippt */
  const r = ac.createBufferSource(); r.buffer = buf; r.loop = true;
  const rf = ac.createBiquadFilter(); rf.type='highpass'; rf.frequency.value = 1800;
  SND.stoer = ac.createGain(); SND.stoer.gain.value = 0;
  r.connect(rf); rf.connect(SND.stoer); SND.stoer.connect(SND.master); r.start();
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
const grasTon = rennt => knall(rennt ? 0.16 : 0.13, 2600 + Math.random()*1200,
                               rennt ? 0.14 : 0.09, 'bandpass');
/* Der Ruf: zwei Töne, die nicht zusammenpassen, mit einem langen Abfall. */
function rufTon(laut){
  const ac = SND.ctx; if(!ac || !SND.an) return;
  const jetzt = ac.currentTime;
  for(const [f0, f1, ver] of [[420, 300, 0], [560, 395, 0.06]]){
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0*0.72, jetzt+ver);
    o.frequency.linearRampToValueAtTime(f0, jetzt+ver+0.9);
    o.frequency.setValueAtTime(f0, jetzt+ver+2.0);
    o.frequency.linearRampToValueAtTime(f1, jetzt+ver+3.4);
    const bp = ac.createBiquadFilter(); bp.type='bandpass';
    bp.frequency.value = 700; bp.Q.value = 2.2;
    const g = ac.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(0.10*laut, jetzt+ver, 0.5);
    g.gain.setTargetAtTime(0.0, jetzt+ver+2.4, 0.7);
    o.connect(bp); bp.connect(g); g.connect(SND.master);
    o.start(jetzt+ver); o.stop(jetzt+ver+4.4);
  }
  knall(1.4, 900, 0.05*laut, 'bandpass');
}
/* Der Sprung: kein Schritt, ein Schnitt. Ein harter Anriss und ein
   tiefer Schlag, der im Bauch landet. */
function sprungTon(nah){
  const ac = SND.ctx; if(!ac || !SND.an) return;
  knall(0.10, 5200, 0.10 + nah*0.30, 'highpass');
  const o = ac.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(120, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(34, ac.currentTime + 0.45);
  const g = ac.createGain(); g.gain.value = 0;
  g.gain.setTargetAtTime(0.10 + nah*0.26, ac.currentTime, 0.006);
  g.gain.setTargetAtTime(0, ac.currentTime + 0.22, 0.16);
  o.connect(g); g.connect(SND.master);
  o.start(); o.stop(ac.currentTime + 1.0);
}
function fernRuf(laut){ rufTon(laut); }
/* Zwei Züge, gefiltert wie durch Stoff. Kein Knurren — Atem. */
function atemTon(nah){
  knall(0.55, 620 + nah*380, 0.045 + nah*0.090, 'bandpass');
  setTimeout(() => knall(0.62, 420, 0.036 + nah*0.072, 'bandpass'), 620);
}
function schreckTon(){
  const ac = SND.ctx; if(!ac || !SND.an) return;
  knall(0.08, 9000, 0.55, 'highpass');
  knall(1.5, 1400, 0.42);
  const o = ac.createOscillator(); o.type='square';
  o.frequency.setValueAtTime(680, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(48, ac.currentTime+1.1);
  const g = ac.createGain(); g.gain.value = 0;
  g.gain.setTargetAtTime(0.34, ac.currentTime, 0.004);
  g.gain.setTargetAtTime(0, ac.currentTime+0.6, 0.3);
  o.connect(g); g.connect(SND.master); o.start(); o.stop(ac.currentTime+2.0);
}
function tonSchalten(an){
  SND.an = an;
  if(SND.ctx) SND.master.gain.setTargetAtTime(an ? 0.9 : 0, SND.ctx.currentTime, 0.05);
  $('bTon').textContent = 'TON: ' + (an ? 'AN' : 'AUS');
}

/* ======================= 9  Bildnachbearbeitung ======================= */
/* Dasselbe Band wie in Ebene 0 und 1: Linsenverzug, Kopfspur, Bandlauf,
   Blockversatz, Korn, Zeilen. Neu ist nur, was ihr Rundfunk anrichtet. */
const bildRT = new T.WebGLRenderTarget(16, 16, {
  minFilter:T.LinearFilter, magFilter:T.LinearFilter, type:T.HalfFloatType });
const postScene = new T.Scene();
const postCam = new T.OrthographicCamera(-1,1,1,-1,0,1);
const postMat = new T.ShaderMaterial({
  uniforms: {
    uBild:  { value: bildRT.texture },
    uZeit:  { value: 0 },
    uStoer: { value: 0 },
    uNah:   { value: 0 },
    uEnde:  { value: 0 },
    uVhs:   { value: 0.42 },
    uLens:  { value: 0.34 },
    uPixel: { value: new T.Vector2(1,1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }`,
  fragmentShader: `
    precision highp float;
    uniform sampler2D uBild;
    uniform float uZeit, uStoer, uNah, uEnde, uVhs, uLens;
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
      float St = uStoer;
      vec2 uv = vUv;
      vec2 cc = uv - 0.5;
      uv = 0.5 + cc*(1.0 + uLens*dot(cc,cc))/(1.0 + uLens*0.22);
      uv.x += sin(uv.y*88.0 + uZeit*2.4)*0.0011*V*(1.0 + St*4.0);
      float bandPos = fract(uZeit*0.10);
      float band = smoothstep(0.045, 0.0, abs(uv.y-bandPos))*V;
      uv.x += band*(lrm(vec2(uv.y, floor(uZeit*30.0)))-0.5)*0.028*(0.3 + St*2.2);
      float row = floor(uv.y*48.0);
      float blk = step(0.992 - St*0.45, lrm(vec2(row, floor(uZeit*16.0))));
      uv.x += blk*(lrm(vec2(row,uZeit))-0.5)*0.22*St*(0.35 + V);
      uv = clamp(uv, 0.002, 0.998);
      float ca = (0.0010 + St*0.010 + band*0.002)*(0.4 + V*0.6);
      vec3 col;
      col.r = texture2D(uBild, uv + vec2(ca,0.0)).r;
      col.g = texture2D(uBild, uv).g;
      col.b = texture2D(uBild, uv - vec2(ca,0.0)).b;
      col += bloom(uv) * vec3(1.0,0.98,0.94);
      float lum = dot(col, vec3(0.299,0.587,0.114));
      col = mix(col, vec3(lum), 0.10*V + 0.35*St);
      col = toneMapping(col);
      col += 0.018*V;
      col *= 1.0 - 0.07*V*(0.5 - 0.5*sin(uv.y*uPixel.y*3.14159));
      col *= 1.0 - 0.018*V*lrm(vec2(floor(uv.y*uPixel.y), floor(uZeit*24.0)));
      float lf = clamp(dot(col, vec3(0.299,0.587,0.114)), 0.0, 1.0);
      float g1 = lrm(uv*uPixel + fract(uZeit)*91.7) - 0.5;
      float g2 = lrm(floor(uv*uPixel*0.30) + fract(uZeit*0.83)*57.3) - 0.5;
      col += (g1*0.020 + g2*0.014) * (0.55 + 0.45*(1.0-lf)) * (0.75 + 0.5*V + St*1.6);
      float vig = dot(vUv-0.5, vUv-0.5);
      col *= 1.0 - vig*(0.62 + 0.60*V + 0.9*uNah);
      /* Ihr Rundfunk frisst das Bild von den Rändern her auf */
      col = mix(col, vec3(lrm(uv*uPixel*0.7 + uZeit*57.3)), clamp(St*St*1.15, 0.0, 1.0));
      col *= 1.0 - uEnde;
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
});
postScene.add(new T.Mesh(new T.PlaneGeometry(2,2), postMat));

/* ======================= 10  Anzeige und Ablauf ======================= */
const ZEIT = { t: 0 };
const STAND = { phase:'menu', t:0, endT:0, tode:0,
                naechste:999, rufT:9, taeter:null, lehre:12, gelehrt:false,
                luegeT:50, luegeBis:0,
                luftAn:0, atemT:5, windStill:0, himmelKrank:0, riss:0 };
let ladeStand = 0;

const scTitle = $('scTitle'), scDiff = $('scDiff'), scBrief = $('scBrief'),
      scPause = $('scPause'), scEnd = $('scEnd');
const MENUES = [scTitle, scDiff, scBrief, scPause, scEnd];
function zeige(el){
  for(const m of MENUES) m.classList.add('hidden');
  if(el) el.classList.remove('hidden');
  $('hud').classList.toggle('an', !el);
  $('steuer').classList.toggle('an', !el && IS_TOUCH);
}
function zeitStr(sek){
  const m = Math.max(0, Math.floor(sek/60)), s = Math.max(0, Math.floor(sek)%60);
  return (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}
function bandStr(sek){
  const h=(sek/3600)|0, m=((sek/60)|0)%60, s=(sek|0)%60, z=n=>(n<10?'0':'')+n;
  return z(h)+':'+z(m)+':'+z(s);
}
let meldT = 0;
function melde(txt, sek){ const e=$('toast'); e.textContent=txt; e.classList.add('an'); meldT=sek||3; }
let hudAcc = 0;
function hudSchritt(dt){
  hudAcc += dt;
  if(hudAcc < 0.08) return;
  hudAcc = 0;
  $('tc').textContent = bandStr(STAND.t);
  const dm = mastAbstand();
  $('restZeit').textContent = Math.round(dm) + ' m';

  /* Wohin der Mast steht. Auf der Wiese sieht alles gleich aus; ohne
     Richtungsangabe läuft man an ihm vorbei, ohne es zu merken.
     Der Winkel ist bildbezogen: 0 heißt geradeaus.
     Die Wiese ist eine Schleife, deshalb der kürzeste Weg über dW. */
  const zg = $('mastZeiger');
  if(MAST.gruppe && !MAST.erreicht && STAND.phase === 'spiel'){
    const mx = dW(P.x, MAST.x), mz = dW(P.z, MAST.z);
    const winkel = Math.atan2(mx, -mz) + P.gier;
    $('mastNadel').style.transform = 'rotate(' + winkel.toFixed(3) + 'rad)';
    zg.classList.add('an');
  } else zg.classList.remove('an');
  $('band').classList.toggle('knapp', dm < 60);
  /* Selten — und dann lange genug, dass man es liest. Bei jedem Takt
     gewürfelt flackerte die Zahl fast jede Sekunde und sah nach einem
     Fehler aus statt nach einer Lüge. Jetzt einmal pro Minute, für
     anderthalb Sekunden. */
  STAND.luegeT -= 0.08;
  if(STAND.luegeT <= 0){ STAND.luegeT = 45 + Math.random()*40; STAND.luegeBis = 1.5; }
  if(STAND.luegeBis > 0) STAND.luegeBis -= 0.08;
  const n = SIE.length + (STAND.luegeBis > 0 ? 1 : 0);
  $('anzahl').textContent = n + (n === 1 ? ' GESTALT' : ' GESTALTEN');
  if(meldT > 0){ meldT -= dt; if(meldT <= 0) $('toast').classList.remove('an'); }
}

function neuStart(){
  P.x = modW(Math.random()*WELT); P.z = modW(Math.random()*WELT);
  P.y = hoeheBei(P.x, P.z); P.gier = P.gierZ = Math.random()*Math.PI*2; P.nick = P.nickZ = -0.03; P.schwung = P.kipp = 0;
  P.kraft = 1; P.gelaufen = 0;
  STAND.t = 0; STAND.riss = 0;
  STAND.endT = 0; STAND.naechste = 999; STAND.rufT = 9; STAND.taeter = null;
  STAND.lehre = 12; STAND.gelehrt = false;
  STAND.luegeT = 50; STAND.luegeBis = 0;
  for(const g of SIE) scene.remove(g.halter);
  SIE.length = 0;
  ABDRUCK.liste.length = 0; ABDRUCK.netz.count = 0;
  STAND.luftAn = 0; STAND.windStill = 0; STAND.atemT = 6; STAND.himmelKrank = 0;
  DURCH.geplant = -1; DURCH.t = 0;
  if(DURCH.netz) DURCH.netz.visible = false;
  durchschlagVorbereiten();
  mastSetzen();
  for(let i=0;i<ANZAHL_SIE;i++){
    const g = neueGestalt(60 + Math.random()*45);
    if(g){
      /* gleichmäßig verteilt, damit von Anfang an keine Richtung sicher ist —
         und nah genug, dass man sie im Dunst auch findet. */
      const w = (i + Math.random()*0.6) / ANZAHL_SIE * Math.PI*2;
      const d = 60 + Math.random()*45;
      g.x = modW(P.x + Math.sin(w)*d); g.z = modW(P.z + Math.cos(w)*d);
      g.y = hoeheBei(g.x, g.z); g.abstand = d;
    }
  }
  bodenAnker = { x:1e9, z:1e9 };
  bodenSetzen(P.x, P.z);
  melde('DER MAST STEHT 230 m WEIT. SIE STEHEN NÄHER.', 5);
}
function spielStart(){
  tonStart();
  if(SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
  neuStart();
  STAND.phase = 'spiel';
  zeige(null);
}
function pause(){
  if(STAND.phase !== 'spiel') return;
  STAND.phase = 'pause'; allesLos(); zeige(scPause);
  if(document.pointerLockElement) document.exitPointerLock();
}
function endBild(titel, text){
  $('endTitle').textContent = titel;
  $('endText').textContent = text;
  $('endStats').innerHTML =
    'ZUM MAST ' + (MAST.erreicht ? 'ANGEKOMMEN' : Math.round(mastAbstand()) + ' m GEFEHLT') +
    ' &nbsp;·&nbsp; ZEIT ' + zeitStr(STAND.t) +
    '<br>GELAUFEN ' + Math.round(P.gelaufen) + ' m &nbsp;·&nbsp; SPRÜNGE ' +
    SIE.reduce((n,g) => n + g.spruenge, 0);
  zeige(scEnd);
  if(document.pointerLockElement) document.exitPointerLock();
}
function erwischt(g){
  if(STAND.phase !== 'spiel') return;
  STAND.phase = 'tot'; STAND.endT = 0; STAND.tode++;
  STAND.taeter = g;
  P.gier = Math.atan2(dW(P.x, g.x), dW(P.z, g.z));
  P.nick = P.nickZ = 0.42;                                   // der Blick geht hoch
  schreckTon();
  if(navigator.vibrate) navigator.vibrate([0,90,50,240]);
  allesLos();
  if(document.pointerLockElement) document.exitPointerLock();
}
function angekommen(){
  if(STAND.phase !== 'spiel') return;
  STAND.phase = 'fertig'; STAND.endT = 0;
  allesLos();
  knall(1.8, 800, 0.22);
}

/* ======================= 11  Steuerung ======================= */
const elStick = $('stick'), elKnob = $('knob');
const zMove = $('zoneMove'), zLook = $('zoneLook');
const bRun = $('bRun'), bMenu = $('bMenu');
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
  /* Der Knüppel bewegt nur. Rennen sagt man mit dem Knopf. */
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
  IN.dyaw   -= (e.clientX-lookLx)*0.0042*EMPF;
  IN.dpitch -= (e.clientY-lookLy)*0.0034*EMPF;
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
haltKnopf(bRun, () => IN.run = true, () => IN.run = false);
bMenu.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); pause(); });

function allesLos(){
  for(const k in KEY) KEY[k] = false;
  IN.run = false; IN.mx = IN.mz = 0; IN.dyaw = IN.dpitch = 0;
  bRun.classList.remove('held');
  moveId = lookId = null;
  elKnob.style.transform = 'translate(0,0)'; elStick.classList.remove('on');
}
addEventListener('blur', allesLos);
addEventListener('keydown', e => {
  KEY[e.code] = true;
  if(e.code === 'ShiftLeft' || e.code === 'ShiftRight') IN.run = true;
  if(e.key.toLowerCase() === 'm') tonSchalten(!SND.an);
  if(e.code === 'Escape' && STAND.phase === 'spiel') pause();
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => {
  KEY[e.code] = false;
  if(e.code === 'ShiftLeft' || e.code === 'ShiftRight') IN.run = false;
});
canvas.addEventListener('click', () => {
  if(STAND.phase === 'spiel' && !IS_TOUCH && document.pointerLockElement !== canvas)
    canvas.requestPointerLock && canvas.requestPointerLock();
});
addEventListener('mousemove', e => {
  if(document.pointerLockElement !== canvas) return;
  IN.dyaw   -= e.movementX*0.0022*EMPF;
  IN.dpitch -= e.movementY*0.0020*EMPF;
});

/* ======================= 12  Bild und Schleife ======================= */
function zeichnen(){
  /* Die Uhr des Windes läuft langsamer, je näher ein Sprung ist — bei
     eins bleibt sie stehen. Halme und Böe frieren mit. */
  STAND.windStill = lerp(STAND.windStill, STAND.luftAn, 0.16);
  WIND.value += Math.max(0, 1 - STAND.windStill) * (ZEIT.t - (WIND.letzt ?? ZEIT.t));
  WIND.letzt = ZEIT.t;
  himmelMat.uniforms.uZeit.value = ZEIT.t;
  /* Über das Band hinweg kippt die Farbe: erst zu blau, dann zu wenig
     davon. Langsam genug, dass man sich nicht sicher ist. */
  const krank = STAND.phase === 'spiel'
    ? clamp(1 - mastAbstand()/MAST.start, 0, 1) : STAND.himmelKrank;
  STAND.himmelKrank = krank;
  himmelMat.uniforms.uOben.value.setHex(0x1e5fd6).lerp(FALSCH_OBEN, krank*0.85);
  himmelMat.uniforms.uMitte.value.setHex(0x4f8ee4).lerp(FALSCH_MITTE, krank*0.85);
  himmelMat.uniforms.uUnten.value.setHex(0xa9d2ef).lerp(FALSCH_UNTEN, krank*0.85);
  scene.fog.color.copy(HORIZONT).lerp(FALSCH_UNTEN, krank*0.7);
  scene.fog.density = 0.0145 + krank*0.006;
  postMat.uniforms.uZeit.value = ZEIT.t;
  /* Kein Balken, keine Verwaltung: das Bild reagiert nur auf das, was
     gerade passiert. */
  postMat.uniforms.uStoer.value = DURCH.t > 0 ? 0.30 : clamp(STAND.riss, 0, 1);
  postMat.uniforms.uNah.value = lerp(postMat.uniforms.uNah.value,
    clamp(1 - (STAND.naechste ?? 999)/45, 0, 1), 0.12);
  postMat.uniforms.uEnde.value =
    STAND.phase === 'tot'    ? clamp(STAND.endT*0.7, 0, 1) :
    STAND.phase === 'fertig' ? clamp((STAND.endT-1.2)*0.8, 0, 1) : 0;
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
  const rw = Math.max(320, Math.round(w*Q.sicht)), rh = Math.max(200, Math.round(h*Q.sicht));
  bildRT.setSize(rw, rh);
  postMat.uniforms.uPixel.value.set(rw, rh);
}
addEventListener('resize', groesse);
groesse();

const uhr = new T.Clock();
function schritt(dt){
  ZEIT.t += dt;
  if(STAND.phase === 'spiel'){
    STAND.t += dt;
    spielerSchritt(dt);
    mastSchritt(dt);
    sieSchritt(dt);
    STAND.riss = Math.max(0, STAND.riss - dt*1.4);
    durchschlagSchritt(dt);
    if(SND.ctx && SND.an){
      /* Vorher setzte das Brummen erst kurz vor dem Zugriff ein. Jetzt
         beginnt es bei 75 m und wächst flach — man merkt, dass etwas
         näher kommt, bevor man weiß, welche. */
      const nah = clamp(1 - (STAND.naechste ?? 999)/75, 0, 1);
      SND.naehe.gain.setTargetAtTime(Math.pow(nah, 1.4)*0.34, SND.ctx.currentTime, 0.3);
      SND.stoer.gain.setTargetAtTime(STAND.riss*0.16, SND.ctx.currentTime, 0.12);
      /* Genau hier liegt die einzige Vorwarnung: bricht der Wind ab,
         setzt gleich eine zum Sprung an. */
      const ruhe = 1 - clamp(STAND.windStill, 0, 1);
      SND.wind.gain.setTargetAtTime((0.05 + P.tempo*0.012) * ruhe,
        SND.ctx.currentTime, STAND.windStill > 0.3 ? 0.12 : 0.4);
    }
    hudSchritt(dt);
  } else if(STAND.phase === 'tot'){
    STAND.endT += dt;
    /* Jetzt läuft die Animation — zum ersten und einzigen Mal sieht man
       sie sich bewegen. */
    const g = STAND.taeter;
    if(g){
      const dx = dW(g.x, P.x), dz = dW(g.z, P.z), dl = Math.hypot(dx,dz) || 1;
      const neu = Math.max(1.5, dl - dt*4.5);
      g.x = modW(P.x - dx/dl*neu); g.z = modW(P.z - dz/dl*neu);
      g.y = hoeheBei(g.x, g.z);
      g.halter.position.set(P.x + dW(P.x,g.x), g.y, P.z + dW(P.z,g.z));
      if(g.klipp) g.klipp.paused = false;
      if(g.mixer) g.mixer.update(dt);
    }
    camera.rotation.set(P.nick, P.gier, Math.sin(ZEIT.t*9)*0.03, 'YXZ');
    if(STAND.endT > 2.4 && scEnd.classList.contains('hidden'))
      endBild('BAND REISST', 'Sie hat keinen Schritt gemacht. Sie war nur ' +
        'plötzlich näher, und dann war sie hier.');
  } else if(STAND.phase === 'fertig'){
    STAND.endT += dt;
    if(STAND.endT > 2.4 && scEnd.classList.contains('hidden'))
      endBild('AM MAST', 'Ein Betonfuß, ein rotes Licht, sonst nichts. Von hier aus ' +
        'sieht man in alle Richtungen dasselbe — und vier Stellen, an denen sie ' +
        'stehen. Keine ist einen Schritt gegangen.');
  }
}
function bild(){
  requestAnimationFrame(bild);
  const dt = Math.min(0.05, uhr.getDelta());
  schritt(dt);
  zeichnen();
}

/* ======================= 13  Menü ======================= */
zeige(scTitle);
P.y = hoeheBei(0,0);
bodenSetzen(0,0);
camera.position.set(0, P.y + AUGEN, 0);
camera.rotation.set(-0.02, 0.6, 0, 'YXZ');
himmel.position.set(0,0,0);

const DIFFTEXT = {
  fern:   'Fern — unbeobachtet lässt sie sich rund zehn Sekunden Zeit bis zum Sprung.',
  normal: 'Normal — unbeobachtet setzt sie nach etwa sieben Sekunden zum Sprung an.',
  nah:    'Nah — keine fünf Sekunden. Sie ruft öfter, und du kommst kaum zum Horchen.',
};
document.querySelectorAll('.chip[data-diff]').forEach(el => {
  el.classList.toggle('sel', el.dataset.diff === gKey);
  el.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-diff]').forEach(o => o.classList.remove('sel'));
    el.classList.add('sel');
    gKey = el.dataset.diff; GR = GRADE[gKey];
    localStorage.setItem('wi_diff', gKey);
    $('diffText').textContent = DIFFTEXT[gKey];
  });
});
document.querySelectorAll('.chip[data-q]').forEach(el => {
  el.classList.toggle('sel', el.dataset.q === qKey);
  el.addEventListener('click', () => { localStorage.setItem('wi_q', el.dataset.q); location.reload(); });
});
$('bStart').addEventListener('click', () => { tonStart(); zeige(scDiff); });
$('bZurueck').addEventListener('click', () => zeige(scTitle));
$('bPlay').addEventListener('click', () => zeige(scBrief));
scBrief.addEventListener('click', spielStart);
$('bWeiter').addEventListener('click', () => { if(STAND.phase==='pause'){ STAND.phase='spiel'; zeige(null); } });
$('bTon').addEventListener('click', () => tonSchalten(!SND.an));
$('bNeu').addEventListener('click', () => { neuStart(); STAND.phase='spiel'; zeige(null); });
$('bNochmal').addEventListener('click', () => { neuStart(); STAND.phase='spiel'; zeige(null); });
for(const id of ['bRaus','bRaus2'])
  $(id).addEventListener('click', () => location.href = '../index.html');

/* Ladeanzeige: das Modell wiegt drei Megabyte, das darf man sehen. */
{
  const f = $('ladefuell'), b = $('bStart');
  const tick = setInterval(() => {
    f.style.width = Math.round(clamp(ladeStand,0,1)*100) + '%';
    if(ladeStand >= 1){
      clearInterval(tick);
      b.disabled = false;
      b.textContent = '▶ BAND ABSPIELEN';
    }
  }, 120);
  if(IS_TOUCH) $('titelHint').textContent = 'LINKS LAUFEN · RECHTS UMSEHEN · KNOPF RENNEN';
}

/* Prüfhaken für die Messung von außen. */
window.WI = {
  stand(){ return {
    x:+P.x.toFixed(2), z:+P.z.toFixed(2), y:+P.y.toFixed(2),
    phase:STAND.phase, riss:+STAND.riss.toFixed(2),
    mast:+mastAbstand().toFixed(1), erreicht:MAST.erreicht,
    gelaufen:+P.gelaufen.toFixed(1), anzahl:SIE.length, geladen:sieGeladen,
    sie: SIE.map(g => ({ abstand:+g.abstand.toFixed(1), drang:+g.drang.toFixed(2),
                         gesehen:g.gesehen, spruenge:g.spruenge })) }; },
  hoehe:(x,z)=>hoeheBei(x,z),
  welt:WELT,
  setzSie(i,x,z){ const g=SIE[i]; if(!g) return; g.x=modW(x); g.z=modW(z); g.y=hoeheBei(g.x,g.z); },
  blick(g,n){ P.gier=P.gierZ=g; if(n!==undefined) P.nick=P.nickZ=n; },
  setz(x,z){ P.x=modW(x); P.z=modW(z); P.y=hoeheBei(P.x,P.z); },
  mehr(d){ return neueGestalt(d||100); },
  himmelFarbe: () => '#' + himmelMat.uniforms.uOben.value.getHexString(),
  setzMast(x,z){ MAST.x=modW(x); MAST.z=modW(z); mastNachfuehren(); },
  P, SIE, STAND, IN, GR, ABDRUCK, DURCH, MAST,
};

bild();

/* ---------- Empfindlichkeit des Umsehens ----------
   Ein Regler im Pausenbild, über alle Bänder hinweg gemerkt. */
{
  const regler = document.getElementById('empfRegler');
  const wert   = document.getElementById('empfWert');
  if(regler){
    const zeigen = () => { if(wert) wert.textContent = EMPF.toFixed(1).replace('.', ',') + '×'; };
    regler.value = Math.round(EMPF * 100);
    zeigen();
    regler.addEventListener('input', () => {
      EMPF = clamp(regler.value / 100, 0.3, 2.5);
      localStorage.setItem('ft_empf', String(EMPF));
      zeigen();
    });
    // Der Regler liegt im Pausenbild; ein Wisch darauf darf nicht umsehen
    for(const art of ['pointerdown','pointermove','pointerup'])
      regler.addEventListener(art, e => e.stopPropagation());
  }
}
