<script setup lang="ts">
import Editor from './components/Editor.vue'
import { ref } from 'vue'

const editorRef = ref()
const templates = ref<any[]>([])
const currentTemplateName = ref('')

const addBlock = () => {
  editorRef.value.editor.addBlock();
}

const saveTemplate = () => {
  const data = editorRef.value.editor.getData();
  console.log('data', data);
  
  const name = prompt('请输入模板名称：', `模板${templates.value.length + 1}`);
  if (name) {
    templates.value.push({ name, data });
    currentTemplateName.value = name;
  }
}

const loadTemplate = (template: any) => {
  currentTemplateName.value = template.name;
  // 销毁并重新创建 editor 实例来加载模板
  editorRef.value.recreateEditor(template.data);
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
