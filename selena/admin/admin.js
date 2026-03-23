/* admin.js -- CMS admin panel powered by GitHub API */

(function() {

  // ===== CONFIG =====
  var OWNER = 'pietsuess';
  var REPO = 'clients';
  var BRANCH = 'main';
  var BASE_PATH = 'selena/content/';
  var API = 'https://api.github.com';

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
      getFile('pages.json').then(function(d) { pages = d; })
    ])
    .then(function() {
      updateDashboard();
      renderBlogList();
      renderTestimonialsList();
      renderFaqsList();
      loadSettings();
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

    $('blog-save-btn').disabled = true;
    $('blog-save-btn').textContent = 'Saving...';

    putFile('blog-posts.json', blogPosts, (editingIndex >= 0 ? 'Update' : 'Add') + ' blog post: ' + title)
      .then(function() {
        toast('Blog post saved! Site updates in about a minute.');
        renderBlogList();
        updateDashboard();
        showSection('blog');
      })
      .catch(function(err) { toast('Save failed: ' + err.message, true); })
      .finally(function() {
        $('blog-save-btn').disabled = false;
        $('blog-save-btn').textContent = 'Publish';
      });
  }

  function deletePost(index) {
    if (!confirm('Delete "' + blogPosts[index].title + '"? This cannot be undone.')) return;
    blogPosts.splice(index, 1);
    putFile('blog-posts.json', blogPosts, 'Delete blog post')
      .then(function() {
        toast('Post deleted.');
        renderBlogList();
        updateDashboard();
      })
      .catch(function(err) { toast('Delete failed: ' + err.message, true); });
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
    putFile('testimonials.json', testimonials, 'Reorder reviews')
      .then(function() {
        toast('Review order updated.');
        renderTestimonialsList();
      })
      .catch(function(err) { toast('Reorder failed: ' + err.message, true); });
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

    $('testimonial-save-btn').disabled = true;
    $('testimonial-save-btn').textContent = 'Saving...';

    putFile('testimonials.json', testimonials, (editingIndex >= 0 ? 'Update' : 'Add') + ' review: ' + name)
      .then(function() {
        toast('Review saved!');
        renderTestimonialsList();
        updateDashboard();
        showSection('testimonials');
      })
      .catch(function(err) { toast('Save failed: ' + err.message, true); })
      .finally(function() {
        $('testimonial-save-btn').disabled = false;
        $('testimonial-save-btn').textContent = 'Save';
      });
  }

  function deleteTestimonial(index) {
    if (!confirm('Delete review from "' + testimonials[index].name + '"?')) return;
    testimonials.splice(index, 1);
    putFile('testimonials.json', testimonials, 'Delete review')
      .then(function() {
        toast('Review deleted.');
        renderTestimonialsList();
        updateDashboard();
      })
      .catch(function(err) { toast('Delete failed: ' + err.message, true); });
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

    $('faq-save-btn').disabled = true;
    $('faq-save-btn').textContent = 'Saving...';

    putFile('faqs.json', faqs, (editingIndex >= 0 ? 'Update' : 'Add') + ' FAQ: ' + question)
      .then(function() {
        toast('FAQ saved!');
        renderFaqsList();
        updateDashboard();
        showSection('faqs');
      })
      .catch(function(err) { toast('Save failed: ' + err.message, true); })
      .finally(function() {
        $('faq-save-btn').disabled = false;
        $('faq-save-btn').textContent = 'Save';
      });
  }

  function deleteFaq(index) {
    if (!confirm('Delete this FAQ?')) return;
    faqs.splice(index, 1);
    // Reorder
    faqs.forEach(function(f, i) { f.order = i + 1; });
    putFile('faqs.json', faqs, 'Delete FAQ')
      .then(function() {
        toast('FAQ deleted.');
        renderFaqsList();
        updateDashboard();
      })
      .catch(function(err) { toast('Delete failed: ' + err.message, true); });
  }

  function moveFaq(index, direction) {
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= faqs.length) return;
    var temp = faqs[index];
    faqs[index] = faqs[newIndex];
    faqs[newIndex] = temp;
    // Update order values
    faqs.forEach(function(f, i) { f.order = i + 1; });
    putFile('faqs.json', faqs, 'Reorder FAQs')
      .then(function() {
        toast('FAQ order updated.');
        renderFaqsList();
      })
      .catch(function(err) { toast('Reorder failed: ' + err.message, true); });
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

    $('settings-save-btn').disabled = true;
    $('settings-save-btn').textContent = 'Saving...';

    putFile('site-settings.json', settings, 'Update site settings')
      .then(function() { toast('Settings saved!'); })
      .catch(function(err) { toast('Save failed: ' + err.message, true); })
      .finally(function() {
        $('settings-save-btn').disabled = false;
        $('settings-save-btn').textContent = 'Save Settings';
      });
  }

  $('settings-save-btn').addEventListener('click', saveSettings);

  // ===== VISUAL PAGE EDITOR (srcdoc approach) =====
  var modalQuill = null;
  var pageFrame = $('page-frame');
  var pagePicker = $('page-picker');
  var siteCSS = '';

  // Fetch site CSS once
  function loadSiteCSS() {
    return fetch('../css/style2.css').then(function(r) { return r.text(); }).then(function(css) {
      siteCSS = css;
    }).catch(function() {
      return fetch('../css/style.css').then(function(r) { return r.text(); }).then(function(css) { siteCSS = css; });
    });
  }

  // Editable section helper
  function editableSection(pageKey, sectionId, heading, body) {
    return '<div class="cms-editable" data-cms-page="' + pageKey + '" data-cms-section="' + sectionId + '">' +
      '<div class="cms-edit-btn" onclick="editSection(\'' + pageKey + '\',\'' + sectionId + '\')">Edit</div>' +
      '<h2 class="section-title">' + heading + '</h2>' +
      '<div>' + body + '</div>' +
    '</div>';
  }

  function editableSetting(key, content) {
    return '<span class="cms-editable cms-editable-inline" data-cms-setting="' + key + '" onclick="editSetting(\'' + key + '\')">' +
      '<span class="cms-edit-btn">Edit</span>' + content + '</span>';
  }

  function getSection(pageKey, sectionId) {
    var page = pages[pageKey];
    if (!page) return { heading: '', body: '' };
    var s = page.sections.find(function(sec) { return sec.id === sectionId; });
    return s || { heading: '', body: '' };
  }

  // Build homepage preview
  function buildHomePage() {
    var s = settings;
    var sec = function(id) { return getSection('home', id); };
    var whatIs = sec('what-is-rolfing');
    var whoBenefits = sec('who-benefits');
    var meetSelena = sec('meet-selena');
    var structural = sec('structural-integration');

    return '' +
    '<!-- HERO -->' +
    '<section class="hero" style="background-image:url(\'../images/hero-stones.webp\');">' +
      '<div class="hero-content">' +
        editableSetting('heroHeadline', '<h1>' + (s.heroHeadline || '') + '</h1>') +
      '</div>' +
    '</section>' +

    '<!-- WHAT IS ROLFING -->' +
    '<section><div class="container grid-2">' +
      '<div>' + editableSection('home', 'what-is-rolfing', whatIs.heading, whatIs.body) + '</div>' +
      '<div>' + editableSection('home', 'who-benefits', whoBenefits.heading, whoBenefits.body) + '</div>' +
    '</div></section>' +

    '<!-- MEET SELENA -->' +
    '<section class="section-accent"><div class="container grid-2 img-small">' +
      '<div><img src="../images/selena-profile.webp" alt="Selena" style="border-radius:50px;width:100%;"></div>' +
      '<div>' + editableSection('home', 'meet-selena', meetSelena.heading, meetSelena.body) + '</div>' +
    '</div></section>' +

    '<!-- STRUCTURAL INTEGRATION -->' +
    '<section><div class="container grid-2">' +
      '<div>' + editableSection('home', 'structural-integration', structural.heading, structural.body) + '</div>' +
      '<div><img src="../images/rolfing-hands.webp" alt="Rolfing" style="border-radius:50px;width:100%;"></div>' +
    '</div></section>' +

    '<!-- QUOTE -->' +
    '<section class="quote-section" style="background-image:url(\'../images/sunset-person.webp\');">' +
      '<div class="container" style="text-align:center;">' +
        editableSetting('quoteText', '<p class="quote-text">&ldquo;' + (s.quoteText || '') + '&rdquo;</p>') +
      '</div>' +
    '</section>' +

    '<!-- REVIEWS -->' +
    '<section style="padding:60px 0;"><div class="container">' +
      '<h2 class="section-title" style="text-align:center;">Client Reviews</h2>' +
      '<p style="text-align:center;color:#666;font-size:14px;">Manage reviews from the Reviews tab</p>' +
      '<div style="display:flex;gap:20px;margin-top:30px;overflow:hidden;">' +
        testimonials.slice(0, 3).map(function(t) {
          return '<div class="review-card" style="flex:1;min-width:0;">' +
            '<p>&ldquo;' + (t.quote.length > 120 ? t.quote.substring(0, 120) + '...' : t.quote) + '&rdquo;</p>' +
            '<span class="reviewer">' + t.name + '</span></div>';
        }).join('') +
      '</div>' +
    '</div></section>' +

    '<!-- FOOTER -->' +
    '<footer><div class="container">' +
      '<div class="logo-footer"><img src="../images/logo-dark.webp" alt="Salt Spring Rolfing" style="height:50px;"></div>' +
      '<div class="footer-address"><p>Our Clinic is located at<br>' + (s.address || '') + '</p></div>' +
      '<div class="footer-cta"><span class="btn">Book A Session</span></div>' +
    '</div></footer>';
  }

  function buildAboutSelenaPage() {
    var bio1 = getSection('about-selena', 'bio-intro');
    var bio2 = getSection('about-selena', 'bio-story');
    var bio3 = getSection('about-selena', 'bio-passion');

    return '' +
    '<section class="hero hero-short" style="background-image:url(\'../images/AlderForest.png\');">' +
      '<div class="hero-content"><h1>Selena La Brooy</h1><p>Certified Rolfer, Certified Movement Integration Practitioner</p></div>' +
    '</section>' +
    '<section><div class="container">' +
      editableSection('about-selena', 'bio-intro', bio1.heading, bio1.body) +
    '</div></section>' +
    '<section class="section-accent"><div class="container">' +
      editableSection('about-selena', 'bio-story', bio2.heading, bio2.body) +
    '</div></section>' +
    '<section><div class="container">' +
      editableSection('about-selena', 'bio-passion', bio3.heading, bio3.body) +
    '</div></section>';
  }

  function buildAboutSessionsPage() {
    var details = getSection('about-sessions', 'session-details');

    return '' +
    '<section class="hero hero-short" style="background-image:url(\'../images/sessions-hero.jpg\');">' +
      '<div class="hero-content"><h1>What\'s a Rolfing Session Like?</h1></div>' +
    '</section>' +
    '<section><div class="container">' +
      editableSection('about-sessions', 'session-details', details.heading, details.body) +
    '</div></section>';
  }

  // Build full srcdoc HTML
  function buildPagePreview(pageKey) {
    var bodyContent = '';
    if (pageKey === 'home') bodyContent = buildHomePage();
    else if (pageKey === 'about-selena') bodyContent = buildAboutSelenaPage();
    else if (pageKey === 'about-sessions') bodyContent = buildAboutSessionsPage();

    var overrideCSS = [
      '.hero { position: relative; height: 50vh; background-size: cover; background-position: center center; background-repeat: no-repeat; overflow: hidden; z-index: 1; }',
      '.hero.hero-short { height: 35vh; }',
      '.hero::before { content: ""; position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.35)); }',
      '.hero-content { position: absolute; bottom: 12%; left: 5%; z-index: 1; color: #fff; }',
      '.hero h1 { font-family: var(--font-heading); font-size: clamp(2rem, 4vw, 4rem); font-weight: 700; color: #fff; opacity: 0.9; }',
      '.hero p { font-size: 1.1rem; opacity: 0.85; color: #fff; }',
      '.quote-section { background-size: cover; background-position: center; background-repeat: no-repeat; position: relative; padding: 100px 0; }',
      '.quote-section::before { content: ""; position: absolute; inset: 0; background: rgba(0,0,0,0.5); }',
      '.quote-section .container { position: relative; z-index: 1; }',
      '.quote-text { font-family: var(--font-heading); font-size: 1.8rem; color: #fff; text-align: center; font-style: italic; line-height: 1.5; }',
      '/* Edit overlay styles */',
      '.cms-editable { position: relative; border: 2px dashed transparent; border-radius: 8px; padding: 8px; transition: all 0.2s; cursor: pointer; }',
      '.cms-editable:hover { border-color: rgba(124,154,130,0.6); background: rgba(124,154,130,0.05); }',
      '.cms-edit-btn { position: absolute; top: 4px; right: 4px; padding: 4px 14px; background: #7C9A82; color: #fff; border: none; border-radius: 5px; font-family: Poppins,sans-serif; font-size: 11px; font-weight: 500; cursor: pointer; opacity: 0; transition: opacity 0.2s; z-index: 10; pointer-events: none; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }',
      '.cms-editable:hover .cms-edit-btn { opacity: 1; pointer-events: auto; }',
      '.cms-editable-inline { display: block; }',
      '.cms-editable-inline .cms-edit-btn { top: -8px; right: -8px; }',
      'a { pointer-events: none; }',
      '.btn { pointer-events: none; }',
      'body::after { content: "EDIT MODE"; position: fixed; top: 8px; right: 12px; z-index: 9999; background: #7C9A82; color: #fff; padding: 4px 12px; border-radius: 4px; font-family: Poppins,sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 1px; pointer-events: none; }'
    ].join('\n');

    return '<!DOCTYPE html><html><head>' +
      '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">' +
      '<style>' + siteCSS + '</style>' +
      '<style>' + overrideCSS + '</style>' +
      '</head><body>' +
      bodyContent +
      '<script>' +
        'function editSection(page, section) {' +
        '  window.parent.postMessage({ type: "cms-edit", editType: "section", page: page, section: section }, "*");' +
        '}' +
        'function editSetting(key) {' +
        '  window.parent.postMessage({ type: "cms-edit", editType: "setting", setting: key }, "*");' +
        '}' +
      '<\/script>' +
      '</body></html>';
  }

  function loadPageInFrame() {
    var pageKey = pagePicker.value;
    if (!siteCSS) {
      loadSiteCSS().then(function() {
        pageFrame.srcdoc = buildPagePreview(pageKey);
      });
    } else {
      pageFrame.srcdoc = buildPagePreview(pageKey);
    }
  }

  // Auto-resize iframe
  pageFrame.addEventListener('load', function() {
    try {
      var h = pageFrame.contentDocument.documentElement.scrollHeight;
      if (h > 400) pageFrame.style.height = h + 'px';
    } catch(e) {}
  });

  pagePicker.addEventListener('change', loadPageInFrame);

  // Listen for edit messages from iframe
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'cms-edit') return;
    var msg = e.data;
    if (msg.editType === 'section') {
      openSectionModal(msg.page, msg.section);
    } else if (msg.editType === 'setting') {
      openSettingModal(msg.setting);
    }
  });

  function openSectionModal(pageKey, sectionId) {
    editingPageKey = pageKey;
    var page = pages[pageKey];
    if (!page) { toast('Page not found: ' + pageKey, true); return; }
    var idx = page.sections.findIndex(function(s) { return s.id === sectionId; });
    if (idx < 0) { toast('Section not found: ' + sectionId, true); return; }
    editingSectionIndex = idx;
    var section = page.sections[idx];

    $('edit-modal-title').textContent = section.heading;
    $('modal-heading').value = section.heading;

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
    modalQuill.root.innerHTML = section.body;
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
    // Restore Quill visibility
    var editorWrap = $('modal-editor').parentElement;
    editorWrap.querySelectorAll('label').forEach(function(l) { l.style.display = ''; });
    $('modal-editor').style.display = '';
    var toolbar = editorWrap.querySelector('.ql-toolbar');
    if (toolbar) toolbar.style.display = '';
  }

  function saveModal() {
    $('modal-save-btn').disabled = true;
    $('modal-save-btn').textContent = 'Saving...';

    var promise;

    if (editingPageKey === '__setting__') {
      var key = editingSectionIndex;
      settings[key] = $('modal-heading').value.trim();
      promise = putFile('site-settings.json', settings, 'Update setting: ' + key);
    } else {
      var heading = $('modal-heading').value.trim();
      if (!heading) { toast('Heading is required', true); $('modal-save-btn').disabled = false; $('modal-save-btn').textContent = 'Save'; return; }
      pages[editingPageKey].sections[editingSectionIndex].heading = heading;
      pages[editingPageKey].sections[editingSectionIndex].body = modalQuill.root.innerHTML;
      promise = putFile('pages.json', pages, 'Update: ' + editingPageKey + ' / ' + heading);
    }

    promise
      .then(function() {
        toast('Saved! Site updates in about a minute.');
        closeModal();
        // Rebuild preview instantly from updated JSON
        loadPageInFrame();
      })
      .catch(function(err) { toast('Save failed: ' + err.message, true); })
      .finally(function() {
        $('modal-save-btn').disabled = false;
        $('modal-save-btn').textContent = 'Save';
      });
  }

  $('modal-save-btn').addEventListener('click', saveModal);
  $('modal-cancel-btn').addEventListener('click', closeModal);

  // Load first page when Pages section is shown
  function initVisualEditor() {
    if (!pageFrame.srcdoc) {
      loadPageInFrame();
    }
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
    openSectionModal: openSectionModal
  };

  // ===== INIT =====
  initAuth();
  var initialHash = location.hash.replace('#', '');
  if (initialHash && initialHash.indexOf('setup=') !== 0) showSection(initialHash);

})();
