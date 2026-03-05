
import { supabaseClient } from "./supabase.js";

/* ================= INIT ================= */

export function initFuel() {

  const saveBtn = document.getElementById("save_fuel");

  if (saveBtn) {
    saveBtn.addEventListener("click", saveFuel);
  }

  loadFuel();

}

/* ================= SAVE FUEL ================= */

async function saveFuel() {

  const dateInput = document.getElementById("fuel_date");
  const stationInput = document.getElementById("fuel_station");
  const litresInput = document.getElementById("fuel_litres");
  const costInput = document.getElementById("fuel_cost");
  const milesInput = document.getElementById("fuel_miles");

  const fuel = {

    date: dateInput.value,
    station_name: stationInput.value,
    litres: parseFloat(litresInput.value) || 0,
    total_cost: parseFloat(costInput.value) || 0,
    odometer: parseInt(milesInput.value)

  };

  const { error } = await supabaseClient
    .from("fuel_logs")
    .insert([fuel]);

  if (error) {
    console.error(error);
    alert("Fuel save failed");
    return;
  }

  location.reload();

}

/* ================= LOAD FUEL ================= */

async function loadFuel() {

  const { data, error } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  renderFuel(data);

}

/* ================= RENDER FUEL ================= */

function renderFuel(data) {

  const container = document.getElementById("fuel_history");

  if (!container) return;

  if (!data || data.length === 0) {

    container.innerHTML = "No fuel records yet";
    return;

  }

  container.innerHTML = data.map(fuel => `

  <div class="fuel-grid">

    <div class="row-top">

      <span class="row-date">${fuel.date}</span>

      <span>£${fuel.total_cost}</span>

    </div>

    <div class="row-bottom">

      <div class="row-figures">

        <span>${fuel.station_name}</span>
        <span>${fuel.litres} L</span>
        <span>${fuel.odometer} mi</span>

      </div>

      <button
        class="btn-sm delete-btn"
        data-id="${fuel.id}"
        data-table="fuel_logs">

        Del

      </button>

    </div>

  </div>

  `).join("");

}

