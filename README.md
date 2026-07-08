# Ếch Nhảy Qua Giếng - Facebook Instant Games

Phiên bản này đã được chỉnh lại để hỗ trợ Facebook Instant Games và vẫn chạy tốt ở chế độ web.

## Các tệp trong thư mục
- `index.html`: entry point của game.
- `game.js`: logic game và lưu điểm cao bằng FBInstant hoặc localStorage.
- `frog-well-jump.html`: phiên bản cũ ban đầu.

## Triển khai lên Facebook Instant Games
1. Tạo Facebook Developer App tại https://developers.facebook.com.
2. Thêm sản phẩm `Instant Games` vào app.
3. Upload bản game HTML của bạn (gồm `index.html`, `game.js` và `manifest.json`) vào phần Instant Games của dashboard.
4. Game phải được host bằng HTTPS, hoặc upload dưới dạng package nếu Facebook yêu cầu.
5. Facebook cũng có thể yêu cầu icon và screenshot.
6. `manifest.json` đã tạo sẵn tham chiếu đến `icon-192x192.png`; bạn có thể bổ sung file icon này hoặc sửa đường dẫn cho phù hợp.

## Lưu ý quan trọng
- `game.js` đã dùng `FBInstant.player.getDataAsync` / `FBInstant.player.setDataAsync` để lưu kỷ lục khi chạy trong Instant Games.
- `game.js` hiện đã hỗ trợ bảng xếp hạng Facebook Instant Games bằng API leaderboard.
- Nếu chạy trên web bình thường thì nó sẽ dùng `localStorage`.
- Để kiếm tiền thật sự, bạn cần tích hợp SDK Instant Games với quảng cáo, in-app purchase, leaderboard, hoặc chương trình phân phối của Facebook.

## Kiểm tra nhanh
- Mở `index.html` trên server HTTPS hoặc upload lên nền tảng hỗ trợ.
- Nếu `FBInstant` chưa có, game vẫn khởi động và chạy ở chế độ web.
- Khi dùng Facebook Instant Games, bạn phải mở game từ Facebook hoặc từ app Facebook Developer để SDK có thể khởi tạo.
