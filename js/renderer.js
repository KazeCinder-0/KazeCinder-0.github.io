// js/renderer.js - 所有渲染函数

// ===== Utilities =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== 标签云：默认只显示前两行（使用次数最多的标签），其余点击展开 =====
const TAG_VISIBLE_ROWS = 2;
let tagCloudExpanded = false;

function initTagCloud() {
  const cloud = document.getElementById('tag-cloud');
  if (!cloud) return;
  const items = Array.from(cloud.querySelectorAll('.tag-item'));
  const toggle = document.getElementById('tag-toggle');
  if (!toggle) return;
  tagCloudExpanded = false;

  if (!items.length) { toggle.style.display = 'none'; return; }

  // 先全部显示再测量所在行
  items.forEach(el => { el.classList.remove('hidden', 'tag-extra'); el.style.display = 'contents'; });
  const tops = items.map(el => {
    const box = el.querySelector('button') || el;
    return box.offsetTop;
  });

  // 按 offsetTop（误差 1px）归组为行号
  const rowKeys = [];
  const rowOf = tops.map(top => {
    const idx = rowKeys.findIndex(k => Math.abs(k - top) <= 1);
    if (idx === -1) { rowKeys.push(top); return rowKeys.length - 1; }
    return idx;
  });

  if (rowKeys.length <= TAG_VISIBLE_ROWS) {
    toggle.style.display = 'none';
    return;
  }

  items.forEach((el, i) => {
    if (rowOf[i] >= TAG_VISIBLE_ROWS) {
      el.classList.add('hidden', 'tag-extra');
      el.style.display = 'none';
    }
  });
  const hiddenCount = items.length - items.filter((_, i) => rowOf[i] < TAG_VISIBLE_ROWS).length;
  toggle.querySelector('.tag-toggle-label').textContent = '展开全部 ' + hiddenCount + ' 个';
  toggle.style.display = '';
}

function toggleTagCloud(btn) {
  const extras = document.querySelectorAll('#tag-cloud .tag-extra');
  const expanded = !extras[0] || extras[0].style.display !== 'none';
  extras.forEach(el => {
    el.style.display = expanded ? 'contents' : 'none';
    el.classList.toggle('hidden', !expanded);
  });
  tagCloudExpanded = expanded;
  btn.innerHTML = expanded
    ? '<span class="tag-toggle-label">收起</span> ▴'
    : `<span class="tag-toggle-label">展开全部 ${extras.length} 个</span> ▾`;
}

// 窗口尺寸变化时重算折叠行（仅在折叠态下）
let tagCloudResizeTimer = null;
window.addEventListener('resize', () => {
  if (tagCloudExpanded) return;
  clearTimeout(tagCloudResizeTimer);
  tagCloudResizeTimer = setTimeout(initTagCloud, 200);
});

function renderTagBadge(tag, active) {
  return `<button class="px-3 py-1 rounded-full text-xs font-medium font-mono border border-border text-muted hover:tag-hover transition-all duration-300 cursor-pointer ${active === tag ? '!border-purple-500 !text-purple-400 !bg-purple-500/10' : ''}" onclick="window.location.hash='#/tag/${tag}'">#${escapeHtml(tag)}</button>`;
}

function renderCategoryBadge(category, active) {
  const label = CONFIG.categoryLabels[category] || category;
  return `<button class="px-4 py-2 rounded-lg text-sm font-medium border border-border ${active === category ? '!border-purple-500 text-purple-400 bg-purple-500/10' : 'text-muted hover:text-text hover:border-purple-500/50'} transition-all cursor-pointer" onclick="window.location.hash='#/category/${category}'">${label}</button>`;
}

// ===== Chapter Sort Helper =====
function sortChapters(a, b) {
  const oa = CONFIG.chapterOrder[a] || 99;
  const ob = CONFIG.chapterOrder[b] || 99;
  if (oa !== ob) return oa - ob;
  return a.localeCompare(b, 'zh-CN');
}

