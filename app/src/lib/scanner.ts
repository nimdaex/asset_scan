// Two Data Matrix engines:
//  - native: Chrome's BarcodeDetector (Shape Detection API, backed by Play services on Android)
//  - zxing:  ZXing-C++ compiled to WASM, bundled locally so it works offline
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

export type Engine = 'native' | 'zxing';
export type EngineMode = 'auto' | Engine;

export interface Hit {
  text: string;
  hex: string;
  engine: Engine;
  ms: number;
}

const zxingOpts: ReaderOptions = {
  formats: ['DataMatrix'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 4,
  // raw control chars (GS/RS), same as the native engine — not the ␝ symbols of the default HRI mode
  textMode: 'Plain',
};

let native: { detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]> } | null = null;

export async function initNative(): Promise<boolean> {
  try {
    const BD = (window as any).BarcodeDetector;
    if (!BD) return false;
    const formats: string[] = await BD.getSupportedFormats();
    if (!formats.includes('data_matrix')) return false;
    native = new BD({ formats: ['data_matrix'] });
    return true;
  } catch {
    return false;
  }
}

/** Load the WASM module up front; resolves to load time in ms. */
export async function initZxing(): Promise<number> {
  const t = performance.now();
  await prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
    fireImmediately: true,
  });
  return Math.round(performance.now() - t);
}

export function hasNative() {
  return native !== null;
}

const hex = (codes: Iterable<number>) =>
  Array.from(codes, (b) => b.toString(16).padStart(2, '0')).join(' ');

export async function detectNative(src: ImageBitmapSource): Promise<Hit[]> {
  if (!native) return [];
  const t = performance.now();
  const r = await native.detect(src);
  const ms = Math.round(performance.now() - t);
  return r.map((b) => ({
    text: b.rawValue,
    hex: hex(Array.from(b.rawValue, (ch) => ch.charCodeAt(0))),
    engine: 'native' as const,
    ms,
  }));
}

export async function detectZxing(src: ImageData | Blob): Promise<Hit[]> {
  const t = performance.now();
  const r = await readBarcodes(src, zxingOpts);
  const ms = Math.round(performance.now() - t);
  return r
    .filter((b) => b.isValid)
    .map((b) => ({ text: b.text, hex: hex(b.bytes), engine: 'zxing' as const, ms }));
}

/** Run the selected engine(s) on one image. In auto mode zxing runs only if native finds nothing. */
export async function detect(
  mode: EngineMode,
  forNative: () => ImageBitmapSource | Promise<ImageBitmapSource>,
  forZxing: () => ImageData | Blob,
): Promise<Hit[]> {
  if (mode !== 'zxing' && native) {
    const hits = await detectNative(await forNative());
    if (hits.length || mode === 'native') return hits;
  }
  if (mode === 'native') return [];
  return detectZxing(forZxing());
}

// ---- content helpers ----------------------------------------------------

const CTRL: Record<number, string> = { 0x04: 'EOT', 0x1d: 'GS', 0x1e: 'RS', 0x0a: 'LF', 0x0d: 'CR' };

/** Make control characters (GS1/ANSI MH10 separators) visible. */
export function printable(s: string): string {
  return Array.from(s, (ch) => {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c === 0x7f) return `⟨${CTRL[c] ?? c.toString(16).padStart(2, '0')}⟩`;
    return ch;
  }).join('');
}

/**
 * Best guess at a Dell Service Tag (7 chars A–Z/0–9).
 * Handles a bare tag, and ANSI MH10.8.2 payloads ("[)>␞06␝S<tag>␝…") where data identifier S = serial number.
 * exact=false means the tag was pulled out of a longer payload.
 */
export function extractTag(text: string): { tag: string; exact: boolean } {
  const up = text.trim().toUpperCase();
  if (/^[A-Z0-9]{7}$/.test(up)) return { tag: up, exact: true };
  const fields = up.split(/[\x00-\x1f␀-␟]+/);
  const di = fields.find((f) => /^S[A-Z0-9]{7}$/.test(f));
  if (di) return { tag: di.slice(1), exact: false };
  const tok = up.split(/[^A-Z0-9]+/).find((t) => t.length === 7);
  return { tag: tok ?? '', exact: false };
}
