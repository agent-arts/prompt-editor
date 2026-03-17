import { EditorState, StateField, StateEffect, Facet, Text } from '@codemirror/state';
import { EditorView, keymap, Decoration, DecorationSet, WidgetType, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';

// 模拟 Coze 的块数据结构
export interface EditorBlock {
  id: string;
  placeholder: string; // 空白引导
  presetText: string;  // 预设文本
}

export interface CodeMirrorCallbacks {
  updateBlockText: (id: string, text: string) => void;
  openPopup: (id: string, rect: DOMRect) => void;
  deleteBlock: (id: string) => void;
}

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
        update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
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
      id: Math.random().toString(36).substr(2, 9),
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
    return getEditorData(this.view, this.allBlocks);
  }

  public destroy() {
    this.view.destroy();
  }
}

// 定义用于在文档中添加和删除块的状态效果
export const addBlockEffect = StateEffect.define<EditorBlock>();
export const updateBlockEffect = StateEffect.define<EditorBlock>();
export const addPluginBlockEffect = StateEffect.define<{ pos: number, block: PluginBlock }>();

export interface PluginBlock {
  id: string;
  name: string;
  type: 'plugin' | 'workflow';
}

// 自定义 Widget
class BlockWidget extends WidgetType {
  constructor(public block: EditorBlock, private callbacks: CodeMirrorCallbacks) {
    super();
  }

  override toDOM(view: EditorView) {
    const span = document.createElement('span');
    span.className = 'cm-inline-block';
    span.setAttribute('data-block-id', this.block.id);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'block-input';
    input.value = this.block.presetText || '';
    input.placeholder = this.block.placeholder || '请输入...';
    
    // 设置 input 宽度自适应
    const measureWidth = (val: string) => {
      const temp = document.createElement('span');
      temp.style.visibility = 'hidden';
      temp.style.position = 'absolute';
      temp.style.whiteSpace = 'pre';
      temp.style.font = 'inherit';
      temp.textContent = val || input.placeholder;
      document.body.appendChild(temp);
      const width = temp.offsetWidth;
      document.body.removeChild(temp);
      return width + 10;
    };
    
    input.style.width = `${measureWidth(input.value)}px`;

    input.oninput = (e) => {
      const val = (e.target as HTMLInputElement).value;
      input.style.width = `${measureWidth(val)}px`;
      this.callbacks.updateBlockText(this.block.id, val);
    };

    // 重点：当 input 获焦或点击时，触发弹窗展示
    input.onfocus = (e) => {
      const rect = span.getBoundingClientRect();
      this.callbacks.openPopup(this.block.id, rect);
    };

    input.onmousedown = (e) => {
      e.stopPropagation();
    };

    input.onclick = (e) => {
      e.stopPropagation();
      const rect = span.getBoundingClientRect();
      this.callbacks.openPopup(this.block.id, rect);
    };

    input.onkeydown = (e) => {
      if (e.key === 'Backspace' && input.value === '') {
        e.preventDefault();
        // Find the position of this block and remove it
        let pos: number | null = null;
        view.state.field(blockField).between(0, view.state.doc.length, (from, to, value) => {
          if (value.spec.widget === this) {
            pos = from;
          }
        });

        if (pos !== null) {
          this.callbacks.deleteBlock(this.block.id);
          view.dispatch({
            changes: { from: pos, to: pos + 1 },
            selection: { anchor: pos }
          });
        }
      }
    };

    span.appendChild(input);
    return span;
  }

  override ignoreEvent(event: Event) {
    return true;
  }
}

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

  override ignoreEvent(event: Event) {
    return true;
  }
}

const callbacksFacet = Facet.define<CodeMirrorCallbacks, CodeMirrorCallbacks>({
  combine: values => values[0]
});

const initialBlocksFacet = Facet.define<{ pos: number, len?: number, block: EditorBlock | PluginBlock }[], { pos: number, len?: number, block: EditorBlock | PluginBlock }[]>({
  combine: values => values.length ? values[0] : []
});

