#!/usr/bin/env python3
"""
Baut aus dem Ordner foundtape/ EINE HTML-Datei mit allen drei Bändern.

Der Unterschied zu build-single.py: dort steckt nur Ebene 0 drin, weil die
Folgebänder ES-Module in eigenen Ordnern sind. Hier werden auch die
eingepackt — three.module.js und die Zusatzlader landen als Blob-Adressen
in einer Importkarte, die beim Start geschrieben wird.

Ein Band pro Seitenaufruf. Die Bänder tauschen über die Adresszeile
(#b0/#b1/#b2); ein Wechsel lädt die Datei neu und startet das andere Band.
Anders geht es nicht sauber: jedes Band greift auf feste Kennungen im
Markup zu, hält eine eigene WebGL-Fläche und eine eigene Schleife.

    python3 tools/build-komplett.py      -> dist/foundtape-komplett.html
"""
import base64, json, re, sys, pathlib

WURZEL = pathlib.Path(__file__).resolve().parent.parent
Q      = WURZEL / 'foundtape'
ZIEL   = WURZEL / 'dist' / 'foundtape-komplett.html'

TYPEN = {'.jpg':'image/jpeg', '.png':'image/png', '.glb':'model/gltf-binary',
         '.mp3':'audio/mpeg', '.json':'application/json'}

def uri(pfad):
    typ = TYPEN.get(pfad.suffix.lower(), 'application/octet-stream')
    return 'data:' + typ + ';base64,' + base64.b64encode(pfad.read_bytes()).decode('ascii')

def lies(rel):
    return (Q / rel).read_text(encoding='utf-8')

def stil_und_koerper(html):
    """Kopfstile und Rumpfmarkup eines Bandes, ohne Skripte und Verweise."""
    stile = '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', html, re.S))
    rumpf = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
    rumpf = re.sub(r'<script.*?</script>', '', rumpf, flags=re.S)
    return stile, rumpf.strip()

def block(name, quelle):
    """Quelltext als unausgeführter Textblock — das Startskript holt ihn."""
    sicher = quelle.replace('</script', '<\\/script')
    return '<script type="text/plain" data-ft="%s">%s</script>' % (name, sicher)

