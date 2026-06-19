import { supabaseClient } from "./supabase.js";
import { sendToGoogleSheets, buildDaySheetPayload } from "./googleSheets.js";
import { showStatus } from "./status.js";
import { loadMonthSummary } from "./monthly.js";
import { getChargingTotalsForRange, getRollingFuelPricePerLitre } from "./fuel.js";
import {
  SETTINGS_UPDATED_EVENT,
  getDailyInsuranceEstimate,
  getDailyHoursTargetDefault,
  getDesiredHourlyRate,
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
} from "./settings.js?v=2.3.52";

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
  targetProgressSummary: "target_progress_summary",
  targetSummary: "target_summary",
  liveShiftCard: "live_shift_card",
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
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_FORECAST_WEIGHTS = [0.9, 0.95, 1, 1, 1.2, 1.25, 0.75];
const WEEKDAY_HOUR_WEIGHTS = [1, 1, 1, 1, 1.15, 1.25, 0.9];
const LIVE_SHIFT_ACTIVE_KEY = "uberEngineLiveShiftActive";
const LIVE_SHIFT_HISTORY_KEY = "uberEngineLiveShiftHistory";
const MIN_FORECAST_ELAPSED_HOURS = 0.5;
const MIN_FORECAST_CHECKPOINT_GAP_HOURS = 10 / 60;
const MAX_REASONABLE_GROSS_PER_MILE = 10;
const EARLY_SHIFT_PROTECTION_HOURS = 1.5;
const ENERGY_LEVELS = [
  { value: "DRAINED", label: "Drained", icon: "😫", score: 1 },
  { value: "LOW", label: "Low", icon: "😕", score: 2 },
  { value: "OK", label: "OK", icon: "😐", score: 3 },
  { value: "GOOD", label: "Good", icon: "🙂", score: 4 },
  { value: "EXCELLENT", label: "Excellent", icon: "😃", score: 5 }
];
const SHIFT_COACH_MESSAGES = {
  start: [
    "Shift started. Focus on steady jobs and let the data build.",
    "You are now on shift. First checkpoint recommended in around 60 to 90 minutes.",
    "Shift active. No pressure yet. Early data can be noisy.",
    "You are in the game. Build the shift one job at a time."
  ],
  firstCheckpoint: [
    "First checkpoint recorded. The shift now has enough data to start tracking pace.",
    "Early checkpoint saved. Treat this as a baseline, not a final judgement.",
    "First reading captured. Reassess after the next checkpoint for a clearer trend.",
    "Good start. Uber Engine will now compare future checkpoints against this baseline."
  ],
  forecastWaiting: [
    "Early checkpoint — projections will appear once more shift data is available.",
    "Checkpoint saved. More data needed before reliable forecasting.",
    "Keep building the shift. Forecasting will unlock after a stronger data window.",
    "Early data can be noisy. Add another checkpoint before treating the forecast as useful."
  ],
  forecastSuppressed: [
    "Checkpoint saved. More data needed before reliable forecasting.",
    "This checkpoint created an unusual rate. Forecasting is paused until the next reading.",
    "The data is saved, but the forecast needs a steadier sample before it is useful.",
    "Uber Engine is holding back the forecast so the numbers do not mislead you."
  ],
  paused: [
    "Shift paused. Break time will not count against your working pace.",
    "Paused for now. Resume when you are ready to keep building the shift.",
    "Break protected. The coach will continue when the shift resumes.",
    "Shift paused. Rest, food, charging, or errands will not distort the numbers."
  ],
  ahead: [
    "You are currently running above target pace. Keep going if the work feels easy.",
    "Strong shift so far. You are ahead of the required hourly rate.",
    "You have built a good cushion. Further driving is productive but not desperate.",
    "Target pressure is reducing. Stay steady and avoid chasing poor jobs.",
    "You are ahead of plan. Consider banking the momentum without overextending.",
    "Strong pace detected. This is the kind of shift that protects the week."
  ],
  onTrack: [
    "Current pace supports the target. Stay in the game.",
    "You are close to the required pace. Keep working and reassess at the next checkpoint.",
    "This is a viable shift. No major change needed.",
    "Progress is steady. Continue unless fatigue or poor job quality becomes an issue.",
    "The numbers are acceptable. Stay calm and keep taking sensible jobs.",
    "Target remains achievable from here."
  ],
  quietPatch: [
    "Recent pace has dropped, but the overall shift may still recover.",
    "This looks like a slow spell rather than a failed shift. Reassess at the next checkpoint.",
    "Income has softened recently. Stay patient if the area still feels active.",
    "Quiet period detected. Consider repositioning rather than ending immediately.",
    "The last checkpoint period was weaker. Give the shift one more review window.",
    "Recent earnings have slowed. Protect your patience and reassess soon."
  ],
  weak: [
    "Current pace is low and recovery time may be limited. Consider whether this shift is worth extending.",
    "The shift is underperforming. Repositioning or preserving energy for the next session may be sensible.",
    "This shift is not currently paying well. Avoid forcing hours just to stay busy.",
    "Low pace detected. Consider setting a short review window before deciding whether to continue.",
    "The numbers suggest this may become a poor shift unless the next hour improves.",
    "Weak return so far. Protect energy if another shift is planned later."
  ],
  recovery: [
    "You are behind target, but there is still enough shift time to recover.",
    "The shift is below plan, but one decent run could bring it back.",
    "Recovery remains realistic. Stay available and reassess after the next checkpoint.",
    "You are behind, but not out of range. Keep decisions sensible.",
    "Target is still reachable if the next hour improves.",
    "This is not yet a failed shift. Give it another checkpoint before deciding."
  ],
  recoveryUnlikely: [
    "Based on current pace and remaining shift time, today's target may be difficult.",
    "The remaining time may not be enough to recover the shortfall.",
    "Continuing may still earn money, but it is unlikely to rescue the target.",
    "This shift may be better treated as damage limitation.",
    "Consider protecting energy for the next stronger earning window.",
    "The data suggests diminishing returns. A planned stop may be better than a tired grind."
  ],
  targetAchieved: [
    "Daily target reached. Anything more is optional.",
    "You have hit the day's target. Protect energy and avoid unnecessary risk.",
    "Target protected. Further driving is a bonus, not a requirement.",
    "You have done enough for today's plan.",
    "Daily goal complete. Consider finishing on a good note.",
    "You are now in bonus territory."
  ],
  weeklyProtected: [
    "You are on track for the weekly target.",
    "This shift has reduced pressure on the rest of the week.",
    "The week is now in a stronger position.",
    "You have created breathing room for later in the week.",
    "Weekly target remains achievable without panic driving.",
    "You are building the week properly."
  ],
  weeklyPressure: [
    "The weekly target is still achievable, but the remaining days need consistency.",
    "You are slightly behind the weekly plan. Extra hours may be needed later.",
    "The week is not in danger yet, but avoid losing more momentum.",
    "This is a useful checkpoint: the week needs attention, not panic.",
    "You may need one stronger shift to get the week back on track.",
    "Weekly target pressure is increasing. Plan the next shift carefully."
  ],
  lowMileageReturn: [
    "Income per mile is lower than ideal. Watch for jobs that send you too far out.",
    "You are working, but the mileage return is weak.",
    "Consider favouring shorter local jobs until pounds per mile improves.",
    "High miles with low income can quietly damage the shift.",
    "Efficiency is below target. Avoid long dead miles if possible."
  ],
  goodMileageReturn: [
    "Good pounds per mile so far. This shift is using the car efficiently.",
    "Mileage return is healthy. Keep taking sensible local work.",
    "This is a good efficiency pattern.",
    "You are earning without excessive mileage.",
    "Strong mileage efficiency detected. This protects profit and energy."
  ],
  energy: [
    "You have been out for several hours. Check fatigue before extending the shift.",
    "The numbers may support continuing, but energy matters too.",
    "Do not trade tomorrow's early start for a tired extra hour tonight.",
    "If concentration is dropping, protect yourself and stop after a sensible job.",
    "Preserving energy may be the best business decision.",
    "The goal is repeatable income, not one heroic shift."
  ],
  energyWarning: [
    "The shift is performing well, but energy is falling. Consider finishing after the next suitable job.",
    "The numbers may support continuing, but your energy level needs protecting.",
    "You are earning, but do not trade tomorrow's shift for a tired extra hour.",
    "Strong earnings are useful. Sustainable earnings are better."
  ],
  sustainabilityAlert: [
    "Recent earnings have weakened and energy is low. A break may provide more value than grinding.",
    "This is becoming a sustainability decision, not just an earnings decision.",
    "Weak returns and low energy are a poor combination. Consider protecting recovery.",
    "The shift may not be worth forcing if the next checkpoint does not improve."
  ],
  strongPosition: [
    "Current pace remains healthy and energy is good. Continue if desired.",
    "Strong position. The shift is productive and your energy is holding up.",
    "You have both pace and energy. Stay disciplined and keep the work sensible.",
    "This is a healthy shift pattern. Continue if it still feels easy."
  ]
};