// 状态字段：管理文档中的所有块装饰器
export const blockField = StateField.define<DecorationSet>({
  create(state) {
    const callbacks = state.facet(callbacksFacet);
    const initialBlocks = state.facet(initialBlocksFacet);
    if (!initialBlocks || initialBlocks.length === 0) return Decoration.none;
    
    const deco = initialBlocks
      .slice()
      .sort((a, b) => a.pos - b.pos)
      .map(({ pos, len, block }) => {
        let widget;
        // 判断是插件块还是编辑块
        if ('type' in block && ('name' in block)) {
          widget = new PluginWidget(block as PluginBlock);
        } else {
          widget = new BlockWidget(block as EditorBlock, callbacks);
        }
        return Decoration.replace({ widget }).range(pos, pos + (len || 1));
      });
    return Decoration.set(deco, true);
  },
  update(decorations, tr) {
    const callbacks = tr.state.facet(callbacksFacet);
    decorations = decorations.map(tr.changes);
    
    for (let e of tr.effects) {
      if (e.is(addBlockEffect)) {
        // 使用 selection 获取当前插入点
        const pos = tr.state.selection.main.head - 1;
        const blockDecoration = Decoration.replace({
          widget: new BlockWidget(e.value, callbacks),
        }).range(pos, pos + 1);
        decorations = decorations.update({ add: [blockDecoration] });
      } else if (e.is(updateBlockEffect)) {
        const newBlock = e.value;
        let pos: number | null = null;
        decorations.between(0, tr.state.doc.length, (from, to, value) => {
          const widget = value.spec.widget;
          if (widget instanceof BlockWidget && widget.block.id === newBlock.id) {
            pos = from;
          }
        });
        
        if (pos !== null) {
          decorations = decorations.update({
            filter: (from, to, value) => {
              const widget = value.spec.widget;
              return !(widget instanceof BlockWidget && widget.block.id === newBlock.id);
            },
            add: [Decoration.replace({
              widget: new BlockWidget(newBlock, callbacks),
            }).range(pos, pos + 1)]
          });
        }
      } else if (e.is(addPluginBlockEffect)) {
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

// Helper function to handle backspace on blocks
const deleteBlock = (view: EditorView, callbacks: CodeMirrorCallbacks) => {
  const { from: selFrom, to: selTo, empty } = view.state.selection.main;
  if (!empty) return false;

  const pos = selFrom;
  if (pos === 0) return false;

  let blockId: string | null = null;
  let blockPos: number | null = null;
  let blockLen: number = 1;

  // Check if there is a block just before the cursor
  const field = view.state.field(blockField, false);
  if (field) {
    field.between(pos - 1, pos, (from, to, value) => {
      const widget = value.spec.widget;
      // 必须是正好在光标左侧（或覆盖光标位置）的块
      if (widget && widget.block && widget.block.id && from < pos && to >= pos) {
        blockId = widget.block.id;
        blockPos = from;
        blockLen = to - from;
        return false; // 找到一个就停止
      }
    });
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
  '.cm-inline-block': {
    display: 'inline-block',
    backgroundColor: '#f3f0ff',
    color: '#8066ff',
    padding: '0 8px',
    margin: '0 4px',
    borderRadius: '4px',
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'all 0.2s',
    fontSize: '15px',
    verticalAlign: 'middle'
  },
  '.cm-inline-block:hover': {
    backgroundColor: '#e9e4ff',
    borderColor: '#8066ff'
  },
  '.block-input': {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'inherit',
    font: 'inherit',
    padding: '4px 0',
    width: 'auto',
    minWidth: '20px',
    textAlign: 'center'
  },
  '.block-input::placeholder': {
    color: '#b2a1ff',
    opacity: 0.7
  },
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

export function createEditorState(initialDoc: string, callbacks: CodeMirrorCallbacks, initialBlocks: { pos: number, len?: number, block: EditorBlock | PluginBlock }[] = []) {
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
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    callbacksFacet.of(callbacks),
    initialBlocksFacet.of(initialBlocks),
    blockField,
    markdownStyleField,
    editorTheme
  ];

  const state = EditorState.create({
    doc: initialDoc,
    extensions
  });

  // If there are initial blocks, we need to add them to the field.
  // This is tricky with StateField.create. 
  // Let's instead use a transaction if possible, or just handle them in create().
  
  return state;
}

export function createEditorView(parent: HTMLElement, state: EditorState) {
  return new EditorView({
    state,
    parent
  });
}

export function getEditorData(view: EditorView) {
  const content = view.state.doc.toString();
  const editorBlocks: { pos: number, len?: number, block: EditorBlock }[] = [];
  const pluginBlocks: { pos: number, len?: number, block: PluginBlock }[] = [];

  view.state.field(blockField).between(0, view.state.doc.length, (from, to, value) => {
    const widget = value.spec.widget;
    if (widget instanceof BlockWidget) {
      editorBlocks.push({ pos: from, len: to - from, block: widget.block });
    } else if (widget instanceof PluginWidget) {
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
