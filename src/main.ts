import * as asn1js from 'asn1js';
import { initCertificateGadgets } from './app';
import { CertGadgetsCore } from './core';

const transferredData = readTransferredData();

if (transferredData?.kind === 'viewer') {
  redirectToViewer(transferredData.key);
} else {
  initCertificateGadgets({
    mount: '#app',
    certificate: transferredData?.certificate
  });
}

type TransferredDataRoute =
  | { kind: 'certificate'; certificate: { bytes: Uint8Array; sourceName: string } }
  | { kind: 'viewer'; key: string };

function readTransferredData(): TransferredDataRoute | undefined {
  const url = new URL(window.location.href);
  const parameterName = url.searchParams.has('data') ? 'data' : 'certificate';
  const key = url.searchParams.get(parameterName);
  if (!key) return undefined;

  try {
    const payload = JSON.parse(localStorage.getItem(key) || 'null') as { label?: string; bytes?: string } | null;
    if (!payload?.bytes) throw new Error('Transferred data was not found.');
    const bytes = base64ToBytes(payload.bytes);
    const sourceName = payload.label || 'transferred-data.der';
    if (isCertificateData(bytes, sourceName)) {
      localStorage.removeItem(key);
      cleanTransferredDataUrl(url, parameterName);
      return { kind: 'certificate', certificate: { bytes, sourceName } };
    }
    if (canDecodeAsn1(bytes)) return { kind: 'viewer', key };
    throw new Error('Transferred data was neither a readable X.509 certificate nor complete ASN.1 DER data.');
  } catch (error) {
    localStorage.removeItem(key);
    cleanTransferredDataUrl(url, parameterName);
    console.error(error);
    return undefined;
  }
}

function redirectToViewer(key: string): void {
  const url = new URL('viewer.html', window.location.href);
  url.searchParams.set('subtree', key);
  const theme = document.documentElement.dataset.certgadgetsTheme;
  if (theme) url.searchParams.set('theme', theme);
  window.location.replace(url.toString());
}

function cleanTransferredDataUrl(url: URL, parameterName: string): void {
  url.searchParams.delete(parameterName);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function isCertificateData(bytes: Uint8Array, sourceName: string): boolean {
  try {
    CertGadgetsCore.createCertificateFromBytes(bytes, sourceName);
    return true;
  } catch {
    return false;
  }
}

function canDecodeAsn1(bytes: Uint8Array): boolean {
  try {
    const parsed = asn1js.fromBER(toArrayBuffer(bytes));
    return parsed.offset !== -1 && parsed.offset === bytes.byteLength;
  } catch {
    return false;
  }
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
