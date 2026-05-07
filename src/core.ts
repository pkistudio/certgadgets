import * as asn1js from 'asn1js';
import { Certificate, type Extension, type GeneralName, type RelativeDistinguishedNames } from 'pkijs';

export type CertificateNodeKind =
  | 'certificate'
  | 'version'
  | 'serial-number'
  | 'signature-algorithm'
  | 'subject'
  | 'issuer'
  | 'validity'
  | 'public-key'
  | 'issuer-unique-id'
  | 'subject-unique-id'
  | 'extensions'
  | 'extension'
  | 'signature'
  | 'signature-value'
  | 'network-resource';

export type CertificateNodeView = 'summary' | 'extension' | 'network' | 'der';

export type CertificateDetail = {
  label: string;
  value: string;
};

export type CertificateTreeNode = {
  id: string;
  kind: CertificateNodeKind;
  label: string;
  note?: string;
  view: CertificateNodeView;
  details?: CertificateDetail[];
  derBytes?: Uint8Array;
  networkUrl?: string;
  children?: CertificateTreeNode[];
};

export type CertificateDocument = {
  id: string;
  label: string;
  sourceName: string;
  size: number;
  loadedAt: Date;
  root: CertificateTreeNode;
};

export type NetworkValidationPlan = {
  operation: string;
  reason: string;
  url: string;
  method?: string;
  requestBytes?: Uint8Array;
  requestMediaType?: string;
};

export type CertGadgetsCoreApi = {
  readonly version: string;
  createDemoCertificate: () => CertificateDocument;
  createCertificateFromBytes: (bytes: Uint8Array, sourceName: string) => CertificateDocument;
  collectNetworkValidationPlans: (document: CertificateDocument) => NetworkValidationPlan[];
  bytesToHexPreview: (bytes: Uint8Array, maxBytes?: number) => string;
};

const APP_VERSION = '0.0.0';

const DEMO_CERTIFICATE_DER = mockBytes('www.example.test certificate');

export const CertGadgetsCore: CertGadgetsCoreApi = {
  version: APP_VERSION,
  createDemoCertificate,
  createCertificateFromBytes,
  collectNetworkValidationPlans,
  bytesToHexPreview
};

export function createDemoCertificate(): CertificateDocument {
  return buildCertificateDocument({
    id: createId(),
    sourceName: 'demo-certificate.cer',
    label: 'www.example.test',
    size: DEMO_CERTIFICATE_DER.byteLength,
    derBytes: DEMO_CERTIFICATE_DER,
    version: 'v3 (2)',
    subject: 'CN=www.example.test, O=PKI Studio, C=JP',
    issuer: 'CN=PKI Studio Demo Issuing CA, O=PKI Studio, C=JP',
    serialNumber: '42:15:66:90:90:21',
    validity: '2026-01-01 to 2027-01-01',
    publicKey: 'RSA 2048',
    signatureAlgorithm: 'sha256WithRSAEncryption',
    certificateSignatureAlgorithm: 'sha256WithRSAEncryption',
    certificateSignature: 'sha256WithRSAEncryption signature value'
  });
}

