import * as asn1js from 'asn1js';
import { Certificate, OCSPRequest, OCSPResponse } from 'pkijs';
import {
  canDecodeAsn1,
  normalizeCertificateBytes,
  toArrayBuffer,
  type CertificateNetworkResource,
  type CertificateDocument,
  type CertificateTreeNode,
  type NetworkValidationPlan
} from './core';
import { CERTGADGETS_VERSION } from './version';

export type ValidationResultStatus = 'OK' | 'NG' | '...';

export type NetworkFetchResult = {
  status: number;
  byteLength?: number;
  bytes?: Uint8Array;
  mediaType?: string;
  sentBytes?: Uint8Array;
  sentMediaType?: string;
};

export type ValidationDataArtifactKind = 'certificate' | 'asn1' | 'raw';

export type ValidationDataArtifact = {
  id: string;
  label: string;
  direction: 'sent' | 'received';
  bytes: Uint8Array;
  mediaType?: string;
  contentKind: ValidationDataArtifactKind;
};

export type ValidationContentAssessment = {
  status: ValidationResultStatus;
  summary?: string;
  transcript: string[];
};

export type PrepareNetworkValidationPlanOptions = {
  document?: CertificateDocument | null;
  fetchNetworkResource?: (plan: NetworkValidationPlan) => Promise<NetworkFetchResult>;
  addTranscriptLine?: (message: string) => void;
};

export type ValidationAssessmentOptions = {
  createTranscriptLine?: (message: string) => string;
};

export type OcspResponseAssessment = {
  ok: boolean;
  summary: string;
  transcript: string[];
};

export type CertGadgetsValidationApi = {
  readonly version: string;
  createNetworkValidationPlan: (node: CertificateTreeNode, resource?: CertificateNetworkResource) => NetworkValidationPlan;
  createNetworkValidationPlans: (node: CertificateTreeNode) => NetworkValidationPlan[];
  getValidationTargetLabel: (plan: NetworkValidationPlan) => string;
  getNetworkValidationDescription: (plan: NetworkValidationPlan) => string;
  prepareNetworkValidationPlan: (plan: NetworkValidationPlan, options?: PrepareNetworkValidationPlanOptions) => Promise<NetworkValidationPlan>;
  createOcspRequestBytes: (certificate: Certificate, issuerCertificate: Certificate) => Promise<Uint8Array>;
  assessValidationContent: (plan: NetworkValidationPlan, result: NetworkFetchResult, options?: ValidationAssessmentOptions) => Promise<ValidationContentAssessment>;
  assessOcspResponse: (plan: NetworkValidationPlan, bytes?: Uint8Array, options?: ValidationAssessmentOptions) => Promise<OcspResponseAssessment>;
  createValidationResultSummary: (plan: NetworkValidationPlan, result: { status: number }, byteLength: number, contentAssessment: { summary?: string }) => string;
  createValidationArtifacts: (plan: NetworkValidationPlan, result: NetworkFetchResult) => ValidationDataArtifact[];
  detectValidationDataArtifactKind: (bytes: Uint8Array, mediaType?: string) => ValidationDataArtifactKind;
  isValidationArtifactCertificate: (artifact: ValidationDataArtifact) => boolean;
  isCertificateBytes: (bytes: Uint8Array, mediaType?: string) => boolean;
  isHttpSuccess: (status: number) => boolean;
  getNetworkResultByteLength: (result: { byteLength?: number; bytes?: Uint8Array }) => number;
};

export const CertGadgetsValidation: CertGadgetsValidationApi = {
  version: CERTGADGETS_VERSION,
  createNetworkValidationPlan,
  createNetworkValidationPlans,
  getValidationTargetLabel,
  getNetworkValidationDescription,
  prepareNetworkValidationPlan,
  createOcspRequestBytes,
  assessValidationContent,
  assessOcspResponse,
  createValidationResultSummary,
  createValidationArtifacts,
  detectValidationDataArtifactKind,
  isValidationArtifactCertificate,
  isCertificateBytes,
  isHttpSuccess,
  getNetworkResultByteLength
};