let weekOffset = 0;
let currentWeekDays = [];
let currentHistoricalDays = [];
let currentWeekRange = null;
let weeklyTargetsTableAvailable = true;
let liveShiftTimer = null;

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

function formatTripWindow(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "trip estimate building";

  const lower = Math.max(1, Math.floor(n * 0.85));
  const upper = Math.max(lower + 1, Math.ceil(n * 1.15));
  return `${lower}-${upper} trips`;
}

function formatTimeWindow(hours) {
  const minutes = Number(hours || 0) * 60;
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 minutes";

  const lower = Math.max(10, Math.floor((minutes * 0.85) / 5) * 5);
  const upper = Math.max(lower + 5, Math.ceil((minutes * 1.15) / 5) * 5);

  if (upper < 90) return `${lower}-${upper} minutes`;
  return `${formatClockHours(lower / 60)}-${formatClockHours(upper / 60)} hours`;
}

function normaliseTimeValue(value) {
  const text = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : "";
}

function readPlannedFinishInput() {
  return normaliseTimeValue(document.getElementById("live_shift_planned_finish")?.value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`Unable to read ${key}`, err);
    return fallback;
  }
}

function readActiveShift() {
  const shift = readJsonStorage(LIVE_SHIFT_ACTIVE_KEY, null);
  if (!shift || !shift.start_time) return null;

  return {
    ...shift,
    checkpoints: Array.isArray(shift.checkpoints) ? shift.checkpoints : [],
    pauses: Array.isArray(shift.pauses) ? shift.pauses : [],
    paused_at: shift.paused_at || ""
  };
}

function writeActiveShift(shift) {
  localStorage.setItem(LIVE_SHIFT_ACTIVE_KEY, JSON.stringify(shift));
}

function clearActiveShift() {
  localStorage.removeItem(LIVE_SHIFT_ACTIVE_KEY);
}

function archiveLiveShift(shift) {
  const history = readJsonStorage(LIVE_SHIFT_HISTORY_KEY, []);
  const nextHistory = [shift, ...history.filter((item) => item.id !== shift.id)].slice(0, 20);
  localStorage.setItem(LIVE_SHIFT_HISTORY_KEY, JSON.stringify(nextHistory));
}

function formatShiftTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";

  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function elapsedHoursBetween(startValue, endValue = new Date()) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  return Math.max(0, (end.getTime() - start.getTime()) / 3600000);
}

function getPauseIntervals(shift) {
  return Array.isArray(shift?.pauses) ? shift.pauses : [];
}

function isLiveShiftPaused(shift) {
  return Boolean(shift?.paused_at);
}

function getPausedMs(shift, endValue = new Date()) {
  const end = new Date(endValue);
  const pauseIntervals = getPauseIntervals(shift);
  const savedPauseMs = pauseIntervals.reduce((sum, pause) => {
    const start = new Date(pause.start_time);
    const pauseEnd = new Date(pause.end_time);
    if (Number.isNaN(start.getTime()) || Number.isNaN(pauseEnd.getTime())) return sum;
    return sum + Math.max(0, pauseEnd.getTime() - start.getTime());
  }, 0);

  if (!shift?.paused_at) return savedPauseMs;

  const pausedAt = new Date(shift.paused_at);
  if (Number.isNaN(pausedAt.getTime()) || Number.isNaN(end.getTime())) return savedPauseMs;
  return savedPauseMs + Math.max(0, end.getTime() - pausedAt.getTime());
}

function getLiveShiftElapsedHours(shift, endValue = new Date()) {
  if (!shift?.start_time) return 0;

  const start = new Date(shift.start_time);
  const end = isLiveShiftPaused(shift) ? new Date(shift.paused_at) : new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  return Math.max(0, (end.getTime() - start.getTime() - getPausedMs(shift, end)) / 3600000);
}

