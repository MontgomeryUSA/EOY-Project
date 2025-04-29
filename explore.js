
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
  