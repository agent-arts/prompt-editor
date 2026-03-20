import type { Extension } from '@codemirror/state';
import { Facet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { EditorBlock } from '../types';

export interface CodeMirrorCallbacks {
  updateBlockText: (id: string, text: string) => void;
  openPopup: (id: string, rect: DOMRect) => void;
  deleteBlock: (id: string) => void;
}

export const addBlockEffect = StateEffect.define<EditorBlock>();
export const updateBlockEffect = StateEffect.define<EditorBlock>();

class EditBlockWidget extends WidgetType {
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

    input.onfocus = () => {
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
        const pos = view.posAtDOM(span);
        this.callbacks.deleteBlock(this.block.id);
        view.dispatch({
          changes: { from: pos, to: pos + 1 },
          selection: { anchor: pos }
        });
      }
    };

    span.appendChild(input);
    return span;
  }

  override ignoreEvent() {
    return true;
  }
}

const callbacksFacet = Facet.define<CodeMirrorCallbacks, CodeMirrorCallbacks>({
  combine: values => values[0]
});

const initialBlocksFacet = Facet.define<{ pos: number; len?: number; block: EditorBlock }[], { pos: number; len?: number; block: EditorBlock }[]>({
  combine: values => values.length ? values[0] : []
});

export const editBlockField = StateField.define<DecorationSet>({
  create(state) {
    const callbacks = state.facet(callbacksFacet);
    const initialBlocks = state.facet(initialBlocksFacet);
    if (!initialBlocks || initialBlocks.length === 0) {
      return Decoration.none;
    }

    const deco = initialBlocks
      .slice()
      .sort((a, b) => a.pos - b.pos)
      .map(({ pos, len, block }) => {
        const widget = new EditBlockWidget(block, callbacks);
        return Decoration.replace({ widget }).range(pos, pos + (len || 1));
      });
    return Decoration.set(deco, true);
  },
  update(decorations, tr) {
    const callbacks = tr.state.facet(callbacksFacet);
    decorations = decorations.map(tr.changes);

    for (const e of tr.effects) {
      if (e.is(addBlockEffect)) {
        const pos = tr.state.selection.main.head - 1;
        const blockDecoration = Decoration.replace({
          widget: new EditBlockWidget(e.value, callbacks),
        }).range(pos, pos + 1);
        decorations = decorations.update({ add: [blockDecoration] });
      } else if (e.is(updateBlockEffect)) {
        const newBlock = e.value;
        let pos: number | null = null;
        decorations.between(0, tr.state.doc.length, (from, _to, value) => {
          const widget = value.spec.widget;
          if (widget instanceof EditBlockWidget && widget.block.id === newBlock.id) {
            pos = from;
          }
        });

        if (pos !== null) {
          decorations = decorations.update({
            filter: (_from, _to, value) => {
              const widget = value.spec.widget;
              return !(widget instanceof EditBlockWidget && widget.block.id === newBlock.id);
            },
            add: [Decoration.replace({
              widget: new EditBlockWidget(newBlock, callbacks),
            }).range(pos, pos + 1)]
          });
        }
      }
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f)
});

const editBlockColor = 'rgba(20, 118, 255, 1)';
const editBlockBgColor = 'rgba(20, 118, 255, 0.06)';
export const editBlockTheme = EditorView.theme({
  '.cm-inline-block': {
    display: 'inline-block',
    height: '22px',
    lineHeight: '18px',
    backgroundColor: editBlockBgColor,
    color: editBlockColor,
    padding: '0 8px',
    margin: '0 4px',
    borderRadius: '4px',
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'all 0.2s',
    fontSize: '14px',
    verticalAlign: 'middle'
  },
  '.cm-inline-block:hover': {
    backgroundColor: editBlockBgColor,
    borderColor: 'transparent'
  },
  '.block-input': {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'inherit',
    font: 'inherit',
    padding: '0',
    width: 'auto',
    minWidth: '20px',
    textAlign: 'center'
  },
  '.block-input::placeholder': {
    color: editBlockColor,
    opacity: 0.5
  },
  '.cm-plugin-block': {
    backgroundColor: 'rgba(228, 247, 233, 1)',
    color: 'rgba(2, 153, 49, 1)'
  }
});

export function editBlockExtensions(options: {
  callbacks: CodeMirrorCallbacks;
  initialBlocks?: { pos: number; len?: number; block: EditorBlock }[];
}): Extension[] {
  return [
    callbacksFacet.of(options.callbacks),
    initialBlocksFacet.of(options.initialBlocks || []),
    editBlockField,
    editBlockTheme
  ];
}

export function getEditorBlocks(view: EditorView) {
  const editorBlocks: { pos: number; len?: number; block: EditorBlock }[] = [];
  const field = view.state.field(editBlockField, false);
  if (!field) return editorBlocks;

  field.between(0, view.state.doc.length, (from, to, value) => {
    const widget = value.spec.widget;
    if (widget instanceof EditBlockWidget) {
      editorBlocks.push({ pos: from, len: to - from, block: widget.block });
    }
  });

  return editorBlocks;
}

export interface EditBlockCallbacks {
  onShow: (block: EditorBlock, style: { top: string, left: string }) => void;
  onHide: () => void;
}
