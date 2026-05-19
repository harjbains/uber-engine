import { supabaseClient } from "./supabase.js";
import { sendToGoogleSheets, buildDaySheetPayload } from "./googleSheets.js";
import { showStatus } from "./status.js";
import { loadMonthSummary } from "./monthly.js";
import { getRollingFuelPricePerLitre } from "./fuel.js";
import {
  SETTINGS_UPDATED_EVENT,
  getDailyInsuranceEstimate,
  getDynamicUpliftPercent,
  getFallbackFuelPrice,
  getMpg,
  getSettings,
  getTaxRate,
  getWeeklyTargetDefault,
  getWeeklyTargetMode
} from "./settings.js?v=2.2.23";

const ids = {
  date: "day_date",
  gross: "day_gross",
  miles: "day_miles",
  saveBtn: "save_day",
  list: "dayList",
  weekTitle: "week_title",
  weekSummary: "week_summary",
  weeklyTarget: "weekly_target",
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
const TARGET_STORAGE_PREFIX = "uberEngineWeeklyTarget";
const DEFAULT_TARGET_WORKDAYS = [0, 1, 2, 3, 4, 5];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_FORECAST_WEIGHTS = [0.9, 0.95, 1, 1, 1.2, 1.25, 0.75];

let weekOffset = 0;
let currentWeekDays = [];
let currentHistoricalDays = [];
let currentWeekRange = null;

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

function targetStorageKey(startIso) {
  return `${TARGET_STORAGE_PREFIX}:${startIso}`;
}

function readTargetSettings(startIso) {
  const fallback = {
    target: getWeeklyTargetDefault(),
    targetSnapshot: null,
    targetSnapshotMode: "",
    workDays: [...DEFAULT_TARGET_WORKDAYS]
  };

  try {
    const raw = localStorage.getItem(targetStorageKey(startIso));
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    const workDays = Array.isArray(parsed.workDays)
      ? parsed.workDays
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
      : fallback.workDays;

    const storedTarget = parsed.target ?? fallback.target;
    const isCompletedWeek = addDaysIso(startIso, 6) < todayIso();

    return {
      target: parsed.targetIsCustom || isCompletedWeek ? storedTarget : fallback.target,
      targetSnapshot: toNumber(parsed.targetSnapshot),
      targetSnapshotMode: parsed.targetSnapshotMode || "",
      targetIsCustom: parsed.targetIsCustom === true,
      workDays: workDays.length ? [...new Set(workDays)] : fallback.workDays
    };
  } catch (error) {
    console.warn("Unable to read weekly target settings:", error);
    return fallback;
  }
}

function saveTargetSettings(startIso, settings) {
  localStorage.setItem(targetStorageKey(startIso), JSON.stringify(settings));
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
    const key = targetStorageKey(startIso);
    const raw = localStorage.getItem(key);
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
    localStorage.setItem(key, JSON.stringify(nextSettings));
  } catch (error) {
    console.warn("Unable to sync weekly target default:", error);
  }
}

function getCurrentTargetSettings(targetIsCustom = false) {
  if (!currentWeekRange) {
    currentWeekRange = getSelectedWeekRange();
  }

  const targetInput = el(ids.weeklyTarget);
  const checkedDays = Array.from(
    document.querySelectorAll("[data-target-workday]:checked")
  ).map((node) => Number(node.dataset.targetWorkday));

  return {
    target: targetInput?.dataset.manualTarget || targetInput?.value || "",
    targetIsCustom,
    workDays: checkedDays
  };
}

