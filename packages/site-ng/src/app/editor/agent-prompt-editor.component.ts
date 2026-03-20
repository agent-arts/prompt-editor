import { Component, ElementRef, OnInit, ViewChild, OnDestroy, ViewEncapsulation, HostListener, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CustomEditor } from '@agent-arts/editor';
import type { CustomEditorOptions, EditorBlock, PluginBlock } from '@agent-arts/editor';

class LocalEditBlockController {
  public editingBlock: EditorBlock = { id: '', placeholder: '', presetText: '' };

  constructor(private callbacks: { onShow: (block: EditorBlock, style: { top: string, left: string }) => void; onHide: () => void }) {}

  public show(block: EditorBlock, rect: DOMRect, editorRect: DOMRect) {
    this.editingBlock = { ...block };
    const style = {
      top: `${rect.bottom - editorRect.top + 10}px`,
      left: `${rect.left - editorRect.left}px`
    };
    this.callbacks.onShow(this.editingBlock, style);
  }

  public hide() {
    this.callbacks.onHide();
  }

  public updateEditingBlock(block: Partial<EditorBlock>) {
    this.editingBlock = { ...this.editingBlock, ...block };
  }
}

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

    const fullResponse = `你是一个资深的旅游向导，丰富的在地经验，擅长结合用户需求定制专属旅行方案，曾帮助1000+人解决旅行难题，被旅行者亲切称为"旅行百事通"。\n\n## 核心性格与风格\n- **性格特点**：热情开朗、专业耐心，擅长用轻松幽默的方式化解旅行焦虑（如："别慌！机票改签我有3个小窍门，保准帮你搞定~"），遇到用户疑问会像朋友般细致拆解细节（如："你担心的高原反应，我去年在西藏徒步时总结过4个缓解方法..."）。\n- **语言风格**：口语化且富有感染力，常用"宝藏地""小众玩法"等旅行圈`;

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

  public destroy() {
    this.stopResponse();
  }
}

@Component({
  selector: 'agent-prompt-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agent-prompt-editor.component.html',
  styleUrls: ['./agent-prompt-editor.component.scss'],
  encapsulation: ViewEncapsulation.None,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AgentPromptEditorComponent),
      multi: true
    }
  ]
})
export class AgentPromptEditorComponent implements OnInit, OnDestroy, ControlValueAccessor {
  @ViewChild('editorHost', { static: true }) editorHost!: ElementRef;
  private editor!: CustomEditor;
  private modelValue = '';
  private pendingModelValue: string | null = null;
  private suppressModelEmit = false;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private readonly blurListener = () => this.onTouched();

  // 弹窗状态
  showPopup = false;
  popupStyle = { top: '0px', left: '0px' };
  editingBlock: EditorBlock = { id: '', placeholder: '', presetText: '' };
  editPlugin!: LocalEditBlockController;

  // 插件弹窗状态
  showPluginPopup = false;
  pluginPopupStyle = { top: '0px', left: '0px' };
  libraryPlugin!: LocalLibraryBlockController;

  // AI 对话框状态
  showAIDialog = false;
  aiDialogStyle = { top: '0px', left: '0px' };
  aiQuestion = '';
  aiResponseText = '';
  isGenerating = false;
  aiLoading = false;
  aiFinished = false;
  aiApplyRange: { from: number, to: number } | null = null;
  private aiPlugin!: LocalAIDialogController;

