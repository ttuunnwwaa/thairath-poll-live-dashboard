# Lucky Draw Wheel 2026

เว็บแอปวงล้อสุ่มหมายเลขสำหรับงานอีเวนต์ ออกแบบในธีม Football Broadcast + Premium Event ใช้งานบน Chrome, Safari และ Edge รุ่นปัจจุบัน รองรับจอ Notebook, Full HD, 4K, Projector และ LED

ระบบนี้ทำงานทั้งหมดใน Browser ไม่มี Backend ไม่มี API ภายนอก ไม่มี CDN และไม่ดาวน์โหลดฟอนต์หรือ Asset จากอินเทอร์เน็ต ข้อมูลหมายเลข ประวัติ รูปภาพ เสียง และการตั้งค่าจะบันทึกใน IndexedDB ของเครื่องผู้ใช้เท่านั้น

> โปรเจกต์ไม่มีโลโก้ FIFA, World Cup หรือไทยรัฐ ผู้จัดงานต้องอัปโหลดเฉพาะโลโก้หรือภาพที่มีสิทธิ์ใช้งานเอง

## ความสามารถหลัก

- สร้างช่วงหมายเลขพร้อม Padding, Prefix และ Suffix รองรับสูงสุด 1,000 รายการ
- เพิ่มรายการด้วย comma, semicolon, tab หรือ newline และตรวจรายการซ้ำ
- Import CSV/TXT พร้อมเลือกคอลัมน์ และ Export CSV แบบ UTF-8 BOM สำหรับ Excel
- วงล้อ Canvas คมชัดตาม `devicePixelRatio` พร้อม Adaptive Rendering เมื่อรายการจำนวนมาก
- เลือกผู้ชนะด้วย Web Crypto API ก่อนคำนวณองศาหมุน
- Winner Popup ขนาดใหญ่ พร้อมยืนยัน ยกเลิก คัดลอก และเอฟเฟกต์
- นำหมายเลขที่ยืนยันแล้วออกจากวงล้อแบบเปิด/ปิดได้
- Undo ผลล่าสุด คืนหมายเลข และรีเซ็ตรายการที่นำออก
- ประวัติพร้อม Project ID, Session ID, Unique Draw ID และ Export CSV
- อัปโหลดพื้นหลัง โลโก้ เข็ม รูปในช่อง และเสียงผู้ชนะจากเครื่อง
- Auto Save, Export/Import ไฟล์ `.wheel.json` เพื่อย้ายเครื่อง
- Stage Mode, Fullscreen, Keyboard Shortcuts, Performance Mode และ `prefers-reduced-motion`

## กลไกการสุ่มอย่างโปร่งใส

1. เมื่อกดเริ่ม ระบบใช้ `crypto.getRandomValues()` เลือกดัชนีจาก Active Pool ด้วย rejection sampling เพื่อลด modulo bias
2. ระบบกำหนดผู้ชนะก่อนเริ่ม Animation
3. จากนั้นจึงคำนวณมุมหมุนหลายรอบให้กึ่งกลางช่องของผู้ชนะหยุดตรงเข็ม
4. ผลยังไม่ถูกบันทึกหรือนำออกจนกด “ยืนยันผล”

ไม่มี Weighted Draw, Hidden Admin Override, Secret Winner หรือ URL Parameter สำหรับบังคับผล หาก Browser รุ่นเก่ามากไม่มี Web Crypto ระบบจะ fallback เป็น `Math.random()` พร้อมใช้งาน แต่ Browser รุ่นปัจจุบันที่รองรับตามข้อกำหนดจะใช้ Web Crypto

## เริ่มใช้งาน

