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
  const categories = [...new Set(allPosts.map(p => p.category))];
  let filteredPosts = allPosts;

  if (activeTag) filteredPosts = allPosts.filter(p => p.tags.includes(activeTag));
  if (activeCategory) filteredPosts = allPosts.filter(p => p.category === activeCategory);

  const isDetail = !!(activeTag || activeCategory);
  const latest = filteredPosts[0];
  const visiblePosts = isDetail ? filteredPosts : filteredPosts.slice(1, 7);
  const sectionLabel = activeTag
    ? `标签 / #${escapeHtml(activeTag)}`
    : (activeCategory ? CONFIG.categoryLabels[activeCategory] || activeCategory : '');
  const excerpt = p => p ? (p.excerpt || p.summary || '这是一篇关于后端工程与 AI 实践的记录。') : '';
  const categoryCount = category => allPosts.filter(p => p.category === category).length;

  const renderPostCard = (p, index) => `
    <article class="article-card" data-search="${escapeHtml(`${p.title} ${excerpt(p)} ${(p.tags || []).join(' ')}`)}" onclick="window.location.hash='#/post/${p.id}'">
      <div class="article-index">${String(index + 1).padStart(2, '0')}</div>
      <div class="article-main">
        <div class="article-meta"><span class="category-dot"></span><span>${escapeHtml(CONFIG.categoryLabels[p.category] || p.category)}</span><span class="meta-separator">·</span><time>${escapeHtml(p.date || '')}</time><span class="meta-separator">·</span><span>${escapeHtml(p.readTime || '')}</span></div>
        <h3 class="article-title">${escapeHtml(p.title)}</h3>
        <p class="article-excerpt">${escapeHtml(excerpt(p))}</p>
        <div class="article-footer"><div class="tag-row">${(p.tags || []).slice(0, 3).map(t => `<button class="tag-chip" onclick="event.stopPropagation(); window.location.hash='#/tag/${encodeURIComponent(t)}'">#${escapeHtml(t)}</button>`).join('')}</div><span class="read-link">阅读文章 <span>↗</span></span></div>
      </div>
    </article>`;

  if (isDetail) {
    return `
      <div class="home-page filtered-page">
        <section class="filter-header">
          <div><p class="eyebrow">FILTERED NOTES</p><h1>${sectionLabel}</h1><p class="filter-count">找到 <strong>${filteredPosts.length}</strong> 篇文章</p></div>
          <button class="btn-ghost" onclick="window.location.hash='#/'">清除筛选 <span>×</span></button>
        </section>
        <section class="article-feed filtered-feed">${visiblePosts.length ? visiblePosts.map(renderPostCard).join('') : '<div class="empty-state">还没有符合条件的文章。</div>'}</section>
      </div>`;
  }

  return `
    <div class="home-page">
      <section class="home-hero">
        <div class="hero-copy-wrap">
          <p class="eyebrow"><span class="eyebrow-mark"></span> KAZE CINDER / FIELD NOTES</p>
          <h1>把复杂系统<br><em>讲清楚，也做出来。</em></h1>
          <p class="hero-copy">记录后端架构、AI Agent 与工程实践。这里是我的长期实验室：少一点喧闹，多一点可复用的思考。</p>
          <div class="hero-actions"><a href="#/library" class="btn-primary">浏览知识库 <span>↗</span></a><a href="#/about" class="btn-ghost">了解作者 <span>→</span></a></div>
        </div>
        <div class="hero-metrics" aria-label="博客统计">
          <div class="metric"><strong>${allPosts.length}</strong><span>篇文章</span></div>
          <div class="metric"><strong>${allTags.length}</strong><span>个主题</span></div>
          <div class="metric"><strong>${categories.length}</strong><span>个栏目</span></div>
        </div>
        <div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div>
      </section>

      <section class="home-grid">
        <div class="featured-column">
          <div class="section-heading"><div><p class="eyebrow">LATEST DISPATCH</p><h2>最新文章</h2></div><span class="section-note">按时间更新</span></div>
          ${latest ? `<article class="featured-card" onclick="window.location.hash='#/post/${latest.id}'">
            <div class="featured-topline"><span class="featured-label">本期推荐</span><span>${escapeHtml(latest.date || '')}</span></div>
            <h3>${escapeHtml(latest.title)}</h3><p>${escapeHtml(excerpt(latest))}</p>
            <div class="featured-bottom"><div class="tag-row">${(latest.tags || []).slice(0, 3).map(t => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}</div><span class="featured-arrow">打开文章 <span>↗</span></span></div>
          </article>` : ''}

          <div class="section-heading feed-heading"><div><p class="eyebrow">RECENT WRITING</p><h2>最近写作</h2></div><a href="#/library" class="section-link">查看全部 <span>→</span></a></div>
          <div class="article-feed">${visiblePosts.map((p, i) => renderPostCard(p, i)).join('')}</div>
          <div class="empty-state search-empty" hidden>没有找到匹配的文章。</div>
        </div>

        <aside class="side-rail">
          <section class="rail-card search-card"><p class="eyebrow">SEARCH RECENT NOTES</p><h3>从一个问题开始</h3><p>在最近写作中按标题、摘要或标签查找。</p><label class="search-field"><span>⌕</span><input id="home-search" type="search" placeholder="搜索最近文章..." aria-label="搜索最近文章" autocomplete="off" oninput="filterHomePosts(this.value)"><kbd>Ctrl K</kbd></label></section>
          <section class="rail-card"><div class="rail-heading"><p class="eyebrow">BROWSE BY TOPIC</p><a href="#/library" class="section-link">全部 <span>→</span></a></div><div class="topic-list">${categories.map(c => `<a class="topic-row" href="#/category/${c}"><span><i class="topic-dot"></i>${escapeHtml(CONFIG.categoryLabels[c] || c)}</span><b>${categoryCount(c)}</b></a>`).join('')}</div></section>
          <section class="rail-card quote-card"><span class="quote-mark">“</span><blockquote>输出是最好的学习方式。把想法写下来，系统才真正开始成形。</blockquote><p>— Kaze Cinder</p></section>
        </aside>
      </section>
    </div>`;
}

function filterHomePosts(value) {
  const query = (value || '').trim().toLowerCase();
  const cards = Array.from(document.querySelectorAll('.article-card'));
  let visible = 0;
  cards.forEach(card => {
    const matches = !query || (card.dataset.search || '').toLowerCase().includes(query);
    card.hidden = !matches;
    if (matches) visible++;
  });
  const empty = document.querySelector('.search-empty');
  if (empty) empty.hidden = visible !== 0;
}

async function renderPost(id) {
  const post = allPosts.find(p => p.id === id);
  if (!post) return '<div class="empty-state">文章不存在。<a href="#/">返回首页</a></div>';

  window._articleTitle = post.title;
  const content = await loadMarkdown(post.content);
  const excerpt = post.excerpt || post.summary || '一篇关于后端工程与 AI 实践的记录。';

  return `
    <div class="post-page">
      <div class="post-progress" aria-hidden="true"><span id="post-progress-bar"></span></div>
      <a href="#/" class="back-link"><span>←</span> 返回文章列表</a>
      <header class="post-header">
        <div class="article-meta"><span class="category-dot"></span><span>${escapeHtml(CONFIG.categoryLabels[post.category] || post.category)}</span><span class="meta-separator">·</span><time>${escapeHtml(post.date || '')}</time><span class="meta-separator">·</span><span>${escapeHtml(post.readTime || '')} 阅读</span></div>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="post-lede">${escapeHtml(excerpt)}</p>
        <div class="post-tags">${(post.tags || []).map(t => `<button class="tag-chip" onclick="window.location.hash='#/tag/${encodeURIComponent(t)}'">#${escapeHtml(t)}</button>`).join('')}</div>
      </header>
      <div class="post-layout">
        <aside class="post-aside"><div class="aside-label">ABOUT THIS NOTE</div><p>由 ${escapeHtml(post.author || CONFIG.author)} 发布</p><div class="aside-divider"></div><a href="#/about">关于作者 <span>↗</span></a></aside>
        <section class="prose article-body">${content}</section>
      </div>
    </div>`;
}

function updatePostProgress() {
  const bar = document.getElementById('post-progress-bar');
  if (!bar) return;
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  bar.style.width = `${scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0}%`;
}

function renderAbout() {
  const categoryCount = getCategories().map(c => ({ name: CONFIG.categoryLabels[c] || c, count: allPosts.filter(p => p.category === c).length }));
  return `
    <div class="about-page">
      <section class="about-hero"><div class="about-avatar"><img src="images/avatar/avatar.jpg" alt="${CONFIG.author} 头像"></div><div><p class="eyebrow">A LITTLE CONTEXT</p><h1>你好，我是 <em>${CONFIG.author}</em></h1><p class="about-lede">后端工程师，AI Agent 实践者，也是一名持续记录的人。</p></div></section>
      <div class="about-grid">
        <main class="about-main">
          <section class="about-card"><p class="eyebrow">WHY I WRITE</p><h2>把经验变成可以复用的东西。</h2><div class="about-copy"><p>我专注于后端架构、LangChain、AI Agent 和 DevOps。日常工作里，我关心系统怎么在真实流量、真实约束和真实失败中保持可靠。</p><p>这个博客是我的公开工作台：记录拆解、实验结果和那些值得下次少走弯路的判断。你可以从一篇文章开始，也可以从知识库里按主题漫游。</p></div></section>
          <section class="about-card"><p class="eyebrow">THE TOOLBOX</p><h2>正在使用的技术</h2><div class="stack-grid">${CONFIG.techStack.map((t, i) => `<span class="stack-item"><i>${String(i + 1).padStart(2, '0')}</i>${escapeHtml(t)}</span>`).join('')}</div></section>
        </main>
        <aside class="about-side"><section class="rail-card contact-card"><p class="eyebrow">SAY HELLO</p><h3>欢迎交流想法、项目和问题。</h3><a href="mailto:${CONFIG.email}" onclick="copyEmail(event, '${CONFIG.email}')" class="contact-link"><span class="contact-icon">@</span><span class="email-addr">点击复制邮箱</span><b>↗</b></a><a href="${CONFIG.githubUrl}" target="_blank" rel="noopener noreferrer" class="contact-link"><span class="contact-icon">⌘</span><span>GitHub</span><b>↗</b></a></section><section class="rail-card"><p class="eyebrow">AT A GLANCE</p><div class="about-stats"><div><strong>${allPosts.length}</strong><span>篇文章</span></div><div><strong>${categoryCount.length}</strong><span>个栏目</span></div></div><div class="mini-topics">${categoryCount.map(c => `<span>${escapeHtml(c.name)} <b>${c.count}</b></span>`).join('')}</div></section></aside>
      </div>
    </div>`;
}

function renderLibrary(activeCategory) {
  const categories = getCategories();
  const currentCategory = activeCategory || 'all';
  const postsToShow = currentCategory === 'all' ? allPosts : allPosts.filter(p => p.category === currentCategory);
  const grouped = {};
  postsToShow.forEach(p => {
    const key = p.category;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  });
  const excerpt = p => p.excerpt || p.summary || '';
  return `
    <div class="library-page">
      <header class="library-header"><div><p class="eyebrow">THE ARCHIVE</p><h1>知识库</h1><p>把零散的探索整理成一张可以反复回来的地图。</p></div><div class="library-total"><strong>${postsToShow.length}</strong><span>篇文章</span></div></header>
      <nav class="library-filters" aria-label="文章分类"><a class="${currentCategory === 'all' ? 'is-active' : ''}" href="#/library">全部 <b>${allPosts.length}</b></a>${categories.map(c => `<a class="${currentCategory === c ? 'is-active' : ''}" href="#/library/${c}">${escapeHtml(CONFIG.categoryLabels[c] || c)} <b>${allPosts.filter(p => p.category === c).length}</b></a>`).join('')}</nav>
      <div class="library-groups">${Object.keys(grouped).sort().map(cat => `<section class="library-group"><div class="library-group-heading"><div><span class="topic-dot"></span><h2>${escapeHtml(CONFIG.categoryLabels[cat] || cat)}</h2></div><span>${grouped[cat].length} 篇</span></div><div class="library-list">${grouped[cat].map((p, i) => `<article class="library-row" onclick="window.location.hash='#/post/${p.id}'"><span class="library-number">${String(i + 1).padStart(2, '0')}</span><div class="library-row-main"><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(excerpt(p))}</p><div class="article-meta"><time>${escapeHtml(p.date || '')}</time><span class="meta-separator">·</span><span>${escapeHtml(p.readTime || '')}</span></div></div><span class="library-arrow">↗</span></article>`).join('')}</div></section>`).join('')}</div>
    </div>`;
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
