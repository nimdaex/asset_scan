<script lang="ts">
  import { parseDelimited, readTextFile } from '../lib/csv';
  import { guessLayout, type InvIndex } from '../lib/inventory';
  import { printable } from '../lib/scanner';
  import { store, type Rec } from '../lib/store.svelte';
  import { shareOrDownload, stamp, toCsv } from '../lib/util';

  interface Props {
    index: InvIndex | null;
    found: Map<string, Rec>;
    extras: Rec[];
    onmanual: (key: string) => void;
  }
  let { index, found, extras, onmanual }: Props = $props();

  type Filter = 'missing' | 'found' | 'extra' | 'all';
  const MAX_SHOWN = 300;

  let filter = $state<Filter>('missing');
  let query = $state('');
  let paste = $state('');
  let error = $state('');
  let showImport = $state(false);

  let total = $derived(index?.items.length ?? 0);
  let foundCount = $derived(index ? index.items.filter((i) => found.has(i.key)).length : 0);
  let pct = $derived(total ? Math.round((foundCount / total) * 100) : 0);

  let shown = $derived.by(() => {
    if (!index) return [];
    const q = query.trim().toUpperCase();
    const match = (row: string[], key: string) => !q || key.includes(q) || row.some((c) => c.toUpperCase().includes(q));
    if (filter === 'extra') return [];
    return index.items.filter((i) => {
      const f = found.has(i.key);
      if (filter === 'missing' && f) return false;
      if (filter === 'found' && !f) return false;
      return match(i.row, i.key);
    });
  });

  let shownExtras = $derived.by(() => {
    const q = query.trim().toUpperCase();
    return extras.filter((r) => !q || r.tag.includes(q) || r.text.toUpperCase().includes(q));
  });

  /** Up to 3 other columns, so the list shows e.g. asset no. / user / location next to the serial. */
  function details(row: string[]): string {
    if (!index || !store.inventory) return '';
    return row
      .map((c, i) => ({ c: c.trim(), i }))
      .filter(({ c, i }) => c && i !== store.inventory!.tagCol)
      .slice(0, 3)
      .map(({ c }) => c)
      .join(' · ');
  }

  function load(rows: string[][], name: string) {
    error = '';
    if (!rows.length) {
      error = 'ไม่พบข้อมูลในไฟล์';
      return;
    }
    if (store.inventory && !window.confirm('แทนที่รายการ asset เดิม? (ผลสแกนยังอยู่)')) return;
    const { tagCol, hasHeader } = guessLayout(rows);
    store.inventory = { name, importedAt: new Date().toISOString(), rows, tagCol, hasHeader };
    filter = 'missing';
    query = '';
    paste = '';
    showImport = false;
  }

  async function importFile(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      error = 'ยังไม่รองรับไฟล์ Excel โดยตรง — ใน Excel เลือก Save As → CSV UTF-8 หรือ copy คอลัมน์มาวางในช่องด้านล่าง';
      return;
    }
    try {
      load(parseDelimited(await readTextFile(file)), file.name);
    } catch (e) {
      error = 'อ่านไฟล์ไม่ได้: ' + e;
    }
  }

  function importPaste() {
    load(parseDelimited(paste), 'วางจากคลิปบอร์ด');
  }

  function setLayout(tagCol: number, hasHeader: boolean) {
    if (store.inventory) store.inventory = { ...store.inventory, tagCol, hasHeader };
  }

  function removeInventory() {
    if (window.confirm('ลบรายการ asset? (ผลสแกนยังอยู่)')) store.inventory = null;
  }

  function newRound() {
    if (window.confirm(`เริ่มนับรอบใหม่? ผลสแกน ${store.records.length} รายการจะถูกลบ (รายการ asset ยังอยู่)\nแนะนำให้ export ก่อน`)) store.records = [];
  }

  async function exportReport() {
    if (!index) return;
    const time = (r?: Rec) => (r ? new Date(r.at).toLocaleString('sv-SE') : '');
    const rows: unknown[][] = [];
    for (const i of index.items) {
      const r = found.get(i.key);
      rows.push([r ? 'FOUND' : 'MISSING', i.key, time(r), r?.source ?? '', r?.model ?? '', ...index.headers.map((_, c) => i.row[c] ?? '')]);
    }
    for (const r of extras) rows.push(['NOT_IN_LIST', r.tag || printable(r.text), time(r), r.source, r.model, ...index.headers.map(() => '')]);
    const csv = toCsv(['status', 'serial', 'scanned_at', 'source', 'note', ...index.headers], rows);
    await shareOrDownload(csv, `asset_check_${stamp()}.csv`);
  }
</script>

