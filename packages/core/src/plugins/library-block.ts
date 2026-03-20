import type { Extension } from '@codemirror/state';
import { Facet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
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

    const svgPlugin = '<svg t="1773798100074" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7345" width="16" height="16"><path d="M770.784 113.28a293.12 293.12 0 0 0-410.496 57.696L235.712 336.32a31.968 31.968 0 1 0 51.104 38.496l124.576-165.344a229.12 229.12 0 1 1 365.952 275.776l-255.36 338.88a163.84 163.84 0 0 1-261.696-197.184l255.36-338.88a98.528 98.528 0 1 1 157.408 118.624l-216.064 286.752a33.28 33.28 0 1 1-53.184-40.064c86.176-115.616 141.024-189.024 164.544-220.256a32 32 0 1 0-51.136-38.496c-23.616 31.36-78.496 104.8-164.64 220.384a97.28 97.28 0 1 0 155.456 116.96l218.912-290.496c0.992-1.344 1.312-2.912 2.08-4.32 47.36-71.104 32.224-167.456-36.896-219.552a162.56 162.56 0 0 0-227.648 32l-255.36 338.88a227.84 227.84 0 0 0 363.904 274.24l255.36-338.88a293.056 293.056 0 0 0-57.6-410.56z" fill="currentColor" p-id="7346"></path></svg>';
    const svgWorkflow = '<svg t="1773798162825" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8404" width="16" height="16"><path d="M474.282667 96.213333a123.477333 123.477333 0 0 0-116.181334 123.221334l-0.042666 22.826666H243.797333A104.832 104.832 0 0 0 139.093333 347.477333l-0.213333 138.922667a32 32 0 0 0 32 32.042667h54.698667c36.821333 0 66.730667 29.909333 66.730666 66.730666 0 36.821333-29.909333 66.773333-66.730666 66.773334H170.837333a32 32 0 0 0-32 31.957333l-0.170666 138.965333a105.130667 105.130667 0 0 0 105.130666 105.173334h138.965334a32 32 0 0 0 32-32v-54.869334a66.816 66.816 0 0 1 133.504 0V896c0 17.664 14.336 32 32 32h138.965333l6.912-0.213333a105.130667 105.130667 0 0 0 98.218667-104.96v-114.261334h22.869333a123.477333 123.477333 0 0 0 123.434667-123.434666l-0.213334-7.253334a123.477333 123.477333 0 0 0-123.221333-116.181333h-22.869333V347.434667l-0.213334-6.912a105.130667 105.130667 0 0 0-104.917333-98.218667l-114.304-0.042667v-22.826666a123.477333 123.477333 0 0 0-123.392-123.434667l-7.253333 0.213333z m7.253333 63.786667c32.768 0 59.434667 26.624 59.434667 59.434667v54.869333c0 17.664 14.293333 32 32 32h146.261333c22.741333 0 41.130667 18.346667 41.130667 41.130667v146.261333c0 17.706667 14.336 32 32 32h54.869333a59.477333 59.477333 0 0 1 0 118.869333h-54.869333a32 32 0 0 0-32 32v146.304l-0.256 4.778667a41.130667 41.130667 0 0 1-40.874667 36.352H612.266667v-22.869333a130.816 130.816 0 0 0-130.730667-130.730667l-7.68 0.213333a130.816 130.816 0 0 0-123.093333 130.56v22.826667H243.797333l-4.778666-0.256a41.130667 41.130667 0 0 1-36.352-40.874667l0.128-107.008h22.741333a130.816 130.816 0 0 0 130.730667-130.730666l-0.213334-7.68a130.816 130.816 0 0 0-130.56-123.050667l-22.613333-0.042667 0.170667-106.88c0-22.912 18.133333-41.173333 40.746666-41.173333h146.304a32 32 0 0 0 32-32V219.434667c0-32.810667 26.624-59.434667 59.434667-59.434667z" fill="currentColor" p-id="8405"></path></svg>';
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
        const { pos: originalPos, len, block } = e.value;
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
  ];
}

export function pluginPopupTriggerExtensions(options: {
  onTriggerPluginPopup: (pos: number) => void;
  onHidePluginPopup?: () => void;
}): Extension[] {
  return [
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      let shouldHide = false;
      update.changes.iterChanges((fromA, _toA, _fromB, _toB, inserted) => {
        const insertedText = inserted.sliceString(0);
        const removedText = update.startState.doc.sliceString(fromA, _toA);

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

export class LibraryBlockPlugin {
  public userVariables = [
    'sys_uuid',
    'sys_user_id',
    'sys_user_name',
  ];

  public inputVariables = [
    'sys_uuid',
  ];

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
