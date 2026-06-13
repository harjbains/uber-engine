import { supabaseClient } from "./supabase.js";
import { sendToGoogleSheets, buildDaySheetPayload } from "./googleSheets.js";
import { showStatus } from "./status.js";
import { loadMonthSummary } from "./monthly.js";
import { getChargingTotalsForRange, getRollingFuelPricePerLitre } from "./fuel.js";
import {
  SETTINGS_UPDATED_EVENT,
  getDailyInsuranceEstimate,
  getDailyHoursTargetDefault,
  getDynamicUpliftPercent,
  getEvEfficiencyMilesPerKwh,
  getFallbackFuelPrice,
  getFuelType,
  getMpg,
  getSettings,
  getTaxRate,
  getWeeklyTargetDefault,
  getWeeklyTargetMode,
  formatClockHours,
  parseClockHoursInput
} from "./settings.js?v=2.3.23";

const ids = {
  date: "day_date",
  gross: "day_gross",
  miles: "day_miles",
  hours: "day_hours",
  minutes: "day_minutes",
  saveBtn: "save_day",
  list: "dayList",
  weekTitle: "week_title",
  weekSummary: "week_summary",
  weeklyTarget: "weekly_target",
  dailyHoursTarget: "daily_hours_target",
  targetWorkdays: "target_workdays",
  targetWeekStrip: "target_week_strip",
  targetSummary: "target_summary",
  targetStatus: "target_status",
  targetPrevWeek: "target_prev_week",
  targetNextWeek: "target_next_week",
  prevWeek: "prev_week",
  thisWeek: "this_week",
  nextWeek: "next_week"
};

const WORK_DATE_OPTIONS_DAYS = 7;

const LITRES_PER_UK_GALLON = 4.546;
const WEEKLY_TARGETS_TABLE = "weekly_targets";
const TARGET_STORAGE_PREFIX = "uberEngineWeeklyTarget";
const DEFAULT_TARGET_WORKDAYS = [0, 1, 2, 3, 4, 5];
const HOURS_TARGET_DAYS_PER_WEEK = 7;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_FORECAST_WEIGHTS = [0.9, 0.95, 1, 1, 1.2, 1.25, 0.75];
const WEEKDAY_HOUR_WEIGHTS = [1, 1, 1, 1, 1.15, 1.25, 0.9];

let weekOffset = 0;
let currentWeekDays = [];
let currentHistoricalDays = [];
let currentWeekRange = null;
let weeklyTargetsTableAvailable = true;

function el(id) {
  return document.getElementById(id);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value) {
  return `\u00a3${Number(value || 0).toFixed(2)}`;
}

function formatCompactMoney(value) {
  return `\u00a3${Math.round(Number(value || 0))}`;
}

function formatNumber(value, dp = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(dp);
}

function formatInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return String(Math.round(n));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function todayIso() {
  const now = new Date();
  return dateToIso(now);
}

function parseLocalDate(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateLabel(dateString) {
  const d = parseLocalDate(dateString);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatWorkDateOptionLabel(dateString, todayString) {
  const d = parseLocalDate(dateString);
  const label = d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short"
  });

  return dateString === todayString ? `${label} (Today)` : label;
}

function startOfWeek(baseDate) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(baseDate) {
  const d = startOfWeek(baseDate);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function dateToIso(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getSelectedWeekRange() {
  const base = new Date();
  base.setDate(base.getDate() + (weekOffset * 7));

  const weekStart = startOfWeek(base);
  const weekEnd = endOfWeek(base);

  return {
    weekStart,
    weekEnd,
    startIso: dateToIso(weekStart),
    endIso: dateToIso(weekEnd)
  };
}

function getWeekDates(startIso) {
  const start = parseLocalDate(startIso);

  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    return dateToIso(d);
  });
}

function addDaysIso(dateString, days) {
  const d = parseLocalDate(dateString);
  d.setDate(d.getDate() + days);
  return dateToIso(d);
}

function getWeekdayIndex(dateString) {
  const day = parseLocalDate(dateString).getDay();
  return day === 0 ? 6 : day - 1;
}

function getHourTargetWeight(dateString) {
  return WEEKDAY_HOUR_WEIGHTS[getWeekdayIndex(dateString)] || 1;
}

