# Certificate Gadgets

Certificate Gadgets is an experimental browser tool and reusable API module for
investigating and analyzing X.509 certificates. It is planned as a dedicated
certificate-analysis companion in the PKI Studio ecosystem, using PkiStudioJS as
the shared certificate and ASN.1 foundation.

Current version: 0.0.0

## Features

### Certificate Investigation

- Loads certificate data for inspection and analysis.
- Shows certificate identity, issuer, validity, public key, and extension
  details in a certificate-focused UI.
- Highlights certificate structure in a form that can be reused by PKI Studio
  tools and Webview hosts.
- Keeps the investigation workflow separate from key-generation and PKCS#12
  workflows handled by related PKI Studio modules.

### Analysis API

- Exposes certificate parsing and analysis helpers as a UI-independent API.
- Uses PkiStudioJS internally for shared PKI and ASN.1 behavior.
- Keeps host-specific behavior, file access, and Webview lifecycle outside the
  core module.
- Prepares the package shape for reuse from browser applications and VS Code
  Webviews.

### Application Shell

- Provides a dedicated UI surface for certificate investigation tasks.
- Plans to support embedded certificate viewers, diagnostics, and operation
  logging.
- Follows the PKI Studio family style so certificate tools can feel consistent
  with related modules.

## Development

This repository is currently private and in early preparation. Project
scaffolding, package scripts, and public API entry points will be added as the
module takes shape.

## Reusing from npm

The npm package is not published yet. The intended package will expose a
certificate-analysis API and a browser/Webview application initializer.

## License

Certificate Gadgets is licensed under the MIT License. See [LICENSE](LICENSE).

## PkiStudioJS Dependency

The application is expected to import PkiStudioJS from the PKI Studio JavaScript
package:

- `pkistudiojs/core`
- `pkistudiojs/oid-resolver`
- `pkistudiojs/viewer`

The exact import surface will be finalized as the certificate-analysis API is
implemented.
