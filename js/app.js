import { initDays } from "./days.js?v=2.1.2";
import { initMonthly } from "./monthly.js?v=2.0.6";
import { initFuel } from "./fuel.js?v=2.0.6";
import { initExpenses } from "./expenses.js?v=2.0.6";
import { VERSION, getReleaseNotes } from "./version.js?v=2.1.2";
import { initTrainingMode } from "./trainingMode.js";

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
  if (notesNode) notesNode.textContent = getReleaseNotes(VERSION);
}

document.addEventListener("DOMContentLoaded", () => {
  initVersion();
  initTabs();
  initDays();
  initMonthly();
  initFuel();
  initExpenses();
  initTrainingMode();
});

