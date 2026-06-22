import ELK from 'elkjs/lib/elk.bundled.js';
// @ts-ignore
import * as ELKWorkerModule from 'elkjs/lib/elk-worker.min.js';

// Unwraps custom worker constructor from any level of ESM/CommonJS module wrapping
function findWorkerConstructor(obj: any): any {
  if (typeof obj === 'function') {
    return obj;
  }
  if (obj && typeof obj === 'object') {
    if (typeof obj.Worker === 'function') return obj.Worker;
    if (typeof obj.default === 'function') return obj.default;
    if (obj.default && typeof obj.default === 'object') {
      return findWorkerConstructor(obj.default);
    }
  }
  return null;
}

const ELKWorker = findWorkerConstructor(ELKWorkerModule) || findWorkerConstructor(ELK);

const elk = new ELK({
  workerFactory: () => {
    if (!ELKWorker) {
      throw new Error('Could not resolve ELKWorker constructor');
    }
    return new ELKWorker();
  }
});

self.onmessage = async function (e: MessageEvent) {
  const { requestId, elkGraph, layoutOptions } = e.data;
  try {
    const layouted = await elk.layout(elkGraph, {
      layoutOptions,
      logging: false,
    });
    self.postMessage({ requestId, result: layouted });
  } catch (err: any) {
    self.postMessage({ requestId, error: err.message || String(err) });
  }
};
