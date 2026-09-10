const SHIFT_PROGRESS_KEY = "uberEngine.shift.progress";
const SHIFT_ACTIVE_KEY = "uberEngine.shift.active";
const SHIFT_UPDATED_KEY = "uberEngine.shift.updatedAt";

function clampFraction(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
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