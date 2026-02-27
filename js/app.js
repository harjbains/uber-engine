document.querySelectorAll("nav button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(tab => {
      tab.classList.remove("active");
    });
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

document.getElementById("current-date").innerText =
  new Date().toLocaleDateString();
