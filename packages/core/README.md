# @agent-arts/editor

特性：

- 编辑块 edit-block：可编辑
- 插件块 plugin-block：不可编辑，通过大括号 `{` 呼起
- AI 对话 ai-dialog：通过斜线 `/` 或拖选内容呼起

## 演示动画

![演示动画](./product-animation.gif)

## 使用

### 安装

```bash
npm install @agent-arts/editor
```

### 快速上手

```typescript
import { CustomEditor, CustomEditorOptions } from '@agent-arts/editor';

const options: CustomEditorOptions = {
  parent: document.querySelector('#editor')!,
  initialDoc: '# 欢迎使用 AgentArts Editor',
  onOpenPopup: (id, rect) => {
    // 处理编辑块弹窗
  },
  onTriggerPluginPopup: (pos) => {
    // 输入 '{' 时触发
  },
  onTriggerAIDialog: (pos) => {
    // 输入 '/' 时触发
  }
};

const editor = new CustomEditor(options);
```

### 插件配置

#### AI 对话插件 (AIDialogPlugin)

```typescript
import { AIDialogPlugin } from '@agent-arts/editor';

const aiPlugin = new AIDialogPlugin({
  onStream: (text) => { /* 处理流式输出 */ },
  onLoading: (loading) => { /* 处理加载状态 */ },
  onShow: (pos, style) => { /* 显示 AI 浮框 */ },
  onHide: () => { /* 隐藏 AI 浮框 */ }
});
```

#### 插件库浮框 (LibraryBlockPlugin)

```typescript
import { LibraryBlockPlugin } from '@agent-arts/editor';

const libraryPlugin = new LibraryBlockPlugin({
  onShow: (pos, style) => { /* 显示插件列表浮框 */ },
  onHide: () => { /* 隐藏插件列表浮框 */ }
});

// 插入选中的插件块
editor.addPluginBlock(libraryPlugin.getTriggerPos(), {
  id: 'plugin-id',
  name: '插件名称',
  type: 'plugin'
});
```

#### 编辑块插件 (EditBlockPlugin)

```typescript
import { EditBlockPlugin } from '@agent-arts/editor';

const editPlugin = new EditBlockPlugin({
  onShow: (block, style) => { /* 显示编辑块配置浮框 */ },
  onHide: () => { /* 隐藏浮框 */ }
});
```

### 核心 API

- `editor.addBlock()`: 手动添加一个新的编辑块。
- `editor.syncBlock(block)`: 同步外部状态到编辑器内部的块。
- `editor.getData()`: 获取编辑器的 JSON 数据和 HTML 内容。
- `editor.destroy()`: 销毁编辑器实例。


