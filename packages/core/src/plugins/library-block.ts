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

const variableBlockMark = Decoration.mark({ class: 'cm-plugin-block cm-plugin-block-variable' });

function getVariableDecorations(doc: string) {
  const decorations: { from: number, to: number }[] = [];
  const regex = /\{\{(.+?)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(doc)) !== null) {
    decorations.push({ from: match.index, to: match.index + match[0].length });
  }
  return Decoration.set(decorations.map(r => variableBlockMark.range(r.from, r.to)), true);
}

const variableBlockField = StateField.define<DecorationSet>({
  create(state) {
    return getVariableDecorations(state.doc.toString());
  },
  update(decorations, tr) {
    if (tr.docChanged) return getVariableDecorations(tr.state.doc.toString());
    return decorations.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f)
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
  return [
    initialPluginBlocksFacet.of(options.initialBlocks || []),
    pluginBlockField,
    variableBlockField,
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
