import { supabaseClient } from "./supabase.js";

export function initFuel() {

  const container = document.getElementById("fuel_history");
  if (!container) return;

  loadFuel();

  async function loadFuel() {

    const { data, error } = await supabaseClient
      .from("fuel_logs")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error("Fuel load error:", error);
      return;
    }

    renderFuel(data || []);
  }

  function renderFuel(fuelLogs) {

    if (fuelLogs.length === 0) {
      container.innerHTML = "<p>No fuel logs yet</p>";
      return;
    }

    container.innerHTML = fuelLogs.map(fuel => {

      const pricePerLitre =
        fuel.litres > 0
          ? (fuel.total_cost / fuel.litres).toFixed(2)
          : "0.00";

      return `
        <div class="fuel-grid">
          <div>${formatUKDate(fuel.date)}</div>
          <div class="text-right">${fuel.odometer}</div>
          <div class="text-right">${fuel.litres}</div>
          <div class="text-right">£${formatMoney(fuel.total_cost)}</div>
          <div class="text-right">${pricePerLitre}</div>
          <button class="btn-sm" data-id="${fuel.id}">Del</button>
        </div>
      `;
    }).join("");

    attachDelete();
  }

  function attachDelete() {

    const buttons = container.querySelectorAll("button");

    buttons.forEach(btn => {
      btn.addEventListener("click", async () => {

        if (!confirm("Delete this fuel entry?")) return;

        const id = btn.dataset.id;

        await supabaseClient
          .from("fuel_logs")
          .delete()
          .eq("id", id);

        loadFuel();
      });
    });
  }

  function formatMoney(num) {
    return Number(num || 0).toFixed(2);
  }

  function formatUKDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

}