# AI Xiangqi Coach — Cloudflare Pages + Worker

Bộ source kế thừa Wukong/Coach-Xiangqi, tối ưu để mỗi file nhỏ hơn 25 MB và ZIP nhỏ hơn 25 MB.

## Kiến trúc

- **Pages**: bàn cờ, Wukong.js, bot Liu DaHua, giao diện mobile-first, điểm/XP/chuỗi.
- **Worker**: nhận `/api/analyze` không cần Bearer từ trình duyệt, giữ `GEMINI_API_KEY` trong Secret và gọi Gemini-compatible API.
- **Gemini**: chỉ giải thích, chấm chất lượng kế hoạch và tạo bước tiếp theo. Wukong vẫn quyết định nước hợp lệ.

## 1. Deploy Worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

Khi được hỏi secret, dán API key. Không ghi key vào source.

Mặc định Worker gọi:

- Base URL: `https://gemini.huyvo.uk/v1`
- Model: `gemini-3.5-flash`
- Header upstream: `X-API-Key`

Không dùng Bearer. Nếu API của bạn dùng tên header khác, sửa `UPSTREAM_API_KEY_HEADER` trong `worker/wrangler.toml`.

Sau deploy, kiểm tra:

```text
https://<worker>.workers.dev/health
```

## 2. Deploy Pages

Upload lên GitHub toàn bộ project hoặc chỉ các file frontend (`index.html`, `_headers`, `src/`). Trong Cloudflare:

1. Workers & Pages → Create → Pages → Connect to Git.
2. Framework preset: None.
3. Build command: để trống hoặc `exit 0`.
4. Build output directory: `.`
5. Deploy.

Có thể Direct Upload ZIP phần frontend, nhưng Git thuận tiện hơn khi cập nhật.

## 3. Giới hạn CORS

Sau khi có domain Pages, sửa:

```toml
ALLOWED_ORIGINS = "https://ten-project.pages.dev"
```

Deploy Worker lại. Có thể khai báo nhiều domain, phân cách bằng dấu phẩy.

## 4. Kết nối giao diện

1. Mở website Pages.
2. Chọn **Cấu hình AI**.
3. Nhập URL Worker, ví dụ `https://xiangqi-ai-worker.<account>.workers.dev`.
4. Bật tự động bình luận.
5. Bấm **Lưu kết nối Worker**.
6. Bắt đầu ván với Liu DaHua.

## Lưu ý

- Điểm 0–100 là điểm chất lượng kế hoạch do AI giải thích, không phải điểm engine hoặc xác suất thắng.
- Liu DaHua là hồ sơ bot trong repo, không khẳng định tái hiện chính xác kỳ thủ thật.
- Không cam kết mọi nước đều dẫn đến chiến thắng; mục tiêu là huấn luyện và cải thiện quyết định.
