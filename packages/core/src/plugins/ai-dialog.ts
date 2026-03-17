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

export class AIDialogPlugin {
  private isGenerating = false;
  private aiStreamTimer: any = null;
  private currentResponse = '';

  constructor(private callbacks: AIResponseCallbacks) {}

  public show(pos: number, coords: { bottom: number, left: number }, editorRect: DOMRect) {
    const style = {
      top: `${coords.bottom - editorRect.top + 10}px`,
      left: `${coords.left - editorRect.left}px`
    };
    this.callbacks.onShow(pos, style);
  }

  public hide() {
    this.stopResponse();
    this.callbacks.onHide();
  }

  public sendQuestion(question: string) {
    if (!question || this.isGenerating) return;

    this.isGenerating = true;
    this.callbacks.onLoading(true);
    this.currentResponse = '';
    this.callbacks.onStream('');

    // 模拟 AI 流式输出
    const fullResponse = `洲、美洲积累了丰富的在地经验，擅长结合用户需求定制专属旅行方案，曾帮助1000+人解决旅行难题，被旅行者亲切称为"旅行百事通"。\n\n## 核心性格与风格\n- **性格特点**：热情开朗、专业耐心，擅长用轻松幽默的方式化解旅行焦虑（如："别慌！机票改签我有3个小窍门，保准帮你搞定~"），遇到用户疑问会像朋友般细致拆解细节（如："你担心的高原反应，我去年在西藏徒步时总结过4个缓解方法..."）。\n- **语言风格**：口语化且富有感染力，常用"宝藏地""小众玩法"等旅行圈`;
    
    let index = 0;
    this.aiStreamTimer = setInterval(() => {
      this.callbacks.onLoading(false);
      if (index < fullResponse.length) {
        this.currentResponse += fullResponse[index];
        this.callbacks.onStream(this.currentResponse);
        index++;
      } else {
        this.finishGeneration();
      }
    }, 30);
  }

  public stopResponse() {
    if (this.aiStreamTimer) {
      clearInterval(this.aiStreamTimer);
      this.aiStreamTimer = null;
    }
    this.isGenerating = false;
    this.callbacks.onLoading(false);
    this.callbacks.onStop();
  }

  private finishGeneration() {
    if (this.aiStreamTimer) {
      clearInterval(this.aiStreamTimer);
      this.aiStreamTimer = null;
    }
    this.isGenerating = false;
    this.callbacks.onLoading(false);
    this.callbacks.onComplete();
  }

  public getIsGenerating() {
    return this.isGenerating;
  }

  public destroy() {
    this.stopResponse();
  }
}

export function aiDialogExtensions(options: {
  onTriggerAIDialog: (pos: number) => void;
}): Extension[] {
  return [
    slashAIDialogTriggerExtension(options.onTriggerAIDialog),
    selectionAIDialogTriggerExtension(options.onTriggerAIDialog),
    aiDialogTheme
  ];
}

function slashAIDialogTriggerExtension(onTriggerAIDialog: (pos: number) => void) {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    update.changes.iterChanges((fromA, _toA, _fromB, _toB, inserted) => {
      if (inserted.length !== 1) return;
      const char = inserted.sliceString(0);
      if (char === '/') onTriggerAIDialog(fromA);
    });
  });
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
