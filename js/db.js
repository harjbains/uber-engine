import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { CONFIG } from "./config.js";

const supabase = createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_ANON_KEY
);


/*
=========================
SHIFTS
=========================
*/

export async function getShifts(startDate = null, endDate = null) {

    let query = supabase
        .from("shifts")
        .select("*")
        .order("date", { ascending: false });

    if (startDate && endDate) {

        query = query
            .gte("date", startDate)
            .lte("date", endDate);

    }

    return await query;

}


export async function addShift(shift){

  return await supabase
    .from("shifts")
    .insert([shift]);

}


export async function deleteShift(id) {

    const { error } = await supabase
        .from("shifts")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Error deleting shift:", error);
    }

}



/*
=========================
FUEL
=========================
*/

export async function getFuel(startDate = null, endDate = null) {

    let query = supabase
        .from("fuel_logs")
        .select("*")
        .order("date", { ascending: false });

    if (startDate && endDate) {

        query = query
            .gte("date", startDate)
            .lte("date", endDate);

    }

    return await query;

}


export async function addFuel(entry) {

    const { error } = await supabase
        .from("fuel_logs")
        .insert([entry]);

    if (error) {
        console.error("Error adding fuel:", error);
    }

}


export async function deleteFuel(id) {

    const { error } = await supabase
        .from("fuel_logs")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("Error deleting fuel:", error);
    }

}