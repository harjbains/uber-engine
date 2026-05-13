export const VERSION = "v2.2.18";

export const RELEASE_NOTES = {
  "2.2.18": "MTD mileage mode now excludes other expenses to avoid vehicle cost double counting",
  "2.2.17": "Mileage claim now tracks the 10,000 business mile threshold by tax year",
  "2.2.16": "Settings now controls MTD mileage claim versus actual vehicle costs",
  "2.2.15": "MTD_READY export now includes gross income and Uber fee breakdown",
  "2.2.14": "Google Sheets webhook updated to latest Apps Script deployment",
  "2.2.13": "MTD export errors now show Apps Script detail",
  "2.2.12": "MTD export payload now targets the MTD_READY sheet columns",
  "2.2.11": "Month summary restored to stacked section layout for readability",
  "2.2.10": "Month summary sections now render as responsive tiles",
  "2.2.9": "Month summary split into net income, tax summary, and performance sections",
  "2.2.8": "Uber weekly statement history and MTD rollup added to Month tab",
  "2.2.7": "Uber monthly statement entry and MTD export added to Month tab",
  "2.2.6": "Weekly target work days left now excludes days with saved sessions",
  "2.2.5": "Weekly target daily target now uses future planned work days only",
  "2.2.4": "Weekly target week controls and delete buttons for Costs history",
  "2.2.3": "Delete button added to worked session summary cards",
  "2.2.2": "iPhone live stylesheet cache fix and larger Costs toggle controls",
  "2.2.1": "Compact month dashboard, weekly day strip, Costs tab, EV settings, and iPhone-width layout",
  "2.2.0": "Settings tab added for targets, vehicle details, insurance, tax, and fuel assumptions",
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





