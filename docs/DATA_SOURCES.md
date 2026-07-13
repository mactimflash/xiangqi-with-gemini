# Chiến lược nguồn dữ liệu

Project không giới hạn ở Wukong. Dữ liệu được thiết kế theo mô hình adapter để có thể nhập từ nhiều nguồn.

## 1. Community Xiangqi Games Database

Repo cộng đồng có các mục community, end-games, mid-games, opening, puzzles, selected-games và tournaments. Định dạng chính là DPXQ cùng register.json.

Khuyến nghị: ưu tiên cho việc xây dựng kho dữ liệu có metadata và nguồn gốc rõ ràng.

## 2. 01xq

Dùng để tra cứu ván theo kỳ thủ, giải đấu và thời gian. Không tự động scrape trong source mặc định. Chỉ nhập dữ liệu khi điều khoản cho phép.

## 3. Xiangqi Cloud Database / ChessDB

API nhận FEN và trả các nước đã biết, score/rank/winrate/note. Thích hợp để bổ sung ngữ cảnh khai cuộc, tàn cuộc và mức độ phổ biến của một nước.

## 4. Pikafish

Engine UCI mạnh, dùng để đánh giá bước ngoặt và độ chính xác chiến thuật. Nên chạy tách khỏi Cloudflare Pages, ví dụ VPS/container, do Workers không phù hợp để chạy binary engine nặng.

## 5. Wukong xqdb

Dùng làm dữ liệu mẫu tương thích ICCS. Đây là nguồn legacy, không phải giới hạn kiến trúc.

## Nguyên tắc kết quả

- `result` có giá trị chính thức: giao diện dùng trực tiếp.
- Ván dừng sớm có metadata `termination=resignation`: có thể kể là một bên xin thua.
- `result=*`: AI chỉ được nhận định thế cờ cuối, không được khẳng định người thắng.
