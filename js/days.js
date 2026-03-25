import { supabaseClient } from "./supabase.js";
import { sendToGoogleSheets, buildDaySheetPayload } from "./googleSheets.js";
import { showStatus } from "./status.js";

const ids = {
  date: "day_date",
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
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

function clearDayForm() {
  const gross = el(ids.gross);
  const trips = el(ids.trips);
  const miles = el(ids.miles);

  if (gross) gross.value = "";
  if (trips) trips.value = "";
  if (miles) miles.value = "";
}

function buildDayPayload() {
  return {
    date: el(ids.date)?.value?.trim() || "",
    gross: toNumber(el(ids.gross)?.value) ?? 0,
    trips: toNumber(el(ids.trips)?.value) ?? 0,
    business_miles: toNumber(el(ids.miles)?.value) ?? 0
  };
}

function validateDay(payload) {
  if (!payload.date) return "Please enter a date.";
  if (payload.gross < 0) return "Gross earnings must be zero or greater.";
  if (payload.trips < 0) return "Trips must be zero or greater.";
  if (payload.business_miles < 0) return "Business miles must be zero or greater.";
  return null;
}

function buildRealWorldMetrics(day) {
  const gross = Number(day.gross || 0);
  const trips = Number(day.trips || 0);
  const miles = Number(day.business_miles || 0);

  const estimatedFuel = miles * FUEL_COST_PER_MILE;
  const expenses = Number(day.expense_cost || 0);
  const insurance = DAILY_INSURANCE_DEFAULT;
  const tax = Math.max(0, gross * TAX_RATE_DEFAULT);

  const retainedAfterTax = gross - estimatedFuel - expenses - tax;
  const trueRetained = retainedAfterTax - insurance;

  return {
    gross,
    trips,
    miles,
    estimatedFuel,
    expenses,
    insurance,
    tax,
    retainedAfterTax,
    trueRetained,
    ratePerTrip: trips > 0 ? gross / trips : 0,
    ratePerMile: miles > 0 ? gross / miles : 0
  };
}

function renderWeekSummary(days) {
  const container = el(ids.weekSummary);
  if (!container) return;

  const totals = days.reduce((acc, day) => {
    const m = buildRealWorldMetrics(day);
    acc.daysWorked += 1;
    acc.gross += m.gross;
    acc.trips += m.trips;
    acc.miles += m.miles;
    acc.estimatedFuel += m.estimatedFuel;
    acc.tax += m.tax;
    acc.trueRetained += m.trueRetained;
    return acc;
  }, {
    daysWorked: 0,
    gross: 0,
    trips: 0,
    miles: 0,
    estimatedFuel: 0,
    tax: 0,
    trueRetained: 0
  });

  container.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Days Worked</div>
      <div class="summary-value">${formatInt(totals.daysWorked)}</div>
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
    container.innerHTML = `<div class="history-empty">No worked days in this week.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="history-grid">
      ${days.map((day) => {
        const m = buildRealWorldMetrics(day);

        return `
          <div class="history-card">
            <div class="history-card__header">
              <div class="history-card__title">${escapeHtml(formatDateLabel(day.date))}</div>
              <div class="history-card__pill">Day</div>
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
                <span class="history-item__label">Fuel Est.</span>
                <span class="history-item__value">${escapeHtml(formatMoney(m.estimatedFuel))}</span>
              </div>

              <div class="history-item">
                <span class="history-item__label">Tax</span>
                <span class="history-item__value">${escapeHtml(formatMoney(m.tax))}</span>
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
    .order("date", { ascending: false });

  if (error) {
    console.error("Error loading week days:", error);
    showStatus("Unable to load worked days.", "error", false);
    renderWeekSummary([]);
    renderDayHistory([]);
    return [];
  }

  const enriched = await enrichDaysWithExpenses(days || []);
  renderWeekSummary(enriched);
  renderDayHistory(enriched);
  return enriched;
}

async function enrichDaysWithExpenses(days) {
  if (!days.length) return [];

  const dates = days.map(d => d.date);

  const { data: expenseRows, error } = await supabaseClient
    .from("expenses")
    .select("date,amount")
    .in("date", dates);

  if (error) {
    console.error("Error loading day expenses:", error);
    return days.map(day => ({
      ...day,
      expense_cost: 0
    }));
  }

  const expenseByDate = {};

  (expenseRows || []).forEach(row => {
    const date = row.date;
    expenseByDate[date] = (expenseByDate[date] || 0) + Number(row.amount || 0);
  });

  return days.map(day => ({
    ...day,
    expense_cost: expenseByDate[day.date] || 0
  }));
}

export async function loadWeekDays() {
  return fetchWeekDays();
}

export async function saveDay() {
  const saveBtn = el(ids.saveBtn);

  try {
    if (saveBtn) saveBtn.disabled = true;

    showStatus("Saving day...", "info", false);

    const payload = buildDayPayload();
    const validationError = validateDay(payload);

    if (validationError) {
      showStatus(validationError, "error");
      return;
    }

    const { data, error } = await supabaseClient
      .from("days")
      .upsert([payload], { onConflict: "date" })
      .select()
      .single();

    if (error) {
      console.error("Error saving day:", error);
      showStatus(`Failed to save day: ${error.message}`, "error", false);
      return;
    }

    try {
      const sheetPayload = buildDaySheetPayload(data);
      await sendToGoogleSheets("day", sheetPayload);
      showStatus("Day saved and synced successfully.", "success");
    } catch (syncError) {
      console.error("Day sync failed:", syncError);
      showStatus("Day saved, but Google Sheets sync failed.", "error", false);
    }

    clearDayForm();
    await loadWeekDays();
  } catch (err) {
    console.error("Unexpected day save error:", err);
    showStatus("Unexpected error while saving day.", "error", false);
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
  const dateInput = el(ids.date);
  if (dateInput && !dateInput.value) {
    dateInput.value = todayIso();
  }

  bindDayEvents();
  loadWeekDays();
}