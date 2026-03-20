// https://script.google.com/macros/s/AKfycbw_aoGbvVnmc5p3CFLy0lQKhsrTTZDAOPq4-3yEFQoFtj0I27RaVSMh-Qko78Jitp0qoQ/exec


const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbw_aoGbvVnmc5p3CFLy0lQKhsrTTZDAOPq4-3yEFQoFtj0I27RaVSMh-Qko78Jitp0qoQ/exec";

export async function sendToGoogleSheets(type, payload) {
  try {
    const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        type,
        payload
      })
    });

    const result = await response.json();
    console.log("Google Sheets raw response:", result);

    if (!response.ok) {
      throw new Error(result?.message || `HTTP ${response.status}`);
    }

    const isSuccess =
      result?.result === "success" ||
      result?.status === "success" ||
      result?.success === true ||
      (typeof result?.message === "string" &&
        result.message.toLowerCase().includes("appended"));

    if (!isSuccess) {
      throw new Error(result?.message || `Google Sheets sync failed for ${type}`);
    }

    return result;
  } catch (error) {
    console.error(`sendToGoogleSheets failed for ${type}:`, error);
    throw error;
  }
}

export function formatDateForSheet(dateValue) {
  if (!dateValue) return "";

  // If already yyyy-mm-dd, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return dateValue;
  }

  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return dateValue;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

export function buildShiftSheetPayload(shift) {
  return {
    date: formatDateForSheet(shift.date),
    start_time: shift.start_time ?? "",
    end_time: shift.end_time ?? "",
    odo_start: shift.odo_start ?? "",
    odo_end: shift.odo_end ?? "",
    gross: shift.gross ?? "",
    tips: shift.tips ?? "",
  };
}

export function buildFuelSheetPayload(fuel) {
  return {
    date: formatDateForSheet(fuel.date),
    station: fuel.station ?? "",
    litres: fuel.litres ?? "",
    cost: fuel.cost ?? "",
    miles: fuel.miles ?? "",
  };
}

export function buildExpenseSheetPayload(expense) {
  return {
    date: formatDateForSheet(expense.date),
    amount: expense.amount ?? "",
    notes: expense.notes ?? "",
    category: expense.category ?? "",
  };
}

