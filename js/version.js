export const VERSION = "v2.1.5";

export const RELEASE_NOTES = {
  "2.1.5": "Weekly target wording simplified around required remaining daily target",
  "2.1.4": "Weekly target pace now follows required remaining daily target",
  "2.1.3": "Weekly target progress bar with red, amber, green pace states",
  "2.1.2": "Weekly target tracker, simplified day logging, compact finance cards, and blank end-time save fix",
  "2.1.1": "Weekly income target tracker added to Day workflow",
  "2.1.0": "Day & Month fuel calculations based on 3 most recent fills, station name removed from fuel form",
  "2.0.0": "Daily workflow replaces shifts. Added weekly day history, real-world retained view, and month summary based on days.",
  "1.5.1": "Trips add to shift workflow and Google Sheets",
  "1.4.2": "Changed shift model to use shift_miles",
  "1.4.1": "Confirm Google Sheets sync for shifts fuel and expenses.",
  "1.4.0": "Reconciliation pass. Single module bootstrap, fixed fuel history rendering, cleaned tab loading and date defaults.",
  "1.3.0": "Scripts changed to send multiple calls to Sheets for shift, fuel, expense.",
  "1.2.0": "History UI stabilisation. Compact shift, fuel and expense cards. Expense categories now load correctly.",
  "1.1.0": "Google Sheets shift sync and core shift save/load stabilisation."
};

export function getReleaseNotes(version = VERSION) {
  const cleanVersion = String(version).replace(/^v/i, "");
  return RELEASE_NOTES[cleanVersion] || "";
}



