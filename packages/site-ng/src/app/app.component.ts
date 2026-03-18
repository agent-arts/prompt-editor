import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { EditorComponent } from './editor/editor.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, EditorComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements AfterViewInit {
  @ViewChild(EditorComponent) editorComponent?: EditorComponent;

  templates: { name: string; data: any }[] = [];
  currentTemplateName = '';

  private readonly TEMPLATE_STORAGE_KEY = 'editor-templates';

  ngAfterViewInit() {
    const savedTemplates = localStorage.getItem(this.TEMPLATE_STORAGE_KEY);
    if (savedTemplates) {
      this.templates = JSON.parse(savedTemplates);
      if (this.templates.length > 0) {
        this.loadTemplate(this.templates[0]);
      }
    }
  }

  addBlock() {
    this.editorComponent?.addBlock();
  }

  saveTemplate() {
    const data = this.editorComponent?.getData();
    const name = window.prompt('请输入模板名称：', `模板${this.templates.length + 1}`);
    if (name && data) {
      this.templates.push({ name, data });
      this.currentTemplateName = name;
      localStorage.setItem(this.TEMPLATE_STORAGE_KEY, JSON.stringify(this.templates));
    }
  }

  loadTemplate(template: { name: string; data: any }) {
    this.currentTemplateName = template.name;
    this.editorComponent?.recreateEditor(template.data);
  }
}
