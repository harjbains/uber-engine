export function initTabs() {

  document.querySelectorAll(".tab-bar button").forEach(btn => {

    btn.addEventListener("click", () => {

      // Remove active from all
      document.querySelectorAll(".tab-bar button")
        .forEach(b => b.classList.remove("active-tab"));

      btn.classList.add("active-tab");

      document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.remove("active");
      });

      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add("active");
    });

  });

}