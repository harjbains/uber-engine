import { supabaseClient } from "./supabase.js";
import { sendToGoogleSheets, buildDaySheetPayload } from "./googleSheets.js";
import { showStatus } from "./status.js";
import { loadMonthSummary } from "./monthly.js";

const ids = {
  date: "day_date",
  endTime: "day_end_time",
  hours: "day_hours",
  gross: "day_gross",
  trips: "day_trips",
  miles: "day_miles",
  saveBtn: "save_day",
  list: "dayList",
  weekTitle: "week_title",
  weekSummary: "week_summary",
  prevWeek: "prev_week",
  thisWeek: "this_week",
  nextWeek: "next_week"
};

const DAILY_INSURANCE_DEFAULT = 10;
const TAX_RATE_DEFAULT = 0.20;
const FUEL_COST_PER_MILE = 0.18;
const WORK_DATE_OPTIONS_DAYS = 7;

let weekOffset = 0;

function el(id) {
  return document.getElementById(id);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value) {
  return `£${Number(value || 0).toFixed(2)}`;
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

function getNearestQuarterHour() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  const roundedMinutes = Math.round(minutes / 15) * 15;

  if (roundedMinutes === 60) {
    const nextHour = (hours + 1) % 24;
    return `${String(nextHour).padStart(2, "0")}:00`;
  }

  return `${String(hours).padStart(2, "0")}:${String(roundedMinutes).padStart(2, "0")}`;
}

function populateEndTimeOptions() {
  const select = el(ids.endTime);
  if (!select) return;

  const currentValue = select.value || getNearestQuarterHour();

  select.innerHTML = `<option value="">Select end time</option>`;

  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 15) {
      const hh = String(hour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      const value = `${hh}:${mm}`;

      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
  }

  const values = Array.from(select.options).map((opt) => opt.value);
  select.value = values.includes(currentValue) ? currentValue : getNearestQuarterHour();
}

function clearDayForm() {
  const gross = el(ids.gross);
  const trips = el(ids.trips);
  const miles = el(ids.miles);
  const endTime = el(ids.endTime);
  const hours = el(ids.hours);
  const date = el(ids.date);

  if (gross) gross.value = "";
  if (trips) trips.value = "";
  if (miles) miles.value = "";
  if (endTime) endTime.value = getNearestQuarterHour();
  if (hours) hours.value = "";
  if (date) date.value = todayIso();
}

function buildDayPayload() {
  return {
    date: el(ids.date)?.value?.trim() || "",
    end_time: el(ids.endTime)?.value?.trim() || "",
    hours_worked: toNumber(el(ids.hours)?.value) ?? 0,
    gross: toNumber(el(ids.gross)?.value) ?? 0,
    trips: toNumber(el(ids.trips)?.value) ?? 0,
    business_miles: toNumber(el(ids.miles)?.value) ?? 0
  };
}

function validateDay(payload) {
  if (!payload.date) return "Please select a work date.";
  if (!payload.end_time) return "Please select an end time.";
  if (payload.hours_worked <= 0) return "Hours worked must be greater than zero.";
  if (payload.gross < 0) return "Gross earnings must be zero or greater.";
  if (payload.trips < 0) return "Trips must be zero or greater.";
  if (payload.business_miles < 0) return "Business miles must be zero or greater.";
  return null;
}

function buildSessionMetrics(day) {
  const gross = Number(day.gross || 0);
  const trips = Number(day.trips || 0);
  const miles = Number(day.business_miles || 0);
  const hours = Number(day.hours_worked || 0);

  const estimatedFuel = miles * FUEL_COST_PER_MILE;
  const insurance = DAILY_INSURANCE_DEFAULT;
  const tax = Math.max(0, gross * TAX_RATE_DEFAULT);
  const trueRetained = gross - estimatedFuel - tax - insurance;

  return {
    gross,
    trips,
    miles,
    hours,
    estimatedFuel,
    insurance,
    tax,
    trueRetained,
    ratePerTrip: trips > 0 ? gross / trips : 0,
    ratePerMile: miles > 0 ? gross / miles : 0,
    ratePerHour: hours > 0 ? gross / hours : 0,
    tripsPerHour: hours > 0 ? trips / hours : 0
  };
}

