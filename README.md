# @agent-arts/editor

一个基于 CodeMirror 6 的提示词编辑器，框架无关，支持 Vue.js、Angular、React。

## 特性

- 编辑块 edit-block：可编辑
- 插件块 plugin-block：不可编辑，通过大括号 `{` 呼起，用户插入插件、工作流、变量等
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
import { CustomEditor, type CustomEditorOptions } from '@agent-arts/editor';

const options: CustomEditorOptions = {
  parent: document.querySelector('#editor')!,
  initialDoc: '# 欢迎使用 AgentArts Editor\n\n在这里输入提示词，支持 Markdown。\n\n在下面插入一个编辑块：{#EditorBlock id="block-1" placeholder="请输入..."#}智能助手{#/EditorBlock#}\n\n也可以输入 { 呼起插件块弹窗，输入 / 或框选文本呼起 AI。',
  onOpenPopup: (id, rect) => {
    // 处理编辑块弹窗
  },
  onTriggerPluginPopup: (pos) => {
    // 输入 '{' 时触发
  },
  onHidePluginPopup: () => {
    // 当触发字符被删除/修改时隐藏插件弹窗（可选）
  },
  onTriggerAIDialog: (pos) => {
    // 输入 '/' 或点击选区按钮时触发
  },
  onHideAIDialog: () => {
    // 当触发字符被删除/修改时隐藏 AI 对话框（可选）
  },
  onChange: (data) => {
    // data 是字符串模板（见“数据格式”）
  }
};

const editor = new CustomEditor(options);
```

### 数据格式

`editor.getData()` 和 `onChange(data)` 返回的都是字符串（`EditorData = string`），其中包含两类块标记：

- 编辑块（可编辑）：

```txt
{#EditorBlock id="block-1" placeholder="请输入..."#}预设内容{#/EditorBlock#}
```

- 插件块（不可编辑）：

```txt
{#PluginBlock id="plugin-1" type="plugin"#}MCP服务01{#/PluginBlock#}
{#PluginBlock id="workflow-1" type="workflow"#}Bing搜索{#/PluginBlock#}
```

- 变量块：直接使用 `{{name}}`（可通过 `editor.addVariableBlock(pos, name)` 插入）。

### 接入弹窗（编辑块 / 插件块 / AI）

本包只负责在编辑器内部“触发时机”和“坐标信息”的回调；UI（弹窗、列表、AI 对话框）需要你在业务侧实现。

```typescript
import { CustomEditor, type EditorBlock, type PluginBlock } from '@agent-arts/editor';

let pluginTriggerPos = 0;

const editor = new CustomEditor({
  parent: document.querySelector('#editor')!,
  initialDoc: '',
  onOpenPopup: (id, rect) => {
    const block = editor.getBlock(id);
    if (!block) return;

    // rect 是块在屏幕上的 DOMRect，你可以据此定位弹窗
    // 打开弹窗后，用户修改 placeholder / presetText，调用 editor.syncBlock(updated)
  },
  onTriggerPluginPopup: (pos) => {
    pluginTriggerPos = pos;
    const coords = editor.coordsAtPos(pos);
    // coords 可用于定位弹窗；插件列表 UI 由业务侧实现
  },
  onHidePluginPopup: () => {
    // 关闭插件列表弹窗（可选）
  },
  onTriggerAIDialog: (pos) => {
    const coords = editor.coordsAtPos(pos);
    // 打开 AI 对话框（UI 与请求逻辑由业务侧实现）
  },
  onHideAIDialog: () => {
    // 关闭 AI 对话框（可选）
  }
});

function insertPluginBlock(item: PluginBlock) {
  editor.addPluginBlock(pluginTriggerPos, item);
}

function insertVariableBlock(name: string) {
  editor.addVariableBlock(pluginTriggerPos, name);
}

function updateEditBlock(block: EditorBlock) {
  editor.syncBlock(block);
}
```

### 核心 API

- `new CustomEditor(options)`: 创建编辑器实例。
- `editor.addBlock()`: 在当前光标处插入一个编辑块，并返回该块数据。
- `editor.addPluginBlock(pos, block)`: 在 `pos` 位置插入插件块（通常 `pos` 来自 `onTriggerPluginPopup`）。
- `editor.addVariableBlock(pos, name)`: 在 `pos` 位置插入变量块 `{{name}}`。
- `editor.syncBlock(block)`: 同步外部更新后的编辑块数据（placeholder / presetText）。
- `editor.getBlock(id)`: 获取某个编辑块的当前数据。
- `editor.coordsAtPos(pos)`: 获取文档位置对应的坐标（用于定位弹窗）。
- `editor.getData()`: 获取当前内容字符串（包含块标记）。
- `editor.destroy()`: 销毁编辑器实例。

### 复制 / 剪切 / 粘贴

- 复制/剪切时，会把选区内的编辑块与插件块序列化为 `{#EditorBlock ...#}` / `{#PluginBlock ...#}` 的文本形式写入剪贴板。
- 粘贴时，如果检测到上述块标记，会自动解析并还原为对应的块。

### 类型

```ts
export interface EditorBlock {
  id: string;
  placeholder: string;
  presetText: string;
}

export interface PluginBlock {
  id: string;
  name: string;
  type: 'plugin' | 'workflow' | 'variable';
}

export type InitialBlock = {
  pos: number;
  len?: number;
  block: EditorBlock | PluginBlock;
};

export type EditorData = string;
```
