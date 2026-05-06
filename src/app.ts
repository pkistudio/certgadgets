import './styles.css';
import PkiStudio, { type PkiStudioViewerInstance } from 'pkistudiojs/viewer';
import {
  CertGadgetsCore,
  type CertificateDocument,
  type CertificateTreeNode,
  type NetworkValidationPlan
} from './core';

const PKISTUDIO_OIDS_URL = new URL('../node_modules/pkistudiojs/app/static/oids.json', import.meta.url).href;

declare global {
  interface Window {
    CertGadgetsCore?: typeof CertGadgetsCore;
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>;
  }
}

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
};

type SaveFileHandle = {
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
};

export type AppTheme = 'light' | 'dark';

export type CertificateGadgetsHost = {
  confirmNetworkAccess?: (request: NetworkValidationPlan) => boolean | Promise<boolean>;
  fetchNetworkResource?: (request: NetworkValidationPlan) => Promise<{ status: number; byteLength: number }>;
};

export type InitCertificateGadgetsOptions = {
  mount?: string | Element;
  theme?: AppTheme;
  host?: CertificateGadgetsHost;
  certificate?: {
    bytes: Uint8Array;
    sourceName?: string;
  };
};

export type CertificateGadgetsAppInstance = {
  readonly certificates: readonly CertificateDocument[];
  readonly selectedNode: CertificateTreeNode | null;
  loadDemoCertificate: () => void;
  loadCertificateBytes: (bytes: Uint8Array, sourceName?: string) => void;
  close: () => void;
};

const MAX_LOG_ENTRIES = 200;

if (typeof window !== 'undefined') window.CertGadgetsCore = CertGadgetsCore;

