import mermaid from 'mermaid';

const vscode = acquireVsCodeApi();

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

declare global {
  interface Window {
    __MERMAID_VISUALISER_STATE__?: PreviewPayload;
  }
}

const diagram = document.getElementById('diagram');
const canvas = document.getElementById('canvas');
const subtitle = document.getElementById('subtitle');
const status = document.getElementById('status');
const toolbar = document.getElementById('toolbar');

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;
const ZOOM_FACTOR = 1.2;

let renderSequence = 0;
let state = window.__MERMAID_VISUALISER_STATE__ ?? {
  source: '',
  documentLabel: 'No Mermaid document selected',
  theme: 'default' as MermaidTheme,
  hasDocument: false
};

let activeDocumentLabel = state.documentLabel;
let scale = 1;
let translateX = 0;
let translateY = 0;
let manualView = false;
let panningPointerId: number | undefined;
let panStartX = 0;
let panStartY = 0;
let panInitialX = 0;
let panInitialY = 0;

toolbar?.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest<HTMLButtonElement>('button[data-action]');
  if (!button) {
    return;
  }

  handleAction(button.dataset.action as PreviewControlAction);
});

diagram?.addEventListener('pointerdown', event => {
  if (!(event.target instanceof Element) || !canvas?.querySelector('svg')) {
    return;
  }

  panningPointerId = event.pointerId;
  panStartX = event.clientX;
  panStartY = event.clientY;
  panInitialX = translateX;
  panInitialY = translateY;
  manualView = true;
  diagram.classList.add('is-panning');
  diagram.setPointerCapture(event.pointerId);
});

diagram?.addEventListener('pointermove', event => {
  if (panningPointerId !== event.pointerId) {
    return;
  }

  translateX = panInitialX + (event.clientX - panStartX);
  translateY = panInitialY + (event.clientY - panStartY);
  applyTransform();
});

diagram?.addEventListener('pointerup', endPan);
diagram?.addEventListener('pointercancel', endPan);

diagram?.addEventListener(
  'wheel',
  event => {
    if (!event.ctrlKey && !event.altKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    zoomAt(direction, event.offsetX, event.offsetY);
  },
  { passive: false }
);

window.addEventListener('message', event => {
  const message = event.data as PreviewMessage | ControlMessage | undefined;
  if (!message) {
    return;
  }

  if (message.type === 'update') {
    state = message.payload;
    void render(state);
    return;
  }

  handleAction(message.payload.action);
});

void render(state);

async function render(payload: PreviewPayload): Promise<void> {
  subtitle!.textContent = payload.documentLabel;

  const isNewDocument = payload.documentLabel !== activeDocumentLabel;
  activeDocumentLabel = payload.documentLabel;
  if (isNewDocument) {
    manualView = false;
  }

  if (!payload.hasDocument) {
    renderMessage('placeholder', 'Open a Mermaid document and run the preview command.');
    status!.textContent = 'Waiting for a Mermaid document';
    return;
  }

  if (!payload.source.trim()) {
    renderMessage('placeholder', 'The current Mermaid document is empty.');
    status!.textContent = 'Ready';
    return;
  }

  status!.textContent = `Rendering with theme: ${payload.theme}`;

  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: payload.theme
    });

    await mermaid.parse(payload.source, { suppressErrors: false });

    const renderResult = await mermaid.render(
      `mermaid-visualiser-${renderSequence++}`,
      payload.source
    );

    canvas!.innerHTML = renderResult.svg;
    renderResult.bindFunctions?.(canvas!);
    if (!manualView) {
      requestAnimationFrame(() => fitToViewport());
    } else {
      applyTransform();
    }
    status!.textContent = 'Live preview';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderMessage('error', message);
    status!.textContent = 'Render failed';
  }
}

function renderMessage(kind: 'error' | 'placeholder', text: string): void {
  const element = document.createElement(kind === 'error' ? 'pre' : 'div');
  element.className = kind;
  element.textContent = text;
  canvas!.replaceChildren(element);
  scale = 1;
  translateX = 0;
  translateY = 0;
  applyTransform();
}

