# Meeting #2 — เปลี่ยนเป็น Progressive Web App (PWA)

**วันที่:** 2026-11-23
**ผู้เข้าร่วม:** PM, DEV, UI, SE
**อินพุตจากเจ้าของโปรเจค:** ทำเป็น PWA (ติดตั้งง่าย) · Android อย่างเดียว · มือถือทั่วไป · export CSV
**ผลต่อ Meeting #1:** เลิกใช้ Flutter และ `mobile_scanner` ส่วนเรื่อง offline-first, กันสแกนซ้ำ และ UX แบบสแกนต่อเนื่องยังใช้ตามเดิม

---

## 1. ความเห็นแต่ละฝ่าย

### PM — ทำไม PWA ถึงเหมาะ

- ติดตั้งด้วยการส่งลิงก์ → เปิดใน Chrome → "ติดตั้งแอป" ไม่ต้องผ่าน Play Store และไม่ต้องส่ง APK ไปให้
- อัปเดตได้ทันทีทุกเครื่องเมื่อ deploy ใหม่ (service worker)
- Android + Chrome เป็นสภาพแวดล้อมที่ PWA ทำงานได้ดีที่สุดอยู่แล้ว ข้อเสียฝั่ง iOS จึงไม่กระทบเรา

### DEV — การอ่าน Data Matrix บนเว็บ

แบ่งเป็น 2 ชั้น:

1. **`BarcodeDetector` API ที่มีใน Chrome Android**: รองรับ `data_matrix` เป็น native ทำงานเร็ว และไม่ต้องโหลดอะไรเพิ่ม
2. **Fallback เป็น `zxing-wasm`** (ZXing-C++ ที่ compile เป็น WebAssembly) ผ่านแพ็กเกจ `barcode-detector` ซึ่งใช้ API เดียวกัน ใช้เมื่อเครื่องไม่มีตัวแรกหรือตัวแรกอ่านไม่ติด

เทคนิคสำหรับ code ขนาดเล็ก:
- ขอวิดีโอความละเอียดสูง (1920×1080 ขึ้นไป) แล้ว **crop เฉพาะกรอบเล็งตรงกลาง** ลง canvas ก่อนส่งไป detect เพื่อให้เร็วขึ้นและแม่นขึ้น
- detect ประมาณ 5–10 ครั้ง/วินาที (ไม่ต้องทุกเฟรม) เพื่อประหยัดแบต
- จำกัด format เป็น `data_matrix` อย่างเดียว

Stack ที่เสนอ:

| ส่วน | เลือก |
|---|---|
| Build | **Vite + TypeScript** |
| UI | **Svelte 5** (bundle เล็ก, 3 หน้าไม่ต้องใช้ framework ใหญ่) |
| PWA / offline | `vite-plugin-pwa` (Workbox) ใช้ precache ทั้งแอป เปิดได้แม้ไม่มีเน็ต |
| Scanner | `BarcodeDetector` native → fallback `barcode-detector` (zxing-wasm) |
| DB | **IndexedDB** ผ่าน `Dexie` |
| Export | CSV (UTF-8 + BOM เพื่อให้ Excel แสดงภาษาไทยถูก) |

### SE — ข้อจำกัดของแพลตฟอร์มเว็บ

- **ต้องเป็น HTTPS** เพราะถ้าไม่ใช่ จะเรียกกล้อง (`getUserMedia`) หรือ service worker ไม่ได้ ทางเลือก hosting:
  - Cloudflare Pages / GitHub Pages ฟรีและมี HTTPS ให้เลย เพราะเป็นแค่ไฟล์ static ไม่มีข้อมูลขึ้น server
  - หรือใช้ server ภายในองค์กรที่มี certificate ถูกต้อง
- **ปัญหามือถือหลายกล้อง:** Chrome อาจเลือกเลนส์ ultra-wide ซึ่งโฟกัสใกล้ไม่ได้ → ต้องมี **ปุ่มเลือกกล้อง** และจำตัวเลือกไว้
- **Torch / zoom / focus** สั่งผ่าน `track.applyConstraints()` ได้บน Chrome Android แต่รองรับไม่เท่ากันทุกรุ่น → ต้องเช็ก `getCapabilities()` ก่อน ถ้าไม่รองรับก็ซ่อนปุ่ม
- **ความเสี่ยงข้อมูลหาย:** ข้อมูลใน IndexedDB จะหายถ้าผู้ใช้ล้างข้อมูล Chrome หรือถอนการติดตั้ง
  - เรียก `navigator.storage.persist()` เพื่อกันเบราว์เซอร์ลบเอง
  - UI เตือนให้ export เมื่อมีรายการค้างยังไม่ export
- ใช้ **Screen Wake Lock API** กันจอดับระหว่างเดินสแกน

### UI — ปรับให้เข้ากับ PWA

- หน้าแรก: ถ้ายังไม่ได้ติดตั้ง แสดงปุ่ม **"ติดตั้งแอป"** (ดัก `beforeinstallprompt`)
- หน้า Scan: เต็มจอ, กรอบเล็งเล็กตรงกลาง, ปุ่ม torch / zoom / สลับกล้อง ไว้ล่างจอ (ใช้นิ้วโป้งกดได้)
- สแกนติด → สั่น (`navigator.vibrate`) + เสียงบี๊บ (Web Audio) + แถบเขียวแสดง Service Tag
- สแกนซ้ำ → แถบเหลือง, ไม่บันทึก
- หน้ารายการ: ตัวนับ, ค้นหา, ลบ, ช่องหมายเหตุ
- Export: ปุ่ม **"แชร์ CSV"** (Web Share API ส่งไฟล์เข้า LINE/Gmail/Drive ได้) + ปุ่ม **"ดาวน์โหลด"** สำรอง
- รูปแบบ CSV: `service_tag,scanned_at,note,raw`

## 2. มติที่ประชุม

- **ทำเป็น PWA ด้วย Vite + TypeScript + Svelte 5** ใช้ `BarcodeDetector` และ fallback เป็น zxing-wasm เก็บข้อมูลด้วย IndexedDB/Dexie แล้ว export CSV
- ไม่มี backend ข้อมูลอยู่บนมือถือเท่านั้นจนกว่าจะ export
- deploy บน hosting แบบ static ที่มี HTTPS

## 3. Action Items

1. **DEV:** PoC หน้าเดียว: เปิดกล้อง + เลือกกล้อง + crop ROI + BarcodeDetector/zxing แล้วแสดงค่าดิบ (raw) ที่อ่านได้
2. **SE:** นำ PoC ขึ้น HTTPS แล้วทดสอบกับ Dell จริง ≥5 รุ่น บนมือถือ Android ≥2 รุ่น บันทึกค่าดิบของ Data Matrix
3. **UI:** wireframe หน้า Scan / รายการ / Export
4. **PM:** ตัดสินจากผล PoC ว่าอ่านติดพอไหม แล้วไปต่อ MVP

## 4. คำถามที่เหลือ

1. Hosting: ใช้ Cloudflare/GitHub Pages ได้ไหม หรือต้องอยู่บน server ภายในองค์กร?
2. ต้องการช่องข้อมูลเพิ่มใน CSV ไหม (เช่น สถานที่ / ชื่อผู้สแกน)?
