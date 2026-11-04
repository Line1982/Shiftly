# Datenmodell & Persistenz · Shiftly 🗄️

> **Zweck dieses Dokuments:** Beschreibt die IndexedDB-Struktur, Datensätze, Indizes und das JSON-Sicherungsformat von *Shiftly*.

---

## 1. IndexedDB Datenbank-Definition

- **Datenbank-Name:** `shiftly_db`
- **Aktuelle Version:** `1`

### 1.1 ObjectStore: `shifts`
Enthält alle geleisteten Arbeitsschichten.

| Feld | Typ | Beschreibung | Beispiel |
| :--- | :--- | :--- | :--- |
| `id` (KeyPath) | `String` | Eindeutige ID (`sh_<timestamp>_<random>`) | `"sh_1793524000_a8f9b"` |
| `date` | `String` (ISO) | Schichtdatum (YYYY-MM-DD) | `"2026-11-01"` |
| `year_month` | `String` | Indiziertes Monatsformat (YYYY-MM) | `"2026-11"` |
| `start_time` | `String` | Beginn im Format HH:MM | `"08:00"` |
| `end_time` | `String` | Ende im Format HH:MM | `"12:30"` |
| `break_minutes`| `Number` | Unbezahlte Pause in Minuten | `15` |
| `net_hours` | `Number` | Berechnete Netto-Arbeitszeit (dezimal) | `4.25` |
| `hourly_rate` | `Number` | Stundensatz in EUR zum Schichtzeitpunkt | `13.50` |
| `earnings` | `Number` | Berechneter Bruttoverdienst in EUR | `57.38` |
| `note` | `String` | Optionale Notiz / Tätigkeit | `"Frühschicht Filiale"` |
| `updated_at` | `String` (ISO) | Letzter Bearbeitungszeitpunkt | `"2026-11-01T10:00:00Z"` |

**Indizes auf `shifts`:**
- `date`: Index auf Feld `date` (`unique: false`)
- `year_month`: Index auf Feld `year_month` (`unique: false`) für extrem schnelle Monatsabfragen.

---

### 1.2 ObjectStore: `settings`
Enthält globale Konfigurationswerte der App.

| Key (KeyPath) | Typ | Standardwert | Beschreibung |
| :--- | :--- | :--- | :--- |
| `minijobLimit` | `Number` | `556.0` | Gesetzliche monatliche Verdienstgrenze in EUR |
| `hourlyRate` | `Number` | `13.50` | Standard-Stundenlohn in EUR |
| `defaultBreak` | `Number` | `0` | Standard-Pausenzeit in Minuten bei neuen Schichten |

---

## 2. Backup & Export JSON-Schema (Version 1)

Wird über den Button *„Backup sichern & teilen“* generiert:

```json
{
  "version": 1,
  "exported_at": "2026-11-01T11:45:00.000Z",
  "app": "Shiftly",
  "shifts": [
    {
      "id": "sh_1793524000_a8f9b",
      "date": "2026-11-01",
      "year_month": "2026-11",
      "start_time": "08:00",
      "end_time": "12:30",
      "break_minutes": 15,
      "net_hours": 4.25,
      "hourly_rate": 13.50,
      "earnings": 57.38,
      "note": "Frühschicht",
      "updated_at": "2026-11-01T10:00:00Z"
    }
  ],
  "settings": [
    {
      "key": "minijobLimit",
      "value": 556.0,
      "updated_at": "2026-11-01T10:00:00Z"
    }
  ]
}
```

