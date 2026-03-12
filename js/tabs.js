import { loadShifts } from "./shifts.js";
import { loadFuelTable } from "./fuel.js";


export function initTabs(){

    const buttons = document.querySelectorAll(".tab-btn");

    buttons.forEach(btn => {

        btn.addEventListener("click", () => {

            const tab = btn.dataset.tab;

            switchTab(tab);

        });

    });

}



function switchTab(tab){

  document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));

  document.getElementById(tab).classList.add("active");
  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");

  if(tab === "shifts"){
    loadShifts();
  }

  if(tab === "fuel"){
    loadFuelTable();
  }

}