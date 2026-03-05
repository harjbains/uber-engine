import { supabaseClient } from "./supabase.js";

/* ================= INIT ================= */

export function initShifts() {
  populateTimeSelects();
  setDefaultShiftValues();

  const saveBtn = document.getElementById("save_shift");
  if (saveBtn) saveBtn.addEventListener("click", saveShift);

  loadShifts();
}

/* ================= POPULATE TIME SELECTS ================= */

function populateTimeSelects() {
  const hours = [...Array(24).keys()].map((h) => String(h).padStart(2, "0"));
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) =>
    String(m).padStart(2, "0")
  );

  const hourIds = ["start_hour", "end_hour"];
  const minIds = ["start_min", "end_min"];

  hourIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.innerHTML = "";
    hours.forEach((val) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      el.appendChild(opt);
    });
  });

  minIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.innerHTML = "";
    minutes.forEach((val) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      el.appendChild(opt);
    });
  });
}

/* ================= DEFAULT DATE + TIMES ================= */

function setDefaultShiftValues() {
  const now = new Date();

  // Date default to today (YYYY-MM-DD)
  const today = now.toISOString().split("T")[0];
  const dateInput = document.getElementById("shift_date");
  if (dateInput && !dateInput.value) dateInput.value = today;

  // Time default to now rounded DOWN to 5 mins
  const hour = String(now.getHours()).padStart(2, "0");
  const roundedMin = Math.floor(now.getMinutes() / 5) * 5;
  const min = String(roundedMin).padStart(2, "0");

  const startHour = document.getElementById("start_hour");
  const startMin = document.getElementById("start_min");
  const endHour = document.getElementById("end_hour");
  const endMin = document.getElementById("end_min");

  // Only set defaults if they exist (and are currently empty-ish)
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
    odo_start: parseInt(odoStartInput?.value, 10) || null,
    odo_end: parseInt(odoEndInput?.value, 10) || null,
    gross: parseFloat(grossInput?.value) || 0,
    tips: parseFloat(tipsInput?.value) || 0,
  };

  const { error } = await supabaseClient.from("shifts").insert([shift]);

  if (error) {
    console.error(error);
    alert("Shift save failed");
    return;
  }

  location.reload();
}

/* ================= LOAD + RENDER SHIFTS ================= */

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

function renderShifts(data) {
  const container = document.getElementById("shiftList");
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = "No shifts yet";
    return;
  }

  container.innerHTML = data
    .map(
      (shift) => `
    <div class="data-grid">
      <div class="row-top">
        <span class="row-date">${shift.date}</span>
        <span class="row-total">£${shift.gross ?? 0}</span>
      </div>

      <div class="row-bottom">
        <div class="row-figures">
          <span>${shift.start_time ?? ""}–${shift.end_time ?? ""}</span>
          ${
            shift.odo_start != null && shift.odo_end != null
              ? `<span>${shift.odo_end - shift.odo_start} mi</span>`
              : `<span></span>`
          }
        </div>

        <button
          class="btn-sm delete-btn"
          data-id="${shift.id}"
          data-table="shifts">
          Del
        </button>
      </div>
    </div>
  `
    )
    .join("");
}