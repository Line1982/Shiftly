/**
 * Shiftly Time Engine (js/time_engine.js)
 * Pure domain logic: shift duration, breaks, weekly target hours,
 * date range aggregation, vacation tracking and ISO calendar weeks.
 */

export class TimeEngine {
  /**
   * Calculates net hours from start time, end time, and break minutes.
   * Handles overnight shifts (e.g. 22:00 -> 02:00).
   */
  static calculateNetHours(startTime, endTime, breakMinutes = 0) {
    if (!startTime || !endTime) return 0;

    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);

    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;

    let startTotalMin = sh * 60 + sm;
    let endTotalMin = eh * 60 + em;

    if (endTotalMin < startTotalMin) {
      endTotalMin += 24 * 60;
    }

    const grossMinutes = endTotalMin - startTotalMin;
    const netMinutes = Math.max(0, grossMinutes - (Number(breakMinutes) || 0));

    return Number((netMinutes / 60).toFixed(2));
  }

  /**
   * Returns the ISO calendar week string 'YYYY-Www' for a given YYYY-MM-DD date.
   */
  static getIsoWeek(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';

    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  /**
   * Calculates weekly over/under hours against the configured weekly target (default 12h).
   */
  static calculateTargetDelta(actualHours, targetHours = 12.0) {
    const h = Number(actualHours) || 0;
    const t = Number(targetHours) || 12.0;
    return Number((h - t).toFixed(2));
  }

  /**
   * Aggregates records for a date range (startDate to endDate inclusive).
   */
  static aggregateDateRange(records, startDate, endDate, config = {}) {
    const targetHours = Number(config.weeklyTargetHours) || 12.0;
    const totalVacationDays = Number(config.vacationDaysTotal) || 20;

    const filteredRecords = records.filter(r => {
      if (!r.date) return false;
      return r.date >= startDate && r.date <= endDate;
    }).sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

    let totalWorkHours = 0;
    let totalVacationHours = 0;
    let vacationDaysInPeriod = 0;

    const enrichedRecords = filteredRecords.map(r => {
      const type = r.type || 'work';
      let netHours = 0;

      if (type === 'vacation') {
        netHours = Number(r.net_hours) || 0;
        totalVacationHours += netHours;
        vacationDaysInPeriod += 1;
      } else {
        netHours = r.net_hours !== undefined
          ? Number(r.net_hours)
          : this.calculateNetHours(r.start_time, r.end_time, r.break_minutes);
        totalWorkHours += netHours;
      }

      return {
        ...r,
        type,
        net_hours: netHours,
        iso_week: this.getIsoWeek(r.date)
      };
    });

    const totalHours = Number((totalWorkHours + totalVacationHours).toFixed(2));

    // Group by ISO week
    const weeklyMap = {};
    for (const r of enrichedRecords) {
      const week = r.iso_week;
      if (!weeklyMap[week]) weeklyMap[week] = { week, hours: 0, records: [] };
      weeklyMap[week].hours += r.net_hours;
      weeklyMap[week].records.push(r);
    }

    let periodOvertimeDelta = 0;
    const weeklyDetails = Object.values(weeklyMap).map(w => {
      const delta = this.calculateTargetDelta(w.hours, targetHours);
      periodOvertimeDelta += delta;
      return {
        week: w.week,
        hours: Number(w.hours.toFixed(2)),
        targetHours,
        delta,
        recordCount: w.records.length
      };
    });

    const currentYear = (startDate ? startDate.substring(0, 4) : new Date().getFullYear().toString());
    const yearVacationRecords = records.filter(r => (r.type === 'vacation') && r.date && r.date.startsWith(currentYear));
    const vacationDaysTakenYear = yearVacationRecords.length;
    const vacationDaysRemaining = Math.max(0, totalVacationDays - vacationDaysTakenYear);

    return {
      startDate,
      endDate,
      recordCount: enrichedRecords.length,
      totalHours,
      totalWorkHours: Number(totalWorkHours.toFixed(2)),
      totalVacationHours: Number(totalVacationHours.toFixed(2)),
      vacationDaysInPeriod,
      vacationDaysTakenYear,
      vacationDaysRemaining,
      totalVacationDays,
      weeklyTargetHours: targetHours,
      periodOvertimeDelta: Number(periodOvertimeDelta.toFixed(2)),
      weeklyDetails,
      records: enrichedRecords
    };
  }

  /**
   * Calculates cumulative overtime balance across all recorded calendar weeks.
   */
  static calculateLifetimeOvertime(allRecords, config = {}) {
    const targetHours = Number(config.weeklyTargetHours) || 12.0;

    const weeklyMap = {};
    for (const r of allRecords) {
      if (!r.date) continue;
      const week = this.getIsoWeek(r.date);
      if (!weeklyMap[week]) weeklyMap[week] = 0;
      const hours = r.net_hours !== undefined
        ? Number(r.net_hours)
        : this.calculateNetHours(r.start_time, r.end_time, r.break_minutes);
      weeklyMap[week] += hours;
    }

    let cumulativeOvertime = 0;
    for (const week of Object.keys(weeklyMap)) {
      cumulativeOvertime += this.calculateTargetDelta(weeklyMap[week], targetHours);
    }

    return Number(cumulativeOvertime.toFixed(2));
  }

  /**
   * Formats decimal hours cleanly: e.g. "4 h" or "4 h 30 m"
   */
  static formatHoursPretty(hours) {
    const hNum = Number(hours) || 0;
    const isNegative = hNum < 0;
    const absMinutes = Math.round(Math.abs(hNum) * 60);
    const h = Math.floor(absMinutes / 60);
    const m = absMinutes % 60;
    const sign = isNegative ? '-' : '';
    if (m === 0) return `${sign}${h} h`;
    return `${sign}${h} h ${m} m`;
  }
}
