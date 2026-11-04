# AI Fast-Lookup & Token-Optimierungs-Index 🧠⚡

> **Zweck dieses Dokuments:** Dieses Dokument ist der hochkomprimierte Leitfaden für KI-Coding-Agenten (Antigravity, Claude, GPT, Gemini). Es ermöglicht, **über 90 % der Token-Kosten einzusparen**, indem es exakt aufzeigt, welche Datei und welche Zeilenbereiche für eine bestimmte Programmieraufgabe relevant sind.
>
> 🛑 **REGEL FÜR DIE KI:** Lies **niemals** ganze Source-Dateien (`app.js`, `db.js`, `time_engine.js`, `styles.css`) komplett ein! Nutze diesen Index, um mit `read_file(StartLine, EndLine)` gezielt nur die benötigten 30–100 Zeilen anzuspringen.

---

## 1. Quick Task Dispatcher (Aufgabe -> Datei & Zeilen)

| Fachliche Aufgabe / Thema | Primäre Datei | Relevante Zeilen | Verbundene Dateien / Schicht |
| :--- | :--- | :--- | :--- |
| **Schichtdauer & Pausenrechnung (Mitternachtssprung)** | [`js/time_engine.js`](file:///d:/Dev/Shiftly/js/time_engine.js) | **10–40** (`calculateNetHours`) | `js/app.js`: Modal Live-Preview |
| **10–15h Wochen-Korridor & Überstunden** | [`js/time_engine.js`](file:///d:/Dev/Shiftly/js/time_engine.js) | **50–85** (`calculateCorridorDelta`, `getIsoWeek`) | `js/app.js`: 180–235 (`renderDashboard`) |
| **Datumsbereichs- & Urlaubs-Aggregation** | [`js/time_engine.js`](file:///d:/Dev/Shiftly/js/time_engine.js) | **85–185** (`aggregateDateRange`) | `js/app.js`: 170–240 (`render`) |
| **Kumulierter Gesamt-Überstundensaldo** | [`js/time_engine.js`](file:///d:/Dev/Shiftly/js/time_engine.js) | **188–215** (`calculateLifetimeOvertime`) | `js/app.js`: 185–210 |
| **IndexedDB Schema & Stores (`shifts`, `settings`)**| [`js/db.js`](file:///d:/Dev/Shiftly/js/db.js) | **15–58** (`init`, `onupgradeneeded` v2) | `docs/DATA_MODEL.md` |
| **Einträge CRUD (Arbeitsschichten & Urlaub)** | [`js/db.js`](file:///d:/Dev/Shiftly/js/db.js) | **60–120** (`getAllRecords`, `saveRecord`) | `js/app.js`: Event-Bindings & Handler |
| **Settings Storage (10–15h, Urlaubstage, Namen)**| [`js/db.js`](file:///d:/Dev/Shiftly/js/db.js) | **125–160** (`getSetting`, `setSetting`) | `js/app.js`: 45–70 (`loadSettings`) |
| **JSON Datensicherung (Web Share API / File)** | [`js/export_service.js`](file:///d:/Dev/Shiftly/js/export_service.js) | **10–55** (`backupAndShare`) | `js/app.js`: 445–460 (`handleBackupShare`) |
| **Stundenzettel CSV-Export (Excel-kompatibel)** | [`js/export_service.js`](file:///d:/Dev/Shiftly/js/export_service.js) | **85–125** (`exportDateRangeCsv`) | `js/app.js`: 475–485 (`handleExportCsv`) |
| **Druck-Stundenzettel (DIN A4 PDF Rendering)** | [`js/app.js`](file:///d:/Dev/Shiftly/js/app.js) | **300–375** (`renderPrintTimesheet`) | [`styles.css`](file:///d:/Dev/Shiftly/styles.css): 420–475 (`@media print`) |
| **Zeitraum-Filter & Schnell-Presets (26.–25.)** | [`js/app.js`](file:///d:/Dev/Shiftly/js/app.js) | **135–180** (`applyPeriodPreset`, Filter) | `index.html`: `.period-filter-bar` |
| **Vereintes Eingabemodal (Arbeit & Urlaub)** | [`js/app.js`](file:///d:/Dev/Shiftly/js/app.js) | **380–435** (`openEntryModal`, `updateModalTypeFields`)| `index.html`: `#entryModal` |
| **Mobile-First CSS & Safe Areas (Notch)** | [`styles.css`](file:///d:/Dev/Shiftly/styles.css) | **25–65** (Safe-Area Insets & Header) | `index.html`: Viewport-Fit |

---

## 2. Struktur- und Symbolkarte der Module

### 2.1 `js/time_engine.js` (Pure Logic)
- **L10–L40:** `calculateNetHours(startTime, endTime, breakMinutes)`: Ermittelt Netto-Stundenzahl inkl. 24h-Mitternachtsumbruch.
- **L42–L48:** `calculateEarnings(hours, hourlyRate)`: Multiplikation Stunden × Lohn.
- **L50–L62:** `getIsoWeek(dateStr)`: Kalenderwoche nach ISO 8601 (`YYYY-Www`).
- **L64–L80:** `calculateCorridorDelta(actualHours, minHours, maxHours)`: Ermittelt Überstunden (>15h = Plus) oder Minusstunden (<10h = Minus; 10–15h = 0).
- **L82–L185:** `aggregateDateRange(records, startDate, endDate, config)`: Summiert Arbeits- und Urlaubsstunden, Urlaubstage und Wochenaufschlüsselung.
- **L187–L215:** `calculateLifetimeOvertime(allRecords, config)`: Kumulierter Gesamtsaldo aller Zeiten.

### 2.2 `js/db.js` (IndexedDB Wrapper)
- **L15–L58:** `init()`: Öffnet DB `shiftly_db` v2, fordert `navigator.storage.persist()` an, erzeugt Indizes `date`, `year_month`, `type`.
- **L60–L120:** `getAllRecords()`, `saveRecord(record)`, `deleteRecord(id)`.
- **L125–L160:** `getSetting(key, def)`, `setSetting(key, val)`.
- **L165–L230:** `exportAllData()`, `importAllData(payload)`: Vollständiges JSON-Backup & Restore.

### 2.3 `js/export_service.js` (Share & Export)
- **L10–L55:** `backupAndShare()`: Web Share API mit Fallback-Download.
- **L60–L80:** `restoreFromJsonFile(file)`: Validiert und importiert Sicherungsdatei.
- **L82–L125:** `exportDateRangeCsv(agg)`: CSV-Stundenzettel mit UTF-8 BOM für Excel.
- **L127–L135:** `printTimesheet()`: Triggert `window.print()` für DIN A4 PDF.

### 2.4 `js/app.js` (UI Controller)
- **L25–L55:** `init()`, `loadSettings()`, `loadRecords()`.
- **L75–L130:** `bindEvents()`: Date-Picker, Presets, FAB, Modals, Forms.
- **L135–L180:** `applyPeriodPreset(key)`: Schaltet flexiblen Zeitraum um (z. B. 26.–25.).
- **L185–L260:** `renderDashboard(agg, lifetimeOvertime)`: KPI-Karten, Urlaubskonto, Wochenaufschlüsselung.
- **L300–L375:** `renderPrintTimesheet(agg, lifetimeOvertime)`: Erzeugt druckfertigen DIN A4 Stundenzettel mit Unterschriftenzeilen.
- **L380–L445:** `openEntryModal(defaultType, recordId)` & `handleEntrySubmit(e)`.
