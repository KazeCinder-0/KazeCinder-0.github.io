// js/app.js - 初始化

// 启动时用 CONFIG.author 替换静态 HTML 中的硬编码名字
function applyAuthorName() {
  const name = CONFIG.author || 'Kaze Cinder';
  document.title = name + ' — Backend & AI';
  // nav 栏
  const navEl = document.getElementById('nav-author');
  if (navEl) navEl.textContent = name;
  // footer 版权
  const footEl = document.getElementById('footer-copyright');
  if (footEl) footEl.innerHTML = '&copy; 2026 ' + name + '. Backend & AI 工程实践。';
  // meta 标签
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', name + "'s Blog — 后端与 AI 的工程实践与思考");
  const metaAuthor = document.querySelector('meta[name="author"]');
  if (metaAuthor) metaAuthor.setAttribute('content', name);
  const metaOgTitle = document.querySelector('meta[property="og:title"]');
  if (metaOgTitle) metaOgTitle.setAttribute('content', name + ' — Backend & AI');
}

window.addEventListener('hashchange', render);
loadPosts();

// 移动端菜单切换（管理 aria-expanded 状态）
document.addEventListener('DOMContentLoaded', () => {
  applyAuthorName();
  const btn = document.getElementById('mobile-menu-btn');
  const menu = document.getElementById('mobile-menu');
  if (btn && menu) {
    btn.addEventListener('click', () => {
      const expanded = menu.classList.toggle('hidden');
      btn.setAttribute('aria-expanded', String(!expanded));
      btn.setAttribute('aria-label', expanded ? '打开菜单' : '关闭菜单');
    });
  }
});

// 点击菜单内链接时自动关闭
document.addEventListener('click', (e) => {
  const m = document.getElementById('mobile-menu');
  const btn = document.getElementById('mobile-menu-btn');
  if (m && !m.classList.contains('hidden') && e.target.closest('a')) {
    m.classList.add('hidden');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', '打开菜单');
    }
  }
});

// 文章阅读进度条
window.addEventListener('scroll', () => {
  if (typeof updatePostProgress === 'function') updatePostProgress();
}, { passive: true });

// 快捷键聚焦首页搜索
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    const search = document.getElementById('home-search');
    if (search) {
      e.preventDefault();
      search.focus();
    }
  }
});

// Hero 聚光灯跟随鼠标
let spotlightRaf = 0;
let spotlightTarget = { x: 0, y: 0 };
let spotlightCurrent = { x: 0, y: 0 };

document.addEventListener('mousemove', (e) => {
  const card = document.getElementById('hero-spotlight');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  spotlightTarget.x = ((e.clientX - rect.left) / rect.width) * 100;
  spotlightTarget.y = ((e.clientY - rect.top) / rect.height) * 100;
});

function updateSpotlight() {
  const card = document.getElementById('hero-spotlight');
  if (!card) return;
  const dx = spotlightTarget.x - spotlightCurrent.x;
  const dy = spotlightTarget.y - spotlightCurrent.y;
  spotlightCurrent.x += dx * 0.08;
  spotlightCurrent.y += dy * 0.08;
  card.style.setProperty('--spotlight-x', spotlightCurrent.x + '%');
  card.style.setProperty('--spotlight-y', spotlightCurrent.y + '%');
  spotlightRaf = requestAnimationFrame(updateSpotlight);
}
requestAnimationFrame(updateSpotlight);
