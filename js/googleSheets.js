const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxYayh5arViBxDTYjLJd2m2MGnid-RDqgLP6M4cUbXM3vQ7DLGLwhE7li68X8ErE9Nfow/exec";
const SIMPLIFIED_CAR_MILE_RATE = 0.25;
const SIMPLIFIED_CAR_MILE_RATE_AFTER_THRESHOLD = 0.25;
const SIMPLIFIED_CAR_MILE_THRESHOLD = 0;

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

export function buildDaySheetPayload(day) {
  return {
    id: day.id ?? "",
    date: formatDateForSheet(day.date),
    end_time: day.end_time ?? "",
    shift_end_reason: day.shift_end_reason ?? "",
    trip_time: day.trip_time ?? 0,
    available_time: day.available_time ?? 0,
    lost_time: day.lost_time ?? 0,
    hours_worked: day.hours_worked ?? 0,
    gross: day.gross ?? 0,
    trips: day.trips ?? 0,
    business_miles: day.business_miles ?? 0,
    created_at: day.created_at ?? "",
    updated_at: day.updated_at ?? ""
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
    sessions_worked: summary.sessionsWorked ?? 0,
    days_worked: summary.daysWorked ?? 0,
    total_income: summary.totalIncome ?? 0,
    total_fuel: summary.totalFuel ?? 0,
    total_kwh: summary.totalKwh ?? 0,
    average_pence_per_kwh: summary.averagePencePerKwh ?? 0,
    home_charging_cost: summary.homeChargingCost ?? 0,
    public_charging_cost: summary.publicChargingCost ?? 0,
    supercharger_cost: summary.superchargerCost ?? 0,
    total_expenses: summary.totalExpenses ?? 0,
    total_tax: summary.totalTax ?? 0,
    total_insurance: summary.totalInsurance ?? 0,
    total_true_retained: summary.totalTrueRetained ?? 0,
    total_trips: summary.totalTrips ?? 0,
    total_miles: summary.totalMiles ?? 0,
    total_hours: summary.totalHours ?? 0,
    last_updated_at: new Date().toISOString()
  };
}

export function buildMtdSheetPayload(summary) {
  const uber = summary.uberStatement || {};
  const period = summary.month ?? "";
  const vehicleExpenseMethod = summary.vehicleExpenseMethod === "actual" ? "actual" : "mileage";
  const grossIncome = (uber.customerPayments ?? 0) + (uber.tips ?? 0);
  const fallbackGrossIncome = summary.totalIncome ?? 0;
  const income = grossIncome > 0 ? grossIncome : fallbackGrossIncome;
  const uberServiceFee = uber.serviceFee ?? 0;
  const taxesFees = uber.taxesThirdPartyFees ?? 0;
  const netUberIncome = income - uberServiceFee - taxesFees;
  const mileage = summary.totalMiles ?? 0;
  const mileageExpense = vehicleExpenseMethod === "mileage"
    ? summary.mileageExpense ?? mileage * SIMPLIFIED_CAR_MILE_RATE
    : 0;
  const actualVehicleCosts = (summary.totalFuel ?? 0) + (summary.totalInsurance ?? 0);
  const otherExpenses = vehicleExpenseMethod === "actual"
    ? (summary.totalExpenses ?? 0) + actualVehicleCosts
    : 0;
  const totalExpenses = mileageExpense + otherExpenses;
  const netProfit = netUberIncome - totalExpenses;

  return {
    sheet_name: "MTD_READY",
    columns: [
      "Period",
      "Gross Income",
      "Uber Service Fee",
      "Taxes & Fees",
      "Net Uber Income",
      "Mileage",
      "Mileage Expense",
      "Other Expenses",
      "Total Expenses",
      "Net Profit"
    ],
    row: [
      period,
      income,
      uberServiceFee,
      taxesFees,
      netUberIncome,
      mileage,
      mileageExpense,
      otherExpenses,
      totalExpenses,
      netProfit
    ],
    period,
    gross_income: income,
    uber_service_fee: uberServiceFee,
    taxes_fees: taxesFees,
    net_uber_income: netUberIncome,
    mileage,
    mileage_expense: mileageExpense,
    other_expenses: otherExpenses,
    total_expenses: totalExpenses,
    net_profit: netProfit,
    vehicle_expense_method: vehicleExpenseMethod,
    mileage_rate: SIMPLIFIED_CAR_MILE_RATE,
    mileage_rate_after_threshold: SIMPLIFIED_CAR_MILE_RATE_AFTER_THRESHOLD,
    mileage_threshold: SIMPLIFIED_CAR_MILE_THRESHOLD,
    tax_year_miles_before_month: summary.taxYearMilesBeforeMonth ?? 0,
    tax_year_miles_after_month: summary.taxYearMilesAfterMonth ?? 0,
    actual_vehicle_costs: actualVehicleCosts,
    app_logged_income: summary.totalIncome ?? 0,
    uber_customer_payments: uber.customerPayments ?? 0,
    uber_tips: uber.tips ?? 0,
    uber_taxes_third_party_fees: uber.taxesThirdPartyFees ?? 0,
    uber_service_fee: uber.serviceFee ?? 0,
    uber_earnings: uber.earnings ?? 0,
    uber_total_earnings: uber.totalEarnings ?? 0,
    uber_statement_count: uber.statementCount ?? 0,
    app_vs_uber_income_difference: (summary.totalIncome ?? 0) - (uber.totalEarnings ?? 0)
  };
}

export async function exportMonthlySummary(summary) {
  const payload = buildMonthlySheetPayload(summary);
  return sendToGoogleSheets("monthly_summary", payload);
}

export async function exportMtdSummary(summary) {
  const payload = buildMtdSheetPayload(summary);
  return sendToGoogleSheets("mtd_ready", payload);
}
