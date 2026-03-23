/* edit-mode.js -- injected into iframe pages to add edit overlays */
(function() {
  // Find all CMS-managed elements
  var sections = document.querySelectorAll('[data-cms-section]');
  var settings = document.querySelectorAll('[data-cms-setting]');

  function addOverlay(el, type, info) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:999;cursor:pointer;border:2px dashed rgba(124,154,130,0.5);border-radius:8px;background:rgba(124,154,130,0.04);transition:all 0.2s;display:flex;align-items:flex-start;justify-content:flex-end;padding:8px;';
    overlay.addEventListener('mouseenter', function() {
      overlay.style.background = 'rgba(124,154,130,0.1)';
      overlay.style.borderColor = 'rgba(124,154,130,0.8)';
    });
    overlay.addEventListener('mouseleave', function() {
      overlay.style.background = 'rgba(124,154,130,0.04)';
      overlay.style.borderColor = 'rgba(124,154,130,0.5)';
    });

    var btn = document.createElement('button');
    btn.textContent = 'Edit';
    btn.style.cssText = 'padding:6px 16px;background:#7C9A82;color:#fff;border:none;border-radius:6px;font-family:Poppins,sans-serif;font-size:12px;font-weight:500;cursor:pointer;letter-spacing:0.5px;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
    overlay.appendChild(btn);

    overlay.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({
        type: 'cms-edit',
        editType: type,
        page: info.page || '',
        section: info.section || '',
        setting: info.setting || ''
      }, '*');
    });

    wrap.appendChild(overlay);
  }

  // Add overlays to page sections
  sections.forEach(function(el) {
    addOverlay(el, 'section', {
      page: el.dataset.cmsPage,
      section: el.dataset.cmsSection
    });
  });

  // Add overlays to settings
  settings.forEach(function(el) {
    addOverlay(el, 'setting', {
      setting: el.dataset.cmsSetting
    });
  });

  // Disable all links in edit mode
  document.querySelectorAll('a').forEach(function(a) {
    a.addEventListener('click', function(e) {
      e.preventDefault();
    });
  });

  // Hide nav and booking buttons to reduce clutter
  document.querySelectorAll('.btn, .btn-book').forEach(function(el) {
    el.style.pointerEvents = 'none';
  });
})();
