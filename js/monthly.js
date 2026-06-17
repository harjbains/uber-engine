import { supabaseClient } from "./supabase.js";
import { exportMonthlySummary, exportMtdSummary } from "./googleSheets.js?v=2.3.43";
import { showStatus } from "./status.js";
import { getChargingTotalsForRange, getRollingFuelPricePerLitre } from "./fuel.js";
import {
  SETTINGS_UPDATED_EVENT,
  getFallbackFuelPrice,
  getFuelType,
  formatClockHours,
  getMpg,
  getSettings,
  getTaxRate,
  getVehicleExpenseMethod
} from "./settings.js?v=2.3.43";

const ids = {
  picker: "month_picker",
  summary: "month_summary",
  exportBtn: "export-month",
  exportMtdBtn: "export-mtd",
  weekStart: "uber_statement_week_start",
  weekEnd: "uber_statement_week_end",
  customerPayments: "uber_customer_payments",
  tips: "uber_tips",
  taxesThirdPartyFees: "uber_taxes_third_party_fees",
  serviceFee: "uber_service_fee",
  earnings: "uber_earnings",
  totalEarnings: "uber_total_earnings",
  importText: "uber_statement_import_text",
  importImage: "uber_statement_import_image",
  importStatus: "uber_statement_import_status",
  parseImportBtn: "parse_uber_statement",
  readClipboardBtn: "read_uber_clipboard",
  saveUberWeeklyBtn: "save_uber_weekly",
  weeklyHistory: "uber_weekly_history"
};

const LITRES_PER_UK_GALLON = 4.546;
const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const UBER_WEEKLY_STORAGE_KEY = "uberEngineUberWeeklyStatements";
const SIMPLIFIED_CAR_MILE_RATE = 0.25;
const SIMPLIFIED_CAR_MILE_RATE_AFTER_THRESHOLD = 0.25;
const SIMPLIFIED_CAR_MILE_THRESHOLD = 0;

function el(id) {
  return document.getElementById(id);
}

function formatMoney(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function formatNumber(value, dp = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(dp);
}

function formatInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return String(Math.round(n));
}

function pct(value, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, (Number(value || 0) / total) * 100);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setImportStatus(message, type = "info") {
  const node = el(ids.importStatus);
  if (!node) return;

  node.textContent = message;
  node.className = `uber-import__status uber-import__status--${type}`;
}

function currentMonthValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function monthDateRange(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end };
}

function dateToIso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthNameToNumber(value) {
  const lookup = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12
  };

  return lookup[String(value || "").trim().toLowerCase()];
}

function selectedStatementYear(startMonth, endMonth) {
  const selected = el(ids.picker)?.value || currentMonthValue();
  const [selectedYear, selectedMonth] = selected.split("-").map(Number);
  if (Number.isFinite(selectedYear) && (selectedMonth === startMonth || selectedMonth === endMonth)) {
    return selectedYear;
  }

  return new Date().getFullYear();
}

function parseUberDateRangeLegacyUnused(text) {
  const match = String(text || "").match(
    /\b([A-Za-z]{3,9})\s+(\d{1,2})\s*[-–]\s*(?:([A-Za-z]{3,9})\s*)?(\d{1,2})\b/
  );
  if (!match) return null;

  const startMonth = monthNameToNumber(match[1]);
  const startDay = Number(match[2]);
  const endMonth = monthNameToNumber(match[3] || match[1]);
  const endDay = Number(match[4]);

  if (!startMonth || !endMonth || !Number.isFinite(startDay) || !Number.isFinite(endDay)) {
    return null;
  }

  const startYear = selectedStatementYear(startMonth, endMonth);
  const endYear = endMonth < startMonth ? startYear + 1 : startYear;

  return {
    weekStart: dateToIso(startYear, startMonth, startDay),
    weekEnd: dateToIso(endYear, endMonth, endDay)
  };
}

