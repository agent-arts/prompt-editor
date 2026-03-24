# StateField 与 StateEffect 模式

该编辑器基于 CodeMirror 6 的响应式状态模型构建，其中 StateField 实例用于持有持久化的装饰状态，而 StateEffect 实例则作为类型化的命令通道来修改该状态。要理解这两个原语——以及将它们连接在一起的基于 Facet 的初始化模式——对于通过新的块类型、装饰层或响应式行为来扩展编辑器至关重要。本页汇总了代码库中的每一个 StateField、StateEffect 和 Facet，解释了它们采用的四种截然不同的更新策略，并展示了 CustomEditor 类如何通过其公共 API 编排 effect 的分发。


架构概览
编辑器的状态架构遵循严格的分层模式。在最底层，Facet 在创建时将静态配置（回调和初始块位置）注入到编辑器状态中。在此之上，StateField 维护响应式的 DecorationSet 值，将文档位置映射到可视化部件。StateEffect 充当类型化的命令对象，由 StateField 的更新函数消费，以添加、替换或移除装饰。CustomEditor 类是唯一分发 effect 的组件；所有其他消费者都是只读的。


StateEffect 定义 —— 命令词汇表
StateEffect 是外部代码与 StateField 更新逻辑通信的唯一合规机制。每个 effect 都携带一个类型化的载荷，由消费它的 StateField 进行解释，从而产生新的装饰状态。代码库中定义了四个 effect，按其控制的领域进行组织。

编辑块 Effect
三个 effect 管理着内联编辑块的生命周期。它们均使用 `StateEffect.define<T>()` 定义，产生不同的 effect 类型，可以在更新函数内部通过 e.is(effectType) 进行测试。

Effect	载荷类型	用途	定义于
addBlockEffect	EditorBlock	在当前光标位置插入新的块部件	edit-block.ts
addBlockAtEffect	{ pos: number; len?: number; block: EditorBlock }	在指定的文档位置插入块部件	edit-block.ts
updateBlockEffect	EditorBlock	原地替换现有块的部件（同步）	edit-block.ts
插件块 Effect
单个 effect 处理插件块的插入，类型判别发生在 StateField 的更新处理程序内部（变量块会被过滤掉，转而由基于正则表达式的 variableTokenField 处理）。

Effect	载荷类型	用途	定义于
addPluginBlockEffect	{ pos: number; len?: number; block: PluginBlock }	在特定位置插入插件/工作流块部件	library-block.ts


StateField 目录 —— 四种装饰策略
代码库中的四个 StateField 均类型化为 `StateField<DecorationSet>`，但它们在初始化模式、更新策略和提供契约方面存在显著差异。下表汇总了每个字段的角色，随后我们将逐一进行深入分析。

StateField	装饰类型	初始化来源	Effect 消费者	提供
editBlockField	Replace（部件）	Facet + effects	addBlockEffect、addBlockAtEffect、updateBlockEffect	decorations + atomicRanges
pluginBlockField	Replace（部件）	Facet + effects	addPluginBlockEffect	decorations + atomicRanges
variableTokenField	Replace（部件）	文档的正则扫描	无（文档响应式）	decorations + atomicRanges
markdownStyleField	Mark（类名）	文档的正则扫描	无（文档响应式）	仅 decorations


editBlockField —— 驱动于 Effect 的部件生命周期
这是代码库中最复杂的 StateField。它通过三阶段更新策略来管理内联编辑块的完整生命周期：变更过滤、变更映射和 effect 处理。

初始化：create 函数读取 callbacksFacet 和 initialBlocksFacet 来构建初始的 DecorationSet。块按位置排序以确保范围顺序有效，然后每个块被转换为带有 EditBlockWidget 实例的 Decoration.replace。位置-长度元组 (pos, pos + (len || 1)) 替换文档中的 Unicode 对象替换字符占位符（\uFFFC）edit-block.ts。

更新策略：更新处理程序按顺序处理变更和 effect，这对于正确性至关重要。首先，它跟踪发生变更的文档范围，并移除与这些范围重叠的任何装饰——这可以防止过时的部件在文档编辑后继续存在 edit-block.ts。然后，它通过 decorations.map(tr.changes) 将存活的装饰映射到新位置。最后，它遍历 tr.effects 来处理所有传入的命令 edit-block.ts。

Effect 处理细节：这三种 effect 分别采用不同的处理策略：

