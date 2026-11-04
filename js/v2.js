import { supabaseClient } from "./supabase.js";
import {
  publishShiftState,
  readSyncTotalRequest,
  readMileageRequest,
  clearSyncTotalRequest,
  clearMileageRequest
} from "./shiftProgress.js";

const WEEKLY_TARGETS = "weekly_targets";
const DAYS = "days";
const DEFAULT_TARGET = 750;
const WEIGHTS = [1, 0.8, 1, 1, 1.2, 1.4, 0.8];
const NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const $ = (id) => document.getElementById(id);

let model = null;
let selectedDate = localDateIso();
let celebrationTimer = 0;

function localDateIso(date = new Date()) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function monday(date = new Date()) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function money(value) {
  const num = Number(value) || 0;
  return Number.isInteger(num) ? `£${num}` : `£${num.toFixed(2)}`;
}

function asNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function setStatus(text, type = "") {
  const node = $("sync-status");
  if (!node) return;
  node.textContent = text;
  node.className = `sync-status${type ? ` is-${type}` : ""}`;
}

function planCacheKey(week) {
  return `uberEngine.v2.weekPlan.${week}`;
}

function daysCacheKey(week) {
  return `uberEngine.v2.weekDays.${week}`;
}

function readCachedPlan(week) {
  try {
    return JSON.parse(localStorage.getItem(planCacheKey(week)) || "null");
  } catch {
    return null;
  }
}

function writeCachedPlan(week, plan) {
  try {
    localStorage.setItem(planCacheKey(week), JSON.stringify(plan));
  } catch {}
}

function readCachedDays(week) {
  try {
    return JSON.parse(localStorage.getItem(daysCacheKey(week)) || "null");
  } catch {
    return null;
  }
}

function writeCachedDays(week, days) {
  try {
    localStorage.setItem(daysCacheKey(week), JSON.stringify(days));
  } catch {}
}

function normalisePlan(raw = {}) {
  const source = raw.work_days || raw.workDays;
  const workDays = Array.isArray(source)
    ? [...new Set(source.map(Number).filter((d) => d >= 0 && d < 7))].sort()
    : [0, 1, 2, 3, 4, 5, 6];
  return {
    target: Math.max(0, asNumber(raw.target) || DEFAULT_TARGET),
    workDays
  };
}

function total(rows, field) {
  return rows.reduce((sum, row) => sum + asNumber(row[field]), 0);
}

function dailyRows(rows, date) {
  return rows.filter((row) => row.date === date);
}

function allocate(amount, indexes) {
  const targets = Array(7).fill(0);
  const weightTotal = indexes.reduce((sum, index) => sum + WEIGHTS[index], 0);
  if (!weightTotal || amount <= 0) return targets;

  let allocated = 0;
  indexes.forEach((index, position) => {
    const value =
      position === indexes.length - 1
        ? Math.round((amount - allocated) * 100) / 100
        : Math.round(((amount * WEIGHTS[index]) / weightTotal) * 100) / 100;
    targets[index] = Math.max(0, value);
    allocated += value;
  });
  return targets;
}

function derive(plan, rows, weekStart) {
  const todayIso = localDateIso();
  const dates = NAMES.map((_, index) => localDateIso(addDays(weekStart, index)));
  const todayIndex = dates.indexOf(todayIso);

  const earned = total(rows, "gross");
  const miles = total(rows, "business_miles");
  const remaining = Math.max(0, plan.target - earned);

  const baseline = allocate(plan.target, plan.workDays);
  const openDays = plan.workDays.filter((index) => index >= todayIndex);
  const current = allocate(remaining, openDays);

  const days = dates.map((date, index) => {
    const entries = dailyRows(rows, date);
    const dayDate = addDays(weekStart, index);
    const dateShort = dayDate.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short"
    });
    const dateFull = dayDate.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short"
    });

    return {
      date,
      index,
      label: NAMES[index],
      dateShort,
      dateFull,
      working: plan.workDays.includes(index),
      isToday: date === todayIso,
      actual: total(entries, "gross"),
      miles: total(entries, "business_miles"),
      target: index < todayIndex ? baseline[index] : current[index]
    };
  });

  const selectedIndex = dates.indexOf(selectedDate);
  const activeSelected =
    selectedIndex >= 0 ? days[selectedIndex] : days[todayIndex] || days[0];

  return {
    plan,
    rows,
    weekStart,
    dates,
    days,
    earned,
    miles,
    remaining,
    today: days[todayIndex] || {
      target: 0,
      actual: 0,
      miles: 0,
      working: false,
      date: todayIso
    },
    selectedDay: activeSelected
  };
}

