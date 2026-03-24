# 编辑 Block 插件

Edit Block 插件将编辑器文档中的静态文本转换为交互式的行内输入字段。它是编辑器架构中的三大核心插件之一，负责处理用户可编辑的变量插槽——你可以将其视为模板占位符，用户无需离开编辑流即可原地填充内容。本页面将深入剖析该插件的内部机制、其与 CodeMirror 6 的集成层，以及 CustomEditor 类如何在应用层对其进行编排。

架构概览
该插件建立在 CodeMirror 6 状态管理的三大支柱之上：用于配置注入的 Facets、用于命令式块变更的 StateEffects，以及一个维护 DecorationSet（将占位符映射到交互式 Widget DOM 节点）的 StateField。整个模块封装在单个文件中，具有清晰的分层 API 表面：内部 Widget 渲染、状态管理以及公共扩展工厂。

























该插件在编辑器架构中占据中间层：它接收来自 CustomEditor 的高级命令，并将其转换为 CodeMirror 状态事务，同时通过其 StateField 独立管理每个编辑块的视觉呈现。


数据模型：EditorBlock 接口
每个编辑块都由 EditorBlock 类型表示，该类型定义在共享类型模块中。这是块身份和显示状态的唯一真实来源。


字段	类型	用途
id	string	唯一标识符，用作 DOM 属性以及 allBlocks 映射中的查找键
placeholder	string	当 presetText 为空时显示的提示文本（渲染为 HTML placeholder）
presetText	string	当前用户输入的值；在渲染时预填充到输入字段中
当 CustomEditor.addBlock() 创建新块时，其 id 通过 Math.random().toString(36).slice(2, 11) 生成，确保在无外部协调的情况下保持唯一性。通过 {#EditorBlock id="..."#} 格式，块的标识在序列化周期中得以持久保留。


配置注入：Facets
该插件使用两个 Facet 将运行时依赖和初始状态注入到 CodeMirror 扩展系统中。Facet 是 CodeMirror 推荐的模式，用于传递扩展在初始化时所需的静态或半静态配置。

callbacksFacet 携带 CodeMirrorCallbacks 对象——这是 Widget 的 DOM 事件处理程序与宿主应用业务逻辑之间的桥梁。它使用了一个简单的 combine 策略来选择第一个值（values[0]），这意味着每个编辑器实例预期只提供一个回调提供者。

initialBlocksFacet 携带一个 { pos, len?, block } 元组数组，用于描述编辑块在初始文档中应出现的位置。pos 字段是绝对文档偏移量，len 默认为 1（匹配 Unicode 对象替换字符占位符 ￼）。其 combine 策略同样选择第一个非空数组。

Facet	类型	默认值	注入者
callbacksFacet	CodeMirrorCallbacks	values[0]	editBlockExtensions()
initialBlocksFacet	{ pos; len?; block }[]	values[0] || []	editBlockExtensions()


CodeMirrorCallbacks 接口
该接口定义了 EditBlockWidget 委托回宿主层的三个操作。它是插件的 DOM 渲染与应用的块管理逻辑之间的唯一耦合点。

export interface CodeMirrorCallbacks {
  updateBlockText: (id: string, text: string) => void;
  openPopup: (id: string, rect: DOMRect) => void;
  deleteBlock: (id: string) => void;
}
具体实现位于 CustomEditor.constructor() 内部，它将每个回调进行包装，以同步 allBlocks 映射，并将事件转发给用户提供的 CustomEditorOptions 回调：

updateBlockText：更新 allBlocks 中的 block.presetText，并触发 onBlockUpdated。
openPopup：直接转发给 onOpenPopup，传递块的边界矩形用于弹出框定位。
deleteBlock：从 allBlocks 中移除该块，并触发 onBlockDeleted。


StateEffects：命令式块变更
该插件暴露了三个 StateEffect 定义，作为块生命周期操作的命令式 API。每个 Effect 都携带有类型的负载数据，并由 editBlockField 的更新处理程序消费。

Effect	负载	触发条件	行为
addBlockEffect	EditorBlock	CustomEditor.addBlock()	在光标位置（减 1，以抵消刚插入的占位符字符）插入 Widget 装饰
addBlockAtEffect	{ pos, len?, block }	粘贴处理程序，addBlockAtEffect.of()	在特定的绝对位置插入 Widget；支持通过 tr.changes.mapPos() 进行位置映射
updateBlockEffect	EditorBlock	CustomEditor.syncBlock()	扫描装饰以查找匹配的块 ID，移除旧 Widget，并插入一个包含更新数据的新 Widget
在粘贴操作期间，addBlockAtEffect 尤为重要：当用户粘贴包含 {#EditorBlock#} 标记的序列化内容时，粘贴处理程序会解析它们，分发文档变更，然后为每个解析出的块在其正确的偏移位置触发此 Effect。

addBlockEffect 将位置计算为 tr.state.selection.main.head - 1，因为触发它的分发操作也会在选区头部插入一个占位符字符。装饰必须替换该字符，因此它针对的是光标前进之前的位置。


EditBlockWidget：行内输入渲染器
EditBlockWidget 类继承自 CodeMirror 的 WidgetType，负责创建实际的 DOM 节点，以替换文档中的每个占位符字符。每个实例都绑定到特定的 EditorBlock 和 CodeMirrorCallbacks 引用。









toDOM() 方法构建了一个带有 data-block-id 属性的 `<span class="cm-inline-block">` 包装器，其中包含一个 `<input type="text" class="block-input">`。关键的行为细节：

自适应尺寸：measureWidth() 辅助函数创建一个隐藏的 `<span>`，设置其文本内容（对于空输入则回退使用占位符文本），测量 offsetWidth，并加上 10px 的内边距。这在每次 oninput 事件时运行，因此输入框会随着用户内容动态伸缩。
事件隔离：onmousedown 和 onclick 都会调用 e.stopPropagation()，以防止 CodeMirror 的选区机制干扰输入框的聚焦行为。这一点至关重要——如果没有它，点击输入框会立即使其失焦，因为 CodeMirror 会重新夺回焦点。
Backspace 删除：当用户在空输入框中按下 Backspace 时，Widget 会调用 callbacks.deleteBlock() 并分发一个移除占位符字符的文档变更，从而有效地从文档中“删除”该块。
ignoreEvent() 返回 true：这告诉 CodeMirror 的事件处理系统永远不要处理源自 Widget DOM 子树内的事件，赋予输入框对其自身键盘和鼠标事件的完全控制权。


editBlockField：装饰 StateField
这是核心的状态管理实体。它维护着一个 DecorationSet——CodeMirror 用于将视觉覆盖层附加到文档范围的机制——并同时提供装饰（用于渲染）和原子范围（用于光标行为）。

创建阶段
当编辑器状态首次创建时，editBlockField.create() 会读取 initialBlocksFacet 以获取应出现在初始文档中的任何块。它按位置对它们进行排序，为每个块创建一个 EditBlockWidget，并构建 Decoration.replace() 范围，将每个位置的占位符字符替换为 Widget DOM 节点。Decoration.set(deco, true) 中的 true 参数启用了装饰范围的排序，防止了重叠范围引起的冲突。

更新阶段
update() 方法处理两类变更：文档变更和 Effect 分发。

对于文档变更，它执行一个两步过程：

过滤：移除其范围与已变更文档区域重叠的所有装饰（第 117–123 行）。这会自动清理被文本编辑覆盖或删除的块。
映射：重新映射所有剩余的装饰位置，以适应文档其他地方的插入和删除（第 125 行）。
对于 Effect，它按顺序处理三种 StateEffect 类型：

addBlockEffect：在 selection.main.head - 1 处创建一个新装饰。
addBlockAtEffect：使用 tr.changes.mapPos() 将原始位置转换为其变更后的等效位置，然后在此处创建装饰。
updateBlockEffect：使用 between() 遍历所有装饰，找到其 Widget 具有匹配块 ID 的那个装饰，通过过滤器将其移除，并在同一位置插入替换项。
提供的扩展
该字段的 provide 块向编辑器提供两种行为：

Provider	用途
EditorView.decorations.from(f)	使 DecorationSet 作为文档中的视觉覆盖层进行渲染
EditorView.atomicRanges.of(...)	防止光标被放置在块的范围内部——光标移动会跳过整个块
原子范围的提供是使编辑块表现为不可分割单元的关键：按下左/右方向键会完全跳过它们，并且选区操作会将每个块视为单个字符。


updateBlockEffect 处理程序通过先过滤掉旧 Widget，然后在同一位置添加新 Widget 来执行装饰替换。这是必要的，因为 CodeMirror 的 WidgetType 实例是不可变的——你无法原地更新 Widget 的属性。取而代之的是，整个 Widget 会使用新数据重建。

主题与视觉设计
editBlockTheme 通过 CodeMirror 的 EditorView.theme() 应用两个基于 CSS 类的样式块：

.cm-inline-block — 包装器 span：

行内块显示，高度 22px，圆角边框 4px
蓝色色调背景 (rgba(20, 118, 255, 0.06))，配合蓝色文本颜色
8px 水平内边距，4px 水平外边距，用于相邻块之间的间距
悬停时平滑的 0.2s 过渡，交互时透明边框变为可见
verticalAlign: middle 确保与周围文本正确对齐
.block-input — 文本输入框：

完全透明的背景和边框，从父级继承颜色和字体
无内边距，自动宽度（最小 20px），文本居中对齐
占位符文本以块颜色 50% 的不透明度渲染
这种视觉处理使编辑块感觉像是嵌入在文本流中的行内芯片——在视觉上与众不同，但不会破坏阅读体验。


editBlockExtensions()：工厂函数
将插件集成到 CodeMirror 编辑器配置中的公共入口点。它将所有内部组件打包成一个单一的 Extension[] 数组：

export function editBlockExtensions(options: {
  callbacks: CodeMirrorCallbacks;
  initialBlocks?: { pos: number; len?: number; block: EditorBlock }[];
}): Extension[] {
  return [
    callbacksFacet.of(options.callbacks),
    initialBlocksFacet.of(options.initialBlocks || []),
    editBlockField,
    editBlockTheme
  ];
}
CustomEditor 在 createEditorState() 中调用此函数，过滤初始块以将 EditorBlock 实例与 PluginBlock 实例分离（后者交给 Library Block 插件处理）。这种在工厂调用点的分离确保了每个插件只能看到自己的块类型。


getEditorBlocks()：块枚举工具
一个只读工具函数，用于遍历当前的 DecorationSet 并提取所有带有文档位置的 EditBlockWidget 实例。CustomEditor 在序列化期间使用此函数将可视块布局转换回 {#EditorBlock#} 文本格式，并在 getData() 期间用于生成完整的 EditorData 字符串。

该函数返回 { pos, len, block }[]，其中 len 是装饰范围长度（通常为 1，匹配占位符字符）。CustomEditor.getData() 方法进一步使用 allBlocks 中的最新数据充实每个条目，确保通过 syncBlock() 所做的任何更改都能反映在序列化输出中。


与 CustomEditor 的集成
CustomEditor 类是 Edit Block 插件的主要消费者，充当它与编辑器系统其余部分之间的桥梁。该集成涉及四个方面：初始化、块 CRUD、序列化和粘贴处理。

初始化流程
当构造 CustomEditor 时，它会调用 parseEditorContentString() 从初始文档中提取 {#EditorBlock#} 标记，将它们与以编程方式提供的 initialBlocks 合并，过滤为编辑器块和插件块，并将编辑器块传递给 editBlockExtensions()。每个块也会被注册到 allBlocks 映射中。

块操作
CustomEditor 暴露了四个直接映射到插件 Effect 系统的块相关方法：

CustomEditor 方法	内部机制	StateEffect
addBlock()	生成随机 ID，插入 ￼ 占位符，分发 addBlockEffect	addBlockEffect
syncBlock(updatedBlock)	更新 allBlocks 条目，分发 updateBlockEffect	updateBlockEffect
getBlock(id)	直接在 allBlocks 映射中查找	无
getData()	调用 getEditorBlocks()，序列化为 {#EditorBlock#} 格式	无
粘贴集成
CustomEditor.constructor() 中的粘贴处理程序会拦截包含 {#EditorBlock#} 标记的剪贴板内容，使用 parseEditorContentString() 解析它们，将纯文本插入文档，然后为每个解析出的编辑器块分发 addBlockAtEffect。这使得编辑块能够在不同的编辑器实例之间进行剪切和粘贴移植。


序列化往返
编辑块参与一个双向序列化周期，在保存/加载操作中保留块的标识和内容。序列化格式使用自定义标签语法：

{#EditorBlock id="abc123" placeholder="请输入..."#}user typed text{#/EditorBlock#}
在序列化期间（serializeEditorContentString），通过 getEditorBlocks() 查找每个块的位置，与 allBlocks 中的最新数据合并，并将该位置的占位符字符替换为带标签的字符串。属性值通过 escapeAttrValue() 进行转义，以处理块内容中的特殊字符。

在反序列化期间（parseEditorContentString），一个逐字符解析器扫描 {#EditorBlock 标记，提取属性，读取开始和结束标签之间的内部文本，并生成一个 InitialBlock 条目，同时将占位符字符替换回文档字符串中。


EditBlockCallbacks：弹出框接口
作为次要导出的 EditBlockCallbacks，定义了一个更高级别的接口，旨在供需要在编辑块获得焦点时显示/隐藏配置弹出框的框架使用。与 CodeMirrorCallbacks（插件内部使用）不同，此接口使用 { top, left } 字符串样式，并将显示/隐藏分离为不同的回调。

export interface EditBlockCallbacks {
  onShow: (block: EditorBlock, style: { top: string; left: string }) => void;
  onHide: () => void;
}
该接口不被插件的内部机制使用——它作为包装编辑器的框架集成（Vue、Angular）的推荐契约，为弹出框协调提供类型化的结构。


继续探索
在理解了 Edit Block 插件的内部架构之后，文档中的以下页面为你提供了自然的后续步骤：

块类型系统 — EditorBlock 如何关联到 PluginBlock 以及 InitialBlock 联合类型
StateField 和 StateEffect 模式 — 深入探讨所有三个插件中使用的共享 CodeMirror 状态管理模式
Library Block 插件 — 处理具有并行架构的只读插件/工作流引用块的兄弟插件
CustomEditor 类 API — 包括所有块操作方法在内的完整公共 API 表面