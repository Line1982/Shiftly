# AI Agent Guidelines & Token-Optimization · Shiftly 📱⏱️

> **Mandatory AI Instruction:** When handling coding, debugging, or enhancement requests in this workspace, **always consult [`docs/AI_INDEX.md`](file:///d:/Dev/Shiftly/docs/AI_INDEX.md) first**.
> Do NOT read entire source files (`js/app.js`, `js/db.js`, `js/time_engine.js`, `js/export_service.js`, `styles.css`) into context. Jump directly to the exact line ranges documented in the index using `read_file(StartLine, EndLine)`.

---

## 1. Documentation Map
- **Token-Spar-Index & Zeilen-Ranges:** [`docs/AI_INDEX.md`](file:///d:/Dev/Shiftly/docs/AI_INDEX.md)
- **Gesamtarchitektur & Offline-First PWA:** [`docs/ARCHITECTURE.md`](file:///d:/Dev/Shiftly/docs/ARCHITECTURE.md)
- **IndexedDB Schema & Backup-Format:** [`docs/DATA_MODEL.md`](file:///d:/Dev/Shiftly/docs/DATA_MODEL.md)

---

## 2. Invarianten für dieses Projekt
1. **Zero-Build Vanilla PWA:** Reines modernes Vanilla JS (ES Modules), HTML5 und CSS3. Kein Node.js, kein NPM, kein Webpack, kein Vite oder fremder Bundler.
2. **100 % Offline-First:** Alle Funktionen müssen ohne Netzwerkzugriff im Handy funktionieren (`IndexedDB` + Service Worker Cache).
3. **Persistenter Speicher:** Nutzt `navigator.storage.persist()`, um automatische Browser-Bereinigung auf iOS/Android zu verhindern.
4. **Schutz vor Datenverlust:** 1-Tap Backup & Share (Web Share API / JSON-Export) und CSV-/PDF-Export direkt im Browser ohne Server.
5. **C:\ Drive Schutz:** Keine großen temporären Builds oder Caches auf `C:\` schreiben (`C:\` hat akuten Platzmangel). Projekt bleibt auf `D:\Dev\Shiftly`.
6. **Mobile First UI:** Vollbildfähige Standalone-PWA mit Safe-Area-Insets (iOS Notch & Dynamic Island, Android Gestenleiste) und Touch-optimierten Bedienfeldern.
7. **Sprache:** UI ist Deutsch (`de-DE`), Code/Kommentare/Identifier sind strikt Englisch.
8. **PowerShell 5.1 Kompatibilität:** Host-Shell nutzt ausschließlich Windows PowerShell 5.1 (`powershell.exe`).
9. **Git:** Niemals eigenmächtig `git commit` oder `git push` ausführen, es sei denn der Anwender weist dies explizit an.

