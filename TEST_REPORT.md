# Test report

Đã kiểm tra trước khi đóng gói:

- `node --check src/app.js`: đạt.
- `node --check worker/src.js`: đạt.
- Khởi tạo Wukong trong Node, sinh 44 nước hợp lệ ở thế ban đầu, gọi `evaluate()` và tìm được best move: đạt.
- Parse HTML: không có ID trùng; toàn bộ selector ID trong `app.js` đều tồn tại trong `index.html`.
- Chạy `schema-console.sql` trên SQLite sạch: đạt.
- Chạy lần lượt migration `0001_init.sql` + `0002_personal_exercises.sql`: đạt.
- Chạy giao diện bằng Chromium test harness:
  - hiển thị đủ 32 quân;
  - người dùng đi một nước và bot tự đáp lại thành 2 ply;
  - nước không trùng best move tạo bài tập;
  - mở chế độ luyện lỗi thành công;
  - trả lời sai hiển thị một đích được đánh dấu;
  - không phát sinh JavaScript page error.
