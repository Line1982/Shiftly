/**
 * Shiftly Export & Backup Service (js/export_service.js)
 * Handles JSON backup via Web Share API or download, JSON restore, CSV export and printable timesheets.
 */

import { db } from './db.js';

export class ExportService {
  /**
   * Triggers native Web Share API with fallback to browser file download.
   */
  static async backupAndShare() {
    const backupData = await db.exportAllData();
    const jsonStr = JSON.stringify(backupData, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `shiftly_backup_${dateStr}.json`;

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const file = new File([blob], fileName, { type: 'application/json' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'Shiftly Backup',
          text: `Shiftly Datensicherung vom ${dateStr}`,
          files: [file]
        });
        return { success: true, method: 'share' };
      } catch (err) {
        if (err.name === 'AbortError') {
          return { success: false, cancelled: true };
        }
        console.warn('Native share failed, using fallback download:', err);
      }
    }

    this.downloadFile(blob, fileName);
    return { success: true, method: 'download' };
  }

  /**
   * Restores database from a selected JSON file.
   */
  static async restoreFromJsonFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = JSON.parse(e.target.result);
          await db.importAllData(content);
          resolve(true);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Fehler beim Lesen der Datei.'));
      reader.readAsText(file);
    });
  }

  /**
   * Generates and downloads a CSV timesheet file for the given aggregated date range (without earnings).
   */
  static exportDateRangeCsv(aggregation) {
    const { startDate, endDate, records, totalHours, periodOvertimeDelta } = aggregation;
    const lines = [];

    // Header
    lines.push(['Datum', 'Typ', 'Beginn', 'Ende', 'Pause (Min)', 'Stunden', 'Notiz'].map(this.escapeCsv).join(';'));

    // Rows
    for (const r of records) {
      const typeLabel = r.type === 'vacation' ? 'Urlaub' : 'Arbeit';
      lines.push([
        r.date,
        typeLabel,
        r.start_time || '',
        r.end_time || '',
        r.break_minutes ?? 0,
        String(r.net_hours).replace('.', ','),
        r.note || ''
      ].map(this.escapeCsv).join(';'));
    }

    // Summary row
    lines.push(['SUMME', '', '', '', '', String(totalHours).replace('.', ','), `Saldo: ${String(periodOvertimeDelta).replace('.', ',')} h`].map(this.escapeCsv).join(';'));

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const fileName = `Stundenzettel_${startDate}_bis_${endDate}.csv`;

    this.downloadFile(blob, fileName);
  }

  /**
   * Prepares and triggers printable timesheet view.
   */
  static printTimesheet() {
    window.print();
  }

  static escapeCsv(val) {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  static downloadFile(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}
