import { getShifts, getFuel } from "./db.js";
import { getMonthRange, formatCurrency } from "./utils.js";
import { CONFIG } from "./config.js";


export async function loadMonthlyDashboard(selectedDate = new Date()) {

    try {

        /*
        =============================
        GET MONTH RANGE
        =============================
        */

        const { start, end } = getMonthRange(selectedDate);


        /*
        =============================
        FETCH DATA
        =============================
        */

        const { data: shiftsData, error: shiftsError } = await getShifts(start, end);
        const { data: fuelData, error: fuelError } = await getFuel(start, end);

        if (shiftsError) throw shiftsError;
        if (fuelError) throw fuelError;

        const shifts = shiftsData || [];
        const fuel = fuelData || [];


        /*
        =============================
        INCOME
        =============================
        */

        const income = shifts.reduce((sum, shift) => {

            const gross = Number(shift.gross) || 0;
            const tips = Number(shift.tips) || 0;

            return sum + gross + tips;

        }, 0);


        /*
        =============================
        FUEL COST
        =============================
        */

        const fuelTotal = fuel.reduce((sum, entry) => {

            return sum + (Number(entry.cost) || 0);

        }, 0);


        /*
        =============================
        MILES DRIVEN
        =============================
        */

        const miles = shifts.reduce((sum, shift) => {

            const start = Number(shift.odo_start) || 0;
            const end = Number(shift.odo_end) || 0;

            return sum + (end - start);

        }, 0);


        /*
        =============================
        SHIFT HOURS
        =============================
        */

        const hours = shifts.reduce((sum, shift) => {

            const start = new Date(`1970-01-01T${shift.start_time}`);
            const end = new Date(`1970-01-01T${shift.end_time}`);

            const diff = (end - start) / 3600000;

            return sum + diff;

        }, 0);


        /*
        =============================
        PROFIT
        =============================
        */

        const profit = income - fuelTotal;


        /*
        =============================
        TAX BUFFER
        =============================
        */

        const tax = profit * CONFIG.TAX_BUFFER_RATE;


        /*
        =============================
        NET INCOME
        =============================
        */

        const netIncome = profit - tax;


        /*
        =============================
        DRIVER METRICS
        =============================
        */

        const perMile = miles > 0 ? income / miles : 0;
        const perHour = hours > 0 ? income / hours : 0;


        /*
        =============================
        UPDATE DASHBOARD
        =============================
        */

        setMetric("metric-income", income);
        setMetric("metric-fuel", fuelTotal);
        setMetric("metric-profit", profit);
        setMetric("metric-tax", tax);
        setMetric("metric-retained", netIncome);

        setMetric("metric-miles", miles.toFixed(0));
        setMetric("metric-per-mile", perMile);
        setMetric("metric-per-hour", perHour);


        /*
        =============================
        DEBUG OUTPUT
        =============================
        */

        console.log("Monthly Dashboard", {

            income,
            fuelTotal,
            miles,
            hours,
            profit,
            tax,
            netIncome,
            perMile,
            perHour

        });

    }

    catch (error) {

        console.error("Monthly dashboard failed:", error);

    }

}


/*
============================
UI HELPER
============================
*/

function setMetric(id, value) {

    const el = document.getElementById(id);

    if (!el) return;

    if (typeof value === "number") {

        el.textContent = formatCurrency(value);

    }

    else {

        el.textContent = value;

    }

}