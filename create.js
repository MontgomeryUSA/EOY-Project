
function togglePanel() {
  const panel = document.getElementById('side-panel');
  const arrow = document.getElementById('arrow');
  const arrowIcon = document.getElementById('arrow-icon');

  panel.classList.toggle('open');
  arrow.classList.toggle('rotate');
  
  
  if (panel.classList.contains('open')) {
    document.getElementById("main").style.transform = "translateX(15vh)";
    document.getElementById("popup").style.transform = "translateX(-1)";
    arrowIcon.innerHTML = ' <';
  } else {
    document.getElementById("main").style.transform = "translateX(0)";
    document.getElementById("popup").style.transform = "translateX(-10vh)";
    arrowIcon.innerHTML = ' >';
  }
  
  const isIPadPortrait = window.innerWidth >= 400 && window.innerHeight > window.innerWidth;
    if (isIPadPortrait) {
        if (panel.classList.contains('open')) {
        document.getElementById("side-panel").style.setProperty("transform", "translateY(0%)", "important");
        arrowIcon.innerHTML = ' <';
      } else {
        document.getElementById("side-panel").style.setProperty("transform", "translateY(-100%)", "important");
        arrowIcon.innerHTML = ' >';
      }
  }
}

function openForm() {
  document.getElementById("myForm").style.display = "block";
}

function openPricing() {
  location.href = "pricing.html";
}

function closeForm() {
  event.preventDefault();
  document.getElementById("myForm").style.display = "none";
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
