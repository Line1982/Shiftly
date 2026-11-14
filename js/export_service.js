/**
 * Shiftly Export & Backup Service (js/export_service.js)
 * Handles JSON backup via Web Share API or download, JSON restore, CSV export and printable timesheets.
 */

import { db } from './db.js';
import { TimeEngine } from './time_engine.js';

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
   * Detects iOS / iPadOS devices where window.print() is a no-op in standalone PWAs and WKWebView browsers.
   */
  static isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /**
   * Prepares and triggers printable timesheet view.
   * On iOS, generates an offline DIN A4 PDF and opens the native Share Sheet (AirPrint / Save to Files).
   */
  static async printTimesheet(data) {
    if (!this.isIOS() || !data) {
      window.print();
      return { success: true, method: 'print' };
    }

    const pdfBytes = this.buildTimesheetPdf(data);
    const { startDate, endDate } = data.agg;
    const fileName = `Stundenzettel_${startDate}_bis_${endDate}.pdf`;
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const file = new File([blob], fileName, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'Stundenzettel',
          files: [file]
        });
        return { success: true, method: 'share' };
      } catch (err) {
        if (err.name === 'AbortError') {
          return { success: false, cancelled: true };
        }
        console.warn('Native PDF share failed, using fallback download:', err);
      }
    }

    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank');
    if (opened) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { success: true, method: 'open' };
    }

    URL.revokeObjectURL(url);
    this.downloadFile(blob, fileName);
    return { success: true, method: 'download' };
  }

  /**
   * Builds a minimal, valid DIN A4 PDF 1.4 document for the timesheet without external dependencies.
   */
  static buildTimesheetPdf({ agg, lifetimeOvertime, config }) {
    const pageW = 595.28;
    const pageH = 841.89;
    const margin = 36;
    const contentW = pageW - margin * 2;
    const colWidths = [78, 52, 52, 68, contentW - 250];
    const rowH = 19;

    const userDisplay = config.userName || 'Mitarbeiter/in';
    const employerDisplay = config.employerName || 'Arbeitgeber';
    const periodDeltaStr = `${agg.periodOvertimeDelta > 0 ? '+' : ''}${TimeEngine.formatHoursPretty(agg.periodOvertimeDelta)}`;
    const lifetimeStr = `${lifetimeOvertime > 0 ? '+' : ''}${TimeEngine.formatHoursPretty(lifetimeOvertime)}`;

    const pages = [];
    let cmds = [];
    let y = pageH - margin;

    const addText = (text, x, yPos, size = 10, bold = false) => {
      const font = bold ? '/F2' : '/F1';
      cmds.push(`BT ${font} ${size} Tf ${x.toFixed(2)} ${yPos.toFixed(2)} Td (${this.pdfEscape(text)}) Tj ET`);
    };

    const addRightText = (text, rightX, yPos, size = 10, bold = false) => {
      const approxCharW = size * 0.52;
      const estW = String(text).length * approxCharW;
      addText(text, Math.max(margin, rightX - estW), yPos, size, bold);
    };

    const addRect = (x, yBottom, w, h, fillGray = null, stroke = true) => {
      if (fillGray !== null) {
        cmds.push(`${fillGray} g ${x.toFixed(2)} ${yBottom.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`);
      }
      if (stroke) {
        cmds.push(`0.5 w 0.45 G ${x.toFixed(2)} ${yBottom.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S 0 G`);
      }
    };

    const drawTableHeader = () => {
      const headers = ['Datum', 'Beginn', 'Ende', 'Stunden', 'Notiz'];
      const topY = y;
      let cx = margin;
      for (let i = 0; i < headers.length; i++) {
        addRect(cx, topY - rowH, colWidths[i], rowH, 0.94, true);
        if (i === 3) {
          addRightText(headers[i], cx + colWidths[i] - 5, topY - 13, 9.5, true);
        } else {
          addText(headers[i], cx + 5, topY - 13, 9.5, true);
        }
        cx += colWidths[i];
      }
      y -= rowH;
    };

    // Document Header
    addText('STUNDENZETTEL', margin, y - 14, 15, true);
    addRightText(`Zeitraum: ${agg.startDate} bis ${agg.endDate}`, pageW - margin, y - 12, 9.5, false);
    y -= 28;

    cmds.push(`0.7 w 0.75 G ${margin} ${y.toFixed(2)} m ${(pageW - margin).toFixed(2)} ${y.toFixed(2)} l S 0 G`);
    y -= 16;

    addText(`Name: ${userDisplay}`, margin, y, 9.5, false);
    addText(`Firma: ${employerDisplay}`, margin + contentW * 0.52, y, 9.5, false);
    y -= 14;
    addText(`Zielstunden: ${config.weeklyTargetHours} Std./Woche`, margin, y, 9.5, false);
    y -= 10;

    cmds.push(`0.7 w 0.75 G ${margin} ${y.toFixed(2)} m ${(pageW - margin).toFixed(2)} ${y.toFixed(2)} l S 0 G`);
    y -= 16;

    drawTableHeader();

    const rows = agg.records.length > 0 ? agg.records : [null];
    for (const r of rows) {
      if (y - rowH < margin + 45) {
        pages.push(cmds.join('\n'));
        cmds = [];
        y = pageH - margin;
        drawTableHeader();
      }

      const topY = y;
      let cx = margin;
      if (!r) {
        addRect(margin, topY - rowH, contentW, rowH, null, true);
        addText('Keine Eintraege im Zeitraum.', margin + 8, topY - 13, 9, false);
        y -= rowH;
        continue;
      }

      const isVac = r.type === 'vacation';
      const noteRaw = r.note || (isVac ? 'Urlaub' : '');
      const noteTrunc = noteRaw.length > 52 ? `${noteRaw.slice(0, 49)}...` : noteRaw;
      const cells = [
        r.date,
        isVac ? '-' : (r.start_time || '-'),
        isVac ? '-' : (r.end_time || '-'),
        TimeEngine.formatHoursPretty(r.net_hours),
        noteTrunc
      ];

      for (let i = 0; i < cells.length; i++) {
        addRect(cx, topY - rowH, colWidths[i], rowH, null, true);
        if (i === 3) {
          addRightText(cells[i], cx + colWidths[i] - 5, topY - 13, 9, true);
        } else {
          addText(cells[i], cx + 5, topY - 13, 9, false);
        }
        cx += colWidths[i];
      }
      y -= rowH;
    }

    // Summary row
    if (y - rowH < margin + 25) {
      pages.push(cmds.join('\n'));
      cmds = [];
      y = pageH - margin;
    }
    const sumLabelW = colWidths[0] + colWidths[1] + colWidths[2];
    addRect(margin, y - rowH, sumLabelW, rowH, 0.92, true);
    addText('GESAMTSUMME:', margin + 5, y - 13, 9.5, true);

    addRect(margin + sumLabelW, y - rowH, colWidths[3], rowH, 0.92, true);
    addRightText(TimeEngine.formatHoursPretty(agg.totalHours), margin + sumLabelW + colWidths[3] - 5, y - 13, 9.5, true);

    addRect(margin + sumLabelW + colWidths[3], y - rowH, colWidths[4], rowH, 0.92, true);
    addText(`Saldo: ${periodDeltaStr}`, margin + sumLabelW + colWidths[3] + 5, y - 13, 9.5, true);
    y -= rowH + 18;

    addText(`Überstunden-Saldo gesamt: ${lifetimeStr}`, margin, y, 9, true);
    pages.push(cmds.join('\n'));

    return this.assemblePdfBytes(pages, pageW, pageH);
  }

  /**
   * Encodes a JS string into WinAnsi-compatible PDF literal string, escaping special PDF chars.
   */
  static pdfEscape(str) {
    let out = '';
    for (const ch of String(str ?? '')) {
      const code = ch.charCodeAt(0);
      let byte = 63; // '?'
      if (code >= 0x20 && code <= 0x7E) {
        byte = code;
      } else if (code >= 0xA0 && code <= 0xFF) {
        byte = code;
      } else if (code === 0x20AC) {
        byte = 0x80; // €
      } else if (code === 0x2013) {
        byte = 0x96; // –
      } else if (code === 0x2014) {
        byte = 0x97; // —
      }
      if (byte === 0x28 || byte === 0x29 || byte === 0x5C) {
        out += '\\' + String.fromCharCode(byte);
      } else {
        out += String.fromCharCode(byte);
      }
    }
    return out;
  }

  /**
   * Assembles PDF 1.4 objects and xref table into a Uint8Array with exact byte offsets.
   */
  static assemblePdfBytes(pageStreams, pageW, pageH) {
    const chunks = [];
    let offset = 0;
    const offsets = [0];

    const pushAscii = (str) => {
      const arr = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        arr[i] = str.charCodeAt(i) & 0xFF;
      }
      chunks.push(arr);
      offset += arr.length;
    };

    const addObj = (body) => {
      offsets.push(offset);
      const id = offsets.length - 1;
      pushAscii(`${id} 0 obj\n${body}\nendobj\n`);
      return id;
    };

    pushAscii('%PDF-1.4\n');

    const fontRegularId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    const pagesPlaceholderIndex = offsets.length;
    const pagesId = pagesPlaceholderIndex;
    // Reserve ID for Pages object; we'll build page objects starting after it
    const pageIds = [];
    const contentIds = [];
    const firstPageObjId = pagesId + 1;

    // Pre-calculate IDs: for each page we emit contentObj then pageObj
    for (let i = 0; i < pageStreams.length; i++) {
      contentIds.push(firstPageObjId + i * 2);
      pageIds.push(firstPageObjId + i * 2 + 1);
    }

    // Write Pages object first
    addObj(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);

    for (let i = 0; i < pageStreams.length; i++) {
      const stream = pageStreams[i];
      addObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      addObj(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> ` +
        `/Contents ${contentIds[i]} 0 R >>`
      );
    }

    const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    const xrefOffset = offset;
    pushAscii(`xref\n0 ${offsets.length}\n`);
    pushAscii('0000000000 65535 f \n');
    for (let i = 1; i < offsets.length; i++) {
      pushAscii(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    }
    pushAscii(`trailer\n<< /Size ${offsets.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of chunks) {
      result.set(c, pos);
      pos += c.length;
    }
    return result;
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
