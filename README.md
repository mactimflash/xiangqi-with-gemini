# Liễu Đại Hoa Coach

Ứng dụng mobile-first để:

1. Di chuyển quân bằng hai lần chạm: chọn quân, chọn điểm đến.
2. Xếp nhanh một thế cờ bất kỳ bằng bảng quân.
3. Nhận gợi ý cục bộ từ Wukong theo hướng thực dụng, phòng thủ phản công mô phỏng phong cách Liễu Đại Hoa.
4. Chỉ gọi Gemini khi người dùng bấm **Lưu ván**.
5. Lưu lịch sử và bản phân tích vào Cloudflare D1 để xem lại sau.

## Kiến trúc

- Cloudflare Pages: giao diện, bàn cờ SVG, Wukong chạy trong trình duyệt.
- Cloudflare Worker: API lưu/xem lịch sử và gọi Gemini một lần sau mỗi lần lưu.
- Cloudflare D1: lưu toàn bộ nước đi và kết quả phân tích.

Frontend đã cố định Worker tại:

`https://cotuong.starlinksatellitewifi.workers.dev`

## Tạo D1

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create liu-dahua-coach
```

Dán `database_id` nhận được vào `worker/wrangler.toml`, rồi chạy:

```bash
npm run db:migrate
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

Có thể tạo bảng trực tiếp trên D1 Web Console bằng nội dung file:

`worker/schema-console.sql`

## Deploy Pages

Đưa toàn bộ repo lên GitHub rồi tạo Cloudflare Pages:

- Framework preset: None
- Build command: `exit 0`
- Build output directory: `.`

## Lưu ý

- Không có API Gemini trong luồng gợi ý trực tiếp; Wukong xử lý tại thiết bị.
- Tên Liễu Đại Hoa thể hiện phong cách mô phỏng để học cách ra quyết định, không tuyên bố sao chép chính xác tư duy của danh thủ.
- Endpoint lưu ván hiện không yêu cầu đăng nhập. Khi phát hành công khai nên bổ sung Cloudflare Turnstile, rate limiting hoặc tài khoản người dùng.
