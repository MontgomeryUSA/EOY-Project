import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(labelRenderer.domElement);

let selectedColor = null;
let selectedStore = null;
let mode = null;
let loadedFont = null;

const fontLoader = new FontLoader();
fontLoader.load('fonts/helvetiker_regular.typeface.json', function (font) {
  loadedFont = font;
});

const scene = new THREE.Scene();
scene.background = new THREE.Color('rgb(38, 38, 38)'); 

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 40, 150);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('webgl'),
  antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 3);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const clickableObjects = [];
let modelMeshes = {};
let selectedObject = null;
let hoveredObject = null;

document.querySelectorAll('.materialButton').forEach(button => {
  button.addEventListener('click', () => {
    const isSelected = button.classList.contains('selected');

    document.querySelectorAll('.storeOptions').forEach(btn => btn.classList.remove('selected'));
    document.querySelectorAll('.materialButton').forEach(btn => btn.classList.remove('selected'));

    if (!isSelected) {
      button.classList.add('selected');
      const bgColor = getComputedStyle(button).getPropertyValue('--button-bg').trim();
      selectedColor = new THREE.Color(bgColor);
      selectedStore = null;
      mode = 'color';
    } else {
      selectedColor = null;
      mode = null;
    }
  });
});

document.querySelectorAll('.storeOptions').forEach(button => {
  button.addEventListener('click', () => {
    const isSelected = button.classList.contains('selected');

    document.querySelectorAll('.storeOptions').forEach(btn => btn.classList.remove('selected'));
    document.querySelectorAll('.materialButton').forEach(btn => btn.classList.remove('selected'));

    if (!isSelected) {
      button.classList.add('selected');
      selectedStore = button.textContent.trim();
      selectedColor = null;
      mode = 'store';
    } else {
      selectedStore = null;
      mode = null;
    }
  });
});

document.getElementById('fileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('fileInput').style.display = 'none';

  const reader = new FileReader();
  reader.onload = function (e) {
    const contents = e.target.result;
    const loader = new GLTFLoader();
    loader.parse(contents, '', function (gltf) {
      const model = gltf.scene;

      clickableObjects.length = 0;
      modelMeshes = {};

      model.traverse((child) => {
        child.material = new THREE.MeshStandardMaterial({ color: 0xffffff });
        if (child.isMesh) {
          child.raycast = THREE.Mesh.prototype.raycast;
          child.material.depthTest = true;
          child.geometry.computeBoundingSphere();

          clickableObjects.push(child);
          modelMeshes[child.name] = child;

          child.userData.selectedColor = null;

          updatePartsSummary(child.name, "Any");
        }
      });

      model.position.set(0, 0, 0);
      model.scale.set(1, 1, 1);
      scene.add(model);
    }, function (error) {
      console.error('Error loading model:', error);
    });
  };

  reader.readAsArrayBuffer(file);
});


window.addEventListener('pointerdown', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(clickableObjects, true);

  if (intersects.length > 0) {
    selectedObject = intersects[0].object;

    if (mode === 'color' && selectedColor && selectedObject.material?.color) {
      selectedObject.material.color.set(selectedColor);
      selectedObject.material.needsUpdate = true;
      selectedObject.userData.selectedColor = selectedColor.clone();
      console.log(`Applied color ${selectedColor.getStyle()} to ${selectedObject.name}`);
    }

    if (mode === 'store' && selectedStore) {
      selectedObject.userData.storeName = selectedStore;
      updatePartsSummary(selectedObject.name, selectedStore);
      console.log(`Assigned ${selectedObject.name} to store: ${selectedStore}`);
    }
  }
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(clickableObjects, true);

  if (hoveredObject && !intersects.find(i => i.object === hoveredObject)) {
    if (hoveredObject.userData.selectedColor) {
      hoveredObject.material.color.set(hoveredObject.userData.selectedColor);
    } else {
      hoveredObject.material.color.set('white');
    }
    hoveredObject = null;
  }

  if (intersects.length > 0) {
    const intersected = intersects[0].object;
    if (intersected !== hoveredObject) {
      if (hoveredObject) {
        if (hoveredObject.userData.selectedColor) {
          hoveredObject.material.color.set(hoveredObject.userData.selectedColor);
        } else {
          hoveredObject.material.color.set('white');
        }
      }

      hoveredObject = intersected;
      if (mode === 'color' && selectedColor) {
        hoveredObject.material.color.set(selectedColor);
      }
    }
  }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('fileInput');
  const fileButton = document.querySelector('label[for="fileInput"]');

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      fileButton.style.display = 'none';
      console.log('File selected, hiding Upload button');
    }
  });
});