// ===== Pages =====
async function renderHome(activeTag, activeCategory) {
  const allTags = getAllTagsByUsage();
  let filteredPosts = allPosts;

  if (activeTag) {
    filteredPosts = allPosts.filter(p => p.tags.includes(activeTag));
  }
  if (activeCategory) {
    filteredPosts = allPosts.filter(p => p.category === activeCategory);
  }

  const isDetail = !!(activeTag || activeCategory);
  const sectionLabel = activeTag
    ? `标签: #${escapeHtml(activeTag)}`
    : (activeCategory ? CONFIG.categoryLabels[activeCategory] || activeCategory : '');

  let headerHtml = '';
  if (isDetail) {
    headerHtml = `
      <div class="mb-4 animate-fade-in-up">
        <h1 class="text-3xl md:text-4xl font-bold mb-2"><span class="text-gradient">${escapeHtml(sectionLabel)}</span></h1>
        <p class="text-muted text-sm">共 <strong class="text-text">${filteredPosts.length}</strong> 篇文章</p>
      </div>
    `;
  }

  const categories = [...new Set(allPosts.map(p => p.category))];

  return `
    ${!isDetail ? `
      <section class="mb-12 animate-fade-in-up stagger-1">
        <div id="hero-spotlight" class="spotlight-card relative rounded-2xl overflow-hidden border border-border p-8 md:p-12">
          <div class="absolute inset-0 bg-gradient-to-br from-purple-600/15 via-cyan-600/08 to-pink-600/15"></div>
          <div class="absolute -top-32 -right-32 w-80 h-80 bg-purple-500/08 rounded-full blur-3xl"></div>
          <div class="absolute -bottom-32 -left-32 w-80 h-80 bg-cyan-500/08 rounded-full blur-3xl"></div>
          <div class="hero-scanline"></div>
          <div class="relative z-10">
            <p class="text-purple-400 font-mono text-sm mb-4"><span class="text-muted">const</span> blog <span class="text-muted">=</span> <span class="text-cyan-400">new</span> <span class="text-pink-400">Blog</span><span class="text-muted">(</span><span class="text-green-400">'${CONFIG.author}'</span><span class="text-muted">)</span>;<span class="cursor-blink"></span></p>
            <h1 class="text-4xl md:text-6xl font-bold mb-5 tracking-tighter leading-none">
              <span class="glitch-text" data-text="Backend">Backend</span><span class="text-muted"> & </span><span class="text-gradient">AI</span>
            </h1>
            <p class="text-muted text-lg max-w-2xl leading-relaxed mb-6">后端架构、LangChain、AI Agent 的工程实践与思考。</p>
            <div class="flex flex-wrap gap-3">
              <span class="px-4 py-2 bg-surface border border-border rounded-full text-sm text-muted">${allPosts.length} 文章</span>
              <span class="px-4 py-2 bg-surface border border-border rounded-full text-sm text-muted">${allTags.length} 标签</span>
            </div>
          </div>
        </div>
      </section>

      <section class="mb-8 animate-fade-in-up stagger-2">
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-xs font-mono text-muted uppercase tracking-wider">categories:</span>
          <button class="px-4 py-2 rounded-lg text-sm font-medium border border-border ${activeCategory === null ? '!border-purple-500 text-purple-400 bg-purple-500/10' : 'text-muted hover:text-text hover:border-purple-500/50'} transition-all cursor-pointer" onclick="window.location.hash='#/'">全部</button>
          ${categories.map(c => renderCategoryBadge(c, activeCategory)).join('')}
        </div>
      </section>

      <section class="mb-8 animate-fade-in-up stagger-2">
        <div class="flex flex-wrap items-center gap-2" id="tag-cloud">
          <span class="text-xs font-mono text-muted uppercase tracking-wider mr-2">tags:</span>
          <button class="px-3 py-1 rounded-full text-xs font-medium font-mono border border-border text-muted hover:tag-hover transition-all duration-300 cursor-pointer ${activeTag ? 'bg-purple-500/10 border-purple-500 text-purple-400' : ''}" onclick="window.location.hash='#/'">all</button>
          ${allTags.map(t => `<span class="tag-item">${renderTagBadge(t, activeTag)}</span>`).join('')}
          <button id="tag-toggle" style="display:none" class="px-3 py-1 rounded-full text-xs font-medium font-mono border border-purple-500/50 text-purple-400 hover:bg-purple-500/10 transition-all duration-300 cursor-pointer" onclick="toggleTagCloud(this)"><span class="tag-toggle-label">展开全部</span> ▾</button>
        </div>
      </section>
    ` : ''}

    ${headerHtml}

    <section class="animate-fade-in-up stagger-3">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xs font-mono text-muted uppercase tracking-wider flex items-center gap-2"><span class="w-1 h-4 ${isDetail ? 'bg-purple-500' : 'bg-cyan-500'} rounded-full"></span>${isDetail ? 'articles' : 'recent'}</h2>
        ${!isDetail ? `<a href="#/library" class="text-xs font-mono text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1 group">查看全部 <svg class="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg></a>` : `
          <button onclick="window.location.hash='#/'" class="flex items-center gap-1.5 text-xs font-mono text-muted hover:text-purple-400 transition-colors border border-border hover:border-purple-500/50 rounded-lg px-3 py-1.5 group" aria-label="返回首页">
            <svg class="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            返回首页
          </button>
        `}
      </div>
      <div class="space-y-4">
        ${filteredPosts.length > 0 ? filteredPosts.slice(0, isDetail ? filteredPosts.length : 4).map(p => `
          <article class="card-hover card-grid-line bg-surface border border-border rounded-xl p-6 cursor-pointer group" onclick="window.location.hash='#/post/${p.id}'">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-xs px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded font-mono">${p.chapter || ''}</span>
                  <span class="text-xs text-muted font-mono">${p.date}</span>
                  <span class="text-xs text-muted font-mono">· ${p.readTime}</span>
                </div>
                <h3 class="text-lg font-bold text-text mb-2 group-hover:text-purple-400 transition-colors">${escapeHtml(p.title)}</h3>
                <p class="text-muted text-sm mb-3 line-clamp-2">${escapeHtml(p.excerpt)}</p>
                <div class="flex flex-wrap gap-2">
                  ${p.tags.map(t => `<span class="text-xs px-2 py-0.5 bg-surface text-muted rounded font-mono cursor-pointer hover:text-purple-400 transition-colors" onclick="event.stopPropagation(); window.location.hash='#/tag/${t}'">#${escapeHtml(t)}</span>`).join('')}
                </div>
              </div>
            </div>
          </article>
        `).join('') : '<div class="text-center py-16"><p class="text-muted">暂无文章</p></div>'}
      </div>
    </section>
  `;
}

