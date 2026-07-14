# Định dạng nguồn tự động

Worker chỉ nhập dữ liệu từ nguồn công khai hoặc đã được cấp phép có JSON máy đọc được. Không nên scrape HTML tùy tiện.

```json
{
  "games": [
    {
      "id": "unique-source-id",
      "title": "Tên ván",
      "red": "Kỳ thủ Đỏ",
      "black": "Kỳ thủ Đen",
      "event": "Giải đấu",
      "year": 2026,
      "result": "1-0",
      "termination": "resignation",
      "source_url": "https://...",
      "moves": ["h2e2", "h9g7"]
    }
  ]
}
```

Đăng ký nguồn:

```sql
INSERT INTO sources(id,name,type,url,enabled,trust_level)
VALUES('community-feed','Community Xiangqi Feed','json_manifest','https://example.com/games.json',1,'community');
```

Cron sẽ kiểm tra nguồn, nhập ván mới vào trạng thái `pending`, tạo nội dung AI theo lô và chỉ công bố chế độ tự động phát khi toàn bộ truyện đã cache.
