/*  Build-IT – viewer / selector  (2024-05-02) */
import * as THREE                      from "three";
import { GLTFLoader       } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls    } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer    } from "three/examples/jsm/renderers/CSS2DRenderer.js";

/* ───────────────────────────── Colour ▸ material map */
const MATERIAL_BY_RGB = {
  "#7d7f7c": "pvc",
  "#d9d9d9": "polycarbonate",
  "#ffffff": "acrylic",
  "#b5651d": "plywood",
  "#cc5500": "cedar",
  "#8f0000": "red cedar",
  "#895129": "oak",
  "#ff0000": "maple",
  "#5b2200": "walnut",
  "#7b2100": "mahogany",
  "#914d8a": "cherry",
  "#1f4d00": "pine",
  "#788cbc": "aluminum",
  "#aec1eb": "stainless",
  "#b7b7b7": "steel",
  "#e79a3f": "brass",
  "#b57e48": "copper"
};

const hex = c => "#" + c.getHexString();

/* ───────────────────────────── global UI state */
const UNITS = ["mm", "cm", "m", "in", "ft"];
let unitsIdx          = 0;
let selectedColor     = null;
let selectedMaterial  = "any";
let selectedStore     = null;
let mode              = null;

/* ───────────────────────────── Three.js scene */
const scene    = new THREE.Scene();
scene.background = new THREE.Color("rgb(38,38,38)");

const camera   = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 40, 150);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("webgl"), antialias: true
});
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 3));
const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(5, 10, 7.5);
scene.add(dir);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
document.body.appendChild(labelRenderer.domElement);

/* ───────────────────────────── runtime mesh containers */
const raycaster        = new THREE.Raycaster();
const mouse            = new THREE.Vector2();
const clickableObjects = [];
const modelMeshes      = {};
let   hovered          = null;

document.querySelectorAll(".saveButton, .saveForm").forEach(b => (b.disabled = true));

/* ───────────────────────────── units-toggle button */
document.getElementById("unitsToggle").textContent = UNITS[0];
document.getElementById("unitsToggle").addEventListener("click", () => {
  unitsIdx = (unitsIdx + 1) % UNITS.length;
  document.getElementById("unitsToggle").textContent = UNITS[unitsIdx];
});

/* ───────────────────────────── material buttons */
document.querySelectorAll(".materialButton").forEach(btn => {
  btn.addEventListener("click", () => {
    const already = btn.classList.contains("selected");

    document.querySelectorAll(".materialButton, .storeOptions")
      .forEach(b => b.classList.remove("selected"));

    if (!already) {
      btn.classList.add("selected");
      const rgb = getComputedStyle(btn).getPropertyValue("--button-bg").trim().toLowerCase();
      selectedColor    = new THREE.Color(rgb);
      selectedMaterial = MATERIAL_BY_RGB[rgb] || "any";
      mode             = "color";
    } else {
      selectedColor = null;
      mode = null;
    }
  });
});

/* ───────────────────────────── store buttons */
document.querySelectorAll(".storeOptions").forEach(btn => {
  btn.addEventListener("click", () => {
    const already = btn.classList.contains("selected");

    document.querySelectorAll(".materialButton, .storeOptions")
      .forEach(b => b.classList.remove("selected"));

    if (!already) {
      btn.classList.add("selected");
      selectedStore   = btn.textContent.trim();
      selectedColor   = null;
      selectedMaterial= "any";
      mode            = "store";
    } else {
      selectedStore = null;
      mode = null;
    }
  });
});

/* ───────────────────────────── model upload */
document.getElementById("fileInput").addEventListener("change", ev => {
  const file = ev.target.files[0];
  if (!file) return;

  document.querySelector('label[for="fileInput"]').style.display = "none";

  const reader = new FileReader();
  reader.onload = e => {
    const loader = new GLTFLoader();
    loader.parse(e.target.result, "", gltf => {
      const model = gltf.scene;

      clickableObjects.length = 0;
      Object.keys(modelMeshes).forEach(k => delete modelMeshes[k]);

      model.traverse(child => {
        if (!child.isMesh) return;

        child.material = new THREE.MeshStandardMaterial({ color: 0xffffff });
        child.geometry.computeBoundingSphere();

        clickableObjects.push(child);
        modelMeshes[child.name] = child;

        child.userData.materialName = "any";
        child.userData.storeName    = "any";

        updatePartsSummary(child.name, "any");  // ✅ populate table on load
      });

      scene.add(model);
      document.querySelectorAll(".saveButton, .saveForm").forEach(b => (b.disabled = false));
    });
  };
  reader.readAsArrayBuffer(file);
});

/* ───────────────────────────── pointer click interaction */
window.addEventListener("pointerdown", ev => {
  mouse.x = (ev.clientX / innerWidth) * 2 - 1;
  mouse.y = -(ev.clientY / innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const [hit] = raycaster.intersectObjects(clickableObjects, true);
  if (!hit) return;

  const mesh = hit.object;

  if (mode === "color" && selectedColor) {
    mesh.material.color.copy(selectedColor);
    mesh.userData.materialName = selectedMaterial;
  }

  if (mode === "store" && selectedStore) {
    mesh.userData.storeName = selectedStore;
    updatePartsSummary(mesh.name, selectedStore);  
  }
});

/* ───────────────────────────── table display */
function updatePartsSummary(name, store) {
  const table = document.getElementById("summary-table");
  let row = table.querySelector(`tr[data-part="${name}"]`);
  if (!row) {
    row = document.createElement("tr");
    row.dataset.part = name;
    row.innerHTML = `<td>${name}</td><td>${store}</td>`;
    table.appendChild(row);
  } else {
    row.cells[1].textContent = store;
  }
}

/* ───────────────────────────── render loop */
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();

/* ───────────────────────────── estimation submission */
async function submitEstimate() {
  if (!Object.keys(modelMeshes).length) {
    alert("Model still loading — try again in a second!");
    return;
  }
  const fileInput = document.getElementById("fileInput");
  if (!fileInput.files.length) {
    alert("Please upload a model first!");
    return;
  }

  const meshArr = Object.entries(modelMeshes).map(([name, mesh]) => ({
    mesh_name: name,
    material : mesh.userData.materialName || "any"
  }));

  const form = new FormData();
  form.append("file", fileInput.files[0]);
  form.append("payload", new Blob([
    JSON.stringify({
      meshes: meshArr,
      units : UNITS[unitsIdx]
    })
  ], { type: "application/json" }));

  try {
    const r = await fetch("http://127.0.0.1:8000/estimate", {
      method: "POST",
      body  : form
    });
    if (!r.ok) throw new Error(r.statusText);
    sessionStorage.setItem("estimateJSON", await r.text());
    location.href = "pricing.html";
  } catch (err) {
    alert("Estimation failed: " + err.message);
  }
}
window.submitEstimate = submitEstimate;
