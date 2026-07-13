# AI Xiangqi Coach – Wukong + Gemini

Phiên bản này kế thừa Coach-Xiangqi và bổ sung giao diện mobile-first cùng lớp bình luận AI.

## Kiến trúc

- **Wukong.js**: nguồn quyết định nước đi, kiểm tra luật và tìm kiếm.
- **Liu DaHua Bot**: hồ sơ bot `Liudahua` có sẵn trong `bots.js`; đây là mô phỏng bằng thuật toán của repo, không phải bản sao chính xác kỳ thủ ngoài đời.
- **Gemini**: giải thích nước Wukong đã chọn, nêu điểm mạnh, rủi ro và kế hoạch 3 bước. Gemini không được phép thay nước engine.
- **Local learning**: trình duyệt ghi nhận người chơi có làm theo gợi ý hay không và gửi bản tóm tắt này trong lần phân tích tiếp theo. Mã engine không tự sửa trong lúc chơi.

## Chạy trên Windows

1. Giải nén thư mục.
2. Chạy `RUN_COACH_WINDOWS.bat`.
3. Mở `http://127.0.0.1:8000/src/gui/xiangqi.html`.
4. Mở **Cấu hình AI**.
5. Giữ mặc định:
   - Base URL: `https://gemini.huyvo.uk/v1`
   - Model: `gemini-3.5-flash`
6. Nhập API key và bấm **Lưu cấu hình**.
7. Bấm **Phân tích bằng Gemini** hoặc bật tự động bình luận.

## Yêu cầu API

Website gọi endpoint OpenAI-compatible:

`POST {GEMINI_BASE_URL}/chat/completions`

với header `Authorization: Bearer <API_KEY>`. Endpoint cần cho phép CORS từ origin của website. Nếu dịch vụ không hỗ trợ CORS, cần đặt một proxy bảo mật; không nhúng API key dùng chung vào source public.

## Cải tiến liên tục an toàn

Phiên bản này áp dụng **AI-assisted coaching**, không tự thay đổi mã nguồn engine. Dữ liệu học cục bộ gồm:

- nước Wukong gợi ý;
- nước người chơi thực tế đã đi;
- tỷ lệ làm theo gợi ý;
- giai đoạn khai cuộc/trung cuộc/tàn cuộc.

Gemini dùng dữ liệu đó để điều chỉnh cách giải thích và kế hoạch học. Muốn cải tiến thuật toán thật sự, cần pipeline offline: thu thập PGN → đánh giá bằng engine mạnh hơn → kiểm thử Elo/regression → chỉ phát hành phiên bản mới khi vượt bộ kiểm thử.

## Lưu ý bảo mật

API key được lưu trong `localStorage` của trình duyệt. Chỉ dùng trên thiết bị cá nhân và không phát hành ZIP đã điền sẵn key.
