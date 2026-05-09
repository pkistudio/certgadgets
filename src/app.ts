import './styles.css';
import PkiStudioOidResolver from '@pkistudio/pkistudiojs/oid-resolver';
import PkiStudio, { type PkiStudioViewerInstance } from '@pkistudio/pkistudiojs/viewer';
import {
  CertGadgetsCore,
  bytesToBase64,
  canDecodeAsn1,
  derToPem,
  hexToBytes,
  toArrayBuffer,
  wrapBytesInOctetString,
  type CertificateDocument,
  type CertificateTreeNode,
  type NetworkValidationPlan
} from './core';
import {
  assessValidationContent,
  createNetworkValidationPlans,
  createValidationArtifacts,
  createValidationResultSummary,
  getNetworkResultByteLength,
  getNetworkValidationDescription,
  getValidationTargetLabel,
  isHttpSuccess,
  isValidationArtifactCertificate,
  prepareNetworkValidationPlan,
  type NetworkFetchResult,
  type ValidationDataArtifact,
  type ValidationResultStatus
} from './validation';

const TREE_ITEM_TRUNCATE_THRESHOLD = 255;
const TREE_ITEM_TEXT_LIMIT = 250;

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

type ValidationResultEntry = {
  id: string;
  timestamp: Date;
  status: ValidationResultStatus;
  target: string;
  detail: string;
  transcript: string;
  artifacts: ValidationDataArtifact[];
};

type ViewerRoot = DocumentFragment | Element;

export type AppTheme = 'light' | 'dark';

export type CertificateGadgetsHost = {
  confirmNetworkAccess?: (request: NetworkValidationPlan) => boolean | Promise<boolean>;
  fetchNetworkResource?: (request: NetworkValidationPlan) => Promise<NetworkFetchResult>;
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
  loadCertificateBytes: (bytes: Uint8Array, sourceName?: string) => void;
  close: () => void;
};

