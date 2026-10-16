// js/router.js - 路由逻辑
let renderInProgress = false;

async function render() {
  if (!postsLoaded) return;
  if (renderInProgress) return;
  renderInProgress = true;

  const hash = window.location.hash || '#/';
  const main = document.getElementById('main-content');
  let page, title;

  // 更新导航激活状态
  document.querySelectorAll('[data-nav]').forEach(el => {
    const nav = el.getAttribute('data-nav');
    const isHome = hash === '#/' || hash === '#' || hash.startsWith('#/post') || hash.startsWith('#/tag') || hash.startsWith('#/category');
    const isLibrary = hash.startsWith('#/library');
    const isAbout = hash === '#/about';

    if (nav === 'home' && isHome) {
      el.className = 'px-4 py-2 rounded-lg text-sm font-medium text-purple-400 bg-purple-500/10';
    } else if (nav === 'library' && isLibrary) {
      el.className = 'px-4 py-2 rounded-lg text-sm font-medium text-purple-400 bg-purple-500/10';
    } else if (nav === 'about' && isAbout) {
      el.className = 'px-4 py-2 rounded-lg text-sm font-medium text-purple-400 bg-purple-500/10';
    } else {
      el.className = 'px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-text hover:bg-surface transition-colors';
    }
  });

  if (hash === '#/' || hash === '#') {
    page = await renderHome(null, null);
    title = CONFIG.author + ' — Backend & AI';
  } else if (hash.startsWith('#/post/')) {
    const id = hash.replace('#/post/', '');
    main.innerHTML = `<div class="animate-fade-in-up">
      <div class="flex flex-col items-center justify-center py-20 gap-4">
        <div class="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
        <p class="text-muted font-mono text-sm">加载文章中...</p>
      </div>
    </div>`;
    document.title = '加载中... | ' + CONFIG.author;
    page = await renderPost(id);
    const post = allPosts.find(p => p.id === id);
    title = post ? post.title + ' | ' + CONFIG.author : 'Not Found | ' + CONFIG.author;
  } else if (hash.startsWith('#/tag/')) {
    const tag = hash.replace('#/tag/', '');
    page = await renderHome(tag, null);
    title = '#' + tag + ' | ' + CONFIG.author;
  } else if (hash.startsWith('#/category/')) {
    const category = hash.replace('#/category/', '');
    page = await renderHome(null, category);
    title = (CONFIG.categoryLabels[category] || category) + ' | ' + CONFIG.author;
  } else if (hash.startsWith('#/library')) {
    const category = hash.replace('#/library', '').replace('/', '');
    page = renderLibrary(category || null);
    title = '知识库 | ' + CONFIG.author;
  } else if (hash === '#/about') {
    page = renderAbout();
    title = 'About | ' + CONFIG.author;
  } else {
    page = await renderHome(null, null);
    title = CONFIG.author + ' — Backend & AI';
  }

  main.innerHTML = `<div class="animate-fade-in-up">${page}</div>`;
  document.title = title;
  window.scrollTo(0, 0);
  if (typeof initTagCloud === 'function') initTagCloud();
  renderInProgress = false;
}
