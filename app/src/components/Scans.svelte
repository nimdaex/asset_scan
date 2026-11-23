<script lang="ts">
  import { printable } from '../lib/scanner';
  import { store } from '../lib/store.svelte';
  import { shareOrDownload, stamp, toCsv } from '../lib/util';

  interface Props {
    statusOf: (text: string) => 'in' | 'extra' | null;
  }
  let { statusOf }: Props = $props();

  function remove(id: number) {
    store.records = store.records.filter((r) => r.id !== id);
  }

  function clearAll() {
    if (store.records.length && window.confirm(`ลบผลสแกนทั้งหมด ${store.records.length} รายการ?`)) store.records = [];
  }

  async function exportCsv() {
    const csv = toCsv(
      ['scanned_at', 'service_tag', 'tag_exact', 'raw_text', 'raw_hex', 'engine', 'detect_ms', 'source', 'camera', 'note', 'scan_count', 'user_agent'],
      store.records.map((r) => [r.at, r.tag, r.exact, printable(r.text), r.hex, r.engine, r.ms, r.source, r.camera, r.model, r.count, navigator.userAgent]),
    );
    await shareOrDownload(csv, `asset_scan_raw_${stamp()}.csv`);
  }
</script>

<section class="list">
  <div class="list-head">
    <strong>ผลสแกน {store.records.length} รายการ</strong>
    <span>
      <button class="small" onclick={exportCsv} disabled={!store.records.length}>แชร์ CSV</button>
      <button class="small danger" onclick={clearAll} disabled={!store.records.length}>ลบทั้งหมด</button>
    </span>
  </div>
  {#each store.records as r (r.id)}
    {@const st = statusOf(r.text)}
    <article class:extra={st === 'extra'}>
      <div class="tag">
        {r.tag || '—'}
        {#if st === 'in'}<span class="badge ok">ในรายการ</span>{/if}
        {#if st === 'extra'}<span class="badge warn">ไม่อยู่ในรายการ</span>{/if}
        {#if r.tag && !r.exact && r.source !== 'manual'}<span class="badge">ดึงจากข้อความยาว</span>{/if}
        {#if r.count > 1}<span class="badge">×{r.count}</span>{/if}
        <button class="x" onclick={() => remove(r.id)} aria-label="ลบ">✕</button>
      </div>
      <div class="raw">{printable(r.text)}</div>
      <div class="meta">{r.engine} · {r.ms} ms · {r.source}{r.model ? ' · ' + r.model : ''} · {new Date(r.at).toLocaleTimeString('th-TH')}</div>
      {#if r.hex}<details><summary>hex</summary><code>{r.hex}</code></details>{/if}
    </article>
  {/each}
</section>