function handleAction(action: PreviewControlAction): void {
  switch (action) {
    case 'zoomIn':
      zoomAt(ZOOM_FACTOR);
      return;
    case 'zoomOut':
      zoomAt(1 / ZOOM_FACTOR);
      return;
    case 'resetView':
      manualView = false;
      fitToViewport();
      return;
    case 'exportSvg':
      void exportDiagram('svg');
      return;
    case 'exportPng':
      void exportDiagram('png');
      return;
    default:
      return;
  }
}

function applyTransform(): void {
  canvas!.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

function fitToViewport(): void {
  const svg = canvas?.querySelector('svg');
  if (!svg || !diagram) {
    return;
  }

  const { width, height } = getSvgDimensions(svg);
  const viewportRect = diagram.getBoundingClientRect();

  const fittedScale = clamp(
    Math.min(
      Math.max((viewportRect.width - 48) / width, 0.1),
      Math.max((viewportRect.height - 48) / height, 0.1),
      1
    ),
    MIN_SCALE,
    MAX_SCALE
  );

  scale = fittedScale;
  translateX = Math.max((viewportRect.width - width * scale) / 2, 0);
  translateY = Math.max((viewportRect.height - height * scale) / 2, 0);
  applyTransform();
}

function zoomAt(factor: number, focusX?: number, focusY?: number): void {
  if (!diagram || !canvas?.querySelector('svg')) {
    return;
  }

  const viewportRect = diagram.getBoundingClientRect();
  const anchorX = focusX ?? viewportRect.width / 2;
  const anchorY = focusY ?? viewportRect.height / 2;
  const nextScale = clamp(scale * factor, MIN_SCALE, MAX_SCALE);

  if (nextScale === scale) {
    return;
  }

  const worldX = (anchorX - translateX) / scale;
  const worldY = (anchorY - translateY) / scale;
  scale = nextScale;
  translateX = anchorX - worldX * scale;
  translateY = anchorY - worldY * scale;
  manualView = true;
  applyTransform();
}

function endPan(event: PointerEvent): void {
  if (panningPointerId !== event.pointerId) {
    return;
  }

  panningPointerId = undefined;
  diagram?.classList.remove('is-panning');
}

async function exportDiagram(format: ExportFormat): Promise<void> {
  const svg = canvas?.querySelector('svg');
  if (!svg) {
    status!.textContent = 'Nothing to export';
    return;
  }

  const svgText = serializeSvg(svg);
  if (format === 'svg') {
    vscode.postMessage({
      type: 'save',
      payload: {
        format,
        data: svgText
      }
    });
    return;
  }

  const pngData = await rasterizeSvg(svgText, getSvgDimensions(svg));
  vscode.postMessage({
    type: 'save',
    payload: {
      format,
      data: pngData
    }
  });
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  return new XMLSerializer().serializeToString(clone);
}

async function rasterizeSvg(
  svgText: string,
  dimensions: { width: number; height: number }
): Promise<string> {
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(url);
    const canvasElement = document.createElement('canvas');
    const ratio = window.devicePixelRatio || 1;
    canvasElement.width = Math.max(1, Math.ceil(dimensions.width * ratio));
    canvasElement.height = Math.max(1, Math.ceil(dimensions.height * ratio));

    const context = canvasElement.getContext('2d');
    if (!context) {
      throw new Error('Could not create a PNG export canvas.');
    }

    context.scale(ratio, ratio);
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
    return canvasElement.toDataURL('image/png').split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not rasterize the SVG export.'));
    image.src = url;
  });
}

function getSvgDimensions(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.viewBox.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return {
      width: viewBox.width,
      height: viewBox.height
    };
  }

  const widthAttr = Number.parseFloat(svg.getAttribute('width') ?? '');
  const heightAttr = Number.parseFloat(svg.getAttribute('height') ?? '');

  return {
    width: Number.isFinite(widthAttr) && widthAttr > 0 ? widthAttr : 1200,
    height: Number.isFinite(heightAttr) && heightAttr > 0 ? heightAttr : 800
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}