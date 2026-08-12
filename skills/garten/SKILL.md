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

## Ein Lauf, eine Session

Du erledigst alles selbst, in dieser einen Session: keine Subagenten, keine
Task-Delegation, keine Hintergrundarbeit, kein `ScheduleWakeup`, kein „ich melde
mich, sobald der Agent fertig ist". Die Session endet, sobald du antwortest -
was du abgegeben hast, wird nie fertig, und der Lauf gilt als sauber beendet,
obwohl nichts geschrieben wurde. Genau daran sind die Läufe vom 8. August
gescheitert: die Akte war groß, der Lauf hat delegiert, die Routine meldete
"Completed" ohne Bericht und ohne Diagnosedatei.

Wird es zu viel, **kürze den Umfang, statt zu verschieben** - in dieser
Reihenfolge:

1. Abschnitt 4b zuerst. Eine unbeantwortete Frage des Nutzers ist der Fehler,
   der sofort auffällt; ein nicht ausgewertetes Foto wartet bis morgen.
2. Dann Fotos, neueste zuerst - notfalls vier statt zwölf.
3. Was du ausgelassen hast, kommt in den Bericht.

Ein ehrlich unvollständiger Lauf ist brauchbar. Ein Lauf, der „läuft noch"
meldet und nie zurückkommt, ist es nicht.

**Wartung:** Diese Datei und der Prompt der täglichen Routine beschreiben
denselben Ablauf und teilen sich dasselbe Gedächtnis. Änderungen hier immer auch
dort nachziehen — driften die beiden auseinander (etwa beim Statuswert oder bei
`sourcePhoto`), verdirbt das still den gemeinsamen Ledger.

Die Routine ist **kein** claude.ai-Chat-Task und steht in „Chats and tasks" oder
unter „Scheduled" nirgends. Sie ist eine **Claude-Code-Cloud-Routine**:

- Oberfläche: <https://claude.ai/code/routines>
- Name: „Garten-Manager Tagesdiagnose", id `trig_01WGicrr1NgzQ11gYRMcxT6w`
- Cron `0 2 * * *` (**UTC**) = 04:00 Wien in der Sommerzeit. Der Cron folgt der
  Zeitumstellung NICHT: ab Ende Oktober läuft er um 03:00 Wien, bis jemand ihn
  auf `0 3 * * *` zieht. Dazu kommen ein paar Minuten Stagger der Plattform.
- Modell: `claude-opus-5`. Der Lauf ist urteilslastig — Foto gegen Verlauf lesen,
  zwanzig Stopp-Signale gleichzeitig halten, Kleingedrucktes von einer gewölbten
  Flasche entziffern. Sonnet hat das am 12. August nicht zuverlässig getragen.
- Konto riahi@iiasa.ac.at
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
- je Pflanze `feedingLog` — **was tatsächlich auf die Pflanze gegangen ist**:
  `[{date, product, task, note}]`, neueste zuerst, höchstens 20. Das ist nicht
  dasselbe wie `timeline`, in der dieselbe Information zu einem Satz verklebt
  ist. Nutze es: ein Langzeitdünger vom Juni wirkt im August noch, und zweimal
  Stickstoff in einer Woche ist ein Schaden, kein Versehen
- `unassignedPhotos[]` — importierte Fotos ohne Pflanze
- `fertilizers[]` — **was der Nutzer tatsächlich besitzt**: `name`, `form`,
  `npk` und `dosage` wie auf der Packung, dazu `driveFile` mit dem Foto der
  Packung, sofern es schon in Drive liegt. Öffne das Foto, wenn du eine
  Dosierung brauchst: die Packung ist die Quelle, das Getippte nur eine
  Zusammenfassung. **`photos[]` enthält ALLE Seiten der Packung**, die schon in
  Drive liegen — Vorderseite, NPK-Feld, Dosierung stehen fast nie im selben
  Bild. Öffne sie alle, bevor du etwas über das Produkt behauptest; `driveFile`
  ist nur die erste davon und bleibt aus Kompatibilitätsgründen bestehen. Dazu
  `type` (`Dünger`, `Bodenhilfsstoff`,
  `Wasseraufbereitung`), `userEdited` (siehe unten) und zwei Flags, die die
  Empfehlung entscheiden:
  **`available: false`** heißt aufgebraucht (seit `outSince`) — empfiehl es
  nicht, auch nicht „sobald wieder da"; **`selfmade: true`** heißt selbst
  angesetzt, typischerweise Brennnesseljauche