ต้องติดตั้ง [Node.js รุ่น LTS](https://nodejs.org/) หนึ่งครั้ง

```bash
npm install
npm run dev
```

เปิด URL ที่ Terminal แสดง (ค่าเริ่มต้น `http://localhost:4173/`)

คำสั่งทั้งหมด:

```bash
npm run dev      # Development Server
npm run test     # ทดสอบฟังก์ชันหลัก
npm run build    # สร้าง Static Website ใน dist/
npm run preview  # ทดลองไฟล์ที่ Build แล้ว
```

### เปิดแบบง่ายบน Windows

ดับเบิลคลิก `start.bat` ระบบจะติดตั้ง Dependency หากจำเป็นและเปิด Development Server

### เปิดแบบง่ายบน macOS

ครั้งแรกให้เปิด Terminal ในโฟลเดอร์โปรเจกต์แล้วรัน:

```bash
chmod +x start.command
./start.command
```

หลังจากนั้นดับเบิลคลิก `start.command` ได้ หาก macOS เตือนความปลอดภัย ให้คลิกขวาไฟล์แล้วเลือก Open

การเปิด `index.html` ด้วย `file://` โดยตรงไม่แนะนำ เพราะ ES Modules และ IndexedDB อาจถูก Browser จำกัด ให้ใช้ Local Server ข้างต้นแทน หลังติดตั้ง Dependency แล้ว การใช้งานแอปไม่ต้องเชื่อมต่ออินเทอร์เน็ต

## วิธีใช้งานในงาน

1. เปิด “ตั้งค่าระบบ” แล้วเตรียมหมายเลขในแท็บ “หมายเลข”
2. ตั้งชื่อแคมเปญ อัปโหลดโลโก้ที่มีสิทธิ์ใช้ และเลือกสี
3. ทดลองเสียง Fullscreen และ Stage Mode บนจอจริง
4. กด “เริ่มสุ่ม” หรือ Space
5. ตรวจผลใน Popup แล้วกด “ยืนยันผล”
6. Export Project เป็นระยะเพื่อทำสำเนาสำรอง

คีย์ลัด:

- `Space` เริ่มสุ่ม เมื่อไม่ได้พิมพ์ในช่องกรอกและ Popup ปิดอยู่
- `F` เปิด/ปิด Fullscreen
- `S` เปิด/ปิด Stage Mode

## สร้าง Repository และ Push ขึ้น GitHub

สร้าง Repository ใหม่บน GitHub โดยไม่ต้องเพิ่ม README หรือ `.gitignore` จากหน้าเว็บ แล้วรัน:

```bash
git init
git add .
git commit -m "Initial Lucky Draw application"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY-NAME.git
git push -u origin main
```

เปลี่ยน `USERNAME` และ `REPOSITORY-NAME` ให้ตรงกับบัญชีของคุณ จะใช้ Repository แบบ Public หรือ Private ก็ได้ตามสิทธิ์ GitHub Pages ของบัญชี

## เปิด GitHub Pages

1. เข้า Repository → Settings → Pages
2. ในหัวข้อ Build and deployment เลือก Source เป็น **GitHub Actions**
3. Push หรือ Merge เข้า Branch `main`
4. Workflow `.github/workflows/deploy-pages.yml` จะรัน Test, Build, Upload Artifact และ Deploy
5. เมื่อสำเร็จ เว็บไซต์จะอยู่ที่ `https://USERNAME.github.io/REPOSITORY-NAME/`

โปรเจกต์ใช้ Vite `base: "./"` ทำให้ Asset โหลดถูกต้องทั้ง Root Domain และ GitHub Pages Subpath และเป็น Single Page ที่ไม่มี Client-side Route จึง Refresh แล้วไม่เกิด 404

## อัปเดตเว็บไซต์ครั้งถัดไป

```bash
git add .
git commit -m "Update Lucky Draw"
git push
```

GitHub Actions จะ Deploy เวอร์ชันใหม่โดยอัตโนมัติ หาก Test หรือ Build ไม่ผ่าน ขั้น Deploy จะหยุดและแสดง Error ในหน้า Actions

## ความเป็นส่วนตัว

- ข้อมูล Auto Save อยู่ใน IndexedDB ของ Browser เครื่องนั้น
- รูป เสียง หมายเลขจริง และประวัติไม่ถูกส่งไป GitHub หรือ Server
- Git จะเก็บเฉพาะ Source Code
- ไฟล์ `*.wheel.json` ถูก ignore เพื่อป้องกันการ Commit ข้อมูลใช้งานจริงโดยไม่ตั้งใจ
- การย้ายเครื่องต้อง Export Project และนำไฟล์ไป Import ด้วยตนเอง

## ทดสอบก่อนวันงาน

- ทดลองกับ Browser และเครื่องที่จะใช้งานจริง
- ตรวจขนาดข้อความผู้ชนะบนจอ LED/Projector
- ตรวจ Fullscreen และตั้งค่าไม่ให้เครื่อง Sleep
- ทดลอง Export/Import Project หนึ่งรอบ
- เก็บสำเนาโปรเจกต์และไฟล์ `.wheel.json` ไว้ในอุปกรณ์สำรอง
- หากเครื่องช้า ให้เปิด Performance Mode

## โครงสร้างสำคัญ

```text
index.html
src/
  main.js
  core.js
  storage.js
  styles.css
tests/
  core.test.js
.github/workflows/deploy-pages.yml
vite.config.js
start.bat
start.command
```
