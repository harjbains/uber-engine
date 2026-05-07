import { supabaseClient } from "./supabase.js";
import { sendToGoogleSheets, buildDaySheetPayload } from "./googleSheets.js";
import { showStatus } from "./status.js";
import { loadMonthSummary } from "./monthly.js";
import { getRollingFuelPricePerLitre } from "./fuel.js";

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
  targetSummary: "target_summary",
  targetStatus: "target_status",
  prevWeek: "prev_week",
  thisWeek: "this_week",
  nextWeek: "next_week"
};

const DAILY_INSURANCE_DEFAULT = 10;
const TAX_RATE_DEFAULT = 0.20;
const WORK_DATE_OPTIONS_DAYS = 7;

const DEFAULT_MPG = 32.5;
const DEFAULT_FUEL_PRICE_PER_LITRE = 1.70;
const LITRES_PER_UK_GALLON = 4.546;
const TARGET_STORAGE_PREFIX = "uberEngineWeeklyTarget";
const DEFAULT_TARGET_WORKDAYS = [0, 1, 2, 3, 4, 5];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let weekOffset = 0;
let currentWeekDays = [];
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

function getWeekDates(startIso) {
  const start = parseLocalDate(startIso);

  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    return dateToIso(d);
  });
}

function targetStorageKey(startIso) {
  return `${TARGET_STORAGE_PREFIX}:${startIso}`;
}

