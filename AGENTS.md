# AGENTS.md - 项目AI助手配置

项目结构：
- packages/core 核心编辑器，包名：`@agent-arts/editor`
- packages/site 集成了 `@agent-arts/editor` 的 Vue 网站
- packages/site-ng 集成了 `@agent-arts/editor` 的 Angular 网站

实现编辑器特性时，需要在 `@agent-arts/editor` 中实现，而不是在 `site` 或 `site-ng` 中实现，只有 UI 部分的代码才放到 `site` 或 `site-ng` 中。

涉及到使用 `@agent-arts/editor` 时，需要同时修改 `site` 或 `site-ng` 中的代码。

`@agent-arts/editor` 遵循插件化架构，每个编辑器特性都是一个插件，插件之间可以相互依赖，实现插件的特性时，代码应该放到对应的插件中。

插件在 `packages/core/plugins/` 目录下，每个插件都是一个独立的目录，目录名就是插件的名称。

插件列表：
- edit-block 编辑块，这是可编辑的，可以编辑空白引导和预设内容。
- library-block 插件块，这是不可编辑的，插件块下拉框可以通过输入大括号 `{` 呼起，点击下拉框的插件名称可以插入插件块。
- ai-dialog AI对话框，可以通过输入斜线 `/` 呼起，也可以通过拖选文本呼起。
