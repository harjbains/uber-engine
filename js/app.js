import { initDays } from "./days.js";
import { initMonthly } from "./monthly.js";
import { initFuel } from "./fuel.js";
import { initExpenses } from "./expenses.js";
import { VERSION, RELEASE_NOTES } from "./version.js";

function initTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const tabs = document.querySelectorAll(".tab-content");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.tab;

      buttons.forEach((btn) => btn.classList.remove("active"));
      tabs.forEach((tab) => tab.classList.remove("active"));

      button.classList.add("active");
      document.getElementById(targetId)?.classList.add("active");
    });
  });
}

function initVersion() {
  const versionNode = document.getElementById("app-version");
  const notesNode = document.getElementById("app-version-notes");

  if (versionNode) versionNode.textContent = `Uber Engine ${VERSION}`;
  if (notesNode) notesNode.textContent = RELEASE_NOTES;
}

document.addEventListener("DOMContentLoaded", () => {
  initVersion();
  initTabs();
  initDays();
  initMonthly();
  initFuel();
  initExpenses();
});

