# Certificate Gadgets

Certificate Gadgets is an experimental browser tool for inspecting X.509
certificates. It keeps the loaded certificate in a PkiStudioJS-style tree on the
left, shows certificate-focused details on the right, and sends the selected DER
object to the embedded PkiStudioJS ASN.1 viewer.

Current version: 0.1.0

## Features

### Certificate Investigation

- Loads X.509 certificates from files, including DER certificates and PEM files
  with a `-----BEGIN CERTIFICATE-----` block.
- Loads certificate data from the clipboard as PEM or HEX.
- Keeps one loaded certificate document at a time; loading another certificate
  closes the previous certificate before opening the new one.
- Shows the certificate source, version, serial number, signature algorithm,
  issuer, validity, subject, public key, certificate signature algorithm, and
  signature size.
- Reverses issuer and subject Distinguished Name display for easier reading in
  the detail pane.
- Shows the validity range and calculated validity span in days.
- Calculates and displays a Subject Key Identifier-style SHA-1 preview for the
  subject public key bits.
- Keeps the investigation workflow separate from key-generation and PKCS#12
  workflows handled by related PKI Studio modules.

### Certificate Tree

- Displays each loaded certificate as a top-level tree item.
- Adds child items for TBSCertificate fields, including Version, Serial Number,
  Signature Algorithm, Issuer, Validity, Subject, Subject Public Key Info,
  optional unique IDs, Extensions, Certificate Signature Algorithm, and
  Certificate Signature Value.
- Displays each X.509 extension as a child item under Extensions.
- Uses compact tree labels for field values and truncates very long values in
  the tree while keeping the full value available to assistive technology.
- Uses certificate-specific tree icons for common extensions such as Basic
  Constraints, Key Usage, Extended Key Usage, Subject Alternative Name, Issuer
  Alternative Name, CRL Distribution Points, Certificate Policies, Authority
  Information Access, Subject Key Identifier, and Authority Key Identifier.
- Selects a tree item to update the detail pane and, when DER is available, the
  embedded ASN.1 viewer.

### Extension Analysis

- Parses extension OIDs, critical flags, encoded value lengths, decoded readable
  values, and network resources.
- Names common extensions and algorithms from built-in OID tables.
- Decodes readable strings and GeneralName values from extension ASN.1 data,
  including DNS names, email names, URI values, IP addresses, and object
  identifiers.
- Summarizes Basic Constraints, Key Usage, Extended Key Usage, Subject Key
  Identifier, and Authority Key Identifier values when possible.
- Detects HTTP and HTTPS network resources from extensions.
- Recognizes Authority Information Access OCSP responder URLs and CA Issuers
  certificate URLs.
- Recognizes CRL Distribution Point URLs and other likely CRL resources.

### Network-Assisted Validation

- Performs certificate parsing and structural inspection locally by default.
- Does not silently fetch CRLs, OCSP responses, AIA resources, or issuer
  certificates.
- Shows explicit action buttons for detected network targets such as OCSP, AIA
  CA Issuers, and CRL Distribution Points.
- Asks the user or host application for network access confirmation before each
  request.
- Lets host applications provide `confirmNetworkAccess` and
  `fetchNetworkResource` callbacks so browser apps, VS Code Webviews, and other
  hosts can own their own permission and networking model.
- Fetches AIA CA Issuers certificate data and records the result when requested.
- Fetches CRL Distribution Point data and records the HTTP result and received
  bytes when requested.
- Generates an OCSP request for the loaded certificate when both an OCSP URL and
  an AIA CA Issuers URL are available.
- Sends OCSP requests as `application/ocsp-request` and asks for
  `application/ocsp-response` responses.
- Parses OCSP response status and checks whether a BasicOCSPResponse contains a
  SingleResponse for the target certificate when enough issuer data is
  available.
- Records follow-up transcript notes for validation work that is not yet a full
  path-validation engine, such as CRL issuer checks and BasicOCSPResponse
  signature checks.
- Uses a Vite-only development fetch proxy on localhost when browser CORS blocks
  direct network validation requests.

### Validation Results

- Shows a dedicated Validation pane between the main workspace and API Log.
- Records the date, result status, target, and detail for each explicit
  validation request.
- Uses `OK`, `NG`, and `...` statuses for completed, failed, and running
  validation entries.
- Keeps the newest 200 validation results and drops older entries automatically.
- Lets validation results be selected to show a detailed transcript in the right
  pane.
- Keeps request and response artifacts for validation results when bytes are
  available.
- Opens certificate artifacts in a new Certificate Gadgets window.
- Opens ASN.1 artifacts in a standalone PkiStudioJS viewer window.
- Offers to wrap non-ASN.1 raw response bytes in an OCTET STRING before opening
  them in the ASN.1 viewer.
- Provides a Clear button for resetting visible validation results.

### Application Shell

- Fills the browser viewport with a certificate tree, detail pane, embedded
  ASN.1 viewer, Validation pane, and API Log pane.
