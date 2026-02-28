const now = new Date();

const today = now.toISOString().split("T")[0];

document.getElementById("current-date").innerText =
  now.toLocaleDateString() + " " + now.toLocaleTimeString();

document.getElementById("build-version").innerText =
  "Build v0.1 - " + now.toLocaleTimeString();

async function loadTodayShifts() {
  const { data, error } = await supabaseClient
    .from("shifts")
    .select("*")
    .eq("date", today)
    .order("start_time", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  const shiftList = document.getElementById("shift-list");
  shiftList.innerHTML = "";

  let totalMiles = 0;
  let totalGross = 0;
  let totalHours = 0;

  data.forEach(shift => {
    const miles = shift.odo_end - shift.odo_start;
    const gross = Number(shift.gross) + Number(shift.tips || 0);

    const start = new Date(`1970-01-01T${shift.start_time}`);
    const end = new Date(`1970-01-01T${shift.end_time}`);
    const hours = (end - start) / (1000 * 60 * 60);

    totalMiles += miles;
    totalGross += gross;
    totalHours += hours;

    const div = document.createElement("div");
    div.innerHTML = `
      <p>
        ${shift.start_time} - ${shift.end_time} |
        ${miles} miles |
        £${gross.toFixed(2)}
      </p>
    `;
    shiftList.appendChild(div);
  });

  document.getElementById("total-miles").innerText = totalMiles;
  document.getElementById("total-gross").innerText = totalGross.toFixed(2);
  document.getElementById("total-hours").innerText = totalHours.toFixed(2);
}

document.getElementById("save-shift").addEventListener("click", async () => {
  const shift = {
    date: today,
    start_time: document.getElementById("start-time").value,
    end_time: document.getElementById("end-time").value,
    odo_start: parseInt(document.getElementById("odo-start").value),
    odo_end: parseInt(document.getElementById("odo-end").value),
    gross: parseFloat(document.getElementById("gross").value),
    tips: parseFloat(document.getElementById("tips").value) || 0
  };

  const { error } = await supabaseClient
    .from("shifts")
    .insert([shift]);

  if (error) {
    console.error(error);
    return;
  }

  loadTodayShifts();
});

loadTodayShifts();

function roundToFiveMinutes(timeString) {
  if (!timeString) return "";

  const [hours, minutes] = timeString.split(":").map(Number);

  const totalMinutes = hours * 60 + minutes;
  const rounded = Math.round(totalMinutes / 5) * 5;

  const newHours = Math.floor(rounded / 60);
  const newMinutes = rounded % 60;

  return (
    String(newHours).padStart(2, "0") +
    ":" +
    String(newMinutes).padStart(2, "0")
  );
}

document.getElementById("start-time").addEventListener("change", function () {
  this.value = roundToFiveMinutes(this.value);
});

document.getElementById("end-time").addEventListener("change", function () {
  this.value = roundToFiveMinutes(this.value);
});
