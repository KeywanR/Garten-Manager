# KI-Diagnose-Inbox

Wie Claude (Mozart) Diagnosen in die App zurückschreibt, ohne die
Single-Writer-Regel zu verletzen (nur das iPad schreibt `gartenmanager-data.json`).

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
  `🟠 Behandlung läuft`, `🔴 Krank`.
- `profile`-Felder: `location`, `planted`, `watering`, `fertilizing`,
  `diseases`, `treatments`, `harvest`, `notes` — Texte werden **angehängt**
  (datiert), nie überschrieben.
- Alle Felder außer `id` und `plantId` sind optional.

## Voraussetzung

App-Scope umfasst `drive.readonly` (seit v20), sonst sind Connector-Dateien
für die App unsichtbar (`drive.file` sieht nur selbst erstellte Dateien).
