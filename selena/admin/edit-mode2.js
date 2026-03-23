/* edit-mode.js -- injected into iframe pages to add edit overlays */
(function() {

  // ===== FIX LAYOUT FOR IFRAME =====
  var style = document.createElement('style');
  style.textContent = [
    /* Hero: make relative so it flows in the iframe */
    '.hero { position: relative !important; height: 60vh !important; background-size: cover !important; background-position: center center !important; background-repeat: no-repeat !important; background-attachment: scroll !important; }',
    '.hero-spacer { display: none !important; }',
    /* Header: compact, solid */
    'header { position: relative !important; background: rgba(250,248,245,0.98) !important; border-bottom: 1px solid rgba(0,0,0,0.06) !important; }',
    'header .container { padding-top: 10px !important; padding-bottom: 10px !important; }',
    '.logo img { height: 40px !important; }',
    '.logo .logo-light { display: none !important; }',
    '.logo .logo-dark { opacity: 1 !important; position: static !important; }',
    'nav a { color: #2D2D2D !important; font-size: 12px !important; }',
    'nav a.btn-book { color: #1A1A1A !important; border-color: #1A1A1A !important; font-size: 11px !important; padding: 6px 14px !important; }',
    '.nav-social { color: #666 !important; }',
    '.nav-toggle { display: none !important; }',
    /* Parallax sections: relative */
    '.quote-section { background-size: cover !important; background-attachment: scroll !important; background-repeat: no-repeat !important; }',
    /* Sections: no overflow hidden so overlays aren't clipped */
    'section { overflow: visible !important; }',
    /* Disable animations so content is visible immediately */
    '.reveal, .reveal-left, .reveal-right { opacity: 1 !important; transform: none !important; }',
    /* Edit mode indicator */
    'body::before { content: "EDIT MODE"; position: fixed; top: 8px; right: 12px; z-index: 9999; background: #7C9A82; color: #fff; padding: 4px 12px; border-radius: 4px; font-family: Poppins, sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 1px; pointer-events: none; }'
  ].join('\n');
  document.head.appendChild(style);

  // ===== FIND CMS ELEMENTS =====
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

  // Disable buttons
  document.querySelectorAll('.btn, .btn-book').forEach(function(el) {
    el.style.pointerEvents = 'none';
  });

  // Kill scroll/parallax handlers that fight with our CSS
  window.onscroll = null;
  // Remove all scroll listeners by replacing window event handling
  var oldAddEventListener = window.addEventListener;
  window.addEventListener = function(type) {
    if (type === 'scroll') return; // block new scroll listeners
    return oldAddEventListener.apply(this, arguments);
  };

  // Force header into scrolled/solid state
  var header = document.querySelector('header');
  if (header) {
    header.className = 'solid scrolled';
  }

  // Clear any inline styles set by parallax JS
  document.querySelectorAll('.hero, .parallax-bg, .quote-section').forEach(function(el) {
    el.style.backgroundPositionY = '';
  });

})();