function distributeHoursByWeight(amount, dateStrings) {
  if (!dateStrings.length || amount <= 0) return new Map();

  const weights = dateStrings.map((dateString) => Math.max(0, getHourTargetWeight(dateString)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const fallback = amount / dateStrings.length;

  return new Map(dateStrings.map((dateString, index) => [
    dateString,
    totalWeight > 0 ? (amount * weights[index]) / totalWeight : fallback
  ]));
}

function targetStorageKey(startIso) {
  return `${TARGET_STORAGE_PREFIX}:${startIso}`;
}

function normaliseWorkDays(workDays, fallback = DEFAULT_TARGET_WORKDAYS) {
  const values = Array.isArray(workDays)
    ? workDays
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
    : fallback;

  return values.length ? [...new Set(values)] : [...fallback];
}

function targetSettingsFromDbRow(row) {
  return {
    target: row.target ?? getWeeklyTargetDefault(),
    dailyHoursTarget: row.daily_hours_target ?? getDailyHoursTargetDefault(),
    targetSnapshot: row.target_snapshot ?? null,
    targetSnapshotMode: row.target_snapshot_mode || "",
    targetIsCustom: row.target_is_custom === true,
    hoursTargetIsCustom: row.hours_target_is_custom === true,
    workDays: normaliseWorkDays(row.work_days)
  };
}

function targetSettingsToDbRow(startIso, settings = {}) {
  return {
    week_start: startIso,
    target: Number(settings.target || 0),
    daily_hours_target: Number(settings.dailyHoursTarget || 0),
    target_snapshot: toNumber(settings.targetSnapshot),
    target_snapshot_mode: settings.targetSnapshotMode || null,
    target_is_custom: settings.targetIsCustom === true,
    hours_target_is_custom: settings.hoursTargetIsCustom === true,
    work_days: normaliseWorkDays(settings.workDays),
    updated_at: new Date().toISOString()
  };
}

function isMissingWeeklyTargetsTable(error) {
  const message = String(error?.message || error?.details || "");
  return error?.code === "42P01" || message.includes(WEEKLY_TARGETS_TABLE);
}

function readTargetSettings(startIso) {
  const fallback = {
    target: getWeeklyTargetDefault(),
    dailyHoursTarget: getDailyHoursTargetDefault(),
    targetSnapshot: null,
    targetSnapshotMode: "",
    workDays: [...DEFAULT_TARGET_WORKDAYS]
  };

  try {
    const raw = localStorage.getItem(targetStorageKey(startIso));
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    const workDays = normaliseWorkDays(parsed.workDays, fallback.workDays);

    const storedTarget = parsed.target ?? fallback.target;
    const storedHoursTarget = parsed.dailyHoursTarget ?? fallback.dailyHoursTarget;
    const isCompletedWeek = addDaysIso(startIso, 6) < todayIso();

    return {
      target: parsed.targetIsCustom || isCompletedWeek ? storedTarget : fallback.target,
      dailyHoursTarget: parsed.hoursTargetIsCustom || isCompletedWeek ? storedHoursTarget : fallback.dailyHoursTarget,
      targetSnapshot: toNumber(parsed.targetSnapshot),
      targetSnapshotMode: parsed.targetSnapshotMode || "",
      targetIsCustom: parsed.targetIsCustom === true,
      hoursTargetIsCustom: parsed.hoursTargetIsCustom === true,
      workDays
    };
  } catch (error) {
    console.warn("Unable to read weekly target settings:", error);
    return fallback;
  }
}

function writeTargetSettingsCache(startIso, settings) {
  localStorage.setItem(targetStorageKey(startIso), JSON.stringify(settings));
}

async function syncTargetSettingsToDb(startIso, settings) {
  if (!weeklyTargetsTableAvailable || !startIso) return;

  const { error } = await supabaseClient
    .from(WEEKLY_TARGETS_TABLE)
    .upsert(targetSettingsToDbRow(startIso, settings), { onConflict: "week_start" });

  if (error) {
    if (isMissingWeeklyTargetsTable(error)) {
      weeklyTargetsTableAvailable = false;
      console.warn("weekly_targets table is not available yet; target settings are cached locally.");
      return;
    }

    console.error("Unable to save weekly target settings:", error);
  }
}

function saveTargetSettings(startIso, settings) {
  writeTargetSettingsCache(startIso, settings);
  syncTargetSettingsToDb(startIso, settings);
}

async function loadTargetSettingsFromDb(startIso) {
  if (!weeklyTargetsTableAvailable || !startIso) return readTargetSettings(startIso);

  const { data, error } = await supabaseClient
    .from(WEEKLY_TARGETS_TABLE)
    .select("*")
    .eq("week_start", startIso)
    .maybeSingle();

  if (error) {
    if (isMissingWeeklyTargetsTable(error)) {
      weeklyTargetsTableAvailable = false;
      console.warn("weekly_targets table is not available yet; using local target cache.");
      return readTargetSettings(startIso);
    }

    console.error("Unable to load weekly target settings:", error);
    return readTargetSettings(startIso);
  }

  if (!data) {
    const settings = readTargetSettings(startIso);
    syncTargetSettingsToDb(startIso, {
      ...readRawTargetSettings(startIso),
      ...settings
    });
    return settings;
  }

  const settings = targetSettingsFromDbRow(data);
  writeTargetSettingsCache(startIso, settings);
  return readTargetSettings(startIso);
}

function updateTargetSettings(startIso, updates) {
  const current = readRawTargetSettings(startIso);
  saveTargetSettings(startIso, {
    ...current,
    ...updates
  });
}

function readRawTargetSettings(startIso) {
  try {
    const raw = localStorage.getItem(targetStorageKey(startIso));
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn("Unable to read raw weekly target settings:", error);
    return {};
  }
}

function syncStoredTargetWithDefault(startIso, previousDefault, nextDefault) {
  if (!startIso) return;

  try {
    const raw = localStorage.getItem(targetStorageKey(startIso));
    if (!raw) return;

    const parsed = JSON.parse(raw);
    const storedTarget = Number(parsed.target);
    const oldDefault = Number(previousDefault);

    if (!Number.isFinite(storedTarget) || !Number.isFinite(oldDefault)) return;
    if (parsed.targetIsCustom === true && Math.round(storedTarget) !== Math.round(oldDefault)) return;

    const nextSettings = {
      ...parsed,
      target: nextDefault,
      targetIsCustom: false
    };
    saveTargetSettings(startIso, nextSettings);
  } catch (error) {
    console.warn("Unable to sync weekly target default:", error);
  }
}

function getCurrentTargetSettings(customFlags = {}) {
  if (!currentWeekRange) {
    currentWeekRange = getSelectedWeekRange();
  }

  const targetInput = el(ids.weeklyTarget);
  const dailyHoursTargetInput = el(ids.dailyHoursTarget);
  const checkedDays = Array.from(
    document.querySelectorAll("[data-target-workday]:checked")
  ).map((node) => Number(node.dataset.targetWorkday));

  return {
    target: targetInput?.dataset.manualTarget || targetInput?.value || "",
    dailyHoursTarget: parseClockHoursInput(
      dailyHoursTargetInput?.dataset.manualTarget || dailyHoursTargetInput?.value,
      getDailyHoursTargetDefault()
    ),
    workDays: checkedDays
  };
}

function persistCurrentTargetSettings(customFlags = {}) {
  if (!currentWeekRange) return;
  saveTargetSettings(currentWeekRange.startIso, {
    ...readRawTargetSettings(currentWeekRange.startIso),
    ...getCurrentTargetSettings(),
    ...customFlags
  });
}

function shouldUseStoredTargetSnapshot(settings) {
  return currentWeekRange?.endIso < todayIso() && Number(settings.targetSnapshot) > 0;
}

function isCompletedTargetWeek() {
  return currentWeekRange?.endIso < todayIso();
}

function renderTargetWorkdays(settings, weekDates) {
  const container = el(ids.targetWorkdays);
  if (!container) return;

  container.innerHTML = WEEKDAY_LABELS.map((label, index) => {
    const checked = settings.workDays.includes(index) ? "checked" : "";
    const dateLabel = formatDateLabel(weekDates[index]);

    return `
      <label class="target-day-toggle" title="${escapeHtml(dateLabel)}">
        <input type="checkbox" data-target-workday="${index}" ${checked}>
        <span>${label}</span>
      </label>
    `;
  }).join("");

  container.querySelectorAll("[data-target-workday]").forEach((input) => {
    input.addEventListener("change", () => {
      persistCurrentTargetSettings();
      renderWeeklyTarget(currentWeekDays);
    });
  });
}

function buildWeeklyTargetSummary(days, settings, weekDates) {
  const appSettings = getSettings();
  const targetMode = getWeeklyTargetMode(appSettings);
  const dynamicUplift = getDynamicUpliftPercent(appSettings);
  const manualTarget = Number(settings.target || 0);
  const dynamicTarget = calculateDynamicWeeklyTarget(
    currentHistoricalDays,
    currentWeekRange.startIso,
    dynamicUplift,
    manualTarget
  );
  const liveTarget = targetMode === "dynamic" ? dynamicTarget : manualTarget;
  const hasSnapshot = shouldUseStoredTargetSnapshot(settings);
  const completedWeek = isCompletedTargetWeek();
  const target = completedWeek ? (hasSnapshot ? settings.targetSnapshot : manualTarget) : liveTarget;
  const displayMode = hasSnapshot
    ? settings.targetSnapshotMode || targetMode
    : completedWeek ? "manual" : targetMode;
  const earned = days.reduce((sum, day) => sum + Number(day.gross || 0), 0);
  const hoursWorked = days.reduce((sum, day) => sum + Number(day.hours_worked || 0), 0);
  const remaining = Math.max(0, target - earned);
  const plannedWorkDays = settings.workDays.length;
  const dailyHoursTarget = Number(settings.dailyHoursTarget || 0);
  const weeklyHoursTarget = dailyHoursTarget * HOURS_TARGET_DAYS_PER_WEEK;
  const remainingHours = Math.max(0, weeklyHoursTarget - hoursWorked);
  const today = todayIso();
  const progressPercent = target > 0 ? Math.min(100, (earned / target) * 100) : 0;
  const hoursProgressPercent = weeklyHoursTarget > 0 ? Math.min(100, (hoursWorked / weeklyHoursTarget) * 100) : 0;
  const workedDates = new Set(days.map((day) => day.date).filter(Boolean));

  const remainingWorkDates = weekDates.filter((dateString, index) => {
    if (!settings.workDays.includes(index)) return false;
    if (dateString < today) return false;
    if (workedDates.has(dateString)) return false;
    return true;
  });

  const todayEarned = days
    .filter((day) => day.date === today)
    .reduce((sum, day) => sum + Number(day.gross || 0), 0);
  const todayIndex = weekDates.indexOf(today);
  const todayHoursWorked = days
    .filter((day) => day.date === today)
    .reduce((sum, day) => sum + Number(day.hours_worked || 0), 0);
  const remainingWorkDays = remainingWorkDates.length;
  const remainingHourWorkDates = weekDates.filter((dateString, index) => {
    if (!settings.workDays.includes(index)) return false;
    if (dateString < today) return false;
    return true;
  });
  const futureHourWorkDates = remainingHourWorkDates.filter((dateString) => dateString > today);
  const hasTodayHourTarget = todayIndex >= 0 && settings.workDays.includes(todayIndex);
  const hourTargetsBeforeTodayWork = distributeHoursByWeight(
    remainingHours + todayHoursWorked,
    remainingHourWorkDates
  );
  const currentDayRequiredHours = hasTodayHourTarget
    ? hourTargetsBeforeTodayWork.get(today) || 0
    : 0;
  const todayHoursRemaining = Math.max(0, currentDayRequiredHours - todayHoursWorked);
  const futureHoursRemaining = Math.max(0, remainingHours - todayHoursRemaining);
  const futureHourTargetMap = distributeHoursByWeight(futureHoursRemaining, futureHourWorkDates);
  const futureRequiredHoursPerDay = futureHourWorkDates.length > 0
    ? futureHoursRemaining / futureHourWorkDates.length
    : 0;
  const futureHourTargets = weekDates.map((dateString, index) => (
    index === todayIndex && hasTodayHourTarget
      ? todayHoursRemaining
      : futureHourTargetMap.get(dateString) || 0
  ));
  const requiredHoursPerRemainingDay = hasTodayHourTarget
    ? currentDayRequiredHours
    : futureRequiredHoursPerDay;
  const baseDailyTarget = plannedWorkDays > 0 ? target / plannedWorkDays : 0;
  const requiredPerDay = remainingWorkDays > 0 ? remaining / remainingWorkDays : 0;
  const dailyPressure = requiredPerDay - baseDailyTarget;
  const remainingWorkDayIndexes = remainingWorkDates.map((dateString) => weekDates.indexOf(dateString));
  const completedForecasts = calculateWeekdayForecasts(currentHistoricalDays, target, weekDates, settings.workDays);
  const futureForecasts = calculateWeekdayForecasts(
    currentHistoricalDays,
    remaining,
    weekDates,
    remainingWorkDayIndexes
  );
  const hasTodayTarget = todayIndex >= 0 && settings.workDays.includes(todayIndex);
  const todayTargetBase = hasTodayTarget
    ? workedDates.has(today) ? completedForecasts[todayIndex] : futureForecasts[todayIndex]
    : 0;
  const todayTarget = Math.max(0, todayTargetBase - todayEarned);

  let status = "Set a target to track this week.";
  let statusClass = "target-status";
  let progressClass = "target-progress-fill target-progress-fill--empty";
  let paceLabel = "Ready when you are";

  if (target > 0 && plannedWorkDays === 0) {
    status = "Choose at least one planned work day.";
    statusClass = "target-status target-status--warning";
    progressClass = "target-progress-fill target-progress-fill--red";
    paceLabel = "Pick your work days";
  } else if (target > 0 && remaining <= 0) {
    status = `Target reached. You are ${formatMoney(Math.abs(target - earned))} ahead.`;
    statusClass = "target-status target-status--good";
    progressClass = "target-progress-fill target-progress-fill--complete";
    paceLabel = "Nice work";
  } else if (target > 0 && remainingWorkDays === 0) {
    status = `${formatMoney(remaining)} remains after the planned work days.`;
    statusClass = "target-status target-status--warning";
    progressClass = "target-progress-fill target-progress-fill--red";
    paceLabel = "Review the plan";
  } else if (target > 0) {
    const paceTolerance = Math.max(10, baseDailyTarget * 0.08);
    const targetPhrase = todayTarget > 0
      ? `${formatMoney(todayTarget)} keeps today moving.`
      : `${formatMoney(requiredPerDay)} average per remaining work day keeps it reachable.`;

    if (dailyPressure > paceTolerance) {
      status = targetPhrase;
      statusClass = "target-status target-status--warning";
      progressClass = "target-progress-fill target-progress-fill--red";
      paceLabel = "A steady push from here";
    } else if (dailyPressure > 0) {
      status = targetPhrase;
      statusClass = "target-status target-status--caution";
      progressClass = "target-progress-fill target-progress-fill--amber";
      paceLabel = "Within reach";
    } else {
      status = targetPhrase;
      statusClass = "target-status target-status--good";
      progressClass = "target-progress-fill target-progress-fill--green";
      paceLabel = "Nicely on track";
    }
  }

  return {
    target,
    earned,
    hoursWorked,
    remaining,
    dailyHoursTarget,
    weeklyHoursTarget,
    remainingHours,
    todayHoursWorked,
    todayHoursRemaining,
    todayEarned,
    hasTodayTarget,
    futureHourTargets,
    requiredHoursPerRemainingDay,
    plannedWorkDays,
    remainingWorkDays,
    remainingWorkDates,
    requiredPerDay,
    todayTarget,
    completedForecasts,
    futureForecasts,
    baseDailyTarget,
    dailyPressure,
    progressPercent,
    hoursProgressPercent,
    progressClass,
    paceLabel,
    targetMode: displayMode,
    liveTargetMode: targetMode,
    liveTarget,
    dynamicUplift,
    dynamicTarget,
    dailyTargetLabel: hasTodayTarget ? "Today Remaining" : "Daily Target",
    status,
    statusClass
  };
}

function buildDayTotals(days) {
  return days.reduce((totals, day) => {
    const date = day.date;
    if (!date) return totals;

    totals[date] = (totals[date] || 0) + Number(day.gross || 0);
    return totals;
  }, {});
}

function buildDayHourTotals(days) {
  return days.reduce((totals, day) => {
    const date = day.date;
    if (!date) return totals;

    totals[date] = (totals[date] || 0) + Number(day.hours_worked || 0);
    return totals;
  }, {});
}

function calculateDynamicWeeklyTarget(days, startIso, upliftPercent, fallbackTarget = 0) {
  const weekTotals = new Map();

  days.forEach((day) => {
    if (!day.date || day.date >= startIso) return;

    const weekStart = dateToIso(startOfWeek(parseLocalDate(day.date)));
    weekTotals.set(weekStart, (weekTotals.get(weekStart) || 0) + Number(day.gross || 0));
  });

  const previousTotals = [];
  for (let i = 1; i <= 4; i += 1) {
    const weekStart = addDaysIso(startIso, i * -7);
    const total = weekTotals.get(weekStart);
    if (Number.isFinite(total) && total > 0) {
      previousTotals.push(total);
    }
  }

  if (!previousTotals.length) {
    return Number(fallbackTarget || 0) * (1 + (upliftPercent / 100));
  }

  const average = previousTotals.reduce((sum, total) => sum + total, 0) / previousTotals.length;
  const baseTarget = Math.max(average, Number(fallbackTarget || 0));
  return baseTarget * (1 + (upliftPercent / 100));
}

function calculateWeekdayForecasts(historicalDays, amount, weekDates, workDays) {
  const totalsByDate = buildDayTotals(historicalDays);
  const weekdayTotals = Array.from({ length: 7 }, () => []);

  Object.entries(totalsByDate).forEach(([dateString, total]) => {
    if (total > 0) {
      weekdayTotals[getWeekdayIndex(dateString)].push(total);
    }
  });

  const weekdayAverages = weekdayTotals.map((totals) => {
    if (!totals.length) return 0;
    return totals.reduce((sum, total) => sum + total, 0) / totals.length;
  });

  const plannedCount = workDays.length || 1;
  const flatForecast = amount > 0 ? amount / plannedCount : 0;
  const plannedHistoricalAverages = weekdayAverages.filter((value, index) => (
    workDays.includes(index) && value > 0
  ));
  const averageHistoricalWeekday = plannedHistoricalAverages.length
    ? plannedHistoricalAverages.reduce((sum, value) => sum + value, 0) / plannedHistoricalAverages.length
    : 0;
  const plannedWeights = weekDates.map((_, index) => {
    if (!workDays.includes(index)) return 0;
    if (averageHistoricalWeekday > 0 && weekdayAverages[index] > 0) {
      return (weekdayAverages[index] / averageHistoricalWeekday) * WEEKDAY_FORECAST_WEIGHTS[index];
    }
    return WEEKDAY_FORECAST_WEIGHTS[index];
  });

  if (workDays.includes(4) && workDays.includes(5) && plannedWeights[5] <= plannedWeights[4]) {
    plannedWeights[5] = plannedWeights[4] * (WEEKDAY_FORECAST_WEIGHTS[5] / WEEKDAY_FORECAST_WEIGHTS[4]);
  }

  const plannedWeightTotal = plannedWeights.reduce((sum, value) => sum + value, 0);

  return weekDates.map((_, index) => {
    if (!workDays.includes(index)) return 0;
    if (plannedWeightTotal <= 0 || amount <= 0) return flatForecast;
    return (plannedWeights[index] / plannedWeightTotal) * amount;
  });
}

function getWeekDayState(dateString, index, settings, dayTotals, today, completedForecast, futureForecast) {
  const isPlanned = settings.workDays.includes(index);
  const total = dayTotals[dateString] || 0;

  if (!isPlanned && total <= 0) {
    return {
      className: "target-week-day target-week-day--rest",
      amount: "OFF"
    };
  }

  if (dateString >= today && total <= 0) {
    return {
      className: "target-week-day target-week-day--future",
      amount: isPlanned ? `~${formatCompactMoney(futureForecast)}` : "OFF"
    };
  }

  if (total >= completedForecast) {
    return {
      className: "target-week-day target-week-day--hit",
      amount: formatCompactMoney(total)
    };
  }

  if (total >= completedForecast * 0.85) {
    return {
      className: "target-week-day target-week-day--under",
      amount: formatCompactMoney(total)
    };
  }

  return {
    className: "target-week-day target-week-day--missed",
    amount: formatCompactMoney(total)
  };
}

function getHourDayState(dateString, index, settings, hourTotals, today, dailyHoursTarget, futureHoursTarget) {
  const isPlanned = settings.workDays.includes(index);
  const hours = hourTotals[dateString] || 0;
  const safeFutureHoursTarget = Math.max(0, Number(futureHoursTarget || 0));

  if (!isPlanned && hours <= 0) {
    return {
      className: "target-week-day target-week-day--rest",
      amount: "OFF"
    };
  }

  if (dateString >= today && hours <= 0) {
    return {
      className: "target-week-day target-week-day--future",
      amount: isPlanned ? `~${formatClockHours(safeFutureHoursTarget)}h` : "OFF"
    };
  }

  if (hours >= dailyHoursTarget) {
    return {
      className: "target-week-day target-week-day--hit",
      amount: `${formatClockHours(hours)}h`
    };
  }

  if (hours >= dailyHoursTarget * 0.85) {
    return {
      className: "target-week-day target-week-day--under",
      amount: `${formatClockHours(hours)}h`
    };
  }

  return {
    className: "target-week-day target-week-day--missed",
    amount: `${formatClockHours(hours)}h`
  };
}

function renderTargetWeekStrip(days, settings, weekDates, summary) {
  const container = el(ids.targetWeekStrip);
  if (!container) return;

  const today = todayIso();
  const dayTotals = buildDayTotals(days);
  const hourTotals = buildDayHourTotals(days);

  container.innerHTML = `
    <div class="target-week-strip-row">
      <div class="target-week-days">
        ${weekDates.map((dateString, index) => {
          const state = getWeekDayState(
            dateString,
            index,
            settings,
            dayTotals,
            today,
            summary.completedForecasts[index],
            summary.futureForecasts[index]
          );

          return `
            <div class="${state.className}">
              <strong>${state.amount}</strong>
            </div>
          `;
        }).join("")}
      </div>
    </div>
    <div class="target-week-strip-row target-week-strip-row--hours">
      <div class="target-week-days target-week-days--hours">
      ${weekDates.map((dateString, index) => {
        const state = getHourDayState(
          dateString,
          index,
          settings,
          hourTotals,
          today,
          summary.dailyHoursTarget,
          summary.futureHourTargets[index]
        );

        return `
          <div class="${state.className}">
            <strong>${state.amount}</strong>
          </div>
        `;
      }).join("")}
      </div>
    </div>
  `;
}

function renderWeeklyTarget(days) {
  if (!currentWeekRange) return;

  const summaryNode = el(ids.targetSummary);
  const statusNode = el(ids.targetStatus);
  const targetInput = el(ids.weeklyTarget);
  const dailyHoursTargetInput = el(ids.dailyHoursTarget);
  if (!summaryNode || !statusNode || !targetInput || !dailyHoursTargetInput) return;

  const weekDates = getWeekDates(currentWeekRange.startIso);
  const settings = getCurrentTargetSettings();
  const summary = buildWeeklyTargetSummary(days, settings, weekDates);

  if (summary.targetMode === "dynamic") {
    targetInput.type = "text";
    targetInput.disabled = true;
    targetInput.value = formatMoney(summary.target);
  } else {
    targetInput.type = "number";
    targetInput.disabled = false;
    targetInput.value = targetInput.dataset.manualTarget || settings.target;
  }

  dailyHoursTargetInput.value = dailyHoursTargetInput.dataset.manualTarget || formatClockHours(settings.dailyHoursTarget);

  if (isCompletedTargetWeek() && !shouldUseStoredTargetSnapshot(settings) && summary.target > 0) {
    updateTargetSettings(currentWeekRange.startIso, {
      targetSnapshot: summary.target,
      targetSnapshotMode: summary.targetMode
    });
  } else if (summary.liveTarget > 0 && !isCompletedTargetWeek()) {
    updateTargetSettings(currentWeekRange.startIso, {
      targetSnapshot: summary.liveTarget,
      targetSnapshotMode: summary.liveTargetMode
    });
  }

  renderTargetWeekStrip(days, settings, weekDates, summary);

  statusNode.textContent = summary.status;
  statusNode.className = summary.statusClass;

  summaryNode.innerHTML = `
    <div class="target-progress-panel">
      <div class="target-progress-meta">
        <span>${escapeHtml(summary.paceLabel)}</span>
        <strong>${formatNumber(summary.progressPercent, 0)}%</strong>
      </div>
      <div class="target-progress-track" aria-label="Weekly target progress">
        <div class="${summary.progressClass}" style="width: ${summary.progressPercent}%"></div>
      </div>
      <div class="target-progress-sub">
        ${formatMoney(summary.earned)} of ${formatMoney(summary.target)} target
      </div>
    </div>
    <div class="target-progress-panel target-progress-panel--hours">
      <div class="target-progress-meta">
        <span>Stay in the game</span>
        <strong>${formatNumber(summary.hoursProgressPercent, 0)}%</strong>
      </div>
      <div class="target-progress-track" aria-label="Weekly hours progress">
        <div class="target-progress-fill target-progress-fill--green" style="width: ${summary.hoursProgressPercent}%"></div>
      </div>
      <div class="target-progress-sub">
        ${formatClockHours(summary.hoursWorked)} of ${formatClockHours(summary.weeklyHoursTarget)} hours target
      </div>
    </div>
    <div class="target-summary-card target-summary-card--primary">
      <div class="summary-label">${escapeHtml(summary.dailyTargetLabel)}</div>
      <div class="summary-value">${formatMoney(summary.hasTodayTarget ? summary.todayTarget : summary.requiredPerDay)}</div>
      ${summary.hasTodayTarget ? `<div class="summary-sub">${formatMoney(summary.todayEarned)} earned today</div>` : ""}
    </div>
    <div class="target-summary-card target-summary-card--primary">
      <div class="summary-label">Hours Remaining</div>
      <div class="summary-value">${formatClockHours(summary.todayHoursRemaining)}</div>
      <div class="summary-sub">${formatClockHours(summary.todayHoursWorked)} worked today</div>
    </div>
    <div class="target-summary-card">
      <div class="summary-label">Earned</div>
      <div class="summary-value">${formatMoney(summary.earned)}</div>
    </div>
    <div class="target-summary-card">
      <div class="summary-label">Remaining</div>
      <div class="summary-value">${formatMoney(summary.remaining)}</div>
    </div>
    <div class="target-summary-card">
      <div class="summary-label">Hours Left</div>
      <div class="summary-value">${formatClockHours(summary.remainingHours)}</div>
    </div>
    <div class="target-summary-card">
      <div class="summary-label">Work Days Left</div>
      <div class="summary-value">${formatInt(summary.remainingWorkDays)}</div>
    </div>
    <div class="target-summary-card">
      <div class="summary-label">Weekly Target</div>
      <div class="summary-value">${formatMoney(summary.target)}</div>
      <div class="summary-sub">${summary.targetMode === "dynamic" ? "Dynamic" : "Manual"}</div>
    </div>
  `;
}

function initialiseWeeklyTarget(range) {
  const targetInput = el(ids.weeklyTarget);
  const dailyHoursTargetInput = el(ids.dailyHoursTarget);
  if (!targetInput || !dailyHoursTargetInput) return;

  const weekDates = getWeekDates(range.startIso);
  const settings = readTargetSettings(range.startIso);

  targetInput.value = settings.target;
  targetInput.dataset.manualTarget = settings.target;
  dailyHoursTargetInput.value = formatClockHours(settings.dailyHoursTarget);
  dailyHoursTargetInput.dataset.manualTarget = formatClockHours(settings.dailyHoursTarget);
  renderTargetWorkdays(settings, weekDates);

  targetInput.oninput = () => {
    targetInput.dataset.manualTarget = targetInput.value;
    persistCurrentTargetSettings({ targetIsCustom: true });
    renderWeeklyTarget(currentWeekDays);
  };

  dailyHoursTargetInput.oninput = () => {
    dailyHoursTargetInput.dataset.manualTarget = dailyHoursTargetInput.value;
    persistCurrentTargetSettings({ hoursTargetIsCustom: true });
    renderWeeklyTarget(currentWeekDays);
  };

  renderWeeklyTarget(currentWeekDays);
}

async function moveSelectedWeek(delta) {
  if (delta > 0 && weekOffset >= 0) return;

  weekOffset += delta;
  await loadWeekDays();
}

function updateWeekTitle(startIso, endIso) {
  const node = el(ids.weekTitle);
  if (!node) return;

  const start = parseLocalDate(startIso);
  const end = parseLocalDate(endIso);

  node.textContent = `${start.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short"
  })} - ${end.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  })}`;
}

function getWeekTitleParts(startIso, endIso, days = []) {
  const start = parseLocalDate(startIso);
  const end = parseLocalDate(endIso);
  const rangeText = `${start.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short"
  })} - ${end.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short"
  })}`;

  if (weekOffset === 0) {
    return {
      date: "Week to Date",
      outcome: "",
      status: "current"
    };
  }

  const settings = readTargetSettings(startIso);
  const earned = days.reduce((sum, day) => sum + Number(day.gross || 0), 0);
  const target = Number(settings.targetSnapshot || settings.target || 0);

  if (target <= 0) {
    return {
      date: rangeText,
      outcome: "No target set",
      status: "neutral"
    };
  }

  const difference = earned - target;
  const tolerance = Math.max(10, target * 0.03);

  if (difference >= tolerance) {
    return {
      date: rangeText,
      outcome: `${formatMoney(difference)} over target`,
      status: "over"
    };
  }

  if (Math.abs(difference) < tolerance) {
    return {
      date: rangeText,
      outcome: "Target met",
      status: "met"
    };
  }

  return {
    date: rangeText,
    outcome: `${formatMoney(Math.abs(difference))} short`,
    status: "short"
  };
}

function renderWeekTitle(startIso, endIso, days = []) {
  const node = el(ids.weekTitle);
  if (!node) return;

  const title = getWeekTitleParts(startIso, endIso, days);
  node.className = `week-title week-title--${title.status}`;
  node.innerHTML = `
    <span class="week-title__date">${escapeHtml(title.date)}</span>
    ${title.outcome ? `<span class="week-title__outcome">${escapeHtml(title.outcome)}</span>` : ""}
  `;
}

function updateWeekNavState() {
  const atCurrentWeek = weekOffset >= 0;
  const onCurrentWeek = weekOffset === 0;

  [el(ids.nextWeek), el(ids.targetNextWeek)].forEach((button) => {
    if (button) button.disabled = atCurrentWeek;
  });

  const thisWeekButton = el(ids.thisWeek);
  if (thisWeekButton) thisWeekButton.disabled = onCurrentWeek;
}

function populateWorkDateOptions() {
  const select = el(ids.date);
  if (!select) return;

  const today = new Date();
  const todayString = dateToIso(today);
  const currentValue = select.value || todayString;

  select.innerHTML = "";

  for (let i = 0; i < WORK_DATE_OPTIONS_DAYS; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);

    const iso = dateToIso(d);
    const option = document.createElement("option");
    option.value = iso;
    option.textContent = formatWorkDateOptionLabel(iso, todayString);
    select.appendChild(option);
  }

  const values = Array.from(select.options).map((opt) => opt.value);
  select.value = values.includes(currentValue) ? currentValue : todayString;
}

function clearDayForm() {
  const gross = el(ids.gross);
  const miles = el(ids.miles);
  const hours = el(ids.hours);
  const minutes = el(ids.minutes);
  const date = el(ids.date);

  if (gross) gross.value = "";
  if (miles) miles.value = "";
  if (hours) hours.value = "";
  if (minutes) minutes.value = "0";
  if (date) date.value = todayIso();
}

function readWorkedHoursInput() {
  const hours = toNumber(el(ids.hours)?.value) ?? 0;
  const minutes = toNumber(el(ids.minutes)?.value) ?? 0;
  return hours + (minutes / 60);
}

async function getSavedDayTotalsForDate(dateString) {
  if (!dateString) {
    return {
      gross: 0,
      businessMiles: 0
    };
  }

  const { data, error } = await supabaseClient
    .from("days")
    .select("gross,business_miles")
    .eq("date", dateString);

  if (error) {
    console.error("Error loading saved session totals:", error);
    throw new Error("Unable to check existing sessions for this date.");
  }

  return (data || []).reduce((totals, day) => ({
    gross: totals.gross + Number(day.gross || 0),
    businessMiles: totals.businessMiles + Number(day.business_miles || 0)
  }), {
    gross: 0,
    businessMiles: 0
  });
}

async function buildDayPayload() {
  const date = el(ids.date)?.value?.trim() || "";
  const uberDayTotal = toNumber(el(ids.gross)?.value) ?? 0;
  const savedTotals = await getSavedDayTotalsForDate(date);
  const existingGross = savedTotals.gross;
  const sessionGross = Math.max(0, uberDayTotal - existingGross);
  const businessMilesDayTotal = toNumber(el(ids.miles)?.value) ?? 0;
  const existingMiles = savedTotals.businessMiles;
  const sessionMiles = Math.max(0, businessMilesDayTotal - existingMiles);

  return {
    date,
    end_time: null,
    hours_worked: readWorkedHoursInput(),
    gross: sessionGross,
    uber_day_total: uberDayTotal,
    existing_day_gross: existingGross,
    business_miles_day_total: businessMilesDayTotal,
    existing_day_miles: existingMiles,
    trips: 0,
    business_miles: sessionMiles
  };
}

function validateDay(payload) {
  if (!payload.date) return "Please select a work date.";
  if (payload.hours_worked < 0) return "Hours worked must be zero or greater.";
  if (payload.uber_day_total < 0) return "Uber day total must be zero or greater.";
  if (payload.uber_day_total < payload.existing_day_gross) {
    return `Uber day total is below saved sessions for this date (${formatMoney(payload.existing_day_gross)}).`;
  }
  if (payload.business_miles_day_total < 0) return "Business miles day total must be zero or greater.";
  if (payload.business_miles_day_total < payload.existing_day_miles) {
    return `Business miles day total is below saved sessions for this date (${formatNumber(payload.existing_day_miles, 1)}).`;
  }
  if (payload.business_miles < 0) return "Business miles must be zero or greater.";
  return null;
}

function getLitresPerMile(mpg) {
  if (!Number.isFinite(mpg) || mpg <= 0) {
    return LITRES_PER_UK_GALLON / getMpg();
  }
  return LITRES_PER_UK_GALLON / mpg;
}

function calculateEstimatedFuelCost(miles, pricePerLitre, mpg) {
  const safeMiles = Number(miles || 0);
  const safePricePerLitre =
    Number.isFinite(pricePerLitre) && pricePerLitre > 0
      ? pricePerLitre
      : getFallbackFuelPrice();

  const litresPerMile = getLitresPerMile(mpg);
  return safeMiles * litresPerMile * safePricePerLitre;
}

function calculateEstimatedVehicleEnergyCost(miles, pricePerLitre, settings = getSettings()) {
  const safeMiles = Number(miles || 0);

  if (getFuelType(settings) === "ev") {
    return 0;
  }

  return calculateEstimatedFuelCost(safeMiles, pricePerLitre, getMpg(settings));
}

function vehicleEnergyLabel(settings = getSettings()) {
  return getFuelType(settings) === "ev" ? "Charging" : "Fuel Est.";
}

function formatPercent(value, dp = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(dp)}%`;
}

function getProfitSegmentPercent(value, denominator) {
  const safeDenominator = Number(denominator || 0);
  if (safeDenominator <= 0) return 0;
  return Math.max(0, (Number(value || 0) / safeDenominator) * 100);
}

function buildSessionMetrics(day, pricePerLitre, settings = getSettings()) {
  const gross = Number(day.gross || 0);
  const miles = Number(day.business_miles || 0);

  const estimatedFuel = calculateEstimatedVehicleEnergyCost(miles, pricePerLitre, settings);
  const insurance = getDailyInsuranceEstimate(settings);
  const tax = Math.max(0, gross * getTaxRate(settings));
  const trueRetained = gross - estimatedFuel - tax - insurance;

  return {
    gross,
    miles,
    estimatedFuel,
    insurance,
    tax,
    trueRetained,
    ratePerMile: miles > 0 ? gross / miles : 0
  };
}

function getEfficiencyLabel(totals, pricePerLitre, settings, chargingTotals) {
  const fuelType = getFuelType(settings);
  const miles = Number(totals.miles || 0);

  if (fuelType === "ev") {
    const kwh = Number(chargingTotals?.kwh || 0);
    if (miles > 0 && kwh > 0) {
      return `${formatNumber(miles / kwh, 1)} mi/kWh`;
    }
    return `${formatNumber(getEvEfficiencyMilesPerKwh(settings), 1)} mi/kWh`;
  }

  const safePrice = Number(pricePerLitre || 0);
  const fuelCost = Number(totals.estimatedFuel || 0);
  if (miles > 0 && fuelCost > 0 && safePrice > 0) {
    const litres = fuelCost / safePrice;
    const mpg = litres > 0 ? miles / (litres / LITRES_PER_UK_GALLON) : getMpg(settings);
    return `${formatNumber(mpg, 1)} mpg`;
  }

  return `${formatNumber(getMpg(settings), 1)} mpg`;
}

function renderWeekSummary(days, pricePerLitre, settings = getSettings(), chargingTotals = null, expenses = []) {
  const container = el(ids.weekSummary);
  if (!container) return;
  container.className = "profit-summary";
  const energyLabel = vehicleEnergyLabel(settings);
  const isEv = getFuelType(settings) === "ev";

  const totals = days.reduce((acc, day) => {
    const m = buildSessionMetrics(day, pricePerLitre, settings);
    acc.sessions += 1;
    acc.gross += m.gross;
    acc.miles += m.miles;
    acc.hours += Number(day.hours_worked || 0);
    acc.estimatedFuel += m.estimatedFuel;
    acc.insurance += m.insurance;
    acc.tax += m.tax;
    acc.trueRetained += m.trueRetained;
    return acc;
  }, {
    sessions: 0,
    gross: 0,
    miles: 0,
    hours: 0,
    estimatedFuel: 0,
    insurance: 0,
    tax: 0,
    trueRetained: 0
  });

  if (isEv && chargingTotals) {
    totals.estimatedFuel = chargingTotals.cost;
    totals.trueRetained -= chargingTotals.cost;
  }

  totals.expenses = (expenses || []).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  totals.trueRetained -= totals.expenses;

  const deductions = [
    { label: energyLabel, value: totals.estimatedFuel, className: "profit-bar__segment--fuel" },
    { label: "Insurance", value: totals.insurance, className: "profit-bar__segment--insurance" },
    { label: "Expenses", value: totals.expenses, className: "profit-bar__segment--expenses" },
    { label: "Tax", value: totals.tax, className: "profit-bar__segment--tax" }
  ];
  const retained = Math.max(0, totals.trueRetained);
  const deductionTotal = deductions.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const barTotal = Math.max(totals.gross, deductionTotal + retained, 1);
  const grossHourly = totals.hours > 0 ? totals.gross / totals.hours : 0;
  const netHourly = totals.hours > 0 ? totals.trueRetained / totals.hours : 0;
  const costPerMile = totals.miles > 0 ? deductionTotal / totals.miles : 0;
  const grossPerMile = totals.miles > 0 ? totals.gross / totals.miles : 0;
  const retainedPercent = totals.gross > 0 ? (totals.trueRetained / totals.gross) * 100 : 0;
  const efficiencyLabel = getEfficiencyLabel(totals, pricePerLitre, settings, chargingTotals);
  const netHourlyClass = netHourly >= 0 ? "" : " profit-metric--warning";

  container.innerHTML = `
    <div class="profit-summary__header">
      <div>
        <div class="profit-summary__label">Net Profit</div>
        <div class="profit-summary__value">${formatMoney(totals.trueRetained)}</div>
      </div>
      <div class="profit-summary__meta">
        <span>${formatPercent(retainedPercent, 0)} retained</span>
        <strong>${formatMoney(totals.gross)} gross</strong>
      </div>
    </div>

    <div class="profit-bar" aria-label="Weekly gross breakdown">
      ${deductions.map((item) => `
        <div
          class="profit-bar__segment ${item.className}"
          style="width: ${getProfitSegmentPercent(item.value, barTotal)}%"
          title="${escapeHtml(item.label)}: ${escapeHtml(formatMoney(item.value))}"
        ></div>
      `).join("")}
      <div
        class="profit-bar__segment profit-bar__segment--retained"
        style="width: ${getProfitSegmentPercent(retained, barTotal)}%"
        title="True retained: ${escapeHtml(formatMoney(totals.trueRetained))}"
      ></div>
    </div>

    <div class="profit-legend">
      ${deductions.map((item) => `
        <div class="profit-legend__item">
          <span class="profit-legend__swatch ${item.className}"></span>
          <span>${escapeHtml(item.label)}</span>
          <strong>${formatMoney(item.value)}</strong>
        </div>
      `).join("")}
      <div class="profit-legend__item">
        <span class="profit-legend__swatch profit-bar__segment--retained"></span>
        <span>Net</span>
        <strong>${formatMoney(totals.trueRetained)}</strong>
      </div>
    </div>

    <div class="profit-metrics">
      <div class="profit-metric${netHourlyClass}">
        <span>Net/hr</span>
        <strong>${formatMoney(netHourly)}</strong>
      </div>
      <div class="profit-metric">
        <span>Gross/hr</span>
        <strong>${formatMoney(grossHourly)}</strong>
      </div>
      <div class="profit-metric">
        <span>Hours</span>
        <strong>${formatClockHours(totals.hours)}</strong>
      </div>
      <div class="profit-metric">
        <span>Miles</span>
        <strong>${formatNumber(totals.miles, 1)}</strong>
      </div>
      <div class="profit-metric">
        <span>Gross/mi</span>
        <strong>${formatMoney(grossPerMile)}</strong>
      </div>
      <div class="profit-metric">
        <span>Cost/mi</span>
        <strong>${formatMoney(costPerMile)}</strong>
      </div>
      <div class="profit-metric">
        <span>Efficiency</span>
        <strong>${escapeHtml(efficiencyLabel)}</strong>
      </div>
    </div>
  `;
}

function renderDayHistory(days, pricePerLitre, settings = getSettings()) {
  const container = el(ids.list);
  if (!container) return;
  const energyLabel = vehicleEnergyLabel(settings);

  if (!Array.isArray(days) || days.length === 0) {
    container.innerHTML = `<div class="history-empty">No worked sessions in this week.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="history-grid">
      ${days.map((day) => {
        const m = buildSessionMetrics(day, pricePerLitre, settings);
        const hours = Number(day.hours_worked || 0);

        return `
          <div class="history-card">
            <div class="history-card__header">
              <div>
                <div class="history-card__title">${escapeHtml(formatDateLabel(day.date))}</div>
              </div>
              <div class="history-card__actions">
                <div class="history-card__pill">Session</div>
                <button
                  type="button"
                  class="history-card__delete"
                  data-delete-day="${escapeHtml(day.id)}"
                  aria-label="Delete session for ${escapeHtml(formatDateLabel(day.date))}"
                >
                  Delete
                </button>
              </div>
            </div>

            <div class="history-card__grid history-card__grid--finance">
              <div class="history-item history-item--third">
                <span class="history-item__label">Gross</span>
                <span class="history-item__value history-item__value--strong">${escapeHtml(formatMoney(m.gross))}</span>
              </div>

              <div class="history-item history-item--third">
                <span class="history-item__label">Miles</span>
                <span class="history-item__value">${escapeHtml(formatNumber(m.miles, 1))}</span>
              </div>

              <div class="history-item history-item--third">
                <span class="history-item__label">Hours</span>
                <span class="history-item__value">${escapeHtml(formatClockHours(hours))}</span>
              </div>

              <div class="history-item history-item--third">
                <span class="history-item__label">Per Hour</span>
                <span class="history-item__value">${escapeHtml(formatMoney(hours > 0 ? m.gross / hours : 0))}</span>
              </div>

              <div class="history-item history-item--half">
                <span class="history-item__label">${energyLabel}</span>
                <span class="history-item__value">${getFuelType(settings) === "ev" ? "Weekly" : escapeHtml(formatMoney(m.estimatedFuel))}</span>
              </div>

              <div class="history-item history-item--half">
                <span class="history-item__label">Tax</span>
                <span class="history-item__value">${escapeHtml(formatMoney(m.tax))}</span>
              </div>

              <div class="history-item history-item--half">
                <span class="history-item__label">True Retained</span>
                <span class="history-item__value history-item__value--strong">${escapeHtml(formatMoney(m.trueRetained))}</span>
              </div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function deleteDay(dayId, button) {
  const day = currentWeekDays.find((item) => String(item.id) === String(dayId));
  const label = day ? `${formatDateLabel(day.date)} (${formatMoney(day.gross)})` : "this session";

  if (!window.confirm(`Delete ${label}?`)) return;

  try {
    if (button) button.disabled = true;
    showStatus("Deleting session...", "info", false);

    const { error } = await supabaseClient
      .from("days")
      .delete()
      .eq("id", dayId);

    if (error) {
      console.error("Error deleting session:", error);
      showStatus(
        `Failed to delete session: ${error.message || "Unknown database error"}`,
        "error",
        false
      );
      return;
    }

    showStatus("Session deleted.", "success");
    await loadWeekDays();
    await loadMonthSummary();
  } catch (err) {
    console.error("Unexpected session delete error:", err);
    showStatus("Unexpected error while deleting session.", "error", false);
  } finally {
    if (button) button.disabled = false;
  }
}

async function fetchWeekDays() {
  const range = getSelectedWeekRange();
  const { startIso, endIso } = range;
  currentWeekRange = range;
  updateWeekNavState();
  await loadTargetSettingsFromDb(startIso);
  initialiseWeeklyTarget(range);

  const settings = getSettings();
  const historyStartIso = addDaysIso(startIso, -56);
  const fuelPricePromise = getFuelType(settings) === "ev"
    ? Promise.resolve(getFallbackFuelPrice(settings))
    : getRollingFuelPricePerLitre(3, getFallbackFuelPrice(settings));
  const chargingTotalsPromise = getFuelType(settings) === "ev"
    ? getChargingTotalsForRange(startIso, endIso)
    : Promise.resolve(null);

  const [
    { data: days, error },
    { data: historicalDays, error: historicalError },
    { data: expenses, error: expensesError },
    pricePerLitre,
    chargingTotals
  ] = await Promise.all([
    supabaseClient
      .from("days")
      .select("*")
      .gte("date", startIso)
      .lte("date", endIso)
      .order("date", { ascending: false })
      .order("end_time", { ascending: false }),
    supabaseClient
      .from("days")
      .select("*")
      .gte("date", historyStartIso)
      .lt("date", startIso)
      .order("date", { ascending: false }),
    supabaseClient
      .from("expenses")
      .select("amount")
      .gte("date", startIso)
      .lte("date", endIso),
    fuelPricePromise,
    chargingTotalsPromise
  ]);

  if (historicalError) {
    console.warn("Unable to load historical weekday forecast data:", historicalError);
  }

  if (expensesError) {
    console.warn("Unable to load weekly expenses for profitability summary:", expensesError);
  }

  if (error) {
    console.error("Error loading week sessions:", error);
    showStatus("Unable to load worked sessions.", "error", false);
    currentWeekDays = [];
    currentHistoricalDays = [];
    updateWeekTitle(startIso, endIso);
    renderWeeklyTarget(currentWeekDays);
    renderWeekSummary([], pricePerLitre, settings, chargingTotals, []);
    renderDayHistory([], pricePerLitre, settings);
    return [];
  }

  const rows = days || [];
  currentHistoricalDays = historicalDays || [];
  currentWeekDays = rows;
  renderWeekTitle(startIso, endIso, rows);
  renderWeeklyTarget(rows);
  renderWeekSummary(rows, pricePerLitre, settings, chargingTotals, expenses || []);
  renderDayHistory(rows, pricePerLitre, settings);
  return rows;
}

export async function loadWeekDays() {
  return fetchWeekDays();
}

async function handleSettingsUpdated(event) {
  const previousSettings = event.detail?.previousSettings;
  const nextSettings = event.detail?.settings || getSettings();

  if (
    currentWeekRange &&
    previousSettings &&
    getWeeklyTargetMode(nextSettings) === "manual" &&
    getWeeklyTargetDefault(previousSettings) !== getWeeklyTargetDefault(nextSettings)
  ) {
    syncStoredTargetWithDefault(
      currentWeekRange.startIso,
      getWeeklyTargetDefault(previousSettings),
      getWeeklyTargetDefault(nextSettings)
    );
  }

  await loadWeekDays();
}

export async function saveDay() {
  const saveBtn = el(ids.saveBtn);

  try {
    if (saveBtn) saveBtn.disabled = true;

    showStatus("Saving session...", "info", false);

    const payload = await buildDayPayload();
    const validationError = validateDay(payload);

    if (validationError) {
      showStatus(validationError, "error");
      return;
    }

    const {
      uber_day_total,
      existing_day_gross,
      business_miles_day_total,
      existing_day_miles,
      ...supabasePayload
    } = payload;
    console.log("saving session payload:", supabasePayload);

    const { data, error } = await supabaseClient
      .from("days")
      .insert([supabasePayload])
      .select()
      .single();

    if (error) {
      console.error("Error saving session:", error);
      showStatus(
        `Failed to save session: ${error.message || "Unknown database error"}`,
        "error",
        false
      );
      return;
    }

    try {
      const sheetPayload = buildDaySheetPayload(data);
      await sendToGoogleSheets("day", sheetPayload);
      showStatus("Session saved and synced successfully.", "success");
    } catch (syncError) {
      console.error("Session sync failed:", syncError);
      showStatus("Session saved, but Google Sheets sync failed.", "error", false);
    }

    clearDayForm();
    await loadWeekDays();
    await loadMonthSummary();
  } catch (err) {
    console.error("Unexpected session save error:", err);
    showStatus("Unexpected error while saving session.", "error", false);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindDayEvents() {
  el(ids.saveBtn)?.addEventListener("click", saveDay);
  el(ids.list)?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-day]");
    if (!button) return;

    await deleteDay(button.dataset.deleteDay, button);
  });
  window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);

  el(ids.prevWeek)?.addEventListener("click", async () => {
    await moveSelectedWeek(-1);
  });

  el(ids.thisWeek)?.addEventListener("click", async () => {
    weekOffset = 0;
    await loadWeekDays();
  });

  el(ids.nextWeek)?.addEventListener("click", async () => {
    await moveSelectedWeek(1);
  });

  el(ids.targetPrevWeek)?.addEventListener("click", async () => {
    await moveSelectedWeek(-1);
  });

  el(ids.targetNextWeek)?.addEventListener("click", async () => {
    await moveSelectedWeek(1);
  });
}

export function initDays() {
  currentWeekRange = getSelectedWeekRange();
  initialiseWeeklyTarget(currentWeekRange);
  renderWeeklyTarget(currentWeekDays);
  populateWorkDateOptions();
  bindDayEvents();
  loadWeekDays();
}




