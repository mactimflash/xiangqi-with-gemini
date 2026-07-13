# Cờ Tướng AI – giao diện tối giản

Bản này đã được tối ưu lại để bàn cờ giữ đúng tỷ lệ 11 x 14 của giao diện gốc, không bị kéo ngang trên điện thoại.

## Worker cố định

Frontend gọi trực tiếp:

`https://cotuong.starlinksatellitewifi.workers.dev/api/analyze`

Người dùng không cần nhập URL Worker và không cần Bearer token.

## Triển khai Pages

Upload toàn bộ nội dung thư mục `xiangqi_cf_worker` lên Cloudflare Pages.

- Framework preset: None
- Build command: `exit 0`
- Build output directory: `.`

## Lưu ý CORS

Worker phải cho phép origin của Pages hoặc domain riêng của website. Ví dụ:

`https://ten-project.pages.dev`

## Các thay đổi giao diện

- Bàn cờ giữ đúng tỷ lệ dọc trên desktop và mobile.
- Bàn cờ luôn hiển thị trước phần phân tích trên mobile.
- Chỉ giữ 4 nút: Ván mới, Bot đi, Đi lại, Lật bàn.
- Ẩn chọn bot, chọn theme, PGN và cấu hình Worker.
- Liu DaHua được chọn mặc định.
- Phân tích AI ngắn gọn: nước nên đi, điểm kế hoạch, thế trận, điểm mạnh, rủi ro và 3 bước tiếp theo.
