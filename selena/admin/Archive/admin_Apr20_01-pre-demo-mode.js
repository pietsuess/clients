/* admin.js -- CMS admin panel powered by GitHub API */

(function() {

  // ===== CONFIG =====
  var OWNER = 'slbrooy';
  var REPO = 'slbrooy.github.io';
  var BRANCH = 'main';
  var API = 'https://api.github.com';

  var SITES = {
    rolfing: { name: 'Salt Spring Rolfing', path: 'rolfing/' },
    rhizome: { name: 'Rhizome Springs', path: 'rhizome/' }
  };
  var currentSite = localStorage.getItem('selena-cms-site') || 'rolfing';
  var BASE_PATH = SITES[currentSite].path + 'content/';
  var UPLOAD_PATH_PREFIX = SITES[currentSite].path;

  // ===== STATE =====
  var token = '';
  var shas = {}; // { filename: sha }
  var blogPosts = [];
  var testimonials = [];
  var faqs = [];
  var settings = {};
  var pages = {};
  var editingIndex = -1; // -1 = new, >= 0 = editing existing
  var editingPageKey = '';
  var editingSectionIndex = -1;
  var postQuill = null;
  var faqQuill = null;
  var pageSectionQuill = null;
  var editingColumn = ''; // '' or 'right' for two-column sections
  var pendingChanges = {}; // { filename: true } tracks which files have unpublished changes
  var pendingDeletes = []; // old HTML filenames to delete on publish
  var DRAFT_KEY = 'selena-cms-drafts-' + currentSite;
  var ORIGINAL_PAGES = ['index.html','about-selena.html','about-sessions.html','blog.html','faqs.html','contact.html','booking.html','about.html','events.html','shop.html'];

  // ===== SITE SWITCHER =====
  function populateSitePicker() {
    var picker = $('site-picker');
    picker.innerHTML = '';
    Object.keys(SITES).forEach(function(key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = SITES[key].name;
      picker.appendChild(opt);
    });
    picker.value = currentSite;
    $('site-title').textContent = SITES[currentSite].name;
  }

  function switchSite(siteKey) {
    if (!SITES[siteKey]) return;
    // Save any pending drafts for current site before switching
    if (Object.keys(pendingChanges).length > 0) {
      if (!confirm('You have unpublished changes. Switch site anyway? (Drafts will be lost)')) {
        $('site-picker').value = currentSite;
        return;
      }
    }
    currentSite = siteKey;
    localStorage.setItem('selena-cms-site', siteKey);
    BASE_PATH = SITES[siteKey].path + 'content/';
    UPLOAD_PATH = SITES[siteKey].path + 'images/uploads/';
    UPLOAD_PATH_PREFIX = SITES[siteKey].path;
    $('site-title').textContent = SITES[siteKey].name;
    // Reset state
    shas = {};
    blogPosts = [];
    testimonials = [];
    faqs = [];
    events = [];
    products = [];
    settings = {};
    pages = {};
    pendingChanges = {};
    localStorage.removeItem(DRAFT_KEY);
    DRAFT_KEY = 'selena-cms-drafts-' + siteKey;
    updatePublishBar();
    // Reload content for new site
    loadAllContent();
    showSection('dashboard');
  }

  // ===== DRAFTS =====
  function saveDrafts() {
    var drafts = {
      blogPosts: blogPosts,
      testimonials: testimonials,
      faqs: faqs,
      settings: settings,
      pages: pages,
      events: events,
      products: products,
      pending: pendingChanges,
      deletes: pendingDeletes
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
        blogPosts = drafts.blogPosts || blogPosts;
        testimonials = drafts.testimonials || testimonials;
        faqs = drafts.faqs || faqs;
        settings = drafts.settings || settings;
        pages = drafts.pages || pages;
        events = drafts.events || events;
        products = drafts.products || products;
        pendingChanges = drafts.pending || {};
        pendingDeletes = drafts.deletes || [];
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

    $('publish-btn').disabled = true;
    $('publish-btn').textContent = 'Publishing...';

    var dataMap = {
      'blog-posts.json': blogPosts,
      'testimonials.json': testimonials,
      'faqs.json': faqs,
      'site-settings.json': settings,
      'pages.json': pages,
      'events.json': events,
      'products.json': products
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
        // Generate HTML for any new pages that don't have files yet
        if (files.indexOf('pages.json') >= 0) {
          return generatePageHTMLFiles();
        }
      })
      .then(function() {
        // Delete old HTML files from renamed/re-URLed pages
        if (pendingDeletes.length > 0) {
          return deleteOldFiles().then(function() { pendingDeletes = []; });
        }
      })
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

  function deleteOldFiles() {
    var SITE_PATH = UPLOAD_PATH_PREFIX;
    var chain = Promise.resolve();
    pendingDeletes.forEach(function(oldUrl) {
      var filePath = SITE_PATH + oldUrl;
      chain = chain.then(function() {
        // Get the file's SHA first (required for deletion)
        return fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + filePath + '?ref=' + BRANCH, { headers: apiHeaders() })
          .then(function(r) {
            if (!r.ok) return null; // File doesn't exist, skip
            return r.json();
          })
          .then(function(existing) {
            if (!existing || !existing.sha) return;
            return fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + filePath, {
              method: 'DELETE',
              headers: apiHeaders(),
              body: JSON.stringify({
                message: 'Delete renamed page: ' + oldUrl,
                sha: existing.sha,
                branch: BRANCH
              })
            });
          })
          .then(function(r) {
            if (r && !r.ok) console.warn('Failed to delete ' + oldUrl);
          });
      });
    });
    return chain;
  }

  function generatePageHTML(pageKey) {
    var page = pages[pageKey];
    var url = page.url || pageKey + '.html';
    var siteName = SITES[currentSite] ? SITES[currentSite].name : 'Salt Spring Rolfing';
    var title = page.title + ' - ' + siteName;

    return '<!DOCTYPE html>\n' +
      '<html lang="en">\n<head>\n' +
      '  <meta charset="UTF-8">\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '  <title>' + title + '</title>\n' +
      '  <link rel="preconnect" href="https://fonts.googleapis.com">\n' +
      '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
      '  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">\n' +
      '  <link rel="stylesheet" href="css/style.css">\n' +
      '</head>\n<body>\n\n' +
      '  <header class="solid">\n' +
      '    <div class="container">\n' +
      '      <a href="index.html" class="logo"><img src="images/logo-light.webp" alt="Salt Spring Rolfing" class="logo-light"><img src="images/logo-dark.webp" alt="Salt Spring Rolfing" class="logo-dark"></a>\n' +
      '      <button class="nav-toggle" aria-label="Toggle navigation"><span></span><span></span><span></span></button>\n' +
      '      <nav></nav>\n' +
      '    </div>\n' +
      '  </header>\n\n' +
      '  <section class="hero hero-short" style="background-image:url(\'' + (page.heroImage || '') + '\');">\n' +
      '    <div class="hero-content">\n' +
      '      <h1>' + page.title + '</h1>\n' +
      '    </div>\n' +
      '  </section>\n' +
      '  <div class="hero-spacer"></div>\n\n' +
      '  <section>\n' +
      '    <div class="container">\n' +
      '      <div id="page-content"></div>\n' +
      '    </div>\n' +
      '  </section>\n\n' +
      '  <footer>\n' +
      '    <div class="container">\n' +
      '      <div class="logo-footer"><img src="images/logo-dark.webp" alt="Salt Spring Rolfing"></div>\n' +
      '      <div class="footer-address"><p></p></div>\n' +
      '      <div class="footer-cta"><a href="booking.html" class="btn">Book A Session</a></div>\n' +
      '    </div>\n' +
      '    <nav class="footer-nav"></nav>\n' +
      '  </footer>\n\n' +
      '  <script>\n' +
      '    var header = document.querySelector("header");\n' +
      '    document.querySelector(".nav-toggle").addEventListener("click", function() {\n' +
      '      document.querySelector("nav").classList.toggle("active");\n' +
      '      header.classList.toggle("nav-open");\n' +
      '    });\n' +
      '  </script>\n' +
      '  <script src="js/site.js"></script>\n' +
      '</body>\n</html>';
  }

  function generatePageHTMLFiles() {
    var SITE_PATH = UPLOAD_PATH_PREFIX;
    var chain = Promise.resolve();

    Object.keys(pages).forEach(function(key) {
      var page = pages[key];
      var url = page.url || key + '.html';
      // Skip pages that are part of the original site (they already have HTML)
      var originals = ORIGINAL_PAGES;
      if (originals.indexOf(url) >= 0) return;

      var filePath = SITE_PATH + url;
      var html = generatePageHTML(key);
      var encoded = btoa(unescape(encodeURIComponent(html)));

      chain = chain.then(function() {
        // Check if file exists first
        return fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + filePath + '?ref=' + BRANCH, { headers: apiHeaders() })
          .then(function(r) {
            if (r.ok) return r.json(); // File exists, update it
            return null; // File doesn't exist
          })
          .then(function(existing) {
            var body = {
              message: 'Generate page: ' + url,
              content: encoded,
              branch: BRANCH
            };
            if (existing && existing.sha) body.sha = existing.sha;
            return fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + filePath, {
              method: 'PUT',
              headers: apiHeaders(),
              body: JSON.stringify(body)
            });
          })
          .then(function(r) {
            if (!r.ok) return r.json().then(function(e) { console.warn('Failed to generate ' + url, e); });
          });
      });
    });

    return chain;
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
  var UPLOAD_PATH = UPLOAD_PATH_PREFIX + 'images/uploads/';
  var imageCache = {}; // { relativePath: dataUrl } for instant preview

  function getImageUrl(relativePath) {
    // Return cached data URL if available, otherwise the GitHub Pages URL
    if (imageCache[relativePath]) return imageCache[relativePath];
    return '/' + UPLOAD_PATH_PREFIX + relativePath;
  }

  function uploadImage(file) {
    return new Promise(function(resolve, reject) {
      if (!file.type.match(/^image\//)) { reject(new Error('Not an image')); return; }
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
          var mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          var quality = 0.85;
          var dataUrl = canvas.toDataURL(mime, quality);
          var base64 = dataUrl.split(',')[1];
          var ext = mime === 'image/png' ? '.png' : '.jpg';
          var filename = Date.now() + '-' + file.name.replace(/[^a-z0-9.]/gi, '-').toLowerCase().replace(/\.[^.]+$/, '') + ext;
          var filePath = UPLOAD_PATH + filename;
          var relativePath = 'images/uploads/' + filename;

          // Cache the data URL for instant preview
          imageCache[relativePath] = dataUrl;

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
            resolve(relativePath);
          })
          .catch(reject);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function setupQuillImageHandler(quill) {
    // Toolbar button handler
    quill.getModule('toolbar').addHandler('image', function() {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = function() {
        if (!input.files.length) return;
        toast('Uploading image...');
        uploadImage(input.files[0])
          .then(function(url) {
            var range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', url);
            quill.setSelection(range.index + 1);
            toast('Image uploaded!');
          })
          .catch(function(err) { toast('Image upload failed: ' + err.message, true); });
      };
      input.click();
    });

    // Drag and drop handler
    quill.root.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      var file = files[0];
      if (!file.type.match(/^image\//)) return;
      toast('Uploading image...');
      uploadImage(file)
        .then(function(url) {
          var range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'image', url);
          quill.setSelection(range.index + 1);
          toast('Image uploaded!');
        })
        .catch(function(err) { toast('Image upload failed: ' + err.message, true); });
    });

    quill.root.addEventListener('dragover', function(e) {
      e.preventDefault();
    });
  }

  // ===== AUTH =====
  function checkSetupToken() {
    var hash = location.hash;
    if (hash.indexOf('#setup=') === 0) {
      var t = hash.substring(7);
      localStorage.setItem('selena-cms-token', t);
      location.hash = '';
      return t;
    }
    return null;
  }

  function initAuth() {
    var setupToken = checkSetupToken();
    token = setupToken || localStorage.getItem('selena-cms-token') || '';
    if (token) {
      tryLogin(token);
    }
  }

  function tryLogin(t) {
    token = t;
    $('login-btn').disabled = true;
    $('login-btn').textContent = 'Connecting...';
    $('login-error').textContent = '';
    getUser()
      .then(function(user) {
        localStorage.setItem('selena-cms-token', token);
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
    localStorage.removeItem('selena-cms-token');
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
      getFile('blog-posts.json').then(function(d) { blogPosts = d; }),
      getFile('testimonials.json').then(function(d) { testimonials = d; }),
      getFile('faqs.json').then(function(d) { faqs = d; }),
      getFile('site-settings.json').then(function(d) { settings = d; }),
      getFile('pages.json').then(function(d) { pages = d; }),
      getFile('events.json').then(function(d) { events = d; }).catch(function() { events = []; }),
      getFile('products.json').then(function(d) { products = d; }).catch(function() { products = []; })
    ])
    .then(function() {
      // Apply any pending drafts over the fetched data
      loadDrafts();
      updateDashboard();
      renderBlogList();
      renderTestimonialsList();
      renderFaqsList();
      if (typeof renderEventsList === 'function') renderEventsList();
      if (typeof renderProductsList === 'function') renderProductsList();
      loadSettings();
      updatePublishBar();
      // Populate pages dropdown and render preview
      if (pagePicker) { populatePagePicker(); renderPagePreview(); }
      renderNavList();
      if (typeof loadNewsletterData === 'function') loadNewsletterData();
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
    // Expand main for visual editor
    var main = $('admin-main');
    if (name === 'pages') {
      main.style.maxWidth = 'none';
      main.style.padding = '0';
      if (typeof initVisualEditor === 'function') initVisualEditor();
    } else {
      main.style.maxWidth = '';
      main.style.padding = '';
    }
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
    $('count-blog').textContent = blogPosts.filter(function(p) { return p.published; }).length;
    $('count-testimonials').textContent = testimonials.length;
    $('count-faqs').textContent = faqs.length;
    if ($('count-events')) $('count-events').textContent = events.filter(function(e) { return e.published; }).length;
    var pageCount = 0;
    Object.keys(pages).forEach(function(k) { pageCount += pages[k].sections.length; });
    $('count-pages').textContent = pageCount;
  }

  // ===== TOAST =====
  function toast(msg, isError) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast visible' + (isError ? ' error' : '');
    setTimeout(function() { el.className = 'toast'; }, 3000);
  }

  // ===== SLUGIFY =====
  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // ===== BLOG =====
  function renderBlogList() {
    var html = '';
    blogPosts.forEach(function(post, i) {
      html += '<div class="item-row">';
      html += '<div class="item-info"><h3>' + post.title;
      if (!post.published) html += '<span class="draft-badge">Draft</span>';
      html += '</h3><p>' + post.date + ' &bull; ' + post.author + '</p></div>';
      html += '<div class="item-actions">';
      if (i > 0) html += '<button class="btn-small" onclick="CMS.movePost(' + i + ',-1)" title="Move up">&uarr;</button>';
      if (i < blogPosts.length - 1) html += '<button class="btn-small" onclick="CMS.movePost(' + i + ',1)" title="Move down">&darr;</button>';
      html += '<button class="btn-small" onclick="CMS.editPost(' + i + ')">Edit</button>';
      html += '<button class="btn-danger" onclick="CMS.deletePost(' + i + ')">Delete</button>';
      html += '</div></div>';
    });
    $('blog-list').innerHTML = html || '<p style="color:#999;">No blog posts yet.</p>';
  }

  function movePost(index, direction) {
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= blogPosts.length) return;
    var temp = blogPosts[index];
    blogPosts[index] = blogPosts[newIndex];
    blogPosts[newIndex] = temp;
    markDirty('blog-posts.json');
    renderBlogList();
  }

  function editPost(index) {
    editingIndex = index;
    var post = index >= 0 ? blogPosts[index] : null;
    $('blog-edit-title').textContent = post ? 'Edit Post' : 'New Post';
    $('post-title').value = post ? post.title : '';
    $('post-author').value = post ? post.author : 'Selena La Brooy';
    $('post-date').value = post ? post.date : new Date().toISOString().split('T')[0];
    $('post-excerpt').value = post ? post.excerpt : '';
    $('post-published').checked = post ? post.published : true;

    if (!postQuill) {
      postQuill = new Quill('#post-editor', {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ header: [2, 3, false] }],
            [{ size: ['10px','12px','14px','16px','18px','20px','24px','28px','32px'] }],
            ['bold', 'italic', 'underline'],
            [{ align: ['', 'center', 'right', 'justify'] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link', 'image'],
            ['clean']
          ]
        }
      });
      setupQuillImageHandler(postQuill);
    }
    postQuill.root.innerHTML = post ? post.body : '';
    showSection('blog-edit');
  }

  function savePost() {
    var title = $('post-title').value.trim();
    if (!title) { toast('Title is required', true); return; }

    var post = {
      id: editingIndex >= 0 ? blogPosts[editingIndex].id : slugify(title),
      title: title,
      date: $('post-date').value,
      author: $('post-author').value.trim() || 'Selena La Brooy',
      excerpt: $('post-excerpt').value.trim(),
      body: postQuill.root.innerHTML,
      published: $('post-published').checked
    };

    if (editingIndex >= 0) {
      blogPosts[editingIndex] = post;
    } else {
      blogPosts.push(post);
    }

    markDirty('blog-posts.json');
    toast('Draft saved. Click Publish when ready.');
    renderBlogList();
    updateDashboard();
    showSection('blog');
  }

  function deletePost(index) {
    if (!confirm('Delete "' + blogPosts[index].title + '"? This cannot be undone.')) return;
    blogPosts.splice(index, 1);
    markDirty('blog-posts.json');
    toast('Post deleted. Click Publish when ready.');
    renderBlogList();
    updateDashboard();
  }

  $('new-post-btn').addEventListener('click', function() { editPost(-1); });
  $('blog-save-btn').addEventListener('click', savePost);
  $('blog-cancel-btn').addEventListener('click', function() { showSection('blog'); });

  // ===== TESTIMONIALS =====
  function renderTestimonialsList() {
    var html = '<div class="reviews-grid-admin">';
    testimonials.forEach(function(t, i) {
      html += '<div class="review-card-admin">';
      html += '<div class="review-preview-quote">&ldquo;' + (t.quote.length > 150 ? t.quote.substring(0, 150) + '...' : t.quote) + '&rdquo;</div>';
      html += '<div class="review-preview-author"><strong>' + t.name + '</strong>';
      if (t.credentials) html += '<br><span style="color:#999;font-size:12px;">' + t.credentials + '</span>';
      html += '</div>';
      html += '<div class="review-preview-actions">';
      if (i > 0) html += '<button class="btn-small" onclick="CMS.moveTestimonial(' + i + ',-1)" title="Move left">&larr;</button>';
      if (i < testimonials.length - 1) html += '<button class="btn-small" onclick="CMS.moveTestimonial(' + i + ',1)" title="Move right">&rarr;</button>';
      html += '<button class="btn-small" onclick="CMS.editTestimonial(' + i + ')">Edit</button>';
      html += '<button class="btn-danger" onclick="CMS.deleteTestimonial(' + i + ')">Delete</button>';
      html += '</div></div>';
    });
    html += '</div>';
    $('testimonials-list').innerHTML = html || '<p style="color:#999;">No reviews yet.</p>';
  }

  function moveTestimonial(index, direction) {
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= testimonials.length) return;
    var temp = testimonials[index];
    testimonials[index] = testimonials[newIndex];
    testimonials[newIndex] = temp;
    markDirty('testimonials.json');
    toast('Order updated. Click Publish when ready.');
    renderTestimonialsList();
  }

  function editTestimonial(index) {
    editingIndex = index;
    var t = index >= 0 ? testimonials[index] : null;
    $('testimonial-edit-title').textContent = t ? 'Edit Review' : 'New Review';
    $('review-name').value = t ? t.name : '';
    $('review-credentials').value = t ? t.credentials : '';
    $('review-quote').value = t ? t.quote : '';
    showSection('testimonial-edit');
  }

  function saveTestimonial() {
    var name = $('review-name').value.trim();
    if (!name) { toast('Name is required', true); return; }

    var t = {
      id: editingIndex >= 0 ? testimonials[editingIndex].id : slugify(name),
      name: name,
      credentials: $('review-credentials').value.trim(),
      quote: $('review-quote').value.trim()
    };

    if (editingIndex >= 0) {
      testimonials[editingIndex] = t;
    } else {
      testimonials.push(t);
    }

    markDirty('testimonials.json');
    toast('Draft saved. Click Publish when ready.');
    renderTestimonialsList();
    updateDashboard();
    showSection('testimonials');
  }

  function deleteTestimonial(index) {
    if (!confirm('Delete review from "' + testimonials[index].name + '"?')) return;
    testimonials.splice(index, 1);
    markDirty('testimonials.json');
    toast('Review deleted. Click Publish when ready.');
    renderTestimonialsList();
    updateDashboard();
  }

  $('new-testimonial-btn').addEventListener('click', function() { editTestimonial(-1); });
  $('testimonial-save-btn').addEventListener('click', saveTestimonial);
  $('testimonial-cancel-btn').addEventListener('click', function() { showSection('testimonials'); });

  // ===== FAQS =====
  function renderFaqsList() {
    var html = '';
    faqs.sort(function(a, b) { return a.order - b.order; });
    faqs.forEach(function(f, i) {
      html += '<div class="item-row">';
      html += '<div class="item-info"><h3>' + f.question + '</h3></div>';
      html += '<div class="item-actions">';
      if (i > 0) html += '<button class="btn-small" onclick="CMS.moveFaq(' + i + ',-1)" title="Move up">&uarr;</button>';
      if (i < faqs.length - 1) html += '<button class="btn-small" onclick="CMS.moveFaq(' + i + ',1)" title="Move down">&darr;</button>';
      html += '<button class="btn-small" onclick="CMS.editFaq(' + i + ')">Edit</button>';
      html += '<button class="btn-danger" onclick="CMS.deleteFaq(' + i + ')">Delete</button>';
      html += '</div></div>';
    });
    $('faqs-list').innerHTML = html || '<p style="color:#999;">No FAQs yet.</p>';
  }

  function editFaq(index) {
    editingIndex = index;
    var f = index >= 0 ? faqs[index] : null;
    $('faq-edit-title').textContent = f ? 'Edit FAQ' : 'New FAQ';
    $('faq-question').value = f ? f.question : '';

    if (!faqQuill) {
      faqQuill = new Quill('#faq-editor', {
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
    faqQuill.root.innerHTML = f ? f.answer : '';
    showSection('faq-edit');
  }

  function saveFaq() {
    var question = $('faq-question').value.trim();
    if (!question) { toast('Question is required', true); return; }

    var f = {
      id: editingIndex >= 0 ? faqs[editingIndex].id : slugify(question),
      question: question,
      answer: faqQuill.root.innerHTML,
      order: editingIndex >= 0 ? faqs[editingIndex].order : faqs.length + 1
    };

    if (editingIndex >= 0) {
      faqs[editingIndex] = f;
    } else {
      faqs.push(f);
    }

    markDirty('faqs.json');
    toast('Draft saved. Click Publish when ready.');
    renderFaqsList();
    updateDashboard();
    showSection('faqs');
  }

  function deleteFaq(index) {
    if (!confirm('Delete this FAQ?')) return;
    faqs.splice(index, 1);
    faqs.forEach(function(f, i) { f.order = i + 1; });
    markDirty('faqs.json');
    toast('FAQ deleted. Click Publish when ready.');
    renderFaqsList();
    updateDashboard();
  }

  function moveFaq(index, direction) {
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= faqs.length) return;
    var temp = faqs[index];
    faqs[index] = faqs[newIndex];
    faqs[newIndex] = temp;
    faqs.forEach(function(f, i) { f.order = i + 1; });
    markDirty('faqs.json');
    toast('Order updated. Click Publish when ready.');
    renderFaqsList();
  }

  $('new-faq-btn').addEventListener('click', function() { editFaq(-1); });
  $('faq-save-btn').addEventListener('click', saveFaq);
  $('faq-cancel-btn').addEventListener('click', function() { showSection('faqs'); });

  // ===== SETTINGS =====
  function loadSettings() {
    $('setting-address').value = settings.address || '';
    $('setting-email').value = settings.email || '';
    $('setting-facebook').value = settings.facebookUrl || '';
    $('setting-calendly').value = settings.calendlyUrl || '';
    if ($('setting-etransfer')) $('setting-etransfer').value = settings.etransferEmail || '';
    if ($('setting-wise')) $('setting-wise').value = settings.wiseLink || '';
    if ($('setting-stripe-key')) $('setting-stripe-key').value = settings.stripePublishableKey || '';
    if ($('setting-kit-api-key')) $('setting-kit-api-key').value = settings.kitApiKey || '';
    if ($('setting-kit-api-secret')) $('setting-kit-api-secret').value = settings.kitApiSecret || '';
    if ($('setting-kit-form-id')) $('setting-kit-form-id').value = settings.kitFormId || '';
    // Fonts
    $('setting-font-heading').value = settings.fontHeading || "'Playfair Display', Georgia, serif";
    $('setting-font-body').value = settings.fontBody || "'Poppins', 'Helvetica Neue', Arial, sans-serif";
    // Colors
    $('setting-color-accent').value = settings.colorAccent || '#7C9A82';
    $('setting-color-secondary').value = settings.colorSecondary || '#C4846C';
    $('setting-color-bg').value = settings.colorBg || '#FAF8F5';
    $('setting-color-heading').value = settings.colorHeading || '#1A1A1A';
    $('setting-color-text').value = settings.colorText || '#2D2D2D';
    $('setting-color-bg-light').value = settings.colorBgLight || '#F0EDE8';
    // Logo
    updateLogoPreview();
    updateFontColorPreview();
  }

  function saveSettings() {
    settings.address = $('setting-address').value.trim();
    settings.email = $('setting-email').value.trim();
    settings.facebookUrl = $('setting-facebook').value.trim();
    settings.calendlyUrl = $('setting-calendly').value.trim();
    if ($('setting-etransfer')) settings.etransferEmail = $('setting-etransfer').value.trim();
    if ($('setting-wise')) settings.wiseLink = $('setting-wise').value.trim();
    if ($('setting-stripe-key')) settings.stripePublishableKey = $('setting-stripe-key').value.trim();
    if ($('setting-kit-api-key')) settings.kitApiKey = $('setting-kit-api-key').value.trim();
    if ($('setting-kit-api-secret')) settings.kitApiSecret = $('setting-kit-api-secret').value.trim();
    if ($('setting-kit-form-id')) settings.kitFormId = $('setting-kit-form-id').value.trim();
    // Fonts
    settings.fontHeading = $('setting-font-heading').value;
    settings.fontBody = $('setting-font-body').value;
    // Colors
    settings.colorAccent = $('setting-color-accent').value;
    settings.colorSecondary = $('setting-color-secondary').value;
    settings.colorBg = $('setting-color-bg').value;
    settings.colorHeading = $('setting-color-heading').value;
    settings.colorText = $('setting-color-text').value;
    settings.colorBgLight = $('setting-color-bg-light').value;

    markDirty('site-settings.json');
    toast('Draft saved. Click Publish when ready.');
  }

  // Live preview for fonts and colors
  function updateFontColorPreview() {
    var preview = $('font-color-preview');
    var headingEl = $('preview-heading');
    var bodyEl = $('preview-body');
    if (!preview) return;
    preview.style.background = $('setting-color-bg').value;
    headingEl.style.fontFamily = $('setting-font-heading').value;
    headingEl.style.color = $('setting-color-heading').value;
    bodyEl.style.fontFamily = $('setting-font-body').value;
    bodyEl.style.color = $('setting-color-text').value;
  }

  // Bind live preview to all font/color inputs
  ['setting-font-heading','setting-font-body','setting-color-accent','setting-color-secondary','setting-color-bg','setting-color-heading','setting-color-text','setting-color-bg-light'].forEach(function(id) {
    var el = $(id);
    if (el) el.addEventListener('input', updateFontColorPreview);
    if (el) el.addEventListener('change', updateFontColorPreview);
  });

  // Logo swap
  function changeLogo() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function() {
      if (!input.files.length) return;
      toast('Uploading logo...');
      uploadImage(input.files[0])
        .then(function(url) {
          var relPath = url;
          settings.logo = relPath;
          markDirty('site-settings.json');
          toast('Logo updated. Click Publish when ready.');
          updateLogoPreview();
        })
        .catch(function(err) { toast('Upload failed: ' + err.message, true); });
    };
    input.click();
  }

  function updateLogoPreview() {
    var container = $('logo-preview');
    if (!container) return;
    if (settings.logo) {
      container.innerHTML = '<img src="' + getImageUrl(settings.logo) + '" alt="Logo" style="max-height:60px;border-radius:6px;">';
    } else {
      container.innerHTML = '<span style="color:#999;font-size:13px;">No logo set</span>';
    }
  }

  $('settings-save-btn').addEventListener('click', saveSettings);

  // ===== NAVIGATION MANAGER =====
  function renderNavList() {
    // Combine page nav items and custom links, sorted by navOrder
    var items = [];

    Object.keys(pages).forEach(function(key) {
      var p = pages[key];
      items.push({
        type: 'page',
        key: key,
        label: p.navLabel || p.title,
        url: p.url || '',
        showInNav: p.showInNav || false,
        order: p.navOrder || 99
      });
    });

    (settings.customNavLinks || []).forEach(function(link, i) {
      items.push({
        type: 'custom',
        index: i,
        label: link.label,
        url: link.url,
        showInNav: true,
        order: link.order || 99
      });
    });

    items.sort(function(a, b) { return a.order - b.order; });

    var html = '';
    items.forEach(function(item, i) {
      var checked = item.showInNav ? 'checked' : '';
      html += '<div class="item-row">';
      html += '<div class="item-info" style="display:flex;align-items:center;gap:12px;">';
      if (item.type === 'page') {
        html += '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;">';
        html += '<input type="checkbox" ' + checked + ' onchange="CMS.togglePageNav(\'' + item.key + '\',this.checked)">';
        html += '</label>';
      }
      html += '<div><h3>' + item.label + '</h3>';
      html += '<p>' + (item.url || 'No URL set') + (item.type === 'custom' ? ' (custom link)' : '') + '</p></div>';
      html += '</div>';
      html += '<div class="item-actions">';
      if (i > 0) html += '<button class="btn-small" onclick="CMS.moveNavItem(' + i + ',-1)">&uarr;</button>';
      if (i < items.length - 1) html += '<button class="btn-small" onclick="CMS.moveNavItem(' + i + ',1)">&darr;</button>';
      if (item.type === 'custom') {
        html += '<button class="btn-small" onclick="CMS.editNavLink(' + item.index + ')">Edit</button>';
        html += '<button class="btn-danger" onclick="CMS.deleteNavLink(' + item.index + ')">Delete</button>';
      }
      html += '</div></div>';
    });
    $('nav-list').innerHTML = html || '<p style="color:#999;">No navigation items.</p>';
  }

  function togglePageNav(pageKey, show) {
    pages[pageKey].showInNav = show;
    markDirty('pages.json');
    renderNavList();
  }

  function addNavLink() {
    var label = prompt('Link label (shown in nav):');
    if (!label || !label.trim()) return;
    var url = prompt('URL (e.g., blog/footwear.html or https://example.com):');
    if (!url || !url.trim()) return;
    if (!settings.customNavLinks) settings.customNavLinks = [];
    settings.customNavLinks.push({
      label: label.trim(),
      url: url.trim(),
      order: 99
    });
    markDirty('site-settings.json');
    renderNavList();
    toast('Link added. Click Publish when ready.');
  }

  function editNavLink(index) {
    if (!settings.customNavLinks || !settings.customNavLinks[index]) return;
    var link = settings.customNavLinks[index];
    var label = prompt('Link label:', link.label);
    if (label === null) return;
    var url = prompt('URL:', link.url);
    if (url === null) return;
    link.label = label.trim();
    link.url = url.trim();
    markDirty('site-settings.json');
    renderNavList();
  }

  function deleteNavLink(index) {
    if (!confirm('Delete this nav link?')) return;
    settings.customNavLinks.splice(index, 1);
    markDirty('site-settings.json');
    renderNavList();
    toast('Link deleted. Click Publish when ready.');
  }

  function moveNavItem(fromIndex, direction) {
    // Get the sorted combined list to figure out what moved
    var items = [];
    Object.keys(pages).forEach(function(key) {
      items.push({ type: 'page', key: key, order: pages[key].navOrder || 99 });
    });
    (settings.customNavLinks || []).forEach(function(link, i) {
      items.push({ type: 'custom', index: i, order: link.order || 99 });
    });
    items.sort(function(a, b) { return a.order - b.order; });

    var toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= items.length) return;
    var temp = items[fromIndex];
    items[fromIndex] = items[toIndex];
    items[toIndex] = temp;

    // Reassign orders
    items.forEach(function(item, i) {
      if (item.type === 'page') {
        pages[item.key].navOrder = i + 1;
      } else {
        settings.customNavLinks[item.index].order = i + 1;
      }
    });

    markDirty('pages.json');
    markDirty('site-settings.json');
    renderNavList();
  }

  $('add-nav-link-btn').addEventListener('click', addNavLink);

  // ===== PAGE NAV TOGGLE + URL IN PREVIEW =====
  var pageNavToggle = $('page-nav-toggle');
  var pageUrlInput = $('page-url');

  pageNavToggle.addEventListener('change', function() {
    var key = pagePicker.value;
    if (!pages[key]) return;
    pages[key].showInNav = pageNavToggle.checked;
    markDirty('pages.json');
  });

  pageUrlInput.addEventListener('change', function() {
    var key = pagePicker.value;
    if (!pages[key]) return;
    var oldUrl = pages[key].url;
    var newUrl = pageUrlInput.value.trim();
    if (!newUrl) return;
    // Add .html if not present
    if (newUrl.indexOf('.html') === -1) newUrl += '.html';
    // Check URL uniqueness
    var duplicate = Object.keys(pages).some(function(k) { return k !== key && pages[k].url === newUrl; });
    if (duplicate) { toast('URL already used by another page', true); pageUrlInput.value = oldUrl || ''; return; }
    pageUrlInput.value = newUrl;
    if (oldUrl && oldUrl !== newUrl) {
      // Track old file for deletion on publish
      var originals = ORIGINAL_PAGES;
      if (originals.indexOf(oldUrl) === -1) {
        pendingDeletes.push(oldUrl);
      }
    }
    pages[key].url = newUrl;
    markDirty('pages.json');
  });

  // ===== VISUAL PAGE EDITOR (direct render, no iframe) =====
  var modalQuill = null;
  var pagePicker = $('page-picker');
  var pagePreview = $('page-preview');

  function getSection(pageKey, sectionId) {
    var page = pages[pageKey];
    if (!page) return { heading: '', body: '' };
    var s = page.sections.find(function(sec) { return sec.id === sectionId; });
    return s || { heading: '', body: '' };
  }

  function setSize(pageKey, sectionId, prop, value) {
    var section = pages[pageKey].sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    var num = parseInt(value, 10);
    if (isNaN(num)) return;
    if (prop === 'fontSize') num = Math.max(10, Math.min(48, num));
    if (prop === 'imageSize') num = Math.max(40, Math.min(800, num));
    section[prop] = num;
    markDirty('pages.json');
    renderPagePreview();
  }

  function resetSize(pageKey, sectionId, prop) {
    var section = pages[pageKey].sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    delete section[prop];
    markDirty('pages.json');
    renderPagePreview();
  }

  function adjustSize(pageKey, sectionId, prop, delta) {
    var section = pages[pageKey].sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    var current = section[prop] || (prop === 'fontSize' ? 16 : 200);
    var newVal = current + delta;
    if (prop === 'fontSize') newVal = Math.max(10, Math.min(32, newVal));
    if (prop === 'imageSize') newVal = Math.max(80, Math.min(600, newVal));
    section[prop] = newVal;
    markDirty('pages.json');
    renderPagePreview();
  }

  function wrapWithControls(pageKey, sectionId, sectionHtml) {
    return sectionHtml;
  }

  function pvCTABadge(s) {
    return s.showCTA ? '<div style="margin-top:10px;padding:8px 16px;background:var(--color-accent,#8B7355);color:#fff;border-radius:6px;display:inline-block;font-size:12px;font-weight:500;">Book A Session</div>' : '';
  }

  function pvSection(pageKey, sectionId, extraClass) {
    var s = getSection(pageKey, sectionId);
    var type = s.type || 'text';
    var imgBtn = s.image ? '<button class="pv-section-img-btn" onclick="event.stopPropagation();CMS.changeSectionImage(\'' + pageKey + '\',\'' + sectionId + '\')">Change Image</button>' : '';
    var secIndex = pages[pageKey] ? pages[pageKey].sections.findIndex(function(sec) { return sec.id === sectionId; }) : -1;
    var totalSecs = pages[pageKey] ? pages[pageKey].sections.length : 0;
    var moveUp = secIndex > 0 ? '<button class="pv-section-move" onclick="event.stopPropagation();CMS.moveSection(\'' + pageKey + '\',' + secIndex + ',-1)" title="Move up">&uarr;</button>' : '';
    var moveDown = secIndex < totalSecs - 1 ? '<button class="pv-section-move" onclick="event.stopPropagation();CMS.moveSection(\'' + pageKey + '\',' + secIndex + ',1)" title="Move down">&darr;</button>' : '';
    var delBtn = '<div class="pv-section-controls">' + moveUp + moveDown + '<button class="pv-section-delete" onclick="event.stopPropagation();CMS.deletePageSection(\'' + pageKey + '\',\'' + sectionId + '\')">Delete</button></div>';
    var typeLabel = '<span style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:1px;">' + type + '</span>';
    var fs = s.fontSize || 16;
    var is = s.imageSize || 200;

    var imgLabel = s.image ? 'Change Image' : 'Add Image';
    var imgBtnAny = '<button class="pv-section-img-btn" onclick="event.stopPropagation();CMS.changeSectionImage(\'' + pageKey + '\',\'' + sectionId + '\')">' + imgLabel + '</button>';
    var card = '';

    if (type === 'reviews') {
      card = '<div class="pv-section" style="cursor:default;">';
      card += delBtn;
      card += '<h2>Client Reviews</h2>';
      if (testimonials.length > 0) {
        card += '<div style="display:flex;gap:16px;margin-top:12px;">';
        testimonials.slice(0, 3).forEach(function(t) {
          card += '<div style="flex:1;min-width:0;padding:16px;background:#f9f9f9;border-radius:8px;font-size:13px;line-height:1.7;color:#666;font-style:italic;">';
          card += '&ldquo;' + (t.quote.length > 100 ? t.quote.substring(0, 100) + '...' : t.quote) + '&rdquo;';
          card += '<div style="margin-top:8px;font-style:normal;font-weight:600;color:#333;font-size:12px;">' + t.name + '</div>';
          card += '</div>';
        });
        card += '</div>';
        card += '<p style="text-align:center;color:#999;font-size:12px;margin-top:8px;">' + testimonials.length + ' reviews -- manage from Reviews tab</p>';
      } else {
        card += '<p style="color:#999;">No reviews yet</p>';
      }
      card += '</div>';
      return wrapWithControls(pageKey, sectionId, card);
    }

    if (type === 'map') {
      card = '<div class="pv-section" style="cursor:default;background:#e8e8e8;text-align:center;padding:40px;">';
      card += delBtn;
      card += '<div style="font-size:32px;margin-bottom:8px;">&#x1f5fa;</div>';
      card += '<div style="font-size:14px;font-weight:600;color:#555;">Google Map</div>';
      if (settings.mapCoords) {
        card += '<div style="font-size:12px;color:#999;margin-top:4px;">' + settings.mapCoords + '</div>';
      } else {
        card += '<div style="font-size:12px;color:#999;margin-top:4px;">Set coordinates in Settings</div>';
      }
      card += '</div>';
      return wrapWithControls(pageKey, sectionId, card);
    }

    if (type === 'banner') {
      card = '<div class="pv-section pv-section-quote" style="font-size:' + fs + 'px;' + (s.image ? 'background-image:url(\'' + getImageUrl(s.image) + '\');' : '') + '">' +
        delBtn +
        '<button class="pv-section-img-btn" style="opacity:1;" onclick="event.stopPropagation();CMS.changeSectionImage(\'' + pageKey + '\',\'' + sectionId + '\')">' + imgLabel + '</button>' +
        '<div onclick="CMS.openSectionModal(\'' + pageKey + '\',\'' + sectionId + '\')" style="cursor:pointer;">' +
          '<div class="pv-section-label" style="position:static;display:inline-block;margin-bottom:8px;">Edit Text</div>' +
          '<p>' + (s.heading || '') + '</p>' +
          (s.body ? '<p style="font-size:0.9em;margin-top:10px;font-style:normal;">' + s.body.replace(/<[^>]+>/g, '') + '</p>' : '') +
          (s.showCTA ? '<div style="margin-top:10px;padding:8px 16px;background:#fff;color:#333;border-radius:6px;display:inline-block;font-size:12px;font-weight:500;">Book A Session</div>' : '') +
        '</div>' +
      '</div>';
      return wrapWithControls(pageKey, sectionId, card);
    }

    if (type === 'text-image' || (type !== 'two-column' && type !== 'images' && s.image)) {
      var imgRight = (s.imagePosition === 'right');
      var swapBtn = '<button class="pv-section-img-btn" style="opacity:1;top:auto;bottom:8px;right:8px;font-size:10px;padding:3px 10px;" onclick="event.stopPropagation();CMS.swapImageSide(\'' + pageKey + '\',\'' + sectionId + '\')">' + (imgRight ? 'Image \u2192 Left' : 'Image \u2192 Right') + '</button>';
      var imgCol = '<div style="position:relative;"><img src="' + getImageUrl(s.image || '') + '" alt="">' + imgBtnAny + swapBtn + '</div>';
      var txtCol = '<div><div class="pv-section-label">Edit Text</div>' +
          typeLabel +
          '<h2>' + s.heading + '</h2>' +
          s.body +
        '</div>';
      var cols = imgRight ? txtCol + imgCol : imgCol + txtCol;
      card = '<div class="pv-section pv-img-section ' + (extraClass || '') + '" style="font-size:' + fs + 'px;" onclick="CMS.openSectionModal(\'' + pageKey + '\',\'' + sectionId + '\')">' +
        delBtn + cols +
      '</div>';
      return wrapWithControls(pageKey, sectionId, card);
    }

    if (type === 'images') {
      var imgs = s.images || [];
      var imgHtml = '';
      imgs.forEach(function(src, i) {
        imgHtml += '<div style="flex:1;min-width:0;">' +
          '<div style="display:flex;justify-content:flex-end;margin-bottom:4px;">' +
            '<button style="padding:6px 12px;background:#fff;border:1px solid #ddd;border-radius:6px;font-size:11px;color:#c0392b;cursor:pointer;font-family:inherit;" onclick="event.stopPropagation();CMS.removeGalleryImage(\'' + pageKey + '\',\'' + sectionId + '\',' + i + ')">Remove</button>' +
          '</div>' +
          '<div style="position:relative;">' +
            '<img src="' + getImageUrl(src) + '" alt="" style="width:100%;border-radius:8px;display:block;">' +
            '<button class="pv-section-img-btn" style="opacity:1;font-size:10px;padding:3px 8px;" onclick="event.stopPropagation();CMS.changeGalleryImage(\'' + pageKey + '\',\'' + sectionId + '\',' + i + ')">Change</button>' +
          '</div>' +
        '</div>';
      });
      if (imgs.length < 3) {
        imgHtml += '<div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:center;min-height:120px;border:2px dashed #e0e0e0;border-radius:8px;cursor:pointer;" onclick="event.stopPropagation();CMS.addGalleryImage(\'' + pageKey + '\',\'' + sectionId + '\')">' +
          '<span style="color:#999;font-size:13px;">+ Add Image</span>' +
        '</div>';
      }
      card = '<div class="pv-section ' + (extraClass || '') + '">' +
        delBtn +
        typeLabel +
        '<h2 onclick="CMS.openSectionModal(\'' + pageKey + '\',\'' + sectionId + '\')" style="cursor:pointer;">' + s.heading + ' <span style="font-size:12px;color:#999;font-weight:400;">edit</span></h2>' +
        (s.body ? '<div onclick="CMS.openSectionModal(\'' + pageKey + '\',\'' + sectionId + '\')" style="cursor:pointer;margin-bottom:12px;color:#666;">' + s.body + '</div>' : '') +
        '<div style="display:flex;gap:12px;margin-top:12px;">' + imgHtml + '</div>' +
      '</div>';
      return wrapWithControls(pageKey, sectionId, card);
    }

    if (type === 'two-column') {
      card = '<div class="pv-section ' + (extraClass || '') + '" style="cursor:default;font-size:' + fs + 'px;">' +
        delBtn +
        typeLabel +
        '<div class="pv-two-col">' +
          '<div onclick="CMS.openSectionModal(\'' + pageKey + '\',\'' + sectionId + '\')" style="cursor:pointer;">' +
            '<div class="pv-section-label" style="position:static;display:inline-block;margin-bottom:8px;">Edit Left</div>' +
            '<h2>' + (s.heading || '') + '</h2>' +
            (s.body || '') +
          '</div>' +
          '<div onclick="CMS.openSectionModal(\'' + pageKey + '\',\'' + sectionId + '\',\'right\')" style="cursor:pointer;">' +
            '<div class="pv-section-label" style="position:static;display:inline-block;margin-bottom:8px;">Edit Right</div>' +
            '<h2>' + (s.heading2 || '') + '</h2>' +
            (s.body2 || '') +
          '</div>' +
        '</div>' +
      '</div>';
      return wrapWithControls(pageKey, sectionId, card);
    }

    if (type === 'accent') {
      extraClass = (extraClass || '') + ' pv-section-accent';
    }

    // Default: text / accent
    var addImgBtn = '<button class="pv-section-move" style="font-size:10px;padding:4px 8px;" onclick="event.stopPropagation();CMS.changeSectionImage(\'' + pageKey + '\',\'' + sectionId + '\')">' + imgLabel + '</button>';
    // Rebuild delBtn to include the add image button
    var controlsWithImg = '<div class="pv-section-controls">' + moveUp + moveDown + addImgBtn + '<button class="pv-section-delete" onclick="event.stopPropagation();CMS.deletePageSection(\'' + pageKey + '\',\'' + sectionId + '\')">Delete</button></div>';
    card = '<div class="pv-section ' + (extraClass || '') + '" style="font-size:' + fs + 'px;" onclick="CMS.openSectionModal(\'' + pageKey + '\',\'' + sectionId + '\')">' +
      controlsWithImg +
      '<div class="pv-section-label">Edit Text</div>' +
      typeLabel +
      '<h2>' + s.heading + '</h2>' +
      s.body +
      pvCTABadge(s) +
    '</div>';
    return wrapWithControls(pageKey, sectionId, card);
  }

  function pvAddSection(pageKey) {
    return '<div style="position:relative;">' +
      '<button class="pv-add-section" onclick="CMS.toggleAddMenu(\'' + pageKey + '\',this)">+ Add Section</button>' +
    '</div>';
  }

  function pvSetting(key, extraClass) {
    var val = settings[key] || '';
    return '<div class="pv-section ' + (extraClass || '') + '" onclick="CMS.openSettingModal(\'' + key + '\')">' +
      '<div class="pv-section-label">Edit</div>' +
      '<p>' + val + '</p>' +
    '</div>';
  }

  // Hero card with text edit (bottom-left) and image edit (top-right)
  function pvHero(pageKey, heroTitle, heroSubtitle) {
    var page = pages[pageKey] || {};
    var img = page.heroImage ? getImageUrl(page.heroImage) : '';
    return '<div class="pv-hero" style="background-image:url(\'' + img + '\');">' +
      '<div class="pv-hero-actions">' +
        '<button class="pv-hero-btn" onclick="event.stopPropagation();CMS.changeHeroImage(\'' + pageKey + '\')">Change Image</button>' +
      '</div>' +
      '<div>' +
        (heroTitle ? '<h1>' + heroTitle + '</h1>' : '') +
        (heroSubtitle ? '<p>' + heroSubtitle + '</p>' : '') +
      '</div>' +
    '</div>';
  }

  function changeSectionImage(pageKey, sectionId) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function() {
      if (!input.files.length) return;
      toast('Uploading image...');
      uploadImage(input.files[0])
        .then(function(url) {
          var relPath = url;
          var section = pages[pageKey].sections.find(function(s) { return s.id === sectionId; });
          if (section) section.image = relPath;
          markDirty('pages.json');
          toast('Image updated. Click Publish when ready.');
          renderPagePreview();
        })
        .catch(function(err) { toast('Upload failed: ' + err.message, true); });
    };
    input.click();
  }

  function addGalleryImage(pageKey, sectionId) {
    var section = pages[pageKey].sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    if (!section.images) section.images = [];
    if (section.images.length >= 3) { toast('Maximum 3 images', true); return; }
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function() {
      if (!input.files.length) return;
      toast('Uploading image...');
      uploadImage(input.files[0])
        .then(function(url) {
          var relPath = url;
          section.images.push(relPath);
          markDirty('pages.json');
          toast('Image added. Click Publish when ready.');
          renderPagePreview();
        })
        .catch(function(err) { toast('Upload failed: ' + err.message, true); });
    };
    input.click();
  }

  function changeGalleryImage(pageKey, sectionId, index) {
    var section = pages[pageKey].sections.find(function(s) { return s.id === sectionId; });
    if (!section || !section.images) return;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function() {
      if (!input.files.length) return;
      toast('Uploading image...');
      uploadImage(input.files[0])
        .then(function(url) {
          var relPath = url;
          section.images[index] = relPath;
          markDirty('pages.json');
          toast('Image updated. Click Publish when ready.');
          renderPagePreview();
        })
        .catch(function(err) { toast('Upload failed: ' + err.message, true); });
    };
    input.click();
  }

  function removeGalleryImage(pageKey, sectionId, index) {
    var section = pages[pageKey].sections.find(function(s) { return s.id === sectionId; });
    if (!section || !section.images) return;
    section.images.splice(index, 1);
    markDirty('pages.json');
    renderPagePreview();
    toast('Image removed. Click Publish when ready.');
  }

  function swapImageSide(pageKey, sectionId) {
    var section = pages[pageKey].sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    section.imagePosition = (section.imagePosition === 'right') ? 'left' : 'right';
    markDirty('pages.json');
    renderPagePreview();
  }

  function changeHeroImage(pageKey) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function() {
      if (!input.files.length) return;
      toast('Uploading hero image...');
      uploadImage(input.files[0])
        .then(function(url) {
          // Store relative path from site root
          var relPath = url;
          pages[pageKey].heroImage = relPath;
          markDirty('pages.json');
          toast('Hero image updated. Click Publish when ready.');
          renderPagePreview();
        })
        .catch(function(err) { toast('Upload failed: ' + err.message, true); });
    };
    input.click();
  }

  function buildHomePage() {
    var s = settings;
    var headline = (s.heroHeadline || '').replace(/<br\s*\/?>/g, ' ');
    var html = '' +
      '<div class="pv-hero" style="background-image:url(\'' + getImageUrl(pages.home.heroImage || '') + '\');">' +
        '<div class="pv-hero-actions">' +
          '<button class="pv-hero-btn" onclick="event.stopPropagation();CMS.changeHeroImage(\'home\')">Change Image</button>' +
        '</div>' +
        '<button class="pv-hero-btn pv-hero-text-btn" onclick="event.stopPropagation();CMS.openSettingModal(\'heroHeadline\')">Edit Headline</button>' +
        '<div><h1>' + headline + '</h1></div>' +
      '</div>';
    pages.home.sections.forEach(function(sec) {
      html += pvSection('home', sec.id);
    });
    // Reviews and map are now regular sections in pages.json, rendered by pvSection
    html += pvAddSection('home');
    return html;
  }

  function buildAboutSelenaPage() {
    var pk = 'about-selena';
    var html = pvHero(pk, 'Selena La Brooy', 'Certified Rolfer, Certified Movement Integration Practitioner');
    var secs = pages[pk].sections;
    // Bio sections that flow together next to the image
    var bioIds = ['bio-intro', 'bio-story', 'bio-extended', 'bio-mission'];
    var bioSecs = bioIds.map(function(id) { return secs.find(function(s) { return s.id === id; }); }).filter(Boolean);
    var otherSecs = secs.filter(function(s) { return bioIds.indexOf(s.id) < 0; });

    if (bioSecs.length) {
      var introSec = getSection(pk, 'bio-intro');
      var imgUrl = introSec.image ? getImageUrl(introSec.image) : '';
      var imgLabel = introSec.image ? 'Change Image' : 'Add Image';

      html += '<div class="pv-section" style="cursor:default;padding:0;overflow:hidden;">';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">';

      // Image column
      html += '<div style="position:relative;padding:30px;">';
      html += '<img src="' + imgUrl + '" alt="" style="width:100%;border-radius:12px;">';
      html += '<button class="pv-section-img-btn" style="opacity:1;" onclick="event.stopPropagation();CMS.changeSectionImage(\'' + pk + '\',\'bio-intro\')">' + imgLabel + '</button>';
      html += '</div>';

      // Text column - all bio sections stacked
      html += '<div style="padding:30px 30px 30px 0;">';
      bioSecs.forEach(function(sec) {
        var isAccent = sec.type === 'accent';
        var moveIdx = secs.indexOf(sec);
        var totalSecs = secs.length;
        var moveUp = moveIdx > 0 ? '<button class="pv-section-move" onclick="event.stopPropagation();CMS.moveSection(\'' + pk + '\',' + moveIdx + ',-1)" title="Move up">&uarr;</button>' : '';
        var moveDown = moveIdx < totalSecs - 1 ? '<button class="pv-section-move" onclick="event.stopPropagation();CMS.moveSection(\'' + pk + '\',' + moveIdx + ',1)" title="Move down">&darr;</button>' : '';
        var delBtn = '<button class="pv-section-delete" onclick="event.stopPropagation();CMS.deletePageSection(\'' + pk + '\',\'' + sec.id + '\')">Delete</button>';

        html += '<div class="pv-section" style="' + (isAccent ? 'background:#F0EDE8;' : '') + 'margin-bottom:20px;padding:20px;cursor:pointer;" onclick="CMS.openSectionModal(\'' + pk + '\',\'' + sec.id + '\')">';
        html += '<div class="pv-section-controls">' + moveUp + moveDown + delBtn + '</div>';
        html += '<div class="pv-section-label">Edit</div>';
        if (sec.heading) html += '<h2 style="font-size:1.4em;margin-bottom:8px;">' + sec.heading + '</h2>';
        if (sec.body) html += '<div style="font-size:14px;line-height:1.7;color:#555;">' + sec.body + '</div>';
        html += pvCTABadge(sec);
        html += '</div>';
      });
      html += '</div>';

      html += '</div></div>';
    }

    // Remaining sections (passion-quote, closing, etc.)
    otherSecs.forEach(function(sec) {
      html += pvSection(pk, sec.id);
    });
    html += pvAddSection(pk);
    return html;
  }

  function buildAboutSessionsPage() {
    var html = pvHero('about-sessions', "What's a Rolfing Session Like?");
    pages['about-sessions'].sections.forEach(function(sec) {
      html += pvSection('about-sessions', sec.id);
    });
    html += pvAddSection('about-sessions');
    return html;
  }

  function buildBlogPage() {
    return '' +
      pvHero('blog', 'Blog', 'Learn about Rolfing') +
      '<div class="pv-note">Blog posts -- manage from the Blog tab</div>';
  }

  function buildFaqsPage() {
    return '' +
      pvHero('faqs', 'Frequently Asked Questions') +
      '<div class="pv-note">FAQs -- manage from the FAQs tab</div>';
  }

  function buildContactPage() {
    return '' +
      pvHero('contact', 'Contact Us') +
      '<div class="pv-note">Contact info -- manage from Settings tab (address, email)</div>';
  }

  function buildGenericPage(key) {
    var page = pages[key];
    if (!page) return '<div class="pv-note">Page not found</div>';
    var html = pvHero(key, page.title);
    if (page.sections.length === 0 && key !== 'faqs' && key !== 'blog') {
      html += '<div class="pv-note">No sections yet. Click "+ Add Section" below.</div>';
    }
    page.sections.forEach(function(s) {
      html += pvSection(key, s.id);
    });

    // FAQs page: show FAQ preview
    if (key === 'faqs') {
      html += '<div class="pv-section" style="cursor:default;">';
      html += '<h2>Frequently Asked Questions</h2>';
      if (faqs.length > 0) {
        faqs.forEach(function(f) {
          html += '<div style="padding:12px 0;border-bottom:1px solid #eee;">';
          html += '<strong style="color:#333;">' + f.question + '</strong>';
          html += '</div>';
        });
        html += '<p style="text-align:center;color:#999;font-size:12px;margin-top:12px;">' + faqs.length + ' FAQs -- manage from FAQs tab</p>';
      } else {
        html += '<p style="color:#999;">No FAQs yet -- add from FAQs tab</p>';
      }
      html += '</div>';
    }

    // Blog page: show blog post preview
    if (key === 'blog') {
      html += '<div class="pv-section" style="cursor:default;">';
      html += '<h2>Blog Posts</h2>';
      if (blogPosts.length > 0) {
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">';
        blogPosts.filter(function(p) { return p.published; }).forEach(function(p) {
          html += '<div style="padding:16px;background:#f9f9f9;border-radius:8px;">';
          html += '<div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">' + p.date + '</div>';
          html += '<div style="font-weight:600;margin-top:4px;">' + p.title + '</div>';
          html += '<div style="font-size:13px;color:#666;margin-top:4px;">' + p.excerpt + '</div>';
          html += '</div>';
        });
        html += '</div>';
        html += '<p style="text-align:center;color:#999;font-size:12px;margin-top:12px;">' + blogPosts.length + ' posts -- manage from Blog tab</p>';
      } else {
        html += '<p style="color:#999;">No blog posts yet -- add from Blog tab</p>';
      }
      html += '</div>';
    }

    html += pvAddSection(key);
    return html;
  }

  function renderPagePreview() {
    var key = pagePicker.value;
    if (!key || !pages[key]) return;
    var builders = {
      'home': buildHomePage,
      'about-selena': buildAboutSelenaPage,
      'about-sessions': buildAboutSessionsPage
    };
    var builder = builders[key];
    pagePreview.innerHTML = builder ? builder() : buildGenericPage(key);
    // Update page settings bar
    pageNavToggle.checked = pages[key].showInNav || false;
    pageUrlInput.value = pages[key].url || '';
  }

  pagePicker.addEventListener('change', renderPagePreview);

  // ===== ADD/DELETE SECTIONS =====
  var SECTION_TYPES = [
    { id: 'text', label: 'Text', desc: 'Heading + body text, white background' },
    { id: 'accent', label: 'Accent', desc: 'Heading + body text, tan background' },
    { id: 'text-image', label: 'Text + Image', desc: 'Side-by-side image and text' },
    { id: 'banner', label: 'Banner', desc: 'Full-width background image with text overlay' },
    { id: 'two-column', label: 'Two Column', desc: 'Two text blocks side by side' },
    { id: 'images', label: 'Images', desc: '1 to 3 images across in a row' },
    { id: 'reviews', label: 'Reviews', desc: 'Client testimonials carousel' },
    { id: 'map', label: 'Map', desc: 'Embedded Google Map from settings' }
  ];

  function toggleAddMenu(pageKey, btn) {
    var existing = btn.parentElement.querySelector('.pv-type-picker');
    if (existing) { existing.remove(); return; }
    var menu = document.createElement('div');
    menu.className = 'pv-type-picker';
    SECTION_TYPES.forEach(function(t) {
      var opt = document.createElement('button');
      opt.className = 'pv-type-option';
      opt.innerHTML = t.label + '<span>' + t.desc + '</span>';
      opt.addEventListener('click', function() {
        addSection(pageKey, t.id);
        menu.remove();
      });
      menu.appendChild(opt);
    });
    btn.parentElement.appendChild(menu);
    // Close on outside click
    setTimeout(function() {
      document.addEventListener('click', function close(e) {
        if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
      });
    }, 10);
  }

  function addSection(pageKey, type) {
    var title = prompt('Section heading:');
    if (!title || !title.trim()) return;
    var id = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var section = { id: id, type: type, heading: title.trim(), body: '' };
    if (type === 'text-image' || type === 'banner') section.image = '';
    if (type === 'two-column') { section.heading2 = ''; section.body2 = ''; }
    if (type === 'images') { section.images = []; section.body = ''; }
    pages[pageKey].sections.push(section);
    markDirty('pages.json');
    renderPagePreview();
    updateDashboard();
    toast('Section added. Click it to edit.');
  }

  function moveSection(pageKey, index, direction) {
    var secs = pages[pageKey].sections;
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= secs.length) return;
    var temp = secs[index];
    secs[index] = secs[newIndex];
    secs[newIndex] = temp;
    markDirty('pages.json');
    renderPagePreview();
  }

  function deletePageSection(pageKey, sectionId) {
    var page = pages[pageKey];
    if (!page) return;
    var idx = page.sections.findIndex(function(s) { return s.id === sectionId; });
    if (idx < 0) return;
    if (!confirm('Delete section "' + page.sections[idx].heading + '"?')) return;
    page.sections.splice(idx, 1);
    markDirty('pages.json');
    renderPagePreview();
    updateDashboard();
    toast('Section deleted. Click Publish when ready.');
  }

  function openSectionModal(pageKey, sectionId, column) {
    editingPageKey = pageKey;
    var page = pages[pageKey];
    if (!page) { toast('Page not found: ' + pageKey, true); return; }
    var idx = page.sections.findIndex(function(s) { return s.id === sectionId; });
    if (idx < 0) { toast('Section not found: ' + sectionId, true); return; }
    editingSectionIndex = idx;
    var section = page.sections[idx];

    editingColumn = column || '';
    var heading = editingColumn === 'right' ? (section.heading2 || '') : section.heading;
    var body = editingColumn === 'right' ? (section.body2 || '') : section.body;

    $('edit-modal-title').textContent = heading || 'Edit Section';
    $('modal-heading').value = heading;
    $('modal-heading').parentElement.querySelector('label').textContent = 'Heading';

    // Show Quill
    var editorWrap = $('modal-editor').parentElement;
    editorWrap.querySelectorAll('label').forEach(function(l) { l.style.display = ''; });
    $('modal-editor').style.display = '';
    var toolbar = editorWrap.querySelector('.ql-toolbar');
    if (toolbar) toolbar.style.display = '';

    if (!modalQuill) {
      modalQuill = new Quill('#modal-editor', {
        theme: 'snow',
        modules: {
          toolbar: [
            [{ header: [2, 3, false] }],
            [{ size: ['10px','12px','14px','16px','18px','20px','24px','28px','32px'] }],
            ['bold', 'italic', 'underline'],
            [{ align: ['', 'center', 'right', 'justify'] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link', 'image'],
            ['clean']
          ]
        }
      });
      setupQuillImageHandler(modalQuill);
    }
    modalQuill.root.innerHTML = body;
    $('modal-cta-toggle').checked = !!section.showCTA;
    $('modal-cta-toggle').parentElement.style.display = '';
    $('edit-modal').style.display = 'flex';
  }

  function openSettingModal(settingKey) {
    editingPageKey = '__setting__';
    editingSectionIndex = settingKey;

    var label = settingKey.replace(/([A-Z])/g, ' $1').replace(/^./, function(c) { return c.toUpperCase(); });
    $('edit-modal-title').textContent = 'Edit: ' + label;
    $('modal-heading').value = settings[settingKey] || '';
    $('modal-heading').parentElement.querySelector('label').textContent = label;

    // Hide CTA toggle and Quill for simple settings
    $('modal-cta-toggle').parentElement.style.display = 'none';
    var editorWrap = $('modal-editor').parentElement;
    var contentLabel = editorWrap.querySelectorAll('label')[1];
    if (contentLabel) contentLabel.style.display = 'none';
    $('modal-editor').style.display = 'none';
    var toolbar = editorWrap.querySelector('.ql-toolbar');
    if (toolbar) toolbar.style.display = 'none';

    $('edit-modal').style.display = 'flex';
  }

  function closeModal() {
    $('edit-modal').style.display = 'none';
    editingPageKey = '';
    editingSectionIndex = -1;
    editingColumn = '';
    var editorWrap = $('modal-editor').parentElement;
    editorWrap.querySelectorAll('label').forEach(function(l) { l.style.display = ''; });
    $('modal-editor').style.display = '';
    var toolbar = editorWrap.querySelector('.ql-toolbar');
    if (toolbar) toolbar.style.display = '';
  }

  function saveModal() {
    if (editingPageKey === '__setting__') {
      var key = editingSectionIndex;
      settings[key] = $('modal-heading').value.trim();
      markDirty('site-settings.json');
    } else {
      if (!pages[editingPageKey] || editingSectionIndex < 0) { toast('Page or section not found', true); closeModal(); return; }
      var heading = $('modal-heading').value.trim();
      var section = pages[editingPageKey].sections[editingSectionIndex];
      if (!section) { toast('Section not found', true); closeModal(); return; }
      if (editingColumn === 'right') {
        section.heading2 = heading;
        section.body2 = modalQuill.root.innerHTML;
      } else {
        section.heading = heading;
        section.body = modalQuill.root.innerHTML;
      }
      section.showCTA = $('modal-cta-toggle').checked;
      markDirty('pages.json');
    }

    toast('Draft saved. Click Publish when ready.');
    closeModal();
    renderPagePreview();
  }

  $('modal-save-btn').addEventListener('click', saveModal);
  $('modal-cancel-btn').addEventListener('click', closeModal);

  function populatePagePicker() {
    var current = pagePicker.value;
    pagePicker.innerHTML = '';
    var keys = Object.keys(pages);
    keys.sort(function(a, b) {
      if (a === 'home') return -1;
      if (b === 'home') return 1;
      var oa = pages[a].navOrder || 99;
      var ob = pages[b].navOrder || 99;
      return oa - ob;
    });
    keys.forEach(function(key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = pages[key].title;
      pagePicker.appendChild(opt);
    });
    if (current && pages[current]) pagePicker.value = current;
  }

  function addPage() {
    var title = prompt('Page name:');
    if (!title || !title.trim()) return;
    var key = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (pages[key]) { toast('A page with that key already exists', true); return; }
    pages[key] = {
      title: title.trim(),
      url: key + '.html',
      showInNav: true,
      navLabel: title.trim(),
      navOrder: Object.keys(pages).length + 1,
      heroImage: '',
      sections: []
    };
    markDirty('pages.json');
    populatePagePicker();
    pagePicker.value = key;
    renderPagePreview();
    updateDashboard();
    toast('Page added. Add sections and a hero image, then Publish.');
  }

  function renamePage() {
    var key = pagePicker.value;
    if (!pages[key]) return;
    var newTitle = prompt('New page name:', pages[key].title);
    if (!newTitle || !newTitle.trim()) return;
    var oldUrl = pages[key].url;
    pages[key].title = newTitle.trim();
    pages[key].navLabel = newTitle.trim();
    // Auto-update URL for non-original pages
    var originals = ['index.html','about-selena.html','about-sessions.html','blog.html','faqs.html','contact.html','booking.html'];
    if (!originals.includes(oldUrl)) {
      var newUrl = newTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.html';
      if (oldUrl && oldUrl !== newUrl) {
        pendingDeletes.push(oldUrl);
      }
      pages[key].url = newUrl;
    }
    markDirty('pages.json');
    populatePagePicker();
    pagePicker.value = key;
    renderPagePreview();
    renderNavList();
    toast('Page renamed. Click Publish when ready.');
  }

  function deletePage() {
    var key = pagePicker.value;
    if (!pages[key]) return;
    if (!confirm('Delete page "' + pages[key].title + '" and all its sections? This cannot be undone.')) return;
    delete pages[key];
    markDirty('pages.json');
    populatePagePicker();
    renderPagePreview();
    renderNavList();
    updateDashboard();
    toast('Page deleted. Click Publish when ready.');
  }

  $('add-page-btn').addEventListener('click', addPage);
  $('rename-page-btn').addEventListener('click', renamePage);
  $('delete-page-btn').addEventListener('click', deletePage);

  function initVisualEditor() {
    populatePagePicker();
    if (Object.keys(pages).length > 0) renderPagePreview();
  }

  // ===== EVENTS =====
  var events = [];
  var products = [];
  var eventQuill = null;
  var eventScheduleQuill = null;
  var broadcastQuill = null;
  var editingEventIndex = -1;
  var editingProductIndex = -1;
  var editingEventImage = '';

  function renderEventsList() {
    var el = $('events-list');
    if (!el) return;
    var html = '';
    events.forEach(function(ev, i) {
      html += '<div class="item-row">';
      html += '<div class="item-info"><h3>' + ev.title;
      if (!ev.published) html += '<span class="draft-badge">Draft</span>';
      html += '</h3><p>' + ev.dates + ' &bull; ' + (ev.category || '') + '</p></div>';
      html += '<div class="item-actions">';
      html += '<button class="btn-small" onclick="CMS.editEvent(' + i + ')">Edit</button>';
      html += '<button class="btn-danger" onclick="CMS.deleteEvent(' + i + ')">Delete</button>';
      html += '</div></div>';
    });
    el.innerHTML = html || '<p style="color:#999;">No events yet.</p>';
  }

  function editEvent(index) {
    editingEventIndex = index;
    var ev = index >= 0 ? events[index] : null;
    $('event-edit-title').textContent = ev ? 'Edit Event' : 'New Event';
    $('event-title').value = ev ? ev.title : '';
    $('event-dates').value = ev ? ev.dates : '';
    $('event-category').value = ev ? (ev.category || 'Embodiment') : 'Embodiment';
    $('event-start-date').value = ev ? ev.startDate : '';
    $('event-end-date').value = ev ? ev.endDate : '';
    $('event-facilitator').value = ev ? ev.facilitator : '';
    $('event-location').value = ev ? (ev.location || 'Rhizome Springs, Salt Spring Island') : 'Rhizome Springs, Salt Spring Island';
    $('event-capacity').value = ev ? ev.capacity : '';
    $('event-excerpt').value = ev ? ev.excerpt : '';
    $('event-registration-url').value = ev ? (ev.registrationUrl || '') : '';
    $('event-stripe-link').value = ev ? (ev.stripePaymentLink || '') : '';
    $('event-published').checked = ev ? ev.published : true;
    editingEventImage = ev ? (ev.image || '') : '';
    $('event-image-name').textContent = editingEventImage ? editingEventImage.split('/').pop() : 'No image';
    var pricing = ev ? (ev.pricing || []) : [];
    renderPricingRows(pricing);
    if (!eventQuill) {
      eventQuill = new Quill('#event-editor', { theme: 'snow', modules: { toolbar: [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link', 'image'], ['clean']] } });
      setupQuillImageHandler(eventQuill);
    }
    eventQuill.root.innerHTML = ev ? (ev.description || '') : '';
    if (!eventScheduleQuill) {
      eventScheduleQuill = new Quill('#event-schedule-editor', { theme: 'snow', modules: { toolbar: [['bold', 'italic'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']] } });
    }
    eventScheduleQuill.root.innerHTML = ev ? (ev.schedule || '') : '';
    showSection('event-edit');
  }

  function renderPricingRows(pricing) {
    var html = '';
    pricing.forEach(function(p) {
      html += '<div class="form-row" style="align-items:end;gap:8px;margin-bottom:8px;">';
      html += '<div style="flex:2;"><input type="text" class="pricing-label" value="' + (p.label || '') + '" placeholder="Label"></div>';
      html += '<div style="flex:1;"><input type="number" class="pricing-amount" value="' + (p.amount || '') + '" placeholder="Amount"></div>';
      html += '<div style="flex:1;"><input type="text" class="pricing-currency" value="' + (p.currency || 'CAD') + '" placeholder="Currency"></div>';
      html += '<div style="flex:1;"><input type="date" class="pricing-until" value="' + (p.until || '') + '"></div>';
      html += '<div><button class="btn-danger" onclick="this.closest(\'.form-row\').remove()" style="padding:8px 12px;">X</button></div>';
      html += '</div>';
    });
    $('event-pricing-rows').innerHTML = html;
  }

  function addPricingRow() {
    var row = document.createElement('div');
    row.className = 'form-row';
    row.style.cssText = 'align-items:end;gap:8px;margin-bottom:8px;';
    row.innerHTML = '<div style="flex:2;"><input type="text" class="pricing-label" placeholder="Label"></div><div style="flex:1;"><input type="number" class="pricing-amount" placeholder="Amount"></div><div style="flex:1;"><input type="text" class="pricing-currency" value="CAD"></div><div style="flex:1;"><input type="date" class="pricing-until"></div><div><button class="btn-danger" onclick="this.closest(\'.form-row\').remove()" style="padding:8px 12px;">X</button></div>';
    $('event-pricing-rows').appendChild(row);
  }

  function getPricingFromUI() {
    var rows = $('event-pricing-rows').querySelectorAll('.form-row');
    var pricing = [];
    rows.forEach(function(row) {
      var label = row.querySelector('.pricing-label').value.trim();
      var amount = parseFloat(row.querySelector('.pricing-amount').value);
      var currency = row.querySelector('.pricing-currency').value.trim() || 'CAD';
      var until = row.querySelector('.pricing-until').value;
      if (label && !isNaN(amount)) {
        var p = { label: label, amount: amount, currency: currency };
        if (until) p.until = until;
        pricing.push(p);
      }
    });
    return pricing;
  }

  function saveEvent() {
    var title = $('event-title').value.trim();
    if (!title) { toast('Title is required', true); return; }
    var ev = {
      id: editingEventIndex >= 0 ? events[editingEventIndex].id : slugify(title),
      title: title, dates: $('event-dates').value.trim(),
      startDate: $('event-start-date').value, endDate: $('event-end-date').value,
      category: $('event-category').value, image: editingEventImage,
      excerpt: $('event-excerpt').value.trim(), facilitator: $('event-facilitator').value.trim(),
      location: $('event-location').value.trim(), capacity: parseInt($('event-capacity').value) || 0,
      description: eventQuill.root.innerHTML, schedule: eventScheduleQuill.root.innerHTML,
      pricing: getPricingFromUI(), registrationUrl: $('event-registration-url').value.trim(),
      stripePaymentLink: $('event-stripe-link').value.trim(), published: $('event-published').checked
    };
    if (editingEventIndex >= 0) { events[editingEventIndex] = ev; } else { events.push(ev); }
    markDirty('events.json');
    toast('Draft saved. Click Publish when ready.');
    renderEventsList(); showSection('events');
  }

  function deleteEvent(index) {
    if (!confirm('Delete "' + events[index].title + '"?')) return;
    events.splice(index, 1); markDirty('events.json');
    toast('Event deleted. Click Publish when ready.'); renderEventsList();
  }

  function changeEventImage() {
    var input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
    input.onchange = function() {
      if (!input.files.length) return;
      toast('Uploading image...');
      uploadImage(input.files[0]).then(function(url) {
        editingEventImage = url;
        $('event-image-name').textContent = url.split('/').pop();
        toast('Image uploaded!');
      }).catch(function(err) { toast('Upload failed: ' + err.message, true); });
    };
    input.click();
  }

  if ($('new-event-btn')) $('new-event-btn').addEventListener('click', function() { editEvent(-1); });
  if ($('event-save-btn')) $('event-save-btn').addEventListener('click', saveEvent);
  if ($('event-cancel-btn')) $('event-cancel-btn').addEventListener('click', function() { showSection('events'); });

  // ===== PRODUCTS =====
  function renderProductsList() {
    var el = $('products-list');
    if (!el) return;
    var html = '';
    products.forEach(function(p, i) {
      html += '<div class="item-row">';
      html += '<div class="item-info"><h3>' + p.title;
      if (!p.available) html += '<span class="draft-badge">Unavailable</span>';
      html += '</h3><p>$' + p.price + ' ' + (p.currency || 'CAD') + '</p></div>';
      html += '<div class="item-actions">';
      html += '<button class="btn-small" onclick="CMS.editProduct(' + i + ')">Edit</button>';
      html += '<button class="btn-danger" onclick="CMS.deleteProduct(' + i + ')">Delete</button>';
      html += '</div></div>';
    });
    el.innerHTML = html || '<p style="color:#999;">No products yet.</p>';
  }

  function editProduct(index) {
    editingProductIndex = index;
    var p = index >= 0 ? products[index] : null;
    $('product-edit-title').textContent = p ? 'Edit Product' : 'New Product';
    $('product-title').value = p ? p.title : '';
    $('product-price').value = p ? p.price : '';
    $('product-currency').value = p ? (p.currency || 'CAD') : 'CAD';
    $('product-stripe-id').value = p ? (p.stripePriceId || '') : '';
    $('product-category').value = p ? (p.category || '') : '';
    $('product-description').value = p ? (p.description || '') : '';
    $('product-event-id').value = p ? (p.eventId || '') : '';
    $('product-available').checked = p ? p.available : true;
    showSection('product-edit');
  }

  function saveProduct() {
    var title = $('product-title').value.trim();
    if (!title) { toast('Title is required', true); return; }
    var p = {
      id: editingProductIndex >= 0 ? products[editingProductIndex].id : slugify(title),
      title: title, price: parseFloat($('product-price').value) || 0,
      currency: $('product-currency').value.trim() || 'CAD',
      stripePriceId: $('product-stripe-id').value.trim(),
      category: $('product-category').value.trim(),
      description: $('product-description').value.trim(),
      eventId: $('product-event-id').value.trim(),
      available: $('product-available').checked
    };
    if (editingProductIndex >= 0) { products[editingProductIndex] = p; } else { products.push(p); }
    markDirty('products.json');
    toast('Draft saved. Click Publish when ready.');
    renderProductsList(); showSection('products');
  }

  function deleteProduct(index) {
    if (!confirm('Delete "' + products[index].title + '"?')) return;
    products.splice(index, 1); markDirty('products.json');
    toast('Product deleted. Click Publish when ready.'); renderProductsList();
  }

  if ($('new-product-btn')) $('new-product-btn').addEventListener('click', function() { editProduct(-1); });
  if ($('product-save-btn')) $('product-save-btn').addEventListener('click', saveProduct);
  if ($('product-cancel-btn')) $('product-cancel-btn').addEventListener('click', function() { showSection('products'); });

  // ===== NEWSLETTER (Kit API) =====
  function loadNewsletterData() {
    if (!settings.kitApiKey) {
      if ($('newsletter-status')) $('newsletter-status').textContent = 'Not configured';
      if ($('subscribers-list')) $('subscribers-list').innerHTML = '<p style="color:#999;">Add Kit API key in Settings to enable.</p>';
      return;
    }
    if ($('newsletter-status')) $('newsletter-status').textContent = 'Connected';
    if (settings.kitApiSecret) {
      fetch('https://api.convertkit.com/v3/subscribers?api_secret=' + settings.kitApiSecret + '&sort_order=desc&per_page=20')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if ($('count-subscribers')) $('count-subscribers').textContent = data.total_subscribers || 0;
          var html = '';
          (data.subscribers || []).forEach(function(sub) {
            html += '<div class="item-row"><div class="item-info"><h3>' + sub.email_address + '</h3><p>Subscribed: ' + new Date(sub.created_at).toLocaleDateString() + '</p></div></div>';
          });
          if ($('subscribers-list')) $('subscribers-list').innerHTML = html || '<p style="color:#999;">No subscribers yet.</p>';
        }).catch(function() { if ($('subscribers-list')) $('subscribers-list').innerHTML = '<p style="color:#999;">Could not load subscribers.</p>'; });
      fetch('https://api.convertkit.com/v3/broadcasts?api_secret=' + settings.kitApiSecret)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var broadcasts = data.broadcasts || [];
          if ($('count-broadcasts')) $('count-broadcasts').textContent = broadcasts.length;
          var html = '';
          broadcasts.slice(0, 10).forEach(function(b) {
            html += '<div class="item-row"><div class="item-info"><h3>' + (b.subject || 'No subject') + '</h3><p>Sent: ' + new Date(b.created_at).toLocaleDateString() + '</p></div></div>';
          });
          if ($('broadcasts-list')) $('broadcasts-list').innerHTML = html || '<p style="color:#999;">No broadcasts yet.</p>';
        }).catch(function() { if ($('broadcasts-list')) $('broadcasts-list').innerHTML = '<p style="color:#999;">Could not load broadcasts.</p>'; });
    }
  }

  function sendBroadcast() {
    if (!settings.kitApiSecret) { toast('Kit API secret not configured', true); return; }
    var subject = $('broadcast-subject').value.trim();
    if (!subject) { toast('Subject is required', true); return; }
    if (!broadcastQuill) {
      broadcastQuill = new Quill('#broadcast-editor', { theme: 'snow', modules: { toolbar: [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']] } });
    }
    var content = broadcastQuill.root.innerHTML;
    if (!content || content === '<p><br></p>') { toast('Content is required', true); return; }
    if (!confirm('Send this broadcast to all subscribers?')) return;
    $('send-broadcast-btn').disabled = true;
    $('send-broadcast-btn').textContent = 'Sending...';
    fetch('https://api.convertkit.com/v3/broadcasts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_secret: settings.kitApiSecret, subject: subject, content: content, published: true })
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.broadcast) { toast('Broadcast sent!'); $('broadcast-subject').value = ''; broadcastQuill.root.innerHTML = ''; loadNewsletterData(); }
      else { toast('Failed to send', true); }
    }).catch(function(err) { toast('Failed: ' + err.message, true); })
    .finally(function() { $('send-broadcast-btn').disabled = false; $('send-broadcast-btn').textContent = 'Send Broadcast'; });
  }

  if ($('send-broadcast-btn')) $('send-broadcast-btn').addEventListener('click', sendBroadcast);

  // ===== EXPOSE FOR ONCLICK =====
  window.CMS = {
    editPost: editPost,
    deletePost: deletePost,
    movePost: movePost,
    editTestimonial: editTestimonial,
    deleteTestimonial: deleteTestimonial,
    moveTestimonial: moveTestimonial,
    editFaq: editFaq,
    deleteFaq: deleteFaq,
    moveFaq: moveFaq,
    openSectionModal: openSectionModal,
    openSettingModal: openSettingModal,
    changeHeroImage: changeHeroImage,
    changeSectionImage: changeSectionImage,
    swapImageSide: swapImageSide,
    adjustSize: adjustSize,
    setSize: setSize,
    resetSize: resetSize,
    toggleAddMenu: toggleAddMenu,
    moveSection: moveSection,
    deletePageSection: deletePageSection,
    addGalleryImage: addGalleryImage,
    changeGalleryImage: changeGalleryImage,
    removeGalleryImage: removeGalleryImage,
    changeLogo: changeLogo,
    togglePageNav: togglePageNav,
    editNavLink: editNavLink,
    deleteNavLink: deleteNavLink,
    moveNavItem: moveNavItem,
    editEvent: editEvent,
    deleteEvent: deleteEvent,
    changeEventImage: changeEventImage,
    addPricingRow: addPricingRow,
    editProduct: editProduct,
    deleteProduct: deleteProduct
  };

  // ===== PUBLISH/DISCARD BUTTONS =====
  $('publish-btn').addEventListener('click', publishAll);
  $('discard-btn').addEventListener('click', discardDrafts);

  // ===== INIT =====
  populateSitePicker();
  $('site-picker').addEventListener('change', function() { switchSite(this.value); });
  initAuth();
  var initialHash = location.hash.replace('#', '');
  if (initialHash && initialHash.indexOf('setup=') !== 0) showSection(initialHash);

})();
