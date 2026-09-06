# Gartenjahr-Leiste

**Status:** UMGESETZT in v63 (6. September 2026). Entwurf abgenommen als Variante B.
**Date:** 2026-09-06
**Type:** new-feature
**Scope:** Eine horizontale Jahresleiste in jeder Pflanzenakte, die alle Pflegeaktivitäten
über die zwölf Monate zeigt — Düngefenster samt Produktwechsel, Schnitt, Ein- und
Auswintern, Gießen, Kontrollen.

Entwurf zum Anfassen: <https://claude.ai/code/artifact/e9c821c0-93b5-454b-8aac-6968ecc7bd04>

---

## Warum

Der Pflegeplan in der Akte ist eine Liste von Karten. Jede Karte ist für sich richtig, aber
die Frage „was passiert bei dieser Pflanze über das Jahr, und wie greift das ineinander"
beantwortet keine von ihnen. Genau diese Frage stellt sich beim Planen — und genau an ihr
sind diese Woche zwei Fehler sichtbar geworden (Düngung außerhalb der Periode, zwei
Düngungen zu dicht beieinander), die auf einer Jahresansicht sofort ins Auge gefallen wären.

## Datenlage (gemessen, nicht geschätzt)

62 eingebaute Aufgaben, 17 Typen. Düngen dominiert (27), dann Schnitt (8), Kontrolle (5),
Ein-/Auswintern (7), Wasser (3). **Median 2 Aufgaben je Pflanze, höchstens 4** — die Leiste
ist ein 2- bis 4-Zeilen-Diagramm, keine dichte Gantt-Tafel. 20 der 62 sind
Jahresereignisse (`interval >= 365`), die übrigen 42 Rhythmen innerhalb eines Fensters.
Genau ein Fenster überschreitet den Jahreswechsel (`olive:kontrolle`, Dez–Feb).

## Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Umfang | **Alle** Pflegeaktivitäten, nicht nur Düngung. Je Pflanze eine Leiste, ausnahmslos. |
| Layout | **Variante B**: Beschriftung über dem Balken, Balken über die volle Breite. Als einzige Variante ist ein Monat am Handy so breit wie am iPad — und daran hängt, ob „Juni" ablesbar bleibt. Die zusätzliche Höhe ist die Ressource im Überfluss, die Breite die knappe. |
| Zeilen | Eine Zeile je Aufgabe. Bei 2–4 Aufgaben löst Gruppieren ein Gedränge, das es nicht gibt — und verstecken würde, dass zwei Düngeaufgaben existieren. |
| Reihenfolge | Nach Kategorie (Düngen, Wasser, Schnitt, Schutz, Kontrolle), darin nach Fensterbeginn. |
| Wiederkehrend vs. einmalig | Gefüllter Balken mit Takt-Strichen ⇄ Umriss mit Nadel. |
| Düngerwechsel | Echte Phasenstücke, siehe unten. |
| Verlauf | **Nein.** Die Leiste zeigt den Plan fürs Jahr, nicht was passiert ist. |
| Heute | Senkrechter Strich plus getönter aktueller Monat. |
| Antippen | Springt zur Aufgabenkarte derselben Aufgabe. |
| Optional / noch nicht aktiv | „optional"-Tag in der Beschriftung; noch nicht aktivierte Aufgaben blass und schraffiert. |
| Platzierung | **Ersetzt** den `Düngekalender`-Abschnitt aus v62. Zwei Kalender in einer Akte sind schlechter als einer. |
| Handy | Alle zwölf Monate sichtbar, kein Querscrollen. Ein Jahr, für das man scrollen muss, ist kein Jahr auf einen Blick. |

## Bildsprache

- **Gefüllter Balken mit feinen Strichen** — wiederkehrender Rhythmus. Die Strichdichte *ist*
  der Rhythmus. Unter ~4 px Abstand fällt die Schraffur weg; dann trägt die volle Fläche die
  Aussage „laufend". Die Striche werden global übers Jahr gerechnet und den Stücken
  zugeordnet, damit der Takt über einen Phasenwechsel hinweg gleichmäßig bleibt.
- **Umriss mit Nadel** — einmal im Jahr. Die Umrissbreite zeigt den Spielraum: „einmal, im
  März" sieht anders aus als „einmal, irgendwann Juli–August".
- **Farbe aus dem Aufgabennamen abgeleitet**, nicht fest verdrahtet: Düngen grün, Schnitt
  bernstein, Wasser blau, Schutz/Winter violett, Kontrolle grau, neutraler Rückfall sonst.
  Die KI darf neue Typen erfinden, ohne dass die Leiste blind wird.
- **Fenster über den Jahreswechsel werden zwei Segmente.** Auf einer Achse Januar→Dezember
  ist das kein Fehler, sondern was ein Kalenderjahr mit so einem Fenster macht.

### Der Düngerwechsel — die eine Aussage, die nur diese Ansicht machen kann

Erster Entwurf: eine Tönung für das ganze Fenster, Wechsel als 1,5-px-Haarstrich. Damit war
die wichtigste Aussage die unauffälligste — vom Nutzer sofort beanstandet. Jetzt dreifach
codiert:

1. **Echte Phasenstücke.** Das Fenster zerfällt in ein Segment je Phase, jedes mit eigener
   Tönung auf einer Rampe von hell (früh im Jahr) nach satt (spät).
2. **Raute auf der Kante**, in einer Kerbe. Zwei Tönungen allein läsen sich als
   Schattierung, nicht als Umstellung.
