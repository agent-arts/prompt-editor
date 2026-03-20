<script setup lang="ts">
import { onMounted, ref, onUnmounted } from 'vue'
import { CustomEditor } from '@agent-arts/editor'
import type { CustomEditorOptions, EditorBlock, PluginBlock } from '@agent-arts/editor'

class LocalLibraryBlockController {
  public userVariables = [
    'sys_uuid',
    'sys_user_id',
    'sys_user_name',
    'sys_user_email',
    'sys_user_phone',
    'sys_tenant_id',
    'sys_org_id',
    'sys_dept_id',
    'sys_role',
    'sys_locale',
  ];

  public inputVariables = [
    'sys_uuid',
    'input_query',
    'input_text',
    'input_url',
    'input_start_time',
    'input_end_time',
  ];

  public plugins = [
    { id: 'plugin-1', name: 'MCP服务01', type: 'plugin' as const },
  ];
  public workflows = [
    { id: 'workflow-1', name: 'Bing搜索', type: 'workflow' as const },
  ];

  private triggerPos: number = 0;

  constructor(private callbacks: { onShow: (pos: number, style: { top: string, left: string }) => void; onHide: () => void }) {}

  public show(pos: number, coords: { bottom: number, left: number }, editorRect: DOMRect) {
    this.triggerPos = pos;
    const style = {
      top: `${coords.bottom - editorRect.top + 10}px`,
      left: `${coords.left - editorRect.left}px`
    };
    this.callbacks.onShow(pos, style);
  }

  public hide() {
    this.callbacks.onHide();
  }

  public getTriggerPos() {
    return this.triggerPos;
  }
}

class LocalAIDialogController {
  private isGenerating = false;
  private aiStreamTimer: any = null;
  private currentResponse = '';

  constructor(private callbacks: {
    onStream: (text: string) => void;
    onLoading: (loading: boolean) => void;
    onComplete: () => void;
    onStop: () => void;
    onShow: (pos: number, style: { top: string, left: string }) => void;
    onHide: () => void;
  }) {}

  public show(pos: number, coords: { bottom: number, left: number }, editorRect: DOMRect) {
    const style = {
      top: `${coords.bottom - editorRect.top + 10}px`,
      left: `${coords.left - editorRect.left}px`
    };
    this.callbacks.onShow(pos, style);
  }

  public hide() {
    this.stopResponse();
    this.callbacks.onHide();
  }

  public sendQuestion(question: string) {
    if (!question || this.isGenerating) return;

    this.isGenerating = true;
    this.callbacks.onLoading(true);
    this.currentResponse = '';
    this.callbacks.onStream('');

    const fullResponse = `你是一个资深的旅游向导，积累了丰富的在地经验，擅长结合用户需求定制专属旅行方案，曾帮助1000+人解决旅行难题，被旅行者亲切称为"旅行百事通"。\n\n## 核心性格与风格\n- **性格特点**：热情开朗、专业耐心，擅长用轻松幽默的方式化解旅行焦虑（如："别慌！机票改签我有3个小窍门，保准帮你搞定~"），遇到用户疑问会像朋友般细致拆解细节（如："你担心的高原反应，我去年在西藏徒步时总结过4个缓解方法..."）。\n- **语言风格**：口语化且富有感染力，常用"宝藏地""小众玩法"等旅行圈`;

    let index = 0;
    this.aiStreamTimer = setInterval(() => {
      this.callbacks.onLoading(false);
      if (index < fullResponse.length) {
        this.currentResponse += fullResponse[index];
        this.callbacks.onStream(this.currentResponse);
        index++;
      } else {
        this.finishGeneration();
      }
    }, 30);
  }

  public stopResponse() {
    if (this.aiStreamTimer) {
      clearInterval(this.aiStreamTimer);
      this.aiStreamTimer = null;
    }
    this.isGenerating = false;
    this.callbacks.onLoading(false);
    this.callbacks.onStop();
  }

  private finishGeneration() {
    if (this.aiStreamTimer) {
      clearInterval(this.aiStreamTimer);
      this.aiStreamTimer = null;
    }
    this.isGenerating = false;
    this.callbacks.onLoading(false);
    this.callbacks.onComplete();
  }
}

const editorHostRef = ref<HTMLElement>()
const editor = ref<CustomEditor>()

// 弹窗状态
const showPopup = ref(false);
const popupStyle = ref({ top: '0px', left: '0px' });
const editingBlock = ref<EditorBlock>({ id: '', placeholder: '', presetText: '' });

