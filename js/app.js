/**
 * Shiftly Main Application Controller (js/app.js)
 * Focused Single-Screen Mobile UX with Swipeable Tabs, Stacked Full-Width Time Cards,
 * Configurable Weekly Target Hours (default 12h), and Zero Clutter.
 */

import { db } from './db.js';
import { TimeEngine } from './time_engine.js';
import { ExportService } from './export_service.js';

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit'
});

const shortDateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit'
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

    this.activeTabIndex = 0; // 0: entry, 1: shifts, 2: settings
    this.historySubView = 'list'; // 'list' | 'weeks'
    this.entryType = 'work'; // 'work' | 'vacation'
    this.editingRecordId = null;
    this.isSubmitting = false;

    // Vacation Calendar & Range Planner State
    this.vacCalYear = now.getFullYear();
    this.vacCalMonth = now.getMonth();
    this.vacSelectedDays = new Map(); // Map<isoDate, hoursNumber>
    this.vacActiveDay = null; // Currently focused day in the vacation calendar

    this.config = {
      weeklyTargetHours: 12.0,
      defaultBreak: 0,
      vacationDaysTotal: 20,
      userName: '',
      employerName: '',
      lastShiftStart: '08:00',
      lastShiftEnd: '12:00'
    };

    this.records = [];
    this.saveFeedbackTimer = null;
  }

  async init() {
    await db.init();
    await this.loadSettings();
    await this.loadRecords();

    this.init24hTimeSelects();
    this.registerServiceWorker();
    this.resetEntryFormToDefaults();
    this.bindEvents();
    this.initSwipeNavigation();
    this.render();
  }

  init24hTimeSelects() {
    const hourIds = ['shiftStartHour', 'shiftEndHour'];
    const minIds = ['shiftStartMin', 'shiftEndMin'];

    const hourOptions = Array.from({ length: 24 }, (_, h) => {
      const val = String(h).padStart(2, '0');
      return `<option value="${val}">${val}</option>`;
    }).join('');

    const minValues = [];
    for (let m = 0; m < 60; m += 5) {
      minValues.push(String(m).padStart(2, '0'));
    }

    hourIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = hourOptions;
    });

    minIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = minValues.map(v => `<option value="${v}">${v}</option>`).join('');
      }
    });
  }

  set24hSelectFromTimeStr(prefix, timeStr) {
    const [hRaw = '08', mRaw = '00'] = (timeStr || '08:00').split(':');
    const h = String(Number(hRaw) || 0).padStart(2, '0');
    const m = String(Number(mRaw) || 0).padStart(2, '0');

    const hEl = document.getElementById(`${prefix}Hour`);
    const mEl = document.getElementById(`${prefix}Min`);
    const hiddenEl = document.getElementById(prefix);

    if (hEl) hEl.value = h;
    if (mEl) {
      if (![...mEl.options].some(opt => opt.value === m)) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        mEl.appendChild(opt);
      }
      mEl.value = m;
    }
    if (hiddenEl) hiddenEl.value = `${h}:${m}`;
  }

  syncHiddenTimeFromSelects(prefix) {
    const hEl = document.getElementById(`${prefix}Hour`);
    const mEl = document.getElementById(`${prefix}Min`);
    const hiddenEl = document.getElementById(prefix);
    if (hEl && mEl && hiddenEl) {
      hiddenEl.value = `${hEl.value}:${mEl.value}`;
    }
  }

  async loadSettings() {
    const targetH = await db.getSetting('weeklyTargetHours', 12.0);
    const defBreak = await db.getSetting('defaultBreak', 0);
    const vacTotal = await db.getSetting('vacationDaysTotal', 20);
    const user = await db.getSetting('userName', '');
    const employer = await db.getSetting('employerName', '');
    const lastStart = await db.getSetting('lastShiftStart', '08:00');
    const lastEnd = await db.getSetting('lastShiftEnd', '12:00');

    this.config = {
      weeklyTargetHours: Number(targetH) || 12.0,
      defaultBreak: Number(defBreak) || 0,
      vacationDaysTotal: Number(vacTotal) || 20,
      userName: String(user || ''),
      employerName: String(employer || ''),
      lastShiftStart: String(lastStart || '08:00'),
      lastShiftEnd: String(lastEnd || '12:00')
    };
  }

  async loadRecords() {
    this.records = await db.getAllRecords();
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
          reg.update().catch(() => {});
        }).catch(() => {});
      });
    }
  }

  triggerHaptic(pattern = 8) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch (_) {
        // Ignore on unsupported browsers
      }
    }
  }

  burstConfetti() {
    const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];
    for (let i = 0; i < 20; i++) {
      const bit = document.createElement('div');
      bit.className = 'confetti-particle';
      bit.style.left = `${12 + Math.random() * 76}%`;
      bit.style.top = `${10 + Math.random() * 14}%`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = `${Math.random() * 0.18}s`;
      document.body.appendChild(bit);
      setTimeout(() => bit.remove(), 1450);
    }
  }

  getCurrentWeekHours() {
    const todayIso = toLocalIsoDate(new Date());
    const currentWeekKey = TimeEngine.getIsoWeek(todayIso);
    let weekHours = 0;
    for (const r of this.records) {
      if (r.date && TimeEngine.getIsoWeek(r.date) === currentWeekKey) {
        weekHours += Number(r.net_hours) || 0;
      }
    }
    return Math.round(weekHours * 100) / 100;
  }

  showToast(message, options = {}) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const { actionLabel = '', onAction = null, duration = 2000 } = options;
    const toast = document.createElement('div');
    toast.className = 'toast-msg';

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    let dismissed = false;
    const removeToast = () => {
      if (dismissed) return;
      dismissed = true;
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      setTimeout(() => toast.remove(), 220);
    };

    if (actionLabel && typeof onAction === 'function') {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'toast-undo-btn';
      actionBtn.textContent = actionLabel;
      actionBtn.addEventListener('click', async () => {
        removeToast();
        await onAction();
      });
      toast.appendChild(actionBtn);
    }

    container.appendChild(toast);
    setTimeout(removeToast, duration);
  }

  bindStepper(minusId, plusId, inputId, step, min, max, fallbackVal) {
    const btnMinus = document.getElementById(minusId);
    const btnPlus = document.getElementById(plusId);
    const input = document.getElementById(inputId);
    if (!input) return;

    const adjust = (delta) => {
      const cur = Number(input.value);
      const base = isNaN(cur) ? fallbackVal : cur;
      const next = Math.max(min, Math.min(max, Number((base + delta).toFixed(2))));
      input.value = next;
      this.triggerHaptic(6);
    };

    if (btnMinus) btnMinus.addEventListener('click', () => adjust(-step));
    if (btnPlus) btnPlus.addEventListener('click', () => adjust(step));
  }

  bindEvents() {
    // Bottom Navigation Tabs
    document.querySelectorAll('.nav-tab[data-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.triggerHaptic(6);
        const idx = Number(btn.getAttribute('data-index'));
        this.switchTabByIndex(idx);
      });
    });

    // Clickable Status Strip Shortcuts (Week -> Weeks view, Month -> Entries view)
    const statBoxWeek = document.getElementById('statBoxWeek');
    const statBoxMonth = document.getElementById('statBoxMonth');
    if (statBoxWeek) {
      statBoxWeek.addEventListener('click', () => {
        this.triggerHaptic(8);
        this.setHistorySubView('weeks');
        this.switchTabByIndex(1);
      });
    }
    if (statBoxMonth) {
      statBoxMonth.addEventListener('click', () => {
        this.triggerHaptic(8);
        this.setHistorySubView('list');
        this.switchTabByIndex(1);
      });
    }

    // Entry Date Stepper (Prev Day, Next Day, Smart Heute/Gestern) & Native Date Overlay
    const btnDatePrev = document.getElementById('btnDatePrev');
    const btnDateNext = document.getElementById('btnDateNext');
    const btnDateToday = document.getElementById('btnDateToday');
    const entryDateInput = document.getElementById('entryDate');
    if (btnDatePrev) btnDatePrev.addEventListener('click', () => { this.triggerHaptic(6); this.stepEntryDate(-1); });
    if (btnDateNext) btnDateNext.addEventListener('click', () => { this.triggerHaptic(6); this.stepEntryDate(1); });
    if (btnDateToday) {
      btnDateToday.addEventListener('click', () => {
        if (!entryDateInput) return;
        this.triggerHaptic(8);
        const todayIso = toLocalIsoDate(new Date());
        if (entryDateInput.value === todayIso) {
          this.stepEntryDate(-1);
        } else {
          entryDateInput.value = todayIso;
          this.updateEntryDateDisplay();
        }
      });
    }
    if (entryDateInput) {
      entryDateInput.addEventListener('change', () => this.updateEntryDateDisplay());
      entryDateInput.addEventListener('input', () => this.updateEntryDateDisplay());
      entryDateInput.addEventListener('click', () => {
        if (typeof entryDateInput.showPicker === 'function') {
          try {
            entryDateInput.showPicker();
          } catch (_) {
            // Ignore if picker is already open or restricted by user-gesture policy
          }
        }
      });
    }

    // Vacation Calendar Month Steppers & Controls
    const btnVacCalPrev = document.getElementById('btnVacCalPrev');
    const btnVacCalNext = document.getElementById('btnVacCalNext');
    const btnVacCalClear = document.getElementById('btnVacCalClear');
    if (btnVacCalPrev) btnVacCalPrev.addEventListener('click', () => this.shiftVacCalendarMonth(-1));
    if (btnVacCalNext) btnVacCalNext.addEventListener('click', () => this.shiftVacCalendarMonth(1));
    if (btnVacCalClear) {
      btnVacCalClear.addEventListener('click', () => {
        this.vacSelectedDays.clear();
        this.vacActiveDay = null;
        this.renderVacationPlanner();
        this.updateEntryLiveButton();
      });
    }

    // Tactile Vacation Hours Hero Card Controls (Presets, +/- Steppers, Input, Apply to All)
    const btnVacStdMinus = document.getElementById('btnVacStdMinus');
    const btnVacStdPlus = document.getElementById('btnVacStdPlus');
    const vacDefInput = document.getElementById('vacDefaultHoursInput');
    if (btnVacStdMinus && vacDefInput) {
      btnVacStdMinus.addEventListener('click', () => {
        const cur = Number(vacDefInput.value) || 0;
        const nextVal = Math.max(0, Number((cur - 0.5).toFixed(2)));
        vacDefInput.value = nextVal;
        this.setVacationHoursFromHero(nextVal);
      });
    }
    if (btnVacStdPlus && vacDefInput) {
      btnVacStdPlus.addEventListener('click', () => {
        const cur = Number(vacDefInput.value) || 0;
        const nextVal = Math.min(24, Number((cur + 0.5).toFixed(2)));
        vacDefInput.value = nextVal;
        this.setVacationHoursFromHero(nextVal);
      });
    }
    if (vacDefInput) {
      vacDefInput.addEventListener('change', () => {
        const val = Math.max(0, Math.min(24, Number(vacDefInput.value) || 0));
        vacDefInput.value = val;
        this.setVacationHoursFromHero(val);
      });
    }

    document.querySelectorAll('.vac-preset-pill[data-vac-preset]').forEach(pill => {
      pill.addEventListener('click', () => {
        const raw = pill.getAttribute('data-vac-preset');
        const val = raw === 'auto'
          ? (Number((this.config.weeklyTargetHours / 5).toFixed(2)) || 2.4)
          : (Number(raw) || 0);
        if (vacDefInput) vacDefInput.value = val;
        this.setVacationHoursFromHero(val);
      });
    });

    const btnVacApplyAll = document.getElementById('btnVacApplyAll');
    if (btnVacApplyAll) {
      btnVacApplyAll.addEventListener('click', () => {
        const val = Number(document.getElementById('vacDefaultHoursInput')?.value) || 0;
        this.applyDefaultHoursToAllSelectedVacDays(val);
        this.showToast(`✓ ${TimeEngine.formatHoursPretty(val)} für alle ${this.vacSelectedDays.size} Tage übernommen`);
      });
    }

    // Single Vacation Edit Mode +/- Steppers & Live Input
    const btnVacSingleMinus = document.getElementById('btnVacSingleMinus');
    const btnVacSinglePlus = document.getElementById('btnVacSinglePlus');
    const vacSingleInput = document.getElementById('vacationPaidHours');
    if (btnVacSingleMinus && vacSingleInput) {
      btnVacSingleMinus.addEventListener('click', () => {
        const cur = Number(vacSingleInput.value) || 0;
        vacSingleInput.value = Math.max(0, Number((cur - 0.5).toFixed(2)));
        this.updateEntryLiveButton();
      });
    }
    if (btnVacSinglePlus && vacSingleInput) {
      btnVacSinglePlus.addEventListener('click', () => {
        const cur = Number(vacSingleInput.value) || 0;
        vacSingleInput.value = Math.min(24, Number((cur + 0.5).toFixed(2)));
        this.updateEntryLiveButton();
      });
    }
    if (vacSingleInput) {
      vacSingleInput.addEventListener('input', () => this.updateEntryLiveButton());
    }

    const btnVacSelectRange = document.getElementById('btnVacSelectRange');
    if (btnVacSelectRange) {
      btnVacSelectRange.addEventListener('click', () => this.fillVacationRangeWeekdays());
    }

    // Entry Type Switch (Arbeit vs. Urlaub)
    document.querySelectorAll('.type-pill[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.triggerHaptic(8);
        const t = btn.getAttribute('data-type') || 'work';
        this.setEntryType(t);
      });
    });

    // Break Pills (Keine, 15m, 30m, 45m)
    document.querySelectorAll('.break-pill[data-break]').forEach(pill => {
      pill.addEventListener('click', () => {
        this.triggerHaptic(6);
        const val = Number(pill.getAttribute('data-break')) || 0;
        const breakInput = document.getElementById('shiftBreak');
        if (breakInput) breakInput.value = val;
        this.syncBreakPillsUI(val);
        this.updateEntryLiveButton();
      });
    });

    // 24h Time Selects Live Sync
    ['shiftStartHour', 'shiftStartMin'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          this.syncHiddenTimeFromSelects('shiftStart');
          this.updateEntryLiveButton();
        });
      }
    });
    ['shiftEndHour', 'shiftEndMin'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          this.syncHiddenTimeFromSelects('shiftEnd');
          this.updateEntryLiveButton();
        });
      }
    });

    // Cancel Edit Mode
    const btnCancelEdit = document.getElementById('btnCancelEdit');
    if (btnCancelEdit) {
      btnCancelEdit.addEventListener('click', () => {
        this.resetEntryFormToDefaults();
      });
    }

    // Submit Entry Form & Direct Button Trigger Fallback
    const entryForm = document.getElementById('entryForm');
    const btnSubmitEntry = document.getElementById('btnSubmitEntry');
    if (entryForm) {
      entryForm.addEventListener('submit', (e) => this.handleEntrySubmit(e));
    }
    if (btnSubmitEntry) {
      btnSubmitEntry.addEventListener('click', (e) => {
        // Fallback for mobile browsers where form submission may be intercepted
        this.handleEntrySubmit(e);
      });
    }

    // Tab 2 (History): Month Steppers & Custom Date Drawer
    const btnPrevPeriod = document.getElementById('btnPrevPeriod');
    const btnNextPeriod = document.getElementById('btnNextPeriod');
    const btnActivePeriodLabel = document.getElementById('btnActivePeriodLabel');
    if (btnPrevPeriod) btnPrevPeriod.addEventListener('click', () => this.shiftPeriodByMonths(-1));
    if (btnNextPeriod) btnNextPeriod.addEventListener('click', () => this.shiftPeriodByMonths(1));
    if (btnActivePeriodLabel) {
      btnActivePeriodLabel.addEventListener('click', () => this.toggleCustomDateDrawer());
    }

    // Period Preset Pills in Drawer
    document.querySelectorAll('.period-pill[data-preset]').forEach(pill => {
      pill.addEventListener('click', () => {
        const preset = pill.getAttribute('data-preset');
        if (preset) this.applyPeriodPreset(preset);
      });
    });

    // Custom Date Range Inputs
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

    // Sub-view Switch in History Tab (Einträge vs. Wochen)
    document.querySelectorAll('.view-pill[data-subview]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.triggerHaptic(6);
        this.setHistorySubView(btn.getAttribute('data-subview') || 'list');
      });
    });

    // Tab 3 (Settings): Tactile +/- Steppers & Form Submit
    this.bindStepper('btnTargetMinus', 'btnTargetPlus', 'settingWeeklyTarget', 0.5, 1, 60, 12);
    this.bindStepper('btnBreakMinus', 'btnBreakPlus', 'settingDefaultBreak', 5, 0, 120, 0);
    this.bindStepper('btnVacDaysMinus', 'btnVacDaysPlus', 'settingVacationDays', 1, 0, 60, 20);

    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => this.handleSettingsSubmit(e));
    }

    // Export & Backup Buttons
    const btnPrint = document.getElementById('btnPrintTimesheet');
    if (btnPrint) btnPrint.addEventListener('click', () => ExportService.printTimesheet());

    const btnExportCsv = document.getElementById('btnExportCsv');
    if (btnExportCsv) btnExportCsv.addEventListener('click', () => this.handleExportCsv());

    const btnBackup = document.getElementById('btnBackupShare');
    if (btnBackup) btnBackup.addEventListener('click', () => this.handleBackupShare());

    const btnRestore = document.getElementById('btnRestore');
    const fileRestore = document.getElementById('fileRestoreInput');
    if (btnRestore && fileRestore) {
      btnRestore.addEventListener('click', () => fileRestore.click());
      fileRestore.addEventListener('change', (e) => this.handleRestoreFile(e));
    }
  }

  setHistorySubView(view) {
    this.historySubView = view === 'weeks' ? 'weeks' : 'list';
    document.querySelectorAll('.view-pill[data-subview]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-subview') === this.historySubView);
    });
    const listEl = document.getElementById('allShiftsList');
    const weeksEl = document.getElementById('dashboardWeeklyBreakdown');
    if (listEl) listEl.hidden = this.historySubView !== 'list';
    if (weeksEl) weeksEl.hidden = this.historySubView !== 'weeks';
  }

  initSwipeNavigation() {
    const viewport = document.getElementById('tabsViewport');
    const track = document.getElementById('tabsTrack');
    if (!viewport || !track) return;

    let startX = 0;
    let startY = 0;
    let dx = 0;
    let isTracking = false;
    let lockedHoriz = false;

    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        isTracking = false;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0;
      isTracking = true;
      lockedHoriz = false;
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (!isTracking || e.touches.length !== 1) return;
      const curDx = e.touches[0].clientX - startX;
      const curDy = e.touches[0].clientY - startY;

      if (!lockedHoriz) {
        if (Math.abs(curDx) > 10 && Math.abs(curDx) > Math.abs(curDy) * 1.15) {
          lockedHoriz = true;
          track.classList.add('is-dragging');
        } else if (Math.abs(curDy) > 12) {
          isTracking = false;
          return;
        }
      }

      if (lockedHoriz) {
        e.preventDefault();
        dx = curDx;
        // Rubber-band resistance past outer tab boundaries
        if ((this.activeTabIndex === 0 && dx > 0) || (this.activeTabIndex === 2 && dx < 0)) {
          dx *= 0.28;
        }
        const basePx = -(this.activeTabIndex * viewport.clientWidth);
        track.style.transform = `translateX(${basePx + dx}px)`;
      }
    }, { passive: false });

    const finishSwipe = () => {
      if (!isTracking) return;
      isTracking = false;
      track.classList.remove('is-dragging');

      if (!lockedHoriz) return;
      lockedHoriz = false;

      if (dx < -55 && this.activeTabIndex < 2) {
        this.triggerHaptic(6);
        this.switchTabByIndex(this.activeTabIndex + 1);
      } else if (dx > 55 && this.activeTabIndex > 0) {
        this.triggerHaptic(6);
        this.switchTabByIndex(this.activeTabIndex - 1);
      } else {
        this.switchTabByIndex(this.activeTabIndex);
      }
    };

    viewport.addEventListener('touchend', finishSwipe, { passive: true });
    viewport.addEventListener('touchcancel', finishSwipe, { passive: true });
  }

  switchTabByIndex(index) {
    const clamped = Math.max(0, Math.min(2, index));
    this.activeTabIndex = clamped;

    const track = document.getElementById('tabsTrack');
    if (track) {
      track.classList.remove('is-dragging');
      track.style.transform = `translateX(-${clamped * 33.333333}%)`;
    }

    document.querySelectorAll('.nav-tab[data-index]').forEach(btn => {
      btn.classList.toggle('active', Number(btn.getAttribute('data-index')) === clamped);
    });
  }

  updateEntryDateDisplay() {
    const dateInput = document.getElementById('entryDate');
    const displayEl = document.getElementById('entryDateDisplay');
    const todayBtn = document.getElementById('btnDateToday');
    if (!dateInput || !displayEl) return;

    const todayIso = toLocalIsoDate(new Date());
    const val = dateInput.value || todayIso;
    const dObj = new Date(val + 'T00:00:00');
    if (isNaN(dObj)) {
      displayEl.textContent = val;
    } else {
      displayEl.textContent = dateFormatter.format(dObj);
    }

    if (todayBtn) {
      todayBtn.textContent = val === todayIso ? 'Gestern' : 'Heute';
    }
  }

  stepEntryDate(deltaDays) {
    const dateInput = document.getElementById('entryDate');
    if (!dateInput) return;
    const current = new Date((dateInput.value || toLocalIsoDate()) + 'T00:00:00');
    if (isNaN(current)) return;
    current.setDate(current.getDate() + deltaDays);
    dateInput.value = toLocalIsoDate(current);
    this.updateEntryDateDisplay();
  }

  setEntryType(type) {
    this.entryType = type === 'vacation' ? 'vacation' : 'work';

    document.querySelectorAll('.type-pill[data-type]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-type') === this.entryType);
    });

    const isPlannerMode = this.entryType === 'vacation' && !this.editingRecordId;
    const isSingleVacEdit = this.entryType === 'vacation' && Boolean(this.editingRecordId);

    const workDateStepper = document.getElementById('workDateStepper');
    const vacMonthStepper = document.getElementById('vacMonthStepper');
    if (workDateStepper) workDateStepper.hidden = isPlannerMode;
    if (vacMonthStepper) vacMonthStepper.hidden = !isPlannerMode;

    const workFields = document.getElementById('modalWorkShiftFields');
    const vacFields = document.getElementById('modalVacationFields');
    const vacSingleBox = document.getElementById('vacSingleEditBox');
    const vacPlannerBox = document.getElementById('vacPlannerBox');
    const noteRow = document.getElementById('entryNoteRow');

    if (workFields) workFields.hidden = this.entryType !== 'work';
    if (vacFields) vacFields.hidden = this.entryType !== 'vacation';
    if (vacSingleBox) vacSingleBox.hidden = !isSingleVacEdit;
    if (vacPlannerBox) vacPlannerBox.hidden = !isPlannerMode;
    if (noteRow) noteRow.hidden = this.entryType === 'vacation';

    if (isPlannerMode) {
      this.renderVacationPlanner();
    }

    this.updateEntryLiveButton();
  }

  shiftVacCalendarMonth(deltaMonths) {
    const d = new Date(this.vacCalYear, this.vacCalMonth + deltaMonths, 1);
    this.vacCalYear = d.getFullYear();
    this.vacCalMonth = d.getMonth();
    this.renderVacationPlanner();
  }

  getDefaultDailyVacationHours() {
    const inp = document.getElementById('vacDefaultHoursInput');
    if (inp && inp.value !== '') {
      const val = Number(inp.value);
      if (!isNaN(val) && val >= 0) return val;
    }
    return Number((this.config.weeklyTargetHours / 5).toFixed(2)) || 2.4;
  }

  setVacationHoursFromHero(hoursVal) {
    if (this.vacActiveDay && this.vacSelectedDays.has(this.vacActiveDay)) {
      this.vacSelectedDays.set(this.vacActiveDay, hoursVal);
    } else {
      for (const dateKey of this.vacSelectedDays.keys()) {
        this.vacSelectedDays.set(dateKey, hoursVal);
      }
    }
    this.renderVacationPlanner();
    this.updateEntryLiveButton();
  }

  applyDefaultHoursToAllSelectedVacDays(hoursVal) {
    for (const dateKey of this.vacSelectedDays.keys()) {
      this.vacSelectedDays.set(dateKey, hoursVal);
    }
    this.renderVacationPlanner();
    this.updateEntryLiveButton();
  }

  toggleVacationDay(isoDate) {
    this.triggerHaptic(6);
    if (!this.vacSelectedDays.has(isoDate)) {
      const existingVac = this.records.find(r => r.type === 'vacation' && r.date === isoDate);
      const hrs = existingVac ? (Number(existingVac.net_hours) || this.getDefaultDailyVacationHours()) : this.getDefaultDailyVacationHours();
      this.vacSelectedDays.set(isoDate, hrs);
      this.vacActiveDay = isoDate;
    } else if (this.vacActiveDay !== isoDate && this.vacSelectedDays.size > 1) {
      // Tapping an already selected day when multiple days are selected focuses it for individual hours editing
      this.vacActiveDay = isoDate;
    } else {
      // Tapping the currently focused day removes it from selection
      this.vacSelectedDays.delete(isoDate);
      const remaining = Array.from(this.vacSelectedDays.keys()).sort();
      this.vacActiveDay = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }
    this.renderVacationPlanner();
    this.updateEntryLiveButton();
  }

  fillVacationRangeWeekdays() {
    const keys = Array.from(this.vacSelectedDays.keys()).sort();
    if (keys.length < 2) {
      this.showToast('💡 Erst Start- & Endtag im Kalender antippen');
      return;
    }

    const firstIso = keys[0];
    const lastIso = keys[keys.length - 1];
    const cur = new Date(firstIso + 'T00:00:00');
    const end = new Date(lastIso + 'T00:00:00');
    const defHours = this.getDefaultDailyVacationHours();

    let added = 0;
    while (cur <= end) {
      const dow = cur.getDay(); // 0 = Sun, 6 = Sat
      const iso = toLocalIsoDate(cur);
      if (dow !== 0 && dow !== 6 && !this.vacSelectedDays.has(iso)) {
        const existingVac = this.records.find(r => r.type === 'vacation' && r.date === iso);
        this.vacSelectedDays.set(iso, existingVac ? Number(existingVac.net_hours) : defHours);
        added++;
      }
      cur.setDate(cur.getDate() + 1);
    }

    this.vacActiveDay = null; // Edit all selected range days together until user taps a specific day
    this.renderVacationPlanner();
    this.updateEntryLiveButton();
    if (added > 0) {
      this.showToast(`✓ ${this.vacSelectedDays.size} Werkstage im Zeitraum markiert`);
    }
  }

  renderVacationPlanner() {
    const labelEl = document.getElementById('vacCalMonthLabel');
    const gridEl = document.getElementById('vacCalendarGrid');
    if (!gridEl) return;

    const firstDayObj = new Date(this.vacCalYear, this.vacCalMonth, 1);
    const daysInMonth = new Date(this.vacCalYear, this.vacCalMonth + 1, 0).getDate();
    if (labelEl) {
      labelEl.textContent = firstDayObj.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    }

    // Update Auto Preset Pill label (e.g. 2.4h for 12h/week)
    const autoHours = Number((this.config.weeklyTargetHours / 5).toFixed(2)) || 2.4;
    const autoPill = document.getElementById('btnVacPresetAuto');
    if (autoPill) {
      autoPill.textContent = `${autoHours}h`;
    }

    // Monday-based weekday offset (0 = Mon ... 6 = Sun)
    const startOffset = (firstDayObj.getDay() + 6) % 7;
    const todayIso = toLocalIsoDate(new Date());

    // Build lookup of already saved vacation records
    const savedVacMap = new Map();
    for (const r of this.records) {
      if (r.type === 'vacation' && r.date) {
        savedVacMap.set(r.date, Number(r.net_hours) || 0);
      }
    }

    // Live-update remaining vacation badge for the displayed calendar year (including active selection)
    const vacHintEl = document.getElementById('vacationRemainingHint');
    if (vacHintEl) {
      const yearPrefix = `${this.vacCalYear}-`;
      const totalVacDays = Number(this.config.totalVacationDays) || 20;
      const usedSet = new Set();
      for (const dateKey of savedVacMap.keys()) {
        if (dateKey.startsWith(yearPrefix)) usedSet.add(dateKey);
      }
      for (const dateKey of this.vacSelectedDays.keys()) {
        if (dateKey.startsWith(yearPrefix)) usedSet.add(dateKey);
      }
      const remaining = Math.max(0, totalVacDays - usedSet.size);
      vacHintEl.textContent = `${remaining} / ${totalVacDays} T. frei`;
    }

    let cellsHtml = '';
    for (let i = 0; i < startOffset; i++) {
      cellsHtml += `<div class="vac-day-cell is-empty"></div>`;
    }

    const mStr = String(this.vacCalMonth + 1).padStart(2, '0');
    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = String(day).padStart(2, '0');
      const iso = `${this.vacCalYear}-${mStr}-${dStr}`;
      const dow = (startOffset + day - 1) % 7; // 5 = Sat, 6 = Sun
      const isWeekend = dow >= 5;
      const isToday = iso === todayIso;
      const isSelected = this.vacSelectedDays.has(iso);
      const isActiveDay = isSelected && this.vacActiveDay === iso;
      const isSavedVac = savedVacMap.has(iso);

      const hrs = isSelected
        ? this.vacSelectedDays.get(iso)
        : isSavedVac
          ? savedVacMap.get(iso)
          : null;

      const classes = [
        'vac-day-cell',
        isWeekend ? 'is-weekend' : '',
        isToday ? 'is-today' : '',
        isSavedVac && !isSelected ? 'has-saved-vac' : '',
        isSelected ? 'is-selected' : '',
        isActiveDay ? 'is-active-day' : ''
      ].filter(Boolean).join(' ');

      const hrsBadge = hrs !== null ? `<span class="vac-day-hrs">${hrs}h</span>` : '';

      cellsHtml += `
        <button type="button" class="${classes}" data-vac-date="${iso}">
          <span class="vac-day-num">${day}</span>
          ${hrsBadge}
        </button>
      `;
    }

    gridEl.innerHTML = cellsHtml;
    gridEl.querySelectorAll('.vac-day-cell[data-vac-date]').forEach(btn => {
      btn.addEventListener('click', () => {
        const iso = btn.getAttribute('data-vac-date');
        if (iso) this.toggleVacationDay(iso);
      });
    });

    // Update Tactile Hours Hero Card state
    const eyebrowEl = document.getElementById('vacHoursEyebrow');
    const targetTitleEl = document.getElementById('vacActiveDayLabel');
    const applyAllBtn = document.getElementById('btnVacApplyAll');
    const heroInput = document.getElementById('vacDefaultHoursInput');

    let currentHeroHours = heroInput ? (Number(heroInput.value) || autoHours) : autoHours;

    if (this.vacActiveDay && this.vacSelectedDays.has(this.vacActiveDay)) {
      currentHeroHours = this.vacSelectedDays.get(this.vacActiveDay);
      if (heroInput) heroInput.value = currentHeroHours;
      const dObj = new Date(this.vacActiveDay + 'T00:00:00');
      const dLabel = isNaN(dObj) ? this.vacActiveDay : dateFormatter.format(dObj);
      if (eyebrowEl) {
        eyebrowEl.textContent = this.vacSelectedDays.size > 1 ? 'Tag (Tippen = abwählen)' : 'Gewählter Tag';
      }
      if (targetTitleEl) {
        targetTitleEl.textContent = dLabel;
      }
      if (applyAllBtn) applyAllBtn.hidden = this.vacSelectedDays.size <= 1;
    } else {
      if (eyebrowEl) {
        eyebrowEl.textContent = 'Stunden pro Tag';
      }
      if (targetTitleEl) {
        targetTitleEl.textContent = this.vacSelectedDays.size > 0
          ? `Alle ${this.vacSelectedDays.size} Tage`
          : 'Standard-Urlaubstag';
      }
      if (applyAllBtn) applyAllBtn.hidden = true;
    }

    // Highlight matching preset pill
    document.querySelectorAll('.vac-preset-pill[data-vac-preset]').forEach(pill => {
      const raw = pill.getAttribute('data-vac-preset');
      const pillVal = raw === 'auto' ? autoHours : Number(raw);
      pill.classList.toggle('active', Math.abs(pillVal - currentHeroHours) < 0.01);
    });
  }

  syncBreakPillsUI(minutes) {
    document.querySelectorAll('.break-pill[data-break]').forEach(pill => {
      pill.classList.toggle('active', Number(pill.getAttribute('data-break')) === Number(minutes));
    });
  }

  resetEntryFormToDefaults() {
    this.editingRecordId = null;

    const banner = document.getElementById('editModeBanner');
    if (banner) banner.hidden = true;

    const btn = document.getElementById('btnSubmitEntry');
    if (this.saveFeedbackTimer) {
      clearTimeout(this.saveFeedbackTimer);
      this.saveFeedbackTimer = null;
    }
    if (btn) btn.classList.remove('is-saved');

    const now = new Date();
    this.vacCalYear = now.getFullYear();
    this.vacCalMonth = now.getMonth();
    this.vacSelectedDays.clear();
    this.vacActiveDay = null;

    const dateInput = document.getElementById('entryDate');
    const breakInput = document.getElementById('shiftBreak');
    const vacHoursInput = document.getElementById('vacationPaidHours');
    const vacDefInput = document.getElementById('vacDefaultHoursInput');
    const noteInput = document.getElementById('entryNote');

    const defaultVacHours = Number((this.config.weeklyTargetHours / 5).toFixed(2)) || 2.4;

    if (dateInput) dateInput.value = toLocalIsoDate(now);
    this.updateEntryDateDisplay();
    this.set24hSelectFromTimeStr('shiftStart', this.config.lastShiftStart || '08:00');
    this.set24hSelectFromTimeStr('shiftEnd', this.config.lastShiftEnd || '12:00');
    if (breakInput) breakInput.value = this.config.defaultBreak;
    if (vacHoursInput) vacHoursInput.value = defaultVacHours;
    if (vacDefInput) vacDefInput.value = defaultVacHours;
    if (noteInput) noteInput.value = '';

    this.syncBreakPillsUI(this.config.defaultBreak);
    this.setEntryType('work');
    this.updateEntryLiveButton();
  }

  loadRecordIntoEntryForm(recordId) {
    const rec = this.records.find(r => r.id === recordId);
    if (!rec) return;

    this.editingRecordId = rec.id;

    const banner = document.getElementById('editModeBanner');
    if (banner) banner.hidden = false;

    const dateInput = document.getElementById('entryDate');
    const breakInput = document.getElementById('shiftBreak');
    const vacHoursInput = document.getElementById('vacationPaidHours');
    const noteInput = document.getElementById('entryNote');

    if (dateInput) dateInput.value = rec.date;
    this.updateEntryDateDisplay();
    this.set24hSelectFromTimeStr('shiftStart', rec.start_time || '08:00');
    this.set24hSelectFromTimeStr('shiftEnd', rec.end_time || '12:00');
    if (breakInput) breakInput.value = rec.break_minutes ?? 0;
    if (vacHoursInput) vacHoursInput.value = rec.net_hours ?? 2.4;
    if (noteInput) noteInput.value = rec.note || '';

    this.syncBreakPillsUI(rec.break_minutes ?? 0);
    this.setEntryType(rec.type || 'work');
    this.updateEntryLiveButton();
    this.switchTabByIndex(0);
  }

  repeatRecordForToday(recordId) {
    const rec = this.records.find(r => r.id === recordId);
    if (!rec || rec.type === 'vacation') return;

    this.triggerHaptic(8);
    this.editingRecordId = null;

    const banner = document.getElementById('editModeBanner');
    if (banner) banner.hidden = true;

    const dateInput = document.getElementById('entryDate');
    const breakInput = document.getElementById('shiftBreak');
    const noteInput = document.getElementById('entryNote');

    if (dateInput) dateInput.value = toLocalIsoDate(new Date());
    this.updateEntryDateDisplay();
    this.set24hSelectFromTimeStr('shiftStart', rec.start_time || '08:00');
    this.set24hSelectFromTimeStr('shiftEnd', rec.end_time || '12:00');
    if (breakInput) breakInput.value = rec.break_minutes ?? 0;
    if (noteInput) noteInput.value = rec.note || '';

    this.syncBreakPillsUI(rec.break_minutes ?? 0);
    this.setEntryType('work');
    this.updateEntryLiveButton();
    this.switchTabByIndex(0);
    this.showToast(`⚡ Zeiten (${rec.start_time || '08:00'}–${rec.end_time || '12:00'}) für heute geladen`);
  }

  flashSubmitSaved(savedLabel) {
    const btn = document.getElementById('btnSubmitEntry');
    if (!btn) return;
    if (this.saveFeedbackTimer) {
      clearTimeout(this.saveFeedbackTimer);
    }
    btn.disabled = false;
    btn.classList.add('is-saved');
    btn.textContent = savedLabel;
    this.saveFeedbackTimer = setTimeout(() => {
      btn.classList.remove('is-saved');
      this.saveFeedbackTimer = null;
      this.updateEntryLiveButton();
    }, 950);
  }

  updateEntryLiveButton() {
    const btn = document.getElementById('btnSubmitEntry');
    if (!btn) return;
    if (btn.classList.contains('is-saved')) return;

    if (this.entryType === 'vacation' && !this.editingRecordId) {
      btn.disabled = false;
      const dayCount = this.vacSelectedDays.size;
      let totalHours = 0;
      for (const h of this.vacSelectedDays.values()) {
        totalHours += Number(h) || 0;
      }
      totalHours = Math.round(totalHours * 100) / 100;
      if (dayCount === 0) {
        btn.textContent = '🌴 Urlaubstage im Kalender wählen';
      } else {
        const dayWord = dayCount === 1 ? 'Tag' : 'Tage';
        btn.textContent = `+ 🌴 ${dayCount} ${dayWord} (${TimeEngine.formatHoursPretty(totalHours)}) speichern`;
      }
      return;
    }

    let hours = 0;
    if (this.entryType === 'vacation') {
      hours = Number(document.getElementById('vacationPaidHours')?.value) || 0;
    } else {
      const start = document.getElementById('shiftStart')?.value;
      const end = document.getElementById('shiftEnd')?.value;
      const breakMin = document.getElementById('shiftBreak')?.value || 0;
      hours = TimeEngine.calculateNetHours(start, end, breakMin);
    }

    if (this.entryType === 'work' && hours <= 0) {
      btn.disabled = true;
      btn.textContent = 'Dauer > 0 h wählen';
      return;
    }

    btn.disabled = false;
    const formatted = TimeEngine.formatHoursPretty(hours);
    if (this.editingRecordId) {
      btn.textContent = `✓ ${formatted} speichern`;
    } else {
      btn.textContent = `+ ${formatted} eintragen`;
    }
  }

  async handleEntrySubmit(e) {
    if (e) e.preventDefault();
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    try {
      const noteInput = document.getElementById('entryNote');
      const note = this.entryType === 'vacation' ? '' : (noteInput?.value || '').trim();

      const prevWeekHours = this.getCurrentWeekHours();
      const targetH = this.config.weeklyTargetHours || 12;

      // Multi-Day Vacation Planner Batch Save
      if (this.entryType === 'vacation' && !this.editingRecordId) {
        if (this.vacSelectedDays.size === 0) {
          this.showToast('⚠️ Bitte mindestens einen Urlaubstag im Kalender antippen');
          return;
        }

        const sortedDates = Array.from(this.vacSelectedDays.keys()).sort();
        let totalSavedHours = 0;

        for (const isoDate of sortedDates) {
          const netHours = Number(this.vacSelectedDays.get(isoDate)) || 0;
          totalSavedHours += netHours;

          // Overwrite existing vacation record on the same date if present
          const existingVac = this.records.find(r => r.type === 'vacation' && r.date === isoDate);
          const vacRecord = {
            type: 'vacation',
            date: isoDate,
            year_month: isoDate.substring(0, 7),
            start_time: '',
            end_time: '',
            break_minutes: 0,
            net_hours: netHours,
            note
          };
          if (existingVac && existingVac.id) {
            vacRecord.id = existingVac.id;
          }
          await db.saveRecord(vacRecord);
        }

        const count = sortedDates.length;
        await this.loadRecords();
        const nextWeekHours = this.getCurrentWeekHours();
        this.vacSelectedDays.clear();
        this.vacActiveDay = null;
        if (noteInput) noteInput.value = '';
        this.render();
        this.renderVacationPlanner();
        this.flashSubmitSaved(`✓ ${count} Urlaubstag${count === 1 ? '' : 'e'} gespeichert!`);

        if (prevWeekHours < targetH && nextWeekHours >= targetH) {
          this.burstConfetti();
          this.triggerHaptic([12, 35, 18]);
          this.showToast(`🎉 Wochenziel (${targetH} h) erreicht!`);
        } else {
          this.triggerHaptic(14);
          this.showToast(`🌴 ${count} Urlaubstag${count === 1 ? '' : 'e'} (${TimeEngine.formatHoursPretty(totalSavedHours)}) gespeichert`);
        }
        return;
      }

      const dateInput = document.getElementById('entryDate');
      const date = (dateInput && dateInput.value) ? dateInput.value : toLocalIsoDate(new Date());
      let netHours = 0;
      let startTime = '';
      let endTime = '';
      let breakMinutes = 0;

      if (this.entryType === 'vacation') {
        netHours = Number(document.getElementById('vacationPaidHours')?.value) || 0;
      } else {
        startTime = document.getElementById('shiftStart')?.value || '08:00';
        endTime = document.getElementById('shiftEnd')?.value || '12:00';
        breakMinutes = Number(document.getElementById('shiftBreak')?.value) || 0;
        netHours = TimeEngine.calculateNetHours(startTime, endTime, breakMinutes);
        if (netHours <= 0) {
          this.showToast('⚠️ Bitte Dauer > 0 h wählen');
          return;
        }
      }

      const isEdit = Boolean(this.editingRecordId);

      const recordData = {
        type: this.entryType,
        date,
        year_month: date.substring(0, 7),
        start_time: startTime,
        end_time: endTime,
        break_minutes: breakMinutes,
        net_hours: netHours,
        note
      };
      if (this.editingRecordId) {
        recordData.id = this.editingRecordId;
      }

      await db.saveRecord(recordData);

      // Remember last work shift times so the next entry starts with them
      if (this.entryType === 'work' && !isEdit) {
        this.config.lastShiftStart = startTime;
        this.config.lastShiftEnd = endTime;
        await db.setSetting('lastShiftStart', startTime);
        await db.setSetting('lastShiftEnd', endTime);
      }

      if (noteInput && document.activeElement === noteInput) {
        noteInput.blur();
      }

      await this.loadRecords();
      const nextWeekHours = this.getCurrentWeekHours();
      this.resetEntryFormToDefaults();
      this.render();
      this.flashSubmitSaved(isEdit ? '✓ Gespeichert!' : `✓ ${TimeEngine.formatHoursPretty(netHours)} gespeichert!`);

      if (!isEdit && prevWeekHours < targetH && nextWeekHours >= targetH) {
        this.burstConfetti();
        this.triggerHaptic([12, 35, 18]);
        this.showToast(`🎉 Wochenziel (${targetH} h) erreicht!`);
      } else {
        this.triggerHaptic(14);
        this.showToast(isEdit ? '✓ Änderungen gespeichert' : `✓ ${TimeEngine.formatHoursPretty(netHours)} eingetragen`);
      }
    } catch (err) {
      console.error('Save failed:', err);
      this.showToast('⚠️ Fehler beim Speichern: ' + (err.message || 'Unbekannter Fehler'));
    } finally {
      this.isSubmitting = false;
    }
  }

  toggleCustomDateDrawer(forceState) {
    const drawer = document.getElementById('customDatesDrawer');
    if (!drawer) return;
    const shouldOpen = typeof forceState === 'boolean' ? forceState : drawer.hasAttribute('hidden');
    drawer.hidden = !shouldOpen;
  }

  shiftPeriodByMonths(deltaMonths) {
    const startObj = new Date(this.startDate + 'T00:00:00');
    if (isNaN(startObj)) return;

    const firstDay = new Date(startObj.getFullYear(), startObj.getMonth() + deltaMonths, 1);
    const lastDay = new Date(startObj.getFullYear(), startObj.getMonth() + deltaMonths + 1, 0);

    this.startDate = toLocalIsoDate(firstDay);
    this.endDate = toLocalIsoDate(lastDay);
    this.activePreset = 'custom';

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

    this.toggleCustomDateDrawer(false);
    this.updatePeriodPillsUI();
    this.render();
  }

  updatePeriodPillsUI() {
    document.querySelectorAll('.period-pill[data-preset]').forEach(pill => {
      pill.classList.toggle('active', pill.getAttribute('data-preset') === this.activePreset);
    });
  }

  render() {
    const agg = TimeEngine.aggregateDateRange(this.records, this.startDate, this.endDate, this.config);
    const lifetimeOvertime = TimeEngine.calculateLifetimeOvertime(this.records, this.config);

    this.renderStatusStrip(agg, lifetimeOvertime);
    this.renderHistoryTab(agg);
    this.renderSettingsTab();
    this.renderPrintTimesheet(agg, lifetimeOvertime);
  }

  renderStatusStrip(agg, lifetimeOvertime) {
    const todayIso = toLocalIsoDate(new Date());
    const currentWeekKey = TimeEngine.getIsoWeek(todayIso);
    const kwNumber = currentWeekKey.split('-W')[1] || '';

    const weekHours = this.getCurrentWeekHours();
    const targetH = this.config.weeklyTargetHours || 12;

    const weekLabel = document.getElementById('statWeekLabel');
    const weekHoursEl = document.getElementById('statWeekHours');
    const weekBarEl = document.getElementById('statWeekBar');
    const monthHoursEl = document.getElementById('statMonthHours');
    const overtimeEl = document.getElementById('statOvertime');
    const vacHintEl = document.getElementById('vacationRemainingHint');

    if (weekLabel) weekLabel.textContent = weekHours >= targetH ? `Woche (KW ${kwNumber}) ✓` : `Woche (KW ${kwNumber})`;
    if (weekHoursEl) weekHoursEl.textContent = `${TimeEngine.formatHoursPretty(weekHours)} / ${targetH} h`;

    if (weekBarEl) {
      const pct = Math.min(100, Math.round((weekHours / targetH) * 100));
      weekBarEl.style.width = `${pct}%`;
      weekBarEl.classList.toggle('done', weekHours >= targetH);
    }

    if (monthHoursEl) monthHoursEl.textContent = TimeEngine.formatHoursPretty(agg.totalHours);

    if (overtimeEl) {
      const sign = lifetimeOvertime > 0 ? '+' : '';
      overtimeEl.textContent = `${sign}${TimeEngine.formatHoursPretty(lifetimeOvertime)}`;
      overtimeEl.className = lifetimeOvertime > 0
        ? 'status-value text-emerald'
        : lifetimeOvertime < 0
          ? 'status-value text-rose'
          : 'status-value';
    }

    if (vacHintEl) {
      vacHintEl.textContent = `${agg.vacationDaysRemaining} / ${agg.totalVacationDays} T. frei`;
    }
  }

  renderHistoryTab(agg) {
    const startInput = document.getElementById('filterStartDate');
    const endInput = document.getElementById('filterEndDate');
    if (startInput) startInput.value = this.startDate;
    if (endInput) endInput.value = this.endDate;

    const periodTextEl = document.getElementById('activePeriodText');
    if (periodTextEl) {
      const s = new Date(this.startDate + 'T00:00:00');
      const e = new Date(this.endDate + 'T00:00:00');
      if (!isNaN(s) && !isNaN(e)) {
        const isFirstDay = s.getDate() === 1;
        const lastOfSMonth = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
        const isSameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && e.getDate() === lastOfSMonth;
        if (isFirstDay && isSameMonth) {
          periodTextEl.textContent = s.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        } else {
          periodTextEl.textContent = `${shortDateFormatter.format(s)} – ${shortDateFormatter.format(e)}`;
        }
      }
    }

    const histTotal = document.getElementById('histTotalHours');
    const histTarget = document.getElementById('histTargetInfo');
    const histVac = document.getElementById('histVacationInfo');

    if (histTotal) histTotal.textContent = TimeEngine.formatHoursPretty(agg.totalHours);
    if (histTarget) histTarget.textContent = `${this.config.weeklyTargetHours} h/Wo.`;
    if (histVac) histVac.textContent = `${agg.vacationDaysRemaining} T. frei`;

    // Entries List
    const listContainer = document.getElementById('allShiftsList');
    if (listContainer) {
      const reversed = agg.records.slice().reverse();
      if (reversed.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">Keine Einträge in diesem Zeitraum.</div>`;
      } else {
        listContainer.innerHTML = reversed.map(r => {
          const isVac = r.type === 'vacation';
          const dObj = new Date(r.date + 'T00:00:00');
          const dStr = isNaN(dObj) ? r.date : dateFormatter.format(dObj);
          const timeInfo = isVac
            ? '🌴 Urlaubstag'
            : `${r.start_time || '—'} – ${r.end_time || '—'}${r.break_minutes ? ` (-${r.break_minutes}m)` : ''}`;
          const notePart = r.note ? ` · ${escapeHtml(r.note)}` : '';

          return `
            <div class="shift-item ${isVac ? 'is-vacation' : ''}">
              <div class="shift-item-left">
                <div class="shift-item-date">${dStr}</div>
                <div class="shift-item-meta">${timeInfo}${notePart}</div>
              </div>
              <div class="shift-item-right">
                <span class="shift-hours-badge">${TimeEngine.formatHoursPretty(r.net_hours)}</span>
                ${isVac ? '' : `<button type="button" class="icon-action-btn btn-repeat-record" data-id="${r.id}" title="Für heute übernehmen" aria-label="Nochmal für heute">↻</button>`}
                <button type="button" class="icon-action-btn btn-edit-record" data-id="${r.id}" aria-label="Bearbeiten">✏️</button>
                <button type="button" class="icon-action-btn btn-delete-record" data-id="${r.id}" aria-label="Löschen">🗑️</button>
              </div>
            </div>
          `;
        }).join('');

        listContainer.querySelectorAll('.btn-repeat-record').forEach(btn => {
          btn.addEventListener('click', () => this.repeatRecordForToday(btn.getAttribute('data-id')));
        });

        listContainer.querySelectorAll('.btn-edit-record').forEach(btn => {
          btn.addEventListener('click', () => this.loadRecordIntoEntryForm(btn.getAttribute('data-id')));
        });

        listContainer.querySelectorAll('.btn-delete-record').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const rec = this.records.find(r => r.id === id);
            if (!rec) return;
            const deletedRecord = { ...rec };

            this.triggerHaptic(10);
            await db.deleteRecord(id);
            await this.loadRecords();
            this.render();

            this.showToast('🗑️ Gelöscht', {
              actionLabel: 'Rückgängig',
              duration: 4800,
              onAction: async () => {
                await db.saveRecord(deletedRecord);
                await this.loadRecords();
                this.render();
                this.triggerHaptic(8);
                this.showToast('✓ Wiederhergestellt');
              }
            });
          });
        });
      }
    }

    // Weeks List
    const weeksContainer = document.getElementById('dashboardWeeklyBreakdown');
    if (weeksContainer) {
      if (agg.weeklyDetails.length === 0) {
        weeksContainer.innerHTML = `<div class="empty-state">Keine Wochen im Zeitraum.</div>`;
      } else {
        const target = this.config.weeklyTargetHours || 12;
        weeksContainer.innerHTML = agg.weeklyDetails.slice().reverse().map(w => {
          const sign = w.delta > 0 ? '+' : '';
          const deltaClass = w.delta > 0 ? 'delta-pos' : w.delta < 0 ? 'delta-neg' : 'delta-zero';
          const pct = Math.min(100, Math.round((w.hours / target) * 100));

          return `
            <div class="week-item">
              <div class="week-item-top">
                <span class="week-kw">KW ${w.week.split('-W')[1]}</span>
                <div class="week-hours-delta">
                  <span>${TimeEngine.formatHoursPretty(w.hours)} / ${target} h</span>
                  <span class="delta-pill ${deltaClass}">${sign}${TimeEngine.formatHoursPretty(w.delta)}</span>
                </div>
              </div>
              <div class="mini-progress">
                <div class="mini-progress-fill ${w.hours >= target ? 'done' : ''}" style="width: ${pct}%;"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  renderSettingsTab() {
    const targetInput = document.getElementById('settingWeeklyTarget');
    const breakInput = document.getElementById('settingDefaultBreak');
    const vacInput = document.getElementById('settingVacationDays');
    const userInput = document.getElementById('settingUserName');
    const empInput = document.getElementById('settingEmployerName');

    if (targetInput) targetInput.value = this.config.weeklyTargetHours;
    if (breakInput) breakInput.value = this.config.defaultBreak;
    if (vacInput) vacInput.value = this.config.vacationDaysTotal;
    if (userInput) userInput.value = this.config.userName;
    if (empInput) empInput.value = this.config.employerName;
  }

  async handleSettingsSubmit(e) {
    e.preventDefault();
    const targetH = Number(document.getElementById('settingWeeklyTarget').value) || 12.0;
    const defBreak = Number(document.getElementById('settingDefaultBreak').value) || 0;
    const vacTotal = Number(document.getElementById('settingVacationDays').value) || 20;
    const userName = (document.getElementById('settingUserName').value || '').trim();
    const employerName = (document.getElementById('settingEmployerName').value || '').trim();

    await db.setSetting('weeklyTargetHours', targetH);
    await db.setSetting('defaultBreak', defBreak);
    await db.setSetting('vacationDaysTotal', vacTotal);
    await db.setSetting('userName', userName);
    await db.setSetting('employerName', employerName);

    await this.loadSettings();
    if (!this.editingRecordId) {
      this.resetEntryFormToDefaults();
    }
    this.render();
    this.showToast('✓ Einstellungen gespeichert');
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
          <td>${isVac ? 'Urlaub' : 'Arbeit'}</td>
          <td>${isVac ? '—' : (r.start_time || '—')}</td>
          <td>${isVac ? '—' : (r.end_time || '—')}</td>
          <td>${isVac ? '—' : (r.break_minutes || 0) + ' Min.'}</td>
          <td style="text-align: right; font-weight: 600;">${TimeEngine.formatHoursPretty(r.net_hours)}</td>
          <td>${escapeHtml(r.note || '')}</td>
        </tr>
      `;
    }

    printSection.innerHTML = `
      <div class="print-header">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
          <div>
            <h1 style="font-size: 1.4rem; margin-bottom: 0.25rem;">STUNDENZETTEL</h1>
          </div>
          <div style="text-align: right; font-size: 0.9rem;">
            <strong>Zeitraum:</strong> ${agg.startDate} bis ${agg.endDate}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.2rem; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 0.6rem 0;">
          <div>
            <strong>Name:</strong> ${escapeHtml(userDisplay)}<br>
            <strong>Zielstunden:</strong> ${this.config.weeklyTargetHours} Std./Woche
          </div>
          <div>
            <strong>Firma:</strong> ${escapeHtml(employerDisplay)}
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
            <th>Notiz</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="7" style="text-align:center;">Keine Einträge im Zeitraum.</td></tr>'}
        </tbody>
        <tfoot>
          <tr style="font-weight: 700; background: #eee;">
            <td colspan="5">GESAMTSUMME:</td>
            <td style="text-align: right;">${TimeEngine.formatHoursPretty(agg.totalHours)}</td>
            <td>Saldo: ${agg.periodOvertimeDelta > 0 ? '+' : ''}${TimeEngine.formatHoursPretty(agg.periodOvertimeDelta)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top: 1.2rem; font-size: 0.85rem; color: #444;">
        Überstunden-Saldo gesamt: <strong>${lifetimeOvertime > 0 ? '+' : ''}${TimeEngine.formatHoursPretty(lifetimeOvertime)}</strong>
      </div>

      <div class="print-signatures" style="display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; margin-top: 3.5rem;">
        <div style="border-top: 1px solid #000; padding-top: 0.5rem; font-size: 0.85rem;">
          Datum, Unterschrift Arbeitnehmer/in
        </div>
        <div style="border-top: 1px solid #000; padding-top: 0.5rem; font-size: 0.85rem;">
          Datum, Unterschrift Arbeitgeber/in
        </div>
      </div>
    `;
  }

  async handleBackupShare() {
    const res = await ExportService.backupAndShare();
    if (res.success && res.method === 'download') {
      this.showToast('☁️ Backup heruntergeladen');
    }
  }

  async handleRestoreFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (confirm('Bestehende Daten mit diesem Backup überschreiben?')) {
      try {
        await ExportService.restoreFromJsonFile(file);
        await this.loadSettings();
        await this.loadRecords();
        this.render();
        this.showToast('📥 Backup geladen');
      } catch (err) {
        alert('Fehler beim Laden: ' + err.message);
      }
    }
    e.target.value = '';
  }

  handleExportCsv() {
    const agg = TimeEngine.aggregateDateRange(this.records, this.startDate, this.endDate, this.config);
    ExportService.exportDateRangeCsv(agg);
    this.showToast('📊 CSV exportiert');
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
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
