# KI-Diagnose

Wie Claude Diagnosen in die App zurückschreibt. Die App selbst ruft **keine
API** auf und braucht **keinen Schlüssel** — es entstehen also keine Kosten
neben dem bestehenden Claude-Abo. Fotos werden in der App aufgenommen oder
importiert, syncen nach Drive, und Claude trägt die Auswertung über die Inbox
ein.

Ergebnisse sammelt der Reiter **KI-Diagnosen** in der App (mit Zähler für
Ungelesenes), damit sie nicht unbemerkt in den einzelnen Pflanzenakten
verschwinden — siehe `ki-diagnose.js`. Dort werden auch importierte Fotos
zugeordnet: ohne Pflanze taucht ein Foto in keiner Akte auf.

## Ablauf

1. Claude analysiert KI-Akte + Fotos aus Drive.
2. Claude erstellt/ergänzt per claude.ai-Drive-Connector die Datei
   **`gartenmanager-ki-diagnose.json`** im Drive-Ordner `Garten-Manager`
   (neue Datei gleichen Namens ist ok — die App liest alle).
3. Beim nächsten Sync liest die App die Inbox, wendet noch nicht angewandte
   Einträge an (`applyKiDiagnosis` in `app.js`, Tracking per Entry-`id` in
   localStorage) und pusht die Änderungen regulär zurück nach Drive.

## Schema

```json
{
  "format": "gartenmanager-ki-diagnose",
  "generated": "2026-07-18T21:00:00Z",
  "entries": [
    {
      "id": "ki-2026-07-18-karfiol-1",
      "plantId": "karfiol",
      "date": "2026-07-18",
      "status": "🟠 Behandlung läuft",
      "reason": "Kurzbegründung für den Gesundheitsstatus",
      "observation": "Freitext — erscheint als Timeline-Eintrag vom Typ 'KI-Diagnose'",
      "profile": {
        "diseases": "wird mit '[KI <datum>] '-Präfix an das Feld angehängt",
        "treatments": "…",
        "notes": "…"
      }
    }
  ]
}
```

Regeln:

- **`id` muss global eindeutig sein** (Konvention: `ki-<datum>-<plantId>-<n>`);
  jede id wird genau einmal angewandt.
- `plantId` = Pflanzen-id aus der KI-Akte (`plants[].plant.id`).
- `status` exakt einer der App-Werte: `🟢 Gesund`, `🟡 Beobachten`,
  `🟠 Behandlung läuft`, `🔴 Handlungsbedarf`. Andere Werte werden von
  `applyKiDiagnosis` verworfen (der bisherige Status bleibt bestehen) — die
  Liste steht als `HEALTH_STATUSES` in `app.js` und ist die einzige Quelle.
- `profile`-Felder: `location`, `planted`, `watering`, `fertilizing`,
  `diseases`, `treatments`, `harvest`, `notes` — Texte werden **angehängt**
  (datiert), nie überschrieben.
- Alle Felder außer `id` und `plantId` sind optional.

## Pflanzen anlegen (seit v21)

Ein Entry kann statt/zusätzlich zu einer Diagnose auch eine neue Pflanze
anlegen (z. B. Zimmerpflanze, die Claude aus einem Foto identifiziert hat):

```json
{
  "id": "ki-2026-07-19-add-monstera",
  "addPlant": {
    "id": "monstera",
    "name": "Monstera deliciosa",
    "cat": "Zimmerpflanzen",
    "note": "Heller Standort ohne direkte Sonne."
  },
  "addTasks": [
    { "type": "wasser", "title": "Gießbedarf prüfen", "interval": 7,
      "months": [1,2,3,4,5,6,7,8,9,10,11,12], "note": "Fingerprobe." }
  ]
}
```

- `addPlant.id` optional (sonst Slug aus dem Namen); existierende ids werden
  übersprungen. `cat` default: `Zimmerpflanzen`.
- Ohne `addTasks` bekommt die Pflanze Standard-Aufgaben ihrer Kategorie
  (Zimmerpflanzen: Gießcheck 7 T, Düngen 14 T Mär–Okt, Schädlingscheck 30 T).
- `plantId` im selben Entry darf entfallen — Diagnose-Felder (`status`,
  `observation`, `profile`) beziehen sich dann auf die neue Pflanze.
- In der App selbst: Pflanzen-Ansicht → Karte "➕ Neue Pflanze hinzufügen".

## Fotos mitliefern (seit v22)

Claude kann einem Entry ein Foto mitgeben: erst das Bild in den
Drive-Unterordner `photos/` hochladen (Namensschema `<plantId>_<datum>.<ext>`),
dann im Entry referenzieren:

```json
{
  "id": "ki-2026-07-19-monstera-foto",
  "plantId": "monstera",
  "photo": { "file": "monstera_2026-07-19.jpg", "caption": "Erstfoto (KI)", "cover": true }
}
```

- `cover: true` → wird Titelbild, falls die Pflanze noch keines hat; sonst
  (und bei `cover: false`) Verlaufsfoto mit Journal-Eintrag.
- Die App lädt das Bild beim Sync herunter und speichert es lokal wie ein
  selbst aufgenommenes Foto; der Foto-Index verhindert ein Wieder-Hochladen.

## Voraussetzung

App-Scope umfasst `drive.readonly` (seit v20), sonst sind Connector-Dateien
für die App unsichtbar (`drive.file` sieht nur selbst erstellte Dateien).
