import { supabaseClient } from "./supabase.js";
import { showStatus } from "./status.js";

const STORAGE_PREFIX = "uberEngineCashflow";
const CASHFLOW_MONTHS_TABLE = "cashflow_months";
const DEFAULT_WORKSPACE_MONTH = "2026-04";

const DEFAULT_FIXED_TEMPLATE = [
  { id: "home_mortgage", name: "Home mortgage", category: "Home", day: 1, amount: 833, frequency: "monthly", notes: "" },
  { id: "council_tax", name: "Council tax", category: "Home", day: 2, amount: 134, frequency: "monthly", notes: "" },
  { id: "tesla_finance", name: "Tesla finance", category: "Vehicle", day: 3, amount: 450, frequency: "monthly", notes: "" },
  { id: "octopus_energy", name: "Octopus Energy", category: "Utilities", day: 5, amount: 315, frequency: "monthly", notes: "" },
  { id: "vehicle_insurance", name: "Vehicle insurance", category: "Vehicle", day: 7, amount: 350, frequency: "monthly", notes: "" },
  { id: "mbna", name: "MBNA", category: "Credit", day: 10, amount: 200, frequency: "monthly", notes: "" }
];

const DEFAULT_INCOME_ROWS = [
  { id: "pension", source: "Pension", gross: 691.25, costs: 0 },
  { id: "properties", source: "Properties", gross: 2850, costs: 1545 },
  { id: "uber", source: "Uber", gross: 3585.08, costs: 747.32 }
];

const DEFAULT_SPENDING_ITEMS = [
  { id: "property_repairs", date: "2026-04-04", description: "Property repairs", category: "Property", plannedAmount: 300, actualAmount: 120, status: "part_paid" },
  { id: "court_fee", date: "2026-04-08", description: "Court fee", category: "Legal", plannedAmount: 415, actualAmount: 415, status: "paid" },
  { id: "bmw_refurbishment", date: "", description: "BMW refurbishment", category: "Vehicle", plannedAmount: 600, actualAmount: "", status: "planned" },
  { id: "groceries", date: "2026-04-12", description: "Groceries", category: "Living", plannedAmount: "", actualAmount: 62, status: "unplanned" }
];

const ids = {
  prevMonth: "cashflow_prev_month",
  nextMonth: "cashflow_next_month",
  monthTitle: "cashflow_month_title",
  monthStatus: "cashflow_month_status",
  bankBalance: "cashflow_bank_balance",
  updateBalance: "cashflow_update_balance",
  position: "cashflow_position",
  dailyMessage: "cashflow_daily_message",
  editItem: "cashflow_edit_item",
  fixedSummary: "cashflow_fixed_summary",
  fixedList: "cashflow_fixed_list",
  spendingSummary: "cashflow_spending_summary",
  spendingForm: "cashflow_spending_form",
  spendingDesc: "cashflow_spending_desc",
  spendingCategory: "cashflow_spending_category",
  spendingDate: "cashflow_spending_date",
  spendingPlanned: "cashflow_spending_planned",
  spendingActual: "cashflow_spending_actual",
  spendingStatus: "cashflow_spending_status",
  spendingList: "cashflow_spending_list",
  reconcilePanel: "cashflow_reconcile_panel",
  payslipTitle: "cashflow_payslip_title",
  payslipNet: "cashflow_payslip_net",
  payslipTable: "cashflow_payslip_table",
  incomeForm: "cashflow_income_form",
  incomeSource: "cashflow_income_source",
  incomeGross: "cashflow_income_gross",
  incomeCosts: "cashflow_income_costs"
};

let activeMonth = DEFAULT_WORKSPACE_MONTH;
let selectedFixedId = "";
let cashflowRemoteAvailable = true;
let remoteUnavailableNotified = false;
const monthStateCache = new Map();
let renderSequence = 0;

function el(id) {
  return document.getElementById(id);
}

