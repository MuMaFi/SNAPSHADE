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
  bekommt oben im Sucher einen Pfeil zum Ausgang.

Jede Etage entsteht aus einem Seed. Derselbe Seed ergibt dieselbe Etage — praktisch,
um eine gute Runde noch einmal zu spielen oder sie weiterzugeben.

## Einstellungen und URL-Parameter

| Parameter | Bedeutung |
|---|---|
| `?seed=123456` | feste Etage |
| `?yellow=0.4` | Stärke des Gelbstichs, `0` schaltet ihn ab (Standard `0.72`) |

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
cd android && gradle assembleDebug     # oder ./gradlew assembleDebug
# Ergebnis: android/app/build/outputs/apk/debug/app-debug.apk
```

Die App braucht **keine Internet-Berechtigung** — sie liefert das Spiel aus ihren
eigenen Assets über einen lokalen `https`-Ursprung aus (`WebViewAssetLoader`),
damit WebGL, Fetch und Texturen ohne Sonderrechte laufen.

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
Ausgang, Akku, Ausdauer, Anzeige, Nachtsicht und der Gelbstich.