export function createCertificateFromBytes(bytes: Uint8Array, sourceName: string): CertificateDocument {
  const certificateBytes = normalizeCertificateBytes(bytes);
  const certificate = Certificate.fromBER(toArrayBuffer(certificateBytes));
  const subject = formatRdn(certificate.subject);
  const issuer = formatRdn(certificate.issuer);
  const label = getCertificateLabel(subject, sourceName);
  const extensions = certificate.extensions ?? [];

  return buildCertificateDocument({
    id: createId(),
    sourceName,
    label,
    size: certificateBytes.byteLength,
    derBytes: certificateBytes,
    version: formatCertificateVersion(certificate.version),
    subject,
    issuer,
    serialNumber: formatSerialNumber(certificate.serialNumber.valueBlock.valueHexView),
    validity: `${formatDate(certificate.notBefore.value)} to ${formatDate(certificate.notAfter.value)}`,
    publicKey: formatAlgorithm(certificate.subjectPublicKeyInfo.algorithm.algorithmId),
    signatureAlgorithm: formatAlgorithm(certificate.signature.algorithmId),
    certificateSignatureAlgorithm: formatAlgorithm(certificate.signatureAlgorithm.algorithmId),
    certificateSignature: `${formatAlgorithm(certificate.signatureAlgorithm.algorithmId)} (${certificate.signatureValue.valueBlock.valueHexView.byteLength} bytes)`,
    versionDer: createVersionDer(certificate.version),
    serialNumberDer: toBytes(certificate.serialNumber.toBER(false)),
    signatureAlgorithmDer: toBytes(certificate.signature.toSchema().toBER(false)),
    subjectDer: toBytes(certificate.subject.toSchema().toBER(false)),
    issuerDer: toBytes(certificate.issuer.toSchema().toBER(false)),
    validityDer: createValidityDer(certificate),
    publicKeyDer: toBytes(certificate.subjectPublicKeyInfo.toSchema().toBER(false)),
    issuerUniqueIdDer: certificate.issuerUniqueID ? createImplicitBitStringDer(1, certificate.issuerUniqueID) : undefined,
    subjectUniqueIdDer: certificate.subjectUniqueID ? createImplicitBitStringDer(2, certificate.subjectUniqueID) : undefined,
    extensionsDer: createExtensionsDer(extensions),
    certificateSignatureAlgorithmDer: toBytes(certificate.signatureAlgorithm.toSchema().toBER(false)),
    certificateSignatureDer: toBytes(certificate.signatureValue.toBER(false)),
    extensions: extensions.map((extension) => createExtensionInput(extension))
  });
}

export function collectNetworkValidationPlans(document: CertificateDocument): NetworkValidationPlan[] {
  const plans: NetworkValidationPlan[] = [];
  const planKeys = new Set<string>();
  walkNodes(document.root, (node) => {
    if (!node.networkUrl) return;
    const operation = getNetworkOperation(node.label, node.networkUrl);
    const planKey = `${operation}:${node.networkUrl}`;
    if (planKeys.has(planKey)) return;
    planKeys.add(planKey);
    plans.push({
      operation,
      reason: node.label,
      url: node.networkUrl
    });
  });
  return plans;
}

