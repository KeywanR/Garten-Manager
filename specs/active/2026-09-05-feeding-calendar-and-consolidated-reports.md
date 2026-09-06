# Düngekalender, konsolidierte KI-Berichte, Titelbild-Fallback, klickbare Verweise

**Status:** aktiv · v62
**Anlass:** Vier Beobachtungen des Nutzers am 5. September 2026.

---

## 1. Dünger nur innerhalb der echten Periode

### Was passiert ist (Winterschneeball)

`viburnum:duengen` hat das Fenster `[3,4,5,6]` und ein Intervall von 42 Tagen.
Drei Stellen ignorierten dieses Fenster:

1. **`complete()` / `completeWithNote()` / `setTaskDate()`** rechneten
   `next = Datum + interval` blind. Eine Düngung am 20. Juni terminierte die
   nächste auf den 1. August — Monate nachdem die Pflanze aufgehört hat,
   Nahrung aufzunehmen.
2. **Die Pflanzenakte** (`openPlantFile`) rendert *alle* Aufgaben einer Pflanze
   ohne Saisonfilter. Im September stand dort „Mäßig düngen" mitsamt
   Produktempfehlung und dem Knopf „Einplanen (fällig heute)".
3. **`initialDueFor()`** gab für jedes Intervall < 365 schlicht `today()` zurück
   — auch außerhalb der Saison. „Einplanen" hieß also wörtlich: heute düngen,
   im September, bei einem Gehölz mit Fenster März–Juni.

Die Pflanzenkarte zeigte konsequenterweise „Nächster Termin: Mäßig düngen ·
01.08.2026". Nichts davon war ein KI-Fehler; die App selbst hat es angeboten.

### Der Kalender

Das Fenster einer Düngeaufgabe sind ihre `months` — vom Nutzer und von der KI
über `changeTasks` änderbar, also die einzige Quelle. `fertilizerPlans` sagt
nur noch, **womit** innerhalb des Fensters gedüngt wird und **wann das Produkt
wechselt** (Phasen mit `from`/`to`). Beides zusammen ist der Düngekalender.

- `phasesOf(plantId)` normalisiert die alten `early`/`late`/`all`-Einträge zu
  Phasen mit expliziten Monatsgrenzen. Keine Datenmigration nötig.
- `clampToWindow(date, months)` schiebt ein Datum auf den Ersten des nächsten
  Monats im Fenster (Jahreswechsel inbegriffen), oder lässt es stehen.
- `scheduleNext(d, from)` = `clampToWindow(from + interval, d.months)` — von
  `complete`, `completeWithNote` und `setTaskDate` benutzt.
- `initialDueFor(d)` gibt bei Intervall < 365 `clampToWindow(today(), months)`.
- `fertilizerInfo(d, date)` liefert außerhalb des Fensters **kein Produkt**,
  sondern `{dormant:true, resumes:<datum>}`. Die Karte zeigt dann „Außerhalb
  der Düngeperiode" statt einer Dosierung, und „Einplanen (fällig heute)"
  verschwindet.
- `clampScheduledTasks()` läuft einmal beim Start und holt bereits gespeicherte
  Termine ins Fenster zurück — das repariert den Winterschneeball auf dem Gerät.