function storageKey(name) {
  return `${STORAGE_PREFIX}:${name}`;
}

function monthStorageKey(month) {
  return storageKey(`month:${month}`);
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Unable to read ${key}`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value) {
  return `\u00a3${toNumber(value).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function todayIso() {
  return dateToIso(new Date());
}

function dateToIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthToInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(month) {
  const [year, monthNumber] = String(month || activeMonth).split("-").map(Number);
  return new Date(year, (monthNumber || 1) - 1, 1);
}

function addMonths(month, offset) {
  const date = parseMonth(month);
  date.setMonth(date.getMonth() + offset);
  return monthToInputValue(date);
}

function monthLabel(month) {
  return parseMonth(month).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric"
  });
}

function formatShortDate(dateString) {
  if (!dateString) return "\u2014";
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short"
  });
}

function dueDateForTemplate(month, item) {
  const date = parseMonth(month);
  date.setDate(Math.min(28, Number(item.day || 1)));
  return dateToIso(date);
}

function getTemplate() {
  const template = readJson(storageKey("fixedTemplate"), null);
  if (Array.isArray(template) && template.length) return template;
  writeJson(storageKey("fixedTemplate"), DEFAULT_FIXED_TEMPLATE);
  return DEFAULT_FIXED_TEMPLATE;
}

function buildMonthFromTemplate(month) {
  const isAprilBriefMonth = month === DEFAULT_WORKSPACE_MONTH;
  return {
    month,
    workspaceVersion: 2,
    bankBalance: isAprilBriefMonth ? 3820 : 0,
    lastBalanceUpdate: "",
    fixedPayments: getTemplate().map((item, index) => {
      const paid = isAprilBriefMonth && index < 3;
      return {
        ...item,
        dueDate: dueDateForTemplate(month, item),
        expectedAmount: Number(item.amount || 0),
        actualDate: paid ? dueDateForTemplate(month, item) : "",
        actualAmount: paid ? Number(item.amount || 0) : "",
        status: paid ? "paid" : "expected"
      };
    }),
    spending: isAprilBriefMonth ? DEFAULT_SPENDING_ITEMS : [],
    incomeRows: DEFAULT_INCOME_ROWS,
    lastReviewed: todayIso(),
    nextReview: dueDateForTemplate(addMonths(month, 1), { day: 1 })
  };
}

function normaliseMonthState(month, saved) {
  if (month === DEFAULT_WORKSPACE_MONTH && (!saved || saved.workspaceVersion !== 2)) {
    return buildMonthFromTemplate(month);
  }

  return {
    ...buildMonthFromTemplate(month),
    ...saved,
    month,
    fixedPayments: Array.isArray(saved?.fixedPayments) ? saved.fixedPayments : [],
    spending: Array.isArray(saved?.spending) ? saved.spending : [],
    incomeRows: Array.isArray(saved?.incomeRows) ? saved.incomeRows : DEFAULT_INCOME_ROWS
  };
}

function getLocalMonthState(month = activeMonth) {
  const saved = readJson(monthStorageKey(month), null);
  if (saved) return normaliseMonthState(month, saved);

  const next = buildMonthFromTemplate(month);
  writeJson(monthStorageKey(month), next);
  return next;
}

function saveLocalMonthState(state) {
  writeJson(monthStorageKey(state.month), state);
  monthStateCache.set(state.month, state);
}

function isCashflowTableMissing(error) {
  const message = String(error?.message || "");
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || /cashflow_months|schema cache|does not exist|relation/i.test(message);
}

function notifyRemoteFallback(error) {
  cashflowRemoteAvailable = false;
  if (remoteUnavailableNotified) return;
  remoteUnavailableNotified = true;
  console.warn("Cashflow Supabase table is unavailable; using local browser storage.", error);
  showStatus("Cashflow is using local storage until the database table is applied.", "info");
}

