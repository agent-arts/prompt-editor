<script setup lang="ts">
import Editor from './components/Editor.vue'
</script>

<template>
  <div class="w-[560px]">
    <div class="flex justify-between">
      <div>提示词</div>
      <div>
        <i class="ci-task"></i>
      </div>
    </div>
    <Editor />
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
