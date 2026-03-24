import type { Extension } from '@codemirror/state';
import { Facet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { svgPlugin, svgWorkflow } from '../const';
import type { PluginBlock } from '../types';

export interface LibraryBlockCallbacks {
  onShow: (pos: number, style: { top: string, left: string }) => void;
  onHide: () => void;
}

export const addPluginBlockEffect = StateEffect.define<{ pos: number, len?: number, block: PluginBlock }>();

class PluginWidget extends WidgetType {
  constructor(public block: PluginBlock) {
    super();
  }

  override toDOM() {
    const span = document.createElement('span');
    span.className = `cm-plugin-block cm-plugin-block-${this.block.type}`;
    span.setAttribute('data-block-id', this.block.id);

    if (this.block.type !== 'variable') {
      const icon = document.createElement('span');
      icon.innerHTML = this.block.type === 'plugin' ? svgPlugin : svgWorkflow;
      span.appendChild(icon.firstElementChild!);
    }

    const text = document.createTextNode(this.block.type === 'variable' ? `{{${this.block.name}}}` : this.block.name);
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

const variableTokenRegex = /\{\{(.+?)\}\}/g;
const variableTheme = EditorView.theme({
  '.cm-variable-input': {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    padding: '0',
    margin: '0',
    minWidth: '20px',
    width: 'auto'
  },
  '.cm-plugin-block-variable': {
    cursor: 'pointer'
  }
});

class VariableWidget extends WidgetType {
  constructor(private name: string, private tokenLength: number) {
    super();
  }

  override eq(other: WidgetType) {
    return other instanceof VariableWidget && other.name === this.name && other.tokenLength === this.tokenLength;
  }

  override toDOM(view: EditorView) {
    const span = document.createElement('span');
    span.className = 'cm-plugin-block cm-plugin-block-variable';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = `{{${this.name}}}`;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.className = 'cm-variable-input';

    input.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });

    const measureWidth = (val: string) => {
      const temp = document.createElement('span');
      temp.style.visibility = 'hidden';
      temp.style.position = 'absolute';
      temp.style.whiteSpace = 'pre';
      temp.style.font = 'inherit';
      temp.textContent = val || '{{}}';
      document.body.appendChild(temp);
      const width = temp.offsetWidth;
      document.body.removeChild(temp);
      return width + 10;
    };

    input.style.width = `${measureWidth(input.value)}px`;
    input.addEventListener('input', () => {
      input.style.width = `${measureWidth(input.value)}px`;
    });

    span.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.focus();
      input.select();
    });

    input.addEventListener('blur', () => {
      const nextText = input.value;
      const from = view.posAtDOM(span);
      const to = from + this.tokenLength;
      if (view.state.doc.sliceString(from, to) === nextText) return;
      view.dispatch({
        changes: { from, to, insert: nextText },
        selection: { anchor: from + nextText.length }
      });
      view.focus();
    });

    span.append(input);
    return span;
  }

  override ignoreEvent() {
    return true;
  }
}

function getVariableTokenDecorations(doc: string) {
  const decorations: Decoration[] = [];
  let match: RegExpExecArray | null;
  while ((match = variableTokenRegex.exec(doc)) !== null) {
    const start = match.index;
    const token = match[0];
    decorations.push(Decoration.replace({ widget: new VariableWidget(match[1], token.length) }).range(start, start + token.length));
  }
  return Decoration.set(decorations, true);
}

const variableTokenField = StateField.define<DecorationSet>({
  create(state) {
    return getVariableTokenDecorations(state.doc.toString());
  },
  update(decorations, tr) {
    if (tr.docChanged) return getVariableTokenDecorations(tr.state.doc.toString());
    return decorations.map(tr.changes);
  },
  provide: f => [
    EditorView.decorations.from(f),
    EditorView.atomicRanges.of((view) => view.state.field(f))
  ]
});

export const pluginBlockField = StateField.define<DecorationSet>({
  create(state) {
    const initialBlocks = state.facet(initialPluginBlocksFacet);
    if (!initialBlocks || initialBlocks.length === 0) return Decoration.none;

    const deco = initialBlocks
      .slice()
      .sort((a, b) => a.pos - b.pos)
      .map(({ pos, len, block }) => {
        if (block.type === 'variable') return null;
        return Decoration.replace({ widget: new PluginWidget(block) }).range(pos, pos + (len || 1));
      });
    return Decoration.set(deco.filter(Boolean) as any, true);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      const changedRanges: { from: number; to: number }[] = [];
      tr.changes.iterChanges((fromA, toA) => {
        changedRanges.push({ from: fromA, to: toA });
      });
      decorations = decorations.update({
        filter: (from, to) => !changedRanges.some((r) => from < r.to && to > r.from)
      });
    }
    decorations = decorations.map(tr.changes);

    for (const e of tr.effects) {
      if (e.is(addPluginBlockEffect)) {
        const { pos: originalPos, len, block } = e.value;
        if (block.type === 'variable') continue;
        const pos = tr.changes.mapPos(originalPos);
        const pluginDecoration = Decoration.replace({
          widget: new PluginWidget(block),
        }).range(pos, pos + (len || 1));
        decorations = decorations.update({ add: [pluginDecoration] });
      }
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f)
});

