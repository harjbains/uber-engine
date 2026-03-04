export function initTabs() {

  const buttons = document.querySelectorAll(".tab-button");
  const contents = document.querySelectorAll(".tab-content");

  buttons.forEach(button => {
    button.addEventListener("click", () => {

      const tabId = button.dataset.tab;

      // Remove active from all buttons
      buttons.forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      // Hide all tab contents
      contents.forEach(content => {
        content.classList.remove("active");
      });

      // Show selected tab
      const selected = document.getElementById(tabId);
      if (selected) {
        selected.classList.add("active");
      }

      // 🔥 Notify system which tab is active
      document.dispatchEvent(
        new CustomEvent("tabChanged", { detail: tabId })
      );

      

    });
  });

}