async function loadCosts() {
  // 1) grab selections saved by create2.js
  const selections = JSON.parse(localStorage.getItem("meshSelections") || "[]");
  const glbUrl     = localStorage.getItem("glbBlobUrl");

  if (!selections.length || !glbUrl) {
    alert("No saved model/material selections – go back to Create page first!");
    return;
  }

  // 2) read the GLB blob
  const glbBlob  = await fetch(glbUrl).then(r => r.blob());
  const fileData = new File([glbBlob], "model.glb");

  // 3) send multipart POST to the backend
  const form = new FormData();
  form.append("file", fileData);
  form.append("payload", new Blob(
    [JSON.stringify({ meshes: selections })],
    { type:"application/json" }
  ));

  const resp = await fetch("http://127.0.0.1:8000/estimate", { method:"POST", body: form });
  const { items } = await resp.json();

  // 4) populate UI
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
  