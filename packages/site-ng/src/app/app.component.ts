import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { AgentPromptEditorComponent } from './editor/agent-prompt-editor.component';
import type { PluginBlock } from '@agent-arts/editor';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, AgentPromptEditorComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements AfterViewInit {
  @ViewChild(AgentPromptEditorComponent) editorComponent?: AgentPromptEditorComponent;

  templates: { name: string; data: any }[] = [];
  currentTemplateName = '';
  editorModel = '';

  private readonly TEMPLATE_STORAGE_KEY = 'editor-templates';

  ngAfterViewInit() {
    const savedTemplates = localStorage.getItem(this.TEMPLATE_STORAGE_KEY);
    if (savedTemplates) {
      this.templates = JSON.parse(savedTemplates);
      if (this.templates.length > 0) {
        this.loadTemplate(this.templates[0]);
      }
      return;
    }

    this.editorModel = JSON.stringify({
      content: '# 角色\n\n你是一个  。变量{{user_name}}。',
      editorBlocks: [
        {
          pos: 11,
          block: {
            id: 'init-block-1',
            placeholder: '请输入...',
            presetText: '智能助手'
          }
        }
      ],
      pluginBlocks: []
    });
  }

  addBlock() {
    this.editorComponent?.addBlock();
  }

  addPluginBlock(item: PluginBlock) {
    this.editorComponent?.addPluginBlock(item);
    this.editorComponent?.closePopup();
  }

  addVariableBlock(name: string) {
    this.editorComponent?.addVariableBlock(name);
    this.editorComponent?.closePopup();
  }

  saveTemplate() {
    const data = this.tryParseEditorModel() ?? this.editorComponent?.getData();
    const name = window.prompt('请输入模板名称：', `模板${this.templates.length + 1}`);
    if (name && data) {
      this.templates.push({ name, data });
      this.currentTemplateName = name;
      localStorage.setItem(this.TEMPLATE_STORAGE_KEY, JSON.stringify(this.templates));
    }
  }

  loadTemplate(template: { name: string; data: any }) {
    this.currentTemplateName = template.name;
    this.editorModel = JSON.stringify(template.data);
  }

  private tryParseEditorModel() {
    if (!this.editorModel) return null;
    try {
      return JSON.parse(this.editorModel);
    } catch {
      return null;
    }
  }
}
