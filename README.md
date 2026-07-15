# Liễu Đại Hoa AI Coach v3

Ứng dụng cờ tướng mobile-first, chạy bàn cờ và engine ngay trong trình duyệt. Phiên bản này bổ sung hai năng lực chính:

1. **Đấu với bot mô phỏng phong cách Liễu Đại Hoa**: người dùng chọn Đỏ/Đen, bot tự đi sau mỗi nước và có ba mức thời gian suy nghĩ.
2. **Biến sai lầm thành bài tập**: trước khi chấp nhận nước của người dùng, engine đối chiếu với phương án tốt hơn, lưu lại FEN trước lỗi, nước đã đi, nước nên đi và mức chênh lệch. Các vị trí này được đưa lại theo lịch ôn 1–3–7–14 ngày.

> “Liễu Đại Hoa” trong sản phẩm chỉ là góc nhìn mô phỏng phong cách thực dụng, phòng thủ phản công và khai thác sai lầm. Ứng dụng không tuyên bố sao chép chính xác tư duy của danh thủ.

## Tính năng mới

- Bot tự động đi trên chính bàn cờ của website.
- Chọn người dùng cầm Đỏ hoặc Đen.
- Ba mức engine: **Nhanh**, **Thực chiến**, **Sâu**.
- Chấm nước người dùng thành: Tốt nhất, Tốt, Thiếu chính xác, Sai lầm, Sai lầm nặng.
- Ghi `fen_before`, `played_move`, `best_move`, `loss_cp` cho từng lỗi.
- Nút **Luyện sai lầm** tải lại đúng vị trí trước lỗi.
- Đánh dấu trực quan quân xuất phát và ô đích của đáp án.
- Lịch ôn lặp: trả lời đúng liên tiếp sẽ giãn 1, 3, 7, 14 và 30 ngày; bốn lần đúng liên tiếp được xem là đã thuộc.
- Hồ sơ ẩn danh riêng trên mỗi trình duyệt bằng `profile_id` lưu trong `localStorage`.
- D1 lưu ván, bài tập và lịch sử từng lần làm bài.
- Gemini chỉ chạy sau khi lưu ván để tổng kết xu hướng và lỗi lặp lại; engine cục bộ vẫn là nguồn quyết định nước cờ.

## Kiến trúc

```text
Trình duyệt
├── Bàn cờ SVG
├── Wukong engine cục bộ
├── Bot Liễu Đại Hoa tự đi
├── Chấm nước và tạo lỗi ngay trên thiết bị
└── Chế độ luyện lại vị trí sai
          │
          ▼
Cloudflare Worker
├── API phiên chơi
├── API bài tập và spaced repetition
├── Gọi Gemini sau khi lưu
└── Phân tách dữ liệu theo profile_id
          │
          ▼
Cloudflare D1
├── game_sessions
├── mistake_exercises
└── exercise_attempts
```

Source hiện dùng **Wukong JavaScript** vì engine đã được đóng gói trong dự án. Có thể thay lớp tìm kiếm bằng Pikafish WASM hoặc API Pikafish sau này mà không cần đổi schema bài tập.

## Cấu trúc quan trọng

```text
index.html                         Giao diện
assets/app.css                     UI responsive
src/app.js                         Luồng bot, chấm lỗi và luyện tập
src/wukong.js                      Engine; đã thêm public method evaluate()
worker/src.js                      Worker API v3
worker/schema-console.sql          Schema đầy đủ cho D1 mới
worker/migrations/0001_init.sql    Schema v1
worker/migrations/0002_personal_exercises.sql  Nâng cấp v2/v3
worker/schema-upgrade-v2.sql       Bản sao SQL nâng cấp để chạy Console
```

## Triển khai D1 mới

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create liu-dahua-coach
```

Dán `database_id` vào `worker/wrangler.toml`, sau đó:

```bash
npm run db:init
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

Hoặc tạo toàn bộ bảng trực tiếp trong D1 Web Console bằng `worker/schema-console.sql`.

## Nâng cấp D1 đang chạy bản cũ

Chỉ chạy đúng **một lần**:

```bash
cd worker
npm install
npm run db:upgrade-v2
```

Hoặc dán nội dung `worker/schema-upgrade-v2.sql` vào D1 Console. Không chạy lại file nâng cấp nếu các cột đã tồn tại.

## Biến môi trường Worker

`worker/wrangler.toml` đang dùng:

```toml
GEMINI_BASE_URL = "https://gemini.huyvo.uk/v1"
GEMINI_MODEL = "gemini-3.5-flash"
UPSTREAM_API_KEY_HEADER = "X-API-Key"
ALLOWED_ORIGINS = "*"
```

Khi production, nên đổi `ALLOWED_ORIGINS` thành domain Pages thật, ví dụ:

```toml
ALLOWED_ORIGINS = "https://your-domain.pages.dev,https://cotuong.example.com"
```

## Triển khai Pages

- Framework preset: **None**
- Build command: `exit 0`
- Build output directory: `.`

Frontend đang trỏ Worker tại đầu file `src/app.js`:

```js
const WORKER_BASE = 'https://cotuong.starlinksatellitewifi.workers.dev';
```

Đổi giá trị này nếu Worker được deploy sang domain khác.

## Luồng tạo bài tập

```text
Người dùng chọn nước
        ↓
Engine tìm best move tại FEN hiện tại
        ↓
So sánh kết quả tĩnh sau best move và played move
        ↓
Phân loại chất lượng nước
        ↓
Nếu là thiếu chính xác/sai lầm:
  lưu FEN + played_move + best_move
        ↓
Khi lưu ván: đồng bộ vào D1
        ↓
Luyện lại theo lịch spaced repetition
```

`loss_cp` trong bản Wukong là chỉ số nội bộ gần đúng dựa trên hàm lượng giá và vị trí quân, không nên quảng bá như centipawn chuẩn của Pikafish.

## Lưu ý production

- `profile_id` chỉ là định danh ẩn danh, **không phải cơ chế đăng nhập an toàn**. SaaS thương mại nên bổ sung tài khoản, JWT hoặc Cloudflare Access.
- Thêm Turnstile và rate limiting cho endpoint lưu ván.
- Bot chỉ tự động chơi trên bàn cờ của website này; source không điều khiển hoặc tự động đánh trên nền tảng bên thứ ba.
- Gemini chạy nền sau khi Worker đã lưu ván, vì vậy lịch sử có thể hiển thị trạng thái “Đang phân tích” trong thời gian ngắn.
