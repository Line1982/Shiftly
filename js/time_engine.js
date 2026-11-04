/**
 * Shiftly Time Engine (js/time_engine.js)
 * Pure domain logic: shift duration, breaks, hourly earnings, 10-15h corridor overtimes,
 * flexible date range filtering, vacation tracking and ISO calendar weeks.
 * Zero DOM or network dependencies.
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
      endTotalMin += 24 * 60; // Overnight shift
    }

    const grossMinutes = endTotalMin - startTotalMin;
    const netMinutes = Math.max(0, grossMinutes - (Number(breakMinutes) || 0));

    return Number((netMinutes / 60).toFixed(2));
  }

  /**
   * Calculates earnings for a given number of hours and hourly wage.
   */
  static calculateEarnings(hours, hourlyRate) {
    const h = Number(hours) || 0;
    const r = Number(hourlyRate) || 0;
    return Number((h * r).toFixed(2));
  }

  /**
   * Returns the ISO calendar week string 'YYYY-Www' for a given YYYY-MM-DD date.
   */
  static getIsoWeek(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';

    // Thursday in current week decides the year.
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  /**
   * Calculates weekly over/under hours based on the 10-15h corridor.
   * Corridor rule:
   *  - < minHours (10h): Saldo = actual - 10 (negative)
   *  - 10h to 15h: Saldo = 0 (perfect target corridor)
   *  - > maxHours (15h): Saldo = actual - 15 (positive)
   */
  static calculateCorridorDelta(actualHours, minHours = 10.0, maxHours = 15.0) {
    const h = Number(actualHours) || 0;
    if (h < minHours) {
      return Number((h - minHours).toFixed(2));
    } else if (h > maxHours) {
      return Number((h - maxHours).toFixed(2));
    }
    return 0.0;
  }

  /**
   * Aggregates records for an arbitrary date range (startDate to endDate inclusive).
   */
  static aggregateDateRange(records, startDate, endDate, config = {}) {
    const minHours = Number(config.weeklyHoursMin) || 10.0;
    const maxHours = Number(config.weeklyHoursMax) || 15.0;
    const defaultWage = Number(config.hourlyRate) || 14.0;
    const totalVacationDays = Number(config.vacationDaysTotal) || 20;

    // Filter by date range
    const filteredRecords = records.filter(r => {
      if (!r.date) return false;
      return r.date >= startDate && r.date <= endDate;
    }).sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

    let totalWorkHours = 0;
    let totalVacationHours = 0;
    let totalEarnings = 0;
    let vacationDaysInPeriod = 0;

    const enrichedRecords = filteredRecords.map(r => {
      const type = r.type || 'work';
      let netHours = 0;
      let earnings = 0;
      const rate = r.hourly_rate !== undefined ? Number(r.hourly_rate) : defaultWage;

      if (type === 'vacation') {
        netHours = Number(r.net_hours) || 0;
        earnings = r.earnings !== undefined ? Number(r.earnings) : this.calculateEarnings(netHours, rate);
        totalVacationHours += netHours;
        vacationDaysInPeriod += 1;
      } else {
        netHours = r.net_hours !== undefined
          ? Number(r.net_hours)
          : this.calculateNetHours(r.start_time, r.end_time, r.break_minutes);
        earnings = r.earnings !== undefined ? Number(r.earnings) : this.calculateEarnings(netHours, rate);
        totalWorkHours += netHours;
      }

      totalEarnings += earnings;

      return {
        ...r,
        type,
        net_hours: netHours,
        hourly_rate: rate,
        earnings: earnings,
        iso_week: this.getIsoWeek(r.date)
      };
    });

    const totalHours = Number((totalWorkHours + totalVacationHours).toFixed(2));
    totalEarnings = Number(totalEarnings.toFixed(2));

    // Group all records by ISO week to calculate corridor balances
    const weeklyMap = {};
    for (const r of enrichedRecords) {
      const week = r.iso_week;
      if (!weeklyMap[week]) weeklyMap[week] = { week, hours: 0, records: [] };
      weeklyMap[week].hours += r.net_hours;
      weeklyMap[week].records.push(r);
    }

    let periodOvertimeDelta = 0;
    const weeklyDetails = Object.values(weeklyMap).map(w => {
      const delta = this.calculateCorridorDelta(w.hours, minHours, maxHours);
      periodOvertimeDelta += delta;
      return {
        week: w.week,
        hours: Number(w.hours.toFixed(2)),
        delta: delta,
        recordCount: w.records.length
      };
    });

    // Calculate vacation totals for current year from ALL records (not just this period)
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
      totalEarnings,
      vacationDaysInPeriod,
      vacationDaysTakenYear,
      vacationDaysRemaining,
      totalVacationDays,
      periodOvertimeDelta: Number(periodOvertimeDelta.toFixed(2)),
      weeklyDetails,
      records: enrichedRecords
    };
  }

  /**
   * Calculates overall overtime balance across all past full weeks.
   */
  static calculateLifetimeOvertime(allRecords, config = {}) {
    const minHours = Number(config.weeklyHoursMin) || 10.0;
    const maxHours = Number(config.weeklyHoursMax) || 15.0;

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
      cumulativeOvertime += this.calculateCorridorDelta(weeklyMap[week], minHours, maxHours);
    }

    return Number(cumulativeOvertime.toFixed(2));
  }

  /**
   * Formats decimal hours into German format: "X Std. Y Min." or "X,XX h".
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
