declare const __CERTGADGETS_VERSION__: string;

interface ImportMetaEnv {
	readonly VITE_CERTGADGETS_FETCH_PROXY_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
