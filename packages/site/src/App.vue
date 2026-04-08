<script setup lang="ts">
import Editor from './components/Editor.vue'
import { ref, onMounted } from 'vue'

const editorRef = ref()
const templates = ref<any[]>([])
const currentTemplateName = ref('')

const TEMPLATE_STORAGE_KEY = 'editor-templates';

onMounted(() => {
  const savedTemplates = localStorage.getItem(TEMPLATE_STORAGE_KEY);
  if (savedTemplates) {
    templates.value = JSON.parse(savedTemplates);
    if (templates.value.length > 0) {
      loadTemplate(templates.value[0]);
    }
  }
});

const addBlock = () => {
  editorRef.value.editor.addBlock();
}

const addVariableBlock = () => {
  editorRef.value.insertVariable('var1');
}

const saveTemplate = () => {
  const data = editorRef.value.editor.getData();
  console.log('data', data);
  
  const name = prompt('请输入模板名称：', `模板${templates.value.length + 1}`);
  if (name) {
    templates.value.push({ name, data });
    currentTemplateName.value = name;
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates.value));
  }
}

const escapeAttrValue = (value: string) => {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

const legacyDataToString = (data: any) => {
  const content = typeof data?.content === 'string' ? data.content : '';
  const editorBlocks = Array.isArray(data?.editorBlocks) ? data.editorBlocks : [];
  const pluginBlocks = Array.isArray(data?.pluginBlocks) ? data.pluginBlocks : [];

  const replacements: { from: number; to: number; text: string }[] = [];

  for (const b of editorBlocks) {
    const pos = b?.pos;
    if (typeof pos !== 'number') continue;
    const len = typeof b?.len === 'number' ? b.len : 1;
    const block = b?.block || {};
    const id = typeof block.id === 'string' ? block.id : `block-${pos}`;
    const placeholder = typeof block.placeholder === 'string' ? block.placeholder : '';
    const presetText = typeof block.presetText === 'string' ? block.presetText : '';
    const text = `{#EditorBlock id="${escapeAttrValue(id)}" placeholder="${escapeAttrValue(placeholder)}"#}${presetText}{#/EditorBlock#}`;
    replacements.push({ from: pos, to: pos + len, text });
  }

  for (const b of pluginBlocks) {
    const pos = b?.pos;
    if (typeof pos !== 'number') continue;
    const len = typeof b?.len === 'number' ? b.len : 1;
    const block = b?.block || {};
    if (block.type === 'variable') continue;
    const id = typeof block.id === 'string' ? block.id : `plugin-${pos}`;
    const type = block.type === 'workflow' ? 'workflow' : 'plugin';
    const name = typeof block.name === 'string' ? block.name : '';
    const text = `{#PluginBlock id="${escapeAttrValue(id)}" type="${escapeAttrValue(type)}"#}${name}{#/PluginBlock#}`;
    replacements.push({ from: pos, to: pos + len, text });
  }

  replacements.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));

  let result = '';
  let cursor = 0;
  for (const r of replacements) {
    if (r.from < cursor) continue;
    result += content.slice(cursor, r.from);
    result += r.text;
    cursor = r.to;
  }
  result += content.slice(cursor);
  return result;
}

const normalizeTemplateData = (data: any) => {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object' && typeof data.content === 'string') {
    return legacyDataToString(data);
  }
  return '';
}

const loadTemplate = (template: any) => {
  console.log('template', template, template.data);
  
  currentTemplateName.value = template.name;
  // 销毁并重新创建 editor 实例来加载模板
  editorRef.value.recreateEditor(normalizeTemplateData(template.data));
}

const printData = () => {
  const data = editorRef.value.editor.getData();
  console.log('data', data);
}
</script>

<template>
  <div class="w-[560px]">
    <div class="flex justify-between mb-4">
      <div>提示词</div>
      <div>
        <button 
          v-for="template in templates" 
          :key="template.name" 
          @click="loadTemplate(template)"
          :class="{ 'font-bold': currentTemplateName === template.name }"
        >
          {{ template.name }}
        </button>
        <i class="ci-save font-size-5" title="保存为模板" @click="saveTemplate"></i>
        |
        <i class="ci-task font-size-5" title="插入编辑块" @click="addBlock"></i>
        |
        <i class="ci-task font-size-5" title="插入变量块" @click="addVariableBlock"></i>
        |
        <i class="ci-print font-size-5" title="打印编辑器数据" @click="printData"></i>
      </div>
    </div>
    <Editor ref="editorRef" />
  </div>
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
