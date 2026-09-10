#!/usr/bin/env python3
"""
Baut aus dem Ordner foundtape/ eine einzelne HTML-Datei.

Alles wandert hinein: three.js, der Lader, das Spiel, Texturen, das Modell,
das Foto und die Musik. Die fertige Datei läuft per Doppelklick, ohne Server
und ohne Netz — praktisch zum Weitergeben.

    python3 tools/build-single.py            -> dist/foundtape.html
    python3 tools/build-single.py --ohne-musik
"""
import base64, json, re, sys, pathlib

WURZEL = pathlib.Path(__file__).resolve().parent.parent
QUELLE = WURZEL / 'foundtape'
ZIEL   = WURZEL / 'dist' / 'foundtape.html'
ZIEL2  = WURZEL / 'index.html'        # dieselbe Datei als Startseite des Projekts

TYPEN = {'.jpg':'image/jpeg', '.png':'image/png', '.glb':'model/gltf-binary',
         '.mp3':'audio/mpeg', '.json':'application/json'}

def daten_uri(pfad: pathlib.Path) -> str:
    typ = TYPEN.get(pfad.suffix.lower(), 'application/octet-stream')
    return 'data:' + typ + ';base64,' + base64.b64encode(pfad.read_bytes()).decode('ascii')

def main():
    ohne_musik = '--ohne-musik' in sys.argv

    html = (QUELLE / 'index.html').read_text(encoding='utf-8')
    spiel = (QUELLE / 'game.js').read_text(encoding='utf-8')
    three = (QUELLE / 'lib' / 'three.min.js').read_text(encoding='utf-8')
    gltf  = (QUELLE / 'lib' / 'GLTFLoader.js').read_text(encoding='utf-8')

    # --- Sammeln, was eingebettet wird ---
    assets = {}
    for name in ['wall.jpg', 'wall2.jpg', 'floor.jpg', 'photo.jpg', 'monster.glb']:
        assets['assets/' + name] = daten_uri(QUELLE / 'assets' / name)

    stuecke = json.loads((QUELLE / 'assets' / 'music' / 'tracks.json').read_text(encoding='utf-8'))
    liste = [] if ohne_musik else stuecke.get('tracks', [])
    for t in liste:
        datei = QUELLE / 'assets' / 'music' / t['file']
        if datei.exists():
            assets['assets/music/' + t['file']] = daten_uri(datei)
        else:
            print('  fehlt, wird übersprungen:', datei.name)
    assets['assets/music/tracks.json'] = ('data:application/json;base64,' +
        base64.b64encode(json.dumps({'tracks': liste}).encode('utf-8')).decode('ascii'))

    # --- Ersetzen ---
    html = html.replace('<link rel="manifest" href="manifest.webmanifest">', '')
    html = re.sub(r'\s*<link rel="(icon|apple-touch-icon)"[^>]*>', '', html)
    html = html.replace('src="assets/photo.jpg"', 'src="' + assets['assets/photo.jpg'] + '"')

    # Der Dienst für den Offline-Betrieb ergibt in einer Einzeldatei keinen Sinn
    html = re.sub(r'<script>\s*//[^\n]*Service Worker.*?</script>', '', html, flags=re.S)
    html = re.sub(r"<script>\s*if\('serviceWorker' in navigator.*?</script>", '', html, flags=re.S)

    # Ebene 1 liegt als eigener Ordner vor und lässt sich nicht einbetten;
    # in der Einzeldatei bleibt sie deshalb zu.
    tabelle = ('<script>window.FT_EINZELDATEI = true; window.FT_ASSETS = ' +
               json.dumps(assets, ensure_ascii=False, separators=(',', ':')) + ';</script>')

    html = html.replace('<script src="lib/three.min.js"></script>',
                        tabelle + '\n<script>' + three + '</script>')
    html = html.replace('<script src="lib/GLTFLoader.js"></script>',
                        '<script>' + gltf + '</script>')
    html = html.replace('<script src="game.js"></script>',
                        '<script>' + spiel + '</script>')

    for rest in ['lib/three.min.js', 'lib/GLTFLoader.js', 'game.js']:
        if 'src="' + rest + '"' in html:
            raise SystemExit('nicht eingebettet: ' + rest)

    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    ZIEL.write_text(html, encoding='utf-8')
    # Dieselbe Datei liegt als index.html im Wurzelverzeichnis, damit das Spiel
    # beim Öffnen des Projekts (und auf GitHub Pages) direkt startet.
    ZIEL2.write_text(html, encoding='utf-8')
    mb = ZIEL.stat().st_size / 1024 / 1024
    print('geschrieben:', ZIEL.relative_to(WURZEL), 'und', ZIEL2.relative_to(WURZEL), '(%.1f MB)' % mb)
    print('eingebettet:', len(assets), 'Dateien' + (' — ohne Musik' if ohne_musik else ''))

if __name__ == '__main__':
    main()
