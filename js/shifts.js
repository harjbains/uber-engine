import { supabaseClient } from "./supabase.js";

let editingShiftId = null;

export function initShifts() {

  populateTimeSelectors();
  loadTodayShifts();

  const shiftDateInput = document.getElementById("shift-date");
if (shiftDateInput) {
  shiftDateInput.value = new Date().toISOString().split("T")[0];
}

  const saveBtn = document.getElementById("save-shift");

  if (saveBtn) {
    saveBtn.addEventListener("click", saveShift);
  }
}

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

async function saveShift() {

  const selectedDate =
    document.getElementById("shift-date").value;

  const shift = {
    date: selectedDate,

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

  if (editingShiftId) {

    await supabaseClient
      .from("shifts")
      .update(shift)
      .eq("id", editingShiftId);

    editingShiftId = null;

  } else {

    await supabaseClient
      .from("shifts")
      .insert([shift]);
  }

  loadTodayShifts();
  clearShiftForm();
}

async function loadTodayShifts() {

  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabaseClient
    .from("shifts")
    .select("*")
    .eq("date", today)
    .order("start_time", { ascending: true });

  const shiftList = document.getElementById("shift-list");
  if (!shiftList) return;

  shiftList.innerHTML = "";

  data?.forEach(shift => {

    const miles = shift.odo_end - shift.odo_start;
    const gross = Number(shift.gross) + Number(shift.tips || 0);

    const div = document.createElement("div");
div.innerHTML = `
  <p>
    ${shift.start_time} - ${shift.end_time} |
    ${miles} miles |
    £${gross.toFixed(2)}
    <button class="edit-shift" data-id="${shift.id}">Edit</button>
    <button class="delete-shift" data-id="${shift.id}">Delete</button>
  </p>
`;

    shiftList.appendChild(div);
  });
}

document.addEventListener("click", async (e) => {

  // DELETE SHIFT
  if (e.target.classList.contains("delete-shift")) {

    const id = e.target.dataset.id;

    await supabaseClient
      .from("shifts")
      .delete()
      .eq("id", id);

    loadTodayShifts();
  }

  // EDIT SHIFT
  if (e.target.classList.contains("edit-shift")) {

    const id = e.target.dataset.id;

    const { data } = await supabaseClient
      .from("shifts")
      .select("*")
      .eq("id", id)
      .single();

    if (!data) return;

    editingShiftId = id;

    const [startHour, startMinute] = data.start_time.split(":");
    const [endHour, endMinute] = data.end_time.split(":");

    document.getElementById("start-hour").value = startHour;
    document.getElementById("start-minute").value = startMinute;
    document.getElementById("end-hour").value = endHour;
    document.getElementById("end-minute").value = endMinute;

    document.getElementById("odo-start").value = data.odo_start;
    document.getElementById("odo-end").value = data.odo_end;
    document.getElementById("gross").value = data.gross;
    document.getElementById("tips").value = data.tips;
  }

});

function clearShiftForm() {

  // Reset time selectors to defaults (e.g., 00:00)
  document.getElementById("start-hour").value = "00";
  document.getElementById("start-minute").value = "00";
  document.getElementById("end-hour").value = "00";
  document.getElementById("end-minute").value = "00";

  // Clear numeric fields
  document.getElementById("odo-start").value = "";
  document.getElementById("odo-end").value = "";
  document.getElementById("gross").value = "";
  document.getElementById("tips").value = "";

  // Reset edit state
  editingShiftId = null;
}