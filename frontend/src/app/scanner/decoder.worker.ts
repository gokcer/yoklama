/// <reference lib="webworker" />
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';

prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => path.endsWith('.wasm') ? `/zxing/${path}` : prefix + path },
  fireImmediately: true,
});

const opts: ReaderOptions = { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 };

addEventListener('message', async ({ data }) => {
  const { id, image, frameServerMs, source } = data as {
    id: number; image: ImageData; frameServerMs: number; source: string;
  };
  try {
    const results = await readBarcodes(image, opts);
    const r = results.find(x => x.isValid && x.text);
    const p = r?.position;
    postMessage({
      id, w: image.width, h: image.height, text: r?.text ?? null,
      corners: p ? [
        [p.topLeft.x, p.topLeft.y], [p.topRight.x, p.topRight.y],
        [p.bottomRight.x, p.bottomRight.y], [p.bottomLeft.x, p.bottomLeft.y],
      ] : null,
      frameServerMs, source,
    });
  } catch (e) {
    postMessage({ id, error: String(e) });
  }
});
