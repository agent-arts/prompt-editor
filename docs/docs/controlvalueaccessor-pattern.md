# ControlValueAccessor 模式

本页文档介绍了 @agent-arts/editor 如何通过 ControlValueAccessor 接口与 Angular 的响应式表单系统进行集成。该实现完全位于 site-ng 包中，它将与框架无关的 CustomEditor 类封装为一个兼容表单的 Angular 组件，从而支持通过 [(ngModel)] 实现双向数据绑定，以及通过 formControlName 实现响应式表单。

架构概述
该集成遵循分层适配器模式：Angular 表单 API 位于最外层，ControlValueAccessor 实现在 Angular 模型与编辑器内部状态之间起中介作用，而核心的 CustomEditor 类则对 Angular 完全无感知。这种分离确保了核心编辑器无需修改即可在 Vue、Angular 或原生 JS 中复用。






















双向数据流的关键在于一个抑制守卫：当 writeValue 以编程方式设置内容时，编辑器自身的 onChange 回调会被暂时静默，以防止产生回显循环，避免 writeValue → 编辑器更新 → onChange → writeValue 无限循环。


组件注册与 Provider 配置
ControlValueAccessor 在组件级别通过 Angular 的多 Provider 令牌 NG_VALUE_ACCESSOR 进行注册。这里必须使用 forwardRef 包装，因为在 @Component 装饰器求值时，类引用尚不可用。

providers: [
  {
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => AgentPromptEditorComponent),
    multi: true
  }
]
该组件同时实现了 ControlValueAccessor 接口和生命周期钩子（OnInit、OnDestroy），并使用 Angular 18 的独立 API 声明为独立组件。它直接导入了 CommonModule 和 FormsModule，而不依赖共享模块。


ControlValueAccessor 的四个方法
ControlValueAccessor 接口强制要求实现四个方法。下表将每个方法映射到其具体实现和行为契约：

方法	签名	在本组件中的职责	关键行为
writeValue	(value: string | null) => void	接收外部模型更新并同步到编辑器	若编辑器尚未初始化，则通过 pendingModelValue 延迟处理；否则调用 applyModelString
registerOnChange	(fn: (value: string) => void) => void	存储 Angular 的通知回调	回调被赋值给 this.onChange 闭包
registerOnTouched	(fn: () => void) => void	存储 Angular 的失焦通知回调	通过捕获阶段监听器绑定到编辑器 DOM 的 blur 事件
setDisabledState	(isDisabled: boolean) => void	切换禁用状态	目前为空操作桩函数


writeValue 与初始化竞态条件
一个关键的时序挑战在于，Angular 可能会在 ngOnInit 执行之前调用 writeValue。如果此时 CustomEditor 实例尚未创建，就无法应用该值。组件通过一个待定值队列解决此问题：

writeValue(value: string | null): void {
  this.modelValue = value ?? '';
  if (!this.editor) {
    this.pendingModelValue = this.modelValue;  // defer
    return;
  }
  this.applyModelString(this.modelValue);
}
在 ngOnInit 中，编辑器构建完毕后会刷新待定值：

if (this.pendingModelValue !== null) {
  this.applyModelString(this.pendingModelValue);
  this.pendingModelValue = null;
}
applyModelString 方法会设置 suppressModelEmit = true，销毁并使用新内容重建编辑器，然后重置该标志——从而确保在编程式写入期间不会触发 onChange。


内容序列化契约
通过 ControlValueAccessor 交换的模型值是一个序列化字符串，由核心编辑器的 getData() 方法生成，并由 parseEditorContentString() 消费。该格式使用自定义标签语法来编码编辑器块和插件块：

