import mermaid from 'mermaid';

type MermaidTheme = 'base' | 'dark' | 'default' | 'forest' | 'neutral';

const blockSelector = '.mermaid-visualiser-markdown';

let renderVersion = 0;

window.addEventListener('vscode.markdown.updateContent', () => {
  void renderMarkdownMermaid();
});

void renderMarkdownMermaid();

async function renderMarkdownMermaid(): Promise<void> {
  ensureStyles();

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: resolveTheme()
  });

  const blocks = document.querySelectorAll<HTMLElement>(blockSelector);
  let blockIndex = 0;

  for (const block of blocks) {
    const source = block.dataset.mermaidSource ?? block.textContent ?? '';

    try {
      await mermaid.parse(source, { suppressErrors: false });
      const result = await mermaid.render(
        `markdown-mermaid-${renderVersion}-${blockIndex++}`,
        source
      );
      block.innerHTML = result.svg;
      result.bindFunctions?.(block);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      block.innerHTML = `<pre class="mermaid-visualiser-markdown-error">${escapeHtml(message)}</pre>`;
    }
  }

  renderVersion += 1;
}

function ensureStyles(): void {
  if (document.getElementById('mermaid-visualiser-markdown-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'mermaid-visualiser-markdown-styles';
  style.textContent = `
    ${blockSelector} {
      margin: 1rem 0;
      padding: 1rem;
      overflow: auto;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
      background: color-mix(in srgb, var(--vscode-editorWidget-background) 92%, transparent);
    }

    ${blockSelector} svg {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 0 auto;
    }

    .mermaid-visualiser-markdown-error {
      margin: 0;
      white-space: pre-wrap;
      color: var(--vscode-errorForeground);
      font-family: var(--vscode-editor-font-family);
    }
  `;
  document.head.appendChild(style);
}

function resolveTheme(): MermaidTheme {
  if (
    document.body.classList.contains('vscode-dark') ||
    document.body.classList.contains('vscode-high-contrast')
  ) {
    return 'dark';
  }

  return 'default';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}