async function loadRemoteMonthState(month) {
  if (!cashflowRemoteAvailable) return null;

  const { data, error } = await supabaseClient
    .from(CASHFLOW_MONTHS_TABLE)
    .select("state")
    .eq("month", month)
    .maybeSingle();

  if (error) {
    if (isCashflowTableMissing(error)) {
      notifyRemoteFallback(error);
      return null;
    }
    throw error;
  }

  return data?.state ? normaliseMonthState(month, data.state) : null;
}

async function saveRemoteMonthState(state) {
  if (!cashflowRemoteAvailable) return false;

  const { error } = await supabaseClient
    .from(CASHFLOW_MONTHS_TABLE)
    .upsert({
      month: state.month,
      state,
      updated_at: new Date().toISOString()
    }, {
      onConflict: "month"
    });

  if (error) {
    if (isCashflowTableMissing(error)) {
      notifyRemoteFallback(error);
      return false;
    }
    throw error;
  }

  return true;
}

async function getMonthState(month = activeMonth) {
  const cached = monthStateCache.get(month);
  if (cached) return cached;

  const localState = getLocalMonthState(month);

  try {
    const remoteState = await loadRemoteMonthState(month);
    const state = remoteState || localState;
    saveLocalMonthState(state);
    if (!remoteState) await saveRemoteMonthState(state);
    return state;
  } catch (error) {
    console.error("Unable to load cashflow month from Supabase:", error);
    showStatus("Cashflow database sync failed. Local copy is still available.", "warning");
    saveLocalMonthState(localState);
    return localState;
  }
}

async function saveMonthState(state) {
  saveLocalMonthState(state);

  try {
    const savedRemote = await saveRemoteMonthState(state);
    if (savedRemote) showStatus("Cashflow saved.", "success");
  } catch (error) {
    console.error("Unable to save cashflow month to Supabase:", error);
    showStatus("Cashflow saved locally. Database sync failed.", "warning");
  }
}

