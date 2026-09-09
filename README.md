# Thairath Poll — Live Event Dashboard

เว็บแดชบอร์ดผลโหวตสำหรับงานขึ้นจอ ออกแบบตามผัง LED 3 จอของงาน รองรับโพล 2 ชุดที่เตรียมล่วงหน้าได้ และมีตัวควบคุมกลางเลือกชุด/สถานะที่กำลังออกจอผ่าน Supabase Realtime

## URL และขนาดจอ

| URL | จอจริง | เนื้อหา |
| --- | ---: | --- |
| `/admin` | Desktop/Notebook | ล็อกอิน แก้คะแนน งานภาพ ดูประวัติ และ live preview |
| `/display` | **1530 × 896 px** | จอกลาง แสดงผลรวมทุกตัวเลือกหรือเนื้อหาที่กำหนด |
| `/display/gold` | **512 × 896 px** | จอซ้าย แสดงตัวเลือกที่กำหนดเต็มพื้นที่ |
| `/display/property` | **512 × 896 px** | จอขวา แสดงตัวเลือกที่กำหนดเต็มพื้นที่ |

ความกว้างรวมตามผังงานคือ 512 + 1530 + 512 = 2554 px (ในแบบระบุพื้นที่รวมโดยประมาณ 2560 × 896 px) แต่แต่ละ URL ถูกออกแบบให้ส่งออกลง LED processor แยกจอ จึงไม่มีขอบหรือช่องว่างภายในหน้าเว็บ

## ความสามารถ

- Admin Authentication ด้วย Supabase Auth และตรวจ role จาก `app_metadata.role`
- เตรียมโพล 2 ชุดแยกกัน สลับแก้ไขด้วยแท็บ และบันทึกชุดที่ยังไม่ออกจอเป็น Draft
- เพิ่มหรือลบตัวเลือกได้ตั้งแต่ 2–6 ตัวเลือก พร้อมกำหนดชื่อ คะแนน และสีของแต่ละตัวเลือก
- Screen Mapping สามารถเลือกตัวเลือกเพิ่มเติมไปแสดงบนจอซ้าย กลาง หรือขวาได้
- ปุ่มนำโพลขึ้นจอ พร้อมสถานะการนำเสนอ 3 แบบ: คำถาม, ผลโพล และยอดรวม
- แก้คำถาม ชื่อตัวเลือก และคะแนน พร้อมคำนวณยอดรวม/เปอร์เซ็นต์ทันที
- เลือกโหมดจอรวม จอคู่ หรือเต็มจอ และดูตัวอย่างสดครบทั้ง 3 URL
- Screen Mapping เลือกเนื้อหาของจอซ้าย/กลาง/ขวาแยกกัน: คำถาม, ผลรวม 2 ตัวเลือก, ตัวเลือกใดตัวเลือกหนึ่ง หรือยอดโหวตรวม
- ตั้งภาพพื้นหลังแยกจอด้วย URL หรืออัปโหลดเข้า Supabase Storage
- ปรับ Cover/Contain, ขนาด, ตำแหน่ง X/Y, รูปประกอบ และฟอนต์ Google Fonts
- เลือกสีพื้นหลังพร้อมกรอกค่า HEX แยกสำหรับทองคำ เนื้อหาจอกลาง และอสังหาริมทรัพย์
- ปรับสีข้อความหลัก/รอง สีพื้นหัว–ท้ายจอ และอัปโหลด เปิด–ปิด หรือปรับขนาดโลโก้มุมซ้ายบน
- ปรับขนาดคำถาม ชื่อสินทรัพย์ เปอร์เซ็นต์ จำนวนโหวต และข้อความรอง
- Reset การจัดวางเป็นค่าเริ่มต้นโดยไม่เปลี่ยนคะแนน
- Audit history เกิดจาก database trigger จึงไม่ขึ้นกับฝั่ง Browser
- Restore ค่าเดิมจากประวัติ (การ Restore จะสร้างประวัติรายการใหม่อีกชั้น)
- Supabase Realtime สำหรับทุก Display และ animation ของตัวเลข/แถบคะแนน
- เก็บข้อมูลล่าสุดใน `localStorage`, แสดงผลต่อได้เมื่อเน็ตหลุด และ retry อัตโนมัติ
- ปุ่ม Fullscreen และคีย์ลัด `F` บนหน้า Display
- GitHub Pages SPA fallback รองรับการ Refresh ที่ nested route

