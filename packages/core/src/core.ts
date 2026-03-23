import { EditorState, StateField, StateEffect, Text } from '@codemirror/state';
import { EditorView, keymap, Decoration, DecorationSet, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  addBlockEffect,
  editBlockExtensions,
  editBlockField,
  getEditorBlocks,
  updateBlockEffect,
  type CodeMirrorCallbacks,
} from './plugins/edit-block';
import { aiDialogExtensions } from './plugins/ai-dialog';
import {
  addPluginBlockEffect,
  getPluginBlocks,
  parseTemplateVariables,
  pluginBlockExtensions,
  pluginBlockField,
  pluginPopupTriggerExtensions,
} from './plugins/library-block';
import type { EditorBlock, EditorData, InitialBlock, PluginBlock } from './types';

export interface CustomEditorOptions {
  parent: HTMLElement;
  initialDoc: string;
  initialBlocks?: InitialBlock[];
  onOpenPopup: (id: string, rect: DOMRect) => void;
  onTriggerPluginPopup: (pos: number) => void;
  onHidePluginPopup?: () => void;
  onTriggerAIDialog: (pos: number) => void;
  onHideAIDialog?: () => void;
  onChange?: (data: EditorData) => void;
  onBlockDeleted?: (id: string) => void;
  onBlockUpdated?: (id: string, text: string) => void;
}

export class CustomEditor {
  public view: EditorView;
  public allBlocks: Map<string, EditorBlock> = new Map();
  private options: CustomEditorOptions;

