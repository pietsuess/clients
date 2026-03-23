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
      renderPagesList();
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

  // ===== PAGES =====
  function renderPagesList() {
    var html = '';
    Object.keys(pages).forEach(function(key) {
      var page = pages[key];
      html += '<div class="item-row" style="cursor:pointer;" onclick="CMS.editPage(\'' + key + '\')">';
      html += '<div class="item-info"><h3>' + page.title + '</h3>';
      html += '<p>' + page.sections.length + ' editable section' + (page.sections.length !== 1 ? 's' : '') + '</p></div>';
      html += '<div class="item-actions">';
      html += '<button class="btn-small">Edit</button>';
      html += '</div></div>';
    });
    $('pages-list').innerHTML = html || '<p style="color:#999;">No pages configured.</p>';
  }

  function editPage(key) {
    editingPageKey = key;
    var page = pages[key];
    $('page-edit-title').textContent = page.title;
    var html = '';
    page.sections.forEach(function(section, i) {
      var preview = section.body.replace(/<[^>]+>/g, '');
      if (preview.length > 100) preview = preview.substring(0, 100) + '...';
      html += '<div class="item-row">';
      html += '<div class="item-info"><h3>' + section.heading + '</h3>';
      html += '<p>' + preview + '</p></div>';
      html += '<div class="item-actions">';
      html += '<button class="btn-small" onclick="CMS.editPageSection(\'' + key + '\',' + i + ')">Edit</button>';
      html += '</div></div>';
    });
    $('page-sections-list').innerHTML = html;
    showSection('page-edit');
  }

  function editPageSection(key, index) {
    editingPageKey = key;
    editingSectionIndex = index;
    var section = pages[key].sections[index];
    $('page-section-edit-title').textContent = section.heading;
    $('page-section-heading').value = section.heading;

    if (!pageSectionQuill) {
      pageSectionQuill = new Quill('#page-section-editor', {
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
      setupQuillImageHandler(pageSectionQuill);
    }
    pageSectionQuill.root.innerHTML = section.body;
    showSection('page-section-edit');
  }

  function savePageSection() {
    var heading = $('page-section-heading').value.trim();
    if (!heading) { toast('Heading is required', true); return; }

    pages[editingPageKey].sections[editingSectionIndex].heading = heading;
    pages[editingPageKey].sections[editingSectionIndex].body = pageSectionQuill.root.innerHTML;

    $('page-section-save-btn').disabled = true;
    $('page-section-save-btn').textContent = 'Saving...';

    putFile('pages.json', pages, 'Update page content: ' + editingPageKey + ' / ' + heading)
      .then(function() {
        toast('Page content saved!');
        editPage(editingPageKey);
      })
      .catch(function(err) { toast('Save failed: ' + err.message, true); })
      .finally(function() {
        $('page-section-save-btn').disabled = false;
        $('page-section-save-btn').textContent = 'Save';
      });
  }

  $('page-back-btn').addEventListener('click', function() { showSection('pages'); });
  $('page-section-save-btn').addEventListener('click', savePageSection);
  $('page-section-cancel-btn').addEventListener('click', function() { editPage(editingPageKey); });

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
    editPage: editPage,
    editPageSection: editPageSection
  };

  // ===== INIT =====
  initAuth();
  var initialHash = location.hash.replace('#', '');
  if (initialHash && initialHash.indexOf('setup=') !== 0) showSection(initialHash);

})();