块类型	序列化格式	示例
EditorBlock	{#EditorBlock id="..." placeholder="..."}presetText{#/EditorBlock#}	{#EditorBlock id="b1" placeholder="请输入..."}智能助手{#/EditorBlock#}
PluginBlock	{#PluginBlock id="..." type="plugin"}name{#/PluginBlock#}	{#PluginBlock id="p1" type="workflow"}search-tool{#/PluginBlock#}
Variable	在纯文本中以内联形式渲染为 {{name}}	{{user_name}}
组件中的 parseModelString 方法是一个简单的透传层——对于空字符串它返回 null（表示“无需更新”），否则返回原始字符串。标签解析和块重建的繁重工作发生在核心编辑器的构造函数内部，它会调用 parseEditorContentString 将序列化字符串拆分为纯文本文档和 InitialBlock 描述符数组。


编辑器重建策略
当 writeValue 传入新内容时，组件不会对当前文档执行增量比较。相反，它会通过 recreateEditor() 销毁并完全重建 CustomEditor 实例。这种方式以牺牲细粒度为代价换取了正确性——因为编辑器块承载了有状态的装饰器、组件节点和状态字段，从头重建比增量协调更为简单可靠。

重建过程遵循严格的顺序：













在重建期间，所有回调选项都会按照初始 ngOnInit 的设置进行完全相同的重建——包括 onOpenPopup、onTriggerPluginPopup、onTriggerAIDialog 和 onChange。这确保了组件的弹窗管理和模型发射在重建后依然保持连通。


使用模式：父组件中的 ngModel
父组件 AppComponent 展示了标准的使用模式——通过 [(ngModel)] 将一个 string 类型的模型属性绑定到编辑器：

```html
<agent-prompt-editor [(ngModel)]="editorModel">
  <ng-template #pluginPopup let-comp let-library="library" let-style="style">
    <!-- custom popup content -->
  </ng-template>
</agent-prompt-editor>
```

editorModel 属性保存着一个包含完整编辑器状态（content、editorBlocks、pluginBlocks）的 JSON 字符串。当用户通过 loadTemplate() 切换模板时，模型会被重新赋值，从而触发 writeValue，并使用新内容重建编辑器。反之，编辑器内的每次按键都会调用 getData()，将其序列化回相同的 JSON 格式，并通过 onChange 回调更新 editorModel。

这种模式意味着表单模型始终是唯一事实来源——保存、加载和模板切换都操作于序列化字符串，而从不直接操作编辑器实例。


生命周期与清理
组件的 ngOnDestroy 会执行两项清理操作：从编辑器 DOM 元素移除捕获阶段的失焦监听器，并调用 editor.destroy() 以拆解 CodeMirror 视图及其状态字段。AI 对话控制器也会被显式销毁。这可以防止组件从 DOM 中移除时（例如在路由导航或通过 *ngIf 进行条件渲染时）发生内存泄漏。

失焦监听器附加在捕获阶段（addEventListener 的第三个参数为 true），因为编辑器的 DOM 结构包含嵌套元素，这些元素可能会在失焦事件到达宿主元素之前将其消耗掉。


suppressModelEmit 布尔值是防止无限更新循环的关键守卫。未来任何绕过 applyModelString 的修改（例如增量更新路径），都必须在变更编辑器状态之前设置此标志，并在之后将其清除，否则 Angular 的变更检测将触发递归的写入-发射循环。

该组件目前将 setDisabledState 视为空操作。如果需要支持禁用表单，实现中应同时在编辑器宿主 DOM 上设置 contenteditable="false"，并通过 EditorState.readOnly 阻止 CodeMirror 视图接受输入。

对比：ControlValueAccessor 与直接 API 使用
方面	ControlValueAccessor (Angular)	直接使用 CustomEditor API
数据绑定	通过 [(ngModel)] 或 formControlName 声明式绑定	手动调用：调用 getData() 和 recreateEditor()
初始化时机	必须处理在 ngOnInit 之前调用 writeValue 的情况	直接构造函数调用，无时序问题
表单验证	与 Angular 的 Validators 和 FormControl 错误集成	仅限应用层验证
禁用状态	通过表单指令经由 setDisabledState 控制	通过 EditorState.readOnly 手动切换
内容格式	序列化字符串（与 getData() 输出相同）	initialDoc 接受的任何格式
插件弹窗	由 Angular 组件内部管理	由消费者通过 onOpenPopup 回调管理
后续步骤
关于该访问器封装的底层编辑器类，请参阅 CustomEditor Class API
要了解序列化内容格式如何编码块，请参阅 Content Serialization Format
了解包括插件控制器 API 在内的更广泛的 Angular 集成模式，请参阅 Angular Integration
要了解编辑器块的内部管理机制，请参阅 Edit Block Plugin 和 Library Block Plugin