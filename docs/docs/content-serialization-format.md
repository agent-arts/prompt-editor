# 内容序列化格式

agent-arts 编辑器采用自定义文本内嵌序列化协议，将富文本块元数据直接交织在纯文本中。这一设计是经过深思熟虑的：序列化输出（EditorData）是一个单字符串——具有人类可读性，可直接存储在表单字段或数据库列中，并且无需单独的 Schema 即可自描述。编辑器管理的每个块都使用 {#Tag ...#}content{#/Tag#} 语法编码为内联标记区域，而内部的 CodeMirror 文档则使用 Unicode 对象替换字符（`\uFFFC`）替换这些区域，以维持单字符的块边界。理解外部系统消费的序列化字符串格式与 CodeMirror 消费的内部文档模型之间的双向转换，是在深层次上扩展、调试和集成该编辑器的关键。


数据流架构
序列化格式位于编辑器内部表示与外部世界之间的边界。下图展示了内容流经的三条关键转换路径。

























进入编辑器只有两个入口——构造函数初始化和粘贴操作，以及两个出口——变更时的 getData() 和复制/剪切到剪贴板。EditorData 类型别名解析为一个普通的 string，这意味着整个序列化契约是基于文本的，不需要 JSON 外壳。


标签语法规范
该格式定义了两种块标签类型，每种都具有独特的属性 Schema 和内容模型。两者都遵循一致的模式：带有属性的开始标签、内部文本内容以及匹配的结束标签。

EditorBlock 标签
Editor 块表示文本中的可编辑输入插槽。它们将标识符和占位符元数据作为类 XML 属性携带，并将块的当前文本值作为内部内容。

{#EditorBlock id="block-0" placeholder="请输入..."#}当前输入的文本{#/EditorBlock#}
属性	来源	是否必需	描述
id	EditorBlock.id	是（回退：`block-<pos>`）	用于生命周期管理和弹窗关联的唯一块标识符
placeholder	EditorBlock.placeholder	否（默认：'')	当 presetText 为空时显示；渲染在部件的 `<input>` 元素内部
（内部文本）	EditorBlock.presetText	否（默认：'')	用户输入或以编程方式设置的文本值；成为块输入部件的 value
解析器会提取属性值和内部文本，构建一个 EditorBlock 对象，该对象会被注册到 allBlocks 中，并定位在占位符字符的文档偏移量处。请注意，presetText 也可以作为属性的回退提供——如果内部文本为空但存在 presetText 属性，则属性值优先。


PluginBlock 标签
Plugin 块表示外部工具引用（MCP 服务、工作流），它们被渲染为带有特定类型图标的不可编辑标签部件。

`{#PluginBlock id="plugin-1" type="plugin"#}MCP服务01{#/PluginBlock#}`
`{#PluginBlock id="workflow-1" type="workflow"#}Bing搜索{#/PluginBlock#}`
属性	来源	是否必需	描述
id	PluginBlock.id	是（回退：`plugin-<pos>`）	唯一块标识符
type	PluginBlock.type	是（默认：'plugin'）	判别符："plugin" 渲染插件图标，"workflow" 渲染工作流图标，"variable" 被排除在序列化之外
（内部文本）	PluginBlock.name	是	与类型图标一起显示的展示标签
解析器会对 type 属性进行标准化处理：只有 "workflow" 会原样保留；任何其他值（包括缺失）都默认为 "plugin"。关键是，type="variable" 的块永远不会被序列化——序列化器使用 .filter((b) => b.block.type !== 'variable') 显式过滤掉它们，状态创建逻辑同样会从插件初始化中剥离变量块。


属性转义规则
序列化格式中的属性值会经过双向转义转换，以安全地编码那些否则会破坏标签解析器或引入歧义的字符。

转义映射
escapeAttrValue 函数按顺序应用以下替换：

