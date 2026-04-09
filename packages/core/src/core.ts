import { EditorState, StateField, StateEffect, Text } from '@codemirror/state';
 import { EditorView, keymap, Decoration, DecorationSet, drawSelection, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  addBlockEffect,
  addBlockAtEffect,
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
  pluginBlockExtensions,
  pluginBlockField,
  pluginPopupTriggerExtensions,
} from './plugins/library-block';
import type { EditorBlock, EditorData, InitialBlock, PluginBlock } from './types';

const BLOCK_PLACEHOLDER = '\uFFFC';

export interface CustomEditorOptions {
  parent: HTMLElement;
  initialDoc: string;
  initialBlocks?: InitialBlock[];
  readonly?: boolean;
  placeholder?: string;
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

    const { doc: initialDoc, initialBlocks: initialBlocksFromDoc } = parseEditorContentString(options.initialDoc);
    const allInitialBlocks: InitialBlock[] = [...(options.initialBlocks || []), ...initialBlocksFromDoc];

    allInitialBlocks.forEach(item => {
      if (!('type' in item.block)) {
        this.allBlocks.set((item.block as EditorBlock).id, item.block as EditorBlock);
      }
    });

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

    const state = createEditorState(initialDoc, callbacks, allInitialBlocks, !!options.readonly);

    this.view = new EditorView({
      state: state.update({
        effects: StateEffect.appendConfig.of([
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              this.options.onChange?.(this.getData());
            }
          }),
          EditorView.domEventHandlers({
            copy: (event, view) => {
              const sel = view.state.selection.main;
              if (sel.empty) return false;
              const text = serializeEditorContentSlice(view, this.allBlocks, sel.from, sel.to);
              event.preventDefault();
              event.clipboardData?.setData('text/plain', text);
              return true;
            },
            cut: (event, view) => {
              const sel = view.state.selection.main;
              if (sel.empty) return false;
              const text = serializeEditorContentSlice(view, this.allBlocks, sel.from, sel.to);
              event.preventDefault();
              event.clipboardData?.setData('text/plain', text);
              view.dispatch({
                changes: { from: sel.from, to: sel.to, insert: '' },
                selection: { anchor: sel.from }
              });
              return true;
            },
            paste: (event, view) => {
              const text = event.clipboardData?.getData('text/plain') ?? '';
              if (!text.includes('{#EditorBlock') && !text.includes('{#PluginBlock')) return false;

              const parsed = parseEditorContentString(text);
              if (!parsed.initialBlocks.length) return false;

              const sel = view.state.selection.main;
              const insertFrom = sel.from;
              const insertDoc = parsed.doc;
              event.preventDefault();
              view.dispatch({
                changes: { from: sel.from, to: sel.to, insert: insertDoc },
                selection: { anchor: insertFrom + insertDoc.length }
              });

              const effects: StateEffect<unknown>[] = [];
              for (const b of parsed.initialBlocks) {
                const pos = insertFrom + b.pos;
                if (!('type' in (b.block as any))) {
                  const block = b.block as EditorBlock;
                  this.allBlocks.set(block.id, block);
                  effects.push(addBlockAtEffect.of({ pos, len: 1, block }));
                } else {
                  effects.push(addPluginBlockEffect.of({ pos, len: 1, block: b.block as PluginBlock }));
                }
              }

              view.dispatch({ effects });
              return true;
            }
          }),
          ...pluginPopupTriggerExtensions({
            onTriggerPluginPopup: (pos) => this.options.onTriggerPluginPopup(pos),
            onHidePluginPopup: () => this.options.onHidePluginPopup?.(),
          }),
          ...aiDialogExtensions({
            onTriggerAIDialog: (pos) => this.options.onTriggerAIDialog(pos),
            onHideAIDialog: () => this.options.onHideAIDialog?.()
          }),
          ...(options.readonly ? [EditorView.editable.of(false)] : []),
          ...(options.placeholder ? [cmPlaceholder(options.placeholder)] : [])
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
      changes: { from, to, insert: BLOCK_PLACEHOLDER },
      effects: addBlockEffect.of(newBlock),
      selection: { anchor: from + 1 }
    });
    this.view.focus();
    return newBlock;
  }