async function load() {
  setStatus("SYNCING");
  const start = monday();
  const weekStart = localDateIso(start);
  const weekEnd = localDateIso(addDays(start, 6));

  const cachedPlan = normalisePlan(readCachedPlan(weekStart) || {});
  const cachedDays = readCachedDays(weekStart) || [];

  let plan = cachedPlan;
  let rows = cachedDays;
  let isOffline = false;

  try {
    const [planResult, daysResult] = await Promise.all([
      supabaseClient
        .from(WEEKLY_TARGETS)
        .select("week_start,target,work_days")
        .eq("week_start", weekStart)
        .maybeSingle(),
      supabaseClient
        .from(DAYS)
        .select("id,date,gross,business_miles")
        .gte("date", weekStart)
        .lte("date", weekEnd)
    ]);

    if (planResult.data) {
      plan = normalisePlan(planResult.data);
      writeCachedPlan(weekStart, plan);
    }
    if (daysResult.data) {
      rows = daysResult.data;
      writeCachedDays(weekStart, rows);
    }
    if (planResult.error || daysResult.error) {
      isOffline = true;
    }
  } catch (err) {
    console.warn("Network error during load, using local cache:", err);
    isOffline = true;
  }

  model = derive(plan, rows, start);
  render();
  publish();
  setStatus(isOffline ? "OFFLINE CACHE" : "SYNCED", isOffline ? "error" : "ready");
}

async function persistPlan(nextPlan) {
  if (!model) return;
  const week = localDateIso(model.weekStart);
  const plan = normalisePlan(nextPlan);

  writeCachedPlan(week, plan);
  model = derive(plan, model.rows, model.weekStart);
  render();
  publish();

  try {
    const { error } = await supabaseClient
      .from(WEEKLY_TARGETS)
      .upsert(
        {
          week_start: week,
          target: plan.target,
          work_days: plan.workDays,
          updated_at: new Date().toISOString()
        },
        { onConflict: "week_start" }
      );
    setStatus(error ? "SAVED LOCALLY" : "SYNCED", error ? "error" : "ready");
  } catch (err) {
    setStatus("SAVED LOCALLY", "error");
  }
}

