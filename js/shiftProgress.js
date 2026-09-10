const SHIFT_PROGRESS_KEY = "uberEngine.shift.progress";
const SHIFT_ACTIVE_KEY = "uberEngine.shift.active";
const SHIFT_UPDATED_KEY = "uberEngine.shift.updatedAt";
const SHIFT_STATE_KEY = "uberEngine.shift.state";
export const SHIFT_SYNC_REQUEST_KEY = "uberEngine.shift.syncRequest";

function clampFraction(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function roundToFive(value) {
  const number = Number(value) || 0;
  if (number <= 0) return 0;
  return Math.max(5, Math.round(number / 5) * 5);
}

export function publishShiftState(state = {}, now = Date.now()) {
  const todayEarnings = Math.round((Number(state.todayEarnings) || 0) * 100) / 100;
  const dailyTarget = roundToFive(Number(state.dailyTarget) || 0);
  const active = Boolean(state.shiftActive) && dailyTarget > 0;
  const dailyProgress = dailyTarget > 0 ? clampFraction(todayEarnings / dailyTarget) : 0;
  const remaining = dailyTarget > 0 ? Math.max(0, Math.round(dailyTarget - todayEarnings)) : 0;
  const targetUnitsRemaining = dailyTarget > 0 ? Math.round(remaining / 5) : 0;
  const weeklyTarget = Math.round(Number(state.weeklyTarget) || 0);
  const weeklyEarnings = Math.round((Number(state.weeklyEarnings) || 0) * 100) / 100;
  const weeklyProgress = weeklyTarget > 0 ? clampFraction(weeklyEarnings / weeklyTarget) : 0;

  const statePayload = {
    version: 1,
    date: String(state.date || ""),
    shiftActive: active,
    paused: Boolean(state.paused),
    dailyTarget,
    todayEarnings,
    dailyProgress: Math.round(dailyProgress * 1000) / 1000,
    remaining,
    targetUnitsRemaining,
    activeMinutes: Math.max(0, Math.round(Number(state.activeMinutes) || 0)),
    hourlyRate: Math.round((Number(state.hourlyRate) || 0) * 100) / 100,
    targetRate: Math.round((Number(state.targetRate) || 0) * 100) / 100,
    weeklyTarget,
    weeklyEarnings,
    weeklyProgress: Math.round(weeklyProgress * 1000) / 1000,
    weeklyMinutes: Math.max(0, Math.round(Number(state.weeklyMinutes) || 0)),
    weeklyRemaining: Math.round((Number(state.weeklyRemaining) || 0) * 100) / 100,
    updatedAt: now
  };

  try {
    localStorage.setItem(SHIFT_PROGRESS_KEY, String(dailyProgress));
    localStorage.setItem(SHIFT_ACTIVE_KEY, active ? "true" : "false");
    localStorage.setItem(SHIFT_UPDATED_KEY, String(now));
    localStorage.setItem(SHIFT_STATE_KEY, JSON.stringify(statePayload));
  } catch (error) {
    console.warn("Unable to publish shift state:", error);
  }
}

export function publishShiftProgress({ earned, goal, active = true, now = Date.now() } = {}) {
  const earnedValue = Number(earned) || 0;
  const goalValue = Number(goal) || 0;
  const progress = goalValue > 0 ? clampFraction(earnedValue / goalValue) : 0;

  try {
    localStorage.setItem(SHIFT_PROGRESS_KEY, String(progress));
    localStorage.setItem(SHIFT_ACTIVE_KEY, active ? "true" : "false");
    localStorage.setItem(SHIFT_UPDATED_KEY, String(now));
  } catch (error) {
    console.warn("Unable to publish shift progress:", error);
  }
}

export function readSyncTotalRequest(readValue = (key) => localStorage.getItem(key)) {
  try {
    const raw = readValue(SHIFT_SYNC_REQUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.total === "undefined" || parsed.total === null || parsed.total === "") return null;
    return {
      date: String(parsed.date || ""),
      total: Number(parsed.total),
      requestedAt: Number(parsed.requestedAt) || Date.now()
    };
  } catch (error) {
    return null;
  }
}

export function clearSyncTotalRequest() {
  try {
    localStorage.removeItem(SHIFT_SYNC_REQUEST_KEY);
  } catch (error) {
    console.warn("Unable to clear sync request:", error);
  }
}