export function bytesToHexPreview(bytes: Uint8Array, maxBytes = 96): string {
  const clippedBytes = bytes.slice(0, maxBytes);
  const hex = Array.from(clippedBytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
  return bytes.byteLength > clippedBytes.byteLength ? `${hex} ...` : hex;
}

function buildCertificateDocument(input: {
  id: string;
  sourceName: string;
  label: string;
  size: number;
  derBytes: Uint8Array;
  version: string;
  subject: string;
  issuer: string;
  serialNumber: string;
  validity: string;
  publicKey: string;
  signatureAlgorithm: string;
  certificateSignatureAlgorithm: string;
  certificateSignature: string;
  versionDer?: Uint8Array;
  serialNumberDer?: Uint8Array;
  signatureAlgorithmDer?: Uint8Array;
  subjectDer?: Uint8Array;
  issuerDer?: Uint8Array;
  validityDer?: Uint8Array;
  publicKeyDer?: Uint8Array;
  issuerUniqueIdDer?: Uint8Array;
  subjectUniqueIdDer?: Uint8Array;
  extensionsDer?: Uint8Array;
  certificateSignatureAlgorithmDer?: Uint8Array;
  certificateSignatureDer?: Uint8Array;
  extensions?: ExtensionInput[];
}): CertificateDocument {
  const rootId = `${input.id}:certificate`;
  const extensionInputs = input.extensions ?? createDemoExtensions();
  const root: CertificateTreeNode = {
    id: rootId,
    kind: 'certificate',
    label: input.label,
    note: `${input.size} bytes`,
    view: 'summary',
    derBytes: input.derBytes,
    details: [
      { label: 'Source', value: input.sourceName },
      { label: 'Version', value: input.version },
      { label: 'Serial number', value: input.serialNumber },
      { label: 'Signature algorithm', value: input.signatureAlgorithm },
      { label: 'Issuer', value: input.issuer },
      { label: 'Validity', value: input.validity },
      { label: 'Subject', value: input.subject },
      { label: 'Public key', value: input.publicKey },
      { label: 'Certificate signature algorithm', value: input.certificateSignatureAlgorithm },
      { label: 'Certificate signature', value: input.certificateSignature }
    ],
    children: [
      createLeaf(rootId, 'version', 'Version', input.version, input.versionDer ?? mockBytes('version')),
      createLeaf(rootId, 'serial-number', 'Serial Number', input.serialNumber, input.serialNumberDer ?? mockBytes('serial-number')),
      createLeaf(rootId, 'signature-algorithm', 'Signature Algorithm', input.signatureAlgorithm, input.signatureAlgorithmDer ?? mockBytes('signature-algorithm')),
      createLeaf(rootId, 'issuer', 'Issuer', input.issuer, input.issuerDer ?? mockBytes('issuer')),
      createLeaf(rootId, 'validity', 'Validity', input.validity, input.validityDer ?? mockBytes('validity')),
      createLeaf(rootId, 'subject', 'Subject', input.subject, input.subjectDer ?? mockBytes('subject')),
      createLeaf(rootId, 'public-key', 'Subject Public Key Info', input.publicKey, input.publicKeyDer ?? mockBytes('public-key')),
      ...(input.issuerUniqueIdDer ? [createLeaf(rootId, 'issuer-unique-id', 'Issuer Unique ID', `${input.issuerUniqueIdDer.byteLength} bytes`, input.issuerUniqueIdDer)] : []),
      ...(input.subjectUniqueIdDer ? [createLeaf(rootId, 'subject-unique-id', 'Subject Unique ID', `${input.subjectUniqueIdDer.byteLength} bytes`, input.subjectUniqueIdDer)] : []),
      {
        id: `${rootId}:extensions`,
        kind: 'extensions',
        label: 'Extensions',
        note: `${extensionInputs.length} item${extensionInputs.length === 1 ? '' : 's'}`,
        view: 'summary',
        derBytes: input.extensionsDer,
        details: extensionInputs.length > 0
          ? extensionInputs.map((extension) => ({ label: extension.label, value: extension.summary }))
          : [{ label: 'Extensions', value: 'No X.509 v3 extensions were found.' }],
        children: extensionInputs.map((extension) => createExtension(rootId, extension))
      },
      createLeaf(rootId, 'signature', 'Certificate Signature Algorithm', input.certificateSignatureAlgorithm, input.certificateSignatureAlgorithmDer ?? mockBytes('certificate-signature-algorithm')),
      createLeaf(rootId, 'signature-value', 'Certificate Signature Value', input.certificateSignature, input.certificateSignatureDer ?? mockBytes('certificate-signature-value'))
    ]
  };

  return {
    id: input.id,
    label: input.label,
    sourceName: input.sourceName,
    size: input.size,
    loadedAt: new Date(),
    root
  };
}

function createLeaf(parentId: string, kind: CertificateNodeKind, label: string, value: string, derBytes: Uint8Array): CertificateTreeNode {
  return {
    id: `${parentId}:${kind}`,
    kind,
    label,
    note: value,
    view: 'der',
    derBytes,
    details: [{ label, value }]
  };
}

type ExtensionInput = {
  id: string;
  label: string;
  summary: string;
  derBytes: Uint8Array;
  details: CertificateDetail[];
  networkUrls: string[];
};

function createExtension(parentId: string, extension: ExtensionInput): CertificateTreeNode {
  const [networkUrl] = extension.networkUrls;
  return {
    id: `${parentId}:extension:${extension.id}`,
    kind: 'extension',
    label: extension.label,
    note: networkUrl ? 'network resource' : extension.summary,
    view: networkUrl ? 'network' : 'extension',
    derBytes: extension.derBytes,
    networkUrl,
    details: extension.details,
    children: extension.networkUrls.slice(1).map((url, index) => ({
      id: `${parentId}:extension:${extension.id}:network-${index}`,
      kind: 'network-resource',
      label: getNetworkResourceLabel(extension.label, url),
      note: 'explicit',
      view: 'network',
      networkUrl: url,
      details: [
        { label: 'Source', value: extension.label },
        { label: 'Target', value: url }
      ]
    }))
  };
}

function createExtensionInput(extension: Extension): ExtensionInput {
  const label = getExtensionName(extension.extnID);
  const networkUrls = collectUrlsFromExtension(extension);
  const details: CertificateDetail[] = [
    { label: 'OID', value: extension.extnID },
    { label: 'Critical', value: extension.critical ? 'true' : 'false' },
    { label: 'Value length', value: `${extension.extnValue.valueBlock.valueHexView.byteLength} bytes` }
  ];

  const decodedValues = describeExtensionValues(extension);
  if (decodedValues.length > 0) details.push({ label: 'Decoded values', value: decodedValues.join(', ') });
  if (networkUrls.length > 0) details.push({ label: 'Network resources', value: networkUrls.join(', ') });

  return {
    id: extension.extnID.replace(/[^a-z0-9]+/gi, '-'),
    label,
    summary: decodedValues[0] ?? `${extension.extnID}${extension.critical ? ' critical' : ''}`,
    derBytes: toBytes(extension.toSchema().toBER(false)),
    details,
    networkUrls
  };
}

function createDemoExtensions(): ExtensionInput[] {
  const demoCrlUrl = createDemoDataUrl('application/pkix-crl', 'PKI Studio demo CRL');
  const demoOcspUrl = createDemoDataUrl('application/ocsp-response', 'PKI Studio demo OCSP response');
  const demoIssuerUrl = createDemoDataUrl('application/pkix-cert', 'PKI Studio demo issuer certificate');

  return [
    createDemoExtension('basic-constraints', 'Basic Constraints', 'CA: false'),
    createDemoExtension('key-usage', 'Key Usage', 'Digital Signature, Key Encipherment'),
    createDemoExtension('san', 'Subject Alternative Name', 'DNS:www.example.test'),
    createDemoExtension('crl-dp', 'CRL Distribution Points', 'demo CRL fixture', [demoCrlUrl]),
    createDemoExtension('aia', 'Authority Information Access', 'OCSP demo fixture, CA Issuers demo fixture', [
      demoOcspUrl,
      demoIssuerUrl
    ])
  ];
}

function createDemoExtension(id: string, label: string, summary: string, networkUrls: string[] = []): ExtensionInput {
  return {
    id,
    label,
    summary,
    derBytes: mockBytes(label),
    details: [{ label: 'Value', value: summary }],
    networkUrls
  };
}

function mockBytes(label: string): Uint8Array {
  const bytes = new TextEncoder().encode(label);
  return new Uint8Array([0x30, bytes.length + 2, 0x04, bytes.length, ...bytes]);
}

function createDemoDataUrl(mediaType: string, label: string): string {
  return `data:${mediaType};base64,${bytesToBase64(mockBytes(label))}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function normalizeCertificateBytes(bytes: Uint8Array): Uint8Array {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const pemMatch = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/i.exec(text);
  if (!pemMatch) return bytes;
  const base64 = pemMatch[1].replace(/\s+/g, '');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function createValidityDer(certificate: Certificate): Uint8Array {
  return toBytes(new asn1js.Sequence({ value: [certificate.notBefore.toSchema(), certificate.notAfter.toSchema()] }).toBER(false));
}

function createVersionDer(version: number): Uint8Array {
  return toBytes(new asn1js.Constructed({
    idBlock: { tagClass: 3, tagNumber: 0 },
    value: [new asn1js.Integer({ value: version })]
  }).toBER(false));
}

function createImplicitBitStringDer(tagNumber: number, valueHex: ArrayBuffer): Uint8Array {
  return toBytes(new asn1js.Primitive({
    idBlock: { tagClass: 3, tagNumber },
    valueHex
  }).toBER(false));
}

function createExtensionsDer(extensions: Extension[]): Uint8Array | undefined {
  if (extensions.length === 0) return undefined;
  return toBytes(new asn1js.Constructed({
    idBlock: { tagClass: 3, tagNumber: 3 },
    value: [new asn1js.Sequence({ value: extensions.map((extension) => extension.toSchema()) })]
  }).toBER(false));
}

function formatCertificateVersion(version: number): string {
  return `v${version + 1} (${version})`;
}

function formatRdn(rdn: RelativeDistinguishedNames): string {
  if (rdn.typesAndValues.length === 0) return '(empty name)';
  return rdn.typesAndValues
    .map((typeAndValue) => `${getAttributeName(typeAndValue.type)}=${getAsn1StringValue(typeAndValue.value)}`)
    .join(', ');
}

function getCertificateLabel(subject: string, sourceName: string): string {
  const commonName = /(?:^|, )CN=([^,]+)/.exec(subject)?.[1];
  return commonName || sourceName.replace(/\.[^.]+$/, '') || 'Loaded certificate';
}

function formatSerialNumber(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(':');
}

function formatDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function formatAlgorithm(oid: string): string {
  return getOidName(oid);
}

function describeExtensionValues(extension: Extension): string[] {
  const decoded = decodeExtensionValue(extension);
  if (!decoded) return [];

  const strings = collectReadableStrings(decoded).filter((value) => value.length > 0);
  if (strings.length > 0) return strings;

  return [summarizeKnownExtension(extension, decoded)];
}

function summarizeKnownExtension(extension: Extension, decoded: asn1js.AsnType): string {
  if (extension.extnID === '2.5.29.14' && decoded instanceof asn1js.OctetString) {
    return `Key identifier ${bytesToHexPreview(decoded.valueBlock.valueHexView, 20)}`;
  }

  if (extension.extnID === '2.5.29.19') {
    const parsedValue = extension.parsedValue as { cA?: boolean; pathLenConstraint?: number } | undefined;
    const pathLength = typeof parsedValue?.pathLenConstraint === 'number' ? `, path length ${parsedValue.pathLenConstraint}` : '';
    return `CA: ${parsedValue?.cA === true ? 'true' : 'false'}${pathLength}`;
  }

  if (extension.extnID === '2.5.29.35') return 'Authority key identifier';
  if (extension.extnID === '2.5.29.15') return `Key usage bits (${extension.extnValue.valueBlock.valueHexView.byteLength} bytes)`;

  return `${getExtensionName(extension.extnID)} value (${extension.extnValue.valueBlock.valueHexView.byteLength} bytes)`;
}

function collectUrlsFromExtension(extension: Extension): string[] {
  const decoded = decodeExtensionValue(extension);
  if (!decoded) return [];
  return collectReadableStrings(decoded).filter((value) => /^https?:\/\//i.test(value));
}

function decodeExtensionValue(extension: Extension): asn1js.AsnType | null {
  const valueBytes = extension.extnValue.valueBlock.valueHexView;
  const parsed = asn1js.fromBER(toArrayBuffer(valueBytes));
  return parsed.offset === -1 ? null : parsed.result;
}

function collectReadableStrings(node: asn1js.AsnType): string[] {
  const values: string[] = [];
  const stringValue = getAsn1StringValue(node);
  if (stringValue) values.push(stringValue);

  const childNodes = getAsn1Children(node);
  for (const childNode of childNodes) values.push(...collectReadableStrings(childNode));

  const taggedValue = getGeneralNameValue(node);
  if (taggedValue) values.push(taggedValue);

  return [...new Set(values)];
}

function getAsn1Children(node: asn1js.AsnType): asn1js.AsnType[] {
  const valueBlock = 'valueBlock' in node ? node.valueBlock as { value?: unknown } : undefined;
  return Array.isArray(valueBlock?.value) ? valueBlock.value.filter((child): child is asn1js.AsnType => child instanceof asn1js.BaseBlock) : [];
}

function getGeneralNameValue(node: asn1js.AsnType): string {
  if (node.idBlock.tagClass !== 3) return '';
  const valueBlock = node.valueBlock as { valueHexView?: Uint8Array };
  if (!valueBlock.valueHexView) return '';
  if (node.idBlock.tagNumber === 1) return `email:${new TextDecoder('ascii', { fatal: false }).decode(valueBlock.valueHexView)}`;
  if (node.idBlock.tagNumber === 2) return `DNS:${new TextDecoder('ascii', { fatal: false }).decode(valueBlock.valueHexView)}`;
  if (node.idBlock.tagNumber === 6) return new TextDecoder('ascii', { fatal: false }).decode(valueBlock.valueHexView);
  if (node.idBlock.tagNumber === 7) return formatIpAddress(valueBlock.valueHexView);
  return '';
}

function getAsn1StringValue(value: asn1js.AsnType | GeneralName): string {
  if (value instanceof asn1js.Utf8String || value instanceof asn1js.BmpString || value instanceof asn1js.UniversalString || value instanceof asn1js.NumericString || value instanceof asn1js.PrintableString || value instanceof asn1js.TeletexString || value instanceof asn1js.VideotexString || value instanceof asn1js.IA5String || value instanceof asn1js.GraphicString || value instanceof asn1js.VisibleString || value instanceof asn1js.GeneralString || value instanceof asn1js.CharacterString) {
    return value.valueBlock.value;
  }
  if ('type' in value && 'value' in value && typeof value.type === 'number') return formatGeneralName(value);
  return '';
}

function formatGeneralName(name: GeneralName): string {
  if (name.type === 1) return `email:${String(name.value)}`;
  if (name.type === 2) return `DNS:${String(name.value)}`;
  if (name.type === 6) return String(name.value);
  if (name.type === 7 && name.value instanceof ArrayBuffer) return formatIpAddress(new Uint8Array(name.value));
  if (name.type === 8) return `OID:${String(name.value)}`;
  return String(name.value ?? '');
}

function formatIpAddress(bytes: Uint8Array): string {
  if (bytes.byteLength === 4) return Array.from(bytes).join('.');
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(':');
}

function getNetworkResourceLabel(sourceLabel: string, url: string): string {
  if (/ocsp/i.test(sourceLabel) || /ocsp/i.test(url)) return 'Query OCSP';
  if (/crl/i.test(sourceLabel) || /\.crl(?:$|[?#])/i.test(url)) return 'Fetch CRL';
  return 'Fetch issuer certificate';
}

function getNetworkOperation(label: string, url: string): string {
  return /ocsp/i.test(label) || /ocsp/i.test(url) ? 'OCSP.query' : 'HTTP.fetch';
}

function getExtensionName(oid: string): string {
  const names: Record<string, string> = {
    '2.5.29.14': 'Subject Key Identifier',
    '2.5.29.15': 'Key Usage',
    '2.5.29.17': 'Subject Alternative Name',
    '2.5.29.19': 'Basic Constraints',
    '2.5.29.31': 'CRL Distribution Points',
    '2.5.29.32': 'Certificate Policies',
    '2.5.29.35': 'Authority Key Identifier',
    '2.5.29.37': 'Extended Key Usage',
    '1.3.6.1.5.5.7.1.1': 'Authority Information Access',
    '1.3.6.1.4.1.11129.2.4.2': 'Signed Certificate Timestamp List'
  };
  return names[oid] ?? oid;
}

function getAttributeName(oid: string): string {
  const names: Record<string, string> = {
    '2.5.4.3': 'CN',
    '2.5.4.6': 'C',
    '2.5.4.7': 'L',
    '2.5.4.8': 'ST',
    '2.5.4.10': 'O',
    '2.5.4.11': 'OU',
    '1.2.840.113549.1.9.1': 'emailAddress'
  };
  return names[oid] ?? oid;
}

function getOidName(oid: string): string {
  const names: Record<string, string> = {
    '1.2.840.113549.1.1.1': 'rsaEncryption',
    '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
    '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
    '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
    '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
    '1.2.840.10045.2.1': 'id-ecPublicKey',
    '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
    '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
    '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
    '1.3.101.112': 'Ed25519',
    '1.3.101.113': 'Ed448'
  };
  return names[oid] ? `${names[oid]} (${oid})` : oid;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function toBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

function walkNodes(node: CertificateTreeNode, visit: (node: CertificateTreeNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walkNodes(child, visit);
}

function createId(): string {
  return crypto.randomUUID?.() ?? `certificate-${Date.now()}`;
}