function normaliseImportTextLegacyUnused(text) {
  return String(text || "")
    .replaceAll("−", "-")
    .replaceAll("£", "GBP")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoneyAfterLabelLegacyUnused(text, labels) {
  const source = normaliseImportText(text);
  const lower = source.toLowerCase();

  for (const label of labels) {
    const index = lower.indexOf(label.toLowerCase());
    if (index < 0) continue;

    const slice = source.slice(index, index + 190);
    const match = slice.match(/[+-]?\s*(?:GBP)?\s*([0-9][0-9,]*\.\d{2})/i);
    if (!match) continue;

    const sign = /^\s*-/.test(match[0]) ? -1 : 1;
    const value = Number(match[1].replaceAll(",", ""));
    if (Number.isFinite(value)) return sign * value;
  }

  return null;
}

function setInputValue(id, value) {
  const node = el(id);
  if (!node || value === null || value === undefined || value === "") return false;

  node.value = typeof value === "number" ? Math.abs(value).toFixed(2) : value;
  return true;
}

function clearImportedStatementInputs() {
  [
    ids.weekStart,
    ids.weekEnd,
    ids.customerPayments,
    ids.taxesThirdPartyFees,
    ids.serviceFee,
    ids.earnings,
    ids.tips,
    ids.totalEarnings
  ].forEach((id) => {
    const node = el(id);
    if (node) node.value = "";
  });
}

function normaliseImportText(text) {
  return String(text || "")
    .replace(/[–—−]/g, "-")
    .replaceAll("£", "GBP")
    .replaceAll("Â£", "GBP")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseImportLine(text) {
  return String(text || "")
    .replace(/[–—−]/g, "-")
    .replaceAll("£", "GBP")
    .replaceAll("Â£", "GBP")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseLabel(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function importLines(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(normaliseImportLine)
    .filter(Boolean);
}

const UBER_BREAKDOWN_LABELS = [
  "Customer payments",
  "Government taxes and third-party fees",
  "Government taxes and third party fees",
  "Amount Uber kept",
  "Uber kept",
  "Earnings from fares",
  "Tips",
  "Your total earnings",
  "Total earnings"
];

function hasAnyUberLabel(line) {
  const value = normaliseLabel(line);
  return UBER_BREAKDOWN_LABELS.some((label) => value.includes(normaliseLabel(label)));
}

function parseMoneyFromFragment(fragment) {
  const match = normaliseImportLine(fragment).match(/[+-]?\s*(?:GBP)?\s*([0-9][0-9,]*\.\d{2})/i);
  if (!match) return null;

  const sign = /^\s*-/.test(match[0]) ? -1 : 1;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(value) ? sign * value : null;
}

function parseOcrDayToken(value) {
  const cleaned = String(value || "")
    .replace(/[il|]/gi, "1")
    .replace(/o/gi, "0")
    .replace(/s/gi, "5")
    .replace(/[^0-9]/g, "");
  const day = Number(cleaned);
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : NaN;
}

function buildUberDateRange(startMonthText, startDayText, endMonthText, endDayText) {
  const startMonth = monthNameToNumber(startMonthText);
  const startDay = parseOcrDayToken(startDayText);
  const endMonth = monthNameToNumber(endMonthText || startMonthText);
  const endDay = parseOcrDayToken(endDayText);

  if (!startMonth || !endMonth || !Number.isFinite(startDay) || !Number.isFinite(endDay)) {
    return null;
  }

  const startYear = selectedStatementYear(startMonth, endMonth);
  const endYear = endMonth < startMonth ? startYear + 1 : startYear;

  return {
    weekStart: dateToIso(startYear, startMonth, startDay),
    weekEnd: dateToIso(endYear, endMonth, endDay)
  };
}

function parseUberDateRange(text) {
  const source = String(text || "")
    .replace(/[–—−]/g, "-")
    .replace(/\b(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)([0-9il|os])/gi, "$1 $2")
    .replace(/\s+/g, " ");
  const match = source.match(
    /\b([A-Za-z]{3,9})\.?\s*([0-9A-Za-z|]{1,4})\s*(?:-|to)\s*(?:([A-Za-z]{3,9})\.?\s*)?([0-9A-Za-z|]{1,4})\b/i
  );
  if (!match) return null;

  const startMonth = monthNameToNumber(match[1]);
  const startDay = parseOcrDayToken(match[2]);
  const endMonth = monthNameToNumber(match[3] || match[1]);
  const endDay = parseOcrDayToken(match[4]);

  if (!startMonth || !endMonth || !Number.isFinite(startDay) || !Number.isFinite(endDay)) {
    return null;
  }

  const startYear = selectedStatementYear(startMonth, endMonth);
  const endYear = endMonth < startMonth ? startYear + 1 : startYear;

  return {
    weekStart: dateToIso(startYear, startMonth, startDay),
    weekEnd: dateToIso(endYear, endMonth, endDay)
  };
}

function parseUberDateRangeFromOcrText(text) {
  const monthNames = "Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December";
  const source = String(text || "")
    .replace(/[–—−]/g, "-")
    .replace(new RegExp(`\\b(${monthNames})([0-9il|os])`, "gi"), "$1 $2")
    .replace(/\s+/g, " ");

  const monthFirst = source.match(
    new RegExp(`\\b(${monthNames})\\.?\\s*([0-9A-Za-z|]{1,4})\\s*(?:-|to)?\\s*(?:(${monthNames})\\.?\\s*)?([0-9A-Za-z|]{1,4})\\b`, "i")
  );
  if (monthFirst) {
    const range = buildUberDateRange(monthFirst[1], monthFirst[2], monthFirst[3], monthFirst[4]);
    if (range) return range;
  }

  const dayFirst = source.match(
    new RegExp(`\\b([0-9A-Za-z|]{1,4})\\s*(${monthNames})\\.?\\s*(?:-|to)?\\s*([0-9A-Za-z|]{1,4})\\s*(?:(${monthNames})\\.?)?\\b`, "i")
  );
  if (dayFirst) {
    return buildUberDateRange(dayFirst[2], dayFirst[1], dayFirst[4] || dayFirst[2], dayFirst[3]);
  }

  return null;
}

function parseMoneyAfterLabel(text, labels) {
  const lines = importLines(text);
  const wantedLabels = labels.map(normaliseLabel);
  const allLabels = UBER_BREAKDOWN_LABELS.map(normaliseLabel);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const normalisedLine = normaliseLabel(line);
    const matchedLabel = wantedLabels.find((label) => normalisedLine.includes(label));
    if (!matchedLabel) continue;

    const labelsOnLine = allLabels.filter((label) => normalisedLine.includes(label)).length;
    if (labelsOnLine <= 1) {
      const sameLineValue = parseMoneyFromFragment(line);
      if (sameLineValue !== null) return sameLineValue;
    }

    for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
      if (hasAnyUberLabel(lines[j])) break;

      const nextLineValue = parseMoneyFromFragment(lines[j]);
      if (nextLineValue !== null) return nextLineValue;
    }
  }

  const source = normaliseImportText(text);
  const lower = source.toLowerCase();

  for (const label of labels) {
    const index = lower.indexOf(label.toLowerCase());
    if (index < 0) continue;

    const nextLabelIndex = UBER_BREAKDOWN_LABELS
      .map((nextLabel) => lower.indexOf(nextLabel.toLowerCase(), index + label.length))
      .filter((nextIndex) => nextIndex > index)
      .sort((a, b) => a - b)[0];
    const slice = source.slice(index, nextLabelIndex || index + 90);
    const match = slice.match(/[+-]?\s*(?:GBP)?\s*([0-9][0-9,]*\.\d{2})/i);
    if (!match) continue;

    const sign = /^\s*-/.test(match[0]) ? -1 : 1;
    const value = Number(match[1].replaceAll(",", ""));
    if (Number.isFinite(value)) return sign * value;
  }

  return null;
}

function parseUberBreakdownText(text) {
  const customerPayments = parseMoneyAfterLabel(text, ["Customer payments"]);
  const taxesThirdPartyFees = parseMoneyAfterLabel(text, [
    "Government taxes and third-party fees",
    "Government taxes and third party fees"
  ]);
  const rawServiceFee = parseMoneyAfterLabel(text, ["Amount Uber kept", "Uber kept"]);
  const earnings = parseMoneyAfterLabel(text, ["Earnings from fares"]);
  const tips = parseMoneyAfterLabel(text, ["Tips"]);
  const totalEarnings = parseMoneyAfterLabel(text, ["Your total earnings", "Total earnings"]);
  const range = parseUberDateRangeFromOcrText(text) || parseUberDateRange(text);
  const serviceFeeLooksLikeEarnings = rawServiceFee !== null
    && earnings !== null
    && Math.abs(Math.abs(rawServiceFee) - earnings) < 0.01;
  const serviceFeeExceedsGross = rawServiceFee !== null
    && customerPayments !== null
    && Math.abs(rawServiceFee) > Math.abs(customerPayments);
  const serviceFee = serviceFeeLooksLikeEarnings || serviceFeeExceedsGross ? null : rawServiceFee;

  const derivedTaxes = taxesThirdPartyFees ?? (
    customerPayments !== null && earnings !== null && serviceFee !== null
      ? Math.max(0, customerPayments - Math.abs(serviceFee) - earnings)
      : null
  );
  const derivedServiceFee = serviceFee ?? (
    customerPayments !== null && earnings !== null
      ? Math.max(0, customerPayments - Math.abs(derivedTaxes || 0) - earnings)
      : null
  );
  const derivedEarnings = earnings ?? (
    customerPayments !== null
      ? customerPayments - Math.abs(derivedTaxes || 0) - Math.abs(derivedServiceFee || 0)
      : null
  );
  const derivedTotal = totalEarnings ?? (
    derivedEarnings !== null ? derivedEarnings + Math.abs(tips || 0) : null
  );

  return {
    weekStart: range?.weekStart || "",
    weekEnd: range?.weekEnd || "",
    customerPayments,
    taxesThirdPartyFees: derivedTaxes,
    serviceFee: derivedServiceFee,
    earnings: derivedEarnings,
    tips,
    totalEarnings: derivedTotal
  };
}

function importCompleteness(parsed) {
  return [
    parsed.weekStart,
    parsed.weekEnd,
    parsed.customerPayments,
    parsed.taxesThirdPartyFees,
    parsed.serviceFee,
    parsed.earnings,
    parsed.tips,
    parsed.totalEarnings
  ].filter((value) => value !== null && value !== undefined && value !== "").length;
}

function applyUberBreakdownImport(parsed) {
  let applied = 0;
  clearImportedStatementInputs();

  if (setInputValue(ids.weekStart, parsed.weekStart)) applied += 1;
  if (setInputValue(ids.weekEnd, parsed.weekEnd)) applied += 1;
  if (setInputValue(ids.customerPayments, parsed.customerPayments)) applied += 1;
  if (setInputValue(ids.taxesThirdPartyFees, parsed.taxesThirdPartyFees)) applied += 1;
  if (setInputValue(ids.serviceFee, parsed.serviceFee)) applied += 1;
  if (setInputValue(ids.earnings, parsed.earnings)) applied += 1;
  if (setInputValue(ids.tips, parsed.tips)) applied += 1;
  if (setInputValue(ids.totalEarnings, parsed.totalEarnings)) applied += 1;

  return applied;
}

function parseUberImportText(text) {
  const parsed = parseUberBreakdownText(text);
  const applied = applyUberBreakdownImport(parsed);

  if (applied === 0) {
    setImportStatus("No Uber breakdown values found.", "error");
    return;
  }

  const isPartial = applied < 7;
  setImportStatus(
    isPartial
      ? `Imported ${applied} fields. OCR missed some values.`
      : `Imported ${applied} fields. Review then save.`,
    isPartial ? "error" : "success"
  );
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_CDN;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load OCR."));
    document.head.appendChild(script);
  });

  return window.Tesseract;
}

