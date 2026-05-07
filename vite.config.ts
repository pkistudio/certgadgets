import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const DEV_FETCH_PROXY_PATH = '/__certgadgets_fetch';

export default defineConfig({
  base: './',
  plugins: [certgadgetsDevFetchProxy()],
  build: {
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: {
        main: resolve(__dirname, 'index.html'),
        viewer: resolve(__dirname, 'viewer.html'),
        core: resolve(__dirname, 'src/core.ts'),
        app: resolve(__dirname, 'src/app.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => assetInfo.names?.some((name) => name.endsWith('.css')) ? 'styles.css' : 'assets/[name][extname]',
        minifyInternalExports: false
      }
    }
  }
});

function certgadgetsDevFetchProxy(): Plugin {
  return {
    name: 'certgadgets-dev-fetch-proxy',
    configureServer(server) {
      server.middlewares.use(DEV_FETCH_PROXY_PATH, async (request, response) => {
        const requestUrl = new URL(request.url ?? '', 'http://localhost');
        const target = requestUrl.searchParams.get('url');
        if (!target || !/^https?:\/\//i.test(target)) {
          response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Missing or unsupported target URL.');
          return;
        }

        try {
          const requestBytes = request.method === 'POST' ? await readRequestBody(request) : undefined;
          const targetResponse = await fetch(target, {
            method: request.headers['x-certgadgets-target-method']?.toString() ?? (requestBytes ? 'POST' : 'GET'),
            headers: createProxyTargetHeaders(request),
            body: requestBytes ? Buffer.from(requestBytes) : undefined
          });
          const bytes = new Uint8Array(await targetResponse.arrayBuffer());
          response.writeHead(targetResponse.status, {
            'Content-Type': targetResponse.headers.get('Content-Type') ?? 'application/octet-stream',
            'X-CertGadgets-Proxied': '1'
          });
          response.end(bytes);
        } catch (error) {
          response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end(error instanceof Error ? error.message : String(error));
        }
      });
    }
  };
}

function createProxyTargetHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  const contentType = request.headers['x-certgadgets-target-content-type']?.toString();
  const accept = request.headers['x-certgadgets-target-accept']?.toString();
  if (contentType) headers.set('Content-Type', contentType);
  if (accept) headers.set('Accept', accept);
  return headers;
}

async function readRequestBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return new Uint8Array(Buffer.concat(chunks));
}