# Xiangqi Story Atlas — D1 Autoplay Edition

Website xem danh cục như đọc một cuốn truyện. Front-end không gọi Gemini ở mỗi lần bấm Next. AI chỉ được dùng ở pipeline hậu trường để khám phá, biên tập và cache ván mới vào Cloudflare D1.

## Kiến trúc

```text
Nguồn JSON công khai/được cấp phép
        ↓ Cron mỗi giờ
Cloudflare Worker nhập ván mới
        ↓
D1: games + story_moves
        ↓ Gemini chạy theo lô 8 nước
Bản truyện hoàn chỉnh, cache_status=complete
        ↓
Pages front-end tải một lần
        ↓
Người xem bấm Tự động / Tạm dừng / đổi tốc độ
```

## 1. Tạo D1

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create xiangqi-story-atlas
```

Chép `database_id` vào `worker/wrangler.toml`.

```bash
npm run db:migrate
npx wrangler d1 execute xiangqi-story-atlas --remote --file=seed.sql
```

## 2. Secrets

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put ADMIN_SECRET
```

Trình duyệt không dùng Bearer và không nhìn thấy Gemini key. `ADMIN_SECRET` chỉ dùng cho các lệnh quản trị.

## 3. Deploy Worker

```bash
npm run deploy
```

Kiểm tra:

```text
https://<worker>/health
https://<worker>/api/games
```

Nếu tiếp tục dùng domain hiện tại, route Worker về:

```text
https://cotuong.starlinksatellitewifi.workers.dev
```

## 4. Tạo cache truyện

Cron chạy mỗi giờ và xử lý tối đa 8 nước của một ván trong mỗi lượt. Có thể chạy nhanh thủ công:

```bash
curl -X POST https://<worker>/api/admin/cache-next \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"gameId":"10"}'
```

Gọi lặp lại đến khi API trả `stage: complete`. Front-end chỉ mở nút **Tự động** khi `cacheComplete=true`.

## 5. Đăng ký nguồn mới

Xem `docs/SOURCE_MANIFEST_FORMAT.md`. Sau khi thêm nguồn vào D1, gọi:

```bash
curl -X POST https://<worker>/api/admin/sync \
  -H "x-admin-secret: YOUR_ADMIN_SECRET"
```

Pipeline không tự scrape website có điều khoản hạn chế. Nguồn cần là JSON/PGN đã được cấp phép hoặc do bạn sở hữu.

## 6. Deploy Pages

Cloudflare Pages:

```text
Framework preset: None
Build command: exit 0
Build output directory: .
```

## Trải nghiệm người dùng

- Manual Next/Previous vẫn hoạt động khi cache chưa xong.
- Nút **Tự động** chỉ bật khi toàn bộ phần mở đầu, từng nước và kết cục đã lưu trong D1.
- Tốc độ Chậm/Vừa/Nhanh dựa trên độ dài đoạn kể.
- Front-end chỉ đọc cache nên nhẹ tải, nhanh và không phát sinh API AI theo mỗi lượt xem.

## Phiên bản SVG All-in-One

- 14 quân cờ SVG độc lập nằm trong `assets/pieces/`.
- Front-end không còn dựng quân bằng chữ HTML; mỗi quân dùng asset SVG có viền, gradient và bóng đổ.
- Toàn bộ trang khóa trong `100dvh`: bàn cờ và phần diễn biến cùng xuất hiện trên một màn hình.
- Mobile dùng bố cục 60/40; không cuộn toàn trang. Nội dung dài được rút gọn theo thẻ để giữ bàn cờ luôn trong tầm nhìn.
- Desktop hiển thị bàn cờ và câu chuyện song song.


## Production UI v6

- Đã loại bỏ hoàn toàn lớp SVG overlay, vòng tròn và mũi tên trên bàn cờ.
- Bàn cờ chỉ render quân cờ SVG, giảm số node SVG và thao tác DOM ở mỗi nước.
- Render bằng `DocumentFragment` và `replaceChildren()` để giảm layout/repaint.
- Bổ sung focus state, touch target, reduced-motion và security headers.
- Front-end không gọi AI trong lúc xem; chỉ đọc truyện đã cache từ D1.


## D1 Web Console

Xem `worker/D1_WEB_CONSOLE_GUIDE_VI.md`. Chạy `worker/schema-console.sql`, sau đó `worker/seeds.sql`.
