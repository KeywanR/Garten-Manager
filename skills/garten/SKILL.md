---
name: garten
description: Führt die Garten-Manager KI-Diagnose sofort aus, statt auf den morgendlichen Lauf zu warten. Nutzen bei „Garten", „Gartendiagnose", „/garten", „Pflanzen prüfen", „neue Gartenfotos auswerten" — oder englisch „garden check", „garden diagnosis", „how are my plants doing", „analyze my plant photos".
---

# Garten-Manager: Diagnose auf Abruf

Dieselbe Auswertung wie der tägliche Lauf, nur sofort. Beide teilen sich dasselbe
Gedächtnis (`sourcePhoto`), deshalb wertet ein Ad-hoc-Lauf nie ein Foto aus, das
der Morgenlauf schon gesehen hat — und umgekehrt.

**Voraussetzung:** der Google-Drive-Connector muss verbunden sein. Ist er es
nicht, sofort abbrechen und den Nutzer bitten, ihn in den Einstellungen zu
verbinden — niemals raten oder mit Platzhalterdaten weiterarbeiten.

**Wartung:** Diese Datei und der Prompt der geplanten Routine (claude.ai →
Routines → „Garten-Manager Tagesdiagnose") beschreiben denselben Ablauf und
teilen sich dasselbe Gedächtnis. Änderungen hier immer auch dort nachziehen —
driften die beiden auseinander (etwa beim Statuswert oder bei `sourcePhoto`),
verdirbt das still den gemeinsamen Ledger.

## Ordner — immer per ID ansprechen

Es gibt mehrere Ordner namens „Garten-Manager". Niemals per Namenssuche gehen.

- Datenordner: `1gf3X6Ia1iVLBYoOfm94S37DioQ67Mby8`
- Unterordner `photos`: `1GcLAPmjVo4nmT1Yft1aKUMPmSGLMA9QA`

## 1. Zustand lesen

`gartenmanager-ki-akte.json` im Datenordner lesen. Daraus:

- `plants[]` — je Pflanze `plant.id`, `plant.name`, `currentHealth`, `profile`,
  `careSchedule`, `timeline`, `photos[]` (mit `driveFile`, `date`)
- `unassignedPhotos[]` — importierte Fotos ohne Pflanze
- `kiProposals[]` — frühere Vorschläge mit `status`

**ZUGEORDNET** = alle `photos[].driveFile` → Pflanzen-id.
**OFFEN** = alle `unassignedPhotos[].driveFile`.

## 2. Was schon ausgewertet ist

Alle Dateien `gartenmanager-ki-diagnose.json` im Datenordner lesen und alle
`sourcePhoto`-Werte sammeln → **BEREITS_AUSGEWERTET**.

**Achtung:** Google Drive erlaubt mehrere Dateien mit identischem Namen im
selben Ordner, und genau so ist es hier gewollt — jeder Lauf legt eine weitere
`gartenmanager-ki-diagnose.json` an. Beim Lesen deshalb **alle** Treffer für
diesen Namen im Ordner auflisten und auswerten, nicht nur den neuesten. Wird
auch nur eine ältere Datei übersehen, gelten deren Fotos als unbearbeitet und
werden ein zweites Mal diagnostiziert — mit doppelten Einträgen und doppelten
Vorschlägen als Folge.

## 3. Kandidaten

**NEU** = (ZUGEORDNET ∪ OFFEN) − BEREITS_AUSGEWERTET.

Der `photos`-Ordner ist ein Archiv und wird nie aufgeräumt. Dateien, die weder in
ZUGEORDNET noch in OFFEN stehen, sind ersetzte Titelbilder oder in der App
gelöschte Fotos — **niemals auswerten, niemals zurückspielen**, sonst tauchen
gelöschte Bilder wieder auf. Still ignorieren.

Ist NEU leer: nichts schreiben, nur „Keine neuen Fotos." melden.
Sonst höchstens 12 Stück, neueste zuerst.

## 4. Beurteilen — mit Bildverlauf

Jedes neue Foto ansehen. Hat die Pflanze in `photos[]` ein älteres Bild, auch das
**jüngste ältere Foto** öffnen und beide vergleichen. Konkret sagen, was sich
verändert hat: hat sich die Vergilbung ausgebreitet, gibt es neue Triebe, hat die
Behandlung angeschlagen. Nicht nur „Zustand heute", sondern „besser oder
schlechter als beim letzten Mal".

`profile` und `timeline` berücksichtigen. Vom Nutzer bearbeiteter Text
(`profile.updated` gesetzt) ist maßgeblich — nicht widersprechen, keine
überholten Ratschläge wiederholen.

## 5. Fotos ohne Pflanze

- Passt zu einer bestehenden Pflanze → `plantId` + `assignPhoto`.
- Offensichtlich neue Pflanze → `addPlant` mit `needsReview: true` **und**
  `assignPhoto`, damit das Bild im Fotoverlauf landet. Die App legt sie zur
  Bestätigung vor; Name, Kategorie und Notiz kann der Nutzer korrigieren.
- Unsicher → nichts schreiben, im Bericht erwähnen.

## 6. Pflegeplan als Ganzes vorschlagen

Ändert sich der Zustand einer Pflanze, ändert sich meist nicht nur *was
dazukommt*, sondern auch *was so nicht mehr stimmt*. Deshalb immer den
**gesamten** Plan vorschlagen — über `proposePlan`, nie über `addTasks`:

```json
"proposePlan": {
  "reason": "<warum sich der Plan ändert, ein bis zwei Sätze>",
  "addTasks":    [{"type":"…","title":"…","interval":7,"months":[7,8],"note":"…","reason":"…"}],
  "changeTasks": [{"id":"tomaten:krankheit","interval":3,"reason":"engmaschiger kontrollieren"}],
  "removeTasks": [{"id":"tomaten:duengen","reason":"ab August keine N-Düngung"}]
}
```

Prüfe bei jedem Vorschlag ausdrücklich den Bestand in `careSchedule`:

- **Widerspricht** eine bestehende Aufgabe der neuen Einschätzung, gehört sie in
  `removeTasks` — nicht stehen lassen. Beispiel: die Diagnose sagt „ab jetzt
  kein Stickstoff mehr", während alle 10 Tage weiter gedüngt wird. Beides
  parallel ist nicht bloß unordentlich, es schadet der Pflanze.
- **Passt** eine bestehende Aufgabe grundsätzlich, braucht aber einen anderen
  Rhythmus, gehört sie in `changeTasks` — kein zweiter, ähnlicher Eintrag
  daneben.
- Nur was wirklich fehlt, kommt in `addTasks`.

Der Nutzer bestätigt den Plan in der App als **eine** Entscheidung; erst dann
greift er. Bereits `rejected`-Vorschläge aus `kiProposals` nicht wiederholen,
und nichts vorschlagen, was in `suppressedTasks` bewusst ausgesetzt wurde.

## Stopp-Signale

Kurz prüfen, bevor du schreibst. Jede dieser Regungen ist nachvollziehbar und
trotzdem falsch:

- Du willst im `photos`-Ordner aufräumen, umbenennen oder löschen — **stopp**.
  Das Archiv ist die Fotohistorie; gelöscht wird dort nie etwas.
- Du willst `addTasks` statt `proposePlan` schreiben, weil die Maßnahme
  offensichtlich richtig ist — **stopp**. Der Pflegeplan gehört dem Nutzer.
- Du schlägst etwas Neues vor, ohne geprüft zu haben, ob eine bestehende
  Aufgabe dem widerspricht — **stopp**. Alt und neu nebeneinander ist der
  gefährlichste Zustand.
- Du bist dir bei der Zuordnung nicht sicher, willst aber trotzdem
  `assignPhoto` setzen — **stopp**. Lieber im Bericht erwähnen.
- Du willst `needsReview` weglassen, weil die Bestimmung sicher wirkt —
  **stopp**. Eine aus einem Foto erkannte Pflanze bleibt eine Vermutung.
- Du willst ein Foto auswerten, das weder in ZUGEORDNET noch in OFFEN steht —
  **stopp**. Das ist ein ersetztes oder gelöschtes Bild.
- Du willst einen eigenen Statustext formulieren — **stopp**. Nur die vier
  Werte, zeichengenau, sonst verwirft die App den Eintrag stillschweigend.

## 7. Schreiben

Eine neue Datei `gartenmanager-ki-diagnose.json` im Datenordner anlegen
(`parentId` = `1gf3X6Ia1iVLBYoOfm94S37DioQ67Mby8`):

```json
{"format":"gartenmanager-ki-diagnose","generated":"<ISO>","entries":[…]}
```

Eintrag:

```json
{
  "id": "ki-<YYYY-MM-DD>-<dateiname ohne endung, nur a-z0-9->",
  "sourcePhoto": "<exakter Dateiname>",
  "plantId": "<Pflanzen-id>",
  "date": "<YYYY-MM-DD>",
  "status": "<einer der vier Werte>",
  "reason": "<ein Satz>",
  "observation": "<1–3 Sätze; bei Bildvergleich die Veränderung ausdrücklich nennen>",
  "profile": {"<location|planted|watering|fertilizing|diseases|treatments|harvest|notes>": "<nur wenn nötig>"},
  "assignPhoto": {"file": "<dateiname>", "caption": "<kurz>"},
  "addPlant": {"name": "<name>", "cat": "<kategorie>", "note": "<kurz>", "needsReview": true},
  "proposePlan": {
    "reason": "<warum sich der Plan ändert>",
    "addTasks":    [{"type":"<kurz>","title":"<titel>","interval":14,"months":[5,6,7],"note":"<hinweis>","reason":"<warum>"}],
    "changeTasks": [{"id":"<pflanzenid>:<typ>","interval":7,"reason":"<warum>"}],
    "removeTasks": [{"id":"<pflanzenid>:<typ>","reason":"<warum>"}]
  }
}
```

`id` und `sourcePhoto` sind Pflicht — ohne `sourcePhoto` wird das Foto morgen
erneut ausgewertet. Die übrigen Felder nur, wenn zutreffend.

## Harte Regeln

- `status` ist **zeichengenau** einer dieser vier Werte:
  `🟢 Gesund`, `🟡 Beobachten`, `🟠 Behandlung läuft`, `🔴 Handlungsbedarf`.
  Alles andere verwirft die App stillschweigend.
- Schlechter als `🟢 Gesund` nur, wenn auf dem Foto wirklich etwas erkennbar ist.
- Das Feld `photo` **nie** verwenden — die App hat die Bilder bereits.
  Zum Zuordnen `assignPhoto` nutzen.
- **Nie** `addTasks` — immer `proposeTasks`.
- In Drive nichts ändern, verschieben oder löschen. Es wird ausschließlich diese
  eine neue Datei angelegt.

## Was das Ganze nicht ist

Eine begründete Einschätzung anhand von Fotos, keine gesicherte Diagnose. Bei
Unsicherheit sagen und eine Prüfung vor Ort empfehlen, statt sich festzulegen.
Keine Pflanzenschutzmittel-Dosierungen empfehlen, die eine Fachberatung
erfordern.

## Bericht

Höchstens sechs Zeilen. Zuerst und deutlich: **welche neuen Pflanzen angelegt
wurden** (oder „keine"). Dann Anzahl ausgewerteter Fotos, betroffene Pflanzen,
Veränderungen aus dem Bildvergleich, offene Vorschläge zur Bestätigung, und
übersprungene Fotos.

## Danach

Die App holt sich die Diagnosen beim nächsten Sync. Neue Pflanzen und
Behandlungsvorschläge stehen im Reiter **KI-Diagnosen** unter „Zur Bestätigung".

## Installation

- **claude.ai (Browser, iPhone, iPad):** Einstellungen → Capabilities/Skills →
  diesen Ordner als Skill hinzufügen. Danach ist `/garten` überall verfügbar.
- **Claude Code:** nach `~/.mozart/skills/garten/` kopieren und
  `uv run python tools/sync-skills.py` ausführen.
