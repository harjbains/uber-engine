import { initTabs } from "./tabs.js";
import { initShifts } from "./shifts.js";
import { initFuel } from "./fuel.js";
import { initMonthly } from "./monthly.js";
import { initVersion } from "./version.js";

const APP_VERSION = "v0.6.11 – UI improvements + delete fix";

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initShifts();
  initFuel();
  initMonthly();
  initVersion(APP_VERSION);
});

document.addEventListener("click", async (e) => {

  const btn = e.target.closest(".delete-btn")
  if (!btn) return

  const id = btn.dataset.id
  const table = btn.dataset.table

  if (!confirm("Delete entry?")) return

  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", id)

  if (!error) location.reload()

})