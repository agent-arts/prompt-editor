import { defineConfig } from 'vitepress'
import { sidebar } from './sidebar.mts'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Prompt Editor",
  description: "基于 CodeMirror 6 的提示词编辑器，纯 TypeScript 实现，框架无关。",
  base: '/editor/',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '文档', link: '/docs/overview' }
    ],
    sidebar: sidebar,
    footer: {
      message: 'Made with ❤ by',
      copyright: '<a href="https://kagol.github.io/blogs/" target="_blank">Kagol</a> and his friends',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/agent-arts/editor' }
    ]
  }
})
