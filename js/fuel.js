import { addFuel, getFuel, deleteFuel } from "./db.js";
import { formatCurrency } from "./utils.js";
import { loadMonthlyDashboard } from "./monthly.js";


const form = document.getElementById("fuel-form");
const history = document.getElementById("fuel-history");


export async function loadFuelTable() {

  const { data: fuelLogs, error } = await getFuel();

  if (error) {
    console.error("Fuel load error:", error);
    return;
  }

  history.innerHTML = "";

  if (!fuelLogs || fuelLogs.length === 0) {
    history.innerHTML = "<p>No fuel logs yet</p>";
    return;
  }

  fuelLogs.forEach(entry => renderFuelCard(entry));
}


function renderFuelCard(fuel){

  const card = document.createElement("div");
  card.className = "fuel-card";

  card.innerHTML = `

  <div class="fuel-top">
    <span>${fuel.date}</span>
    <span>${fuel.station}</span>
  </div>

  <div class="fuel-stats">
    <span><strong>Litres</strong> ${fuel.litres}</span>
    <span><strong>Cost</strong> £${Number(fuel.cost).toFixed(2)}</span>
    <span><strong>Miles</strong> ${Number(fuel.miles).toLocaleString()} mi</span>
  </div>

  <button class="delete-btn">Delete</button>

  `;

  history.appendChild(card);
}



form.addEventListener("submit", async e => {

    e.preventDefault();

    const fuel = {

        date: document.getElementById("fuel-date").value,
        station: document.getElementById("fuel-station").value,
        litres: parseFloat(document.getElementById("fuel-litres").value),
        cost: parseFloat(document.getElementById("fuel-cost").value),
        miles: parseInt(document.getElementById("fuel-miles").value)

    };

    await addFuel(fuel);

    form.reset();

    loadFuelTable();
    loadMonthlyDashboard();

});