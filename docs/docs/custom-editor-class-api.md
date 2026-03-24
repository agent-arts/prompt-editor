# CustomEditor 类 API

CustomEditor 类是 @agent-arts/editor 的核心入口。它将 CodeMirror 6 封装为一个具备块感知能力的富文本编辑器，并提供了一套简洁的 API，用于创建内嵌编辑区域、插入插件/工作流/变量节点，以及在进行内容序列化时完整保留块结构。无论是 Vue、Angular 还是原生 JS 的框架集成层，它们与编辑器的所有交互都通过这一个类及其配置项接口来实现。

类关系概述
CustomEditor 类位于分层架构的核心。底层由 CodeMirror 6 提供文本状态机。两个插件子系统——edit-block 和 library-block——以 CodeMirror 扩展的形式注册，并通过 CustomEditorOptions 回调向上通信。宿主应用（Vue 组件、Angular 组件或纯 JS）负责提供这些回调，并通过它们接收生命周期事件。

























构造函数与配置项
编辑器通过传入一个 CustomEditorOptions 对象进行实例化。构造函数会按顺序依次执行三个关键任务：解析 initialDoc 字符串以提取所有预序列化的块；将这些块注册到内部的 allBlocks 映射中；最后创建底层 EditorView 并挂载完整的扩展栈。


CustomEditorOptions 接口
属性	类型	必填	描述
parent	HTMLElement	✅	承载编辑器的 DOM 元素。CodeMirror 会将其自身作为该元素的子节点进行挂载。
initialDoc	string	✅	编辑器中的初始文档内容，采用编辑器的序列化格式（即带有内嵌块标签的纯文本）。
initialBlocks	InitialBlock[]	❌	编程式的块放置配置，会与从 initialDoc 中解析出的块进行合并。适用于在特定偏移量处命令式地放置块。
onOpenPopup	(id: string, rect: DOMRect) => void	✅	当用户点击编辑块组件时触发。rect 为该组件相对于视口的边界框。宿主应用应在此位置弹出一个配置弹窗。
onTriggerPluginPopup	(pos: number) => void	✅	当用户在允许插入插件的位置输入 / 字符时触发。pos 为触发该事件的文档偏移量。
onHidePluginPopup	() => void	❌	当需要关闭插件弹窗时触发（例如光标移出了触发位置）。
onTriggerAIDialog	(pos: number) => void	✅	当触发 AI 对话框时触发，传递触发点的文档位置。
onHideAIDialog	() => void	❌	当需要关闭 AI 对话框时触发。
onChange	(data: EditorData) => void	❌	每次文档发生变更时触发。EditorData 是一个 string，即编辑器完整的序列化内容。
onBlockDeleted	(id: string) => void	❌	当在块的边界处通过 Backspace 键删除块（编辑块或插件块）时触发。
onBlockUpdated	(id: string, text: string) => void	❌	当在块组件的内联编辑器中修改了编辑块的 presetText 时触发。


构造函数生命周期详解
当调用 new CustomEditor(options) 时，构造函数会执行一个确定的初始化流程：

