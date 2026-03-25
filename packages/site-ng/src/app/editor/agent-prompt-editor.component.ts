import { Component, ElementRef, OnInit, ViewChild, OnDestroy, ViewEncapsulation, HostListener, forwardRef, ChangeDetectorRef, ContentChild, TemplateRef, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CustomEditor } from '@agent-arts/editor';
import type { CustomEditorOptions, EditorBlock, PluginBlock } from '@agent-arts/editor';
import { LocalAIDialogController, LocalEditBlockController, LocalLibraryBlockController } from './agent-prompt-editor.models';

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
  @ContentChild('editPopup', { read: TemplateRef }) editPopupTpl?: TemplateRef<any>;
  @ContentChild('pluginPopup', { read: TemplateRef }) pluginPopupTpl?: TemplateRef<any>;
  @ContentChild('aiDialog', { read: TemplateRef }) aiDialogTpl?: TemplateRef<any>;

  @ViewChild('editorHost', { static: true }) editorHost!: ElementRef;
  @Input() readonly = false;
  @Input() placeholder: string | undefined;
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

  constructor(private cdr: ChangeDetectorRef) {}

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
    const initialContent = this.parseModelString(this.modelValue);
    const options: CustomEditorOptions = {
      parent: this.editorHost.nativeElement,
      initialDoc: initialContent ?? '',
      readonly: this.readonly,
      placeholder: this.placeholder,
      onOpenPopup: (id: string, rect: DOMRect) => this.openPopup(id, rect),
      onTriggerPluginPopup: (pos: number) => this.openPluginPopup(pos),
      onHidePluginPopup: () => this.closePopup(),
      onTriggerAIDialog: (pos: number) => this.openAIDialog(pos),
      onHideAIDialog: () => {
        if (!this.showAIDialog) return;
        if (!this.aiApplyRange || this.aiApplyRange.to - this.aiApplyRange.from !== 1) return;
        this.aiPlugin.hide();
        this.aiApplyRange = null;
        this.cdr.detectChanges();
      },
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
      onStream: (text: string) => {
        this.aiResponseText = text;
        this.cdr.detectChanges();
      },
      onLoading: (loading: boolean) => {
        this.aiLoading = loading;
        this.cdr.detectChanges();
      },
      onComplete: () => {
        this.isGenerating = false;
        this.aiFinished = true;
        this.cdr.detectChanges();
      },
      onStop: () => {
        this.isGenerating = false;
        this.aiFinished = true;
        this.cdr.detectChanges();
      },
      onShow: (pos: number, style: { top: string, left: string }) => {
        this.aiDialogStyle = style;
        this.aiQuestion = '';
        this.aiResponseText = '';
        this.aiFinished = false;
        this.showAIDialog = true;
        this.cdr.detectChanges();
      },
      onHide: () => {
        this.showAIDialog = false;
        this.isGenerating = false;
        this.aiFinished = false;
        this.aiResponseText = '';
        this.aiQuestion = '';
        this.aiApplyRange = null;
        this.cdr.detectChanges();
      }
    });

    this.libraryPlugin = new LocalLibraryBlockController({
      onShow: (pos: number, style: { top: string, left: string }) => {
        this.pluginPopupStyle = style;
        this.showPluginPopup = true;
        this.cdr.detectChanges();
      },
      onHide: () => {
        this.showPluginPopup = false;
        this.cdr.detectChanges();
      }
    });

    this.editPlugin = new LocalEditBlockController({
      onShow: (block: EditorBlock, style: { top: string, left: string }) => {
        this.editingBlock = block;
        this.popupStyle = style;
        this.showPopup = true;
        this.cdr.detectChanges();
      },
      onHide: () => {
        this.showPopup = false;
        this.cdr.detectChanges();
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

  insertAIResult(text: string) {
    const view = this.editor.view;
    // const text = this.aiResponseText;
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

  recreateEditor(content: string) {
    if (this.editor) {
      this.editor.view.dom.removeEventListener('blur', this.blurListener, true);
      this.editor.destroy();
    }

    const options: CustomEditorOptions = {
      parent: this.editorHost.nativeElement,
      initialDoc: content,
      readonly: this.readonly,
      placeholder: this.placeholder,
      onOpenPopup: (id: string, rect: DOMRect) => this.openPopup(id, rect),
      onTriggerPluginPopup: (pos: number) => this.openPluginPopup(pos),
      onHidePluginPopup: () => this.closePopup(),
      onTriggerAIDialog: (pos: number) => this.openAIDialog(pos),
      onHideAIDialog: () => {
        if (!this.showAIDialog) return;
        if (!this.aiApplyRange || this.aiApplyRange.to - this.aiApplyRange.from !== 1) return;
        this.aiPlugin.hide();
        this.aiApplyRange = null;
        this.cdr.detectChanges();
      },
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
    const content = this.parseModelString(value);
    if (content === null) return;
    this.suppressModelEmit = true;
    this.recreateEditor(content);
    this.suppressModelEmit = false;
  }

  private emitModel(content: string) {
    if (this.suppressModelEmit) return;
    this.modelValue = content;
    this.onChange(content);
  }

  private parseModelString(value: string): string | null {
    if (!value) return null;
    return value;
  }

  syncBlock() {
    if (this.editingBlock.id) {
      this.editPlugin.updateEditingBlock(this.editingBlock);
      this.editor.syncBlock(this.editingBlock);
    }
  }

  closePopup() {
    this.editPlugin?.hide();
    this.libraryPlugin?.hide();
    this.aiPlugin?.hide();
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
