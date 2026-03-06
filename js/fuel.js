import { supabaseClient } from "./supabase.js";
import { TABLES } from "./db.js";

/* ================= INIT ================= */

export function initFuel() {

  const saveBtn = document.getElementById("save_fuel");
  if (saveBtn) saveBtn.addEventListener("click", saveFuel);

  const fuelContainer = document.getElementById("fuel_history");
  if (fuelContainer) {
    fuelContainer.addEventListener("click", handleFuelDelete);
  }

  const stationInput = document.getElementById("fuel_station");
  if (stationInput) {
    stationInput.addEventListener("input", handleStationSearch);
  }

  /* CLICK STATION SUGGESTION */

  const suggestions = document.getElementById("station_suggestions");

  if (suggestions) {

    suggestions.addEventListener("click", (e) => {

      const option = e.target.closest(".station-option");
      if (!option) return;

      stationInput.value = option.dataset.name;

      suggestions.style.display = "none";

    });

  }

  loadFuel();
  loadStationSuggestions();

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
    station_name: stationInput.value.trim(),
    litres: parseFloat(litresInput.value) || 0,
    total_cost: parseFloat(costInput.value) || 0,
    odometer: parseInt(milesInput.value) || null

  };

  if (!fuel.station_name) {
    alert("Please enter a station name");
    return;
  }

  /* INSERT FUEL LOG */

  const { error } = await supabaseClient
    .from(TABLES.FUEL_LOGS)
    .insert([fuel]);

  if (error) {
    console.error(error);
    alert("Fuel save failed");
    return;
  }

  /* UPDATE STATION USAGE */

  await updateStationUsage(fuel.station_name);

  location.reload();

}

/* ================= LOAD FUEL ================= */

async function loadFuel() {

  const { data, error } = await supabaseClient
    .from(TABLES.FUEL_LOGS)
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
          class="btn-sm delete-fuel-btn"
          data-id="${fuel.id}">
          Del
        </button>

      </div>

    </div>

  `).join("");

}

/* ================= DELETE FUEL ================= */

async function handleFuelDelete(e) {

  const btn = e.target.closest(".delete-fuel-btn");

  if (!btn) return;

  const id = btn.dataset.id;

  if (!id) return;

  const confirmDelete = confirm("Delete this fuel entry?");
  if (!confirmDelete) return;

  const { error } = await supabaseClient
    .from(TABLES.FUEL_LOGS)
    .delete()
    .eq("id", id);

  if (error) {
    console.error(error);
    alert("Delete failed");
    return;
  }

  loadFuel();

}

/* ================= STATION AUTOCOMPLETE ================= */

async function loadStationSuggestions() {

  const { data, error } = await supabaseClient
    .from("fuel_stations")
    .select("*")
    .order("usage_count", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  renderStationSuggestions(data);

}

function renderStationSuggestions(data) {

  const container = document.getElementById("station_suggestions");

  if (!container) return;

  container.innerHTML = data.map(station => `

    <div class="station-option" data-name="${station.station_name}">
      ${station.station_name}
    </div>

  `).join("");

}

/* ================= SEARCH FILTER ================= */

function handleStationSearch(e) {

  const query = e.target.value.toLowerCase();
  const container = document.getElementById("station_suggestions");

  const options = document.querySelectorAll(".station-option");

  let visible = 0;

  options.forEach(opt => {

    const name = opt.dataset.name.toLowerCase();

    if (name.includes(query) && query.length > 0) {

      opt.style.display = "block";
      visible++;

    } else {

      opt.style.display = "none";

    }

  });

  container.style.display = visible ? "block" : "none";

}

/* ================= STATION USAGE ================= */

async function updateStationUsage(stationName) {

  const { data } = await supabaseClient
    .from("fuel_stations")
    .select("*")
    .eq("station_name", stationName)
    .single();

  if (!data) {

    await supabaseClient
      .from("fuel_stations")
      .insert({
        station_name: stationName,
        usage_count: 1
      });

  } else {

    await supabaseClient
      .from("fuel_stations")
      .update({
        usage_count: data.usage_count + 1
      })
      .eq("station_name", stationName);

  }

}

function showTopStations() {

  const container = document.getElementById("station_suggestions");
  if (!container) return;

  const options = container.querySelectorAll(".station-option");

  let visible = 0;

  options.forEach(opt => {

    if (visible < 5) {
      opt.style.display = "block";
      visible++;
    } else {
      opt.style.display = "none";
    }

  });

  container.style.display = visible ? "block" : "none";

}