function readTargetSettings(startIso) {
  const fallback = {
    target: "",
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

    return {
      target: parsed.target ?? "",
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

function getCurrentTargetSettings() {
  if (!currentWeekRange) {
    currentWeekRange = getSelectedWeekRange();
  }

  const targetInput = el(ids.weeklyTarget);
  const checkedDays = Array.from(
    document.querySelectorAll("[data-target-workday]:checked")
  ).map((node) => Number(node.dataset.targetWorkday));

  return {
    target: targetInput?.value ?? "",
    workDays: checkedDays
  };
}

function persistCurrentTargetSettings() {
  if (!currentWeekRange) return;
  saveTargetSettings(currentWeekRange.startIso, getCurrentTargetSettings());
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

function buildWeeklyTargetSummary(days, settings, weekDates) {
  const target = Number(settings.target || 0);
  const earned = days.reduce((sum, day) => sum + Number(day.gross || 0), 0);
  const remaining = Math.max(0, target - earned);
  const plannedWorkDays = settings.workDays.length;
  const today = todayIso();
  const todayInWeek = weekDates.includes(today);

  const remainingWorkDates = weekDates.filter((dateString, index) => {
    if (!settings.workDays.includes(index)) return false;
    if (dateString < today) return false;
    return true;
  });

  const remainingWorkDays = remainingWorkDates.length;
  const baseDailyTarget = plannedWorkDays > 0 ? target / plannedWorkDays : 0;
  const requiredPerDay = remainingWorkDays > 0 ? remaining / remainingWorkDays : 0;

  let status = "Set a target to track this week.";
  let statusClass = "target-status";

  if (target > 0 && plannedWorkDays === 0) {
    status = "Choose at least one planned work day.";
    statusClass = "target-status target-status--warning";
  } else if (target > 0 && remaining <= 0) {
    status = `Target hit. You are ahead by ${formatMoney(Math.abs(target - earned))}.`;
    statusClass = "target-status target-status--good";
  } else if (target > 0 && remainingWorkDays === 0) {
    status = `No planned work days left. Remaining target is ${formatMoney(remaining)}.`;
    statusClass = "target-status target-status--warning";
  } else if (target > 0) {
    const pressure = requiredPerDay - baseDailyTarget;

    if (Math.abs(pressure) < 0.01) {
      status = "On original daily pace.";
    } else if (pressure > 0) {
      status = `Behind pace. Each remaining work day needs ${formatMoney(pressure)} extra.`;
      statusClass = "target-status target-status--warning";
    } else {
      status = `Ahead of pace. Each remaining work day is ${formatMoney(Math.abs(pressure))} lighter.`;
      statusClass = "target-status target-status--good";
    }
  }

  return {
    target,
    earned,
    remaining,
    plannedWorkDays,
    remainingWorkDays,
    requiredPerDay,
    baseDailyTarget,
    todayTargetLabel: todayInWeek ? "Today Target" : "Required / Day",
    status,
    statusClass
  };
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

  statusNode.textContent = summary.status;
  statusNode.className = summary.statusClass;

  summaryNode.innerHTML = `
    <div class="target-summary-card target-summary-card--primary">
      <div class="summary-label">${escapeHtml(summary.todayTargetLabel)}</div>
      <div class="summary-value">${formatMoney(summary.requiredPerDay)}</div>
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
      <div class="summary-label">Base Daily Plan</div>
      <div class="summary-value">${formatMoney(summary.baseDailyTarget)}</div>
    </div>
    <div class="target-summary-card">
      <div class="summary-label">Weekly Target</div>
      <div class="summary-value">${formatMoney(summary.target)}</div>
    </div>
  `;
}

function initialiseWeeklyTarget(range) {
  const targetInput = el(ids.weeklyTarget);
  if (!targetInput) return;

  const weekDates = getWeekDates(range.startIso);
  const settings = readTargetSettings(range.startIso);

  targetInput.value = settings.target;
  renderTargetWorkdays(settings, weekDates);

  targetInput.oninput = () => {
    persistCurrentTargetSettings();
    renderWeeklyTarget(currentWeekDays);
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
    end_time: "",
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

function getLitresPerMile(mpg = DEFAULT_MPG) {
  if (!Number.isFinite(mpg) || mpg <= 0) {
    return LITRES_PER_UK_GALLON / DEFAULT_MPG;
  }
  return LITRES_PER_UK_GALLON / mpg;
}

function calculateEstimatedFuelCost(miles, pricePerLitre, mpg = DEFAULT_MPG) {
  const safeMiles = Number(miles || 0);
  const safePricePerLitre =
    Number.isFinite(pricePerLitre) && pricePerLitre > 0
      ? pricePerLitre
      : DEFAULT_FUEL_PRICE_PER_LITRE;

  const litresPerMile = getLitresPerMile(mpg);
  return safeMiles * litresPerMile * safePricePerLitre;
}

function buildSessionMetrics(day, pricePerLitre, mpg = DEFAULT_MPG) {
  const gross = Number(day.gross || 0);
  const miles = Number(day.business_miles || 0);

  const estimatedFuel = calculateEstimatedFuelCost(miles, pricePerLitre, mpg);
  const insurance = DAILY_INSURANCE_DEFAULT;
  const tax = Math.max(0, gross * TAX_RATE_DEFAULT);
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

function renderWeekSummary(days, pricePerLitre, mpg = DEFAULT_MPG) {
  const container = el(ids.weekSummary);
  if (!container) return;
  container.className = "summary-grid day-finance-grid";

  const totals = days.reduce((acc, day) => {
    const m = buildSessionMetrics(day, pricePerLitre, mpg);
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

function renderDayHistory(days, pricePerLitre, mpg = DEFAULT_MPG) {
  const container = el(ids.list);
  if (!container) return;

  if (!Array.isArray(days) || days.length === 0) {
    container.innerHTML = `<div class="history-empty">No worked sessions in this week.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="history-grid">
      ${days.map((day) => {
        const m = buildSessionMetrics(day, pricePerLitre, mpg);

        return `
          <div class="history-card">
            <div class="history-card__header">
              <div>
                <div class="history-card__title">${escapeHtml(formatDateLabel(day.date))}</div>
              </div>
              <div class="history-card__pill">Session</div>
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

async function fetchWeekDays() {
  const range = getSelectedWeekRange();
  const { startIso, endIso } = range;
  currentWeekRange = range;
  updateWeekTitle(startIso, endIso);
  initialiseWeeklyTarget(range);

  const [{ data: days, error }, pricePerLitre] = await Promise.all([
    supabaseClient
      .from("days")
      .select("*")
      .gte("date", startIso)
      .lte("date", endIso)
      .order("date", { ascending: false })
      .order("end_time", { ascending: false }),
    getRollingFuelPricePerLitre(3, DEFAULT_FUEL_PRICE_PER_LITRE)
  ]);

  if (error) {
    console.error("Error loading week sessions:", error);
    showStatus("Unable to load worked sessions.", "error", false);
    currentWeekDays = [];
    renderWeeklyTarget(currentWeekDays);
    renderWeekSummary([], pricePerLitre);
    renderDayHistory([], pricePerLitre);
    return [];
  }

  const rows = days || [];
  currentWeekDays = rows;
  renderWeeklyTarget(rows);
  renderWeekSummary(rows, pricePerLitre);
  renderDayHistory(rows, pricePerLitre);
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
  bindDayEvents();
  loadWeekDays();
}

