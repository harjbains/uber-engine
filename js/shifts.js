import { supabaseClient } from "./supabase.js";
import { TABLES } from "./db.js";
import {
  formatShortDate,
  calculateShiftHours,
  calculateHourlyRate,
  calculateMiles
} from "./utils.js";

/* ================= WEEK STATE ================= */

let currentWeekOffset = 0;

/* ================= INIT ================= */

export function initShifts() {

  populateTimeSelects();
  setDefaultShiftValues();

  const saveBtn = document.getElementById("save_shift");
  if (saveBtn) saveBtn.addEventListener("click", saveShift);

  const prevBtn = document.getElementById("prevWeek");
  const nextBtn = document.getElementById("nextWeek");

  if (prevBtn) {
    prevBtn.onclick = () => {
      currentWeekOffset--;
      loadShifts();
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      currentWeekOffset++;
      loadShifts();
    };
  }

  const shiftContainer = document.getElementById("shiftList");

  if (shiftContainer) {
    shiftContainer.addEventListener("click", handleShiftDelete);
  }

  loadShifts();
}

/* ================= POPULATE TIME SELECTS ================= */

function populateTimeSelects() {

  const hours = [...Array(24).keys()].map(h => String(h).padStart(2, "0"));
  const minutes = [0,5,10,15,20,25,30,35,40,45,50,55].map(m =>
    String(m).padStart(2,"0")
  );

  const hourIds = ["start_hour","end_hour"];
  const minIds = ["start_min","end_min"];

  hourIds.forEach(id => {

    const el = document.getElementById(id);
    if (!el) return;

    el.innerHTML = "";

    hours.forEach(val => {

      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;

      el.appendChild(opt);

    });

  });

  minIds.forEach(id => {

    const el = document.getElementById(id);
    if (!el) return;

    el.innerHTML = "";

    minutes.forEach(val => {

      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;

      el.appendChild(opt);

    });

  });

}

/* ================= DEFAULT VALUES ================= */

function setDefaultShiftValues() {

  const now = new Date();

  const today = now.toISOString().split("T")[0];
  const dateInput = document.getElementById("shift_date");

  if (dateInput && !dateInput.value) {
    dateInput.value = today;
  }

  const hour = String(now.getHours()).padStart(2,"0");
  const roundedMin = Math.floor(now.getMinutes()/5)*5;
  const min = String(roundedMin).padStart(2,"0");

  const startHour = document.getElementById("start_hour");
  const startMin = document.getElementById("start_min");
  const endHour = document.getElementById("end_hour");
  const endMin = document.getElementById("end_min");

  if (startHour) startHour.value = hour;
  if (startMin) startMin.value = min;

  if (endHour) endHour.value = hour;
  if (endMin) endMin.value = min;

}

/* ================= SAVE SHIFT ================= */

async function saveShift() {

  const dateInput = document.getElementById("shift_date");
  const odoStartInput = document.getElementById("odo_start");
  const odoEndInput = document.getElementById("odo_end");
  const grossInput = document.getElementById("gross");
  const tipsInput = document.getElementById("tips");

  const start_hour = document.getElementById("start_hour")?.value;
  const start_min = document.getElementById("start_min")?.value;
  const end_hour = document.getElementById("end_hour")?.value;
  const end_min = document.getElementById("end_min")?.value;

  if (!dateInput?.value) return alert("Please select a date.");
  if (!start_hour || !start_min || !end_hour || !end_min)
    return alert("Please select start and end time.");

  const shift = {

    date: dateInput.value,
    start_time: `${start_hour}:${start_min}`,
    end_time: `${end_hour}:${end_min}`,
    odo_start: parseInt(odoStartInput?.value,10) || null,
    odo_end: parseInt(odoEndInput?.value,10) || null,
    gross: parseFloat(grossInput?.value) || 0,
    tips: parseFloat(tipsInput?.value) || 0

  };

  const { error } = await supabaseClient
    .from(TABLES.SHIFTS)
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
    .from(TABLES.SHIFTS)
    .select("*")
    .order("date",{ ascending:false });

  if (error) {

    console.error(error);
    return;

  }

  const { monday, sunday } = getWeekRange(currentWeekOffset);

  const weekShifts = data.filter(shift => {

    const shiftDate = new Date(shift.date);

    return shiftDate >= monday && shiftDate <= sunday;

  });

  renderShifts(weekShifts);

  updateWeeklySummary(weekShifts);

  updateWeekLabel(monday,sunday);

}