## 1. ตั้งค่า Supabase

### สร้าง Project และฐานข้อมูล

1. สร้าง Project ที่ [Supabase](https://supabase.com/dashboard)
2. ไปที่ **SQL Editor** → **New query**
3. คัดลอกไฟล์ [`supabase/schema.sql`](./supabase/schema.sql) ทั้งหมด วางแล้วกด **Run**

SQL ชุดนี้จะสร้าง:

- `public.polls` พร้อมข้อมูลตัวอย่างโพล 2 ชุด
- `public.broadcast_state` สำหรับระบุชุดโพลและสถานะที่กำลังออกจอ
- `public.poll_history` และ trigger เก็บค่าเดิม/ค่าใหม่
- RLS: บุคคลทั่วไปอ่านโพลได้ แต่แก้ไขได้เฉพาะ Admin
- Storage bucket `poll-assets` พร้อม policy สำหรับอัปโหลด
- เพิ่ม `polls` และ `broadcast_state` เข้า publication ของ Supabase Realtime

หากเคยติดตั้ง schema เวอร์ชันโพลชุดเดียวแล้ว ให้รันเฉพาะ [`supabase/two-poll-sets.sql`](./supabase/two-poll-sets.sql) เพื่ออัปเกรดได้ทันที โดยสคริปต์นี้รันซ้ำได้อย่างปลอดภัย

หากฐานข้อมูลมีระบบโพล 2 ชุดอยู่แล้วและต้องการเพิ่มตัวเลือกแบบยืดหยุ่น ให้รัน [`supabase/dynamic-options.sql`](./supabase/dynamic-options.sql) เพียงไฟล์เดียว

### สร้างผู้ดูแล

1. ไปที่ **Authentication → URL Configuration** และตั้ง Site URL เป็น URL รากของ GitHub Pages เช่น `https://USERNAME.github.io/REPOSITORY/`
2. เพิ่ม Redirect URL เป็น `https://USERNAME.github.io/REPOSITORY/**`
3. ไปที่ **Authentication → Users → Add user → Send invitation**
4. ผู้ใช้เปิดอีเมลคำเชิญ แล้วตั้งรหัสผ่านใหม่บนหน้า Admin
5. กลับไปที่ SQL Editor และรันคำสั่งด้านล่าง โดยเปลี่ยนอีเมลให้ตรงกับผู้ใช้

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"admin"}'::jsonb
where email = 'admin@example.com';
```

หากผู้ใช้นั้นล็อกอินค้างอยู่ ให้ Sign out แล้ว Sign in ใหม่เพื่อรับ JWT ที่มี role ล่าสุด ห้ามเก็บ role ผู้ดูแลใน `user_metadata` เพราะผู้ใช้สามารถแก้ข้อมูลส่วนนั้นเองได้

### เปิด Email Auth

ไปที่ **Authentication → Providers → Email** แล้วเปิด Email provider สำหรับงานจริงแนะนำให้ปิด public sign-up และสร้างผู้ดูแลจาก Dashboard เท่านั้น

## 2. ตั้งค่า Environment Variables

คัดลอก `.env.example` เป็น `.env.local`:

```bash
cp .env.example .env.local
```

บน Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

ใส่ค่าจาก **Supabase → Project Settings → API**:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

ใช้ได้เฉพาะ Project URL และ public `anon` key เท่านั้น **ห้ามใส่ `service_role` key, database password หรือ secret ใด ๆ ใน Vite/GitHub Pages** เพราะค่าที่ขึ้นต้นด้วย `VITE_` จะถูก bundle ไปที่ Browser การควบคุมสิทธิ์จริงอยู่ที่ RLS

หากไม่ตั้งค่า env ระบบจะเปิดเป็น Demo mode และบันทึกข้อมูลใน Browser เครื่องนั้น เหมาะสำหรับตรวจหน้าตาเท่านั้น ไม่ใช่โหมดใช้งานจริง

## 3. พัฒนาและทดสอบในเครื่อง

ต้องมี Node.js 20 ขึ้นไป:

```bash
npm install
npm run dev
```

เปิด:

- `http://localhost:4173/admin`
- `http://localhost:4173/display`
- `http://localhost:4173/display/gold`
- `http://localhost:4173/display/property`

