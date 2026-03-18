export interface EditorBlock {
  id: string;
  placeholder: string;
  presetText: string;
}

export interface PluginBlock {
  id: string;
  name: string;
  type: 'plugin' | 'workflow';
}

export type InitialBlock = {
  pos: number;
  len?: number;
  block: EditorBlock | PluginBlock;
};

export type EditorData = {
  content: string;
  editorBlocks: { pos: number; len?: number; block: EditorBlock }[];
  pluginBlocks: { pos: number; len?: number; block: PluginBlock }[];
  html: string;
};