function persistCurrentTargetSettings(targetIsCustom = false) {
  if (!currentWeekRange) return;
  saveTargetSettings(currentWeekRange.startIso, {
    ...readRawTargetSettings(currentWeekRange.startIso),
    ...getCurrentTargetSettings(targetIsCustom)
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
      persistCurrentTargetSettings(false);
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
  const remaining = Math.max(0, target - earned);
  const plannedWorkDays = settings.workDays.length;
  const today = todayIso();
  const progressPercent = target > 0 ? Math.min(100, (earned / target) * 100) : 0;
  const workedDates = new Set(days.map((day) => day.date).filter(Boolean));

  const remainingWorkDates = weekDates.filter((dateString, index) => {
    if (!settings.workDays.includes(index)) return false;
    if (dateString < today) return false;
    if (workedDates.has(dateString)) return false;
    return true;
  });

  const remainingWorkDays = remainingWorkDates.length;
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
  const todayIndex = weekDates.indexOf(today);
  const todayTarget = todayIndex >= 0 && settings.workDays.includes(todayIndex)
    ? workedDates.has(today) ? completedForecasts[todayIndex] : futureForecasts[todayIndex]
    : 0;

  let status = "Set a target to track this week.";
  let statusClass = "target-status";
  let progressClass = "target-progress-fill target-progress-fill--empty";
  let paceLabel = "No weekly target set";

  if (target > 0 && plannedWorkDays === 0) {
    status = "Choose at least one planned work day.";
    statusClass = "target-status target-status--warning";
    progressClass = "target-progress-fill target-progress-fill--red";
    paceLabel = "No planned work days";
  } else if (target > 0 && remaining <= 0) {
    status = `Target hit. Ahead by ${formatMoney(Math.abs(target - earned))}.`;
    statusClass = "target-status target-status--good";
    progressClass = "target-progress-fill target-progress-fill--complete";
    paceLabel = "Target hit";
  } else if (target > 0 && remainingWorkDays === 0) {
    status = `No planned work days left. Remaining target is ${formatMoney(remaining)}.`;
    statusClass = "target-status target-status--warning";
    progressClass = "target-progress-fill target-progress-fill--red";
    paceLabel = "No work days left";
  } else if (target > 0) {
    const paceTolerance = Math.max(10, baseDailyTarget * 0.08);
    const targetPhrase = todayTarget > 0
      ? `${formatMoney(todayTarget)} target for today.`
      : `${formatMoney(requiredPerDay)} average needed per remaining work day.`;

    if (dailyPressure > paceTolerance) {
      status = targetPhrase;
      statusClass = "target-status target-status--warning";
      progressClass = "target-progress-fill target-progress-fill--red";
      paceLabel = "Behind pace";
    } else if (dailyPressure > 0) {
      status = targetPhrase;
      statusClass = "target-status target-status--caution";
      progressClass = "target-progress-fill target-progress-fill--amber";
      paceLabel = "Close to pace";
    } else {
      status = targetPhrase;
      statusClass = "target-status target-status--good";
      progressClass = "target-progress-fill target-progress-fill--green";
      paceLabel = "On track";
    }
  }

  return {
    target,
    earned,
    remaining,
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
    progressClass,
    paceLabel,
    targetMode: displayMode,
    liveTargetMode: targetMode,
    liveTarget,
    dynamicUplift,
    dynamicTarget,
    dailyTargetLabel: todayTarget > 0 ? "Today Target" : "Daily Target",
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

function renderTargetWeekStrip(days, settings, weekDates, summary) {
  const container = el(ids.targetWeekStrip);
  if (!container) return;

  const today = todayIso();
  const dayTotals = buildDayTotals(days);

  container.innerHTML = `
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
  `;
}

function renderWeeklyTarget(days) {
  if (!currentWeekRange) return;

  const summaryNode = el(ids.targetSummary);
  const statusNode = el(ids.targetStatus);
  const targetInput = el(ids.weeklyTarget);
  if (!summaryNode || !statusNode || !targetInput) return;

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
    <div class="target-summary-card target-summary-card--primary">
      <div class="summary-label">${escapeHtml(summary.dailyTargetLabel)}</div>
      <div class="summary-value">${formatMoney(summary.todayTarget || summary.requiredPerDay)}</div>
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
  if (!targetInput) return;

  const weekDates = getWeekDates(range.startIso);
  const settings = readTargetSettings(range.startIso);

  targetInput.value = settings.target;
  targetInput.dataset.manualTarget = settings.target;
  renderTargetWorkdays(settings, weekDates);

  targetInput.oninput = () => {
    targetInput.dataset.manualTarget = targetInput.value;
    persistCurrentTargetSettings(true);
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
  const date = el(ids.date);

  if (gross) gross.value = "";
  if (miles) miles.value = "";
  if (date) date.value = todayIso();
}

function buildDayPayload() {
  return {
    date: el(ids.date)?.value?.trim() || "",
    end_time: null,
    hours_worked: 0,
    gross: toNumber(el(ids.gross)?.value) ?? 0,
    trips: 0,
    business_miles: toNumber(el(ids.miles)?.value) ?? 0
  };
}

function validateDay(payload) {
  if (!payload.date) return "Please select a work date.";
  if (payload.gross < 0) return "Gross earnings must be zero or greater.";
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

function buildSessionMetrics(day, pricePerLitre, settings = getSettings()) {
  const gross = Number(day.gross || 0);
  const miles = Number(day.business_miles || 0);

  const estimatedFuel = calculateEstimatedFuelCost(miles, pricePerLitre, getMpg(settings));
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

function renderWeekSummary(days, pricePerLitre, settings = getSettings()) {
  const container = el(ids.weekSummary);
  if (!container) return;
  container.className = "summary-grid day-finance-grid";

  const totals = days.reduce((acc, day) => {
    const m = buildSessionMetrics(day, pricePerLitre, settings);
    acc.sessions += 1;
    acc.gross += m.gross;
    acc.miles += m.miles;
    acc.estimatedFuel += m.estimatedFuel;
    acc.tax += m.tax;
    acc.trueRetained += m.trueRetained;
    return acc;
  }, {
    sessions: 0,
    gross: 0,
    miles: 0,
    estimatedFuel: 0,
    tax: 0,
    trueRetained: 0
  });

  container.innerHTML = `
    <div class="summary-card day-finance-card day-finance-card--third">
      <div class="summary-label">Gross</div>
      <div class="summary-value">${formatMoney(totals.gross)}</div>
    </div>
    <div class="summary-card day-finance-card day-finance-card--third">
      <div class="summary-label">Miles</div>
      <div class="summary-value">${formatNumber(totals.miles, 1)}</div>
    </div>
    <div class="summary-card day-finance-card day-finance-card--third">
      <div class="summary-label">Fuel Est.</div>
      <div class="summary-value">${formatMoney(totals.estimatedFuel)}</div>
    </div>
    <div class="summary-card day-finance-card day-finance-card--half">
      <div class="summary-label">Tax</div>
      <div class="summary-value">${formatMoney(totals.tax)}</div>
    </div>
    <div class="summary-card day-finance-card day-finance-card--half">
      <div class="summary-label">True Retained</div>
      <div class="summary-value">${formatMoney(totals.trueRetained)}</div>
    </div>
  `;
}

function renderDayHistory(days, pricePerLitre, settings = getSettings()) {
  const container = el(ids.list);
  if (!container) return;

  if (!Array.isArray(days) || days.length === 0) {
    container.innerHTML = `<div class="history-empty">No worked sessions in this week.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="history-grid">
      ${days.map((day) => {
        const m = buildSessionMetrics(day, pricePerLitre, settings);

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
                <span class="history-item__label">Fuel Est.</span>
                <span class="history-item__value">${escapeHtml(formatMoney(m.estimatedFuel))}</span>
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
  updateWeekTitle(startIso, endIso);
  initialiseWeeklyTarget(range);

  const settings = getSettings();
  const historyStartIso = addDaysIso(startIso, -56);

  const [{ data: days, error }, { data: historicalDays, error: historicalError }, pricePerLitre] = await Promise.all([
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
    getRollingFuelPricePerLitre(3, getFallbackFuelPrice(settings))
  ]);

  if (historicalError) {
    console.warn("Unable to load historical weekday forecast data:", historicalError);
  }

  if (error) {
    console.error("Error loading week sessions:", error);
    showStatus("Unable to load worked sessions.", "error", false);
    currentWeekDays = [];
    currentHistoricalDays = [];
    renderWeeklyTarget(currentWeekDays);
    renderWeekSummary([], pricePerLitre, settings);
    renderDayHistory([], pricePerLitre, settings);
    return [];
  }

  const rows = days || [];
  currentHistoricalDays = historicalDays || [];
  currentWeekDays = rows;
  renderWeeklyTarget(rows);
  renderWeekSummary(rows, pricePerLitre, settings);
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

    const payload = buildDayPayload();
    const validationError = validateDay(payload);

    if (validationError) {
      showStatus(validationError, "error");
      return;
    }

    console.log("saving session payload:", payload);

    const { data, error } = await supabaseClient
      .from("days")
      .insert([payload])
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




