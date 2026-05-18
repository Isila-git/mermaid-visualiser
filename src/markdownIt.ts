import * as vscode from 'vscode';

type MarkdownItRendererRule = (
  tokens: Array<{ content: string; info: string }>,
  index: number,
  options: unknown,
  env: unknown,
  self: unknown
) => string;

type MarkdownItLike = {
  renderer: {
    rules: {
      fence?: MarkdownItRendererRule;
    };
  };
};

export function extendMarkdownIt(markdownIt: unknown): MarkdownItLike {
  const md = markdownIt as MarkdownItLike;
  const defaultFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/u)[0]?.toLowerCase();

    if (language && getMarkdownLanguages().includes(language)) {
      const source = token.content.trim();
      return `<div class="mermaid-visualiser-markdown" data-mermaid-source="${escapeHtmlAttribute(source)}">${escapeHtml(source)}</div>`;
    }

    if (defaultFence) {
      return defaultFence(tokens, index, options, env, self);
    }

    return escapeHtml(token.content);
  };

  return md;
}

function getMarkdownLanguages(): string[] {
  return vscode.workspace
    .getConfiguration('mermaidVisualiser')
    .get<string[]>('markdownLanguages', ['mermaid'])
    .map(language => language.toLowerCase());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}