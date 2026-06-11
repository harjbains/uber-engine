import { supabaseClient } from "./supabase.js";
import { showStatus } from "./status.js";

const CHARGING_TABLE = "charging_sessions";
const WEEKLY_CHARGER_NAME = "Ohme Weekly Summary";

const ids = {
  weekStart: "charging_week_start",
  totalKwh: "charging_total_kwh",
  totalCost: "charging_total_cost",
  homeCost: "charging_home_cost",
  publicCost: "charging_public_cost",
  superchargerCost: "charging_supercharger_cost",
  tariffName: "charging_tariff_name",
  notes: "charging_notes",
  saveBtn: "save_charging",
  list: "charging_history"
};

let currentChargingWeeks = [];

function el(id) {
  return document.getElementById(id);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return `\u00a3${Number(value || 0).toFixed(2)}`;
}

function formatNumber(value, dp = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(dp);
}

function formatPencePerUnit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(1)}p`;
}

function parseLocalDate(dateString) {
  const [y, m, d] = String(dateString || "").split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateToIso(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeek(baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDaysIso(dateString, days) {
  const d = parseLocalDate(dateString);
  d.setDate(d.getDate() + days);
  return dateToIso(d);
}

function formatDateLabel(dateString) {
  if (!dateString) return "-";

  const d = parseLocalDate(dateString);
  if (Number.isNaN(d.getTime())) return String(dateString);

  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatWeekLabel(weekStart) {
  return `${formatDateLabel(weekStart)} - ${formatDateLabel(addDaysIso(weekStart, 6))}`;
}

function setDefaultWeekStart() {
  const input = el(ids.weekStart);
  if (input && !input.value) input.value = dateToIso(startOfWeek());
}

function buildWeeklyChargingPayload() {
  const homeCost = toNumber(el(ids.homeCost)?.value) ?? 0;
  const publicCost = toNumber(el(ids.publicCost)?.value) ?? 0;
  const superchargerCost = toNumber(el(ids.superchargerCost)?.value) ?? 0;
  const enteredTotalCost = toNumber(el(ids.totalCost)?.value);
  const sourceTotal = homeCost + publicCost + superchargerCost;

  return {
    weekStart: el(ids.weekStart)?.value?.trim() || "",
    totalKwh: toNumber(el(ids.totalKwh)?.value),
    totalCost: enteredTotalCost ?? sourceTotal,
    homeCost,
    publicCost,
    superchargerCost,
    tariffName: el(ids.tariffName)?.value?.trim() || "",
    notes: el(ids.notes)?.value?.trim() || ""
  };
}

function validateWeeklyCharging(payload) {
  if (!payload.weekStart) return "Please enter the week start.";
  if (payload.totalKwh === null || payload.totalKwh <= 0) return "Please enter total kWh.";
  if (payload.totalCost === null || payload.totalCost < 0) return "Please enter charging cost.";
  if (payload.homeCost < 0 || payload.publicCost < 0 || payload.superchargerCost < 0) {
    return "Charging source costs must be zero or greater.";
  }
  return null;
}

function clearChargingForm() {
  [
    ids.totalKwh,
    ids.totalCost,
    ids.homeCost,
    ids.publicCost,
    ids.superchargerCost,
    ids.notes
  ].forEach((id) => {
    const node = el(id);
    if (node) node.value = "";
  });

  setDefaultWeekStart();
}

function normaliseSession(row = {}) {
  return {
    id: row.id,
    date: row.date || "",
    locationType: row.location_type || "home",
    chargerName: row.charger_name || "",
    kwhAdded: Number(row.kwh_added || 0),
    cost: Number(row.cost || 0),
    tariffName: row.tariff_name || "",
    notes: row.notes || "",
    createdAt: row.created_at || ""
  };
}

function buildChargingTotals(rows = []) {
  const totals = {
    cost: 0,
    kwh: 0,
    homeCost: 0,
    publicCost: 0,
    superchargerCost: 0,
    sessionCount: rows.length
  };

  rows.forEach((row) => {
    const session = normaliseSession(row);
    totals.cost += session.cost;
    totals.kwh += session.kwhAdded;

    if (session.locationType === "public") {
      totals.publicCost += session.cost;
    } else if (session.locationType === "supercharger") {
      totals.superchargerCost += session.cost;
    } else {
      totals.homeCost += session.cost;
    }
  });

  totals.averagePencePerKwh = totals.kwh > 0 ? (totals.cost / totals.kwh) * 100 : 0;
  totals.homePercent = totals.cost > 0 ? (totals.homeCost / totals.cost) * 100 : 0;
  totals.publicPercent = totals.cost > 0 ? (totals.publicCost / totals.cost) * 100 : 0;
  totals.superchargerPercent = totals.cost > 0 ? (totals.superchargerCost / totals.cost) * 100 : 0;

  return totals;
}

function groupChargingWeeks(rows = []) {
  const grouped = new Map();

  rows.forEach((row) => {
    const session = normaliseSession(row);
    const weekStart = session.date;
    if (!weekStart) return;

    const group = grouped.get(weekStart) || {
      weekStart,
      ids: [],
      tariffName: "",
      notes: "",
      rows: []
    };

    group.ids.push(session.id);
    group.rows.push(row);
    group.tariffName = group.tariffName || session.tariffName;
    group.notes = group.notes || session.notes;
    grouped.set(weekStart, group);
  });

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      ...buildChargingTotals(group.rows)
    }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

function renderChargingHistory(weeks) {
  const container = el(ids.list);
  if (!container) return;

  if (!Array.isArray(weeks) || weeks.length === 0) {
    container.innerHTML = `<div class="history-empty">No charging summaries saved yet.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="history-grid">
      ${weeks.map((week) => `
        <div class="history-card">
          <div class="history-card__header">
            <div>
              <div class="history-card__title">${escapeHtml(formatWeekLabel(week.weekStart))}</div>
              <div class="history-card__meta">${escapeHtml(week.tariffName || "Charging summary")}</div>
            </div>
            <div class="history-card__actions">
              <div class="history-card__pill">Charging</div>
              <button
                type="button"
                class="history-card__delete"
                data-delete-charging-week="${escapeHtml(week.weekStart)}"
                aria-label="Delete charging summary for ${escapeHtml(formatWeekLabel(week.weekStart))}"
              >
                Delete
              </button>
            </div>
          </div>

          <div class="history-card__grid history-card__grid--3x2">
            <div class="history-item">
              <span class="history-item__label">Cost</span>
              <span class="history-item__value history-item__value--strong">${formatMoney(week.cost)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">kWh</span>
              <span class="history-item__value">${formatNumber(week.kwh, 1)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">Avg p/kWh</span>
              <span class="history-item__value">${formatPencePerUnit(week.averagePencePerKwh)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">Home</span>
              <span class="history-item__value">${formatMoney(week.homeCost)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">Public</span>
              <span class="history-item__value">${formatMoney(week.publicCost)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">Supercharger</span>
              <span class="history-item__value">${formatMoney(week.superchargerCost)}</span>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderChargingSetupMessage() {
  const container = el(ids.list);
  if (!container) return;

  container.innerHTML = `
    <div class="history-empty">
      Charging summaries are ready, but the charging_sessions table has not been created yet.
      Run charging_sessions.sql in Supabase before saving weekly charging data.
    </div>
  `;
}

function isMissingChargingTable(error) {
  const message = String(error?.message || error?.details || "");
  return error?.code === "42P01" || message.includes(CHARGING_TABLE);
}

function buildSourceRows(payload) {
  const sourceRows = [
    { location_type: "home", cost: payload.homeCost },
    { location_type: "public", cost: payload.publicCost },
    { location_type: "supercharger", cost: payload.superchargerCost }
  ].filter((row) => row.cost > 0);

  const rows = sourceRows.length
    ? sourceRows
    : [{ location_type: "home", cost: payload.totalCost }];

  const kwhRowIndex = rows.findIndex((row) => row.location_type === "home");
  const indexForKwh = kwhRowIndex >= 0 ? kwhRowIndex : 0;

  return rows.map((row, index) => ({
    date: payload.weekStart,
    vehicle_id: null,
    location_type: row.location_type,
    charger_name: WEEKLY_CHARGER_NAME,
    kwh_added: index === indexForKwh ? payload.totalKwh : 0,
    cost: row.cost,
    start_time: null,
    end_time: null,
    active_charge_minutes: null,
    battery_start_percent: null,
    battery_end_percent: null,
    tariff_name: payload.tariffName,
    notes: payload.notes
  }));
}

async function replaceChargingWeek(payload) {
  await supabaseClient
    .from(CHARGING_TABLE)
    .delete()
    .eq("date", payload.weekStart)
    .eq("charger_name", WEEKLY_CHARGER_NAME);

  const { data, error } = await supabaseClient
    .from(CHARGING_TABLE)
    .insert(buildSourceRows(payload))
    .select();

  return { data, error };
}

export async function getChargingSessionsForRange(startIso, endIso) {
  const { data, error } = await supabaseClient
    .from(CHARGING_TABLE)
    .select("*")
    .gte("date", startIso)
    .lte("date", endIso)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingChargingTable(error)) {
      console.warn("Charging sessions table is not available yet.");
    } else {
      console.error("Error loading charging sessions:", error);
    }
    return [];
  }

  return data || [];
}

export async function getChargingTotalsForRange(startIso, endIso) {
  const rows = await getChargingSessionsForRange(startIso, endIso);
  return buildChargingTotals(rows);
}

export async function getRecentFuelLogs(limit = 3) {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 3;

  const { data, error } = await supabaseClient
    .from("fuel_logs")
    .select("date, litres, cost, created_at")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error("Error loading recent fuel logs:", error);
    return [];
  }

  return data || [];
}

export async function getRollingFuelPricePerLitre(limit = 3, fallback = 1.70) {
  const recentLogs = await getRecentFuelLogs(limit);

  if (!recentLogs.length) return fallback;

  const totals = recentLogs.reduce(
    (acc, item) => {
      const litres = Number(item?.litres || 0);
      const cost = Number(item?.cost || 0);

      if (Number.isFinite(litres) && litres > 0 && Number.isFinite(cost) && cost > 0) {
        acc.totalLitres += litres;
        acc.totalCost += cost;
      }

      return acc;
    },
    { totalLitres: 0, totalCost: 0 }
  );

  if (totals.totalLitres <= 0) return fallback;

  return totals.totalCost / totals.totalLitres;
}

export async function loadChargingSummaries() {
  const { data, error } = await supabaseClient
    .from(CHARGING_TABLE)
    .select("*")
    .eq("charger_name", WEEKLY_CHARGER_NAME)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(36);

  if (error) {
    if (isMissingChargingTable(error)) {
      renderChargingSetupMessage();
      console.warn("Charging sessions table is not available yet.");
      return [];
    }

    console.error("Error loading charging summaries:", error);
    showStatus("Unable to load charging summaries.", "error", false);
    return [];
  }

  currentChargingWeeks = groupChargingWeeks(data || []);
  renderChargingHistory(currentChargingWeeks);
  return currentChargingWeeks;
}

export async function saveChargingSummary() {
  const saveBtn = el(ids.saveBtn);

  try {
    if (saveBtn) saveBtn.disabled = true;
    showStatus("Saving charging summary...", "info", false);

    const payload = buildWeeklyChargingPayload();
    const validationError = validateWeeklyCharging(payload);
    if (validationError) {
      showStatus(validationError, "error");
      return;
    }

    const { error } = await replaceChargingWeek(payload);
    if (error) {
      console.error("Error saving charging summary:", error);
      showStatus(`Failed to save charging summary: ${error.message}`, "error", false);
      return;
    }

    clearChargingForm();
    showStatus("Charging summary saved.", "success");
    await loadChargingSummaries();
    const { loadWeekDays } = await import("./days.js");
    const { loadMonthSummary } = await import("./monthly.js");
    await loadWeekDays();
    await loadMonthSummary();
  } catch (err) {
    console.error("Unexpected charging summary save error:", err);
    showStatus("Unexpected error while saving charging summary.", "error", false);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function deleteChargingWeek(weekStart, button) {
  const week = currentChargingWeeks.find((item) => item.weekStart === weekStart);
  const label = week ? `${formatWeekLabel(week.weekStart)} (${formatMoney(week.cost)})` : "this charging summary";

  if (!window.confirm(`Delete ${label}?`)) return;

  try {
    if (button) button.disabled = true;
    showStatus("Deleting charging summary...", "info", false);

    const { error } = await supabaseClient
      .from(CHARGING_TABLE)
      .delete()
      .eq("date", weekStart)
      .eq("charger_name", WEEKLY_CHARGER_NAME);

    if (error) {
      console.error("Error deleting charging summary:", error);
      showStatus(`Failed to delete charging summary: ${error.message}`, "error", false);
      return;
    }

    showStatus("Charging summary deleted.", "success");
    await loadChargingSummaries();
    const { loadWeekDays } = await import("./days.js");
    const { loadMonthSummary } = await import("./monthly.js");
    await loadWeekDays();
    await loadMonthSummary();
  } catch (err) {
    console.error("Unexpected charging summary delete error:", err);
    showStatus("Unexpected error while deleting charging summary.", "error", false);
  } finally {
    if (button) button.disabled = false;
  }
}

function bindChargingEvents() {
  el(ids.saveBtn)?.addEventListener("click", saveChargingSummary);
  el(ids.list)?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-charging-week]");
    if (!button) return;

    await deleteChargingWeek(button.dataset.deleteChargingWeek, button);
  });
}

export function initFuel() {
  setDefaultWeekStart();
  bindChargingEvents();
  loadChargingSummaries();
}

export const initCharging = initFuel;