  constructor(options: CustomEditorOptions) {
    this.options = options;

    // 解析文档中的历史变量块 {{xxx}}
    const parsedBlocks = parseTemplateVariables(options.initialDoc);
    const existingVariableRanges = new Set(
      (options.initialBlocks || [])
        .filter((b) => 'type' in (b.block as any) && (b.block as any).type === 'variable')
        .map((b) => `${b.pos}:${b.len || 1}`)
    );
    const combinedInitialBlocks = [
      ...(options.initialBlocks || []),
      ...parsedBlocks.filter((b) => !existingVariableRanges.has(`${b.pos}:${b.len || 1}`))
    ];

    if (options.initialBlocks) {
      options.initialBlocks.forEach(item => {
        if (!('type' in item.block)) {
          this.allBlocks.set((item.block as EditorBlock).id, item.block as EditorBlock);
        }
      });
    }

    const callbacks: CodeMirrorCallbacks = {
      updateBlockText: (id, text) => {
        const block = this.allBlocks.get(id);
        if (block) {
          block.presetText = text;
          this.allBlocks.set(id, block);
          if (this.options.onBlockUpdated) {
            this.options.onBlockUpdated(id, text);
          }
        }
      },
      openPopup: (id, rect) => {
        this.options.onOpenPopup(id, rect);
      },
      deleteBlock: (id) => {
        this.allBlocks.delete(id);
        if (this.options.onBlockDeleted) {
          this.options.onBlockDeleted(id);
        }
      }
    };

    const state = createEditorState(options.initialDoc, callbacks, combinedInitialBlocks);

    this.view = new EditorView({
      state: state.update({
        effects: StateEffect.appendConfig.of([
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              this.options.onChange?.(this.getData());
            }
          }),
          ...pluginPopupTriggerExtensions({
            onTriggerPluginPopup: (pos) => this.options.onTriggerPluginPopup(pos),
            onHidePluginPopup: () => this.options.onHidePluginPopup?.(),
          }),
          ...aiDialogExtensions({
            onTriggerAIDialog: (pos) => this.options.onTriggerAIDialog(pos),
            onHideAIDialog: () => this.options.onHideAIDialog?.()
          })
        ])
      }).state,
      parent: options.parent,
    });
  }

  public addBlock() {
    const newBlock: EditorBlock = {
      id: Math.random().toString(36).slice(2, 11),
      placeholder: '请输入编辑块内容为空时的提示文案',
      presetText: ''
    };
    this.allBlocks.set(newBlock.id, newBlock);
    const { from, to } = this.view.state.selection.main;
    this.view.dispatch({
      changes: { from, to, insert: ' ' },
      effects: addBlockEffect.of(newBlock),
      selection: { anchor: from + 1 }
    });
    this.view.focus();
    return newBlock;
  }

  public addPluginBlock(pos: number, block: PluginBlock) {
    this.view.dispatch({
      changes: { from: pos, to: pos + 1, insert: ' ' },
      effects: addPluginBlockEffect.of({ pos, block }),
      selection: { anchor: pos + 1 }
    });
    this.view.focus();
    return block;
  }

  public addVariableBlock(pos: number, name: string) {
    const token = `{{${name}}}`;
    const block: PluginBlock = {
      id: `var-${name}-${pos}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      type: 'variable'
    };
    this.view.dispatch({
      changes: { from: pos, to: pos + 1, insert: token },
      effects: addPluginBlockEffect.of({ pos, len: token.length, block }),
      selection: { anchor: pos + token.length }
    });
    this.view.focus();
    return block;
  }

  public syncBlock(updatedBlock: EditorBlock) {
    this.allBlocks.set(updatedBlock.id, { ...updatedBlock });
    this.view.dispatch({
      effects: updateBlockEffect.of(updatedBlock)
    });
  }

  public getBlock(id: string) {
    return this.allBlocks.get(id);
  }

  public coordsAtPos(pos: number) {
    return this.view.coordsAtPos(pos);
  }

  public getData(): EditorData {
    return getEditorData(this.view);
  }

  public destroy() {
    this.view.destroy();
  }
}

/**
 * 删除当前光标左侧的块
 */
const deleteBlock = (view: EditorView, callbacks: CodeMirrorCallbacks) => {
  const { from: selFrom, empty } = view.state.selection.main;
  if (!empty) return false;

  const pos = selFrom;
  if (pos === 0) return false;

  let blockId: string | null = null;
  let blockPos: number | null = null;
  let blockLen: number = 1;

  const scanField = (field: DecorationSet | null | undefined) => {
    if (field) {
      field.between(pos - 1, pos, (from, to, value) => {
        const widget = value.spec.widget as any;
        if (widget && widget.block && widget.block.id && from < pos && to >= pos) {
          blockId = widget.block.id;
          blockPos = from;
          blockLen = to - from;
          return false;
        }
        return false;
      });
    }
  };

  scanField(view.state.field(editBlockField, false));
  if (!blockId) {
    scanField(view.state.field(pluginBlockField, false));
  }

  if (blockId && blockPos !== null) {
    callbacks.deleteBlock(blockId);
    view.dispatch({
      changes: { from: blockPos, to: blockPos + blockLen },
      selection: { anchor: blockPos }
    });
    return true;
  }
  return false;
};

const editorTheme = EditorView.theme({
  '&': { height: '100%', outline: 'none', position: 'relative' },
  '.cm-content': { padding: '20px', fontSize: '14px' },
  '.cm-line': { padding: '4px 0' },
  '.cm-header-1': { fontSize: '1.5em', color: '#008c99', fontWeight: 'bold' },
  '.cm-bold': { fontWeight: 'bold' },
});

const boldDecoration = Decoration.mark({ class: 'cm-bold' });

function getMarkdownStyles(doc: Text) {
  const decorations: any[] = [];
  
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;

    // 标题格式（# 跟随一个空格）
    if (/^#+\s+/.test(lineText)) {
      decorations.push(boldDecoration.range(line.from, line.to));
    }

    // 加粗文本（**xxx**）
    const boldRegex = /\*\*(.*?)\*\*/g;
    let match;
    while ((match = boldRegex.exec(lineText)) !== null) {
      decorations.push(boldDecoration.range(line.from + match.index, line.from + match.index + match[0].length));
    }
  }
  
  return Decoration.set(decorations.sort((a, b) => a.from - b.from), true);
}

const markdownStyleField = StateField.define<DecorationSet>({
  create(state) {
    return getMarkdownStyles(state.doc);
  },
  update(decorations, tr) {
    if (tr.docChanged) return getMarkdownStyles(tr.state.doc);
    return decorations.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f)
});

/**
 * 创建编辑器状态
 */
function createEditorState(initialDoc: string, callbacks: CodeMirrorCallbacks, initialBlocks: { pos: number, len?: number, block: EditorBlock | PluginBlock }[] = []) {
  const editorBlocks = initialBlocks.filter((b) => !('type' in (b.block as any) && 'name' in (b.block as any))) as { pos: number, len?: number, block: EditorBlock }[];
  const pluginBlocks = initialBlocks.filter((b) => ('type' in (b.block as any) && 'name' in (b.block as any))) as { pos: number, len?: number, block: PluginBlock }[];

  const extensions = [
    history(),
    keymap.of([
      {
        key: 'Backspace',
        run: (view) => deleteBlock(view, callbacks)
      },
      ...defaultKeymap,
      ...historyKeymap
    ]),
    drawSelection(),
    ...editBlockExtensions({ callbacks, initialBlocks: editorBlocks }),
    ...pluginBlockExtensions({ initialBlocks: pluginBlocks }),
    markdownStyleField,
    editorTheme
  ];

  const state = EditorState.create({
    doc: initialDoc,
    extensions
  });

  return state;
}

/**
 * 获取编辑器数据
 */
function getEditorData(view: EditorView) {
  const content = view.state.doc.toString();
  const editorBlocks = getEditorBlocks(view);
  const pluginBlocks = getPluginBlocks(view);

  return {
    content,
    editorBlocks,
    pluginBlocks,
    html: view.dom.querySelector('.cm-content')?.innerHTML || ''
  };
}
