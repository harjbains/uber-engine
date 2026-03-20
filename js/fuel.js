import { supabaseClient } from "./supabase.js";
import { sendToGoogleSheets, buildFuelSheetPayload } from "./googleSheets.js";
import { showStatus } from "./status.js";

const ids = {
  date: "fuel_date",
  station: "fuel_station",
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

function buildFuelPayload() {
  return {
    date: el(ids.date)?.value?.trim() || "",
    station: el(ids.station)?.value?.trim() || "",
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
  [ids.station, ids.litres, ids.cost, ids.miles].forEach((id) => {
    const node = el(id);
    if (node) node.value = "";
  });
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
        .map(
          (item) => `
            <div class="history-card">
              <div class="history-card__header">
                <div class="history-card__title">${escapeHtml(safeValue(item.date))}</div>
                <div class="history-card__pill">Fuel</div>
              </div>

              <div class="history-card__grid history-card__grid--3x2">
                <div class="history-item">
                  <span class="history-item__label">Station</span>
                  <span class="history-item__value">${escapeHtml(safeValue(item.station))}</span>
                </div>

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
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

export async function loadFuelLogs() {
  const { data, error } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  console.log("loadFuelLogs result:", data, error);

  if (error) {
    console.error("Error loading fuel logs:", error);
    const container = el(ids.list);
    if (container) {
      container.innerHTML = `<div class="error-state">Unable to load fuel logs.</div>`;
    }
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
    console.log("fuel payload:", payload);

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
      showStatus("Fuel log saved. Syncing to Google Sheets...", "info", false);

      const sheetPayload = buildFuelSheetPayload(data);
      console.log("Sending fuel to Google Sheets:", sheetPayload);

      const syncResult = await sendToGoogleSheets("fuel", sheetPayload);
      console.log("Google Sheets fuel sync result:", syncResult);

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
  const saveBtn = el(ids.saveBtn);
  if (saveBtn) {
    saveBtn.addEventListener("click", saveFuel);
  }
}

export function initFuel() {
  bindFuelEvents();
  loadFuelLogs();
}