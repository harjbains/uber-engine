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
      throw new Error(result?.message || result?.error || `HTTP ${response.status}`);
    }

    const isSuccess =
      result?.ok === true ||
      result?.result === "success" ||
      result?.status === "success" ||
      result?.success === true ||
      (typeof result?.message === "string" &&
        (
          result.message.toLowerCase().includes("append") ||
          result.message.toLowerCase().includes("sync") ||
          result.message.toLowerCase().includes("update")
        ));

    if (!isSuccess) {
      throw new Error(result?.message || result?.error || `Google Sheets sync failed for ${type}`);
    }

    return result;
  } catch (error) {
    console.error(`sendToGoogleSheets failed for ${type}:`, error);
    throw error;
  }
}

export function formatDateForSheet(dateValue) {
  if (!dateValue) return "";

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
    id: shift.id ?? "",
    date: formatDateForSheet(shift.date),
    start_time: shift.start_time ?? "",
    end_time: shift.end_time ?? "",
    shift_miles: shift.shift_miles ?? "",
    odo_end: shift.odo_end ?? "",
    gross: shift.gross ?? "",
    tips: shift.tips ?? "",
    created_at: shift.created_at ?? "",
    updated_at: shift.updated_at ?? ""
  };
}

export function buildFuelSheetPayload(fuel) {
  return {
    date: formatDateForSheet(fuel.date),
    station: fuel.station ?? "",
    litres: fuel.litres ?? "",
    cost: fuel.cost ?? "",
    miles: fuel.miles ?? ""
  };
}

export function buildExpenseSheetPayload(expense) {
  return {
    date: formatDateForSheet(expense.date),
    amount: expense.amount ?? "",
    notes: expense.notes ?? "",
    category: expense.category ?? ""
  };
}

export function buildMonthlySheetPayload(summary) {
  if (!summary.month) {
    throw new Error("Month is required");
  }

  return {
    month: summary.month,
    total_income: summary.totalIncome ?? 0,
    total_profit: summary.totalProfit ?? 0,
    total_fuel: summary.totalFuel ?? 0,
    total_expenses: summary.totalExpenses ?? 0,
    net: summary.net ?? 0,
    tax_estimate: summary.taxEstimate ?? 0,
    true_retained: summary.trueRetained ?? 0,
    last_updated_at: new Date().toISOString()
  };
}

export async function exportMonthlySummary(summary) {
  const payload = buildMonthlySheetPayload(summary);
  return sendToGoogleSheets("monthly_summary", payload);
}