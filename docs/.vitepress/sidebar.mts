export const sidebar = [
  {
    text: '快速入门',
    items: [
      { text: '概述', link: '/docs/overview' },
      { text: '快速开始', link: '/docs/quick-start' },
      { text: 'Monorepo 目录结构', link: '/docs/monorepo-layout' }
    ]
  },
  {
    text: '深入探索',
    items: [
      { text: '架构概述', link: '/docs/architecture-overview' },
      {
        text: '核心编辑器',
        items: [
          { text: 'CustomEditor 类 API', link: '/docs/custom-editor-class-api' },
          { text: 'Block 类型系统', link: '/docs/block-type-system' },
          { text: '内容序列化格式', link: '/docs/content-serialization-format' },
        ]
      },
      {
        text: '插件架构',
        items: [
          { text: '编辑 Block 插件', link: '/docs/edit-block-plugin' },
          { text: '组件库 Block 插件', link: '/docs/library-block-plugin' },
          { text: 'AI 对话插件', link: '/docs/ai-dialog-plugin' },
          { text: 'StateField 与 StateEffect 模式', link: '/docs/statefield-and-stateeffect-patterns' },
        ]
      },
      {
        text: '框架集成',
        items: [
          { text: 'Angular 集成', link: '/docs/angular-integration' },
          { text: 'ControlValueAccessor 模式', link: '/docs/controlvalueaccessor-pattern' },
        ]
      }
    ]
  }
]