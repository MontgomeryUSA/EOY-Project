async function loadCosts() {
  const data = sessionStorage.getItem("estimateJSON");
  if (!data) {
    alert("No cost data found – start from the Create page.");
    return;
  }
  const { items } = JSON.parse(data);

  const list    = document.getElementById("materialsUsed");
  const totalEl = document.querySelector(".totalPrice");
  list.innerHTML = "";

  let grand = 0;
  items.forEach(it => {
    const p = document.createElement("p");
    p.className = "price";
    p.textContent =
      `${it.mesh} (${it.material}) → $${it.cost.toFixed(2)}  [${it.matched}]`;
    list.appendChild(p);
    grand += it.cost || 0;
  });

  totalEl.textContent = `TOTAL PRICE:  $${grand.toFixed(2)}`;
}

document.addEventListener("DOMContentLoaded", loadCosts);

  