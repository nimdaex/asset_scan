<script lang="ts">
  import { onMount } from 'svelte';
  import { applyAdvanced, capsOf, listCameras, openCamera, stopStream, type CamCaps } from '../lib/camera';
  import { detect, hasNative, initNative, initZxing, type EngineMode, type Hit } from '../lib/scanner';
  import { keepAwake, load, save, unlockAudio } from '../lib/util';

  export interface HitMeta {
    source: 'live' | 'photo';
    camera: string;
    model: string;
  }

  interface Props {
    onhit: (h: Hit, meta: HitMeta) => void;
    flash: { kind: 'ok' | 'dup' | 'extra'; text: string } | null;
    progress: { found: number; total: number } | null;
  }
  let { onhit, flash, progress }: Props = $props();

  const SCAN_INTERVAL_MS = 150;
  const MAX_ROI_PX = 1000;

  let video: HTMLVideoElement;
  let canvas: HTMLCanvasElement;
  let stream: MediaStream | null = null;
  let track: MediaStreamTrack | null = null;

  let running = $state(false);
  let error = $state('');
  let cameras = $state<MediaDeviceInfo[]>([]);
  let cameraId = $state<string | null>(load('cameraId', null));
  let cameraLabel = $state('');
  let caps = $state<CamCaps>({ torch: false, zoom: null, focusModes: [] });
  let torch = $state(false);
  let zoom = $state(1);
  let engine = $state<EngineMode>(load('engine', 'auto'));
  let roi = $state<number>(load('roi', 0.5));
  let model = $state<string>(load('model', ''));

  let nativeOk = $state<boolean | null>(null);
  let zxingMs = $state<number | null>(null);
  let vw = $state(0);
  let vh = $state(0);
  let boxW = $state(0);
  let boxH = $state(0);
  let lastMs = $state(0);
  let frames = $state(0);

  let timer = 0;
  let busy = false;

  // On-screen guide box that matches the cropped region (video uses object-fit: cover).
  let guide = $derived.by(() => {
    if (!vw || !vh || !boxW || !boxH) return null;
    const scale = Math.max(boxW / vw, boxH / vh);
    const side = Math.min(vw, vh) * roi * scale;
    return { side, left: (boxW - side) / 2, top: (boxH - side) / 2 };
  });

  $effect(() => save('engine', engine));
  $effect(() => save('roi', roi));
  $effect(() => save('model', model));

  onMount(() => {
    initNative().then((ok) => (nativeOk = ok));
    initZxing()
      .then((ms) => (zxingMs = ms))
      .catch((e) => (error = 'โหลด zxing ไม่ได้: ' + e));
    const onVis = () => {
      if (running) keepAwake(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
  });

  async function start() {
    error = '';
    unlockAudio();
    try {
      stream = await openCamera(cameraId);
      track = stream.getVideoTracks()[0];
      video.srcObject = stream;
      await video.play();
      cameraId = track.getSettings().deviceId ?? null;
      save('cameraId', cameraId);
      cameraLabel = track.label;
      caps = capsOf(track);
      torch = false;
      zoom = caps.zoom?.min ?? 1;
      if (caps.focusModes.includes('continuous')) {
        await applyAdvanced(track, { focusMode: 'continuous' }).catch(() => {});
      }
      cameras = await listCameras(); // labels are only available after permission
      running = true;
      keepAwake(true);
      loop();
    } catch (e) {
      error = 'เปิดกล้องไม่ได้: ' + ((e as Error).message || e);
      stop();
    }
  }

  function stop() {
    clearTimeout(timer);
    running = false;
    stopStream(stream);
    stream = null;
    track = null;
    keepAwake(false);
  }

  async function switchCamera(id: string) {
    cameraId = id;
    save('cameraId', id);
    if (running) {
      stop();
      await start();
    }
  }

  async function setTorch(on: boolean) {
    if (!track) return;
    try {
      await applyAdvanced(track, { torch: on });
      torch = on;
    } catch (e) {
      error = 'เปิดไฟฉายไม่ได้: ' + e;
    }
  }

  async function setZoom(v: number) {
    zoom = v;
    if (track) await applyAdvanced(track, { zoom: v }).catch(() => {});
  }

  function loop() {
    if (!running) return;
    timer = window.setTimeout(async () => {
      await scanFrame();
      loop();
    }, SCAN_INTERVAL_MS);
  }

  async function scanFrame() {
    if (busy || document.visibilityState !== 'visible') return;
    vw = video.videoWidth;
    vh = video.videoHeight;
    if (!vw || !vh) return;
    busy = true;
    try {
      const side = Math.round(Math.min(vw, vh) * roi);
      const out = Math.min(side, MAX_ROI_PX);
      canvas.width = canvas.height = out;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, out, out);
      const hits = await detect(engine, () => canvas, () => ctx.getImageData(0, 0, out, out));
      frames++;
      if (hits[0]) lastMs = hits[0].ms;
      for (const h of hits) onhit(h, { source: 'live', camera: cameraLabel, model: model.trim() });
    } catch (e) {
      error = 'detect error: ' + e;
    } finally {
      busy = false;
    }
  }

  async function scanPhoto(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    unlockAudio();
    error = '';
    try {
      const hits = await detect(engine, () => createImageBitmap(file), () => file);
      if (!hits.length) error = 'ไม่พบ Data Matrix ในรูป';
      for (const h of hits) onhit(h, { source: 'photo', camera: 'photo', model: model.trim() });
    } catch (e) {
      error = 'อ่านรูปไม่ได้: ' + e;
    }
  }

  const FLASH_PREFIX = { ok: '', dup: 'สแกนแล้ว: ', extra: 'ไม่อยู่ในรายการ: ' };
</script>

<section class="viewer" bind:clientWidth={boxW} bind:clientHeight={boxH}>
  <!-- svelte-ignore a11y_media_has_caption -->
  <video bind:this={video} playsinline muted></video>
  {#if running && guide}
    <div class="guide" style:width="{guide.side}px" style:height="{guide.side}px" style:left="{guide.left}px" style:top="{guide.top}px"></div>
  {/if}
  {#if progress}
    <div class="progress-pill">พบ {progress.found}/{progress.total} · ขาด {progress.total - progress.found}</div>
  {/if}
  {#if !running}
    <button class="start" onclick={start}>▶ เริ่มสแกน</button>
  {/if}
  {#if flash}
    <div class="flash {flash.kind}">{FLASH_PREFIX[flash.kind]}{flash.text}</div>
  {/if}
</section>

<canvas bind:this={canvas} hidden></canvas>

{#if error}<p class="error">{error}</p>{/if}

<section class="controls">
  {#if running}
    <button onclick={stop}>■ หยุด</button>
    {#if caps.torch}
      <button class:on={torch} onclick={() => setTorch(!torch)}>🔦 {torch ? 'ปิดไฟ' : 'ไฟฉาย'}</button>
    {/if}
  {/if}
  <label class="file">📷 สแกนจากรูป<input type="file" accept="image/*" capture="environment" onchange={scanPhoto} /></label>
</section>

{#if running && caps.zoom}
  <label class="row">ซูม {zoom.toFixed(1)}×
    <input type="range" min={caps.zoom.min} max={caps.zoom.max} step={caps.zoom.step} value={zoom}
      oninput={(e) => setZoom(+e.currentTarget.value)} />
  </label>
{/if}

<label class="row">กรอบ {Math.round(roi * 100)}%
  <input type="range" min="0.25" max="1" step="0.05" bind:value={roi} />
</label>

<div class="grid">
  <label>กล้อง
    <select value={cameraId ?? ''} onchange={(e) => switchCamera(e.currentTarget.value)} disabled={!cameras.length}>
      {#if !cameras.length}<option value="">(กดเริ่มสแกนก่อน)</option>{/if}
      {#each cameras as c, i (c.deviceId)}
        <option value={c.deviceId}>{c.label || `กล้อง ${i + 1}`}</option>
      {/each}
    </select>
  </label>
  <label>Engine
    <select bind:value={engine}>
      <option value="auto">auto (native → zxing)</option>
      <option value="native" disabled={nativeOk === false}>native BarcodeDetector</option>
      <option value="zxing">zxing-wasm</option>
    </select>
  </label>
  <label class="span">หมายเหตุ / รุ่นเครื่อง (ติดไปกับผลสแกน)
    <input type="text" placeholder="เช่น Latitude 5440, ชั้น 3" bind:value={model} />
  </label>
</div>

<details class="diag">
  <summary>Diagnostics</summary>
  <ul>
    <li>native BarcodeDetector (data_matrix): {nativeOk === null ? '…' : nativeOk ? 'มี' : 'ไม่มี'}</li>
    <li>zxing-wasm: {zxingMs === null ? 'กำลังโหลด…' : `พร้อม (${zxingMs} ms)`}</li>
    <li>ใช้อยู่: {engine}{engine !== 'zxing' && !hasNative() ? ' (ไม่มี native → zxing)' : ''}</li>
    <li>กล้อง: {cameraLabel || '-'}</li>
    <li>ความละเอียด: {vw}×{vh}, crop {Math.round(Math.min(vw, vh) * roi)} px</li>
    <li>รองรับ: torch {caps.torch ? '✓' : '✗'}, zoom {caps.zoom ? `${caps.zoom.min}–${caps.zoom.max}` : '✗'}, focus [{caps.focusModes.join(', ')}]</li>
    <li>เฟรมที่ประมวลผล: {frames}, detect ล่าสุด {lastMs} ms</li>
  </ul>
</details>
