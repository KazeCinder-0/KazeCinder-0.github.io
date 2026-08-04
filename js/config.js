// js/config.js - 集中管理所有配置
const CONFIG = {
  // 分类标签映射
  categoryLabels: {
    vibecoding: 'VibeCoding',
    'ai-engineering': 'AI 工程',
    ainews: 'AI 速递'
  },

  // 章节排序
  chapterOrder: {
    '第一章': 1, '第二章': 2, '第三章': 3, '第四章': 4,
    '第五章': 5, '第六章': 6, '第七章': 7, '第八章': 8,
    '第九章': 9, '第十章': 10
  },

  // 技术栈
  techStack: [
    'Python', 'TypeScript', 'FastAPI', 'LangChain',
    'LangGraph', 'Docker', 'PostgreSQL', 'Redis', 'Kubernetes'
  ],

  // 作者信息
  author: 'Kaze Cinder',
  githubUrl: 'https://github.com/KazeCinder-0',
  email: '2408720644@qq.com',

  // 颜色主题（Tailwind 类映射）
  colors: {
    purple: 'purple-400',
    cyan: 'cyan-400',
    pink: 'pink-400',
    green: 'green-400'
  }
};