- Lets the left certificate pane and right detail pane be resized with the
  vertical splitter between them.
- Lets the embedded ASN.1 viewer height be resized inside the detail pane.
- Lets the Validation pane and API Log pane be resized with horizontal
  splitters.
- Persists pane sizes in local storage.
- Follows the browser or operating system light/dark theme preference.
- Supports `?theme=light` and `?theme=dark` for forcing the application shell
  and viewer-only windows to a specific theme.
- Supports a programmatic `theme: 'light'` or `theme: 'dark'` option when the
  app is mounted by a host.
- Passes the effective theme to Certificate Gadgets and viewer-only windows
  opened from validation artifacts.
- Shows an About dialog with the current Certificate Gadgets version.
- Follows the PKI Studio family style so certificate tools can feel consistent
  with related modules.

### Loading and Saving

- Provides a Load menu for loading from a file, from clipboard PEM, or from
  clipboard HEX.
- Accepts `.cer`, `.crt`, `.der`, and `.pem` certificate files from the file
  picker.
- Validates loaded data with PKIjs before adding it to the tree.
- Shows errors in the message area and API Log when input is not a readable
  X.509 certificate.
- Provides a Save menu for writing the selected DER-backed tree item as DER.
- Provides a Save menu item for writing the loaded certificate as PEM.
- Uses the browser's native save-file picker when available, with a download
  fallback for browsers that do not support it.
- Provides a Close action that clears the loaded certificate and validation
  results.

### Embedded ASN.1 Viewer

- Embeds the npm-provided PkiStudioJS viewer directly in the right pane.
- Displays the selected certificate, TBSCertificate field, extension, signature
  algorithm, or signature value DER object.
- Keeps the embedded viewer in read-only mode for certificate investigation.
- Disables PkiStudioJS viewer actions that would edit, delete, load, or close
  DER data inside the embedded viewer.
- Keeps PkiStudioJS Save and New Window behavior available for the currently
  displayed DER object.
- Opens PkiStudioJS New Window output in a standalone viewer-only page instead
  of a new Certificate Gadgets application shell.
- Accepts transferred data from PkiStudioJS windows: certificate data opens in
  Certificate Gadgets, while other complete ASN.1 DER data is redirected to the
  standalone viewer-only page.

### CertGadgetsCore API

- Exposes `CertGadgetsCore` through npm imports and `window.CertGadgetsCore` as
  a UI-independent helper API.
- Creates certificate document models from DER or PEM certificate bytes.
- Parses X.509 certificate fields and extensions with PKIjs and asn1js.
- Builds the certificate tree model used by the browser app without depending on
  DOM APIs.
- Collects explicit network-validation plans from a parsed certificate document.
- Provides reusable DER, PEM, HEX, Base64, ASN.1, and ArrayBuffer helpers.
- Keeps host-specific behavior, file access, dialogs, network access, and
  Webview lifecycle outside the core module.
- Reads the package version from the build-time package metadata, so the
  exported `CertGadgetsCore.version` value stays aligned with `package.json`.

### CertGadgetsValidation API

- Exposes `CertGadgetsValidation` from `@pkistudio/certgadgets/validation` as a
  UI-independent helper API for explicit network-assisted validation flows.
- Creates network validation plans for certificate tree items with AIA, OCSP,
  CRL, or generic HTTP resources.
- Prepares OCSP validation plans by fetching the issuer certificate through a
  host-provided callback and generating an `application/ocsp-request` body.
- Assesses HTTP validation responses and records target-specific transcript
  lines for OCSP, CRL Distribution Points, AIA CA Issuers, and generic AIA
  resources.
- Parses OCSP response status and checks matching SingleResponse certificate
  status when target and issuer certificate bytes are available.
- Classifies validation request and response artifacts as certificate, ASN.1, or
  raw bytes.
- Keeps actual network fetching, user confirmation, persistence, and UI display
  outside the validation module.
- Uses the same build-time version source as `CertGadgetsCore`, so
  `CertGadgetsValidation.version` also stays aligned with `package.json`.

### npm Package API

- Exports the core helper API from `@pkistudio/certgadgets` and
  `@pkistudio/certgadgets/core`.
- Exports network-assisted validation helpers from
  `@pkistudio/certgadgets/validation`.
- Exports the browser app initializer from `@pkistudio/certgadgets/app`.
- Exports app styling from `@pkistudio/certgadgets/styles.css`.
- Lets Webview hosts provide network confirmation and fetch callbacks without
  depending on VS Code APIs inside this package.

### API Log

- Shows a bottom API Log pane for browser, parsing, viewer, file, clipboard,
  save, and network activity.
- Logs operations such as PkiStudioJS initialization, file reads, clipboard
  reads, certificate validation, certificate loading, certificate closing, DER
  saves, PEM saves, network requests, blocked network requests, and validation
  artifact opens.
