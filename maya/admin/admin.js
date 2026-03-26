/* admin.js -- CMS admin panel for Unprofessional Variety Show, powered by GitHub API */

(function() {

  // ===== CONFIG =====
  var OWNER = 'pietsuess';
  var REPO = 'clients';
  var BRANCH = 'main';
  var BASE_PATH = 'maya/content/';
  var API = 'https://api.github.com';

  // ===== DEMO MODE =====
  var DEMO = location.search.indexOf('demo') !== -1;

  // ===== STATE =====
  var token = '';
  var shas = {}; // { filename: sha }
  var shows = [];
  var media = [];
  var shop = [];
  var settings = {};
  var editingIndex = -1; // -1 = new, >= 0 = editing existing
  var showDescQuill = null;
  var pendingChanges = {}; // { filename: true } tracks which files have unpublished changes
  var DRAFT_KEY = 'maya-cms-drafts';

  // ===== DRAFTS =====
  function saveDrafts() {
    var drafts = {
      shows: shows,
      media: media,
      shop: shop,
      settings: settings,
      pending: pendingChanges
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    updatePublishBar();
  }

  function loadDrafts() {
    var raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    try {
      var drafts = JSON.parse(raw);
      if (drafts.pending && Object.keys(drafts.pending).length > 0) {
        shows = drafts.shows || shows;
        media = drafts.media || media;
        shop = drafts.shop || shop;
        settings = drafts.settings || settings;
        pendingChanges = drafts.pending || {};
        return true;
      }
    } catch(e) {}
    return false;
  }

  function clearDrafts() {
    pendingChanges = {};
    localStorage.removeItem(DRAFT_KEY);
    updatePublishBar();
  }

  function markDirty(filename) {
    pendingChanges[filename] = true;
    saveDrafts();
  }

  function updatePublishBar() {
    var bar = $('publish-bar');
    var count = Object.keys(pendingChanges).length;
    if (count > 0) {
      $('pending-count').textContent = count + ' unpublished change' + (count > 1 ? 's' : '');
      bar.style.display = 'flex';
    } else {
      bar.style.display = 'none';
    }
  }

  function publishAll() {
    var files = Object.keys(pendingChanges);
    if (!files.length) { toast('Nothing to publish'); return; }

    if (DEMO) {
      toast('Demo mode - connect a GitHub token to publish live');
      return;
    }

    $('publish-btn').disabled = true;
    $('publish-btn').textContent = 'Publishing...';

    var dataMap = {
      'shows.json': shows,
      'media.json': media,
      'shop.json': shop,
      'settings.json': settings
    };

    // Commit each changed file sequentially to avoid sha conflicts
    var chain = Promise.resolve();
    files.forEach(function(filename) {
      chain = chain.then(function() {
        return putFile(filename, dataMap[filename], 'Publish: ' + filename);
      });
    });

    chain
      .then(function() {
        toast('Published! Site updates in about a minute.');
        clearDrafts();
      })
      .catch(function(err) { toast('Publish failed: ' + err.message, true); })
      .finally(function() {
        $('publish-btn').disabled = false;
        $('publish-btn').textContent = 'Publish';
      });
  }

  function discardDrafts() {
    if (!confirm('Discard all unpublished changes? This will reload content from GitHub.')) return;
    clearDrafts();
    loadAllContent();
    toast('Drafts discarded.');
  }

  // ===== DOM =====
  var $ = function(id) { return document.getElementById(id); };

  // ===== GITHUB API =====
  function apiHeaders() {
    return {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
  }

  function getUser() {
    return fetch(API + '/user', { headers: apiHeaders() })
      .then(function(r) { if (!r.ok) throw new Error('Invalid token'); return r.json(); });
  }

  function getFile(filename) {
    return fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + BASE_PATH + filename + '?ref=' + BRANCH, { headers: apiHeaders() })
      .then(function(r) { if (!r.ok) throw new Error('File not found: ' + filename); return r.json(); })
      .then(function(data) {
        shas[filename] = data.sha;
        var content = atob(data.content.replace(/\n/g, ''));
        // Handle UTF-8 properly
        var bytes = new Uint8Array(content.length);
        for (var i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i);
        var decoded = new TextDecoder().decode(bytes);
        return JSON.parse(decoded);
      });
  }

  function putFile(filename, data, message) {
    var json = JSON.stringify(data, null, 2);
    var encoded = btoa(unescape(encodeURIComponent(json)));
    var body = {
      message: message || 'Update ' + filename,
      content: encoded,
      sha: shas[filename],
      branch: BRANCH
    };
    return fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + BASE_PATH + filename, {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify(body)
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(err) { throw new Error(err.message || 'Save failed'); });
      return r.json();
    })
    .then(function(result) {
      shas[filename] = result.content.sha;
      return result;
    });
  }

  // ===== IMAGE UPLOAD =====
  var UPLOAD_PATH = 'maya/images/uploads/';

  function uploadImage(file) {
    return new Promise(function(resolve, reject) {
      if (!file.type.match(/^image\//)) { reject(new Error('Not an image')); return; }
      // Resize if needed (max 1600px wide)
      var img = new Image();
      var reader = new FileReader();
      reader.onload = function(e) {
        img.onload = function() {
          var canvas = document.createElement('canvas');
          var maxW = 1600;
          var w = img.width;
          var h = img.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          // Convert to JPEG for smaller size, or keep PNG if it has transparency
          var mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          var quality = 0.85;
          var dataUrl = canvas.toDataURL(mime, quality);
          var base64 = dataUrl.split(',')[1];
          var ext = mime === 'image/png' ? '.png' : '.jpg';
          var filename = Date.now() + '-' + file.name.replace(/[^a-z0-9.]/gi, '-').toLowerCase().replace(/\.[^.]+$/, '') + ext;
          var filePath = UPLOAD_PATH + filename;

          // Commit to GitHub
          var body = {
            message: 'Upload image: ' + filename,
            content: base64,
            branch: BRANCH
          };
          fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + filePath, {
            method: 'PUT',
            headers: apiHeaders(),
            body: JSON.stringify(body)
          })
          .then(function(r) {
            if (!r.ok) return r.json().then(function(err) { throw new Error(err.message || 'Upload failed'); });
            return r.json();
          })
          .then(function(result) {
            // Return the GitHub Pages URL for the image
            var url = 'https://clients.pietsuess.com/' + filePath;
            resolve(url);
          })
          .catch(reject);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function triggerUpload(inputId, previewId) {
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = function() {
      if (!fileInput.files.length) return;
      toast('Uploading image...');
      uploadImage(fileInput.files[0])
        .then(function(url) {
          $(inputId).value = url;
          if (previewId) {
            $(previewId).innerHTML = '<img src="' + url + '" alt="Preview">';
          }
          toast('Image uploaded!');
        })
        .catch(function(err) { toast('Image upload failed: ' + err.message, true); });
    };
    fileInput.click();
  }

  // ===== AUTH =====
  function checkSetupToken() {
    var hash = location.hash;
    if (hash.indexOf('#setup=') === 0) {
      var t = hash.substring(7);
      localStorage.setItem('maya-cms-token', t);
      location.hash = '';
      return t;
    }
    return null;
  }

  function initAuth() {
    if (DEMO) {
      $('login-screen').style.display = 'none';
      $('app').style.display = 'block';
      $('user-name').textContent = 'Demo Mode';
      loadAllContentLocal();
      return;
    }
    var setupToken = checkSetupToken();
    token = setupToken || localStorage.getItem('maya-cms-token') || '';
    if (token) {
      tryLogin(token);
    }
  }

  function loadAllContentLocal() {
    Promise.all([
      fetch('../content/shows.json').then(function(r){return r.json()}).then(function(d){shows=d}),
      fetch('../content/media.json').then(function(r){return r.json()}).then(function(d){media=d}),
      fetch('../content/shop.json').then(function(r){return r.json()}).then(function(d){shop=d}),
      fetch('../content/settings.json').then(function(r){return r.json()}).then(function(d){settings=d})
    ])
    .then(function() {
      loadDrafts();
      updateDashboard();
      renderShowsList();
      renderMediaList();
      renderShopList();
      loadSettings();
      updatePublishBar();
      toast('Demo mode - edits save locally only');
    })
    .catch(function(err) {
      toast('Error loading content: ' + err.message, true);
    });
  }

  function tryLogin(t) {
    token = t;
    $('login-btn').disabled = true;
    $('login-btn').textContent = 'Connecting...';
    $('login-error').textContent = '';
    getUser()
      .then(function(user) {
        localStorage.setItem('maya-cms-token', token);
        $('user-name').textContent = user.login;
        $('login-screen').style.display = 'none';
        $('app').style.display = 'block';
        loadAllContent();
      })
      .catch(function(err) {
        $('login-error').textContent = 'Could not connect. Check your token.';
        $('login-btn').disabled = false;
        $('login-btn').textContent = 'Connect';
        token = '';
      });
  }

  $('login-btn').addEventListener('click', function() {
    var t = $('token-input').value.trim();
    if (!t) return;
    tryLogin(t);
  });

  $('token-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') $('login-btn').click();
  });

  $('logout-btn').addEventListener('click', function() {
    localStorage.removeItem('maya-cms-token');
    token = '';
    $('app').style.display = 'none';
    $('login-screen').style.display = 'block';
    $('token-input').value = '';
    $('login-btn').disabled = false;
    $('login-btn').textContent = 'Connect';
  });

  // ===== LOAD CONTENT =====
  function loadAllContent() {
    Promise.all([
      getFile('shows.json').then(function(d) { shows = d; }),
      getFile('media.json').then(function(d) { media = d; }),
      getFile('shop.json').then(function(d) { shop = d; }),
      getFile('settings.json').then(function(d) { settings = d; })
    ])
    .then(function() {
      // Apply any pending drafts over the fetched data
      loadDrafts();
      updateDashboard();
      renderShowsList();
      renderMediaList();
      renderShopList();
      loadSettings();
      updatePublishBar();
    })
    .catch(function(err) {
      toast('Error loading content: ' + err.message, true);
    });
  }

  // ===== NAVIGATION =====
  function showSection(name) {
    document.querySelectorAll('.admin-section').forEach(function(el) { el.style.display = 'none'; });
    var section = $('section-' + name);
    if (section) section.style.display = 'block';
    document.querySelectorAll('.nav-item').forEach(function(el) {
      el.classList.toggle('active', el.dataset.section === name);
    });
  }

  document.querySelectorAll('.nav-item, .dash-card').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      var s = this.dataset.section;
      if (s) { showSection(s); location.hash = s; }
    });
  });

  window.addEventListener('hashchange', function() {
    var h = location.hash.replace('#', '') || 'dashboard';
    // Don't navigate for setup tokens
    if (h.indexOf('setup=') === 0) return;
    showSection(h);
  });

  // ===== DASHBOARD =====
  function updateDashboard() {
    $('count-shows').textContent = shows.length;
    $('count-media').textContent = media.length;
    $('count-shop').textContent = shop.length;
  }

  // ===== TOAST =====
  function toast(msg, isError) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast visible' + (isError ? ' error' : '');
    setTimeout(function() { el.className = 'toast'; }, 3000);
  }

  // ===== HELPER =====
  function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ===== SHOWS =====
  function renderShowsList() {
    var html = '';
    shows.forEach(function(show, i) {
      html += '<div class="item-row">';
      html += '<div class="item-info"><h3>' + escHtml(show.title);
      if (show.isUpcoming) html += '<span class="upcoming-badge">Upcoming</span>';
      html += '</h3><p>' + formatDate(show.date) + ' &bull; ' + escHtml(show.time) + '</p></div>';
      html += '<div class="item-actions">';
      if (i > 0) html += '<button class="btn-small" onclick="CMS.moveShow(' + i + ',-1)" title="Move up">&uarr;</button>';
      if (i < shows.length - 1) html += '<button class="btn-small" onclick="CMS.moveShow(' + i + ',1)" title="Move down">&darr;</button>';
      html += '<button class="btn-small" onclick="CMS.editShow(' + i + ')">Edit</button>';
      html += '<button class="btn-danger" onclick="CMS.deleteShow(' + i + ')">Delete</button>';
      html += '</div></div>';
    });
    $('shows-list').innerHTML = html || '<p style="color:#999;">No shows yet.</p>';
  }

  function moveShow(index, direction) {
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= shows.length) return;
    var temp = shows[index];
    shows[index] = shows[newIndex];
    shows[newIndex] = temp;
    markDirty('shows.json');
    toast('Order updated. Click Publish when ready.');
    renderShowsList();
  }

  function editShow(index) {
    editingIndex = index;
    var show = index >= 0 ? shows[index] : null;
    $('show-edit-title').textContent = show ? 'Edit Show' : 'New Show';
    $('show-title').value = show ? show.title : '';
    $('show-date').value = show ? show.date : '';
    $('show-time').value = show ? show.time : '';
    $('show-doors').value = show ? show.doors : '';
    $('show-theme').value = show ? show.theme : '';
    $('show-performers').value = show ? (show.performers || []).join(', ') : '';
    $('show-accompaniment').value = show ? show.accompaniment : '';
    $('show-emcee').value = show ? show.emcee : 'Maya Suess';
    $('show-ticket-url').value = show ? show.ticketUrl : '';
    $('show-poster').value = show ? show.posterImage : '';
    $('show-upcoming').checked = show ? show.isUpcoming : false;

    // Poster preview
    var posterPreview = $('show-poster-preview');
    if (show && show.posterImage) {
      posterPreview.innerHTML = '<img src="../' + escHtml(show.posterImage) + '" alt="Poster preview">';
    } else {
      posterPreview.innerHTML = '';
    }

    if (!showDescQuill) {
      showDescQuill = new Quill('#show-description-editor', {
        theme: 'snow',
        modules: {
          toolbar: [
            ['bold', 'italic'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link'],
            ['clean']
          ]
        }
      });
    }
    showDescQuill.root.innerHTML = show ? (show.description || '') : '';
    showSection('show-edit');
  }

  function saveShow() {
    var title = $('show-title').value.trim();
    if (!title) { toast('Title is required', true); return; }

    var performersStr = $('show-performers').value.trim();
    var performers = performersStr ? performersStr.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; }) : [];

    var descHtml = showDescQuill.root.innerHTML;
    // Quill puts <p><br></p> for empty content, normalize that to empty string
    if (descHtml === '<p><br></p>' || descHtml === '<p></p>') descHtml = '';

    var show = {
      title: title,
      date: $('show-date').value,
      time: $('show-time').value.trim(),
      doors: $('show-doors').value.trim(),
      theme: $('show-theme').value.trim(),
      performers: performers,
      accompaniment: $('show-accompaniment').value.trim(),
      emcee: $('show-emcee').value.trim(),
      ticketUrl: $('show-ticket-url').value.trim(),
      posterImage: $('show-poster').value.trim(),
      isUpcoming: $('show-upcoming').checked,
      description: descHtml
    };

    if (editingIndex >= 0) {
      shows[editingIndex] = show;
    } else {
      shows.unshift(show);
    }

    markDirty('shows.json');
    toast('Draft saved. Click Publish when ready.');
    renderShowsList();
    updateDashboard();
    showSection('shows');
  }

  function deleteShow(index) {
    if (!confirm('Delete "' + shows[index].title + '"? This cannot be undone.')) return;
    shows.splice(index, 1);
    markDirty('shows.json');
    toast('Show deleted. Click Publish when ready.');
    renderShowsList();
    updateDashboard();
  }

  $('new-show-btn').addEventListener('click', function() { editShow(-1); });
  $('show-save-btn').addEventListener('click', saveShow);
  $('show-cancel-btn').addEventListener('click', function() { showSection('shows'); });
  $('show-poster-upload-btn').addEventListener('click', function() {
    triggerUpload('show-poster', 'show-poster-preview');
  });

  // ===== MEDIA =====
  function renderMediaList() {
    var html = '';
    media.forEach(function(item, i) {
      html += '<div class="item-row">';
      html += '<div class="item-info" style="display:flex;align-items:center;gap:12px;">';
      if (item.src) html += '<img src="../' + escHtml(item.src) + '" alt="" style="width:60px;height:40px;object-fit:cover;border-radius:4px;">';
      html += '<div><h3>' + escHtml(item.caption) + '</h3>';
      html += '<p>' + escHtml(item.credit) + ' &bull; ' + escHtml(item.type) + '</p></div></div>';
      html += '<div class="item-actions">';
      if (i > 0) html += '<button class="btn-small" onclick="CMS.moveMedia(' + i + ',-1)" title="Move up">&uarr;</button>';
      if (i < media.length - 1) html += '<button class="btn-small" onclick="CMS.moveMedia(' + i + ',1)" title="Move down">&darr;</button>';
      html += '<button class="btn-small" onclick="CMS.editMedia(' + i + ')">Edit</button>';
      html += '<button class="btn-danger" onclick="CMS.deleteMedia(' + i + ')">Delete</button>';
      html += '</div></div>';
    });
    $('media-list').innerHTML = html || '<p style="color:#999;">No media yet.</p>';
  }

  function moveMedia(index, direction) {
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= media.length) return;
    var temp = media[index];
    media[index] = media[newIndex];
    media[newIndex] = temp;
    markDirty('media.json');
    toast('Order updated. Click Publish when ready.');
    renderMediaList();
  }

  function editMedia(index) {
    editingIndex = index;
    var item = index >= 0 ? media[index] : null;
    $('media-edit-title').textContent = item ? 'Edit Media' : 'New Media';
    $('media-src').value = item ? item.src : '';
    $('media-caption').value = item ? item.caption : '';
    $('media-credit').value = item ? item.credit : '';
    $('media-type').value = item ? item.type : 'photo';

    // Image preview
    var preview = $('media-src-preview');
    if (item && item.src) {
      preview.innerHTML = '<img src="../' + escHtml(item.src) + '" alt="Preview">';
    } else {
      preview.innerHTML = '';
    }

    showSection('media-edit');
  }

  function saveMedia() {
    var caption = $('media-caption').value.trim();
    if (!caption) { toast('Caption is required', true); return; }

    var item = {
      src: $('media-src').value.trim(),
      caption: caption,
      credit: $('media-credit').value.trim(),
      type: $('media-type').value
    };

    if (editingIndex >= 0) {
      media[editingIndex] = item;
    } else {
      media.push(item);
    }

    markDirty('media.json');
    toast('Draft saved. Click Publish when ready.');
    renderMediaList();
    updateDashboard();
    showSection('media');
  }

  function deleteMedia(index) {
    if (!confirm('Delete this media item?')) return;
    media.splice(index, 1);
    markDirty('media.json');
    toast('Media deleted. Click Publish when ready.');
    renderMediaList();
    updateDashboard();
  }

  $('new-media-btn').addEventListener('click', function() { editMedia(-1); });
  $('media-save-btn').addEventListener('click', saveMedia);
  $('media-cancel-btn').addEventListener('click', function() { showSection('media'); });
  $('media-src-upload-btn').addEventListener('click', function() {
    triggerUpload('media-src', 'media-src-preview');
  });

  // ===== SHOP =====
  function renderShopList() {
    var html = '';
    shop.forEach(function(item, i) {
      html += '<div class="item-row">';
      html += '<div class="item-info"><h3>' + escHtml(item.title);
      if (!item.available) html += '<span class="draft-badge">Unavailable</span>';
      html += '</h3><p>' + escHtml(item.description);
      if (item.price) html += ' &bull; ' + escHtml(item.price);
      html += '</p></div>';
      html += '<div class="item-actions">';
      if (i > 0) html += '<button class="btn-small" onclick="CMS.moveShop(' + i + ',-1)" title="Move up">&uarr;</button>';
      if (i < shop.length - 1) html += '<button class="btn-small" onclick="CMS.moveShop(' + i + ',1)" title="Move down">&darr;</button>';
      html += '<button class="btn-small" onclick="CMS.editShop(' + i + ')">Edit</button>';
      html += '<button class="btn-danger" onclick="CMS.deleteShop(' + i + ')">Delete</button>';
      html += '</div></div>';
    });
    $('shop-list').innerHTML = html || '<p style="color:#999;">No shop items yet.</p>';
  }

  function moveShop(index, direction) {
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= shop.length) return;
    var temp = shop[index];
    shop[index] = shop[newIndex];
    shop[newIndex] = temp;
    markDirty('shop.json');
    toast('Order updated. Click Publish when ready.');
    renderShopList();
  }

  function editShop(index) {
    editingIndex = index;
    var item = index >= 0 ? shop[index] : null;
    $('shop-edit-title').textContent = item ? 'Edit Item' : 'New Item';
    $('shop-item-title').value = item ? item.title : '';
    $('shop-item-description').value = item ? item.description : '';
    $('shop-item-price').value = item ? item.price : '';
    $('shop-item-image').value = item ? item.image : '';
    $('shop-item-buy-url').value = item ? item.buyUrl : '';
    $('shop-item-available').checked = item ? item.available : false;

    // Image preview
    var preview = $('shop-image-preview');
    if (item && item.image) {
      preview.innerHTML = '<img src="' + escHtml(item.image) + '" alt="Preview">';
    } else {
      preview.innerHTML = '';
    }

    showSection('shop-edit');
  }

  function saveShop() {
    var title = $('shop-item-title').value.trim();
    if (!title) { toast('Title is required', true); return; }

    var item = {
      title: title,
      description: $('shop-item-description').value.trim(),
      price: $('shop-item-price').value.trim(),
      image: $('shop-item-image').value.trim(),
      buyUrl: $('shop-item-buy-url').value.trim(),
      available: $('shop-item-available').checked
    };

    if (editingIndex >= 0) {
      shop[editingIndex] = item;
    } else {
      shop.push(item);
    }

    markDirty('shop.json');
    toast('Draft saved. Click Publish when ready.');
    renderShopList();
    updateDashboard();
    showSection('shop');
  }

  function deleteShop(index) {
    if (!confirm('Delete "' + shop[index].title + '"?')) return;
    shop.splice(index, 1);
    markDirty('shop.json');
    toast('Item deleted. Click Publish when ready.');
    renderShopList();
    updateDashboard();
  }

  $('new-shop-btn').addEventListener('click', function() { editShop(-1); });
  $('shop-save-btn').addEventListener('click', saveShop);
  $('shop-cancel-btn').addEventListener('click', function() { showSection('shop'); });
  $('shop-image-upload-btn').addEventListener('click', function() {
    triggerUpload('shop-item-image', 'shop-image-preview');
  });

  // ===== SETTINGS =====
  function loadSettings() {
    $('setting-siteName').value = settings.siteName || '';
    $('setting-tagline').value = settings.tagline || '';
    $('setting-venue').value = settings.venue || '';
    $('setting-venueAddress').value = settings.venueAddress || '';
    $('setting-instagramShow').value = settings.instagramShow || '';
    $('setting-instagramMaya').value = settings.instagramMaya || '';
    $('setting-ticketPlatform').value = settings.ticketPlatform || '';
    $('setting-parksideUrl').value = settings.parksideUrl || '';
    $('setting-accessibilityNote').value = settings.accessibilityNote || '';
    $('setting-aboutText').value = settings.aboutText || '';
    $('setting-pressLinks').value = settings.pressLinks ? JSON.stringify(settings.pressLinks, null, 2) : '[]';
  }

  function saveSettings() {
    settings.siteName = $('setting-siteName').value.trim();
    settings.tagline = $('setting-tagline').value.trim();
    settings.venue = $('setting-venue').value.trim();
    settings.venueAddress = $('setting-venueAddress').value.trim();
    settings.instagramShow = $('setting-instagramShow').value.trim();
    settings.instagramMaya = $('setting-instagramMaya').value.trim();
    settings.ticketPlatform = $('setting-ticketPlatform').value.trim();
    settings.parksideUrl = $('setting-parksideUrl').value.trim();
    settings.accessibilityNote = $('setting-accessibilityNote').value.trim();
    settings.aboutText = $('setting-aboutText').value.trim();

    // Parse press links JSON
    try {
      settings.pressLinks = JSON.parse($('setting-pressLinks').value);
    } catch(e) {
      toast('Press Links JSON is invalid. Check your formatting.', true);
      return;
    }

    markDirty('settings.json');
    toast('Draft saved. Click Publish when ready.');
  }

  $('settings-save-btn').addEventListener('click', saveSettings);

  // ===== PUBLISH / DISCARD =====
  $('publish-btn').addEventListener('click', publishAll);
  $('discard-btn').addEventListener('click', discardDrafts);

  // ===== GLOBAL CMS OBJECT =====
  window.CMS = {
    editShow: editShow,
    deleteShow: deleteShow,
    moveShow: moveShow,
    editMedia: editMedia,
    deleteMedia: deleteMedia,
    moveMedia: moveMedia,
    editShop: editShop,
    deleteShop: deleteShop,
    moveShop: moveShop
  };

  // ===== INIT =====
  initAuth();

  // Handle initial hash
  var initHash = location.hash.replace('#', '');
  if (initHash && initHash.indexOf('setup=') !== 0) {
    showSection(initHash);
  }

})();
