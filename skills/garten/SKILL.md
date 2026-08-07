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

**Wartung:** Diese Datei und der Prompt der täglichen Routine beschreiben
denselben Ablauf und teilen sich dasselbe Gedächtnis. Änderungen hier immer auch
dort nachziehen — driften die beiden auseinander (etwa beim Statuswert oder bei
`sourcePhoto`), verdirbt das still den gemeinsamen Ledger.

Die Routine ist **kein** claude.ai-Chat-Task und steht in „Chats and tasks" oder
unter „Scheduled" nirgends. Sie ist eine **Claude-Code-Cloud-Routine**:

- Oberfläche: <https://claude.ai/code/routines>
- Name: „Garten-Manager Tagesdiagnose", id `trig_01WGicrr1NgzQ11gYRMcxT6w`
- Cron `20 4 * * *` (UTC) = 06:20 Wien, Konto riahi@iiasa.ac.at
- Aus Claude Code erreichbar über das `RemoteTrigger`-Tool (`/schedule`)

Das steht hier so ausführlich, weil das Suchen danach einmal eine Stunde
gekostet hat: die claude.ai-Oberfläche zeigt diese Routinen schlicht nicht an.

Die Routine läuft in einer Cloud-Sandbox **ohne Git-Checkout und ohne Zugriff
auf diese Skill** — ihr Prompt muss den ganzen Ablauf selbst enthalten. Ein
schlanker „nutze die Skill garten"-Prompt funktioniert dort nicht.

### Stehende Regel: drei Kopien, eine Änderung

Dasselbe Protokoll steht an drei Stellen, und nur eine davon läuft wirklich:

| | wo | ausführbar |
| --- | --- | --- |
| App | `app.js` (`applyKiDiagnosis`), `cloud-sync.js` | ja |
| Skill | diese Datei, auch in claude.ai installiert | nein |
| Routine | Prompt von `trig_01WGicrr1NgzQ11gYRMcxT6w` | nein |

**Wer die App ändert, ändert im selben Zug die Skill und den Routine-Prompt.**
Nicht „später" — die Erfahrung mit `APP_BUILD` und `CACHE` war eindeutig: ein
Kommentar, der zum Gleichziehen auffordert, wird zweimal hintereinander
überlesen. Ein Kommentar ist keine Prüfung.

Deshalb prüft `test-photo-identity.js` die eine Hälfte, die prüfbar ist: **jedes
Feld, das `applyKiDiagnosis` aus einem Inbox-Eintrag liest, muss in dieser Datei
vorkommen.** Neues Feld in der App und Skill vergessen → der Test schlägt fehl.
Absichtlich undokumentierte Felder gehören mit Begründung in die `EXEMPT`-Liste
des Tests, nicht stillschweigend übergangen.

Den **Routine-Prompt** kann kein Test erreichen (kein Checkout in der Sandbox).
Das bleibt Disziplin — und der Grund, warum er hier oben namentlich steht:
`RemoteTrigger` aus Claude Code, `action: "update"`.

## Ordner — immer per ID ansprechen

Es gibt mehrere Ordner namens „Garten-Manager". Niemals per Namenssuche gehen.

- Datenordner: `1gf3X6Ia1iVLBYoOfm94S37DioQ67Mby8`
- Unterordner `photos`: `1GcLAPmjVo4nmT1Yft1aKUMPmSGLMA9QA`

## 1. Zustand lesen

`gartenmanager-ki-akte.json` im Datenordner lesen. Daraus:

- `plants[]` — je Pflanze `plant.id`, `plant.name`, `currentHealth`, `profile`,
  `careSchedule`, `suppressedTasks`, `timeline`, `photos[]` (mit `driveFile`, `date`)
- je Pflanze zusätzlich `userEdited` (`{at, what}` — was der **Nutzer** zuletzt
  selbst beigetragen hat: eine Korrektur an Name oder Akte, **oder** eine neue
  Beobachtung, Maßnahme oder Ernte im Wortlaut), `lastKiReview` (wann zuletzt
  geprüft) und `needsReassessment`. Die Entscheidung triffst du allein an
  `needsReassessment: true` — die App hat die beiden Zeitstempel dafür schon
  verglichen. `userEdited.what` sagt dir, *was* beigetragen wurde; `lastKiReview`
  ist reine Information.
- `unassignedPhotos[]` — importierte Fotos ohne Pflanze
- `kiProposals[]` — frühere Vorschläge mit `status`
- `photosPendingUpload` — Bilder, die die App hat, die aber **noch nicht in
  Drive** liegen. Sie stehen absichtlich in keiner Liste; du kannst sie nicht
  öffnen, also wertest du sie nicht aus. Ist die Zahl > 0, im Bericht nennen —
  sonst sieht ein hängender Upload aus wie ein Garten ohne Neuigkeiten.

