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
const LIVE_SHIFT_COMPLETED_KEY = "uberEngineLiveShiftCompleted";
const COACH_API_ENDPOINTS = ["/api/coach", "http://127.0.0.1:8787/api/coach"];
const MIN_FORECAST_ELAPSED_HOURS = 0.5;
const MIN_FORECAST_CHECKPOINT_GAP_HOURS = 10 / 60;
const MAX_REASONABLE_GROSS_PER_MILE = 10;
const EARLY_SHIFT_PROTECTION_HOURS = 1.5;
const TARGET_LEVELS = [
  { value: 750, label: "Floor", note: "successful week" },
  { value: 850, label: "Target", note: "strong sustainable week" },
  { value: 1000, label: "Stretch", note: "if the market allows" }
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
  strongPosition: [
    "Current pace remains healthy. Continue if desired.",
    "Strong position. The shift is productive.",
    "You have useful pace. Stay disciplined and keep the work sensible.",
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

function readDriverNotesInput() {
  return String(document.getElementById("live_shift_notes")?.value || "").trim();
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
    paused_at: shift.paused_at || "",
    driver_notes: shift.driver_notes || "",
    coach_reply: shift.coach_reply || "",
    coach_draft_status: shift.coach_draft_status || "",
    coach_interactions: Array.isArray(shift.coach_interactions) ? shift.coach_interactions : []
  };
}

function readCompletedShift() {
  const shift = readJsonStorage(LIVE_SHIFT_COMPLETED_KEY, null);
  if (!shift || !shift.start_time || !shift.end_time) return null;
  return {
    ...shift,
    checkpoints: Array.isArray(shift.checkpoints) ? shift.checkpoints : [],
    pauses: Array.isArray(shift.pauses) ? shift.pauses : [],
    driver_notes: shift.driver_notes || "",
    coach_reply: shift.coach_reply || "",
    coach_draft_status: shift.coach_draft_status || "",
    coach_interactions: Array.isArray(shift.coach_interactions) ? shift.coach_interactions : []
  };
}

function writeActiveShift(shift) {
  localStorage.setItem(LIVE_SHIFT_ACTIVE_KEY, JSON.stringify(shift));
}

function clearActiveShift() {
  localStorage.removeItem(LIVE_SHIFT_ACTIVE_KEY);
}

function writeCompletedShift(shift) {
  localStorage.setItem(LIVE_SHIFT_COMPLETED_KEY, JSON.stringify(shift));
}

function clearCompletedShift() {
  localStorage.removeItem(LIVE_SHIFT_COMPLETED_KEY);
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
  if (value > 10) return "a full shift or more";

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

  if (category === "recoveryUnlikely") {
    return "The target needs a stronger next window. Treat the next checkpoint as a calm decision point.";
  }

  if (category === "recovery") {
    return `Recovery remains possible. Another ${formatProductiveHours(hoursToTodayTarget)} could bring today's target back within reach if the next hour improves.`;
  }

  if (category === "weak" || category === "weeklyPressure") {
    return "This looks like a slower patch, but it may still recover. Stay available for a short review window.";
  }

  if (category === "quietPatch") {
    return "Recent pace has softened. This may just be a quiet patch, so keep the next checkpoint as the review point before making a bigger decision.";
  }

  if (category === "strongPosition" || category === "ahead" || category === "weeklyProtected") {
    return `You are ahead of the required pace. Current pace suggests about ${formatMoney(projectedDay)} today and ${formatMoney(projectedWeek)} for the week, so you can build a useful buffer.`;
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
    tripsCompleted
  } = details;

  if (!checkpoint) return "Add earnings, miles and trips when you have a real checkpoint.";
  if (!forecastAvailable) return "Low-value rides still reduce the target gap. Keep the next checkpoint simple and let the data build.";

  const paceText = `Current pace is ${formatMoney(hourlyRate)}/hr.`;
  const targetText = remainingToday > 0
    ? `To hit today's target, you may need ${formatProductiveHours(hoursToTodayTarget)}.`
    : "Today's target is already protected.";
  const workloadParts = [];

  if (tripsCompleted > 0) workloadParts.push(`${formatInt(tripsCompleted)} trips`);
  if (miles > 0 && grossPerMile > 0) workloadParts.push(`${formatMoney(grossPerMile)}/mi`);

  return workloadParts.length
    ? `${paceText} ${targetText} Context: ${workloadParts.join(", ")}.`
    : `${paceText} ${targetText}`;
}

function formatEstimatedFinish(hoursFromNow) {
  const hours = Number(hoursFromNow || 0);
  if (!Number.isFinite(hours) || hours <= 0) return "";

  const finish = new Date(Date.now() + (hours * 3600000));
  return finish.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildLiveDecisionMetric(coach) {
  if (!coach.checkpoint) {
    return {
      label: "Can I go home yet?",
      value: "Add checkpoint",
      detail: "Enter earnings, miles and trips so the app can judge the day."
    };
  }

  if (coach.remainingToday <= 0) {
    return {
      label: "Can I go home yet?",
      value: "Target protected",
      detail: "Today's target is covered. Continuing is optional."
    };
  }

  if (!coach.forecastAvailable || !coach.showHourlyRate) {
    return {
      label: "Can I go home yet?",
      value: "More data needed",
      detail: "Add another checkpoint after a meaningful earning window."
    };
  }

  if (coach.hoursToTodayTarget > 10) {
    return {
      label: "Can I go home yet?",
      value: "Reassess later",
      detail: "Current pace is not representative enough for a finish estimate."
    };
  }

  const finishTime = formatEstimatedFinish(coach.hoursToTodayTarget);

  return {
    label: "Can I go home yet?",
    value: finishTime ? `Est. finish ${finishTime}` : formatProductiveHours(coach.hoursToTodayTarget),
    detail: `${formatProductiveHours(coach.hoursToTodayTarget)} to cover ${formatMoney(coach.remainingToday)}.`
  };
}

function findNumberFromPatterns(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

function findMilesAfterKeyword(text, keywords) {
  for (const keyword of keywords) {
    const pattern = new RegExp(`${keyword}[\\s\\S]{0,80}?(\\d+(?:\\.\\d+)?)\\s*(?:miles?|mi)`, "i");
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

function getTimeOfDayBand(date = new Date()) {
  const hour = date.getHours();
  if (hour < 10) return "early shift";
  if (hour < 16) return "daytime";
  if (hour < 19) return "peak";
  if (hour < 23) return "evening";
  return "late shift";
}

function getJobDestinationContext(text) {
  const lower = String(text || "").toLowerCase();
  if (/(home|homeward|towards home|near home)/.test(lower)) {
    return { type: "homeward", label: "homeward destination", note: "Homeward jobs can be acceptable near the end of a shift." };
  }
  if (/(airport|birmingham|city centre|core zone|busy area|good area)/.test(lower)) {
    return { type: "good", label: "useful destination", note: "The destination may improve positioning." };
  }
  if (/(out of area|dead miles|deadmile|middle of nowhere|away from|bad area|poor area)/.test(lower)) {
    return { type: "poor", label: "dead-mile risk", note: "The destination may create unpaid miles back." };
  }
  return { type: "neutral", label: "neutral destination", note: "No clear destination benefit or risk was logged." };
}

function getJobReviewInput(text) {
  const raw = String(text || "");
  const lower = raw.toLowerCase();
  const hasJobLanguage = /(job|fare|pickup|pick up|trip|drop|drop-off|offer|accepted|declined|completed|destination|dead miles|airport|home)/i.test(raw);
  const fare = findNumberFromPatterns(raw, [
    /(?:£|gbp\s*)(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:pounds?|quid)\s*(?:job|fare|ride|trip|offer)?/i,
    /(?:fare|payout|paid|job|offer|earn(?:ed|ing)?s?)\s*(?:is|was|=|:|for)?\s*£?\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:fare|payout|paid|job)/i
  ]);
  const pickupMiles = findMilesAfterKeyword(raw, ["pickup", "pick\\s*up", "pu", "from"]) ?? findNumberFromPatterns(raw, [
    /(?:pickup|pick\s*up|pu)\s*(?:miles?|mi)?\s*(?:is|was|=|:)?\s*(\d+(?:\.\d+)?)/i,
    /(?:from|away)\s+[\s\S]{0,50}?(\d+(?:\.\d+)?)\s*(?:miles?|mi)\s*(?:away)?/i,
    /(\d+(?:\.\d+)?)\s*(?:miles?|mi)\s*(?:away)\b/i,
    /(\d+(?:\.\d+)?)\s*(?:miles?|mi)?\s*(?:pickup|pick\s*up|pu)/i
  ]);
  const tripMiles = findMilesAfterKeyword(raw, ["drop\\s*off", "drop", "trip", "journey"]) ?? findNumberFromPatterns(raw, [
    /(?:trip|drop(?:-?off)?|paid|journey)\s*(?:miles?|mi)?\s*(?:is|was|=|:)?\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:miles?|mi)?\s*(?:trip|drop(?:-?off)?|paid|journey)/i
  ]);

  return {
    hasJobLanguage,
    lower,
    fare,
    pickupMiles,
    tripMiles,
    destination: getJobDestinationContext(raw)
  };
}

function getDriverIntentionMode(text) {
  const lower = String(text || "").toLowerCase();
  const splitShift = /\b(go(?:ing)? home|come back later|coming back later|back later|later session|split shift|restart later|home and come back)\b/.test(lower);
  const pause = /\b(break|pause|reset|rest|eat|eating|food|hungry|coffee|stop for a bit)\b/.test(lower);
  const fatigue = /\b(tired|fatigue|drained|not feeling it|frustrated|fed up|stress|head(?:'s| is)? gone|low energy|rubbish)\b/.test(lower);
  const weakMarket = /\b(poor jobs|low jobs|cheap jobs|bad offers|weak offers|jobs offered|trip radar|radar empty|empty|quiet|dead|slow|nothing|rubbish jobs|rubbish offers)\b/.test(lower)
    || /(?:£|gbp|Â£)\s*\d+(?:\.\d+)?\s*(?:jobs?|offers?)/i.test(text || "");

  if (!splitShift && !pause && !fatigue && !weakMarket) {
    return {
      mode: "normal",
      suppressForecast: false,
      reason: ""
    };
  }

  const reasons = [];
  if (splitShift) reasons.push("split shift");
  if (pause) reasons.push("planned pause");
  if (fatigue) reasons.push("energy");
  if (weakMarket) reasons.push("weak market");

  return {
    mode: splitShift ? "split-shift" : fatigue ? "energy" : pause ? "pause" : "weak-market",
    suppressForecast: true,
    reason: reasons.join(", ")
  };
}

function getDriverEmotionMode(text) {
  const lower = String(text || "").toLowerCase();
  const positive = /\b(result|finally|relief|relieved|happy|excellent|brilliant|perfect|lovely|great|nice|good|saved|turned.*around)\b/.test(lower);
  const negative = /\b(frustrat|fed up|tired|drained|quiet|rubbish|poor|annoy|dead|slow|grim|struggl|nothing|not.*happen|not.*click|no rhythm|flow)\b/.test(lower);

  if (positive) {
    return {
      mood: "positive",
      mirror: true,
      hint: "driver sounds positive or relieved"
    };
  }

  if (negative) {
    return {
      mood: "negative",
      mirror: true,
      hint: "driver sounds frustrated, tired, or affected by a weak market"
    };
  }

  return {
    mood: "neutral",
    mirror: false,
    hint: ""
  };
}

function getEnhancedDriverIntentionMode(text) {
  const lower = String(text || "").toLowerCase();
  const splitShift = /\b(go(?:ing)? home|i go home|going back|come back later|coming back later|back later|later session|split shift|restart later|home and come back|calling it|call it|finish(?:ing)?|ending|done for now)\b/.test(lower);
  const pause = /\b(break|pause|reset|rest|eat|eating|food|hungry|need food|coffee|stop for a bit|take five|breather)\b/.test(lower);
  const fatigue = /\b(tired|fatigue|drained|knackered|not feeling it|not feeling good|not feel good|not well|ill|dizzy|unwell|not safe|unsafe|falling asleep|sleepy|frustrated|fed up|can't be bothered|cant be bothered|stress|head(?:'s| is)? gone|head gone|low energy|rubbish|demoralised|demoralized)\b/.test(lower);
  const weakMarket = /\b(poor jobs|low jobs|cheap jobs|bad fares|bad offers|weak offers|jobs offered|job no good|no job|no jobs|no job for long time|trip radar|radar empty|empty|quiet|dead|dead out here|slow|nothing|nothing coming|can't get rhythm|cant get rhythm|no rhythm|no flow|rubbish jobs|rubbish offers)\b/.test(lower)
    || /(?:£|gbp)\s*\d+(?:\.\d+)?\s*(?:jobs?|offers?)/i.test(text || "");

  if (!splitShift && !pause && !fatigue && !weakMarket) {
    return getDriverIntentionMode(text);
  }

  const reasons = [];
  if (splitShift) reasons.push("split shift");
  if (pause) reasons.push("planned pause");
  if (fatigue) reasons.push("energy or wellbeing");
  if (weakMarket) reasons.push("weak market");

  return {
    mode: splitShift ? "split-shift" : fatigue ? "energy" : pause ? "pause" : "weak-market",
    suppressForecast: true,
    reason: reasons.join(", ")
  };
}

function getEnhancedDriverEmotionMode(text) {
  const lower = String(text || "").toLowerCase();
  const positive = /\b(result|finally|relief|relieved|happy|excellent|brilliant|perfect|lovely|great|nice|good|saved|turned.*around|happy with that|back to back|busy|surge)\b/.test(lower);
  const negative = /\b(frustrat|fed up|tired|drained|knackered|ill|dizzy|unwell|not safe|quiet|rubbish|poor|annoy|dead|slow|grim|struggl|nothing|not.*happen|not.*click|no rhythm|can't get rhythm|cant get rhythm|flow|head gone|can't be bothered|cant be bothered|demoralised|demoralized)\b/.test(lower);

  if (positive || negative) {
    return {
      mood: positive ? "positive" : "negative",
      mirror: true,
      hint: positive
        ? "driver sounds positive, relieved, or encouraged"
        : "driver sounds frustrated, tired, unwell, or affected by a weak market"
    };
  }

  return getDriverEmotionMode(text);
}

function getDriverLanguageSignals(text) {
  const lower = String(text || "").toLowerCase();
  const brokenEnglish = /\b(i go home|no job|job no good|too much miles|not feel good|no job for long time)\b/.test(lower);
  const slang = /\b(knackered|fed up|dead out here|head gone|calling it|quid|pick|drop)\b/.test(lower);
  const unsafe = /\b(not safe|unsafe|dizzy|ill|unwell|falling asleep|sleepy|can't focus|cant focus|cannot focus|too angry|seeing red)\b/.test(lower);
  const celebration = /\b(result|happy with that|excellent|brilliant|saved|finally|back to back)\b/.test(lower);
  const jobReview = /\b(pick|pickup|drop|drop off|airport run|multi stop|dead miles|fare|job|accepted|declined|passed)\b/.test(lower);
  const decision = /\b(shall i|should i|move|go home|finish|calling it|one more job|break|pause|continue|stay out)\b/.test(lower);
  const mentalFatigueSevere = /\b(head gone|can't think|cant think|can't focus|cant focus|cannot focus|fed up|can't be bothered|cant be bothered|done in|had enough|mentally done)\b/.test(lower);
  const mentalFatigueModerate = /\b(can't get rhythm|cant get rhythm|no rhythm|not feeling it|nothing is clicking|can't get going|cant get going|drained|knackered|rubbish day|grinding me down)\b/.test(lower);
  const reassuranceNeed = /\b(is it ok|am i ok|should i stop|can i go home|feel bad stopping|calling it|going home|not worth it|protect energy|come back later)\b/.test(lower);
  const capacityLow = unsafe || /\b(exhausted|too tired|not right|not feeling right|not feel right)\b/.test(lower);

  return {
    driverState: unsafe
      ? "unsafe_to_drive"
      : /\b(ill|unwell|dizzy|not feel good|not feeling good)\b/.test(lower)
        ? "unwell"
        : /\b(tired|knackered|drained|sleepy|need break|need food)\b/.test(lower)
          ? "fatigued"
          : /\b(fed up|frustrat|head gone|can't be bothered|cant be bothered)\b/.test(lower)
            ? "frustrated"
            : "",
    conversationPurpose: unsafe
      ? "reassurance"
      : celebration
        ? "celebration"
        : jobReview
          ? "job_review"
          : decision
            ? "decision"
            : /\b(rubbish|quiet|dead|nothing|bad fares|can't get rhythm|cant get rhythm)\b/.test(lower)
              ? "venting"
              : "",
    languageQuality: brokenEnglish && slang
      ? "mixed"
      : brokenEnglish
        ? "broken_english"
        : slang
          ? "slang"
          : String(text || "").trim().split(/\s+/).length <= 4
            ? "short_note"
            : "clear",
    safetySignal: unsafe ? "stop_now" : /\b(angry|rage|not concentrating|bad headache)\b/.test(lower) ? "caution" : "none",
    mentalFatigue: mentalFatigueSevere ? "severe" : mentalFatigueModerate ? "moderate" : /\b(tired|slow|flat)\b/.test(lower) ? "mild" : "none",
    reassuranceNeed: reassuranceNeed ? "high" : decision ? "medium" : "none",
    driverCapacity: capacityLow ? "unsafe" : mentalFatigueSevere ? "low" : mentalFatigueModerate ? "reduced" : "full"
  };
}

function getCoachOutcomeFromSignals(text, coach) {
  const lower = String(text || "").toLowerCase();
  const languageSignals = getDriverLanguageSignals(text);
  const driverIntent = getEnhancedDriverIntentionMode(text);

  if (languageSignals.driverState === "unsafe_to_drive" || languageSignals.driverState === "unwell" || languageSignals.safetySignal === "stop_now" || languageSignals.driverCapacity === "unsafe") {
    return { outcome: "finish_shift", confidence: "high" };
  }

  if (languageSignals.driverCapacity === "low" || languageSignals.mentalFatigue === "severe") {
    return { outcome: "take_break", confidence: "high" };
  }

  if (driverIntent.mode === "split-shift" || /\b(go home|going home|calling it|finish|done for now|end shift)\b/.test(lower)) {
    return { outcome: "finish_shift", confidence: languageSignals.reassuranceNeed === "high" ? "high" : "medium" };
  }

  if (driverIntent.mode === "pause" || /\b(break|pause|food|eat|reset|rest)\b/.test(lower)) {
    return { outcome: "take_break", confidence: "medium" };
  }

  if (/\b(move|reposition|area|birmingham|town|city|airport)\b/.test(lower)) {
    return { outcome: "move_area", confidence: "medium" };
  }

  if (coach?.remainingToday <= 0) {
    return { outcome: "finish_shift", confidence: "medium" };
  }

  if (coach?.forecastAvailable && coach.hoursToTodayTarget > 0 && coach.hoursToTodayTarget <= 1.5) {
    return { outcome: "stay", confidence: "medium" };
  }

  return { outcome: "unknown", confidence: "low" };
}

function buildEmotionalCoachReply(text, emotion, coach) {
  const lower = String(text || "").toLowerCase();

  if (emotion.mood === "positive") {
    return "Nice one. That sounds like the lift the shift needed. Take the confidence from it, let it reset the mood, and use the next checkpoint to decide whether to keep pushing or bank the momentum.";
  }

  if (emotion.mood === "negative") {
    if (/(tired|drained|fed up|frustrat|not feeling)/.test(lower)) {
      return "Fair enough. Some windows just wear you down. Take a proper reset, protect your energy, and reassess when you feel ready rather than forcing the shift from a flat place.";
    }

    return "I get it. Some shifts feel like hard work when you cannot find any rhythm. Do not judge the whole day on one poor patch; keep calm, reset if needed, and see what the next window brings.";
  }

  return coach?.message || "I hear you. Keep the next decision simple and reassess at the next checkpoint.";
}

function isSpecificJobReviewPrompt(text, job) {
  const lower = String(text || "").toLowerCase();
  const hasSpecificAction = /\b(accepted|declined|rejected|passed|completed|took|taken|did it|didn'?t take|let it go|last job|that job|this job)\b/.test(lower);
  const asksForReview = /\b(review|worth|good|bad|reasonable|should|would you|fair|right call|decision|accept|decline|take it|pass)\b/.test(lower);
  const hasSpecificJobDetail = [job?.pickupMiles, job?.tripMiles].some((value) => value !== null)
    || /\b(drop|drop off|drop-off|pickup|pick up|from .+ miles|to .+ miles)\b/.test(lower);
  const genericMarketNote = getDriverIntentionMode(text).suppressForecast
    && !hasSpecificAction
    && !hasSpecificJobDetail;

  return !genericMarketNote && hasSpecificAction && asksForReview && (job?.fare !== null || hasSpecificJobDetail);
}

function getPerMileBand(value) {
  if (value >= 1.3) return { label: "strong", score: 3 };
  if (value >= 1) return { label: "acceptable", score: 2 };
  if (value >= 0.8) return { label: "borderline", score: 1 };
  return { label: "poor", score: 0 };
}

function getPickupBand(value) {
  if (value <= 1) return { label: "good", score: 3 };
  if (value <= 2) return { label: "acceptable", score: 2 };
  if (value <= 3) return { label: "borderline", score: 1 };
  return { label: "poor", score: 0 };
}

function calculateLoggedJobMetrics(prompt) {
  const job = getJobReviewInput(prompt);
  const hasAnyJobValue = [job.fare, job.pickupMiles, job.tripMiles].some((value) => value !== null);

  if (!job.hasJobLanguage && !hasAnyJobValue) return null;

  if (job.fare === null || job.pickupMiles === null || job.tripMiles === null) {
    if (!isSpecificJobReviewPrompt(prompt, job)) return null;
    return {
      incomplete: true,
      missingMessage: "I can review the job, but I need three figures: fare, pickup miles, and trip/drop-off miles. Example: £5 fare, 2 pickup miles, 5 trip miles.",
      fare: job.fare,
      pickupMiles: job.pickupMiles,
      tripMiles: job.tripMiles,
      destination: job.destination
    };
  }

  if (job.fare <= 0 || job.pickupMiles < 0 || job.tripMiles <= 0) {
    return {
      incomplete: true,
      missingMessage: "I can only review the job if fare and trip miles are above zero, and pickup miles are not negative.",
      fare: job.fare,
      pickupMiles: job.pickupMiles,
      tripMiles: job.tripMiles,
      destination: job.destination
    };
  }

  const totalMiles = job.pickupMiles + job.tripMiles;
  const poundsPerTripMile = job.fare / job.tripMiles;
  const poundsPerTotalMile = job.fare / totalMiles;
  const totalBand = getPerMileBand(poundsPerTotalMile);
  const pickupBand = getPickupBand(job.pickupMiles);

  return {
    fare: job.fare,
    pickupMiles: job.pickupMiles,
    tripMiles: job.tripMiles,
    totalMiles,
    poundsPerTripMile,
    poundsPerTotalMile,
    totalMileBand: totalBand.label,
    pickupBand: pickupBand.label,
    destination: job.destination,
    incomplete: false
  };
}

function buildJobDecisionReview(prompt, coach) {
  const metrics = calculateLoggedJobMetrics(prompt);
  if (!metrics) return "";
  if (metrics.incomplete) return metrics.missingMessage;

  const totalBand = getPerMileBand(metrics.poundsPerTotalMile);
  const pickupBand = getPickupBand(metrics.pickupMiles);
  const lower = String(prompt || "").toLowerCase();
  const quietContext = /quiet|slow|dead|waiting|nothing/i.test(prompt) || coach.label === "Slow Start" || coach.label === "Stay Available";
  const nearFinishContext = /finish|last|home|homeward|end/i.test(prompt) || metrics.destination.type === "homeward";
  const declined = /declin|reject|passed|pass|didn'?t take|not take|let.*go/.test(lower);
  const accepted = /accept|took|taken|completed|did it|doing it/.test(lower);
  let opener = "Fair enough.";

  if (declined && metrics.poundsPerTotalMile < 1) {
    opener = "Reasonable decline.";
  } else if (accepted && quietContext) {
    opener = "Understandable decision.";
  } else if (accepted && totalBand.score >= 2) {
    opener = "Reasonable job.";
  } else if (accepted) {
    opener = "Keeping momentum makes sense.";
  } else if (totalBand.score >= 3 && pickupBand.score >= 2) {
    opener = "Looks decent.";
  }

  const milePhrase = metrics.poundsPerTotalMile < 0.8
    ? "is quite a lot of miles for the money"
    : metrics.poundsPerTotalMile < 1
      ? "is not especially attractive, but no disaster"
      : "looks workable";
  const destinationNote = metrics.destination.type === "neutral" ? "" : ` ${metrics.destination.note}`;
  const contextNote = quietContext
    ? " Quiet conditions make keeping some momentum more understandable."
    : nearFinishContext
      ? " Near the end of a shift, positioning can matter as much as pure efficiency."
      : "";
  const shiftContext = coach.forecastAvailable
    ? ` You're at ${formatMoney(coach.earnings)} with ${formatMoney(coach.remainingToday)} left today, so keep weighing jobs against positioning.`
    : "";

  return `${opener} That's about ${formatNumber(metrics.totalMiles, 1)} miles for ${formatMoney(metrics.fare)}, so it ${milePhrase} once pickup is included.${destinationNote}${contextNote}${shiftContext} No need to overthink it; reassess after the next checkpoint.`;
}

function getRecentCoachConversation(shift) {
  const interactions = Array.isArray(shift?.coach_interactions) ? shift.coach_interactions : [];
  return interactions.slice(0, 4).map((interaction) => ({
    driverNote: interaction.driver_note || "",
    coachReply: interaction.coach_reply || "",
    messageType: interaction.message_type || "",
    emotionalTone: interaction.emotional_tone || "",
    intent: interaction.driver_intent || "",
    marketCondition: interaction.market_condition || "",
    driverState: interaction.driver_state || "",
    conversationPurpose: interaction.conversation_purpose || "",
    languageQuality: interaction.language_quality || "",
    safetySignal: interaction.safety_signal || "",
    mentalFatigue: interaction.mental_fatigue || "",
    reassuranceNeed: interaction.reassurance_need || "",
    driverCapacity: interaction.driver_capacity || ""
  }));
}

function renderCoachHistory(shift) {
  const interactions = Array.isArray(shift?.coach_interactions) ? shift.coach_interactions : [];
  const recent = interactions.slice(0, 8).reverse();

  if (!recent.length) {
    return `<div class="live-coach-history__empty">No coach messages yet.</div>`;
  }

  return recent.map((interaction) => `
    <article class="live-coach-history__item">
      <p class="live-coach-history__driver">${escapeHtml(interaction.driver_note || "")}</p>
      <p class="live-coach-history__coach">${escapeHtml(interaction.coach_reply || "")}</p>
    </article>
  `).join("");
}

function scrollCoachHistoryToLatest() {
  window.setTimeout(() => {
    const history = document.querySelector(".live-coach-history");
    if (!history) return;
    history.scrollTop = history.scrollHeight;
  }, 0);
}

function buildCoachApiPayload(driverNote, shift, coach, summary) {
  const latestCheckpoint = coach.checkpoint;
  const driverIntent = getEnhancedDriverIntentionMode(driverNote);
  const driverEmotion = getEnhancedDriverEmotionMode(driverNote);
  const languageSignals = getDriverLanguageSignals(driverNote);

  return {
    driverNote,
    recentConversation: getRecentCoachConversation(shift),
    cueHints: {
      emotion: driverEmotion.hint,
      intention: driverIntent.reason,
      suppressForecast: driverIntent.suppressForecast,
      driverState: languageSignals.driverState,
      conversationPurpose: languageSignals.conversationPurpose,
      languageQuality: languageSignals.languageQuality,
      safetySignal: languageSignals.safetySignal,
      mentalFatigue: languageSignals.mentalFatigue,
      reassuranceNeed: languageSignals.reassuranceNeed,
      driverCapacity: languageSignals.driverCapacity
    },
    shift: {
      startTime: formatShiftTime(shift.start_time),
      plannedFinish: normaliseTimeValue(shift.planned_finish_time),
      earnings: coach.earnings,
      miles: coach.miles,
      trips: coach.tripsCompleted,
      elapsedHours: Number(coach.elapsedHours.toFixed(2)),
      todayTarget: Number(coach.todayGoal.toFixed(2)),
      targetRemaining: Number(coach.remainingToday.toFixed(2)),
      currentPace: Number(coach.hourlyRate.toFixed(2)),
      dayForecast: Number(coach.projectedDay.toFixed(2)),
      weekForecast: Number(coach.projectedWeek.toFixed(2)),
      status: coach.label,
      timeOfDay: getTimeOfDayBand(),
      plannedFinishTime: normaliseTimeValue(shift.planned_finish_time),
      latestCheckpointTime: latestCheckpoint ? formatShiftTime(latestCheckpoint.timestamp) : "",
      forecastAvailable: coach.forecastAvailable
    },
    weekly: {
      weeklyEarned: summary.earned,
      floorTarget: TARGET_LEVELS[0].value,
      mainTarget: TARGET_LEVELS[1].value,
      stretchTarget: TARGET_LEVELS[2].value,
      selectedTarget: summary.target,
      targetRemaining: summary.remaining,
      daysRemaining: summary.remainingWorkDays,
      planningHourlyRate: summary.planningHourlyRate
    }
  };
}

async function requestCoachApi(payload) {
  let lastError = null;

  for (const endpoint of COACH_API_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3500);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Coach backend unavailable.");
      }

      return {
        coachReply: String(data.coachReply || "").trim(),
        extractedJob: data.extractedJob || null,
        calculatedJob: data.calculatedJob || null
      };
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("Coach backend unavailable.");
}

function buildLiveCoachDialogueReply(prompt, coach) {
  const text = String(prompt || "").trim();
  const lower = text.toLowerCase();
  const driverIntent = getEnhancedDriverIntentionMode(text);
  const driverEmotion = getEnhancedDriverEmotionMode(text);
  const languageSignals = getDriverLanguageSignals(text);
  const coachOutcome = getCoachOutcomeFromSignals(text, coach);

  if (!text) {
    return "Tell me what you are weighing up: stay out, move area, take a break, or finish. I will keep it practical and calm.";
  }

  if (driverEmotion.mood === "positive") {
    return buildEmotionalCoachReply(text, driverEmotion, coach);
  }

  if (languageSignals.driverState === "unsafe_to_drive" || languageSignals.driverState === "unwell" || languageSignals.safetySignal === "stop_now" || languageSignals.driverCapacity === "unsafe") {
    return "Yes, call it. If you are not feeling right, do not force the shift; go home, rest, and only restart when you feel safe.";
  }

  if (languageSignals.mentalFatigue === "severe" || languageSignals.driverCapacity === "low") {
    return "Fair enough, that sounds like your head is getting full. Take the pressure off, have a proper reset, and only make the next decision when you feel clear again.";
  }

  const jobReview = buildJobDecisionReview(text, coach);
  if (jobReview) return jobReview;

  if (driverEmotion.mood === "negative" && !isSpecificJobReviewPrompt(text, getJobReviewInput(text))) {
    return buildEmotionalCoachReply(text, driverEmotion, coach);
  }

  if (driverIntent.suppressForecast) {
    if (driverIntent.mode === "split-shift") {
      return "Fair enough. The work on offer sounds weak, and splitting the shift is a sensible way to protect energy. Go home, reset properly, and see what the later session brings. No need to force low-value jobs through a poor patch.";
    }

    if (driverIntent.mode === "energy" || driverIntent.mode === "pause") {
      return "Listen to that. If your energy is dipping, take a proper reset before making the next decision. The aim is not to grind through every weak window; it is to stay sharp enough to use the better ones.";
    }

    return "Fair enough. Poor offers are information too. Keep your standards, avoid forcing low-value work, and reassess after a short reset or the next useful area. No need to overthink a weak patch.";
  }

  if (/(trip radar|empty|quiet|dead|not feeling it|nothing|slow|jobs offered)/.test(lower)) {
    return "Fair enough. If it feels quiet and the offers are not worth chasing, keep it simple: take a short reset, stay available, and see what the next area brings. No need to force low-value work just because the app is quiet.";
  }

  if (!coach.checkpoint) {
    return "I need one checkpoint before I can judge the shift. Add current earnings and business miles, then I can give you a useful read.";
  }

  if (!coach.forecastAvailable) {
    if (coachOutcome.confidence === "low") {
      return "It is too early for the numbers to tell the whole story. I'd treat this as a feel check for now: stay calm, protect your energy, and reassess after one cleaner checkpoint.";
    }

    return "It is too early for the numbers to tell the whole story. Treat this as a feel check for now: stay calm, protect your energy, and let the next useful bit of work give us a clearer read.";
  }

  const targetProtected = coach.remainingToday <= 0;
  const paceText = coach.showHourlyRate ? `${formatMoney(coach.hourlyRate)}/hr` : "a building pace";
  const mileText = coach.showGrossPerMile ? `${formatMoney(coach.grossPerMile)}/mi` : "mileage data still building";

  if (/(stop|finish|home|done|enough|quit|carry on|continue|stay out)/.test(lower)) {
    if (targetProtected) {
      return `Today's target is protected, so finishing is a perfectly fair option. If you stay out, make it for good work rather than habit.`;
    }

    if (coach.hoursToTodayTarget > 10) {
      return "The pace is not giving us a fair read yet. If the work feels flat, reset for a bit or move with a simple plan. No need to turn one awkward patch into a verdict on the whole day.";
    }

    return `There is still ${formatMoney(coach.remainingToday)} to find today. If you feel steady, stay out for one cleaner earning window; if the next patch is flat, move area or take a reset.`;
  }

  if (/(move|reposition|area|quiet|dead|slow|airport|town|city)/.test(lower)) {
    if (coach.recentHourlyRate > 0 && coach.recentHourlyRate < coach.hourlyRate * 0.65) {
      return "Fair enough. If the area has gone flat, a short reset or a controlled move makes sense. Keep it practical: do not chase miles just because the app has gone quiet.";
    }

    return `I hear you. The shift is reading ${paceText}, but the feel of the road matters too. If the local work feels stale, reposition with a mileage limit rather than chasing anything that appears.`;
  }

  if (/(mile|miles|per mile|fuel|distance|far)/.test(lower)) {
    if (coach.grossPerMile > 0 && coach.grossPerMile < 0.9) {
      return `Mileage is the thing to watch here: ${mileText} is not giving you much room. Keep the next move controlled and avoid chasing long pickups unless the fare really makes sense.`;
    }

    return `Mileage looks workable at ${mileText}. Keep an eye on dead miles, but the bigger decision is whether the area still feels alive.`;
  }

  if (/(target|week|weekly|today|recover|behind|ahead|buffer)/.test(lower)) {
    if (targetProtected) {
      return `Today is protected, so extra work is about building buffer rather than rescuing the target. Stay only if the work feels worth your energy.`;
    }

    if (coach.hoursToTodayTarget > 10) {
      return `The target gap is still there, but current pace is not representative enough to turn into an hours plan. Reassess after the next meaningful checkpoint.`;
    }

    return `The day is still recoverable, but keep it simple. You need about ${formatProductiveHours(coach.hoursToTodayTarget)} at this pace, so give yourself one clear checkpoint before deciding whether to stay or reset.`;
  }

  if (/(break|pause|tired|fatigue|hungry|stress|head|focus)/.test(lower)) {
    if (targetProtected) {
      return "A break or finish is sensible if concentration is dropping. You have already protected the day, so the next decision can favour tomorrow.";
    }

    if (coach.hoursToTodayTarget > 10) {
      return "If focus is fading, take a planned pause and protect the next earning window. Current pace is too weak to turn into a sensible hours estimate, so reset first and reassess later.";
    }

    return `If focus is fading, take a proper break rather than dragging the shift. You can reassess with a clearer head and decide whether to stay out or finish.`;
  }

  if (targetProtected) {
    return "You have protected the day, so the next decision can be about energy rather than pressure. Stay only for worthwhile work, otherwise finishing is a disciplined call.";
  }

  return `Keep it simple from here: stay available if the area still feels alive, or move/reset if it feels stale. Current pace is around ${paceText}, so use the next checkpoint as the decision point.`;
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
    const strongPace = forecastAvailable && hourlyRate >= planningRate * 1.1;

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
      label = "Session Complete";
      category = "targetAchieved";
    } else if (recoveryUnlikely) {
      tone = "amber";
      label = "Review Window";
      category = "recoveryUnlikely";
    } else if (weakShift) {
      tone = "amber";
      label = "Slow Start";
      category = "weak";
    } else if (quietPatch) {
      tone = "amber";
      label = "Stay Available";
      category = "quietPatch";
    } else if (recoveryPossible) {
      tone = "amber";
      label = "Recoverable Shift";
      category = "recovery";
    } else if (strongPace) {
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
      tone = "amber";
      label = "Building Momentum";
      category = "weeklyPressure";
    }

    if (!paused && forecastAvailable && !isFirstCheckpoint && elapsedHours >= 6 && tone !== "red" && !dailyTargetAchieved) {
      tone = "amber";
      label = "Review Window";
      category = "quietPatch";
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
    tripsCompleted
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
  const actionIcon = coach.paused ? "play" : "pause";
  const actionTitle = coach.paused ? "Resume shift" : "Pause shift";
  const actionName = coach.paused ? "resume" : "pause";
  node.innerHTML = `
    <section class="live-shift-panel live-shift-panel--active live-shift-panel--${coach.tone}">
      <div class="live-shift-coach">
        <div class="live-shift-bars">
          <div>
            <span>${escapeHtml(coach.todayProgressLabel)}</span>
            <div class="live-shift-track"><i style="width: ${coach.todayProgress}%"></i></div>
            <b>${escapeHtml(coach.todayProgressText)}</b>
          </div>
        </div>

        <section class="live-shift-section live-shift-section--chat" aria-label="Coach chat">
          <div class="live-shift-section__title">
            <span>Coach</span>
            <button class="live-coach-clear" type="button" data-live-shift-action="clear-coach-chat" ${shift.coach_interactions?.length ? "" : "disabled"}>
              Clear
            </button>
          </div>
          <div class="live-coach-dialogue">
            <div class="live-coach-history" aria-label="Coach conversation history">
              ${renderCoachHistory(shift)}
            </div>
            <form class="live-driver-notes" data-live-coach-form>
              <label class="sr-only" for="live_shift_notes">Message coach</label>
              <span class="live-chat-composer">
                <textarea id="live_shift_notes" rows="1" autocomplete="off" autocapitalize="sentences" spellcheck="true" placeholder="Message coach">${escapeHtml(shift.driver_notes)}</textarea>
                <button class="live-chat-send" type="button" data-live-shift-action="ask-coach" aria-label="Send coach message">
                  <span aria-hidden="true"></span>
                </button>
              </span>
            </form>
          </div>
        </section>

        <section class="live-shift-section live-shift-section--checkpoint" aria-label="Shift checkpoint">
          <div class="live-shift-section__title">
            <span>Checkpoint</span>
            <b>Earnings / miles / trips</b>
          </div>
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
          </form>
        </section>
      </div>

      <div class="live-shift-controls" aria-label="Shift controls">
        <button class="live-shift-control-button" type="submit" form="live_shift_form" title="Save checkpoint" aria-label="Save checkpoint" ${coach.paused ? "disabled" : ""}>
          <span class="live-control-icon live-control-icon--record" aria-hidden="true"></span>
        </button>
        <button class="live-shift-control-button" type="button" data-live-shift-action="${actionName}" title="${actionTitle}" aria-label="${actionTitle}">
          <span class="live-control-icon live-control-icon--${actionIcon}" aria-hidden="true"></span>
        </button>
        <button class="live-shift-control-button" type="button" data-live-shift-action="end" title="End shift" aria-label="End shift">
          <span class="live-control-icon live-control-icon--stop" aria-hidden="true"></span>
        </button>
      </div>
    </section>
  `;

  syncLiveShiftTimer(true);
  resizeCoachTextarea();
  scrollCoachHistoryToLatest();
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

    if (isCoachInputActive()) return;
    renderWeeklyTarget(currentWeekDays);
  }, 30000);
}

function isCoachInputActive() {
  return document.activeElement?.id === "live_shift_notes";
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
    checkpoints: [],
    driver_notes: "",
    coach_reply: ""
  });

  renderWeeklyTarget(currentWeekDays);
  showStatus("Live shift started.", "success");
}

function pauseLiveShift() {
  const shift = readActiveShift();
  if (!shift || isLiveShiftPaused(shift)) return;

  writeActiveShift({
    ...shift,
    driver_notes: readDriverNotesInput() || shift.driver_notes || "",
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
    driver_notes: readDriverNotesInput() || shift.driver_notes || "",
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

function readLiveCheckpointInput(shift) {
  const earnings = toNumber(document.getElementById("live_checkpoint_earnings")?.value);
  const miles = toNumber(document.getElementById("live_checkpoint_miles")?.value);
  const trips = toNumber(document.getElementById("live_checkpoint_trips")?.value) ?? 0;

  if (earnings === null || earnings < 0) {
    showStatus("Enter current Uber earnings.", "error");
    return null;
  }

  if (miles === null || miles < 0) {
    showStatus("Enter current business miles.", "error");
    return null;
  }

  if (trips < 0 || !Number.isInteger(trips)) {
    showStatus("Enter whole trips completed.", "error");
    return null;
  }

  const previousCheckpoint = getLastCheckpoint(shift);
  if (previousCheckpoint) {
    const previousEarnings = Number(previousCheckpoint.earnings || 0);
    const previousMiles = Number(previousCheckpoint.business_miles || 0);
    const previousTrips = Number(previousCheckpoint.trips_completed || 0);

    if (earnings < previousEarnings) {
      showStatus("Current earnings are lower than the previous checkpoint. Start a new shift or correct the value.", "error");
      return null;
    }

    if (miles < previousMiles) {
      showStatus("Business miles are lower than the previous checkpoint. Check the current total.", "error");
      return null;
    }

    if (trips < previousTrips) {
      showStatus("Trips completed are lower than the previous checkpoint. Check the current total.", "error");
      return null;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    earnings,
    business_miles: miles,
    trips_completed: trips
  };
}

async function endLiveShift(button = null) {
  const shift = readActiveShift();
  if (!shift) return;
  const fieldCheckpoint = isLiveShiftPaused(shift) ? null : readLiveCheckpointInput(shift);
  if (!fieldCheckpoint && !isLiveShiftPaused(shift)) return;
  const previousCheckpoint = getLastCheckpoint(shift);
  const shouldAppendCheckpoint = fieldCheckpoint && (
    !previousCheckpoint ||
    Number(previousCheckpoint.earnings || 0) !== Number(fieldCheckpoint.earnings || 0) ||
    Number(previousCheckpoint.business_miles || 0) !== Number(fieldCheckpoint.business_miles || 0) ||
    Number(previousCheckpoint.trips_completed || 0) !== Number(fieldCheckpoint.trips_completed || 0)
  );
  const checkpoint = shouldAppendCheckpoint ? fieldCheckpoint : previousCheckpoint;

  if (!checkpoint) {
    showStatus("Add a checkpoint before ending the shift.", "error");
    return;
  }

  const originalButtonText = button?.textContent || "End Shift";
  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }

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

  const completedShift = {
    ...shift,
    driver_notes: readDriverNotesInput() || shift.driver_notes || "",
    paused_at: "",
    pauses,
    checkpoints: shouldAppendCheckpoint ? [...shift.checkpoints, fieldCheckpoint] : shift.checkpoints,
    end_time: now
  };

  const payload = await buildLiveShiftDayPayload(completedShift);
  const validationError = validateDay(payload);

  if (validationError) {
    showStatus(validationError, "error");
    if (button) {
      button.disabled = false;
      button.textContent = originalButtonText;
    }
    return;
  }

  const result = await saveSessionPayload(payload, {
    savingMessage: "Ending shift and saving session...",
    successMessage: "Shift ended and session saved successfully.",
    syncErrorMessage: "Shift saved, but Google Sheets sync failed."
  });

  if (!result.ok) {
    if (button) {
      button.disabled = false;
      button.textContent = originalButtonText;
    }
    return;
  }

  archiveLiveShift(completedShift);
  clearActiveShift();
  clearDayForm();
  await loadWeekDays();
  await loadMonthSummary();
  renderWeeklyTarget(currentWeekDays);
}

function saveLiveCheckpoint(event) {
  event.preventDefault();

  const shift = readActiveShift();
  if (!shift) {
    showStatus("Start a shift before adding a checkpoint.", "error");
    return;
  }

  const checkpoint = readLiveCheckpointInput(shift);
  if (!checkpoint) return;

  const nextShift = {
    ...shift,
    driver_notes: readDriverNotesInput(),
    checkpoints: [
      ...shift.checkpoints,
      checkpoint
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
    void endLiveShift(button);
  } else if (button.dataset.liveShiftAction === "ask-coach") {
    void askLiveShiftCoach(button);
  } else if (button.dataset.liveShiftAction === "new-coach-message") {
    startNewCoachMessage();
  } else if (button.dataset.liveShiftAction === "clear-coach-chat") {
    clearLiveCoachChat();
  }
}

function handleLiveShiftSubmit(event) {
  const coachForm = event.target.closest("[data-live-coach-form]");
  if (coachForm) {
    event.preventDefault();
    return;
  }

  if (!event.target.closest("[data-live-shift-form]")) return;
  saveLiveCheckpoint(event);
}

function handleLiveShiftKeydown(event) {
  if (event.target?.id !== "live_shift_notes") return;
  if (event.key !== "Enter") return;
  if (event.shiftKey) return;
  const likelyTouchKeyboard = window.matchMedia?.("(pointer: coarse)")?.matches;
  if (likelyTouchKeyboard || event.isComposing) {
    event.stopPropagation();
    return;
  }

  event.preventDefault();
  const sendButton = el(ids.liveShiftCard)?.querySelector(".live-chat-send");
  if (sendButton) void askLiveShiftCoach(sendButton);
}

function handleLiveShiftInputFocus(event) {
  const input = event.target.closest("#live_checkpoint_earnings, #live_checkpoint_miles, #live_checkpoint_trips");
  if (!input || input.disabled) return;
  window.setTimeout(() => input.select(), 0);
}

function resizeCoachTextarea(textarea = document.getElementById("live_shift_notes")) {
  if (!textarea) return;
  if (textarea.tagName !== "TEXTAREA") return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(84, Math.max(32, textarea.scrollHeight))}px`;
}

function handleLiveShiftNotesFocus(event) {
  if (event.target?.id !== "live_shift_notes") return;
  scrollCoachHistoryToLatest();
}

function handleLiveShiftNotesInput(event) {
  if (event.target?.id !== "live_shift_notes") return;
}

function startNewCoachMessage(options = {}) {
  const shift = readActiveShift();
  if (!shift) return;

  writeActiveShift({
    ...shift,
    driver_notes: "",
    coach_reply: "",
    coach_draft_status: "draft"
  });
  renderWeeklyTarget(currentWeekDays);

  if (options.focus) {
    window.setTimeout(() => {
      const textarea = document.getElementById("live_shift_notes");
      textarea?.focus();
      resizeCoachTextarea(textarea);
    }, 0);
  }
}

function clearLiveCoachChat() {
  const shift = readActiveShift();
  if (!shift) return;

  writeActiveShift({
    ...shift,
    driver_notes: "",
    coach_reply: "",
    coach_draft_status: "",
    coach_interactions: []
  });

  renderWeeklyTarget(currentWeekDays);
  showStatus("Coach chat cleared.", "success");
}

function getCurrentLiveShiftSummary() {
  if (!currentWeekRange?.startIso) return null;
  const settings = readTargetSettings(currentWeekRange.startIso);
  const weekDates = getWeekDates(currentWeekRange.startIso);
  return buildWeeklyTargetSummary(currentWeekDays, settings, weekDates);
}

function buildCoachInteractionRecord(driverNote, coachReply, payload, source, apiResult = null) {
  const extractedJob = apiResult?.extractedJob || {};
  const calculatedJob = apiResult?.calculatedJob || {};
  const fallbackJob = calculateLoggedJobMetrics(driverNote);
  const fallbackOutcome = getCoachOutcomeFromSignals(driverNote, null);
  return {
    id: `coach-${Date.now()}`,
    shift_id: payload.shift?.startTime || "",
    checkpoint_id: payload.shift?.latestCheckpointTime || null,
    created_at: new Date().toISOString(),
    driver_note: driverNote,
    coach_reply: coachReply,
    parsed_fare: calculatedJob.fare ?? extractedJob.fare ?? fallbackJob?.fare ?? null,
    pickup_miles: calculatedJob.pickupMiles ?? extractedJob.pickupMiles ?? fallbackJob?.pickupMiles ?? null,
    trip_miles: calculatedJob.tripMiles ?? extractedJob.tripMiles ?? fallbackJob?.tripMiles ?? null,
    total_miles: calculatedJob.totalMiles ?? fallbackJob?.totalMiles ?? null,
    pounds_per_total_mile: calculatedJob.poundsPerTotalMile ?? fallbackJob?.poundsPerTotalMile ?? null,
    shift_earnings: payload.shift?.earnings ?? null,
    shift_elapsed_hours: payload.shift?.elapsedHours ?? null,
    shift_pace: payload.shift?.currentPace ?? null,
    target_remaining: payload.shift?.targetRemaining ?? null,
    status_label: payload.shift?.status || "",
    extracted_action: extractedJob.action || "",
    extracted_context: extractedJob.context || "",
    message_type: extractedJob.messageType || "",
    emotional_tone: extractedJob.emotion || payload.cueHints?.emotion || "",
    driver_intent: extractedJob.intent || payload.cueHints?.intention || "",
    market_condition: extractedJob.marketCondition || "",
    primary_emotion: extractedJob.primaryEmotion || extractedJob.emotion || payload.cueHints?.emotion || "",
    secondary_emotion: extractedJob.secondaryEmotion || "",
    driver_state: extractedJob.driverState || payload.cueHints?.driverState || "",
    conversation_purpose: extractedJob.conversationPurpose || payload.cueHints?.conversationPurpose || "",
    language_quality: extractedJob.languageQuality || payload.cueHints?.languageQuality || "",
    recommended_outcome: extractedJob.recommendedOutcome || fallbackOutcome.outcome,
    advice_confidence: extractedJob.adviceConfidence || extractedJob.confidence || fallbackOutcome.confidence,
    safety_signal: extractedJob.safetySignal || payload.cueHints?.safetySignal || "",
    mental_fatigue: extractedJob.mentalFatigue || payload.cueHints?.mentalFatigue || "",
    reassurance_need: extractedJob.reassuranceNeed || payload.cueHints?.reassuranceNeed || "",
    driver_capacity: extractedJob.driverCapacity || payload.cueHints?.driverCapacity || "",
    source
  };
}

async function askLiveShiftCoach(button) {
  const originalButtonHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }

  const shift = readActiveShift();
  if (!shift) {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = originalButtonHtml;
    }
    return;
  }

  const prompt = readDriverNotesInput();
  const summary = getCurrentLiveShiftSummary();

  if (!summary) {
    showStatus("Coach context is still loading.", "error");
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = originalButtonHtml;
    }
    return;
  }

  const nextShift = {
    ...shift,
    driver_notes: prompt
  };
  const coach = getLiveShiftCoach(nextShift, summary);
  const payload = buildCoachApiPayload(prompt, nextShift, coach, summary);
  const fallbackReply = buildLiveCoachDialogueReply(prompt, coach);

  let source = "local";
  let coachReply = fallbackReply;
  let apiResult = null;

  try {
    apiResult = await requestCoachApi(payload);
    coachReply = apiResult.coachReply;
    if (!coachReply) throw new Error("Coach API returned an empty reply.");
    source = "openai";
  } catch (error) {
    console.warn("Coach API unavailable, using local coach reply.", error);
    source = "local-fallback";
  }

  writeActiveShift({
    ...nextShift,
    driver_notes: "",
    coach_reply: coachReply,
    coach_draft_status: "answered",
    coach_interactions: [
      buildCoachInteractionRecord(prompt, coachReply, payload, source, apiResult),
      ...(Array.isArray(nextShift.coach_interactions) ? nextShift.coach_interactions : [])
    ].slice(0, 50)
  });
  renderWeeklyTarget(currentWeekDays);
  scrollCoachHistoryToLatest();
  showStatus(source === "openai" ? "Coach replied." : "Coach replied locally.", "success");
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
      businessMiles: 0,
      trips: 0
    };
  }

  const { data, error } = await supabaseClient
    .from("days")
    .select("gross,business_miles,trips")
    .eq("date", dateString);

  if (error) {
    console.error("Error loading saved session totals:", error);
    throw new Error("Unable to check existing sessions for this date.");
  }

  return (data || []).reduce((totals, day) => ({
    gross: totals.gross + Number(day.gross || 0),
    businessMiles: totals.businessMiles + Number(day.business_miles || 0),
    trips: totals.trips + Number(day.trips || 0)
  }), {
    gross: 0,
    businessMiles: 0,
    trips: 0
  });
}

async function buildDayPayload(source = {}) {
  const date = source.date || el(ids.date)?.value?.trim() || "";
  const uberDayTotal = source.uberDayTotal ?? toNumber(el(ids.gross)?.value) ?? 0;
  const savedTotals = await getSavedDayTotalsForDate(date);
  const existingGross = savedTotals.gross;
  const sessionGross = Math.max(0, uberDayTotal - existingGross);
  const businessMilesDayTotal = source.businessMilesDayTotal ?? toNumber(el(ids.miles)?.value) ?? 0;
  const existingMiles = savedTotals.businessMiles;
  const sessionMiles = Math.max(0, businessMilesDayTotal - existingMiles);
  const hasTripsDayTotal = source.tripsDayTotal !== undefined;
  const tripsDayTotal = hasTripsDayTotal ? Number(source.tripsDayTotal || 0) : null;
  const existingTrips = savedTotals.trips;
  const sessionTrips = hasTripsDayTotal ? Math.max(0, tripsDayTotal - existingTrips) : 0;

  return {
    date,
    end_time: source.endTime ?? null,
    hours_worked: source.hoursWorked ?? readWorkedHoursInput(),
    gross: sessionGross,
    uber_day_total: uberDayTotal,
    existing_day_gross: existingGross,
    business_miles_day_total: businessMilesDayTotal,
    existing_day_miles: existingMiles,
    trips_day_total: tripsDayTotal,
    existing_day_trips: existingTrips,
    trips: sessionTrips,
    business_miles: sessionMiles
  };
}

async function buildLiveShiftDayPayload(shift) {
  const checkpoint = getLastCheckpoint(shift);
  const endDate = new Date(shift.end_time || new Date());
  const startDate = new Date(shift.start_time || endDate);
  const workDate = Number.isNaN(startDate.getTime()) ? dateToIso(endDate) : dateToIso(startDate);

  return buildDayPayload({
    date: workDate,
    endTime: formatShiftTime(shift.end_time || endDate),
    hoursWorked: getLiveShiftElapsedHours(shift, shift.end_time || endDate),
    uberDayTotal: Number(checkpoint?.earnings || 0),
    businessMilesDayTotal: Number(checkpoint?.business_miles || 0),
    tripsDayTotal: Number(checkpoint?.trips_completed || 0)
  });
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
  if (payload.trips_day_total !== null && payload.trips_day_total < payload.existing_day_trips) {
    return `Trips total is below saved sessions for this date (${formatNumber(payload.existing_day_trips, 0)}).`;
  }
  if (payload.business_miles < 0) return "Business miles must be zero or greater.";
  return null;
}

async function saveSessionPayload(payload, options = {}) {
  const {
    savingMessage = "Saving session...",
    successMessage = "Session saved and synced successfully.",
    syncErrorMessage = "Session saved, but Google Sheets sync failed."
  } = options;

  showStatus(savingMessage, "info", false);

  const {
    uber_day_total,
    existing_day_gross,
    business_miles_day_total,
    existing_day_miles,
    trips_day_total,
    existing_day_trips,
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
    return {
      ok: false,
      data: null
    };
  }

  try {
    const sheetPayload = buildDaySheetPayload(data);
    await sendToGoogleSheets("day", sheetPayload);
    showStatus(successMessage, "success");
  } catch (syncError) {
    console.error("Session sync failed:", syncError);
    showStatus(syncErrorMessage, "error", false);
  }

  return {
    ok: true,
    data
  };
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

    const payload = await buildDayPayload();
    const validationError = validateDay(payload);

    if (validationError) {
      showStatus(validationError, "error");
      return;
    }

    const result = await saveSessionPayload(payload);
    if (!result.ok) return;

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
  el(ids.liveShiftCard)?.addEventListener("keydown", handleLiveShiftKeydown);
  el(ids.liveShiftCard)?.addEventListener("focusin", handleLiveShiftInputFocus);
  el(ids.liveShiftCard)?.addEventListener("focusin", handleLiveShiftNotesFocus);
  el(ids.liveShiftCard)?.addEventListener("input", handleLiveShiftNotesInput);
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