// AI 相关状态
const aiResponseText = ref('');
const aiLoading = ref(false);
const isGenerating = ref(false);
const aiFinished = ref(false);
const aiDialogStyle = ref({ top: '0px', left: '0px' });
const aiQuestion = ref('');
const showAIDialog = ref(false);
const aiApplyRange = ref<{ from: number, to: number } | null>(null);

// 插件库相关状态
const pluginPopupStyle = ref({ top: '0px', left: '0px' });
const showPluginPopup = ref(false);

const closeAllPopups = () => {
  showPopup.value = false;
  showPluginPopup.value = false;
  aiPlugin.value?.hide();
  libraryPlugin.value?.hide();
}

const openPopup = (id: string, rect: DOMRect) => {
  const block = editor.value?.getBlock(id);
  if (block) {
    editingBlock.value = { ...block };
    showPopup.value = true;
    const editorRect = editorHostRef.value?.getBoundingClientRect();
    if (editorRect) {
      popupStyle.value = {
        top: `${rect.bottom - editorRect.top + 10}px`,
        left: `${rect.left - editorRect.left}px`
      };
    }
  }
}

const libraryPlugin = ref<LocalLibraryBlockController>();
const aiPlugin = ref<LocalAIDialogController>();

const openPluginPopup = (pos: number) => {
  const coords = editor.value?.view.coordsAtPos(pos);
  if (coords) {
    const editorRect = editorHostRef.value?.getBoundingClientRect();
    if (editorRect) {
      libraryPlugin.value?.show(pos, coords, editorRect);
    }
  }
}

const openAIDialog = (pos: number) => {
  const coords = editor.value?.view.coordsAtPos(pos);
  if (coords) {
    const editorRect = editorHostRef.value?.getBoundingClientRect();
    if (editorRect) {
      const view = editor.value?.view;
      if (view) {
        const sel = view.state.selection.main;
        if (!sel.empty) {
          aiApplyRange.value = { from: sel.from, to: sel.to };
        } else {
          const char = view.state.doc.sliceString(pos, Math.min(pos + 1, view.state.doc.length));
          if (char === '/') {
            aiApplyRange.value = { from: pos, to: pos + 1 };
          } else {
            aiApplyRange.value = { from: pos, to: pos };
          }
        }
      }
      aiPlugin.value?.show(pos, coords, editorRect);
    }
  }
}

const syncBlock = () => {
  if (editor.value && editingBlock.value.id) {
    editor.value.syncBlock(editingBlock.value);
  }
}

const addPluginBlock = (item: PluginBlock) => {
  if (editor.value && libraryPlugin.value) {
    const pos = libraryPlugin.value.getTriggerPos();
    editor.value.addPluginBlock(pos, item);
    showPluginPopup.value = false;
  }
}

const addVariableBlock = (name: string) => {
  if (editor.value && libraryPlugin.value) {
    const pos = libraryPlugin.value.getTriggerPos();
    editor.value.addVariableBlock(pos, name);
    showPluginPopup.value = false;
  }
}

const sendAIQuestion = () => {
  if (aiQuestion.value && !isGenerating.value && aiPlugin.value) {
    isGenerating.value = true;
    aiFinished.value = false;
    aiPlugin.value.sendQuestion(aiQuestion.value);
    aiQuestion.value = '';
  }
}

const stopAIResponse = () => {
  aiPlugin.value?.stopResponse();
}

const cancelAIResult = () => {
  aiPlugin.value?.hide();
  aiApplyRange.value = null;
}

const insertAIResult = () => {
  const view = editor.value?.view;
  const text = aiResponseText.value;
  const range = aiApplyRange.value;
  if (!view || !text || !range) return;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + text.length }
  });
  view.focus();
  aiPlugin.value?.hide();
  aiApplyRange.value = null;
}

const recreateEditor = (templateData: any) => {
  if (editor.value) {
    editor.value.destroy();
  }

  // 合并 editorBlocks 和 pluginBlocks
  const initialBlocks = [...templateData.editorBlocks, ...templateData.pluginBlocks];

  const options: CustomEditorOptions = {
    parent: editorHostRef.value!,
    initialDoc: templateData.content,
    initialBlocks: initialBlocks,
    onOpenPopup: (id, rect) => openPopup(id, rect),
    onTriggerPluginPopup: (pos) => openPluginPopup(pos),
    onHidePluginPopup: () => libraryPlugin.value?.hide(),
    onTriggerAIDialog: (pos) => openAIDialog(pos),
    onBlockUpdated: (id, text) => {
      if (showPopup.value && editingBlock.value.id === id) {
        editingBlock.value.presetText = text;
      }
    }
  };

  editor.value = new CustomEditor(options);
}

