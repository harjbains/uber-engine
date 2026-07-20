import { initDays } from "./days.js?v=2.3.97";
import { initMonthly } from "./monthly.js?v=2.3.97";
import { initFuel } from "./fuel.js?v=2.3.97";
import { initExpenses } from "./expenses.js?v=2.3.97";
import { VERSION, getReleaseNotes } from "./version.js?v=2.3.97";
import { initSettings } from "./settings.js?v=2.3.97";

function initTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const tabs = document.querySelectorAll(".tab-content");

  function showTab(targetId) {
    buttons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === targetId));
    tabs.forEach((tab) => {
      const active = tab.id === targetId;
      tab.classList.toggle("active", active);
      tab.hidden = !active;
    });
    window.dispatchEvent(new CustomEvent("uber-tab-shown", { detail: { targetId } }));
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      showTab(button.dataset.tab);
    });
  });

  showTab(document.querySelector(".tab-button.active")?.dataset.tab || buttons[0]?.dataset.tab);
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
  const carousel = document.querySelector(".dashboard-carousel");
  const viewport = document.querySelector(".dashboard-carousel__viewport");
  const slideTrack = document.querySelector(".dashboard-carousel__slides");
  const slides = Array.from(document.querySelectorAll("[data-dashboard-slide]"));
  const dots = Array.from(document.querySelectorAll("[data-dashboard-dot]"));
  if (!slideTrack || !slides.length || !dots.length) return;

  let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains("active")));
  let touchStartX = 0;
  let touchStartY = 0;

  function syncHeight() {
    if (!viewport) return;
    const activeSlide = slides[activeIndex];
    if (!activeSlide) return;

    viewport.style.height = `${activeSlide.offsetHeight}px`;
  }

  function showSlide(index) {
    activeIndex = Math.max(0, Math.min(slides.length - 1, index));

    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeIndex;
      slide.classList.toggle("active", active);
      slide.setAttribute("aria-hidden", String(!active));
      if ("inert" in slide) slide.inert = !active;
    });

    slideTrack.style.transform = `translateX(-${activeIndex * 100}%)`;
    window.requestAnimationFrame(syncHeight);

    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === activeIndex;
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

  showSlide(activeIndex);

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(syncHeight);
    slides.forEach((slide) => resizeObserver.observe(slide));
  }

  window.addEventListener("resize", syncHeight);
  window.addEventListener("uber-tab-shown", syncHeight);

  carousel?.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: true });

  carousel?.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;

    showSlide(activeIndex + (deltaX < 0 ? 1 : -1));
  }, { passive: true });
}

function initMonthCarousel() {
  const carousel = document.querySelector(".month-carousel");
  const viewport = carousel?.querySelector(".dashboard-carousel__viewport");
  const slideTrack = carousel?.querySelector(".dashboard-carousel__slides");
  const slides = Array.from(carousel?.querySelectorAll("[data-month-slide]") || []);
  const buttons = Array.from(carousel?.querySelectorAll("[data-month-dot]") || []);
  if (!carousel || !viewport || !slideTrack || !slides.length || !buttons.length) return;

  let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains("active")));
  let touchStartX = 0;
  let touchStartY = 0;

  function syncHeight() {
    const activeSlide = slides[activeIndex];
    if (!activeSlide) return;

    viewport.style.height = `${activeSlide.offsetHeight}px`;
  }

  function showSlide(index) {
    activeIndex = Math.max(0, Math.min(slides.length - 1, index));

    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeIndex;
      slide.classList.toggle("active", active);
      slide.setAttribute("aria-hidden", String(!active));
      if ("inert" in slide) slide.inert = !active;
    });

    slideTrack.style.transform = `translateX(-${activeIndex * 100}%)`;
    window.requestAnimationFrame(syncHeight);

    buttons.forEach((button, buttonIndex) => {
      const active = buttonIndex === activeIndex;
      button.classList.toggle("active", active);
      if (active) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      showSlide(Number(button.dataset.monthDot || 0));
    });
  });

  showSlide(activeIndex);

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(syncHeight);
    slides.forEach((slide) => resizeObserver.observe(slide));
  }

  window.addEventListener("resize", syncHeight);
  window.addEventListener("uber-tab-shown", syncHeight);

  carousel.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: true });

  carousel.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;

    showSlide(activeIndex + (deltaX < 0 ? 1 : -1));
  }, { passive: true });
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
  initMonthCarousel();
  initDays();
  initMonthly();
  initFuel();
  initExpenses();
  initSettings();
});