export function initCertificateGadgets(options: InitCertificateGadgetsOptions = {}): CertificateGadgetsAppInstance {
  const app = resolveMount(options.mount ?? '#app');

  app.innerHTML = `
    <main class="shell">
      <nav class="toolbar" aria-label="Application">
        <strong>Certificate Gadgets</strong>
        <button id="aboutButton" type="button">About</button>
      </nav>
      <section class="workspace">
        <section class="panel certificate-panel" aria-label="Certificates">
          <nav class="certificate-menu" aria-label="Certificate actions">
            <button id="loadDemoButton" type="button">Demo</button>
            <div class="menu-group">
              <button id="toggleLoadMenuButton" type="button" aria-haspopup="menu" aria-expanded="false">Load</button>
              <div id="loadMenu" class="submenu" role="menu" hidden>
                <button id="loadFromFileButton" type="button" role="menuitem">from File</button>
                <button id="loadClipboardPemButton" type="button" role="menuitem">from Clipboard as PEM</button>
                <button id="loadClipboardHexButton" type="button" role="menuitem">from Clipboard as HEX</button>
              </div>
            </div>
            <div class="menu-group">
              <button id="toggleSaveMenuButton" type="button" aria-haspopup="menu" aria-expanded="false">Save</button>
              <div id="saveMenu" class="submenu" role="menu" hidden>
                <button id="saveDerFileButton" type="button" role="menuitem">to File as DER</button>
                <button id="savePemFileButton" type="button" role="menuitem">to File as PEM</button>
              </div>
            </div>
            <button id="closeDocumentButton" type="button">Close</button>
            <button id="onlineCheckButton" type="button">Online Check</button>
            <input id="certificateInput" class="visually-hidden" type="file" accept=".cer,.crt,.der,.pem,application/pkix-cert,application/x-x509-ca-cert" />
          </nav>
          <section class="certificate-card">
            <div id="certificateTree" class="tree empty">No certificate loaded yet.</div>
            <p id="formNotice" class="notice">Load a certificate or use the demo to inspect the planned UI flow.</p>
          </section>
        </section>
        <div id="paneResizer" class="pane-resizer" role="separator" aria-label="Resize panes" aria-orientation="vertical" tabindex="0"></div>
        <section id="detailPane" class="detail-panel" aria-label="Selected certificate item">
          <div id="detailContent" class="detail-content"></div>
          <div id="viewerMount" class="pkistudio-viewer-mount" hidden></div>
        </section>
      </section>
      <div id="apiLogResizer" class="api-log-resizer" role="separator" aria-label="Resize operation log" aria-orientation="horizontal" tabindex="0"></div>
      <section class="api-log-panel panel" aria-label="Operation log">
        <header class="api-log-header">
          <button id="clearApiLogButton" type="button">Clear</button>
        </header>
        <div id="apiLogList" class="api-log-list" role="log" aria-live="polite" aria-relevant="additions"></div>
      </section>
      <dialog id="aboutDialog" class="about-dialog">
        <section class="about-panel" role="document">
          <p class="about-name">Certificate Gadgets</p>
          <p class="about-version">Version ${CertGadgetsCore.version}</p>
          <p class="about-detail">Certificate investigation UI prototype for PKI Studio.</p>
          <div class="dialog-actions">
            <button id="closeAboutButton" type="button">Close</button>
          </div>
        </section>
      </dialog>
    </main>
  `;

  const aboutButton = query<HTMLButtonElement>(app, '#aboutButton');
  const aboutDialog = query<HTMLDialogElement>(app, '#aboutDialog');
  const closeAboutButton = query<HTMLButtonElement>(app, '#closeAboutButton');
  const loadDemoButton = query<HTMLButtonElement>(app, '#loadDemoButton');
  const toggleLoadMenuButton = query<HTMLButtonElement>(app, '#toggleLoadMenuButton');
  const toggleSaveMenuButton = query<HTMLButtonElement>(app, '#toggleSaveMenuButton');
  const loadMenu = query<HTMLDivElement>(app, '#loadMenu');
  const saveMenu = query<HTMLDivElement>(app, '#saveMenu');
  const loadFromFileButton = query<HTMLButtonElement>(app, '#loadFromFileButton');
  const loadClipboardPemButton = query<HTMLButtonElement>(app, '#loadClipboardPemButton');
  const loadClipboardHexButton = query<HTMLButtonElement>(app, '#loadClipboardHexButton');
  const saveDerFileButton = query<HTMLButtonElement>(app, '#saveDerFileButton');
  const savePemFileButton = query<HTMLButtonElement>(app, '#savePemFileButton');
  const closeDocumentButton = query<HTMLButtonElement>(app, '#closeDocumentButton');
  const onlineCheckButton = query<HTMLButtonElement>(app, '#onlineCheckButton');
  const certificateInput = query<HTMLInputElement>(app, '#certificateInput');
  const certificateTree = query<HTMLElement>(app, '#certificateTree');
  const detailContent = query<HTMLElement>(app, '#detailContent');
  const viewerMount = query<HTMLElement>(app, '#viewerMount');
  const formNotice = query<HTMLElement>(app, '#formNotice');
  const workspace = query<HTMLElement>(app, '.workspace');
  const paneResizer = query<HTMLElement>(app, '#paneResizer');
  const apiLogResizer = query<HTMLElement>(app, '#apiLogResizer');
  const apiLogPanel = query<HTMLElement>(app, '.api-log-panel');
  const apiLogList = query<HTMLElement>(app, '#apiLogList');
  const clearApiLogButton = query<HTMLButtonElement>(app, '#clearApiLogButton');

  let certificateDocuments: CertificateDocument[] = [];
  let selectedNodeId: string | null = null;
  let viewer: PkiStudioViewerInstance | null = null;

  applyRequestedTheme(options.theme);
  setupPaneResizer(workspace, paneResizer);
  setupApiLogResizer(app, workspace, apiLogPanel, apiLogList, apiLogResizer);
  bootViewer();
  logOperation(apiLogList, 'ready', 'Waiting for certificate activity.');
  renderEmptyDetail(detailContent);
  updateActions();
  if (options.certificate) loadCertificateBytes(options.certificate.bytes, options.certificate.sourceName ?? 'external.der');

  aboutButton.addEventListener('click', () => {
    aboutDialog.showModal();
    closeAboutButton.focus();
  });

  closeAboutButton.addEventListener('click', () => aboutDialog.close());

  clearApiLogButton.addEventListener('click', () => {
    apiLogList.replaceChildren();
    logOperation(apiLogList, 'clear', 'Operation log cleared.');
  });

  loadDemoButton.addEventListener('click', () => loadCertificate(CertGadgetsCore.createDemoCertificate(), 'Demo certificate loaded.'));

  toggleLoadMenuButton.addEventListener('click', () => toggleTopMenu(loadMenu, toggleLoadMenuButton, saveMenu, toggleSaveMenuButton));
  toggleSaveMenuButton.addEventListener('click', () => toggleTopMenu(saveMenu, toggleSaveMenuButton, loadMenu, toggleLoadMenuButton));
  loadFromFileButton.addEventListener('click', () => {
    hideTopMenus();
    certificateInput.click();
  });
  loadClipboardPemButton.addEventListener('click', async () => {
    hideTopMenus();
    await loadCertificateFromClipboard('pem');
  });
  loadClipboardHexButton.addEventListener('click', async () => {
    hideTopMenus();
    await loadCertificateFromClipboard('hex');
  });
  saveDerFileButton.addEventListener('click', async () => {
    hideTopMenus();
    await saveSelectedDerFile();
  });
  savePemFileButton.addEventListener('click', async () => {
    hideTopMenus();
    await saveSelectedCertificatePemFile();
  });
  closeDocumentButton.addEventListener('click', () => {
    hideTopMenus();
    closeLoadedCertificates();
  });

  certificateInput.addEventListener('change', async () => {
    const [file] = certificateInput.files ?? [];
    certificateInput.value = '';
    if (!file) return;
    await loadCertificateFile(file);
  });

  onlineCheckButton.addEventListener('click', async () => {
    const selectedCertificate = getSelectedCertificate();
    if (!selectedCertificate) return;
    await runOnlineCheck(selectedCertificate);
  });

  certificateTree.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-node-id]') : null;
    if (!button) return;
    selectNode(button.dataset.nodeId ?? '');
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node) || app.contains(event.target)) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.menu-group')) return;
    }
    hideTopMenus();
  });

  function bootViewer(): void {
    try {
      viewer = PkiStudio.init({ mount: viewerMount, oidUrl: PKISTUDIO_OIDS_URL });
      applyEmbeddedViewerStyles(viewer);
      logOperation(apiLogList, 'pkistudiojs.init', `Viewer ${PkiStudio.version ?? '(unknown version)'} mounted.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logOperation(apiLogList, 'pkistudiojs.init', message, 'error');
    }
  }

  async function loadCertificateFile(file: File): Promise<void> {
    setNotice(`Opening ${file.name}...`);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      logOperation(apiLogList, 'File.read', `Read ${file.name} (${bytes.byteLength} bytes).`);
      tryLoadCertificateBytes(bytes, file.name, `Loaded ${file.name}.`, 'File.validate');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(message, true);
      logOperation(apiLogList, 'File.read', message, 'error');
    }
  }

  async function loadCertificateFromClipboard(format: 'pem' | 'hex'): Promise<void> {
    try {
      const text = await readTextFromClipboard();
      const bytes = format === 'pem' ? new TextEncoder().encode(text) : hexToBytes(text);
      logOperation(apiLogList, `Clipboard.readText.${format.toUpperCase()}`, `Read ${text.length} characters.`);
      tryLoadCertificateBytes(bytes, `clipboard.${format}`, `Loaded certificate from clipboard ${format.toUpperCase()}.`, `Clipboard.validate.${format.toUpperCase()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice(message, true);
      logOperation(apiLogList, `Clipboard.readText.${format.toUpperCase()}`, message, 'error');
    }
  }

  function loadCertificate(document: CertificateDocument, notice: string): void {
    const previousDocument = certificateDocuments[0] ?? null;
    if (previousDocument) {
      viewer?.close();
      logOperation(apiLogList, 'Certificate.close', `${previousDocument.sourceName} was closed before loading ${document.sourceName}.`);
    }
    certificateDocuments = [document];
    selectedNodeId = document.root.id;
    renderCertificateTree();
    showSelectedNode();
    setNotice(notice);
    logOperation(apiLogList, 'Certificate.load', `${document.sourceName} loaded as the only certificate item (${document.size} bytes).`);
    updateActions();
  }

  function loadCertificateBytes(bytes: Uint8Array, sourceName = 'external.der'): void {
    tryLoadCertificateBytes(bytes, sourceName, `Loaded ${sourceName}.`, 'Certificate.validate');
  }

  function tryLoadCertificateBytes(bytes: Uint8Array, sourceName: string, notice: string, operation: string): boolean {
    try {
      const document = CertGadgetsCore.createCertificateFromBytes(bytes, sourceName);
      logOperation(apiLogList, operation, `${sourceName} was accepted as an X.509 certificate.`);
      loadCertificate(document, notice);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const message = `${sourceName} is not a readable X.509 certificate.`;
      setNotice(message, true);
      logOperation(apiLogList, operation, `${message} ${detail}`, 'error');
      return false;
    }
  }

  function closeLoadedCertificates(): void {
    certificateDocuments = [];
    selectedNodeId = null;
    renderCertificateTree();
    viewer?.close();
    showDetailContent();
    renderEmptyDetail(detailContent);
    setNotice('Closed loaded certificates.');
    logOperation(apiLogList, 'Certificate.close', 'Closed all loaded certificate documents.');
    updateActions();
  }

  async function saveSelectedDerFile(): Promise<void> {
    const node = selectedNodeId ? findNode(selectedNodeId) : null;
    const bytes = node?.derBytes;
    if (!node || !bytes) {
      setNotice('Select a DER-backed certificate item before saving.', true);
      logOperation(apiLogList, 'DER.save', 'No DER-backed tree item was selected.', 'error');
      return;
    }
    const filename = `${node.label.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'certificate-item'}.der`;
    await saveBytesToFile(bytes, filename);
    setNotice(`Saved ${node.label} as ${filename}.`);
    logOperation(apiLogList, 'DER.save', `Saved ${node.label} (${bytes.byteLength} bytes).`);
  }

  async function saveSelectedCertificatePemFile(): Promise<void> {
    const document = getSelectedCertificate();
    const bytes = document?.root.derBytes;
    if (!document || !bytes) {
      setNotice('Load a certificate before saving PEM.', true);
      logOperation(apiLogList, 'PEM.save', 'No certificate was loaded.', 'error');
      return;
    }
    const filename = `${createSafeFileBase(document.sourceName || document.label) || 'certificate'}.pem`;
    await saveTextToFile(derToPem(bytes), filename, 'application/x-pem-file', [{ description: 'PEM files', accept: { 'application/x-pem-file': ['.pem', '.crt', '.cer'] } }]);
    setNotice(`Saved ${document.label} as ${filename}.`);
    logOperation(apiLogList, 'PEM.save', `Saved ${document.sourceName} as PEM (${bytes.byteLength} DER bytes).`);
  }

  async function runOnlineCheck(document: CertificateDocument): Promise<void> {
    const plans = CertGadgetsCore.collectNetworkValidationPlans(document);
    if (plans.length === 0) {
      setNotice('No network validation resources were found for the selected certificate.');
      logOperation(apiLogList, 'Network.plan', 'No CRL, OCSP, AIA, or issuer URLs are available.');
      return;
    }

    setNotice(`Running ${plans.length} explicit network-assisted check${plans.length === 1 ? '' : 's'}...`);
    for (const plan of plans) {
      logOperation(apiLogList, 'Network.request', `${plan.reason}: ${plan.url}`);
      const confirmed = await confirmNetworkAccess(plan);
      if (!confirmed) {
        logOperation(apiLogList, 'Network.blocked', `${plan.url} was not requested.`, 'error');
        continue;
      }

      try {
        const result = await fetchNetworkResource(plan);
        logOperation(apiLogList, plan.operation, `${plan.url} -> status ${result.status}, ${result.byteLength} bytes.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logOperation(apiLogList, plan.operation, `${plan.url} -> ${message}`, 'error');
      }
    }
    setNotice('Network-assisted checks finished. See the operation log for every attempted access.');
  }

  async function confirmNetworkAccess(plan: NetworkValidationPlan): Promise<boolean> {
    if (options.host?.confirmNetworkAccess) return Boolean(await options.host.confirmNetworkAccess(plan));
    return window.confirm(`Allow network access for ${plan.reason}?\n\n${plan.url}`);
  }

  async function fetchNetworkResource(plan: NetworkValidationPlan): Promise<{ status: number; byteLength: number }> {
    if (options.host?.fetchNetworkResource) return options.host.fetchNetworkResource(plan);
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    return { status: 200, byteLength: plan.url.length * 37 };
  }

  function renderCertificateTree(): void {
    if (certificateDocuments.length === 0) {
      certificateTree.className = 'tree empty';
      certificateTree.textContent = 'No certificate loaded yet.';
      return;
    }

    certificateTree.className = 'tree';
    certificateTree.innerHTML = certificateDocuments.map((document) => renderTreeNode(document.root, 0, selectedNodeId)).join('');
  }

  function selectNode(nodeId: string): void {
    if (!findNode(nodeId)) return;
    selectedNodeId = nodeId;
    renderCertificateTree();
    showSelectedNode();
    updateActions();
  }

  function showSelectedNode(): void {
    const node = selectedNodeId ? findNode(selectedNodeId) : null;
    if (!node) {
      showDetailContent();
      renderEmptyDetail(detailContent);
      return;
    }

    if (node.view === 'der') showDerViewer(node);
    else {
      showDetailContent();
      if (node.view === 'summary') renderSummaryDetail(detailContent, node);
      else if (node.view === 'extension') renderExtensionDetail(detailContent, node);
      else if (node.view === 'validation') renderValidationDetail(detailContent, node);
      else if (node.view === 'network') renderNetworkDetail(detailContent, node);
    }
  }

  function updateActions(): void {
    onlineCheckButton.disabled = certificateDocuments.length === 0;
    saveDerFileButton.disabled = !Boolean(selectedNodeId && findNode(selectedNodeId)?.derBytes);
    savePemFileButton.disabled = certificateDocuments.length === 0;
    closeDocumentButton.disabled = certificateDocuments.length === 0;
  }

  function showDerViewer(node: CertificateTreeNode): void {
    const bytes = node.derBytes;
    if (!bytes || !viewer) {
      showDetailContent();
      renderSummaryDetail(detailContent, node);
      return;
    }
    detailContent.hidden = true;
    viewerMount.hidden = false;
    viewer.loadBytes(bytes, `${node.label} (${bytes.byteLength} bytes)`);
    logOperation(apiLogList, 'pkistudiojs.loadBytes', `${node.label} (${bytes.byteLength} bytes).`);
  }

  function showDetailContent(): void {
    viewerMount.hidden = true;
    detailContent.hidden = false;
  }

  function getSelectedCertificate(): CertificateDocument | null {
    const nodeId = selectedNodeId;
    if (!nodeId) return certificateDocuments[0] ?? null;
    return certificateDocuments.find((document) => Boolean(findNodeInTree(document.root, nodeId))) ?? certificateDocuments[0] ?? null;
  }

  function findNode(nodeId: string): CertificateTreeNode | null {
    for (const document of certificateDocuments) {
      const node = findNodeInTree(document.root, nodeId);
      if (node) return node;
    }
    return null;
  }

  function setNotice(message: string, isError = false): void {
    formNotice.textContent = message;
    formNotice.classList.toggle('error', isError);
  }

  return {
    get certificates() {
      return certificateDocuments;
    },
    get selectedNode() {
      return selectedNodeId ? findNode(selectedNodeId) : null;
    },
    loadDemoCertificate() {
      loadCertificate(CertGadgetsCore.createDemoCertificate(), 'Demo certificate loaded.');
    },
    loadCertificateBytes,
    close() {
      viewer?.close();
      app.replaceChildren();
    }
  };
}

function renderTreeNode(node: CertificateTreeNode, depth: number, selectedNodeId: string | null): string {
  const selected = node.id === selectedNodeId;
  const hasChildren = Boolean(node.children?.length);
  const iconClass = getTreeIconClass(node, depth, hasChildren);
  const note = node.note ? ` <span class="tree-note">${escapeHtml(node.note)}</span>` : '';
  const children = hasChildren ? `<div class="tree-children">${node.children!.map((child) => renderTreeNode(child, depth + 1, selectedNodeId)).join('')}</div>` : '';
  return `
    <details class="tree-node${hasChildren ? '' : ' tree-leaf'}" open>
      <summary class="tree-row${selected ? ' selected' : ''}">
        <span class="tree-toggle" aria-hidden="true">${hasChildren ? '-' : ''}</span>
        <span class="tree-icon ${iconClass}" aria-hidden="true"></span>
        <button class="tree-item" type="button" data-node-id="${escapeHtml(node.id)}" aria-pressed="${selected}">
          <span class="tree-tag">${escapeHtml(node.label)}${note}</span>
        </button>
      </summary>
      ${children}
    </details>
  `;
}

function getTreeIconClass(node: CertificateTreeNode, depth: number, hasChildren: boolean): string {
  if (node.kind === 'certificate') return 'certificate';
  if (isAttributeNode(node)) return 'attribute';
  return depth === 0 || hasChildren ? 'folder' : 'leaf';
}

function isAttributeNode(node: CertificateTreeNode): boolean {
  return node.kind === 'subject' ||
    node.kind === 'issuer' ||
    node.kind === 'validity' ||
    node.kind === 'public-key' ||
    node.kind === 'signature' ||
    node.kind === 'extension';
}

function renderEmptyDetail(detailPane: HTMLElement): void {
  detailPane.innerHTML = `
    <section class="empty-detail">
      <h1>Certificate investigation</h1>
      <p>Load a certificate to inspect its attributes, extensions, DER data, and validation resources.</p>
    </section>
  `;
}

function renderSummaryDetail(detailPane: HTMLElement, node: CertificateTreeNode): void {
  detailPane.innerHTML = `
    <section class="detail-surface" data-certgadgets-selected-node="${escapeHtml(node.id)}">
      <header class="detail-header">
        <p class="detail-kicker">${escapeHtml(node.kind)}</p>
        <h1>${escapeHtml(node.label)}</h1>
      </header>
      ${renderDetailList(node)}
    </section>
  `;
}

function renderExtensionDetail(detailPane: HTMLElement, node: CertificateTreeNode): void {
  detailPane.innerHTML = `
    <section class="detail-surface" data-certgadgets-selected-node="${escapeHtml(node.id)}">
      <header class="detail-header">
        <p class="detail-kicker">certificate extension</p>
        <h1>${escapeHtml(node.label)}</h1>
      </header>
      ${renderDetailList(node)}
      ${renderDerPreview(node)}
    </section>
  `;
}

function renderValidationDetail(detailPane: HTMLElement, node: CertificateTreeNode): void {
  detailPane.innerHTML = `
    <section class="detail-surface" data-certgadgets-selected-node="${escapeHtml(node.id)}">
      <header class="detail-header">
        <p class="detail-kicker">validation policy</p>
        <h1>${escapeHtml(node.label)}</h1>
      </header>
      ${renderDetailList(node)}
      <div class="policy-box">Network-assisted validation is explicit. Selecting or loading a certificate never performs silent CRL, OCSP, AIA, or issuer-certificate access.</div>
    </section>
  `;
}

function renderNetworkDetail(detailPane: HTMLElement, node: CertificateTreeNode): void {
  detailPane.innerHTML = `
    <section class="detail-surface" data-certgadgets-selected-node="${escapeHtml(node.id)}">
      <header class="detail-header">
        <p class="detail-kicker">network-assisted validation</p>
        <h1>${escapeHtml(node.label)}</h1>
      </header>
      ${renderDetailList(node)}
      <div class="network-target">
        <span>Target</span>
        <code>${escapeHtml(node.networkUrl ?? '(none)')}</code>
      </div>
      <p class="detail-note">Use Online Check to run this class of operation. Every attempted access is recorded in the bottom log pane.</p>
    </section>
  `;
}

function renderDetailList(node: CertificateTreeNode): string {
  const details = node.details ?? [];
  if (details.length === 0) return '<p class="detail-note">No structured details are available yet.</p>';
  return `
    <dl class="detail-list">
      ${details.map((detail) => `<div><dt>${escapeHtml(detail.label)}</dt><dd>${escapeHtml(detail.value)}</dd></div>`).join('')}
    </dl>
  `;
}

function renderDerPreview(node: CertificateTreeNode): string {
  if (!node.derBytes) return '';
  return `<pre class="hex-preview">${escapeHtml(CertGadgetsCore.bytesToHexPreview(node.derBytes))}</pre>`;
}

function toggleTopMenu(openMenu: HTMLElement, openButton: HTMLButtonElement, otherMenu: HTMLElement, otherButton: HTMLButtonElement): void {
  const willOpen = openMenu.hidden;
  otherMenu.hidden = true;
  otherButton.setAttribute('aria-expanded', 'false');
  openMenu.hidden = !willOpen;
  openButton.setAttribute('aria-expanded', String(willOpen));
}

function hideTopMenus(): void {
  for (const menu of document.querySelectorAll<HTMLElement>('.certificate-menu .submenu')) menu.hidden = true;
  for (const button of document.querySelectorAll<HTMLButtonElement>('.certificate-menu [aria-haspopup="menu"]')) button.setAttribute('aria-expanded', 'false');
}

async function readTextFromClipboard(): Promise<string> {
  if (!navigator.clipboard?.readText || !window.isSecureContext) throw new Error('Clipboard reading is not available in this browser context.');
  return navigator.clipboard.readText();
}

function hexToBytes(text: string): Uint8Array {
  const hex = text.replace(/[^0-9a-f]/gi, '');
  if (hex.length === 0 || hex.length % 2 !== 0) throw new Error('Clipboard HEX input must contain an even number of hex digits.');
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

async function saveBytesToFile(bytes: Uint8Array, fileName: string): Promise<void> {
  const blob = new Blob([toArrayBuffer(bytes)], { type: 'application/pkix-cert' });
  await saveBlobToFile(blob, fileName, [{ description: 'DER files', accept: { 'application/octet-stream': ['.der', '.cer'] } }]);
}

async function saveTextToFile(text: string, fileName: string, mimeType: string, types: SaveFilePickerOptions['types']): Promise<void> {
  await saveBlobToFile(new Blob([text], { type: mimeType }), fileName, types);
}

async function saveBlobToFile(blob: Blob, fileName: string, types: SaveFilePickerOptions['types']): Promise<void> {
  if (window.showSaveFilePicker && window.isSecureContext) {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function derToPem(bytes: Uint8Array): string {
  const base64 = bytesToBase64(bytes);
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function createSafeFileBase(value: string): string {
  return value.toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function applyEmbeddedViewerStyles(instance: PkiStudioViewerInstance): void {
  if (!instance.root) return;
  const style = document.createElement('style');
  style.textContent = `
    :host,
    main {
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      overflow: hidden !important;
      background: transparent !important;
    }

    main {
      display: flex !important;
      flex-direction: column !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .card {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      border-right: 0 !important;
      border-left: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }

    .viewer {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      max-height: none !important;
    }
  `;
  if (instance.root instanceof ShadowRoot) instance.root.prepend(style);
  else instance.root.prepend(style);
}

function findNodeInTree(node: CertificateTreeNode, nodeId: string): CertificateTreeNode | null {
  if (node.id === nodeId) return node;
  for (const child of node.children ?? []) {
    const found = findNodeInTree(child, nodeId);
    if (found) return found;
  }
  return null;
}

function logOperation(apiLogList: HTMLElement, operation: string, detail: string, status: 'ok' | 'error' = 'ok'): void {
  const entry = document.createElement('div');
  entry.className = `api-log-entry ${status}`;

  const timestamp = new Date();
  const time = document.createElement('time');
  time.dateTime = timestamp.toISOString();
  time.textContent = formatLogTimestamp(timestamp);

  const operationElement = document.createElement('span');
  operationElement.className = 'api-log-operation';
  operationElement.textContent = operation;

  const detailElement = document.createElement('span');
  detailElement.className = 'api-log-detail';
  detailElement.textContent = detail;

  entry.append(time, operationElement, detailElement);
  apiLogList.append(entry);
  while (apiLogList.childElementCount > MAX_LOG_ENTRIES) apiLogList.firstElementChild?.remove();
  apiLogList.scrollTop = apiLogList.scrollHeight;
}

function formatLogTimestamp(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function setupPaneResizer(workspace: HTMLElement, paneResizer: HTMLElement): void {
  setPaneWidth(workspace, paneResizer, 360, false);

  paneResizer.addEventListener('pointerdown', (event) => {
    if (isSingleColumnLayout()) return;
    event.preventDefault();
    paneResizer.setPointerCapture(event.pointerId);
    workspace.classList.add('resizing');
    setPaneWidthFromPointer(workspace, paneResizer, event.clientX);
  });

  paneResizer.addEventListener('pointermove', (event) => {
    if (!paneResizer.hasPointerCapture(event.pointerId)) return;
    setPaneWidthFromPointer(workspace, paneResizer, event.clientX);
  });

  paneResizer.addEventListener('pointerup', (event) => finishPaneResize(workspace, paneResizer, event));
  paneResizer.addEventListener('pointercancel', (event) => finishPaneResize(workspace, paneResizer, event));
}

function setupApiLogResizer(app: HTMLElement, workspace: HTMLElement, apiLogPanel: HTMLElement, apiLogList: HTMLElement, apiLogResizer: HTMLElement): void {
  setApiLogHeight(workspace, apiLogPanel, apiLogList, apiLogResizer, 140, false);

  apiLogResizer.addEventListener('pointerdown', (event) => {
    if (isSingleColumnLayout()) return;
    event.preventDefault();
    apiLogResizer.setPointerCapture(event.pointerId);
    app.querySelector<HTMLElement>('.shell')?.classList.add('resizing-rows');
    setApiLogHeightFromPointer(workspace, apiLogPanel, apiLogList, apiLogResizer, event.clientY);
  });

  apiLogResizer.addEventListener('pointermove', (event) => {
    if (!apiLogResizer.hasPointerCapture(event.pointerId)) return;
    setApiLogHeightFromPointer(workspace, apiLogPanel, apiLogList, apiLogResizer, event.clientY);
  });

  apiLogResizer.addEventListener('pointerup', (event) => finishApiLogResize(app, apiLogResizer, event));
  apiLogResizer.addEventListener('pointercancel', (event) => finishApiLogResize(app, apiLogResizer, event));
}

function setPaneWidthFromPointer(workspace: HTMLElement, paneResizer: HTMLElement, clientX: number): void {
  const bounds = getPaneWidthBounds(workspace, paneResizer);
  setPaneWidth(workspace, paneResizer, clientX - bounds.left);
}

function setPaneWidth(workspace: HTMLElement, paneResizer: HTMLElement, width: number, persist = true): void {
  const bounds = getPaneWidthBounds(workspace, paneResizer);
  const clampedWidth = Math.round(Math.min(Math.max(width, bounds.min), bounds.max));
  workspace.style.setProperty('--certificate-panel-width', `${clampedWidth}px`);
  paneResizer.setAttribute('aria-valuemin', String(bounds.min));
  paneResizer.setAttribute('aria-valuemax', String(bounds.max));
  paneResizer.setAttribute('aria-valuenow', String(clampedWidth));
  if (persist) localStorage.setItem('certgadgets.certificatePanelWidth', String(clampedWidth));
}

function getPaneWidthBounds(workspace: HTMLElement, paneResizer: HTMLElement): { left: number; min: number; max: number } {
  const style = getComputedStyle(workspace);
  const rect = workspace.getBoundingClientRect();
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const contentWidth = workspace.clientWidth - paddingLeft - paddingRight;
  const splitterWidth = paneResizer.getBoundingClientRect().width || 6;
  const min = 280;
  const minDetailWidth = 420;
  return {
    left: rect.left + paddingLeft,
    min,
    max: Math.max(min, contentWidth - splitterWidth - 12 - minDetailWidth)
  };
}

function finishPaneResize(workspace: HTMLElement, paneResizer: HTMLElement, event: PointerEvent): void {
  if (paneResizer.hasPointerCapture(event.pointerId)) paneResizer.releasePointerCapture(event.pointerId);
  workspace.classList.remove('resizing');
}

function setApiLogHeightFromPointer(workspace: HTMLElement, apiLogPanel: HTMLElement, apiLogList: HTMLElement, apiLogResizer: HTMLElement, clientY: number): void {
  const bounds = getApiLogHeightBounds(workspace, apiLogPanel, apiLogResizer);
  setApiLogHeight(workspace, apiLogPanel, apiLogList, apiLogResizer, bounds.bottom - clientY - bounds.resizerHeight - bounds.headerHeight);
}

function setApiLogHeight(workspace: HTMLElement, apiLogPanel: HTMLElement, apiLogList: HTMLElement, apiLogResizer: HTMLElement, height: number, persist = true): void {
  const bounds = getApiLogHeightBounds(workspace, apiLogPanel, apiLogResizer);
  const clampedHeight = Math.round(Math.min(Math.max(height, bounds.min), bounds.max));
  apiLogList.style.setProperty('--api-log-list-height', `${clampedHeight}px`);
  apiLogResizer.setAttribute('aria-valuemin', String(bounds.min));
  apiLogResizer.setAttribute('aria-valuemax', String(bounds.max));
  apiLogResizer.setAttribute('aria-valuenow', String(clampedHeight));
  if (persist) localStorage.setItem('certgadgets.apiLogListHeight', String(clampedHeight));
}

function getApiLogHeightBounds(workspace: HTMLElement, apiLogPanel: HTMLElement, apiLogResizer: HTMLElement): { bottom: number; min: number; max: number; resizerHeight: number; headerHeight: number } {
  const workspaceRect = workspace.getBoundingClientRect();
  const panelRect = apiLogPanel.getBoundingClientRect();
  const headerHeight = apiLogPanel.querySelector<HTMLElement>('.api-log-header')?.getBoundingClientRect().height ?? 28;
  const resizerHeight = apiLogResizer.getBoundingClientRect().height || 6;
  const min = 64;
  const max = Math.max(min, panelRect.bottom - workspaceRect.bottom - resizerHeight - headerHeight - 24);
  return { bottom: panelRect.bottom, min, max, resizerHeight, headerHeight };
}

function finishApiLogResize(app: HTMLElement, apiLogResizer: HTMLElement, event: PointerEvent): void {
  if (apiLogResizer.hasPointerCapture(event.pointerId)) apiLogResizer.releasePointerCapture(event.pointerId);
  app.querySelector<HTMLElement>('.shell')?.classList.remove('resizing-rows');
}

function applyRequestedTheme(themeOption?: AppTheme): void {
  const theme = themeOption ?? new URL(window.location.href).searchParams.get('theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.certgadgetsTheme = theme;
}

function isSingleColumnLayout(): boolean {
  return window.matchMedia('(max-width: 820px)').matches;
}

function query<T extends Element>(root: Element, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function resolveMount(mount: string | Element): HTMLElement {
  const element = typeof mount === 'string' ? document.querySelector<HTMLElement>(mount) : mount;
  if (!(element instanceof HTMLElement)) throw new Error('Certificate Gadgets mount element was not found.');
  return element;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"]/g, (character) => {
    if (character === '&') return '&amp;';
    if (character === '<') return '&lt;';
    if (character === '>') return '&gt;';
    return '&quot;';
  });
}