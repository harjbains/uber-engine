import { supabaseClient } from "./supabase.js";
import { sendToGoogleSheets, buildFuelSheetPayload } from "./googleSheets.js";
import { showStatus } from "./status.js";

const DEFAULT_STATION = "Total Energies Dudley Road";

const ids = {
  date: "fuel_date",
  litres: "fuel_litres",
  cost: "fuel_cost",
  miles: "fuel_miles",
  saveBtn: "save_fuel",
  list: "fuel_history",
};

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

function safeValue(value) {
  return value ?? "-";
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return `£${number.toFixed(2)}`;
}

function formatDateLabel(dateString) {
  if (!dateString) return "-";

  const [y, m, d] = String(dateString).split("-").map(Number);
  if (!y || !m || !d) return String(dateString);

  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function todayIso() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function setDefaultFuelDate() {
  const date = el(ids.date);
  if (date && !date.value) date.value = todayIso();
}

function getPricePerLitre(item) {
  const litres = Number(item?.litres || 0);
  const cost = Number(item?.cost || 0);

  if (!Number.isFinite(litres) || litres <= 0) return null;
  if (!Number.isFinite(cost) || cost <= 0) return null;

  return cost / litres;
}

function buildFuelPayload() {
  return {
    date: el(ids.date)?.value?.trim() || "",
    station: DEFAULT_STATION, // 👈 always set
    litres: toNumber(el(ids.litres)?.value),
    cost: toNumber(el(ids.cost)?.value),
    miles: toNumber(el(ids.miles)?.value),
  };
}

function validateFuel(payload) {
  if (!payload.date) return "Please enter a fuel date.";
  if (payload.litres === null) return "Please enter litres.";
  if (payload.cost === null) return "Please enter fuel cost.";
  return null;
}

function clearFuelForm() {
  [ids.litres, ids.cost, ids.miles].forEach((id) => {
    const node = el(id);
    if (node) node.value = "";
  });

  setDefaultFuelDate();
}

function renderFuelHistory(items) {
  const container = el(ids.list);
  if (!container) return;

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = `<div class="history-empty">No fuel logs saved yet.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="history-grid">
      ${items
        .map((item) => {
          const pricePerLitre = getPricePerLitre(item);

          return `
            <div class="history-card">
              <div class="history-card__header">
                <div class="history-card__title">${escapeHtml(formatDateLabel(item.date))}</div>
                <div class="history-card__pill">Fuel</div>
              </div>

              <div class="history-card__grid history-card__grid--3x2">

                <div class="history-item">
                  <span class="history-item__label">Litres</span>
                  <span class="history-item__value">${escapeHtml(safeValue(item.litres))}</span>
                </div>

                <div class="history-item">
                  <span class="history-item__label">Cost</span>
                  <span class="history-item__value history-item__value--strong">${escapeHtml(
                    formatCurrency(item.cost)
                  )}</span>
                </div>

                <div class="history-item">
                  <span class="history-item__label">Miles</span>
                  <span class="history-item__value">${escapeHtml(safeValue(item.miles))}</span>
                </div>

                <div class="history-item">
                  <span class="history-item__label">Price / L</span>
                  <span class="history-item__value">${
                    pricePerLitre ? escapeHtml(formatCurrency(pricePerLitre)) : "-"
                  }</span>
                </div>

              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
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

export async function loadFuelLogs() {
  const { data, error } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading fuel logs:", error);
    showStatus("Unable to load fuel logs.", "error", false);
    return [];
  }

  renderFuelHistory(data || []);
  return data || [];
}

export async function saveFuel() {
  const saveBtn = el(ids.saveBtn);

  try {
    if (saveBtn) saveBtn.disabled = true;

    showStatus("Saving fuel log...", "info", false);

    const payload = buildFuelPayload();

    const validationError = validateFuel(payload);
    if (validationError) {
      showStatus(validationError, "error");
      return;
    }

    const { data, error } = await supabaseClient
      .from("fuel_logs")
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error("Error saving fuel log:", error);
      showStatus(`Failed to save fuel log: ${error.message}`, "error", false);
      return;
    }

    try {
      const sheetPayload = buildFuelSheetPayload(data);
      await sendToGoogleSheets("fuel", sheetPayload);
      showStatus("Fuel log saved and synced successfully.", "success");
    } catch (syncError) {
      console.error("Google Sheets fuel sync failed:", syncError);
      showStatus("Fuel log saved, but Google Sheets sync failed.", "error", false);
    }

    clearFuelForm();
    await loadFuelLogs();
  } catch (err) {
    console.error("Unexpected fuel save error:", err);
    showStatus("Unexpected error while saving fuel log.", "error", false);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindFuelEvents() {
  el(ids.saveBtn)?.addEventListener("click", saveFuel);
}

export function initFuel() {
  setDefaultFuelDate();
  bindFuelEvents();
  loadFuelLogs();
}
