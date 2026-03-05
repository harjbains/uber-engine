function initPullToRefresh() {
  let startY = 0;
  let pulling = false;

  window.addEventListener("touchstart", (e) => {
    if (window.scrollY === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!pulling) return;
    const y = e.touches[0].clientY;
    const diff = y - startY;

    // if they pulled down enough, refresh
    if (diff > 90) {
      pulling = false;

      // cache-bust by appending a query param
      const url = new URL(window.location.href);
      url.searchParams.set("v", Date.now().toString());
      window.location.replace(url.toString());
    }
  }, { passive: true });

  window.addEventListener("touchend", () => {
    pulling = false;
  }, { passive: true });
}