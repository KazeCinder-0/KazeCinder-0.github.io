// js/data.js - 数据加载（全局变量和函数）
let allPosts = [];
let postsLoaded = false;

async function loadPosts() {
  try {
    const response = await fetch('data/posts.json');
    if (response.ok) {
      allPosts = await response.json();
    } else {
      throw new Error('posts.json not found');
    }
  } catch (err) {
    console.error('Failed to load posts, using fallback:', err);
    allPosts = (typeof window !== 'undefined' && window.FALLBACK_POSTS) ? window.FALLBACK_POSTS : [];
  }
  allPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
  postsLoaded = true;
  if (typeof render === 'function') render();
}

function getAllTags() {
  const set = new Set();
  allPosts.forEach(p => p.tags.forEach(t => set.add(t)));
  return Array.from(set).sort();
}

function getCategories() {
  return [...new Set(allPosts.map(p => p.category))].sort();
}
