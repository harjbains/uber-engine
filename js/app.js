// ================================
// VERSION
// ================================

const APP_VERSION = "v0.2.0";
const APP_CHANGELOG = "Custom time selector + Fuel logging + MPG";

const now = new Date();
const today = now.toISOString().split("T")[0];

document.getElementById("current-date").innerText =
  now.toLocaleDateString() + " " + now.toLocaleTimeString();

document.getElementById("build-version").innerText =
  APP_VERSION + " – " + APP_CHANGELOG;


// ================================
// TAB SWITCHING
// ================================

document.querySelectorAll("nav button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(tab => {
      tab.classList.remove("active");
    });

    const target = document.getElementById(btn.dataset.tab);
    if (target) {
      target.classList.add("active");
    }
  });
});


// ================================
// TIME SELECTOR POPULATION
// ================================

function populateTimeSelectors() {
  const hourSelectors = ["start-hour", "end-hour"];
  const minuteSelectors = ["start-minute", "end-minute"];

  hourSelectors.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = "";
    for (let h = 0; h < 24; h++) {
      const hour = String(h).padStart(2, "0");
      select.innerHTML += `<option value="${hour}">${hour}</option>`;
    }
  });

  minuteSelectors.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = "";
    for (let m = 0; m < 60; m += 5) {
      const minute = String(m).padStart(2, "0");
      select.innerHTML += `<option value="${minute}">${minute}</option>`;
    }
  });
}

populateTimeSelectors();


// ================================
// SHIFT LOGIC
// ================================

document.getElementById("save-shift").addEventListener("click", async () => {

  const shift = {
    date: today,
    start_time:
      document.getElementById("start-hour").value +
      ":" +
      document.getElementById("start-minute").value,

    end_time:
      document.getElementById("end-hour").value +
      ":" +
      document.getElementById("end-minute").value,

    odo_start: parseInt(document.getElementById("odo-start").value),
    odo_end: parseInt(document.getElementById("odo-end").value),
    gross: parseFloat(document.getElementById("gross").value),
    tips: parseFloat(document.getElementById("tips").value) || 0
  };

  const { error } = await supabaseClient
    .from("shifts")
    .insert([shift]);

  if (error) {
    console.error(error);
    return;
  }

  loadTodayShifts();
});