function getLiveShiftHoursBetween(shift, startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const pauseMs = getPauseIntervals(shift).reduce((sum, pause) => {
    const pauseStart = new Date(pause.start_time);
    const pauseEnd = new Date(pause.end_time);
    if (Number.isNaN(pauseStart.getTime()) || Number.isNaN(pauseEnd.getTime())) return sum;

    const overlapStart = Math.max(start.getTime(), pauseStart.getTime());
    const overlapEnd = Math.min(end.getTime(), pauseEnd.getTime());
    return sum + Math.max(0, overlapEnd - overlapStart);
  }, 0);

  return Math.max(0, (end.getTime() - start.getTime() - pauseMs) / 3600000);
}

function formatElapsedTime(hours) {
  const totalMinutes = Math.max(0, Math.floor(Number(hours || 0) * 60));
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${wholeHours}h ${String(minutes).padStart(2, "0")}m`;
}

function getLastCheckpoint(shift) {
  if (!shift?.checkpoints?.length) return null;
  return shift.checkpoints[shift.checkpoints.length - 1];
}

function getEnergyLevel(value) {
  return ENERGY_LEVELS.find((level) => level.value === value) || ENERGY_LEVELS[2];
}

function renderEnergyOptions(selectedValue = "OK") {
  const selected = getEnergyLevel(selectedValue).value;

  return ENERGY_LEVELS.map((level) => `
    <label class="live-energy-option" title="${escapeHtml(level.label)}" aria-label="${escapeHtml(level.label)}">
      <input type="radio" name="live_checkpoint_energy" value="${level.value}" ${level.value === selected ? "checked" : ""}>
      <span aria-hidden="true">${level.icon}</span>
    </label>
  `).join("");
}

function pickShiftCoachMessage(category, seedValue = 0) {
  const messages = SHIFT_COACH_MESSAGES[category] || SHIFT_COACH_MESSAGES.onTrack;
  const seed = Math.abs(Number(seedValue) || 0);
  return messages[seed % messages.length];
}

function formatProductiveHours(hours) {
  const value = Number(hours || 0);
  if (value <= 0.25) return "less than 30 minutes";
  if (value < 1) return `around ${Math.max(15, Math.round(value * 60 / 15) * 15)} minutes`;
  if (value < 1.35) return "around 1 productive hour";

  const lower = Math.max(1, Math.floor(value));
  const upper = Math.max(lower + 1, Math.ceil(value));
  return `${lower}-${upper} productive hours`;
}

function buildLiveShiftNarrative(details) {
  const {
    category,
    paused,
    forecastAvailable,
    earnings,
    todayGoal,
    projectedDay,
    projectedWeek,
    weeklyGoal,
    hourlyRate,
    energy,
    remainingToday,
    hoursToTodayTarget
  } = details;

  if (!details.checkpoint) {
    return "Start the shift, then add a checkpoint once the first earning pattern begins to form.";
  }

  if (paused) {
    return "Shift paused. Break time is protected and will not count against your working pace. Resume when you are ready to continue.";
  }

  if (!forecastAvailable) {
    return "More data needed. You have started building the shift, but forecasting is not reliable yet. Add another checkpoint in around 30 minutes.";
  }

  if (category === "targetAchieved") {
    const bufferText = projectedWeek >= weeklyGoal && weeklyGoal > 0
      ? "Anything extra now can reduce pressure later in the week."
      : "Further driving is optional rather than required.";
    return `Today's target is effectively secured. ${bufferText}`;
  }

  if (category === "energyWarning") {
    return `The shift is earning well at ${formatMoney(hourlyRate)}/hr, but energy is ${energy.label.toLowerCase()}. Consider banking progress or taking a break before fatigue starts making decisions for you.`;
  }

  if (category === "sustainabilityAlert") {
    return "Recent earnings are weak and energy is low. A break may provide more value than grinding through another poor window.";
  }

  if (category === "recoveryUnlikely") {
    return "Today's target looks difficult from the current pace. Treat the next checkpoint as a decision point rather than forcing the shift.";
  }

  if (category === "recovery") {
    return `Recovery remains possible. Another ${formatProductiveHours(hoursToTodayTarget)} could bring today's target back within reach if the next hour improves.`;
  }

  if (category === "weak" || category === "weeklyPressure") {
    return "The shift is currently below the pace needed. Reassess at the next checkpoint and protect energy if the work does not improve.";
  }

  if (category === "quietPatch") {
    return "Recent pace has softened. This may just be a quiet patch, so keep the next checkpoint as the review point before making a bigger decision.";
  }

  if (category === "strongPosition" || category === "ahead" || category === "weeklyProtected") {
    return `You are ahead of the required pace. Current pace suggests about ${formatMoney(projectedDay)} today and ${formatMoney(projectedWeek)} for the week, so you can build a useful buffer if energy remains good.`;
  }

  if (remainingToday > 0) {
    return `You are close to target pace. Another ${formatProductiveHours(hoursToTodayTarget)} could bring today's target within reach.`;
  }

  return "Current pace supports the plan. Stay in the game and use the next checkpoint to confirm the trend.";
}

function buildLiveShiftDetail(details) {
  const {
    checkpoint,
    forecastAvailable,
    hourlyRate,
    remainingToday,
    hoursToTodayTarget,
    grossPerMile,
    miles,
    tripsCompleted,
    energy
  } = details;

  if (!checkpoint) return "Add earnings, miles, trips and energy when you have a real checkpoint.";
  if (!forecastAvailable) return "Low-value rides still reduce the target gap. Keep the next checkpoint simple and let the data build.";

  const paceText = `Current pace is ${formatMoney(hourlyRate)}/hr.`;
  const targetText = remainingToday > 0
    ? `To hit today's target, you may need ${formatProductiveHours(hoursToTodayTarget)}.`
    : "Today's target is already protected.";
  const workloadParts = [];

  if (tripsCompleted > 0) workloadParts.push(`${formatInt(tripsCompleted)} trips`);
  if (miles > 0 && grossPerMile > 0) workloadParts.push(`${formatMoney(grossPerMile)}/mi`);
  if (energy.score <= 2) workloadParts.push(`energy ${energy.label.toLowerCase()}`);

  return workloadParts.length
    ? `${paceText} ${targetText} Context: ${workloadParts.join(", ")}.`
    : `${paceText} ${targetText}`;
}

