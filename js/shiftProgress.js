const keys = {
  progress: "uberEngine.shift.progress",
  active: "uberEngine.shift.active",
  updatedAt: "uberEngine.shift.updatedAt",
  state: "uberEngine.shift.state"
};

export const SHIFT_SYNC_REQUEST_KEY = "uberEngine.shift.syncRequest";
export const SHIFT_CONTROL_REQUEST_KEY = "uberEngine.shift.controlRequest";
export const SHIFT_MILEAGE_REQUEST_KEY = "uberEngine.shift.mileageRequest";

const number = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const pounds = (value) => Math.round(Math.max(0, number(value)) * 100) / 100;
const fraction = (value) => Math.min(1, Math.max(0, number(value)));

export function publishShiftState(state = {}, now = Date.now()) {
  const dailyTarget = pounds(state.dailyTarget);
  const todayEarnings = pounds(state.todayEarnings);
  const weeklyTarget = pounds(state.weeklyTarget);
  const weeklyEarnings = pounds(state.weeklyEarnings);
  const remaining = Math.max(0, dailyTarget - todayEarnings);
  const weeklyRemaining = Math.max(0, weeklyTarget - weeklyEarnings);
  const ridesRemaining = Math.max(0, Math.ceil(remaining / 5));

  const payload = {
    version: 2,
    date: String(state.date || ""),
    shiftActive: Boolean(state.shiftActive),
    paused: false,
    hasActiveShift: Boolean(state.hasActiveShift),
    dailyTarget,
    todayEarnings,
    dailyProgress: dailyTarget > 0 ? fraction(todayEarnings / dailyTarget) : 0,
    remaining,
    ridesRemaining,
    activeMinutes: 0,
    hourlyRate: 0,
    targetRate: 20,
    weeklyTarget,
    weeklyEarnings,
    weeklyProgress: weeklyTarget > 0 ? fraction(weeklyEarnings / weeklyTarget) : 0,
    weeklyMinutes: 0,
    weeklyRemaining,
    businessMilesToday: pounds(state.businessMilesToday),
    businessMilesWeek: pounds(state.businessMilesWeek),
    updatedAt: now
  };

  try {
    localStorage.setItem(keys.progress, String(payload.dailyProgress));
    localStorage.setItem(keys.active, String(payload.shiftActive));
    localStorage.setItem(keys.updatedAt, String(now));
    localStorage.setItem(keys.state, JSON.stringify(payload));
    window.dispatchEvent(new Event("uber-engine-shift-state-local"));
  } catch (error) {
    console.warn("Unable to publish shift state", error);
  }

  return payload;
}

function readRequest(key, validator) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return validator(value) ? value : null;
  } catch {
    return null;
  }
}

export function readSyncTotalRequest() {
  return readRequest(
    SHIFT_SYNC_REQUEST_KEY,
    (v) => v && Number.isFinite(Number(v.total))
  );
}

export function readMileageRequest() {
  return readRequest(
    SHIFT_MILEAGE_REQUEST_KEY,
    (v) => v && Number.isFinite(Number(v.miles))
  );
}

export function clearSyncTotalRequest() {
  try {
    localStorage.removeItem(SHIFT_SYNC_REQUEST_KEY);
  } catch {}
}

export function clearMileageRequest() {
  try {
    localStorage.removeItem(SHIFT_MILEAGE_REQUEST_KEY);
  } catch {}
}