{#if !store.inventory || showImport}
  <section class="card">
    <h2>นำเข้ารายการ asset</h2>
    <p class="hint">ไฟล์ CSV (จาก Excel: Save As → CSV) ที่มีคอลัมน์ Serial / Service Tag — คอลัมน์อื่น (เลข asset, ผู้ใช้, สถานที่) จะแสดงประกอบ</p>
    <label class="file">📄 เลือกไฟล์ CSV<input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onchange={importFile} /></label>
    <p class="hint">หรือ copy จาก Excel / Google Sheets แล้ววางที่นี่:</p>
    <textarea rows="5" placeholder={'Service Tag\tAsset No\tUser\nABC1234\tIT-001\tสมชาย'} bind:value={paste}></textarea>
    <div class="controls">
      <button onclick={importPaste} disabled={!paste.trim()}>นำเข้าจากที่วาง</button>
      {#if store.inventory}<button onclick={() => (showImport = false)}>ยกเลิก</button>{/if}
    </div>
    {#if error}<p class="error">{error}</p>{/if}
  </section>
{:else if index}
  <section class="card">
    <div class="list-head">
      <strong>{store.inventory.name}</strong>
      <span class="hint">{new Date(store.inventory.importedAt).toLocaleDateString('th-TH')}</span>
    </div>
    <div class="bar"><div style:width="{pct}%"></div></div>
    <div class="stats">
      <span class="ok">พบ {foundCount}</span>
      <span class="warn">ขาด {total - foundCount}</span>
      <span>ทั้งหมด {total}</span>
      {#if extras.length}<span class="bad">เกินรายการ {extras.length}</span>{/if}
    </div>
    {#if total && foundCount === total}<p class="done">✓ สแกนครบทุกรายการแล้ว</p>{/if}
    {#if index.duplicates || index.blanks}
      <p class="hint">ข้าม: serial ซ้ำ {index.duplicates}, ช่องว่าง {index.blanks}</p>
    {/if}
    <div class="grid">
      <label>คอลัมน์ Serial
        <select value={store.inventory.tagCol} onchange={(e) => setLayout(+e.currentTarget.value, store.inventory!.hasHeader)}>
          {#each index.headers as h, i (i)}<option value={i}>{h}</option>{/each}
        </select>
      </label>
      <label class="check">
        <input type="checkbox" checked={store.inventory.hasHeader} onchange={(e) => setLayout(store.inventory!.tagCol, e.currentTarget.checked)} />
        แถวแรกเป็นหัวตาราง
      </label>
    </div>
    <div class="controls">
      <button class="small" onclick={exportReport}>แชร์ผลตรวจ CSV</button>
      <button class="small" onclick={newRound} disabled={!store.records.length}>เริ่มนับรอบใหม่</button>
      <button class="small" onclick={() => (showImport = true)}>นำเข้าใหม่</button>
      <button class="small danger" onclick={removeInventory}>ลบรายการ</button>
    </div>
  </section>

  <div class="chips">
    <button class:active={filter === 'missing'} onclick={() => (filter = 'missing')}>ขาด {total - foundCount}</button>
    <button class:active={filter === 'found'} onclick={() => (filter = 'found')}>พบ {foundCount}</button>
    <button class:active={filter === 'extra'} onclick={() => (filter = 'extra')}>เกิน {extras.length}</button>
    <button class:active={filter === 'all'} onclick={() => (filter = 'all')}>ทั้งหมด</button>
  </div>
  <input type="text" class="search" placeholder="ค้นหา serial / ชื่อ / เลข asset" bind:value={query} />

  <section class="list">
    {#if filter === 'extra'}
      {#each shownExtras as r (r.id)}
        <article class="extra">
          <div class="tag">{r.tag || '—'} <span class="badge warn">ไม่อยู่ในรายการ</span></div>
          <div class="raw">{printable(r.text)}</div>
          <div class="meta">{new Date(r.at).toLocaleTimeString('th-TH')}{r.model ? ' · ' + r.model : ''}</div>
        </article>
      {:else}
        <p class="hint">ไม่มี</p>
      {/each}
    {:else}
      {#each shown.slice(0, MAX_SHOWN) as i (i.key)}
        {@const r = found.get(i.key)}
        <article class:found={!!r}>
          <div class="tag">
            {r ? '✓' : '○'} {i.key}
            {#if r?.source === 'manual'}<span class="badge">เช็คเอง</span>{/if}
            {#if !r}<button class="small x" onclick={() => onmanual(i.key)}>เช็คเอง</button>{/if}
          </div>
          {#if details(i.row)}<div class="meta">{details(i.row)}</div>{/if}
          {#if r}<div class="meta">{new Date(r.at).toLocaleTimeString('th-TH')}{r.model ? ' · ' + r.model : ''}</div>{/if}
        </article>
      {:else}
        <p class="hint">{filter === 'missing' ? 'ไม่มีรายการที่ขาด' : 'ไม่มี'}</p>
      {/each}
      {#if shown.length > MAX_SHOWN}<p class="hint">แสดง {MAX_SHOWN} จาก {shown.length} — ใช้ช่องค้นหา</p>{/if}
    {/if}
  </section>
{/if}
