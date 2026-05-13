const MTD_READY_SHEET = "MTD_READY";
const MTD_READY_HEADERS = [
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
];

function handleMtdReady(payload) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(MTD_READY_SHEET);

  if (!sheet) {
    throw new Error("MTD_READY sheet was not found.");
  }

  const row = Array.isArray(payload.row) && payload.row.length >= MTD_READY_HEADERS.length
    ? payload.row.slice(0, MTD_READY_HEADERS.length)
    : [
        payload.period,
        payload.gross_income,
        payload.uber_service_fee,
        payload.taxes_fees,
        payload.net_uber_income,
        payload.mileage,
        payload.mileage_expense,
        payload.other_expenses,
        payload.total_expenses,
        payload.net_profit
      ];

  if (!row[0]) {
    throw new Error("MTD_READY export requires a period.");
  }

  sheet.getRange(2, 1, 1, MTD_READY_HEADERS.length).setValues([MTD_READY_HEADERS]);
  setMtdReadyColumnWidths_(sheet);

  const target = findMtdPeriodRow_(sheet, row[0]);
  sheet.getRange(target.row, 1, 1, MTD_READY_HEADERS.length).setValues([row]);

  return {
    ok: true,
    status: "success",
    message: `MTD_READY ${target.action} complete`,
    sheet: MTD_READY_SHEET,
    period: row[0],
    row: target.row
  };
}

function setMtdReadyColumnWidths_(sheet) {
  sheet.setColumnWidths(1, MTD_READY_HEADERS.length, 120);
}

function findMtdPeriodRow_(sheet, period) {
  const firstDataRow = 3;
  const lastRow = Math.max(sheet.getLastRow(), firstDataRow);
  const rowCount = lastRow - firstDataRow + 1;
  const periods = sheet.getRange(firstDataRow, 1, rowCount, 1).getValues();

  for (let index = 0; index < periods.length; index += 1) {
    const currentPeriod = periods[index][0];

    if (String(currentPeriod) === String(period)) {
      return {
        action: "update",
        row: firstDataRow + index
      };
    }

    if (!currentPeriod || String(currentPeriod).trim().startsWith("#")) {
      return {
        action: "append",
        row: firstDataRow + index
      };
    }
  }

  return {
    action: "append",
    row: lastRow + 1
  };
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const type = body.type;
    const payload = body.payload || {};

    if (type === "mtd_ready") {
      return jsonResponse_(handleMtdReady(payload));
    }

    throw new Error(`Unsupported export type: ${type}`);
  } catch (error) {
    return jsonResponse_({
      ok: false,
      status: "error",
      message: error.message
    });
  }
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