  writeValue(value: string | null): void {
    this.modelValue = value ?? '';
    if (!this.editor) {
      this.pendingModelValue = this.modelValue;
      return;
    }
    this.applyModelString(this.modelValue);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(_isDisabled: boolean): void {}

  ngOnInit() {
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

    const initialData = this.parseModelString(this.modelValue);
    const options: CustomEditorOptions = {
      parent: this.editorHost.nativeElement,
      initialDoc: initialData?.content ?? '# 角色\n\n你是一个  。变量{{user_name}}。',
      initialBlocks: initialData ? [...(initialData.editorBlocks || []), ...(initialData.pluginBlocks || [])] : initialBlocks,
      onOpenPopup: (id: string, rect: DOMRect) => this.openPopup(id, rect),
      onTriggerPluginPopup: (pos: number) => this.openPluginPopup(pos),
      onHidePluginPopup: () => this.libraryPlugin?.hide(),
      onTriggerAIDialog: (pos: number) => this.openAIDialog(pos),
      onChange: (data) => this.emitModel(data),
      onBlockUpdated: (id: string, text: string) => {
        if (this.showPopup && this.editingBlock.id === id) {
          this.editingBlock.presetText = text;
        }
      }
    };

    this.editor = new CustomEditor(options);
    this.editor.view.dom.addEventListener('blur', this.blurListener, true);
    if (this.pendingModelValue !== null) {
      this.applyModelString(this.pendingModelValue);
      this.pendingModelValue = null;
    }

    this.aiPlugin = new LocalAIDialogController({
      onStream: (text: string) => this.aiResponseText = text,
      onLoading: (loading: boolean) => this.aiLoading = loading,
      onComplete: () => {
        this.isGenerating = false;
        this.aiFinished = true;
      },
      onStop: () => {
        this.isGenerating = false;
        this.aiFinished = true;
      },
      onShow: (pos: number, style: { top: string, left: string }) => {
        this.aiDialogStyle = style;
        this.aiQuestion = '';
        this.aiResponseText = '';
        this.aiFinished = false;
        this.showAIDialog = true;
      },
      onHide: () => {
        this.showAIDialog = false;
        this.isGenerating = false;
        this.aiFinished = false;
        this.aiResponseText = '';
        this.aiQuestion = '';
        this.aiApplyRange = null;
      }
    });

    this.libraryPlugin = new LocalLibraryBlockController({
      onShow: (pos: number, style: { top: string, left: string }) => {
        this.pluginPopupStyle = style;
        this.showPluginPopup = true;
      },
      onHide: () => {
        this.showPluginPopup = false;
      }
    });

    this.editPlugin = new LocalEditBlockController({
      onShow: (block: EditorBlock, style: { top: string, left: string }) => {
        this.editingBlock = block;
        this.popupStyle = style;
        this.showPopup = true;
      },
      onHide: () => {
        this.showPopup = false;
      }
    });
  }

  openPopup(id: string, rect: DOMRect) {
    const block = this.editor.getBlock(id);
    if (block) {
      const editorRect = this.editorHost.nativeElement.getBoundingClientRect();
      this.editPlugin.show(block, rect, editorRect);
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent) {
    if (this.showPopup || this.showPluginPopup || (this.showAIDialog && !this.isGenerating)) {
      this.closePopup();
    }
  }

  openAIDialog(pos: number) {
    const coords = this.editor.coordsAtPos(pos);
    if (coords) {
      const editorRect = this.editorHost.nativeElement.getBoundingClientRect();
      const view = this.editor.view;
      const sel = view.state.selection.main;
      if (!sel.empty) {
        this.aiApplyRange = { from: sel.from, to: sel.to };
      } else {
        const insertedChar = view.state.doc.sliceString(pos, Math.min(pos + 1, view.state.doc.length));
        if (insertedChar === '/') {
          this.aiApplyRange = { from: pos, to: pos + 1 };
        } else {
          this.aiApplyRange = { from: pos, to: pos };
        }
      }
      this.aiPlugin.show(pos, coords, editorRect);
    }
  }

  sendAIQuestion() {
    if (!this.aiQuestion || this.isGenerating) return;

    this.isGenerating = true;
    this.aiFinished = false;
    this.aiPlugin.sendQuestion(this.aiQuestion);
  }

  stopAIResponse() {
    this.aiPlugin.stopResponse();
  }

  cancelAIResult() {
    this.aiPlugin.hide();
  }

  insertAIResult() {
    const view = this.editor.view;
    const text = this.aiResponseText;
    const range = this.aiApplyRange;
    if (!text || !range) return;

    view.dispatch({
      changes: { from: range.from, to: range.to, insert: text },
      selection: { anchor: range.from + text.length }
    });
    view.focus();
    this.aiPlugin.hide();
  }

  openPluginPopup(pos: number) {
    const coords = this.editor.coordsAtPos(pos);
    if (coords) {
      const editorRect = this.editorHost.nativeElement.getBoundingClientRect();
      this.libraryPlugin.show(pos, coords, editorRect);
    }
  }

  addPluginBlock(item: PluginBlock) {
    this.editor.addPluginBlock(this.libraryPlugin.getTriggerPos(), item);
    this.closePopup();
  }

  addVariableBlock(name: string) {
    this.editor.addVariableBlock(this.libraryPlugin.getTriggerPos(), name);
    this.closePopup();
  }

  addBlock() {
    this.editor.addBlock();
  }

  getData() {
    return this.editor.getData();
  }

  recreateEditor(templateData: { content: string; editorBlocks: any[]; pluginBlocks: any[] }) {
    if (this.editor) {
      this.editor.view.dom.removeEventListener('blur', this.blurListener, true);
      this.editor.destroy();
    }

    const initialBlocks = [...(templateData.editorBlocks || []), ...(templateData.pluginBlocks || [])];

    const options: CustomEditorOptions = {
      parent: this.editorHost.nativeElement,
      initialDoc: templateData.content,
      initialBlocks,
      onOpenPopup: (id: string, rect: DOMRect) => this.openPopup(id, rect),
      onTriggerPluginPopup: (pos: number) => this.openPluginPopup(pos),
      onHidePluginPopup: () => this.libraryPlugin?.hide(),
      onTriggerAIDialog: (pos: number) => this.openAIDialog(pos),
      onChange: (data) => this.emitModel(data),
      onBlockUpdated: (id: string, text: string) => {
        if (this.showPopup && this.editingBlock.id === id) {
          this.editingBlock.presetText = text;
        }
      }
    };

    this.editor = new CustomEditor(options);
    this.editor.view.dom.addEventListener('blur', this.blurListener, true);
  }

  private applyModelString(value: string) {
    const data = this.parseModelString(value);
    if (!data) return;
    this.suppressModelEmit = true;
    this.recreateEditor(data);
    this.suppressModelEmit = false;
  }

  private emitModel(data: any) {
    if (this.suppressModelEmit) return;
    const model = JSON.stringify({
      content: data.content,
      editorBlocks: data.editorBlocks,
      pluginBlocks: data.pluginBlocks,
    });
    this.modelValue = model;
    this.onChange(model);
  }

  private parseModelString(value: string): { content: string; editorBlocks: any[]; pluginBlocks: any[] } | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object') return null;
      if (typeof parsed.content !== 'string') return null;
      return {
        content: parsed.content,
        editorBlocks: Array.isArray(parsed.editorBlocks) ? parsed.editorBlocks : [],
        pluginBlocks: Array.isArray(parsed.pluginBlocks) ? parsed.pluginBlocks : [],
      };
    } catch {
      return null;
    }
  }

  syncBlock() {
    if (this.editingBlock.id) {
      this.editPlugin.updateEditingBlock(this.editingBlock);
      this.editor.syncBlock(this.editingBlock);
    }
  }

  closePopup() {
    this.editPlugin.hide();
    this.libraryPlugin.hide();
    this.aiPlugin.hide();
  }

  ngOnDestroy() {
    if (this.editor) {
      this.editor.view.dom.removeEventListener('blur', this.blurListener, true);
      this.editor.destroy();
    }
    if (this.aiPlugin) {
      this.aiPlugin.destroy();
    }
  }
}
