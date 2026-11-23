# Meeting #1 — เลือก Tech Stack: asset_scan

**วันที่:** 2026-11-23
**ผู้เข้าร่วม:** Project Manager (PM), Developer (DEV), UI Designer (UI), System Engineer (SE)
**วาระ:** เลือก tech stack สำหรับแอปมือถือสแกน Serial Number (Service Tag) ของ Dell laptop จาก Data Matrix

---

## 1. โจทย์ (PM)

- สแกน Data Matrix บนสติกเกอร์ใต้เครื่อง Dell → ได้ **Service Tag** (7 ตัวอักษร A–Z/0–9)
- ใช้งานจริงคือการเดินนับ/ตรวจ asset ทีละหลายสิบถึงหลายร้อยเครื่อง → **ความเร็วต่อเครื่อง** และ **กันสแกนซ้ำ** สำคัญกว่าความสวยงาม
- ผลลัพธ์ต้องเอาออกไปใช้ต่อได้ (Excel/CSV หรือระบบ asset กลาง)

## 2. ความเห็นแต่ละฝ่าย

### DEV — ตัวเลือกเทคโนโลยี

| ตัวเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| **Flutter + `mobile_scanner`** (ML Kit บน Android) | โค้ดเดียว Android+iOS, รองรับ Data Matrix, ฟรี, พัฒนาบน Windows ได้ (Android) | iOS ต้อง build บน Mac |
| React Native + `react-native-vision-camera` | ใช้ JS/TS, code scanner รองรับ Data Matrix | ตั้งค่า native ยุ่งกว่า, upgrade พังบ่อยกว่า |
| Native Kotlin + CameraX + ML Kit | ควบคุมกล้อง (focus/zoom/torch) ได้ละเอียดที่สุด | ได้แค่ Android |
| SDK เชิงพาณิชย์ (Scandit / Dynamsoft) | อ่าน code เล็ก/ซีด/โค้งได้ดีที่สุด, batch scan | มีค่า license รายเครื่อง/ปี |

DEV เสนอ: **Flutter + mobile_scanner** เป็นหลัก แล้วออกแบบชั้น scanner ให้เป็น interface เพื่อสลับไปใช้ Dynamsoft/Scandit ได้ถ้า ML Kit อ่านไม่ผ่าน

### SE — ข้อจำกัดเชิงระบบ

- Data Matrix บนสติกเกอร์ Dell **เล็กมาก** (~5–8 มม.) → ต้องมี autofocus ระยะใกล้, ปุ่ม zoom และไฟฉาย (torch) ใช้ในห้อง server/ใต้โต๊ะที่มืด
- **เนื้อหาใน Data Matrix ยังไม่ยืนยัน** — บางรุ่นอาจมีแค่ Service Tag บางรุ่นอาจมีข้อมูลอื่นปน → ต้องเก็บตัวอย่างจากเครื่องจริงก่อน แล้วเขียน parser + validate `^[A-Z0-9]{7}$`
- ใช้งานแบบ **offline-first**: เก็บลง SQLite ในเครื่องก่อน, sync/export ทีหลัง (พื้นที่คลังมักไม่มี Wi-Fi)
- Backend ระยะแรกไม่จำเป็น — export CSV / share sheet พอ; เฟสถัดไปค่อยต่อ REST API หรือ Google Sheets
- ถ้าองค์กรใช้ rugged scanner (Zebra/Honeywell) อาจรับข้อมูลผ่าน keyboard wedge/DataWedge แทนกล้องได้ — ควรรองรับเป็นทางเลือก

### UI — ประสบการณ์ใช้งาน

- เปิดแอปแล้ว **เข้าหน้ากล้องทันที** มีกรอบเล็งตรงกลาง (code เล็ก ต้องให้ผู้ใช้เล็งชัด)
- สแกนติด → **สั่น + เสียง + แถบเขียว** แสดง Service Tag ตัวใหญ่ แล้วพร้อมสแกนต่ออัตโนมัติ (continuous mode)
- สแกนซ้ำ → **แถบเหลือง** "สแกนแล้ว" ไม่บันทึกซ้ำ
- ปุ่มใหญ่สำหรับใช้มือเดียว: torch, zoom, พิมพ์เอง (กรณีสติกเกอร์ขาด)
- หน้ารายการ: ตัวนับจำนวน, ค้นหา, ลบ, ใส่หมายเหตุ/สถานที่, ปุ่ม Export
- รองรับภาษาไทย/อังกฤษ

### PM — ขอบเขตและความเสี่ยง

- ความเสี่ยงอันดับ 1 คือ **อ่าน code เล็กไม่ติด** → ทำ **Spike/PoC 1–2 วัน** ทดสอบกับ Dell จริงอย่างน้อย 5 รุ่น ก่อนลงมือทำ UI จริง
- MVP: สแกน → บันทึก → กันซ้ำ → export CSV จบในเครื่อง ไม่มี server

## 3. มติที่ประชุม (ข้อเสนอ — รอผู้ใช้ยืนยัน)

| ส่วน | เลือก |
|---|---|
| Framework | **Flutter (Dart)** |
| Scanner | **`mobile_scanner`** (จำกัด format = Data Matrix เพื่อความเร็ว) — แผนสำรอง: Dynamsoft/Scandit |
| Local DB | **SQLite** ผ่าน `drift` |
| State management | `riverpod` |
| Export | CSV + `share_plus` (ส่งเข้า LINE/Email/Drive) |
| Feedback | `vibration` / เสียงบี๊บ |
| Platform เป้าหมาย | Android ก่อน (พัฒนาบน Windows ได้เลย), iOS ภายหลัง |
| Backend | ยังไม่มีใน MVP |

## 4. Action Items

1. **SE:** เก็บภาพ/ค่าดิบจาก Data Matrix ของ Dell จริง ≥5 รุ่น เพื่อดูรูปแบบข้อมูล
2. **DEV:** ทำ PoC Flutter + mobile_scanner วัดอัตราอ่านติด/เวลาต่อเครื่อง (มี torch + zoom)
3. **UI:** wireframe 3 หน้า: Scan, รายการ, Export
4. **PM:** สรุปผล PoC → ตัดสินใจใช้ ML Kit ต่อ หรือซื้อ SDK เชิงพาณิชย์

## 5. คำถามที่ต้องให้เจ้าของโปรเจคตอบ

1. ใช้กับ **Android อย่างเดียว** หรือต้องมี **iOS** ด้วย?
2. ใช้มือถือทั่วไป หรือ **rugged scanner** (Zebra ฯลฯ)?
3. ข้อมูลที่สแกนแล้วต้องไปที่ไหน — แค่ Excel/CSV, Google Sheets, หรือระบบ asset ที่มีอยู่แล้ว?
4. นอกจาก Service Tag ต้องเก็บอะไรเพิ่มไหม (สถานที่, ผู้ถือครอง, รูปถ่าย, สถานะ)?