export function getValidationTargetLabel(plan: NetworkValidationPlan): string {
  const reason = plan.reason;
  const source = `${reason} ${plan.operation} ${plan.url}`;
  if (/ocsp/i.test(source)) return 'OCSP';
  if (/ca issuers|issuer certificate|fetch issuer|issuer/i.test(reason)) return 'AIA CA Issuers';
  if (/issuer|ca issuers|\.cer(?:$|[?#])/i.test(source)) return 'AIA CA Issuers';
  if (/crl|\.crl(?:$|[?#])/i.test(source)) return 'CDP';
  if (/authority information access/i.test(source)) return 'AIA';
  return plan.reason;
}

export function createNetworkValidationPlans(node: CertificateTreeNode): NetworkValidationPlan[] {
  return getNodeNetworkResources(node).map((resource) => createNetworkValidationPlan(node, resource));
}

export function createNetworkValidationPlan(node: CertificateTreeNode, resource = getNodeNetworkResources(node)[0]): NetworkValidationPlan {
  const url = resource?.url ?? '';
  return {
    operation: resource?.kind === 'ocsp' || /ocsp/i.test(`${resource?.label ?? node.label} ${url}`) ? 'OCSP.query' : 'HTTP.fetch',
    reason: resource && node.label !== resource.label ? `${node.label}: ${resource.label}` : node.label,
    url
  };
}

export function getNetworkValidationDescription(plan: NetworkValidationPlan): string {
  const target = getValidationTargetLabel(plan);
  if (target === 'CDP') return 'Fetch the certificate revocation list from this CRL Distribution Point over the network, then record the HTTP result in the Validation pane and operation log.';
  if (target === 'OCSP') return 'Send an OCSP validation request to this responder endpoint over the network, then record the response status in the Validation pane and operation log.';
  if (target === 'AIA CA Issuers') return 'Fetch the issuer certificate from this Authority Information Access CA Issuers URL over the network, then record the HTTP result in the Validation pane and operation log.';
  if (target === 'AIA') return 'Use this Authority Information Access URL for an explicit network-assisted validation request, then record the result in the Validation pane and operation log.';
  return 'Run this explicit network-assisted validation request and record the result in the Validation pane and operation log.';
}

export async function prepareNetworkValidationPlan(plan: NetworkValidationPlan, options: PrepareNetworkValidationPlanOptions = {}): Promise<NetworkValidationPlan> {
  if (getValidationTargetLabel(plan) !== 'OCSP') return plan;
  if (!options.document?.root.derBytes) throw new Error('OCSP request cannot be generated because no target certificate bytes are loaded.');

  const issuerUrl = findIssuerCertificateUrlForOcsp(options.document.root, plan.url);
  if (!issuerUrl) throw new Error('OCSP request cannot be generated because no AIA CA Issuers URL was found in the certificate.');
  if (!options.fetchNetworkResource) throw new Error('OCSP request cannot be generated because no issuer-certificate fetch callback was provided.');

  options.addTranscriptLine?.(`Fetching issuer certificate for OCSP CertID from ${issuerUrl}.`);
  const issuerResult = await options.fetchNetworkResource({
    operation: 'HTTP.fetch',
    reason: 'AIA CA Issuers for OCSP request',
    url: issuerUrl,
    acceptMediaType: 'application/pkix-cert'
  });
  const issuerByteLength = getNetworkResultByteLength(issuerResult);
  options.addTranscriptLine?.(`Issuer certificate fetch returned HTTP status ${issuerResult.status} with ${issuerByteLength} bytes.`);
  if (!isHttpSuccess(issuerResult.status)) throw new Error(`OCSP request cannot be generated because issuer certificate fetch returned HTTP status ${issuerResult.status}.`);
  if (!issuerResult.bytes || issuerResult.bytes.byteLength === 0) throw new Error('OCSP request cannot be generated because issuer certificate bytes were not available.');

  const targetCertificate = parseCertificateForOcsp(options.document.root.derBytes, 'target certificate');
  const issuerCertificate = parseCertificateForOcsp(issuerResult.bytes, 'issuer certificate');
  const requestBytes = await createOcspRequestBytes(targetCertificate, issuerCertificate);
  options.addTranscriptLine?.(`Generated OCSP request DER (${requestBytes.byteLength} bytes) using issuer certificate from AIA CA Issuers.`);

  return {
    ...plan,
    method: 'POST',
    requestBytes,
    requestMediaType: 'application/ocsp-request',
    acceptMediaType: 'application/ocsp-response',
    targetCertificateBytes: options.document.root.derBytes,
    issuerCertificateBytes: issuerResult.bytes,
    issuerCertificateMediaType: issuerResult.mediaType,
    issuerCertificateUrl: issuerUrl
  };
}

export function getNetworkResultByteLength(result: { byteLength?: number; bytes?: Uint8Array }): number {
  return result.bytes?.byteLength ?? result.byteLength ?? 0;
}

export function createValidationArtifacts(plan: NetworkValidationPlan, result: NetworkFetchResult): ValidationDataArtifact[] {
  const artifacts: ValidationDataArtifact[] = [];
  const sentBytes = result.sentBytes ?? plan.requestBytes;
  const sentMediaType = result.sentMediaType ?? plan.requestMediaType;

  if (plan.issuerCertificateBytes && plan.issuerCertificateBytes.byteLength > 0) {
    artifacts.push(createValidationDataArtifact({
      id: 'issuer-certificate-1',
      label: 'AIA CA Issuers certificate',
      direction: 'received',
      bytes: plan.issuerCertificateBytes,
      mediaType: plan.issuerCertificateMediaType
    }));
  }

  if (sentBytes && sentBytes.byteLength > 0) {
    artifacts.push(createValidationDataArtifact({
      id: 'sent-1',
      label: `${getValidationTargetLabel(plan)} request`,
      direction: 'sent',
      bytes: sentBytes,
      mediaType: sentMediaType
    }));
  }

  if (result.bytes && result.bytes.byteLength > 0) {
    artifacts.push(createValidationDataArtifact({
      id: 'received-1',
      label: `${getValidationTargetLabel(plan)} response`,
      direction: 'received',
      bytes: result.bytes,
      mediaType: result.mediaType
    }));
  }

  return artifacts;
}

export function detectValidationDataArtifactKind(bytes: Uint8Array, mediaType?: string): ValidationDataArtifactKind {
  if (isCertificateBytes(bytes, mediaType)) return 'certificate';
  if (canDecodeAsn1(bytes)) return 'asn1';
  return 'raw';
}

export function isValidationArtifactCertificate(artifact: ValidationDataArtifact): boolean {
  return artifact.contentKind === 'certificate' || isCertificateBytes(artifact.bytes, artifact.mediaType);
}

export function isCertificateBytes(bytes: Uint8Array, mediaType?: string): boolean {
  if (mediaType && /(?:application\/(?:pkix-cert|x-x509-ca-cert)|certificate)/i.test(mediaType)) return canParseCertificateBytes(bytes);
  return canParseCertificateBytes(bytes);
}

export async function assessValidationContent(plan: NetworkValidationPlan, result: NetworkFetchResult, options: ValidationAssessmentOptions = {}): Promise<ValidationContentAssessment> {
  const ocspStatus = getValidationTargetLabel(plan) === 'OCSP' && isHttpSuccess(result.status) ? await assessOcspResponse(plan, result.bytes, options) : null;
  return {
    status: getValidationContentStatus(plan, result, ocspStatus),
    summary: ocspStatus?.summary,
    transcript: createValidationFollowUpTranscript(plan, result, ocspStatus, options)
  };
}

export function createValidationResultSummary(plan: NetworkValidationPlan, result: { status: number }, byteLength: number, contentAssessment: { summary?: string }): string {
  const contentSummary = contentAssessment.summary ? `; ${contentAssessment.summary}` : '';
  return `${plan.operation} completed with HTTP status ${result.status}${contentSummary}; received ${byteLength} bytes from ${plan.url}.`;
}

export function isHttpSuccess(status: number): boolean {
  return status >= 200 && status < 400;
}

export async function assessOcspResponse(plan: NetworkValidationPlan, bytes: Uint8Array | undefined, options: ValidationAssessmentOptions = {}): Promise<OcspResponseAssessment> {
  if (!bytes || bytes.byteLength === 0) return createOcspAssessment(options, false, 'OCSP responseStatus unavailable', 'OCSP responseStatus could not be decoded because no response bytes were available.');

  try {
    const parsed = asn1js.fromBER(toArrayBuffer(bytes));
    if (parsed.offset === -1 || parsed.offset !== bytes.byteLength || !(parsed.result instanceof asn1js.Sequence)) {
      return createOcspAssessment(options, false, 'OCSP responseStatus undecodable', 'OCSP responseStatus could not be decoded because the response is not a complete OCSPResponse sequence.');
    }

    const ocspResponse = new OCSPResponse({ schema: parsed.result });
    const status = ocspResponse.responseStatus.valueBlock.valueDec;
    const statusName = getOcspResponseStatusName(status);
    const responseStatusLine = `OCSP responseStatus is ${statusName} (${status}).`;

    if (status !== 0) return createOcspAssessment(options, false, `OCSP responseStatus ${statusName} (${status})`, responseStatusLine);
    if (!ocspResponse.responseBytes) return createOcspAssessment(options, false, 'OCSP responseStatus successful (0); BasicOCSPResponse missing', responseStatusLine, 'OCSP responseStatus is successful, but responseBytes is missing so certificate status could not be checked.');

    if (!plan.targetCertificateBytes || !plan.issuerCertificateBytes) {
      return createOcspAssessment(options, false, 'OCSP responseStatus successful (0); certificate status unverified', responseStatusLine, 'Certificate status could not be checked because target or issuer certificate bytes were not available.');
    }

    const targetCertificate = parseCertificateForOcsp(plan.targetCertificateBytes, 'target certificate');
    const issuerCertificate = parseCertificateForOcsp(plan.issuerCertificateBytes, 'issuer certificate');
    const certificateStatus = await ocspResponse.getCertificateStatus(targetCertificate, issuerCertificate);
    if (!certificateStatus.isForCertificate) {
      return createOcspAssessment(options, false, 'OCSP responseStatus successful (0); response does not match certificate', responseStatusLine, 'OCSP BasicOCSPResponse does not contain a SingleResponse matching the target certificate CertID.');
    }

    const certificateStatusName = getOcspCertificateStatusName(certificateStatus.status);
    const certificateStatusLine = `OCSP certificate status is ${certificateStatusName} (${certificateStatus.status}).`;
    return createOcspAssessment(
      options,
      certificateStatus.status === 0,
      `OCSP responseStatus successful (0); certificate status ${certificateStatusName}`,
      responseStatusLine,
      certificateStatusLine
    );
  } catch (error) {
    return createOcspAssessment(options, false, 'OCSP responseStatus/certificate status undecodable', `OCSP responseStatus or certificate status could not be decoded: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function createOcspRequestBytes(certificate: Certificate, issuerCertificate: Certificate): Promise<Uint8Array> {
  const ocspRequest = new OCSPRequest();
  await ocspRequest.createForCertificate(certificate, {
    hashAlgorithm: 'SHA-1',
    issuerCertificate
  });
  return new Uint8Array(ocspRequest.toSchema(true).toBER(false));
}

function createValidationDataArtifact(artifact: Omit<ValidationDataArtifact, 'contentKind'>): ValidationDataArtifact {
  return {
    ...artifact,
    contentKind: detectValidationDataArtifactKind(artifact.bytes, artifact.mediaType)
  };
}

function canParseCertificateBytes(bytes: Uint8Array): boolean {
  try {
    Certificate.fromBER(toArrayBuffer(normalizeCertificateBytes(bytes)));
    return true;
  } catch {
    return false;
  }
}

function getValidationContentStatus(plan: NetworkValidationPlan, result: { status: number; bytes?: Uint8Array }, ocspStatus: { ok: boolean } | null = null): ValidationResultStatus {
  if (!isHttpSuccess(result.status)) return 'NG';
  if (getValidationTargetLabel(plan) !== 'OCSP') return 'OK';
  return ocspStatus?.ok ? 'OK' : 'NG';
}

function createValidationFollowUpTranscript(plan: NetworkValidationPlan, result: NetworkFetchResult, ocspStatus: OcspResponseAssessment | null = null, options: ValidationAssessmentOptions = {}): string[] {
  const target = getValidationTargetLabel(plan);
  const line = getTranscriptLineFactory(options);
  if (!isHttpSuccess(result.status)) return [line(`Skipped ${target} content checks because HTTP status ${result.status} is not successful.`)];
  if (!result.bytes || result.bytes.byteLength === 0) return [line(`${target} response body bytes were not available to inspect.`)];
  if (target === 'CDP') return [
    line('CRL bytes received. Queued DER/PEM decoding check.'),
    line('CRL issuer, thisUpdate, nextUpdate, and revoked-certificate entries would be inspected here.'),
    line('Certificate revocation matching is not performed silently beyond this explicit operation in the current prototype.')
  ];
  if (target === 'OCSP') return createOcspTranscript(ocspStatus, options);
  if (target === 'AIA CA Issuers') return [
    line('Issuer-certificate bytes received. Queued X.509 parsing check.'),
    line('Issuer subject/authority key data would be compared against the loaded certificate in a full validation flow.')
  ];
  return [line(`${target} response bytes received. Queued target-specific parsing checks.`)];
}

function createOcspTranscript(assessment: OcspResponseAssessment | null, options: ValidationAssessmentOptions): string[] {
  const line = getTranscriptLineFactory(options);
  if (!assessment) return [
    line('OCSP response could not be assessed.'),
    line('BasicOCSPResponse signature, producedAt, thisUpdate, nextUpdate, and responder identity are not validated yet.')
  ];

  return [
    ...assessment.transcript,
    line('BasicOCSPResponse signature, producedAt, thisUpdate, nextUpdate, and responder identity are not validated yet.')
  ];
}

function createOcspAssessment(options: ValidationAssessmentOptions, ok: boolean, summary: string, ...messages: string[]): OcspResponseAssessment {
  const line = getTranscriptLineFactory(options);
  return { ok, summary, transcript: messages.map(line) };
}

function getTranscriptLineFactory(options: ValidationAssessmentOptions): (message: string) => string {
  return options.createTranscriptLine ?? ((message) => message);
}

function findIssuerCertificateUrlForOcsp(root: CertificateTreeNode, ocspUrl: string): string | null {
  let issuerUrl: string | null = null;
  walkCertificateNodes(root, (node) => {
    if (issuerUrl) return;
    for (const resource of getNodeNetworkResources(node)) {
      if (resource.url === ocspUrl) continue;
      if (resource.kind === 'ca-issuers') {
        issuerUrl = resource.url;
        return;
      }
      const target = getValidationTargetLabel(createNetworkValidationPlan(node, resource));
      if (target === 'AIA CA Issuers') {
        issuerUrl = resource.url;
        return;
      }
    }
  });
  return issuerUrl;
}

function getNodeNetworkResources(node: CertificateTreeNode): CertificateNetworkResource[] {
  if (node.networkResources?.length) return node.networkResources;
  if (!node.networkUrl) return [];
  return [{
    label: node.label,
    url: node.networkUrl,
    kind: node.networkKind ?? 'generic'
  }];
}

function walkCertificateNodes(node: CertificateTreeNode, visit: (node: CertificateTreeNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walkCertificateNodes(child, visit);
}

function parseCertificateForOcsp(bytes: Uint8Array, label: string): Certificate {
  try {
    return Certificate.fromBER(toArrayBuffer(normalizeCertificateBytes(bytes)));
  } catch (error) {
    throw new Error(`OCSP request cannot be generated because the ${label} could not be parsed as an X.509 certificate. ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getOcspResponseStatusName(status: number): string {
  const names: Record<number, string> = {
    0: 'successful',
    1: 'malformedRequest',
    2: 'internalError',
    3: 'tryLater',
    5: 'sigRequired',
    6: 'unauthorized'
  };
  return names[status] ?? 'unknown';
}

function getOcspCertificateStatusName(status: number): string {
  const names: Record<number, string> = {
    0: 'good',
    1: 'revoked',
    2: 'unknown'
  };
  return names[status] ?? 'unknown';
}
