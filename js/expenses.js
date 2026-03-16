// expenses.js
// Uber Engine v0.7.0
// Expense logging module

import { supabase } from "./db.js"

const expenseForm = document.getElementById("expense-form")
const expenseCategory = document.getElementById("expense-category")
const expenseDate = document.getElementById("expense-date")
const expenseAmount = document.getElementById("expense-amount")
const expenseNotes = document.getElementById("expense-notes")
const expenseHistory = document.getElementById("expense-history")

// -----------------------------
// Load Categories
// -----------------------------

export async function loadExpenseCategories() {

    const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .eq("active", true)
        .order("name")

    if (error) {
        console.error("Error loading categories:", error)
        return
    }

    expenseCategory.innerHTML = ""

    data.forEach(cat => {

        const option = document.createElement("option")
        option.value = cat.id
        option.textContent = cat.name

        expenseCategory.appendChild(option)

    })

}


// -----------------------------
// Save Expense
// -----------------------------

export async function saveExpense(e) {

    e.preventDefault()

    const date = expenseDate.value
    const category_id = expenseCategory.value
    const amount = parseFloat(expenseAmount.value)
    const notes = expenseNotes.value

    if (!date || !category_id || !amount) {
        alert("Please complete all required fields")
        return
    }

    const { error } = await supabase
        .from("expenses")
        .insert([
            {
                date,
                category_id,
                amount,
                notes
            }
        ])

    if (error) {
        console.error("Error saving expense:", error)
        alert("Error saving expense")
        return
    }

    expenseForm.reset()

    await loadExpenseHistory()

}


// -----------------------------
// Load Expense History
// -----------------------------

export async function loadExpenseHistory() {

    const { data, error } = await supabase
        .from("expenses")
        .select(`
            id,
            date,
            amount,
            notes,
            expense_categories(name)
        `)
        .order("date", { ascending: false })
        .limit(20)

    if (error) {
        console.error("Error loading expenses:", error)
        return
    }

    expenseHistory.innerHTML = ""

    data.forEach(exp => {

        const item = document.createElement("div")
        item.className = "history-item"

        const category = exp.expense_categories?.name || "Other"

        item.innerHTML = `
            <div>
                <strong>${exp.date}</strong> — ${category}
                <br>
                £${exp.amount.toFixed(2)}
                ${exp.notes ? `<br><small>${exp.notes}</small>` : ""}
            </div>
            <button data-id="${exp.id}" class="delete-expense">Del</button>
        `

        expenseHistory.appendChild(item)

    })

    addDeleteHandlers()

}


// -----------------------------
// Delete Expense
// -----------------------------

function addDeleteHandlers() {

    document.querySelectorAll(".delete-expense").forEach(btn => {

        btn.addEventListener("click", async () => {

            const id = btn.dataset.id

            const confirmDelete = confirm("Delete this expense?")

            if (!confirmDelete) return

            const { error } = await supabase
                .from("expenses")
                .delete()
                .eq("id", id)

            if (error) {
                console.error("Delete error:", error)
                alert("Could not delete expense")
                return
            }

            loadExpenseHistory()

        })

    })

}


// -----------------------------
// Init
// -----------------------------

export async function initExpenses() {

    await loadExpenseCategories()

    await loadExpenseHistory()

    expenseForm.addEventListener("submit", saveExpense)

}