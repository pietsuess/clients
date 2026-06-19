/* Shared lightbox for SSCY galleries (vanilla JS, no deps). */
(function(){
  'use strict';

  var STYLES = [
    '.sscy-lb-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:none;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s ease;touch-action:pan-y;}',
    '.sscy-lb-overlay.open{display:flex;opacity:1;}',
    '.sscy-lb-img{max-width:92vw;max-height:88vh;object-fit:contain;display:block;border-radius:4px;box-shadow:0 12px 60px rgba(0,0,0,0.6);user-select:none;-webkit-user-drag:none;}',
    '.sscy-lb-cap{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);color:rgba(255,255,255,0.78);font-family:"Archivo Narrow",sans-serif;font-size:0.85rem;letter-spacing:0.03em;max-width:80vw;text-align:center;pointer-events:none;}',
    '.sscy-lb-btn{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.25);border-radius:50%;width:48px;height:48px;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;line-height:1;transition:background 0.15s ease;-webkit-tap-highlight-color:transparent;}',
    '.sscy-lb-btn:hover{background:rgba(0,0,0,0.7);}',
    '.sscy-lb-prev{left:18px;}',
    '.sscy-lb-next{right:18px;}',
    '.sscy-lb-close{top:18px;right:18px;left:auto;transform:none;width:40px;height:40px;font-size:20px;}',
    '.sscy-lb-counter{position:absolute;top:24px;left:24px;color:rgba(255,255,255,0.55);font-family:"Archivo Narrow",sans-serif;font-size:0.8rem;letter-spacing:0.04em;}',
    '@media (max-width:640px){.sscy-lb-btn{width:40px;height:40px;font-size:18px;}.sscy-lb-prev{left:8px;}.sscy-lb-next{right:8px;}.sscy-lb-close{top:10px;right:10px;}.sscy-lb-counter{top:14px;left:14px;font-size:0.7rem;}}',
    '.sscy-lb-clickable{cursor:zoom-in;}'
  ].join('\n');

  var styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);

  var overlay = document.createElement('div');
  overlay.className = 'sscy-lb-overlay';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label','Image viewer');
  overlay.innerHTML = '<button type="button" class="sscy-lb-btn sscy-lb-close" aria-label="Close">&times;</button>'+
    '<button type="button" class="sscy-lb-btn sscy-lb-prev" aria-label="Previous">&#10094;</button>'+
    '<button type="button" class="sscy-lb-btn sscy-lb-next" aria-label="Next">&#10095;</button>'+
    '<div class="sscy-lb-counter" aria-live="polite"></div>'+
    '<img class="sscy-lb-img" alt="" />'+
    '<div class="sscy-lb-cap"></div>';
  document.body.appendChild(overlay);

  var imgEl = overlay.querySelector('.sscy-lb-img');
  var capEl = overlay.querySelector('.sscy-lb-cap');
  var counterEl = overlay.querySelector('.sscy-lb-counter');
  var btnPrev = overlay.querySelector('.sscy-lb-prev');
  var btnNext = overlay.querySelector('.sscy-lb-next');
  var btnClose = overlay.querySelector('.sscy-lb-close');

  var items = [];
  var idx = 0;

  function show(i){
    if(!items.length) return;
    idx = (i + items.length) % items.length;
    var it = items[idx];
    imgEl.src = it.src;
    imgEl.alt = it.alt || '';
    capEl.textContent = it.alt || '';
    counterEl.textContent = (idx+1) + ' / ' + items.length;
  }
  function open(i){
    show(i);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close(){
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function(){ if(!overlay.classList.contains('open')) imgEl.src=''; }, 250);
  }
  function next(){ show(idx+1); }
  function prev(){ show(idx-1); }

  btnClose.addEventListener('click', function(e){ e.stopPropagation(); close(); });
  btnPrev.addEventListener('click', function(e){ e.stopPropagation(); prev(); });
  btnNext.addEventListener('click', function(e){ e.stopPropagation(); next(); });
  overlay.addEventListener('click', function(e){ if(e.target===overlay || e.target===imgEl || e.target===capEl) close(); });

  document.addEventListener('keydown', function(e){
    if(!overlay.classList.contains('open')) return;
    if(e.key==='Escape') close();
    else if(e.key==='ArrowRight') next();
    else if(e.key==='ArrowLeft') prev();
  });

  // Touch swipe
  var tx=0, ty=0, tt=0;
  overlay.addEventListener('touchstart', function(e){
    if(!e.touches.length) return;
    tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = Date.now();
  }, {passive:true});
  overlay.addEventListener('touchend', function(e){
    if(!e.changedTouches.length) return;
    var dx = e.changedTouches[0].clientX - tx;
    var dy = e.changedTouches[0].clientY - ty;
    var dt = Date.now() - tt;
    if(dt < 600 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)*1.4){
      if(dx < 0) next(); else prev();
    }
  }, {passive:true});

  function bind(rootSelector){
    var roots = document.querySelectorAll(rootSelector);
    roots.forEach(function(root){
      var imgs = root.querySelectorAll('img');
      var localItems = [];
      imgs.forEach(function(img, i){
        if(img.dataset.lbSkip) return;
        localItems.push({src: img.dataset.lbFull || img.src, alt: img.alt || ''});
        img.classList.add('sscy-lb-clickable');
        img.addEventListener('click', function(){
          // Re-collect at click time so images are stable.
          items = localItems;
          open(i);
        });
      });
    });
  }

  // Public API
  window.SscyLightbox = { bind: bind, open: function(list, i){ items = list||[]; open(i||0); } };

  // Auto-bind any element marked with [data-lightbox]
  document.addEventListener('DOMContentLoaded', function(){
    bind('[data-lightbox]');
  });
})();
