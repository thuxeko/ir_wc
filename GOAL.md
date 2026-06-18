# GOAL.md - WC26 Predict (Dự đoán World Cup 2026 Nội bộ)

## Mục tiêu tổng quát
Xây dựng một ứng dụng web nội bộ đơn giản, sạch sẽ cho tối đa ~100 người tham gia dự đoán tỷ số các trận World Cup 2026. 
- Tập trung vào trải nghiệm người dùng nội bộ (chủ yếu người Việt).
- Dễ triển khai, dễ bảo trì, không over-engineer.
- Tuân thủ luật chơi rõ ràng, chống cheat (giới hạn thời gian dự đoán).
- Giao diện theo phong cách **minimalist-ui** (clean editorial, warm monochrome, flat bento, muted pastels, subtle motion, generous whitespace).

## Luật chơi (đã chốt)
- **Đúng tỷ số**: +5 điểm
- **Đúng đội thắng (sai tỷ số)**: +2 điểm
- **Streak (chuỗi dự đoán đúng liên tiếp)**:
  - 3 trận đúng liên tiếp: +3 điểm
  - 5 trận đúng liên tiếp: +5 điểm
  - 7 trận đúng liên tiếp: +8 điểm
- Bất kỳ trận nào bỏ dự đoán hoặc dự đoán sai → **reset streak ngay lập tức** về 0.
- Dự đoán chỉ được thực hiện **trước ít nhất 10 phút** so với giờ bắt đầu trận (giờ hệ thống server).
- Sau thời hạn: nút dự đoán bị disable (client + server enforcement).

## Công nghệ sử dụng (đã chốt)
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS
- **UI Style**: Theo skill `minimalist-ui` (warm monochrome #F7F6F3, flat 1px borders, editorial typography, bento grids, subtle hover lift, muted pastel accents cho scoring/streak).
- **Backend**: Next.js Server Actions + API routes (không tách backend riêng)
- **Database**: SQLite (better-sqlite3) – file-based, đơn giản, đủ cho <100 users.
- **Auth**: JWT (jose) + httpOnly cookie. Register → pending → admin manual activate. Role đơn giản (user / admin).
- **Data nguồn**: Seed từ https://github.com/openfootball/worldcup.json/ (2026/worldcup.json). Structured JSON (tốt hơn TXT rất nhiều): date/time rõ, score.ft, round + num cho knockout, group. 104 trận + 48 teams + labels "2A (Bảng A)", "W74"... Dùng script seed-full-matches.js để nạp (xoá matches/preds khi chuyển nguồn). name_vi + flags hardcode.
- **Tính điểm**: Pure function trong `lib/scoring.ts` + snapshot `user_stats` để leaderboard nhanh.
- **Deployment**: Dễ (Vercel hoặc VPS đơn giản). Không cần realtime phức tạp.

## Kiến trúc & Phương án thực hiện (đã chốt)
- **1 trang SPA-like** chính (dashboard cảm giác): Tabs/sections cho Leaderboard, Matches (Upcoming + Finished), My History.
- **Admin CMS đơn giản** (route /admin hoặc tab protected):
  - Quản lý users (activate, delete, reset password).
  - Quản lý matches (set score thủ công, đặc biệt cho hoãn/trận đặc biệt).
  - Nút "Recalculate all points" (chạy lại toàn bộ scoring + streak + update user_stats + log).
- **Bảng chính**:
  - `users`
  - `teams` (seed, có name_en + name_vi + flag_url)
  - `matches` (seed + mutable score + status)
  - `predictions`
  - `user_stats` (snapshot total_points, current_streak, longest_streak cho performance)
  - `score_calculations` (audit log khi admin recalc)
- **Prediction flow**:
  - Chỉ cho trận `status = 'scheduled'` + cả 2 đội đã rõ + còn >10 phút trước kickoff.
  - Server validate chặt (không tin client time).
  - Client countdown (live relative time) + disable button khi hết hạn.
- **Streak & Scoring**:
  - Tính theo thứ tự thời gian trận (chronological).
  - "Đúng" = base points > 0 (5 hoặc 2).
  - Bonus chỉ cộng khi đạt mốc streak.
  - Recalc toàn bộ khi admin cập nhật score thủ công.
- **UI/UX chi tiết đã chốt**:
  - Header: Title + bento nhỏ cho rules (dynamic "Đang tham gia X/100").
  - Leaderboard + Top 5 streak (real data từ user_stats khi có).
  - Match cards: Flag + Tên Việt (chính) + English nhỏ, thời gian, button dự đoán (conditional).
  - Modal dự đoán đơn giản (2 input số).
  - My History: Danh sách dự đoán gần đây.
  - Admin: Danh sách users + matches CRUD + recalc button.
  - Animations: Subtle (hover lift, fadeSlide khi add history, transition mượt) theo minimalist-ui.
  - Responsive, clean, không lố.

## Phạm vi v1 (MVP để dùng được ngay)
- Seed đầy đủ teams + matches từ openfootball/worldcup.json (104 trận, groups rõ, nhãn knockout "2A (Bảng A)" / "Wxx").
- Auth cơ bản (register/login + admin activate).
- Dự đoán với 10p cutoff + client countdown.
- Leaderboard, match results (số người đúng), history cá nhân.
- Admin cơ bản (user + match score + recalc).
- Tính điểm + streak đầy đủ.
- Giao diện 1 trang + admin section.

## Roadmap các phần tiếp theo (sẽ làm ngay sau GOAL.md)
1. Thêm client countdown + refine prediction UI/UX.
2. Xây dựng auth thật (register form, login, protected routes, role check, admin gate).
3. Mở rộng Admin CMS (user list với actions, match list với score editing + recalc).
4. Player profile / full history view (bảng chi tiết dự đoán + kết quả đúng/sai/streak).
5. Seed data đầy đủ hơn + xử lý knockout TBD.
6. Polish + test recalc logic thực tế + audit log.
7. (Optional) Simple "edit prediction" trước deadline, export data, dark mode toggle.

## Ghi chú quan trọng
- Ưu tiên server enforcement cho mọi rule quan trọng (time limit, scoring).
- Giữ đơn giản: Không realtime, không push notification, không quá nhiều trang.
- Mọi thay đổi đều phải giữ **minimalist-ui** (không AI-slop, generous spacing, clean typography, flat).
- Sử dụng real data từ DB thay hardcoded khi có thể (leaderboard, matches, stats).

---

**Ngày tạo**: 2026-06-16 (cập nhật liên tục trong quá trình phát triển)
**Trạng thái**: MVP core đang được xây dựng. Đã có DB schema, scoring engine, basic UI với flags + name_vi + bento header + prediction deadline.

Tiếp theo: Thực hiện theo roadmap trên, bắt đầu từ client countdown + auth.