const TRAINING_API_URL =
  "https://uber-training-mode-api.harjbains.workers.dev/training-trip";

let currentTrainingTrip = null;
let currentDecision = null;
let isGenerating = false;

export function initTrainingMode() {
  const generateButton = document.getElementById("generate-training-trip");
  const takeButton = document.getElementById("training-take");
  const passButton = document.getElementById("training-pass");
  const revealButton = document.getElementById("reveal-training-analysis");

  if (!generateButton) return;

  generateButton.addEventListener("click", generateTrainingTrip);
  takeButton?.addEventListener("click", () => recordDecision("Take"));
  passButton?.addEventListener("click", () => recordDecision("Pass"));
  revealButton?.addEventListener("click", revealAnalysis);

  setTrainingStatus(
    "Training Mode ready. Enter your current postcode from Google Maps, choose a mode, then generate a realistic mock trip.",
    "info"
  );

  setDecisionButtonsEnabled(false);
}

async function generateTrainingTrip() {
  if (isGenerating) return;

  const postcodeInput = document.getElementById("training-postcode");
  const currentPostcode = normaliseOutcode(postcodeInput?.value || "");

  if (!currentPostcode) {
    setTrainingStatus("Enter a postcode first, e.g. WV1, WV6, B16 or B68.", "error");
    postcodeInput?.focus();
    return;
  }

  isGenerating = true;
  currentTrainingTrip = null;
  currentDecision = null;

  clearTrainingCard();
  clearFeedback();
  setDecisionButtonsEnabled(false);
  setGenerateButtonLoading(true);
  setTrainingStatus("Generating AI training trip...", "info");

  try {
    const payload = buildTrainingPayload(currentPostcode);

    const response = await fetch(TRAINING_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || "The API returned an invalid response.");
    }

    if (!response.ok) {
      throw new Error(data?.detail || data?.error || "Could not generate training trip.");
    }

    currentTrainingTrip = normaliseTripForDisplay(data);
    renderTrainingCard(currentTrainingTrip);
    setDecisionButtonsEnabled(true);
    setTrainingStatus("AI training trip generated.", "success");
  } catch (error) {
    console.error("Training trip generation failed:", error);

    setTrainingStatus(
      `Could not generate AI trip: ${error?.message || "Unknown error"}`,
      "error"
    );
  } finally {
    isGenerating = false;
    setGenerateButtonLoading(false);
  }
}

function buildTrainingPayload(currentPostcode) {
  const now = new Date();

  return {
    currentPostcode,
    localTime: now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit"
    }),
    dayOfWeek: now.toLocaleDateString("en-GB", {
      weekday: "long"
    }),
    date: formatLocalDate(now),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London",
    mode: getInputValue("training-mode", "evening"),
    difficulty: getInputValue("training-difficulty", "beginner"),
    currentGross: nullableNumberFromInput("training-current-gross"),
    targetGross: nullableNumberFromInput("training-target")
  };
}

function normaliseTripForDisplay(rawTrip) {
  const fare = number(rawTrip?.fare);
  const passengerRating = number(rawTrip?.passengerRating);

  const pickup = rawTrip?.pickup || {};
  const journey = rawTrip?.trip || {};
  const metrics = rawTrip?.metrics || calculateMetrics(rawTrip);

  return {
    ...rawTrip,
    fare,
    currency: rawTrip?.currency || "GBP",
    passengerRating,
    pickup: {
      outcode: normaliseOutcode(pickup.outcode),
      area: safeText(pickup.area, "Unknown pickup area"),
      label: safeText(pickup.label || pickup.area, "Unknown pickup"),
      milesAway: round1(number(pickup.milesAway)),
      minutesAway: integer(pickup.minutesAway)
    },
    trip: {
      miles: round1(number(journey.miles)),
      minutes: integer(journey.minutes),
      dropoffOutcode: normaliseOutcode(journey.dropoffOutcode),
      dropoffArea: safeText(journey.dropoffArea, "Unknown drop-off area"),
      dropoffLabel: safeText(journey.dropoffLabel || journey.dropoffArea, "Unknown drop-off")
    },
    decision: {
      recommended: rawTrip?.decision?.recommended || "Situational",
      dropoffRating: rawTrip?.decision?.dropoffRating || "Amber",
      reasoning: rawTrip?.decision?.reasoning || "No reasoning provided.",
      afterDropoffPlan:
        rawTrip?.decision?.afterDropoffPlan || "Assess local demand and avoid unnecessary dead miles.",
      challengeQuestion:
        rawTrip?.decision?.challengeQuestion || "Would this job improve your position or just keep you busy?"
    },
    learning: {
      postcodeLesson:
        rawTrip?.learning?.postcodeLesson || "Use the outcodes to judge whether the job improves positioning.",
      focusSkill:
        rawTrip?.learning?.focusSkill || "Fast Take/Pass decision-making using fare, time, miles and positioning."
    },
    metrics: {
      totalMiles: round1(number(metrics.totalMiles)),
      totalMinutes: integer(metrics.totalMinutes),
      grossPerMile: round2(number(metrics.grossPerMile)),
      grossPerHour: round2(number(metrics.grossPerHour))
    }
  };
}

