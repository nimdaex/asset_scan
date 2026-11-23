# asset_scan

PWA สแกน Serial Number (Service Tag) ของ Dell laptop จาก Data Matrix บนสติกเกอร์ใต้เครื่อง
เป้าหมาย: Android + Chrome, มือถือทั่วไป, export CSV

**ใช้งาน:** https://nimdaex.github.io/asset_scan/ (เปิดใน Chrome Android → เมนู ⋮ → ติดตั้งแอป)

## Deploy

ต้นฉบับอยู่ใน H-Project (`asset_scan/`) — repo public [nimdaex/asset_scan](https://github.com/nimdaex/asset_scan) เป็น snapshot สำหรับ GitHub Pages

1. commit การแก้ไขใน H-Project
2. `bash asset_scan/publish.sh "ข้อความ"` → push snapshot (author = GitHub noreply) → workflow `.github/workflows/deploy.yml` build + deploy (~1 นาที)

## สถานะ

- 2026-11-23 — ประชุมเลือก tech stack: [docs/meeting-01-tech-stack.md](docs/meeting-01-tech-stack.md) (Flutter — ยกเลิก)
- 2026-11-23 — เปลี่ยนเป็น PWA: [docs/meeting-02-pwa.md](docs/meeting-02-pwa.md)
- 2026-11-23 — PoC หน้าเดียวใน `app/` (รอทดสอบกับ Dell จริง)

## PoC (`app/`)

Vite + TypeScript + Svelte 5 · `BarcodeDetector` (native) → `zxing-wasm` (fallback, bundle ในแอป ใช้ offline ได้)

สิ่งที่ทำได้:
- เปิดกล้องหลัง (ขอ 1920×1080), เลือกกล้องได้ (จำค่าไว้), ไฟฉาย/ซูม ถ้ามือถือรองรับ, autofocus ต่อเนื่อง
- crop เฉพาะกรอบเล็งตรงกลาง (ปรับขนาดได้) ก่อน detect ~6 ครั้ง/วินาที
- เลือก engine: auto / native / zxing — เพื่อเทียบกัน
- สแกนจากรูปถ่าย (ใช้เมื่อสแกนสดไม่ติด เพื่อแยกว่าปัญหาอยู่ที่กล้องหรือตัวอ่าน)
- แสดงค่าดิบ (control chars เช่น ⟨GS⟩ ⟨RS⟩) + hex + Service Tag ที่ดึงได้
  - รองรับทั้ง tag เดี่ยว 7 ตัว และรูปแบบ ANSI MH10.8.2 (`[)>␞06␝S<tag>␝…`)
- สั่น + เสียงบี๊บ, แถบเหลืองเมื่อสแกนซ้ำ, กันจอดับ
- ช่อง "รุ่นเครื่อง" ติดไปกับผลสแกน → แชร์/ดาวน์โหลด CSV (UTF-8 BOM) ส่งกลับมาวิเคราะห์
- ติดตั้งเป็นแอปได้ (manifest + service worker)

### ตรวจนับเทียบรายการ asset (แท็บ "รายการ asset")

- นำเข้า CSV (Excel: Save As → CSV; รองรับทั้ง UTF-8 และ windows-874 ที่ Excel ภาษาไทยบันทึก) หรือ copy คอลัมน์จาก Excel/Sheets มาวาง
- เดาคอลัมน์ serial เอง (หัวตาราง "Service Tag / Serial / S/N / ซีเรียล" หรือคอลัมน์ที่ค่าเป็นรูปแบบ 7 ตัว) — เปลี่ยนได้; serial ซ้ำในไฟล์นับครั้งเดียว
- ตอนสแกน: เขียว = อยู่ในรายการ (แสดง n/N), เหลือง = สแกนแล้ว, แดง = ไม่อยู่ในรายการ; ป้าย "พบ n/N · ขาด m" บนจอกล้อง
- กรอง ขาด / พบ / เกิน / ทั้งหมด + ค้นหา; ปุ่ม "เช็คเอง" สำหรับเครื่องที่สติกเกอร์อ่านไม่ได้
- แชร์ผลตรวจ CSV: `status` (FOUND / MISSING / NOT_IN_LIST), serial, เวลา, ที่มา, หมายเหตุ + คอลัมน์เดิมทั้งหมด
- "เริ่มนับรอบใหม่" ล้างผลสแกนแต่เก็บรายการ asset ไว้
- จับคู่ได้ทั้ง Service Tag ของ Dell และ serial ยี่ห้ออื่น (เทียบค่าดิบ / token / ช่อง `S` ของ ANSI)

ข้อมูลเก็บใน localStorage ของเบราว์เซอร์ (พอสำหรับหลักพันรายการ) — MVP จะย้ายไป IndexedDB

### รัน

```sh
cd asset_scan/app
npm install
npm run dev          # http://localhost:5173 (กล้องใช้ได้บน localhost)
npm run dev:https    # https://<ip-pc>:5173 ให้มือถือใน LAN เปิด (cert self-signed → กด "ขั้นสูง > ดำเนินการต่อ")
npm run build        # → dist/ ; ตั้ง BASE_PATH=/<repo>/ เมื่อ build สำหรับ GitHub Pages
npm run check        # svelte-check
```

ทางเลือกทดสอบบนมือถือโดยไม่ต้องใช้ cert: เสียบ USB → `chrome://inspect` → Port forwarding 5173 → เปิด `localhost:5173` บนมือถือ

`fixtures/` — ภาพ Data Matrix ทดสอบ (สร้างด้วย zxing writer): `plain.png` = `ABC1234`, `ansi.png` = ANSI MH10.8.2 payload (tag เดียวกัน), `extra.png` = `XYZ9999` (ไม่อยู่ในรายการ); `inventory-cp874.csv` = รายการตัวอย่างภาษาไทยแบบ Excel (มี serial ซ้ำ 1)

### Checklist ทดสอบกับเครื่องจริง

ต่อ Dell แต่ละรุ่น: ใส่ชื่อรุ่น → สแกนสด (auto) → ลอง native / zxing แยก → ถ้าไม่ติด ลองไฟฉาย/ซูม/ลดกรอบ → ถ้ายังไม่ติด ใช้ "สแกนจากรูป" → แชร์ CSV
บันทึก: อ่านติดไหม, ใช้เวลานานแค่ไหน, ระยะห่าง, ค่าดิบที่ได้
