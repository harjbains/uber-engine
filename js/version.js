export function initVersion() {

  const APP_VERSION = "v0.3.0";
  const APP_CHANGELOG = "Modular structure + Fuel + Shifts";

  const now = new Date();

  const currentDate = document.getElementById("current-date");
  const buildVersion = document.getElementById("build-version");

  if (currentDate) {
    currentDate.innerText =
      now.toLocaleDateString() + " " + now.toLocaleTimeString();
  }

  if (buildVersion) {
    buildVersion.innerText =
      APP_VERSION + " – " + APP_CHANGELOG;
  }
}