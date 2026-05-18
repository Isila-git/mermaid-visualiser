import * as vscode from 'vscode';
import { extendMarkdownIt } from './markdownIt';
import { MermaidPreviewController } from './previewController';

let controller: MermaidPreviewController | undefined;

export function activate(context: vscode.ExtensionContext) {
  controller = new MermaidPreviewController(context);

  context.subscriptions.push(
    controller,
    vscode.workspace.onDidChangeConfiguration(event => {
      if (
        event.affectsConfiguration('mermaidVisualiser') ||
        event.affectsConfiguration('workbench.colorTheme')
      ) {
        void vscode.commands.executeCommand('markdown.preview.refresh');
      }
    }),
    vscode.commands.registerCommand(
      'mermaidVisualiser.openPreview',
      async (resource?: vscode.Uri) => controller?.open(resource)
    ),
    vscode.commands.registerCommand('mermaidVisualiser.zoomIn', async () =>
      controller?.zoomIn()
    ),
    vscode.commands.registerCommand('mermaidVisualiser.zoomOut', async () =>
      controller?.zoomOut()
    ),
    vscode.commands.registerCommand('mermaidVisualiser.resetView', async () =>
      controller?.resetView()
    ),
    vscode.commands.registerCommand('mermaidVisualiser.exportSvg', async () =>
      controller?.exportSvg()
    ),
    vscode.commands.registerCommand('mermaidVisualiser.exportPng', async () =>
      controller?.exportPng()
    )
  );

  return {
    extendMarkdownIt(md: unknown) {
      return extendMarkdownIt(md);
    }
  };
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}