3. **Bildunterschrift mit denselben Tönungen**: „Apr–Mai Brennnesseljauche · Jun–Sep
   Kaliumbetonter Tomatendünger". Der Balken sagt *wann*, die Zeile darunter sagt *womit* —
   „Brennnesseljauche" braucht rund 110 px, das Aprilfenster der Tomate ist am Handy 25 px
   breit. Am Handy bricht die Zeile auf eine Zeile je Phase um, was besser liest als eine
   gedrängte.

Die Bildunterschrift gilt für **jede** Düngeaufgabe mit benannter Phase, auch für die
jährlichen (`rasen:fruehjahrsduenger` → „Apr Stickstoffbetont").

## Was der Entwurf schon gefangen hat

`fertilizerPlans` ist nach **Pflanze** verschlüsselt, nicht nach Aufgabe. Ohne Prüfung auf
die Kategorie bekam auch die Braunfäule-Kontrolle der Tomate einen Juni-Splitter verpasst,
weil die Tomate im Juni umstellt. Im Prototyp kosmetisch — in der App hätte es eine
Düngerphasengrenze auf eine Krankheitskontrolle gezeichnet. **`phaseFor` prüft deshalb
zuerst `category(type) === 'feed'`.** Diese Falle steckt im Port genauso.

## Testing Strategy

**Approach:** spec-driven-tdd — die Geometrie wird in `test-feeding-calendar.js` gepinnt,
das Rendering wie bei `taskHTML` über den echten String geprüft.

- **Gegeben** `olive:kontrolle` mit Fenster `[12,1,2]`, **wenn** die Leiste gezeichnet wird,
  **dann** entstehen genau zwei Segmente (Jan–Feb und Dez), nicht eines und nicht drei.
- **Gegeben** `tomaten:duengen` (Apr–Sep, Wechsel im Juni), **wenn** gezeichnet wird,
  **dann** zwei Phasenstücke mit verschiedenen Tönungen, genau eine Umstellmarke, und eine
  Bildunterschrift, die beide Produktnamen nennt.
- **Gegeben** `tomaten:krankheit` (dieselbe Pflanze, aber Kontrolle), **dann** genau ein
  Segment, keine Umstellmarke, keine Bildunterschrift.
- **Gegeben** ein Intervall von 5 Tagen auf 300 px, **dann** keine Takt-Striche (unter der
  Lesbarkeitsschwelle); **gegeben** 49 Tage auf 560 px, **dann** Striche.
- **Gegeben** `hecke:duengen` (`optional`, nicht gestartet), **dann** „optional"-Tag und
  blass-schraffierte Darstellung.
- **Gegeben** eine Pflanze ohne Düngeaufgabe (`lavendel`), **dann** eine Leiste ohne grüne
  Zeile und ohne Bildunterschrift — kein Absturz, keine leere Hülle.
- **Gegeben** ein Klick auf ein Segment, **dann** wird die zugehörige Aufgabenkarte
  angesteuert und hervorgehoben.

## Beim Einbau aufgefallen

- **`requestAnimationFrame` feuert in einem unsichtbaren Tab nicht.** Die
  Taktdichte hängt an der gemessenen Breite, die erst nach dem Einfügen feststeht;
  die Messung lief zuerst per rAF und wäre bei jedem Neuaufbau im Hintergrund
  (Sync, Foto-Import) ausgeblieben — die Leiste hätte auf der Schätzbreite von
  520 px festgesessen. Jetzt `setTimeout(gjMeasure,0)`; `getBoundingClientRect`
  erzwingt das Layout selbst, ein Frame ist also gar nicht nötig.
- **Doppelte ids.** Dieselbe Aufgabe wird in „Heute", „Diese Woche" UND in der
  Akte gerendert, und alle drei stehen gleichzeitig im DOM. Der Sprunganker sitzt
  deshalb nur in der Akte (`taskHTML(d, anchor)`). Dazu mussten alle Aufrufe von
  `.map(taskHTML)` auf `.map(d=>taskHTML(d))` umgestellt werden: blank gereicht
  übergibt `map` den Array-Index als zweites Argument, und der ist ab dem zweiten
  Element wahr — jede Liste hätte Anker bekommen außer dem jeweils ersten Eintrag.
- **Die Sorte in der Bildunterschrift wird nicht verlinkt.** `escLinked` fand
  „Tomaten" mitten in „Tomatendünger" und machte daraus in der Tomaten-Akte einen
  Verweis auf die Tomate selbst. Dort steht eine SORTE aus `fertilizerPlans`, kein
  Produkt aus dem Schuppen — es gibt nichts zu öffnen. Das konkrete Produkt
  verlinkt die Aufgabenkarte darunter.

## Umsetzung

- Neue Sektion in `openPlantFile`, **anstelle** des `Düngekalender`-Blocks aus v62.
- Wiederverwendet aus dem Kalender von v62: `monthsOf`, `isFeedTask`, `phasesOf`,
  `phaseCovers`, `monthRangeLabel`, `category`-Logik neu.
- `APP_BUILD` und Service-Worker-`CACHE` gemeinsam hochziehen (Test erzwingt es).
- Drei Kopien, eine Änderung: die Leiste ändert **keine** Daten und **kein** Inbox-Feld, also
  bleiben `SKILL.md` und der Routine-Prompt unberührt. Vor dem Commit prüfen, ob das noch gilt.