async function imageFileToBitmap(file) {
  if (window.createImageBitmap) {
    return window.createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

async function cropScreenshotForOcr(file, region) {
  const image = await imageFileToBitmap(file);
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const sx = Math.max(0, Math.round(sourceWidth * region.x));
  const sy = Math.max(0, Math.round(sourceHeight * region.y));
  const sw = Math.min(sourceWidth - sx, Math.round(sourceWidth * region.width));
  const sh = Math.min(sourceHeight - sy, Math.round(sourceHeight * region.height));
  const scale = region.scale || 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sw * scale);
  canvas.height = Math.max(1, sh * scale);

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  if ("filter" in ctx) ctx.filter = "grayscale(1) contrast(1.35)";
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  return canvasToBlob(canvas);
}

async function recogniseImage(tesseract, imageLike) {
  const result = await tesseract.recognize(imageLike, "eng");
  return result?.data?.text || "";
}

async function readImageWithOcr(file) {
  setImportStatus("Reading screenshot centre...", "info");
  const tesseract = await loadTesseract();
  const regions = [
    { x: 0.00, y: 0.00, width: 1.00, height: 0.24, scale: 3.0 },
    { x: 0.18, y: 0.04, width: 0.64, height: 0.22, scale: 3.0 },
    { x: 0.31, y: 0.10, width: 0.38, height: 0.72, scale: 2.4 },
    { x: 0.37, y: 0.15, width: 0.28, height: 0.62, scale: 2.6 }
  ];
  const texts = [];

  for (let index = 0; index < regions.length; index += 1) {
    try {
      const crop = await cropScreenshotForOcr(file, regions[index]);
      const text = await recogniseImage(tesseract, crop || file);
      if (text.trim()) texts.push(text);
    } catch (error) {
      console.warn("Uber statement OCR crop failed:", error);
    }

    const parsed = parseUberBreakdownText(texts.join("\n"));
    if (importCompleteness(parsed) >= 7) return texts.join("\n");
    setImportStatus("Reading another screenshot area...", "info");
  }

  setImportStatus("Reading full screenshot...", "info");
  const fullText = await recogniseImage(tesseract, file);
  return [...texts, fullText].join("\n");
}

async function importUberStatementImage(file) {
  if (!file) return;

  try {
    const importedText = await readImageWithOcr(file);
    const textNode = el(ids.importText);
    if (textNode) textNode.value = importedText;
    parseUberImportText(importedText);
  } catch (error) {
    console.error("Uber statement OCR failed:", error);
    setImportStatus("Screenshot OCR failed. Paste copied text instead.", "error");
  }
}

async function handleUberImportPaste(event) {
  const text = event.clipboardData?.getData("text/plain");
  if (text?.trim()) {
    window.setTimeout(() => parseUberImportText(text), 0);
    return;
  }

  const imageItem = Array.from(event.clipboardData?.items || [])
    .find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;

  event.preventDefault();
  const file = imageItem.getAsFile();
  await importUberStatementImage(file);
}

async function handleUberImportFile(event) {
  const file = event.target.files?.[0];
  await importUberStatementImage(file);
  event.target.value = "";
}

async function handleUberClipboardImport() {
  if (!navigator.clipboard?.readText) {
    setImportStatus("Clipboard access is not available here. Paste text into the box.", "error");
    return;
  }

  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      setImportStatus("Clipboard is empty. Copy the Uber breakdown text first.", "error");
      return;
    }

    const textNode = el(ids.importText);
    if (textNode) textNode.value = text;
    parseUberImportText(text);
  } catch (error) {
    console.error("Unable to read Uber statement clipboard:", error);
    setImportStatus("Clipboard read failed. Paste copied text into the box.", "error");
  }
}

