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
  `careSchedule`, `suppressedTasks`, `timeline`, `photos[]` (mit `driveFile`, `date`)
- je Pflanze zusätzlich `userEdited` (`{at, what}` — was der **Nutzer** zuletzt
  selbst geändert hat), `lastKiReview` (wann zuletzt geprüft) und
  `needsReassessment`. Die Entscheidung triffst du allein an
  `needsReassessment: true` — die App hat die beiden Zeitstempel dafür schon
  verglichen. `userEdited.what` sagt dir, *was* korrigiert wurde; `lastKiReview`
  ist reine Information.
- `unassignedPhotos[]` — importierte Fotos ohne Pflanze
- `kiProposals[]` — frühere Vorschläge mit `status`
- `photosPendingUpload` — Bilder, die die App hat, die aber **noch nicht in
  Drive** liegen. Sie stehen absichtlich in keiner Liste; du kannst sie nicht
  öffnen, also wertest du sie nicht aus. Ist die Zahl > 0, im Bericht nennen —
  sonst sieht ein hängender Upload aus wie ein Garten ohne Neuigkeiten.

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

Es gibt **zwei** Arten von Arbeit — beide prüfen:

**(a) NEUE FOTOS** = (ZUGEORDNET ∪ OFFEN) − BEREITS_AUSGEWERTET.
**(b) KORRIGIERTE PFLANZEN** = alle mit `needsReassessment: true` (höchstens 6).

Der `photos`-Ordner ist ein Archiv und wird nie aufgeräumt. Dateien, die weder in
ZUGEORDNET noch in OFFEN stehen, sind ersetzte Titelbilder oder in der App
gelöschte Fotos — **niemals auswerten, niemals zurückspielen**, sonst tauchen
gelöschte Bilder wieder auf. Still ignorieren.

Sind (a) und (b) beide leer: nichts schreiben, nur „Keine neuen Fotos, keine
Korrekturen." melden. Sonst höchstens 12 Fotos, neueste zuerst.

## 4. Beurteilen — mit Bildverlauf

Jedes neue Foto ansehen. Hat die Pflanze in `photos[]` ein älteres Bild, auch das
**jüngste ältere Foto** öffnen und beide vergleichen. Konkret sagen, was sich
verändert hat: hat sich die Vergilbung ausgebreitet, gibt es neue Triebe, hat die
Behandlung angeschlagen. Nicht nur „Zustand heute", sondern „besser oder
schlechter als beim letzten Mal".

`profile` und `timeline` berücksichtigen. Vom Nutzer bearbeiteter Text
(`profile.updated` gesetzt) ist maßgeblich — nicht widersprechen, keine
überholten Ratschläge wiederholen.

## 4b. Korrigierte Pflanzen — Pflegeplan neu prüfen

Für jede Pflanze mit `needsReassessment: true`:

Der Nutzer hat etwas richtiggestellt — `userEdited.what` sagt was. Der
springende Punkt ist nicht der Name, sondern der Plan: `careSchedule` wurde oft
aus der **falschen** Annahme abgeleitet. Heißt eine Pflanze jetzt „Imperata
cylindrica" statt „Rotes Ziergras (Kübel)", passen Gieß-, Dünge- und
Schnittrhythmus möglicherweise nicht mehr — ein Ziergras will anderes als eine
Staude, ein Gehölz anderes als ein Kraut.

Geh den `careSchedule` deshalb **Aufgabe für Aufgabe** durch und frag bei jeder:
passt die noch zu dem, was diese Pflanze jetzt *ist*?

- Passt nicht mehr zur Art → `removeTasks`
- Richtig, aber falscher Rhythmus für diese Art → `changeTasks`
- Diese Art braucht etwas, das ganz fehlt → `addTasks`

Alles zusammen in **einem** `proposePlan` (siehe Abschnitt 6).

