# WC26 Predict

Dự đoán tỷ số World Cup 2026 - Công cụ nội bộ.

## Getting Started

Chạy dev server:

```bash
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000) trong trình duyệt.

## Build & Deploy

```bash
npm run build
npm start
```

## Backup & Restore

### Backup

App tự động:

- Snapshot file SQLite trước các thao tác nguy hiểm: set score, sync JSON, full recalc, fix match status.
- Backup định kỳ lúc **03:00 hàng ngày** (DB + predictions CSV + dọn backup cũ >14 ngày).

Admin cũng có thể tạo backup thủ công trong **Admin CMS → Backup & Restore**.

Tất cả backup lưu tại: `data/backups/`

### Restore

Để khôi phục dữ liệu từ một file backup `.db`:

1. **Dừng app** đang chạy.

2. Xác định file backup muốn restore (thay `<filename>` bằng tên file thật):

   ```bash
   ls -la data/backups/
   ```

3. Backup file DB hiện tại phòng trường hợp restore sai:

   ```bash
   cp data/wc2026.db data/wc2026.db.bak.$(date +%Y%m%d-%H%M%S)
   ```

4. Ghi đè file DB hiện tại bằng file backup:

   ```bash
   cp data/backups/<filename>.db data/wc2026.db
   ```

5. Khởi động lại app:

   ```bash
   npm start
   # hoặc với PM2
   pm2 restart wc2026
   ```

### Restore từ CSV

Nếu chỉ cần khôi phục predictions/users từ CSV (ít dùng, phức tạp hơn):

1. Tạo bảng tạm và import CSV vào SQLite:

   ```bash
   sqlite3 data/wc2026.db
   ```

2. Trong SQLite shell, tạo bảng tạm, import CSV, sau đó merge vào bảng chính. Ví dụ với predictions:

   ```sql
   -- Tạo bảng tạm
   CREATE TABLE predictions_temp AS SELECT * FROM predictions WHERE 0;

   -- Import CSV (header phải khớp cột bảng tạm)
   .mode csv
   .import data/backups/predictions-YYYYMMDD-HHMMSS.csv predictions_temp

   -- Xóa dữ liệu cũ và chèn lại
   DELETE FROM predictions;
   INSERT INTO predictions SELECT * FROM predictions_temp;
   DROP TABLE predictions_temp;
   ```

3. Khởi động lại app và chạy **Recalculate toàn bộ điểm + streak** trong Admin CMS.

## Production Setup (lần đầu khởi chạy)

### Quan trọng: Database không được commit lên git

File SQLite `data/wc2026.db` đã bị gỡ khỏi git và được thêm vào `.gitignore` / `.dockerignore`. Khi deploy production, DB sẽ được tạo trống tự động.

### Bước 1: Khởi tạo DB trống

App sẽ tự tạo schema khi chạy lần đầu (xem `lib/db.ts`). Không cần chạy migration thủ công.

### Bước 2: Seed dữ liệu trận đấu

Sau khi app chạy, vào container/server và seed dữ liệu teams + matches:

```bash
# Nếu chạy trực tiếp
node seed-full-matches.js

# Nếu chạy Docker
sudo docker compose exec app node seed-full-matches.js
# hoặc
sudo docker exec -it wc2026-app-1 node seed-full-matches.js
```

Script này fetch từ `openfootball/worldcup.json` và tạo 48 teams + 104 matches.

### Bước 3: Tạo admin user

#### Cách 1: Tự động qua environment (khuyến nghị)

Set trong `.env`:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-default-password
```

App sẽ tự động tạo admin user khi khởi động nếu user chưa tồn tại. Sau khi login, admin nên đổi mật khẩu ngay.

#### Cách 2: Thủ công qua DB

```bash
sqlite3 data/wc2026.db "UPDATE users SET role='admin', is_active=1 WHERE username='your-admin-username';"
```

### Bước 4: Kích hoạt các user khác

Các user đăng ký mới mặc định `is_active=0`. Admin cần vào **Admin CMS** để activate từng user.

## Docker Deployment

```bash
# 1. Copy và sửa env
cp .env.example .env
# Sửa JWT_SECRET trong .env

# 2. Build & run
sudo docker compose up -d --build

# 3. Seed matches lần đầu
sudo docker compose exec app node seed-full-matches.js
```

Volume `wc2026-data` được mount vào `/app/data` để persist DB giữa các lần restart container.

## VPS Deployment với PM2

```bash
npm run build
pm2 start npm --name "wc2026" -- start
pm2 save
pm2 startup
```

Backup file tự động sinh ra trong `data/backups/`. Nên đồng bộ thư mục này ra ngoài định kỳ (rsync, S3, v.v.).
