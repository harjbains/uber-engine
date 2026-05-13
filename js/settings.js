export const SETTINGS_UPDATED_EVENT = "uberEngineSettingsUpdated";

const STORAGE_KEY = "uberEngineSettings";

const DEFAULT_SETTINGS = {
  weeklyTarget: 750,
  fuelType: "petrol",
  vehicleModel: "",
  vehicleReg: "",
  insuranceMonthly: 300,
  taxRatePercent: 20,
  mpg: 32.5,
  fallbackFuelPrice: 1.7,
  vehicleExpenseMethod: "mileage",
  evHomeOffPeakRate: 7.5,
  evHomePeakRate: 28,
  evPublicRate: 55,
  evChargingMix: "home_off_peak"
};

const ids = {
  weeklyTarget: "settings_weekly_target",
  fuelType: "settings_fuel_type",
  vehicleModel: "settings_vehicle_model",
  vehicleReg: "settings_vehicle_reg",
  insuranceMonthly: "settings_insurance_monthly",
  taxRatePercent: "settings_tax_rate",
  mpg: "settings_mpg",
  fallbackFuelPrice: "settings_fuel_price",
  vehicleExpenseMethod: "settings_vehicle_expense_method",
  evHomeOffPeakRate: "settings_ev_home_off_peak",
  evHomePeakRate: "settings_ev_home_peak",
  evPublicRate: "settings_ev_public_rate",
  evChargingMix: "settings_ev_charging_mix",
  saveBtn: "save_settings",
  resetBtn: "reset_settings",
  status: "settings_status"
};

function el(id) {
  return document.getElementById(id);
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(raw)
    };
  } catch (error) {
    console.warn("Unable to read settings:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: settings }));
}

export function getDailyInsuranceEstimate(settings = getSettings()) {
  return toNumber(settings.insuranceMonthly, DEFAULT_SETTINGS.insuranceMonthly) / 30;
}

export function getTaxRate(settings = getSettings()) {
  return toNumber(settings.taxRatePercent, DEFAULT_SETTINGS.taxRatePercent) / 100;
}

export function getMpg(settings = getSettings()) {
  return toNumber(settings.mpg, DEFAULT_SETTINGS.mpg);
}

export function getFallbackFuelPrice(settings = getSettings()) {
  return toNumber(settings.fallbackFuelPrice, DEFAULT_SETTINGS.fallbackFuelPrice);
}

export function getWeeklyTargetDefault(settings = getSettings()) {
  return toNumber(settings.weeklyTarget, DEFAULT_SETTINGS.weeklyTarget);
}

export function getVehicleExpenseMethod(settings = getSettings()) {
  return settings.vehicleExpenseMethod === "actual" ? "actual" : "mileage";
}

function populateSettingsForm() {
  const settings = getSettings();

  if (el(ids.weeklyTarget)) el(ids.weeklyTarget).value = settings.weeklyTarget;
  if (el(ids.fuelType)) el(ids.fuelType).value = settings.fuelType;
  if (el(ids.vehicleModel)) el(ids.vehicleModel).value = settings.vehicleModel;
  if (el(ids.vehicleReg)) el(ids.vehicleReg).value = settings.vehicleReg;
  if (el(ids.insuranceMonthly)) el(ids.insuranceMonthly).value = settings.insuranceMonthly;
  if (el(ids.taxRatePercent)) el(ids.taxRatePercent).value = settings.taxRatePercent;
  if (el(ids.mpg)) el(ids.mpg).value = settings.mpg;
  if (el(ids.fallbackFuelPrice)) el(ids.fallbackFuelPrice).value = settings.fallbackFuelPrice;
  if (el(ids.vehicleExpenseMethod)) el(ids.vehicleExpenseMethod).value = getVehicleExpenseMethod(settings);
  if (el(ids.evHomeOffPeakRate)) el(ids.evHomeOffPeakRate).value = settings.evHomeOffPeakRate;
  if (el(ids.evHomePeakRate)) el(ids.evHomePeakRate).value = settings.evHomePeakRate;
  if (el(ids.evPublicRate)) el(ids.evPublicRate).value = settings.evPublicRate;
  if (el(ids.evChargingMix)) el(ids.evChargingMix).value = settings.evChargingMix;
}

function readSettingsForm() {
  return {
    weeklyTarget: toNumber(el(ids.weeklyTarget)?.value, DEFAULT_SETTINGS.weeklyTarget),
    fuelType: el(ids.fuelType)?.value || DEFAULT_SETTINGS.fuelType,
    vehicleModel: el(ids.vehicleModel)?.value?.trim() || "",
    vehicleReg: el(ids.vehicleReg)?.value?.trim().toUpperCase() || "",
    insuranceMonthly: toNumber(el(ids.insuranceMonthly)?.value, DEFAULT_SETTINGS.insuranceMonthly),
    taxRatePercent: toNumber(el(ids.taxRatePercent)?.value, DEFAULT_SETTINGS.taxRatePercent),
    mpg: toNumber(el(ids.mpg)?.value, DEFAULT_SETTINGS.mpg),
    fallbackFuelPrice: toNumber(el(ids.fallbackFuelPrice)?.value, DEFAULT_SETTINGS.fallbackFuelPrice),
    vehicleExpenseMethod: el(ids.vehicleExpenseMethod)?.value === "actual" ? "actual" : "mileage",
    evHomeOffPeakRate: toNumber(el(ids.evHomeOffPeakRate)?.value, DEFAULT_SETTINGS.evHomeOffPeakRate),
    evHomePeakRate: toNumber(el(ids.evHomePeakRate)?.value, DEFAULT_SETTINGS.evHomePeakRate),
    evPublicRate: toNumber(el(ids.evPublicRate)?.value, DEFAULT_SETTINGS.evPublicRate),
    evChargingMix: el(ids.evChargingMix)?.value || DEFAULT_SETTINGS.evChargingMix
  };
}

function setStatus(message, type = "info") {
  const status = el(ids.status);
  if (!status) return;

  status.textContent = message;
  status.className = `settings-status settings-status--${type}`;
}

function bindSettingsEvents() {
  el(ids.saveBtn)?.addEventListener("click", () => {
    saveSettings(readSettingsForm());
    setStatus("Settings saved.", "success");
  });

  el(ids.resetBtn)?.addEventListener("click", () => {
    saveSettings({ ...DEFAULT_SETTINGS });
    populateSettingsForm();
    setStatus("Settings reset to defaults.", "info");
  });
}

export function initSettings() {
  populateSettingsForm();
  bindSettingsEvents();
}
