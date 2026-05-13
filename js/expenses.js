import { supabaseClient } from "./supabase.js";
import {
  sendToGoogleSheets,
  buildExpenseSheetPayload,
} from "./googleSheets.js";
import { showStatus } from "./status.js";
import { loadMonthSummary } from "./monthly.js";

const ids = {
  date: "expense_date",
  amount: "expense_amount",
  notes: "expense_notes",
  category: "expense_category",
  saveBtn: "save_expense",
  list: "expenseList",
};

let currentExpenses = [];

function el(id) {
  return document.getElementById(id);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeValue(value) {
  return value ?? "-";
}

function todayIso() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function setDefaultExpenseDate() {
  const date = el(ids.date);
  if (date && !date.value) date.value = todayIso();
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return `£${number.toFixed(2)}`;
}

function buildExpensePayload() {
  const categorySelect = el(ids.category);

  return {
    date: el(ids.date)?.value?.trim() || "",
    amount: toNumber(el(ids.amount)?.value),
    notes: el(ids.notes)?.value?.trim() || "",
    category_id: toNumber(categorySelect?.value),
    category: categorySelect?.selectedOptions?.[0]?.textContent?.trim() || "",
  };
}

function validateExpense(payload) {
  if (!payload.date) return "Please enter an expense date.";
  if (payload.amount === null) return "Please enter an expense amount.";
  if (!payload.category_id) return "Please select an expense category.";
  return null;
}

function clearExpenseForm() {
  [ids.amount, ids.notes].forEach((id) => {
    const node = el(id);
    if (node) node.value = "";
  });

  const category = el(ids.category);
  if (category) category.value = "";

  setDefaultExpenseDate();
}

export async function loadExpenseCategories() {
  const select = el(ids.category);

  console.log("expense category select found:", !!select, select);

  if (!select) {
    console.error(`Expense category select not found: #${ids.category}`);
    showStatus("Expense category dropdown not found in page.", "error", false);
    return [];
  }

  const { data, error } = await supabaseClient
    .from("expense_categories")
    .select("id, name, active")
    .eq("active", true)
    .order("name", { ascending: true });

  console.log("loadExpenseCategories result:", data, error);

  if (error) {
    console.error("Error loading expense categories:", error);
    showStatus(`Unable to load expense categories: ${error.message}`, "error", false);
    select.innerHTML = `<option value="">Select category</option>`;
    return [];
  }

  const categories = data || [];

  select.innerHTML = `
    <option value="">Select category</option>
    ${categories
      .map(
        (category) =>
          `<option value="${category.id}">${escapeHtml(category.name)}</option>`
      )
      .join("")}
  `;

  console.log("expense category options rendered:", categories.length);

  return categories;
}

function renderExpenseHistory(items) {
  const container = el(ids.list);
  if (!container) return;

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = `<div class="history-empty">No expenses saved yet.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="history-grid">
      ${items
        .map(
          (item) => `
            <div class="history-card">
              <div class="history-card__header">
                <div class="history-card__title">${escapeHtml(safeValue(item.date))}</div>
                <div class="history-card__actions">
                  <div class="history-card__pill">Expense</div>
                  <button
                    type="button"
                    class="history-card__delete"
                    data-delete-expense="${escapeHtml(item.id)}"
                    aria-label="Delete expense for ${escapeHtml(safeValue(item.date))}"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div class="history-card__grid history-card__grid--3x2">
                <div class="history-item">
                  <span class="history-item__label">Category</span>
                  <span class="history-item__value">${escapeHtml(
                    safeValue(item.expense_categories?.name || item.category || "-")
                  )}</span>
                </div>

                <div class="history-item">
                  <span class="history-item__label">Amount</span>
                  <span class="history-item__value history-item__value--strong">${escapeHtml(
                    formatCurrency(item.amount)
                  )}</span>
                </div>

                <div class="history-item">
                  <span class="history-item__label">Notes</span>
                  <span class="history-item__value">${escapeHtml(safeValue(item.notes))}</span>
                </div>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

async function deleteExpense(expenseId, button) {
  const item = currentExpenses.find((expense) => String(expense.id) === String(expenseId));
  const label = item ? `${safeValue(item.date)} (${formatCurrency(item.amount)})` : "this expense";

  if (!window.confirm(`Delete ${label}?`)) return;

  try {
    if (button) button.disabled = true;
    showStatus("Deleting expense...", "info", false);

    const { error } = await supabaseClient
      .from("expenses")
      .delete()
      .eq("id", expenseId);

    if (error) {
      console.error("Error deleting expense:", error);
      showStatus(`Failed to delete expense: ${error.message}`, "error", false);
      return;
    }

    showStatus("Expense deleted.", "success");
    await loadExpenses();
    await loadMonthSummary();
  } catch (err) {
    console.error("Unexpected expense delete error:", err);
    showStatus("Unexpected error while deleting expense.", "error", false);
  } finally {
    if (button) button.disabled = false;
  }
}

export async function loadExpenses() {
  const { data, error } = await supabaseClient
    .from("expenses")
    .select(`
      *,
      expense_categories(name)
    `)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  console.log("loadExpenses result:", data, error);

  if (error) {
    console.error("Error loading expenses:", error);
    const container = el(ids.list);
    if (container) {
      container.innerHTML = `<div class="error-state">Unable to load expenses.</div>`;
    }
    showStatus("Unable to load expenses.", "error", false);
    return [];
  }

  currentExpenses = data || [];
  renderExpenseHistory(currentExpenses);
  return currentExpenses;
}

export async function saveExpense() {
  const saveBtn = el(ids.saveBtn);

  try {
    if (saveBtn) saveBtn.disabled = true;

    showStatus("Saving expense...", "info", false);

    const payload = buildExpensePayload();
    console.log("expense payload:", payload);

    const validationError = validateExpense(payload);
    if (validationError) {
      showStatus(validationError, "error");
      return;
    }

    const supabasePayload = {
      date: payload.date,
      amount: payload.amount,
      notes: payload.notes,
      category_id: payload.category_id,
    };

    const { data, error } = await supabaseClient
      .from("expenses")
      .insert([supabasePayload])
      .select(`
        *,
        expense_categories(name)
      `)
      .single();

    if (error) {
      console.error("Error saving expense:", error);
      showStatus(`Failed to save expense: ${error.message}`, "error", false);
      return;
    }

    try {
      showStatus("Expense saved. Syncing to Google Sheets...", "info", false);

      const sheetPayload = buildExpenseSheetPayload({
        ...data,
        category: data?.expense_categories?.name || payload.category || "",
      });

      console.log("Sending expense to Google Sheets:", sheetPayload);

      const syncResult = await sendToGoogleSheets("expense", sheetPayload);
      console.log("Google Sheets expense sync result:", syncResult);

      showStatus("Expense saved and synced successfully.", "success");
    } catch (syncError) {
      console.error("Google Sheets expense sync failed:", syncError);
      showStatus("Expense saved, but Google Sheets sync failed.", "error", false);
    }

    clearExpenseForm();
    await loadExpenseCategories();
    await loadExpenses();
  } catch (err) {
    console.error("Unexpected expense save error:", err);
    showStatus("Unexpected error while saving expense.", "error", false);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindExpenseEvents() {
  const form = document.getElementById("expense-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveExpense();
    });
  }

  const saveBtn = el(ids.saveBtn);
  if (saveBtn) {
    saveBtn.setAttribute("type", "submit");
  }

  el(ids.list)?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-expense]");
    if (!button) return;

    await deleteExpense(button.dataset.deleteExpense, button);
  });
}

export async function initExpenses() {
  console.log("initExpenses called");
  setDefaultExpenseDate();
  bindExpenseEvents();
  await loadExpenseCategories();
  await loadExpenses();
}