function renderWeekSummary(days) {
  const container = el(ids.weekSummary);
  if (!container) return;

  const totals = days.reduce((acc, day) => {
    const m = buildSessionMetrics(day);
    acc.sessions += 1;
    acc.gross += m.gross;
    acc.trips += m.trips;
    acc.miles += m.miles;
    acc.hours += m.hours;
    acc.estimatedFuel += m.estimatedFuel;
    acc.tax += m.tax;
    acc.trueRetained += m.trueRetained;
    return acc;
  }, {
    sessions: 0,
    gross: 0,
    trips: 0,
    miles: 0,
    hours: 0,
    estimatedFuel: 0,
    tax: 0,
    trueRetained: 0
  });

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Sessions</div>
      <div class="summary-value">${formatInt(totals.sessions)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Gross</div>
      <div class="summary-value">${formatMoney(totals.gross)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Trips</div>
      <div class="summary-value">${formatInt(totals.trips)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Miles</div>
      <div class="summary-value">${formatNumber(totals.miles, 1)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Hours</div>
      <div class="summary-value">${formatNumber(totals.hours, 1)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Fuel Est.</div>
      <div class="summary-value">${formatMoney(totals.estimatedFuel)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Tax</div>
      <div class="summary-value">${formatMoney(totals.tax)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">True Retained</div>
      <div class="summary-value">${formatMoney(totals.trueRetained)}</div>
    </div>
  `;
}

function renderDayHistory(days) {
  const container = el(ids.list);
  if (!container) return;

  if (!Array.isArray(days) || days.length === 0) {
    container.innerHTML = `<div class="history-empty">No worked sessions in this week.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="history-grid">
      ${days.map((day) => {
        const m = buildSessionMetrics(day);

        return `
          <div class="history-card">
            <div class="history-card__header">
              <div>
                <div class="history-card__title">${escapeHtml(formatDateLabel(day.date))}</div>
                ${buildSessionMeta(day, m) ? `<div class="history-card__meta">${buildSessionMeta(day, m)}</div>` : ""}
              </div>
              <div class="history-card__pill">Session</div>
            </div>

            <div class="history-card__grid history-card__grid--3x2">
              <div class="history-item">
                <span class="history-item__label">Gross</span>
                <span class="history-item__value history-item__value--strong">${escapeHtml(formatMoney(m.gross))}</span>
              </div>

              <div class="history-item">
                <span class="history-item__label">Trips</span>
                <span class="history-item__value">${escapeHtml(formatInt(m.trips))}</span>
              </div>

              <div class="history-item">
                <span class="history-item__label">Miles</span>
                <span class="history-item__value">${escapeHtml(formatNumber(m.miles, 1))}</span>
              </div>

              <div class="history-item">
                <span class="history-item__label">£ / Hour</span>
                <span class="history-item__value">${escapeHtml(formatMoney(m.ratePerHour))}</span>
              </div>

              <div class="history-item">
                <span class="history-item__label">Fuel Est.</span>
                <span class="history-item__value">${escapeHtml(formatMoney(m.estimatedFuel))}</span>
              </div>

              <div class="history-item">
                <span class="history-item__label">Tax</span>
                <span class="history-item__value">${escapeHtml(formatMoney(m.tax))}</span>
              </div>

              <div class="history-item">
                <span class="history-item__label">Trips / Hour</span>
                <span class="history-item__value">${escapeHtml(formatNumber(m.tripsPerHour, 1))}</span>
              </div>

              <div class="history-item">
                <span class="history-item__label">£ / Trip</span>
                <span class="history-item__value">${escapeHtml(formatMoney(m.ratePerTrip))}</span>
              </div>

              <div class="history-item">
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

async function fetchWeekDays() {
  const { startIso, endIso } = getSelectedWeekRange();
  updateWeekTitle(startIso, endIso);

  const { data: days, error } = await supabaseClient
    .from("days")
    .select("*")
    .gte("date", startIso)
    .lte("date", endIso)
    .order("date", { ascending: false })
    .order("end_time", { ascending: false });

  if (error) {
    console.error("Error loading week sessions:", error);
    showStatus("Unable to load worked sessions.", "error", false);
    renderWeekSummary([]);
    renderDayHistory([]);
    return [];
  }

  const rows = days || [];
  renderWeekSummary(rows);
  renderDayHistory(rows);
  return rows;
}

export async function loadWeekDays() {
  return fetchWeekDays();
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

  el(ids.prevWeek)?.addEventListener("click", async () => {
    weekOffset -= 1;
    await loadWeekDays();
  });

  el(ids.thisWeek)?.addEventListener("click", async () => {
    weekOffset = 0;
    await loadWeekDays();
  });

  el(ids.nextWeek)?.addEventListener("click", async () => {
    if (weekOffset < 0) {
      weekOffset += 1;
      await loadWeekDays();
    }
  });
}

export function initDays() {
  populateWorkDateOptions();
  populateEndTimeOptions();
  bindDayEvents();
  loadWeekDays();
}

function formatTimeLabel(timeString) {
  if (!timeString) return "--:--";

  const match = String(timeString).match(/^(\d{2}):(\d{2})/);
  if (!match) return String(timeString);

  const [, hh, mm] = match;
  return `${hh}:${mm}`;
}

function buildSessionMeta(day, metrics) {
  const hasEndTime = !!day.end_time;
  const hasHours = Number(day.hours_worked || 0) > 0;

  if (hasEndTime && hasHours) {
    return `End ${escapeHtml(formatTimeLabel(day.end_time))} • ${escapeHtml(formatNumber(metrics.hours, 1))} hrs`;
  }

  if (hasEndTime) {
    return `End ${escapeHtml(formatTimeLabel(day.end_time))}`;
  }

  if (hasHours) {
    return `${escapeHtml(formatNumber(metrics.hours, 1))} hrs`;
  }

  return "";
}