  public addPluginBlock(pos: number, block: PluginBlock) {
    this.view.dispatch({
      changes: { from: pos, to: pos + 1, insert: BLOCK_PLACEHOLDER },
      effects: addPluginBlockEffect.of({ pos, block }),
      selection: { anchor: pos + 1 }
    });
    this.view.focus();
    return block;
  }

  public addVariableBlock(pos: number, name: string) {
    const token = `{{${name}}}`;
    const docLen = this.view.state.doc.length;
    let from = Math.max(0, Math.min(pos, docLen));
    let to = from;

    const atTwo = this.view.state.doc.sliceString(from, Math.min(from + 2, docLen));
    if (atTwo === '{{') {
      to = from + 2;
    } else if (from < docLen && this.view.state.doc.sliceString(from, from + 1) === '{') {
      to = from + 1;
    } else if (from > 0) {
      const leftTwo = this.view.state.doc.sliceString(Math.max(0, from - 2), from);
      if (leftTwo === '{{') {
        from = from - 2;
        to = from + 2;
      } else if (this.view.state.doc.sliceString(from - 1, from) === '{') {
        from = from - 1;
        to = from + 1;
      }
    }

    const block: PluginBlock = {
      id: `var-${name}-${from}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      type: 'variable'
    };
    this.view.dispatch({
      changes: { from, to, insert: token },
      selection: { anchor: from + token.length }
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
    return serializeEditorContentString(this.view, this.allBlocks);
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
function createEditorState(initialDoc: string, callbacks: CodeMirrorCallbacks, initialBlocks: { pos: number, len?: number, block: EditorBlock | PluginBlock }[] = [], readonly: boolean = false) {
  const editorBlocks = initialBlocks.filter((b) => !('type' in (b.block as any) && 'name' in (b.block as any))) as { pos: number, len?: number, block: EditorBlock }[];
  const pluginBlocks = initialBlocks
    .filter((b) => ('type' in (b.block as any) && 'name' in (b.block as any)))
    .filter((b) => (b.block as PluginBlock).type !== 'variable') as { pos: number, len?: number, block: PluginBlock }[];

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
    ...editBlockExtensions({ callbacks, initialBlocks: editorBlocks, readonly }),
    ...pluginBlockExtensions({ initialBlocks: pluginBlocks, readonly }),
    markdownStyleField,
    editorTheme
  ];

  const state = EditorState.create({
    doc: initialDoc,
    extensions
  });

  return state;
}

function escapeAttrValue(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

function unescapeAttrValue(value: string) {
  return value
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function parseAttributes(attrsText: string) {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z_][\w-]*)="((?:\\.|[^"])*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(attrsText)) !== null) {
    attrs[match[1]] = unescapeAttrValue(match[2]);
  }
  return attrs;
}

function parseEditorContentString(input: string): { doc: string; initialBlocks: InitialBlock[] } {
  const initialBlocks: InitialBlock[] = [];
  let doc = '';
  let i = 0;

  while (i < input.length) {
    if (input.startsWith('{#EditorBlock', i) || input.startsWith('{#PluginBlock', i)) {
      const openEnd = input.indexOf('#}', i);
      if (openEnd === -1) {
        doc += input[i];
        i += 1;
        continue;
      }

      const openTag = input.slice(i + 2, openEnd);
      const firstSpace = openTag.indexOf(' ');
      const tagName = (firstSpace === -1 ? openTag : openTag.slice(0, firstSpace)).trim();
      const attrsText = firstSpace === -1 ? '' : openTag.slice(firstSpace + 1);
      const attrs = parseAttributes(attrsText);
      const closeTag = `{#/${tagName}#}`;
      const innerStart = openEnd + 2;
      const closeIndex = input.indexOf(closeTag, innerStart);
      if (closeIndex === -1) {
        doc += input[i];
        i += 1;
        continue;
      }

      const innerText = input.slice(innerStart, closeIndex);
      const pos = doc.length;
      doc += BLOCK_PLACEHOLDER;

      if (tagName === 'EditorBlock') {
        const text = innerText;
        const block: EditorBlock = {
          id: attrs.id || `block-${pos}`,
          placeholder: attrs.placeholder || '',
          presetText: text || (typeof attrs.presetText === 'string' ? attrs.presetText : '')
        };
        initialBlocks.push({ pos, len: 1, block });
      } else if (tagName === 'PluginBlock') {
        const blockType = attrs.type === 'workflow' ? 'workflow' : 'plugin';
        const block: PluginBlock = {
          id: attrs.id || `plugin-${pos}`,
          type: blockType,
          name: innerText
        };
        initialBlocks.push({ pos, len: 1, block });
      } else {
        doc = doc.slice(0, pos) + input.slice(i, closeIndex + closeTag.length);
      }

      i = closeIndex + closeTag.length;
      continue;
    }

    doc += input[i];
    i += 1;
  }

  return { doc, initialBlocks };
}

function serializeEditorContentString(view: EditorView, allBlocks: Map<string, EditorBlock>) {
  const doc = view.state.doc.toString();
  const editorBlocks = getEditorBlocks(view)
    .map((b) => {
      const latest = allBlocks.get(b.block.id);
      return latest ? { ...b, block: latest } : b;
    });
  const pluginBlocks = getPluginBlocks(view).filter((b) => b.block.type !== 'variable');

  const replacements: { from: number; to: number; text: string }[] = [];

  for (const { pos, len, block } of editorBlocks) {
    const from = pos;
    const to = pos + (len || 1);
    const text = `{#EditorBlock id="${escapeAttrValue(block.id)}" placeholder="${escapeAttrValue(block.placeholder)}"#}${block.presetText}{#/EditorBlock#}`;
    replacements.push({ from, to, text });
  }

  for (const { pos, len, block } of pluginBlocks) {
    const from = pos;
    const to = pos + (len || 1);
    const text = `{#PluginBlock id="${escapeAttrValue(block.id)}" type="${escapeAttrValue(block.type)}"#}${block.name}{#/PluginBlock#}`;
    replacements.push({ from, to, text });
  }

  replacements.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));

  let result = '';
  let cursor = 0;
  for (const r of replacements) {
    if (r.from < cursor) continue;
    result += doc.slice(cursor, r.from);
    result += r.text;
    cursor = r.to;
  }
  result += doc.slice(cursor);
  return result;
}

