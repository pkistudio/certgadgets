import PkiStudio from 'pkistudiojs/viewer';

const PKISTUDIO_OIDS_URL = new URL('../node_modules/pkistudiojs/app/static/oids.json', import.meta.url).href;

window.addEventListener('DOMContentLoaded', () => {
  PkiStudio.init({
    mount: '#pkistudioViewer',
    fullscreen: true,
    oidUrl: PKISTUDIO_OIDS_URL
  });
});