/* ================= RENDER SHIFTS ================= */

function renderShifts(data) {

  const container = document.getElementById("shiftList");

  if (!container) return;

  if (!data || data.length === 0) {

    container.innerHTML = "No shifts logged this week";
    return;

  }

  container.innerHTML = data.map(shift => {

    const date = formatShortDate(shift.date);
    const gross = shift.gross ?? 0;

    const hours = calculateShiftHours(
      shift.start_time,
      shift.end_time
    );

    const hourly = calculateHourlyRate(gross,hours);

    const miles = calculateMiles(
      shift.odo_start,
      shift.odo_end
    );

    let rateClass = "";

    if (hourly >= 20) rateClass = "rate-good";
    else if (hourly >= 15) rateClass = "rate-mid";
    else rateClass = "rate-low";

    return `

    <div class="data-grid">

      <div class="row-top">

        <span class="row-date">${date}</span>
        <span class="row-total">£${gross}</span>

      </div>

      <div class="row-bottom">

        <div class="row-figures">

          <span>${shift.start_time}–${shift.end_time}</span>
          <span>${hours.toFixed(1)}h</span>
          <span class="${rateClass}">£${hourly.toFixed(2)}/hr</span>
          <span>${miles} mi</span>

        </div>

        <button
          class="btn-sm delete-btn"
          data-id="${shift.id}">
          Del
        </button>

      </div>

    </div>

    `;

  }).join("");

}

/* ================= DELETE SHIFT ================= */

async function handleShiftDelete(e) {

  const btn = e.target.closest(".delete-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  if (!id) return;

  const confirmDelete = confirm("Delete this shift?");
  if (!confirmDelete) return;

  const { error } = await supabaseClient
    .from(TABLES.SHIFTS)
    .delete()
    .eq("id",id);

  if (error) {

    console.error(error);
    alert("Delete failed");
    return;

  }

  loadShifts();

}

/* ================= WEEK SUMMARY ================= */

function updateWeeklySummary(data) {

  let totalHours = 0;
  let totalIncome = 0;

  data.forEach(shift => {

    const hours = calculateShiftHours(
      shift.start_time,
      shift.end_time
    );

    totalHours += hours;
    totalIncome += shift.gross ?? 0;

  });

  const avgRate = totalHours > 0
    ? totalIncome / totalHours
    : 0;

  const summaryEl = document.getElementById("weekly-summary");

  if (!summaryEl) return;

  summaryEl.innerHTML = `

    <span>
      <small>Hours</small>
      ${totalHours.toFixed(1)}
    </span>

    <span>
      <small>Income</small>
      £${totalIncome.toFixed(0)}
    </span>

    <span>
      <small>Avg £/hr</small>
      £${avgRate.toFixed(2)}
    </span>

  `;

}

/* ================= WEEK LABEL ================= */

function updateWeekLabel(monday,sunday) {

  const label = document.getElementById("weekLabel");

  if (!label) return;

  label.textContent =
    monday.toLocaleDateString("en-GB",{day:"2-digit",month:"short"}) +
    " – " +
    sunday.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});

}

/* ================= WEEK RANGE ================= */

function getWeekRange(offset = 0) {

  const now = new Date();

  const monday = new Date(now);

  const day = monday.getDay();
  const diff = (day === 0 ? -6 : 1) - day;

  monday.setDate(monday.getDate() + diff + offset * 7);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return { monday, sunday };

}