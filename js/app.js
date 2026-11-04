/**
 * Shiftly Main Application Controller (js/app.js)
 * Manages state, tabs, date range filters, shift/vacation modals, calculations and exports.
 */

import { db } from './db.js';
import { TimeEngine } from './time_engine.js';
import { ExportService } from './export_service.js';

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

class ShiftlyApp {
  constructor() {
    // Default: current calendar month
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();

    this.startDate = `${y}-${m}-01`;
    this.endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    this.activeTab = 'dashboard';
    
    this.config = {
      weeklyHoursMin: 10.0,
      weeklyHoursMax: 15.0,
      hourlyRate: 14.00,
      defaultBreak: 0,
      vacationDaysTotal: 20,
      userName: '',
      employerName: ''
    };

    this.records = [];
    this.editingRecordId = null;
  }

  async init() {
    console.info('Initialisiere Shiftly App...');
    await db.init();
    await this.loadSettings();
    await this.loadRecords();

    this.registerServiceWorker();
    this.bindEvents();
    this.render();
  }

  async loadSettings() {
    const minH = await db.getSetting('weeklyHoursMin', 10.0);
    const maxH = await db.getSetting('weeklyHoursMax', 15.0);
    const wage = await db.getSetting('hourlyRate', 14.00);
    const defBreak = await db.getSetting('defaultBreak', 0);
    const vacTotal = await db.getSetting('vacationDaysTotal', 20);
    const user = await db.getSetting('userName', '');
    const employer = await db.getSetting('employerName', '');

    this.config = {
      weeklyHoursMin: Number(minH),
      weeklyHoursMax: Number(maxH),
      hourlyRate: Number(wage),
      defaultBreak: Number(defBreak),
      vacationDaysTotal: Number(vacTotal),
      userName: String(user),
      employerName: String(employer)
    };
  }

