declare module 'pkistudiojs/viewer' {
  export type PkiStudioViewerInstance = {
    close: () => void;
    loadBytes: (bytes: Uint8Array, notice?: string) => void;
    mount: Element;
    root?: DocumentFragment | Element;
  };

  const PkiStudio: {
    version?: string;
    init: (options: { mount: string | Element; fullscreen?: boolean; newWindowUrl?: string; oidUrl?: string }) => PkiStudioViewerInstance;
  };

  export default PkiStudio;
}