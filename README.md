# Shiftly 📱⏱️
> **Flexible Minijob-Zeiterfassung & Monatskontrolle direkt auf dem Smartphone**

Shiftly ist eine 100 % autonome, offline-fähige **Progressive Web App (PWA)** für iOS und Android, entwickelt nach den Zero-Build- und Token-Optimierungsprinzipien von `FinanceDashboard`.

---

## Features
- **100 % Offline & Standalone:** Läuft vollständig im Browser des Smartphones ohne zwingende Internetverbindung oder laufenden PC-Server.
- **Minijob-Radar:** Live-Berechnung des Monatsverdiensts im Verhältnis zur gesetzlichen Minijob-Grenze (z. B. 556 €), Restbudget und Reststunden-Projektion.
- **Transaktionale Persistenz:** Lokale Speicherung in `IndexedDB` mit System-Schutz (`navigator.storage.persist()`).
- **1-Tap Datensicherung:** Teilen des Backups über das native iOS/Android-Menü direkt in Google Drive, iCloud oder die Dateien-App.
- **Stundenzettel-Export:** 1-Klick CSV-/Excel-Export für den Arbeitgeber.
- **Token-Optimiert:** Vollständig indiziert für KI-Agenten in [`docs/AI_INDEX.md`](file:///d:/Dev/Shiftly/docs/AI_INDEX.md).

---

## Schnellstart & Entwicklung
```powershell
# Lokalen Entwicklungsserver starten:
D:\Dev\Tools\Python312\python.exe dev_server.py
```
Öffne anschließend:
- Am PC: `http://localhost:8080`
- Am Handy im selben WLAN: Die im Terminal angezeigte LAN-IP.

---

## Handy-Installation (PWA)
1. Seite im Handy-Browser (Safari auf iOS bzw. Chrome auf Android) aufrufen.
2. **iOS:** Auf das *Teilen*-Symbol tippen → *„Zum Home-Bildschirm“* wählen.
3. **Android:** Auf das 3-Punkte-Menü tippen → *„App installieren“* oder *„Zum Startbildschirm hinzufügen“*.