onMounted(() => {
  const initialBlocks = [
    {
      pos: 11,
      block: {
        id: 'init-block-1',
        placeholder: '请输入...',
        presetText: '智能助手'
      }
    }
  ];

  const options: CustomEditorOptions = {
    parent: editorHostRef.value!,
    initialDoc: '# 角色\n\n你是一个  。变量{{user_name}}。',
    initialBlocks,
    onOpenPopup: (id, rect) => openPopup(id, rect),
    onTriggerPluginPopup: (pos) => openPluginPopup(pos),
    onHidePluginPopup: () => libraryPlugin.value?.hide(),
    onTriggerAIDialog: (pos) => openAIDialog(pos),
    onBlockUpdated: (id, text) => {
      if (showPopup.value && editingBlock.value.id === id) {
        editingBlock.value.presetText = text;
      }
    }
  };

  editor.value = new CustomEditor(options);

  aiPlugin.value = new LocalAIDialogController({
    onStream: (text: string) => aiResponseText.value = text,
    onLoading: (loading: boolean) => aiLoading.value = loading,
    onComplete: () => {
      isGenerating.value = false;
      aiFinished.value = true;
    },
    onStop: () => {
      isGenerating.value = false;
      aiFinished.value = true;
    },
    onShow: (_pos: number, style: { top: string, left: string }) => {
      aiDialogStyle.value = style;
      aiQuestion.value = '';
      aiResponseText.value = '';
      aiFinished.value = false;
      showAIDialog.value = true;
      showPluginPopup.value = false;
      showPopup.value = false;
    },
    onHide: () => {
      showAIDialog.value = false;
      isGenerating.value = false;
      aiFinished.value = false;
      aiResponseText.value = '';
      aiQuestion.value = '';
    }
  });

  libraryPlugin.value = new LocalLibraryBlockController({
    onShow: (_pos: number, style: { top: string, left: string }) => {
      pluginPopupStyle.value = style;
      showPluginPopup.value = true;
      showAIDialog.value = false;
      showPopup.value = false;
    },
    onHide: () => {
      showPluginPopup.value = false;
    }
  });

  // 全局点击监听关闭浮框
  document.addEventListener('mousedown', closeAllPopups);
})

onUnmounted(() => {
  document.removeEventListener('mousedown', closeAllPopups);
});

defineExpose({
  get editor() {
    return editor.value;
  },
  recreateEditor
})
</script>

