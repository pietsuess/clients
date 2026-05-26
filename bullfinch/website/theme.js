/* Bullfinch Pitch - theme system
   - Reads localStorage "bullfinch-pitch-theme"
   - Defaults to dark mode
   - Writes data-theme on <html>
   - Persists on toggle
   - Dispatches "bullfinch:themechange" with detail { theme } for downstream
     scripts (Chunk 2 WebGL re-tint will listen for this).
   Note: the FOUC-prevention block in <head> already set the initial theme
   before first paint; this script wires the toggle and exposes the API.
*/
(function () {
  var STORAGE_KEY = "bullfinch-pitch-theme";
  var html = document.documentElement;

  function readSaved() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch (e) {
      return null;
    }
  }

  function writeSaved(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* private mode etc. - silent */
    }
  }

  function applyTheme(theme, opts) {
    opts = opts || {};
    html.setAttribute("data-theme", theme);

    var toggle = document.getElementById("theme-toggle");
    if (toggle) {
      var nextLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
      toggle.setAttribute("aria-label", nextLabel);
      toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    }

    if (!opts.silent) {
      window.dispatchEvent(new CustomEvent("bullfinch:themechange", { detail: { theme: theme } }));
    }
  }

  // Initial sync. The FOUC script already set the attribute, but we re-apply
  // here to wire aria state on the toggle and emit the initial event.
  var initial = readSaved() || "dark";
  applyTheme(initial, { silent: true });

  // Toggle wiring.
  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var current = html.getAttribute("data-theme") === "dark" ? "dark" : "light";
      var next = current === "dark" ? "light" : "dark";
      writeSaved(next);
      applyTheme(next);
    });
  }

  // Expose a tiny API for later chunks.
  window.bullfinchTheme = {
    get: function () {
      return html.getAttribute("data-theme") === "dark" ? "dark" : "light";
    },
    set: function (t) {
      if (t !== "light" && t !== "dark") return;
      writeSaved(t);
      applyTheme(t);
    },
  };
})();
