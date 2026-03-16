// ================================
// FUEL LOGIC
// ================================


// ------------------------------
// Save Fuel
// ------------------------------

document.getElementById("save_fuel")?.addEventListener("click", async () => {

  const fuelEntry = {

    date: document.getElementById("fuel_date").value || today,

    station: document.getElementById("fuel_station").value || null,

    litres: parseFloat(
      document.getElementById("fuel_litres").value
    ) || 0,

    cost: parseFloat(
      document.getElementById("fuel_cost").value
    ) || 0,

    miles: parseInt(
      document.getElementById("fuel_miles").value
    ) || 0

  };

  const { error } = await supabaseClient
    .from("fuel_logs")
    .insert([fuelEntry]);

  if (error) {
    console.error("Fuel save error:", error);
    alert("Fuel entry failed");
    return;
  }

  clearFuelInputs();
  loadFuelHistory();

});


// ------------------------------
// Clear Inputs After Save
// ------------------------------

function clearFuelInputs() {

  document.getElementById("fuel_litres").value = "";
  document.getElementById("fuel_cost").value = "";
  document.getElementById("fuel_miles").value = "";

}


// ------------------------------
// Load Fuel History
// ------------------------------

async function loadFuelHistory() {

  const { data, error } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error("Fuel history error:", error);
    return;
  }

  const container = document.getElementById("fuel_history");
  if (!container) return;

  container.innerHTML = "";

  data.forEach(fuel => {

    // Support BOTH old and new schemas
    const station =
      fuel.station ||
      fuel.station_name ||
      "Unknown";

    const cost =
      fuel.cost ??
      fuel.total_cost ??
      0;

    const litres =
      fuel.litres ??
      0;

    const miles =
      fuel.miles ??
      fuel.odometer ??
      0;

    const pricePerLitre =
      litres > 0 ? cost / litres : 0;

    const div = document.createElement("div");

    div.innerHTML = `
      <p>
        ${fuel.date} |
        ${station} |
        £${Number(cost).toFixed(2)} |
        ${litres} L |
        £${pricePerLitre.toFixed(2)}/L |
        ${miles} mi
      </p>
    `;

    container.appendChild(div);

  });

}

loadFuelHistory();


// ------------------------------
// Monthly Fuel + Shift Stats
// ------------------------------

async function loadMonthlyFuelStats() {

  const monthStart = new Date();
  monthStart.setDate(1);

  const monthStartStr = monthStart.toISOString().split("T")[0];

  const { data: fuelData } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .gte("date", monthStartStr);

  const { data: shiftData } = await supabaseClient
    .from("shifts")
    .select("*")
    .gte("date", monthStartStr);

  const totalFuelCost = fuelData.reduce((sum, f) => {

    const cost = f.cost ?? f.total_cost ?? 0;
    return sum + Number(cost);

  }, 0);

  const totalMiles = shiftData.reduce((sum, s) => {

    return sum + (s.odo_end - s.odo_start);

  }, 0);

  const totalGross = shiftData.reduce((sum, s) => {

    return sum + Number(s.gross) + Number(s.tips || 0);

  }, 0);

  const costPerMile =
    totalMiles > 0 ? totalFuelCost / totalMiles : 0;

  const fuelPercent =
    totalGross > 0 ? (totalFuelCost / totalGross) * 100 : 0;

  console.log("Month gross:", totalGross);
  console.log("Miles:", totalMiles);
  console.log("Fuel:", totalFuelCost);
  console.log("Cost per mile:", costPerMile);
  console.log("Fuel %:", fuelPercent);

}

loadMonthlyFuelStats();