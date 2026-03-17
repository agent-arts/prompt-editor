import { EditorState, StateField, StateEffect, Facet, Text } from '@codemirror/state';
import { EditorView, keymap, Decoration, DecorationSet, WidgetType, ViewPlugin, ViewUpdate, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  addBlockEffect,
  editBlockExtensions,
  editBlockField,
  getEditorBlocks,
  updateBlockEffect,
  type CodeMirrorCallbacks,
  type EditorBlock,
} from './plugins/edit-block';

export interface CustomEditorOptions {
  parent: HTMLElement;
  initialDoc: string;
  initialBlocks?: { pos: number, len?: number, block: EditorBlock | PluginBlock }[];
  onOpenPopup: (id: string, rect: DOMRect) => void;
  onTriggerPluginPopup: (pos: number) => void;
  onTriggerAIDialog: (pos: number) => void;
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
    const combinedInitialBlocks = [
      ...(options.initialBlocks || []),
      ...parsedBlocks
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
    
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        update.changes.iterChanges((fromA, _toA, _fromB, _toB, inserted) => {
          const char = inserted.sliceString(0);
          if (inserted.length === 1) {
            if (char === '{') {
              this.options.onTriggerPluginPopup(fromA);
            } else if (char === '/') {
              this.options.onTriggerAIDialog(fromA);
            }
          }
        });
      }
    });

    this.view = new EditorView({
      state: state.update({
        effects: StateEffect.appendConfig.of([
          updateListener,
          selectionAIDialogTriggerExtension((pos) => this.options.onTriggerAIDialog(pos))
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

  public getData() {
    return getEditorData(this.view);
  }

  public destroy() {
    this.view.destroy();
  }
}

// 定义用于在文档中添加和删除块的状态效果
export const addPluginBlockEffect = StateEffect.define<{ pos: number, block: PluginBlock }>();

export interface PluginBlock {
  id: string;
  name: string;
  type: 'plugin' | 'workflow';
}

// 自定义 Widget
class PluginWidget extends WidgetType {
  constructor(public block: PluginBlock) {
    super();
  }

  override toDOM() {
    const span = document.createElement('span');
    span.className = `cm-plugin-block cm-plugin-block-${this.block.type}`;
    span.setAttribute('data-block-id', this.block.id);

    const icon = document.createElement('i');
    icon.className = this.block.type === 'plugin' ? 'icon-plugin' : 'icon-workflow';
    span.appendChild(icon);

    const text = document.createTextNode(this.block.name);
    span.appendChild(text);

    return span;
  }

  override ignoreEvent() {
    return true;
  }
}

const initialPluginBlocksFacet = Facet.define<{ pos: number, len?: number, block: PluginBlock }[], { pos: number, len?: number, block: PluginBlock }[]>({
  combine: values => values.length ? values[0] : []
});

const pluginBlockField = StateField.define<DecorationSet>({
  create(state) {
    const initialBlocks = state.facet(initialPluginBlocksFacet);
    if (!initialBlocks || initialBlocks.length === 0) return Decoration.none;

    const deco = initialBlocks
      .slice()
      .sort((a, b) => a.pos - b.pos)
      .map(({ pos, len, block }) => {
        return Decoration.replace({ widget: new PluginWidget(block) }).range(pos, pos + (len || 1));
      });
    return Decoration.set(deco, true);
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    
    for (let e of tr.effects) {
      if (e.is(addPluginBlockEffect)) {
        const { pos: originalPos, block } = e.value;
        // 映射原始位置到当前文档位置
        const pos = tr.changes.mapPos(originalPos);
        const pluginDecoration = Decoration.replace({
          widget: new PluginWidget(block),
        }).range(pos, pos + 1);
        decorations = decorations.update({ add: [pluginDecoration] });
      }
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f)
});

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
    if (!field) return;
    field.between(pos - 1, pos, (from, to, value) => {
      const widget = value.spec.widget as any;
      if (widget && widget.block && widget.block.id && from < pos && to >= pos) {
        blockId = widget.block.id;
        blockPos = from;
        blockLen = to - from;
        return false;
      }
    });
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

export const editorTheme = EditorView.theme({
  '&': { height: '100%', outline: 'none', position: 'relative' },
  '.cm-content': { padding: '20px', fontSize: '16px' },
  '.cm-line': { padding: '4px 0' },
  '.cm-header-1': { fontSize: '1.5em', color: '#008c99', fontWeight: 'bold' },
  '.cm-bold': { fontWeight: 'bold' },
  '.cm-ai-selection-trigger': {
    position: 'absolute',
    zIndex: '10',
    display: 'none',
    width: '32px',
    height: '32px',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    backgroundColor: '#fff',
    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12)',
    border: '1px solid rgba(0, 0, 0, 0.06)'
  },
  '.cm-ai-selection-trigger button': {
    width: '100%',
    height: '100%',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0'
  },
  '.cm-ai-selection-trigger button:hover': {
    backgroundColor: '#f3f4f6',
    borderRadius: '8px'
  }
});

function selectionAIDialogTriggerExtension(onTriggerAIDialog: (pos: number) => void) {
  return ViewPlugin.fromClass(class {
    private dom: HTMLDivElement;
    private button: HTMLButtonElement;
    private lastFrom = -1;
    private lastTo = -1;
    private measureScheduled = false;

    constructor(private view: EditorView) {
      this.dom = document.createElement('div');
      this.dom.className = 'cm-ai-selection-trigger';

      this.button = document.createElement('button');
      this.button.type = 'button';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', '#111827');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.innerHTML = '<path d="M5 12l1.5.5L7 14l.5-1.5L9 12l-1.5-.5L7 10l-.5 1.5L5 12z"/><path d="M12 4l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"/>';
      this.button.appendChild(svg);
      this.dom.appendChild(this.button);
      this.view.dom.appendChild(this.dom);

      this.dom.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      this.button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const { from, empty } = this.view.state.selection.main;
        if (!empty) {
          onTriggerAIDialog(from);
          this.hide();
        }
      });

      this.scheduleMeasure(true);
    }

    update(update: ViewUpdate) {
      if (update.selectionSet || update.viewportChanged || update.focusChanged || update.docChanged) {
        this.scheduleMeasure(false);
      }
    }

    destroy() {
      this.dom.remove();
    }

    private hide() {
      this.dom.style.display = 'none';
    }

    private show() {
      this.dom.style.display = 'flex';
    }

    private scheduleMeasure(force: boolean) {
      const { from, to, empty } = this.view.state.selection.main;
      if (empty || !this.view.hasFocus) {
        this.hide();
        return;
      }

      if (!force && from === this.lastFrom && to === this.lastTo && this.dom.style.display !== 'none') {
        return;
      }

      this.lastFrom = from;
      this.lastTo = to;

      if (this.measureScheduled) return;
      this.measureScheduled = true;

      this.view.requestMeasure({
        read: (view) => {
          const coords = view.coordsAtPos(from);
          if (!coords) return null;
          const editorRect = view.dom.getBoundingClientRect();
          return { coords, editorRect };
        },
        write: (value) => {
          this.measureScheduled = false;

          const { empty: isEmpty } = this.view.state.selection.main;
          if (isEmpty || !this.view.hasFocus) {
            this.hide();
            return;
          }

          if (!value) {
            this.hide();
            return;
          }

          const { coords, editorRect } = value;
          const width = 32;
          const height = 32;

          const margin = 6;
          const left = Math.min(
            Math.max(coords.left - editorRect.left, margin),
            Math.max(margin, editorRect.width - width - margin)
          );
          const top = Math.max(coords.top - editorRect.top - height - 10, margin);

          this.dom.style.left = `${left}px`;
          this.dom.style.top = `${top}px`;
          this.show();
        }
      });
    }
  });
}

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

export const markdownStyleField = StateField.define<DecorationSet>({
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
export function createEditorState(initialDoc: string, callbacks: CodeMirrorCallbacks, initialBlocks: { pos: number, len?: number, block: EditorBlock | PluginBlock }[] = []) {
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
    initialPluginBlocksFacet.of(pluginBlocks),
    pluginBlockField,
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
export function getEditorData(view: EditorView) {
  const content = view.state.doc.toString();
  const editorBlocks = getEditorBlocks(view);
  const pluginBlocks: { pos: number, len?: number, block: PluginBlock }[] = [];

  view.state.field(pluginBlockField).between(0, view.state.doc.length, (from, to, value) => {
    const widget = value.spec.widget;
    if (widget instanceof PluginWidget) {
      pluginBlocks.push({ pos: from, len: to - from, block: widget.block });
    }
  });

  return {
    content,
    editorBlocks,
    pluginBlocks,
    html: view.dom.querySelector('.cm-content')?.innerHTML || ''
  };
}

/**
 * 解析文档中的历史变量块 {{xxx}}
 */
export function parseTemplateVariables(doc: string) {
  const blocks: { pos: number, len: number, block: PluginBlock }[] = [];
  const regex = /\{\{(.+?)\}\}/g;
  let match;

  while ((match = regex.exec(doc)) !== null) {
    blocks.push({
      pos: match.index,
      len: match[0].length,
      block: {
        id: `var-${match[1]}-${match.index}`,
        name: match[1],
        type: 'plugin'
      }
    });
  }
  return blocks;
}