**ZUGEORDNET** = alle `photos[].driveFile` → Pflanzen-id.
**OFFEN** = alle `unassignedPhotos[].driveFile`.

## 1b. Wetter am Standort

Der Garten steht in **Perchtoldsdorf, Niederösterreich**. Hol einmal pro Lauf mit
WebFetch genau diese URL — die Koordinaten sind fix, nicht raten, nicht
geocodieren:

```
https://api.open-meteo.com/v1/forecast?latitude=48.11935&longitude=16.26607&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_speed_10m_max&past_days=7&forecast_days=7&timezone=Europe%2FVienna
```

Open-Meteo braucht keinen Schlüssel und kostet nichts — das ist der Grund für
diese Quelle und nicht für eine andere. Die Antwort ist ~1 kB: `daily.time` hat
14 Tage, die ersten 7 sind Vergangenheit, die letzten 7 Prognose.

Drei Zahlen ausrechnen:

- **WASSERBILANZ_7T** = Regen der letzten 7 Tage minus `et0_fao_evapotranspiration`
  derselben Tage. Negativ heißt Defizit.
- **REGEN_PROGNOSE** = Regensumme der nächsten 7 Tage.
- **HITZETAGE** = Tage mit `temperature_2m_max` ≥ 30 °C, je Fenster.
- Ab Oktober zusätzlich **FROSTRISIKO** = tiefster `temperature_2m_min` der
  Prognose; ≤ 3 °C ist relevant.

Warum ET0 und nicht bloß Regen: 20 mm in einer 39-Grad-Woche sind nichts,
dieselben 20 mm im kühlen Oktober sind viel. Erst Regen **minus** Verdunstung
sagt, ob der Boden trockener oder feuchter geworden ist.