转义序列	原始字符	原因
`\\\\`	`\`	转义转义字符本身（最先应用）
`\\"`	"	防止属性值过早终止
`\\r`	\r（回车）	在属性字符串中保留
`\\n`	\n（换行）	在属性字符串中保留
`\\t`	\t（制表符）	在属性字符串中保留
相应的 unescapeAttrValue 以相反的顺序（制表符 → 换行符 → 回车符 → 引号 → 反斜杠）逆转这些替换，以确保正确的往返保真度。这很关键，因为解析器的属性正则表达式——([a-zA-Z_][\w-]*)="((?:\\.|[^"])*)"——依赖于转义引号来正确分隔多词或包含特殊字符的值。

转义顺序很重要：在序列化期间必须首先转义反斜杠（以避免对已转义序列进行二次转义），而在解析期间必须最后反转义（以避免将 \\n 解释为字面反斜杠后跟 n，而不是换行符）。这种顺序是自定义序列化格式中常见的陷阱。


解析：序列化字符串 → 内部模型
parseEditorContentString 函数实现了一个单遍字符扫描器，将序列化格式转换为带有占位符字符的纯文本文档以及一个 InitialBlock 描述符数组。

算法演练














解析器维护一个 doc 字符串构建器和一个 i 游标。当遇到可识别的标签开头时，它会定位闭合的 #} 分隔符，提取标签名和属性，然后向前搜索匹配的 {#/tagName#} 闭合标签。#} 与闭合标签之间的内部文本将成为块的内容值。在当前位置会向 doc 中插入一个单独的 `\uFFFC` 字符，并记录一个包含 `{ pos: doc.length, len: 1, block }` 的 InitialBlock。对于无法识别的标签名，原始文本将原样传递。

InitialBlock.pos 属性记录了插入占位符字符的相对于文档的偏移量——editBlockExtensions 和 pluginBlockExtensions 在状态创建期间使用该值在正确位置附加 CodeMirror 部件装饰。


序列化：内部模型 → 序列化字符串
serializeEditorContentString 函数逆转此过程：它遍历 CodeMirror 文档，定位所有块部件，并重建带标签的字符串格式。

块发现
序列化依赖于两个插件级别的查询函数来枚举文档内的块位置：

函数	来源字段	应用的过滤器
getEditorBlocks(view)	editBlockField (DecorationSet)	无——返回所有 EditBlockWidget 实例
getPluginBlocks(view)	pluginBlockField (DecorationSet)	排除 type === 'variable' 的块
这两个函数都会迭代装饰集的 between(0, doc.length, ...) 方法，检查每个装饰的 value.spec.widget 以提取位置、长度和块数据。对于 EditorBlock 条目，序列化器会通过 allBlocks.get(b.block.id) 与 allBlocks 中的最新数据合并，确保将进行中的编辑（例如，用户在块输入中输入）捕获到输出中。

替换算法
序列化器构建一个 { from, to, text } 替换数组，按位置对它们进行排序（from 升序，对于平局则较长的范围优先），然后执行基于游标的合并：

遍历已排序的替换项；跳过任何 from < cursor 的项（处理重叠边缘）
追加从 cursor 到 r.from 的纯文本
追加序列化的标签文本（r.text）
将游标推进到 r.to
在所有替换完成后，追加剩余的纯文本
serializeEditorContentSlice 变体的工作方式相同，但作用于由 from/to 选区坐标定义的文档子串。所有块位置都会相对于切片原点重新计算（pos - from），从而实现包含内嵌块的文本的富文本剪贴板传输。


剪贴板集成
序列化格式通过 CodeMirror 的 domEventHandlers 与剪贴板生命周期深度集成，使得块能够在同一编辑器实例中跨复制、剪切和粘贴操作存活。

