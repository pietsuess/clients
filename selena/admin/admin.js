/* admin.js -- CMS admin panel powered by GitHub API */

(function() {

  // ===== CONFIG =====
  var OWNER = 'pietsuess';
  var REPO = 'clients';
  var BRANCH = 'main';
  var BASE_PATH = 'selena/content/';
  var API = 'https://api.github.com';

  // ===== STATE =====
  var DEMO_MODE = new URLSearchParams(window.location.search).has('demo');
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
  var DRAFT_KEY = 'selena-cms-drafts';

  // ===== DRAFTS =====
  function saveDrafts() {
    var drafts = {
      blogPosts: blogPosts,
      testimonials: testimonials,
      faqs: faqs,
      settings: settings,
      pages: pages,
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
        blogPosts = drafts.blogPosts || blogPosts;
        testimonials = drafts.testimonials || testimonials;
        faqs = drafts.faqs || faqs;
        settings = drafts.settings || settings;
        pages = drafts.pages || pages;
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
    if (DEMO_MODE) { toast('Demo mode - changes not saved to server'); pendingChanges = {}; return; }

    $('publish-btn').disabled = true;
    $('publish-btn').textContent = 'Publishing...';

    var dataMap = {
      'blog-posts.json': blogPosts,
      'testimonials.json': testimonials,
      'faqs.json': faqs,
      'site-settings.json': settings,
      'pages.json': pages
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
  var UPLOAD_PATH = 'selena/images/uploads/';

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
    if (DEMO_MODE) {
      $('login-screen').style.display = 'none';
      $('app').style.display = 'block';
      $('user-name').textContent = 'Demo';
      loadAllContentDemo();
      return;
    }
    var setupToken = checkSetupToken();
    token = setupToken || localStorage.getItem('selena-cms-token') || '';
    if (token) {
      tryLogin(token);
    }
  }

  function loadAllContentDemo() {
    var base = '../content/';
    Promise.all([
      fetch(base + 'blog-posts.json').then(function(r){return r.json()}).catch(function(){return []}),
      fetch(base + 'testimonials.json').then(function(r){return r.json()}).catch(function(){return []}),
      fetch(base + 'faqs.json').then(function(r){return r.json()}).catch(function(){return []}),
      fetch(base + 'site-settings.json').then(function(r){return r.json()}).catch(function(){return {}}),
      fetch(base + 'pages.json').then(function(r){return r.json()}).catch(function(){return {}})
    ]).then(function(results) {
      blogPosts = results[0]; testimonials = results[1]; faqs = results[2];
      settings = results[3]; pages = results[4];
      loadDrafts();
      updateDashboard();
      renderBlogList(); renderTestimonialsList(); renderFaqsList();
      loadSettings();
      updatePublishBar();
      initVisualEditor();
      renderNavList();
    });
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
      getFile('pages.json').then(function(d) { pages = d; })
    ])
    .then(function() {
      // Apply any pending drafts over the fetched data
      loadDrafts();
      updateDashboard();
      renderBlogList();
      renderTestimonialsList();
      renderFaqsList();
      loadSettings();
      updatePublishBar();
      // Populate pages dropdown and render preview
      if (pagePicker) { populatePagePicker(); renderPagePreview(); }
      renderNavList();
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
      html += '<button class="btn-small" onclick="CMS.editPost(' + i + ')">Edit</button>';
      html += '<button class="btn-danger" onclick="CMS.deletePost(' + i + ')">Delete</button>';
      html += '</div></div>';
    });
    $('blog-list').innerHTML = html || '<p style="color:#999;">No blog posts yet.</p>';
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
            ['bold', 'italic', 'underline'],
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
    var html = '';
    testimonials.forEach(function(t, i) {
      var preview = t.quote.length > 80 ? t.quote.substring(0, 80) + '...' : t.quote;
      html += '<div class="item-row">';
      html += '<div class="item-info"><h3>' + t.name;
      if (t.credentials) html += ' <span style="color:#999;font-weight:400;">- ' + t.credentials + '</span>';
      html += '</h3><p>' + preview + '</p></div>';
      html += '<div class="item-actions">';
      if (i > 0) html += '<button class="btn-small" onclick="CMS.moveTestimonial(' + i + ',-1)" title="Move up">&uarr;</button>';
      if (i < testimonials.length - 1) html += '<button class="btn-small" onclick="CMS.moveTestimonial(' + i + ',1)" title="Move down">&darr;</button>';
      html += '<button class="btn-small" onclick="CMS.editTestimonial(' + i + ')">Edit</button>';
      html += '<button class="btn-danger" onclick="CMS.deleteTestimonial(' + i + ')">Delete</button>';
      html += '</div></div>';
    });
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
    $('setting-hero').value = settings.heroHeadline || '';
    $('setting-quote').value = settings.quoteText || '';
  }

  function saveSettings() {
    settings.address = $('setting-address').value.trim();
    settings.email = $('setting-email').value.trim();
    settings.facebookUrl = $('setting-facebook').value.trim();
    settings.calendlyUrl = $('setting-calendly').value.trim();
    settings.heroHeadline = $('setting-hero').value.trim();
    settings.quoteText = $('setting-quote').value.trim();

    markDirty('site-settings.json');
    toast('Draft saved. Click Publish when ready.');
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
    pages[key].url = pageUrlInput.value.trim();
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

  function pvSection(pageKey, sectionId, extraClass) {
    var s = getSection(pageKey, sectionId);
    var type = s.type || 'text';
    var imgBtn = s.image ? '<button class="pv-section-img-btn" onclick="event.stopPropagation();CMS.changeSectionImage(\'' + pageKey + '\',\'' + sectionId + '\')">Change Image</button>' : '';
    var delBtn = '<button class="pv-section-delete" onclick="event.stopPropagation();CMS.deletePageSection(\'' + pageKey + '\',\'' + sectionId + '\')">Delete</button>';
    var typeLabel = '<span style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:1px;">' + type + '</span>';

    var imgLabel = s.image ? 'Change Image' : 'Add Image';
    var imgBtnAny = '<button class="pv-section-img-btn" onclick="event.stopPropagation();CMS.changeSectionImage(\'' + pageKey + '\',\'' + sectionId + '\')">' + imgLabel + '</button>';

    if (type === 'banner') {
      return '<div class="pv-section pv-section-quote" style="' + (s.image ? 'background-image:url(\'../' + s.image + '\');' : '') + '">' +
        delBtn +
        '<button class="pv-section-img-btn" style="opacity:1;" onclick="event.stopPropagation();CMS.changeSectionImage(\'' + pageKey + '\',\'' + sectionId + '\')">' + imgLabel + '</button>' +
        '<div onclick="CMS.openSectionModal(\'' + pageKey + '\',\'' + sectionId + '\')" style="cursor:pointer;">' +
          '<div class="pv-section-label" style="position:static;display:inline-block;margin-bottom:8px;">Edit Text</div>' +
          '<p>' + (s.heading || '') + '</p>' +
          (s.body ? '<p style="font-size:0.9rem;margin-top:10px;font-style:normal;">' + s.body.replace(/<[^>]+>/g, '') + '</p>' : '') +
        '</div>' +
      '</div>';
    }

    if (type === 'text-image' || (type !== 'two-column' && s.image)) {
      return '<div class="pv-section pv-img-section ' + (extraClass || '') + '" onclick="CMS.openSectionModal(\'' + pageKey + '\',\'' + sectionId + '\')">' +
        delBtn +
        '<div style="position:relative;"><img src="../' + (s.image || '') + '" alt="">' + imgBtnAny + '</div>' +
        '<div><div class="pv-section-label">Edit Text</div>' +
          typeLabel +
          '<h2>' + s.heading + '</h2>' +
          s.body +
        '</div>' +
      '</div>';
    }

    if (type === 'images') {
      var imgs = s.images || [];
      var imgHtml = '';
      imgs.forEach(function(src, i) {
        imgHtml += '<div style="position:relative;flex:1;min-width:0;">' +
          '<img src="../' + src + '" alt="" style="width:100%;border-radius:8px;display:block;">' +
          '<button class="pv-section-img-btn" style="opacity:1;font-size:10px;padding:3px 8px;" onclick="event.stopPropagation();CMS.changeGalleryImage(\'' + pageKey + '\',\'' + sectionId + '\',' + i + ')">Change</button>' +
          '<button class="pv-section-delete" style="opacity:1;top:4px;left:4px;font-size:10px;padding:2px 6px;" onclick="event.stopPropagation();CMS.removeGalleryImage(\'' + pageKey + '\',\'' + sectionId + '\',' + i + ')">X</button>' +
        '</div>';
      });
      if (imgs.length < 3) {
        imgHtml += '<div style="flex:1;min-width:0;display:flex;align-items:center;justify-content:center;min-height:120px;border:2px dashed #e0e0e0;border-radius:8px;cursor:pointer;" onclick="event.stopPropagation();CMS.addGalleryImage(\'' + pageKey + '\',\'' + sectionId + '\')">' +
          '<span style="color:#999;font-size:13px;">+ Add Image</span>' +
        '</div>';
      }
      return '<div class="pv-section ' + (extraClass || '') + '">' +
        delBtn +
        typeLabel +
        '<h2>' + s.heading + '</h2>' +
        '<div style="display:flex;gap:12px;margin-top:12px;">' + imgHtml + '</div>' +
      '</div>';
    }

    if (type === 'two-column') {
      return '<div class="pv-section ' + (extraClass || '') + '" style="cursor:default;">' +
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
    }

    if (type === 'accent') {
      extraClass = (extraClass || '') + ' pv-section-accent';
    }

    // Default: text / accent - always show image button
    return '<div class="pv-section ' + (extraClass || '') + '" onclick="CMS.openSectionModal(\'' + pageKey + '\',\'' + sectionId + '\')">' +
      delBtn +
      imgBtnAny +
      '<div class="pv-section-label">Edit Text</div>' +
      typeLabel +
      '<h2>' + s.heading + '</h2>' +
      s.body +
    '</div>';
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
    var img = page.heroImage ? '../' + page.heroImage : '';
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
          var relPath = url.replace('https://clients.pietsuess.com/selena/', '');
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
          var relPath = url.replace('https://clients.pietsuess.com/selena/', '');
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
          var relPath = url.replace('https://clients.pietsuess.com/selena/', '');
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
          var relPath = url.replace('https://clients.pietsuess.com/selena/', '');
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
      '<div class="pv-hero" style="background-image:url(\'../' + (pages.home.heroImage || '') + '\');">' +
        '<div class="pv-hero-actions">' +
          '<button class="pv-hero-btn" onclick="event.stopPropagation();CMS.changeHeroImage(\'home\')">Change Image</button>' +
        '</div>' +
        '<button class="pv-hero-btn pv-hero-text-btn" onclick="event.stopPropagation();CMS.openSettingModal(\'heroHeadline\')">Edit Headline</button>' +
        '<div><h1>' + headline + '</h1></div>' +
      '</div>';
    pages.home.sections.forEach(function(sec) {
      html += pvSection('home', sec.id);
    });
    html += '<div class="pv-note">Client Reviews -- manage from the Reviews tab</div>';
    html += pvAddSection('home');
    return html;
  }

  function buildAboutSelenaPage() {
    var html = pvHero('about-selena', 'Selena La Brooy', 'Certified Rolfer, Certified Movement Integration Practitioner');
    pages['about-selena'].sections.forEach(function(sec) {
      html += pvSection('about-selena', sec.id);
    });
    html += pvAddSection('about-selena');
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
    if (page.sections.length === 0) {
      html += '<div class="pv-note">No sections yet. Click "+ Add Section" below.</div>';
    }
    page.sections.forEach(function(s) {
      html += pvSection(key, s.id);
    });
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
    { id: 'images', label: 'Images', desc: '1 to 3 images across in a row' }
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
            ['bold', 'italic', 'underline'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link', 'image'],
            ['clean']
          ]
        }
      });
      setupQuillImageHandler(modalQuill);
    }
    modalQuill.root.innerHTML = body;
    $('edit-modal').style.display = 'flex';
  }

  function openSettingModal(settingKey) {
    editingPageKey = '__setting__';
    editingSectionIndex = settingKey;

    var label = settingKey.replace(/([A-Z])/g, ' $1').replace(/^./, function(c) { return c.toUpperCase(); });
    $('edit-modal-title').textContent = 'Edit: ' + label;
    $('modal-heading').value = settings[settingKey] || '';
    $('modal-heading').parentElement.querySelector('label').textContent = label;

    // Hide Quill for simple settings
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
      var heading = $('modal-heading').value.trim();
      var section = pages[editingPageKey].sections[editingSectionIndex];
      if (editingColumn === 'right') {
        section.heading2 = heading;
        section.body2 = modalQuill.root.innerHTML;
      } else {
        section.heading = heading;
        section.body = modalQuill.root.innerHTML;
      }
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
    Object.keys(pages).forEach(function(key) {
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
    pages[key].title = newTitle.trim();
    pages[key].navLabel = newTitle.trim();
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

  // ===== EXPOSE FOR ONCLICK =====
  window.CMS = {
    editPost: editPost,
    deletePost: deletePost,
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
    toggleAddMenu: toggleAddMenu,
    deletePageSection: deletePageSection,
    addGalleryImage: addGalleryImage,
    changeGalleryImage: changeGalleryImage,
    removeGalleryImage: removeGalleryImage,
    togglePageNav: togglePageNav,
    editNavLink: editNavLink,
    deleteNavLink: deleteNavLink,
    moveNavItem: moveNavItem
  };

  // ===== PUBLISH/DISCARD BUTTONS =====
  $('publish-btn').addEventListener('click', publishAll);
  $('discard-btn').addEventListener('click', discardDrafts);

  // ===== INIT =====
  initAuth();
  var initialHash = location.hash.replace('#', '');
  if (initialHash && initialHash.indexOf('setup=') !== 0) showSection(initialHash);

})();
