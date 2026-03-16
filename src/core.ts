import { EditorState, StateField, StateEffect, Facet } from '@codemirror/state';
import { EditorView, keymap, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
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
  initialBlocks?: { pos: number, block: EditorBlock }[];
  onOpenPopup: (id: string, rect: DOMRect) => void;
  onBlockDeleted?: (id: string) => void;
  onBlockUpdated?: (id: string, text: string) => void;
}

export class CustomEditor {
  public view: EditorView;
  public allBlocks: Map<string, EditorBlock> = new Map();
  private options: CustomEditorOptions;

  constructor(options: CustomEditorOptions) {
    this.options = options;

    if (options.initialBlocks) {
      options.initialBlocks.forEach(item => this.allBlocks.set(item.block.id, item.block));
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

    const state = createEditorState(options.initialDoc, callbacks, options.initialBlocks || []);
    this.view = new EditorView({
      state,
      parent: options.parent
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

  public syncBlock(updatedBlock: EditorBlock) {
    this.allBlocks.set(updatedBlock.id, { ...updatedBlock });
    this.view.dispatch({
      effects: updateBlockEffect.of(updatedBlock)
    });
  }

  public getBlock(id: string) {
    return this.allBlocks.get(id);
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
    // 返回 true 表示让浏览器处理这些事件（例如 input 的打字、点击、获焦等）
    // 这样 input 元素本身就能正常工作，而不会被 CodeMirror 拦截
    return true;
  }
}

const callbacksFacet = Facet.define<CodeMirrorCallbacks, CodeMirrorCallbacks>({
  combine: values => values[0]
});

const initialBlocksFacet = Facet.define<{ pos: number, block: EditorBlock }[], { pos: number, block: EditorBlock }[]>({
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
      .map(({ pos, block }) => {
        return Decoration.replace({
          widget: new BlockWidget(block, callbacks),
        }).range(pos, pos + 1);
      });
    return Decoration.set(deco, true);
  },
  update(decorations, tr) {
    const callbacks = tr.state.facet(callbacksFacet);
    decorations = decorations.map(tr.changes);
    
    for (let e of tr.effects) {
      if (e.is(addBlockEffect)) {
        const pos = tr.state.selection.main.head - 1; // Position of the inserted space
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
      }
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f)
});

// Helper function to handle backspace on blocks
const deleteBlock = (view: EditorView, callbacks: CodeMirrorCallbacks) => {
  const pos = view.state.selection.main.head;
  if (pos === 0) return false;

  let blockId: string | null = null;
  let blockPos: number | null = null;

  // Check if there is a block just before the cursor
  const field = view.state.field(blockField, false);
  if (field) {
    field.between(pos - 1, pos, (from, to, value) => {
      const widget = value.spec.widget;
      if (widget instanceof BlockWidget) {
        blockId = widget.block.id;
        blockPos = from;
      }
    });
  }

  if (blockId && blockPos !== null) {
    // Notify component
    callbacks.deleteBlock(blockId);
    // Remove the character from doc (this will also remove the decoration)
    view.dispatch({
      changes: { from: blockPos, to: blockPos + 1 },
      selection: { anchor: blockPos }
    });
    return true;
  }
  return false;
};

export const editorTheme = EditorView.theme({
  '&': { height: '100%', outline: 'none' },
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
  '.cm-header-1': { fontSize: '1.5em', color: '#008c99', fontWeight: 'bold' }
});

export function createEditorState(initialDoc: string, callbacks: CodeMirrorCallbacks, initialBlocks: { pos: number, block: EditorBlock }[] = []) {
  const extensions = [
    history(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      {
        key: 'Backspace',
        run: (view) => deleteBlock(view, callbacks)
      }
    ]),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    callbacksFacet.of(callbacks),
    initialBlocksFacet.of(initialBlocks),
    blockField,
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

export function getEditorData(view: EditorView, blocks: Map<string, EditorBlock>) {
  const content = view.state.doc.toString();
  const blockList = Array.from(blocks.values());
  
  return {
    json: {
      content,
      blocks: blockList
    },
    html: view.dom.querySelector('.cm-content')?.innerHTML || ''
  };
}
