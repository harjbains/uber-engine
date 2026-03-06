/* ================= DATE FORMATTING ================= */

export function formatShortDate(dateStr) {

  const date = new Date(dateStr);

  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short"
  });

}


/* ================= SHIFT HOURS ================= */

export function calculateShiftHours(start, end) {

  if (!start || !end) return 0;

  const startDate = new Date(`1970-01-01T${start}`);
  const endDate = new Date(`1970-01-01T${end}`);

  const diff = (endDate - startDate) / 1000 / 60 / 60;

  if (diff <= 0) return 0;

  return diff;

}


/* ================= HOURLY RATE ================= */

export function calculateHourlyRate(gross, hours) {

  if (!hours) return 0;

  return (gross / hours);

}


/* ================= MILES ================= */

export function calculateMiles(startOdo, endOdo) {

  if (startOdo == null || endOdo == null) return 0;

  return Math.max(0, endOdo - startOdo);

}