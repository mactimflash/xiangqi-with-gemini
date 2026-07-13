# Danh cục Cờ Tướng AI — Cloudflare Pages + Worker

## Mục tiêu
Website không còn chế độ người đấu bot. Người xem chọn một ván đấu tiêu biểu, bấm **Nước tiếp theo**, bàn cờ đi đúng một nước trong dữ liệu gốc và Gemini bình luận chiến thuật của hai bên.

Kho Wukong đi kèm 1.125 ván Liễu Đại Hoa và có Game Viewer. Kho gốc không xếp hạng “nổi tiếng nhất”, vì vậy bản này tuyển chọn 24 cuộc đối đầu tiêu biểu với Hồ Vinh Hoa, Hứa Ngân Xuyên, Lữ Khâm, Triệu Quốc Vinh, Dương Quan Lân và Lý Lai Quần.

## Deploy Worker
```powershell
cd worker
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```
Frontend đã cố định Worker:
`https://cotuong.starlinksatellitewifi.workers.dev`

## Deploy Pages
Upload toàn bộ thư mục này lên GitHub rồi tạo Cloudflare Pages:
- Framework: None
- Build command: `exit 0`
- Output directory: `.`

Hoặc Direct Upload ZIP nếu chỉ cập nhật frontend. Worker phải deploy riêng khi thay prompt.

## Sửa lỗi URL lặp `/src/gui/src/gui/...`

Bản này không còn dùng `meta refresh` tương đối. Trang chính được phục vụ trực tiếp tại `/`, và mọi đường dẫn asset dùng đường dẫn tuyệt đối `/src/...`.

Cloudflare Pages nên cấu hình:
- Root directory: thư mục chứa `index.html`
- Build output directory: `.`
- Không đặt build output là `src/gui`