async function renderPost(id) {
  const post = allPosts.find(p => p.id === id);
  if (!post) return '<div class="text-center py-16"><p class="text-muted">文章不存在</p><a href="#/" class="text-purple-400 hover:underline mt-4 inline-block font-mono text-sm">→ back</a></div>';

  window._articleTitle = post.title;
  const content = await loadMarkdown(post.content);

  return `
    <button onclick="window.history.back()" class="flex items-center gap-2 text-sm text-muted hover:text-text transition-colors mb-8 group" aria-label="返回">
      <svg class="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
      back
    </button>

    <article class="mb-12">
      <div class="flex flex-wrap items-center gap-3 mb-4 text-xs font-mono text-muted">
        <span class="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded">${post.chapter || ''}</span>
        <span>${post.date}</span><span class="text-border">|</span><span>${post.readTime}</span><span class="text-border">|</span><span>${CONFIG.author}</span>
      </div>
      <h1 class="text-3xl md:text-4xl font-bold mb-6 tracking-tight leading-tight">${escapeHtml(post.title)}</h1>
      <div class="flex flex-wrap gap-2 mb-6">
        ${post.tags.map(t => `<button class="px-3 py-1 rounded-full text-xs font-medium font-mono border border-border text-muted hover:tag-hover transition-all duration-300 cursor-pointer" onclick="window.location.hash='#/tag/${t}'">#${escapeHtml(t)}</button>`).join('')}
      </div>
      <div class="border-t border-border"></div>
    </article>

    <section class="prose text-text leading-relaxed space-y-6 mb-12" style="line-height: 1.8;">
      ${content}
    </section>
  `;
}

function renderAbout() {
  return `
    <section class="mb-12">
      <div class="text-center mb-10">
        <div class="w-24 h-24 mx-auto mb-6 overflow-hidden rounded-2xl shadow-2xl animate-float">
          <img src="images/avatar/avatar.jpg" alt="${CONFIG.author} 头像" class="w-full h-full object-cover" loading="lazy">
        </div>
        <h1 class="text-3xl md:text-4xl font-bold mb-3 tracking-tight">Hi, I'm <span class="text-gradient">${CONFIG.author}</span></h1>
        <p class="text-lg text-muted max-w-xl mx-auto leading-relaxed">后端架构 · AI Agent · 终身学习者</p>
      </div>
    </section>

    <div class="grid md:grid-cols-3 gap-8">
      <div class="md:col-span-2 space-y-8">
        <section class="bg-surface border border-border rounded-xl p-8">
          <h2 class="text-xs font-mono text-muted uppercase tracking-wider mb-6 flex items-center gap-2"><span class="w-1 h-4 bg-purple-500 rounded-full"></span>about</h2>
          <div class="space-y-4 text-muted leading-relaxed">
            <p>你好！欢迎来到我的技术博客。</p>
            <p>专注于 <span class="text-purple-400">后端架构</span>、<span class="text-cyan-400">LangChain</span>、<span class="text-pink-400">AI Agent</span> 和 <span class="text-yellow-400">DevOps</span> 等领域。</p>
            <p>我相信 <span class="text-text font-medium">"输出是最好的学习方式"</span>。通过写作，我能更系统地整理思路，发现理解上的盲区。</p>
          </div>
        </section>

        <section class="bg-surface border border-border rounded-xl p-8">
          <h2 class="text-xs font-mono text-muted uppercase tracking-wider mb-6 flex items-center gap-2"><span class="w-1 h-4 bg-cyan-500 rounded-full"></span>stack</h2>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            ${CONFIG.techStack.map(t => `
              <div class="flex items-center gap-2 p-3 bg-bg border border-border rounded-lg hover:border-purple-500/50 transition-colors">
                <svg class="w-4 h-4 text-purple-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                <span class="text-sm text-text">${t}</span>
              </div>
            `).join('')}
          </div>
        </section>
      </div>

      <div class="space-y-6">
        <section class="bg-surface border border-border rounded-xl p-6">
          <h3 class="text-xs font-mono text-muted uppercase tracking-wider mb-4 flex items-center gap-2"><span class="w-1 h-4 bg-pink-500 rounded-full"></span>contact</h3>
          <div class="space-y-3">
            <a href="mailto:${CONFIG.email}" class="flex items-center gap-3 text-sm text-muted hover:text-purple-400 transition-colors" onclick="copyEmail(event, '${CONFIG.email}')">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              <span class="email-addr">点击复制邮箱</span>
            </a>
            <a href="${CONFIG.githubUrl}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 text-sm text-muted hover:text-purple-400 transition-colors">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              ${CONFIG.githubUrl.replace('https://', '')}
            </a>
          </div>
        </section>
        <section class="bg-surface border border-border rounded-xl p-6">
          <h3 class="text-xs font-mono text-muted uppercase tracking-wider mb-4 flex items-center gap-2"><span class="w-1 h-4 bg-green-500 rounded-full"></span>stats</h3>
          <div class="space-y-4">
            <div class="flex justify-between"><span class="text-sm text-muted">Posts</span><span class="text-lg font-bold text-text font-mono">${allPosts.length}</span></div>
            <div class="flex justify-between"><span class="text-sm text-muted">Categories</span><span class="text-lg font-bold text-text font-mono">${getCategories().length}</span></div>
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderLibrary(activeCategory) {
  const categories = getCategories();
  const currentCategory = activeCategory || 'all';

  let postsToShow = allPosts;
  if (currentCategory !== 'all') {
    postsToShow = allPosts.filter(p => p.category === currentCategory);
  }

  // Separate categories into "has chapters" and "no chapters"
  const catHasChapters = {};
  categories.forEach(c => {
    const catPosts = currentCategory === 'all' ? allPosts.filter(p => p.category === c) : postsToShow.filter(p => p.category === c);
    catHasChapters[c] = catPosts.some(p => p.chapter && p.chapter.trim() !== '');
  });

  // Group by category -> chapter (only for categories with chapters)
  const grouped = {};
  postsToShow.forEach(p => {
    const cat = p.category;
    const chap = p.chapter && p.chapter.trim() !== '' ? p.chapter : '';
    if (!grouped[cat]) grouped[cat] = {};
    if (!grouped[cat][chap]) grouped[cat][chap] = [];
    grouped[cat][chap].push(p);
  });

  // Sort chapters within each category (only non-empty keys)
  Object.keys(grouped).forEach(cat => {
    const sorted = {};
    Object.keys(grouped[cat]).filter(k => k !== '').sort(sortChapters).forEach(k => { sorted[k] = grouped[cat][k]; });
    // Put empty-key posts at the end
    if (grouped[cat]['']) sorted[''] = grouped[cat][''];
    grouped[cat] = sorted;
  });

  const categoryLabels = CONFIG.categoryLabels || {};

  return `
    <div class="mb-8 animate-fade-in-up">
      <h1 class="text-3xl md:text-4xl font-bold mb-4 tracking-tight"><span class="text-gradient">知识库</span></h1>
      <p class="text-muted max-w-2xl leading-relaxed">按分类组织的完整文章索引，共 <strong class="text-text">${allPosts.length}</strong> 篇文章。</p>
    </div>

    <section class="mb-8 animate-fade-in-up stagger-1">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-xs font-mono text-muted uppercase tracking-wider">categories:</span>
        <button class="px-4 py-2 rounded-lg text-sm font-medium border border-border ${currentCategory === 'all' ? '!border-purple-500 text-purple-400 bg-purple-500/10' : 'text-muted hover:text-text hover:border-purple-500/50'} transition-all cursor-pointer" onclick="window.location.hash='#/library'">全部</button>
        ${categories.map(c => `
          <button class="px-4 py-2 rounded-lg text-sm font-medium border border-border ${currentCategory === c ? '!border-purple-500 text-purple-400 bg-purple-500/10' : 'text-muted hover:text-text hover:border-purple-500/50'} transition-all cursor-pointer" onclick="window.location.hash='#/library/${c}'">${categoryLabels[c] || c}</button>
        `).join('')}
      </div>
    </section>

    <div class="space-y-8 animate-fade-in-up stagger-2">
      ${Object.keys(grouped).sort().map(cat => {
        const catLabel = categoryLabels[cat] || cat;
        const catData = grouped[cat];
        const hasChapters = catHasChapters[cat];

        // Flat list (no chapters)
        if (!hasChapters) {
          return `
            <section class="bg-surface border border-border rounded-xl overflow-hidden">
              <div class="px-6 py-4 border-b border-border bg-bg/50">
                <h2 class="text-lg font-bold text-text flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-purple-500"></span>
                  ${catLabel}
                  <span class="text-xs font-mono text-muted font-normal ml-2">${Object.values(catData).flat().length} 篇</span>
                </h2>
              </div>
              <div class="divide-y divide-border">
                ${Object.values(catData).flat().map(p => `
                  <article class="group cursor-pointer" onclick="window.location.hash='#/post/${p.id}'">
                    <div class="flex items-start gap-3 p-4 hover:bg-bg transition-colors">
                      <span class="text-xs text-muted font-mono mt-0.5 whitespace-nowrap">${p.date}</span>
                      <div class="flex-1 min-w-0">
                        <h4 class="text-sm font-medium text-text group-hover:text-purple-400 transition-colors">${escapeHtml(p.title)}</h4>
                        <p class="text-xs text-muted line-clamp-1 mt-1">${escapeHtml(p.excerpt)}</p>
                      </div>
                      <span class="text-xs text-muted font-mono whitespace-nowrap">${p.readTime}</span>
                    </div>
                  </article>
                `).join('')}
              </div>
            </section>
          `;
        }

        // Chapter grouping (has chapters)
        return `
          <section class="bg-surface border border-border rounded-xl overflow-hidden">
            <div class="px-6 py-4 border-b border-border bg-bg/50">
              <h2 class="text-lg font-bold text-text flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-purple-500"></span>
                ${catLabel}
              </h2>
            </div>
            <div class="divide-y divide-border">
              ${Object.keys(catData).filter(k => k !== '').map(chap => `
                <div class="p-6">
                  <h3 class="text-sm font-mono text-purple-400 mb-4 flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                    ${escapeHtml(chap)}
                  </h3>
                  <div class="space-y-3 ml-6">
                    ${catData[chap].map(p => `
                      <article class="group cursor-pointer" onclick="window.location.hash='#/post/${p.id}'">
                        <div class="flex items-start gap-3 p-3 rounded-lg hover:bg-bg transition-colors">
                          <span class="text-xs text-muted font-mono mt-0.5 whitespace-nowrap">${p.date}</span>
                          <div class="flex-1 min-w-0">
                            <h4 class="text-sm font-medium text-text group-hover:text-purple-400 transition-colors">${escapeHtml(p.title)}</h4>
                            <p class="text-xs text-muted line-clamp-1 mt-1">${escapeHtml(p.excerpt)}</p>
                          </div>
                          <span class="text-xs text-muted font-mono whitespace-nowrap">${p.readTime}</span>
                        </div>
                      </article>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          </section>
        `;
      }).join('')}
    </div>
  `;
}

function copyEmail(e, email) {
  e.preventDefault();
  navigator.clipboard.writeText(email).then(() => {
    const el = e.currentTarget.querySelector('.email-addr');
    if (el) {
      const original = el.textContent;
      el.textContent = '已复制到剪贴板 ✓';
      el.classList.add('!text-green-400');
      setTimeout(() => { el.textContent = original; el.classList.remove('!text-green-400'); }, 2000);
    }
  }).catch(() => {
    prompt('请手动复制邮箱:', email);
  });
}
