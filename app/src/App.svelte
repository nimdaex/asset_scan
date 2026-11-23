<script lang="ts">
  import { onMount } from 'svelte';
  import Inventory from './components/Inventory.svelte';
  import Scanner, { type HitMeta } from './components/Scanner.svelte';
  import Scans from './components/Scans.svelte';
  import { buildIndex, matchKey } from './lib/inventory';
  import { extractTag, printable, type Hit } from './lib/scanner';
  import { scanKey, store, type Rec } from './lib/store.svelte';
  import { beep, load, save, vibrate } from './lib/util';

  type Tab = 'scan' | 'list' | 'raw';
  const SAME_CODE_COOLDOWN_MS = 2000;

  let tab = $state<Tab>(load('tab', 'scan'));
  let flash = $state<{ kind: 'ok' | 'dup' | 'extra'; text: string } | null>(null);
  let installEvt = $state<any>(null);

  let lastText = '';
  let lastAt = 0;
  let flashTimer = 0;

  $effect(() => save('tab', tab));

  let index = $derived(store.inventory ? buildIndex(store.inventory) : null);

  // Scans keyed by identity; first scan of a key wins. Recomputed when the list or its serial column changes.
  let byKey = $derived.by(() => {
    const m = new Map<string, Rec>();
    for (const r of [...store.records].reverse()) {
      const k = scanKey(index, r.text);
      if (!m.has(k)) m.set(k, r);
    }
    return m;
  });
  let found = $derived(index ? new Map([...byKey].filter(([k]) => index!.byKey.has(k))) : new Map<string, Rec>());
  let extras = $derived(index ? [...byKey].filter(([k]) => !index!.byKey.has(k)).map(([, r]) => r) : []);
  let progress = $derived(index ? { found: found.size, total: index.items.length } : null);

  function statusOf(text: string): 'in' | 'extra' | null {
    if (!index) return null;
    return matchKey(index, text) ? 'in' : 'extra';
  }

  onMount(() => {
    navigator.storage?.persist?.().catch(() => {});
    const onInstall = (e: Event) => {
      e.preventDefault();
      installEvt = e;
    };
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => window.removeEventListener('beforeinstallprompt', onInstall);
  });

  function onHit(h: Hit, meta: HitMeta) {
    const now = Date.now();
    if (h.text === lastText && now - lastAt < SAME_CODE_COOLDOWN_MS) {
      lastAt = now;
      return;
    }
    lastText = h.text;
    lastAt = now;

    const key = scanKey(index, h.text);
    const existing = byKey.get(key);
    if (existing) {
      existing.count++;
      showFlash('dup', key);
      vibrate([40, 60, 40]);
      beep(600, 150);
      return;
    }
    const { tag, exact } = extractTag(h.text);
    store.records.unshift({
      id: now,
      at: new Date(now).toISOString(),
      text: h.text,
      hex: h.hex,
      tag: tag || (index && index.byKey.has(key) ? key : ''),
      exact,
      engine: h.engine,
      ms: h.ms,
      source: meta.source,
      camera: meta.camera,
      model: meta.model,
      count: 1,
    });
    if (index && !index.byKey.has(key)) {
      showFlash('extra', tag || printable(h.text));
      vibrate([200, 100, 200]);
      beep(300, 300);
      return;
    }
    showFlash('ok', index ? `${key}  (${found.size}/${index.items.length})` : tag || printable(h.text));
    vibrate(80);
    beep();
  }

  /** Mark a listed asset as present without scanning (label damaged / missing). */
  function markManual(key: string) {
    const now = Date.now();
    store.records.unshift({
      id: now, at: new Date(now).toISOString(), text: key, hex: '', tag: key, exact: true,
      engine: 'manual', ms: 0, source: 'manual', camera: '', model: '', count: 1,
    });
  }

  function showFlash(kind: 'ok' | 'dup' | 'extra', text: string) {
    flash = { kind, text };
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => (flash = null), 1500);
  }

  async function install() {
    installEvt?.prompt();
    await installEvt?.userChoice;
    installEvt = null;
  }
</script>

<main>
  <header>
    <h1>Asset Scan <small>PoC</small></h1>
    {#if installEvt}<button class="small" onclick={install}>ติดตั้งแอป</button>{/if}
  </header>

  <nav class="tabs">
    <button class:active={tab === 'scan'} onclick={() => (tab = 'scan')}>สแกน</button>
    <button class:active={tab === 'list'} onclick={() => (tab = 'list')}>
      รายการ asset{progress ? ` ${progress.found}/${progress.total}` : ''}
    </button>
    <button class:active={tab === 'raw'} onclick={() => (tab = 'raw')}>ผลสแกน {store.records.length}</button>
  </nav>

  {#if tab === 'scan'}
    <Scanner onhit={onHit} {flash} {progress} />
  {:else if tab === 'list'}
    <Inventory {index} {found} {extras} onmanual={markManual} />
  {:else}
    <Scans {statusOf} />
  {/if}
</main>