**Du musst für jede so geprüfte Pflanze einen Eintrag schreiben — auch wenn der
Plan passt und nichts zu ändern ist.** Dann ohne `proposePlan`, nur mit
`reviewOf: "plantEdit"` und einem Satz `reason` (etwa „Pflegeplan passt auch zur
korrigierten Art, keine Änderung nötig"). Fehlt der Eintrag, gilt die Pflanze
weiterhin als unbearbeitet und wird jeden Morgen erneut geprüft — Tag für Tag,
auf Kosten des Nutzers.

Ein solcher Eintrag braucht **kein** `sourcePhoto`; es geht um die Korrektur,
nicht um ein Foto. Pflicht sind `id` und `plantId`.

## 5. Fotos ohne Pflanze

- Passt zu einer bestehenden Pflanze → `plantId` + `assignPhoto`.
- Offensichtlich neue Pflanze → `addPlant` mit `needsReview: true` **und**
  `assignPhoto`. Das Bild wird dabei automatisch **Titelbild und erster
  Verlaufseintrag** — dafür ist nichts Zusätzliches zu setzen. Die App legt die
  Pflanze zur Bestätigung vor; Name, Kategorie und Notiz kann der Nutzer
  korrigieren.
- Unsicher → nichts schreiben, im Bericht erwähnen.

**Vor jedem `addPlant` prüfen, ob es die Pflanze schon gibt — auch unter einem
anderen Namen.** Pflanzen-ids folgen Umbenennungen nicht: eine Pflanze, die die
KI einmal als „Rotes Ziergras (Kübel)" angelegt hat und die der Nutzer in
„Japanisches Blutgras (Kübel)" korrigiert hat, trägt weiterhin die id
`rotes-ziergras-kuebel`. Legst du sie unter dem korrigierten Namen erneut an,
prüft die App nur auf die id aus dem *neuen* Namen, findet keine Kollision und
erstellt eine **zweite** Pflanze für dasselbe Gewächs. Deshalb: erst die
Titelbilder und `plant.name`-Einträge der bestehenden Pflanzen durchsehen; bei
Übereinstimmung `plantId` + `assignPhoto` verwenden statt `addPlant`.

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
- Du hast eine Pflanze mit `needsReassessment` geprüft, willst aber keinen
  Eintrag schreiben, weil nichts zu ändern war — **stopp**. Ohne Eintrag wird
  sie morgen wieder geprüft, und übermorgen auch.
- Du willst der Korrektur des Nutzers widersprechen — **stopp**. Seine
  Bestimmung gilt; du prüfst den Plan daraufhin, nicht die Bestimmung.
- Du willst `addPlant` schreiben, ohne die bestehenden Pflanzen durchgesehen zu
  haben — **stopp**. Eine doppelt angelegte Pflanze muss der Nutzer von Hand
  wieder löschen.

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
  "reviewOf": "plantEdit",
  "plantId": "<Pflanzen-id>",
  "date": "<YYYY-MM-DD>",
  "status": "<einer der vier Werte>",
  "reason": "<ein Satz>",
  "observation": "<1–3 Sätze; bei Bildvergleich die Veränderung ausdrücklich nennen>",
  "profile": {"<location|planted|watering|fertilizing|diseases|treatments|harvest|notes>": "<nur wenn nötig, siehe unten>"},
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

**`sourcePhoto` und `reviewOf` schließen einander aus.** Es gibt genau zwei
Arten von Eintrag; der Block oben zeigt alle Felder zusammen, nie schreibst du
beide:

| | Foto-Eintrag | Korrektur-Eintrag (4b) |
| --- | --- | --- |
| `id` | `ki-<YYYY-MM-DD>-<dateiname ohne endung>` | `ki-<YYYY-MM-DD>-<plantId>-review` |
| `sourcePhoto` | **Pflicht** — fehlt sie, wird das Foto morgen erneut ausgewertet | entfällt |
| `reviewOf` | entfällt | **Pflicht**: `"plantEdit"` |
| `plantId` | **Pflicht**, sobald die Pflanze bekannt ist | **Pflicht** |

`id` nur aus `a-z0-9-`; alles andere ersetzen. Die id muss über Läufe hinweg
eindeutig bleiben — sie ist das Gedächtnis, das verhindert, dass ein Eintrag
zweimal angewendet wird.

**Ohne `plantId` landet nichts.** Status, `observation` und `profile` werden nur
übernommen, wenn die Pflanze auflösbar ist; ein Eintrag ohne `plantId` (und ohne
`addPlant`, das eine erzeugt) verpufft stillschweigend.

**`date`** ist das Datum, unter dem der Eintrag im Verlauf der Pflanze
einsortiert wird — nicht der Zeitpunkt deines Laufs. Bei einem Foto-Eintrag also
das Aufnahmedatum des Fotos (steht als `date` neben dem `driveFile`), damit der
Verlauf chronologisch bleibt. Bei einem Korrektur-Eintrag das heutige Datum.

**Zwei verschiedene Dinge heißen `profile`.** In `plants[]` ist `profile` die
gespeicherte Pflanzenakte, die du liest. Im Eintrag ist `profile` etwas anderes:
eine **Ergänzung**, die die App als eigene Zeile `[KI <date>] <text>` an das
jeweilige Feld **anhängt** — sie ersetzt nichts. Schreib also nur, was neu
hinzukommt, formuliere es als eigenständigen Satz, und wiederhole nicht, was in
der Akte schon steht: sonst wächst dieselbe Aussage mit jedem Lauf um eine
Zeile. Setzen kannst du nur die acht genannten Felder; `profile.updated` gehört
dem Nutzer und wird von dir nie geschrieben.

Die übrigen Felder nur, wenn zutreffend.

## Harte Regeln

- `status` ist **zeichengenau** einer dieser vier Werte:
  `🟢 Gesund`, `🟡 Beobachten`, `🟠 Behandlung läuft`, `🔴 Handlungsbedarf`.
  Alles andere verwirft die App stillschweigend.
- Schlechter als `🟢 Gesund` nur, wenn auf dem Foto wirklich etwas erkennbar ist.
- Das Feld `photo` **nie** verwenden — die App hat die Bilder bereits.
  Zum Zuordnen `assignPhoto` nutzen.
- **Nie** `addTasks` auf oberster Ebene — immer `proposePlan` (Abschnitt 6).
- In Drive nichts ändern, verschieben oder löschen. Es wird ausschließlich diese
  eine neue Datei angelegt.

## Was das Ganze nicht ist

Eine begründete Einschätzung anhand von Fotos, keine gesicherte Diagnose. Bei
Unsicherheit sagen und eine Prüfung vor Ort empfehlen, statt sich festzulegen.
Keine Pflanzenschutzmittel-Dosierungen empfehlen, die eine Fachberatung
erfordern.

## Bericht

Höchstens sieben Zeilen. Zuerst und deutlich: **welche neuen Pflanzen angelegt
wurden** (oder „keine"). Dann Anzahl ausgewerteter Fotos, betroffene Pflanzen,
Veränderungen aus dem Bildvergleich. Dann: welche **korrigierten Pflanzen** neu
geprüft wurden und was das für ihren Pflegeplan heißt. Dann offene Vorschläge
zur Bestätigung und übersprungene Fotos. Zuletzt, falls `photosPendingUpload`
> 0: „Achtung: N Foto(s) sind noch nicht in Drive angekommen und konnten nicht
ausgewertet werden — App öffnen und synchronisieren."

## Danach

Die App holt sich die Diagnosen beim nächsten Sync. Neue Pflanzen und
Behandlungsvorschläge stehen im Reiter **KI-Diagnosen** unter „Zur Bestätigung".

Lehnt der Nutzer eine erkannte Pflanze ab, wird sie samt Fotos und Aufgaben
wieder entfernt — eine Fehlbestimmung ist also nichts Endgültiges. Das ist ein
Grund, im Zweifel zu bestimmen statt zu schweigen, aber kein Grund,
`needsReview` wegzulassen.

## Installation

- **claude.ai (Browser, iPhone, iPad):** Einstellungen → Capabilities/Skills →
  diesen Ordner als Skill hinzufügen. Danach ist `/garten` überall verfügbar.
- **Claude Code:** nach `~/.mozart/skills/garten/` kopieren und
  `uv run python tools/sync-skills.py` ausführen.
