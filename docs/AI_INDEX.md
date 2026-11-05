# AI Fast-Lookup & Token-Optimierungs-Index 🧠⚡

> **Zweck dieses Dokuments:** Hochkomprimierter Leitfaden für KI-Coding-Agenten.
> 🛑 **REGEL FÜR DIE KI:** Lies niemals ganze Source-Dateien komplett ein! Nutze diesen Index mit `read_file(StartLine, EndLine)`.

---

## 1. Quick Task Dispatcher (Aufgabe -> Datei & Zeilen)

| Fachliche Aufgabe / Thema | Primäre Datei | Relevante Zeilen | Verbundene Dateien |
| :--- | :--- | :--- | :--- |
| **Schichtdauer & Pausenrechnung** | [`js/time_engine.js`](file:///d:/Dev/Shiftly/js/time_engine.js) | **10–35** (`calculateNetHours`) | `js/app.js`: `updateEntryLiveButton` |
| **Wochen-Zielstunden (12h) & Saldo** | [`js/time_engine.js`](file:///d:/Dev/Shiftly/js/time_engine.js) | **38–60** (`getIsoWeek`, `calculateTargetDelta`) | `js/app.js`: `renderStatusStrip` |
| **Datumsbereichs- & Urlaubs-Aggregation** | [`js/time_engine.js`](file:///d:/Dev/Shiftly/js/time_engine.js) | **62–145** (`aggregateDateRange`) | `js/app.js`: `render`, `renderHistoryTab` |
| **Kumulierter Gesamt-Überstundensaldo** | [`js/time_engine.js`](file:///d:/Dev/Shiftly/js/time_engine.js) | **148–170** (`calculateLifetimeOvertime`) | `js/app.js`: `renderStatusStrip` |
| **IndexedDB Schema & CRUD** | [`js/db.js`](file:///d:/Dev/Shiftly/js/db.js) | **15–140** (`init`, `saveRecord`, `getSetting`) | `docs/DATA_MODEL.md` |
| **Backup, Restore & CSV-Export (ohne Lohn)** | [`js/export_service.js`](file:///d:/Dev/Shiftly/js/export_service.js) | **10–95** (`backupAndShare`, `exportDateRangeCsv`) | `js/app.js`: Export-Handler |
| **Touch-Swipe Navigation & Tabs** | [`js/app.js`](file:///d:/Dev/Shiftly/js/app.js) | **395–445** (`initSwipeNavigation`, `switchTabByIndex`) | `index.html`: `.tabs-viewport`, `.tabs-track` |
| **Direkte 24h-Stundeneingabe & Urlaubs-Kalenderplaner (Tab 1)** | [`js/app.js`](file:///d:/Dev/Shiftly/js/app.js) | **70–130**, **455–866** (`init24hTimeSelects`, `renderVacationPlanner`, `handleEntrySubmit`) | `index.html`: `#tab-entry` |
| **Verlauf: Eintragsliste & Wochenansicht (Tab 2)**| [`js/app.js`](file:///d:/Dev/Shiftly/js/app.js) | **985–1100** (`renderHistoryTab`) | `index.html`: `#tab-shifts` |
| **DIN A4 Druck-Stundenzettel** | [`js/app.js`](file:///d:/Dev/Shiftly/js/app.js) | **1130–1215** (`renderPrintTimesheet`) | [`styles.css`](file:///d:/Dev/Shiftly/styles.css): **1415–1470** (`@media print`) |
| **Single-Screen Layout (`100dvh`, Zero Scroll)** | [`styles.css`](file:///d:/Dev/Shiftly/styles.css) | **40–105** (`.app-shell`, `.tabs-track`, `.tab-screen`) | `index.html` |