function serializeEditorContentSlice(view: EditorView, allBlocks: Map<string, EditorBlock>, from: number, to: number) {
  const doc = view.state.doc.toString();
  const slice = doc.slice(from, to);

  const editorBlocks = getEditorBlocks(view)
    .map((b) => {
      const latest = allBlocks.get(b.block.id);
      return latest ? { ...b, block: latest } : b;
    })
    .filter((b) => b.pos >= from && b.pos < to);

  const pluginBlocks = getPluginBlocks(view)
    .filter((b) => b.pos >= from && b.pos < to);

  const replacements: { from: number; to: number; text: string }[] = [];

  for (const { pos, len, block } of editorBlocks) {
    const relFrom = pos - from;
    const relTo = relFrom + (len || 1);
    const text = `{#EditorBlock id="${escapeAttrValue(block.id)}" placeholder="${escapeAttrValue(block.placeholder)}"#}${block.presetText}{#/EditorBlock#}`;
    replacements.push({ from: relFrom, to: relTo, text });
  }

  for (const { pos, len, block } of pluginBlocks) {
    const relFrom = pos - from;
    const relTo = relFrom + (len || 1);
    const text = `{#PluginBlock id="${escapeAttrValue(block.id)}" type="${escapeAttrValue(block.type)}"#}${block.name}{#/PluginBlock#}`;
    replacements.push({ from: relFrom, to: relTo, text });
  }

  replacements.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));

  let result = '';
  let cursor = 0;
  for (const r of replacements) {
    if (r.from < cursor) continue;
    result += slice.slice(cursor, r.from);
    result += r.text;
    cursor = r.to;
  }
  result += slice.slice(cursor);
  return result;
}
