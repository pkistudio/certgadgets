declare module '@pkistudio/pkistudiojs/oid-resolver' {
  const PkiStudioOidResolver: (oid: string) => string;
  export default PkiStudioOidResolver;
}

declare module '@pkistudio/pkistudiojs/viewer' {
  export type PkiStudioViewerInstance = {
    close: () => void;
    loadBytes: (bytes: Uint8Array, notice?: string) => void;
    mount: Element;
    root?: DocumentFragment | Element;
  };

  const PkiStudio: {
    version?: string;
    init: (options: { mount: string | Element; fullscreen?: boolean; newWindowUrl?: string; oidResolver?: (oid: string) => string }) => PkiStudioViewerInstance;
  };

  export default PkiStudio;
}