window.addEventListener('pointermove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

function togglePanel() {
  const panel = document.getElementById('side-panel');
  const arrow = document.getElementById('arrow');
  const arrowIcon = document.getElementById('arrow-icon');

  panel.classList.toggle('open');
  arrow.classList.toggle('rotate');
  
  if (panel.classList.contains('open')) {
    document.getElementById("main").style.transform = "translateX(9%)";
    document.getElementById("popup").style.transform = "translateX(9%)";
    document.getElementById("webgl").style.transform = "translateX(9%)";
    arrowIcon.innerHTML = ' <';
  } else {
    document.getElementById("main").style.transform = "translateX(0)";
    document.getElementById("popup").style.transform = "translateX(0)";
    document.getElementById("webgl").style.transform = "translateX(0)";
    arrowIcon.innerHTML = ' >';
  }    
}

function openForm() {
  document.getElementById("myForm").style.display = "block";
}

function closeForm() {
  document.getElementById("myForm").style.display = "none";
}

function openPricing() {
  location.href = "pricing.html";
}

function toggleDropdown() {
  const dropdown = document.getElementById("myDropdown");
  dropdown.classList.toggle("show");
}

function closeDropdown() {
  const dropdown = document.getElementById("myDropdown");
  dropdown.classList.remove("show");
}

window.addEventListener("click", function(event) {
  const dropdown = document.getElementById("myDropdown");
  if (!dropdown.contains(event.target)) {
    closeDropdown();
  }
});

function updatePartsSummary(partName, storeName) {
  const tableBody = document.querySelector('#summary-table tbody');

  let existingRow = tableBody.querySelector(`tr[data-part="${partName}"]`);

  if (existingRow) {
    existingRow.querySelector('.store-cell').textContent = storeName;
  } else {
    const row = document.createElement('tr');
    row.setAttribute('data-part', partName);

    const partCell = document.createElement('td');
    partCell.textContent = partName;
    partCell.contentEditable = true;
    partCell.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        partCell.blur();
      }
    });

    let originalText = partName;

partCell.addEventListener('focus', () => {
  originalText = partCell.textContent.trim();
});

partCell.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    partCell.blur();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    partCell.textContent = originalText;
    partCell.blur();
  }
});

    
    partCell.classList.add('editable-part-name');

    partCell.addEventListener('blur', () => {
      const newName = partCell.textContent.trim();
      const oldName = row.getAttribute('data-part');    
    
      if (newName === '') {
        alert('Part name cannot be empty.');
        partCell.textContent = oldName;
        partCell.focus();
        return;
      } else if (newName !== oldName) {
        console.log(`Renamed part from ${oldName} to ${newName}`);
        row.setAttribute('data-part', newName);
    
        if (modelMeshes[oldName]) {
          modelMeshes[newName] = modelMeshes[oldName];
          delete modelMeshes[oldName];
        }
      }
    });
    
    

    const storeCell = document.createElement('td');
    storeCell.classList.add('store-cell');
    storeCell.textContent = storeName;

    row.appendChild(partCell);
    row.appendChild(storeCell);
    tableBody.appendChild(row);
  }
}

function dragElement(element, excludeSelector = null) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
    element.onmousedown = dragMouseDown;
  
    function dragMouseDown(e) {
      if (excludeSelector && e.target.closest(excludeSelector)) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }
  
    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      element.style.top = (element.offsetTop - pos2) + "px";
      element.style.left = (element.offsetLeft - pos1) + "px";
    }
  
    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }
  

dragElement(document.getElementById("draggable-container"));
dragElement(document.getElementById("draggable-container2"));