export async function saveDayFigures(date, grossValue, milesValue) {
  if (!model) return;
  const gross = Math.max(0, Math.round(asNumber(grossValue) * 100) / 100);
  const miles = Math.max(0, Math.round(asNumber(milesValue) * 10) / 10);

  const prevEarned = model.earned;
  const entries = dailyRows(model.rows, date);
  const weekStartStr = localDateIso(model.weekStart);

  let updatedRows;
  let targetRowId = null;

  if (entries.length > 0) {
    targetRowId = entries[0].id;
    const otherGross = total(entries.slice(1), "gross");
    const otherMiles = total(entries.slice(1), "business_miles");
    const firstGross = Math.max(0, gross - otherGross);
    const firstMiles = Math.max(0, miles - otherMiles);

    updatedRows = model.rows.map((r) =>
      r.id === targetRowId
        ? { ...r, gross: firstGross, business_miles: firstMiles }
        : r
    );
  } else {
    targetRowId = "local_" + Date.now();
    const newRow = {
      id: targetRowId,
      date,
      gross,
      business_miles: miles
    };
    updatedRows = [...model.rows, newRow];
  }

  model.rows = updatedRows;
  writeCachedDays(weekStartStr, model.rows);
  model = derive(model.plan, model.rows, model.weekStart);
  render();
  publish();

  // Check celebrations
  const newEarned = model.earned;
  const prevBlocks = Math.floor(prevEarned / 50);
  const newBlocks = Math.floor(newEarned / 50);
  if (newBlocks > prevBlocks) {
    celebrate(`£50 BLOCK BANKED! (${newBlocks * 50} / £${model.plan.target})`);
  } else if (
    model.selectedDay.target > 0 &&
    model.selectedDay.actual >= model.selectedDay.target
  ) {
    celebrate("DAILY TARGET CLEARED!");
  } else if (newEarned >= model.plan.target && prevEarned < model.plan.target) {
    celebrate("WEEKLY TARGET ACHIEVED! 🎉");
  }

  // Persist to Supabase
  try {
    if (entries.length > 0) {
      const firstGross = Math.max(0, gross - total(entries.slice(1), "gross"));
      const firstMiles = Math.max(
        0,
        miles - total(entries.slice(1), "business_miles")
      );
      const { error } = await supabaseClient
        .from(DAYS)
        .update({ gross: firstGross, business_miles: firstMiles })
        .eq("id", targetRowId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseClient
        .from(DAYS)
        .insert([{ date, gross, business_miles: miles }])
        .select("id,date,gross,business_miles")
        .single();
      if (error) throw error;
      if (data) {
        model.rows = model.rows.map((r) => (r.id === targetRowId ? data : r));
        writeCachedDays(weekStartStr, model.rows);
      }
    }
    setStatus("SYNCED", "ready");
  } catch (err) {
    console.warn("Supabase update failed, kept locally:", err);
    setStatus("SAVED LOCALLY", "error");
  }
}

function publish() {
  if (!model) return;
  const day = model.today;
  publishShiftState({
    date: localDateIso(),
    shiftActive: day.working,
    hasActiveShift: day.working,
    dailyTarget: day.target,
    todayEarnings: day.actual,
    weeklyTarget: model.plan.target,
    weeklyEarnings: model.earned,
    businessMilesToday: day.miles,
    businessMilesWeek: model.miles
  });
}

function celebrate(message) {
  const node = $("celebration");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(celebrationTimer);
  celebrationTimer = window.setTimeout(() => node.classList.remove("show"), 2800);
}

function render() {
  if (!model) return;
  const { plan, days, earned, remaining, miles, selectedDay } = model;
  const todayIso = localDateIso();

  // Weekly Target
  const weeklyTargetEl = $("weekly-target");
  if (weeklyTargetEl) weeklyTargetEl.textContent = money(plan.target);

  // Week Summary
  const weekEarnedEl = $("week-earned");
  if (weekEarnedEl) {
    weekEarnedEl.innerHTML = `${money(earned)} <span>/ ${money(plan.target)}</span>`;
  }
  const weekRemainingEl = $("week-remaining");
  if (weekRemainingEl) weekRemainingEl.textContent = money(remaining);

  const weekMilesEl = $("week-miles");
  if (weekMilesEl) weekMilesEl.textContent = miles.toFixed(1);

  // £50 Blocks
  const blockCount = Math.max(1, Math.ceil(plan.target / 50));
  const weekBlocksEl = $("week-blocks");
  if (weekBlocksEl) {
    weekBlocksEl.innerHTML = Array.from(
      { length: blockCount },
      (_, index) =>
        `<i class="${earned >= (index + 1) * 50 ? "filled" : ""}"></i>`
    ).join("");
  }
  const blockStatusEl = $("block-status");
  if (blockStatusEl) {
    const bankedCount = Math.floor(earned / 50);
    blockStatusEl.textContent =
      earned >= plan.target
        ? "WEEKLY TARGET ACHIEVED 🎉"
        : `${bankedCount} BLOCK${bankedCount === 1 ? "" : "S"} BANKED (${money(bankedCount * 50)})`;
  }

  // Day Tiles
  const dayTilesEl = $("day-tiles");
  if (dayTilesEl) {
    dayTilesEl.innerHTML = days
      .map((day) => {
        const isCurrentSelected = day.date === selectedDay.date;
        const isToday = day.date === todayIso;
        let classes = ["day-tile"];
        if (isToday) classes.push("today");
        if (isCurrentSelected) classes.push("selected");
        if (!day.working) classes.push("off");

        const targetText = day.working ? money(day.target) : "DAY OFF";
        const actualText = day.actual > 0 ? `${money(day.actual)} actual` : "";
        const milesText = day.miles > 0 ? `${day.miles.toFixed(1)} mi` : "";
        const stateText = !day.working
          ? "DAY OFF"
          : day.target > 0 && day.actual >= day.target
          ? "TARGET HIT"
          : "WORKING";

        return `
          <div class="${classes.join(" ")}" data-select-day="${day.index}" role="button" tabindex="0" aria-label="${day.label} ${day.dateShort}">
            <div class="day-tile__header">
              <div>
                <span class="day-tile__day">${day.label}</span>
                <span class="day-tile__date">${day.dateShort}</span>
              </div>
              <button type="button" class="day-toggle-btn" data-toggle-day="${day.index}" title="Toggle working day">
                ${day.working ? "ON" : "OFF"}
              </button>
            </div>
            <strong class="day-tile__target">${targetText}</strong>
            <span class="day-tile__actual">${actualText}</span>
            <span class="day-tile__miles">${milesText}</span>
            <span class="day-tile__state">${stateText}</span>
          </div>
        `;
      })
      .join("");
  }

  // Day Earnings Editor Card
  const isEditingToday = selectedDay.date === todayIso;
  const editorEyebrow = $("editor-eyebrow");
  if (editorEyebrow) {
    editorEyebrow.textContent = isEditingToday
      ? "TODAY'S EARNINGS"
      : `SELECTED DAY (${selectedDay.label} ${selectedDay.dateShort})`;
  }

  const editorTitle = $("editor-title");
  if (editorTitle) {
    editorTitle.textContent = `${selectedDay.dateFull}${isEditingToday ? " (Today)" : ""}`;
  }

  const btnReturnToday = $("btn-return-today");
  if (btnReturnToday) {
    btnReturnToday.style.display = isEditingToday ? "none" : "inline-block";
  }

  const editorEarned = $("editor-earned");
  if (editorEarned) editorEarned.textContent = money(selectedDay.actual);

  const editorTarget = $("editor-target");
  if (editorTarget) editorTarget.textContent = money(selectedDay.target);

  const editorRemaining = $("editor-remaining");
  if (editorRemaining) {
    editorRemaining.textContent = selectedDay.working
      ? money(Math.max(0, selectedDay.target - selectedDay.actual))
      : "DAY OFF";
  }

  const editorMiles = $("editor-miles");
  if (editorMiles) editorMiles.textContent = selectedDay.miles.toFixed(1);

  const isCleared =
    selectedDay.target > 0 && selectedDay.actual >= selectedDay.target;
  const editorStatus = $("editor-status");
  if (editorStatus) {
    editorStatus.textContent = isCleared
      ? "TARGET CLEARED"
      : selectedDay.working
      ? "WORKING"
      : "DAY OFF";
  }

  const editorProgressBar = $("editor-progress-bar");
  if (editorProgressBar) {
    const pct = selectedDay.target
      ? Math.min(100, (selectedDay.actual / selectedDay.target) * 100)
      : 0;
    editorProgressBar.style.width = `${pct}%`;
  }

  // Form Inputs (don't overwrite if user is currently typing)
  const inputGross = $("input-gross");
  if (inputGross && document.activeElement !== inputGross) {
    inputGross.value = selectedDay.actual > 0 ? selectedDay.actual.toFixed(2) : "";
  }

  const inputMiles = $("input-miles");
  if (inputMiles && document.activeElement !== inputMiles) {
    inputMiles.value = selectedDay.miles > 0 ? selectedDay.miles.toFixed(1) : "";
  }
}

async function consumeRequests() {
  if (!model) return;
  const sync = readSyncTotalRequest();
  const mileage = readMileageRequest();

  try {
    if (sync && sync.date === localDateIso()) {
      const currentMiles = model.today.miles;
      await saveDayFigures(sync.date, sync.total, currentMiles);
      clearSyncTotalRequest();
    }
    if (mileage && mileage.date === localDateIso()) {
      const currentGross = model.today.actual;
      await saveDayFigures(mileage.date, currentGross, mileage.miles);
      clearMileageRequest();
    }
  } catch (error) {
    setStatus("SYNC FAILED", "error");
    console.error(error);
  }
}

// Global Event Listeners
document.addEventListener("click", async (event) => {
  if (!model) return;

  // 1. Weekly Target adjustments (+/- buttons)
  const targetBtn = event.target.closest("[data-target-change]");
  if (targetBtn) {
    const delta = asNumber(targetBtn.dataset.targetChange);
    persistPlan({
      ...model.plan,
      target: Math.max(0, model.plan.target + delta)
    });
    return;
  }

  // 2. Custom weekly target tap
  const targetOutput = event.target.closest("#weekly-target");
  if (targetOutput) {
    const custom = window.prompt(
      "Enter weekly target (£):",
      String(model.plan.target)
    );
    if (custom !== null) {
      const parsed = Math.max(0, asNumber(custom));
      if (parsed > 0) {
        persistPlan({ ...model.plan, target: parsed });
      }
    }
    return;
  }

  // 3. Day Toggle (Work day ON/OFF)
  const toggleBtn = event.target.closest("[data-toggle-day]");
  if (toggleBtn) {
    event.stopPropagation();
    const dayIndex = Number(toggleBtn.dataset.toggleDay);
    const workDays = model.plan.workDays.includes(dayIndex)
      ? model.plan.workDays.filter((d) => d !== dayIndex)
      : [...model.plan.workDays, dayIndex].sort();
    persistPlan({ ...model.plan, workDays });
    return;
  }

  // 4. Day Select (tap tile to edit that day)
  const selectTile = event.target.closest("[data-select-day]");
  if (selectTile) {
    const dayIndex = Number(selectTile.dataset.selectDay);
    const dayObj = model.days[dayIndex];
    if (dayObj) {
      selectedDate = dayObj.date;
      model = derive(model.plan, model.rows, model.weekStart);
      render();
    }
    return;
  }

  // 5. Return to Today
  const returnTodayBtn = event.target.closest("#btn-return-today");
  if (returnTodayBtn) {
    selectedDate = localDateIso();
    model = derive(model.plan, model.rows, model.weekStart);
    render();
    return;
  }

  // 6. Quick Gross Add Buttons (+£5, +£10, +£20, +£50)
  const addGrossBtn = event.target.closest("[data-add-gross]");
  if (addGrossBtn) {
    const delta = asNumber(addGrossBtn.dataset.addGross);
    const inputGross = $("input-gross");
    const inputMiles = $("input-miles");
    const currentGross = model.selectedDay.actual;
    const newGross = currentGross + delta;
    const milesVal = inputMiles && inputMiles.value !== ""
      ? asNumber(inputMiles.value)
      : model.selectedDay.miles;

    if (inputGross) inputGross.value = newGross.toFixed(2);
    await saveDayFigures(selectedDate, newGross, milesVal);
    return;
  }

  // 7. Quick Miles Add Buttons (+5 mi, +10 mi, +20 mi)
  const addMilesBtn = event.target.closest("[data-add-miles]");
  if (addMilesBtn) {
    const delta = asNumber(addMilesBtn.dataset.addMiles);
    const inputGross = $("input-gross");
    const inputMiles = $("input-miles");
    const currentMiles = model.selectedDay.miles;
    const newMiles = currentMiles + delta;
    const grossVal = inputGross && inputGross.value !== ""
      ? asNumber(inputGross.value)
      : model.selectedDay.actual;

    if (inputMiles) inputMiles.value = newMiles.toFixed(1);
    await saveDayFigures(selectedDate, grossVal, newMiles);
    return;
  }

  // 8. Save Day Earnings Button
  const saveDayBtn = event.target.closest("#btn-save-day");
  if (saveDayBtn) {
    const inputGross = $("input-gross");
    const inputMiles = $("input-miles");
    const grossVal = inputGross ? asNumber(inputGross.value) : model.selectedDay.actual;
    const milesVal = inputMiles ? asNumber(inputMiles.value) : model.selectedDay.miles;

    saveDayBtn.textContent = "Saving...";
    await saveDayFigures(selectedDate, grossVal, milesVal);
    saveDayBtn.textContent = "Saved!";
    setTimeout(() => {
      if ($("btn-save-day")) $("btn-save-day").textContent = "Save Day Earnings";
    }, 1200);
    return;
  }

  // 9. Reset Day Button
  const resetDayBtn = event.target.closest("#btn-reset-day");
  if (resetDayBtn) {
    const confirmed = window.confirm(
      `Reset earnings and miles for ${model.selectedDay.label} ${model.selectedDay.dateShort} to £0?`
    );
    if (confirmed) {
      const inputGross = $("input-gross");
      const inputMiles = $("input-miles");
      if (inputGross) inputGross.value = "";
      if (inputMiles) inputMiles.value = "";
      await saveDayFigures(selectedDate, 0, 0);
    }
    return;
  }
});

// Save on form Enter key
document.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" && event.target && event.target.classList.contains("editor-input")) {
    event.preventDefault();
    const inputGross = $("input-gross");
    const inputMiles = $("input-miles");
    const grossVal = inputGross ? asNumber(inputGross.value) : model.selectedDay.actual;
    const milesVal = inputMiles ? asNumber(inputMiles.value) : model.selectedDay.miles;
    await saveDayFigures(selectedDate, grossVal, milesVal);
    event.target.blur();
  }
});

window.addEventListener("storage", () => consumeRequests());
window.addEventListener("focus", () => {
  load().then(consumeRequests);
});

await load();
await consumeRequests();
