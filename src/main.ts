import { initCertificateGadgets } from './app';

const transferredCertificate = readTransferredCertificate();

initCertificateGadgets({
  mount: '#app',
  certificate: transferredCertificate
});

function readTransferredCertificate(): { bytes: Uint8Array; sourceName: string } | undefined {
  const url = new URL(window.location.href);
  const key = url.searchParams.get('certificate');
  if (!key) return undefined;

  try {
    const payload = JSON.parse(localStorage.getItem(key) || 'null') as { label?: string; bytes?: string } | null;
    localStorage.removeItem(key);
    if (!payload?.bytes) throw new Error('Transferred certificate data was not found.');
    return {
      bytes: base64ToBytes(payload.bytes),
      sourceName: payload.label || 'validation-artifact.cer'
    };
  } catch (error) {
    console.error(error);
    return undefined;
  } finally {
    url.searchParams.delete('certificate');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}