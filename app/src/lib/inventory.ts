// The imported asset list and matching scans against it.
import { extractTag } from './scanner';

export interface Inventory {
  name: string;
  importedAt: string;
  rows: string[][]; // raw table, including the header row if hasHeader
  tagCol: number;
  hasHeader: boolean;
}

export interface InvItem {
  key: string; // normalised serial
  row: string[];
}

export interface InvIndex {
  items: InvItem[];
  byKey: Map<string, InvItem>;
  headers: string[];
  duplicates: number; // serials listed more than once (kept once)
  blanks: number; // rows with an empty serial cell
}

const TAG_RE = /^[A-Z0-9]{7}$/;
const HEADER_HINT = /service\s*tag|serial|s\/?n\b|^sn$|^tag$|ซีเรียล|หมายเลขเครื่อง/i;

export const norm = (s: string) => s.toUpperCase().replace(/\s+/g, '');

/** Pick the serial column: a header that looks like one, otherwise the column with most Dell-tag-shaped values. */
export function guessLayout(rows: string[][]): { tagCol: number; hasHeader: boolean } {
  const first = rows[0] ?? [];
  const hinted = first.findIndex((h) => HEADER_HINT.test(h.trim()));
  if (hinted >= 0) return { tagCol: hinted, hasHeader: true };

  const width = Math.max(0, ...rows.map((r) => r.length));
  let best = 0;
  let bestScore = -1;
  for (let c = 0; c < width; c++) {
    const score = rows.slice(0, 300).filter((r) => TAG_RE.test(norm(r[c] ?? ''))).length;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return { tagCol: best, hasHeader: rows.length > 1 && !TAG_RE.test(norm(first[best] ?? '')) };
}

export function buildIndex(inv: Inventory): InvIndex {
  const width = Math.max(0, ...inv.rows.map((r) => r.length));
  const headers = inv.hasHeader
    ? Array.from({ length: width }, (_, i) => inv.rows[0][i]?.trim() || `คอลัมน์ ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `คอลัมน์ ${i + 1}`);
  const byKey = new Map<string, InvItem>();
  const items: InvItem[] = [];
  let duplicates = 0;
  let blanks = 0;
  for (const row of inv.hasHeader ? inv.rows.slice(1) : inv.rows) {
    const key = norm(row[inv.tagCol] ?? '');
    if (!key) {
      blanks++;
      continue;
    }
    if (byKey.has(key)) {
      duplicates++;
      continue;
    }
    const item = { key, row };
    byKey.set(key, item);
    items.push(item);
  }
  return { items, byKey, headers, duplicates, blanks };
}

/** Strings from a scan that could equal a serial in the list (works for non-Dell serials too). */
function candidates(text: string): string[] {
  const out = [extractTag(text).tag, norm(text)];
  for (const t of text.toUpperCase().split(/[^A-Z0-9-]+/)) if (t) out.push(t);
  // ANSI MH10.8.2 serial field "S<serial>"
  for (const f of text.toUpperCase().split(/[\x00-\x1f]+/)) if (f.startsWith('S') && f.length > 1) out.push(f.slice(1));
  return out.filter(Boolean);
}

/** Inventory key a scanned payload belongs to, or null if it is not in the list. */
export function matchKey(index: InvIndex | null, text: string): string | null {
  if (!index) return null;
  for (const c of candidates(text)) if (index.byKey.has(c)) return c;
  return null;
}