คำสั่งตรวจสอบ:

```bash
npm test
npm run build
npm run preview
```

### ตรวจขนาดจอ LED

ใน Chrome/Edge DevTools เปิด Device Toolbar แล้วสร้างขนาดดังนี้:

- จอกลาง: Width `1530`, Height `896`, DPR `1`
- จอซ้าย/ขวา: Width `512`, Height `896`, DPR `1`
- Browser zoom `100%`

บนเครื่องหน้างานให้เปิด URL ของแต่ละจอ กด `F` หรือปุ่มมุมขวาบนเพื่อ Fullscreen และตรวจว่า Windows Display Scaling/LED processor mapping ตรงกับ pixel canvas

## 4. Deploy ด้วย GitHub Pages

Repository มี workflow [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) อยู่แล้ว

1. Push โปรเจกต์ขึ้น GitHub branch `main`
2. เข้า **Repository → Settings → Pages**
3. ตั้ง **Source** เป็น `GitHub Actions`
4. เข้า **Settings → Secrets and variables → Actions → Variables**
5. สร้าง Repository Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. ไปที่ **Actions → Deploy GitHub Pages → Run workflow** หรือ Push commit ใหม่

Workflow จะรัน `npm ci`, tests, build และ deploy อัตโนมัติ Vite จะตรวจชื่อ Repository และตั้ง base path สำหรับ GitHub Project Pages ให้เอง

ตัวอย่าง URL หลัง deploy:

```text
https://USERNAME.github.io/REPOSITORY/admin
https://USERNAME.github.io/REPOSITORY/display
https://USERNAME.github.io/REPOSITORY/display/gold
https://USERNAME.github.io/REPOSITORY/display/property
```

ถ้าใช้ custom domain ให้เพิ่ม Repository Variable `VITE_BASE_PATH=/`

## วิธีใช้งานหน้างาน

1. เปิด URL ทั้งสามบนเครื่อง/Output ของ LED processor ตามจอจริง
2. เปิด `/admin` บน Notebook ของผู้ควบคุมและล็อกอิน
3. เลือกแท็บ **โพลชุดที่ 1** หรือ **โพลชุดที่ 2** แล้วกรอกคำถาม ตัวเลือก คะแนน และปรับภาพ ใช้ปุ่ม **เพิ่มตัวเลือก** ได้สูงสุด 6 ตัวเลือก
4. ถ้าเป็นชุดที่ยังไม่ออกจอ กด **บันทึกแบบร่าง** ได้โดยจอสดไม่เปลี่ยน
5. เมื่อพร้อม กด **นำโพลชุดนี้ขึ้นจอ** ระบบจะเริ่มด้วยหน้า “แสดงคำถาม”
6. ใช้ตัวเลือก **สถานะบนจอ** เพื่อเปลี่ยนเป็น “แสดงผลโพล” หรือ “แสดงยอดรวม” ทุกจอจะเปลี่ยนพร้อมกันโดยใช้ URL เดิม
7. หากกรอกผิด ไปที่ประวัติของโพลชุดนั้นแล้วกด **คืนค่าเดิม**

การแก้ในฟอร์มยังไม่ขึ้นจอจริงจนกดบันทึก Live preview ใน Admin จะแสดง draft ที่ยังไม่บันทึกเพื่อให้ตรวจสอบก่อนเผยแพร่