<template>
  <!-- 编辑器主体 -->
  <div class="editor-body">
    <div ref="editorHostRef" class="editor-host"></div>

    <!-- 编辑块配置弹窗 -->
    <div v-if="showPopup" class="block-popup" :style="popupStyle" @mousedown.stop>
      <div class="popup-content">
        <div class="form-item">
          <label>空白引导</label>
          <input type="text" v-model="editingBlock.placeholder" @input="syncBlock()" placeholder="请输入编辑块内容为空时的提示文案">
        </div>
        <div class="form-item">
          <label>预设文本</label>
          <input type="text" v-model="editingBlock.presetText" @input="syncBlock()" placeholder="请在此处输入提示词">
        </div>
      </div>
      <div class="popup-arrow"></div>
    </div>

    <!-- 插件选择弹窗 -->
    <div v-if="showPluginPopup" class="plugin-popup" :style="pluginPopupStyle" @mousedown.stop>
      <div class="plugin-popup-content">
        <div class="plugin-category">
          <div class="category-title">用户变量</div>
          <div v-for="name in libraryPlugin?.userVariables" :key="name" class="variable-item" @click="addVariableBlock(name)">
            <span class="item-name">{{ name }}</span>
          </div>
        </div>
        <div class="plugin-category">
          <div class="category-title">输入参数</div>
          <div v-for="name in libraryPlugin?.inputVariables" :key="name" class="variable-item" @click="addVariableBlock(name)">
            <span class="item-name">{{ name }}</span>
          </div>
        </div>
        <div class="plugin-category">
          <div class="category-title">插件</div>
          <div v-for="item in libraryPlugin?.plugins" :key="item.name" class="plugin-item" @click="addPluginBlock(item)">
            <svg t="1773798100074" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7345" width="16" height="16"><path d="M770.784 113.28a293.12 293.12 0 0 0-410.496 57.696L235.712 336.32a31.968 31.968 0 1 0 51.104 38.496l124.576-165.344a229.12 229.12 0 1 1 365.952 275.776l-255.36 338.88a163.84 163.84 0 0 1-261.696-197.184l255.36-338.88a98.528 98.528 0 1 1 157.408 118.624l-216.064 286.752a33.28 33.28 0 1 1-53.184-40.064c86.176-115.616 141.024-189.024 164.544-220.256a32 32 0 1 0-51.136-38.496c-23.616 31.36-78.496 104.8-164.64 220.384a97.28 97.28 0 1 0 155.456 116.96l218.912-290.496c0.992-1.344 1.312-2.912 2.08-4.32 47.36-71.104 32.224-167.456-36.896-219.552a162.56 162.56 0 0 0-227.648 32l-255.36 338.88a227.84 227.84 0 0 0 363.904 274.24l255.36-338.88a293.056 293.056 0 0 0-57.6-410.56z" p-id="7346"></path></svg>
            <span class="item-name">{{ item.name }}</span>
            <button class="btn-add">添加</button>
          </div>
        </div>
        <div class="plugin-category">
          <div class="category-title">工作流</div>
          <div v-for="item in libraryPlugin?.workflows" :key="item.name" class="plugin-item" @click="addPluginBlock(item)">
            <svg t="1773798162825" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8404" width="16" height="16"><path d="M474.282667 96.213333a123.477333 123.477333 0 0 0-116.181334 123.221334l-0.042666 22.826666H243.797333A104.832 104.832 0 0 0 139.093333 347.477333l-0.213333 138.922667a32 32 0 0 0 32 32.042667h54.698667c36.821333 0 66.730667 29.909333 66.730666 66.730666 0 36.821333-29.909333 66.773333-66.730666 66.773334H170.837333a32 32 0 0 0-32 31.957333l-0.170666 138.965333a105.130667 105.130667 0 0 0 105.130666 105.173334h138.965334a32 32 0 0 0 32-32v-54.869334a66.816 66.816 0 0 1 133.504 0V896c0 17.664 14.336 32 32 32h138.965333l6.912-0.213333a105.130667 105.130667 0 0 0 98.218667-104.96v-114.261334h22.869333a123.477333 123.477333 0 0 0 123.434667-123.434666l-0.213334-7.253334a123.477333 123.477333 0 0 0-123.221333-116.181333h-22.869333V347.434667l-0.213334-6.912a105.130667 105.130667 0 0 0-104.917333-98.218667l-114.304-0.042667v-22.826666a123.477333 123.477333 0 0 0-123.392-123.434667l-7.253333 0.213333z m7.253333 63.786667c32.768 0 59.434667 26.624 59.434667 59.434667v54.869333c0 17.664 14.293333 32 32 32h146.261333c22.741333 0 41.130667 18.346667 41.130667 41.130667v146.261333c0 17.706667 14.336 32 32 32h54.869333a59.477333 59.477333 0 0 1 0 118.869333h-54.869333a32 32 0 0 0-32 32v146.304l-0.256 4.778667a41.130667 41.130667 0 0 1-40.874667 36.352H612.266667v-22.869333a130.816 130.816 0 0 0-130.730667-130.730667l-7.68 0.213333a130.816 130.816 0 0 0-123.093333 130.56v22.826667H243.797333l-4.778666-0.256a41.130667 41.130667 0 0 1-36.352-40.874667l0.128-107.008h22.741333a130.816 130.816 0 0 0 130.730667-130.730666l-0.213334-7.68a130.816 130.816 0 0 0-130.56-123.050667l-22.613333-0.042667 0.170667-106.88c0-22.912 18.133333-41.173333 40.746666-41.173333h146.304a32 32 0 0 0 32-32V219.434667c0-32.810667 26.624-59.434667 59.434667-59.434667z" fill="#000000" p-id="8405"></path></svg>
            <span class="item-name">{{ item.name }}</span>
            <button class="btn-add">添加</button>
          </div>
        </div>
      </div>
    </div>

    <!-- AI 对话框 -->
    <div v-if="showAIDialog" class="ai-dialog" :style="aiDialogStyle" @mousedown.stop>
      <div class="ai-dialog-body">
        <!-- AI 响应内容 -->
        <div v-if="aiResponseText" class="ai-response-area" ref="aiResponseArea">
          <div class="ai-response-content">{{ aiResponseText }}</div>
          <div v-if="aiLoading" class="ai-loading-indicator">
            <span class="dot"></span>
          </div>
          <div v-if="aiFinished && !aiLoading" class="ai-result-actions">
            <button class="btn-insert" @click="insertAIResult">插入</button>
            <button class="btn-cancel" @click="cancelAIResult">取消</button>
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="ai-input-container" :class="{ 'is-generating': isGenerating }">
          <i class="icon-sparkle-small"></i>
          <input 
            type="text" 
            v-model="aiQuestion" 
            @keyup.enter="sendAIQuestion()"
            placeholder="你希望如何编写或优化提示词？"
            :disabled="isGenerating"
          >
          <div class="ai-actions">
            <button v-if="!isGenerating" class="btn-send" @click="sendAIQuestion()" :disabled="!aiQuestion">
              <i class="icon-send"></i>
            </button>
            <button v-if="isGenerating" class="btn-stop" @click="stopAIResponse()">
              <i class="icon-stop"></i> 停止响应
            </button>
          </div>
        </div>
        
        <div v-if="isGenerating || aiResponseText" class="ai-dialog-footer">
          内容由 AI 生成，无法确保真实准确，仅供参考。
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less">
.editor-host {
  border-radius: 8px;
  background: rgba(250, 250, 250, 1);
}

