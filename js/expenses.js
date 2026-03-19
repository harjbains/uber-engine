import { supabaseClient } from "./supabase.js";

export function initExpenses() {
  document.getElementById("expense-form")
    ?.addEventListener("submit", saveExpense);

    loadExpenseCategories();
    loadExpenses();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function loadExpenses() {
  const expenseHistory = document.getElementById("expense-history");
  if (!expenseHistory) return;

  try {
    const { data, error } = await supabaseClient
  .from("expenses")
  .select(`
    *,
    expense_categories (
      id,
      name
    )
  `)
  .order("date", { ascending: false })
  .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading expenses:", error);
      expenseHistory.innerHTML = `<div class="history-empty">Unable to load expenses.</div>`;
      return;
    }

    const expenses = data || [];

    const safeValue = (value) =>
      value !== null && value !== undefined && value !== "" ? value : "-";

    const formatCurrency = (value) => {
      const number = Number(value || 0);
      return `£${number.toFixed(2)}`;
    };

    expenseHistory.innerHTML = expenses.length
      ? `
        <div class="history-grid">
          ${expenses.map((expense) => `
            <div class="history-card">
              <div class="history-card__header">
                <div class="history-card__title">${safeValue(expense.date)}</div>
                <div class="history-card__pill">${safeValue(expense.expense_categories?.name || "Expense")}</div>
              </div>

              <div class="history-card__grid">
                <div class="history-item history-item--full">
                  <span class="history-item__label">Amount & Notes</span>
                  <div class="history-inline">
                    <div class="history-inline__left history-item__value">
                      ${safeValue(expense.notes)}
                    </div>
                    <div class="history-inline__right">
                      ${formatCurrency(expense.amount)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      `
      : `<div class="history-empty">No expenses logged yet.</div>`;
  } catch (err) {
    console.error("Unexpected error loading expenses:", err);
    expenseHistory.innerHTML = `<div class="history-empty">Unable to load expenses.</div>`;
  }
}

async function saveExpense(e) {
  e.preventDefault();

  const expense = {
    date: document.getElementById("expense-date").value,
    amount: Number(document.getElementById("expense-amount").value) || 0,
    notes: document.getElementById("expense-notes").value.trim()
  };

  const { error } = await supabaseClient.from("expenses").insert([expense]);

  if (error) {
    console.error("Error saving expense:", error);
    alert(`Failed to save expense: ${error.message}`);
    return;
  }

  await loadExpenses();
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return `£${number.toFixed(2)}`;
}

function safeValue(value) {
  return value ?? "-";
}

async function loadExpenseCategories() {
  const categorySelect = document.getElementById("expense-category");
  if (!categorySelect) return;

  try {
    const { data, error } = await supabaseClient
      .from("expense_categories")
      .select("id, name, active")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error loading expense categories:", error);
      categorySelect.innerHTML = `<option value="">No categories found</option>`;
      return;
    }

    const categories = data || [];

    categorySelect.innerHTML = `
      <option value="">Select category</option>
      ${categories.map(category => `
        <option value="${category.id}">${category.name}</option>
      `).join("")}
    `;
  } catch (err) {
    console.error("Unexpected error loading expense categories:", err);
    categorySelect.innerHTML = `<option value="">Unable to load categories</option>`;
  }
}