หากยังไม่สรุปการจัดเนื้อหาหน้างาน ให้ใช้ preset ในหัวข้อ **กำหนดเนื้อหาแต่ละจอ** เพื่อสลับระหว่าง “ผลโพล 3 จอ”, “จอกลางเป็นคำถาม” และ “จอกลางเป็นยอดรวม” ได้โดยไม่ต้องเปลี่ยน URL หรือการตั้งค่า LED processor

## การทำงานเมื่ออินเทอร์เน็ตหลุด

- Display แสดงข้อมูลล่าสุดจาก Browser ต่อทันที
- สถานะมุมล่างจะแสดง “กำลังเชื่อมต่อข้อมูลล่าสุด” โดยไม่บังคะแนน
- เมื่อ Browser online อีกครั้ง ระบบ fetch ข้อมูลล่าสุดและช่อง Realtime จะ reconnect อัตโนมัติ
- สำหรับงานสำคัญควรเปิดแต่ละ Display ให้โหลดข้อมูลสำเร็จอย่างน้อยหนึ่งครั้งก่อนเริ่มงาน

## Security checklist

- [x] เปิด RLS ทั้ง `polls`, `poll_history` และ `broadcast_state`
- [x] Anonymous อ่านได้เฉพาะข้อมูลโพล
- [x] Authenticated ที่มี `app_metadata.role = admin` เท่านั้นจึง UPDATE ได้
- [x] History เขียนด้วย database trigger ไม่รับ payload จาก Browser โดยตรง
- [x] Storage upload/update/delete จำกัด Admin; public อ่านรูปสำหรับ Display ได้
- [x] จำกัดรูป PNG/JPG/WebP ไม่เกิน 8 MB
- [x] ไม่มี secret key ใน source code
- [x] `.env.local` ไม่ถูก commit

## โครงสร้างสำคัญ

```text
src/
  admin.js           Admin UI, live preview, upload, history/restore
  data-service.js    Supabase Auth/Database/Storage/Realtime + local cache
  display-view.js    UI ร่วมของจอกลางและจอข้าง
  defaults.js        ข้อมูลและ layout เริ่มต้น
  poll-core.js       คำนวณ/validate/normalize ข้อมูล
  styles.css         Design system และ breakpoint จอ LED จริง
supabase/schema.sql  Schema, seed, trigger, RLS, Storage policies
supabase/two-poll-sets.sql  สคริปต์อัปเกรดฐานข้อมูลเดิมเป็นโพล 2 ชุด
supabase/dynamic-options.sql  สคริปต์เพิ่มตัวเลือกแบบยืดหยุ่นในฐานข้อมูลเดิม
.github/workflows/   GitHub Pages deployment
```

## Troubleshooting

- **Login ได้แต่เข้า Admin ไม่ได้:** ตรวจ `raw_app_meta_data.role` แล้ว Sign out/in ใหม่
- **คำเชิญเปิด localhost หรือขึ้น otp_expired:** ตั้ง Auth Site URL/Redirect URL ให้เป็น GitHub Pages แล้วส่งคำเชิญใหม่ ลิงก์เดิมใช้ซ้ำไม่ได้
- **อ่านข้อมูลได้แต่บันทึกไม่ได้:** ผู้ใช้ไม่มี role `admin` หรือ RLS SQL ยังรันไม่ครบ
- **รูปอัปโหลดไม่ได้:** ตรวจ bucket/policy และชนิดไฟล์ต้องเป็น PNG, JPG หรือ WebP ไม่เกิน 8 MB
- **Realtime ไม่เปลี่ยน:** ตรวจว่า table `polls` และ `broadcast_state` อยู่ใน `supabase_realtime` publication และ Project ไม่ถูก pause
- **Refresh nested route แล้ว 404:** ใช้ workflow ในโปรเจกต์ซึ่งสร้าง `404.html` redirect ให้อัตโนมัติ
- **จอมีขอบ:** ตั้ง Browser Fullscreen, Zoom 100%, ปิด toolbar และตรวจ output resolution ของ LED processor ให้ตรง 1530 × 896 หรือ 512 × 896
