export const APP_VERSION = "1.3.0";

export const RELEASE_NOTES = {
  "1.3.0" : "Scripts changed to send multiple calls to Sheets for shift, feul, expense",
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