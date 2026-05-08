# Certificate Gadgets

Certificate Gadgets is an experimental browser tool and reusable API module for
investigating and analyzing X.509 certificates. It is planned as a dedicated
certificate-analysis companion in the PKI Studio ecosystem, using PkiStudioJS as
the shared certificate and ASN.1 foundation.

Current version: 0.0.0

## Features

### Certificate Investigation

- Loads DER and PEM certificate data for inspection and analysis.
- Shows certificate identity, issuer, validity, public key, and extension
  details in a certificate-focused UI.
- Highlights certificate structure in a form that can be reused by PKI Studio
  tools and Webview hosts.
- Keeps the investigation workflow separate from key-generation and PKCS#12
  workflows handled by related PKI Studio modules.

### Analysis API

- Exposes certificate parsing and analysis helpers as a UI-independent API.
- Parses X.509 certificate fields and extensions with PKIjs and ASN.1 helpers.
- Uses PkiStudioJS internally for shared PKI and ASN.1 behavior.
- Keeps host-specific behavior, file access, and Webview lifecycle outside the
  core module.
- Prepares the package shape for reuse from browser applications and VS Code
  Webviews.

### Validation Policy

- Keeps local certificate investigation separate from network-assisted
  validation in both the UI and API.
- Performs structural certificate analysis locally by default, without silent
  CRL, OCSP, AIA, or issuer-certificate fetching.
- Treats network-assisted checks as explicit operations controlled by the user
  or host application.
- Reports the external validation resources that may be used before or while an
  online check runs.

### Application Shell

- Provides a dedicated UI surface for certificate investigation tasks.
- Plans to support embedded certificate viewers, diagnostics, and operation
  logging.
- Follows the PKI Studio family style so certificate tools can feel consistent
  with related modules.

### Three-Pane Layout

- Uses the same broad layout model as related PKI Studio gadgets, with a
  certificate tree on the left, a selected-item detail view on the right, and an
  operation log pane at the bottom.
- Treats each loaded certificate as a top-level tree item, with certificate
  attributes, extensions, validation data, and related analysis nodes as child
  items.
- Changes the right pane according to the selected tree item, using specialized
  certificate views where useful.
- Falls back to a PkiStudioJS-style DER tree viewer when the selected item is
  best represented by the DER bytes that encode it.
- Records processing activity in the bottom log pane, and always leaves a log
  trace for operations that perform network access.

## Development

This repository is currently private and in early preparation.

Install dependencies:

```sh
npm install
```

Start the local development server:

```sh
npm run dev
```

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

## Reusing from npm

The npm package is not published yet. The intended package exposes a
certificate-analysis API and a browser/Webview application initializer.

Use the UI-independent API:

```ts
import { CertGadgetsCore } from '@pkistudio/certgadgets';

const bytes = new Uint8Array(await file.arrayBuffer());
const certificate = CertGadgetsCore.createCertificateFromBytes(bytes, file.name);
const plans = CertGadgetsCore.collectNetworkValidationPlans(certificate);
```

Mount the browser application from an embedded Webview or browser app:

```ts
import { initCertificateGadgets } from '@pkistudio/certgadgets/app';
import '@pkistudio/certgadgets/styles.css';

initCertificateGadgets({
  mount: '#app',
  host: {
    confirmNetworkAccess: async ({ url }) => window.confirm(`Allow ${url}?`),
    fetchNetworkResource: async ({ url }) => {
      const response = await fetch(url);
      const bytes = await response.arrayBuffer();
      return { status: response.status, byteLength: bytes.byteLength };
    }
  }
});
```

## License

Certificate Gadgets is licensed under the MIT License. See [LICENSE](LICENSE).

## PkiStudioJS Dependency

The application is expected to import PkiStudioJS from the PKI Studio JavaScript
package for shared ASN.1 viewer behavior:

- `pkistudiojs/core`
- `pkistudiojs/oid-resolver`
- `pkistudiojs/viewer`

The exact import surface will be finalized as the certificate-analysis API is
implemented.

X.509 certificate parsing is handled by PKIjs, with ASN.1 support from asn1js.