- `kiProposals[]` — frühere Vorschläge mit `status` (`pending`, `confirmed`,
  `rejected`, `commented`) und `comment`. **Ein Vorschlag mit `comment` ist eine
  Antwort des Nutzers an dich.** Behandle sie wie eine Frage in „Neue
  Beobachtung": lies sie, geh in `observation` darauf ein, und stell denselben
  Vorschlag nur dann erneut, wenn die Anmerkung genau darum bittet
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

## 4c. Düngen — nur womit er wirklich düngen kann

Die App bringt eine eingebaute, saisonale Empfehlung je Pflanze mit
(`fertilizerPlans` in `app.js`): sie nennt eine **Sorte** („kaliumbetonter
Tomatendünger") und eine grobe Dosierung, und schaltet im Juni von
stickstoff- auf kaliumbetont um. Das ist die fachliche Anforderung — kein
Produkt.

Deine Aufgabe ist das fehlende Stück dazwischen: **die Anforderung auf den
Bestand abbilden.** Rätst du zum Düngen, dann

- **nenne ein Produkt aus `fertilizers[]`** und eine konkrete Dosis für genau
  diese Pflanze („Compo Blaukorn, 10 ml auf 5 l, auf feuchte Erde"). Steht auf
  der Packung etwas anderes als im Feld `dosage`, gilt die Packung;
- **oder sag, dass nichts davon passt**, und stell einen `proposePurchase`. Ein
  falsches NPK-Verhältnis im August ist schlechter als gar nicht zu düngen —
  das gehört gesagt, nicht überspielt.

**Genau eines nennen, nicht zur Auswahl stellen.** Die Empfehlung nennt EIN
Produkt mit EINER Dosis. Kommen mehrere in Frage, entscheide du — nach
NPK-Verhältnis, Form und Saison — und nenn die zweitbeste höchstens in einem
Nebensatz („sonst ginge auch X"). Eine Liste zum Auswählen ist die Arbeit
zurückgegeben, nicht erledigt: der Nutzer steht mit der Gießkanne davor und will
wissen, welche Flasche er nimmt.

Seit v56 wählt die App auf der Aufgabenkarte schon selbst aus dem Bestand aus
(Namensübereinstimmung schlägt NPK-Rechnung; nur `type: "Dünger"` und
`available`). Deine Aufgabe ist deshalb nicht, dieselbe Liste noch einmal
aufzuzählen, sondern die Wahl zu bestätigen oder ihr mit Begründung zu
widersprechen — etwa wenn das Foto der Pflanze etwas zeigt, was die Karte nicht
weiß.

Ein blankes „düngen" ohne Produkt ist keine Empfehlung. Ist `fertilizers[]`
leer, sag genau das: der Nutzer soll seinen Bestand in den Einstellungen
eintragen, sonst bleibt jede Düngeempfehlung allgemein.

**Ein deklariertes NPK macht noch keinen Dünger.** `Pflanzenstärkung` ist die
vierte Kategorie und existiert wegen eines konkreten Fehlgriffs: Neudorff
Schachtelhalm-Extrakt trägt 0,5-0,15-1,5 auf dem Etikett und ist rechtlich ein
organischer NPK-Dünger — tatsächlich ist es eine Kieselsäure-Brühe, die auf die
BLÄTTER gespritzt wird, um das Gewebe gegen Pilzbefall zu härten. Nährstofflich
ist das ein Rundungsfehler. Als Nahrung eingeordnet konnte es gegen
Stickstoffmangel angeboten werden, wo es nichts ausrichtet.

Frag deshalb nicht „steht ein NPK drauf", sondern **wozu wird es angewendet und
wohin kommt es**: aufs Blatt zur Stärkung → `Pflanzenstärkung`, Ratschläge dazu
gehören in `treatments`, nie in `fertilizing`. In den Boden zur Ernährung →
`Dünger`.

**Nur `type: "Dünger"` ernährt eine Pflanze.** Im Schuppen steht auch anderes:
Algenkalk hebt den Boden-pH, Antikalk enthärtet das Gießwasser. Beides steht
neben den Düngern, beides ist fotografiert, keines davon düngt. Eine
Stickstoffarmut mit Kalk zu beantworten ist nicht bloß wirkungslos, es
verschiebt den pH in die falsche Richtung. `Bodenhilfsstoff` und
`Wasseraufbereitung` sind Kontext — erwähne sie, wenn sie zur Sache gehören
(hartes Gießwasser, saurer Boden), aber sie erfüllen nie eine Düngeempfehlung.

### Neue Dünger vom Foto erkennen

**Höchstens vier Dünger je Lauf.** Alles andere in diesem Ablauf ist gedeckelt —
zwölf Fotos, sechs Pflanzen —, und die Dünger-Erkennung war es zuerst nicht.
Ein Nutzer, der seinen Schuppen an einem Nachmittag durchfotografiert, liefert
damit siebzehn Produkte und fünfundfünfzig Bilder in einen einzigen Lauf: genau
die unbegrenzte Arbeitsmenge, an der die Läufe vom 8. August gescheitert sind.
Vier Packungen sind rund zwölf Bilder und passen bequem.

Bleiben welche offen, ist das kein Problem, sondern der Normalfall: nenn im
Bericht, wie viele noch warten. Der nächste Lauf nimmt sie — `needsReview`
bleibt gesetzt, bis sie erkannt sind, und die Schleife konvergiert von selbst.

Fotografiert der Nutzer eine Packung, legt die App sofort einen Eintrag an:
`needsReview: true`, Name „Neuer Dünger (wird erkannt)", `driveFile` gesetzt,
alle Felder leer. **Das ist eine Bitte an dich.** Öffne das Foto, lies die
Packung und schick die Angaben mit `identifyFertilizer` zurück:

```json
"identifyFertilizer": {"id": "<die id aus fertilizers[]>", "name": "<Produktname>",
  "type": "Dünger|Bodenhilfsstoff|Wasseraufbereitung", "form": "<flüssig|Granulat|…>",
  "npk": "<wie auf der Packung>", "dosage": "<wie auf der Packung>", "note": "<kurz>"}
```

`id` ist Pflicht und muss wörtlich aus `fertilizers[]` stammen — du füllst einen
bestehenden Eintrag, du legst keinen an. Die App übernimmt die Felder, löscht
`needsReview` und legt einen Vorschlag „Dünger erkannt" an, damit eine falsch
gelesene Packung korrigiert und nicht stillschweigend geglaubt wird.

**Sieh dir jede Seite an, die in `photos[]` steht**, bevor du antwortest. Die
Dosierung steht regelmäßig auf einem anderen Panel als das NPK-Verhältnis, und
aus einem einzigen Bild zu raten ist genau der Fehler, an dem die erste
Bestandsliste gescheitert ist. Reicht das Vorhandene nicht, lass die fehlenden
Felder leer und sag im Bericht, welche Seite fehlt — der Nutzer fotografiert sie
nach.

**Nicht nur Neues, auch Lückenhaftes.** Ein Eintrag kommt in die Erkennung,
wenn `needsReview: true` gesetzt ist ODER wenn `npk` oder `dosage` leer sind —
**auch dann, wenn `userEdited` daraufliegt.** Eine Korrektur des Nutzers schützt
die Felder, die er GESETZT hat; sie ist kein Grund, die Felder liegen zu lassen,
die er LEER gelassen hat. Wer die Art richtigstellt und das NPK offen lässt, will
das NPK trotzdem haben.

Bei einem Eintrag mit `userEdited` schickst du deshalb **nur die Felder, die
gerade leer sind** — alle anderen lässt du im JSON komplett weg. Weggelassen
heißt unangetastet; ein mitgeschicktes Feld überschreibt. Sonst bliebe eine Lücke für immer stehen: die
Substanz gilt als erkannt, obwohl der Wert fehlt, den die App zum Auswählen
braucht. Auch hier höchstens vier je Lauf.

Damit das terminiert: findest du zu einer Lücke **nichts Belastbares**, schreib
genau das in `note`. Der nächste Lauf sieht daran, dass die Suche schon lief.

**Aber „nicht auffindbar" ist eine starke Behauptung, und sie hält für immer.**
Sie ist erst erlaubt, wenn du MINDESTENS geprüft hast:

1. alle Seiten in `photos[]`,
2. die Herstellerseite,
3. **mindestens zwei Händlerlistings** (Gartenshop, Onlinehandel).

Und du nennst in `note`, **welche Quellen du geprüft hast** — nicht nur, dass du
gesucht hast. Sonst kann ein späterer Lauf nicht erkennen, ob die Suche gründlich
oder bloß kurz war, und eine vorschnelle Fehlanzeige wird zur festen Tatsache.

Am 12. August ist genau das passiert: BIOVIN wurde als „NPK nicht auffindbar"
abgehakt, nachdem nur biovin.at geprüft war. Ein Händlerlisting führte die Werte
0,61-0,11-0,09 offen aus. Stufe 3 der Rangfolge existiert genau dafür.

**Recherchier, was die Packung nicht hergibt.** Fehlen NPK, Dosierung oder
Anwendungszweck auf den Fotos, such danach — Herstellerseite, Datenblatt,
Händlerlisting. Ein Produkt wie BIOVIN, dessen Etikett kaum Zahlen trägt, ist
online meist vollständig dokumentiert. Das gehört zum Anlegen einer Substanz
dazu, nicht als Kür.

**Rangfolge der Quellen, streng in dieser Reihenfolge:**

1. **Die Packung auf den Fotos.** Was dort steht, gilt — auch wenn das Netz
   etwas anderes sagt. Der Nutzer hat genau dieses Gebinde.
2. **Die Herstellerseite oder das Datenblatt.** Füllt Lücken, überschreibt die
   Packung nie.
3. **Handel und allgemeines Wissen.** Nur wenn 1 und 2 schweigen, und ausdrücklich
   als unsicher gekennzeichnet.

Schreib in `note` dazu, **woher ein Wert stammt**, sobald er nicht von der
Packung kommt (etwa „Dosierung laut Herstellerseite, nicht auf der Packung").
Werbetext ist keine Quelle für eine Dosierung: „reich an Nährstoffen" wird nicht
zu einer Zahl. Findest du nichts Belastbares, bleibt das Feld leer.

Nimm die Werte **von der Packung**, nicht aus dem Gedächtnis über das Produkt.
Ist etwas nicht lesbar, lass das Feld leer statt zu raten: ein leeres
Dosierungsfeld ist eine offene Frage, eine erfundene Dosierung ist ein Schaden.
Und prüf, ob es überhaupt ein Dünger ist — Kalk und Wasseraufbereiter gehören in
ihre eigene `type`-Kategorie.

**Ein korrigierter Dünger gehört dem Nutzer.** Trägt ein Eintrag `userEdited`
(`{at, what}`), hat der Nutzer die Angaben selbst richtiggestellt — er hatte die
Packung in der Hand, du hattest ein Foto davon. **Überschreib das nie mit
`identifyFertilizer`.** Weicht deine Lesart ab, sag es im Bericht in einem Satz
und lass den Eintrag stehen; er entscheidet, nicht du.

Und eine Korrektur ist kein lokales Detail: das NPK-Verhältnis bestimmt, welches
Produkt die App für eine Pflanze auswählt. Ändert es sich, kann ein Pflegeplan,
der auf den alten Zahlen beruhte, nicht mehr stimmen. Die App setzt deshalb jede
Pflanze, deren Plan dieses Produkt nennt, wieder auf `needsReassessment` — für
dich heißt das: **den ganzen Pflegeplan dieser Pflanzen ansehen, nicht nur die
eine Düngeaufgabe.** `userEdited.what` sagt dir, was sich geändert hat.

**Aufgebraucht heißt aufgebraucht.** Ein Eintrag mit `available: false` existiert
für dich nicht als Option. Such einen Ersatz im übrigen Bestand, und wenn keiner
passt, stell einen `proposePurchase`.

**Selbst Angesetztes kann man nicht kaufen.** Ist das aufgebrauchte Mittel
`selfmade: true` — praktisch immer Brennnesseljauche —, dann ist der richtige
Rat nicht „nachkaufen", sondern **heute neu ansetzen**: sie braucht rund zwei bis
drei Wochen, bis sie vergoren ist. Sag beides in einem Zug: was jetzt anzusetzen
ist, und womit in der Zwischenzeit gedüngt wird. Genau hier ist die eingebaute
Empfehlung der App still gefährlich — sie nennt Brennnesseljauche für fast alles
Gemüse vor Juni, ohne zu wissen, ob welche da ist. Du weißt es.

### Was zurückkommt, wenn er gedüngt hat

Hakt der Nutzer eine Düngung mit **„✓ mit Notiz"** ab, trägt der `history`-
Eintrag `fertilizer` — **den Dünger, den er wirklich genommen hat**, nicht den
vorgeschlagenen — und optional `note`. Die Notiz kommt zusätzlich als
Beobachtung vom Typ `Düngung` in die `timeline` und setzt `needsReassessment`.

Weicht er wiederholt von deinem Vorschlag ab, ist das ein Signal über deinen
Vorschlag, nicht über ihn: nimm den Dünger, den er tatsächlich verwendet, als
gegeben und rechne die Dosis darauf um, statt jeden Morgen denselben anderen
zu empfehlen.

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

**Eine Aufgabe kann tragen, WOMIT sie zu tun ist.** In `addTasks` und
`changeTasks` sind zusätzlich erlaubt: `fertId` (eine id aus `fertilizers[]`),
`dose` (die Dosis für genau diese Pflanze), sowie `planId` und `planTitle`, wenn
mehrere Aufgaben zu einem gemeinsamen Plan gehören. Die App zeigt dann das
Produkt direkt auf der Aufgabenkarte, statt selbst zu wählen.

**Bei `changeTasks` heißt „nicht genannt" unverändert, nicht gelöscht.** Wer nur
ein Intervall nachjustiert, darf das Produkt nicht mitreißen — lass die anderen
Felder einfach weg.

Prüfe bei jedem Vorschlag ausdrücklich den Bestand in `careSchedule`:

- **Widerspricht** eine bestehende Aufgabe der neuen Einschätzung, gehört sie in
  `removeTasks` — nicht stehen lassen. Beispiel: die Diagnose sagt „ab jetzt
  kein Stickstoff mehr", während alle 10 Tage weiter gedüngt wird. Beides
  parallel ist nicht bloß unordentlich, es schadet der Pflanze.
- **Passt** eine bestehende Aufgabe grundsätzlich, braucht aber einen anderen
  Rhythmus, gehört sie in `changeTasks` — kein zweiter, ähnlicher Eintrag
  daneben.
- Nur was wirklich fehlt, kommt in `addTasks`.

**Wetter und Pflegeplan.** Seit v52 ist jede Gieß-, Dünge- und
Behandlungs-Empfehlung ein Vorschlag, den der Nutzer im KI-Bereich bestätigt,
kommentiert oder ablehnt — sie verschwindet nicht mehr ungefragt in der
Pflanzenakte. Weil er jetzt jede Änderung sieht, darf das Wetter den Pflegeplan
auch tatsächlich ändern: rechtfertigt die Wasserbilanz der letzten 7 Tage oder
die Zahl der Hitzetage ein anderes Gießintervall, schlag es vor. Der alte
Vorbehalt („nur bei Saisonwechsel oder Frosteinbruch") gilt nicht mehr.

An seine Stelle tritt eine Obergrenze: **höchstens ein wetterbedingter
`proposePlan` je Pflanze in sieben Tagen.** Sieh in `kiProposals` nach, wann du
für diese Pflanze zuletzt einen gestellt hast. Eine Hitzewelle erzeugt so einen
Vorschlag und nicht sieben — und das ist weiterhin der Punkt: ein Lauf, der
jeden Morgen das Gießintervall ändern will, erzieht den Nutzer dazu, Vorschläge
ungelesen wegzuklicken.

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
- Du willst die Arbeit an einen Agenten delegieren, im Hintergrund weiterlaufen
  lassen oder auf eine spätere Fortsetzung warten — **stopp**. Selbst machen,
  jetzt, notfalls mit weniger Fotos. Die Session endet mit deiner Antwort.
- Du willst zum Düngen raten, ohne ein Produkt aus `fertilizers[]` zu nennen
  oder einen `proposePurchase` zu stellen — **stopp**. „Düngen" allein ist
  keine Anweisung, die jemand ausführen kann.
- Du willst eine Dosierung in `identifyFertilizer` schreiben, die du nicht auf
  dem Foto lesen kannst — **stopp**. Feld leer lassen. Eine erfundene Dosierung
  wird ausgeführt.
- Du willst einen Eintrag mit `userEdited` per `identifyFertilizer` überschreiben
  — **stopp**. Der Nutzer hatte die Packung in der Hand. Abweichung in den
  Bericht, Eintrag unangetastet.
- Du willst mit etwas düngen lassen, das nicht `type: "Dünger"` ist — **stopp**.
  Kalk und Wasseraufbereiter sind keine Nahrung.
- Du willst etwas mit `available: false` empfehlen — **stopp**. Es ist leer.
  Ersatz nennen, oder Zukauf; bei `selfmade` das Neuansetzen samt Wartezeit.
- Du willst denselben Dünger empfehlen, den der Nutzer laut `history` zuletzt
  bewusst durch einen anderen ersetzt hat — **stopp**. Seine Wahl ist die
  Tatsache; rechne die Dosis darauf um.
- Du willst eine Gieß- oder Düngeanweisung in `notes` oder `diseases` schreiben,
  weil sie dort ohne Bestätigung durchgeht — **stopp**. Anweisungen gehören in
  `watering`, `fertilizing` oder `treatments` und damit vor den Nutzer.
- Du hast einen Vorschlag mit `comment` gelesen und willst ihn übergehen —
  **stopp**. Der Nutzer hat dir geantwortet; das ist dieselbe Verbindlichkeit
  wie eine Frage in „Neue Beobachtung".

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
  "proposePurchase": {"what": "<Produkt oder Sorte>", "reason": "<warum der Bestand nicht reicht>", "dosage": "<falls bekannt>"},
  "identifyFertilizer": {"id": "<id aus fertilizers[]>", "name": "…", "type": "…", "form": "…", "npk": "…", "dosage": "…", "note": "…"},
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

`proposePurchase` legt einen Vorschlag vom Typ **Zukauf** im KI-Bereich an, den
der Nutzer vormerken, kommentieren oder ablehnen kann. Er braucht kein
`plantId` — „für den Herbst fehlt ein kaliumbetonter Dünger" gilt für den
halben Garten. Nur stellen, wenn `fertilizers[]` wirklich nichts Passendes
enthält, und nie zweimal dasselbe: ein bereits abgelehnter Zukauf bleibt
abgelehnt.

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

**Handlungsanweisung oder Beobachtung — die App behandelt beides verschieden.**
Seit v52 teilt sie die acht Felder in zwei Gruppen:

| Gruppe | Felder | Was passiert |
| --- | --- | --- |
| Handlungsanweisung | `watering`, `fertilizing`, `treatments` | wird **nicht** angehängt, sondern erscheint als **Empfehlung zur Bestätigung** im KI-Bereich; erst ein Klick des Nutzers schreibt sie in die Akte |
| Beobachtung | `location`, `planted`, `diseases`, `harvest`, `notes` | wird wie bisher als Zeile `[KI <date>] <text>` angehängt |

Bis v51 landete beides ungefragt in der Pflanzenakte. Gieß- und Düngehinweise
standen damit genau dort, wo man sie nicht bestätigen und nicht abarbeiten kann.
Schreib die drei Anweisungsfelder deshalb als klare, ausführbare Sätze mit Menge
und Rhythmus — der Nutzer entscheidet darüber mit einem Knopfdruck, und ein
vager Satz ist als Entscheidungsvorlage wertlos.

**Zwei verschiedene Dinge heißen `profile`.** In `plants[]` ist `profile` die
gespeicherte Pflanzenakte, die du liest. Im Eintrag ist `profile` etwas anderes:
eine **Ergänzung**, die die App an das jeweilige Feld hängt (bei den
Beobachtungsfeldern sofort, bei den Anweisungsfeldern nach Bestätigung) — sie
ersetzt nichts. Schreib also nur, was neu
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
