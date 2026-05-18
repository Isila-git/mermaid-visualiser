import * as path from 'node:path';
import * as vscode from 'vscode';

const previewViewType = 'mermaidVisualiser.preview';
const supportedExtensions = new Set(['.mmd', '.mermaid']);
const supportedThemes = new Set(['base', 'dark', 'default', 'forest', 'neutral']);

type PreviewControlAction =
  | 'zoomIn'
  | 'zoomOut'
  | 'resetView'
  | 'exportSvg'
  | 'exportPng';

type ExportFormat = 'svg' | 'png';

type MermaidTheme = 'base' | 'dark' | 'default' | 'forest' | 'neutral';

type PreviewPayload = {
  source: string;
  documentLabel: string;
  theme: MermaidTheme;
  hasDocument: boolean;
};

type PreviewMessage = {
  type: 'update';
  payload: PreviewPayload;
};

type ControlMessage = {
  type: 'control';
  payload: {
    action: PreviewControlAction;
  };
};

type WebviewToExtensionMessage = {
  type: 'save';
  payload: {
    format: ExportFormat;
    data: string;
  };
};

export class MermaidPreviewController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private currentDocument: vscode.TextDocument | undefined;
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'mermaidVisualiser.openPreview';
    this.statusBarItem.text = '$(preview) Mermaid Preview';
    this.statusBarItem.tooltip = 'Open the Mermaid preview for the active document';

    this.disposables.push(
      this.statusBarItem,
      vscode.workspace.onDidChangeTextDocument(event => {
        if (this.isTracking(event.document)) {
          this.refresh(event.document);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        this.updateStatusBar(editor?.document);

        if (isMermaidDocument(editor?.document)) {
          this.refresh(editor.document);
        }
      }),
      vscode.workspace.onDidCloseTextDocument(document => {
        if (!this.isTracking(document)) {
          return;
        }

        const nextDocument = getActiveMermaidDocument();
        if (nextDocument) {
          this.refresh(nextDocument);
          return;
        }

        this.currentDocument = undefined;
        this.postUpdate();
        this.updatePanelTitle();
        this.updateStatusBar(vscode.window.activeTextEditor?.document);
      }),
      vscode.window.onDidChangeActiveColorTheme(() => {
        if (this.panel) {
          this.postUpdate();
        }
      }),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (
          this.panel &&
          (event.affectsConfiguration('mermaidVisualiser') ||
            event.affectsConfiguration('workbench.colorTheme'))
        ) {
          this.postUpdate();
        }
      })
    );

    this.updateStatusBar(vscode.window.activeTextEditor?.document);
  }

  public async open(resource?: vscode.Uri): Promise<void> {
    const document = await this.resolveDocument(resource);
    if (!document) {
      await vscode.window.showErrorMessage(
        'Open a .mmd, .mermaid, or mermaid language document first.'
      );
      return;
    }

    this.currentDocument = document;

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        previewViewType,
        '',
        {
          viewColumn: vscode.ViewColumn.Beside,
          preserveFocus: true
        },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')]
        }
      );

      this.panel.onDidDispose(
        () => {
          this.panel = undefined;
          this.currentDocument = undefined;
        },
        null,
        this.disposables
      );

      this.panel.webview.onDidReceiveMessage(
        message => this.onDidReceiveMessage(message as WebviewToExtensionMessage),
        null,
        this.disposables
      );

      this.panel.webview.html = this.getHtml(this.panel.webview);
    } else {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
    }

    this.updatePanelTitle();
    this.postUpdate();
  }

  public dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
    this.currentDocument = undefined;

    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  public async zoomIn(): Promise<void> {
    await this.sendControl('zoomIn');
  }

  public async zoomOut(): Promise<void> {
    await this.sendControl('zoomOut');
  }

  public async resetView(): Promise<void> {
    await this.sendControl('resetView');
  }

  public async exportSvg(): Promise<void> {
    await this.sendControl('exportSvg');
  }

  public async exportPng(): Promise<void> {
    await this.sendControl('exportPng');
  }

  private async resolveDocument(
    resource?: vscode.Uri
  ): Promise<vscode.TextDocument | undefined> {
    if (resource) {
      const document = await vscode.workspace.openTextDocument(resource);
      if (isMermaidDocument(document)) {
        return document;
      }
    }

    return getActiveMermaidDocument();
  }

  private refresh(document: vscode.TextDocument): void {
    if (!this.panel || !isMermaidDocument(document)) {
      return;
    }

    this.currentDocument = document;
    this.updatePanelTitle();
    this.postUpdate();
  }

  private postUpdate(): void {
    if (!this.panel) {
      return;
    }

    const message: PreviewMessage = {
      type: 'update',
      payload: this.createPayload()
    };

    void this.panel.webview.postMessage(message);
  }

  private async sendControl(action: PreviewControlAction): Promise<void> {
    const ready = await this.ensurePreviewPanel();
    if (!ready || !this.panel) {
      return;
    }

    const message: ControlMessage = {
      type: 'control',
      payload: {
        action
      }
    };

    void this.panel.webview.postMessage(message);
  }

  private updatePanelTitle(): void {
    if (!this.panel) {
      return;
    }

    const label = this.currentDocument
      ? getDocumentLabel(this.currentDocument)
      : 'No Mermaid document';
    this.panel.title = `Mermaid Preview: ${label}`;
  }

  private createPayload(): PreviewPayload {
    return {
      source: this.currentDocument?.getText() ?? '',
      documentLabel: this.currentDocument
        ? getDocumentLabel(this.currentDocument)
        : 'No Mermaid document selected',
      theme: getConfiguredTheme(),
      hasDocument: Boolean(this.currentDocument)
    };
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const initialPayload = serializeForScriptTag(this.createPayload());

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mermaid Preview</title>
    <style>
      :root {
        color-scheme: light dark;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr;
        background:
          radial-gradient(circle at top, color-mix(in srgb, var(--vscode-textLink-foreground) 18%, transparent), transparent 45%),
          var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        font-family: var(--vscode-font-family);
      }

      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        padding: 0.9rem 1rem;
        border-bottom: 1px solid var(--vscode-panel-border);
        background: color-mix(in srgb, var(--vscode-sideBar-background) 88%, transparent);
        backdrop-filter: blur(10px);
      }

      .title {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 600;
      }

      .subtitle,
      .status {
        font-size: 0.8rem;
        color: var(--vscode-descriptionForeground);
      }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.45rem;
      }

      .toolbar button {
        appearance: none;
        border: 1px solid color-mix(in srgb, var(--vscode-button-border, var(--vscode-panel-border)) 70%, transparent);
        background: color-mix(in srgb, var(--vscode-button-secondaryBackground) 80%, transparent);
        color: var(--vscode-button-secondaryForeground);
        border-radius: 999px;
        padding: 0.35rem 0.72rem;
        font: inherit;
        font-size: 0.76rem;
        cursor: pointer;
      }

      .toolbar button:hover {
        background: var(--vscode-button-secondaryHoverBackground);
      }

      main {
        min-height: 0;
        overflow: hidden;
        padding: 0.75rem;
      }

      .frame {
        height: 100%;
        min-height: 0;
        border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 80%, transparent);
        border-radius: 18px;
        background: color-mix(in srgb, var(--vscode-editorWidget-background) 92%, transparent);
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.16);
        overflow: hidden;
      }

      #diagram {
        height: 100%;
        min-height: 0;
        padding: 0.75rem;
        overflow: hidden;
        cursor: grab;
        touch-action: none;
      }

      #diagram.is-panning {
        cursor: grabbing;
      }

      #canvas {
        display: inline-block;
        transform-origin: top left;
        will-change: transform;
      }

      #canvas svg {
        display: block;
        max-width: none;
        height: auto;
      }

      .placeholder,
      .error {
        max-width: 44rem;
        margin: 0 auto;
        padding: 1rem 1.1rem;
        border-radius: 14px;
        white-space: pre-wrap;
      }

      .placeholder {
        border: 1px dashed color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
        background: color-mix(in srgb, var(--vscode-editor-background) 85%, transparent);
      }

      .error {
        border: 1px solid color-mix(in srgb, var(--vscode-errorForeground) 45%, transparent);
        color: var(--vscode-errorForeground);
        background: color-mix(in srgb, var(--vscode-inputValidation-errorBackground) 80%, transparent);
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <p class="title">Local Mermaid Preview</p>
        <div class="subtitle" id="subtitle"></div>
      </div>
      <div class="toolbar" id="toolbar">
        <button type="button" data-action="zoomOut">-</button>
        <button type="button" data-action="resetView">Reset</button>
        <button type="button" data-action="zoomIn">+</button>
        <button type="button" data-action="exportSvg">SVG</button>
        <button type="button" data-action="exportPng">PNG</button>
        <div class="status" id="status">Waiting for a Mermaid document</div>
      </div>
    </header>
    <main>
      <div class="frame">
        <div id="diagram"><div id="canvas"></div></div>
      </div>
    </main>
    <script nonce="${nonce}">
      window.__MERMAID_VISUALISER_STATE__ = ${initialPayload};
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private isTracking(document: vscode.TextDocument): boolean {
    return this.currentDocument?.uri.toString() === document.uri.toString();
  }

  private updateStatusBar(document: vscode.TextDocument | undefined): void {
    if (isMermaidDocument(document)) {
      this.statusBarItem.show();
      return;
    }

    this.statusBarItem.hide();
  }

  private async ensurePreviewPanel(): Promise<boolean> {
    if (this.panel) {
      return true;
    }

    const document = getActiveMermaidDocument();
    if (document) {
      await this.open(document.uri);
      return Boolean(this.panel);
    }

    await vscode.window.showErrorMessage(
      'Open a Mermaid document and preview it before using preview controls.'
    );
    return false;
  }

  private async onDidReceiveMessage(
    message: WebviewToExtensionMessage
  ): Promise<void> {
    if (message.type !== 'save') {
      return;
    }

    await this.saveExport(message.payload.format, message.payload.data);
  }

  private async saveExport(
    format: ExportFormat,
    data: string
  ): Promise<void> {
    const target = await vscode.window.showSaveDialog({
      defaultUri: this.getSuggestedExportUri(format),
      filters:
        format === 'svg'
          ? { 'SVG Image': ['svg'] }
          : { 'PNG Image': ['png'] }
    });

    if (!target) {
      return;
    }

    const contents =
      format === 'svg'
        ? new TextEncoder().encode(data)
        : Uint8Array.from(Buffer.from(data, 'base64'));

    await vscode.workspace.fs.writeFile(target, contents);
    void vscode.window.showInformationMessage(
      `Exported Mermaid diagram to ${path.basename(target.fsPath)}`
    );
  }

  private getSuggestedExportUri(format: ExportFormat): vscode.Uri | undefined {
    if (this.currentDocument?.uri.scheme === 'file') {
      const extension = format === 'svg' ? '.svg' : '.png';
      const baseName = path.parse(this.currentDocument.fileName).name;
      return vscode.Uri.file(
        path.join(path.dirname(this.currentDocument.fileName), `${baseName}${extension}`)
      );
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder || workspaceFolder.uri.scheme !== 'file') {
      return undefined;
    }

    return vscode.Uri.file(
      path.join(
        workspaceFolder.uri.fsPath,
        `mermaid-diagram.${format === 'svg' ? 'svg' : 'png'}`
      )
    );
  }
}