粘贴处理程序使用快速路径检测——在调用完整解析器之前检查是否包含 {#EditorBlock 或 {#PluginBlock 子字符串。如果找到块标签，它会首先插入纯 doc 文本（定位所有 `\uFFFC` 占位符），然后派发 StateEffect 对象（对于编辑器块派发 addBlockAtEffect，对于插件块派发 addPluginBlockEffect）以在正确位置附加部件。在此过程中，新反序列化的 EditorBlock 对象会被注册到 allBlocks 中，以保持元数据存储的一致性。

粘贴守卫 if (!text.includes('{#EditorBlock') && !text.includes('{#PluginBlock')) return false 是一项刻意的性能优化——对于纯文本粘贴会完全跳过完整解析，避免不必要的字符串扫描和内存分配。


格式参考摘要
完整的序列化语法，以模式参考的形式表达：

```
document      ::= (text-chunk | editor-block | plugin-block)*
text-chunk    ::= <任何不以 '{#EditorBlock' 或 '{#PluginBlock' 开头的字符>
editor-block  ::= '{#EditorBlock' attrs '#}' preset-text '{#/EditorBlock#}'
plugin-block  ::= '{#PluginBlock' attrs '#}' name-text '{#/PluginBlock#}'
attrs         ::= (attr-name '="' escaped-value '"')*
attr-name     ::= [a-zA-Z_] [\w-]*
escaped-value ::= (escaped-char | [^"])*
escaped-char  ::= '\\' | '\"' | '\r' | '\n' | '\t'
preset-text   ::= <除 '{#/EditorBlock#}' 之外的任何文本>
name-text     ::= <除 '{#/PluginBlock#}' 之外的任何文本>
```

占位符字符
在内部，每个块在 CodeMirror 文档中恰好占据一个字符位置——Unicode 对象替换字符 `U+FFFC`（`'￼'`）。该字符是用于嵌入对象的标准 Unicode 码位，因其零宽度的不可见渲染及其语义含义而被选用。常量 BLOCK_PLACEHOLDER 定义在 core.ts#L23。

完整示例
一个包含所有块类型的序列化字符串：

你好，`{#EditorBlock id="name-slot" placeholder="请输入姓名"#}张三{#/EditorBlock#}`。
请使用 {#PluginBlock id="wf-1" type="workflow"#}Bing搜索{#/PluginBlock#} 查询信息，
输入变量为 `{{input_query}}`。
解析后，内部文档变为：

你好，￼。请使用 ￼ 查询信息，输入变量为 `{{input_query}}`。
initialBlocks 填充如下：

pos	块类型	id	关键属性
3	EditorBlock	name-slot	presetText: "张三", placeholder: "请输入姓名"
11	PluginBlock	wf-1	type: "workflow", name: "Bing搜索"
请注意，`{{input_query}}` 在初始字符串解析期间不会被解析为插件块。变量标记由 variableTokenField StateField 在运行时使用正则表达式 `/\{\{(.+?)\}\}/g` 检测和渲染，该正则表达式会扫描活动文档并独立于序列化管线应用 VariableWidget 装饰。


集成模式
消费序列化输出
getData() 方法返回完全序列化的字符串。在 Angular 集成中，它直接连接到 ControlValueAccessor 的 onChange 回调，使序列化格式成为规范表单值：

```typescript
// Angular: agent-prompt-editor.component.ts
onChange: (data) => this.emitModel(data),  // data = EditorData = string
```

emitModel 方法将序列化字符串直接传递给 Angular 的表单控件，无需转换——没有中间的 JSON 或二进制编码步骤。


提供初始内容
相反，序列化字符串通过 initialDoc 选项流入编辑器。构造函数和 recreateEditor 都会传递原始序列化字符串，由 parseEditorContentString 在内部处理：

```typescript
// 构造函数路径
const { doc, initialBlocks } = parseEditorContentString(options.initialDoc);
 
// Angular writeValue 路径
private applyModelString(value: string) {
    const content = this.parseModelString(value);  // 原样返回 value
    this.recreateEditor(content);  // 传递给 initialDoc
}
```

Angular 组件的 parseModelString 本质上是一个恒等函数——它原样返回输入字符串，这证实了序列化格式是所有框架集成的线路格式。


如需深入了解填充此格式的块类型，请参阅块类型系统。要了解编辑块和库块插件如何管理序列化块的生命周期，请参阅编辑块插件和库块插件。有关围绕此序列化契约的框架级集成细节，请参阅 ControlValueAccessor 模式。