export function pluginBlockExtensions(options: {
  initialBlocks?: { pos: number, len?: number, block: PluginBlock }[];
}): Extension[] {
  const findVariableEndingAt = (view: EditorView, pos: number): { from: number, to: number } | null => {
    const field = view.state.field(variableTokenField, false);
    if (!field) return null;
    let found: { from: number, to: number } | null = null;
    field.between(Math.max(0, pos - 1), pos, (from, to) => {
      if (to === pos) found = { from, to };
    });
    return found;
  };

  const findVariableStartingAt = (view: EditorView, pos: number): { from: number, to: number } | null => {
    const field = view.state.field(variableTokenField, false);
    if (!field) return null;
    let found: { from: number, to: number } | null = null;
    field.between(pos, Math.min(view.state.doc.length, pos + 1), (from, to) => {
      if (from === pos) found = { from, to };
    });
    return found;
  };

  return [
    initialPluginBlocksFacet.of(options.initialBlocks || []),
    pluginBlockField,
    variableTokenField,
    variableTheme,
    EditorView.domEventHandlers({
      keydown: (event, view) => {
        if (event.key !== 'Backspace' && event.key !== 'Delete') return false;
        const sel = view.state.selection.main;
        if (!sel.empty) return false;

        const pos = sel.from;
        if (event.key === 'Backspace') {
          const range = findVariableEndingAt(view, pos);
          if (!range) return false;
          event.preventDefault();
          view.dispatch({ changes: { from: range.from, to: range.to, insert: '' }, selection: { anchor: range.from } });
          return true;
        }

        if (event.key === 'Delete') {
          const range = findVariableStartingAt(view, pos);
          if (!range) return false;
          event.preventDefault();
          view.dispatch({ changes: { from: range.from, to: range.to, insert: '' }, selection: { anchor: range.from } });
          return true;
        }
        return false;
      },
      beforeinput: (event, view) => {
        const inputType = (event as InputEvent).inputType;
        if (inputType !== 'deleteContentBackward' && inputType !== 'deleteContentForward') return false;
        const sel = view.state.selection.main;
        if (!sel.empty) return false;
        const pos = sel.from;
        if (inputType === 'deleteContentBackward') {
          const range = findVariableEndingAt(view, pos);
          if (!range) return false;
          event.preventDefault();
          view.dispatch({ changes: { from: range.from, to: range.to, insert: '' }, selection: { anchor: range.from } });
          return true;
        }

        if (inputType === 'deleteContentForward') {
          const range = findVariableStartingAt(view, pos);
          if (!range) return false;
          event.preventDefault();
          view.dispatch({ changes: { from: range.from, to: range.to, insert: '' }, selection: { anchor: range.from } });
          return true;
        }
        return false;
      },
    })
  ];
}

export function pluginPopupTriggerExtensions(options: {
  onTriggerPluginPopup: (pos: number) => void;
  onHidePluginPopup?: () => void;
}): Extension[] {
  return [
    EditorView.domEventHandlers({
      keydown: (event, view) => {
        if (!options.onHidePluginPopup) return false;
        if (event.key !== 'Backspace' && event.key !== 'Delete') return false;

        const sel = view.state.selection.main;
        if (!sel.empty) {
          const selectedText = view.state.doc.sliceString(sel.from, sel.to);
          if (selectedText.includes('{')) options.onHidePluginPopup();
          return false;
        }

        if (event.key === 'Backspace') {
          if (sel.from === 0) return false;
          const leftChar = view.state.doc.sliceString(sel.from - 1, sel.from);
          if (leftChar === '{') options.onHidePluginPopup();
          return false;
        }

        const rightChar = view.state.doc.sliceString(sel.from, Math.min(sel.from + 1, view.state.doc.length));
        if (rightChar === '{') options.onHidePluginPopup();
        return false;
      },
      beforeinput: (event, view) => {
        if (!options.onHidePluginPopup) return false;
        const inputType = (event as InputEvent).inputType;
        if (!inputType || !inputType.startsWith('delete')) return false;

        const sel = view.state.selection.main;
        if (!sel.empty) {
          const selectedText = view.state.doc.sliceString(sel.from, sel.to);
          if (selectedText.includes('{')) options.onHidePluginPopup();
          return false;
        }

        if (inputType === 'deleteContentBackward') {
          if (sel.from === 0) return false;
          const leftChar = view.state.doc.sliceString(sel.from - 1, sel.from);
          if (leftChar === '{') options.onHidePluginPopup();
          return false;
        }

        if (inputType === 'deleteContentForward') {
          const rightChar = view.state.doc.sliceString(sel.from, Math.min(sel.from + 1, view.state.doc.length));
          if (rightChar === '{') options.onHidePluginPopup();
        }
        return false;
      }
    }),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      let shouldHide = false;
      update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        const insertedText = inserted.sliceString(0);
        const removedText = update.startState.doc.sliceString(fromA, toA);

        if (removedText.includes('{') && !insertedText.includes('{')) {
          shouldHide = true;
        }

        if (inserted.length !== 1) return;
        if (insertedText === '{') options.onTriggerPluginPopup(fromA);
      });

      if (shouldHide) {
        options.onHidePluginPopup?.();
      }
    }),
  ];
}

export function getPluginBlocks(view: EditorView) {
  const pluginBlocks: { pos: number, len?: number, block: PluginBlock }[] = [];
  const field = view.state.field(pluginBlockField, false);
  if (!field) return pluginBlocks;

  field.between(0, view.state.doc.length, (from, to, value) => {
    const widget = value.spec.widget;
    if (widget instanceof PluginWidget) {
      pluginBlocks.push({ pos: from, len: to - from, block: widget.block });
    }
  });

  return pluginBlocks;
}

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
        type: 'variable'
      }
    });
  }
  return blocks;
}
