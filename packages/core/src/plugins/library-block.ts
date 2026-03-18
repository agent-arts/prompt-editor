import type { Extension } from '@codemirror/state';
import { Facet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { PluginBlock } from '../types';

export interface LibraryBlockCallbacks {
  onShow: (pos: number, style: { top: string, left: string }) => void;
  onHide: () => void;
}

export const addPluginBlockEffect = StateEffect.define<{ pos: number, block: PluginBlock }>();

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

export const pluginBlockField = StateField.define<DecorationSet>({
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

    for (const e of tr.effects) {
      if (e.is(addPluginBlockEffect)) {
        const { pos: originalPos, block } = e.value;
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

export function pluginBlockExtensions(options: {
  initialBlocks?: { pos: number, len?: number, block: PluginBlock }[];
}): Extension[] {
  return [
    initialPluginBlocksFacet.of(options.initialBlocks || []),
    pluginBlockField,
  ];
}

export function pluginPopupTriggerExtensions(options: {
  onTriggerPluginPopup: (pos: number) => void;
}): Extension[] {
  return [
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      update.changes.iterChanges((fromA, _toA, _fromB, _toB, inserted) => {
        if (inserted.length !== 1) return;
        const char = inserted.sliceString(0);
        if (char === '{') options.onTriggerPluginPopup(fromA);
      });
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
        type: 'plugin'
      }
    });
  }
  return blocks;
}

export class LibraryBlockPlugin {
  public plugins = [
    { id: 'plugin-1', name: 'LinkReaderPlugin', type: 'plugin' as const },
  ];
  public workflows = [
    { id: 'workflow-1', name: 'condition_1_872', type: 'workflow' as const },
  ];

  private triggerPos: number = 0;

  constructor(private callbacks: LibraryBlockCallbacks) {}

  public show(pos: number, coords: { bottom: number, left: number }, editorRect: DOMRect) {
    this.triggerPos = pos;
    const style = {
      top: `${coords.bottom - editorRect.top + 10}px`,
      left: `${coords.left - editorRect.left}px`
    };
    this.callbacks.onShow(pos, style);
  }

  public hide() {
    this.callbacks.onHide();
  }

  public getTriggerPos() {
    return this.triggerPos;
  }
}
