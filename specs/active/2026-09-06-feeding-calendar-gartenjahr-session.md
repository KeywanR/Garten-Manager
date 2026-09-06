# Düngeperioden, Abstände, Jahresleiste — und drei Wochen unversandte Arbeit

**Date:** 2026-09-06
**Status:** Active
**Project:** Garten-Manager

## Summary

Vier gemeldete Mängel behoben, eine Folgefrage zu Düngeabständen daraus entwickelt und
eine Jahresübersicht je Pflanze entworfen und gebaut. App v61 → v63, ausgeliefert als
PR #52.

Der wichtigste Befund des Tages war kein Feature: **seit dem 12. August war nichts mehr
committet worden.** Die Live-Seite lief auf v61, während im Arbeitsbaum 957 geänderte
Zeilen lagen — auf einem Branch, der selbst schon gemergt und hinter `main` war. Der
Nutzer meldete „gartenmanager does not update"; die Ursache war nicht Caching, sondern
dass die Arbeit das Gerät nie verlassen hatte.

## Decisions

- **Das Düngefenster gehört der Aufgabe, nicht der Plantabelle.** `months` einer
  Düngeaufgabe ist die einzige Quelle für „wann nimmt diese Pflanze Nahrung auf";
  `fertilizerPlans` sagt nur noch, WOMIT und wann das Produkt wechselt. Nutzer und KI
  können das Fenster über `changeTasks` ändern, ohne dass zwei Tabellen auseinanderlaufen.
- **Ruhe entscheidet HEUTE, das Produkt entscheidet der Termin.** Der erste Fix wäre fast
  auf sich selbst hereingefallen: die Karte las den Dünger zum Folgetermin, und sobald der
  Kalender den Winterschneeball korrekt auf März 2027 schob, fand sie dort ein offenes
  Fenster und zeigte im September wieder ein Produkt. Zwei Zeitpunkte, zwei Fragen.
- **Abstand zwischen zwei Düngungen = der kürzere der beiden Rhythmen.** Keine erfundene
  Zahl; verträgt eine Pflanze alle 7 Tage eine Gabe, sind 7 Tage zwischen zwei
  verschiedenen Gaben per Definition in Ordnung, und ändert die KI ein Intervall, wandert
  das Maß mit. Verschoben wird nur nach hinten.
- **Zwei Fälle bleiben unangetastet:** nicht überlappende Monatsfenster (Frühjahrs- und
  Herbstrasendünger sind zwei Ereignisse) und gemeinsamer `planId` (eine Folge, die der
  Pflegeplan absichtlich so entworfen hat). Das ist die Unterscheidung zwischen
  „unabhängig und in Ordnung" und „die Reihenfolge ist gewollt".
- **KI-Befunde werden in der ANSICHT gruppiert, nicht im Speicher.** Jeder Befund behält
  seine id, weil daran die Gelesen-Marker und die Zusammenführung über zwei Geräte hängen.
  Beim Schreiben zusammenzulegen hätte die Listen-Merge in `cloud-sync.js` (Ersetzung nach
  id) beim Zusammentreffen zweier Geräte einen Absatz kosten können.
- **Über Tage hinweg wird nichts zusammengelegt.** Ein am nächsten Morgen erneut
  bestätigtes Problem ist eine Bestätigung und gehört gelesen — ausdrücklicher Wunsch des
  Nutzers.
- **Die Jahresleiste zeigt den Plan, nicht den Verlauf.** Ebenfalls Nutzerentscheidung:
  „es ist Information, was für die Pflanze im ganzen Jahr geplant ist."
- **Variante B (Beschriftung über dem Balken)** gewinnt, weil als einzige ein Monat am
  Handy so breit ist wie am iPad. Höhe ist bei median zwei Aufgaben je Pflanze im
  Überfluss vorhanden, Breite nicht.
- **Kompost ist ein Dünger im Bestand, keine eigene Aufgabenart.** Er ist eine Substanz,
  die der Nutzer besitzt — genau wofür `fertilizers[]` da ist. NPK bleibt leer; die
  Bewertung behandelt ein Produkt ohne Analyse als brauchbaren Rückfall, statt es eine
  echte Kaliumgabe schlagen zu lassen.
- **Am Entwurf getestet, bevor gebaut.** Der Prototyp (Artifact) hat zwei Fehler gefangen,
  bevor sie in `app.js` waren: Phasengrenzen auf Nicht-Düngeaufgaben, und ein
  Düngerwechsel, der als 1,5-px-Haarstrich unsichtbar blieb.

## Open Questions

- **Selbst-Merge.** Die Frage aus dem 12.-August-Protokoll steht weiter offen, wurde heute
  aber praktisch beantwortet: der Assistent hat bei „PR eröffnet" gestoppt, der Nutzer hat
  gemergt. Sollte das die Regel bleiben? Merge ist in diesem Repo der Deploy.
- **Das Versionsetikett auf `d68cddc` sagt `v60 -> v63`, richtig wäre `v61 -> v63`.** Der
  Rumpf derselben Nachricht nennt korrekt `v61 -> v63`. Nicht korrigiert: dafür müsste
  gemergte `main`-Historie umgeschrieben werden, auf einem Repo, aus dem GitHub Pages
  ausliefert. Der Schaden der Korrektur wäre größer als der des Etiketts.
- **Mengenkontrolle fehlt.** Die App hält jetzt den zeitlichen ABSTAND zwischen Gaben.
  Über die DOSIS sagt das nichts. Dafür bleibt der `feedingLog` die Quelle des täglichen
  Laufs — Urteil, keine Sperre.
- **`linkRefs` trifft Pflanzennamen mitten in Komposita.** In der Bildunterschrift gezielt
  abgeschaltet (aus „Tomatendünger" wurde in der Tomaten-Akte ein Verweis auf die Tomate).
  Ob die allgemeine Verlinkung eine Wortgrenze verlangen sollte, ist offen: deutsche
  Deklination („Oliven") profitiert von der Teilstring-Suche.

## Follow-ups

- Kompost im Reiter „Dünger" eintragen (Nutzeraktion, kein Code): Typ `Dünger`, Form
  `Kompost`, verfügbar, NPK leer.
- Beobachten, ob der Lauf vom 7. September die neuen Felder sauber nutzt —
  `feedingCalendar` und `sourcePhotos` sind zum ersten Mal scharf.
- Prüfen, ob die Zusammenfassung je Pflanze und Tag den Tagesbericht wirklich kürzt, oder
  ob der Lauf weiterhin je Foto einen Eintrag schreibt.
- Die beiden Spec-Dateien vom 7. August liegen jetzt endlich im Repo (Commit `5c87cd7`);
  `split-photos-out-of-the-payload.md` kann nach `completed/`, sobald ein echter
  Zwei-Geräte-Sync den Abrufpfad bestätigt hat.

## Lessons

**„Nichts committet" ist kein Statushinweis, sondern eine Warnung.** Der Assistent hat
jede Runde mit „nothing committed or deployed" geendet und trotzdem nicht gesagt, was das
für den Nutzer bedeutet: dass sich an seiner App nichts ändern wird. Sechs Runden Arbeit
lagen deshalb unbemerkt auf der Platte. Wenn Arbeit das Gerät nicht verlässt, gehört das
in den ersten Satz, nicht in die Fußzeile.
