# Mein Garten – Gartenmanager v12

Ein persönlicher, **offline-fähiger** Gartenmanager. Er erinnert dich Tag für Tag an die
Pflege deiner Pflanzen **und** führt für jede Pflanze eine strukturierte Akte (Gesundheit,
Verlauf, Fotos), die Claude später über MCP auswerten kann.

Alle Daten bleiben **lokal auf deinem Gerät** (kein Server, kein Konto).

---

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | App-Oberfläche und Stil |
| `app.js` | Logik: Pflanzendaten, Pflegepläne, Datensicherheit, KI-Export |
| `manifest.webmanifest` | Macht die App installierbar |
| `service-worker.js` | Offline-Betrieb (Zwischenspeicher der App) |
| `icon-*.png` | App-Symbole |

Alle Dateien müssen **im selben Ordner** zusammenbleiben (keine Unterordner).

---

## Auf dem iPhone installieren

Ein Service Worker (Offline-Betrieb + „zum Home-Bildschirm hinzufügen") funktioniert nur
über **HTTPS oder localhost** – ein bloßes Öffnen der Datei (`file://`) reicht dafür nicht.

**Empfohlen:** alle Dateien aus diesem Ordner bei einem statischen Hoster ablegen,
z. B. GitHub Pages, Netlify oder Cloudflare Pages. Dann am iPhone:

1. Die Seite in **Safari** öffnen.
2. Auf **Teilen** (Quadrat mit Pfeil) tippen.
3. **„Zum Home-Bildschirm"** wählen.
4. Die App startet nun im Vollbild und läuft auch **ohne Internet**.

> Ohne Hosting läuft die App zwar im Browser, ist aber nicht installierbar und nicht offline.

---

## Erster Start: deine Daten übernehmen

1. App öffnen → Reiter **„Daten & KI"**.
2. **„Sicherung importieren"** → deine Backup-Datei wählen
   (`3762e4fe-…json` bzw. deine aktuellste Sicherung).
3. Vor dem Import wird automatisch ein lokaler Schnappschuss angelegt.
4. Nach dem Import werden die drei verwaisten „Kirschlorbeer"-Aufgaben (leer, Ursache des
   fehlgeschlagenen Integritätschecks) sauber entfernt. **Hecke, Fotos und alle echten
   Aufgaben bleiben vollständig erhalten** – das wurde gegen deine reale Sicherung geprüft.
5. Danach einmal **„Jetzt prüfen"** (Datenprüfung) – sollte jetzt fehlerfrei sein.

**Wichtig zum Speicherort:** Die Daten hängen an der Web-Adresse (Origin). Wechselst du
später den Hoster, ist der Speicher zunächst leer – dann einfach vorher exportieren und
am neuen Ort wieder importieren.

---

## Fotos und Notizen erfassen (mobil gedacht)

- **Schnellfoto:** auf einer Pflanzenkarte auf **„📷 Foto"** – öffnet direkt die Kamera und
  setzt das Titelbild.
- **Pflanzenakte** (Karte antippen): Titelbild, Stammdaten, Gesundheit, Pflegeplan und
  **Fotoverlauf** an einem Ort.
- **Verlaufsfoto mit Notiz:** in der Akte unter „Neue Beobachtung" → **„📷 Foto aufnehmen"**.
  Jedes Foto bekommt Datum und optionale Notiz und landet in der Zeitleiste.
- Fotos werden vor dem Speichern verkleinert, damit der Speicher nicht überläuft.

---

## Datensicherheit (eingebaut)

- **Komplettsicherung** (mit Prüfsumme) inкл. aller Fotos – zum Export/Import.
- **Lokale Schnappschüsse:** automatisch vor Importen, vor dem Zurücksetzen und regelmäßig
  bei Änderungen (die letzten 5 werden behalten).
- **Datenprüfung:** kontrolliert Aufgaben, Datumswerte, Gesundheit, Journal und Fotos.

Trotzdem gilt: gelegentlich eine Komplettsicherung exportieren und woanders ablegen.

---

## KI-Analyse mit Claude (Ausblick)

Im Reiter **„Daten & KI"** erzeugt **„KI-Akte exportieren"** eine strukturierte Datei
(`gartenmanager-ki-akte-…json`): pro Pflanze Gesundheit, Stammdaten, Pflegeplan,
chronologischer Verlauf und Fotoreferenzen (Bilddaten in `photoData`).

Das ist die **Brücke zur Live-Diagnose**. Der nächste Baustein ist ein kleiner
**MCP-Server**, den du lokal startest und mit Claude verbindest. Dann kannst du in Claude
z. B. fragen: *„Wie geht es dem kranken Korkspindelstrauch?"* – und Claude liest den
echten Verlauf und die Fotos und antwortet auf dieser Basis (oft als fundierte Einschätzung
mit Prüf-Empfehlung, nicht als absolute Diagnose).

Diesen MCP-Server baue ich als nächsten Schritt, sobald du bestätigt hast, dass die App
deine Sicherung sauber übernimmt.