addBlockEffect：在 selection.main.head - 1 处插入（考虑到分派事务已经插入的占位符字符）。
addBlockAtEffect：使用 tr.changes.mapPos(originalPos) 解析相对于事务变更的位置——这对于多个 effect 与文档插入同时触发的粘贴操作至关重要。
updateBlockEffect：执行扫描替换操作——遍历所有装饰，通过 ID 找到匹配的块，过滤掉旧装饰，并在相同位置添加带有更新后部件的新装饰。





















pluginBlockField —— 简化的驱动于 Effect 的插入
pluginBlockField 遵循与 editBlockField 相同的初始化和变更过滤模式，但只处理单一的 effect 类型。其 create 函数在初始化时会额外过滤掉 type === 'variable' 的块，因为变量标记由 variableTokenField 单独管理 library-block.ts。

更新处理程序镜像了编辑块的模式：变更过滤、映射，然后处理 effect。addPluginBlockEffect 处理程序跳过变量块（if (block.type === 'variable') continue），并使用 tr.changes.mapPos 解析位置，这与编辑块系统中的 addBlockAtEffect 完全一致 library-block.ts。


variableTokenField —— 文档响应式正则装饰
该 StateField 代表了一种根本不同的策略：它没有 effect 消费者，而是纯粹响应文档的变化。在每次 docChanged 事件时，它使用正则表达式 `/\{\{(.+?)\}\}/g` 重新扫描整个文档以查找变量标记，然后为每个匹配项生成新的 Decoration.replace 部件 library-block.ts。

这种方法以 effect 驱动更新的精确性换取了简洁性：无需跟踪哪个变量被添加或移除，因为全文档扫描总能产生正确的装饰集。VariableWidget 类重写了 eq 方法，通过 name 和 tokenLength 进行比较，这有助于 CodeMirror 的装饰差异算法在文档发生变化但变量标记本身保持稳定时，避免不必要的 DOM 更新 library-block.ts。

关键的设计洞察在于，变量块是内容级别的构造——它们作为字面文本（{{name}}）存在于文档中；而编辑块和插件块是结构级别的构造——它们作为抽象占位符存在于文档文本中，并完全通过装饰系统实体化。


markdownStyleField —— 轻量级 Mark 装饰
core.ts 中的 markdownStyleField 遵循与 variableTokenField 相同的文档响应式模式，但使用的是 Decoration.mark 而非 Decoration.replace。它扫描标题行（^#+\s+）和粗体文本（**...**），并将 CSS 类应用于匹配的范围。

值得注意的是，这是唯一一个不提供 EditorView.atomicRanges 的 StateField。这是有意为之——mark 装饰不应干扰光标定位或文本选择，而替换内容的部件装饰则必须被视为原子单元。


Facet 模式 —— 静态配置注入
Facet 解决了一个特定的架构问题：如何将运行时配置传递给 StateField 的 create 函数，而后者只能访问构建时存在于编辑器状态中的数据。代码库中使用了两种 Facet 模式：

单例 Facet（callbacksFacet）：使用一个始终返回 values[0] 的 combine 函数，确保只有一个回调注册能够生效。这个 Facet 从不被 StateField 的 update 函数直接读取——相反，更新函数通过 tr.state.facet(callbacksFacet) 来读取它 edit-block.ts。回调对象包含 updateBlockText、openPopup 和 deleteBlock 函数，供部件在用户交互期间调用。

数组 Facet（initialBlocksFacet、initialPluginBlocksFacet）：使用一个返回第一个非空数组的 combine 函数。这些 Facet 将来自解析后内容字符串的初始块数据携带到 StateField 的 create 函数中 edit-block.ts、library-block.ts。

Facet 在不同的生命周期节点被读取：create 从 state.facet() 读取，而 update 从 tr.state.facet() 读取。这一区别很重要，因为 tr.state 反映的是事务应用之后的状态，这就是为什么回调 Facet 可以在 effect 处理期间被安全读取——回调在事务之间不会发生变化。


provide 契约 —— 连接 StateField 与视图
代码库中的每个 StateField（除了 markdownStyleField）都向 EditorView 提供两个输出：

provide: f => [
  EditorView.decorations.from(f),
  EditorView.atomicRanges.of((view) => view.state.field(f))
]
EditorView.decorations.from(f) 将 StateField 的值注册为视图装饰层的事实来源。每当 StateField 从其 update 函数产生新值时，CodeMirror 会自动重新渲染装饰。

EditorView.atomicRanges.of(...) 告诉编辑器，被部件装饰的范围应表现为不可分割的单元——光标不能置于其内部，且它们会作为整体被 Backspace 键删除。这对于 core.ts 中 deleteBlock 键映射处理程序实现的块删除行为至关重要，该处理程序会扫描 editBlockField 和 pluginBlockField，以检测光标相邻的块并将其原子化移除。