async function loadTodayShifts() {

  const { data, error } = await supabaseClient
    .from("shifts")
    .select("*")
    .eq("date", today)
    .order("start_time", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  const shiftList = document.getElementById("shift-list");
  shiftList.innerHTML = "";

  let totalMiles = 0;
  let totalGross = 0;
  let totalHours = 0;

  data.forEach(shift => {

    const miles = shift.odo_end - shift.odo_start;
    const gross = Number(shift.gross) + Number(shift.tips || 0);

    const start = new Date(`1970-01-01T${shift.start_time}`);
    const end = new Date(`1970-01-01T${shift.end_time}`);
    const hours = (end - start) / (1000 * 60 * 60);

    totalMiles += miles;
    totalGross += gross;
    totalHours += hours;

    const div = document.createElement("div");
    div.innerHTML = `
      <p>
        ${shift.start_time} - ${shift.end_time} |
        ${miles} miles |
        £${gross.toFixed(2)}
      </p>
    `;

    shiftList.appendChild(div);
  });

  document.getElementById("total-miles").innerText = totalMiles;
  document.getElementById("total-gross").innerText = totalGross.toFixed(2);
  document.getElementById("total-hours").innerText = totalHours.toFixed(2);
}

loadTodayShifts();


// ================================
// FUEL LOGIC
// ================================

function updateFuelFromPrice() {
  const litres = parseFloat(document.getElementById("fuel-litres").value);
  const price = parseFloat(document.getElementById("fuel-price").value);

  if (!isNaN(litres) && !isNaN(price)) {
    const total = litres * price;
    document.getElementById("fuel-cost").value = total.toFixed(2);
  }
}

function updateFuelFromCost() {
  const litres = parseFloat(document.getElementById("fuel-litres").value);
  const cost = parseFloat(document.getElementById("fuel-cost").value);

  if (!isNaN(litres) && !isNaN(cost) && litres > 0) {
    const price = cost / litres;
    document.getElementById("fuel-price").value = price.toFixed(3);
  }
}

document.getElementById("fuel-price")
  .addEventListener("input", updateFuelFromPrice);

document.getElementById("fuel-cost")
  .addEventListener("input", updateFuelFromCost);

function updateFuelCost() {
  const litres = parseFloat(document.getElementById("fuel-litres").value);
  const price = parseFloat(document.getElementById("fuel-price").value);

  if (!isNaN(litres) && !isNaN(price)) {
    const total = litres * price;
    document.getElementById("fuel-cost").value = total.toFixed(2);
  }
}

document.getElementById("fuel-litres").addEventListener("input", updateFuelCost);
document.getElementById("fuel-price").addEventListener("input", updateFuelCost);

document.getElementById("save-fuel").addEventListener("click", async () => {

  const fuelEntry = {
    date: today,
    odometer: parseInt(document.getElementById("fuel-odometer").value),
    litres: parseFloat(document.getElementById("fuel-litres").value),
    total_cost: parseFloat(document.getElementById("fuel-cost").value),
    station_name: document.getElementById("fuel-station").value || null
  };

  const { error } = await supabaseClient
    .from("fuel_logs")
    .insert([fuelEntry]);

  if (error) {
    console.error(error);
    return;
  }

  loadFuelHistory();
});


async function loadFuelHistory() {

  const { data, error } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .order("odometer", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  const container = document.getElementById("fuel-history");
  container.innerHTML = "";

  if (!data || data.length === 0) return;

  let totalMiles = 0;
  let totalLitres = 0;

  data.forEach((fuel, index) => {

    const pricePerLitre = fuel.total_cost / fuel.litres;
    let mpgDisplay = "";

    if (index > 0) {
      const previous = data[index - 1];
      const milesDriven = fuel.odometer - previous.odometer;

      if (milesDriven > 0 && fuel.litres > 0) {
        const mpg = (milesDriven / fuel.litres) * 4.54609;
        mpgDisplay = ` | MPG: ${mpg.toFixed(1)}`;

        totalMiles += milesDriven;
        totalLitres += fuel.litres;
      }
    }

    const div = document.createElement("div");
div.innerHTML = `
  <p>
    Odo: ${fuel.odometer} |
    ${fuel.station_name ? fuel.station_name + " | " : ""}
    £${fuel.total_cost.toFixed(2)} |
    ${fuel.litres}L |
    £${pricePerLitre.toFixed(2)}/L
    ${mpgDisplay}
  </p>
`;

    container.appendChild(div);
  });

  if (totalLitres > 0) {
    const avgMPG = (totalMiles / totalLitres) * 4.54609;
    const avgDiv = document.createElement("div");
    avgDiv.innerHTML = `<p><strong>Rolling Avg MPG: ${avgMPG.toFixed(1)}</strong></p>`;
    container.appendChild(avgDiv);
  }
}

loadFuelHistory();

async function loadMonthlyFuelStats() {

  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartStr = monthStart.toISOString().split("T")[0];

  // Get fuel this month
  const { data: fuelData, error: fuelError } = await supabaseClient
    .from("fuel_logs")
    .select("*")
    .gte("date", monthStartStr);

  if (fuelError) {
    console.error(fuelError);
    return;
  }

  // Get shifts this month
  const { data: shiftData, error: shiftError } = await supabaseClient
    .from("shifts")
    .select("*")
    .gte("date", monthStartStr);

  if (shiftError) {
    console.error(shiftError);
    return;
  }

  const totalFuelCost = fuelData.reduce((sum, f) => sum + Number(f.total_cost), 0);

  const totalMiles = shiftData.reduce(
    (sum, s) => sum + (s.odo_end - s.odo_start),
    0
  );

  const totalGross = shiftData.reduce(
    (sum, s) => sum + Number(s.gross) + Number(s.tips || 0),
    0
  );

  const costPerMile =
    totalMiles > 0 ? totalFuelCost / totalMiles : 0;

  const fuelPercent =
    totalGross > 0 ? (totalFuelCost / totalGross) * 100 : 0;

  document.getElementById("month-gross").innerText =
    totalGross.toFixed(2);

  document.getElementById("month-miles").innerText =
    totalMiles;

  document.getElementById("month-net").innerText =
    (totalGross - totalFuelCost).toFixed(2);

  const statsDiv = document.createElement("div");
  statsDiv.innerHTML = `
    <p>Fuel Total: £${totalFuelCost.toFixed(2)}</p>
    <p>Fuel Cost Per Mile: £${costPerMile.toFixed(3)}</p>
    <p>Fuel % of Gross: ${fuelPercent.toFixed(1)}%</p>
  `;

  const monthSection = document.getElementById("month");
  monthSection.appendChild(statsDiv);
}

loadMonthlyFuelStats();