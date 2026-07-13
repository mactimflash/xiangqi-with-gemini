# Danh Cục Kỳ Truyện — Xiangqi Story Atlas

Ứng dụng Cloudflare Pages + Worker để xem lại các ván cờ tướng và đọc bình luận AI theo mạch kể chuyện.

## Điểm chính

- Không phụ thuộc hình ảnh quân cờ bên ngoài: quân được vẽ bằng HTML/CSS và chữ Hán, nên không còn lỗi mất ảnh.
- Bàn cờ responsive đúng 9 × 10 giao điểm.
- Mỗi lần bấm **Nước tiếp theo**, hệ thống đi đúng một nước và AI kể tiếp câu chuyện.
- Có lời mở đầu, ý đồ, thế khó của đối thủ, bài học và đoạn kết.
- Kết quả chính thức chỉ được khẳng định khi metadata có `result`. Nếu `result: "*"`, AI phải ghi rõ đó chỉ là nhận định.
- Thư viện dữ liệu tách riêng trong `data/games.json`, dễ bổ sung nguồn mới.

## Nguồn dữ liệu định hướng

Xem `data/sources.json` và `docs/DATA_SOURCES.md`.

## Triển khai Pages

Upload toàn bộ repo lên GitHub, sau đó tạo Cloudflare Pages:

- Framework preset: None
- Build command: để trống hoặc `exit 0`
- Build output directory: `.`

## Triển khai Worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

Frontend mặc định gọi:

`https://cotuong.starlinksatellitewifi.workers.dev/api/analyze`

Muốn đổi domain, sửa hằng số `WORKER` trong `src/app.js`.

## Thêm ván mới

Mỗi game trong `data/games.json`:

```json
{
  "id": "unique-id",
  "title": "Kỳ thủ A – Kỳ thủ B",
  "red": "Kỳ thủ A",
  "black": "Kỳ thủ B",
  "event": "Tên giải",
  "year": "2026",
  "result": "1-0",
  "termination": "resignation",
  "source": {"name":"Nguồn", "url":"https://..."},
  "moves": ["h2e2", "h9g7"]
}
```

Quy ước `result`: `1-0`, `0-1`, `1/2-1/2`, hoặc `*` khi chưa rõ.

## Giấy phép và dữ liệu

Source ứng dụng có thể dùng theo MIT. Dữ liệu từng nguồn có điều khoản riêng; phải kiểm tra quyền tái sử dụng trước khi nhập hoặc phân phối lại dữ liệu bên thứ ba.