const MAX_LOG_ENTRIES = 200;
const MAX_VALIDATION_RESULTS = 200;

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
            <input id="certificateInput" class="visually-hidden" type="file" accept=".cer,.crt,.der,.pem,application/pkix-cert,application/x-x509-ca-cert" />
          </nav>
          <section class="certificate-card">
            <div id="certificateTree" class="tree empty">No certificate loaded yet.</div>
            <p id="formNotice" class="notice">Load a certificate to inspect its attributes, extensions, DER data, and validation resources.</p>
          </section>
        </section>
        <div id="paneResizer" class="pane-resizer" role="separator" aria-label="Resize panes" aria-orientation="vertical" tabindex="0"></div>
        <section id="detailPane" class="detail-panel" aria-label="Selected certificate item">
          <div id="detailContent" class="detail-content"></div>
          <div id="detailViewerDivider" class="detail-viewer-divider" role="separator" aria-label="Resize ASN.1 viewer" aria-orientation="horizontal" tabindex="0" hidden></div>
          <div id="viewerMount" class="pkistudio-viewer-mount" hidden></div>
        </section>
      </section>
      <div id="validationResizer" class="validation-resizer" role="separator" aria-label="Resize validation results" aria-orientation="horizontal" tabindex="0"></div>
      <section class="validation-panel" aria-label="Validation results">
        <header class="validation-menu">
          <strong>Validation</strong>
          <button id="clearValidationResultsButton" type="button">Clear</button>
        </header>
        <div class="validation-results-wrap">
          <table class="validation-results">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Result</th>
                <th scope="col">Target</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody id="validationResultsBody"></tbody>
          </table>
        </div>
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
  const certificateInput = query<HTMLInputElement>(app, '#certificateInput');
  const certificateTree = query<HTMLElement>(app, '#certificateTree');
  const validationResizer = query<HTMLElement>(app, '#validationResizer');
  const validationPanel = query<HTMLElement>(app, '.validation-panel');
  const validationResultsBody = query<HTMLTableSectionElement>(app, '#validationResultsBody');
  const clearValidationResultsButton = query<HTMLButtonElement>(app, '#clearValidationResultsButton');
  const detailPane = query<HTMLElement>(app, '#detailPane');
  const detailContent = query<HTMLElement>(app, '#detailContent');
  const detailViewerDivider = query<HTMLElement>(app, '#detailViewerDivider');
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
  let selectedValidationResultId: string | null = null;
  let viewer: PkiStudioViewerInstance | null = null;
  let validationResults: ValidationResultEntry[] = [];

  applyRequestedTheme(options.theme);
  setupPaneResizer(workspace, paneResizer);
  setupDetailViewerResizer(detailPane, detailViewerDivider, viewerMount);
  setupValidationResizer(app, workspace, validationPanel, validationResizer, apiLogResizer, apiLogPanel);
  setupApiLogResizer(app, workspace, apiLogPanel, apiLogList, apiLogResizer);
  bootViewer();
  logOperation(apiLogList, 'ready', 'Waiting for certificate activity.');
  renderValidationResults();
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

  clearValidationResultsButton.addEventListener('click', () => {
    clearValidationResults();
  });

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

  certificateTree.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-node-id]') : null;
    if (!button) return;
    selectNode(button.dataset.nodeId ?? '');
  });

  validationResultsBody.addEventListener('click', (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLTableRowElement>('[data-validation-result-id]') : null;
    if (!row) return;
    selectValidationResult(row.dataset.validationResultId ?? '');
  });

  validationResultsBody.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target instanceof Element ? event.target.closest<HTMLTableRowElement>('[data-validation-result-id]') : null;
    if (!row) return;
    event.preventDefault();
    selectValidationResult(row.dataset.validationResultId ?? '');
  });

  detailContent.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-action]') : null;
    if (!button) return;

    if (button.dataset.action === 'open-validation-artifact') {
      openValidationArtifact(button.dataset.validationResultId ?? '', button.dataset.artifactId ?? '');
      return;
    }

    if (button.dataset.action !== 'run-network-validation') return;
    const node = selectedNodeId ? findNode(selectedNodeId) : null;
    if (!node) return;
    const planIndex = Number(button.dataset.networkResourceIndex ?? '0');
    const plan = createNetworkValidationPlans(node)[Number.isInteger(planIndex) ? planIndex : 0];
    if (!plan) return;
    await runNetworkValidationPlan(plan, getSelectedCertificate());
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
      viewer = PkiStudio.init({ mount: viewerMount, oidResolver: PkiStudioOidResolver, newWindowUrl: 'viewer.html' });
      applyEmbeddedViewerStyles(viewer);
      applyReadonlyViewerState(viewer);
      listenForReadonlyViewerActions(viewer);
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
    clearValidationResults({ resetDetail: false });
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
    clearValidationResults({ resetDetail: false });
    renderCertificateTree();
    showDetailContent();
    renderEmptyDetail(detailContent);
    closeDerViewer();
    setNotice('Closed loaded certificates.');
    logOperation(apiLogList, 'Certificate.close', 'Closed all loaded certificate documents.');
    updateActions();
  }

  function clearValidationResults(options: { resetDetail?: boolean } = {}): void {
    const shouldResetDetail = options.resetDetail ?? true;
    const hadSelectedValidationResult = Boolean(selectedValidationResultId);
    validationResults = [];
    selectedValidationResultId = null;
    renderValidationResults();
    if (!shouldResetDetail || !hadSelectedValidationResult) return;
    showDetailContent();
    renderEmptyDetail(detailContent);
    closeDerViewer();
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
    await saveTextToFile(derToPem('CERTIFICATE', bytes), filename, 'application/x-pem-file', [{ description: 'PEM files', accept: { 'application/x-pem-file': ['.pem', '.crt', '.cer'] } }]);
    setNotice(`Saved ${document.label} as ${filename}.`);
    logOperation(apiLogList, 'PEM.save', `Saved ${document.sourceName} as PEM (${bytes.byteLength} DER bytes).`);
  }

  async function runNetworkValidationPlan(plan: NetworkValidationPlan, document: CertificateDocument | null = null): Promise<void> {
    const target = getValidationTargetLabel(plan);
    const transcript = [
      createTranscriptLine(`Prepared ${target} validation for ${plan.reason}.`),
      createTranscriptLine(`Operation: ${plan.operation}`),
      createTranscriptLine(`URL: ${plan.url}`)
    ];
    const resultId = addValidationResult('...', target, `${plan.operation} requested for ${plan.reason}. URL: ${plan.url}`, transcript.join('\n'));
    setNotice(`Running ${target} validation...`);
    logOperation(apiLogList, 'Network.request', `${plan.reason}: ${plan.url}`);
    transcript.push(createTranscriptLine('Asking host/user for explicit network access approval.'));
    const confirmed = await confirmNetworkAccess(plan);
    if (!confirmed) {
      transcript.push(createTranscriptLine('Network access was denied. No request was sent.'));
      updateValidationResult(resultId, 'NG', `User blocked ${plan.operation}. URL: ${plan.url}`, transcript.join('\n'));
      setNotice(`${target} validation was blocked.`, true);
      logOperation(apiLogList, 'Network.blocked', `${plan.url} was not requested.`, 'error');
      return;
    }

    try {
      transcript.push(createTranscriptLine('Network access approved. Preparing request.'));
      const preparedPlan = await prepareNetworkValidationPlan(plan, {
        document,
        fetchNetworkResource,
        addTranscriptLine: (message) => transcript.push(createTranscriptLine(message))
      });
      transcript.push(createTranscriptLine('Sending request.'));
      const result = await fetchNetworkResource(preparedPlan);
      const contentAssessment = await assessValidationContent(preparedPlan, result, { createTranscriptLine });
      const status: ValidationResultStatus = isHttpSuccess(result.status) && contentAssessment.status !== 'NG' ? 'OK' : 'NG';
      const byteLength = getNetworkResultByteLength(result);
      transcript.push(createTranscriptLine(`Received HTTP status ${result.status}.`));
      transcript.push(createTranscriptLine(`Received ${byteLength} bytes.`));
      transcript.push(...contentAssessment.transcript);
      updateValidationResult(resultId, status, createValidationResultSummary(preparedPlan, result, byteLength, contentAssessment), transcript.join('\n'), createValidationArtifacts(preparedPlan, result));
      setNotice(`${target} validation finished with ${status}.`, status === 'NG');
      logOperation(apiLogList, preparedPlan.operation, `${preparedPlan.url} -> status ${result.status}, ${byteLength} bytes.`, status === 'NG' ? 'error' : 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      transcript.push(createTranscriptLine(`Request failed: ${message}`));
      updateValidationResult(resultId, 'NG', `${plan.operation} failed for ${plan.url}. ${message}`, transcript.join('\n'));
      setNotice(`${target} validation failed.`, true);
      logOperation(apiLogList, plan.operation, `${plan.url} -> ${message}`, 'error');
    }
  }

  async function confirmNetworkAccess(plan: NetworkValidationPlan): Promise<boolean> {
    if (options.host?.confirmNetworkAccess) return Boolean(await options.host.confirmNetworkAccess(plan));
    return window.confirm(`Allow network access for ${plan.reason}?\n\n${plan.url}`);
  }

  async function fetchNetworkResource(plan: NetworkValidationPlan): Promise<NetworkFetchResult> {
    if (options.host?.fetchNetworkResource) return options.host.fetchNetworkResource(plan);
    try {
      return await fetchNetworkResourceDirect(plan, plan.url);
    } catch (error) {
      const proxyUrl = getFetchProxyUrl(plan.url);
      if (!proxyUrl) throw error;
      return fetchNetworkResourceDirect(plan, proxyUrl, true);
    }
  }

  async function fetchNetworkResourceDirect(plan: NetworkValidationPlan, url: string, useDevProxy = false): Promise<NetworkFetchResult> {
    const headers = new Headers();
    const method = plan.method ?? (plan.requestBytes ? 'POST' : 'GET');
    if (useDevProxy) {
      headers.set('X-CertGadgets-Target-Method', method);
      if (plan.requestMediaType) headers.set('X-CertGadgets-Target-Content-Type', plan.requestMediaType);
      if (plan.acceptMediaType) headers.set('X-CertGadgets-Target-Accept', plan.acceptMediaType);
    } else if (plan.requestBytes && plan.requestMediaType) {
      headers.set('Content-Type', plan.requestMediaType);
    }
    if (!useDevProxy && plan.acceptMediaType) headers.set('Accept', plan.acceptMediaType);
    const response = await fetch(url, {
      method: useDevProxy && plan.requestBytes ? 'POST' : method,
      headers,
      body: plan.requestBytes ? toArrayBuffer(plan.requestBytes) : undefined
    });
    if (useDevProxy && response.headers.get('X-CertGadgets-Proxied') !== '1') throw new Error(await response.text());
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      status: response.status,
      byteLength: bytes.byteLength,
      bytes,
      mediaType: response.headers.get('Content-Type') ?? undefined,
      sentBytes: plan.requestBytes,
      sentMediaType: plan.requestMediaType
    };
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

  function addValidationResult(status: ValidationResultStatus, target: string, detail: string, transcript: string, artifacts: ValidationDataArtifact[] = []): string {
    const id = crypto.randomUUID?.() ?? `validation-${Date.now()}-${validationResults.length}`;
    validationResults = [...validationResults, { id, timestamp: new Date(), status, target, detail, transcript, artifacts }];
    while (validationResults.length > MAX_VALIDATION_RESULTS) validationResults.shift();
    if (selectedValidationResultId && !validationResults.some((entry) => entry.id === selectedValidationResultId)) selectedValidationResultId = null;
    renderValidationResults();
    return id;
  }

  function updateValidationResult(id: string, status: ValidationResultStatus, detail: string, transcript: string, artifacts?: ValidationDataArtifact[]): void {
    validationResults = validationResults.map((entry) => entry.id === id ? { ...entry, timestamp: new Date(), status, detail, transcript, artifacts: artifacts ?? entry.artifacts } : entry);
    renderValidationResults();
    if (selectedValidationResultId === id) renderSelectedValidationResult();
  }

  function renderValidationResults(): void {
    const sortedResults = [...validationResults].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
    validationResultsBody.innerHTML = sortedResults.map((entry) => `
      <tr class="${entry.status === 'NG' ? 'ng' : entry.status === 'OK' ? 'ok' : 'pending'}${entry.id === selectedValidationResultId ? ' selected' : ''}" data-validation-result-id="${escapeHtml(entry.id)}" tabindex="0">
        <td><time datetime="${entry.timestamp.toISOString()}">${formatLogTimestamp(entry.timestamp)}</time></td>
        <td>${entry.status}</td>
        <td>${escapeHtml(entry.target)}</td>
        <td>${escapeHtml(entry.detail)}</td>
      </tr>
    `).join('');
  }

  function selectNode(nodeId: string): void {
    if (!findNode(nodeId)) return;
    selectedNodeId = nodeId;
    selectedValidationResultId = null;
    renderCertificateTree();
    renderValidationResults();
    showSelectedNode();
    updateActions();
  }

  function selectValidationResult(resultId: string): void {
    const result = validationResults.find((entry) => entry.id === resultId);
    if (!result) return;
    selectedValidationResultId = resultId;
    selectedNodeId = null;
    renderCertificateTree();
    renderValidationResults();
    showDetailContent();
    closeDerViewer();
    renderValidationResultDetail(detailContent, result);
    updateActions();
  }

  function renderSelectedValidationResult(): void {
    const result = selectedValidationResultId ? validationResults.find((entry) => entry.id === selectedValidationResultId) : null;
    if (!result) return;
    showDetailContent();
    closeDerViewer();
    renderValidationResultDetail(detailContent, result);
  }

  function showSelectedNode(): void {
    const node = selectedNodeId ? findNode(selectedNodeId) : null;
    if (!node) {
      showDetailContent();
      renderEmptyDetail(detailContent);
      closeDerViewer();
      return;
    }

    showDetailContent();
    if (node.view === 'summary' || node.view === 'der') renderSummaryDetail(detailContent, node);
    else if (node.view === 'extension') renderExtensionDetail(detailContent, node);
    else if (node.view === 'network') renderNetworkDetail(detailContent, node);
    else if (node.derBytes) {
      renderSummaryDetail(detailContent, node);
    } else {
      renderSummaryDetail(detailContent, node);
    }
    showDerViewer(node);
  }

  function updateActions(): void {
    saveDerFileButton.disabled = !Boolean(selectedNodeId && findNode(selectedNodeId)?.derBytes);
    savePemFileButton.disabled = certificateDocuments.length === 0;
    closeDocumentButton.disabled = certificateDocuments.length === 0;
  }

  function showDerViewer(node: CertificateTreeNode): void {
    const bytes = node.derBytes;
    if (!bytes || !viewer) {
      closeDerViewer();
      return;
    }
    viewerMount.hidden = false;
    detailViewerDivider.hidden = false;
    detailPane.classList.add('has-der-viewer');
    restoreDetailViewerHeight(detailPane, detailViewerDivider, viewerMount);
    try {
      viewer.loadBytes(bytes, `${node.label} (${bytes.byteLength} bytes)`);
      applyReadonlyViewerState(viewer);
      logOperation(apiLogList, 'pkistudiojs.loadBytes', `${node.label} (${bytes.byteLength} bytes).`);
    } catch (error) {
      closeDerViewer();
      logOperation(apiLogList, 'pkistudiojs.loadBytes', `${node.label}: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  function showDetailContent(): void {
    detailContent.hidden = false;
  }

  function closeDerViewer(): void {
    viewerMount.hidden = true;
    detailViewerDivider.hidden = true;
    detailPane.classList.remove('has-der-viewer');
    viewer?.close();
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

  function openValidationArtifact(resultId: string, artifactId: string): void {
    const result = validationResults.find((entry) => entry.id === resultId);
    const artifact = result?.artifacts.find((item) => item.id === artifactId);
    if (!result || !artifact) return;

    const artifactLabel = `${artifact.direction} ${artifact.label}`;
    if (isValidationArtifactCertificate(artifact)) {
      openCertificateArtifact(artifact.bytes, artifactLabel);
      return;
    }

    const viewerBytes = prepareArtifactBytesForViewer(artifact.bytes, artifactLabel);
    if (!viewerBytes) return;

    const key = `certgadgets-validation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = {
      label: viewerBytes.label,
      bytes: bytesToBase64(viewerBytes.bytes)
    };

    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (error) {
      logOperation(apiLogList, 'Validation.openViewer', error instanceof Error ? error.message : String(error), 'error');
      return;
    }

    const url = new URL('viewer.html', window.location.href);
    url.searchParams.set('subtree', key);
    const theme = document.documentElement.dataset.certgadgetsTheme;
    if (theme) url.searchParams.set('theme', theme);
    const artifactWindow = window.open(url.toString(), '_blank');
    if (!artifactWindow) {
      localStorage.removeItem(key);
      logOperation(apiLogList, 'Validation.openViewer', `${artifact.label} could not be opened because the popup was blocked.`, 'error');
      return;
    }
    artifactWindow.opener = null;
    logOperation(apiLogList, 'Validation.openViewer', `${viewerBytes.label} opened in ASN.1 viewer.`);
  }

  function openCertificateArtifact(bytes: Uint8Array, label: string): void {
    const key = `certgadgets-certificate-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = {
      label,
      bytes: bytesToBase64(bytes)
    };

    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (error) {
      logOperation(apiLogList, 'Validation.openCertGadgets', error instanceof Error ? error.message : String(error), 'error');
      return;
    }

    const url = new URL('index.html', window.location.href);
    url.searchParams.set('data', key);
    const theme = document.documentElement.dataset.certgadgetsTheme;
    if (theme) url.searchParams.set('theme', theme);
    const certificateWindow = window.open(url.toString(), '_blank');
    if (!certificateWindow) {
      localStorage.removeItem(key);
      logOperation(apiLogList, 'Validation.openCertGadgets', `${label} could not be opened because the popup was blocked.`, 'error');
      return;
    }
    certificateWindow.opener = null;
    logOperation(apiLogList, 'Validation.openCertGadgets', `${label} opened in Certificate Gadgets.`);
  }

  return {
    get certificates() {
      return certificateDocuments;
    },
    get selectedNode() {
      return selectedNodeId ? findNode(selectedNodeId) : null;
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
  const fullItemText = getTreeItemText(node);
  const itemText = truncateTreeItemText(fullItemText);
  const ariaLabel = getTreeItemAriaLabel(node, fullItemText);
  const children = hasChildren ? `<div class="tree-children">${node.children!.map((child) => renderTreeNode(child, depth + 1, selectedNodeId)).join('')}</div>` : '';
  return `
    <details class="tree-node${hasChildren ? '' : ' tree-leaf'}" open>
      <summary class="tree-row${selected ? ' selected' : ''}">
        <span class="tree-toggle" aria-hidden="true">${hasChildren ? '-' : ''}</span>
        <span class="tree-icon ${iconClass}" aria-hidden="true"></span>
        <button class="tree-item" type="button" data-node-id="${escapeHtml(node.id)}" aria-pressed="${selected}" aria-label="${escapeHtml(ariaLabel)}">
          <span class="tree-tag">${escapeHtml(itemText)}</span>
        </button>
      </summary>
      ${children}
    </details>
  `;
}

function getTreeItemText(node: CertificateTreeNode): string {
  if (shouldShowValueOnlyInTree(node)) return getTreeItemValue(node);
  return node.note ? `${node.label} ${node.note}` : node.label;
}

function shouldShowValueOnlyInTree(node: CertificateTreeNode): boolean {
  return node.kind === 'version' ||
    node.kind === 'serial-number' ||
    node.kind === 'signature-algorithm' ||
    node.kind === 'issuer' ||
    node.kind === 'validity' ||
    node.kind === 'subject' ||
    node.kind === 'public-key' ||
    node.kind === 'issuer-unique-id' ||
    node.kind === 'subject-unique-id' ||
    node.kind === 'extension' ||
    node.kind === 'signature' ||
    node.kind === 'signature-value' ||
    node.kind === 'network-resource';
}

function getTreeItemValue(node: CertificateTreeNode): string {
  if (node.kind === 'signature-value') return '<Signature Value>';
  if (node.treeValue) return node.treeValue;
  const detailValue = node.details?.find((detail) => detail.label === 'Value')?.value ??
    node.details?.find((detail) => detail.label === 'Decoded values')?.value ??
    node.details?.find((detail) => detail.label === 'Network resources')?.value;
  return detailValue ?? node.note ?? node.label;
}

function truncateTreeItemText(value: string): string {
  return value.length >= TREE_ITEM_TRUNCATE_THRESHOLD ? `${value.slice(0, TREE_ITEM_TEXT_LIMIT)}...` : value;
}

function getTreeItemAriaLabel(node: CertificateTreeNode, itemText: string): string {
  return node.label === itemText ? itemText : `${node.label} ${itemText}`;
}

function getTreeIconClass(node: CertificateTreeNode, depth: number, hasChildren: boolean): string {
  if (node.kind === 'certificate') return 'certificate';
  if (node.kind === 'version') return 'text-badge version';
  if (node.kind === 'serial-number') return 'text-badge serial-number';
  if (node.kind === 'signature-algorithm' || node.kind === 'signature') return 'text-badge algorithm';
  if (node.kind === 'issuer') return 'text-badge issuer';
  if (node.kind === 'subject') return 'text-badge subject';
  if (node.kind === 'validity') return 'text-badge validity';
  if (node.kind === 'public-key') return 'text-badge public-key';
  if (node.kind === 'signature-value') return 'text-badge signature-value';
  if (node.kind === 'extension') return `text-badge ${getExtensionTreeIconClass(node)}`;
  if (isAttributeNode(node)) return 'attribute';
  return depth === 0 || hasChildren ? 'folder' : 'leaf';
}

function getExtensionTreeIconClass(node: CertificateTreeNode): string {
  const oid = node.details?.find((detail) => detail.label === 'OID')?.value;
  const name = node.label.toLowerCase();
  if (oid === '2.5.29.19' || name === 'basic constraints') return 'extension-basic-constraints';
  if (oid === '2.5.29.15' || name === 'key usage') return 'extension-key-usage';
  if (oid === '2.5.29.37' || name === 'extended key usage') return 'extension-extended-key-usage';
  if (oid === '2.5.29.17' || name === 'subject alternative name') return 'extension-subject-alt-name';
  if (oid === '2.5.29.18' || name === 'issuer alternative name') return 'extension-issuer-alt-name';
  if (oid === '2.5.29.31' || name === 'crl distribution points') return 'extension-crl-distribution';
  if (oid === '2.5.29.32' || name === 'certificate policies') return 'extension-certificate-policies';
  if (oid === '1.3.6.1.5.5.7.1.1' || name === 'authority information access') return 'extension-authority-info-access';
  if (oid === '2.5.29.14' || name === 'subject key identifier') return 'extension-subject-key-identifier';
  if (oid === '2.5.29.35' || name === 'authority key identifier') return 'extension-authority-key-identifier';
  return 'extension-generic';
}

function isAttributeNode(node: CertificateTreeNode): boolean {
  return node.kind === 'version' ||
    node.kind === 'serial-number' ||
    node.kind === 'signature-algorithm' ||
    node.kind === 'subject' ||
    node.kind === 'issuer' ||
    node.kind === 'validity' ||
    node.kind === 'public-key' ||
    node.kind === 'issuer-unique-id' ||
    node.kind === 'subject-unique-id' ||
    node.kind === 'signature' ||
    node.kind === 'signature-value' ||
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
        <p class="detail-kicker">${escapeHtml(getDetailKicker(node))}</p>
        <h1>${escapeHtml(node.label)}</h1>
      </header>
      ${renderDetailList(node)}
    </section>
  `;
}

function getDetailKicker(node: CertificateTreeNode): string {
  if (node.kind === 'signature') return 'SIGNING ALGORITHM';
  if (node.kind === 'signature-value') return 'SIGNATURE';
  return isTbsCertificateElementNode(node) ? 'TBSCERTIFICATE ELEMENT' : node.kind;
}

function isTbsCertificateElementNode(node: CertificateTreeNode): boolean {
  return node.kind === 'version' ||
    node.kind === 'serial-number' ||
    node.kind === 'signature-algorithm' ||
    node.kind === 'issuer' ||
    node.kind === 'validity' ||
    node.kind === 'subject' ||
    node.kind === 'public-key' ||
    node.kind === 'issuer-unique-id' ||
    node.kind === 'subject-unique-id' ||
    node.kind === 'extensions';
}

function renderExtensionDetail(detailPane: HTMLElement, node: CertificateTreeNode): void {
  detailPane.innerHTML = `
    <section class="detail-surface" data-certgadgets-selected-node="${escapeHtml(node.id)}">
      <header class="detail-header">
        <p class="detail-kicker">certificate extension</p>
        <h1>${escapeHtml(node.label)}</h1>
      </header>
      ${renderDetailList(node)}
    </section>
  `;
}

function renderNetworkDetail(detailPane: HTMLElement, node: CertificateTreeNode): void {
  const plans = createNetworkValidationPlans(node);
  const singlePlan = plans.length === 1 ? plans[0] : null;
  detailPane.innerHTML = `
    <section class="detail-surface" data-certgadgets-selected-node="${escapeHtml(node.id)}">
      <header class="detail-header">
        <p class="detail-kicker">network-assisted validation</p>
        <h1>${escapeHtml(node.label)}</h1>
      </header>
      ${renderDetailList(node)}
      ${renderNetworkTargets(plans)}
      ${singlePlan ? `
        <section class="network-action">
          <p>${escapeHtml(getNetworkValidationDescription(singlePlan))}</p>
        </section>
      ` : plans.length === 0 ? '<p class="detail-note">No network validation target is available for this item.</p>' : ''}
    </section>
  `;
}

function renderNetworkTargets(plans: NetworkValidationPlan[]): string {
  if (plans.length === 0) return '';
  return `
    <section class="network-targets">
      ${plans.map((plan, index) => `
        <article class="network-target">
          <div class="network-target-main">
            <span>${escapeHtml(getValidationTargetLabel(plan))}</span>
            <code>${escapeHtml(plan.url)}</code>
          </div>
          <dl class="network-target-meta">
            <div><dt>Operation</dt><dd>${escapeHtml(plan.operation)}</dd></div>
            <div><dt>Reason</dt><dd>${escapeHtml(plan.reason)}</dd></div>
          </dl>
          <button class="network-target-action" type="button" data-action="run-network-validation" data-network-resource-index="${index}">${escapeHtml(getNetworkTargetActionLabel(plan))}</button>
        </article>
      `).join('')}
    </section>
  `;
}

function getNetworkTargetActionLabel(plan: NetworkValidationPlan): string {
  const target = getValidationTargetLabel(plan);
  if (target === 'CDP') return 'Fetch CRL';
  if (target === 'OCSP') return 'Query OCSP';
  if (target === 'AIA CA Issuers') return 'Fetch issuer certificate';
  if (target === 'AIA') return 'Fetch AIA resource';
  return target;
}

function renderValidationResultDetail(detailPane: HTMLElement, result: ValidationResultEntry): void {
  detailPane.innerHTML = `
    <section class="detail-surface" data-certgadgets-validation-result="${escapeHtml(result.id)}">
      <header class="detail-header">
        <p class="detail-kicker">validation result</p>
        <h1>${escapeHtml(result.target)}</h1>
      </header>
      <dl class="detail-list">
        <div><dt>Date</dt><dd>${escapeHtml(formatLogTimestamp(result.timestamp))}</dd></div>
        <div><dt>Result</dt><dd>${escapeHtml(result.status)}</dd></div>
        <div><dt>Target</dt><dd>${escapeHtml(result.target)}</dd></div>
        <div><dt>Summary</dt><dd>${escapeHtml(result.detail)}</dd></div>
      </dl>
      ${renderValidationArtifacts(result)}
      <section class="validation-transcript">
        <pre>${escapeHtml(result.transcript)}</pre>
      </section>
    </section>
  `;
}

function renderValidationArtifacts(result: ValidationResultEntry): string {
  if (result.artifacts.length === 0) return '';
  return `
    <section class="validation-artifacts">
      ${result.artifacts.map((artifact) => `
        <button type="button" data-action="open-validation-artifact" data-validation-result-id="${escapeHtml(result.id)}" data-artifact-id="${escapeHtml(artifact.id)}">
          ${escapeHtml(getValidationArtifactButtonLabel(artifact))}
        </button>
      `).join('')}
    </section>
  `;
}

function getValidationArtifactButtonLabel(artifact: ValidationDataArtifact): string {
  const opener = isValidationArtifactCertificate(artifact) ? 'CertGadgets' : 'ASN.1 viewer';
  const kind = getValidationArtifactKindLabel(artifact);
  return `Open ${artifact.direction} ${artifact.label} as ${kind} in ${opener} (${artifact.bytes.byteLength} bytes)`;
}

function getValidationArtifactKindLabel(artifact: ValidationDataArtifact): string {
  if (isValidationArtifactCertificate(artifact)) return 'certificate';
  if (artifact.contentKind === 'asn1') return 'ASN.1';
  return 'raw bytes';
}

function renderDetailList(node: CertificateTreeNode): string {
  const details = getDisplayDetails(node);
  if (details.length === 0) return '<p class="detail-note">No structured details are available yet.</p>';
  return `
    <dl class="detail-list">
      ${details.map((detail) => `<div><dt>${escapeHtml(detail.label)}</dt><dd>${escapeHtml(detail.value)}</dd></div>`).join('')}
    </dl>
  `;
}

function getDisplayDetails(node: CertificateTreeNode): Array<{ label: string; value: string }> {
  return (node.details ?? []).flatMap((detail) => {
    if (detail.label === 'Issuer' || detail.label === 'Subject') {
      return [{ ...detail, value: reverseDistinguishedName(detail.value) }];
    }

    if (detail.label === 'Validity') {
      const validity = parseValidityRange(detail.value);
      if (!validity) return [detail];
      return [
        { label: 'Validity', value: `${validity.from} ～ ${validity.to}` },
        { label: 'Validity days', value: `${validity.days} days` }
      ];
    }

    return [detail];
  });
}

function reverseDistinguishedName(value: string): string {
  return splitDistinguishedName(value).reverse().join(', ');
}

function splitDistinguishedName(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      current += character;
      escaped = true;
      continue;
    }

    if (character === ',') {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
      continue;
    }

    current += character;
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts.length > 0 ? parts : [value];
}

function parseValidityRange(value: string): { from: string; to: string; days: number } | null {
  const match = /^(.+?)\s+to\s+(.+)$/.exec(value.trim());
  if (!match) return null;
  const from = match[1].trim();
  const to = match[2].trim();
  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return { from, to, days: 0 };
  const days = Math.max(0, Math.round((toTime - fromTime) / 86_400_000));
  return { from, to, days };
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

function prepareArtifactBytesForViewer(bytes: Uint8Array, label: string): { bytes: Uint8Array; label: string } | null {
  if (canDecodeAsn1(bytes)) return { bytes, label };

  const confirmed = window.confirm('This data could not be decoded as ASN.1. Wrap the raw bytes in an OCTET STRING and open them in the ASN.1 viewer?');
  if (!confirmed) return null;
  return {
    bytes: wrapBytesInOctetString(bytes),
    label: `${label} (wrapped OCTET STRING)`
  };
}

function createSafeFileBase(value: string): string {
  return value.toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function getFetchProxyUrl(targetUrl: string): string | null {
  if (!/^https?:\/\//i.test(targetUrl)) return null;

  const configuredProxyUrl = import.meta.env.VITE_CERTGADGETS_FETCH_PROXY_URL?.trim();
  if (configuredProxyUrl) {
    const proxyUrl = new URL(configuredProxyUrl);
    proxyUrl.searchParams.set('url', targetUrl);
    return proxyUrl.toString();
  }

  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname)) return null;
  const proxyUrl = new URL('/__certgadgets_fetch', window.location.href);
  proxyUrl.searchParams.set('url', targetUrl);
  return proxyUrl.toString();
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

    :host(.certgadgets-viewer-readonly) [data-action="toggle-load-menu"],
    :host(.certgadgets-viewer-readonly) [data-action="open"],
    :host(.certgadgets-viewer-readonly) [data-action="load-clipboard-pem"],
    :host(.certgadgets-viewer-readonly) [data-action="load-clipboard-hex"],
    :host(.certgadgets-viewer-readonly) [data-action="close"],
    :host(.certgadgets-viewer-readonly) [data-node-action="insert-before"],
    :host(.certgadgets-viewer-readonly) [data-node-action="insert-before-new-item"],
    :host(.certgadgets-viewer-readonly) [data-node-action="insert-before-clipboard-hex"],
    :host(.certgadgets-viewer-readonly) [data-node-action="add-child"],
    :host(.certgadgets-viewer-readonly) [data-node-action="add-child-new-item"],
    :host(.certgadgets-viewer-readonly) [data-node-action="add-child-clipboard-hex"],
    :host(.certgadgets-viewer-readonly) [data-node-action="delete"],
    .certgadgets-viewer-readonly [data-action="toggle-load-menu"],
    .certgadgets-viewer-readonly [data-action="open"],
    .certgadgets-viewer-readonly [data-action="load-clipboard-pem"],
    .certgadgets-viewer-readonly [data-action="load-clipboard-hex"],
    .certgadgets-viewer-readonly [data-action="close"],
    .certgadgets-viewer-readonly [data-node-action="insert-before"],
    .certgadgets-viewer-readonly [data-node-action="insert-before-new-item"],
    .certgadgets-viewer-readonly [data-node-action="insert-before-clipboard-hex"],
    .certgadgets-viewer-readonly [data-node-action="add-child"],
    .certgadgets-viewer-readonly [data-node-action="add-child-new-item"],
    .certgadgets-viewer-readonly [data-node-action="add-child-clipboard-hex"],
    .certgadgets-viewer-readonly [data-node-action="delete"] {
      opacity: 0.45;
      pointer-events: none;
    }
  `;
  if (instance.root instanceof ShadowRoot) instance.root.prepend(style);
  else instance.root.prepend(style);
}

function listenForReadonlyViewerActions(instance: PkiStudioViewerInstance): void {
  if (!instance.root) return;
  instance.root.addEventListener('click', guardReadonlyViewerAction, true);
}

function guardReadonlyViewerAction(event: Event): void {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLButtonElement>('button[data-action], button[data-node-action]');
  if (!button || !isReadonlyViewerAction(button)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function applyReadonlyViewerState(instance: PkiStudioViewerInstance): void {
  if (!instance.root) return;
  getViewerStateElement(instance.root)?.classList.add('certgadgets-viewer-readonly');
  for (const button of instance.root.querySelectorAll<HTMLButtonElement>('button[data-action], button[data-node-action]')) {
    if (!isReadonlyViewerAction(button)) continue;
    button.disabled = true;
    button.title = 'The embedded ASN.1 viewer is read-only in Certificate Gadgets.';
  }
}

function getViewerStateElement(root: ViewerRoot): HTMLElement | null {
  if (root instanceof ShadowRoot) return root.host instanceof HTMLElement ? root.host : null;
  return root instanceof HTMLElement ? root : null;
}

function isReadonlyViewerAction(button: HTMLButtonElement): boolean {
  const action = button.dataset.action;
  if (action === 'toggle-load-menu' || action === 'open' || action === 'load-clipboard-pem' || action === 'load-clipboard-hex' || action === 'close') return true;

  const nodeAction = button.dataset.nodeAction;
  return nodeAction === 'delete' ||
    nodeAction === 'add-child' ||
    nodeAction === 'add-child-new-item' ||
    nodeAction === 'add-child-clipboard-hex' ||
    nodeAction === 'insert-before' ||
    nodeAction === 'insert-before-new-item' ||
    nodeAction === 'insert-before-clipboard-hex';
}

function findNodeInTree(node: CertificateTreeNode, nodeId: string): CertificateTreeNode | null {
  if (node.id === nodeId) return node;
  for (const child of node.children ?? []) {
    const found = findNodeInTree(child, nodeId);
    if (found) return found;
  }
  return null;
}

function createTranscriptLine(message: string): string {
  return `[${formatLogTimestamp(new Date())}] ${message}`;
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

function setupDetailViewerResizer(detailPane: HTMLElement, divider: HTMLElement, viewerMount: HTMLElement): void {
  let startY = 0;
  let startHeight = 0;

  divider.addEventListener('pointerdown', (event) => {
    if (viewerMount.hidden) return;
    event.preventDefault();
    startY = event.clientY;
    startHeight = viewerMount.getBoundingClientRect().height;
    divider.setPointerCapture(event.pointerId);
    detailPane.classList.add('resizing-viewer');
  });

  divider.addEventListener('pointermove', (event) => {
    if (!divider.hasPointerCapture(event.pointerId)) return;
    setDetailViewerHeight(detailPane, divider, viewerMount, startHeight + startY - event.clientY);
  });

  divider.addEventListener('pointerup', (event) => finishDetailViewerResize(detailPane, divider, event));
  divider.addEventListener('pointercancel', (event) => finishDetailViewerResize(detailPane, divider, event));

  divider.addEventListener('keydown', (event) => {
    if (viewerMount.hidden) return;
    const currentHeight = viewerMount.getBoundingClientRect().height;
    const step = event.shiftKey ? 40 : 16;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setDetailViewerHeight(detailPane, divider, viewerMount, currentHeight + step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setDetailViewerHeight(detailPane, divider, viewerMount, currentHeight - step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setDetailViewerHeight(detailPane, divider, viewerMount, getDetailViewerHeightBounds(detailPane, divider).min);
    } else if (event.key === 'End') {
      event.preventDefault();
      setDetailViewerHeight(detailPane, divider, viewerMount, getDetailViewerHeightBounds(detailPane, divider).max);
    }
  });
}

function restoreDetailViewerHeight(detailPane: HTMLElement, divider: HTMLElement, viewerMount: HTMLElement): void {
  const storedHeight = Number.parseInt(localStorage.getItem('certgadgets.detailViewerHeight') ?? '', 10);
  const currentHeight = viewerMount.getBoundingClientRect().height;
  setDetailViewerHeight(detailPane, divider, viewerMount, Number.isFinite(storedHeight) ? storedHeight : currentHeight || 360, false);
}

function setDetailViewerHeight(detailPane: HTMLElement, divider: HTMLElement, viewerMount: HTMLElement, height: number, persist = true): void {
  const bounds = getDetailViewerHeightBounds(detailPane, divider);
  const clampedHeight = Math.round(Math.min(Math.max(height, bounds.min), bounds.max));
  viewerMount.style.setProperty('--detail-viewer-height', `${clampedHeight}px`);
  divider.setAttribute('aria-valuemin', String(bounds.min));
  divider.setAttribute('aria-valuemax', String(bounds.max));
  divider.setAttribute('aria-valuenow', String(clampedHeight));
  if (persist) localStorage.setItem('certgadgets.detailViewerHeight', String(clampedHeight));
}

function getDetailViewerHeightBounds(detailPane: HTMLElement, divider: HTMLElement): { min: number; max: number } {
  const dividerHeight = divider.getBoundingClientRect().height || 6;
  const paneHeight = detailPane.getBoundingClientRect().height;
  const min = 180;
  const minDetailHeight = 120;
  return { min, max: Math.max(min, paneHeight - dividerHeight - minDetailHeight) };
}

function finishDetailViewerResize(detailPane: HTMLElement, divider: HTMLElement, event: PointerEvent): void {
  if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
  detailPane.classList.remove('resizing-viewer');
}

function setupApiLogResizer(app: HTMLElement, workspace: HTMLElement, apiLogPanel: HTMLElement, apiLogList: HTMLElement, apiLogResizer: HTMLElement): void {
  const storedHeight = Number.parseInt(localStorage.getItem('certgadgets.apiLogListHeight') ?? '', 10);
  setApiLogHeight(workspace, apiLogPanel, apiLogList, apiLogResizer, Number.isFinite(storedHeight) ? storedHeight : 140, false);

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

  apiLogResizer.addEventListener('keydown', (event) => {
    const currentHeight = apiLogList.getBoundingClientRect().height;
    const step = event.shiftKey ? 40 : 16;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setApiLogHeight(workspace, apiLogPanel, apiLogList, apiLogResizer, currentHeight + step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setApiLogHeight(workspace, apiLogPanel, apiLogList, apiLogResizer, currentHeight - step);
    }
  });
}

function setupValidationResizer(app: HTMLElement, workspace: HTMLElement, validationPanel: HTMLElement, validationResizer: HTMLElement, apiLogResizer: HTMLElement, apiLogPanel: HTMLElement): void {
  const storedHeight = Number.parseInt(localStorage.getItem('certgadgets.validationPanelHeight') ?? '', 10);
  setValidationHeight(workspace, validationPanel, validationResizer, apiLogResizer, apiLogPanel, Number.isFinite(storedHeight) ? storedHeight : 170, false);
  let startY = 0;
  let startHeight = 0;

  validationResizer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startY = event.clientY;
    startHeight = validationPanel.getBoundingClientRect().height;
    validationResizer.setPointerCapture(event.pointerId);
    app.querySelector<HTMLElement>('.shell')?.classList.add('resizing-validation');
  });

  validationResizer.addEventListener('pointermove', (event) => {
    if (!validationResizer.hasPointerCapture(event.pointerId)) return;
    setValidationHeight(workspace, validationPanel, validationResizer, apiLogResizer, apiLogPanel, startHeight + startY - event.clientY);
  });

  validationResizer.addEventListener('pointerup', (event) => finishValidationResize(app, validationResizer, event));
  validationResizer.addEventListener('pointercancel', (event) => finishValidationResize(app, validationResizer, event));

  validationResizer.addEventListener('keydown', (event) => {
    const currentHeight = validationPanel.getBoundingClientRect().height;
    const step = event.shiftKey ? 40 : 16;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setValidationHeight(workspace, validationPanel, validationResizer, apiLogResizer, apiLogPanel, currentHeight + step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setValidationHeight(workspace, validationPanel, validationResizer, apiLogResizer, apiLogPanel, currentHeight - step);
    }
  });
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
  const shellRect = workspace.parentElement?.getBoundingClientRect() ?? apiLogPanel.getBoundingClientRect();
  const headerHeight = apiLogPanel.querySelector<HTMLElement>('.api-log-header')?.getBoundingClientRect().height ?? 28;
  const resizerHeight = apiLogResizer.getBoundingClientRect().height || 6;
  const min = 64;
  const minWorkspaceHeight = 240;
  const max = Math.max(min, shellRect.bottom - workspaceRect.top - resizerHeight - headerHeight - minWorkspaceHeight);
  return { bottom: shellRect.bottom, min, max, resizerHeight, headerHeight };
}

function finishApiLogResize(app: HTMLElement, apiLogResizer: HTMLElement, event: PointerEvent): void {
  if (apiLogResizer.hasPointerCapture(event.pointerId)) apiLogResizer.releasePointerCapture(event.pointerId);
  app.querySelector<HTMLElement>('.shell')?.classList.remove('resizing-rows');
}

function setValidationHeight(workspace: HTMLElement, validationPanel: HTMLElement, validationResizer: HTMLElement, apiLogResizer: HTMLElement, apiLogPanel: HTMLElement, height: number, persist = true): void {
  const bounds = getValidationHeightBounds(workspace, validationResizer, apiLogResizer, apiLogPanel);
  const clampedHeight = Math.round(Math.min(Math.max(height, bounds.min), bounds.max));
  validationPanel.style.setProperty('--validation-panel-height', `${clampedHeight}px`);
  validationResizer.setAttribute('aria-valuemin', String(bounds.min));
  validationResizer.setAttribute('aria-valuemax', String(bounds.max));
  validationResizer.setAttribute('aria-valuenow', String(clampedHeight));
  if (persist) localStorage.setItem('certgadgets.validationPanelHeight', String(clampedHeight));
}

function getValidationHeightBounds(workspace: HTMLElement, validationResizer: HTMLElement, apiLogResizer: HTMLElement, apiLogPanel: HTMLElement): { min: number; max: number } {
  const workspaceRect = workspace.getBoundingClientRect();
  const shellRect = workspace.parentElement?.getBoundingClientRect() ?? workspaceRect;
  const validationResizerHeight = validationResizer.getBoundingClientRect().height || 6;
  const apiLogResizerHeight = apiLogResizer.getBoundingClientRect().height || 6;
  const apiLogHeight = apiLogPanel.getBoundingClientRect().height;
  const min = 96;
  const minWorkspaceHeight = 240;
  const max = Math.max(min, shellRect.bottom - workspaceRect.top - validationResizerHeight - apiLogResizerHeight - apiLogHeight - minWorkspaceHeight);
  return { min, max };
}

function finishValidationResize(app: HTMLElement, validationResizer: HTMLElement, event: PointerEvent): void {
  if (validationResizer.hasPointerCapture(event.pointerId)) validationResizer.releasePointerCapture(event.pointerId);
  app.querySelector<HTMLElement>('.shell')?.classList.remove('resizing-validation');
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