/*
=========================
CURRENCY FORMATTER
=========================
*/

export function formatCurrency(value) {

    const number = Number(value) || 0;

    return "£" + number.toFixed(2);

}



/*
=========================
GET MONTH DATE RANGE
=========================
Returns start and end of month
Used for dashboard filtering
=========================
*/

export function getMonthRange(date = new Date()) {

    const start = new Date(date.getFullYear(), date.getMonth(), 1);

    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    return {

        start: formatDate(start),

        end: formatDate(end)

    };

}



/*
=========================
FORMAT DATE (YYYY-MM-DD)
Required for Supabase
=========================
*/

export function formatDate(date) {

    const d = new Date(date);

    const year = d.getFullYear();

    const month = String(d.getMonth() + 1).padStart(2, "0");

    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;

}



/*
=========================
TODAY DATE
=========================
Useful for form defaults
=========================
*/

export function todayDate() {

    return formatDate(new Date());

}



/*
=========================
SUM ARRAY VALUES
Safe reducer
=========================
*/

export function sumArray(arr, field) {

    if (!arr || arr.length === 0) return 0;

    return arr.reduce((sum, item) => {

        const value = Number(item[field]) || 0;

        return sum + value;

    }, 0);

}



/*
=========================
NUMBER FORMATTER
=========================
Useful for metrics
=========================
*/

export function formatNumber(value) {

    const number = Number(value) || 0;

    return number.toLocaleString("en-GB");

}

export let currentMonth = new Date();

export function changeMonth(offset) {

    currentMonth.setMonth(currentMonth.getMonth() + offset);

    return currentMonth;

}


export function populateTimeSelectors() {

    const hours = [...Array(24).keys()];
    const minutes = [0,5,10,15,20,25,30,35,40,45,50,55];

    const hourSelectors = ["start-hour", "end-hour"];
    const minuteSelectors = ["start-minute", "end-minute"];


    hourSelectors.forEach(id => {

        const select = document.getElementById(id);

        hours.forEach(h => {

            const option = document.createElement("option");

            option.value = String(h).padStart(2,"0");
            option.textContent = String(h).padStart(2,"0");

            select.appendChild(option);

        });

    });


    minuteSelectors.forEach(id => {

        const select = document.getElementById(id);

        minutes.forEach(m => {

            const option = document.createElement("option");

            option.value = String(m).padStart(2,"0");
            option.textContent = String(m).padStart(2,"0");

            select.appendChild(option);

        });

    });

}