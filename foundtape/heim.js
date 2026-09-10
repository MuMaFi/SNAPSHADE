/* ═══════════════════════════════════════════════════════════════════
   Der Heimknopf. Ein Skript für alle Spiele, statt sechzehnmal dasselbe
   Stück Markup: <script src="../heim.js" data-ecke="or"></script>

   data-ziel   Pfad zurück zur Übersicht (Standard: ../index.html)
   data-ecke   ol | or | ul | ur — in welche Ecke er gehört. Welche frei
               ist, ist von Spiel zu Spiel verschieden; gemessen wurde
               das je Spiel, statt überall dieselbe Ecke zu nehmen und
               dabei die Hälfte der Anzeigen zuzudecken.
   data-rand   zusätzlicher Abstand in Pixeln, falls dort schon etwas
               dicht an der Kante sitzt.
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  const s = document.currentScript;
  const ziel = (s && s.dataset.ziel) || '../index.html';
  const ecke = (s && s.dataset.ecke) || 'ol';
  const rand = +((s && s.dataset.rand) || 8);

  const stil = document.createElement('style');
  stil.textContent = `
#heimKnopf{
  position:fixed; z-index:2147483000; width:34px; height:34px;
  display:grid; place-items:center; box-sizing:border-box;
  border:2px solid rgba(255,255,255,.22); border-radius:9px;
  background:rgba(10,12,16,.72); backdrop-filter:blur(3px);
  -webkit-backdrop-filter:blur(3px);
  opacity:.5; transition:opacity .15s, border-color .15s, background .15s;
  cursor:pointer; -webkit-tap-highlight-color:transparent; touch-action:manipulation;
  text-decoration:none; padding:0;
}
#heimKnopf:hover, #heimKnopf:focus-visible{ opacity:1; border-color:#ffb648; background:rgba(10,12,16,.92) }
#heimKnopf:active{ transform:scale(.92) }
#heimKnopf svg{ width:18px; height:18px; display:block }
#heimKnopf path{ fill:#e9edf5 }
#heimKnopf:hover path{ fill:#ffb648 }
@media (hover:none){ #heimKnopf{ opacity:.62; width:38px; height:38px } #heimKnopf svg{width:20px;height:20px} }
@media print{ #heimKnopf{ display:none } }`;
  document.head.appendChild(stil);

  const a = document.createElement('a');
  a.id = 'heimKnopf';
  a.href = ziel;
  a.title = 'Zurück zu allen Spielen';
  a.setAttribute('aria-label', 'Zurück zu allen Spielen');
  a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 11h2.6v9h5.1v-5.6h3.6V20h5.1v-9h2.6L12 3z"/></svg>';
  const y = ecke[0] === 'o' ? 'top' : 'bottom';
  const x = ecke[1] === 'l' ? 'left' : 'right';
  a.style[y] = rand + 'px';
  a.style[x] = rand + 'px';
  // Sicherheitsabstand für Geräte mit Aussparung
  if(y === 'top')    a.style.top    = 'calc(' + rand + 'px + env(safe-area-inset-top, 0px))';
  if(y === 'bottom') a.style.bottom = 'calc(' + rand + 'px + env(safe-area-inset-bottom, 0px))';
  if(x === 'left')   a.style.left   = 'calc(' + rand + 'px + env(safe-area-inset-left, 0px))';
  if(x === 'right')  a.style.right  = 'calc(' + rand + 'px + env(safe-area-inset-right, 0px))';

  const rein = () => document.body.appendChild(a);
  if(document.body) rein(); else addEventListener('DOMContentLoaded', rein);
})();
