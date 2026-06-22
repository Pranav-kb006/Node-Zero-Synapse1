import ELK from 'elkjs/lib/elk.bundled.js';
// @ts-ignore - raw import gives us the worker source as a string
import elkWorkerSource from 'elkjs/lib/elk-worker.min.js?raw';

const blob = new Blob([elkWorkerSource], { type: 'application/javascript' });
const elkWorkerUrl = URL.createObjectURL(blob);

const elk = new ELK({
  workerUrl: elkWorkerUrl,
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
