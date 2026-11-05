/**
 * Shiftly Main Application Controller (js/app.js)
 * Manages state, tabs, date range filters, quick actions, modals, calculations and exports.
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

const shortDateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

const todayBannerFormatter = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: '2-digit',
  month: 'short'
});

function toLocalIsoDate(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

class ShiftlyApp {
  constructor() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();

    this.startDate = `${y}-${m}-01`;
    this.endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    this.activePreset = 'current_month';
    this.activeTab = 'dashboard';
    this.listFilterType = 'all';
    this.listSearchQuery = '';

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

  showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 2600);
  }

  bindEvents() {
    // Bottom Navigation Tabs
    document.querySelectorAll('.bottom-nav-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (targetTab) this.switchTab(targetTab);
      });
    });

    // See All Shifts Link on Dashboard
    const btnSeeAll = document.getElementById('btnSeeAllShifts');
    if (btnSeeAll) {
      btnSeeAll.addEventListener('click', () => this.switchTab('shifts'));
    }

    // Period Preset Pills
    document.querySelectorAll('.period-pill[data-preset]').forEach(pill => {
      pill.addEventListener('click', () => {
        const preset = pill.getAttribute('data-preset');
        if (preset === 'custom') {
          this.toggleCustomDateDrawer();
        } else {
          this.applyPeriodPreset(preset);
        }
      });
    });

    // Legacy select support
    const presetSelect = document.getElementById('periodPresetSelect');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => this.applyPeriodPreset(e.target.value));
    }

    // Active period label toggles custom date drawer
    const btnActivePeriodLabel = document.getElementById('btnActivePeriodLabel');
    if (btnActivePeriodLabel) {
      btnActivePeriodLabel.addEventListener('click', () => this.toggleCustomDateDrawer());
    }

    // Prev / Next Month Steppers
    const btnPrevPeriod = document.getElementById('btnPrevPeriod');
    const btnNextPeriod = document.getElementById('btnNextPeriod');
    if (btnPrevPeriod) btnPrevPeriod.addEventListener('click', () => this.shiftPeriodByMonths(-1));
    if (btnNextPeriod) btnNextPeriod.addEventListener('click', () => this.shiftPeriodByMonths(1));

    // Custom Date Inputs
    const startInput = document.getElementById('filterStartDate');
    const endInput = document.getElementById('filterEndDate');
    if (startInput) {
      startInput.addEventListener('change', (e) => {
        this.startDate = e.target.value;
        this.activePreset = 'custom';
        this.updatePeriodPillsUI();
        this.render();
      });
    }
    if (endInput) {
      endInput.addEventListener('change', (e) => {
        this.endDate = e.target.value;
        this.activePreset = 'custom';
        this.updatePeriodPillsUI();
        this.render();
      });
    }

    // Action Buttons: Add Work Shift / Add Vacation
    const fabAdd = document.getElementById('fabAddShift');
    if (fabAdd) fabAdd.addEventListener('click', () => this.openEntryModal('work'));

    const btnHeroAddShift = document.getElementById('btnHeroAddShift');
    if (btnHeroAddShift) btnHeroAddShift.addEventListener('click', () => this.openEntryModal('work'));

    const btnQuickVacation = document.getElementById('btnQuickAddVacation');
    if (btnQuickVacation) btnQuickVacation.addEventListener('click', () => this.openEntryModal('vacation'));

    const btnHeroAddVacation = document.getElementById('btnHeroAddVacation');
    if (btnHeroAddVacation) btnHeroAddVacation.addEventListener('click', () => this.openEntryModal('vacation'));

    // 1-Tap Instant Shift Templates on Dashboard
    document.querySelectorAll('.instant-chip[data-quick-start]').forEach(chip => {
      chip.addEventListener('click', async () => {
        const start = chip.getAttribute('data-quick-start');
        const end = chip.getAttribute('data-quick-end');
        await this.quickCreateTodayShift(start, end);
      });
    });

    // Modal Quick Date Offset Chips (Heute, Gestern, Vorgestern)
    document.querySelectorAll('.micro-chip[data-date-offset]').forEach(chip => {
      chip.addEventListener('click', () => {
        const offset = Number(chip.getAttribute('data-date-offset')) || 0;
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const dateInput = document.getElementById('entryDate');
        if (dateInput) dateInput.value = toLocalIsoDate(d);
      });
    });

    // Modal Quick Time Preset Chips
    document.querySelectorAll('.preset-chip[data-start]').forEach(chip => {
      chip.addEventListener('click', () => {
        const startInput = document.getElementById('shiftStart');
        const endInput = document.getElementById('shiftEnd');
        if (startInput) startInput.value = chip.getAttribute('data-start');
        if (endInput) endInput.value = chip.getAttribute('data-end');
        this.updateModalNetHours();
      });
    });

    // Modal Quick Break Chips
    document.querySelectorAll('.micro-chip[data-break]').forEach(chip => {
      chip.addEventListener('click', () => {
        const breakInput = document.getElementById('shiftBreak');
        if (breakInput) breakInput.value = chip.getAttribute('data-break');
        this.updateModalNetHours();
      });
    });

    // Modal Quick Vacation Hours Chips
    document.querySelectorAll('.micro-chip[data-vac-hours]').forEach(chip => {
      chip.addEventListener('click', () => {
        const vacInput = document.getElementById('vacationPaidHours');
        if (vacInput) vacInput.value = chip.getAttribute('data-vac-hours');
        this.updateModalNetHours();
      });
    });

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

    // Live calculation inputs inside Modal
    ['shiftStart', 'shiftEnd', 'shiftBreak', 'vacationPaidHours', 'entryHourlyWage'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('input', () => this.updateModalNetHours());
      }
    });

    // Shifts Tab Filter Chips & Search
    document.querySelectorAll('#shiftListFilterChips .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#shiftListFilterChips .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.listFilterType = chip.getAttribute('data-filter') || 'all';
        this.render();
      });
    });

    const searchInput = document.getElementById('shiftSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.listSearchQuery = (e.target.value || '').trim().toLowerCase();
        this.render();
      });
    }

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

    const btnExportCsvQuick = document.getElementById('btnExportCsvQuick');
    if (btnExportCsvQuick) btnExportCsvQuick.addEventListener('click', () => this.handleExportCsv());

    const btnPrint = document.getElementById('btnPrintTimesheet');
    if (btnPrint) btnPrint.addEventListener('click', () => ExportService.printTimesheet());

    const btnHeaderPrint = document.getElementById('btnHeaderPrint');
    if (btnHeaderPrint) btnHeaderPrint.addEventListener('click', () => ExportService.printTimesheet());
  }

  toggleCustomDateDrawer(forceState) {
    const drawer = document.getElementById('customDatesDrawer');
    if (!drawer) return;
    const isHidden = drawer.hasAttribute('hidden');
    const shouldOpen = typeof forceState === 'boolean' ? forceState : isHidden;
    if (shouldOpen) {
      drawer.removeAttribute('hidden');
    } else {
      drawer.setAttribute('hidden', '');
    }
  }

  shiftPeriodByMonths(deltaMonths) {
    const startObj = new Date(this.startDate + 'T00:00:00');
    if (isNaN(startObj)) return;

    const targetYear = startObj.getFullYear();
    const targetMonth = startObj.getMonth() + deltaMonths;
    const firstDay = new Date(targetYear, targetMonth, 1);
    const lastDay = new Date(targetYear, targetMonth + 1, 0);

    this.startDate = toLocalIsoDate(firstDay);
    this.endDate = toLocalIsoDate(lastDay);
    this.activePreset = 'custom';

    const startInput = document.getElementById('filterStartDate');
    const endInput = document.getElementById('filterEndDate');
    if (startInput) startInput.value = this.startDate;
    if (endInput) endInput.value = this.endDate;

    this.updatePeriodPillsUI();
    this.render();
  }

  applyPeriodPreset(presetKey) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    this.activePreset = presetKey;

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
      let prevM = m;
      let prevY = y;
      if (prevM === 0) { prevM = 12; prevY = y - 1; }
      this.startDate = `${prevY}-${String(prevM).padStart(2, '0')}-26`;
      this.endDate = `${y}-${String(m + 1).padStart(2, '0')}-25`;
    } else if (presetKey === 'period_16_to_15') {
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

    this.toggleCustomDateDrawer(false);
    this.updatePeriodPillsUI();
    this.render();
  }

  updatePeriodPillsUI() {
    document.querySelectorAll('.period-pill[data-preset]').forEach(pill => {
      const key = pill.getAttribute('data-preset');
      pill.classList.toggle('active', key === this.activePreset);
    });
  }

  async quickCreateTodayShift(startTime, endTime) {
    const todayStr = toLocalIsoDate(new Date());
    const breakMinutes = this.config.defaultBreak || 0;
    const netHours = TimeEngine.calculateNetHours(startTime, endTime, breakMinutes);
    const earnings = TimeEngine.calculateEarnings(netHours, this.config.hourlyRate);

    const recordData = {
      type: 'work',
      date: todayStr,
      year_month: todayStr.substring(0, 7),
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMinutes,
      net_hours: netHours,
      hourly_rate: this.config.hourlyRate,
      earnings,
      note: ''
    };

    await db.saveRecord(recordData);
    await this.loadRecords();
    this.render();
    this.showToast(`⚡ Schicht heute (${startTime}–${endTime} · ${TimeEngine.formatHoursPretty(netHours)}) gespeichert!`);
  }

  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-btn[data-tab]').forEach(el => el.classList.remove('active'));

    const targetPane = document.getElementById(`tab-${tabId}`);
    if (targetPane) targetPane.classList.add('active');

    const activeBtn = document.querySelector(`.bottom-nav-btn[data-tab="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (startInput) startInput.value = this.startDate;
    if (endInput) endInput.value = this.endDate;

    // Friendly Greeting
    const greetingEl = document.getElementById('brandGreeting');
    if (greetingEl) {
      const hour = new Date().getHours();
      let greet = 'Hallo';
      if (hour < 11) greet = 'Guten Morgen';
      else if (hour < 18) greet = 'Guten Tag';
      else greet = 'Guten Abend';
      const firstName = this.config.userName ? `, ${this.config.userName.split(' ')[0]}` : '';
      greetingEl.textContent = `${greet}${firstName}! 👋`;
    }

    // Today label in Quick Launcher
    const todayLabel = document.getElementById('todayQuickLabel');
    if (todayLabel) {
      todayLabel.textContent = todayBannerFormatter.format(new Date());
    }

    // Active Period Summary Text
    const periodTextEl = document.getElementById('activePeriodText');
    if (periodTextEl) {
      const s = new Date(this.startDate + 'T00:00:00');
      const e = new Date(this.endDate + 'T00:00:00');
      if (!isNaN(s) && !isNaN(e)) {
        // Check if it's a full single calendar month
        const isFirstDay = s.getDate() === 1;
        const lastOfSMonth = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
        const isSameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && e.getDate() === lastOfSMonth;
        if (isFirstDay && isSameMonth) {
          periodTextEl.textContent = s.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        } else {
          periodTextEl.textContent = `${shortDateFormatter.format(s)} – ${shortDateFormatter.format(e)}`;
        }
      } else {
        periodTextEl.textContent = `${this.startDate} – ${this.endDate}`;
      }
    }
  }

  renderCurrentWeekSpotlight() {
    const todayIso = toLocalIsoDate(new Date());
    const currentWeekKey = TimeEngine.getIsoWeek(todayIso);
    const kwNumber = currentWeekKey.split('-W')[1] || '';

    let weekHours = 0;
    for (const r of this.records) {
      if (r.date && TimeEngine.getIsoWeek(r.date) === currentWeekKey) {
        weekHours += Number(r.net_hours) || 0;
      }
    }
    weekHours = Math.round(weekHours * 100) / 100;

    const minH = this.config.weeklyHoursMin || 10;
    const maxH = this.config.weeklyHoursMax || 15;
    const scaleMax = Math.max(maxH * 1.35, weekHours * 1.1, 20);

    const titleEl = document.getElementById('currentWeekTitle');
    const hoursEl = document.getElementById('currentWeekHours');
    const badgeEl = document.getElementById('currentWeekBadge');
    const fillEl = document.getElementById('currentWeekMeterFill');
    const zoneEl = document.getElementById('corridorZoneMarker');
    const minLabel = document.getElementById('corridorMinLabel');
    const maxLabel = document.getElementById('corridorMaxLabel');
    const hintEl = document.getElementById('currentWeekHint');

    if (titleEl) titleEl.textContent = `DIESE WOCHE (KW ${kwNumber})`;
    if (hoursEl) hoursEl.textContent = TimeEngine.formatHoursPretty(weekHours);
    if (minLabel) minLabel.textContent = `Min: ${minH} h`;
    if (maxLabel) maxLabel.textContent = `Max: ${maxH} h`;

    if (zoneEl) {
      const leftPct = Math.min(100, Math.round((minH / scaleMax) * 100));
      const widthPct = Math.min(100 - leftPct, Math.round(((maxH - minH) / scaleMax) * 100));
      zoneEl.style.left = `${leftPct}%`;
      zoneEl.style.width = `${widthPct}%`;
    }

    if (fillEl) {
      const fillPct = Math.min(100, Math.round((weekHours / scaleMax) * 100));
      fillEl.style.width = `${fillPct}%`;
    }

    if (badgeEl && hintEl) {
      if (weekHours < minH) {
        const missing = Math.round((minH - weekHours) * 100) / 100;
        badgeEl.className = 'spotlight-badge status-under';
        badgeEl.textContent = `Offen: ${TimeEngine.formatHoursPretty(missing)}`;
        hintEl.textContent = `Noch ${TimeEngine.formatHoursPretty(missing)} bis zum Wochen-Minimum (${minH}–${maxH} Std.).`;
      } else if (weekHours <= maxH) {
        badgeEl.className = 'spotlight-badge status-good';
        badgeEl.textContent = '✓ Im grünen Bereich';
        hintEl.textContent = `Stark! Du liegst perfekt im vereinbarten Wochenkorridor (${minH}–${maxH} Std.).`;
      } else {
        const extra = Math.round((weekHours - maxH) * 100) / 100;
        badgeEl.className = 'spotlight-badge status-over';
        badgeEl.textContent = `+${TimeEngine.formatHoursPretty(extra)} Überstunden`;
        hintEl.textContent = `Du hast diese Woche ${TimeEngine.formatHoursPretty(extra)} über dem Maximum (${maxH} Std.) gearbeitet.`;
      }
    }
  }

  renderDashboard(agg, lifetimeOvertime) {
    this.renderCurrentWeekSpotlight();

    // Total Hours
    const totalHoursEl = document.getElementById('kpiTotalHours');
    const totalHoursSub = document.getElementById('kpiTotalHoursSub');
    if (totalHoursEl) totalHoursEl.textContent = TimeEngine.formatHoursPretty(agg.totalHours);
    if (totalHoursSub) {
      totalHoursSub.textContent = `Arbeit: ${TimeEngine.formatHoursPretty(agg.totalWorkHours)} · Urlaub: ${TimeEngine.formatHoursPretty(agg.totalVacationHours)}`;
    }

    // Earnings
    const earningsEl = document.getElementById('kpiTotalEarnings');
    const earningsSub = document.getElementById('kpiEarningsSub');
    if (earningsEl) earningsEl.textContent = currencyFormatter.format(agg.totalEarnings);
    if (earningsSub) {
      earningsSub.textContent = `Ø ${currencyFormatter.format(this.config.hourlyRate)} / Std.`;
    }

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
      overtimeSub.textContent = `Im Zeitraum: ${pSign}${TimeEngine.formatHoursPretty(agg.periodOvertimeDelta)}`;
    }

    // Vacation KPI
    const vacRemainingEl = document.getElementById('kpiVacationRemaining');
    const vacSubEl = document.getElementById('kpiVacationSub');
    if (vacRemainingEl) {
      vacRemainingEl.textContent = `${agg.vacationDaysRemaining} Tage`;
    }
    if (vacSubEl) {
      vacSubEl.textContent = `${agg.vacationDaysTakenYear} von ${agg.totalVacationDays} Tagen genutzt`;
    }

    const corridorPill = document.getElementById('weeklyCorridorInfoPill');
    if (corridorPill) {
      corridorPill.textContent = `Soll: ${this.config.weeklyHoursMin}–${this.config.weeklyHoursMax} h`;
    }

    // Weekly corridor breakdown list
    const weeklyListEl = document.getElementById('dashboardWeeklyBreakdown');
    if (weeklyListEl) {
      if (agg.weeklyDetails.length === 0) {
        weeklyListEl.innerHTML = `<div class="empty-state">Noch keine Wochen-Daten im gewählten Zeitraum.</div>`;
      } else {
        const maxBarRef = Math.max(this.config.weeklyHoursMax * 1.25, 18);
        weeklyListEl.innerHTML = agg.weeklyDetails.map(w => {
          const deltaSign = w.delta > 0 ? '+' : '';
          const deltaClass = w.delta > 0 ? 'text-emerald' : w.delta < 0 ? 'text-rose' : 'text-muted';
          const statusText = w.delta === 0
            ? `✓ Im Korridor (${this.config.weeklyHoursMin}–${this.config.weeklyHoursMax} h)`
            : `${deltaSign}${TimeEngine.formatHoursPretty(w.delta)}`;
          const pct = Math.min(100, Math.round((w.hours / maxBarRef) * 100));
          const barState = w.delta === 0 ? 'good' : w.delta < 0 ? 'under' : '';
          return `
            <div class="weekly-row">
              <div class="weekly-row-top">
                <div>
                  <span class="weekly-kw-badge">KW ${w.week.split('-W')[1]}</span>
                  <span class="text-muted" style="font-size: 0.76rem; margin-left: 0.45rem;">${w.recordCount} ${w.recordCount === 1 ? 'Eintrag' : 'Einträge'}</span>
                </div>
                <div style="text-align: right;">
                  <span style="font-weight: 800; font-size: 0.9rem;">${TimeEngine.formatHoursPretty(w.hours)}</span>
                  <span class="${deltaClass}" style="font-size: 0.75rem; font-weight: 700; margin-left: 0.4rem;">${statusText}</span>
                </div>
              </div>
              <div class="weekly-mini-bar">
                <div class="weekly-mini-fill ${barState}" style="width: ${pct}%;"></div>
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
        recentList.innerHTML = `<div class="empty-state">Noch keine Einträge im Zeitraum — nutze oben den Schnell-Eintrag! ✨</div>`;
      } else {
        recentList.innerHTML = agg.records.slice(-5).reverse().map(r => this.renderRecordItemHtml(r)).join('');
        this.bindRecordActionButtons(recentList);
      }
    }
  }

  renderShiftsList(agg) {
    const listContainer = document.getElementById('allShiftsList');
    const countHeader = document.getElementById('shiftsCountHeader');
    if (!listContainer) return;

    let filtered = agg.records.slice().reverse();
    if (this.listFilterType !== 'all') {
      filtered = filtered.filter(r => (r.type || 'work') === this.listFilterType);
    }
    if (this.listSearchQuery) {
      filtered = filtered.filter(r => {
        const noteMatch = (r.note || '').toLowerCase().includes(this.listSearchQuery);
        const dateMatch = (r.date || '').toLowerCase().includes(this.listSearchQuery);
        return noteMatch || dateMatch;
      });
    }

    if (countHeader) {
      countHeader.textContent = `${filtered.length} ${filtered.length === 1 ? 'Eintrag' : 'Einträge'} gefunden`;
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `<div class="empty-state">Keine passenden Einträge im gewählten Zeitraum gefunden.</div>`;
    } else {
      listContainer.innerHTML = filtered.map(r => this.renderRecordItemHtml(r)).join('');
      this.bindRecordActionButtons(listContainer);
    }
  }

  renderRecordItemHtml(record) {
    const isVacation = record.type === 'vacation';
    const dateObj = new Date(record.date + 'T00:00:00');
    const dateFormatted = isNaN(dateObj) ? record.date : dateFormatter.format(dateObj);

    return `
      <div class="shift-card ${isVacation ? 'card-vacation' : ''}" data-id="${record.id}">
        <div class="shift-card-header">
          <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <span class="badge ${isVacation ? 'badge-vacation' : 'badge-work'}">${isVacation ? '🌴 Urlaub' : '⏱️ Arbeit'}</span>
            <span class="shift-date">${dateFormatted}</span>
          </div>
          <span class="shift-earnings">${currencyFormatter.format(record.earnings)}</span>
        </div>
        <div class="shift-card-details">
          ${isVacation
            ? `<span>Angerechnete Zeit:</span> <span class="shift-duration-pill">${TimeEngine.formatHoursPretty(record.net_hours)}</span>`
            : `<span>🕒 ${record.start_time || '—'} – ${record.end_time || '—'} Uhr</span>
               <span class="shift-duration-pill">${TimeEngine.formatHoursPretty(record.net_hours)}</span>
               ${record.break_minutes ? `<span style="color: var(--text-muted); font-size: 0.76rem;">(${record.break_minutes} Min. Pause)</span>` : ''}`
          }
        </div>
        ${record.note ? `<div class="shift-note">📝 ${escapeHtml(record.note)}</div>` : ''}
        <div class="shift-actions">
          <button type="button" class="btn btn-sm btn-ghost btn-duplicate-record" data-id="${record.id}" title="Auf heute kopieren">📋 Kopieren</button>
          <button type="button" class="btn btn-sm btn-ghost btn-edit-record" data-id="${record.id}">✏️ Bearbeiten</button>
          <button type="button" class="btn btn-sm btn-ghost text-rose btn-delete-record" data-id="${record.id}">🗑️ Löschen</button>
        </div>
      </div>
    `;
  }

  bindRecordActionButtons(container) {
    container.querySelectorAll('.btn-duplicate-record').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        this.duplicateRecordToToday(id);
      });
    });

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
          this.showToast('🗑️ Eintrag gelöscht');
        }
      });
    });
  }

  duplicateRecordToToday(recordId) {
    const rec = this.records.find(r => r.id === recordId);
    if (!rec) return;
    this.openEntryModal(rec.type || 'work', null);

    const dateInput = document.getElementById('entryDate');
    const startInput = document.getElementById('shiftStart');
    const endInput = document.getElementById('shiftEnd');
    const breakInput = document.getElementById('shiftBreak');
    const vacHoursInput = document.getElementById('vacationPaidHours');
    const wageInput = document.getElementById('entryHourlyWage');
    const noteInput = document.getElementById('entryNote');

    if (dateInput) dateInput.value = toLocalIsoDate(new Date());
    if (startInput) startInput.value = rec.start_time || '08:00';
    if (endInput) endInput.value = rec.end_time || '12:00';
    if (breakInput) breakInput.value = rec.break_minutes ?? 0;
    if (vacHoursInput) vacHoursInput.value = rec.net_hours ?? 2.5;
    if (wageInput) wageInput.value = rec.hourly_rate ?? this.config.hourlyRate;
    if (noteInput) noteInput.value = rec.note || '';

    this.updateModalNetHours();
    this.showToast('📋 Vorlage für heute geladen — nur noch speichern!');
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
      if (title) title.textContent = currentType === 'vacation' ? '🌴 Urlaubstag eintragen' : '⏱️ Schicht eintragen';
      if (dateInput) dateInput.value = toLocalIsoDate(new Date());
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
    const title = document.getElementById('entryModalTitle');
    if (type === 'vacation') {
      if (workFields) workFields.style.display = 'none';
      if (vacFields) vacFields.style.display = 'block';
      if (title && !this.editingRecordId) title.textContent = '🌴 Urlaubstag eintragen';
    } else {
      if (workFields) workFields.style.display = 'block';
      if (vacFields) vacFields.style.display = 'none';
      if (title && !this.editingRecordId) title.textContent = '⏱️ Schicht eintragen';
    }
    this.updateModalNetHours();
  }

  updateModalNetHours() {
    const type = document.querySelector('input[name="entryType"]:checked')?.value || 'work';
    const preview = document.getElementById('entryModalNetPreview');
    const earningsPreview = document.getElementById('entryModalEarningsPreview');
    const wage = Number(document.getElementById('entryHourlyWage')?.value) || this.config.hourlyRate;

    let hours = 0;
    if (type === 'vacation') {
      hours = Number(document.getElementById('vacationPaidHours')?.value) || 0;
      if (preview) preview.textContent = `Urlaubs-Gutschrift: ${TimeEngine.formatHoursPretty(hours)}`;
    } else {
      const start = document.getElementById('shiftStart')?.value;
      const end = document.getElementById('shiftEnd')?.value;
      const breakMin = document.getElementById('shiftBreak')?.value;
      hours = TimeEngine.calculateNetHours(start, end, breakMin);
      if (preview) preview.textContent = `Netto-Arbeitszeit: ${TimeEngine.formatHoursPretty(hours)}`;
    }

    if (earningsPreview) {
      const earn = TimeEngine.calculateEarnings(hours, wage);
      earningsPreview.textContent = currencyFormatter.format(earn);
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
    this.showToast(type === 'vacation' ? '🌴 Urlaubstag gespeichert!' : '✓ Arbeitsschicht gespeichert!');
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
    this.render();
    this.showToast('✨ Einstellungen erfolgreich gespeichert!');
  }

  async handleBackupShare() {
    const res = await ExportService.backupAndShare();
    if (res.success && res.method === 'download') {
      this.showToast('☁️ Backup-Datei heruntergeladen');
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
        this.showToast('📥 Backup erfolgreich wiederhergestellt!');
      } catch (err) {
        alert('Fehler beim Wiederherstellen: ' + err.message);
      }
    }
    e.target.value = '';
  }

  handleExportCsv() {
    const agg = TimeEngine.aggregateDateRange(this.records, this.startDate, this.endDate, this.config);
    ExportService.exportDateRangeCsv(agg);
    this.showToast('📊 CSV-Stundenzettel exportiert');
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