def main():
    # ---------- Verweise zwischen den Bändern auf die Adresszeile umbiegen ----------
    spiel0 = lies('game.js') \
        .replace("location.href = './poolrooms/index.html'", "location.href = '#b1'") \
        .replace("ziel: './poolrooms/index.html'", "ziel: '#b1'") \
        .replace("ziel: './wiese/index.html'",     "ziel: '#b2'")
    spiel1 = lies('poolrooms/spiel.js') \
        .replace("location.href = '../wiese/index.html'", "location.href = '#b2'") \
        .replace("location.href = '../index.html'",       "location.href = '#b0'")
    spiel2 = lies('wiese/spiel.js') \
        .replace("location.href = '../index.html'", "location.href = '#b0'") \
        .replace("'./modelle/sirene.glb'", "(window.FT_ASSETS['wiese/modelle/sirene.glb'])")

    for name, text, muss in [('game.js', spiel0, "'#b1'"), ('poolrooms', spiel1, "'#b2'"),
                             ('wiese', spiel2, "FT_ASSETS['wiese/modelle/sirene.glb']")]:
        if muss not in text:
            raise SystemExit('Umbiegen misslungen in ' + name + ': ' + muss)

    # ---------- Module: relative Importe auf benannte umstellen ----------
    dreiM = lies('lib/three.module.js').replace("from './three.core.js'", "from 'ft-three-core'")
    dreiK = lies('lib/three.core.js')
    gltfM = lies('lib/jsm/loaders/GLTFLoader.js') \
        .replace("from '../utils/BufferGeometryUtils.js'", "from 'three/addons/utils/BufferGeometryUtils.js'") \
        .replace("from '../utils/SkeletonUtils.js'",       "from 'three/addons/utils/SkeletonUtils.js'")
    skelM = lies('lib/jsm/utils/SkeletonUtils.js')
    bufM  = lies('lib/jsm/utils/BufferGeometryUtils.js')
    if "from './three.core.js'" in dreiM:
        raise SystemExit('three.module.js: Kernverweis nicht umgestellt')

    # ---------- Beiwerk ----------
    assets = {}
    for name in ['wall.jpg', 'wall2.jpg', 'floor.jpg', 'photo.jpg', 'monster.glb']:
        assets['assets/' + name] = uri(Q / 'assets' / name)
    stuecke = json.loads((Q / 'assets/music/tracks.json').read_text(encoding='utf-8'))
    liste = stuecke.get('tracks', [])
    for t in liste:
        d = Q / 'assets/music' / t['file']
        if d.exists(): assets['assets/music/' + t['file']] = uri(d)
    assets['assets/music/tracks.json'] = ('data:application/json;base64,' +
        base64.b64encode(json.dumps({'tracks': liste}).encode()).decode())
    assets['wiese/modelle/sirene.glb'] = uri(Q / 'wiese/modelle/sirene.glb')

    # ---------- Bänder ----------
    baender = {}
    for schluessel, datei in [('b0', 'index.html'), ('b1', 'poolrooms/index.html'), ('b2', 'wiese/index.html')]:
        stil, rumpf = stil_und_koerper(lies(datei))
        # Das Standbild im Markup zeigt sonst auf eine Datei neben der HTML
        rumpf = rumpf.replace('src="assets/photo.jpg"', 'src="' + assets['assets/photo.jpg'] + '"')
        if re.search(r'(?:src|href)="(?!data:|#|https?:)[^"]+"', rumpf):
            offen = re.findall(r'(?:src|href)="(?!data:|#|https?:)([^"]+)"', rumpf)
            raise SystemExit('noch Dateiverweise im Markup von ' + datei + ': ' + str(offen))
        baender[schluessel] = { 'stil': stil, 'rumpf': rumpf }
    titel = { 'b0': 'FOUND TAPE · EBENE 0', 'b1': 'FOUND TAPE · EBENE 1', 'b2': 'FOUND TAPE · EBENE 2' }

    bloecke = '\n'.join([
        block('three.min',  lies('lib/three.min.js')),
        block('gltf.alt',   lies('lib/GLTFLoader.js')),
        block('spiel0',     spiel0),
        block('three.mod',  dreiM),
        block('three.kern', dreiK),
        block('gltf.mod',   gltfM),
        block('skelett',    skelM),
        block('puffer',     bufM),
        block('spiel1',     spiel1),
        block('spiel2',     spiel2),
    ])

    start = r'''
(() => {
  const hol = n => document.querySelector('script[data-ft="' + n + '"]').textContent;
  const B = window.FT_BAENDER;
  let wahl = (location.hash || '#b0').slice(1);
  if(!B[wahl]) wahl = 'b0';

  document.title = window.FT_TITEL[wahl];
  const st = document.createElement('style');
  st.textContent = B[wahl].stil;
  document.head.appendChild(st);
  document.body.innerHTML = B[wahl].rumpf;

  /* Bandwechsel: die Datei enthält alle drei, aber immer nur eines läuft.
     Jedes Band greift auf feste Kennungen zu und hält eine eigene Fläche;
     zwei davon nebeneinander im selben Dokument gäbe Krach. Also neu laden. */
  addEventListener('hashchange', () => location.reload());

  const klassisch = (text) => {
    const s = document.createElement('script');
    s.textContent = text;
    document.head.appendChild(s);
  };
  const alsModul = (text) => {
    const b = new Blob([text], { type: 'text/javascript' });
    const s = document.createElement('script');
    s.type = 'module'; s.src = URL.createObjectURL(b);
    document.head.appendChild(s);
  };
  const adresse = (text) => URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));

  if(wahl === 'b0'){
    klassisch(hol('three.min'));
    klassisch(hol('gltf.alt'));
    klassisch(hol('spiel0'));
    return;
  }

  /* Die Importkarte muss stehen, bevor das erste Modul geladen wird —
     deshalb hier, von Hand, mit Blob-Adressen statt Dateipfaden. */
  const karte = {
    'three': adresse(hol('three.mod')),
    'ft-three-core': adresse(hol('three.kern')),
    'three/addons/loaders/GLTFLoader.js': adresse(hol('gltf.mod')),
    'three/addons/utils/SkeletonUtils.js': adresse(hol('skelett')),
    'three/addons/utils/BufferGeometryUtils.js': adresse(hol('puffer')),
  };
  const km = document.createElement('script');
  km.type = 'importmap';
  km.textContent = JSON.stringify({ imports: karte });
  document.head.appendChild(km);

  alsModul(hol(wahl === 'b1' ? 'spiel1' : 'spiel2'));
})();
'''

    html = ('<!doctype html>\n<html lang="de">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">\n'
        '<meta name="theme-color" content="#0a0c10">\n'
        '<title>FOUND TAPE</title>\n'
        '<style>html,body{margin:0;padding:0;background:#000;overflow:hidden}</style>\n'
        '<script>window.FT_ASSETS = ' + json.dumps(assets, separators=(',', ':')).replace('</', '<\\/') + ';\n'
        'window.FT_BAENDER = ' + json.dumps(baender, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + ';\n'
        'window.FT_TITEL = ' + json.dumps(titel, ensure_ascii=False) + ';</script>\n'
        + bloecke + '\n'
        '</head>\n<body>\n'
        '<script>' + start + '</script>\n'
        '</body>\n</html>\n')

    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    ZIEL.write_text(html, encoding='utf-8')
    mb = ZIEL.stat().st_size / 1024 / 1024
    print('geschrieben:', ZIEL.relative_to(WURZEL), '(%.1f MB)' % mb)
    print('Bänder:', ', '.join(baender), '· Beiwerk:', len(assets), 'Dateien')

if __name__ == '__main__':
    main()
