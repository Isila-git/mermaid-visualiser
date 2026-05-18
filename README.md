# Mermaid Visualiser

Local Mermaid preview extension for VS Code.

## Why this exists

There are already open-source Mermaid extensions in the ecosystem, but they solve different problems:

- `mjbvz/vscode-markdown-mermaid` is MIT-licensed and the strongest reference for Markdown and notebook rendering.
- `tomoyukim/vscode-mermaid-editor` is MIT-licensed and the strongest reference for a standalone local preview and export workflow.
- `Mermaid-Chart/vscode-mermaid-chart` is also MIT-licensed, but it mixes local preview with cloud, analytics, and AI-oriented features that are outside the scope of this initial local-first build.

This MVP follows the smallest useful path:

- local-only rendering
- `.mmd`, `.mermaid`, and `mermaid` language documents
- side-by-side preview command
- live refresh while editing
- theme switching based on VS Code light and dark themes
- toolbar controls for zoom, reset, and export
- Markdown fenced-block rendering in the built-in Markdown preview
- basic Mermaid grammar and snippets for editing

## Development

```bash
npm install
npm run compile
```

Then press `F5` in VS Code to launch the extension host.

For a local unpacked install, copy the workspace into your VS Code extensions folder as `localdev.mermaid-visualiser-0.0.1`, then reload VS Code.

## Current scope

Implemented now:

- open a Mermaid preview from the command palette, editor title, or Explorer context menu
- live update the preview when the tracked Mermaid document changes
- follow the active Mermaid editor when switching between Mermaid files
- zoom, pan, and reset controls in the preview panel
- export the current preview to SVG or PNG
- render fenced Mermaid blocks inside the built-in Markdown preview
- basic Mermaid grammar contribution for `.mmd` and `.mermaid`
- starter snippets for flowchart, sequence, class, state, and ER diagrams
- basic Mermaid theme configuration for the standalone preview

Deferred for later:

- notebook rendering
- richer grammar coverage across all Mermaid dialects
- packaging and Marketplace publishing

## Quick test files

- Open [example.mmd](./example.mmd) and run `Mermaid Visualiser: Open Preview`.
- Open [example.md](./example.md) and use `Markdown: Open Preview to the Side` to verify fenced-block rendering.