- Displays timestamps with millisecond precision.
- Keeps the newest 200 log entries and drops older entries automatically.
- Provides a right-aligned Clear button for resetting the visible log.

Certificate data is kept in browser memory as DER. Network-assisted validation
is intentionally separated from local parsing: users or host applications must
approve each network request before Certificate Gadgets sends it.

## Development

Install dependencies:

```sh
npm install
```

Start the local development server:

```sh
npm run dev
```

The development server includes a localhost-only fetch proxy for explicit
network validation requests that would otherwise be blocked by browser CORS
rules.

Use the checked-in debug certificate when inspecting the UI manually:

```text
fixtures/debug-certificate.pem
fixtures/debug-certificate.der
```

Open the app, choose `Load` -> `from File`, and select either fixture.

Run the TypeScript and production build checks:

```sh
npm run check
npm run build
```

Check the npm package contents before publication:

```sh
npm run pack:dry-run
```

## Reusing from npm

Install the package in a browser or Webview project:

```sh
npm install @pkistudio/certgadgets
```

Use the UI-independent API:

```ts
import { CertGadgetsCore } from '@pkistudio/certgadgets';

const bytes = new Uint8Array(await file.arrayBuffer());
const certificate = CertGadgetsCore.createCertificateFromBytes(bytes, file.name);
const plans = CertGadgetsCore.collectNetworkValidationPlans(certificate);
```

The returned validation plans describe external resources that a host may choose
to offer as explicit user actions.

Use the validation helpers directly when a host application owns confirmation,
networking, and result display:

```ts
import { CertGadgetsCore } from '@pkistudio/certgadgets';
import type { NetworkValidationPlan } from '@pkistudio/certgadgets';
import { CertGadgetsValidation, type NetworkFetchResult } from '@pkistudio/certgadgets/validation';

const certificate = CertGadgetsCore.createCertificateFromBytes(bytes, 'site.cer');
const [plan] = CertGadgetsCore.collectNetworkValidationPlans(certificate);
const fetchResource = async ({ url, method, requestBytes, requestMediaType, acceptMediaType }: NetworkValidationPlan): Promise<NetworkFetchResult> => {
  const response = await fetch(url, {
    method: method ?? (requestBytes ? 'POST' : 'GET'),
    headers: {
      ...(requestMediaType ? { 'Content-Type': requestMediaType } : {}),
      ...(acceptMediaType ? { Accept: acceptMediaType } : {})
    },
    body: requestBytes
  });
  const responseBytes = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    bytes: responseBytes,
    mediaType: response.headers.get('Content-Type') ?? undefined
  };
};

if (plan) {
  const preparedPlan = await CertGadgetsValidation.prepareNetworkValidationPlan(plan, {
    document: certificate,
    fetchNetworkResource: fetchResource
  });

  const result = await fetchResource(preparedPlan);
  const assessment = await CertGadgetsValidation.assessValidationContent(preparedPlan, result);
  console.log(assessment.status, assessment.transcript);
}
```

Mount the browser application from an embedded Webview or browser app:

```ts
import { initCertificateGadgets } from '@pkistudio/certgadgets/app';
import '@pkistudio/certgadgets/styles.css';

const app = initCertificateGadgets({
  mount: '#app',
  theme: 'dark',
  host: {
    confirmNetworkAccess: async ({ reason, url }) => {
      return window.confirm(`Allow network access for ${reason}?\n\n${url}`);
    },
    fetchNetworkResource: async ({ url, method, requestBytes, requestMediaType, acceptMediaType }) => {
      const response = await fetch(url, {
        method: method ?? (requestBytes ? 'POST' : 'GET'),
        headers: {
          ...(requestMediaType ? { 'Content-Type': requestMediaType } : {}),
          ...(acceptMediaType ? { Accept: acceptMediaType } : {})
        },
        body: requestBytes
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        status: response.status,
        byteLength: bytes.byteLength,
        bytes,
        mediaType: response.headers.get('Content-Type') ?? undefined
      };
    }
  }
});

app.loadCertificateBytes(new Uint8Array(await file.arrayBuffer()), file.name);
```

The package keeps VS Code-specific file access, dialogs, and Webview lifecycle
outside `@pkistudio/certgadgets`; hosts pass those behaviors through callbacks.

## License

Certificate Gadgets is licensed under the MIT License. See [LICENSE](LICENSE).

## PkiStudioJS Dependency

The application imports PkiStudioJS from the published
`@pkistudio/pkistudiojs` npm package for shared ASN.1 viewer behavior:

- `@pkistudio/pkistudiojs/core`
- `@pkistudio/pkistudiojs/oid-resolver`
- `@pkistudio/pkistudiojs/viewer`

The PkiStudioJS OID name table is provided through
`@pkistudio/pkistudiojs/oid-resolver`, so no vendored OID assets are required
under `public/`.

X.509 certificate parsing is handled by PKIjs, with ASN.1 support from asn1js.
