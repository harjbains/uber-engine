import { initDays } from "./days.js?v=2.3.26";
import { initMonthly } from "./monthly.js?v=2.3.26";
import { initFuel } from "./fuel.js?v=2.3.26";
import { initExpenses } from "./expenses.js?v=2.3.26";
import { VERSION, getReleaseNotes } from "./version.js?v=2.3.26";
import { initSettings } from "./settings.js?v=2.3.26";

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

function initCostToggle() {
  const buttons = document.querySelectorAll("[data-cost-panel]");
  const panels = document.querySelectorAll(".cost-panel");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.costPanel;

      buttons.forEach((btn) => btn.classList.remove("active"));
      panels.forEach((panel) => panel.classList.remove("active"));

      button.classList.add("active");
      document.getElementById(targetId)?.classList.add("active");
    });
  });
}

function initDashboardCarousel() {
  const slides = Array.from(document.querySelectorAll("[data-dashboard-slide]"));
  const dots = Array.from(document.querySelectorAll("[data-dashboard-dot]"));
  if (!slides.length || !dots.length) return;

  function showSlide(index) {
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === index;
      slide.classList.toggle("active", active);
      slide.toggleAttribute("hidden", !active);
    });

    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === index;
      dot.classList.toggle("active", active);
      if (active) {
        dot.setAttribute("aria-current", "true");
      } else {
        dot.removeAttribute("aria-current");
      }
    });
  }

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      showSlide(Number(dot.dataset.dashboardDot || 0));
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
  initCostToggle();
  initDashboardCarousel();
  initDays();
  initMonthly();
  initFuel();
  initExpenses();
  initSettings();
});






