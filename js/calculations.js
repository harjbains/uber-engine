// calculations.js

/* ================= SHIFT METRICS ================= */

export function calculateShiftMetrics(shift, fuelCost = 0) {
  const miles = (shift.odo_end || 0) - (shift.odo_start || 0);

  // Safe fallbacks (handles old NULL data)
  const grossFare = shift.gross_fare ?? shift.gross ?? 0;
  const uberFee = shift.uber_fee ?? 0;

  const netFare = grossFare - uberFee;

  const totalIncome = (shift.gross || 0) + (shift.tips || 0);

  const mileageExpense = miles * 0.45;

  const totalExpenses = mileageExpense + fuelCost;

  const trueProfit = totalIncome - totalExpenses;

  return {
    miles,
    grossFare,
    uberFee,
    netFare,
    totalIncome,
    mileageExpense,
    totalExpenses,
    trueProfit
  };
}

/* ================= PERFORMANCE ================= */

export function calculatePerformance(metrics, shift) {
  const hoursWorked = calculateHours(shift.start_time, shift.end_time);

  const safeHours = hoursWorked || 1; // prevent divide by zero

  const earningsPerHour = metrics.totalIncome / safeHours;
  const profitPerHour = metrics.trueProfit / safeHours;
  const costPerMile = metrics.miles ? metrics.totalExpenses / metrics.miles : 0;

  return {
    hoursWorked,
    earningsPerHour,
    profitPerHour,
    costPerMile
  };
}

/* ================= HELPERS ================= */

function calculateHours(start, end) {
  if (!start || !end) return 0;

  const startTime = new Date(`1970-01-01T${start}`);
  const endTime = new Date(`1970-01-01T${end}`);

  return (endTime - startTime) / (1000 * 60 * 60);
}

/* ================= UBER ANALYTICS ================= */

export function getUberTakeRate(shift) {
  const grossFare = shift.gross_fare ?? shift.gross ?? 0;
  const uberFee = shift.uber_fee ?? 0;

  if (!grossFare) return 0;

  return (uberFee / grossFare) * 100;
}