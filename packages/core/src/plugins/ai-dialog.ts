import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

export interface AIResponseCallbacks {
  onStream: (text: string) => void;
  onLoading: (loading: boolean) => void;
  onComplete: () => void;
  onStop: () => void;
  onShow: (pos: number, style: { top: string, left: string }) => void;
  onHide: () => void;
}

export function aiDialogExtensions(options: {
  onTriggerAIDialog: (pos: number) => void;
  onHideAIDialog?: () => void;
}): Extension[] {
  return [
    ...slashAIDialogTriggerExtensions({
      onTriggerAIDialog: options.onTriggerAIDialog,
      onHideAIDialog: options.onHideAIDialog
    }),
    selectionAIDialogTriggerExtension(options.onTriggerAIDialog),
    aiDialogTheme
  ];
}

function slashAIDialogTriggerExtensions(options: {
  onTriggerAIDialog: (pos: number) => void;
  onHideAIDialog?: () => void;
}): Extension[] {
  return [
    EditorView.domEventHandlers({
      keydown: (event, view) => {
        if (!options.onHideAIDialog) return false;
        if (event.key !== 'Backspace' && event.key !== 'Delete') return false;

        const sel = view.state.selection.main;
        if (!sel.empty) {
          const selectedText = view.state.doc.sliceString(sel.from, sel.to);
          if (selectedText.includes('/')) options.onHideAIDialog();
          return false;
        }

        if (event.key === 'Backspace') {
          if (sel.from === 0) return false;
          const leftChar = view.state.doc.sliceString(sel.from - 1, sel.from);
          if (leftChar === '/') options.onHideAIDialog();
          return false;
        }

        const rightChar = view.state.doc.sliceString(sel.from, Math.min(sel.from + 1, view.state.doc.length));
        if (rightChar === '/') options.onHideAIDialog();
        return false;
      },
      beforeinput: (event, view) => {
        if (!options.onHideAIDialog) return false;
        const inputType = (event as InputEvent).inputType;
        if (!inputType || !inputType.startsWith('delete')) return false;

        const sel = view.state.selection.main;
        if (!sel.empty) {
          const selectedText = view.state.doc.sliceString(sel.from, sel.to);
          if (selectedText.includes('/')) options.onHideAIDialog();
          return false;
        }

        if (inputType === 'deleteContentBackward') {
          if (sel.from === 0) return false;
          const leftChar = view.state.doc.sliceString(sel.from - 1, sel.from);
          if (leftChar === '/') options.onHideAIDialog();
          return false;
        }

        if (inputType === 'deleteContentForward') {
          const rightChar = view.state.doc.sliceString(sel.from, Math.min(sel.from + 1, view.state.doc.length));
          if (rightChar === '/') options.onHideAIDialog();
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

        if (removedText.includes('/') && !insertedText.includes('/')) {
          shouldHide = true;
        }

        if (inserted.length !== 1) return;
        if (insertedText === '/') options.onTriggerAIDialog(fromA);
      });

      if (shouldHide) {
        options.onHideAIDialog?.();
      }
    })
  ];
}

const aiDialogTheme = EditorView.theme({
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
