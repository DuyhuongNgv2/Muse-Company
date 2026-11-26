# Muse Company — Văn phòng phòng ban ảo

Văn phòng ảo 3D của Muse Company: Chủ tịch Hưởng → Tổng giám đốc Muse → Trưởng phòng → Nhân viên. Các phòng ban giao việc, trò chuyện, QC và báo cáo như một công ty thật, trong một tòa nhà 2 tầng xem được từ góc tổng giám sát và vào thẳng trong phòng ngồi gần bàn làm việc.

**Phiên bản hiện tại: v44** (đẩy lên GitHub ngày 2026-11-26, thay thế toàn bộ bản cũ — repo trước đó trống, bản này là bản duy nhất trên `main`).

## Bố cục đã khóa

- Đúng 2 tầng, không gộp: tầng 1 là mặt bằng vận hành chung (vào bằng 3 bậc ngắn phía trước), tầng 2 chỉ có phòng Chủ tịch, rộng đúng bằng hành lang trung tâm (16.0 × 13.1), đặt giữa phía sau trên trục Tổng giám đốc.
- 2 cầu thang thẳng ở hai khe bên cạnh phòng Tổng giám đốc (trái giữa Tổng giám đốc và Chiến lược, phải giữa Tổng giám đốc và Nhân sự), từ tầng 1 lên phòng Chủ tịch.
- 49 ghế có tên, 48 nhân vật thật. Hàng hỗ trợ trước Tổng giám đốc: Trợ lý (trái), Lễ tân bàn mở (giữa), Thư ký Chủ tịch (phải).
- Camera chuột: kéo / xoay / zoom / double-click bay vào phòng, nút Toàn cảnh bay ra góc tổng giám sát. Không WASD.

## Tính năng v44

- Tổng giám sát là góc mặc định: tab Toàn cảnh / từng phòng, cột phải Nhật ký sống + Việc đang chạy, bấm phòng / nhân vật / dòng nhật ký là bay vào trong phòng ngồi gần bàn.
- Sáng tối theo giờ thực trên máy người xem: ngày sáng rõ nhìn ra đường / cây / xe qua kính, hoàng hôn, đêm ấm có LED — tự chuyển, không cố định một màu.
- Ngoài kính có phố tạo bằng code (vỉa hè, cỏ, cây, đường 2 làn, 6 xe chạy 2 chiều, đèn đường, nhà đối diện lên đèn về đêm), không tải ảnh ngoài.
- Ánh sáng 3 điểm mềm ấm + hemisphere bounce, vật liệu nội sinh (gỗ sồi, bê tông nhám, kim loại, kính phản chiếu nhẹ không transmission), len chân tường, khung chia đố kính, khung cửa, LED âm trần / bậc thang / sau logo MUSE COMPANY, tranh, đèn bàn, hậu kỳ ACESFilmic + Bloom nhẹ.
- Fix chói + gọn màn hình: bỏ thẻ "Đang xem" và bong bóng chữ lớn che cảnh, bảng tên nhỏ treo trên đầu (chỉ tên ngắn, không đè ngực), đèn chiếu sáng mềm hết vệt trắng cháy, nhãn phòng tự co chữ không cắt.
- Vận hành công ty thật: giao việc theo pipeline nhiều khâu + QC từng khâu, 3 cổng duyệt của Tổng giám đốc (brief / khung đầu / final), KPI theo ghế / phòng, hồ sơ năng lực, Brand Kit dùng chung, kho phiên bản v1 / v2 / final, báo cáo sáng 1 trang, nhật ký kiểm toán (maker ≠ approver).

## Cấu trúc mã nguồn

- `client/src/App.tsx` — giao diện 2D: tổng quan, phòng ban, việc, nhật ký, họp, kho sản phẩm.
- `client/src/Office3D.tsx` — cảnh 3D Three.js: tòa nhà 2 tầng, nhân vật, camera, ánh sáng theo giờ thực, phố ngoài kính.
- `server/src/actions.ts` — server actions (giao việc, pipeline, QC, tin nhắn, họp, Brand Kit…).
- `server/src/schema.ts` + `drizzle/` — schema SQLite (Drizzle) và migrations.
- `space.json` — metadata của Muse web artifact (slug `van-phong-phong-ban-ao`).

Mã nguồn này là bản sao lưu trên GitHub của Muse web artifact đang chạy. Dữ liệu vận hành (app.db, blobs) không nằm trong repo.