function paymentDisplayStatus(payment) {
  if (["paid", "skipped", "cancelled", "changed"].includes(payment.status)) return payment.status;
  const today = todayIso();
  if (payment.dueDate < today) return "overdue";
  if (payment.dueDate === today) return "due_today";
  const due = new Date(`${payment.dueDate}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  const daysAway = Math.round((due - now) / 86400000);
  if (daysAway <= 3) return "due_soon";
  return "expected";
}

function statusLabel(status) {
  return {
    expected: "Expected",
    due_soon: "Due soon",
    due_today: "Due today",
    paid: "Paid",
    overdue: "Overdue",
    changed: "Changed",
    skipped: "Skipped",
    cancelled: "Cancelled",
    planned: "Planned",
    part_paid: "Part-paid",
    unplanned: "Unplanned"
  }[status] || "Expected";
}

function isFixedUnpaid(payment) {
  return !["paid", "changed", "skipped", "cancelled"].includes(payment.status);
}

function isSpendingOutstanding(item) {
  return item.status === "planned";
}

function calculateState(state) {
  const fixedUnpaid = state.fixedPayments
    .filter(isFixedUnpaid)
    .reduce((sum, item) => sum + toNumber(item.expectedAmount), 0);
  const plannedOutstanding = state.spending
    .filter(isSpendingOutstanding)
    .reduce((sum, item) => {
      const planned = toNumber(item.plannedAmount);
      const actual = toNumber(item.actualAmount);
      return sum + Math.max(0, planned - actual);
    }, 0);
  const actualUnplanned = state.spending
    .filter((item) => item.status === "unplanned")
    .reduce((sum, item) => sum + toNumber(item.actualAmount), 0);
  const paidFixed = state.fixedPayments.filter((item) => ["paid", "changed"].includes(item.status));
  const paidFixedTotal = paidFixed.reduce((sum, item) => sum + toNumber(item.actualAmount || item.expectedAmount), 0);
  const fixedTotal = state.fixedPayments.reduce((sum, item) => sum + toNumber(item.expectedAmount), 0);
  const incomeNet = state.incomeRows.reduce((sum, item) => sum + Math.max(0, toNumber(item.gross) - toNumber(item.costs)), 0);
  const paidPlanned = state.spending
    .filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + toNumber(item.actualAmount || item.plannedAmount), 0);
  const monthEndRemainder = incomeNet - fixedTotal - plannedOutstanding - paidPlanned - actualUnplanned;

  return {
    fixedUnpaid,
    plannedOutstanding,
    safeAvailable: toNumber(state.bankBalance) - fixedUnpaid - plannedOutstanding,
    fixedTotal,
    paidFixedTotal,
    paidFixedCount: paidFixed.length,
    remainingFixedCount: state.fixedPayments.filter(isFixedUnpaid).length,
    incomeNet,
    paidPlanned,
    actualUnplanned,
    monthEndRemainder
  };
}

function renderPosition(state, totals) {
  const node = el(ids.position);
  if (!node) return;

  node.innerHTML = `
    <div class="cashflow-position-card">
      <span>Current Bank Balance</span>
      <strong>${formatMoney(state.bankBalance)}</strong>
    </div>
    <div class="cashflow-position-card">
      <span>Fixed Costs Still To Leave</span>
      <strong>${formatMoney(totals.fixedUnpaid)}</strong>
    </div>
    <div class="cashflow-position-card">
      <span>Planned Expenditure Still To Leave</span>
      <strong>${formatMoney(totals.plannedOutstanding)}</strong>
    </div>
    <div class="cashflow-position-card cashflow-position-card--safe">
      <span>Safe Available</span>
      <strong>${formatMoney(totals.safeAvailable)}</strong>
    </div>
  `;
}

function renderDailyMessage(state, totals) {
  const node = el(ids.dailyMessage);
  if (!node) return;
  const dayOfMonth = new Date().getDate();

  if (dayOfMonth <= 15 && totals.remainingFixedCount > 0) {
    node.innerHTML = `
      <strong>Payments to check</strong>
      <span>${totals.paidFixedCount} paid · ${totals.remainingFixedCount} remaining · ${formatMoney(totals.fixedUnpaid)} still to leave</span>
    `;
    return;
  }

  node.innerHTML = `
    <strong>Rest of ${escapeHtml(monthLabel(state.month).split(" ")[0])}</strong>
    <span>Safe available ${formatMoney(totals.safeAvailable)} · planned purchases remaining ${formatMoney(totals.plannedOutstanding)} · forecast remainder ${formatMoney(totals.monthEndRemainder)}</span>
  `;
}

function renderFixedCosts(state, totals) {
  const summary = el(ids.fixedSummary);
  const list = el(ids.fixedList);
  if (summary) {
    summary.textContent = `${totals.paidFixedCount} of ${state.fixedPayments.length} payments cleared · ${formatMoney(totals.paidFixedTotal)} paid · ${formatMoney(totals.fixedUnpaid)} still to leave`;
  }
  if (!list) return;

  const rows = state.fixedPayments
    .slice()
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .map((payment) => {
      const displayStatus = paymentDisplayStatus(payment);
      const checked = !isFixedUnpaid(payment);
      return `
        <div class="cashflow-table-row cashflow-table-row--${escapeHtml(displayStatus)}">
          <span>${escapeHtml(formatShortDate(payment.dueDate))}</span>
          <button type="button" class="cashflow-table-link" data-fixed-select="${escapeHtml(payment.id)}">${escapeHtml(payment.name)}</button>
          <span>${formatMoney(payment.expectedAmount)}</span>
          <span>${payment.actualAmount === "" ? "&mdash;" : formatMoney(payment.actualAmount)}</span>
          <span>${escapeHtml(statusLabel(displayStatus))}</span>
          <label class="cashflow-check">
            <input type="checkbox" data-fixed-check="${escapeHtml(payment.id)}" ${checked ? "checked" : ""}>
            <span class="sr-only">Mark ${escapeHtml(payment.name)} paid</span>
          </label>
        </div>
      `;
    }).join("");

  list.innerHTML = `
    <div class="cashflow-table cashflow-table--fixed">
      <div class="cashflow-table-row cashflow-table-row--head">
        <span>Due</span>
        <span>Payment</span>
        <span>Expected</span>
        <span>Actual</span>
        <span>Status</span>
        <span>Paid</span>
      </div>
      ${rows}
    </div>
  `;
}

function renderReconcilePanel(state) {
  const node = el(ids.reconcilePanel);
  if (!node) return;
  const payment = state.fixedPayments.find((item) => item.id === selectedFixedId);

  if (!payment) {
    node.innerHTML = "";
    return;
  }

  node.innerHTML = `
    <section class="card cashflow-reconcile-card">
      <h3>Confirm Payment</h3>
      <p>${escapeHtml(payment.name)} · expected ${formatMoney(payment.expectedAmount)} on ${escapeHtml(payment.dueDate)}</p>
      <div class="form-row-2">
        <div class="field">
          <label for="cashflow_actual_amount">Actual Amount (&pound;)</label>
          <input id="cashflow_actual_amount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(payment.actualAmount || payment.expectedAmount)}">
        </div>
        <div class="field">
          <label for="cashflow_actual_date">Actual Date</label>
          <input id="cashflow_actual_date" type="date" value="${escapeHtml(payment.actualDate || todayIso())}">
        </div>
      </div>
      <div class="form-row-2">
        <button class="btn-primary" type="button" data-fixed-action="confirm">Confirm Payment</button>
        <button class="btn-secondary" type="button" data-fixed-action="skip">Skip This Month</button>
      </div>
      <button class="btn-secondary" type="button" data-fixed-action="close">Close</button>
    </section>
  `;
}

function renderSpending(state, totals) {
  const summary = el(ids.spendingSummary);
  const list = el(ids.spendingList);
  if (summary) {
    summary.textContent = `${formatMoney(totals.plannedOutstanding)} planned outstanding`;
  }
  if (!list) return;

  if (!state.spending.length) {
    list.innerHTML = `<div class="cashflow-empty">No spending ledger items yet.</div>`;
    return;
  }

  const rows = state.spending
    .slice()
    .sort((a, b) => String(a.date || "9999-99-99").localeCompare(String(b.date || "9999-99-99")))
    .map((item) => {
      const planned = toNumber(item.plannedAmount);
      const actual = toNumber(item.actualAmount);
      return `
        <div class="cashflow-table-row cashflow-table-row--${escapeHtml(item.status)}">
          <span>${escapeHtml(formatShortDate(item.date))}</span>
          <span>${escapeHtml(item.description)}</span>
          <span>${escapeHtml(item.category || "General")}</span>
          <span>${planned > 0 ? formatMoney(planned) : "&mdash;"}</span>
          <span>${actual > 0 ? formatMoney(actual) : "&mdash;"}</span>
          <span>${escapeHtml(statusLabel(item.status))}</span>
        </div>
      `;
    }).join("");

  list.innerHTML = `
    <div class="cashflow-table cashflow-table--spending">
      <div class="cashflow-table-row cashflow-table-row--head">
        <span>Date</span>
        <span>Description</span>
        <span>Category</span>
        <span>Planned</span>
        <span>Actual</span>
        <span>Status</span>
      </div>
      ${rows}
    </div>
  `;
}

function renderPayslip(state) {
  const title = el(ids.payslipTitle);
  const netNode = el(ids.payslipNet);
  const table = el(ids.payslipTable);
  const totals = state.incomeRows.reduce((acc, row) => {
    acc.gross += toNumber(row.gross);
    acc.costs += toNumber(row.costs);
    return acc;
  }, { gross: 0, costs: 0 });
  const net = totals.gross - totals.costs;

  if (title) title.textContent = `${monthLabel(state.month)} Payslip`;
  if (netNode) {
    netNode.innerHTML = `<span>Net income available</span><strong>${formatMoney(net)}</strong>`;
  }
  if (!table) return;

  table.innerHTML = `
    <div class="cashflow-table cashflow-table--payslip">
    <div class="cashflow-table-row cashflow-table-row--head">
      <span>Income source</span>
      <span>Gross income</span>
      <span>Costs</span>
      <span>Net income</span>
    </div>
    ${state.incomeRows.map((row) => `
      <div class="cashflow-table-row">
        <span>${escapeHtml(row.source)}</span>
        <span>${formatMoney(row.gross)}</span>
        <span>${formatMoney(row.costs)}</span>
        <span>${formatMoney(toNumber(row.gross) - toNumber(row.costs))}</span>
      </div>
    `).join("")}
    <div class="cashflow-table-row cashflow-table-row--total">
      <span>Total</span>
      <span>${formatMoney(totals.gross)}</span>
      <span>${formatMoney(totals.costs)}</span>
      <span>${formatMoney(net)}</span>
    </div>
    </div>
  `;
}

async function renderCashflow() {
  const sequence = ++renderSequence;
  const state = await getMonthState();
  if (sequence !== renderSequence) return;
  const totals = calculateState(state);

  if (el(ids.monthTitle)) el(ids.monthTitle).textContent = monthLabel(state.month);
  if (el(ids.monthStatus)) {
    const current = monthToInputValue(new Date());
    el(ids.monthStatus).textContent = state.month === current ? "Current month" : state.month < current ? "Previous month" : "Future month";
  }
  if (el(ids.bankBalance)) el(ids.bankBalance).value = toNumber(state.bankBalance).toFixed(2);

  renderPosition(state, totals);
  renderDailyMessage(state, totals);
  renderFixedCosts(state, totals);
  renderSpending(state, totals);
  renderReconcilePanel(state);
  renderPayslip(state);
}

async function mutateMonth(mutator) {
  const state = await getMonthState();
  mutator(state);
  await saveMonthState(state);
  await renderCashflow();
}

function updateBalance() {
  mutateMonth((state) => {
    state.bankBalance = toNumber(el(ids.bankBalance)?.value);
    state.lastBalanceUpdate = todayIso();
  });
}

function addSpending(event) {
  event?.preventDefault();
  const description = String(el(ids.spendingDesc)?.value || "").trim();
  if (!description) return;

  mutateMonth((state) => {
    state.spending.push({
      id: `spend-${Date.now()}`,
      description,
      category: String(el(ids.spendingCategory)?.value || "").trim(),
      date: el(ids.spendingDate)?.value || "",
      plannedAmount: toNumber(el(ids.spendingPlanned)?.value),
      actualAmount: toNumber(el(ids.spendingActual)?.value),
      status: el(ids.spendingStatus)?.value || "planned"
    });
  });

  el(ids.spendingForm)?.reset();
  if (el(ids.spendingDate)) el(ids.spendingDate).value = todayIso();
}

function addIncome(event) {
  event?.preventDefault();
  const source = String(el(ids.incomeSource)?.value || "").trim();
  if (!source) return;

  mutateMonth((state) => {
    state.incomeRows.push({
      id: `income-${Date.now()}`,
      source,
      gross: toNumber(el(ids.incomeGross)?.value),
      costs: toNumber(el(ids.incomeCosts)?.value)
    });
  });

  el(ids.incomeForm)?.reset();
}

function handleFixedListClick(event) {
  const checkbox = event.target.closest("[data-fixed-check]");
  if (checkbox) {
    const paymentId = checkbox.dataset.fixedCheck;
    mutateMonth((state) => {
      const payment = state.fixedPayments.find((item) => item.id === paymentId);
      if (!payment) return;
      const actualAmount = toNumber(payment.actualAmount || payment.expectedAmount);

      if (checkbox.checked && isFixedUnpaid(payment)) {
        payment.actualAmount = actualAmount;
        payment.actualDate = todayIso();
        payment.status = actualAmount === toNumber(payment.expectedAmount) ? "paid" : "changed";
        state.bankBalance = Math.max(0, toNumber(state.bankBalance) - actualAmount);
      } else if (!checkbox.checked && !isFixedUnpaid(payment)) {
        state.bankBalance += actualAmount;
        payment.actualAmount = "";
        payment.actualDate = "";
        payment.status = "expected";
      }
    });
    return;
  }

  const button = event.target.closest("[data-fixed-select]");
  if (!button) return;
  selectedFixedId = button.dataset.fixedSelect;
  renderCashflow();
}

function handleReconcileClick(event) {
  const button = event.target.closest("[data-fixed-action]");
  if (!button) return;
  const action = button.dataset.fixedAction;

  if (action === "close") {
    selectedFixedId = "";
    renderCashflow();
    return;
  }

  mutateMonth((state) => {
    const payment = state.fixedPayments.find((item) => item.id === selectedFixedId);
    if (!payment) return;

    if (action === "confirm") {
      const wasUnpaid = isFixedUnpaid(payment);
      const previousActual = toNumber(payment.actualAmount || payment.expectedAmount);
      payment.actualAmount = toNumber(document.getElementById("cashflow_actual_amount")?.value || payment.expectedAmount);
      payment.actualDate = document.getElementById("cashflow_actual_date")?.value || todayIso();
      payment.status = payment.actualAmount === toNumber(payment.expectedAmount) ? "paid" : "changed";
      if (wasUnpaid) {
        state.bankBalance = Math.max(0, toNumber(state.bankBalance) - payment.actualAmount);
      } else {
        state.bankBalance = Math.max(0, toNumber(state.bankBalance) + previousActual - payment.actualAmount);
      }
    }

    if (action === "skip") {
      payment.status = "skipped";
      payment.actualAmount = 0;
      payment.actualDate = todayIso();
    }
  });
}

function initSubtabs() {
  const buttons = Array.from(document.querySelectorAll("[data-cashflow-panel]"));
  const panels = Array.from(document.querySelectorAll(".cashflow-panel"));

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.cashflowPanel;
      buttons.forEach((item) => item.classList.toggle("active", item === button));
      panels.forEach((panel) => panel.classList.toggle("active", panel.id === target));
    });
  });
}

function initQuickActions() {
  document.getElementById("cashflow_quick_spending")?.addEventListener("click", () => {
    el(ids.spendingDesc)?.focus();
    if (el(ids.spendingStatus)) el(ids.spendingStatus).value = "unplanned";
  });
  document.getElementById("cashflow_quick_planned")?.addEventListener("click", () => {
    el(ids.spendingDesc)?.focus();
    if (el(ids.spendingStatus)) el(ids.spendingStatus).value = "planned";
  });
  el(ids.editItem)?.addEventListener("click", () => {
    el(ids.spendingDesc)?.focus();
  });
}

export function initCashflow() {
  if (!document.getElementById("cashflow_tab")) return;

  if (el(ids.spendingDate)) el(ids.spendingDate).value = todayIso();

  el(ids.prevMonth)?.addEventListener("click", () => {
    activeMonth = addMonths(activeMonth, -1);
    selectedFixedId = "";
    renderCashflow();
  });
  el(ids.nextMonth)?.addEventListener("click", () => {
    activeMonth = addMonths(activeMonth, 1);
    selectedFixedId = "";
    renderCashflow();
  });
  el(ids.updateBalance)?.addEventListener("click", updateBalance);
  el(ids.spendingForm)?.addEventListener("submit", addSpending);
  el(ids.incomeForm)?.addEventListener("submit", addIncome);
  el(ids.fixedList)?.addEventListener("click", handleFixedListClick);
  el(ids.reconcilePanel)?.addEventListener("click", handleReconcileClick);

  initSubtabs();
  initQuickActions();
  renderCashflow();
}
