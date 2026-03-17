<script setup lang="ts">
import { onMounted, ref, reactive, nextTick, onUnmounted } from 'vue'
import {
  EditorBlock,
  CustomEditor,
  CustomEditorOptions,
  AIDialogPlugin,
  EditBlockPlugin,
  LibraryBlockPlugin,
} from '@agent-arts/editor';

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
const aiDialogStyle = ref({ top: '0px', left: '0px' });
const aiQuestion = ref('');
const showAIDialog = ref(false);

// 插件库相关状态
const pluginPopupStyle = ref({ top: '0px', left: '0px' });
const showPluginPopup = ref(false);

const closeAllPopups = () => {
  showPopup.value = false;
  showAIDialog.value = false;
  showPluginPopup.value = false;
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

const libraryPlugin = ref<LibraryBlockPlugin>();
const aiPlugin = ref<AIDialogPlugin>();
const editPlugin = ref<EditBlockPlugin>();

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
      aiPlugin.value?.show(pos, coords, editorRect);
    }
  }
}

const syncBlock = () => {
  if (editor.value && editingBlock.value.id) {
    editor.value.syncBlock(editingBlock.value);
  }
}

const addPluginBlock = (item: any) => {
  if (editor.value && libraryPlugin.value) {
    const pos = libraryPlugin.value.getTriggerPos();
    editor.value.addPluginBlock(pos, item);
    showPluginPopup.value = false;
  }
}

const sendAIQuestion = () => {
  if (aiQuestion.value && !isGenerating.value && aiPlugin.value) {
    aiPlugin.value.sendQuestion(aiQuestion.value);
    aiQuestion.value = '';
  }
}

const stopAIResponse = () => {
  aiPlugin.value?.stopResponse();
}

const recreateEditor = (templateData: any) => {
  if (editor.value) {
    editor.value.destroy();
  }

  const initialPluginBlocks = templateData.pluginBlocks.map((item: any) => ({ pos: item.pos, block: item.block }));

  const options: CustomEditorOptions = {
    parent: editorHostRef.value!,
    initialDoc: templateData.content,
    initialBlocks: templateData.editorBlocks.concat(initialPluginBlocks),
    onOpenPopup: (id, rect) => openPopup(id, rect),
    onTriggerPluginPopup: (pos) => openPluginPopup(pos),
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
    initialDoc: '# 角色\n\n你是一个  ',
    initialBlocks,
    onOpenPopup: (id, rect) => openPopup(id, rect),
    onTriggerPluginPopup: (pos) => openPluginPopup(pos),
    onTriggerAIDialog: (pos) => openAIDialog(pos),
    onBlockUpdated: (id, text) => {
      if (showPopup.value && editingBlock.value.id === id) {
        editingBlock.value.presetText = text;
      }
    }
  };

  editor.value = new CustomEditor(options);

  aiPlugin.value = new AIDialogPlugin({
    onStream: (text) => aiResponseText.value = text,
    onLoading: (loading) => aiLoading.value = loading,
    onComplete: () => isGenerating.value = false,
    onStop: () => isGenerating.value = false,
    onShow: (pos, style) => {
      aiDialogStyle.value = style;
      aiQuestion.value = '';
      aiResponseText.value = '';
      showAIDialog.value = true;
      showPluginPopup.value = false;
      showPopup.value = false;
    },
    onHide: () => {
      showAIDialog.value = false;
      isGenerating.value = false;
    }
  });

  libraryPlugin.value = new LibraryBlockPlugin({
    onShow: (pos, style) => {
      pluginPopupStyle.value = style;
      showPluginPopup.value = true;
      showAIDialog.value = false;
      showPopup.value = false;
    },
    onHide: () => {
      showPluginPopup.value = false;
    }
  });

  editPlugin.value = new EditBlockPlugin({
    onShow: (block, style) => {
      editingBlock.value = block;
      popupStyle.value = style;
      showPopup.value = true;
      showAIDialog.value = false;
      showPluginPopup.value = false;
    },
    onHide: () => {
      showPopup.value = false;
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
          <div class="category-title">插件</div>
          <div v-for="item in libraryPlugin?.plugins" :key="item.name" class="plugin-item" @click="addPluginBlock(item)">
            <i class="icon-plugin"></i>
            <span class="item-name">{{ item.name }}</span>
            <button class="btn-add">添加</button>
          </div>
        </div>
        <div class="plugin-category">
          <div class="category-title">工作流</div>
          <div v-for="item in libraryPlugin?.workflows" :key="item.name" class="plugin-item" @click="addPluginBlock(item)">
            <i class="icon-workflow"></i>
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
