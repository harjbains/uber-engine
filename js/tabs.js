export function initTabs() {

  const buttons = document.querySelectorAll(".tab-button");
  const contents = document.querySelectorAll(".tab-content");

  if (!buttons.length) return;

  buttons.forEach(button => {
    button.addEventListener("click", () => {

      buttons.forEach(b => b.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));

      button.classList.add("active");

      const tabId = button.dataset.tab;
      const target = document.getElementById(tabId);

      if (target) {
        target.classList.add("active");
      }

    });
  });

}