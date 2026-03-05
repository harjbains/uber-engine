
import { supabaseClient } from "./supabase.js";

/* ================= INIT ================= */

export function initShifts() {

  populateTimeSelects();
  setDefaultTimes();

  const saveBtn = document.getElementById("save_shift");

  if (saveBtn) {
    saveBtn.addEventListener("click", saveShift);
  }

  loadShifts();
}

/* ================= POPULATE TIME SELECTS ================= */

function populateTimeSelects() {

  const hours = [...Array(24).keys()];
  const minutes = [0,5,10,15,20,25,30,35,40,45,50,55];

  const hourSelects = ["start_hour","end_hour"];
  const minSelects = ["start_min","end_min"];

  hourSelects.forEach(id => {

    const el = document.getElementById(id);
    if (!el) return;

    el.innerHTML = "";

    hours.forEach(h => {

      const opt = document.createElement("option");
      opt.value = h.toString().padStart(2,"0");
      opt.textContent = h.toString().padStart(2,"0");

      el.appendChild(opt);

    });

  });

  minSelects.forEach(id => {

    const el = document.getElementById(id);
    if (!el) return;

    el.innerHTML = "";

    minutes.forEach(m => {

      const opt = document.createElement("option");
      opt.value = m.toString().padStart(2,"0");
      opt.textContent = m.toString().padStart(2,"0");

      el.appendChild(opt);

    });

  });

}

/* ================= DEFAULT TIMES ================= */

function setDefaultTimes() {

  const now = new Date();

  const hour = now.getHours().toString().padStart(2,"0");
  const min = Math.floor(now.getMinutes()/5)*5;
  const minStr = min.toString().padStart(2,"0");

  document.getElementById("end_hour").value = hour;
  document.getElementById("end_min").value = minStr;

}

/* ================= SAVE SHIFT ================= */

async function saveShift() {

  const dateInput = document.getElementById("shift_date");
  const odoStartInput = document.getElementById("odo_start");
  const odoEndInput = document.getElementById("odo_end");
  const grossInput = document.getElementById("gross");
  const tipsInput = document.getElementById("tips");

  const start_hour = document.getElementById("start_hour").value;
  const start_min = document.getElementById("start_min").value;

  const end_hour = document.getElementById("end_hour").value;
  const end_min = document.getElementById("end_min").value;

  const start_time = `${start_hour}:${start_min}`;
  const end_time = `${end_hour}:${end_min}`;

  const shift = {

    date: dateInput.value,
    start_time,
    end_time,
    odo_start: parseInt(odoStartInput.value),
    odo_end: parseInt(odoEndInput.value),
    gross: parseFloat(grossInput.value) || 0,
    tips: parseFloat(tipsInput.value) || 0

  };

  const { error } = await supabaseClient
    .from("shifts")
    .insert([shift]);

  if (error) {
    console.error(error);
    alert("Shift save failed");
    return;
  }

  location.reload();

}

/* ================= LOAD SHIFTS ================= */

async function loadShifts() {

  const { data, error } = await supabaseClient
    .from("shifts")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  renderShifts(data);

}

/* ================= RENDER SHIFTS ================= */

function renderShifts(data) {

  const container = document.getElementById("shiftList");

  if (!container) return;

  if (!data || data.length === 0) {

    container.innerHTML = "No shifts yet";
    return;

  }

  container.innerHTML = data.map(shift => `

  <div class="data-grid">

    <div class="row-top">
      <span class="row-date">${shift.date}</span>
      <span class="row-total">£${shift.gross}</span>
    </div>

    <div class="row-bottom">

      <div class="row-figures">

        <span>${shift.start_time}–${shift.end_time}</span>

        <span>${shift.odo_end - shift.odo_start} mi</span>

      </div>

      <button
        class="btn-sm delete-btn"
        data-id="${shift.id}"
        data-table="shifts">

        Del

      </button>

    </div>

  </div>

  `).join("");

}

