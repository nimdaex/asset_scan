// App-wide state, persisted to localStorage.
import { buildIndex, matchKey, norm, type Inventory } from './inventory';
import { extractTag } from './scanner';
import { load, save } from './util';

export interface Rec {
  id: number;
  at: string;
  text: string;
  hex: string;
  tag: string;
  exact: boolean;
  engine: string;
  ms: number;
  source: 'live' | 'photo' | 'manual';
  camera: string;
  model: string; // free-text note
  count: number;
}

export const store = $state({
  records: load<Rec[]>('records', []),
  inventory: load<Inventory | null>('inventory', null),
});

$effect.root(() => {
  $effect(() => save('records', $state.snapshot(store.records)));
  $effect(() => save('inventory', $state.snapshot(store.inventory)));
});

/** Identity of a scan: the inventory serial it matches, else its Service Tag, else the raw payload. */
export function scanKey(index: ReturnType<typeof buildIndex> | null, text: string): string {
  return matchKey(index, text) ?? (extractTag(text).tag || norm(text));
}
