import { supabaseClient } from "./supabase.js";

export function initShifts() {

  const saveButton = document.getElementById("save_shift");
  if (!saveButton) return;

  const dateInput = document.getElementById("shift_date");
  const startInput = document.getElementById("start_time");
  const endInput = document.getElementById("end_time");
  const odoStartInput = document.getElementById("odo_start");
  const odoEndInput = document.getElementById("odo_end");
  const grossInput = document.getElementById("gross");
  const tipsInput = document.getElementById("tips");

  /* =========================
     ACTIVE SHIFT MEMORY
  ========================= */

  const savedOdo = localStorage.getItem("activeShiftOdoStart");
  if (savedOdo && odoStartInput) {
    odoStartInput.value = savedOdo;
  }

  odoStartInput?.addEventListener("input", () => {
    localStorage.setItem("activeShiftOdoStart", odoStartInput.value);
  });

  /* =========================
     SAVE SHIFT
  ========================= */

  saveButton.addEventListener("click", async () => {

    const shift = {
      date: dateInput.value,
      start_time: startInput.value,
      end_time: endInput.value,
      odo_start: parseInt(odoStartInput.value),
      odo_end: parseInt(odoEndInput.value),
      gross: parseFloat(grossInput.value) || 0,
      tips: parseFloat(tipsInput.value) || 0
    };

    /* ===== Validation ===== */

    if (!shift.date) {
      alert("Date is required");
      return;
    }

    if (!shift.odo_start || !shift.odo_end) {
      alert("Odometer start and end required");
      return;
    }

    if (shift.odo_end < shift.odo_start) {
      alert("Odometer end cannot be less than start");
      return;
    }

    /* ===== Insert into Supabase ===== */

    const { error } = await supabaseClient
      .from("shifts")
      .insert([shift]);

    if (error) {
      console.error("Insert error:", error);
      alert("Error saving shift");
      return;
    }

    /* ===== Clear Active Shift Memory ===== */

    localStorage.removeItem("activeShiftOdoStart");

    /* ===== Reset Form ===== */

    dateInput.value = "";
    startInput.value = "";
    endInput.value = "";
    odoStartInput.value = "";
    odoEndInput.value = "";
    grossInput.value = "";
    tipsInput.value = "";

    /* ===== Trigger Monthly Refresh ===== */

    document.dispatchEvent(new Event("shiftsUpdated"));

    alert("Shift saved successfully");

  });

}