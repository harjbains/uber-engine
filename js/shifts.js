import { getShifts, addShift, deleteShift } from "./db.js";

const history = document.getElementById("shift-history");
const form = document.getElementById("shift-form");


export async function loadShifts(){

  const container = document.getElementById("shift-history");

  if(!container){
    console.error("shift-history container not found");
    return;
  }

  const { data: shifts, error } = await getShifts();

  if(error){
    console.error("Error loading shifts:", error);
    return;
  }

  console.log("Shifts returned:", shifts);

  container.innerHTML = "";

  if(!shifts || shifts.length === 0){
    container.innerHTML = "<p>No shifts logged yet</p>";
    return;
  }

  shifts.forEach(shift => renderShiftCard(shift));

}



function renderShiftCard(shift){

  console.log("Rendering shift card");

  const container = document.getElementById("shift-history");

  const start = new Date(`1970-01-01T${shift.start_time}`);
  const end = new Date(`1970-01-01T${shift.end_time}`);

  const hours = (end - start) / 3600000;

  const gross = Number(shift.gross) || 0;
  const tips = Number(shift.tips) || 0;

  const total = gross + tips;

  const miles = (shift.odo_end || 0) - (shift.odo_start || 0);

  const card = document.createElement("div");
  card.className = "shift-card";

  card.innerHTML = `

  <div class="shift-header">
      <span class="shift-date">${shift.date}</span>
      <span class="shift-total">£${total.toFixed(2)}</span>
  </div>

  <div class="shift-stats">
      <span>${hours.toFixed(1)}h</span>
      <span>${miles} mi</span>
      <span>Uber £${gross.toFixed(0)}</span>
      <span>Tips £${tips.toFixed(0)}</span>
  </div>

  <button class="delete-btn">Delete</button>

  `;

  card.querySelector(".delete-btn").addEventListener("click", async () => {
    await deleteShift(shift.id);
    loadShifts();
  });

  container.appendChild(card);

}


export function initShiftForm(){

  const form = document.getElementById("shift-form");

  form.addEventListener("submit", async (e) => {

    e.preventDefault();

    const date = document.getElementById("shift-date").value;

    const hours = Number(document.getElementById("shift-hours").value) || 0;

    const trips = Number(document.getElementById("shift-trips").value) || 0;

    const uber = Number(document.getElementById("shift-uber").value) || 0;

    const cash = Number(document.getElementById("shift-cash").value) || 0;

    const shift = {
      date,
      hours,
      trips,
      uber,
      cash
    };

    console.log("Saving shift:", shift);

    await addShift(shift);

    form.reset();

    await loadShifts();

  });

}