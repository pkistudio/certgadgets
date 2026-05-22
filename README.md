# Certificate Gadgets

Certificate Gadgets is an experimental browser tool and reusable TypeScript API
for inspecting X.509 certificates. It keeps the loaded certificate in a
PkiStudioJS-style tree, displays certificate-focused details, and shows selected
DER objects with the embedded PkiStudioJS ASN.1 viewer.

Hosted viewer: https://pkistudio.github.io/certgadgets/

Documentation: https://github.com/pkistudio/certgadgets/wiki

Current version: 0.1.4

Certificate data stays in browser memory as DER bytes. Network-assisted
validation is explicit: hosts or users approve each AIA, OCSP, CRL, or generic
HTTP request before Certificate Gadgets sends it. Browser hosts should provide a
fetch proxy or host networking implementation when direct browser `fetch()` is
blocked by HTTP-only endpoints or missing CORS headers.

The package keeps VS Code-specific file access, dialogs, network policy, and
Webview lifecycle outside `@pkistudio/certgadgets`; hosts provide those behaviors
through callbacks.

## Features

- X.509 certificate loading from DER files, PEM files, clipboard PEM, and
  clipboard HEX.
- Certificate tree and detail views for TBSCertificate fields, extensions,
  signature algorithm, and signature value.
- Extension analysis for common X.509 extensions, OIDs, GeneralName values, and
  network resources.
- Explicit network-assisted validation planning and response assessment for
  AIA, OCSP, CRL Distribution Points, and generic HTTP resources.
- Validation pane with result transcripts and request or response artifacts.
- Embedded read-only PkiStudioJS ASN.1 viewer for selected certificate DER
  objects.
- UI-independent Core API for certificate parsing, tree models, DER/PEM/HEX,
  Base64, ASN.1 helpers, and validation plan collection.
- UI-independent Validation API for OCSP request preparation, response
  assessment, artifact classification, and validation summaries.
- Embeddable browser app API for Webview and browser hosts.

See the Wiki for details:

- [Getting Started](https://github.com/pkistudio/certgadgets/wiki/Getting-Started)
- [Browser App](https://github.com/pkistudio/certgadgets/wiki/Browser-App)
- [Core API](https://github.com/pkistudio/certgadgets/wiki/Core-API)
- [Validation API](https://github.com/pkistudio/certgadgets/wiki/Validation-API)
- [Embedding](https://github.com/pkistudio/certgadgets/wiki/Embedding)
- [Testing](https://github.com/pkistudio/certgadgets/wiki/Testing)
- [Development](https://github.com/pkistudio/certgadgets/wiki/Development)

## Install

```sh
npm install @pkistudio/certgadgets
```

Package exports:

- `@pkistudio/certgadgets`: Core API.
- `@pkistudio/certgadgets/core`: Core API alias.
- `@pkistudio/certgadgets/validation`: validation helper API.
- `@pkistudio/certgadgets/app`: browser application initializer.
- `@pkistudio/certgadgets/styles.css`: application stylesheet.

## Core API

Use `CertGadgetsCore` when code needs certificate parsing or DER helpers without
mounting the browser app:

```ts
import { CertGadgetsCore } from '@pkistudio/certgadgets';

const bytes = new Uint8Array(await file.arrayBuffer());
const certificate = CertGadgetsCore.createCertificateFromBytes(bytes, file.name);
const plans = CertGadgetsCore.collectNetworkValidationPlans(certificate);

console.log(certificate.label);
console.log(plans.length);
```

The Core API parses X.509 certificates with PKIjs and asn1js, builds the
certificate tree model used by the browser app, collects explicit network
validation plans, and converts DER, PEM, HEX, Base64, ASN.1, and ArrayBuffer
data.

For full API details, see [Core API](https://github.com/pkistudio/certgadgets/wiki/Core-API).

## Validation API

Use the validation helpers directly when a host application owns confirmation,
networking, and result display:

```ts
import { CertGadgetsCore } from '@pkistudio/certgadgets';
import { CertGadgetsValidation } from '@pkistudio/certgadgets/validation';

const certificate = CertGadgetsCore.createCertificateFromBytes(bytes, 'site.cer');
const [plan] = CertGadgetsCore.collectNetworkValidationPlans(certificate);

if (plan) {
  const preparedPlan = await CertGadgetsValidation.prepareNetworkValidationPlan(plan, {
    document: certificate,
    fetchNetworkResource
  });
  const result = await fetchNetworkResource(preparedPlan);
  const assessment = await CertGadgetsValidation.assessValidationContent(preparedPlan, result);

  console.log(assessment.status, assessment.transcript);
}
```

The Validation API prepares OCSP requests, assesses HTTP and OCSP responses,
creates validation result summaries, and classifies request or response bytes as
certificate, ASN.1, or raw artifacts.

For validation flow details, see [Validation API](https://github.com/pkistudio/certgadgets/wiki/Validation-API).

## Browser App

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
    fetchNetworkResource
  }
});

app.loadCertificateBytes(new Uint8Array(await file.arrayBuffer()), file.name);
```

For host callbacks, theming, network boundaries, and embedded viewer behavior,
see [Embedding](https://github.com/pkistudio/certgadgets/wiki/Embedding).

## Development

Run local checks with:

```sh
npm run check
npm run build
```

Start the local development server with:

```sh
npm run dev -- --port 5173 --strictPort
```

Then open `http://localhost:5173/`.

For package or release-related changes, also run:

```sh
npm run pack:dry-run
```

For what the standard checks cover and where browser verification is still
needed, see [Testing](https://github.com/pkistudio/certgadgets/wiki/Testing).

For local server, package entry points, version metadata, release notes, Wiki
preview, GitHub Pages network validation, and related development details, see
[Development](https://github.com/pkistudio/certgadgets/wiki/Development).

## PkiStudioJS Dependency

Certificate Gadgets imports PkiStudioJS from the published
`@pkistudio/pkistudiojs` npm package. No vendored PkiStudioJS browser assets are
required under `public/`.

X.509 certificate parsing is handled by PKIjs, with ASN.1 support from asn1js.

## License

Certificate Gadgets is licensed under the MIT License. See [LICENSE](LICENSE).