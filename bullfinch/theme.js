(function () {
  document.documentElement.setAttribute("data-theme", "dark");
  try {
    localStorage.removeItem("bullfinch-pitch-theme");
  } catch (e) {}

  window.bullfinchTheme = {
    get: function () { return "dark"; },
    set: function () {
      document.documentElement.setAttribute("data-theme", "dark");
    },
  };
})();
