export const APP_VERSION = "v1.5.0";

export const RELEASE_NOTES = {
  "1.4.2": "Changed shift model to use shift_miles",
  "1.4.1": "Confirm Google Sheets sync for shifts fuel and expenses.",
  "1.4.0": "Reconciliation pass. Single module bootstrap, fixed fuel history rendering, cleaned tab loading and date defaults.",
  "1.3.0": "Scripts changed to send multiple calls to Sheets for shift, fuel, expense.",
  "1.2.0": "History UI stabilisation. Compact shift, fuel and expense cards. Expense categories now load correctly.",
  "1.1.0": "Google Sheets shift sync and core shift save/load stabilisation."
};

export function initVersion(version = APP_VERSION) {
  const versionEl = document.getElementById("app-version");
  const notesEl = document.getElementById("app-version-notes");

  if (versionEl) {
    versionEl.textContent = `Uber Engine ${version}`;
  }

  if (notesEl) {
    notesEl.textContent = RELEASE_NOTES[version] || "";
  }
}