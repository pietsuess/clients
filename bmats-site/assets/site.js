// Shared header behaviour for every page.
// Hide the header when scrolling down past a short way; reveal on any upward scroll.
(function () {
  var header = document.getElementById('hdr');
  if (!header) return;
  var threshold = 160;
  var lastY = window.scrollY;
  var ticking = false;
  function update() {
    var y = window.scrollY;
    if (y <= threshold) {
      header.classList.remove('nav-hidden');        // always shown near the top
    } else if (y > lastY + 4) {
      header.classList.add('nav-hidden');            // scrolling down
    } else if (y < lastY - 4) {
      header.classList.remove('nav-hidden');         // scrolling up
    }
    lastY = y;
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
})();
