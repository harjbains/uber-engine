import { supabaseClient } from "./supabase.js";
import { initTabs } from "./tabs.js";
import { initShifts } from "./shifts.js";
import { initFuel } from "./fuel.js";
import { initMonthly } from "./monthly.js";
import { initVersion } from "./version.js";

const APP_VERSION = "v0.6.26 – Fix fuel input ID mismatches";

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

  const { error } = await supabaseClient
    .from(table)
    .delete()
    .eq("id", id)

  if (!error) location.reload()

})