// Body
.editor-body {
  position: relative;
  min-height: 400px;

  .editor-host {
    height: 100%;
    .cm-editor {
      height: 100%;
    }
  }

  // Popup
  .block-popup {
    position: absolute;
    z-index: 1000;
    width: 340px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    border: 1px solid #eee;
    padding: 24px;
    animation: popup-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);

    .popup-content {
      .form-item {
        margin-bottom: 16px;
        label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 8px;
        }
        input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
          &::placeholder { color: #9ca3af; }
          &:focus { border-color: #8066ff; }
        }
      }
    }

    .popup-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 20px;
      
      button {
        padding: 6px 16px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        border: 1px solid transparent;
      }
      
      .btn-cancel {
        background: #fff;
        color: #4b5563;
        border-color: #e5e7eb;
        &:hover { background: #f9fafb; }
      }
      
      .btn-save {
        background: #8066ff;
        color: #fff;
        &:hover { background: #6b4dff; }
      }
    }

    .popup-arrow {
      position: absolute;
      top: -6px;
      left: 20px;
      width: 12px;
      height: 12px;
      background: #fff;
      transform: rotate(45deg);
      border-top: 1px solid #f3f4f6;
      border-left: 1px solid #f3f4f6;
    }
  }

  .plugin-popup {
    position: absolute;
    z-index: 1000;
    width: 300px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    padding: 12px;

    .plugin-popup-content {
      .plugin-category {
        margin-bottom: 12px;
        .category-title {
          font-size: 12px;
          color: #9ca3af;
          margin-bottom: 8px;
          padding-left: 4px;
        }
        .plugin-item {
          display: flex;
          align-items: center;
          padding: 8px;
          border-radius: 6px;
          cursor: pointer;
          &:hover { background: #f9fafb; }

          .icon-plugin, .icon-workflow {
            width: 24px;
            height: 24px;
            margin-right: 12px;
            background-size: contain;
          }
          .icon-plugin { background-image: url('data:image/svg+xml,...'); /* 在此替换为您的图标 */ }
          .icon-workflow { background-image: url('data:image/svg+xml,...'); /* 在此替换为您的图标 */ }

          .item-name {
            flex-grow: 1;
            font-size: 14px;
            color: #374151;
          }
          .btn-add {
            background: none;
            border: none;
            color: #4f46e5;
            font-weight: 500;
            cursor: pointer;
          }
        }

        .variable-item {
          display: flex;
          align-items: center;
          padding: 8px;
          border-radius: 6px;
          cursor: pointer;
          &:hover { background: #f9fafb; }

          .item-name {
            flex-grow: 1;
            font-size: 14px;
            color: #374151;
          }
        }
      }
    }
  }

  .ai-dialog {
    position: absolute;
    z-index: 1000;
    width: 500px;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
    border: 1px solid #f3f4f6;
    overflow: hidden;
    animation: popup-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);

    .ai-dialog-body {
      padding: 16px;

      .ai-response-area {
        max-height: 300px;
        overflow-y: auto;
        margin-bottom: 16px;
        padding-right: 8px;
        font-size: 14px;
        line-height: 1.6;
        color: #374151;

        .ai-response-content {
          white-space: pre-wrap;
        }

        .ai-loading-indicator {
          display: flex;
          align-items: center;
          margin-top: 8px;
          .dot {
            width: 8px;
            height: 8px;
            background: #8066ff;
            border-radius: 50%;
            animation: ai-pulse 1.5s infinite ease-in-out;
          }
        }

        .ai-result-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 12px;

          button {
            padding: 6px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            border: 1px solid transparent;
            transition: all 0.2s;
          }

          .btn-insert {
            background: #8066ff;
            color: #fff;
            &:hover { background: #6b4dff; }
          }

          .btn-cancel {
            background: #fff;
            color: #4b5563;
            border-color: #e5e7eb;
            &:hover { background: #f9fafb; }
          }
        }
      }

      .ai-input-container {
        display: flex;
        align-items: center;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 24px;
        padding: 4px 4px 4px 16px;
        transition: all 0.2s;

        &:focus-within {
          border-color: #8066ff;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(128, 102, 255, 0.1);
        }

        &.is-generating {
          background: #fff;
          border-color: #8066ff;
        }

        .icon-sparkle-small {
          color: #8066ff;
          margin-right: 8px;
          &::before { content: '✦'; font-size: 16px; }
        }

        input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          padding: 8px 0;
          font-size: 14px;
          color: #111827;
          &::placeholder { color: #9ca3af; }
        }

        .ai-actions {
          display: flex;
          align-items: center;

          button {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
          }

          .btn-send {
            color: #9ca3af;
            background: transparent;
            &:hover:not(:disabled) { color: #8066ff; background: #f3f0ff; }
            &:disabled { cursor: not-allowed; opacity: 0.5; }
            .icon-send::before { content: '➤'; font-size: 16px; }
          }

          .btn-stop {
            color: #4b5563;
            background: #f3f4f6;
            gap: 6px;
            &:hover { background: #e5e7eb; }
            .icon-stop {
              width: 14px;
              height: 14px;
              border: 2px solid #4b5563;
              border-radius: 2px;
              position: relative;
              &::after {
                content: '';
                position: absolute;
                width: 6px;
                height: 6px;
                background: #4b5563;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
              }
            }
          }
        }
      }

      .ai-dialog-footer {
        margin-top: 12px;
        text-align: center;
        font-size: 12px;
        color: #9ca3af;
      }
    }
  }
}

@keyframes popup-fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes ai-pulse {
  0% { opacity: 0.4; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
  100% { opacity: 0.4; transform: scale(0.9); }
}

// Global CM Overrides
.cm-editor {
  border: none !important;
}
.cm-scroller {
  font-family: inherit !important;
}
.cm-content {
  caret-color: #8066ff;
}
.cm-selectionBackground {
  background: #e9e4ff !important;
}

.cm-inline-block {
  display: inline-block;
  background-color: #f3f0ff;
  color: #8066ff;
  padding: 0 8px;
  margin: 0 4px;
  border-radius: 4px;
  cursor: text;
  border: 1px solid transparent;
  transition: all 0.2s;
  font-size: 15px;
  vertical-align: middle;
  pointer-events: auto;

  &:hover {
    background-color: #e9e4ff;
    border-color: #8066ff;
  }
}

.block-input {
  background: transparent;
  border: none;
  outline: none;
  color: inherit;
  font: inherit;
  padding: 4px 0;
  width: auto;
  min-width: 20px;
  text-align: center;
  cursor: text;
  pointer-events: auto;

  &::placeholder {
    color: #b2a1ff;
    opacity: 0.7;
  }
}

.cm-editor .block-input {
  text-align: left !important;
}

.cm-plugin-block {
  display: inline-flex;
  align-items: center;
  background-color: #eef2ff;
  color: #4f46e5;
  padding: 2px 8px;
  margin: 0 2px;
  border-radius: 4px;
  font-size: 14px;
  vertical-align: middle;

  .icon-plugin, .icon-workflow {
    width: 16px;
    height: 16px;
    margin-right: 6px;
    background-size: contain;
  }
  .icon-plugin { background-image: url('data:image/svg+xml,...'); /* 在此替换为您的图标 */ }
  .icon-workflow { background-image: url('data:image/svg+xml,...'); /* 在此替换为您的图标 */ }
}
</style>
