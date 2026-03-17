import { Component, ElementRef, OnInit, ViewChild, OnDestroy, ViewEncapsulation, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditorView } from '@codemirror/view';
import {
  EditorBlock,
  CustomEditor,
  CustomEditorOptions,
  AIDialogPlugin,
  EditBlockPlugin,
  LibraryBlockPlugin,
} from '@agent-arts/editor';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class EditorComponent implements OnInit, OnDestroy {
  @ViewChild('editorHost', { static: true }) editorHost!: ElementRef;
  private editor!: CustomEditor;

  // 弹窗状态
  showPopup = false;
  popupStyle = { top: '0px', left: '0px' };
  editingBlock: EditorBlock = { id: '', placeholder: '', presetText: '' };
  editPlugin!: EditBlockPlugin;

  // 插件弹窗状态
  showPluginPopup = false;
  pluginPopupStyle = { top: '0px', left: '0px' };
  libraryPlugin!: LibraryBlockPlugin;

  // AI 对话框状态
  showAIDialog = false;
  aiDialogStyle = { top: '0px', left: '0px' };
  aiQuestion = '';
  aiResponseText = '';
  isGenerating = false;
  aiLoading = false;
  private aiPlugin!: AIDialogPlugin;

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

    const options: CustomEditorOptions = {
      parent: this.editorHost.nativeElement,
      initialDoc: '# 角色\n\n你是一个  ',
      initialBlocks,
      onOpenPopup: (id, rect) => this.openPopup(id, rect),
      onTriggerPluginPopup: (pos) => this.openPluginPopup(pos),
      onTriggerAIDialog: (pos) => this.openAIDialog(pos),
      onBlockUpdated: (id, text) => {
        if (this.showPopup && this.editingBlock.id === id) {
          this.editingBlock.presetText = text;
        }
      }
    };

    this.editor = new CustomEditor(options);

    this.aiPlugin = new AIDialogPlugin({
      onStream: (text: string) => this.aiResponseText = text,
      onLoading: (loading: boolean) => this.aiLoading = loading,
      onComplete: () => this.isGenerating = false,
      onStop: () => this.isGenerating = false,
      onShow: (pos: number, style: { top: string, left: string }) => {
        this.aiDialogStyle = style;
        this.aiQuestion = '';
        this.aiResponseText = '';
        this.showAIDialog = true;
      },
      onHide: () => {
        this.showAIDialog = false;
        this.isGenerating = false;
      }
    });

    this.libraryPlugin = new LibraryBlockPlugin({
      onShow: (pos: number, style: { top: string, left: string }) => {
        this.pluginPopupStyle = style;
        this.showPluginPopup = true;
      },
      onHide: () => {
        this.showPluginPopup = false;
      }
    });

    this.editPlugin = new EditBlockPlugin({
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
      this.aiPlugin.show(pos, coords, editorRect);
    }
  }

  sendAIQuestion() {
    if (!this.aiQuestion || this.isGenerating) return;

    this.isGenerating = true;
    this.aiPlugin.sendQuestion(this.aiQuestion);
  }

  stopAIResponse() {
    this.aiPlugin.stopResponse();
  }

  openPluginPopup(pos: number) {
    const coords = this.editor.coordsAtPos(pos);
    if (coords) {
      const editorRect = this.editorHost.nativeElement.getBoundingClientRect();
      this.libraryPlugin.show(pos, coords, editorRect);
    }
  }

  addPluginBlock(item: { id: string, name: string, type: 'plugin' | 'workflow' }) {
    this.editor.addPluginBlock(this.libraryPlugin.getTriggerPos(), item);
    this.closePopup();
  }

  addBlock() {
    this.editor.addBlock();
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

  onConfirm() {
    const data = this.editor.getData();
    console.log('--- Editor Data (JSON) ---');
    console.log(JSON.stringify(data.json, null, 2));
    console.log('--- Editor Data (HTML) ---');
    console.log(data.html);
  }

  ngOnDestroy() {
    if (this.editor) {
      this.editor.destroy();
    }
    if (this.aiPlugin) {
      this.aiPlugin.destroy();
    }
  }
}