function renderTrainingCard(trip) {
  const container = document.getElementById("training-card-container");
  if (!container) return;

  const pay = calculatePayBreakdown(trip.fare);

  const pickupLineOne = `${trip.pickup.minutesAway} mins (${trip.pickup.milesAway.toFixed(1)} mi) away`;
const pickupLineTwo = `${trip.pickup.outcode}, ${trip.pickup.label}`;

const dropoffLineOne = `${trip.trip.minutes} mins • ${trip.trip.miles.toFixed(1)} mi trip`;  
const dropoffLineTwo = `${trip.trip.dropoffOutcode}, ${trip.trip.dropoffLabel}`;

  container.innerHTML = `
    <div class="training-offer-card">
      <div class="training-card-top">
        <div class="training-badges">
          <span class="training-share">↻ Share</span>
          <span class="training-exclusive">Training</span>
        </div>
        <button class="training-close" type="button" aria-label="Clear training card">×</button>
      </div>

      <div class="training-fare">${formatMoney(trip.fare)}</div>

      <div class="training-rating">
        <span>★</span>
        <span>${trip.passengerRating.toFixed(2)}</span>
      </div>

      <div class="training-pay-breakdown">
        ${formatMoney(pay.basePay)} + est. holiday pay of ${formatMoney(pay.holidayPay)}
      </div>

      <div class="training-divider"></div>

      <div class="training-route">
        <div class="training-route-line">
          <span class="training-dot-start"></span>
          <span class="training-dot-end"></span>
        </div>

        <div class="training-route-details">
          <div class="training-strong">${escapeHtml(pickupLineOne)}</div>
          <div class="training-muted">${escapeHtml(pickupLineTwo)}</div>

          <div class="training-spacer"></div>

          <div class="training-strong">${escapeHtml(dropoffLineOne)}</div>
          <div class="training-muted">${escapeHtml(dropoffLineTwo)}</div>
        </div>
      </div>

      <button class="training-accept-style" type="button">Accept</button>
    </div>

    <div class="training-chip-row">
      <span>Total: ${trip.metrics.totalMiles.toFixed(1)} mi</span>
      <span>${trip.metrics.totalMinutes} mins</span>
      <span>${formatMoney(trip.metrics.grossPerMile)}/mi</span>
      <span>${formatMoney(trip.metrics.grossPerHour)}/hr</span>
    </div>
  `;

  container.querySelector(".training-close")?.addEventListener("click", () => {
    currentTrainingTrip = null;
    currentDecision = null;
    clearTrainingCard();
    clearFeedback();
    setDecisionButtonsEnabled(false);
    setTrainingStatus("Training card cleared. Generate another trip when ready.", "info");
  });
}

function recordDecision(decision) {
  if (!currentTrainingTrip) {
    setTrainingStatus("Generate a training trip before choosing Take or Pass.", "error");
    return;
  }

  currentDecision = decision;

  const feedback = document.getElementById("training-feedback");
  if (!feedback) return;

  feedback.innerHTML = `
    <div class="training-feedback-card">
      <h3>Your decision locked in</h3>
      <p><strong>You chose:</strong> ${escapeHtml(decision)}</p>
      <p>Now press <strong>Reveal Analysis</strong> to compare your decision against the numbers and positioning.</p>
    </div>
  `;
}

