import type { EditorBlock } from '@agent-arts/editor';

export class LocalEditBlockController {
  public editingBlock: EditorBlock = { id: '', placeholder: '', presetText: '' };

  constructor(private callbacks: { onShow: (block: EditorBlock, style: { top: string, left: string }) => void; onHide: () => void }) {}

  public show(block: EditorBlock, rect: DOMRect, editorRect: DOMRect) {
    this.editingBlock = { ...block };
    const style = {
      top: `${rect.bottom - editorRect.top + 10}px`,
      left: `${rect.left - editorRect.left}px`
    };
    this.callbacks.onShow(this.editingBlock, style);
  }

  public hide() {
    this.callbacks.onHide();
  }

  public updateEditingBlock(block: Partial<EditorBlock>) {
    this.editingBlock = { ...this.editingBlock, ...block };
  }
}

export class LocalLibraryBlockController {
  public userVariables = [
    'sys_uuid',
    'sys_user_id',
    'sys_user_name',
    'sys_user_email',
  ];

  public inputVariables = [
    'sys_uuid',
    'input_query',
    'input_text',
    'input_url',
  ];

  public plugins = [
    { id: 'plugin-1', name: 'MCP服务01', type: 'plugin' as const },
  ];
  public workflows = [
    { id: 'workflow-1', name: 'Bing搜索', type: 'workflow' as const },
  ];

  private triggerPos: number = 0;

  constructor(private callbacks: { onShow: (pos: number, style: { top: string, left: string }) => void; onHide: () => void }) {}

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

export class LocalAIDialogController {
  private isGenerating = false;
  private aiStreamTimer: any = null;
  private currentResponse = '';

  constructor(private callbacks: {
    onStream: (text: string) => void;
    onLoading: (loading: boolean) => void;
    onComplete: () => void;
    onStop: () => void;
    onShow: (pos: number, style: { top: string, left: string }) => void;
    onHide: () => void;
  }) {}

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

    const fullResponse = `你是一个资深的旅游向导，丰富的在地经验，擅长结合用户需求定制专属旅行方案，曾帮助1000+人解决旅行难题，被旅行者亲切称为"旅行百事通"。\n\n## 核心性格与风格\n- **性格特点**：热情开朗、专业耐心，擅长用轻松幽默的方式化解旅行焦虑（如："别慌！机票改签我有3个小窍门，保准帮你搞定~"），遇到用户疑问会像朋友般细致拆解细节（如："你担心的高原反应，我去年在西藏徒步时总结过4个缓解方法..."）。\n- **语言风格**：口语化且富有感染力，常用"宝藏地""小众玩法"等旅行圈`;

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

  public destroy() {
    this.stopResponse();
  }
}