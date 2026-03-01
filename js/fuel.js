import { supabaseClient } from "./supabase.js";

export function initFuel() {

  loadFuelHistory();

  const saveBtn = document.getElementById("save-fuel");

  const fuelDateInput = document.getElementById("fuel-date");
if (fuelDateInput) {
  fuelDateInput.value = new Date().toISOString().split("T")[0];
}

  if (saveBtn) {
    saveBtn.addEventListener("click", saveFuel);
  }

  const litresInput = document.getElementById("fuel-litres");
  const priceInput = document.getElementById("fuel-price");
  const costInput = document.getElementById("fuel-cost");

  litresInput?.addEventListener("input", updateFromPrice);
  priceInput?.addEventListener("input", updateFromPrice);
  costInput?.addEventListener("input", updateFromCost);
}

function updateFromPrice() {

  const litres = parseFloat(document.getElementById("fuel-litres").value);
  const price = parseFloat(document.getElementById("fuel-price").value);

  if (!isNaN(litres) && !isNaN(price)) {
    document.getElementById("fuel-cost").value =
      (litres * price).toFixed(2);
  }
}

function updateFromCost() {

  const litres = parseFloat(document.getElementById("fuel-litres").value);
  const cost = parseFloat(document.getElementById("fuel-cost").value);

  if (!isNaN(litres) && !isNaN(cost) && litres > 0) {
    document.getElementById("fuel-price").value =
      (cost / litres).toFixed(3);
  }
}

async function saveFuel() {

  const fuelEntry = {
    date: document.getElementById("fuel-date").value,
    odometer: parseInt(document.getElementById("fuel-odometer").value),
    litres: parseFloat(document.getElementById("fuel-litres").value),
    total_cost: parseFloat(document.getElementById("fuel-cost").value),
    station_name: document.getElementById("fuel-station").value || null
  };

  await supabaseClient.from("fuel_logs").insert([fuelEntry]);

  loadFuelHistory();
}

async function loadFuelHistory() {

  const { data } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .order("odometer", { ascending: true });

  const container = document.getElementById("fuel-history");
  if (!container) return;

  container.innerHTML = "";

  data?.forEach(fuel => {

    const pricePerLitre = fuel.total_cost / fuel.litres;

    const div = document.createElement("div");
div.innerHTML = `
  <p>
    Odo: ${fuel.odometer} |
    ${fuel.station_name ? fuel.station_name + " | " : ""}
    £${fuel.total_cost.toFixed(2)} |
    ${fuel.litres}L |
    £${pricePerLitre.toFixed(2)}/L
    <button class="delete-fuel" data-id="${fuel.id}">Delete</button>
  </p>
`;

    container.appendChild(div);
  });
}

document.addEventListener("click", async (e) => {

  if (e.target.classList.contains("delete-fuel")) {

    const id = e.target.dataset.id;

    await supabaseClient
      .from("fuel_logs")
      .delete()
      .eq("id", id);

    loadFuelHistory();
  }

});