  async loadRecords() {
    this.records = await db.getAllRecords();
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('ServiceWorker registriert:', reg.scope))
          .catch((err) => console.warn('ServiceWorker Registrierung fehlgeschlagen:', err));
      });
    }
  }

  bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    // Preset & Date Range Filter
    const presetSelect = document.getElementById('periodPresetSelect');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => this.applyPeriodPreset(e.target.value));
    }

    const startInput = document.getElementById('filterStartDate');
    const endInput = document.getElementById('filterEndDate');
    if (startInput) {
      startInput.addEventListener('change', (e) => {
        this.startDate = e.target.value;
        this.render();
      });
    }
    if (endInput) {
      endInput.addEventListener('change', (e) => {
        this.endDate = e.target.value;
        this.render();
      });
    }

    // Floating Action Buttons (Add work shift vs. vacation)
    const fabAdd = document.getElementById('fabAddShift');
    if (fabAdd) fabAdd.addEventListener('click', () => this.openEntryModal('work'));

    const btnQuickVacation = document.getElementById('btnQuickAddVacation');
    if (btnQuickVacation) btnQuickVacation.addEventListener('click', () => this.openEntryModal('vacation'));

    // Entry Form Submit
    const entryForm = document.getElementById('entryForm');
    if (entryForm) {
      entryForm.addEventListener('submit', (e) => this.handleEntrySubmit(e));
    }

    // Modal Close
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target === el) this.closeModals();
      });
    });

    // Record Type Toggle in Modal (Work vs. Vacation)
    document.querySelectorAll('input[name="entryType"]').forEach(radio => {
      radio.addEventListener('change', (e) => this.updateModalTypeFields(e.target.value));
    });

    // Time Input live calculation
    ['shiftStart', 'shiftEnd', 'shiftBreak'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('input', () => this.updateModalNetHours());
      }
    });

    // Settings Form
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => this.handleSettingsSubmit(e));
    }

    // Backup & Export actions
    const btnBackup = document.getElementById('btnBackupShare');
    if (btnBackup) btnBackup.addEventListener('click', () => this.handleBackupShare());

    const btnRestore = document.getElementById('btnRestore');
    const fileRestore = document.getElementById('fileRestoreInput');
    if (btnRestore && fileRestore) {
      btnRestore.addEventListener('click', () => fileRestore.click());
      fileRestore.addEventListener('change', (e) => this.handleRestoreFile(e));
    }

    const btnExportCsv = document.getElementById('btnExportCsv');
    if (btnExportCsv) btnExportCsv.addEventListener('click', () => this.handleExportCsv());

    const btnPrint = document.getElementById('btnPrintTimesheet');
    if (btnPrint) btnPrint.addEventListener('click', () => ExportService.printTimesheet());
  }

  applyPeriodPreset(presetKey) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (presetKey === 'current_month') {
      const lastDay = new Date(y, m + 1, 0).getDate();
      this.startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      this.endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else if (presetKey === 'last_month') {
      const prevDate = new Date(y, m, 0);
      const py = prevDate.getFullYear();
      const pm = prevDate.getMonth() + 1;
      const lastDay = prevDate.getDate();
      this.startDate = `${py}-${String(pm).padStart(2, '0')}-01`;
      this.endDate = `${py}-${String(pm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else if (presetKey === 'period_26_to_25') {
      // 26th of previous month to 25th of current month
      let prevM = m;
      let prevY = y;
      if (prevM === 0) { prevM = 12; prevY = y - 1; }
      this.startDate = `${prevY}-${String(prevM).padStart(2, '0')}-26`;
      this.endDate = `${y}-${String(m + 1).padStart(2, '0')}-25`;
    } else if (presetKey === 'period_16_to_15') {
      // 16th of previous month to 15th of current month
      let prevM = m;
      let prevY = y;
      if (prevM === 0) { prevM = 12; prevY = y - 1; }
      this.startDate = `${prevY}-${String(prevM).padStart(2, '0')}-16`;
      this.endDate = `${y}-${String(m + 1).padStart(2, '0')}-15`;
    } else if (presetKey === 'current_year') {
      this.startDate = `${y}-01-01`;
      this.endDate = `${y}-12-31`;
    }

    const startInput = document.getElementById('filterStartDate');
    const endInput = document.getElementById('filterEndDate');
    if (startInput) startInput.value = this.startDate;
    if (endInput) endInput.value = this.endDate;

    this.render();
  }

  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-btn').forEach(el => el.classList.remove('active'));

    const targetPane = document.getElementById(`tab-${tabId}`);
    if (targetPane) targetPane.classList.add('active');

    const activeBtn = document.querySelector(`.bottom-nav-btn[data-tab="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    this.render();
  }

  render() {
    const agg = TimeEngine.aggregateDateRange(this.records, this.startDate, this.endDate, this.config);
    const lifetimeOvertime = TimeEngine.calculateLifetimeOvertime(this.records, this.config);

    this.renderHeader();

    if (this.activeTab === 'dashboard') {
      this.renderDashboard(agg, lifetimeOvertime);
    } else if (this.activeTab === 'shifts') {
      this.renderShiftsList(agg);
    } else if (this.activeTab === 'settings') {
      this.renderSettings();
    }

    this.renderPrintTimesheet(agg, lifetimeOvertime);
  }

  renderHeader() {
    const startInput = document.getElementById('filterStartDate');
    const endInput = document.getElementById('filterEndDate');
    if (startInput && !startInput.value) startInput.value = this.startDate;
    if (endInput && !endInput.value) endInput.value = this.endDate;
  }

  renderDashboard(agg, lifetimeOvertime) {
    // Total Hours
    const totalHoursEl = document.getElementById('kpiTotalHours');
    const totalHoursSub = document.getElementById('kpiTotalHoursSub');
    if (totalHoursEl) totalHoursEl.textContent = TimeEngine.formatHoursPretty(agg.totalHours);
    if (totalHoursSub) {
      totalHoursSub.textContent = `Arbeit: ${TimeEngine.formatHoursPretty(agg.totalWorkHours)} | Urlaub: ${TimeEngine.formatHoursPretty(agg.totalVacationHours)}`;
    }

    // Earnings
    const earningsEl = document.getElementById('kpiTotalEarnings');
    if (earningsEl) earningsEl.textContent = currencyFormatter.format(agg.totalEarnings);

    // Overtime Saldo (Lifetime & Period)
    const overtimeEl = document.getElementById('kpiOvertimeBalance');
    const overtimeSub = document.getElementById('kpiOvertimeSub');
    if (overtimeEl) {
      const sign = lifetimeOvertime > 0 ? '+' : '';
      overtimeEl.textContent = `${sign}${TimeEngine.formatHoursPretty(lifetimeOvertime)}`;
      overtimeEl.className = lifetimeOvertime > 0 ? 'kpi-value text-emerald' : lifetimeOvertime < 0 ? 'kpi-value text-rose' : 'kpi-value';
    }
    if (overtimeSub) {
      const pSign = agg.periodOvertimeDelta > 0 ? '+' : '';
      overtimeSub.textContent = `Zeitraum-Saldo: ${pSign}${TimeEngine.formatHoursPretty(agg.periodOvertimeDelta)} (Soll: 10–15 h/Woche)`;
    }

    // Vacation KPI
    const vacRemainingEl = document.getElementById('kpiVacationRemaining');
    const vacSubEl = document.getElementById('kpiVacationSub');
    if (vacRemainingEl) {
      vacRemainingEl.textContent = `${agg.vacationDaysRemaining} Tage`;
    }
    if (vacSubEl) {
      vacSubEl.textContent = `${agg.vacationDaysTakenYear} von ${agg.totalVacationDays} Tagen genommen (${new Date().getFullYear()})`;
    }

    // Weekly corridor breakdown list
    const weeklyListEl = document.getElementById('dashboardWeeklyBreakdown');
    if (weeklyListEl) {
      if (agg.weeklyDetails.length === 0) {
        weeklyListEl.innerHTML = `<div class="empty-state">Keine Einträge im gewählten Zeitraum.</div>`;
      } else {
        weeklyListEl.innerHTML = agg.weeklyDetails.map(w => {
          const deltaSign = w.delta > 0 ? '+' : '';
          const deltaClass = w.delta > 0 ? 'text-emerald' : w.delta < 0 ? 'text-rose' : 'text-muted';
          const statusText = w.delta === 0 ? '✓ Im Soll (10–15 h)' : `${deltaSign}${TimeEngine.formatHoursPretty(w.delta)} Überstunden`;
          return `
            <div class="weekly-row">
              <div>
                <strong>KW ${w.week.split('-W')[1]}</strong>
                <span class="text-dim" style="font-size: 0.8rem; margin-left: 0.5rem;">${w.recordCount} Einträge</span>
              </div>
              <div style="text-align: right;">
                <div><strong>${TimeEngine.formatHoursPretty(w.hours)}</strong></div>
                <div class="${deltaClass}" style="font-size: 0.75rem;">${statusText}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Recent entries
    const recentList = document.getElementById('dashboardRecentShifts');
    if (recentList) {
      if (agg.records.length === 0) {
        recentList.innerHTML = `<div class="empty-state">Noch keine Einträge in diesem Zeitraum vorhanden.</div>`;
      } else {
        recentList.innerHTML = agg.records.slice(-5).reverse().map(r => this.renderRecordItemHtml(r)).join('');
        this.bindRecordActionButtons(recentList);
      }
    }
  }

  renderShiftsList(agg) {
    const listContainer = document.getElementById('allShiftsList');
    if (!listContainer) return;

    if (agg.records.length === 0) {
      listContainer.innerHTML = `<div class="empty-state">Keine Einträge im gewählten Zeitraum.</div>`;
    } else {
      listContainer.innerHTML = agg.records.map(r => this.renderRecordItemHtml(r)).join('');
      this.bindRecordActionButtons(listContainer);
    }
  }

  renderRecordItemHtml(record) {
    const isVacation = record.type === 'vacation';
    const dateObj = new Date(record.date);
    const dateFormatted = isNaN(dateObj) ? record.date : dateFormatter.format(dateObj);

    return `
      <div class="shift-card ${isVacation ? 'card-vacation' : ''}" data-id="${record.id}">
        <div class="shift-card-header">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="badge ${isVacation ? 'badge-vacation' : 'badge-work'}">${isVacation ? '🌴 Urlaub' : '⏱️ Arbeit'}</span>
            <span class="shift-date">${dateFormatted}</span>
          </div>
          <span class="shift-earnings">${currencyFormatter.format(record.earnings)}</span>
        </div>
        <div class="shift-card-details">
          ${isVacation 
            ? `<span>Vergütete Stunden: <strong>${TimeEngine.formatHoursPretty(record.net_hours)}</strong></span>` 
            : `<span>🕒 ${record.start_time || '—'} – ${record.end_time || '—'} (${TimeEngine.formatHoursPretty(record.net_hours)})</span>
               ${record.break_minutes ? `<span>Pause: ${record.break_minutes} Min.</span>` : ''}`
          }
        </div>
        ${record.note ? `<div class="shift-note">📝 ${escapeHtml(record.note)}</div>` : ''}
        <div class="shift-actions">
          <button class="btn btn-sm btn-ghost btn-edit-record" data-id="${record.id}">Bearbeiten</button>
          <button class="btn btn-sm btn-ghost text-rose btn-delete-record" data-id="${record.id}">Löschen</button>
        </div>
      </div>
    `;
  }

  bindRecordActionButtons(container) {
    container.querySelectorAll('.btn-edit-record').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        this.openEntryModal(null, id);
      });
    });

    container.querySelectorAll('.btn-delete-record').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Diesen Eintrag wirklich löschen?')) {
          await db.deleteRecord(id);
          await this.loadRecords();
          this.render();
        }
      });
    });
  }

  renderSettings() {
    const minHInput = document.getElementById('settingWeeklyMin');
    const maxHInput = document.getElementById('settingWeeklyMax');
    const wageInput = document.getElementById('settingHourlyRate');
    const breakInput = document.getElementById('settingDefaultBreak');
    const vacInput = document.getElementById('settingVacationDays');
    const userInput = document.getElementById('settingUserName');
    const empInput = document.getElementById('settingEmployerName');

    if (minHInput) minHInput.value = this.config.weeklyHoursMin;
    if (maxHInput) maxHInput.value = this.config.weeklyHoursMax;
    if (wageInput) wageInput.value = this.config.hourlyRate;
    if (breakInput) breakInput.value = this.config.defaultBreak;
    if (vacInput) vacInput.value = this.config.vacationDaysTotal;
    if (userInput) userInput.value = this.config.userName;
    if (empInput) empInput.value = this.config.employerName;
  }

  renderPrintTimesheet(agg, lifetimeOvertime) {
    const printSection = document.getElementById('printTimesheetSection');
    if (!printSection) return;

    const userDisplay = this.config.userName || 'Mitarbeiter/in';
    const employerDisplay = this.config.employerName || 'Arbeitgeber';

    let rowsHtml = '';
    for (const r of agg.records) {
      const isVac = r.type === 'vacation';
      rowsHtml += `
        <tr>
          <td>${r.date}</td>
          <td>${isVac ? 'Urlaub (Freigestellt)' : 'Arbeit'}</td>
          <td>${isVac ? '—' : (r.start_time || '—')}</td>
          <td>${isVac ? '—' : (r.end_time || '—')}</td>
          <td>${isVac ? '—' : (r.break_minutes || 0) + ' Min.'}</td>
          <td style="text-align: right; font-weight: 600;">${TimeEngine.formatHoursPretty(r.net_hours)}</td>
          <td style="text-align: right;">${currencyFormatter.format(r.earnings)}</td>
          <td>${escapeHtml(r.note || '')}</td>
        </tr>
      `;
    }

    printSection.innerHTML = `
      <div class="print-header">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
          <div>
            <h1 style="font-size: 1.5rem; margin-bottom: 0.25rem;">STUNDENZETTEL & TÄTIGKEITSNACHWEIS</h1>
            <p style="font-size: 0.9rem; color: #444;">Nachweis gemäß Mindestlohngesetz (MiLoG)</p>
          </div>
          <div style="text-align: right; font-size: 0.9rem;">
            <strong>Abrechnungszeitraum:</strong><br>
            ${agg.startDate} bis ${agg.endDate}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 0.75rem 0;">
          <div>
            <strong>Arbeitnehmer:</strong> ${escapeHtml(userDisplay)}<br>
            <strong>Vereinbarte Wochenarbeitszeit:</strong> ${this.config.weeklyHoursMin} – ${this.config.weeklyHoursMax} Stunden/Woche
          </div>
          <div>
            <strong>Arbeitgeber:</strong> ${escapeHtml(employerDisplay)}<br>
            <strong>Stundensatz:</strong> ${currencyFormatter.format(this.config.hourlyRate)} / Std.
          </div>
        </div>
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Art</th>
            <th>Beginn</th>
            <th>Ende</th>
            <th>Pause</th>
            <th style="text-align: right;">Stunden</th>
            <th style="text-align: right;">Verdienst</th>
            <th>Tätigkeit / Bemerkung</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="8" style="text-align:center;">Keine Einträge im Zeitraum.</td></tr>'}
        </tbody>
        <tfoot>
          <tr style="font-weight: 700; background: #eee;">
            <td colspan="5">GESAMTSUMME:</td>
            <td style="text-align: right;">${TimeEngine.formatHoursPretty(agg.totalHours)}</td>
            <td style="text-align: right;">${currencyFormatter.format(agg.totalEarnings)}</td>
            <td>Saldo: ${agg.periodOvertimeDelta > 0 ? '+' : ''}${TimeEngine.formatHoursPretty(agg.periodOvertimeDelta)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top: 1.5rem; font-size: 0.85rem; color: #555;">
        Gesamter Überstunden-Stand (Kumuliert): <strong>${lifetimeOvertime > 0 ? '+' : ''}${TimeEngine.formatHoursPretty(lifetimeOvertime)}</strong> | 
        Urlaubstage im Zeitraum: <strong>${agg.vacationDaysInPeriod}</strong> (Resturlaub Jahr: ${agg.vacationDaysRemaining} Tage)
      </div>

      <div class="print-signatures" style="display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; margin-top: 4rem;">
        <div style="border-top: 1px solid #000; padding-top: 0.5rem; font-size: 0.85rem;">
          Datum, Unterschrift Arbeitnehmer/in
        </div>
        <div style="border-top: 1px solid #000; padding-top: 0.5rem; font-size: 0.85rem;">
          Datum, Unterschrift Arbeitgeber/in
        </div>
      </div>
    `;
  }

  openEntryModal(defaultType = 'work', recordId = null) {
    this.editingRecordId = recordId;
    const modal = document.getElementById('entryModal');
    const title = document.getElementById('entryModalTitle');
    const dateInput = document.getElementById('entryDate');
    const startInput = document.getElementById('shiftStart');
    const endInput = document.getElementById('shiftEnd');
    const breakInput = document.getElementById('shiftBreak');
    const vacHoursInput = document.getElementById('vacationPaidHours');
    const wageInput = document.getElementById('entryHourlyWage');
    const noteInput = document.getElementById('entryNote');

    let currentType = defaultType || 'work';

    if (recordId) {
      const rec = this.records.find(r => r.id === recordId);
      if (rec) {
        currentType = rec.type || 'work';
        if (title) title.textContent = 'Eintrag bearbeiten';
        if (dateInput) dateInput.value = rec.date;
        if (startInput) startInput.value = rec.start_time || '';
        if (endInput) endInput.value = rec.end_time || '';
        if (breakInput) breakInput.value = rec.break_minutes ?? 0;
        if (vacHoursInput) vacHoursInput.value = rec.net_hours ?? 2.5;
        if (wageInput) wageInput.value = rec.hourly_rate ?? this.config.hourlyRate;
        if (noteInput) noteInput.value = rec.note || '';
      }
    } else {
      if (title) title.textContent = currentType === 'vacation' ? 'Urlaubstag erfassen' : 'Neue Schicht eintragen';
      if (dateInput) dateInput.value = new Date().toISOString().substring(0, 10);
      if (startInput) startInput.value = '08:00';
      if (endInput) endInput.value = '12:00';
      if (breakInput) breakInput.value = this.config.defaultBreak;
      if (vacHoursInput) vacHoursInput.value = 2.5;
      if (wageInput) wageInput.value = this.config.hourlyRate;
      if (noteInput) noteInput.value = '';
    }

    const typeRadio = document.querySelector(`input[name="entryType"][value="${currentType}"]`);
    if (typeRadio) typeRadio.checked = true;
    this.updateModalTypeFields(currentType);
    this.updateModalNetHours();

    if (modal) modal.classList.add('open');
  }

  updateModalTypeFields(type) {
    const workFields = document.getElementById('modalWorkShiftFields');
    const vacFields = document.getElementById('modalVacationFields');
    if (type === 'vacation') {
      if (workFields) workFields.style.display = 'none';
      if (vacFields) vacFields.style.display = 'block';
    } else {
      if (workFields) workFields.style.display = 'block';
      if (vacFields) vacFields.style.display = 'none';
    }
    this.updateModalNetHours();
  }

  updateModalNetHours() {
    const type = document.querySelector('input[name="entryType"]:checked')?.value || 'work';
    const preview = document.getElementById('entryModalNetPreview');
    if (!preview) return;

    if (type === 'vacation') {
      const vacHours = Number(document.getElementById('vacationPaidHours')?.value) || 0;
      preview.textContent = `Vergütet: ${TimeEngine.formatHoursPretty(vacHours)} (wird als Arbeitszeit gewertet)`;
    } else {
      const start = document.getElementById('shiftStart')?.value;
      const end = document.getElementById('shiftEnd')?.value;
      const breakMin = document.getElementById('shiftBreak')?.value;
      const hours = TimeEngine.calculateNetHours(start, end, breakMin);
      preview.textContent = `Netto-Arbeitszeit: ${TimeEngine.formatHoursPretty(hours)}`;
    }
  }

  closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
    this.editingRecordId = null;
  }

  async handleEntrySubmit(e) {
    e.preventDefault();
    const type = document.querySelector('input[name="entryType"]:checked')?.value || 'work';
    const date = document.getElementById('entryDate').value;
    const hourlyRate = Number(document.getElementById('entryHourlyWage').value) || this.config.hourlyRate;
    const note = document.getElementById('entryNote').value.trim();

    let netHours = 0;
    let startTime = '';
    let endTime = '';
    let breakMinutes = 0;

    if (type === 'vacation') {
      netHours = Number(document.getElementById('vacationPaidHours').value) || 0;
    } else {
      startTime = document.getElementById('shiftStart').value;
      endTime = document.getElementById('shiftEnd').value;
      breakMinutes = Number(document.getElementById('shiftBreak').value) || 0;
      netHours = TimeEngine.calculateNetHours(startTime, endTime, breakMinutes);
    }

    const earnings = TimeEngine.calculateEarnings(netHours, hourlyRate);

    const recordData = {
      id: this.editingRecordId || undefined,
      type,
      date,
      year_month: date.substring(0, 7),
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMinutes,
      net_hours: netHours,
      hourly_rate: hourlyRate,
      earnings: earnings,
      note
    };

    await db.saveRecord(recordData);
    await this.loadRecords();
    this.closeModals();
    this.render();
  }

  async handleSettingsSubmit(e) {
    e.preventDefault();
    const minH = Number(document.getElementById('settingWeeklyMin').value);
    const maxH = Number(document.getElementById('settingWeeklyMax').value);
    const wage = Number(document.getElementById('settingHourlyRate').value);
    const defBreak = Number(document.getElementById('settingDefaultBreak').value);
    const vacTotal = Number(document.getElementById('settingVacationDays').value);
    const userName = document.getElementById('settingUserName').value.trim();
    const employerName = document.getElementById('settingEmployerName').value.trim();

    await db.setSetting('weeklyHoursMin', minH);
    await db.setSetting('weeklyHoursMax', maxH);
    await db.setSetting('hourlyRate', wage);
    await db.setSetting('defaultBreak', defBreak);
    await db.setSetting('vacationDaysTotal', vacTotal);
    await db.setSetting('userName', userName);
    await db.setSetting('employerName', employerName);

    await this.loadSettings();
    alert('Einstellungen erfolgreich gespeichert.');
    this.render();
  }

  async handleBackupShare() {
    const res = await ExportService.backupAndShare();
    if (res.success && res.method === 'download') {
      alert('Backup-Datei wurde heruntergeladen.');
    }
  }

  async handleRestoreFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (confirm('Achtung: Dies überschreibt alle bestehenden Daten mit dem Backup. Fortfahren?')) {
      try {
        await ExportService.restoreFromJsonFile(file);
        await this.loadSettings();
        await this.loadRecords();
        this.render();
        alert('Daten erfolgreich wiederhergestellt!');
      } catch (err) {
        alert('Fehler beim Wiederherstellen: ' + err.message);
      }
    }
    e.target.value = '';
  }

  handleExportCsv() {
    const agg = TimeEngine.aggregateDateRange(this.records, this.startDate, this.endDate, this.config);
    ExportService.exportDateRangeCsv(agg);
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const app = new ShiftlyApp();
window.app = app;
window.addEventListener('DOMContentLoaded', () => app.init());
