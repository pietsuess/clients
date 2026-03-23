/* site.js -- fetches JSON content and renders it into public pages */

(function() {
  var BASE = (function() {
    // Detect if we're in /blog/ subfolder
    if (location.pathname.indexOf('/blog/') !== -1) return '../';
    return '';
  })();

  function fetchJSON(file, callback) {
    fetch(BASE + 'content/' + file)
      .then(function(r) { return r.json(); })
      .then(callback)
      .catch(function(err) { console.warn('Failed to load ' + file, err); });
  }

  function formatDate(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  // ===== BLOG LISTING (blog.html) =====
  function renderBlogList() {
    var target = document.getElementById('blog-list');
    if (!target) return;
    fetchJSON('blog-posts.json', function(posts) {
      var published = posts.filter(function(p) { return p.published; });
      // Sort oldest first
      published.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
      var html = '';
      published.forEach(function(post) {
        html += '<a href="blog/post.html#' + post.id + '" class="blog-card" style="color:inherit;">';
        html += '<div class="blog-card-body">';
        html += '<p class="date">' + formatDate(post.date) + '</p>';
        html += '<h3>' + post.title + '</h3>';
        html += '<p>' + post.excerpt + '</p>';
        html += '<span class="read-more">Read More &rarr;</span>';
        html += '</div></a>';
      });
      target.innerHTML = html;
    });
  }

  // ===== SINGLE BLOG POST (blog/post.html) =====
  function renderBlogPost() {
    var target = document.getElementById('blog-post-content');
    if (!target) return;
    var postId = location.hash.replace('#', '');
    if (!postId) { location.href = '../blog.html'; return; }
    fetchJSON('blog-posts.json', function(posts) {
      var post = posts.find(function(p) { return p.id === postId; });
      if (!post) { target.innerHTML = '<p>Post not found.</p>'; return; }
      document.title = post.title + ' \u2014 Salt Spring Rolfing';
      target.innerHTML =
        '<h1>' + post.title + '</h1>' +
        '<p class="post-meta">By ' + post.author + ' &bull; ' + formatDate(post.date) + '</p>' +
        post.body +
        '<p><a href="../blog.html">&larr; Back to Blog</a></p>';
    });
  }

  // ===== TESTIMONIALS (index.html carousel) =====
  function renderTestimonials() {
    var target = document.getElementById('reviewsCarousel');
    if (!target) return;
    fetchJSON('testimonials.json', function(reviews) {
      var html = '';
      reviews.forEach(function(r) {
        html += '<div class="review-card">';
        html += '<p>&ldquo;' + r.quote + '&rdquo;</p>';
        html += '<span class="reviewer">' + r.name;
        if (r.credentials) html += '<br><em>' + r.credentials + '</em>';
        html += '</span></div>';
      });
      target.innerHTML = html;
      // Re-init carousel after content loads
      initCarousel();
    });
  }

  // ===== FAQ ACCORDION (faqs.html) =====
  function renderFAQs() {
    var target = document.getElementById('faq-content');
    if (!target) return;
    fetchJSON('faqs.json', function(faqs) {
      faqs.sort(function(a, b) { return a.order - b.order; });
      var html = '';
      faqs.forEach(function(faq) {
        html += '<div class="faq-item">';
        html += '<button class="faq-question">' + faq.question + '</button>';
        html += '<div class="faq-answer"><div class="faq-answer-inner">' + faq.answer + '</div></div>';
        html += '</div>';
      });
      target.innerHTML = html;
      // Bind accordion
      document.querySelectorAll('.faq-question').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var item = this.parentElement;
          var wasActive = item.classList.contains('active');
          document.querySelectorAll('.faq-item').forEach(function(el) { el.classList.remove('active'); });
          if (!wasActive) item.classList.add('active');
        });
      });
    });
  }

  // ===== FOOTER ADDRESS (all pages) =====
  function renderFooter() {
    var addressEl = document.getElementById('footer-address');
    if (!addressEl) return;
    fetchJSON('site-settings.json', function(settings) {
      addressEl.innerHTML = 'Our Clinic is located at<br>' + settings.address;
    });
  }

  // ===== CAROUSEL INIT =====
  function initCarousel() {
    var carousel = document.getElementById('reviewsCarousel');
    var prevBtn = document.getElementById('carouselPrev');
    var nextBtn = document.getElementById('carouselNext');
    if (!carousel || !prevBtn || !nextBtn || !carousel.firstElementChild) return;
    var shifting = false;
    var cardW = carousel.firstElementChild.offsetWidth + 20; // card + gap

    nextBtn.addEventListener('click', function() {
      if (shifting) return;
      shifting = true;
      cardW = carousel.firstElementChild.offsetWidth + 20;
      carousel.style.transition = 'transform 0.4s ease';
      carousel.style.transform = 'translateX(-' + cardW + 'px)';
      setTimeout(function() {
        carousel.style.transition = 'none';
        carousel.style.transform = '';
        carousel.appendChild(carousel.firstElementChild);
        shifting = false;
      }, 400);
    });

    prevBtn.addEventListener('click', function() {
      if (shifting) return;
      shifting = true;
      cardW = carousel.firstElementChild.offsetWidth + 20;
      carousel.style.transition = 'none';
      carousel.insertBefore(carousel.lastElementChild, carousel.firstElementChild);
      carousel.style.transform = 'translateX(-' + cardW + 'px)';
      carousel.offsetHeight;
      carousel.style.transition = 'transform 0.4s ease';
      carousel.style.transform = '';
      setTimeout(function() { shifting = false; }, 400);
    });
  }

  // ===== PAGE SECTIONS (data-cms-page="home" data-cms-section="what-is-rolfing") =====
  function renderPageSections() {
    var targets = document.querySelectorAll('[data-cms-section]');
    if (!targets.length) return;
    fetchJSON('pages.json', function(pages) {
      targets.forEach(function(el) {
        var pageKey = el.dataset.cmsPage;
        var sectionId = el.dataset.cmsSection;
        if (!pages[pageKey]) return;
        var section = pages[pageKey].sections.find(function(s) { return s.id === sectionId; });
        if (!section) return;
        // Update heading if there's a sibling or parent heading
        var headingEl = el.previousElementSibling;
        if (headingEl && headingEl.classList.contains('section-title')) {
          headingEl.innerHTML = section.heading;
        }
        el.innerHTML = section.body;
      });
    });
  }

  // ===== SITE SETTINGS =====
  function renderSettings() {
    fetchJSON('site-settings.json', function(s) {
      // Footer address on all pages
      document.querySelectorAll('[data-cms-setting="address"]').forEach(function(el) {
        el.innerHTML = 'Our Clinic is located at<br>' + s.address;
      });
      // Hero headline
      var heroEl = document.querySelector('[data-cms-setting="heroHeadline"]');
      if (heroEl) heroEl.innerHTML = s.heroHeadline;
      // Quote text
      var quoteEl = document.querySelector('[data-cms-setting="quoteText"]');
      if (quoteEl) quoteEl.innerHTML = '&ldquo;' + s.quoteText + '&rdquo;';
      // Quote body
      var quoteBodyEl = document.querySelector('[data-cms-setting="quoteBody"]');
      if (quoteBodyEl) quoteBodyEl.textContent = s.quoteBody;
    });
  }

  // ===== INIT =====
  renderBlogList();
  renderBlogPost();
  renderTestimonials();
  renderFAQs();
  renderPageSections();
  renderSettings();
})();
