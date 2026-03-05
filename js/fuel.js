import { supabaseClient } from "./supabase.js";

export function initFuel() {

console.log("initFuel called. readyState:", document.readyState);

  const container = document.getElementById("fuel_history");
  if (!container) {
    console.log("fuel_history container not found");
    return;
  }

  loadFuel(container);
}

/* ================= LOAD ================= */

async function loadFuel(container) {

  const { data, error } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error("Fuel load error:", error);
    return;
  }

  renderFuel(container, data || []);
}

/* ================= RENDER ================= */

function renderFuel(container, fuelLogs) {

  if (fuelLogs.length === 0) {
    container.innerHTML = "<p>No fuel logs yet</p>";
    return;
  }

  container.innerHTML = fuelLogs.map(fuel => {

    const pricePerLitre =
      fuel.litres > 0
        ? (fuel.total_cost / fuel.litres).toFixed(2)
        : "0.00";

    return `
  <div class="fuel-grid">

    <div class="row-top">
      <span class="row-date">${formatShortDate(fuel.date)}</span>
      <span class="row-total">£${formatMoney(fuel.total_cost)}</span>
    </div>

    <div class="row-bottom">
      <div class="row-figures">
        <span>${fuel.station_name || ""}</span>
        <span>${fuel.litres}L</span>
        <span>${fuel.odometer}mi</span>
        <span>£${pricePerLitre}/L</span>
      </div>
      <button class="delete-btn" data-id="${fuel.id}" data-table="fuel_logs">Del</button>
    </div>

  </div>
`;
  }).join("");

}

/* ================= HELPERS ================= */

function formatMoney(num) {
  return Number(num || 0).toFixed(2);
}

function formatShortDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(day)} ${monthNames[month - 1]}`;
}