import { getShifts, addShift, deleteShift } from "./db.js";


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

    const startHour = document.getElementById("shift-start-hour").value;
    const startMin = document.getElementById("shift-start-min").value;

    const endHour = document.getElementById("shift-end-hour").value;
    const endMin = document.getElementById("shift-end-min").value;

    const start_time = `${startHour}:${startMin}:00`;
    const end_time = `${endHour}:${endMin}:00`;

    const odo_start = Number(document.getElementById("shift-odo-start").value) || 0;
    const odo_end = Number(document.getElementById("shift-odo-end").value) || 0;

    const gross = Number(document.getElementById("shift-gross").value) || 0;
    const tips = Number(document.getElementById("shift-tips").value) || 0;

    const shift = {
      date,
      start_time,
      end_time,
      odo_start,
      odo_end,
      gross,
      tips
    };

    console.log("Saving shift:", shift);

    const { error } = await addShift(shift);

    if(error){
      console.error("Insert failed:", error);
      return;
    }

    form.reset();

    await loadShifts();

  });

}