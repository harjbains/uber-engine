import { supabaseClient } from "./supabase.js";
import { sendToGoogleSheets, buildShiftSheetPayload } from "./googleSheets.js";

const ids = {
  date: "shift_date",
  startHour: "start_hour",
  startMin: "start_min",
  endHour: "end_hour",
  endMin: "end_min",
  odoStart: "odo_start",
  odoEnd: "odo_end",
  gross: "gross",
  tips: "tips",
  saveBtn: "save_shift",
  list: "shiftList",
};

function el(id) {
  return document.getElementById(id);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getTimeValue(hourId, minId, fallback = "00:00") {
  const hour = el(hourId)?.value ?? "";
  const min = el(minId)?.value ?? "";

  if (hour === "" && min === "") return fallback;

  return `${pad2(hour || "0")}:${pad2(min || "0")}`;
}

function showMessage(message) {
  alert(message);
}

function clearShiftForm() {
  [ids.odoStart, ids.odoEnd, ids.gross, ids.tips].forEach((id) => {
    const node = el(id);
    if (node) node.value = "";
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildShiftPayload() {
  const date = el(ids.date)?.value?.trim() || "";
  const odoStart = toNumber(el(ids.odoStart)?.value);
  const odoEnd = toNumber(el(ids.odoEnd)?.value);
  const gross = toNumber(el(ids.gross)?.value) ?? 0;
  const tips = toNumber(el(ids.tips)?.value) ?? 0;

  const startTime = getTimeValue(ids.startHour, ids.startMin, "00:00");
  const endTime = getTimeValue(ids.endHour, ids.endMin, startTime);

  return {
    date,
    start_time: startTime,
    end_time: endTime,
    odo_start: odoStart,
    odo_end: odoEnd,
    gross,
    tips,
  };
}

function validateShift(payload) {
  if (!payload.date) return "Please enter a shift date.";
  if (payload.odo_start === null) return "Please enter odometer start.";
  if (payload.odo_end === null) return "Please enter odometer end.";
  if (payload.odo_end < payload.odo_start) {
    return "Odometer end must be greater than or equal to odometer start.";
  }
  return null;
}

function renderShiftHistory(shifts) {
  const container = el(ids.list);
  if (!container) return;

  if (!Array.isArray(shifts) || shifts.length === 0) {
    container.innerHTML = `<div class="history-empty">No shifts saved yet.</div>`;
    return;
  }

  shiftList.innerHTML = shifts.length
  ? `<div class="history-grid">
      ${shifts.map(shift => `
        <div class="history-card">
          <div class="history-card__header">
            <div class="history-card__title">${safeValue(shift.date)}</div>
            <div class="history-card__pill">Shift</div>
          </div>

          <div class="history-card__grid history-card__grid--3x2">
            <div class="history-item">
              <span class="history-item__label">Start</span>
              <span class="history-item__value">${formatTime(shift.start_time)}</span>
            </div>

            <div class="history-item">
              <span class="history-item__label">Odo Start</span>
              <span class="history-item__value">${safeValue(shift.odo_start)}</span>
            </div>

            <div class="history-item">
              <span class="history-item__label">Tips</span>
              <span class="history-item__value">${formatCurrency(shift.tips)}</span>
            </div>

            <div class="history-item">
              <span class="history-item__label">End</span>
              <span class="history-item__value">${formatTime(shift.end_time)}</span>
            </div>

            <div class="history-item">
              <span class="history-item__label">Odo End</span>
              <span class="history-item__value">${safeValue(shift.odo_end)}</span>
            </div>

            <div class="history-item">
              <span class="history-item__label">Earnings</span>
              <span class="history-item__value history-item__value--strong">${formatCurrency(shift.gross)}</span>
            </div>
          </div>
        </div>
      `).join("")}
    </div>`
  : `<div class="history-empty">No shifts logged yet.</div>`;
}

function populateTimeSelect(selectId, values, defaultValue) {
  const select = el(selectId);
  if (!select) return;

  select.innerHTML = values
    .map((value) => `<option value="${value}">${value}</option>`)
    .join("");

  if (defaultValue !== undefined && defaultValue !== null) {
    select.value = defaultValue;
  }
}

function initialiseTimeSelectors() {
  const hours = Array.from({ length: 24 }, (_, i) =>
    String(i).padStart(2, "0")
  );
  const mins = ["00", "15", "30", "45"];

  populateTimeSelect(ids.startHour, hours, "08");
  populateTimeSelect(ids.startMin, mins, "00");
  populateTimeSelect(ids.endHour, hours, "17");
  populateTimeSelect(ids.endMin, mins, "00");
}

export async function loadShifts() {
  const { data, error } = await supabaseClient
    .from("shifts")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  console.log("loadShifts result:", data, error);

  if (error) {
    console.error("Error loading shifts:", error);
    const container = el(ids.list);
    if (container) {
      container.innerHTML = `<div class="error-state">Unable to load shifts.</div>`;
    }
    return [];
  }

  renderShiftHistory(data || []);
  return data || [];
}

export async function saveShift() {
  const saveBtn = el(ids.saveBtn);

  try {
    if (saveBtn) saveBtn.disabled = true;

    const payload = buildShiftPayload();
    console.log("shift payload:", payload);

    const validationError = validateShift(payload);
    if (validationError) {
      showMessage(validationError);
      return;
    }

    const { data, error } = await supabaseClient
      .from("shifts")
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error("Error saving shift:", error);
      showMessage(`Failed to save shift: ${error.message}`);
      return;
    }

    try {
  const sheetPayload = buildShiftSheetPayload(data);

  console.log("Sending shift to Google Sheets:", sheetPayload);
  const syncResult = await sendToGoogleSheets("shift", sheetPayload);
  console.log("Google Sheets sync result:", syncResult);
} catch (syncError) {
  console.error("Google Sheets sync failed:", syncError);
}

    clearShiftForm();
    await loadShifts();
  } catch (err) {
    console.error("Unexpected shift save error:", err);
    showMessage("Unexpected error while saving shift.");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindShiftEvents() {
  const saveBtn = el(ids.saveBtn);
  if (saveBtn) {
    saveBtn.addEventListener("click", saveShift);
  }
}

export function initShifts() {
  initialiseTimeSelectors();
  bindShiftEvents();
  loadShifts();
}

function formatTime(value) {
  if (!value) return "-";
  return value;
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return `£${number.toFixed(2)}`;
}

function safeValue(value) {
  return value ?? "-";
}