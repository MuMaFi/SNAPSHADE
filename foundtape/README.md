# FOUND TAPE — SUBLEVEL 0

Ein Backrooms-Horrorspiel fürs Handy. Aus dem gefundenen Band ist ein Spiel geworden:
Statt einer Kamerafahrt, die von allein läuft, hältst du den Camcorder jetzt selbst.

**Ziel:** sechs verlorene Bänder einsammeln, danach den Ausgang finden — und dem,
was hier unten mitläuft, nicht zu nahe kommen.

---

## Spielen

**Im Browser** — `index.html` öffnen. Es braucht keinen Server, aber mit einem lokalen
Server ist es zuverlässiger (Service Worker, Texturen):

```bash
cd foundtape
python3 -m http.server 8000
# dann http://localhost:8000 aufrufen
```

**Als App aufs Handy (PWA)** — die Seite über HTTPS ausliefern (z. B. GitHub Pages:
`https://<benutzer>.github.io/SNAPSHADE/foundtape/`), im Browser öffnen und
„Zum Startbildschirm hinzufügen". Danach läuft alles offline, der Service Worker legt
Spiel, Texturen und Modell im Cache ab.

**Als APK** — siehe [APK bauen](#apk-bauen) weiter unten.

## Steuerung

| Handy | Tastatur / Maus |
|---|---|
| linke Bildhälfte ziehen = gehen | `W A S D` oder Pfeiltasten |
| rechte Bildhälfte ziehen = umsehen | Maus (Klick ins Bild fängt den Zeiger) |
| Knopf **RENNEN** halten (oder den Stick weit durchdrücken) | `Shift` |
| Knopf **NV** = Nachtsicht | `F` |
| Knopf **AUFHEBEN** an der Tür | `E` |
| Knopf **II** oben rechts = Pause | `Esc` |
| — | `M` schaltet den Ton stumm |

## Was im Sublevel gilt

- **Bänder** liegen über die Etage verteilt. Der Camcorder empfängt sie: das
  `SIGNAL` im Sucher steigt und das Ticken wird schneller, je näher du dem
  nächsten Band kommst. Alle sechs entriegeln den Ausgang.
- **Nachtsicht** frisst Akku. In den ausgefallenen Bereichen siehst du ohne sie
  nichts — mit ihr dafür kaum Details. Ersatzakkus liegen herum.
- **Ausdauer** reicht für gut sechs Sekunden Sprint und lädt sich langsam nach.
- **Die Gestalt** streift umher, hört Schritte (Rennen weit, Gehen kurz, Stehen gar
  nicht) und sieht dich auf freier Linie. Wenn sie dich jagt, ist sie schneller als
  dein Gehtempo, aber langsamer als dein Sprint. Verlierst du sie aus ihrer Sicht,
  sucht sie erst deine letzte bekannte Stelle ab — und gibt danach auf.
  Das Licht flackert, der Ton kippt und das Band reißt, je näher sie kommt.
- **Das Originalfoto** liegt an dem Ort, der im Foto zu sehen ist. Wer es findet,
  bekommt oben im Sucher einen Pfeil zum Ausgang. Spätestens mit dem letzten Band
  erscheint der Pfeil ohnehin.
- **Ein Band aus dem Regal zu nehmen bleibt nicht unbemerkt.** Die Gestalt geht der
  Stelle nach, und mit jedem gefundenen Band wird sie in der Jagd etwas schneller.
  Bleibt sie zu lange am anderen Ende der Etage, wandert sie von selbst in deine
  Gegend — hörbar an den schweren Schritten, bevor man sie sieht.

Jede Etage entsteht aus einem Seed. Derselbe Seed ergibt dieselbe Etage — praktisch,
um eine gute Runde noch einmal zu spielen oder sie weiterzugeben.

## Musik

Die Stücke liegen in `assets/music/`, die Abspielliste in
[`assets/music/tracks.json`](assets/music/tracks.json). Ein weiteres Stück kommt so
dazu: MP3 in den Ordner legen, eine Zeile in `tracks.json` ergänzen —

```json
{ "file": "meinstueck.mp3", "titel": "Mein Stück", "von": "Wer es gemacht hat" }
```

Die Liste wird beim Start gemischt, zwischen den Stücken liegt Stille, und in der
Nähe der Gestalt wird die Musik etwas lauter. Ein- und ausschalten lässt sie sich
im Pausenbildschirm (`II` oben rechts); die Einstellung wird gemerkt.
Für die APK und den Offline-Cache gilt: neue Dateien bitte auch in
[`sw.js`](sw.js) in die Liste `FILES` eintragen.

Enthalten ist derzeit **Handprint** von Kane Parsons und Edo Van Breemen aus dem
Backrooms-Soundtrack. Das Stück gehört seinen Urhebern — für eine
Veröffentlichung des Spiels bräuchte es deren Erlaubnis.

## Einstellungen und URL-Parameter

| Parameter | Bedeutung |
|---|---|
| `?seed=123456` | feste Etage |
| `?yellow=0.5` | Stärke der Farbgebung, `0` schaltet sie ab (Standard `1.0`) |

Die Qualitätsstufe (`NIEDRIG` / `MITTEL` / `HOCH`) steht im Startbildschirm und wird
gemerkt. Sie steuert Auflösung, Anzahl der Lichter, Schatten und Staub. Auf dem Handy
ist `MITTEL` voreingestellt.

## APK bauen

Der Workflow [`.github/workflows/build-apk.yml`](../.github/workflows/build-apk.yml)
packt das Spiel in eine WebView-App und legt die fertige APK als Artefakt ab:

1. Auf GitHub unter **Actions → „APK bauen" → Run workflow** starten
   (oder einfach etwas in `foundtape/` oder `android/` ändern und pushen).
2. Nach dem Lauf unten beim Artefakt **`foundtape-apk`** herunterladen, entpacken,
   `app-debug.apk` aufs Handy schieben und installieren
   („Installation aus unbekannten Quellen" muss erlaubt sein).

Bequemer fürs Handy: beim Start des Workflows den Haken **„APK zusätzlich als Release
veröffentlichen"** setzen. Dann landet die APK unter **Releases** als `apk-latest` und
lässt sich direkt auf dem Telefon herunterladen und antippen — ohne Umweg über
Artefakt-Zip und Rechner.

Lokal geht es genauso, wenn das Android SDK installiert ist:

```bash
mkdir -p android/app/src/main/assets/www
cp -r foundtape/. android/app/src/main/assets/www/
rm -f android/app/src/main/assets/www/sw.js
cd android && gradle assembleRelease   # oder ./gradlew assembleRelease
# Ergebnis: android/app/build/outputs/apk/release/app-release.apk
```

Die App braucht **keine Internet-Berechtigung** — sie liefert das Spiel aus ihren
eigenen Assets über einen lokalen `https`-Ursprung aus (`WebViewAssetLoader`),
damit WebGL, Fetch und Texturen ohne Sonderrechte laufen.

### Warum das Handy trotzdem einmal nachfragt

Gebaut wird eine **Release-Fassung mit eigenem Schlüssel** (`android/keystore/`),
nicht mehr die debug-signierte Variante: die App ist damit nicht debuggbar, behält
über alle Fassungen dieselbe Signatur (Updates lassen sich drüberinstallieren) und
fordert keine einzige Berechtigung an. Das ist genau das, was Android als
vertrauenswürdig bewertet.

Was bleibt: Beim ersten Mal fragt Android, ob dieser Quelle (z. B. dem Browser)
das Installieren erlaubt sein soll, und Play Protect meldet einmalig, dass die App
nicht über Google Play kam. Beides lässt sich von außen nicht abschalten — dafür
müsste die App im Play Store liegen. Die Warnung „schädliche App blockiert" sollte
nicht mehr erscheinen.

Der Schlüssel liegt im Repo, damit der Bau ohne Einrichtung funktioniert. Wer das
nicht will, hinterlegt einen eigenen und setzt beim Bau die Variablen
`FT_KEYSTORE`, `FT_KEYSTORE_PASSWORD`, `FT_KEY_ALIAS` und `FT_KEY_PASSWORD`.

## Aufbau

```
foundtape/
  index.html              Hülle, Menüs, Touch-Bedienung
  game.js                 Spiel: Grundriss, Licht, KI, Bild, Ton, Ablauf
  lib/three.min.js        three.js r128
  lib/GLTFLoader.js       Lader für das Modell
  assets/wall.jpg         Tapete   \
  assets/wall2.jpg        Wandputz  |  aus dem Fundstück übernommen
  assets/floor.jpg        Teppich   |
  assets/photo.jpg        Originalfoto
  assets/monster.glb      Die Gestalt (6861 Dreiecke)
  assets/music/           Hintergrundmusik und Abspielliste
  manifest.webmanifest    PWA
  sw.js                   Offline-Cache
  icons/                  App-Symbole
```

Texturen, Foto und Modell stammen unverändert aus der übergebenen Datei
`foundtape_sublevel0.html`; dort steckten sie als Base64 im Quelltext und liegen jetzt
als eigene Dateien vor, damit sie zwischengespeichert werden können.

Aus dem Fundstück übernommen sind außerdem der Grundriss-Generator (Wandzüge mit
Durchgängen, Pfeilerreihen), das Deckenraster mit den Leuchtstoffröhren, der
nachgebaute Ort aus dem Foto und der Bild-Shader (Fischauge, Bandfehler, Bloom).
Neu sind Steuerung, Kollision, Wegfindung, die Gestalt als Gegner, Fundstücke,
Ausgang, Akku, Ausdauer, Anzeige, Nachtsicht, Musik, Filmkorn und die Farbgebung.