function revealAnalysis() {
  if (!currentTrainingTrip) {
    setTrainingStatus("Generate a training trip before revealing analysis.", "error");
    return;
  }

  const trip = currentTrainingTrip;
  const feedback = document.getElementById("training-feedback");
  if (!feedback) return;

  const recommended = trip.decision.recommended;
  const verdict = buildVerdict(currentDecision, recommended);

  feedback.innerHTML = `
    <div class="training-feedback-card">
      <h3>Training Analysis</h3>

      <div class="training-analysis-row">
        <span>Your decision</span>
        <strong>${escapeHtml(currentDecision || "No decision made")}</strong>
      </div>

      <div class="training-analysis-row">
        <span>Recommended</span>
        <strong>${escapeHtml(recommended)}</strong>
      </div>

      <div class="training-analysis-row">
        <span>Drop-off rating</span>
        <strong>${escapeHtml(trip.decision.dropoffRating)}</strong>
      </div>

      <div class="training-metrics-grid">
        <div>
          <span>Total miles</span>
          <strong>${trip.metrics.totalMiles.toFixed(1)}</strong>
        </div>
        <div>
          <span>Total time</span>
          <strong>${trip.metrics.totalMinutes} mins</strong>
        </div>
        <div>
          <span>£ / mile</span>
          <strong>${formatMoney(trip.metrics.grossPerMile)}</strong>
        </div>
        <div>
          <span>Gross £ / hour</span>
          <strong>${formatMoney(trip.metrics.grossPerHour)}</strong>
        </div>
      </div>

      <p><strong>Verdict:</strong> ${escapeHtml(verdict)}</p>

      <p><strong>Reasoning:</strong> ${escapeHtml(trip.decision.reasoning)}</p>

      <p><strong>After drop-off plan:</strong> ${escapeHtml(trip.decision.afterDropoffPlan)}</p>

      <p><strong>Postcode lesson:</strong> ${escapeHtml(trip.learning.postcodeLesson)}</p>

      <p><strong>Focus skill:</strong> ${escapeHtml(trip.learning.focusSkill)}</p>

      <p><strong>Challenge question:</strong> ${escapeHtml(trip.decision.challengeQuestion)}</p>
    </div>
  `;
}

function buildVerdict(userDecision, recommended) {
  if (!userDecision) {
    return "You revealed the analysis before making a Take/Pass choice. In real Uber decision-making, make the instinctive call first, then analyse afterwards.";
  }

  if (recommended === "Situational") {
    return `This is situational. Your ${userDecision} decision can be valid if it matches your shift plan, current target and positioning.`;
  }

  if (userDecision === recommended) {
    return `Good decision. I agree with ${recommended}.`;
  }

  return `Challenge: I would lean ${recommended}, but you chose ${userDecision}. Look again at the mileage, time, and where the job leaves you afterwards.`;
}

function calculateMetrics(trip) {
  const fare = number(trip?.fare);
  const pickupMiles = number(trip?.pickup?.milesAway);
  const tripMiles = number(trip?.trip?.miles);
  const pickupMinutes = integer(trip?.pickup?.minutesAway);
  const tripMinutes = integer(trip?.trip?.minutes);

  const totalMiles = round1(pickupMiles + tripMiles);
  const totalMinutes = pickupMinutes + tripMinutes;

  return {
    totalMiles,
    totalMinutes,
    grossPerMile: totalMiles > 0 ? round2(fare / totalMiles) : 0,
    grossPerHour: totalMinutes > 0 ? round2(fare / (totalMinutes / 60)) : 0
  };
}

function calculatePayBreakdown(fare) {
  const total = number(fare);

  // Estimated holiday pay display only.
  // Uber-style cards often show base fare plus estimated holiday pay.
  const basePay = total / 1.1207;
  const holidayPay = total - basePay;

  return {
    basePay: round2(basePay),
    holidayPay: round2(holidayPay)
  };
}

function setGenerateButtonLoading(loading) {
  const button = document.getElementById("generate-training-trip");
  if (!button) return;

  button.disabled = loading;
  button.textContent = loading ? "Generating..." : "Generate Training Trip";
}

function setDecisionButtonsEnabled(enabled) {
  const takeButton = document.getElementById("training-take");
  const passButton = document.getElementById("training-pass");
  const revealButton = document.getElementById("reveal-training-analysis");

  if (takeButton) takeButton.disabled = !enabled;
  if (passButton) passButton.disabled = !enabled;
  if (revealButton) revealButton.disabled = !enabled;
}

function setTrainingStatus(message, type = "info") {
  const status = document.getElementById("training-status");
  if (!status) return;

  status.className = `training-status training-status--${type}`;
  status.textContent = message;
}

function clearTrainingCard() {
  const container = document.getElementById("training-card-container");
  if (container) container.innerHTML = "";
}

function clearFeedback() {
  const feedback = document.getElementById("training-feedback");
  if (feedback) feedback.innerHTML = "";
}

function getInputValue(id, fallback = "") {
  const element = document.getElementById(id);
  return element?.value || fallback;
}

function nullableNumberFromInput(id) {
  const element = document.getElementById(id);
  const value = element?.value;

  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normaliseOutcode(value) {
  const cleaned = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const firstPart = cleaned.split(" ")[0];
  const compact = cleaned.replace(/\s/g, "");

  if (/^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(firstPart)) {
    return firstPart;
  }

  const outwardMatch = compact.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);

  return outwardMatch ? outwardMatch[1] : firstPart;
}

function safeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round1(value) {
  return Math.round(number(value) * 10) / 10;
}

function round2(value) {
  return Math.round(number(value) * 100) / 100;
}

function formatMoney(value) {
  return `£${round2(value).toFixed(2)}`;
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}