文档解析：将原始的 initialDoc 字符串传递给 parseEditorContentString()，该方法会扫描 {#EditorBlock ...#} 和 {#PluginBlock ...#} 标签对，将它们替换为 Unicode 对象替换字符（\uFFFC），并将块描述符收集到一个 InitialBlock[] 数组中。这意味着序列化格式始终可以直接作为输入——你无需对其进行预处理。

块注册：构造函数会将 options.initialBlocks（如果提供）中的块与从文档中提取的块进行合并。只有 EditorBlock 实例（即没有 type 属性的块）会被存储在公有的 allBlocks 映射中。PluginBlock 实例则由 library-block 插件自身的状态字段单独处理。

回调桥接：系统会创建一个 CodeMirrorCallbacks 对象，用于在底层的 CodeMirror 组件处理函数与高层的 CustomEditorOptions 回调之间进行协调。该桥接层会将 updateBlockText、openPopup 和 deleteBlock 调用转换为对应的 onBlockUpdated、onOpenPopup 和 onBlockDeleted 配置项。

EditorView 创建：系统会组装包含完整扩展栈的 EditorState，包括历史记录、键位映射（带有用于删除块的自定义 Backspace 处理程序）、edit-block 扩展、plugin-block 扩展、markdown 样式字段以及编辑器主题。随后，基于该状态并附加额外的运行时配置来创建 EditorView：用于 onChange 的更新监听器、具备块序列化感知能力的复制/剪切/粘贴剪贴板处理程序，以及插件弹窗和 AI 对话框触发扩展。


initialDoc 参数接受与 getData() 返回值完全相同的序列化字符串。这种双向对称性意味着你可以将 getData() 的输出持久化到数据库中，然后直接将其作为 initialDoc 传回，从而精准地重建编辑器状态——包括所有块的位置、类型和内容。

公有属性
属性	类型	描述
view	EditorView	底层的 CodeMirror 6 EditorView 实例。高级用户可以直接访问它以执行底层操作，例如派发自定义事务（transaction）或读取选区状态。
allBlocks	`Map<string, EditorBlock>`	文档中当前所有编辑块的实时注册表。键为块 ID。当块被添加、更新或删除时，该映射会在内部发生变更。


公有方法
addBlock(): EditorBlock
在当前光标位置创建一个新的 EditorBlock。该块会被分配一个随机的 9 位字母数字 ID，作为组件插入以替换当前选区（若选区为空则插入到光标处），并被注册到 allBlocks 中。插入后，编辑器会重新获取焦点，并将光标定位在块组件之后。

返回的 EditorBlock 对象包含生成的 id、默认的中文 placeholder 以及空的 presetText。



addPluginBlock(pos: number, block: PluginBlock): PluginBlock
在指定的文档位置插入一个 PluginBlock 组件。这会精确替换 pos 处的一个字符（通常是 / 触发字符）为该块组件。PluginBlock 必须具有 type: 'plugin' 或 type: 'workflow'——变量类型的块应由 addVariableBlock() 处理。


addVariableBlock(pos: number, name: string): PluginBlock
在给定位置以 `{{name}}` 标记的形式插入一个变量引用。与 addPluginBlock() 不同，此方法插入的是可见文本（即 {{name}} 标记字符串）而非组件，并且不会替换现有字符。返回的 PluginBlock 其 type 为 'variable'，且不会被追踪在 allBlocks 中——变量标记是由 library-block 插件中基于正则表达式的装饰字段负责渲染的。


syncBlock(updatedBlock: EditorBlock): void
通过 updateBlockEffect 将更新后的 EditorBlock 同步推送到 allBlocks 映射和 CodeMirror 状态中。这是外部 UI（例如用于编辑占位符文本或预设文本的弹窗表单）将变更回传到编辑器的核心机制。展开运算符（{ ...updatedBlock }）会创建一个新的引用，以确保正确触发响应式更新。


getBlock(id: string): EditorBlock \| undefined
对 allBlocks 映射的简单查询。如果不存在具有给定 ID 的块，则返回 undefined。这通常由 onOpenPopup 回调使用，以便在显示配置 UI 之前检索块的当前状态。


coordsAtPos(pos: number): { left: number, right: number, top: number, bottom: number } | null
直接委托给 EditorView.coordsAtPos()。返回给定文档位置处字符相对于视口的边界框，若该位置当前不可见则返回 null。这对于将浮动弹窗定位到相对于触发点的位置至关重要。


getData(): EditorData
将整个编辑器文档序列化为编辑器的自定义格式字符串。每个 EditorBlock 组件会被替换为 {#EditorBlock id="..." placeholder="..."#}presetText{#/EditorBlock#} 标签对，每个非变量类型的 PluginBlock 组件会被替换为 {#PluginBlock id="..." type="..."#}name{#/PluginBlock#} 标签对。属性值会经过转义以正确处理引号、换行符和反斜杠。其结果是一个适用于持久化或网络传输的纯字符串。


destroy(): void
销毁 CodeMirror EditorView，移除其 DOM 元素并清理所有事件监听器和状态。应在框架的卸载/销毁生命周期钩子中调用此方法，以防止内存泄漏。


addPluginBlock() 方法会精确替换 pos 处的一个字符（即 / 触发符）。如果你在一个没有可替换字符的位置调用它，文档的长度将会意外增加。请始终传递触发 onTriggerPluginPopup 的 / 字符所在的位置。

智能剪贴板
构造函数会在 EditorView 上注册自定义的 copy、cut 和 paste 处理程序。正是这一点使得块能够在剪贴板操作中得以保留。在复制和剪切期间，选区范围会通过 serializeEditorContentSlice() 进行序列化，该方法会将选区内的块组件转换为其带标签的字符串形式。在粘贴期间，系统会扫描传入的文本中的 {#EditorBlock 或 {#PluginBlock 标记；如果找到，则会将其解析回块，并通过适当的 StateEffect 派发进行插入。在复制/粘贴过程中，落在选区之外的块会被自然排除——只有完全包含在选区内的块才会随剪贴板内容一起转移。


类型约定
CustomEditor API 依赖于与其一同导出的三个核心类型。理解它们的结构对于正确使用至关重要。

类型	结构	用途
EditorBlock	{ id: string; placeholder: string; presetText: string }	表示一个内联的可编辑区域。当 presetText 为空时显示 placeholder。
PluginBlock	{ id: string; name: string; type: 'plugin' | 'workflow' | 'variable' }	表示一个已插入的插件、工作流或变量引用。name 为显示标签。
InitialBlock	{ pos: number; len?: number; block: EditorBlock | PluginBlock }	用于编程式的块放置。pos 为文档偏移量，len 默认为 1（即一个 Unicode 替换字符）。


完整实例化示例
以下模式展示了在任何框架中进行最小化设置所需的基本步骤。本示例与框架无关；特定框架的封装器（Vue 的 onMounted/onUnmounted、Angular 的 OnInit/OnDestroy）遵循相同的逻辑结构。

import { CustomEditor } from '@agent-arts/editor';
import type { CustomEditorOptions, EditorBlock, PluginBlock } from '@agent-arts/editor';
 
const container = document.getElementById('editor-host')!;
 
const options: CustomEditorOptions = {
  parent: container,
  initialDoc: 'Hello, {#EditorBlock id="b1" placeholder="Enter name"#}World{#/EditorBlock#}!',
  onOpenPopup: (id: string, rect: DOMRect) => {
    // Position a configuration popup at rect coordinates
    const block = editor.getBlock(id);
    console.log('Editing block:', block);
  },
  onTriggerPluginPopup: (pos: number) => {
    // Show plugin selection UI at the trigger position
    const coords = editor.coordsAtPos(pos);
    console.log('Trigger at position:', pos, 'coords:', coords);
  },
  onTriggerAIDialog: (pos: number) => {
    // Open AI dialog at cursor position
  },
  onChange: (data) => {
    // Persist serialized content
    console.log('Content changed:', data);
  },
  onBlockDeleted: (id) => {
    console.log('Block deleted:', id);
  },
  onBlockUpdated: (id, text) => {
    console.log(`Block ${id} text updated to:`, text);
  },
};
 
const editor = new CustomEditor(options);
 
// Programmatic block insertion
const newBlock = editor.addBlock();
editor.syncBlock({ ...newBlock, placeholder: 'Custom placeholder' });
 
// Get serialized output
const serialized = editor.getData();
 
// Cleanup
editor.destroy();
方法快速参考
方法	修改文档	修改 allBlocks	返回值
constructor(options)	✅	✅	CustomEditor 实例
addBlock()	✅	✅	EditorBlock
addPluginBlock(pos, block)	✅	❌	PluginBlock
addVariableBlock(pos, name)	✅	❌	PluginBlock
syncBlock(updatedBlock)	❌ (派发 effect)	✅	void
getBlock(id)	❌	❌	EditorBlock | undefined
coordsAtPos(pos)	❌	❌	视口边界框或 null
getData()	❌	❌	EditorData (string)
destroy()	✅ (移除 DOM)	❌	void
后续步骤
块类型系统 —— 深入探讨 EditorBlock、PluginBlock 和变量标记在渲染、生命周期和序列化行为上的差异。
内容序列化格式 —— {#EditorBlock ...#} 和 {#PluginBlock ...#} 标签语法的完整规范，包括转义规则和边缘情况。
Vue 集成 —— 了解完整的 Vue 3 `<script setup>` 组件如何封装 CustomEditor 并实现响应式的弹窗状态管理。
Angular 集成 —— 了解实现了 ControlValueAccessor 以进行表单集成的 Angular 独立组件。