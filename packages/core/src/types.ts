export interface EditorBlock {
  id: string;
  placeholder: string;
  presetText: string;
}

export interface PluginBlock {
  id: string;
  name: string;
  type: 'plugin' | 'workflow' | 'variable';
}

export type InitialBlock = {
  pos: number;
  len?: number;
  block: EditorBlock | PluginBlock;
};

export type EditorData = string;