function taxYearStartForDate(dateIso) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const taxYearStartYear = month > 4 || (month === 4 && day >= 6)
    ? year
    : year - 1;

  return `${taxYearStartYear}-04-06`;
}

function taxYearKeyForDate(dateIso) {
  return taxYearStartForDate(dateIso).slice(0, 4);
}

function calculateMileageClaimForMonth(days, monthStart, monthEnd) {
  const milesByTaxYear = new Map();
  const milesBeforeMonthByTaxYear = new Map();
  let mileageExpense = 0;
  let monthMiles = 0;

  const sortedDays = [...days]
    .filter((day) => day.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  sortedDays.forEach((day) => {
    const date = String(day.date);
    const miles = Number(day.business_miles || 0);
    const taxYearKey = taxYearKeyForDate(date);
    const milesBefore = milesByTaxYear.get(taxYearKey) || 0;
    const isInSelectedMonth = date >= monthStart && date <= monthEnd;

    if (date < monthStart) {
      milesBeforeMonthByTaxYear.set(taxYearKey, milesBefore + miles);
    }

    if (isInSelectedMonth) {
      const highRateMiles = Math.max(
        0,
        Math.min(miles, SIMPLIFIED_CAR_MILE_THRESHOLD - milesBefore)
      );
      const lowRateMiles = Math.max(0, miles - highRateMiles);

      mileageExpense +=
        highRateMiles * SIMPLIFIED_CAR_MILE_RATE +
        lowRateMiles * SIMPLIFIED_CAR_MILE_RATE_AFTER_THRESHOLD;
      monthMiles += miles;
    }

    milesByTaxYear.set(taxYearKey, milesBefore + miles);
  });

  const selectedTaxYearKey = taxYearKeyForDate(monthEnd);
  const taxYearMilesBeforeMonth = milesBeforeMonthByTaxYear.get(selectedTaxYearKey) || 0;
  const taxYearMilesAfterMonth = milesByTaxYear.get(selectedTaxYearKey) || 0;

  return {
    mileageExpense,
    monthMiles,
    taxYearMilesBeforeMonth,
    taxYearMilesAfterMonth,
    mileageRate: SIMPLIFIED_CAR_MILE_RATE,
    milesUntilLowerRate: Math.max(0, SIMPLIFIED_CAR_MILE_THRESHOLD - taxYearMilesAfterMonth)
  };
}

function getLitresPerMile(mpg) {
  return LITRES_PER_UK_GALLON / mpg;
}

function normaliseUberWeeklyStatement(statement = {}) {
  const customerPayments = toNumber(statement.customerPayments);
  const tips = toNumber(statement.tips);
  const taxesThirdPartyFees = toNumber(statement.taxesThirdPartyFees);
  const serviceFee = toNumber(statement.serviceFee);
  const earnings = toNumber(statement.earnings);
  const totalEarnings = toNumber(statement.totalEarnings);
  const id = statement.id || `${statement.weekEnd || "week"}:${Date.now()}`;

  return {
    id,
    weekStart: statement.weekStart || "",
    weekEnd: statement.weekEnd || "",
    customerPayments,
    tips,
    taxesThirdPartyFees,
    serviceFee,
    earnings,
    totalEarnings,
    createdAt: statement.createdAt || new Date().toISOString(),
    updatedAt: statement.updatedAt || new Date().toISOString()
  };
}

function readUberWeeklyStatements() {
  try {
    const raw = localStorage.getItem(UBER_WEEKLY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(normaliseUberWeeklyStatement)
      : [];
  } catch (error) {
    console.warn("Unable to read Uber weekly statements:", error);
    return [];
  }
}

function writeUberWeeklyStatements(statements) {
  localStorage.setItem(
    UBER_WEEKLY_STORAGE_KEY,
    JSON.stringify(statements.map(normaliseUberWeeklyStatement))
  );
}

function getUberWeeklyStatementsForMonth(monthValue) {
  const { start, end } = monthDateRange(monthValue);

  return readUberWeeklyStatements()
    .filter((statement) => statement.weekEnd >= start && statement.weekEnd <= end)
    .sort((a, b) => b.weekEnd.localeCompare(a.weekEnd));
}

function buildUberStatementTotals(statements) {
  const totals = statements.reduce(
    (acc, statement) => {
      acc.customerPayments += statement.customerPayments;
      acc.tips += statement.tips;
      acc.taxesThirdPartyFees += statement.taxesThirdPartyFees;
      acc.serviceFee += statement.serviceFee;
      acc.earnings += statement.earnings;
      acc.totalEarnings += statement.totalEarnings;
      return acc;
    },
    {
      customerPayments: 0,
      tips: 0,
      taxesThirdPartyFees: 0,
      serviceFee: 0,
      earnings: 0,
      totalEarnings: 0
    }
  );

  totals.statementCount = statements.length;
  return totals;
}

function clearUberWeeklyForm() {
  [
    ids.weekStart,
    ids.weekEnd,
    ids.customerPayments,
    ids.tips,
    ids.taxesThirdPartyFees,
    ids.serviceFee,
    ids.earnings,
    ids.totalEarnings
  ].forEach((id) => {
    const node = el(id);
    if (node) node.value = "";
  });

  const importText = el(ids.importText);
  if (importText) importText.value = "";
  const importImage = el(ids.importImage);
  if (importImage) importImage.value = "";
  setImportStatus("");
}

function readUberWeeklyForm() {
  return normaliseUberWeeklyStatement({
    id: el(ids.weekEnd)?.value || undefined,
    weekStart: el(ids.weekStart)?.value || "",
    weekEnd: el(ids.weekEnd)?.value || "",
    customerPayments: el(ids.customerPayments)?.value,
    tips: el(ids.tips)?.value,
    taxesThirdPartyFees: el(ids.taxesThirdPartyFees)?.value,
    serviceFee: el(ids.serviceFee)?.value,
    earnings: el(ids.earnings)?.value,
    totalEarnings: el(ids.totalEarnings)?.value
  });
}

function validateUberWeeklyStatement(statement) {
  if (!statement.weekStart) return "Please enter the statement week start.";
  if (!statement.weekEnd) return "Please enter the statement week end.";
  if (statement.weekEnd < statement.weekStart) return "Week end must be after week start.";
  if (statement.totalEarnings <= 0) return "Please enter total earnings from the Uber statement.";
  return null;
}

function findDuplicateUberStatementIndex(statements, statement) {
  return statements.findIndex((item) =>
    item.weekStart === statement.weekStart &&
    item.weekEnd === statement.weekEnd &&
    item.id !== statement.id
  );
}

function renderUberWeeklyHistory(statements) {
  const container = el(ids.weeklyHistory);
  if (!container) return;

  if (!statements.length) {
    container.innerHTML = `<div class="history-empty">No Uber weekly statements saved for this month.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="history-grid">
      ${statements.map((statement) => `
        <div class="history-card">
          <div class="history-card__header">
            <div>
              <div class="history-card__title">
                ${escapeHtml(statement.weekStart)} - ${escapeHtml(statement.weekEnd)}
              </div>
            </div>
            <div class="history-card__actions">
              <div class="history-card__pill">Uber</div>
              <button
                type="button"
                class="history-card__delete"
                data-delete-uber-week="${escapeHtml(statement.id)}"
                aria-label="Delete Uber statement ending ${escapeHtml(statement.weekEnd)}"
              >
                Delete
              </button>
            </div>
          </div>

          <div class="history-card__grid history-card__grid--3x2">
            <div class="history-item">
              <span class="history-item__label">Customer</span>
              <span class="history-item__value">${formatMoney(statement.customerPayments)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">Fees</span>
              <span class="history-item__value">${formatMoney(statement.serviceFee)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">3rd Party</span>
              <span class="history-item__value">${formatMoney(statement.taxesThirdPartyFees)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">Earnings</span>
              <span class="history-item__value">${formatMoney(statement.earnings)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">Tips</span>
              <span class="history-item__value">${formatMoney(statement.tips)}</span>
            </div>
            <div class="history-item">
              <span class="history-item__label">Total</span>
              <span class="history-item__value history-item__value--strong">${formatMoney(statement.totalEarnings)}</span>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function calculateFuelCost(miles, pricePerLitre, mpg) {
  const litresPerMile = getLitresPerMile(mpg);
  return miles * litresPerMile * pricePerLitre;
}

function calculateVehicleEnergyCost(miles, pricePerLitre, settings = getSettings()) {
  const safeMiles = Number(miles || 0);

  if (getFuelType(settings) === "ev") {
    return 0;
  }

  return calculateFuelCost(safeMiles, pricePerLitre, getMpg(settings));
}

function getVehicleEnergyLabels(settings = getSettings(), fuelPrice = null) {
  if (getFuelType(settings) === "ev") {
    return {
      estimate: "Charging",
      rate: "Avg p/kWh",
      rateValue: "-",
      perMile: "Charge / Mile"
    };
  }

  const safeFuelPrice = Number.isFinite(Number(fuelPrice)) && Number(fuelPrice) > 0
    ? Number(fuelPrice)
    : getFallbackFuelPrice(settings);

  return {
    estimate: "Fuel Est.",
    rate: "Fuel Price",
    rateValue: `${formatMoney(safeFuelPrice)}/L`,
    perMile: "Fuel / Mile"
  };
}

function moneyFlowSegment(label, value, className) {
  const amount = Math.max(0, Number(value || 0));
  return { label, value: amount, className };
}

function renderStackedBar(segments, total) {
  const safeTotal = Math.max(0, Number(total || 0));
  const visibleSegments = segments.filter((segment) => segment.value > 0);

  if (!safeTotal || !visibleSegments.length) {
    return `<div class="visual-bar visual-bar--empty"></div>`;
  }

  return `
    <div class="visual-bar" aria-hidden="true">
      ${visibleSegments.map((segment) => {
        const width = Math.max(2, Math.min(100, pct(segment.value, safeTotal)));
        return `<span class="${segment.className}" style="width: ${width}%"></span>`;
      }).join("")}
    </div>
  `;
}

function renderVisualLegend(segments, total) {
  const safeTotal = Math.max(0, Number(total || 0));
  return `
    <div class="visual-legend">
      ${segments.map((segment) => `
        <div class="visual-legend__item">
          <span class="visual-legend__dot ${segment.className}"></span>
          <span>${escapeHtml(segment.label)}</span>
          <strong>${formatMoney(segment.value)}</strong>
          <em>${formatNumber(pct(segment.value, safeTotal), 0)}%</em>
        </div>
      `).join("")}
    </div>
  `;
}

function renderProgressRow(label, value, total, meta = "") {
  const percent = Math.max(0, Math.min(100, pct(value, total)));
  return `
    <div class="visual-progress-row">
      <div class="visual-progress-row__meta">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(meta)}</strong>
      </div>
      <div class="visual-progress-track">
        <span style="width: ${percent}%"></span>
      </div>
    </div>
  `;
}

export async function loadMonthSummary() {
  const monthValue = el(ids.picker)?.value || currentMonthValue();
  const container = el(ids.summary);
  if (!container) return null;

  const uberWeeklyStatements = getUberWeeklyStatementsForMonth(monthValue);
  const uberStatement = buildUberStatementTotals(uberWeeklyStatements);
  renderUberWeeklyHistory(uberWeeklyStatements);

  const { start, end } = monthDateRange(monthValue);
  const settings = getSettings();
  const mileageClaimStart = taxYearStartForDate(start);
  const fuelPricePromise = getFuelType(settings) === "ev"
    ? Promise.resolve(getFallbackFuelPrice(settings))
    : getRollingFuelPricePerLitre(3, getFallbackFuelPrice(settings));
  const chargingTotalsPromise = getFuelType(settings) === "ev"
    ? getChargingTotalsForRange(start, end)
    : Promise.resolve(null);

  const [daysRes, mileageDaysRes, expenseRes, fuelPrice, chargingTotals] = await Promise.all([
    supabaseClient
      .from("days")
      .select("*")
      .gte("date", start)
      .lte("date", end),

    supabaseClient
      .from("days")
      .select("date,business_miles")
      .gte("date", mileageClaimStart)
      .lte("date", end),

    supabaseClient
      .from("expenses")
      .select("date,amount")
      .gte("date", start)
      .lte("date", end),

    fuelPricePromise,
    chargingTotalsPromise
  ]);

  if (daysRes.error || mileageDaysRes.error || expenseRes.error) {
    console.error("Month summary load error:", daysRes.error || mileageDaysRes.error || expenseRes.error);
    container.innerHTML = `<div class="error-state">Unable to load month summary.</div>`;
    showStatus("Unable to load month summary.", "error", false);
    return null;
  }

  const days = daysRes.data || [];
  const mileageDays = mileageDaysRes.data || [];
  const expenses = expenseRes.data || [];

  const totalIncome = days.reduce((sum, d) => sum + Number(d.gross || 0), 0);
  const totalTrips = days.reduce((sum, d) => sum + Number(d.trips || 0), 0);
  const totalMiles = days.reduce((sum, d) => sum + Number(d.business_miles || 0), 0);
  const totalHours = days.reduce((sum, d) => sum + Number(d.hours_worked || 0), 0);

  const sessionsWorked = days.length;
  const distinctDatesWorked = new Set(days.map(d => d.date)).size;

  const totalFuel = getFuelType(settings) === "ev"
    ? Number(chargingTotals?.cost || 0)
    : calculateVehicleEnergyCost(totalMiles, fuelPrice, settings);
  const vehicleEnergyLabels = getVehicleEnergyLabels(settings, fuelPrice);
  if (getFuelType(settings) === "ev") {
    vehicleEnergyLabels.rateValue = `${formatNumber(chargingTotals?.averagePencePerKwh || 0, 1)}p`;
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalTax = totalIncome * getTaxRate(settings);
  const totalInsurance = Number(settings.insuranceMonthly || 0);
  const uberTotalEarnings = uberStatement.totalEarnings;
  const incomeBase = uberTotalEarnings > 0 ? uberTotalEarnings : totalIncome;
  const totalCosts = totalExpenses + totalInsurance;
  const vehicleExpenseMethod = getVehicleExpenseMethod(settings);
  const mileageClaim = calculateMileageClaimForMonth(mileageDays, start, end);

  const totalTrueRetained =
    incomeBase -
    totalFuel -
    totalExpenses -
    totalTax -
    totalInsurance;

  const summary = {
    month: monthValue,
    sessionsWorked,
    daysWorked: distinctDatesWorked,
    totalIncome,
    totalTrips,
    totalMiles,
    totalHours,
    totalFuel,
    totalKwh: chargingTotals?.kwh || 0,
    averagePencePerKwh: chargingTotals?.averagePencePerKwh || 0,
    homeChargingCost: chargingTotals?.homeCost || 0,
    publicChargingCost: chargingTotals?.publicCost || 0,
    superchargerCost: chargingTotals?.superchargerCost || 0,
    homeChargingPercent: chargingTotals?.homePercent || 0,
    publicChargingPercent: chargingTotals?.publicPercent || 0,
    superchargerPercent: chargingTotals?.superchargerPercent || 0,
    totalExpenses,
    totalCosts,
    totalTax,
    totalInsurance,
    mileageExpense: mileageClaim.mileageExpense,
    mileageRate: mileageClaim.mileageRate,
    taxYearMilesBeforeMonth: mileageClaim.taxYearMilesBeforeMonth,
    taxYearMilesAfterMonth: mileageClaim.taxYearMilesAfterMonth,
    milesUntilLowerRate: mileageClaim.milesUntilLowerRate,
    totalTrueRetained,
    incomeBase,
    vehicleExpenseMethod,
    uberStatement,
    uberWeeklyStatements,
    avgPerTrip: totalTrips > 0 ? totalIncome / totalTrips : 0,
    avgPerMile: totalMiles > 0 ? totalIncome / totalMiles : 0,
    avgPerWorkedDay: distinctDatesWorked > 0 ? totalIncome / distinctDatesWorked : 0,
    avgPerHour: totalHours > 0 ? totalIncome / totalHours : 0
  };

  const retainedPercent = pct(summary.totalTrueRetained, summary.incomeBase);
  const moneyFlowSegments = [
    moneyFlowSegment(vehicleEnergyLabels.estimate, summary.totalFuel, "visual-segment--fuel"),
    moneyFlowSegment("Costs", summary.totalCosts, "visual-segment--costs"),
    moneyFlowSegment("Tax", summary.totalTax, "visual-segment--tax"),
    moneyFlowSegment("Net", summary.totalTrueRetained, "visual-segment--net")
  ];
  const fareSplitSegments = [
    moneyFlowSegment("Earnings", summary.uberStatement.earnings, "visual-segment--net"),
    moneyFlowSegment("Tips", summary.uberStatement.tips, "visual-segment--tips"),
    moneyFlowSegment("Uber Fee", summary.uberStatement.serviceFee, "visual-segment--costs"),
    moneyFlowSegment("3rd Party", summary.uberStatement.taxesThirdPartyFees, "visual-segment--tax")
  ];
  const fareSplitTotal = fareSplitSegments.reduce((sum, segment) => sum + segment.value, 0);
  const averageMilesPerSession = summary.sessionsWorked > 0 ? summary.totalMiles / summary.sessionsWorked : 0;
  const averageHoursPerSession = summary.sessionsWorked > 0 ? summary.totalHours / summary.sessionsWorked : 0;
  const mileageClaimPercent = pct(summary.mileageExpense, summary.totalFuel + summary.mileageExpense);

  container.innerHTML = `
    <div class="month-dashboard">
      <section class="month-section month-section--net">
        <div class="month-section__header">
          <h4>Money Flow</h4>
          <span>${formatNumber(retainedPercent, 0)}% retained</span>
        </div>

        <div class="visual-panel visual-panel--money">
          <div class="visual-panel__headline">
            <div>
              <span>Gross</span>
              <strong>${formatMoney(summary.incomeBase)}</strong>
            </div>
            <div>
              <span>Net Retained</span>
              <strong>${formatMoney(summary.totalTrueRetained)}</strong>
            </div>
          </div>
          ${renderStackedBar(moneyFlowSegments, summary.incomeBase)}
          ${renderVisualLegend(moneyFlowSegments, summary.incomeBase)}
        </div>
      </section>

      <section class="month-section">
        <div class="month-section__header">
          <h4>Uber Split</h4>
          <span>${formatInt(summary.uberStatement.statementCount)} statements</span>
        </div>

        <div class="visual-panel">
          <div class="visual-panel__headline visual-panel__headline--compact">
            <div>
              <span>Customer Paid</span>
              <strong>${formatMoney(summary.uberStatement.customerPayments)}</strong>
            </div>
            <div>
              <span>You Received</span>
              <strong>${formatMoney(summary.uberStatement.totalEarnings)}</strong>
            </div>
          </div>
          ${renderStackedBar(fareSplitSegments, fareSplitTotal)}
          ${renderVisualLegend(fareSplitSegments, fareSplitTotal)}
        </div>
      </section>

      <section class="month-section">
        <div class="month-section__header">
          <h4>Work Efficiency</h4>
          <span>${formatMoney(summary.totalIncome - summary.uberStatement.totalEarnings)} log diff</span>
        </div>

        <div class="visual-panel">
          <div class="efficiency-grid">
            <div class="efficiency-score">
              <span>Hourly Rate</span>
              <strong>${formatMoney(summary.avgPerHour)}</strong>
              <em>${formatClockHours(summary.totalHours)} over ${formatInt(summary.sessionsWorked)} sessions</em>
            </div>
            <div class="efficiency-score">
              <span>Miles</span>
              <strong>${formatNumber(summary.totalMiles, 0)}</strong>
              <em>${formatNumber(averageMilesPerSession, 0)} mi/session</em>
            </div>
          </div>
          ${renderProgressRow("Avg session length", averageHoursPerSession, 8, formatClockHours(averageHoursPerSession))}
          ${renderProgressRow(vehicleEnergyLabels.perMile, summary.totalMiles > 0 ? summary.totalFuel / summary.totalMiles : 0, 0.5, formatMoney(summary.totalMiles > 0 ? summary.totalFuel / summary.totalMiles : 0))}
          ${renderProgressRow("Mileage claim cover", summary.mileageExpense, summary.totalFuel + summary.mileageExpense, `${formatNumber(mileageClaimPercent, 0)}%`)}
          <div class="visual-footnote">
            ${escapeHtml(vehicleEnergyLabels.rate)} ${escapeHtml(vehicleEnergyLabels.rateValue)} · ${summary.vehicleExpenseMethod === "actual" ? "Actual vehicle costs" : "Mileage claim method"}
          </div>
        </div>
      </section>
      ${getFuelType(settings) === "ev" ? `
        <section class="month-section">
          <div class="month-section__header">
            <h4>Charging Sources</h4>
            <span>${formatNumber(summary.totalKwh, 1)} kWh</span>
          </div>

          <div class="month-section-grid">
            <div class="summary-card summary-card--primary">
              <div class="summary-label">Total kWh</div>
              <div class="summary-value">${formatNumber(summary.totalKwh, 1)}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Home</div>
              <div class="summary-value">${formatMoney(summary.homeChargingCost)}</div>
              <div class="summary-sub">${formatNumber(summary.homeChargingPercent, 0)}%</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Public</div>
              <div class="summary-value">${formatMoney(summary.publicChargingCost)}</div>
              <div class="summary-sub">${formatNumber(summary.publicChargingPercent, 0)}%</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Supercharger</div>
              <div class="summary-value">${formatMoney(summary.superchargerCost)}</div>
              <div class="summary-sub">${formatNumber(summary.superchargerPercent, 0)}%</div>
            </div>
          </div>
        </section>
      ` : ""}
    </div>
  `;

  return summary;
}

async function handleSaveUberWeekly() {
  const statement = readUberWeeklyForm();
  const validationError = validateUberWeeklyStatement(statement);

  if (validationError) {
    showStatus(validationError, "error");
    return;
  }

  const statements = readUberWeeklyStatements();
  const duplicateIndex = findDuplicateUberStatementIndex(statements, statement);
  const existingIndex = duplicateIndex >= 0
    ? duplicateIndex
    : statements.findIndex((item) => item.id === statement.id);

  if (existingIndex >= 0) {
    const existing = statements[existingIndex];
    const isSameDateRange = existing.weekStart === statement.weekStart && existing.weekEnd === statement.weekEnd;
    const label = `${statement.weekStart} - ${statement.weekEnd}`;
    const message = isSameDateRange
      ? `An Uber statement for ${label} is already saved. Replace it with this one?`
      : `An Uber statement ending ${statement.weekEnd} is already saved. Replace it with this one?`;

    if (!window.confirm(message)) {
      clearUberWeeklyForm();
      showStatus("Duplicate Uber statement was not saved.", "error");
      return;
    }

    statements[existingIndex] = {
      ...existing,
      ...statement,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };
  } else {
    statements.push(statement);
  }

  writeUberWeeklyStatements(statements);
  clearUberWeeklyForm();
  showStatus("Uber weekly statement saved.", "success");
  await loadMonthSummary();
}

async function deleteUberWeeklyStatement(statementId) {
  const statements = readUberWeeklyStatements();
  const statement = statements.find((item) => item.id === statementId);
  const label = statement ? `${statement.weekStart} - ${statement.weekEnd}` : "this Uber statement";

  if (!window.confirm(`Delete ${label}?`)) return;

  writeUberWeeklyStatements(statements.filter((item) => item.id !== statementId));
  showStatus("Uber weekly statement deleted.", "success");
  await loadMonthSummary();
}

async function handleExportMonth() {
  try {
    showStatus("Exporting month summary...", "info", false);
    const summary = await loadMonthSummary();

    if (!summary) {
      showStatus("No month summary to export.", "error");
      return;
    }

    await exportMonthlySummary(summary);
    showStatus("Month summary exported successfully.", "success");
  } catch (error) {
    console.error("Export month failed:", error);
    showStatus(`Failed to export month summary: ${error.message}`, "error", false);
  }
}

async function handleExportMtd() {
  try {
    showStatus("Exporting MTD summary...", "info", false);
    const summary = await loadMonthSummary();

    if (!summary) {
      showStatus("No MTD summary to export.", "error");
      return;
    }

    await exportMtdSummary(summary);
    showStatus("MTD summary exported successfully.", "success");
  } catch (error) {
    console.error("Export MTD failed:", error);
    showStatus(`Failed to export MTD summary: ${error.message}`, "error", false);
  }
}

export function initMonthly() {
  const picker = el(ids.picker);
  const exportBtn = el(ids.exportBtn);
  const exportMtdBtn = el(ids.exportMtdBtn);
  const saveUberWeeklyBtn = el(ids.saveUberWeeklyBtn);
  const parseImportBtn = el(ids.parseImportBtn);
  const readClipboardBtn = el(ids.readClipboardBtn);
  const importText = el(ids.importText);
  const importImage = el(ids.importImage);

  if (picker && !picker.value) {
    picker.value = currentMonthValue();
  }

  picker?.addEventListener("change", loadMonthSummary);
  exportBtn?.addEventListener("click", handleExportMonth);
  exportMtdBtn?.addEventListener("click", handleExportMtd);
  saveUberWeeklyBtn?.addEventListener("click", handleSaveUberWeekly);
  parseImportBtn?.addEventListener("click", () => parseUberImportText(importText?.value || ""));
  readClipboardBtn?.addEventListener("click", handleUberClipboardImport);
  importText?.addEventListener("paste", handleUberImportPaste);
  importImage?.addEventListener("change", handleUberImportFile);
  el(ids.weeklyHistory)?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-uber-week]");
    if (!button) return;

    await deleteUberWeeklyStatement(button.dataset.deleteUberWeek);
  });
  window.addEventListener(SETTINGS_UPDATED_EVENT, loadMonthSummary);

  loadMonthSummary();
}