atomicRanges 的提供是使得 Backspace 删除模式得以运作的关键。如果没有它，光标可能会落在占位符字符和部件边界之间，导致部分删除。core.ts 中的 deleteBlock 函数遍历装饰集以查找部件元数据（widget.block.id），这些元数据在纯粹的键映射处理程序中是无法访问的。


CustomEditor 中的 Effect 分发模式
CustomEditor 类充当编排者，将高层 API 调用转换为组合了文档变更与 effect 分发的 CodeMirror 事务。理解分发模式至关重要，因为变更与 effect 的时序关系到位置解析的准确性。

模式 1：在单一事务中进行变更 + Effect
由 addBlock() 使用：文档占位符和 effect 被一起分发，因此 StateField 的 addBlockEffect 处理程序可以安全地引用 tr.state.selection.main.head - 1——选区已经进行了调整以适应插入的占位符 core.ts。

this.view.dispatch({
  changes: { from, to, insert: BLOCK_PLACEHOLDER },
  effects: addBlockEffect.of(newBlock),
  selection: { anchor: from + 1 }
});
模式 2：特定位置的分发
由 addPluginBlock() 和 addBlockAtEffect 使用：位置被显式传递，因为在分发发生之前插入点就已经已知 core.ts。

模式 3：仅分发 Effect（无文档变更）
由 syncBlock() 使用：当需要更新现有块的数据时（例如，从弹出窗口更改了占位符文本），仅分发 effect。StateField 的 updateBlockEffect 处理程序通过块 ID 定位现有的装饰，并原地替换部件 core.ts。

模式 4：用于粘贴操作的批量分发
在粘贴处理程序中使用：多个 effect 被收集到一个数组中，并在文档变更应用后，在单独的事务中分发。这种两步事务方法是必要的，因为来自解析后内容字符串的初始块位置是相对于插入文本的，而不是相对于整个文档的 core.ts。

```typescript
// 事务 1：插入文档文本
view.dispatch({
  changes: { from: sel.from, to: sel.to, insert: insertDoc },
  selection: { anchor: insertFrom + insertDoc.length }
});
// 事务 2：在调整后的位置应用 effect
const effects: StateEffect<unknown>[] = [];
// ... 累积 effect ...
view.dispatch({ effects });
```


块检索模式 —— 读取 StateField 数据
两个导出的函数演示了如何从 StateField 中读回装饰数据，用于序列化和外部查询。两者都使用 field.between() API 来遍历 DecorationSet 并提取部件元数据。

edit-block.ts 中的 getEditorBlocks() 从 editBlockField 读取数据，并通过检查存储在 value.spec.widget 中的 EditBlockWidget 实例来重构位置-块元组。该函数使用了 view.state.field(editBlockField, false) 的第二个参数——false 告诉 CodeMirror 如果该字段未注册则返回 undefined，这使得该函数可以在任何上下文中安全调用。

library-block.ts 中的 getPluginBlocks() 针对 pluginBlockField 和 PluginWidget 遵循完全相同的模式。

这两个检索函数均在 core.ts 的 serializeEditorContentString() 序列化过程中使用，编辑器内容在此处被转换回 {#EditorBlock ...} 和 {#PluginBlock ...} 属性格式。



策略对比 —— 何时使用哪种模式
四种 StateField 策略服务于不同的用例。如何在它们之间做出选择取决于三个因素：事实来源是外部命令还是文档内容、部件是否是交互式的（需要回调），以及是否需要原子化光标行为。

策略	事实来源	位置解析	原子范围	用例
Effect 驱动	外部命令	显式位置或从光标派生	是	编辑块、插件块——独立于文档文本存在的实体
文档响应式 Replace	文档文本（正则扫描）	每次变更时全量重新扫描	是	变量标记——必须与内容保持同步的文本级构造
文档响应式 Mark	文档文本（正则扫描）	每次变更时全量重新扫描	否	Markdown 样式——不应影响光标行为的纯视觉注释
在使用新的块类型扩展编辑器时，决策树非常简单：如果块由占位符字符表示并通过外部数据模型管理，请使用 effect 驱动模式。如果块由文档中的字面文本表示且需要渲染为部件，请使用 文档响应式 replace 模式。如果装饰纯粹是修饰性的（不涉及光标交互），请使用不带原子范围的 文档响应式 mark 模式。

如需深入了解这些 StateField 是如何组合到编辑器扩展系统中的，请参阅 CustomEditor 类 API。要了解流经这些 effect 的数据结构，请参阅 块类型系统。关于从 StateField 中读回块状态的序列化层，请参阅 内容序列化格式。