- Die Umstellung wird angesagt: die Karte nennt die laufende Phase samt
  Monatsspanne und, sofern es eine gibt, die nächste („ab Juni: kaliumbetont").
  Der alte `switched`-Hinweis war auf Brennnesseljauche festgetextet und blieb
  den Rest des Jahres stehen; jetzt leuchtet er nur im Umstellmonat.
- `rasen` bekommt einen Plan (Frühjahr stickstoffbetont, Herbst kaliumbetont);
  `isFeedTask` erkennt neben `:duengen` auch `:fruehjahrsduenger` und
  `:herbstduenger`.

Der Kalender geht als `feedingCalendar` in die KI-Akte, damit der Lauf dasselbe
Fenster sieht wie die App. Skill und Routine-Prompt bekommen ein Stopp-Signal
dazu.

### Zu spät erledigt — und der eine Pfad, der die Sperre umging

Nachgeprüft, weil danach gefragt wurde: hakt man eine Aufgabe **verspätet** ab,
läuft das Intervall ab dem Tag der wirklichen Ausbringung, nicht ab dem
verpassten Termin. Fällig 25.08., abgehakt am 05.09., Intervall 10 Tage →
nächster Termin 15.09. (nicht 04.09.). Es gibt keine Aufhol-Logik, die ein
Intervall mehrfach anwendet, und das Datumsfeld „Erledigt am" rechnet ebenso ab
dem eingetragenen Tag. Zu enge Gaben können auf diesem Weg nicht entstehen.

Dabei fiel **ein Pfad auf, an dem die Saisonsperre nicht griff**:
`confirmProposal` rechnete den neuen Termin einer geänderten Aufgabe mit `add`
statt mit einem gefensterten Aufruf. Eine bestätigte Pflegeplan-Änderung konnte
dem Winterschneeball damit wieder einen Julitermin geben — dieselbe Klasse
Fehler, gegen die v62 gebaut wurde, nur durch eine andere Tür. Jetzt
`clampToWindow`, weiterhin gerechnet ab der **letzten Gabe** (nicht ab heute):
ab dem alten Termin zu rechnen verkürzt den Abstand, und zu eng ist bei Dünger
der Schaden, zu spät bloß ein Ärgernis.

**Was weiterhin NICHT koordiniert wird:** zwei Düngeaufgaben derselben Pflanze
wissen nichts voneinander. Eine per Pflegeplan hinzugekommene zweite
Düngeaufgabe startet über `initializeCareTasks` mit Fälligkeit **heute**, auch
wenn gestern gedüngt wurde — `initializeCareTasks` prüft `id.endsWith(':duengen')`
und übersieht damit genau die Namen, die die KI vergibt (`duengen-fluessig`).
Der `feedingLog` steht dem Lauf zwar zur Verfügung und der Prompt sagt „frische
Gabe → keine zweite", aber das ist Urteil, keine Sperre. Offen; siehe unten.

### Der Fehler, der sich selbst zurückgebracht hat

Beim Bauen fiel die Verschiebung fast auf sich selbst herein, und der Test hat
es gefangen. `taskHTML` las den Dünger seit jeher zum **Termin**
(`fertilizerInfo(d, nextFor(d) || today())`). Sobald der Kalender den Termin des
Winterschneeballs korrekt auf den 1. März 2027 schob, las die Karte den Dünger
für diesen März, fand das Fenster offen — und zeigte im September wieder ein
Produkt. Der Fix hätte den Fehler exakt reproduziert, den er beseitigen sollte.

Deshalb jetzt **zwei Zeitpunkte mit zwei verschiedenen Fragen**: ob eine Aufgabe
ruht, entscheidet **heute**; womit gedüngt wird, wenn sie läuft, entscheidet der
**Termin** (wechselt dazwischen die Phase, ist das neue Produkt das richtige).

## 2. Konsolidierte KI-Diagnosen

Ein Lauf, der drei Fotos derselben Tomate auswertet, legte drei Beobachtungen
an. Der Tagesbericht las sich dreimal ähnlich, und das Zusammenfassen blieb am
Leser hängen.

**Gruppiert wird in der Ansicht, nicht im Speicher.** Jeder Befund behält seine
eigene id — daran hängen die Gelesen-Marker und die Zusammenführung über zwei
Geräte. Würde beim Schreiben zusammengelegt, verlöre die Listen-Merge in
`cloud-sync.js` (Ganzsatz-Ersetzung nach id) beim Zusammentreffen zweier Geräte
einen der beiden Absätze.

- `groupKiFindings(list)` in `app.js`: gruppiert nach `plantId|date`, zerlegt
  jeden Text in Absätze und wirft Absätze weg, die es in der Gruppe schon gibt
  (normalisierter Vergleich).
- `ki-diagnose.js` rendert eine Karte je Pflanze und Tag; „Gelesen" markiert
  alle ids der Gruppe, der Zähler zählt Gruppen.
- Die Pflanzenakte fasst KI-Einträge desselben Tages ebenso zusammen.
- **Über Tage hinweg wird nichts zusammengelegt.** Ein am nächsten Morgen
  bestätigtes Problem ist eine Bestätigung und gehört gelesen.
- Der Lauf selbst schreibt ab jetzt **einen Eintrag je Pflanze**: `sourcePhotos`
  (Array) tritt neben `sourcePhoto`, damit ein konsolidierter Eintrag mehrere
  Fotos aus der Warteschlange nehmen kann. Die App liest beides nicht — es ist
  reines Gedächtnis des Laufs.

## 3. Modell der KI-Diagnose

Bestätigt: die Cloud-Routine `trig_01WGicrr1NgzQ11gYRMcxT6w` läuft auf
`claude-opus-5`, sowohl in `session_context.model` als auch in `config.model`.
Kein Handlungsbedarf.

## 4. Titelbild-Fallback

Eine Pflanze mit sechs Verlaufsfotos, aber ohne gesetztes Titelbild, zeigte
„Kein Foto" — ausgerechnet die am besten dokumentierte Pflanze sah aus wie die
undokumentierte.

- `coverPhotoFor(id)` liefert das Titelbild, ersatzweise das **neueste
  Verlaufsfoto**. Reine Anzeige: es wird nichts geschrieben, ein echtes
  Titelbild gewinnt weiterhin.
- Die Pflanzenakte kennzeichnet den Ersatz und bietet „Als Titelbild
  übernehmen" (`promoteCover`).
- `addTimelinePhoto` macht das **erste** Verlaufsfoto einer Pflanze ohne
  Titelbild gleich zum echten Titelbild — die Ursache, nicht nur das Symptom.

## 5. Klickbare Verweise auf Dünger und Pflanzen

„Compo Blaukorn, 10 ml auf 5 l" ist eine Anweisung, deren Gegenstand eine
eigene Seite hat (NPK, Dosierung, Foto der Packung). Bisher hieß der Weg
dorthin: Namen merken, Reiter wechseln, suchen.

- `linkRefs(escapedText)` ersetzt bekannte Pflanzen- und Düngernamen durch
  Knöpfe. **Nur auf bereits escaptem Text aufrufen.** Ein Durchlauf, längste
  Namen zuerst, keine Rekursion in Ersetzungen.
- `openFertilizer(id)` wechselt in den passenden Reiter (`Dünger` oder
  `Diverses`) und öffnet die Detailkarte; `openPlantFile(id)` gibt es schon.
- Angewandt auf: KI-Befunde, Vorschlagstexte, Aufgabennotizen, Verlaufseinträge
  der Pflanzenakte. Das gewählte Produkt auf der Aufgabenkarte ist direkt ein
  Link.

---

## Prüfen

- `node test-feeding-calendar.js` — **neu**, 69 Prüfungen: Fenster-Arithmetik
  (auch über den Jahreswechsel), `clampScheduledTasks`, „kein Produkt außerhalb
  der Periode", automatische Phasenumstellung, Zusammenfassung je Pflanze und
  Tag, Verlinkung samt Escaping, und die gerenderte Aufgabenkarte in beiden
  Zuständen. „Heute" ist über `atDate()` festgenagelt — ein Test, der von der
  Systemuhr abhängt, ist keiner, sondern eine Jahreszeit.
- `node test-photo-identity.js` — enthält den Abgleich `APP_BUILD` ↔
  Service-Worker-`CACHE` und „jedes von `applyKiDiagnosis` gelesene Feld steht
  in SKILL.md".
- Drei Kopien, eine Änderung: `app.js`/`cloud-sync.js`, `skills/garten/SKILL.md`
  und der Routine-Prompt (`RemoteTrigger`, `action: "update"`) beschreiben
  dasselbe Protokoll. Alle drei sind für v62 nachgezogen (Routine-Prompt am
  5. September 2026 aktualisiert und gegengelesen).

## Abstand zwischen ZWEI Düngeaufgaben — gebaut

Der Kalender sperrt die Saison und hält den Abstand innerhalb **einer** Aufgabe.
Zwischen zwei Düngeaufgaben derselben Pflanze hielt ihn niemand: wer eine Woche
zu spät düngt und danach die zweite Aufgabe planmäßig abarbeitet, bekommt beide
Gaben in dieselbe Woche — und sieht es nicht, weil jede Karte für sich völlig
plausibel aussieht.

Jede **tatsächliche** Gabe (Abhaken, „✓ mit Notiz", nachträglich über „Erledigt
am") sieht jetzt die übrigen Düngeaufgaben derselben Pflanze durch und schiebt
die zu dicht liegenden nach hinten.

**Das Maß ist keine erfundene Zahl:** der **kürzere der beiden Rhythmen**.
Verträgt eine Pflanze alle 7 Tage eine Gabe, sind 7 Tage zwischen zwei
verschiedenen Gaben per Definition in Ordnung — und ändert die KI ein Intervall,
wandert das Maß mit, ohne dass jemand nachzieht.

**Verschoben wird nur nach hinten.** Eine Gabe vorzuziehen, weil rechnerisch
Platz wäre, ist das Gegenteil des Ziels.

**Zwei Fälle bleiben absichtlich unberührt** — das ist die Unterscheidung
zwischen „unrelated and fine" und „the sequence makes sense":

| Fall | Erkennungsmerkmal | Warum |
| --- | --- | --- |
| Getrennte Saisonereignisse | Monatsfenster überlappen nicht | Frühjahrs- und Herbst-Rasendünger sind zwei Ereignisse. Eine Aprilgabe darf den Herbstdünger nicht ins nächste Jahr schieben. |
| Geplante Folge | gemeinsamer `planId` | Startgabe und Nachschub aus **einem** bestätigten Pflegeplan: die enge Folge ist die Absicht, und die gehört dem Plan, nicht dieser Funktion. |

Nicht-Düngeaufgaben sind nie betroffen — eine Schädlingskontrolle zwei Tage nach
einer Düngung ist kein Konflikt.

Jede Verschiebung landet als `feed-gap`-Eintrag im Journal („Flüssig nachdüngen:
07.09. → 12.09. – Mindestabstand nach Kaliumbetont düngen") und im Toast. Ein
Termin, der sich unbemerkt verschiebt, wäre schlimmer als einer, der zu früh
steht.

**Zwei Nebenbaustellen, die dazugehörten:**

- `startTask` plant eine Düngung nicht mehr ins Leere: liegt laut Verlauf eine
  frische Gabe auf der Pflanze, beginnt sie frühestens einen Mindestabstand
  danach (`lastFeedingDate` liest `history`-Einträge mit `fertilizer` — die
  tatsächlich ausgebrachten Gaben, nicht den Aufgabenzustand).
- `initializeCareTasks` prüfte `id.endsWith(':duengen')` und übersah damit
  ausgerechnet die Namen, die die KI vergibt (`duengen-fluessig`): eine per
  Pflegeplan hinzugekommene zweite Düngung startete beim nächsten App-Start mit
  Fälligkeit **heute**, auch wenn gestern gedüngt wurde. Jetzt `isFeedTask`.

**Was NICHT gedeckt ist:** die Menge. Dass zwei Gaben weit genug
auseinanderliegen, sagt nichts darüber, ob die Dosis stimmt. Dafür bleibt der
`feedingLog` die Quelle des täglichen Laufs.

## Am 5. September 2026 im Browser gegengeprüft

Lokal ausgeliefert (`python -m http.server`) und mit echtem Zustand bespielt:
gespeicherter August-Termin des Winterschneeballs auf 2027-03-01 zurückgeholt
und über einen Reload hinweg stabil; die ruhende Karte zeigt kein Produkt,
keine Dosierung und kein „Einplanen"; der Düngekalender markiert Mär–Jun; ein
Verlaufsfoto ohne Titelbild erscheint als Titelbild samt „Als Titelbild
übernehmen"; drei Befunde auf zwei Tagen werden zu zwei Karten (der doppelte
Absatz genau einmal); ein Klick auf „Compo Blaukorn" im Diagnosetext wechselt
in den Reiter Dünger und öffnet die Detailkarte. Keine Konsolenfehler,
Datenprüfung grün.