function getActiveMermaidDocument(): vscode.TextDocument | undefined {
  const document = vscode.window.activeTextEditor?.document;
  return isMermaidDocument(document) ? document : undefined;
}

function isMermaidDocument(
  document: vscode.TextDocument | undefined
): document is vscode.TextDocument {
  if (!document) {
    return false;
  }

  if (document.languageId === 'mermaid') {
    return true;
  }

  if (document.uri.scheme !== 'file') {
    return false;
  }

  return supportedExtensions.has(path.extname(document.uri.fsPath).toLowerCase());
}

function getDocumentLabel(document: vscode.TextDocument): string {
  if (document.isUntitled) {
    return document.fileName;
  }

  return path.basename(document.fileName);
}

function getConfiguredTheme(): MermaidTheme {
  const config = vscode.workspace.getConfiguration('mermaidVisualiser');
  const prefersDark =
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight;

  const configuredTheme = config.get<string>(
    prefersDark ? 'darkTheme' : 'lightTheme',
    prefersDark ? 'dark' : 'default'
  );

  return supportedThemes.has(configuredTheme ?? '')
    ? (configuredTheme as MermaidTheme)
    : prefersDark
      ? 'dark'
      : 'default';
}

function serializeForScriptTag(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function getNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';

  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return nonce;
}