function getRecentCheckpointHourlyRate(shift) {
  if (!shift?.checkpoints || shift.checkpoints.length < 2) return 0;

  const latest = shift.checkpoints[shift.checkpoints.length - 1];
  const previous = shift.checkpoints[shift.checkpoints.length - 2];
  const earningsDelta = Number(latest.earnings || 0) - Number(previous.earnings || 0);
  const hoursDelta = getLiveShiftHoursBetween(shift, previous.timestamp, latest.timestamp);

  return hoursDelta > 0 && earningsDelta > 0 ? earningsDelta / hoursDelta : 0;
}

function getRecentCheckpointGapHours(shift) {
  if (!shift?.checkpoints || shift.checkpoints.length < 2) return 0;

  const latest = shift.checkpoints[shift.checkpoints.length - 1];
  const previous = shift.checkpoints[shift.checkpoints.length - 2];
  return getLiveShiftHoursBetween(shift, previous.timestamp, latest.timestamp);
}

function getLiveShiftCoach(shift, summary) {
  const checkpoint = getLastCheckpoint(shift);
  const paused = isLiveShiftPaused(shift);
  const elapsedHours = getLiveShiftElapsedHours(shift);
  const pauseHours = getPausedMs(shift) / 3600000;
  const earnings = Number(checkpoint?.earnings || 0);
  const miles = Number(checkpoint?.business_miles || 0);
  const tripsCompleted = Number(checkpoint?.trips_completed || 0);
  const energy = getEnergyLevel(checkpoint?.energy_level);
  const hourlyRate = elapsedHours > 0 && earnings > 0 ? earnings / elapsedHours : 0;
  const recentHourlyRate = getRecentCheckpointHourlyRate(shift);
  const recentCheckpointGapHours = getRecentCheckpointGapHours(shift);
  const grossPerMile = miles > 0 && earnings > 0 ? earnings / miles : 0;
  const todayGoal = summary.hasTodayTarget
    ? summary.todayEarned + summary.todayTarget
    : summary.requiredPerDay;
  const plannedHoursLeft = Math.max(0, summary.todayHoursRemaining);
  const planningRate = Math.max(1, Number(summary.planningHourlyRate || 0));
  const maxReasonableHourlyRate = Math.max(75, planningRate * 3.5);
  const hasElapsedForecastWindow = elapsedHours >= MIN_FORECAST_ELAPSED_HOURS;
  const hasCheckpointForecastWindow = shift.checkpoints.length >= 2
    && recentCheckpointGapHours >= MIN_FORECAST_CHECKPOINT_GAP_HOURS;
  const hasForecastWindow = Boolean(checkpoint) && (hasElapsedForecastWindow || hasCheckpointForecastWindow);
  const hasExtremeHourlyRate = hourlyRate > maxReasonableHourlyRate
    || recentHourlyRate > maxReasonableHourlyRate;
  const hasExtremeMileageRate = grossPerMile > MAX_REASONABLE_GROSS_PER_MILE;
  const forecastAvailable = hasForecastWindow && !hasExtremeHourlyRate && !hasExtremeMileageRate;
  const earlyShiftProtected = elapsedHours < EARLY_SHIFT_PROTECTION_HOURS;
  const projectedDay = forecastAvailable && hourlyRate > 0
    ? hourlyRate * Math.max(elapsedHours, elapsedHours + plannedHoursLeft)
    : 0;
  const projectedWeek = forecastAvailable
    ? Math.max(0, summary.earned - summary.todayEarned) + Math.max(earnings, projectedDay)
    : 0;
  const currentWeekPosition = Math.max(0, summary.earned - summary.todayEarned) + earnings;
  const remainingToday = Math.max(0, todayGoal - earnings);
  const hoursToTodayTarget = forecastAvailable && hourlyRate > 0
    ? remainingToday / hourlyRate
    : 0;
  const dayBuffer = forecastAvailable ? Math.max(0, projectedDay - todayGoal) : 0;
  const weekBuffer = forecastAvailable ? Math.max(0, projectedWeek - summary.target) : 0;
  const todayProgress = todayGoal > 0 ? Math.min(100, (earnings / todayGoal) * 100) : 0;
  const averageTripValue = earnings > 0 && tripsCompleted > 0
    ? earnings / tripsCompleted
    : summary.earned > 0 && summary.tripsWorked > 0
      ? summary.earned / summary.tripsWorked
      : 0;
  const estimatedTripsToToday = remainingToday > 0 && averageTripValue > 0
    ? remainingToday / averageTripValue
    : 0;
  const dailyCountdownActive = todayProgress >= 50 && remainingToday > 0;
  const todayProgressLabel = dailyCountdownActive ? "To Target" : "Today";
  const todayProgressText = dailyCountdownActive
    ? forecastAvailable && hoursToTodayTarget > 0
      ? `${formatMoney(remainingToday)} left / ${formatTripWindow(estimatedTripsToToday)} / ${formatTimeWindow(hoursToTodayTarget)}`
      : `${formatMoney(remainingToday)} left`
    : remainingToday <= 0 && todayGoal > 0
      ? "Daily target protected"
      : `${formatMoney(earnings)} of ${formatMoney(todayGoal || 0)}`;

  let tone = "idle";
  let label = "Add first checkpoint";
  let category = "start";

  if (checkpoint) {
    const isFirstCheckpoint = shift.checkpoints.length === 1;
    const dailyTargetAchieved = todayGoal > 0 && earnings >= todayGoal;
    const weeklyProtected = forecastAvailable && summary.target > 0 && projectedWeek >= summary.target;
    const quietPatch = recentHourlyRate > 0 && recentHourlyRate < planningRate * 0.65 && hourlyRate >= planningRate * 0.75;
    const weakShift = hourlyRate < planningRate * 0.75 && (recentHourlyRate === 0 || recentHourlyRate < planningRate * 0.75);
    const recoveryPossible = forecastAvailable && hourlyRate < planningRate * 0.85 && plannedHoursLeft > 1.5 && projectedDay >= todayGoal * 0.85;
    const recoveryUnlikely = forecastAvailable && hourlyRate < planningRate * 0.75 && plannedHoursLeft <= 1.5 && todayGoal > 0 && projectedDay < todayGoal;
    const lowMileageReturn = grossPerMile > 0 && grossPerMile < 0.9;
    const goodMileageReturn = grossPerMile >= 1.25;
    const lowEnergy = energy.score <= 2;
    const goodEnergy = energy.score >= 4;
    const strongPace = forecastAvailable && hourlyRate >= planningRate * 1.1;
    const highTripLoad = tripsCompleted >= 18 && elapsedHours >= 4;

    if (paused) {
      tone = "amber";
      label = "Shift Paused";
      category = "paused";
    } else if (earlyShiftProtected && !dailyTargetAchieved) {
      tone = "amber";
      label = "Building Data";
      category = "forecastWaiting";
    } else if (!forecastAvailable && (hasExtremeHourlyRate || hasExtremeMileageRate)) {
      tone = "amber";
      label = "More Data Needed";
      category = "forecastSuppressed";
    } else if (!forecastAvailable) {
      tone = "amber";
      label = isFirstCheckpoint ? "First Checkpoint" : "More Data Needed";
      category = "forecastWaiting";
    } else if (dailyTargetAchieved) {
      tone = "green";
      label = "Target Achieved";
      category = "targetAchieved";
    } else if (recoveryUnlikely) {
      tone = "red";
      label = "Recovery Unlikely";
      category = "recoveryUnlikely";
    } else if (weakShift && lowEnergy) {
      tone = "red";
      label = "Sustainability Alert";
      category = "sustainabilityAlert";
    } else if (weakShift) {
      tone = "red";
      label = "Weak Shift Forming";
      category = "weak";
    } else if (quietPatch) {
      tone = "amber";
      label = "Quiet Patch";
      category = "quietPatch";
    } else if (recoveryPossible) {
      tone = "amber";
      label = "Recovery Possible";
      category = "recovery";
    } else if (strongPace && lowEnergy) {
      tone = "amber";
      label = "Energy Warning";
      category = "energyWarning";
    } else if (strongPace && goodEnergy) {
      tone = "green";
      label = "Strong Position";
      category = "strongPosition";
    } else if (hourlyRate >= planningRate * 1.1) {
      tone = "green";
      label = "Ahead of Plan";
      category = weeklyProtected ? "weeklyProtected" : "ahead";
    } else if (hourlyRate >= planningRate * 0.85 || projectedWeek >= summary.target * 0.95) {
      tone = "amber";
      label = "On Plan";
      category = weeklyProtected ? "weeklyProtected" : "onTrack";
    } else {
      tone = "red";
      label = "Weekly Pressure";
      category = "weeklyPressure";
    }

    if (!paused && forecastAvailable && !isFirstCheckpoint && elapsedHours >= 6 && tone !== "red" && !dailyTargetAchieved) {
      tone = "amber";
      label = "Energy Check";
      category = "energy";
    } else if (!paused && highTripLoad && lowEnergy && tone !== "red") {
      tone = "amber";
      label = "Energy Check";
      category = "energyWarning";
    } else if (!paused && forecastAvailable && !isFirstCheckpoint && lowMileageReturn && tone !== "red") {
      tone = "amber";
      label = "Mileage Efficiency";
      category = "lowMileageReturn";
    } else if (!paused && forecastAvailable && !isFirstCheckpoint && goodMileageReturn && tone === "amber" && hourlyRate >= planningRate * 0.85) {
      tone = "green";
      label = "Strong Mileage Efficiency";
      category = "goodMileageReturn";
    }
  }

  const messageSeed = shift.checkpoints.length + Math.floor(elapsedHours) + Math.round(earnings);
  const fallbackMessage = pickShiftCoachMessage(category, messageSeed);
  const narrativeMessage = buildLiveShiftNarrative({
    checkpoint,
    category,
    paused,
    forecastAvailable,
    earnings,
    todayGoal,
    projectedDay,
    projectedWeek,
    weeklyGoal: summary.target,
    hourlyRate,
    energy,
    remainingToday,
    hoursToTodayTarget
  });
  const detailMessage = buildLiveShiftDetail({
    checkpoint,
    forecastAvailable,
    hourlyRate,
    remainingToday,
    hoursToTodayTarget,
    grossPerMile,
    miles,
    tripsCompleted,
    energy
  });

  return {
    checkpoint,
    paused,
    elapsedHours,
    pauseHours,
    earnings,
    miles,
    tripsCompleted,
    hourlyRate,
    recentHourlyRate,
    grossPerMile,
    energy,
    projectedDay,
    projectedWeek,
    currentWeekPosition,
    todayGoal,
    remainingToday,
    hoursToTodayTarget,
    dayBuffer,
    weekBuffer,
    weeklyGoal: summary.target,
    todayProgress,
    todayProgressLabel,
    todayProgressText,
    weeklyProgress: summary.target > 0
      ? Math.min(100, ((forecastAvailable ? projectedWeek : currentWeekPosition) / summary.target) * 100)
      : 0,
    forecastAvailable,
    showHourlyRate: forecastAvailable,
    showGrossPerMile: grossPerMile > 0 && !hasExtremeMileageRate,
    tone,
    label,
    message: narrativeMessage || fallbackMessage,
    detailMessage
  };
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

function renderLiveShiftCard(summary) {
  const node = el(ids.liveShiftCard);
  if (!node) return;

  const shift = readActiveShift();

  if (!shift) {
    node.innerHTML = `
      <section class="live-shift-panel live-shift-panel--idle">
        <div class="live-shift-panel__header">
          <div>
            <h3>Live Shift Coach</h3>
            <p>Quick checkpoints while you work.</p>
          </div>
          <span class="live-shift-pill">Ready</span>
        </div>
        <label class="live-finish-field">
          <span>Planned Finish</span>
          <input id="live_shift_planned_finish" type="time" inputmode="numeric">
        </label>
        <button class="live-shift-button live-shift-button--primary" type="button" data-live-shift-action="start">
          Start Shift
        </button>
      </section>
    `;
    syncLiveShiftTimer(false);
    return;
  }

  const coach = getLiveShiftCoach(shift, summary);
  const checkpoint = coach.checkpoint;
  const checkpointCount = shift.checkpoints.length;
  const selectedEnergy = checkpoint?.energy_level || "OK";
  const plannedFinish = normaliseTimeValue(shift.planned_finish_time);
  const plannedFinishText = plannedFinish ? ` / finish ${plannedFinish}` : "";
  const shiftState = coach.paused ? `Shift paused${plannedFinishText}` : `Shift started ${formatShiftTime(shift.start_time)}${plannedFinishText}`;
  const actionLabel = coach.paused ? "Resume Shift" : "Pause Shift";
  const actionName = coach.paused ? "resume" : "pause";
  const checkpointMeta = checkpoint ? `Last checkpoint ${formatShiftTime(checkpoint.timestamp)} (${checkpointCount})` : "No checkpoints yet";
  const pauseMeta = coach.pauseHours > 0 ? `${formatElapsedTime(coach.pauseHours)} paused` : "";

  node.innerHTML = `
    <section class="live-shift-panel live-shift-panel--active live-shift-panel--${coach.tone}">
      <div class="live-shift-panel__header">
        <div>
          <h3>Live Shift Coach</h3>
          <p>${escapeHtml(shiftState)}</p>
        </div>
        <div class="live-shift-panel__elapsed">
          <span>Elapsed</span>
          <strong data-live-shift-elapsed>${formatElapsedTime(coach.elapsedHours)}</strong>
        </div>
        <span class="live-shift-pill live-shift-pill--${coach.tone}">${escapeHtml(coach.label)}</span>
      </div>

      ${coach.paused ? `
        <label class="live-finish-field">
          <span>Planned Finish</span>
          <input id="live_shift_planned_finish" type="time" inputmode="numeric" value="${escapeHtml(plannedFinish)}">
        </label>
      ` : ""}

      <form id="live_shift_form" class="live-shift-form" data-live-shift-form>
        <label>
          <span>Earnings</span>
          <input id="live_checkpoint_earnings" type="number" min="0" step="0.01" inputmode="decimal" value="${checkpoint ? coach.earnings.toFixed(2) : ""}" placeholder="0" ${coach.paused ? "disabled" : ""}>
        </label>
        <label>
          <span>Miles</span>
          <input id="live_checkpoint_miles" type="number" min="0" step="0.1" inputmode="decimal" value="${checkpoint ? coach.miles.toFixed(1) : ""}" placeholder="0" ${coach.paused ? "disabled" : ""}>
        </label>
        <label>
          <span>Trips</span>
          <input id="live_checkpoint_trips" type="number" min="0" step="1" inputmode="numeric" value="${checkpoint?.trips_completed ?? ""}" placeholder="0" ${coach.paused ? "disabled" : ""}>
        </label>
        <fieldset class="live-energy-field">
          <legend>Energy Level</legend>
          <div class="live-energy-options">
            ${renderEnergyOptions(selectedEnergy)}
          </div>
        </fieldset>
      </form>

      <div class="live-shift-coach">
        <div class="live-shift-coach__status">
          <span class="live-shift-dot live-shift-dot--${coach.tone}"></span>
          <div>
            <strong>${escapeHtml(coach.label)}</strong>
            <span>${escapeHtml(coach.message)}</span>
          </div>
        </div>

        <div class="live-shift-bars">
          <div>
            <span>${escapeHtml(coach.todayProgressLabel)}</span>
            <div class="live-shift-track"><i style="width: ${coach.todayProgress}%"></i></div>
            <b>${escapeHtml(coach.todayProgressText)}</b>
          </div>
        </div>

        <div class="live-forecast-block" aria-label="Driver Coach forecast">
          <div class="live-forecast-block__title">
            <span>Forecast Evidence</span>
            <b>${coach.forecastAvailable ? "Live" : "Building"}</b>
          </div>
          <div class="live-forecast-grid">
          <div>
            <span>Current Pace</span>
            <strong>${coach.showHourlyRate ? `${formatMoney(coach.hourlyRate)}/hr` : "Building data"}</strong>
          </div>
          <div>
            <span>Day Forecast</span>
            <strong>${coach.forecastAvailable ? formatMoney(coach.projectedDay) : "After 30m"}</strong>
          </div>
          <div>
            <span>Week Forecast</span>
            <strong>${coach.forecastAvailable ? formatMoney(coach.projectedWeek) : "After 30m"}</strong>
          </div>
          <div>
            <span>Hours Left</span>
            <strong>${coach.forecastAvailable ? (coach.remainingToday > 0 ? formatProductiveHours(coach.hoursToTodayTarget) : "Protected") : "More data"}</strong>
          </div>
          <div>
            <span>Buffer</span>
            <strong>${coach.forecastAvailable ? (coach.dayBuffer > 0 ? formatMoney(coach.dayBuffer) : formatMoney(coach.weekBuffer)) : "More data"}</strong>
          </div>
          <div>
            <span>Per Mile</span>
            <strong>${coach.showGrossPerMile ? `${formatMoney(coach.grossPerMile)}/mi` : "Add miles"}</strong>
          </div>
          </div>
        </div>

      </div>

      <button class="live-shift-button live-shift-button--primary" type="submit" form="live_shift_form" ${coach.paused ? "disabled" : ""}>Save Checkpoint</button>

      <div class="live-shift-footer">
        <span>${escapeHtml([checkpointMeta, pauseMeta].filter(Boolean).join(" · "))}</span>
        <div class="live-shift-footer__actions">
          <button class="live-shift-button" type="button" data-live-shift-action="${actionName}">${actionLabel}</button>
          <button class="live-shift-button" type="button" data-live-shift-action="end">End Shift</button>
        </div>
      </div>
    </section>
  `;

  syncLiveShiftTimer(true);
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
  const tripsWorked = days.reduce((sum, day) => sum + Number(day.trips || 0), 0);
  const hoursWorked = days.reduce((sum, day) => sum + Number(day.hours_worked || 0), 0);
  const remaining = Math.max(0, target - earned);
  const plannedWorkDays = settings.workDays.length;
  const hourlyPlan = getPlanningHourlyRate(appSettings, days, currentHistoricalDays);
  const initialHoursEstimate = target > 0 ? target / hourlyPlan.planningRate : 0;
  const remainingHours = remaining > 0 ? remaining / hourlyPlan.planningRate : 0;
  const forecastTotalHours = hoursWorked + remainingHours;
  const today = todayIso();
  const progressPercent = target > 0 ? Math.min(100, (earned / target) * 100) : 0;
  const hoursProgressPercent = forecastTotalHours > 0 ? Math.min(100, (hoursWorked / forecastTotalHours) * 100) : 0;

  const remainingWorkDates = weekDates.filter((dateString, index) => {
    if (!settings.workDays.includes(index)) return false;
    if (dateString < today) return false;
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
  const remainingHourWorkDates = remainingWorkDates;
  const futureHourWorkDates = remainingHourWorkDates.filter((dateString) => dateString > today);
  const hasTodayHourTarget = todayIndex >= 0 && settings.workDays.includes(todayIndex);
  const hourTargetsBeforeTodayWork = distributeHoursByWeight(remainingHours, remainingHourWorkDates);
  const currentDayRequiredHours = hasTodayHourTarget
    ? hourTargetsBeforeTodayWork.get(today) || 0
    : 0;
  const todayHoursRemaining = currentDayRequiredHours;
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
  const todayTarget = hasTodayTarget ? futureForecasts[todayIndex] || 0 : 0;
  const averageTripValue = earned > 0 && tripsWorked > 0 ? earned / tripsWorked : 0;
  const estimatedTripsRemaining = remaining > 0 && averageTripValue > 0
    ? remaining / averageTripValue
    : 0;
  const completionFocus = target > 0 && progressPercent >= 50;

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
      ? `${formatMoney(todayTarget)} and ${formatClockHours(todayHoursRemaining)}h from here keeps today moving.`
      : `${formatMoney(requiredPerDay)} and ${formatClockHours(requiredHoursPerRemainingDay)}h per remaining work day keeps it reachable.`;
    const hoursPerDayPressure = remainingHourWorkDates.length > 0
      ? remainingHours / remainingHourWorkDates.length
      : 0;

    if (hoursPerDayPressure > 10) {
      status = `${formatClockHours(hoursPerDayPressure)}h/day needed at ${formatMoney(hourlyPlan.planningRate)}/hr. Review the target or add work days.`;
      statusClass = "target-status target-status--warning";
      progressClass = "target-progress-fill target-progress-fill--red";
      paceLabel = "Ambitious week";
    } else if (dailyPressure > paceTolerance) {
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
    tripsWorked,
    hoursWorked,
    remaining,
    completionFocus,
    estimatedTripsRemaining,
    estimatedTripsText: formatTripWindow(estimatedTripsRemaining),
    remainingTimeText: formatTimeWindow(remainingHours),
    initialHoursEstimate,
    weeklyHoursTarget: forecastTotalHours,
    remainingHours,
    planningHourlyRate: hourlyPlan.planningRate,
    desiredHourlyRate: hourlyPlan.desiredRate,
    observedHourlyRate: hourlyPlan.observedRate,
    hourlyRateSource: hourlyPlan.source,
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
    dailyTargetLabel: hasTodayTarget ? "Today Required" : "Daily Required",
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

function calculateGrossHourlyRate(days) {
  const totals = days.reduce((acc, day) => ({
    gross: acc.gross + Number(day.gross || 0),
    hours: acc.hours + Number(day.hours_worked || 0)
  }), {
    gross: 0,
    hours: 0
  });

  return totals.hours > 0 ? totals.gross / totals.hours : 0;
}

function getPlanningHourlyRate(appSettings, currentDays, historicalDays) {
  const desiredRate = getDesiredHourlyRate(appSettings);
  const currentRate = calculateGrossHourlyRate(currentDays);
  const historicalRate = calculateGrossHourlyRate(historicalDays);
  const observedRate = currentRate > 0 ? currentRate : historicalRate;
  const planningRate = observedRate > desiredRate ? observedRate : desiredRate;

  return {
    desiredRate,
    observedRate,
    planningRate: Math.max(1, planningRate),
    source: observedRate > desiredRate ? "actual" : "settings"
  };
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
      amount: isPlanned ? formatCompactMoney(futureForecast) : "OFF"
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

function getHourDayState(dateString, index, settings, hourTotals, today, futureHoursTarget) {
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
      amount: isPlanned ? `${formatClockHours(safeFutureHoursTarget)}h` : "OFF"
    };
  }

  return {
    className: "target-week-day target-week-day--hit",
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
    <div class="target-week-days">
      ${weekDates.map((dateString, index) => {
        const moneyState = getWeekDayState(
          dateString,
          index,
          settings,
          dayTotals,
          today,
          summary.completedForecasts[index],
          summary.futureForecasts[index]
        );
        const state = getHourDayState(
          dateString,
          index,
          settings,
          hourTotals,
          today,
          summary.futureHourTargets[index]
        );
        const stateModifier = moneyState.className.split(" ").find((className) => className.startsWith("target-week-day--")) || "";
        const hoursAmount = moneyState.amount === "OFF" && state.amount === "OFF" ? "" : state.amount;

        return `
          <div class="target-week-card ${stateModifier}">
            <strong class="target-week-card__amount">${moneyState.amount}</strong>
            <span class="target-week-card__hours">${hoursAmount}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderWeeklyTarget(days) {
  if (!currentWeekRange) return;

  const summaryNode = el(ids.targetSummary);
  const progressNode = el(ids.targetProgressSummary);
  const statusNode = el(ids.targetStatus);
  const targetInput = el(ids.weeklyTarget);
  if (!summaryNode || !progressNode || !statusNode || !targetInput) return;

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

  const targetProgressLabel = summary.completionFocus && summary.remaining > 0
    ? "Remaining to target"
    : summary.paceLabel;
  const targetProgressSub = summary.completionFocus && summary.remaining > 0
    ? `${formatMoney(summary.remaining)} to target / ${summary.estimatedTripsText} / ${summary.remainingTimeText}`
    : `${formatMoney(summary.earned)} of ${formatMoney(summary.target)} target`;

  progressNode.innerHTML = `
    <div class="target-progress-panel">
      <div class="target-progress-meta">
        <span>${escapeHtml(targetProgressLabel)}</span>
        <strong>${formatNumber(summary.progressPercent, 0)}%</strong>
      </div>
      <div class="target-progress-track" aria-label="Weekly target progress">
        <div class="${summary.progressClass}" style="width: ${summary.progressPercent}%"></div>
      </div>
      <div class="target-progress-sub">
        ${escapeHtml(targetProgressSub)}
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
        ${formatClockHours(summary.hoursWorked)} worked, ${formatClockHours(summary.remainingHours)} still needed
      </div>
    </div>
  `;

  summaryNode.innerHTML = `
    <div class="target-summary-card target-summary-card--primary">
      <div class="summary-label">${escapeHtml(summary.dailyTargetLabel)}</div>
      <div class="summary-value">${formatMoney(summary.hasTodayTarget ? summary.todayTarget : summary.requiredPerDay)}</div>
      ${summary.hasTodayTarget ? `<div class="summary-sub">${formatMoney(summary.todayEarned)} earned today</div>` : ""}
    </div>
    <div class="target-summary-card target-summary-card--primary">
      <div class="summary-label">Today Hours</div>
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
    <div class="target-summary-card">
      <div class="summary-label">Planning Rate</div>
      <div class="summary-value">${formatMoney(summary.planningHourlyRate)}</div>
      <div class="summary-sub">${summary.hourlyRateSource === "actual" ? "From actuals" : "Settings rate"}</div>
    </div>
  `;

  renderLiveShiftCard(summary);
}

function syncLiveShiftTimer(active) {
  if (liveShiftTimer) {
    window.clearInterval(liveShiftTimer);
    liveShiftTimer = null;
  }

  if (!active) return;

  liveShiftTimer = window.setInterval(() => {
    if (!readActiveShift()) {
      syncLiveShiftTimer(false);
      return;
    }

    renderWeeklyTarget(currentWeekDays);
  }, 30000);
}

function startLiveShift() {
  const now = new Date();
  writeActiveShift({
    id: `shift-${now.getTime()}`,
    start_time: now.toISOString(),
    end_time: "",
    planned_finish_time: readPlannedFinishInput(),
    paused_at: "",
    pauses: [],
    checkpoints: []
  });

  renderWeeklyTarget(currentWeekDays);
  showStatus("Live shift started.", "success");
}

function pauseLiveShift() {
  const shift = readActiveShift();
  if (!shift || isLiveShiftPaused(shift)) return;

  writeActiveShift({
    ...shift,
    paused_at: new Date().toISOString()
  });
  renderWeeklyTarget(currentWeekDays);
  showStatus("Shift paused.", "success");
}

function resumeLiveShift() {
  const shift = readActiveShift();
  if (!shift || !isLiveShiftPaused(shift)) return;

  const now = new Date().toISOString();
  writeActiveShift({
    ...shift,
    planned_finish_time: readPlannedFinishInput() || normaliseTimeValue(shift.planned_finish_time),
    paused_at: "",
    pauses: [
      ...getPauseIntervals(shift),
      {
        start_time: shift.paused_at,
        end_time: now
      }
    ]
  });
  renderWeeklyTarget(currentWeekDays);
  showStatus("Shift resumed.", "success");
}

function endLiveShift() {
  const shift = readActiveShift();
  if (!shift) return;
  const now = new Date().toISOString();
  const pauses = isLiveShiftPaused(shift)
    ? [
        ...getPauseIntervals(shift),
        {
          start_time: shift.paused_at,
          end_time: now
        }
      ]
    : getPauseIntervals(shift);

  archiveLiveShift({
    ...shift,
    paused_at: "",
    pauses,
    end_time: now
  });
  clearActiveShift();
  renderWeeklyTarget(currentWeekDays);
  showStatus("Live shift ended. Save the final session when ready.", "success");
}

function saveLiveCheckpoint(event) {
  event.preventDefault();

  const shift = readActiveShift();
  if (!shift) {
    showStatus("Start a shift before adding a checkpoint.", "error");
    return;
  }

  const earnings = toNumber(document.getElementById("live_checkpoint_earnings")?.value);
  const miles = toNumber(document.getElementById("live_checkpoint_miles")?.value);
  const trips = toNumber(document.getElementById("live_checkpoint_trips")?.value) ?? 0;
  const energyLevel = getEnergyLevel(document.querySelector("input[name='live_checkpoint_energy']:checked")?.value);

  if (earnings === null || earnings < 0) {
    showStatus("Enter current Uber earnings.", "error");
    return;
  }

  if (miles === null || miles < 0) {
    showStatus("Enter current business miles.", "error");
    return;
  }

  if (trips < 0 || !Number.isInteger(trips)) {
    showStatus("Enter whole trips completed.", "error");
    return;
  }

  const previousCheckpoint = getLastCheckpoint(shift);
  if (previousCheckpoint) {
    const previousEarnings = Number(previousCheckpoint.earnings || 0);
    const previousMiles = Number(previousCheckpoint.business_miles || 0);
    const previousTrips = Number(previousCheckpoint.trips_completed || 0);

    if (earnings < previousEarnings) {
      showStatus("Current earnings are lower than the previous checkpoint. Start a new shift or correct the value.", "error");
      return;
    }

    if (miles < previousMiles) {
      showStatus("Business miles are lower than the previous checkpoint. Check the current total.", "error");
      return;
    }

    if (trips < previousTrips) {
      showStatus("Trips completed are lower than the previous checkpoint. Check the current total.", "error");
      return;
    }
  }

  const nextShift = {
    ...shift,
    checkpoints: [
      ...shift.checkpoints,
      {
        timestamp: new Date().toISOString(),
        earnings,
        business_miles: miles,
        trips_completed: trips,
        energy_level: energyLevel.value
      }
    ]
  };

  writeActiveShift(nextShift);
  renderWeeklyTarget(currentWeekDays);
  showStatus("Checkpoint saved.", "success");
}

function handleLiveShiftClick(event) {
  const button = event.target.closest("[data-live-shift-action]");
  if (!button) return;

  if (button.dataset.liveShiftAction === "start") {
    startLiveShift();
  } else if (button.dataset.liveShiftAction === "pause") {
    pauseLiveShift();
  } else if (button.dataset.liveShiftAction === "resume") {
    resumeLiveShift();
  } else if (button.dataset.liveShiftAction === "end") {
    endLiveShift();
  }
}

function handleLiveShiftSubmit(event) {
  if (!event.target.closest("[data-live-shift-form]")) return;
  saveLiveCheckpoint(event);
}

function handleLiveShiftInputFocus(event) {
  const input = event.target.closest("#live_checkpoint_earnings, #live_checkpoint_miles, #live_checkpoint_trips");
  if (!input || input.disabled) return;
  window.setTimeout(() => input.select(), 0);
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
    persistCurrentTargetSettings({ targetIsCustom: true });
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
  el(ids.liveShiftCard)?.addEventListener("click", handleLiveShiftClick);
  el(ids.liveShiftCard)?.addEventListener("submit", handleLiveShiftSubmit);
  el(ids.liveShiftCard)?.addEventListener("focusin", handleLiveShiftInputFocus);
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