Schlägt der Abruf fehl, eine Zeile in den Bericht („Wetterabruf fehlgeschlagen")
und normal weiterarbeiten. Ein fehlendes Wetter darf den Lauf **nie** abbrechen.

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
**(b) PFLANZEN MIT NUTZER-EINGABE** = alle mit `needsReassessment: true`
(höchstens 6). Das sind zwei verschiedene Anlässe im selben Flag: eine
**Korrektur** (Name, Kategorie, Akte, Status — der Pflegeplan kann darauf
beruhen) oder ein **neuer Eintrag** des Nutzers (Beobachtung, Behandlung,
Krankheit, Ernte — er hat etwas gesehen oder gefragt). `userEdited.what` sagt
dir, welcher der beiden Fälle vorliegt; behandle beide in Abschnitt 4b.

Der `photos`-Ordner ist ein Archiv und wird nie aufgeräumt. Dateien, die weder in
ZUGEORDNET noch in OFFEN stehen, sind ersetzte Titelbilder oder in der App
gelöschte Fotos — **niemals auswerten, niemals zurückspielen**, sonst tauchen
gelöschte Bilder wieder auf. Still ignorieren.

Sind (a) und (b) beide leer: nichts schreiben, nur „Keine neuen Fotos, keine
Korrekturen." melden. Sonst höchstens 12 Fotos, neueste zuerst.

**Dieselbe Aufnahme unter zwei Dateinamen ist kein neues Foto.** Fällt dir auf,
dass ein Kandidat byte-identisch mit einem bereits ausgewerteten Bild ist (etwa
gleiche Dateigröße, dieselbe Pflanze, dasselbe Datum), dann werte ihn **nicht**
aus und schreibe auch keinen „ist ein Duplikat"-Eintrag — überspring ihn still
und nenn die Zahl im Bericht. Ein Duplikat-Eintrag kostet den Nutzer eine
Zeile in der Pflanzenakte für eine Aussage über Dateinamen.

## 4. Beurteilen — mit Bildverlauf

Jedes neue Foto ansehen. Hat die Pflanze in `photos[]` ein älteres Bild, auch das
**jüngste ältere Foto** öffnen und beide vergleichen. Konkret sagen, was sich
verändert hat: hat sich die Vergilbung ausgebreitet, gibt es neue Triebe, hat die
Behandlung angeschlagen. Nicht nur „Zustand heute", sondern „besser oder
schlechter als beim letzten Mal".

Zieh das Wetter aus 1b heran, um zu erklären, **warum** etwas so aussieht:

- Schlappe oder eingerollte Blätter bei negativer Wasserbilanz und Hitzetagen
  sind meist Trockenstress oder Mittagswelke, nicht Krankheit — gießen und
  schatten, nicht behandeln.
- Braune, trockene Blattränder nach einer Hitzewoche sind Verbrennung, kein Pilz.
- Gelbe untere Blätter bei stark positiver Bilanz deuten eher auf Staunässe.
- Das **Foto** entscheidet, was die Pflanze zeigt; das **Wetter** erklärt es.
  Widersprechen sich beide, gilt das Foto — und sag den Widerspruch.

Kübel- und Topfpflanzen trocknen um ein Vielfaches schneller aus als Beete, und
der größte Teil dieses Gartens steht im Kübel. Nenn sie getrennt, wenn du zum
Gießen rätst.

`profile` und `timeline` berücksichtigen. Vom Nutzer bearbeiteter Text
(`profile.updated` gesetzt) ist maßgeblich — nicht widersprechen, keine
überholten Ratschläge wiederholen.

## 4b. Pflanzen mit Nutzer-Eingabe — antworten und Pflegeplan prüfen

Für jede Pflanze mit `needsReassessment: true`. Lies zuerst `userEdited.what`
und die `timeline`-Einträge, die neuer sind als `lastKiReview` — das ist, was
der Nutzer beigetragen hat, seit du zuletzt hingesehen hast.

**Steht dort eine Frage, beantworte sie.** Das ist der wichtigste Teil dieses
Abschnitts. Der Nutzer tippt seine Frage in „Neue Beobachtung" und erwartet die
Antwort am nächsten Morgen in der Pflanzenakte — sie gehört in `observation`,
in klaren Sätzen, mit dem Vorbehalt, dass du die Pflanze nur vom Foto kennst.
Eine unbeantwortete Frage ist der eine Fehler, den der Nutzer sofort bemerkt.

Auch ohne Frage gilt: berichtet er eine Beobachtung („Blätter rollen sich ein",
„seit gestern Läuse"), nimm sie ernst wie ein Foto — bestätige, ordne ein, oder
widersprich mit Begründung. Passiert daraufhin etwas am Pflegeplan, kommt das
wie unten in **ein** `proposePlan`. Ist eine reine Notiz ohne Handlungsbedarf
(eine Ernte, ein Gießvermerk), reicht ein knapper Eintrag ohne `proposePlan` —
aber ein Eintrag muss sein, sonst steht die Pflanze morgen wieder auf der Liste.

**Bei einer Korrektur** — `userEdited.what` nennt einen neuen Namen, eine neue
Kategorie oder einen selbst gesetzten Status — kommt die Pflegeplan-Prüfung
dazu. Der Nutzer hat etwas richtiggestellt. Der
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

Ein solcher Eintrag braucht **kein** `sourcePhoto`; es geht um die Eingabe des
Nutzers, nicht um ein Foto. Pflicht sind `id` und `plantId`.

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

**Wetter und Pflegeplan — Zurückhaltung.** Das Wetter gehört in die Beurteilung
und in den Bericht, nicht täglich in einen Vorschlag. Ein `proposePlan` aus
Wettergründen nur bei einer **dauerhaften** Verschiebung: eine mehrtägige
Hitzeperiode mit anhaltendem Defizit, ein Saisonwechsel, ein Frosteinbruch. Nie
wegen eines einzelnen warmen Tages. Ein Lauf, der jeden Morgen das Gießintervall
ändern will, erzieht den Nutzer dazu, Vorschläge ungelesen wegzuklicken — und
das kostet mehr, als die Funktion wert ist.

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
- Du hast eine Frage des Nutzers gelesen und willst stattdessen nur den
  Pflegeplan prüfen — **stopp**. Die Frage zuerst, in `observation`.
- Du willst wegen des Wetters das Gießintervall ändern, obwohl es nur ein warmer
  Tag war — **stopp**. Das gehört in den Bericht.
- Du willst allein wegen des Wetters eine Diagnosedatei anlegen, obwohl es weder
  neue Fotos noch Eingaben gibt — **stopp**. Nur Bericht.
- Du willst einen Eintrag schreiben, der im Kern sagt „dasselbe Bild unter
  anderem Dateinamen" — **stopp**. Still überspringen, im Bericht zählen.
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

Höchstens acht Zeilen. Zuerst und deutlich: **welche Fragen des Nutzers du
beantwortet hast** (oder „keine offenen Fragen"). Dann eine **Wetterzeile**:
Wasserbilanz der letzten 7 Tage in mm, Regen in der Prognose, Hitzetage, ab
Oktober Frostrisiko — und was das fürs Gießen heißt, Kübel getrennt genannt.
Dann **welche neuen Pflanzen
angelegt wurden** (oder „keine"). Dann Anzahl ausgewerteter Fotos, betroffene
Pflanzen, Veränderungen aus dem Bildvergleich. Dann: welche Pflanzen wegen
einer Nutzer-Eingabe neu geprüft wurden und was das für ihren Pflegeplan heißt.
Dann offene Vorschläge zur Bestätigung, übersprungene Fotos und — als eigene
Zahl — wie viele Kandidaten als Duplikat übersprungen wurden (bleibt die Zahl
über Tage hoch, stimmt etwas mit dem Foto-Upload der App nicht).
Zuletzt, falls `photosPendingUpload`
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
