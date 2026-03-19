import { supabaseClient } from "./supabase.js";

export function initFuel() {
  document.getElementById("save_fuel")
    ?.addEventListener("click", saveFuel);

  loadFuel();
}

export async function loadFuel() {
  const fuelHistory = document.getElementById("fuel_history");

  if (!fuelHistory) return;

  try {
    const { data, error } = await supabaseClient
      .from("fuel_logs")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading fuel logs:", error);
      fuelHistory.innerHTML = `<div class="history-empty">Unable to load fuel logs.</div>`;
      return;
    }

    const fuelLogs = data || [];

    const safeValue = (value) => {
      return value !== null && value !== undefined && value !== "" ? value : "-";
    };

    const formatCurrency = (value) => {
      const number = Number(value || 0);
      return `£${number.toFixed(2)}`;
    };

    const formatLitres = (value) => {
      const number = Number(value || 0);
      return Number.isFinite(number) ? `${number.toFixed(2)} L` : "-";
    };

    fuelHistory.innerHTML = fuelLogs.length
      ? `
        <div class="history-grid">
          ${fuelLogs
            .map((log) => {
              const stationName = log.station || log.station_name || "Fuel entry";

              return `
                <div class="history-card">
                  <div class="history-card__header">
  <div class="history-card__title">${safeValue(log.date)}</div>
  <div class="history-card__pill">${stationName}</div>
</div>

                  <div class="history-card__grid history-card__grid--3x2">
  <div class="history-item">
    <span class="history-item__label">Litres</span>
    <span class="history-item__value">${formatLitres(log.litres)}</span>
  </div>

  <div class="history-item">
    <span class="history-item__label">Miles</span>
    <span class="history-item__value">${safeValue(log.miles)}</span>
  </div>

  <div class="history-item">
    <span class="history-item__label">Cost</span>
    <span class="history-item__value history-item__value--strong">${formatCurrency(log.cost)}</span>
  </div>
</div>
                </div>
              `;
            })
            .join("")}
        </div>
      `
      : `<div class="history-empty">No fuel logs yet.</div>`;
  } catch (err) {
    console.error("Unexpected error loading fuel logs:", err);
    fuelHistory.innerHTML = `<div class="history-empty">Unable to load fuel logs.</div>`;
  }
}

async function saveFuel() {
  const fuel = {
  date: document.getElementById("fuel_date").value,
  station: document.getElementById("fuel_station").value.trim(),
  litres: Number(document.getElementById("fuel_litres").value) || 0,
  cost: Number(document.getElementById("fuel_cost").value) || 0,
  miles: Number(document.getElementById("fuel_miles").value) || 0
};

  await supabaseClient.from("fuel_logs").insert([fuel]);

  await loadFuel();
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return `£${number.toFixed(2)}`;
}

function formatLitres(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? `${number.toFixed(2)} L` : "-";
}

function safeValue(value) {
  return value ?? "-";
}