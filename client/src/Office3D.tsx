import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export type LampKind =
  | "working"
  | "review"
  | "approved"
  | "revision"
  | "assigned"
  | "idle"
  | "soon";

export type PresenceKind =
  | "meeting"
  | "a2a"
  | "working"
  | "checking"
  | "reporting"
  | "report-ceo"
  | "resting"
  | "idle"
  | "soon";

export const LAMP_COLORS: Record<LampKind, number> = {
  working: 0x22c55e,
  review: 0xf59e0b,
  approved: 0xa78bfa,
  revision: 0xef4444,
  assigned: 0x38bdf8,
  idle: 0x8b87a0,
  soon: 0x55506e,
};

export const LAMP_CSS: Record<LampKind, string> = {
  working: "#22c55e",
  review: "#f59e0b",
  approved: "#a78bfa",
  revision: "#ef4444",
  assigned: "#38bdf8",
  idle: "#8b87a0",
  soon: "#55506e",
};

export const LAMP_LABELS: Record<LampKind, string> = {
  working: "Đang làm",
  review: "Chờ duyệt",
  approved: "Đạt",
  revision: "Làm lại",
  assigned: "Chờ nhận việc",
  idle: "Trống / rảnh",
  soon: "Sắp mở",
};

export interface OfficeRoomDef {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  floor: number;
  staff: {
    id: string;
    initials: string;
    color: number;
    name?: string;
    gender?: "Nam" | "Nữ";
  }[];
}

// Diện mạo riêng từng người: da ấm kiểu Việt Nam, tóc đen/nâu đậm, trang phục
// công sở khác nhau, chiều cao lệch nhẹ — không ai trùng ai, không mặt Tây.
export interface StaffAppearance {
  gender: "Nam" | "Nữ";
  skin: number;
  hairColor: number;
  hairStyle: "short" | "swept" | "buzz" | "long" | "ponytail" | "bob" | "bun";
  outfit: number;
  outfitStyle: "shirt" | "blazer" | "dress" | "polo" | "vest";
  height: number;
  glasses?: boolean;
  leader?: boolean;
}

export const STAFF_APPEARANCES: Record<string, StaffAppearance> = {
  "chu-tich": { gender: "Nam", skin: 0xe8b88a, hairColor: 0x2a2018, hairStyle: "swept", outfit: 0x23203a, outfitStyle: "vest", height: 1.07, leader: true },
  "thu-ky": { gender: "Nữ", skin: 0xf5c99b, hairColor: 0x241610, hairStyle: "bun", outfit: 0x0f766e, outfitStyle: "blazer", height: 0.97 },
  "van-thu": { gender: "Nữ", skin: 0xf2c294, hairColor: 0x33200f, hairStyle: "ponytail", outfit: 0x8a4b6e, outfitStyle: "dress", height: 0.96 },
  "tro-ly": { gender: "Nữ", skin: 0xf0c08e, hairColor: 0x1c1310, hairStyle: "ponytail", outfit: 0x2f7fc4, outfitStyle: "shirt", height: 0.95 },
  // Lễ tân Ngọc Anh: ĐỒNG PHỤC lễ tân riêng — váy đồng phục xanh ngọc đậm
  // (khác hẳn trang phục thường của mọi nhân viên khác), tóc búi gọn, đeo
  // thẻ nhân viên trước ngực (thẻ dựng riêng trong buildAvatar-loop).
  "le-tan": { gender: "Nữ", skin: 0xf5c99b, hairColor: 0x241610, hairStyle: "bun", outfit: 0x0e5a6d, outfitStyle: "dress", height: 0.97 },
  "tong-giam-doc": { gender: "Nam", skin: 0xe8b88a, hairColor: 0x1a1210, hairStyle: "swept", outfit: 0x1f2440, outfitStyle: "vest", height: 1.06, leader: true },
  "dao-dien": { gender: "Nam", skin: 0xf0c08e, hairColor: 0x241610, hairStyle: "short", outfit: 0x5b3df0, outfitStyle: "blazer", height: 1.03, glasses: true, leader: true },
  "video-01": { gender: "Nam", skin: 0xd9a066, hairColor: 0x140e0a, hairStyle: "short", outfit: 0x2f7fc4, outfitStyle: "shirt", height: 1.0 },
  "video-02": { gender: "Nữ", skin: 0xf5c99b, hairColor: 0x3d2314, hairStyle: "long", outfit: 0xd45d8f, outfitStyle: "dress", height: 0.96 },
  "video-03": { gender: "Nam", skin: 0xe2ac72, hairColor: 0x1c1310, hairStyle: "swept", outfit: 0x2e9e6b, outfitStyle: "polo", height: 1.02, glasses: true },
  qc: { gender: "Nữ", skin: 0xecc090, hairColor: 0x20120c, hairStyle: "ponytail", outfit: 0xd9a41c, outfitStyle: "blazer", height: 0.98, leader: true },
  "tp-marketing": { gender: "Nữ", skin: 0xf2c294, hairColor: 0x2b1a10, hairStyle: "bun", outfit: 0x8e44ad, outfitStyle: "blazer", height: 0.99, leader: true },
  "marketing-nv1": { gender: "Nam", skin: 0xd69a5e, hairColor: 0x120c08, hairStyle: "buzz", outfit: 0x4a7fb5, outfitStyle: "polo", height: 1.04 },
  "marketing-nv2": { gender: "Nữ", skin: 0xf5c99b, hairColor: 0x33200f, hairStyle: "long", outfit: 0x3aa79c, outfitStyle: "dress", height: 0.95 },
  "tp-chien-luoc": { gender: "Nam", skin: 0xe8b88a, hairColor: 0x1a1210, hairStyle: "short", outfit: 0x44506e, outfitStyle: "blazer", height: 1.05, glasses: true, leader: true },
  "strategy-nv1": { gender: "Nữ", skin: 0xf0c08e, hairColor: 0x241610, hairStyle: "bob", outfit: 0xc65b7c, outfitStyle: "shirt", height: 0.94 },
  "strategy-nv2": { gender: "Nam", skin: 0xcf9457, hairColor: 0x140e0a, hairStyle: "swept", outfit: 0x607d3b, outfitStyle: "shirt", height: 1.01 },
  "tp-nhan-su": { gender: "Nữ", skin: 0xf5c99b, hairColor: 0x2b1a10, hairStyle: "long", outfit: 0xa8577a, outfitStyle: "blazer", height: 0.97, leader: true },
  "hr-nv1": { gender: "Nam", skin: 0xe2ac72, hairColor: 0x1c1310, hairStyle: "short", outfit: 0x51749e, outfitStyle: "shirt", height: 1.0 },
  "hr-nv2": { gender: "Nữ", skin: 0xecc090, hairColor: 0x20120c, hairStyle: "ponytail", outfit: 0x7a9e43, outfitStyle: "dress", height: 0.96 },
  "tp-kinh-doanh": { gender: "Nam", skin: 0xd9a066, hairColor: 0x140e0a, hairStyle: "swept", outfit: 0x37474f, outfitStyle: "vest", height: 1.05, leader: true },
  "sales-nv1": { gender: "Nữ", skin: 0xf2c294, hairColor: 0x33200f, hairStyle: "long", outfit: 0xb5524a, outfitStyle: "dress", height: 0.98 },
  "sales-nv2": { gender: "Nam", skin: 0xe8b88a, hairColor: 0x1a1210, hairStyle: "buzz", outfit: 0x8060b8, outfitStyle: "polo", height: 1.02 },
  "tp-noi-dung": { gender: "Nam", skin: 0xe2ac72, hairColor: 0x1a1210, hairStyle: "short", outfit: 0x8a5a33, outfitStyle: "blazer", height: 1.04, leader: true },
  "content-nv1": { gender: "Nữ", skin: 0xf5c99b, hairColor: 0x2b1a10, hairStyle: "long", outfit: 0xd4805f, outfitStyle: "dress", height: 0.96 },
  "content-nv2": { gender: "Nam", skin: 0xcf9457, hairColor: 0x140e0a, hairStyle: "swept", outfit: 0x5f8a7d, outfitStyle: "shirt", height: 1.0 },
  "tp-am-thanh": { gender: "Nam", skin: 0xd9a066, hairColor: 0x120c08, hairStyle: "buzz", outfit: 0x546e7a, outfitStyle: "vest", height: 1.03, leader: true },
  "sound-nv1": { gender: "Nam", skin: 0xe8b88a, hairColor: 0x1c1310, hairStyle: "short", outfit: 0x8d6e63, outfitStyle: "polo", height: 1.01 },
  "sound-nv2": { gender: "Nữ", skin: 0xf0c08e, hairColor: 0x241610, hairStyle: "bob", outfit: 0x4e9e57, outfitStyle: "shirt", height: 0.95 },
  "tp-dang-tai": { gender: "Nữ", skin: 0xf2c294, hairColor: 0x20120c, hairStyle: "bun", outfit: 0x5c6bc0, outfitStyle: "blazer", height: 0.98, leader: true },
  "publish-nv1": { gender: "Nam", skin: 0xe2ac72, hairColor: 0x1a1210, hairStyle: "swept", outfit: 0xc05c5c, outfitStyle: "shirt", height: 1.02 },
  "publish-nv2": { gender: "Nữ", skin: 0xecc090, hairColor: 0x33200f, hairStyle: "ponytail", outfit: 0xab7bc0, outfitStyle: "dress", height: 0.94 },
  "tp-tai-chinh": { gender: "Nam", skin: 0xd9a066, hairColor: 0x140e0a, hairStyle: "swept", outfit: 0x2e7d5b, outfitStyle: "vest", height: 1.04, leader: true },
  "finance-nv1": { gender: "Nữ", skin: 0xf5c99b, hairColor: 0x2b1a10, hairStyle: "bun", outfit: 0xd4a017, outfitStyle: "blazer", height: 0.97 },
  "finance-nv2": { gender: "Nam", skin: 0xe8b88a, hairColor: 0x1c1310, hairStyle: "short", outfit: 0x4a6fa5, outfitStyle: "shirt", height: 1.0 },
  "tp-phap-che": { gender: "Nam", skin: 0xe2ac72, hairColor: 0x1a1210, hairStyle: "short", outfit: 0x5b4a8a, outfitStyle: "blazer", height: 1.03, leader: true },
  "legal-nv1": { gender: "Nữ", skin: 0xf0c08e, hairColor: 0x241610, hairStyle: "long", outfit: 0xc65b7c, outfitStyle: "dress", height: 0.96 },
  "legal-nv2": { gender: "Nam", skin: 0xcf9457, hairColor: 0x120c08, hairStyle: "buzz", outfit: 0x607d8a, outfitStyle: "shirt", height: 1.01 },
};

const DEFAULT_APPEARANCE: StaffAppearance = {
  gender: "Nam",
  skin: 0xe8b88a,
  hairColor: 0x1a1210,
  hairStyle: "short",
  outfit: 0x6b6880,
  outfitStyle: "shirt",
  height: 1,
};

interface Office3DProps {
  rooms: OfficeRoomDef[];
  staffLamp: Record<string, LampKind>;
  roomLamp: Record<string, LampKind>;
  presence: Record<string, PresenceKind>;
  focusRequest: { roomId: string; staffId?: string | null; nonce: number } | null;
  onSelectRoom: (roomId: string) => void;
  onSelectStaff: (staffId: string) => void;
  hour: number;
  qcTitle: string | null;
  // Live per-person content drawn from real task data.
  staffScreen: Record<string, string>;
  staffBubble: Record<string, string>;
  staffInfo: Record<string, { name: string; role: string; task: string }>;
  walkTarget: Record<string, string | null>;
  meetingBoard: { decisions: string; actions: string } | null;
  // Thanh chức năng trên cùng điều khiển Hiện/Ẩn bảng tên từ ngoài:
  // khi prop này được truyền, nó thắng trạng thái nội bộ của canvas.
  showNames?: boolean;
  onToggleNames?: () => void;
}

// QUY HOẠCH — ĐÍNH CHÍNH MỚI NHẤT CỦA CHỦ TỊCH (xem OFFICE_ROOMS
// trong App.tsx): Phòng Chủ tịch MỞ RỘNG RỘNG BẰNG ĐÚNG HÀNH
// LANG CHÍNH GIỮA: bề rộng 16.0 — bằng đúng chiều rộng sảnh /
// hành lang chính giữa (thảm sảnh rộng 16.0, x ±8.0), KHÔNG rộng
// hơn, KHÔNG hẹp hơn; chiều sâu giữ 13.1 (tâm x=0, z=-22.25;
// mặt trước z=-15.7, tường sau z=-28.8), diện tích ~210 — TO
// HƠN HẲN Phòng Tổng giám đốc (9.6 × 8.3 ≈ 80) ngay phía trước,
// KHÔNG còn là hình chữ nhật dài 32.2 × 13.1 như trước, KHÔNG
// thụt vào, KHÔNG để khoảng trống hai bên phòng: hai vách sườn
// phòng đứng đúng tuyến mép hành lang chính giữa kéo dài ra sau.
// Phòng nằm chính giữa phía sau, đúng trục Phòng Tổng giám đốc,
// một mình một phòng, chỉ một mình Chủ tịch bên trong. CỐT NỀN
// phòng ĐÃ HẠ XUỐNG THẤP: phòng KHÔNG còn ngồi trên bệ cao 2.82
// như bản cũ, mà đặt trên BỆ NÂNG THẤP đúng 1.35 (9 bậc × 0.15)
// — hạ hẳn xuống thấp, nhưng KHÔNG nằm ngang mặt đất tầng 1:
// muốn vào phòng phải LÊN CẦU THANG. KHÔNG CÒN BAN CÔNG / SẢNH
// NGOÀI trước phòng. CẦU THANG LÊN PHÒNG CHỦ TỊCH (Chủ tịch
// đính chính MỚI NHẤT — ĐẢO NGƯỢC CẦU THANG): ĐÚNG 2 CẦU
// THANG THẲNG tại x=±6.55, nhưng CHÂN THANG ĐẶT NGAY TẠI VÁCH
// TRƯỚC PHÒNG CHỦ TỊCH — chính chỗ ĐỈNH THANG của bản trước
// nay thành CHÂN THANG, chân thang đặt từ đó, tại LỐI MỞ
// (không cánh cửa) ở mặt trước phòng phía đó — và mỗi cầu
// thang ĐI THẲNG MỘT MẠCH NGƯỢC VÀO TRONG PHÒNG, leo lên dọc
// theo HÀNH LANG VÁCH NGĂN (trong 2 rãnh khoét vào mặt trước
// bệ nâng tại 2 lối mở), ĐẦU THANG chạm SÀN HÀNH LANG trong
// phòng: KHÔNG cong, KHÔNG chữ L, KHÔNG đặt đằng trước phòng,
// KHÔNG đặt dọc sườn Phòng Chủ tịch, KHÔNG còn thang nào
// đứng trong 2 khe bên Phòng Tổng giám đốc nữa. Nhờ đảo
// ngược như vậy, HÀNH LANG BÊN DƯỚI trước Phòng Chủ tịch
// (dải thảm sau hàng điều hành) ĐƯỢC CHỪA TRỐNG HOÀN TOÀN
// cho PHÒNG BÊN TRONG (Chiến lược, Nhân sự) có đường đi
// thông suốt ngang qua. VÁCH NGĂN + HÀNH LANG ĐÃ LÙI THẬT
// VÀO TRONG PHÒNG (Chủ tịch đính chính mới nhất): bản đảo
// cầu thang trước CHỈ đổi thang — vách ngăn với hành lang
// vẫn đứng nguyên chỗ cũ cách mặt trước 2.3, CHƯA lùi tí
// nào. Nay vách ngăn và hành lang LÙI SÂU VÀO TRONG PHÒNG
// THÊM ĐÚNG BẰNG CHỖ HÀNH LANG ĐÃ CHỐT (2.3): vách ngăn từ
// z=-18.07 lùi về z=-20.37 — cách mặt trước 4.6, NHÌN THẤY
// RÕ ĐÃ LÙI — và hành lang trong phòng chạy sâu một mạch
// 4.6 từ mặt trước tới vách ngăn. PHÒNG CHỦ TỊCH CHỈ CÓ
// ĐÚNG 1 CỬA CHÍNH DUY NHẤT Ở GIỮA — KHÔNG còn 2 cửa trước
// như bản trước: bên trong phòng, một VÁCH NGĂN chạy ngang
// cách mặt trước 4.6 tạo thành HÀNH LANG trong phòng dọc
// theo mặt trước; lên hết cầu thang là vào hành lang, đi
// dọc hành lang vào giữa rồi mới qua CỬA CHÍNH DUY NHẤT (ở
// giữa vách ngăn) vào phòng chính. Theo trục đi vào, 2 cầu thang nằm SAU 3 BẬC
// NGẮN TRƯỚC CỬA CHÍNH: qua cửa chính, lên 3 bậc ngắn, qua
// sảnh, qua khu điều hành, đi dọc hành lang bên dưới tới chân
// 2 cầu thang ngay tại vách trước phòng — cầu thang không
// đặt trước 3 bậc, không chắn 3 bậc.
// Phòng Chiến lược (trái) và Phòng Nhân sự (phải) ở hàng sau
// tầng 1 đứng hẳn hoi trên mặt sàn phẳng, không cầu thang nào
// che.
// LỐI ĐI PHÂN LÔ CÂN ĐỐI HAI BÊN: các lô phòng và đường đi chia
// ĐỀU, đối xứng qua trục giữa — lối đi chung rộng đều hai
// bên, nhân vật đi đường nào cũng thông, không kẹt, không lệch
// một bên — xem NAV.
// LỐI ĐI TRẢI THẢM, ĐI THÔNG MỌI PHÒNG (Chủ tịch đính chính):
// toàn bộ lối đi chung TRẢI THẢM liền một mạng — sảnh / hành
// lang chính giữa chạy THẲNG một mạch từ Cửa chính (sau 3 bậc
// ngắn) tới tận khu điều hành, hai lối dọc giữa hai dãy phòng
// mỗi bên, dải thảm sau hàng phòng sau trước Phòng Chủ tịch và
// các đoạn nối ngang — phòng ban nào cũng mở cửa ra thảm và đi
// thông được với nhau qua thảm và sảnh chung, KHÔNG phòng nào
// bị kẹt, KHÔNG lối nào bị chắn, hai bên cân đối, ngay ngắn,
// thông thoáng — xem khối thảm sharedFloor bên dưới. (Không
// quay lại dãy hành lang riêng khép kín: thảm là lối đi chung
// trên một mặt sàn mở duy nhất.)
// HẠ CỐT NỀN XUỐNG 3 BẬC (Chủ tịch đính chính): toàn bộ cốt
// nền văn phòng hạ xuống đúng 3 bậc — 3 × 0.15 = 0.45 — và nền
// đất ngoài trời nằm thấp hơn mặt sàn văn phòng đúng 3 bậc đó;
// ngay trước Cửa chính có đúng 3 BẬC NGẮN bước lên vào văn
// phòng (mỗi bậc cao 0.15, mặt bậc sâu 0.34: bậc ngắn, vừa
// bước, không cao, rộng đúng khẩu độ cửa chính nên không chắn
// lối). Cả khối world hạ cùng nhau nên mọi cao độ BÊN TRONG
// giữ nguyên tương đối — chỉ cốt nền so với đất ngoài là thay
// đổi.
const STEP_RISE = 0.15;
const FLOOR_DROP = STEP_RISE * 3; // 0.45 — hạ cốt nền đúng 3 bậc
// PHÒNG CHỦ TỊCH TRÊN BỆ NÂNG THẤP + 2 CẦU THANG THẲNG ĐẢO
// NGƯỢC (CHÂN THANG TẠI VÁCH TRƯỚC PHÒNG, THANG LEO VÀO
// TRONG DỌC HÀNH LANG VÁCH NGĂN) + HÀNH LANG BÊN DƯỚI CHỪA
// TRỐNG CHO PHÒNG BÊN TRONG + 1 CỬA CHÍNH DUY NHẤT (Chủ tịch
// đính chính mới nhất): the room stands on a LOW podium — its
// floor level is CHAIR_LEVEL (1.35 = 9 stair risers of 0.15)
// above floor 1's floor, lowered right down from the old
// 2.82-high block but NOT flat on the ground. EXACTLY TWO
// straight stairs, centred at x=±6.55 — but FLIPPED (Chủ
// tịch đính chính): the FOOT of each flight stands right at
// the room's front wall (outer face at world z=-15.7), at an
// OPEN PASSAGE (no door leaf) on its side — the very spot
// where the HEAD of the old flight used to arrive — and the
// flight climbs STRAIGHT, one single flight, from that foot
// INTO the room, rising along the interior CORRIDOR (hành
// lang) in a channel cut into the front of the podium, until
// its HEAD lands on the corridor floor. THE PARTITION AND
// THE CORRIDOR HAVE NOW REALLY BEEN PUSHED BACK (Chủ tịch
// đính chính mới nhất): in the flipped-stair build the
// partition and corridor never moved — they still stood
// 2.3 behind the front wall, exactly where they had always
// been. Now the partition (vách ngăn) is pushed INTO the
// room by exactly the settled corridor amount (2.3) more:
// from world z=-18.07 back to z=-20.37, i.e. 4.6 behind the
// front wall — the retreat is plain to see — and the
// corridor runs one deep 4.6 band from the front wall to
// the partition. No curve, no L-shape, NOT in front of the
// room, NOT along the room's flanks, and NO stair stands in
// the slots (khe) beside the Tổng giám đốc room any more:
// the HALLWAY BELOW in front of the room (the carpeted back
// strip behind the executive row) is left COMPLETELY
// CLEAR, so the inner rooms (Chiến lược, Nhân sự) keep
// their way along it. From either stair's head you step
// onto the corridor floor, walk the corridor to the middle
// and enter the room proper through the ONE SINGLE MAIN
// DOOR at the centre of that partition — the room has NO
// other door.
// MÉP HÀNH LANG CẮT BẰNG ĐỈNH CẦU THANG + BỎ 2 VÁCH THỪA +
// LAN CAN LÀM LẠI + HỒ CÁ COI PHONG THỦY + FULL THẢM (Chủ tịch
// đính chính mới nhất): the corridor's edge is CUT FLUSH WITH
// THE STAIR HEADS — the slab and the podium both end at local
// z +4.31 (world −17.94), the back edge of each flight's top
// tread: nothing protrudes past the heads, nothing recedes
// behind them, and a brass nosing stitches the full width into
// one aligned line. The cut removes the slab/podium front band
// ENTIRELY — including the two narrow stone fins outside the
// channels (the "2 vách thừa") — and opens a well between the
// channels, which now holds a FENG-SHUI KOI POND: rockery
// (hòn non bộ) at its centre, a waterfall pouring down the
// rockery's corridor-facing slope INTO the pond (nước chảy vào
// trong, toward the ONE main door — tụ tài), koi circling the
// rockery, clear water, greenery and dressed stones; the pond
// blocks neither the corridor's walking line nor the main
// door, and the stair passages flank it untouched. The old
// front-line railing is GONE; the corridor railing now stands
// ON THE CUT EDGE between the stair heads, built exactly like
// a stair handrail — one slim round brass top rail 0.80 above
// the floor on slim open balusters, no mid rail, no glass, no
// panel: low, open, see-through. And EVERY walkway in the
// company is now carpeted — the chairman corridor wall-to-edge
// included, the last back-corner seams filled — no corridor
// with carpet beside one without.
const CHAIR_LEVEL = 1.35; // cốt nền Phòng Chủ tịch: bệ nâng thấp 1.35 trên mặt sàn tầng 1
const CHAIR_FRONT_Z = -15.7; // world z of the chairman front wall's outer face
const CHAIR_PART_Z = -20.37; // world z of the interior partition (vách ngăn) walling off the corridor — PUSHED BACK into the room by exactly the settled corridor amount (2.3) from its old spot (was -18.07): room-local z = d/2 − 0.07 − 4.6
const CHAIR_CORR_Z = -18.07; // world z of the corridor's centre line, between the front wall and the pushed-back partition (the corridor now runs 4.6 deep)
const STAIR_RISERS = 9; // 9 × 0.15 = 1.35 = CHAIR_LEVEL
const STAIR_TREAD = 0.28;
const STAIR_WIDTH = 2.2;
const STAIR_CX = 6.55; // |x| of each stair's centre — the axis of the slot (khe) beside the Tổng giám đốc room carried straight back to the front-wall passage the flipped flight serves: the flight's foot stands at that passage and it climbs into the room from there
function chairDoorIn(): THREE.Vector3 {
  // Just inside the room's ONE SINGLE MAIN DOOR — the door at
  // the centre of the interior partition — inside the main
  // chamber, on the raised floor (walking level
  // CHAIR_LEVEL + 0.22).
  return new THREE.Vector3(0, CHAIR_LEVEL + 0.22, CHAIR_PART_Z - 0.45);
}
function chairCorrDoor(): THREE.Vector3 {
  // In the corridor, just in front of the single main door.
  return new THREE.Vector3(0, CHAIR_LEVEL + 0.22, CHAIR_PART_Z + 0.45);
}
function chairStairDown(side: number): THREE.Vector3[] {
  // The way down from the Chủ tịch room on the given side,
  // TOP → BOTTOM: out of the main chamber through the SINGLE
  // MAIN DOOR into the interior corridor, along the corridor
  // on its open middle floor to that side, a step sideways
  // onto the TOP tread of that side's straight flight, down
  // the flight tread by tread — the flight is FLIPPED (Chủ
  // tịch đính chính): it climbs from its FOOT at the room's
  // front wall INTO the room along the corridor, so going
  // down you come OUT of the room — then off the foot,
  // through that side's open front-wall passage, onto the
  // carpeted HALLWAY BELOW (the back strip), which is now
  // left completely clear for the inner rooms.
  // Tread k (1 = bottom, at the front wall … 8 = top, landing
  // on the corridor floor — the partition has been PUSHED
  // BACK a further 2.3 behind the top tread) has its top at
  // 0.22 + k·0.15 and its centre at
  // z = CHAIR_FRONT_Z − (k − 1/2)·STAIR_TREAD.
  const cx = side * STAIR_CX;
  return [
    chairDoorIn(),
    chairCorrDoor(),
    new THREE.Vector3(side * 2.6, CHAIR_LEVEL + 0.22, CHAIR_CORR_Z),
    // Along the corridor's walking line to the channel's inner
    // edge — since the corridor edge was CUT flush with the
    // stair heads, the route stays on the corridor floor (z at
    // the corridor centre line) until it is inside the channel,
    // then steps straight onto the top tread: it never crosses
    // the new edge railing (which ends 0.15 short of the
    // channel) and never walks over the koi pond.
    new THREE.Vector3(side * 4.6, CHAIR_LEVEL + 0.22, CHAIR_CORR_Z),
    new THREE.Vector3(cx, 0.22 + 8 * STEP_RISE, CHAIR_FRONT_Z - 7.5 * STAIR_TREAD),
    new THREE.Vector3(cx, 0.22 + 5 * STEP_RISE, CHAIR_FRONT_Z - 4.5 * STAIR_TREAD),
    new THREE.Vector3(cx, 0.22 + 3 * STEP_RISE, CHAIR_FRONT_Z - 2.5 * STAIR_TREAD),
    new THREE.Vector3(cx, 0.22 + 1 * STEP_RISE, CHAIR_FRONT_Z - 0.5 * STAIR_TREAD),
    chairStairFoot(side),
  ];
}
function chairStairFoot(side: number): THREE.Vector3 {
  // The carpeted ground point in the HALLWAY BELOW (the back
  // strip in front of the Chủ tịch room), just in front of
  // the FOOT of the stair on the given side — the foot stands
  // right at the room's front wall, at that side's open
  // passage, where the old flight's head used to arrive —
  // where the shared-floor route hands over to that stair's
  // climb (and where it hands back). The hallway itself stays
  // completely clear of both flights, so the inner rooms
  // (Chiến lược, Nhân sự) keep their way along it.
  return new THREE.Vector3(side * STAIR_CX, 0.22, -14.9);
}

function baseYOf(room: OfficeRoomDef): number {
  // Every floor-1 room stands on the one flat floor at level 0.
  // The Chủ tịch room stands on its LOW PODIUM: CHAIR_LEVEL
  // above floor 1 — lowered right down from the old high block
  // (Chủ tịch đính chính: hạ cốt nền), reached by the two
  // FLIPPED straight stairs — their feet at the room's front
  // wall, the flights climbing INTO the room along its
  // interior corridor — and its single main door.
  return room.id === "chairman" ? CHAIR_LEVEL : 0;
}

function drawScreen(
  g: CanvasRenderingContext2D | null,
  tex: THREE.CanvasTexture | null,
  qcTitle: string | null,
  heading: string,
) {
  if (!g || !tex) return;
  g.fillStyle = "#0d0a24";
  g.fillRect(0, 0, 640, 360);
  g.fillStyle = "#6d28d9";
  g.fillRect(0, 0, 640, 64);
  g.fillStyle = "#ffffff";
  g.font = "bold 30px 'Segoe UI', system-ui, sans-serif";
  g.textAlign = "left";
  g.fillText(heading, 24, 42);
  g.font = "26px 'Segoe UI', system-ui, sans-serif";
  g.fillStyle = "#c9bdf5";
  if (qcTitle) {
    g.fillText("Đang QC:", 24, 120);
    g.fillStyle = "#ffffff";
    g.font = "bold 30px 'Segoe UI', system-ui, sans-serif";
    const words = qcTitle.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > 34) {
        lines.push(line.trim());
        line = w;
      } else line += " " + w;
    }
    if (line.trim()) lines.push(line.trim());
    lines.slice(0, 4).forEach((l, i) => g.fillText(l, 24, 168 + i * 42));
    g.fillStyle = "#f59e0b";
    g.font = "bold 24px 'Segoe UI', system-ui, sans-serif";
    g.fillText("● TRẠNG THÁI: CHỜ DUYỆT", 24, 330);
  } else {
    g.fillText("Chưa có clip nào đang QC.", 24, 130);
    g.fillText("Khi có việc Chờ duyệt, tên việc", 24, 175);
    g.fillText("sẽ chiếu lên màn hình này.", 24, 220);
  }
  tex.needsUpdate = true;
}

// Small desk-monitor texture: shows the task its owner is really holding.
function drawDeskScreen(
  g: CanvasRenderingContext2D | null,
  tex: THREE.CanvasTexture | null,
  text: string,
) {
  if (!g || !tex) return;
  g.fillStyle = "#0b0820";
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = "#6d28d9";
  g.fillRect(0, 0, 256, 24);
  g.fillStyle = "#ffffff";
  g.font = "bold 13px 'Segoe UI', system-ui, sans-serif";
  g.textAlign = "left";
  g.fillText("MÀN HÌNH LÀM VIỆC", 10, 17);
  const raw = text.trim() ? text.split("\n") : ["Sẵn sàng nhận việc"];
  const lines: string[] = [];
  for (const part of raw) {
    let line = "";
    for (const w of part.split(" ")) {
      if ((line + " " + w).trim().length > 21) {
        lines.push(line.trim());
        line = w;
      } else line += " " + w;
    }
    if (line.trim()) lines.push(line.trim());
  }
  lines.slice(0, 5).forEach((l, i) => {
    g.font =
      i === 0
        ? "bold 16px 'Segoe UI', system-ui, sans-serif"
        : "15px 'Segoe UI', system-ui, sans-serif";
    g.fillStyle = i === 0 ? "#ffffff" : "#c9bdf5";
    g.fillText(l, 10, 52 + i * 24);
  });
  tex.needsUpdate = true;
}

// Speech / status bubble floating above one person's head.
function drawBubble(
  entry: {
    g: CanvasRenderingContext2D | null;
    tex: THREE.CanvasTexture | null;
    sprite: THREE.Sprite;
  },
  text: string,
) {
  const { g, tex, sprite } = entry;
  // Chủ tịch chốt BỎ HẲN bong bóng chữ trên đầu: hàm này không
  // bao giờ bật sprite nữa — chữ trạng thái chỉ còn ở cột phải
  // (Nhật ký / thẻ nhân viên), màn hình 3D sạch hoàn toàn.
  sprite.visible = false;
  if (!g || !tex) {
    return;
  }
  g.clearRect(0, 0, 512, 160);
  if (!text) {
    tex.needsUpdate = true;
    return;
  }
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    if ((line + " " + w).trim().length > 24) {
      lines.push(line.trim());
      line = w;
    } else line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());
  const shown = lines.slice(0, 2);
  const boxH = shown.length > 1 ? 104 : 68;
  // Bong bóng ĐÃ XONG (chỉ người vừa xong việc mới có, do App quyết
  // định qua tiền tố "ĐÃ XONG") vẽ nền xanh lá chữ trắng cho nổi hẳn
  // lên giữa văn phòng; bong bóng thường giữ nền trắng như cũ.
  const isDone = text.startsWith("ĐÃ XONG");
  g.fillStyle = isDone ? "rgba(21,128,61,0.97)" : "rgba(255,255,255,0.97)";
  g.beginPath();
  g.roundRect(16, 10, 480, boxH, 24);
  g.fill();
  g.beginPath();
  g.moveTo(232, 10 + boxH - 2);
  g.lineTo(280, 10 + boxH - 2);
  g.lineTo(256, 142);
  g.closePath();
  g.fill();
  g.fillStyle = isDone ? "#ffffff" : "#221a3e";
  g.font = "bold 33px 'Segoe UI', system-ui, sans-serif";
  g.textAlign = "center";
  shown.forEach((l, i) => g.fillText(l, 256, 56 + i * 40));
  tex.needsUpdate = true;
}

// Meeting-room whiteboard: the latest saved minutes (Quyết định / Việc cần làm).
function drawMeetingBoard(
  g: CanvasRenderingContext2D | null,
  tex: THREE.CanvasTexture | null,
  board: { decisions: string; actions: string } | null,
) {
  if (!g || !tex) return;
  g.fillStyle = "#f5f3fc";
  g.fillRect(0, 0, 512, 288);
  g.fillStyle = "#221a3e";
  g.fillRect(0, 0, 512, 46);
  g.fillStyle = "#ffffff";
  g.font = "bold 22px 'Segoe UI', system-ui, sans-serif";
  g.textAlign = "left";
  g.fillText("BẢNG HỌP — BIÊN BẢN MỚI NHẤT", 16, 31);
  if (!board) {
    g.fillStyle = "#221a3e";
    g.font = "19px 'Segoe UI', system-ui, sans-serif";
    g.fillText("Chưa có biên bản họp nào.", 16, 92);
    g.fillText("Họp xong, Quyết định và Việc cần làm", 16, 124);
    g.fillText("sẽ hiện lên bảng này.", 16, 156);
    tex.needsUpdate = true;
    return;
  }
  const section = (title: string, body: string, y: number) => {
    g.font = "bold 19px 'Segoe UI', system-ui, sans-serif";
    g.fillStyle = "#6d28d9";
    g.fillText(title, 16, y);
    g.font = "17px 'Segoe UI', system-ui, sans-serif";
    g.fillStyle = "#221a3e";
    const lines: string[] = [];
    for (const part of body.split("\n")) {
      let ln = "";
      for (const w of part.split(" ")) {
        if ((ln + " " + w).trim().length > 40) {
          lines.push(ln.trim());
          ln = w;
        } else ln += " " + w;
      }
      if (ln.trim()) lines.push(ln.trim());
    }
    lines.slice(0, 3).forEach((l, i) => g.fillText(l, 16, y + 26 + i * 22));
  };
  section("QUYẾT ĐỊNH", board.decisions || "—", 82);
  section("VIỆC CẦN LÀM", board.actions || "—", 196);
  tex.needsUpdate = true;
}

let steamTexture: THREE.Texture | null = null;
function getSteamTexture(): THREE.Texture {
  if (steamTexture) return steamTexture;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "rgba(255,255,255,0.85)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  steamTexture = new THREE.CanvasTexture(c);
  return steamTexture;
}

// Nhãn treo trên 3D (Chủ tịch chốt): CHỈ hiện tên ngắn gọn —
// một dòng duy nhất, không dòng mô tả dài bên dưới tên, và
// KHÔNG còn thẻ chi tiết nào phủ lên canvas nữa (màn hình 3D
// phải sạch để xem cảnh).
// Chấm màu trạng thái trên nhãn phòng (theo mẫu Phim Trường mà
// Chủ tịch gửi): ĐỎ = phòng đang chạy việc, XANH = đã xong, XÁM =
// đang chờ; thêm hổ phách = chờ duyệt/chốt, xanh dương = chờ nhận.
const ROOM_DOT_CSS: Record<LampKind, string> = {
  working: "#ef4444",
  revision: "#ef4444",
  approved: "#22c55e",
  review: "#f59e0b",
  assigned: "#38bdf8",
  idle: "#9ca3af",
  soon: "#6b6880",
};

function paintRoomLabel(g: CanvasRenderingContext2D, text: string, lamp?: LampKind) {
  g.clearRect(0, 0, 512, 88);
  g.fillStyle = "rgba(20,13,46,0.85)";
  g.beginPath();
  g.roundRect(6, 6, 500, 76, 26);
  g.fill();
  if (lamp) {
    g.fillStyle = ROOM_DOT_CSS[lamp];
    g.beginPath();
    g.arc(48, 44, 13, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.8)";
    g.lineWidth = 3;
    g.stroke();
  }
  g.fillStyle = "#ffffff";
  // Cỡ chữ tự co theo độ dài tên phòng: tên dài ("Phòng Thư ký
  // Chủ tịch") không còn tràn mép / cắt chữ như trước.
  let fs = 44;
  g.font = `bold ${fs}px 'Segoe UI', system-ui, sans-serif`;
  const maxW = lamp ? 400 : 460;
  const tw = g.measureText(text).width;
  if (tw > maxW) {
    fs = Math.max(26, Math.floor((fs * maxW) / tw));
    g.font = `bold ${fs}px 'Segoe UI', system-ui, sans-serif`;
  }
  g.textAlign = "center";
  g.fillText(text, lamp ? 278 : 256, 58);
}

function makeLabelSprite(text: string, lamp?: LampKind): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 88;
  const g = canvas.getContext("2d");
  if (g) paintRoomLabel(g, text, lamp);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.6, 0.79, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// Tên các khu tiện ích (không nằm trong danh sách phòng truyền
// xuống) để nút Toàn cảnh gọi đúng tên khu đang xem trong nhãn
// trợ năng khi bấm vào một khu.
const ZONE_NAMES: Record<string, string> = {
  "zone-garden": "Khu vườn xanh",
  "zone-fun": "Khu giải trí",
  "zone-library": "Thư viện nhỏ",
  "zone-dining": "Khu ăn uống",
  "zone-sport": "Khu thể thao nhẹ",
};

function makeNameplate(label: string): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = "#17102e";
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = "#a78bfa";
    g.lineWidth = 5;
    g.strokeRect(4, 4, 504, 88);
    g.fillStyle = "#ffffff";
    g.font = "bold 37px 'Segoe UI', system-ui, sans-serif";
    g.textAlign = "center";
    const text = label.length > 24 ? label.slice(0, 24) : label;
    g.fillText(text, 256, 62);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Bảng tên NGẮN lại (0.85 × 0.16 thay cho 1.15 × 0.22): Chủ tịch
  // chê bảng cũ dài, nằm chắn ngang mặt bàn không làm việc được.
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.16),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  plate.rotation.x = -0.35;
  return plate;
}

// Bảng tên trên đầu nhân viên (Chủ tịch chốt): CHỈ hiện tên —
// không chức vụ, không ký hiệu dài dòng (chức vụ chỉ xem trên
// thẻ khi bấm vào người đó). Màu theo cấp bậc: Chủ tịch vàng,
// Tổng giám đốc tím, trưởng phòng xanh dương, nhân viên trắng.
// Bảng NHỎ, treo CAO trên đầu, không đè lên người. Ẩn/hiện theo
// mức zoom + hover/bấm chọn và so le né nhau được quyết trong
// vòng lặp render (xem khối headTags trong animate()).
type TagRank = "chairman" | "ceo" | "head" | "staff";

function staffTagRank(staffId: string): TagRank {
  if (staffId === "chu-tich") return "chairman";
  if (staffId === "tong-giam-doc") return "ceo";
  if (STAFF_APPEARANCES[staffId]?.leader) return "head";
  return "staff";
}

const TAG_RANK_STYLE: Record<TagRank, { bg: string; fg: string }> = {
  chairman: { bg: "rgba(201,151,0,0.95)", fg: "#241a00" },
  ceo: { bg: "rgba(109,40,217,0.94)", fg: "#ffffff" },
  head: { bg: "rgba(37,99,235,0.94)", fg: "#ffffff" },
  staff: { bg: "rgba(250,250,252,0.95)", fg: "#221a3e" },
};

// Cao độ treo bảng tên: cao hẳn trên đầu, không đè lên người.
const TAG_BASE_Y = 2.02;

function makeHeadTag(name: string, rank: TagRank): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 112;
  const g = canvas.getContext("2d");
  const style = TAG_RANK_STYLE[rank];
  if (g) {
    g.fillStyle = style.bg;
    g.beginPath();
    g.roundRect(6, 6, 500, 100, 30);
    g.fill();
    g.fillStyle = style.fg;
    const text = name.length > 22 ? name.slice(0, 22) : name;
    // Cỡ chữ tự co cho vừa khung: tên dài không tràn mép bảng.
    let fs = 44;
    g.font = `bold ${fs}px 'Segoe UI', system-ui, sans-serif`;
    const tw = g.measureText(text).width;
    if (tw > 460) {
      fs = Math.max(28, Math.floor((fs * 460) / tw));
      g.font = `bold ${fs}px 'Segoe UI', system-ui, sans-serif`;
    }
    g.textAlign = "center";
    g.fillText(text, 256, 74);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  sprite.scale.set(1.25, 0.28, 1);
  sprite.renderOrder = 9;
  return sprite;
}

interface AvatarRig {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  seat: THREE.Vector3;
  door: THREE.Vector3;
  seatRotY: number;
  sit: number;
  pos: THREE.Vector3;
  phase: number;
  via: THREE.Vector3 | null;
  path: THREE.Vector3[];
  targetKey: string;
  stride: number;
  // Per-person movement character: own pace, staggered departures and
  // natural pauses (a chat, a tea stop) — nobody marches in lockstep.
  speed: number;
  startAt: number;
  pauseUntil: number;
  nextPauseAt: number;
  folder: THREE.Object3D | null;
}

function buildAvatar(
  staffId: string,
  fallbackColor: number,
): Omit<AvatarRig, "seat" | "door" | "seatRotY" | "sit" | "pos" | "phase" | "via" | "path" | "targetKey" | "stride" | "speed" | "startAt" | "pauseUntil" | "nextPauseAt" | "folder"> {
  const ap: StaffAppearance = STAFF_APPEARANCES[staffId] ?? {
    ...DEFAULT_APPEARANCE,
    outfit: fallbackColor,
  };
  const female = ap.gender === "Nữ";
  const group = new THREE.Group();
  group.scale.setScalar(ap.height);
  const bodyGroup = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: ap.skin, roughness: 0.62, metalness: 0 });
  const outfitMat = new THREE.MeshStandardMaterial({ color: ap.outfit, roughness: 0.68, metalness: 0 });
  const hairMat = new THREE.MeshStandardMaterial({ color: ap.hairColor, roughness: 0.85, metalness: 0 });

  // Torso: narrower shoulders for women, a flared skirt for dresses, a white
  // shirt front + tie for the CEO's / sales lead's vest look.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(female ? 0.2 : 0.23, 0.4, 4, 12), outfitMat);
  torso.position.y = 0.66;
  torso.scale.set(1, 1, 0.82);
  torso.castShadow = true;
  bodyGroup.add(torso);
  if (ap.outfitStyle === "dress") {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.33, 0.34, 14), outfitMat);
    skirt.position.y = 0.38;
    skirt.castShadow = true;
    bodyGroup.add(skirt);
  }
  if (ap.outfitStyle === "vest" || ap.outfitStyle === "blazer") {
    const shirtFront = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.34, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.7 }),
    );
    shirtFront.position.set(0, 0.74, -0.185);
    bodyGroup.add(shirtFront);
    if (ap.outfitStyle === "vest") {
      const tie = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.26, 0.015),
        new THREE.MeshStandardMaterial({ color: 0x8e1f2f, roughness: 0.55 }),
      );
      tie.position.set(0, 0.72, -0.205);
      bodyGroup.add(tie);
    }
  }
  if (ap.outfitStyle === "polo") {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 8, 16), outfitMat);
    collar.position.set(0, 0.98, 0);
    collar.rotation.x = Math.PI / 2.3;
    bodyGroup.add(collar);
  }
  // Role badge on the chest for the CEO, the Director and every head of room.
  if (ap.leader) {
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.13, 0.015),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.3, metalness: 0.65 }),
    );
    badge.position.set(female ? 0.13 : 0.14, 0.82, -0.2);
    bodyGroup.add(badge);
  }
  // Lễ tân Ngọc Anh đeo THẺ NHÂN VIÊN thật trước ngực: thẻ trắng có dải
  // màu đồng phục và ảnh ô nhỏ, treo bằng dây đeo cổ từ cổ xuống ngực —
  // nhìn là biết ngay nhân viên Lễ tân đang trực, không lẫn với khách hay
  // nhân viên phòng ban khác.
  if (staffId === "le-tan") {
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x0e5a6d, roughness: 0.6 });
    for (const s of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.34, 0.012), strapMat);
      strap.position.set(0.055 * s, 0.93, -0.185);
      strap.rotation.z = -0.32 * s;
      strap.rotation.x = 0.1;
      bodyGroup.add(strap);
    }
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.17, 0.016),
      new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.35 }),
    );
    card.position.set(0, 0.72, -0.205);
    card.rotation.x = 0.08;
    bodyGroup.add(card);
    const cardBand = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.045, 0.018),
      new THREE.MeshStandardMaterial({ color: 0x0e5a6d, roughness: 0.4 }),
    );
    cardBand.position.set(0, 0.775, -0.206);
    cardBand.rotation.x = 0.08;
    bodyGroup.add(cardBand);
    const cardPhoto = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.06, 0.018),
      new THREE.MeshStandardMaterial({ color: 0xfb923c, roughness: 0.5 }),
    );
    cardPhoto.position.set(-0.028, 0.715, -0.206);
    cardPhoto.rotation.x = 0.08;
    bodyGroup.add(cardPhoto);
  }
  // Neck.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.12, 10), skinMat);
  neck.position.y = 1.06;
  bodyGroup.add(neck);

  // Head group (front faces −Z, toward the desk): skin, face, hair.
  const head = new THREE.Group();
  head.position.y = 1.26;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 22, 18), skinMat);
  skull.scale.set(0.94, 1.06, 0.98);
  skull.castShadow = true;
  head.add(skull);
  // Ears.
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), skinMat);
    ear.position.set(0.185 * s, -0.01, 0);
    ear.scale.set(0.5, 1, 0.8);
    head.add(ear);
  }
  // Face: eyes, brows, nose, mouth — simple but unmistakably a face.
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1310, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.021, 8, 8), darkMat);
    eye.position.set(0.068 * s, 0.025, -0.185);
    eye.scale.set(1, 1.25, 0.5);
    head.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.012), hairMat);
    brow.position.set(0.07 * s, 0.085, -0.19);
    brow.rotation.z = -0.12 * s;
    head.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 8), skinMat);
  nose.position.set(0, -0.03, -0.2);
  nose.rotation.x = -Math.PI / 2.4;
  head.add(nose);
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 0.014, 0.01),
    new THREE.MeshStandardMaterial({ color: 0xa34a3e, roughness: 0.6 }),
  );
  mouth.position.set(0, -0.105, -0.188);
  head.add(mouth);
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xe89a7a, roughness: 0.8, transparent: true, opacity: 0.55 }),
    );
    cheek.position.set(0.115 * s, -0.055, -0.155);
    cheek.scale.set(1, 0.7, 0.4);
    head.add(cheek);
  }
  if (ap.glasses) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x191924, roughness: 0.35, metalness: 0.5 });
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.008, 6, 18), frameMat);
      lens.position.set(0.07 * s, 0.025, -0.198);
      head.add(lens);
      const temple = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.17), frameMat);
      temple.position.set(0.185 * s, 0.035, -0.11);
      head.add(temple);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.01), frameMat);
    bridge.position.set(0, 0.035, -0.198);
    head.add(bridge);
  }
  // Hair by style.
  const capGeo = new THREE.SphereGeometry(0.212, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52);
  if (ap.hairStyle === "buzz") {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.203, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), hairMat);
    cap.position.y = 0.022;
    cap.scale.set(0.96, 1.06, 1);
    head.add(cap);
  } else {
    const cap = new THREE.Mesh(capGeo, hairMat);
    cap.position.set(0, 0.028, 0.018);
    cap.scale.set(0.97, 1.05, 1.02);
    cap.castShadow = true;
    head.add(cap);
  }
  if (ap.hairStyle === "swept") {
    const sweep = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.13), hairMat);
    sweep.position.set(0.03, 0.155, -0.13);
    sweep.rotation.set(-0.35, 0, -0.18);
    head.add(sweep);
  }
  if (ap.hairStyle === "long" || ap.hairStyle === "bob") {
    const len = ap.hairStyle === "long" ? 0.52 : 0.3;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.33, len, 0.1), hairMat);
    back.position.set(0, 0.06 - len / 2, 0.155);
    back.castShadow = true;
    head.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.055, len * 0.8, 0.16), hairMat);
      side.position.set(0.175 * s, 0.03 - (len * 0.8) / 2, 0.02);
      head.add(side);
    }
  }
  if (ap.hairStyle === "ponytail") {
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.028, 0.42, 8), hairMat);
    tail.position.set(0, -0.08, 0.24);
    tail.rotation.x = 0.22;
    tail.castShadow = true;
    head.add(tail);
    const tieBand = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xd45d8f, roughness: 0.6 }),
    );
    tieBand.position.set(0, 0.13, 0.19);
    head.add(tieBand);
  }
  if (ap.hairStyle === "bun") {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), hairMat);
    bun.position.set(0, 0.23, 0.06);
    bun.castShadow = true;
    head.add(bun);
  }
  bodyGroup.add(head);

  // Arms on shoulder pivots: outfit sleeves + skin hands.
  const mkArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set((female ? 0.29 : 0.32) * side, 1.0, 0);
    // Tay bo tròn dạng ống (capsule) thay cho hộp vuông — dáng
    // người bớt "khối hộp" hẳn, cử động gõ phím trông tự nhiên.
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.35, 4, 10), outfitMat);
    mesh.position.y = -0.2;
    mesh.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skinMat);
    hand.position.y = -0.46;
    hand.scale.set(0.85, 1.1, 0.9);
    pivot.add(mesh, hand);
    bodyGroup.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // Legs: trousers for men / shirt-and-blazer women, skin + shoes under a dress.
  const legMat =
    ap.outfitStyle === "dress"
      ? skinMat
      : new THREE.MeshStandardMaterial({ color: female ? 0x3a3358 : 0x27223f, roughness: 0.9 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x17121f, roughness: 0.5 });
  const mkLeg = (side: number) => {
    const leg = new THREE.Group();
    leg.position.set(0.1 * side, 0.52, 0);
    // Chân bo tròn dạng ống (capsule) thay cho hộp vuông.
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.37, 4, 10), legMat);
    mesh.position.y = -0.25;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.22), shoeMat);
    shoe.position.set(0, -0.5, -0.03);
    leg.add(mesh, shoe);
    return leg;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);
  group.add(bodyGroup, legL, legR);
  return { group, bodyGroup, legL, legR, head, armL, armR };
}

interface SteamPuff {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  baseY: number;
  phase: number;
}

// Procedural surface textures, drawn once on canvases: the reference
// image reads rich because every surface has visible grain — wood with
// streaks, carpet with a woven speckle and border diamonds, floors with
// warm plank seams. Flat colours alone read flat and "chán" on screen.
function makeSurfaceTexture(
  draw: (g: CanvasRenderingContext2D, s: number) => void,
  repeat = 1,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  if (g) draw(g, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat !== 1) tex.repeat.set(repeat, repeat);
  return tex;
}

let _woodTex: THREE.CanvasTexture | null = null;
function woodTexture(): THREE.CanvasTexture {
  if (_woodTex) return _woodTex;
  _woodTex = makeSurfaceTexture((g, s) => {
    g.fillStyle = "#8a6844";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 46; i++) {
      const y = Math.random() * s;
      g.strokeStyle = `rgba(${Math.random() > 0.5 ? "62,40,20" : "166,128,84"},${0.12 + Math.random() * 0.22})`;
      g.lineWidth = 1 + Math.random() * 3.2;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= s; x += 32) {
        g.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.4);
      }
      g.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      g.strokeStyle = "rgba(62,40,20,0.35)";
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(x, y, 3 + Math.random() * 5, 7 + Math.random() * 9, 0.3, 0, Math.PI * 2);
      g.stroke();
    }
  });
  return _woodTex;
}

let _carpetTex: THREE.CanvasTexture | null = null;
function carpetTexture(): THREE.CanvasTexture {
  if (_carpetTex) return _carpetTex;
  _carpetTex = makeSurfaceTexture((g, s) => {
    g.fillStyle = "#7e2432";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 5200; i++) {
      g.fillStyle = `rgba(${Math.random() > 0.5 ? "168,64,74" : "84,16,28"},${0.16 + Math.random() * 0.2})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    g.strokeStyle = "rgba(232,200,96,0.5)";
    g.lineWidth = 2;
    for (let d = -s; d < s * 2; d += 64) {
      g.beginPath();
      g.moveTo(d, 0);
      g.lineTo(d + s, s);
      g.stroke();
      g.beginPath();
      g.moveTo(d + s, 0);
      g.lineTo(d, s);
      g.stroke();
    }
  }, 3);
  return _carpetTex;
}

// Matte architectural concrete: fine micro-noise + a few soft stains,
// used as bump/roughness detail so large stone and wall surfaces stop
// reading as flat plastic. Grayscale on purpose — it only modulates
// light response, never the surface colour.
let _concreteTex: THREE.CanvasTexture | null = null;
function concreteTexture(): THREE.CanvasTexture {
  if (_concreteTex) return _concreteTex;
  _concreteTex = makeSurfaceTexture((g, s) => {
    g.fillStyle = "#8c8c8c";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const v = 108 + Math.floor(Math.random() * 52);
      g.fillStyle = `rgba(${v},${v},${v},${0.14 + Math.random() * 0.2})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 18 + Math.random() * 42;
      const grad = g.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, "rgba(70,70,70,0.16)");
      grad.addColorStop(1, "rgba(70,70,70,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }, 2);
  return _concreteTex;
}

// Oak plank flooring: long boards with per-plank tone shifts, grain
// streaks running along the board, and dark seams between boards.
let _oakTex: THREE.CanvasTexture | null = null;
function oakFloorTexture(): THREE.CanvasTexture {
  if (_oakTex) return _oakTex;
  _oakTex = makeSurfaceTexture((g, s) => {
    const rows = 4;
    const rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const tone = 0.86 + Math.random() * 0.26;
      const base: [number, number, number] = [
        Math.round(196 * tone),
        Math.round(164 * tone),
        Math.round(118 * tone),
      ];
      g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      g.fillRect(0, r * rh, s, rh);
      for (let i = 0; i < 30; i++) {
        const y = r * rh + Math.random() * rh;
        g.strokeStyle = `rgba(110,76,40,${0.08 + Math.random() * 0.16})`;
        g.lineWidth = 0.8 + Math.random() * 1.6;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= s; x += 32) {
          g.lineTo(x, y + Math.sin(x * 0.04 + i * 1.7) * 1.6);
        }
        g.stroke();
      }
      // Board end joints, staggered per row.
      const jx = ((r * 97) % s) + 30;
      g.fillStyle = "rgba(74,50,26,0.85)";
      g.fillRect(jx, r * rh, 2.5, rh);
      g.fillRect(0, r * rh, s, 2.5);
    }
  }, 2);
  return _oakTex;
}

// Framed abstract art for empty room walls: a soft two-tone gradient
// field with a few calm geometric strokes, in the room's own hue.
const _artTexCache = new Map<number, THREE.CanvasTexture>();
function artTexture(seed: number): THREE.CanvasTexture {
  const cached = _artTexCache.get(seed);
  if (cached) return cached;
  const hues = [262, 222, 18, 160, 200, 336, 96, 24];
  const hue = hues[seed % hues.length] ?? 262;
  const tex = makeSurfaceTexture((g, s) => {
    const grad = g.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, `hsl(${hue}, 42%, 30%)`);
    grad.addColorStop(1, `hsl(${(hue + 40) % 360}, 48%, 16%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = `hsla(${hue}, 70%, 78%, 0.75)`;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(s * (0.3 + (seed % 3) * 0.18), s * 0.42, s * 0.2, 0.4, Math.PI * 1.5);
    g.stroke();
    g.fillStyle = `hsla(${(hue + 60) % 360}, 65%, 62%, 0.55)`;
    g.beginPath();
    g.arc(s * 0.68, s * 0.62, s * 0.13, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,244,214,0.5)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(s * 0.12, s * 0.8);
    g.lineTo(s * 0.88, s * 0.74);
    g.stroke();
  });
  _artTexCache.set(seed, tex);
  return tex;
}

// One full workstation: desk, monitor, keyboard, chair, nameplate, desk lamp.
function buildWorkstation(
  person: { initials: string; color: number; name?: string; gender?: "Nam" | "Nữ" },
  lampKind: LampKind,
  big = false,
  opts?: {
    coffee?: boolean;
    onScreen?: (g: CanvasRenderingContext2D | null, tex: THREE.CanvasTexture) => void;
    steamSink?: SteamPuff[];
  },
): THREE.Group {
  const unit = new THREE.Group();
  const topMat = new THREE.MeshStandardMaterial({ color: big ? 0xa87e52 : 0xbb9264, map: woodTexture(), roughness: 0.55 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x5d4630, map: woodTexture(), roughness: 0.7 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(big ? 2.6 : 1.9, 0.1, 0.95), topMat);
  top.position.y = 0.74;
  top.castShadow = true;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.85), legMat);
  legL.position.set(big ? -1.18 : -0.82, 0.37, 0);
  const legR = legL.clone();
  legR.position.x = big ? 1.18 : 0.82;
  const monitor = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.55, 0.05),
    new THREE.MeshStandardMaterial({
      color: 0x14102a,
      emissive: person.color,
      emissiveIntensity: 0.65,
      roughness: 0.35,
    }),
  );
  monitor.position.set(-0.25, 1.12, -0.24);
  // Monitor stand: brushed-metal neck + foot, so the screen sits on
  // the desk like real hardware instead of floating.
  const standMat = new THREE.MeshStandardMaterial({
    color: 0x8d8fa3,
    roughness: 0.32,
    metalness: 0.85,
    envMapIntensity: 1.1,
  });
  const standNeck = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.05), standMat);
  standNeck.position.set(-0.25, 0.94, -0.27);
  const standFoot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.24), standMat);
  standFoot.position.set(-0.25, 0.8, -0.22);
  // Live screen face on the monitor: the owner's current task, from real data.
  const sCanvas = document.createElement("canvas");
  sCanvas.width = 256;
  sCanvas.height = 160;
  const sCtx = sCanvas.getContext("2d");
  const sTex = new THREE.CanvasTexture(sCanvas);
  sTex.colorSpace = THREE.SRGBColorSpace;
  drawDeskScreen(sCtx, sTex, "");
  const screenPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.48),
    // Hệ số 0.82: mặt màn hình bớt chói (MeshBasicMaterial không chịu
    // đèn nên mặc định sáng trắng gắt hơn mọi vật liệu khác).
    new THREE.MeshBasicMaterial({ map: sTex, color: 0xd1d1d1 }),
  );
  screenPlane.position.set(-0.25, 1.12, -0.208);
  opts?.onScreen?.(sCtx, sTex);
  const keyboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.04, 0.21),
    new THREE.MeshStandardMaterial({ color: 0x241b45, roughness: 0.6 }),
  );
  keyboard.position.set(-0.25, 0.81, 0.14);
  // Keyboard backlight strip in the owner's colour + a mouse beside it.
  const kbGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.012, 0.025),
    new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: person.color,
      emissiveIntensity: 0.85,
      roughness: 0.4,
      toneMapped: false,
    }),
  );
  kbGlow.position.set(-0.25, 0.832, 0.045);
  const mouse = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x1d1830, roughness: 0.35, metalness: 0.3 }),
  );
  mouse.scale.set(1, 0.55, 1.5);
  mouse.position.set(0.22, 0.815, 0.14);
  // Chair: seat, backrest, post.
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x2e2456, roughness: 0.9 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.52), chairMat);
  seat.position.set(0, 0.48, 0.62);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.09), chairMat);
  back.position.set(0, 0.86, 0.86);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.44, 8), chairMat);
  post.position.set(0, 0.24, 0.62);
  // Nameplate on the front edge of the desk: full name + gender, matching the
  // person sitting there (falls back to initials for unnamed seats).
  const plate = makeNameplate(
    person.name
      ? `${person.name}${person.gender ? ` · ${person.gender}` : ""}`
      : person.initials,
  );
  // Bảng tên dạt về GÓC PHẢI mép bàn, chừa trống toàn bộ khu vực
  // tay gõ phím / chuột / giấy tờ ở giữa bàn.
  plate.position.set(0.58, 0.85, 0.44);
  // Desk lamp with the live status colour.
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    emissive: LAMP_COLORS[lampKind],
    emissiveIntensity: 0.85,
    roughness: 0.35,
  });
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.05, 0.42, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a3a4a, roughness: 0.5, metalness: 0.4 }),
  );
  stem.position.set(0.78, 1.0, -0.28);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), lampMat);
  bulb.position.set(0.78, 1.24, -0.28);
  // Desk lamp shade: a small metal cone over the status bulb.
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.14, 0.13, 12, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x2c2c3c,
      roughness: 0.35,
      metalness: 0.7,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide,
    }),
  );
  shade.position.set(0.78, 1.3, -0.28);
  // Desk clutter that makes a workstation feel lived in: a small
  // stack of documents/books on the left, a pen cup by the lamp.
  const bookA = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.035, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x7a4a8a, roughness: 0.7 }),
  );
  bookA.position.set(-0.68, 0.81, 0.18);
  bookA.rotation.y = 0.22;
  const bookB = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.03, 0.19),
    new THREE.MeshStandardMaterial({ color: 0xf2f0fa, roughness: 0.8 }),
  );
  bookB.position.set(-0.68, 0.845, 0.18);
  bookB.rotation.y = 0.05;
  const penCup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.04, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x3a6ea8, roughness: 0.45, metalness: 0.3 }),
  );
  penCup.position.set(0.5, 0.84, -0.3);
  unit.add(top, legL, legR, monitor, standNeck, standFoot, screenPlane, keyboard, kbGlow, mouse, seat, back, post, plate, stem, bulb, shade, bookA, bookB, penCup);
  if (opts?.coffee) {
    // A coffee cup with steam curling up while its owner works.
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.045, 0.09, 10),
      new THREE.MeshStandardMaterial({ color: 0xf2f0fa, roughness: 0.4 }),
    );
    cup.position.set(0.55, 0.84, 0.28);
    unit.add(cup);
    if (opts.steamSink) {
      for (let i = 0; i < 3; i++) {
        const mat = new THREE.SpriteMaterial({
          map: getSteamTexture(),
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const sp = new THREE.Sprite(mat);
        sp.position.set(0.55, 0.95, 0.28);
        sp.scale.setScalar(0.16);
        unit.add(sp);
        opts.steamSink.push({ sprite: sp, mat, baseY: 0.95, phase: i / 3 });
      }
    }
  }
  return unit;
}

// Tall walnut document cabinet with brass handles — executive furniture,
// used in the Chủ tịch room instead of the standard open shelf.
function buildWoodCabinet(): THREE.Group {
  const cab = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xa87e52, map: woodTexture(), roughness: 0.5 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x7d5a36, map: woodTexture(), roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.2, 0.45), wood);
  body.position.y = 1.1;
  body.castShadow = true;
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.95, 0.04), woodDark);
  doorL.position.set(-0.46, 1.12, 0.24);
  const doorR = doorL.clone();
  doorR.position.x = 0.46;
  const brass = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.85 });
  const handleL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), brass);
  handleL.position.set(-0.08, 1.12, 0.28);
  const handleR = handleL.clone();
  handleR.position.x = 0.08;
  const crown = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.09, 0.52), brass);
  crown.position.y = 2.24;
  cab.add(body, doorL, doorR, handleL, handleR, crown);
  return cab;
}

function buildShelf(): THREE.Group {
  const shelf = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4c3a75, roughness: 0.85 });
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x7a6aa8, roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.4), mat);
    board.position.y = 0.45 + i * 0.55;
    shelf.add(board);
    const files = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.34, 0.3), boxMat);
    files.position.y = 0.45 + i * 0.55 + 0.21;
    shelf.add(files);
  }
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.7, 0.4), mat);
  sideL.position.set(-0.85, 0.85, 0);
  const sideR = sideL.clone();
  sideR.position.x = 0.85;
  shelf.add(sideL, sideR);
  return shelf;
}

function buildSofa(color: number): THREE.Group {
  const sofa = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.42, 0.8), mat);
  base.position.y = 0.32;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 0.2), mat);
  back.position.set(0, 0.72, -0.32);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.8), mat);
  armL.position.set(-0.88, 0.62, 0);
  const armR = armL.clone();
  armR.position.x = 0.88;
  sofa.add(base, back, armL, armR);
  return sofa;
}

function buildPlant(): THREE.Group {
  const plant = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.27, 0.5, 12),
    new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.85 }),
  );
  pot.position.y = 0.25;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.06, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x5d4630, roughness: 0.9 }),
  );
  trunk.position.y = 0.68;
  plant.add(pot, trunk);
  // Lush layered canopy: three leaf masses in varied greens instead of
  // one flat ball, so the greenery reads fresh and full like the
  // reference image's plants.
  const leafCols = [0x2f9e63, 0x37b24d, 0x27875a, 0x43c465, 0x1f7a4d];
  const blobs: [number, number, number, number][] = [
    [0, 1.15, 0, 0.6],
    [-0.3, 0.92, 0.14, 0.42],
    [0.3, 0.95, -0.12, 0.45],
    [-0.16, 1.34, 0.08, 0.32],
    [0.2, 1.3, 0.14, 0.28],
  ];
  blobs.forEach(([bx, by, bz, br], i) => {
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(br, 10, 8),
      new THREE.MeshStandardMaterial({ color: leafCols[i % leafCols.length], roughness: 0.85 }),
    );
    leaves.position.set(bx, by, bz);
    leaves.castShadow = true;
    plant.add(leaves);
  });
  return plant;
}

export function Office3D({
  rooms,
  staffLamp,
  roomLamp,
  presence,
  focusRequest,
  onSelectRoom,
  onSelectStaff,
  hour,
  qcTitle,
  staffScreen,
  staffBubble,
  walkTarget,
  meetingBoard,
  showNames,
  onToggleNames,
}: Office3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const lampMatsRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());
  const roomLampMatsRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());
  // Nhãn phòng kèm chấm trạng thái: giữ texture + tên để vẽ lại
  // chấm mỗi khi đèn phòng đổi (đỏ đang chạy / xanh đã xong / xám chờ).
  const roomLabelRef = useRef<Map<string, { tex: THREE.CanvasTexture; name: string }>>(new Map());
  const ceilMatsRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());
  const ceilLightsRef = useRef<Map<string, THREE.PointLight>>(new Map());
  const rigsRef = useRef<Map<string, AvatarRig>>(new Map());
  const meetingSeatsRef = useRef<{ pos: THREE.Vector3; rotY: number }[]>([]);
  const checkSpotsRef = useRef<Map<string, THREE.Vector3>>(new Map());
  const roomFocusRef = useRef<
    Map<string, { center: THREE.Vector3; dist: number; desk?: THREE.Vector3; deskRotY?: number }>
  >(new Map());
  // Điểm ngồi gần bàn của TỪNG người (vị trí ghế + hướng ngồi, tọa độ
  // của nhóm world): bấm vào nhân viên / dòng nhật ký là camera bay
  // vào trong phòng, hạ xuống sát bàn của đúng người đó.
  const staffDeskRef = useRef<Map<string, { pos: THREE.Vector3; rotY: number }>>(new Map());
  // Xe chạy ngoài phố trước kính + vật liệu phát sáng theo giờ thực
  // (đèn đường / đèn pha xe dùng chung một vật liệu, cửa sổ nhà đối
  // diện sáng dần khi trời tối).
  const carsRef = useRef<{ g: THREE.Group; speed: number; dir: number }[]>([]);
  const streetGlowMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const facadeMatsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const hemiRef = useRef<THREE.HemisphereLight | null>(null);
  const groundMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const deskScreensRef = useRef<
    Map<string, { g: CanvasRenderingContext2D | null; tex: THREE.CanvasTexture }>
  >(new Map());
  const bubbleRef = useRef<
    Map<
      string,
      {
        g: CanvasRenderingContext2D | null;
        tex: THREE.CanvasTexture;
        sprite: THREE.Sprite;
        last: string;
      }
    >
  >(new Map());
  const meetingBoardRef = useRef<{
    g: CanvasRenderingContext2D | null;
    tex: THREE.CanvasTexture;
  } | null>(null);
  // Bảng tên trên đầu: sprite + cấp bậc + độ nâng so le hiện tại
  // của từng người; vòng lặp render quyết ẩn/hiện theo zoom,
  // hover, bấm chọn và công tắc Bật/Tắt.
  const headTagsRef = useRef<
    Map<string, { sprite: THREE.Sprite; rank: TagRank; liftGoal: number }>
  >(new Map());
  const hoverIdRef = useRef<string | null>(null);
  const pickedIdRef = useRef<string | null>(null);
  const tagsOnRef = useRef(true);
  const clockHandsRef = useRef<{ h: THREE.Group; m: THREE.Group; s: THREE.Group } | null>(null);
  const plantsRef = useRef<THREE.Mesh[]>([]);
  const steamRef = useRef<SteamPuff[]>([]);
  const printerLedRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const selectRef = useRef(onSelectRoom);
  selectRef.current = onSelectRoom;
  const selectStaffRef = useRef(onSelectStaff);
  selectStaffRef.current = onSelectStaff;
  const staffLampRef = useRef(staffLamp);
  staffLampRef.current = staffLamp;
  const roomLampRef = useRef(roomLamp);
  roomLampRef.current = roomLamp;
  const presenceRef = useRef(presence);
  presenceRef.current = presence;
  const walkTargetRef = useRef(walkTarget);
  walkTargetRef.current = walkTarget;
  const sceneRef = useRef<THREE.Scene | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const skyMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const fpsRef = useRef<HTMLSpanElement | null>(null);
  const screensRef = useRef<
    { g: CanvasRenderingContext2D | null; tex: THREE.CanvasTexture | null; heading: string }[]
  >([]);
  const camRef = useRef({
    theta: 0.7,
    thetaGoal: 0.7,
    elev: 0.78,
    elevGoal: 0.78,
    dist: 54,
    distGoal: 54,
    target: new THREE.Vector3(0, 0.6 - FLOOR_DROP, -2.5),
    targetGoal: new THREE.Vector3(0, 0.6 - FLOOR_DROP, -2.5),
  });
  const [error, setError] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  // Control guide: OFF by default (Chủ tịch đính chính: the
  // guide line sitting on the main screen is an eyesore) —
  // only the small "?" button shows; the guide opens only
  // when the Chủ tịch taps it.
  const [showGuide, setShowGuide] = useState(false);
  // Công tắc Bật/Tắt bảng tên nhân viên (Chủ tịch chốt): tắt là
  // ẩn hẳn mọi bảng tên trên đầu, sàn sạch hoàn toàn. Thanh chức
  // năng trên cùng có nút Hiện/Ẩn tên riêng — khi App truyền
  // showNames xuống thì nút đó điều khiển, nút trên canvas đi
  // qua onToggleNames để hai nơi không lệch nhau.
  const [showTagsInternal, setShowTagsInternal] = useState(true);
  const showTags = showNames ?? showTagsInternal;
  const toggleTags = onToggleNames ?? (() => setShowTagsInternal((v) => !v));
  tagsOnRef.current = showTags;
  const focusRef = useRef<(roomId: string | null, staffId?: string | null) => void>(() => {});

  useEffect(() => {
    if (focusRequest) {
      // roomId rỗng = nút "Toàn cảnh": quay về góc tổng giám sát.
      setFocusedId(focusRequest.roomId ? focusRequest.roomId : null);
      focusRef.current(focusRequest.roomId || null, focusRequest.staffId ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (e) {
      setError(`Không khởi tạo được WebGL: ${String(e)}`);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x241b4d);
    scene.fog = new THREE.Fog(0x241b4d, 85, 215);
    sceneRef.current = scene;

    // Adaptive quality: a software GL rasterizer (SwiftShader /
    // llvmpipe — headless test browsers, VMs without a GPU) renders
    // this scene orders of magnitude slower than a real GPU, and the
    // HDR post chain would block its main thread. On software GL the
    // office falls back to the plain renderer, smaller shadows and
    // a lower pixel ratio; on any real GPU everything below runs in
    // full. The scene, layout and interactions are identical either
    // way — only the polish layer adapts.
    let softwareGL = false;
    try {
      const gl = renderer.getContext();
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const rendererName = dbg
        ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
        : "";
      softwareGL = /swiftshader|llvmpipe|softpipe|software/i.test(rendererName);
    } catch {
      softwareGL = false;
    }
    if (softwareGL) renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));

    // Environment reflections generated IN CODE (RoomEnvironment via
    // PMREM — no external HDRI/image is ever loaded): glass, brushed
    // metal and polished surfaces pick up real surroundings instead
    // of reading flat. Intensity kept moderate (0.5) so the office's
    // own warm lighting stays in charge.
    if (!softwareGL) {
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = envTex;
        scene.environmentIntensity = 0.5;
        pmrem.dispose();
      } catch {
        // Reflections are polish only — the office renders fine without.
      }
    }

    // Dusk/night sky dome outside the glass: a big gradient sphere
    // (deep violet zenith → warm amber horizon → dark ground), its
    // colours driven by the real-clock presets in the hour effect.
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x2c2154) },
        horizonColor: { value: new THREE.Color(0xd97b4a) },
        bottomColor: { value: new THREE.Color(0x0d0a1c) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y;
          vec3 col = h > 0.0
            ? mix(horizonColor, topColor, pow(h, 0.55))
            : mix(horizonColor, bottomColor, pow(-h, 0.6));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    skyMatRef.current = skyMat;
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(235, 24, 16), skyMat);
    scene.add(skyDome);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 260);
    cameraRef.current = camera;

    // 3-point architectural lighting, warm and soft: a key sun with
    // soft shadows, a warm fill from the opposite side, a cool rim
    // from behind — plus a hemisphere bounce so shadowed corners
    // stay rich instead of going pitch black.
    const ambient = new THREE.AmbientLight(0xffdfb0, 0.8);
    scene.add(ambient);
    ambientRef.current = ambient;
    const hemi = new THREE.HemisphereLight(0xffe6c4, 0x3a2c5e, 0.5);
    scene.add(hemi);
    hemiRef.current = hemi;
    const key = new THREE.DirectionalLight(0xfff2df, 1.6);
    keyLightRef.current = key;
    key.position.set(14, 24, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(softwareGL ? 1024 : 2048, softwareGL ? 1024 : 2048);
    key.shadow.radius = 5;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    key.shadow.camera.left = -34;
    key.shadow.camera.right = 34;
    key.shadow.camera.top = 34;
    key.shadow.camera.bottom = -34;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffc98a, 0.4);
    fill.position.set(-14, 12, -12);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 0.5);
    rim.position.set(-10, 14, -20);
    scene.add(rim);

    // Shared LED strip material: warm emissive, tone-mapped off —
    // Chủ tịch báo CHÓI nên hạ hẳn xuống 1.25 (chỉ còn sáng ấm rõ,
    // vừa đủ qua ngưỡng bloom nhẹ, không lóa mắt, không cháy trắng):
    // ceiling coves, stair nosings and sign halos all use it.
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x201408,
      emissive: 0xffd9a0,
      emissiveIntensity: 1.25,
      roughness: 0.4,
      toneMapped: false,
    });

    // Light post-processing: RenderPass + a subtle UnrealBloom (only
    // HDR-bright emissives pass the 1.0 threshold: LED strips, lamps,
    // screens) + OutputPass applying the ACES tone map. Any failure
    // falls back to the plain renderer — the office must never blank.
    let composer: EffectComposer | null = null;
    if (!softwareGL) {
      try {
        const rt = new THREE.WebGLRenderTarget(1, 1, {
          type: THREE.HalfFloatType,
          samples: 4,
        });
        composer = new EffectComposer(renderer, rt);
        composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        composer.addPass(new RenderPass(scene, camera));
        const bloom = new UnrealBloomPass(new THREE.Vector2(320, 200), 0.3, 0.45, 1.15);
        composer.addPass(bloom);
        composer.addPass(new OutputPass());
      } catch {
        composer = null;
      }
    }

    const world = new THREE.Group();
    world.position.y = -FLOOR_DROP; // hạ cốt nền văn phòng xuống 3 bậc
    scene.add(world);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(56, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1a1238,
        roughness: 1,
        bumpMap: concreteTexture(),
        bumpScale: 0.25,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    groundMatRef.current = ground.material as THREE.MeshStandardMaterial;
    // Nền đất ngoài trời: thấp hơn mặt sàn tầng 1 (cao độ 0 nội
    // bộ) đúng 3 bậc = FLOOR_DROP — bước lên 3 bậc ngắn trước
    // Cửa chính là vào tới sàn văn phòng.
    ground.position.y = -FLOOR_DROP;
    ground.receiveShadow = true;
    world.add(ground);

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(62, 0.6, 53),
      new THREE.MeshStandardMaterial({
        color: 0x372a6b,
        roughness: 0.9,
        bumpMap: concreteTexture(),
        bumpScale: 0.15,
        roughnessMap: concreteTexture(),
      }),
    );
    slab.position.set(0, -0.3, -3.5);
    slab.receiveShadow = true;
    world.add(slab);

    // TƯỜNG BAO quanh toàn bộ công ty: một vòng tường kính liên tục ôm
    // sát mép sàn ở cả 4 phía (sau / trái / phải / trước), có dải nẹp
    // trên nóc tường — nhìn từ bất kỳ góc nào công ty cũng là một khối
    // khép kín có tường bao, không còn hở ra khoảng trống bên ngoài.
    // Phía trước chừa đúng một khoảng Cửa chính ở giữa (x -2.6..2.6,
    // thẳng với biển MUSE COMPANY và thảm đỏ sảnh), hai trụ cổng hai
    // bên; các phía còn lại kín suốt, không khoảng hở.
    {
      const periMat = new THREE.MeshStandardMaterial({
        color: 0x8fb0e8,
        roughness: 0.06,
        metalness: 0.2,
        transparent: true,
        opacity: 0.28,
        envMapIntensity: 1.15,
      });
      const periEdgeMat = new THREE.MeshStandardMaterial({
        color: 0x8d84b8,
        roughness: 0.34,
        metalness: 0.85,
        envMapIntensity: 1.1,
      });
      const periH = 3.1;
      const PX = 30.6; // |x| of the left / right perimeter walls
      const PZ_BACK = -29.4;
      const PZ_FRONT = 22.6;
      const periWall = (w: number, d: number, x: number, z: number) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, periH, d), periMat);
        wall.position.set(x, periH / 2, z);
        wall.castShadow = true;
        world.add(wall);
        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(w === 0.18 ? 0.26 : w, 0.1, d === 0.18 ? 0.26 : d),
          periEdgeMat,
        );
        trim.position.set(x, periH + 0.05, z);
        world.add(trim);
        const sill = new THREE.Mesh(
          new THREE.BoxGeometry(w === 0.18 ? 0.26 : w, 0.16, d === 0.18 ? 0.26 : d),
          periEdgeMat,
        );
        sill.position.set(x, 0.08, z);
        world.add(sill);
      };
      periWall(PX * 2 + 0.18, 0.18, 0, PZ_BACK); // back wall, full width
      periWall(0.18, PZ_FRONT - PZ_BACK, -PX, (PZ_BACK + PZ_FRONT) / 2); // left wall
      periWall(0.18, PZ_FRONT - PZ_BACK, PX, (PZ_BACK + PZ_FRONT) / 2); // right wall
      const gateHalf = 2.6;
      const frontSegW = PX - gateHalf;
      periWall(frontSegW, 0.18, -(gateHalf + frontSegW / 2), PZ_FRONT); // front-left of the gate
      periWall(frontSegW, 0.18, gateHalf + frontSegW / 2, PZ_FRONT); // front-right of the gate
      // Gate lintel above the main entrance + two gate posts.
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(gateHalf * 2 + 0.18, 0.62, 0.18), periMat);
      lintel.position.set(0, periH - 0.31, PZ_FRONT);
      world.add(lintel);
      const lintelTrim = new THREE.Mesh(new THREE.BoxGeometry(gateHalf * 2 + 0.26, 0.1, 0.26), periEdgeMat);
      lintelTrim.position.set(0, periH + 0.05, PZ_FRONT);
      world.add(lintelTrim);
      for (const gx of [-gateHalf, gateHalf]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, periH, 0.3), periEdgeMat);
        post.position.set(gx, periH / 2, PZ_FRONT);
        post.castShadow = true;
        world.add(post);
      }
    }

    // PHỐ NGOÀI KÍNH (tạo hoàn toàn bằng code, không tải ảnh ngoài):
    // qua tường kính mặt trước (z=22.6) nhìn ra vỉa hè → dải cỏ + cây
    // xanh → đường nhựa 2 làn có vạch kẻ + vạch sang đường ngay trước
    // Cửa chính → xe chạy thật hai chiều → dải cỏ + hàng cây bên kia
    // đường → dãy nhà đối diện có cửa sổ sáng đèn khi trời tối. Ban
    // ngày nắng sáng rõ nhìn thấu ra phố; tối đèn đường + đèn pha +
    // cửa sổ tự sáng theo giờ thực (hiệu ứng giờ ở cuối file).
    {
      const street = new THREE.Group();
      const baseY = -FLOOR_DROP; // mặt đất ngoài trời (thấp hơn sàn 3 bậc)
      const concreteMat = new THREE.MeshStandardMaterial({
        color: 0x9aa0a8,
        roughness: 0.95,
        bumpMap: concreteTexture(),
        bumpScale: 0.12,
      });
      const grassMat = new THREE.MeshStandardMaterial({ color: 0x3d7a3a, roughness: 1 });
      const grassMat2 = new THREE.MeshStandardMaterial({ color: 0x35703a, roughness: 1 });
      const asphaltMat = new THREE.MeshStandardMaterial({
        color: 0x33363c,
        roughness: 0.98,
        bumpMap: concreteTexture(),
        bumpScale: 0.08,
      });
      const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8e6da, roughness: 0.7 });
      const flat = (
        w: number,
        d: number,
        x: number,
        z: number,
        mat: THREE.Material,
        h = 0.05,
      ) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, baseY + h / 2, z);
        m.receiveShadow = true;
        street.add(m);
        return m;
      };
      flat(96, 3.6, 0, 24.8, concreteMat, 0.1); // vỉa hè sát kính
      flat(96, 2.7, 0, 27.95, grassMat); // dải cỏ + cây phía công ty
      flat(96, 9.4, 0, 34, asphaltMat, 0.04); // lòng đường 2 làn
      flat(96, 4.3, 0, 40.85, grassMat2); // dải cỏ bên kia đường
      flat(96, 0.22, 0, 29.5, lineMat, 0.055); // vạch mép đường gần
      flat(96, 0.22, 0, 38.5, lineMat, 0.055); // vạch mép đường xa
      for (let x = -46; x <= 46; x += 4) {
        flat(1.7, 0.2, x, 34, lineMat, 0.055); // vạch tim đường đứt nét
      }
      for (let x = -2.5; x <= 2.5; x += 1.0) {
        flat(0.5, 8.6, x, 34, lineMat, 0.055); // vạch sang đường trước cổng
      }
      // Cây xanh đường phố: thân cao + 3 cụm lá lệch nhau, hai hàng.
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4630, roughness: 0.95 });
      const leafMats = [0x2f8f4e, 0x37a657, 0x2a7d46].map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }),
      );
      const streetTree = (x: number, z: number, s: number) => {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.9, 8), trunkMat);
        trunk.position.y = 0.95;
        trunk.castShadow = true;
        tree.add(trunk);
        const blobs: [number, number, number, number][] = [
          [0, 2.5, 0, 1.05],
          [-0.55, 2.1, 0.2, 0.7],
          [0.55, 2.2, -0.15, 0.75],
          [0.1, 2.95, 0.1, 0.6],
        ];
        blobs.forEach(([bx, by, bz, br], i) => {
          const leaf = new THREE.Mesh(
            new THREE.SphereGeometry(br, 10, 8),
            leafMats[i % leafMats.length],
          );
          leaf.position.set(bx, by, bz);
          leaf.castShadow = true;
          tree.add(leaf);
          plantsRef.current.push(leaf);
        });
        tree.scale.setScalar(s);
        tree.position.set(x, baseY + 0.05, z);
        street.add(tree);
      };
      for (let x = -40; x <= 40; x += 10) streetTree(x + 2, 27.9, 1.05);
      for (let x = -39; x <= 39; x += 13) streetTree(x, 40.6, 1.25);
      // Đèn đường: cột + tay vươn + đầu đèn phát sáng về đêm (vật liệu
      // dùng chung với đèn pha xe — hiệu ứng giờ chỉnh một chỗ).
      const glowMat = new THREE.MeshStandardMaterial({
        color: 0x2a2118,
        emissive: 0xffd9a0,
        emissiveIntensity: 0.25,
        roughness: 0.4,
        toneMapped: false,
      });
      streetGlowMatRef.current = glowMat;
      const poleMat = new THREE.MeshStandardMaterial({
        color: 0x3c4148,
        roughness: 0.35,
        metalness: 0.85,
      });
      const streetLamp = (x: number, z: number, flip: boolean) => {
        const lamp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 8), poleMat);
        pole.position.y = 1.8;
        pole.castShadow = true;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.1), poleMat);
        arm.position.set(0, 3.55, flip ? -0.5 : 0.5);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.5), glowMat);
        head.position.set(0, 3.5, flip ? -1.0 : 1.0);
        lamp.add(pole, arm, head);
        lamp.position.set(x, baseY + 0.05, z);
        street.add(lamp);
      };
      for (let x = -36; x <= 36; x += 12) streetLamp(x, 26.4, false);
      for (let x = -30; x <= 30; x += 12) streetLamp(x, 38.2, true);
      // Nhà đối diện: mặt tiền vẽ bằng Canvas (cửa sổ sáng/tối lẫn
      // nhau) + bản đồ phát sáng riêng chỉ chứa cửa sổ sáng — trời tối
      // là cả dãy nhà lên đèn vàng ấm.
      const makeFacade = (base: string) => {
        const c = document.createElement("canvas");
        c.width = 256;
        c.height = 256;
        const g = c.getContext("2d");
        const e = document.createElement("canvas");
        e.width = 256;
        e.height = 256;
        const ge = e.getContext("2d");
        if (g && ge) {
          g.fillStyle = base;
          g.fillRect(0, 0, 256, 256);
          ge.fillStyle = "#000000";
          ge.fillRect(0, 0, 256, 256);
          const cols = 7;
          const rows = 9;
          const cw = 256 / cols;
          const rh = 256 / rows;
          for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
              const lit = ((i * 31 + j * 17) % 10) < 4;
              const wx = i * cw + cw * 0.24;
              const wy = j * rh + rh * 0.22;
              const ww = cw * 0.52;
              const wh = rh * 0.5;
              g.fillStyle = lit ? "#ffd9a0" : "#26314a";
              g.fillRect(wx, wy, ww, wh);
              if (lit) {
                ge.fillStyle = "#ffca7a";
                ge.fillRect(wx, wy, ww, wh);
              }
            }
          }
        }
        const map = new THREE.CanvasTexture(c);
        map.colorSpace = THREE.SRGBColorSpace;
        const emissiveMap = new THREE.CanvasTexture(e);
        return { map, emissiveMap };
      };
      const facadeCols = ["#7d7468", "#6d7c8c", "#8a7a68", "#75828f", "#83755f"];
      const buildingSpecs: [number, number, number][] = [
        [-26, 11, 9],
        [-13, 12, 13],
        [0, 13, 8],
        [13, 12, 12],
        [26, 11, 10],
      ];
      buildingSpecs.forEach(([bx, bw, bh], i) => {
        const base = facadeCols[i % facadeCols.length] ?? "#7d7468";
        const { map, emissiveMap } = makeFacade(base);
        const faceMat = new THREE.MeshStandardMaterial({
          map,
          emissiveMap,
          emissive: 0xffb46b,
          emissiveIntensity: 0,
          roughness: 0.92,
        });
        facadeMatsRef.current.push(faceMat);
        const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(base), roughness: 0.95 });
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(bw, bh, 5),
          [sideMat, sideMat, sideMat, sideMat, faceMat, faceMat],
        );
        b.position.set(bx, baseY + bh / 2, 45);
        street.add(b);
      });
      // Xe chạy thật hai chiều: thân + cabin kính + 4 bánh + đèn pha
      // (sáng về đêm nhờ vật liệu phát sáng dùng chung với đèn đường).
      const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
      const carGlassMat = new THREE.MeshStandardMaterial({
        color: 0x1d2a3d,
        roughness: 0.12,
        metalness: 0.4,
        envMapIntensity: 1.2,
      });
      const buildCar = (paint: number) => {
        const car = new THREE.Group();
        const paintMat = new THREE.MeshStandardMaterial({
          color: paint,
          roughness: 0.32,
          metalness: 0.55,
          envMapIntensity: 1.1,
        });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.42, 0.86), paintMat);
        body.position.y = 0.36;
        body.castShadow = true;
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.36, 0.78), carGlassMat);
        cabin.position.set(-0.08, 0.74, 0);
        cabin.castShadow = true;
        car.add(body, cabin);
        for (const [wx, wz] of [[-0.62, 0.44], [0.62, 0.44], [-0.62, -0.44], [0.62, -0.44]] as const) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 12), tyreMat);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(wx, 0.17, wz);
          car.add(wheel);
        }
        for (const hz of [-0.26, 0.26]) {
          const light = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.16), glowMat);
          light.position.set(0.96, 0.4, hz);
          car.add(light);
        }
        return car;
      };
      const carPaints = [0xc23b2e, 0xe8e6df, 0x2f6fb4, 0xf2b01e, 0x3a3f4a, 0x7fb069];
      const carSpecs: [number, number, number, number][] = [
        // [x xuất phát, z làn, chiều (1 = sang phải), tốc độ]
        [-30, 31.6, 1, 7.2],
        [-4, 31.6, 1, 8.6],
        [22, 31.6, 1, 6.4],
        [28, 36.4, -1, 7.8],
        [2, 36.4, -1, 6.8],
        [-24, 36.4, -1, 9.2],
      ];
      carSpecs.forEach(([cx, cz, dir, speed], i) => {
        const car = buildCar(carPaints[i % carPaints.length] ?? 0xe8e6df);
        car.position.set(cx, baseY + 0.05, cz);
        if (dir < 0) car.rotation.y = Math.PI;
        street.add(car);
        carsRef.current.push({ g: car, speed, dir });
      });
      world.add(street);
    }

    // 3 BẬC NGẮN TRƯỚC CỬA CHÍNH: cốt nền đã hạ 3 bậc nên mặt
    // sàn tầng 1 cao hơn nền đất ngoài đúng 3 bậc (0.45). Ngay
    // trước Cửa chính (khẩu độ x ±2.6, thẳng trục giữa, mép
    // trước tấm sàn z=23.0) đắp 3 bậc đá ngắn bước lên vào văn
    // phòng: mỗi bậc cao đúng 0.15, mặt bậc sâu 0.34 — bậc
    // ngắn, vừa bước, không cao; bề ngang 5.2 đúng khẩu độ cửa
    // chính nên không chắn bất kỳ lối đi nào. Bậc trên cùng là
    // thềm ngang bằng đúng cốt sàn, áp sát mép sàn trước cửa.
    {
      const stepStoneMat = new THREE.MeshStandardMaterial({
        color: 0x4c3d78,
        roughness: 0.85,
        bumpMap: concreteTexture(),
        bumpScale: 0.12,
      });
      const stepNoseMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 });
      const STEP_W = 5.2; // đúng khẩu độ Cửa chính (x ±2.6)
      const STEP_TREAD = 0.34;
      const SLAB_FRONT_Z = 23.0; // mép trước tấm sàn
      for (let i = 0; i < 3; i++) {
        // i = 0: bậc trên cùng (thềm, mặt bằng cốt sàn 0, áp mép
        // sàn); i = 1, 2: hai bậc thấp dần ra phía ngoài.
        const topY = -i * STEP_RISE;
        const zNear = SLAB_FRONT_Z + i * STEP_TREAD;
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(STEP_W, topY + FLOOR_DROP, STEP_TREAD),
          stepStoneMat,
        );
        step.position.set(0, (topY - FLOOR_DROP) / 2, zNear + STEP_TREAD / 2);
        step.castShadow = true;
        step.receiveShadow = true;
        world.add(step);
        // Gờ mũi bậc vàng đồng mảnh ở mép trước mỗi bậc.
        const nose = new THREE.Mesh(new THREE.BoxGeometry(STEP_W, 0.03, 0.03), stepNoseMat);
        nose.position.set(0, topY - 0.015, zNear + STEP_TREAD - 0.015);
        world.add(nose);
        // Dải LED ấm ngay dưới mũi bậc: bậc thang phát sáng nhẹ về đêm.
        const stepLed = new THREE.Mesh(new THREE.BoxGeometry(STEP_W - 0.15, 0.022, 0.02), ledMat);
        stepLed.position.set(0, topY - 0.05, zNear + STEP_TREAD - 0.02);
        world.add(stepLed);
      }
    }

    // 2 CẦU THANG THẲNG ĐẢO NGƯỢC — CHÂN THANG NGAY TẠI VÁCH
    // TRƯỚC PHÒNG CHỦ TỊCH, THANG LEO NGƯỢC VÀO TRONG PHÒNG
    // DỌC HÀNH LANG VÁCH NGĂN (Chủ tịch đính chính mới nhất):
    // EXACTLY TWO straight stairs, one on EACH side at
    // x=±6.55 — but FLIPPED against the previous build: the
    // FOOT of each flight stands right at the Chủ tịch room's
    // front wall, at that side's OPEN PASSAGE — the very spot
    // where the HEAD of the old flight (the one that stood in
    // the slot beside the Tổng giám đốc room) used to arrive —
    // and the flight climbs STRAIGHT, ONE SINGLE FLIGHT from
    // that foot INTO the room, rising along the interior
    // partition corridor in a channel cut into the front of
    // the room's podium (see the chairman floor / podium
    // pieces in the room builder below), until its HEAD lands
    // on the corridor floor. The partition (vách ngăn) itself
    // has been PUSHED BACK into the room by exactly the
    // settled corridor amount (2.3) from its old spot: it now
    // stands 4.6 behind the front wall (world z=-20.37, was
    // -18.07), and the corridor runs one deep 4.6 band from
    // the front wall to it — the flight's head steps off onto
    // that corridor floor a clear 2.3 in front of the
    // partition. 9 risers
    // of 0.15 (the full CHAIR_LEVEL of 1.35), 8 solid stone
    // treads of 0.28 — no curve, no L-shape. NO stair stands
    // in the two slots (khe) beside the Tổng giám đốc room any
    // more, and the HALLWAY BELOW in front of the room (the
    // carpeted back strip behind the executive row) is left
    // COMPLETELY CLEAR, so the inner rooms (Chiến lược, Nhân
    // sự) keep their way along it, end to end. Brass noses on
    // every tread (matching the entrance steps) and a slim
    // brass handrail on posts standing on the treads, down
    // both sides of each flight. Along the entry axis these
    // stairs sit AFTER the 3 short entrance steps: in through
    // the main gate, up the 3 short steps, across the hall and
    // the executive zone, along the clear hallway below — and
    // only then to the feet of these stairs at the room's
    // front wall; they never stand before the 3 steps and
    // never block them (opposite ends of the building).
    {
      const stairStoneMat = new THREE.MeshStandardMaterial({
        color: 0x4c3d78,
        roughness: 0.85,
        bumpMap: concreteTexture(),
        bumpScale: 0.12,
      });
      const stairNoseMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 });
      const railMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 });
      for (const side of [-1, 1]) {
        const cx = side * STAIR_CX;
        for (let k = 1; k < STAIR_RISERS; k++) {
          // Tread k (1 = bottom, at the front wall … 8 = top,
          // landing on the corridor floor in front of the
          // pushed-back partition): its top is the walking
          // surface 0.22 + k·0.15; the bottom tread (k=1) lies flush
          // against the front wall at the open passage, each
          // higher tread one tread depth further INTO the
          // room. Solid from below the ground slab up, like
          // the entrance steps.
          const topY = 0.22 + k * STEP_RISE;
          const zCentre = CHAIR_FRONT_Z - (k - 0.5) * STAIR_TREAD;
          const step = new THREE.Mesh(
            new THREE.BoxGeometry(STAIR_WIDTH, topY + FLOOR_DROP, STAIR_TREAD),
            stairStoneMat,
          );
          step.position.set(cx, (topY - FLOOR_DROP) / 2, zCentre);
          step.castShadow = true;
          step.receiveShadow = true;
          world.add(step);
          const nose = new THREE.Mesh(new THREE.BoxGeometry(STAIR_WIDTH, 0.03, 0.03), stairNoseMat);
          nose.position.set(cx, topY - 0.015, zCentre + STAIR_TREAD / 2 - 0.015);
          world.add(nose);
          // Dải LED ấm dưới mũi từng bậc thang lên phòng Chủ tịch.
          const stairLed = new THREE.Mesh(new THREE.BoxGeometry(STAIR_WIDTH - 0.15, 0.022, 0.02), ledMat);
          stairLed.position.set(cx, topY - 0.05, zCentre + STAIR_TREAD / 2 - 0.02);
          world.add(stairLed);
        }
        // Brass handrails on both sides of the flight: short
        // posts standing ON the treads (the flight runs in its
        // podium channel inside the room, so there is no ground
        // beside it to stand posts on) and one sloped rail
        // following the flight from its foot at the front wall
        // up to its head at the corridor floor.
        const treadTop = (k: number) => 0.22 + k * STEP_RISE;
        const treadZ = (k: number) => CHAIR_FRONT_Z - (k - 0.5) * STAIR_TREAD;
        const lowTop = new THREE.Vector3(cx, treadTop(1) + 0.92, treadZ(1));
        const highTop = new THREE.Vector3(cx, treadTop(STAIR_RISERS - 1) + 0.92, treadZ(STAIR_RISERS - 1));
        for (const railSide of [-1, 1]) {
          const rx = cx + railSide * (STAIR_WIDTH / 2 - 0.07);
          for (const k of [1, 4, STAIR_RISERS - 1]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.92, 8), railMat);
            post.position.set(rx, treadTop(k) + 0.46, treadZ(k));
            world.add(post);
          }
          const railLen = Math.hypot(highTop.y - lowTop.y, highTop.z - lowTop.z);
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, railLen), railMat);
          rail.position.set(rx, (lowTop.y + highTop.y) / 2, (lowTop.z + highTop.z) / 2);
          rail.rotation.x = Math.atan2(highTop.y - lowTop.y, lowTop.z - highTop.z);
          world.add(rail);
        }
      }
    }

    // LỐI ĐI TRẢI THẢM — ĐI THÔNG MỌI PHÒNG (Chủ tịch đính
    // chính: "Đi thảm đi"): there are still no enclosed corridor
    // ROWS, but every shared walkway on the one open floor is
    // CARPETED, and the carpets join into ONE connected network,
    // laid out neat, airy and mirrored on both sides of the axis:
    // the central hall carpet runs STRAIGHT and CONTINUOUS from
    // just inside the main gate (after the 3 short entrance
    // steps) all the way to the Tổng giám đốc forecourt — one
    // piece, no gap; a carpeted lane runs down each side between
    // the two department columns; carpeted cross bands join each
    // lane to the hall in EVERY inter-row corridor (all exactly
    // 3.0 wide on the uniform room grid); carpeted
    // lanes flank the Tổng giám đốc room back to a carpeted
    // strip behind the executive row, in front of the Chủ tịch
    // room — that strip is the HALLWAY BELOW, and it is now
    // left COMPLETELY CLEAR end to end (the 2 stairs up to the
    // Chủ tịch room were FLIPPED into the room itself: their
    // feet stand at the room's front wall, at the strip's back
    // edge, and they climb INTO the room), so the inner rooms
    // keep their way along it. Every
    // room's door opens onto carpet, and every room reaches
    // every other room on carpet through the shared hall — no
    // room is stuck, no way is blocked. All pieces only touch at
    // their edges (no overlaps, no z-fighting).
    const carpetMat = new THREE.MeshStandardMaterial({ map: carpetTexture(), roughness: 1 });
    const sharedFloor = (w: number, d: number, x: number, z: number) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), carpetMat);
      c.position.set(x, 0.02, z);
      c.receiveShadow = true;
      world.add(c);
    };
    sharedFloor(16.0, 27.2, 0, 8.6); // the central HALL (sảnh / hành lang chính giữa): ONE continuous carpet, main gate → hall → Tổng giám đốc forecourt (z=-5.0 … 22.2), the straight shared axis every inner room opens onto — its width, 16.0, is the width the Chủ tịch room is widened to match exactly
    sharedFloor(3.0, 33.8, -17.6, 3.6); // left carpeted lane between the two department columns (z=-13.3 … 20.5 — exactly the department grid's back-to-front span): every outer-column room's door opens onto it, and it joins the back strip and all three cross bands
    sharedFloor(3.0, 33.8, 17.6, 3.6); // right carpeted lane, mirrored
    // BA DẢI THẢM NGANG ĐỀU NHAU (Chủ tịch đính chính): the rooms now
    // stand on ONE uniform grid (rows z −10.2 / −1.0 / 8.2 / 17.4,
    // pitch 9.2), so the cross corridor between every pair of rows
    // is exactly 3.0 wide — the same 3.0 as the side lanes — and
    // EVERY such corridor carries a carpet band joining lane ↔ hall
    // at its centre (z −5.6 / 3.6 / 12.8): no row is squeezed, no
    // row is stranded, every room reaches the hall on carpet.
    sharedFloor(8.1, 3.0, -12.05, -5.6); // left back cross band (between the back row and row 2): lane ↔ hall
    sharedFloor(8.1, 3.0, 12.05, -5.6); // right back cross band, mirrored
    sharedFloor(8.1, 3.0, -12.05, 3.6); // left middle cross band (between row 2 and row 3): lane ↔ hall
    sharedFloor(8.1, 3.0, 12.05, 3.6); // right middle cross band, mirrored
    sharedFloor(8.1, 3.0, -12.05, 12.8); // left front cross band (between row 3 and the front row): lane ↔ hall
    sharedFloor(8.1, 3.0, 12.05, 12.8); // right front cross band, mirrored
    sharedFloor(3.5, 8.55, -6.55, -9.275); // left executive lane: forecourt → back strip, between the Tổng giám đốc room and Chiến lược
    sharedFloor(3.5, 8.55, 6.55, -9.275); // right executive lane, mirrored, between the Tổng giám đốc room and Nhân sự
    sharedFloor(32.2, 1.9, 0, -14.5); // the carpeted back strip behind the executive row, in front of the Chủ tịch room (z=-15.45 … -13.55): the HALLWAY BELOW — left COMPLETELY CLEAR end to end now that the 2 stairs are flipped into the Chủ tịch room (their feet stand at the room's front wall on this strip's back edge, and the flights climb INTO the room), so the inner rooms (Chiến lược, Nhân sự) keep their way along it; it joins both executive lanes and both side lanes
    // FULL THẢM MỌI HÀNH LANG (Chủ tịch đính chính: không chỗ có
    // chỗ không): the last bare seams of the carpet network are
    // filled — a corner piece at each end of the back strip
    // joining side lane ↔ back strip ↔ the utility-zone carpet
    // spurs (x ±16.1…19.1, z -15.45…-13.3), and a thin band
    // behind the back row joining the back strip to the back
    // rooms' wall line (z -13.55…-13.3, split around the two
    // executive lanes). Every walkway in the company — main
    // hall, side lanes, cross bands, executive lanes, hallway
    // below, back corners — is now carpeted, edge to edge, one
    // continuous network.
    sharedFloor(3.0, 2.15, -17.6, -14.375); // left back corner: side lane ↔ back strip ↔ zone spur
    sharedFloor(3.0, 2.15, 17.6, -14.375); // right back corner, mirrored
    sharedFloor(9.6, 0.25, 0, -13.425); // thin band behind the back row, centre (between the executive lanes)
    sharedFloor(7.8, 0.25, -12.2, -13.425); // thin band behind the back row, left (executive lane ↔ side lane)
    sharedFloor(7.8, 0.25, 12.2, -13.425); // thin band behind the back row, right, mirrored
    // LẤP NỐT 2 KHOẢNG TRẦN CUỐI CÙNG (Chủ tịch đính chính:
    // "Bảo trải thảm hết hành lang sao không trải?"): two real
    // bare patches remained in the walkway network. (1) The
    // Tổng giám đốc FORECOURT: the hall carpet ended at
    // z=-5.0 and the executive lanes flank the room's front,
    // but the strip directly in front of the Tổng giám đốc
    // room's front wall and its ONE door (x −4.8…+4.8 between
    // the two executive lanes, z −7.1…−5.0) was bare floor —
    // now carpeted edge to edge, joining hall carpet ↔ both
    // executive lanes ↔ the room's door. (2) The FRONT
    // forecourt band in front of the front row (z 20.5…22.2):
    // the side lanes ended at the front row's front face
    // (z=20.5) while the hall ran on to z=22.2, leaving the
    // band in front of the front-row rooms bare on both
    // sides — now carpeted lane ↔ hall on both sides, so the
    // front walkway reads as ONE continuous carpeted band.
    sharedFloor(9.6, 2.1, 0, -6.05); // Tổng giám đốc forecourt: hall carpet ↔ executive lanes ↔ the room's front door, no bare strip left
    sharedFloor(11.1, 1.7, -13.55, 21.35); // front forecourt band, left: side lane front end ↔ hall, in front of the front row
    sharedFloor(11.1, 1.7, 13.55, 21.35); // front forecourt band, right, mirrored

    const pickables: THREE.Object3D[] = [];
    // Door leaves on hinges: they swing open when someone comes near and
    // close again once the way is clear.
    const doors: { pivot: THREE.Group; swing: number }[] = [];
    // Fish in the central aquarium, animated in the render loop.
    const fishes: { g: THREE.Group; cx: number; cy: number; cz: number; phase: number; speed: number; range: number }[] = [];
    // Koi in the Chairman corridor pond, animated in the render
    // loop (circling the rockery), plus the pond's scrolling
    // waterfall texture and pulsing foam ring.
    const pondKoi: { g: THREE.Group; cx: number; cy: number; cz: number; rx: number; rz: number; phase: number; speed: number; dir: number }[] = [];
    let pondFallTex: THREE.CanvasTexture | null = null;
    let pondFoam: THREE.Mesh | null = null;
    const lampMats = lampMatsRef.current;
    const roomLampMats = roomLampMatsRef.current;
    const ceilMats = ceilMatsRef.current;
    const ceilLights = ceilLightsRef.current;
    const rigs = rigsRef.current;
    const roomFocus = roomFocusRef.current;
    lampMats.clear();
    roomLampMats.clear();
    ceilMats.clear();
    ceilLights.clear();
    rigs.clear();
    roomFocus.clear();
    meetingSeatsRef.current = [];
    checkSpotsRef.current = new Map();
    screensRef.current = [];
    deskScreensRef.current.clear();
    bubbleRef.current.clear();
    meetingBoardRef.current = null;
    clockHandsRef.current = null;
    plantsRef.current = [];
    steamRef.current = [];
    printerLedRef.current = null;

    // Architectural glass: transparent with light reflections from
    // the code-generated environment (envMapIntensity) — NO heavy
    // transmission, per the performance budget.
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x8fb0e8,
      roughness: 0.06,
      metalness: 0.2,
      transparent: true,
      opacity: 0.24,
      envMapIntensity: 0.85,
    });
    // Brushed-metal frame material for trims, mullions and door frames.
    const glassEdgeMat = new THREE.MeshStandardMaterial({
      color: 0x8d84b8,
      roughness: 0.34,
      metalness: 0.85,
      envMapIntensity: 1.1,
    });
    // Near-clear glass for the Tổng giám đốc room's FRONT wall: from
    // his desk he sees straight out over the empty forecourt and the hall,
    // and the hall sees him at work — the other walls keep the
    // standard tinted glass.
    const clearGlassMat = new THREE.MeshStandardMaterial({
      color: 0xd6e6ff,
      roughness: 0.04,
      metalness: 0.1,
      transparent: true,
      opacity: 0.1,
      envMapIntensity: 1.1,
    });
    // Baseboard (len chân tường) material: dark stained wood.
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x3a2a1c,
      roughness: 0.55,
      metalness: 0.15,
      map: woodTexture(),
    });

    // Lễ tân is the ONLY post left on the front face: an open duty
    // post (desk, low partition, sign) alone in the middle of the
    // hall, so the front reads open — hall, bonsai, koi tank and the
    // executive row straight ahead. The Trợ lý TGĐ and Thư ký Chủ
    // tịch rooms moved OUT to the two flanks of the executive zone;
    // they are full glass rooms of their own and no longer block
    // the front.
    const isPost = (id: string) => id === "reception";

    for (const room of rooms) {
      const baseY = baseYOf(room);
      const g = new THREE.Group();
      g.position.set(room.x, baseY, room.z);
      g.userData.roomId = room.id;
      const active = room.id !== "meeting" && (roomLamp[room.id] ?? "idle") !== "soon";


      const floorMat = new THREE.MeshStandardMaterial({
        color: room.floor,
        map: oakFloorTexture(),
        roughness: 0.48,
        bumpMap: oakFloorTexture(),
        bumpScale: 0.06,
        envMapIntensity: 0.4,
      });
      const rugMat = new THREE.MeshStandardMaterial({ color: 0x2e2358, roughness: 1 });
      if (room.id === "chairman") {
        // The Chủ tịch room's floor: 16.0 wide ×
        // 13.1 deep — its WIDTH EQUALS the central hall's width
        // exactly (16.0, the "hành lang chính giữa"), no wider,
        // no narrower, not recessed, no empty gaps at its sides —
        // centred on the Tổng giám đốc axis, standing on a LOW
        // PODIUM (bệ nâng thấp): its floor level is CHAIR_LEVEL
        // (1.35) above floor 1 — lowered right down from the old
        // 2.82-high block (HẠ CỐT NỀN), but NOT flat on the
        // ground: the podium block below fills from the ground
        // slab up to the room's floor, except the two stair
        // channels cut through its front band. Front wall at world
        // z=-15.7, back wall at world z=-28.8, near the site back
        // line (z=-29.4). KHÔNG CÒN BAN CÔNG / SẢNH NGOÀI: no deck
        // in front of the room — instead the TWO straight stairs
        // are FLIPPED (Chủ tịch đính chính): each flight's FOOT
        // stands at an OPEN PASSAGE in the front wall (where its
        // head used to arrive) and the flight climbs INTO the
        // room along the interior partition corridor to the
        // room's ONE SINGLE MAIN DOOR, while the hallway below
        // in front of the room stays completely clear for the
        // inner rooms (see the stairs built with the entrance
        // steps below and the chairman wall branch further
        // down).
        const chairCarpetMat = new THREE.MeshStandardMaterial({ map: carpetTexture(), roughness: 1 });
        // MÉP HÀNH LANG CẮT BẰNG ĐÚNG ĐỈNH CẦU THANG (Chủ tịch
        // đính chính mới nhất): the corridor edge is CUT FLUSH
        // WITH THE STAIR HEADS. The flights' heads land at local
        // z +4.31 (the back edge of the top tread of each
        // flight), so the floor slab is now ONE single piece
        // ending at exactly +4.31 across the room's FULL width —
        // no protrusion past the heads, no recession behind
        // them, one straight aligned edge. The slab's old front
        // band (the middle floor between the channels and the
        // two narrow strips outside them, local z +4.31 … +6.55)
        // is CUT AWAY ENTIRELY, and the podium's front band goes
        // with it (below): the cut opens a well in front of the
        // corridor edge, between the two stair channels — the
        // gap that now holds the KOI POND (built right below).
        // The two narrow stone FINS that stood outside the
        // channels in that band (the "2 vách thừa") are gone
        // with it. The one slab still forms the main chamber
        // floor and the corridor floor behind the flights'
        // heads, back to the PUSHED-BACK partition (local
        // z +1.88); the room's WIDTH still EQUALS the central
        // hall's width exactly.
        const slabPiece = (w: number, d: number, x: number, z: number) => {
          const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), floorMat);
          p.position.set(x, 0.11, z);
          p.receiveShadow = true;
          p.userData.roomId = room.id;
          g.add(p);
          pickables.push(p);
          return p;
        };
        slabPiece(room.w, 10.86, 0, -1.12); // the ONE slab: local z -6.55 … +4.31 — its front edge IS the cut corridor edge, dead level with both stair heads
        // The chamber rug now ENDS at the pushed-back partition
        // (local +1.88): it no longer bleeds into the corridor.
        const rugPiece = new THREE.Mesh(new THREE.BoxGeometry(room.w - 0.3, 0.03, 8.0), chairCarpetMat);
        rugPiece.position.set(0, 0.235, -2.4);
        rugPiece.receiveShadow = true;
        g.add(rugPiece);
        // The corridor rug now carpets the corridor's WHOLE
        // remaining floor (Chủ tịch đính chính: full thảm, không
        // chỗ có chỗ không): from the partition's face (local
        // +1.94) to the CUT EDGE at the stair-head line (+4.30),
        // across the full width of the floor (15.7 of 16.0) —
        // the corridor is carpeted wall-to-edge, flush with the
        // cut, and no part of it hangs over the pond well.
        const corrRug = new THREE.Mesh(new THREE.BoxGeometry(15.7, 0.03, 2.36), chairCarpetMat);
        corrRug.position.set(0, 0.235, 3.12);
        corrRug.receiveShadow = true;
        g.add(corrRug);
        // The low podium block under the room: solid stone from
        // the ground slab (local y = -CHAIR_LEVEL) up to the
        // floor slab, inset 0.2 from the room's walls — and its
        // front face now stands at the SAME cut line as the slab
        // (local z +4.31, the stair-head line): the podium's old
        // front band (between and outside the channels) is cut
        // away with the slab's, so the podium's cut face forms
        // the pond well's back wall, and a single brass nosing
        // runs along the slab's cut edge the room's full width —
        // ONE straight brass line at exactly the stair-head
        // level, stitching corridor edge and both stair heads
        // into a single aligned line.
        const podiumMat = new THREE.MeshStandardMaterial({
          color: 0x413273,
          roughness: 0.9,
          bumpMap: concreteTexture(),
          bumpScale: 0.15,
          roughnessMap: concreteTexture(),
        });
        const podiumPiece = (w: number, d: number, x: number, z: number) => {
          const p = new THREE.Mesh(new THREE.BoxGeometry(w, CHAIR_LEVEL, d), podiumMat);
          p.position.set(x, -CHAIR_LEVEL / 2, z);
          p.castShadow = true;
          p.receiveShadow = true;
          g.add(p);
          return p;
        };
        podiumPiece(room.w - 0.4, 10.66, 0, -1.02); // main block: local z -6.35 … +4.31 — its front face IS the cut edge, dead level with both stair heads
        const trimMatP = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 });
        const edgeNose = new THREE.Mesh(new THREE.BoxGeometry(room.w, 0.05, 0.06), trimMatP);
        edgeNose.position.set(0, 0.2, 4.32);
        g.add(edgeNose);
        // HỒ CÁ COI PHONG THỦY TRONG KHOẢNG TRỐNG VỪA CẮT (Chủ
        // tịch đính chính): the cut opens a well in front of the
        // corridor edge, between the two stair channels
        // (x −5.45…+5.45, local z +4.31…+6.35, from the ground
        // up to the corridor edge) — and the well is now a KOI
        // POND in the feng-shui manner: a stone basin whose rim
        // stands just behind the room's front face; a ROKERY
        // (hòn non bộ) at its centre; a WATERFALL pouring down
        // the rockery's corridor-facing slope INTO the pond —
        // nước chảy vào trong, the flow runs toward the room
        // and its ONE main door, water gathering (tụ tài) on the
        // door's axis in front of the corridor; clear water;
        // koi circling the rockery; greenery and dressed stones.
        // The pond blocks NOTHING: the corridor's walking line
        // (local z ≤ +4.31) and the ONE main door stay
        // completely clear, the two stair passages flank it
        // untouched at x=±6.55, and from the hallway below it
        // reads as a sunken garden court in front of the
        // corridor edge — the corridor's luxury accent.
        {
          const pondStone = new THREE.MeshStandardMaterial({ color: 0x5d5470, roughness: 0.9 });
          const pondStoneDark = new THREE.MeshStandardMaterial({ color: 0x3c3550, roughness: 0.95 });
          const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8b93, roughness: 0.95, flatShading: true });
          const rockDark = new THREE.MeshStandardMaterial({ color: 0x6e6e76, roughness: 0.95, flatShading: true });
          // Basin floor + front and side rim walls (the podium's
          // cut face at z +4.31 walls the back).
          const basinFloor = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.15, 2.04), pondStoneDark);
          basinFloor.position.set(0, -1.28, 5.33);
          basinFloor.receiveShadow = true;
          g.add(basinFloor);
          const rimF = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.95, 0.18), pondStone);
          rimF.position.set(0, -0.88, 6.26);
          rimF.castShadow = true;
          rimF.userData.roomId = room.id;
          g.add(rimF);
          pickables.push(rimF);
          for (const s of [-1, 1]) {
            const rimS = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.95, 2.04), pondStone);
            rimS.position.set(s * 5.36, -0.88, 5.33);
            rimS.castShadow = true;
            g.add(rimS);
          }
          // Dressed-stone coping along the rim tops.
          const copeF = new THREE.Mesh(new THREE.BoxGeometry(11.14, 0.07, 0.32), rockDark);
          copeF.position.set(0, -0.37, 6.26);
          copeF.castShadow = true;
          g.add(copeF);
          for (const s of [-1, 1]) {
            const copeS = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 2.2), rockDark);
            copeS.position.set(s * 5.36, -0.37, 5.33);
            g.add(copeS);
          }
          // Clear water.
          const pondWater = new THREE.Mesh(
            new THREE.BoxGeometry(10.54, 0.05, 1.83),
            new THREE.MeshStandardMaterial({ color: 0x2e7cb8, transparent: true, opacity: 0.5, roughness: 0.12, metalness: 0.1 }),
          );
          pondWater.position.set(0, -0.5, 5.25);
          g.add(pondWater);
          // HÒN NON BỘ — the rockery at the pond's centre: one
          // main peak, two side peaks, loose stones at their feet.
          const mainPeak = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.75, 7), rockMat);
          mainPeak.position.set(0, -0.32, 5.33);
          mainPeak.castShadow = true;
          g.add(mainPeak);
          const peakL = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.1, 7), rockDark);
          peakL.position.set(-0.88, -0.65, 5.55);
          peakL.castShadow = true;
          g.add(peakL);
          const peakR = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.92, 7), rockDark);
          peakR.position.set(0.82, -0.74, 5.12);
          peakR.castShadow = true;
          g.add(peakR);
          for (const [rx, rz, rs] of [[-0.62, 4.86, 0.21], [0.66, 5.78, 0.17], [0.3, 4.8, 0.13], [-0.35, 5.9, 0.15]] as const) {
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), rockDark);
            rock.position.set(rx, -1.14, rz);
            g.add(rock);
          }
          // THÁC NƯỚC — the waterfall down the rockery's
          // corridor-facing slope: a streaked sheet whose texture
          // scrolls in the render loop, pouring INTO the pond on
          // the room side (nước chảy vào trong), with a foam ring
          // where it lands.
          const fallCanvas = document.createElement("canvas");
          fallCanvas.width = 64;
          fallCanvas.height = 128;
          const fx2 = fallCanvas.getContext("2d");
          if (fx2) {
            fx2.clearRect(0, 0, 64, 128);
            for (let i = 0; i < 26; i++) {
              const sx = Math.random() * 60 + 2;
              fx2.strokeStyle = `rgba(235,246,255,${0.35 + Math.random() * 0.45})`;
              fx2.lineWidth = 1 + Math.random() * 2;
              fx2.beginPath();
              fx2.moveTo(sx, -6);
              fx2.lineTo(sx + (Math.random() * 4 - 2), 134);
              fx2.stroke();
            }
          }
          pondFallTex = new THREE.CanvasTexture(fallCanvas);
          pondFallTex.wrapS = THREE.RepeatWrapping;
          pondFallTex.wrapT = THREE.RepeatWrapping;
          pondFallTex.repeat.set(1, 1.6);
          const fall = new THREE.Mesh(
            new THREE.PlaneGeometry(0.85, 0.8),
            new THREE.MeshBasicMaterial({ map: pondFallTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
          );
          fall.position.set(0, -0.14, 4.95);
          fall.rotation.x = 0.42;
          g.add(fall);
          pondFoam = new THREE.Mesh(
            new THREE.CircleGeometry(0.42, 20),
            new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.5, depthWrite: false }),
          );
          pondFoam.rotation.x = -Math.PI / 2;
          pondFoam.position.set(0, -0.46, 4.79);
          g.add(pondFoam);
          // CÁ COI — koi circling the rockery under the clear
          // water, animated in the render loop.
          const koiCols = [0xff7b24, 0xf5f2ea, 0xd43a2f, 0xffb52e, 0xff7b24, 0xf5f2ea, 0xef6c1a];
          koiCols.forEach((c, i) => {
            const f = new THREE.Group();
            const fMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), fMat);
            body.scale.set(1.7, 0.7, 0.5);
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 8), fMat);
            tail.position.x = -0.22;
            tail.rotation.z = Math.PI / 2;
            f.add(body, tail);
            f.position.set(3.7, -0.62, 5.33);
            g.add(f);
            pondKoi.push({
              g: f,
              cx: 0,
              cy: -0.62,
              cz: 5.33,
              rx: 3.7,
              rz: 0.55,
              phase: (i / koiCols.length) * Math.PI * 2,
              speed: 0.22 + (i % 3) * 0.05,
              dir: i % 4 === 3 ? -1 : 1,
            });
          });
          // Greenery: a small plant on the rockery's shoulder, a
          // plant and a dressed stone at each front corner of the
          // basin, and a warm light over the water.
          const rockPlant = buildPlant();
          rockPlant.scale.setScalar(0.45);
          rockPlant.position.set(0.12, 0.3, 5.3);
          g.add(rockPlant);
          rockPlant.traverse((o) => {
            if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) plantsRef.current.push(o);
          });
          for (const s of [-1, 1]) {
            const cp2 = buildPlant();
            cp2.scale.setScalar(0.55);
            cp2.position.set(s * 4.85, -0.34, 6.26);
            g.add(cp2);
            cp2.traverse((o) => {
              if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) plantsRef.current.push(o);
            });
            const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), rockDark);
            stone.position.set(s * 4.3, -0.42, 6.24);
            g.add(stone);
          }
          const pondLight = new THREE.PointLight(0xffd9a0, 5, 7, 1.6);
          pondLight.position.set(0, 1.5, 5.3);
          g.add(pondLight);
        }
        // The two narrow slots outside the channels — where the
        // removed fins (2 vách thừa) stood — are filled level
        // with LOW stone planters at the pond's water line:
        // ground-level planting, NOT walls; nothing rises past
        // the cut edge beside the stair heads any more.
        for (const s of [-1, 1]) {
          const planter = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.8, 2.04), podiumMat);
          planter.position.set(s * 7.755, -0.95, 5.33);
          planter.castShadow = true;
          g.add(planter);
          const sp = buildPlant();
          sp.scale.setScalar(0.45);
          sp.position.set(s * 7.755, -0.55, 5.33);
          g.add(sp);
          sp.traverse((o) => {
            if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) plantsRef.current.push(o);
          });
        }
      } else {
        const floor = new THREE.Mesh(new THREE.BoxGeometry(room.w, 0.22, room.d), floorMat);
        floor.position.y = 0.11;
        floor.receiveShadow = true;
        floor.userData.roomId = room.id;
        g.add(floor);
        pickables.push(floor);

        // In-room carpet under the desks.
        const rug = new THREE.Mesh(new THREE.BoxGeometry(room.w - 1.6, 0.03, room.d - 1.6), rugMat);
        rug.position.y = 0.235;
        g.add(rug);
      }

      // Glass partitions: back, left, right, and a front wall with a doorway.
      const wallH = 2.6;
      const mkWall = (w: number, d: number, x: number, z: number, mat: THREE.Material = glassMat) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), mat);
        wall.position.set(x, wallH / 2 + 0.22, z);
        wall.userData.roomId = room.id;
        g.add(wall);
        pickables.push(wall);
        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(w === 0.14 ? 0.2 : w, 0.09, d === 0.14 ? 0.2 : d),
          glassEdgeMat,
        );
        trim.position.set(x, wallH + 0.26, z);
        g.add(trim);
      };
      const doorW = 1.25;
      if (isPost(room.id)) {
        // Open duty post, no glass box: a low partition behind the desk
        // marks the area off without blocking the way to the stairs.
        const partition = new THREE.Mesh(
          new THREE.BoxGeometry(room.w, 1.05, 0.1),
          new THREE.MeshStandardMaterial({ color: 0x3a2c66, roughness: 0.8 }),
        );
        partition.position.set(0, 0.75, -room.d / 2 + 0.05);
        partition.castShadow = true;
        g.add(partition);
      } else {
        mkWall(room.w, 0.14, 0, -room.d / 2 + 0.07);
        const frontZ = room.d / 2 - 0.07;
        // Hinged door leaf builders: a leaf opens when someone approaches
        // and closes behind them. Front doors hinge along the front wall;
        // side doors hinge along a side wall and swing into the room.
        const addDoor = (cx: number, wallZ: number = frontZ) => {
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.55, 0.14), glassMat);
          lintel.position.set(cx, 2.3, wallZ);
          g.add(lintel);
          // Brushed-metal door frame: two jambs + a header standing
          // slightly proud of the glass, so the doorway reads framed.
          for (const js of [-1, 1]) {
            const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.06, 0.2), glassEdgeMat);
            jamb.position.set(cx + js * (doorW / 2 + 0.03), 0.22 + 1.03, wallZ);
            g.add(jamb);
          }
          const header = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.26, 0.1, 0.2), glassEdgeMat);
          header.position.set(cx, 0.22 + 2.11, wallZ);
          g.add(header);
          const doorPivot = new THREE.Group();
          doorPivot.position.set(cx - doorW / 2, 0.22, wallZ);
          const doorLeaf = new THREE.Mesh(
            new THREE.BoxGeometry(1.14, 2.0, 0.07),
            new THREE.MeshStandardMaterial({ color: 0x6d4fa8, roughness: 0.5 }),
          );
          doorLeaf.position.set(0.57, 1.0, 0);
          doorLeaf.castShadow = true;
          const knob = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 10, 8),
            new THREE.MeshStandardMaterial({ color: 0xd9c98a, roughness: 0.3, metalness: 0.7 }),
          );
          knob.position.set(1.02, 1.0, -0.07);
          doorPivot.add(doorLeaf, knob);
          g.add(doorPivot);
          doors.push({ pivot: doorPivot, swing: 1 });
        };
        // Door in a SIDE wall (local x = side·(w/2)), centred at local
        // z = cz: the leaf runs along z from the back jamb and swings
        // into the room.
        const addSideDoor = (side: number, cz = 0) => {
          const wallX = side * (room.w / 2 - 0.07);
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, doorW), glassMat);
          lintel.position.set(wallX, 2.3, cz);
          g.add(lintel);
          // Matching brushed-metal frame around the side doorway.
          for (const js of [-1, 1]) {
            const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.06, 0.1), glassEdgeMat);
            jamb.position.set(wallX, 0.22 + 1.03, cz + js * (doorW / 2 + 0.03));
            g.add(jamb);
          }
          const headerS = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, doorW + 0.26), glassEdgeMat);
          headerS.position.set(wallX, 0.22 + 2.11, cz);
          g.add(headerS);
          const doorPivot = new THREE.Group();
          doorPivot.position.set(wallX, 0.22, cz - doorW / 2);
          const doorLeaf = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, 2.0, 1.14),
            new THREE.MeshStandardMaterial({ color: 0x6d4fa8, roughness: 0.5 }),
          );
          doorLeaf.position.set(0, 1.0, 0.57);
          doorLeaf.castShadow = true;
          const knob = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 10, 8),
            new THREE.MeshStandardMaterial({ color: 0xd9c98a, roughness: 0.3, metalness: 0.7 }),
          );
          knob.position.set(-side * 0.08, 1.0, 1.02);
          doorPivot.add(doorLeaf, knob);
          g.add(doorPivot);
          doors.push({ pivot: doorPivot, swing: -side });
        };
        if (room.id === "chairman") {
          // Raised on its low podium (CHAIR_LEVEL) — and entered
          // through ONE SINGLE MAIN DOOR ONLY (Chủ tịch đính
          // chính mới nhất): the front wall (local
          // z = +d/2 - 0.07, world z=-15.7) has NO door at all —
          // only two OPEN PASSAGES at local x=±6.55, where the
          // FEET of the two FLIPPED straight stairs stand (the
          // flights climb from those passages INTO the room
          // along the corridor — the old flights' heads used to
          // arrive here from the slots beside the Tổng giám đốc
          // room). Inside the room, a PARTITION WALL (vách
          // ngăn) runs across the room 4.6 behind the front
          // wall — PUSHED BACK into the room by exactly the
          // settled corridor amount (2.3) from its old spot
          // 2.3 behind the front wall (Chủ tịch đính chính:
          // the wall and the corridor must REALLY retreat, not
          // stay at the old place) — walling off a CORRIDOR
          // (hành lang) 4.6 deep along the front: from either
          // stair's head you step onto the corridor floor, walk
          // the corridor to the middle and enter the room
          // proper through the ONE MAIN DOOR at the centre of
          // the partition. The front line itself carries NO
          // railing and NO wall at all now: it stands completely
          // open over the koi pond in the cut well (see the pond
          // in the floor branch above). The corridor's railing
          // stands on the CUT EDGE instead (below).
          // NO side doors and NO flank stairs: the side walls
          // stand on the line of the central hall's edges carried
          // straight back (the room is exactly the hall's width)
          // — but ONLY along the main chamber: their front
          // stretches beside the stairs and the corridor are
          // REMOVED and replaced by the low brass railing synced
          // with the corridor railing (see the side-wall /
          // railing build below).
          const frontZ2 = room.d / 2 - 0.07;
          // LAN CAN HÀNH LANG LÀM LẠI (Chủ tịch đính chính mới
          // nhất): the corridor railing runs along the CUT EDGE
          // at local z +4.31, between the two stair heads, and it
          // is built EXACTLY like a stair handrail (đúng hình
          // dung): ONE slim round brass top rail at handrail
          // height — 0.80 above the corridor floor, the very
          // height the flights' own handrails reach at their
          // heads, so the brass line runs continuous from each
          // stair straight along the corridor edge — carried on
          // slim open balusters. NO mid rail, NO glass, NO
          // panel, nothing solid: low, open, see-through — nhìn
          // là thấy hành lang thông suốt, the corridor reads
          // clear end to end over the pond. Its ends stop 0.15
          // short of each channel, so both stair heads stay
          // completely open.
          const railMatF = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 });
          const railZ = 4.25; // just behind the cut edge (local z +4.31)
          const railTopY = 0.22 + 0.8;
          const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 10.6, 10), railMatF);
          topRail.rotation.z = Math.PI / 2;
          topRail.position.set(0, railTopY, railZ);
          topRail.castShadow = true;
          topRail.userData.roomId = room.id;
          g.add(topRail);
          pickables.push(topRail);
          for (let i = 0; i <= 20; i++) {
            const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.8, 6), railMatF);
            bal.position.set(-5.3 + i * 0.53, 0.22 + 0.4, railZ);
            g.add(bal);
          }
          for (const s of [-1, 1]) {
            const endPost = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.84, 8), railMatF);
            endPost.position.set(s * 5.3, 0.22 + 0.42, railZ);
            endPost.castShadow = true;
            g.add(endPost);
          }
          // 2 VÁCH TO BÊN CẦU THANG ĐÃ BỎ — THAY BẰNG LAN CAN
          // ĐỒNG BỘ (Chủ tịch đính chính mới nhất: "Tại sao 2 cái
          // vách to ở gần chỗ cầu thang kia vẫn không bỏ thay
          // bằng lan can đồng bộ với hành lang?"): the two BIG
          // side walls used to run the room's FULL depth — two
          // full-height glass walls standing right beside the
          // two stairs (each flight's outer flank boxed in by a
          // wall 0.28 away) and closing BOTH ends of the
          // corridor. They are now GONE from the whole front
          // zone: each side wall covers ONLY the main chamber,
          // from the back wall to the partition (local
          // z −6.55…+1.88), where the room's wall-mounted decor
          // (gold MUSE logo, gold clock, credenza, second sofa)
          // lives. In their place, along the corridor stretch
          // (local z +1.95…+4.31), each side carries a LOW
          // BRASS RAILING built EXACTLY like the corridor's
          // cut-edge railing above — the SAME brass material,
          // the SAME slim round top rail at 0.80 above the
          // corridor floor (railTopY), the SAME slim open
          // balusters and end posts — so the railing reads as
          // ONE synced system wrapping the corridor on three
          // sides: the cut edge in front and both ends, low,
          // open, see-through, exactly like a stair handrail,
          // matched in material AND height. And beside the
          // flights themselves (local z +4.31…+6.55) there is
          // NO wall at all any more: each flight's outer flank
          // is guarded only by its own brass handrail, so both
          // stairs stand completely open — no big wall stands
          // near the stairs anywhere.
          const sideSegD = room.d / 2 + 1.88; // chamber-only side wall: local z −6.55…+1.88 (depth 8.43)
          mkWall(0.14, sideSegD, -room.w / 2 + 0.07, -room.d / 2 + sideSegD / 2);
          mkWall(0.14, sideSegD, room.w / 2 - 0.07, -room.d / 2 + sideSegD / 2);
          for (const s of [-1, 1]) {
            const railX = s * (room.w / 2 - 0.1);
            const sideRail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.36, 10), railMatF);
            sideRail.rotation.x = Math.PI / 2;
            sideRail.position.set(railX, railTopY, 3.13);
            sideRail.castShadow = true;
            sideRail.userData.roomId = room.id;
            g.add(sideRail);
            pickables.push(sideRail);
            for (let i = 0; i <= 4; i++) {
              const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.8, 6), railMatF);
              bal.position.set(railX, 0.22 + 0.4, 1.97 + i * 0.585);
              g.add(bal);
            }
            for (const pz of [1.95, 4.31]) {
              const post = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.84, 8), railMatF);
              post.position.set(railX, 0.22 + 0.42, pz);
              post.castShadow = true;
              g.add(post);
            }
          }
          // The interior PARTITION (vách ngăn) and the room's
          // ONE SINGLE MAIN DOOR at its centre: the partition
          // runs the full width of the room except for that one
          // central doorway, and the corridor it walls off runs
          // from passage to passage behind the front wall. The
          // partition stands at frontZ2 − 4.6 — pushed back
          // into the room by exactly the settled corridor
          // amount (2.3) beyond its old frontZ2 − 2.3 spot.
          const partZ = frontZ2 - 4.6; // local z of the partition — world CHAIR_PART_Z (-20.37)
          const partSegW = (room.w - doorW) / 2;
          mkWall(partSegW, 0.14, -(doorW / 2 + partSegW / 2), partZ);
          mkWall(partSegW, 0.14, doorW / 2 + partSegW / 2, partZ);
          addDoor(0, partZ);
          // TRANG TRÍ LẠI HÀNH LANG PHÒNG CHỦ TỊCH (Chủ tịch đính
          // chính mới nhất: hành lang cũ nhìn xấu — trống, tối, thô):
          // the corridor is now dressed to match the room it leads
          // to — walnut wainscot panelling with a brass trim line
          // along the partition's corridor face, a brass door frame
          // and a gold name plate over the ONE main door, two framed
          // paintings and four warm wall sconces on the partition,
          // a deep-red runner with gold borders down the corridor's
          // walking line, three warm ceiling panels and a brass
          // chandelier over the door approach, and a plant tucked
          // into each far corner of the corridor (moved AWAY from
          // the door — see the plant loop below). Everything stands AGAINST the
          // partition or ABOVE head height: the walking band itself
          // (corridor centre line, local z ≈ 4.2, from both stair
          // heads to the door) stays completely clear.
          {
            const corrWalnut = new THREE.MeshStandardMaterial({ color: 0x8a6844, map: woodTexture(), roughness: 0.55 });
            const corrBrass = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.28, metalness: 0.85 });
            const corrZ = partZ + 0.1; // corridor face of the partition
            for (const sgn of [-1, 1]) {
              const segCx = sgn * (doorW / 2 + partSegW / 2);
              const wains = new THREE.Mesh(new THREE.BoxGeometry(partSegW - 0.24, 1.02, 0.05), corrWalnut);
              wains.position.set(segCx, 0.73, corrZ);
              wains.castShadow = true;
              g.add(wains);
              const wainsTrim = new THREE.Mesh(new THREE.BoxGeometry(partSegW - 0.24, 0.045, 0.065), corrBrass);
              wainsTrim.position.set(segCx, 1.265, corrZ);
              g.add(wainsTrim);
            }
            // Brass frame around the ONE main door + gold plate above it.
            for (const sgn of [-1, 1]) {
              const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.2, 0.06), corrBrass);
              jamb.position.set(sgn * (doorW / 2 + 0.085), 1.32, corrZ);
              g.add(jamb);
            }
            const lintelB = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.26, 0.09, 0.06), corrBrass);
            lintelB.position.set(0, 2.465, corrZ);
            g.add(lintelB);
            const doorPlateCanvas = document.createElement("canvas");
            doorPlateCanvas.width = 512;
            doorPlateCanvas.height = 96;
            const dpctx = doorPlateCanvas.getContext("2d");
            if (dpctx) {
              const grad = dpctx.createLinearGradient(0, 0, 0, 96);
              grad.addColorStop(0, "#e8c860");
              grad.addColorStop(0.5, "#c9a227");
              grad.addColorStop(1, "#a8821c");
              dpctx.fillStyle = grad;
              dpctx.fillRect(0, 0, 512, 96);
              dpctx.strokeStyle = "#6e5510";
              dpctx.lineWidth = 6;
              dpctx.strokeRect(4, 4, 504, 88);
              dpctx.fillStyle = "#3d2c05";
              dpctx.font = "bold 36px Georgia, serif";
              dpctx.textAlign = "center";
              dpctx.textBaseline = "middle";
              dpctx.fillText("PHÒNG CHỦ TỊCH", 256, 50);
            }
            const doorPlateTex = new THREE.CanvasTexture(doorPlateCanvas);
            doorPlateTex.colorSpace = THREE.SRGBColorSpace;
            const doorPlate = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.36), new THREE.MeshBasicMaterial({ map: doorPlateTex }));
            doorPlate.position.set(0, 2.78, corrZ + 0.01);
            g.add(doorPlate);
            // Two framed paintings on the partition, corridor side.
            const corrPainting = (cx: number, hueShift: number) => {
              const grp = new THREE.Group();
              const fr = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.15, 0.06), corrWalnut);
              fr.castShadow = true;
              grp.add(fr);
              const pc = document.createElement("canvas");
              pc.width = 512;
              pc.height = 288;
              const px2 = pc.getContext("2d");
              if (px2) {
                const sky = px2.createLinearGradient(0, 0, 0, 180);
                sky.addColorStop(0, hueShift === 0 ? "#f7d774" : "#a8c8ec");
                sky.addColorStop(1, hueShift === 0 ? "#e2703a" : "#5d7fa8");
                px2.fillStyle = sky;
                px2.fillRect(0, 0, 512, 288);
                px2.fillStyle = "#5d3a56";
                px2.beginPath();
                px2.moveTo(0, 190);
                px2.lineTo(150 + hueShift, 70);
                px2.lineTo(300, 190);
                px2.closePath();
                px2.fill();
                px2.fillStyle = "#3f7a4e";
                px2.fillRect(0, 190, 512, 98);
                px2.fillStyle = "#fff3b0";
                px2.beginPath();
                px2.arc(400 - hueShift, 62, 26, 0, Math.PI * 2);
                px2.fill();
              }
              const ptex = new THREE.CanvasTexture(pc);
              ptex.colorSpace = THREE.SRGBColorSpace;
              const face = new THREE.Mesh(new THREE.PlaneGeometry(1.84, 0.99), new THREE.MeshBasicMaterial({ map: ptex }));
              face.position.z = 0.04;
              grp.add(face);
              grp.position.set(cx, 1.98, corrZ);
              return grp;
            };
            g.add(corrPainting(-4.35, 0));
            g.add(corrPainting(4.35, 60));
            // Four warm wall sconces along the partition.
            const sconceShadeMat = new THREE.MeshStandardMaterial({
              color: 0xf2c14e, roughness: 0.5, emissive: 0xffc978, emissiveIntensity: 0.9, side: THREE.DoubleSide,
            });
            for (const sx of [-6.4, -2.3, 2.3, 6.4]) {
              const base = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.05), corrBrass);
              base.position.set(sx, 2.32, corrZ + 0.02);
              const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.17, 12, 1, true), sconceShadeMat);
              shade.position.set(sx, 2.44, corrZ + 0.09);
              g.add(base, shade);
            }
            // Deep-red runner with gold borders on the walking
            // line — refitted to the corridor's cut extent: it
            // now lies wholly on the corridor floor between the
            // partition and the CUT EDGE (local z +2.12…+4.12);
            // it no longer reaches past the stair-head line over
            // the channels or the pond.
            const runner = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.012, 2.0), new THREE.MeshStandardMaterial({ color: 0x7a2230, roughness: 0.95 }));
            runner.position.set(0, 0.256, 3.12);
            runner.receiveShadow = true;
            g.add(runner);
            for (const tz of [2.06, 4.18]) {
              const trim = new THREE.Mesh(new THREE.BoxGeometry(12.84, 0.014, 0.16), corrBrass);
              trim.position.set(0, 0.258, tz);
              g.add(trim);
            }
            for (const tx of [-6.38, 6.38]) {
              const trim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.014, 2.0), corrBrass);
              trim.position.set(tx, 0.258, 3.12);
              g.add(trim);
            }
            // Warm ceiling panels over the corridor + a brass
            // chandelier over the door approach + one warm light.
            const corrCeilMat = new THREE.MeshStandardMaterial({
              color: 0x35355a, emissive: 0xffd9a0, emissiveIntensity: 0.9, roughness: 0.4,
            });
            for (const px of [-4.4, 0, 4.4]) {
              const panel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.9), corrCeilMat);
              panel.position.set(px, 3.15, 4.28);
              g.add(panel);
            }
            const chand = new THREE.Group();
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), corrBrass);
            rod.position.y = 3.3;
            chand.add(rod);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 28), corrBrass);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 3.02;
            chand.add(ring);
            const bulbMat = new THREE.MeshStandardMaterial({
              color: 0xfff1cf, emissive: 0xffc978, emissiveIntensity: 1.05, roughness: 0.3,
            });
            for (let bi = 0; bi < 6; bi++) {
              const a = (bi / 6) * Math.PI * 2;
              const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), bulbMat);
              bulb.position.set(Math.cos(a) * 0.42, 3.1, Math.sin(a) * 0.42);
              chand.add(bulb);
            }
            const centreBulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), bulbMat);
            centreBulb.position.y = 2.94;
            chand.add(centreBulb);
            chand.position.set(0, 0, 4.28);
            g.add(chand);
            const corrLight = new THREE.PointLight(0xffd9a0, 9, 10, 1.6);
            corrLight.position.set(0, 2.7, 4.28);
            g.add(corrLight);
            // 2 CÂY GẦN CỬA DỜI RA 2 GÓC PHÒNG (Chủ tịch đính
            // chính mới nhất): the two plants that used to flank
            // the main door (x ±1.6, crowding the doorway and the
            // door approach) now stand in the corridor's TWO FAR
            // CORNERS, tight against the partition at its two ends
            // (x ±(room.w/2 − 0.85)): nothing stands near the door
            // any more — the ONE main door, its approach and the
            // corridor's walking band stay completely clear, and
            // the trees dress the two corners instead.
            for (const sgn of [-1, 1]) {
              const cp = buildPlant();
              cp.scale.setScalar(0.95);
              cp.position.set(sgn * (room.w / 2 - 0.85), 0.22, partZ + 0.55);
              g.add(cp);
              cp.traverse((o) => {
                if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) {
                  plantsRef.current.push(o);
                }
              });
            }
          }
        } else if (room.x !== 0) {
          // Department room — and the Trợ lý / Thư ký rooms, now set
          // back on the two flanks of the executive zone: the door
          // sits in the wall that faces the central hall (inner
          // rows) or the wide lane between the two rows (outer
          // rows) — never on the outward-facing front wall. The
          // front wall and the outer wall stay solid glass.
          const side = room.x < 0 ? 1 : -1;
          const outerX = -side * (room.w / 2 - 0.07);
          const innerX = side * (room.w / 2 - 0.07);
          mkWall(room.w, 0.14, 0, frontZ);
          mkWall(0.14, room.d, outerX, 0);
          const segD = (room.d - doorW) / 2;
          mkWall(0.14, segD, innerX, -(doorW / 2 + segD / 2));
          mkWall(0.14, segD, innerX, doorW / 2 + segD / 2);
          addSideDoor(side);
        } else {
          // Front-wall door: only the Tổng giám đốc room (centred on
          // the axis) — its door belongs on the front wall, opening
          // onto the empty forecourt. The Tổng giám đốc room's front
          // wall is the near-clear glass.
          mkWall(0.14, room.d, -room.w / 2 + 0.07, 0);
          mkWall(0.14, room.d, room.w / 2 - 0.07, 0);
          const segW = (room.w - doorW) / 2;
          const frontMat = room.id === "ceo" ? clearGlassMat : glassMat;
          mkWall(segW, 0.14, -(doorW / 2 + segW / 2), frontZ, frontMat);
          mkWall(segW, 0.14, doorW / 2 + segW / 2, frontZ, frontMat);
          addDoor(0);
        }
      }

      // Architectural micro-details (visual upgrade): baseboards
      // where walls meet the floor, brushed-metal mullions dividing
      // the glass, recessed LED cove strips under the ceiling line,
      // and a framed art piece on the back wall — the details that
      // kill the "plain box" look. Pure decoration: nothing here is
      // pickable and no layout dimension changes.
      if (!isPost(room.id)) {
        const backZ = -room.d / 2 + 0.155;
        const frontZ2 = room.d / 2 - 0.07;
        // Baseboard along the back wall (every walled room).
        const bbBack = new THREE.Mesh(new THREE.BoxGeometry(room.w - 0.1, 0.14, 0.03), baseMat);
        bbBack.position.set(0, 0.29, backZ);
        g.add(bbBack);
        // Baseboards along both side walls (the Chủ tịch room's
        // flanks are open railing, so it keeps only the back one).
        if (room.id !== "chairman") {
          for (const ss of [-1, 1]) {
            const bbSide = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, room.d - 0.1), baseMat);
            bbSide.position.set(ss * (room.w / 2 - 0.155), 0.29, 0);
            g.add(bbSide);
          }
        }
        // Mullions on the back glass: vertical bars + a mid rail.
        const nMul = Math.max(2, Math.min(6, Math.round(room.w / 2.4)));
        for (let i = 0; i < nMul; i++) {
          const mx = -room.w / 2 + ((i + 0.5) * room.w) / nMul;
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.055, wallH, 0.055), glassEdgeMat);
          bar.position.set(mx, wallH / 2 + 0.22, -room.d / 2 + 0.13);
          g.add(bar);
        }
        const railB = new THREE.Mesh(new THREE.BoxGeometry(room.w - 0.1, 0.055, 0.055), glassEdgeMat);
        railB.position.set(0, 1.55, -room.d / 2 + 0.13);
        g.add(railB);
        // Mullions on the front glass too — only where the front
        // wall is one full sheet (side-door rooms); a front door
        // would collide with the bars.
        if (room.x !== 0) {
          for (let i = 0; i < nMul; i++) {
            const mx = -room.w / 2 + ((i + 0.5) * room.w) / nMul;
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.055, wallH, 0.055), glassEdgeMat);
            bar.position.set(mx, wallH / 2 + 0.22, frontZ2 - 0.06);
            g.add(bar);
          }
          const railF = new THREE.Mesh(new THREE.BoxGeometry(room.w - 0.1, 0.055, 0.055), glassEdgeMat);
          railF.position.set(0, 1.55, frontZ2 - 0.06);
          g.add(railF);
        }
        // Recessed LED cove strips just under the ceiling line,
        // along the back wall — and the front wall too, except in
        // the Chủ tịch room whose front stands open.
        const coveB = new THREE.Mesh(new THREE.BoxGeometry(room.w - 0.5, 0.045, 0.045), ledMat);
        coveB.position.set(0, 2.76, -room.d / 2 + 0.24);
        g.add(coveB);
        if (room.id !== "chairman") {
          const coveF = new THREE.Mesh(new THREE.BoxGeometry(room.w - 0.5, 0.045, 0.045), ledMat);
          coveF.position.set(0, 2.76, frontZ2 - 0.17);
          g.add(coveF);
        }
        // Framed abstract art on the back wall of working rooms
        // (the Chủ tịch room has its own gold logo + corridor
        // paintings; the meeting room has its whiteboard).
        if (room.id !== "chairman" && room.id !== "meeting") {
          const artSeed = Math.abs(Math.round(room.x * 3 + room.z * 7)) + room.name.length;
          const frame = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 1.02, 0.05),
            new THREE.MeshStandardMaterial({ color: 0x2c2016, roughness: 0.5, map: woodTexture() }),
          );
          frame.position.set(room.w * 0.2, 1.72, -room.d / 2 + 0.17);
          const face = new THREE.Mesh(
            new THREE.PlaneGeometry(1.36, 0.88),
            new THREE.MeshStandardMaterial({ map: artTexture(artSeed), roughness: 0.6 }),
          );
          face.position.set(room.w * 0.2, 1.72, -room.d / 2 + 0.2);
          g.add(frame, face);
        }
      }

      // Ceiling light panels (emissive) + a real point light in active rooms.
      const ceilMat = new THREE.MeshStandardMaterial({
        color: 0x35355a,
        emissive: 0xfff3d6,
        emissiveIntensity: active ? 0.8 : 0.18,
        roughness: 0.4,
      });
      ceilMats.set(room.id, ceilMat);
      const panelCount = room.id === "chairman" ? 4 : room.w > 12 ? 3 : 2;
      if (!isPost(room.id)) {
        for (let i = 0; i < panelCount; i++) {
          const px = (i - (panelCount - 1) / 2) * (room.w / panelCount);
          // Chairman: panels over the desk band of his square
          // room.
          const panelZ = room.id === "chairman" ? -3.2 : 0;
          const panel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.8), ceilMat);
          panel.position.set(px, 3.15, panelZ);
          const rod = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6),
            glassEdgeMat,
          );
          rod.position.set(px, 3.36, panelZ);
          g.add(panel, rod);
        }
      }
      if (["chairman", "ceo", "director", "video", "meeting"].includes(room.id)) {
        const pl = new THREE.PointLight(0xffe9c4, active ? 6.5 : 2, 13, 1.6);
        if (room.id === "chairman") pl.distance = 16;
        pl.position.set(0, 2.9, 0);
        g.add(pl);
        ceilLights.set(room.id, pl);
      }

      // Room status beacon on the back wall.
      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0x333333,
        emissive: LAMP_COLORS[roomLamp[room.id] ?? "idle"],
        emissiveIntensity: 1.0,
        roughness: 0.4,
      });
      if (!isPost(room.id)) {
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), beaconMat);
        beacon.position.set(room.w / 2 - 0.55, 2.45, -room.d / 2 + 0.2);
        g.add(beacon);
      }
      roomLampMats.set(room.id, beaconMat);

      // Nhãn phòng trên 3D: CHỈ tên phòng ngắn gọn, không dòng
      // mô tả dài — dòng mô tả vị trí của phòng này nằm ở
      // ROOM_DESCRIPTIONS, chỉ hiện trong thẻ chi tiết phòng
      // khi bấm vào phòng.
      const label = makeLabelSprite(room.name, roomLamp[room.id] ?? "idle");
      const labelTex = (label.material as THREE.SpriteMaterial).map;
      if (labelTex) {
        roomLabelRef.current.set(room.id, { tex: labelTex as THREE.CanvasTexture, name: room.name });
      }
      // Front-row rooms put their label on the far side so it stays inside
      // the frame instead of clipping at the canvas bottom edge. The
      // Chairman label hangs over the back band of his square room.
      label.position.set(
        0,
        3.85,
        room.id === "chairman" ? -5.4 : room.z > 5 ? -room.d / 2 + 0.9 : room.d / 2 - 0.2,
      );
      g.add(label);

      roomFocus.set(room.id, {
        center: new THREE.Vector3(room.x, baseY + 0.5 - FLOOR_DROP, room.z),
        dist: Math.min(Math.max(room.w, room.d) * 1.25 + 5.5, 34),
      });

      // File storage + plant in every room: a walnut cabinet in the
      // Chủ tịch room, the standard open shelf elsewhere.
      if (room.id === "chairman") {
        const cab = buildWoodCabinet();
        cab.position.set(-room.w / 2 + 1.15, 0.22, -room.d / 2 + 0.5);
        g.add(cab);
      } else {
        const shelf = buildShelf();
        shelf.position.set(-room.w / 2 + 1.15, 0.22, -room.d / 2 + 0.45);
        g.add(shelf);
      }
      const plant = buildPlant();
      if (room.id === "chairman") plant.scale.setScalar(1.4);
      if (room.id === "chairman") {
        // DẸP CÂY CHẮN LỐI (Chủ tịch đính chính gấp): this plant
        // used to stand in the room's front-right corner — but
        // that corner lies inside the front CORRIDOR, right
        // where the right FLIPPED flight now climbs from its
        // open passage, so the tree blocked the way up the
        // stair and into the room.
        // It now stands in the front-right corner of the MAIN
        // CHAMBER, just behind the partition (local z =
        // partition − 0.95): a corner on no walkway — clear of
        // the corridor, both passages, the ONE main door and
        // the door-to-desk path. Trees only ever stand in
        // corners that block no path, no stair and no door.
        plant.position.set(room.w / 2 - 1.0, 0.22, room.d / 2 - 0.07 - 4.6 - 0.95);
      } else {
        // Every other room: front-right corner, clear of that
        // room's door (side wall, centre) and its desks.
        plant.position.set(room.w / 2 - 0.85, 0.22, room.d / 2 - 0.85);
      }
      g.add(plant);
      plant.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) {
          plantsRef.current.push(o);
        }
      });

      // Full dressing for every plain department room, exactly like the
      // reference image — no room left empty or sparse: on top of the
      // per-person workstations (desk, chair, monitor, desk lamp, desk
      // nameplate), the back-left shelf and the front-right plant that
      // every room already has, each of these rooms also gets a second
      // document shelf in the back-right corner, a second plant in the
      // front-left corner and a whiteboard on the back wall.
      if (
        ["strategy", "hr", "content", "marketing", "publish", "sales", "sound", "secretary", "clerical", "finance", "legal"].includes(room.id)
      ) {
        const shelf2 = buildShelf();
        shelf2.position.set(room.w / 2 - 1.15, 0.22, -room.d / 2 + 0.45);
        g.add(shelf2);
        const plant2 = buildPlant();
        plant2.position.set(-room.w / 2 + 0.85, 0.22, room.d / 2 - 0.85);
        g.add(plant2);
        plant2.traverse((o) => {
          if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) {
            plantsRef.current.push(o);
          }
        });
        const board2 = new THREE.Mesh(
          new THREE.BoxGeometry(2.4, 1.4, 0.07),
          new THREE.MeshStandardMaterial({ color: 0xe8e6f5, roughness: 0.35 }),
        );
        board2.position.set(1.55, 1.75, -room.d / 2 + 0.16);
        g.add(board2);
      }

      if (room.id === "video") {
        // Big editing/QC screen, kept low on the left of the back wall so it
        // never covers the Giám đốc · Đạo diễn label behind it.
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(4.4, 2.0, 0.14),
          new THREE.MeshStandardMaterial({ color: 0x0d0a24, roughness: 0.4 }),
        );
        frame.position.set(-1.7, 1.75, -room.d / 2 + 0.3);
        g.add(frame);
        const sCanvas = document.createElement("canvas");
        sCanvas.width = 640;
        sCanvas.height = 360;
        const sCtx = sCanvas.getContext("2d");
        const sTex = new THREE.CanvasTexture(sCanvas);
        sTex.colorSpace = THREE.SRGBColorSpace;
        screensRef.current.push({ g: sCtx, tex: sTex, heading: "MÀN HÌNH QC — PHÒNG VIDEO" });
        drawScreen(sCtx, sTex, null, "MÀN HÌNH QC — PHÒNG VIDEO");
        const screen = new THREE.Mesh(
          new THREE.PlaneGeometry(4.1, 1.75),
          new THREE.MeshBasicMaterial({ map: sTex, color: 0xd9d9d9 }),
        );
        screen.position.set(-1.7, 1.75, -room.d / 2 + 0.39);
        g.add(screen);
        // Whiteboard on the right wall.
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 1.5, 0.07),
          new THREE.MeshStandardMaterial({ color: 0xe8e6f5, roughness: 0.35 }),
        );
        board.position.set(room.w / 2 - 0.18, 1.7, 0.6);
        board.rotation.y = -Math.PI / 2;
        g.add(board);
        // Wall clock on the left wall — its hands run on the real clock.
        const clockFace = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.07, 24),
          new THREE.MeshStandardMaterial({ color: 0xf2f0fa, roughness: 0.4 }),
        );
        clockFace.rotation.z = Math.PI / 2;
        clockFace.position.set(-room.w / 2 + 0.2, 2.1, 0.8);
        const handMat = new THREE.MeshBasicMaterial({ color: 0x221a3e });
        const clockCenter = new THREE.Group();
        clockCenter.position.set(-room.w / 2 + 0.26, 2.1, 0.8);
        const mkHand = (len: number, wdt: number) => {
          const grp = new THREE.Group();
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, len, wdt), handMat);
          mesh.position.y = len / 2 - 0.03;
          grp.add(mesh);
          return grp;
        };
        const handH = mkHand(0.22, 0.055);
        const handM = mkHand(0.32, 0.04);
        const handS = mkHand(0.36, 0.018);
        clockCenter.add(handH, handM, handS);
        clockHandsRef.current = { h: handH, m: handM, s: handS };
        g.add(clockFace, clockCenter);
        // Printer on a stand in the back-right corner, status LED blinking.
        const printer = new THREE.Group();
        const pStand = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.38, 0.5),
          new THREE.MeshStandardMaterial({ color: 0x4c3a75, roughness: 0.85 }),
        );
        pStand.position.y = 0.19;
        const pBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.95, 0.34, 0.62),
          new THREE.MeshStandardMaterial({ color: 0xd9d5ea, roughness: 0.5 }),
        );
        pBody.position.y = 0.55;
        const paper = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.02, 0.42),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
        );
        paper.position.set(0, 0.74, 0.02);
        paper.rotation.x = -0.15;
        const ledMat = new THREE.MeshStandardMaterial({
          color: 0x222222,
          emissive: 0x22c55e,
          emissiveIntensity: 1.4,
          roughness: 0.4,
        });
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), ledMat);
        led.position.set(0.38, 0.62, 0.32);
        printer.add(pStand, pBody, paper, led);
        printer.position.set(room.w / 2 - 1.25, 0.22, -room.d / 2 + 0.95);
        printerLedRef.current = ledMat;
        g.add(printer);
        // QC standing check spot in front of the big screen.
        checkSpotsRef.current.set("qc", new THREE.Vector3(room.x - 1.2, 0.22, room.z - 1.5));
        checkSpotsRef.current.set("dao-dien", new THREE.Vector3(room.x + 0.2, 0.22, room.z - 1.3));
      }

      if (room.id === "director") {
        // The director's own QC screen on the back wall.
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(4.5, 2.0, 0.14),
          new THREE.MeshStandardMaterial({ color: 0x0d0a24, roughness: 0.4 }),
        );
        frame.position.set(1.6, 1.75, -room.d / 2 + 0.3);
        g.add(frame);
        const sCanvas = document.createElement("canvas");
        sCanvas.width = 640;
        sCanvas.height = 360;
        const sCtx = sCanvas.getContext("2d");
        const sTex = new THREE.CanvasTexture(sCanvas);
        sTex.colorSpace = THREE.SRGBColorSpace;
        screensRef.current.push({ g: sCtx, tex: sTex, heading: "MÀN HÌNH QC — ĐẠO DIỄN" });
        drawScreen(sCtx, sTex, null, "MÀN HÌNH QC — ĐẠO DIỄN");
        const screen = new THREE.Mesh(
          new THREE.PlaneGeometry(4.2, 1.75),
          new THREE.MeshBasicMaterial({ map: sTex, color: 0xd9d9d9 }),
        );
        screen.position.set(1.6, 1.75, -room.d / 2 + 0.39);
        g.add(screen);
      }

      if (room.id === "chairman") {
        // Executive suite — 16.0 wide (EXACTLY the central
        // hall's width) × 13.1 deep, centred on the Tổng giám
        // đốc axis, standing
        // on a LOW PODIUM (floor level CHAIR_LEVEL = 1.35 above
        // floor 1 — lowered right down from the old high block),
        // still far larger than any department room. The big walnut desk
        // stands in the back band (the chairman's workstation at
        // (0,-5.2), against the back wall), two guest chairs face
        // it across a wide red rug, a leather sofa with a round
        // coffee table sits along the left wall, walnut cabinets
        // and a bookshelf line the back wall, the two flags flank
        // the desk, a landscape painting hangs on the right wall,
        // and — KHÔNG CÒN BAN CÔNG / SẢNH NGOÀI — the room is
        // reached by the TWO FLIPPED STRAIGHT STAIRS: their feet
        // stand at the open passages in its low front railing
        // (where the old flights' heads used to arrive) and the
        // flights climb INTO the room along the interior
        // partition corridor to its ONE SINGLE MAIN DOOR at the
        // corridor's centre; no side doors, no flank stairs.
        const walnut = new THREE.MeshStandardMaterial({ color: 0xa87e52, map: woodTexture(), roughness: 0.5 });
        const leather = new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.75 });
        const brass = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.85 });

        // Deep-red executive rug under the desk area, framed by a
        // gold trim border (thảm đỏ viền vàng).
        const luxRug = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.035, 4.6), new THREE.MeshStandardMaterial({ color: 0x7a2230, roughness: 0.95 }));
        luxRug.position.set(0, 0.245, -4.05);
        luxRug.receiveShadow = true;
        const rugTrim = new THREE.Group();
        const trimMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.32, metalness: 0.7 });
        for (const tz of [-6.23, -1.87]) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(9.64, 0.014, 0.24), trimMat);
          strip.position.set(0, 0.256, tz);
          rugTrim.add(strip);
        }
        for (const tx of [-4.58, 4.58]) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.014, 4.6), trimMat);
          strip.position.set(tx, 0.256, -4.05);
          rugTrim.add(strip);
        }

        // L-return of the main desk (left side, reaching back toward
        // the back wall, matching the rotated desk the chairman sits
        // behind).
        const retTop = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 1.7), walnut);
        retTop.position.set(-1.7, 0.74, -5.6);
        retTop.castShadow = true;
        const retLeg = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.72, 0.08), walnut);
        retLeg.position.set(-1.7, 0.4, -6.4);

        // Tall leather back + headrest pad behind the chairman's seat.
        const highBack = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.05, 0.1), leather);
        highBack.position.set(0, 1.15, -6.25);
        highBack.castShadow = true;
        const headPad = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.08), leather);
        headPad.position.set(0, 1.72, -6.25);

        // Banker's lamp on the desk return: brass stem, green shade.
        const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.04, 12), brass);
        lampBase.position.set(-1.7, 0.81, -5.55);
        const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8), brass);
        lampStem.position.set(-1.7, 1.0, -5.55);
        const lampShade2 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.2, 0.16, 14, 1, true),
          new THREE.MeshStandardMaterial({ color: 0x1f6f4a, roughness: 0.4, emissive: 0x2e8f5f, emissiveIntensity: 0.35, side: THREE.DoubleSide }),
        );
        lampShade2.position.set(-1.7, 1.2, -5.55);

        // Leather guest sofa along the LEFT wall, with a round
        // reception table (bàn tròn tiếp khách) in front of it:
        // walnut disc top on a turned pedestal.
        const sofa = buildSofa(0x71452a);
        sofa.position.set(-room.w / 2 + 0.95, 0.22, -1.2);
        sofa.rotation.y = Math.PI / 2;
        const roundTable = (tx: number, tz: number, r: number) => {
          const grp = new THREE.Group();
          const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 22), walnut);
          top.position.y = 0.62;
          top.castShadow = true;
          const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 8, 28), brass);
          rim.rotation.x = Math.PI / 2;
          rim.position.y = 0.62;
          const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.56, 12), walnut);
          pedestal.position.y = 0.31;
          const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.05, 16), walnut);
          foot.position.y = 0.03;
          grp.add(top, rim, pedestal, foot);
          grp.position.set(tx, 0.22, tz);
          return grp;
        };
        const table = roundTable(-room.w / 2 + 2.4, -1.2, 0.52);

        // Second walnut cabinet at the back-right, behind the
        // chairman (the back-left one is added for every room above).
        const cab2 = buildWoodCabinet();
        cab2.position.set(room.w / 2 - 1.15, 0.22, -room.d / 2 + 0.5);

        // Bookshelf (giá sách) on the back wall, left of the flags:
        // walnut frame, three shelves of books, brass crown.
        const bookshelf = new THREE.Group();
        {
          const sideB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.42), walnut);
          sideB.position.set(-0.95, 1.1, 0);
          const sideB2 = sideB.clone();
          sideB2.position.x = 0.95;
          bookshelf.add(sideB, sideB2);
          const bookCols = [0x8e2f32, 0x2f5d8a, 0xc9a227, 0x3f7a4e, 0x6d4fa8, 0xd9d5ea, 0xb5524a];
          for (let sIdx = 0; sIdx < 3; sIdx++) {
            const shelfY = 0.35 + sIdx * 0.62;
            const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.42), walnut);
            board.position.set(0, shelfY, 0);
            bookshelf.add(board);
            let bx = -0.82;
            let bi = 0;
            while (bx < 0.7) {
              const bw = 0.09 + ((bi * 37 + sIdx * 13) % 5) * 0.02;
              const book = new THREE.Mesh(
                new THREE.BoxGeometry(bw, 0.42, 0.3),
                new THREE.MeshStandardMaterial({ color: bookCols[(bi + sIdx * 3) % bookCols.length], roughness: 0.8 }),
              );
              book.position.set(bx + bw / 2, shelfY + 0.24, 0);
              bookshelf.add(book);
              bx += bw + 0.015;
              bi++;
            }
          }
          const crownB = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.07, 0.46), brass);
          crownB.position.y = 2.24;
          bookshelf.add(crownB);
        }
        bookshelf.position.set(-2.35, 0.22, -room.d / 2 + 0.35);

        // Two leather guest chairs facing the desk.
        const guestChair = (cx: number) => {
          const grp = new THREE.Group();
          const seatM = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.09, 0.54), leather);
          seatM.position.set(0, 0.48, 0);
          seatM.castShadow = true;
          const backM = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.85, 0.1), leather);
          backM.position.set(0, 1.0, 0.27);
          backM.castShadow = true;
          grp.add(seatM, backM);
          grp.position.set(cx, 0.22, -3.9);
          return grp;
        };

        // Gold nameplate on the back wall above the desk.
        const plateCanvas = document.createElement("canvas");
        plateCanvas.width = 512;
        plateCanvas.height = 96;
        const pctx = plateCanvas.getContext("2d");
        if (pctx) {
          const grad = pctx.createLinearGradient(0, 0, 0, 96);
          grad.addColorStop(0, "#e8c860");
          grad.addColorStop(0.5, "#c9a227");
          grad.addColorStop(1, "#a8821c");
          pctx.fillStyle = grad;
          pctx.fillRect(0, 0, 512, 96);
          pctx.strokeStyle = "#6e5510";
          pctx.lineWidth = 6;
          pctx.strokeRect(4, 4, 504, 88);
          pctx.fillStyle = "#3d2c05";
          pctx.font = "bold 34px Georgia, serif";
          pctx.textAlign = "center";
          pctx.textBaseline = "middle";
          pctx.fillText("CHỦ TỊCH — HƯỞNG", 256, 50);
        }
        const plateTex = new THREE.CanvasTexture(plateCanvas);
        plateTex.colorSpace = THREE.SRGBColorSpace;
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.5), new THREE.MeshBasicMaterial({ map: plateTex }));
        plate.position.set(0, 2.8, -room.d / 2 + 0.16);

        // Landscape painting (tranh phong cảnh) on the RIGHT wall: a
        // wide framed canvas — mountains, sun and green fields — in a
        // dark walnut frame with a gold inner edge.
        const paintCanvas = document.createElement("canvas");
        paintCanvas.width = 512;
        paintCanvas.height = 288;
        const cctx = paintCanvas.getContext("2d");
        if (cctx) {
          const sky = cctx.createLinearGradient(0, 0, 0, 170);
          sky.addColorStop(0, "#f7d774");
          sky.addColorStop(0.55, "#f2a65e");
          sky.addColorStop(1, "#e2703a");
          cctx.fillStyle = sky;
          cctx.fillRect(0, 0, 512, 288);
          cctx.fillStyle = "#fff3b0";
          cctx.beginPath();
          cctx.arc(368, 74, 30, 0, Math.PI * 2);
          cctx.fill();
          cctx.fillStyle = "#7a4a63";
          cctx.beginPath();
          cctx.moveTo(0, 168);
          cctx.lineTo(110, 84);
          cctx.lineTo(215, 168);
          cctx.closePath();
          cctx.fill();
          cctx.fillStyle = "#5d3a56";
          cctx.beginPath();
          cctx.moveTo(140, 176);
          cctx.lineTo(268, 78);
          cctx.lineTo(392, 176);
          cctx.closePath();
          cctx.fill();
          cctx.fillStyle = "#8a5a44";
          cctx.beginPath();
          cctx.moveTo(300, 182);
          cctx.lineTo(420, 104);
          cctx.lineTo(512, 182);
          cctx.closePath();
          cctx.fill();
          const fields = cctx.createLinearGradient(0, 176, 0, 288);
          fields.addColorStop(0, "#5e8f3e");
          fields.addColorStop(1, "#2f5d2a");
          cctx.fillStyle = fields;
          cctx.fillRect(0, 176, 512, 112);
          cctx.strokeStyle = "rgba(240,220,150,0.55)";
          cctx.lineWidth = 3;
          cctx.beginPath();
          cctx.moveTo(196, 288);
          cctx.quadraticCurveTo(268, 232, 330, 182);
          cctx.stroke();
        }
        const paintTex = new THREE.CanvasTexture(paintCanvas);
        paintTex.colorSpace = THREE.SRGBColorSpace;
        const paintFrame = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 2.3, 4.6),
          new THREE.MeshStandardMaterial({ color: 0x3d2a16, roughness: 0.55 }),
        );
        paintFrame.position.set(room.w / 2 - 0.14, 2.0, -0.5);
        const paintTrim = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 2.1, 4.4),
          new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.6 }),
        );
        paintTrim.position.set(room.w / 2 - 0.145, 2.0, -0.5);
        const painting = new THREE.Mesh(
          new THREE.PlaneGeometry(4.24, 1.94),
          new THREE.MeshBasicMaterial({ map: paintTex }),
        );
        painting.position.set(room.w / 2 - 0.2, 2.0, -0.5);
        painting.rotation.y = -Math.PI / 2;

        // Two flags flanking the desk against the back wall: the
        // national flag — red field, gold star (cờ đỏ sao vàng) — on
        // the LEFT of the desk, the black Muse company flag on the
        // RIGHT.
        const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.7, 8), brass);
        flagPole.position.set(-2.9, 1.35, -room.d / 2 + 0.75);
        const flagCanvas = document.createElement("canvas");
        flagCanvas.width = 256;
        flagCanvas.height = 170;
        const fctx = flagCanvas.getContext("2d");
        if (fctx) {
          fctx.fillStyle = "#da251d";
          fctx.fillRect(0, 0, 256, 170);
          fctx.fillStyle = "#ffde00";
          fctx.beginPath();
          const cxS = 128;
          const cyS = 85;
          const rOut = 34;
          const rIn = 13.6;
          for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? rOut : rIn;
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const px = cxS + r * Math.cos(a);
            const py = cyS + r * Math.sin(a);
            if (i === 0) fctx.moveTo(px, py);
            else fctx.lineTo(px, py);
          }
          fctx.closePath();
          fctx.fill();
        }
        const flagTex = new THREE.CanvasTexture(flagCanvas);
        flagTex.colorSpace = THREE.SRGBColorSpace;
        const flag = new THREE.Mesh(
          new THREE.PlaneGeometry(1.2, 0.8),
          new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }),
        );
        flag.position.set(-2.28, 2.25, -room.d / 2 + 0.75);

        // Dark companion flag on the right of the desk.
        const flag2Pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.7, 8), brass);
        flag2Pole.position.set(2.9, 1.35, -room.d / 2 + 0.75);
        const flag2Canvas = document.createElement("canvas");
        flag2Canvas.width = 256;
        flag2Canvas.height = 170;
        const f2ctx = flag2Canvas.getContext("2d");
        if (f2ctx) {
          f2ctx.fillStyle = "#14161f";
          f2ctx.fillRect(0, 0, 256, 170);
          f2ctx.strokeStyle = "#e8c860";
          f2ctx.lineWidth = 8;
          f2ctx.strokeRect(6, 6, 244, 158);
          f2ctx.fillStyle = "#e8c860";
          f2ctx.font = "bold 52px Georgia, serif";
          f2ctx.textAlign = "center";
          f2ctx.textBaseline = "middle";
          f2ctx.fillText("MUSE", 128, 72);
          f2ctx.font = "bold 22px Georgia, serif";
          f2ctx.fillText("COMPANY", 128, 118);
        }
        const flag2Tex = new THREE.CanvasTexture(flag2Canvas);
        flag2Tex.colorSpace = THREE.SRGBColorSpace;
        const flag2 = new THREE.Mesh(
          new THREE.PlaneGeometry(1.2, 0.8),
          new THREE.MeshStandardMaterial({ map: flag2Tex, side: THREE.DoubleSide, roughness: 0.9 }),
        );
        flag2.position.set(2.28, 2.25, -room.d / 2 + 0.75);

        // Brass chandelier (đèn chùm) over the main desk.
        const warmGlowMat = new THREE.MeshStandardMaterial({
          color: 0x333333,
          emissive: 0xffc978,
          emissiveIntensity: 1.3,
          roughness: 0.4,
        });
        const chandelier = new THREE.Group();
        {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), brass);
          stem.position.y = 0.28;
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 10, 28), brass);
          ring.rotation.x = Math.PI / 2;
          chandelier.add(stem, ring);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), warmGlowMat);
            bulb.position.set(Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55);
            chandelier.add(bulb);
            const drop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), brass);
            drop.position.set(Math.cos(a) * 0.55, -0.13, Math.sin(a) * 0.55);
            chandelier.add(drop);
          }
          const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), warmGlowMat);
          core.position.y = -0.04;
          chandelier.add(core);
        }
        chandelier.position.set(0, 2.82, -4.6);

        // Warm wall sconces (đèn tường) along the back wall.
        const sconces = new THREE.Group();
        for (const sxPos of [-1.9, 1.9]) {
          const mount = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.07), brass);
          mount.position.set(sxPos, 2.35, -room.d / 2 + 0.14);
          const shade = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), warmGlowMat);
          shade.position.set(sxPos, 2.44, -room.d / 2 + 0.25);
          sconces.add(mount, shade);
        }

        // KHÔNG CÒN BAN CÔNG / SẢNH NGOÀI (Chủ tịch đính chính):
        // no deck stands in front of this room — its front line
        // carries only the LOW handrail-height railing, and the
        // two FLIPPED straight stairs stand with their FEET at
        // that front line's two open passages and climb INTO
        // the room; inside, the partition corridor leads to the
        // ONE main door; both flanks are plain glass with no
        // door and no stair.
        // --- TRANG TRÍ BỔ SUNG (Chủ tịch chốt: phòng Chủ tịch phải đầy
        // đủ, sang trọng, đẳng cấp HƠN HẲN Phòng Tổng giám đốc — không
        // trống vắng, không nghèo hơn phòng tổng): tủ trưng bày cúp
        // vàng, bộ sofa tiếp khách thứ hai bên phải, logo MUSE vàng,
        // đèn chùm thứ hai, quả địa cầu, đồng hồ vàng, bộ ấm trà, đèn
        // sàn, cây lớn thứ hai, credenza vách trái, phụ kiện bàn.

        // Tủ trưng bày vách sau (giữa cờ công ty và tủ gỗ phải): khung
        // gỗ óc chó, mặt kính, 3 tầng cúp vàng + bằng khen đóng khung.
        const displayCab = new THREE.Group();
        {
          const backP = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.15, 0.06), walnut);
          backP.position.set(0, 1.08, -0.2);
          const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.15, 0.46), walnut);
          sideL.position.set(-0.87, 1.08, 0);
          const sideR = sideL.clone();
          sideR.position.x = 0.87;
          const topP = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.07, 0.46), brass);
          topP.position.set(0, 2.18, 0);
          const glass = new THREE.Mesh(
            new THREE.BoxGeometry(1.66, 2.0, 0.02),
            new THREE.MeshStandardMaterial({ color: 0xbfe0ff, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.22 }),
          );
          glass.position.set(0, 1.08, 0.22);
          displayCab.add(backP, sideL, sideR, topP, glass);
          for (let sIdx = 0; sIdx < 3; sIdx++) {
            const shelfY = 0.32 + sIdx * 0.62;
            const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.045, 0.4), walnut);
            shelf.position.set(0, shelfY, 0);
            displayCab.add(shelf);
            for (let cIdx = 0; cIdx < 3; cIdx++) {
              const cx = -0.52 + cIdx * 0.52;
              if ((sIdx + cIdx) % 3 === 2) {
                const awardTrim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.02), brass);
                awardTrim.position.set(cx, shelfY + 0.22, 0.005);
                const award = new THREE.Mesh(
                  new THREE.BoxGeometry(0.3, 0.38, 0.03),
                  new THREE.MeshStandardMaterial({ color: 0xf5efdc, roughness: 0.5 }),
                );
                award.position.set(cx, shelfY + 0.22, 0.02);
                displayCab.add(awardTrim, award);
              } else {
                const cup = new THREE.Group();
                const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.5 }));
                base.position.y = 0.025;
                const stemC = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.09, 10), brass);
                stemC.position.y = 0.09;
                const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.055, 0.17, 14, 1, true), brass);
                bowl.position.y = 0.22;
                const rimC = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 8, 18), brass);
                rimC.rotation.x = Math.PI / 2;
                rimC.position.y = 0.305;
                cup.add(base, stemC, bowl, rimC);
                cup.position.set(cx, shelfY + 0.03, 0.02);
                displayCab.add(cup);
              }
            }
          }
        }
        displayCab.position.set(4.55, 0.22, -room.d / 2 + 0.48);

        // Bộ sofa tiếp khách THỨ HAI dọc vách phải (dưới bức tranh lớn):
        // sofa da + bàn tròn + thảm đỏ viền vàng riêng — cân đối với bộ
        // bên trái, lấp hẳn khoảng trống nửa phải của phòng.
        const sofa2 = buildSofa(0x71452a);
        sofa2.position.set(room.w / 2 - 0.95, 0.22, -0.6);
        sofa2.rotation.y = -Math.PI / 2;
        const table2 = roundTable(room.w / 2 - 2.4, -0.6, 0.52);
        const loungeTrim = new THREE.Mesh(new THREE.BoxGeometry(4.56, 0.012, 3.76), trimMat);
        loungeTrim.position.set(5.7, 0.232, -0.6);
        const loungeRug = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.03, 3.6), new THREE.MeshStandardMaterial({ color: 0x6d1f2b, roughness: 0.95 }));
        loungeRug.position.set(5.7, 0.238, -0.6);
        loungeRug.receiveShadow = true;

        // Logo MUSE bằng vàng trên vách trái: đĩa đồng thau khắc chữ
        // MUSE COMPANY — điểm nhấn thương hiệu của phòng Chủ tịch.
        const logoCanvas = document.createElement("canvas");
        logoCanvas.width = 256;
        logoCanvas.height = 256;
        const lctx = logoCanvas.getContext("2d");
        if (lctx) {
          lctx.fillStyle = "#17130f";
          lctx.beginPath();
          lctx.arc(128, 128, 126, 0, Math.PI * 2);
          lctx.fill();
          lctx.strokeStyle = "#d4af37";
          lctx.lineWidth = 7;
          lctx.beginPath();
          lctx.arc(128, 128, 112, 0, Math.PI * 2);
          lctx.stroke();
          lctx.lineWidth = 2.5;
          lctx.beginPath();
          lctx.arc(128, 128, 98, 0, Math.PI * 2);
          lctx.stroke();
          lctx.fillStyle = "#e8c860";
          lctx.font = "bold 62px Georgia, serif";
          lctx.textAlign = "center";
          lctx.textBaseline = "middle";
          lctx.fillText("MUSE", 128, 112);
          lctx.font = "bold 25px Georgia, serif";
          lctx.fillText("COMPANY", 128, 162);
        }
        const logoTex = new THREE.CanvasTexture(logoCanvas);
        logoTex.colorSpace = THREE.SRGBColorSpace;
        const logoDisc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.85, 0.85, 0.07, 36),
          new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.28, metalness: 0.85 }),
        );
        logoDisc.rotation.z = Math.PI / 2;
        logoDisc.position.set(-room.w / 2 + 0.16, 2.2, -3.6);
        const logoFace = new THREE.Mesh(new THREE.CircleGeometry(0.8, 36), new THREE.MeshBasicMaterial({ map: logoTex }));
        logoFace.rotation.y = Math.PI / 2;
        logoFace.position.set(-room.w / 2 + 0.21, 2.2, -3.6);
        // LED ring glowing behind the gold MUSE disc.
        const logoRing = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.028, 8, 40), ledMat);
        logoRing.rotation.y = Math.PI / 2;
        logoRing.position.set(-room.w / 2 + 0.13, 2.2, -3.6);
        g.add(logoRing);

        // Đèn chùm THỨ HAI giữa phòng (khu tiếp khách), cùng tông đồng
        // thau + bóng ấm với đèn chính trên bàn Chủ tịch.
        const chandelier2 = new THREE.Group();
        {
          const stem2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 8), brass);
          stem2.position.y = 0.25;
          const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 10, 26), brass);
          ring2.rotation.x = Math.PI / 2;
          chandelier2.add(stem2, ring2);
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const bulb2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), warmGlowMat);
            bulb2.position.set(Math.cos(a) * 0.42, 0.08, Math.sin(a) * 0.42);
            chandelier2.add(bulb2);
          }
          const core2 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), warmGlowMat);
          core2.position.y = -0.03;
          chandelier2.add(core2);
        }
        chandelier2.position.set(0, 2.85, -1.0);

        // Quả địa cầu trên chân đồng cạnh tủ trưng bày.
        const globe = new THREE.Group();
        {
          const gStand = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.62, 10), brass);
          gStand.position.y = 0.31;
          const gFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.05, 14), brass);
          gFoot.position.y = 0.03;
          const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.34, 20, 14),
            new THREE.MeshStandardMaterial({ color: 0x2e6da4, roughness: 0.35 }),
          );
          sphere.position.y = 0.95;
          sphere.rotation.z = 0.41;
          const land = new THREE.Mesh(
            new THREE.SphereGeometry(0.345, 12, 8, 0.6, 1.5, 0.7, 1.1),
            new THREE.MeshStandardMaterial({ color: 0x3f7a4e, roughness: 0.6 }),
          );
          land.position.y = 0.95;
          land.rotation.z = 0.41;
          globe.add(gStand, gFoot, sphere, land);
        }
        globe.position.set(3.15, 0.22, -5.7);

        // Đồng hồ viền vàng trên vách phải.
        const wallClock = new THREE.Group();
        {
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 28), brass);
          rim.rotation.z = Math.PI / 2;
          const face = new THREE.Mesh(
            new THREE.CircleGeometry(0.37, 28),
            new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.4 }),
          );
          face.rotation.y = -Math.PI / 2;
          face.position.x = -0.035;
          const handMat2 = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
          const handH2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.2, 0.045), handMat2);
          handH2.position.set(-0.045, 0.05, 0.02);
          handH2.rotation.x = 0.7;
          const handM2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.29, 0.032), handMat2);
          handM2.position.set(-0.045, 0.02, -0.1);
          handM2.rotation.x = -1.9;
          wallClock.add(rim, face, handH2, handM2);
        }
        wallClock.position.set(room.w / 2 - 0.15, 2.35, -3.9);

        // Bộ ấm trà trên bàn tròn tiếp khách bên trái: ấm + 2 chén.
        const teaSet = new THREE.Group();
        {
          const pot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.35 }));
          pot.scale.y = 0.78;
          pot.position.y = 0.07;
          const lid = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), brass);
          lid.position.y = 0.16;
          teaSet.add(pot, lid);
          for (const [cx2, cz2] of [[0.24, 0.1], [0.2, -0.16]] as const) {
            const cupT = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.032, 0.055, 12), new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.4 }));
            cupT.position.set(cx2, 0.028, cz2);
            teaSet.add(cupT);
          }
        }
        teaSet.position.set(-room.w / 2 + 2.4, 0.87, -1.2);

        // Đèn sàn ấm cạnh sofa trái.
        const floorLamp = new THREE.Group();
        {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 8), brass);
          pole.position.y = 0.75;
          const shadeF = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 0.24, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.5, emissive: 0xffc978, emissiveIntensity: 0.5, side: THREE.DoubleSide }));
          shadeF.position.y = 1.56;
          const footF = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.04, 14), brass);
          footF.position.y = 0.02;
          floorLamp.add(pole, shadeF, footF);
        }
        floorLamp.position.set(-room.w / 2 + 0.75, 0.22, -2.75);

        // Cây lớn THỨ HAI ở góc trước-trái khoang chính (đối xứng cây
        // góc phải; không chắn cửa chính giữa, không chắn hành lang).
        const plant2 = buildPlant();
        plant2.scale.setScalar(1.4);
        plant2.position.set(-room.w / 2 + 1.0, 0.22, room.d / 2 - 0.07 - 4.6 - 0.95);
        plant2.traverse((o) => {
          if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) {
            plantsRef.current.push(o);
          }
        });

        // Credenza (tủ thấp dài) dọc vách trái sau sofa, mặt tủ bày
        // bình gốm + hộp trang trí vàng.
        const credenza = new THREE.Group();
        {
          const bodyC = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 2.7), walnut);
          bodyC.position.y = 0.39;
          bodyC.castShadow = true;
          const topC = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 2.8), brass);
          topC.position.y = 0.8;
          credenza.add(bodyC, topC);
          const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.42, 12), new THREE.MeshStandardMaterial({ color: 0x2f5d8a, roughness: 0.3 }));
          vase.position.set(0, 1.03, -0.8);
          const vase2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.32, 12), new THREE.MeshStandardMaterial({ color: 0x8e2f32, roughness: 0.3 }));
          vase2.position.set(0, 0.98, -0.35);
          const boxDeco = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.42), brass);
          boxDeco.position.set(0, 0.9, 0.55);
          credenza.add(vase, vase2, boxDeco);
        }
        credenza.position.set(-room.w / 2 + 0.55, 0.22, -4.6);

        // Phụ kiện trên bàn L: ống bút vàng + khay hồ sơ da.
        const penHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.11, 12), brass);
        penHolder.position.set(-1.42, 0.86, -5.78);
        const docTray = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.46), leather);
        docTray.position.set(-2.02, 0.83, -5.3);
        const docPaper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.015, 0.42), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
        docPaper.position.set(-2.02, 0.865, -5.3);

        g.add(luxRug, rugTrim, retTop, retLeg, highBack, headPad, lampBase, lampStem, lampShade2, sofa, table, cab2, bookshelf, guestChair(-0.8), guestChair(0.8), plate, paintFrame, paintTrim, painting, flagPole, flag, flag2Pole, flag2, chandelier, sconces);
        g.add(displayCab, sofa2, table2, loungeRug, loungeTrim, logoDisc, logoFace, chandelier2, globe, wallClock, teaSet, floorLamp, plant2, credenza, penHolder, docTray, docPaper);
      }

      if (room.id === "ceo") {
        // A guest sofa along the front-right of the Tổng giám đốc room,
        // clear of the door swing and of the Trợ lý desk on the
        // room's right side.
        const sofa = buildSofa(0x44508e);
        sofa.position.set(3.4, 0.22, room.d / 2 - 0.85);
        sofa.rotation.y = Math.PI;
        g.add(sofa);
        // Two guest chairs in front of the desk, facing the Tổng giám
        // đốc across it — as in the reference image.
        const guestMat = new THREE.MeshStandardMaterial({ color: 0x2e2456, roughness: 0.9 });
        for (const gx of [-0.8, 0.8]) {
          const seatM = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.52), guestMat);
          seatM.position.set(gx, 0.7, -0.3);
          seatM.castShadow = true;
          const backM = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.09), guestMat);
          backM.position.set(gx, 1.08, -0.04);
          backM.castShadow = true;
          g.add(seatM, backM);
        }
        // The long GUEST / MEETING TABLE lives INSIDE the room, on
        // its left side, laid LENGTHWISE along the room (long axis
        // north–south) for the Tổng giám đốc to receive guests —
        // it used to stand out on the open floor in front of the room
        // and block the way; the strip in front of the room is now
        // completely empty. Chairs run along both long sides, and
        // the presentation screen + whiteboard hang on the inside of
        // the front wall at the foot of the table, facing in.
        const guestTopMat = new THREE.MeshStandardMaterial({ color: 0x74552f, roughness: 0.6 });
        const guestLegMat = new THREE.MeshStandardMaterial({ color: 0x5d4630, roughness: 0.85 });
        const guestTop = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.09, 3.4), guestTopMat);
        guestTop.position.set(-2.9, 0.78, 0.1);
        guestTop.castShadow = true;
        g.add(guestTop);
        for (const lz of [-1.3, 1.5]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.76, 0.14), guestLegMat);
          leg.position.set(-2.9, 0.39, lz);
          leg.castShadow = true;
          g.add(leg);
        }
        const guestRunner = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.02, 3.1),
          new THREE.MeshStandardMaterial({ color: 0x8a2f35, roughness: 0.9 }),
        );
        guestRunner.position.set(-2.9, 0.835, 0.1);
        g.add(guestRunner);
        const guestChair = (cx: number, cz: number, rotY: number) => {
          const seatM = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.48), guestMat);
          seatM.position.set(cx, 0.5, cz);
          seatM.castShadow = true;
          const backM = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.07), guestMat);
          backM.position.set(cx, 0.82, cz);
          backM.rotation.y = rotY;
          backM.translateZ(0.26);
          backM.castShadow = true;
          g.add(seatM, backM);
        };
        for (const cz of [-1.15, 0.1, 1.35]) {
          guestChair(-3.82, cz, -Math.PI / 2); // west side, facing the table
          guestChair(-1.98, cz, Math.PI / 2); // east side, facing the table
        }
        const scrFrame = new THREE.Mesh(
          new THREE.BoxGeometry(2.7, 1.55, 0.09),
          new THREE.MeshStandardMaterial({ color: 0x0d0a24, roughness: 0.4 }),
        );
        scrFrame.position.set(-2.9, 1.62, room.d / 2 - 0.13);
        const scrFace = new THREE.Mesh(
          new THREE.PlaneGeometry(2.5, 1.38),
          new THREE.MeshStandardMaterial({ color: 0x1c2f57, emissive: 0x2b4a8f, emissiveIntensity: 0.55, roughness: 0.3 }),
        );
        scrFace.position.set(-2.9, 1.62, room.d / 2 - 0.19);
        scrFace.rotation.y = Math.PI;
        const boardFrame = new THREE.Mesh(
          new THREE.BoxGeometry(2.42, 1.47, 0.05),
          new THREE.MeshStandardMaterial({ color: 0x2e2456, roughness: 0.6 }),
        );
        boardFrame.position.set(1.75, 1.6, room.d / 2 - 0.11);
        const boardFace = new THREE.Mesh(
          new THREE.BoxGeometry(2.3, 1.35, 0.06),
          new THREE.MeshStandardMaterial({ color: 0xe8e6f5, roughness: 0.35 }),
        );
        boardFace.position.set(1.75, 1.6, room.d / 2 - 0.13);
        g.add(scrFrame, scrFace, boardFrame, boardFace);
      }

      // BẢNG CHUYÊN MÔN TREO TƯỜNG TRƯỚC (Chủ tịch đính chính — kiểm
      // tra trang trí phù hợp từng phòng): every plain department
      // room whose work is board-shaped gets ONE role board on its
      // front wall, always in the SAME slot (centred x=-0.9, clear
      // of the front-corner plants and of every desk) so no room
      // looks dressed more, less, or off-line than another — the
      // board's CONTENT is what differs per room.
      const addRoleBoard = (title: string, accent: string, draw: (c: CanvasRenderingContext2D) => void) => {
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(2.3, 1.4, 0.07),
          new THREE.MeshStandardMaterial({ color: 0x2e2456, roughness: 0.6 }),
        );
        frame.position.set(-0.9, 1.72, room.d / 2 - 0.16);
        g.add(frame);
        const cv = document.createElement("canvas");
        cv.width = 512;
        cv.height = 312;
        const cx2 = cv.getContext("2d");
        if (cx2) {
          cx2.fillStyle = "#f5f2ff";
          cx2.fillRect(0, 0, 512, 312);
          cx2.fillStyle = accent;
          cx2.fillRect(0, 0, 512, 54);
          cx2.fillStyle = "#ffffff";
          cx2.font = "bold 24px 'Segoe UI', system-ui, sans-serif";
          cx2.textAlign = "center";
          cx2.fillText(title, 256, 37);
          draw(cx2);
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        const face = new THREE.Mesh(new THREE.PlaneGeometry(2.16, 1.26), new THREE.MeshBasicMaterial({ map: tex }));
        face.position.set(-0.9, 1.72, room.d / 2 - 0.205);
        face.rotation.y = Math.PI;
        g.add(face);
      };

      if (room.id === "content") {
        // Phòng Nội dung: content-plan board — three topic columns
        // of story cards, the room's real working surface.
        addRoleBoard("KẾ HOẠCH NỘI DUNG", "#b07d4f", (c) => {
          const cols = ["KỊCH BẢN", "TIÊU ĐỀ", "THUMBNAIL"];
          cols.forEach((h, ci) => {
            const x = 26 + ci * 158;
            c.fillStyle = "#e8e2f5";
            c.fillRect(x, 74, 140, 216);
            c.fillStyle = "#221a3e";
            c.font = "bold 17px 'Segoe UI', system-ui, sans-serif";
            c.textAlign = "center";
            c.fillText(h, x + 70, 100);
            c.fillStyle = "#8a84a8";
            for (let ln = 0; ln < 5; ln++) {
              c.fillRect(x + 14, 122 + ln * 32, 112 - ((ln + ci) % 3) * 22, 9);
            }
          });
        });
      }

      if (room.id === "marketing") {
        // Phòng Marketing: campaign board — a rising bar chart of
        // campaign reach, nothing else (no clutter).
        addRoleBoard("CHIẾN DỊCH MARKETING", "#8e44ad", (c) => {
          c.strokeStyle = "#8a84a8";
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(52, 84);
          c.lineTo(52, 272);
          c.lineTo(472, 272);
          c.stroke();
          const bars = [62, 96, 84, 128, 164];
          bars.forEach((h, bi) => {
            c.fillStyle = bi === bars.length - 1 ? "#8e44ad" : "#b9a5d9";
            c.fillRect(84 + bi * 76, 272 - h, 46, h);
          });
          c.fillStyle = "#221a3e";
          c.font = "bold 16px 'Segoe UI', system-ui, sans-serif";
          c.textAlign = "center";
          c.fillText("LƯỢT TIẾP CẬN THEO TUẦN", 256, 300);
        });
      }

      if (room.id === "publish") {
        // Phòng Đăng tải & SEO: posting-calendar board — a week
        // grid with the scheduled slots marked.
        addRoleBoard("LỊCH ĐĂNG & SEO", "#5c6bc0", (c) => {
          const days = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
          days.forEach((dname, di) => {
            const x = 26 + di * 66;
            c.fillStyle = "#221a3e";
            c.font = "bold 16px 'Segoe UI', system-ui, sans-serif";
            c.textAlign = "center";
            c.fillText(dname, x + 28, 92);
            for (let r = 0; r < 3; r++) {
              const on = (di * 3 + r) % 4 !== 3;
              c.fillStyle = on ? "#5c6bc0" : "#e8e2f5";
              c.fillRect(x, 104 + r * 58, 56, 46);
              if (on) {
                c.fillStyle = "#ffffff";
                c.font = "bold 14px 'Segoe UI', system-ui, sans-serif";
                c.fillText("19:00", x + 28, 132 + r * 58);
              }
            }
          });
        });
      }

      if (room.id === "sales") {
        // Phòng Kinh doanh: pipeline board — four funnel stages,
        // widest first, with stage counts.
        addRoleBoard("ĐƯỜNG ỐNG KINH DOANH", "#37474f", (c) => {
          const stages: [string, number][] = [["TIẾP CẬN", 420], ["TƯ VẤN", 300], ["BÁO GIÁ", 190], ["CHỐT ĐƠN", 96]];
          const widths = [400, 316, 232, 148];
          stages.forEach(([label, n], si) => {
            const w = widths[si] ?? 148;
            c.fillStyle = ["#607d8b", "#546e7a", "#455a64", "#37474f"][si] ?? "#37474f";
            c.fillRect(256 - w / 2, 78 + si * 54, w, 42);
            c.fillStyle = "#ffffff";
            c.font = "bold 17px 'Segoe UI', system-ui, sans-serif";
            c.textAlign = "center";
            c.fillText(`${label} · ${n}`, 256, 105 + si * 54);
          });
        });
      }

      if (room.id === "sound") {
        // Phòng Âm thanh: a mixing console on a low table against
        // the front wall, centred in the same front slot as the
        // other rooms' boards, with two monitor speakers on stands
        // flanking it — the room's own tools, no decoration that
        // belongs to another trade. Desks (back row) and the side
        // door stay completely clear.
        const consoleGrp = new THREE.Group();
        const deskMat = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.6 });
        const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.07, 0.55), deskMat);
        deskTop.position.y = 0.76;
        deskTop.castShadow = true;
        consoleGrp.add(deskTop);
        for (const lx of [-0.9, 0.9]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.74, 0.45), deskMat);
          leg.position.set(lx, 0.38, 0);
          consoleGrp.add(leg);
        }
        const mixer = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.42), new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.4, metalness: 0.3 }));
        mixer.position.set(0, 0.85, 0);
        mixer.rotation.x = -0.18;
        consoleGrp.add(mixer);
        const knobCols = [0xd43a2f, 0xf2c14e, 0x2f5d8a, 0x3aa79c];
        for (let ki = 0; ki < 12; ki++) {
          const knob = new THREE.Mesh(
            new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10),
            new THREE.MeshStandardMaterial({ color: knobCols[ki % knobCols.length], roughness: 0.4 }),
          );
          knob.position.set(-0.62 + (ki % 6) * 0.25, 0.9, ki < 6 ? -0.08 : 0.1);
          consoleGrp.add(knob);
        }
        consoleGrp.position.set(-0.9, 0.22, room.d / 2 - 0.62);
        g.add(consoleGrp);
        const speakerAt = (sx: number) => {
          const grp = new THREE.Group();
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 8), deskMat);
          pole.position.y = 0.52;
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.36), new THREE.MeshStandardMaterial({ color: 0x22222a, roughness: 0.55 }));
          box.position.y = 1.38;
          box.castShadow = true;
          const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x8a84a8, roughness: 0.4, metalness: 0.4 }));
          cone.rotation.x = Math.PI / 2;
          cone.position.set(0, 1.3, -0.19);
          const tweeter = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14), cone.material as THREE.Material);
          tweeter.rotation.x = Math.PI / 2;
          tweeter.position.set(0, 1.56, -0.19);
          grp.add(pole, box, cone, tweeter);
          grp.position.set(sx, 0.22, room.d / 2 - 0.62);
          return grp;
        };
        g.add(speakerAt(-2.45));
        g.add(speakerAt(0.65));
      }

      if (room.id === "finance") {
        // Phòng Tài chính – Kế toán, in the back slot of the left
        // outer column: accounting desks come from the standard
        // workstations; the room's own furniture is a steel SAFE
        // (két sắt) against the right wall — dark body, door panel
        // facing the room, brass dial and lever handle — and a low
        // FILE CABINET (tủ hồ sơ) under the back-wall whiteboard.
        const brassF = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.85 });
        const safe = new THREE.Group();
        const steel = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.45, metalness: 0.65 });
        const safeBody = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.3, 1.0), steel);
        safeBody.position.y = 0.65;
        safeBody.castShadow = true;
        const safeDoor = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 1.14, 0.86),
          new THREE.MeshStandardMaterial({ color: 0x3d4454, roughness: 0.4, metalness: 0.7 }),
        );
        safeDoor.position.set(-0.32, 0.65, 0);
        const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), brassF);
        dial.rotation.z = Math.PI / 2;
        dial.position.set(-0.37, 0.8, 0);
        const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 8), brassF);
        lever.rotation.x = Math.PI / 2;
        lever.position.set(-0.37, 0.48, 0);
        safe.add(safeBody, safeDoor, dial, lever);
        // Back stretch of the right wall — clear of the side door
        // (z ±0.625 in that wall) and of the back-right shelf.
        safe.position.set(room.w / 2 - 0.5, 0.22, -1.75);
        g.add(safe);
        const fileCab = new THREE.Group();
        const cabMat = new THREE.MeshStandardMaterial({ color: 0x4c3a75, roughness: 0.85 });
        const cabBody = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.92, 0.45), cabMat);
        cabBody.position.y = 0.46;
        cabBody.castShadow = true;
        fileCab.add(cabBody);
        for (let dr = 0; dr < 3; dr++) {
          const front = new THREE.Mesh(
            new THREE.BoxGeometry(0.52, 0.8, 0.03),
            new THREE.MeshStandardMaterial({ color: 0x7a6aa8, roughness: 0.9 }),
          );
          front.position.set(-0.58 + dr * 0.58, 0.46, 0.24);
          const pull = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.03), brassF);
          pull.position.set(-0.58 + dr * 0.58, 0.62, 0.27);
          fileCab.add(front, pull);
        }
        fileCab.position.set(0, 0.22, -room.d / 2 + 0.32);
        g.add(fileCab);
      }

      if (room.id === "legal") {
        // Phòng Pháp chế, in the back slot of the right outer
        // column: work desks come from the standard workstations;
        // the room's own furniture is a tall CONTRACT CABINET
        // (tủ hợp đồng) along the left wall — a grid of small
        // drawers with brass pulls — and a DOCUMENT BOARD
        // (bảng văn bản) on the right wall with pinned document
        // sheets.
        const brassL = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.85 });
        const walnutL = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.6 });
        const contractCab = new THREE.Group();
        const cabBodyL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.1, 1.9), walnutL);
        cabBodyL.position.y = 1.05;
        cabBodyL.castShadow = true;
        contractCab.add(cabBodyL);
        for (let row = 0; row < 4; row++) {
          for (let col = 0; col < 3; col++) {
            const front = new THREE.Mesh(
              new THREE.BoxGeometry(0.04, 0.42, 0.55),
              new THREE.MeshStandardMaterial({ color: 0x7d5a38, roughness: 0.7 }),
            );
            front.position.set(0.27, 0.32 + row * 0.5, -0.6 + col * 0.6);
            const pull = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.18), brassL);
            pull.position.set(0.3, 0.32 + row * 0.5, -0.6 + col * 0.6);
            contractCab.add(front, pull);
          }
        }
        // Front stretch of the left wall — clear of the side door
        // (z ±0.625 in that wall) and of the back-left shelf.
        contractCab.position.set(-room.w / 2 + 0.42, 0.22, 1.9);
        g.add(contractCab);
        const docBoard = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, 1.5, 2.6),
          new THREE.MeshStandardMaterial({ color: 0x2e2456, roughness: 0.6 }),
        );
        docBoard.position.set(room.w / 2 - 0.18, 1.7, 0.6);
        g.add(docBoard);
        const docCanvas = document.createElement("canvas");
        docCanvas.width = 512;
        docCanvas.height = 288;
        const dctx = docCanvas.getContext("2d");
        if (dctx) {
          dctx.fillStyle = "#241d47";
          dctx.fillRect(0, 0, 512, 288);
          const sheet = (sx: number, sy: number, title: string) => {
            dctx.fillStyle = "#f5f2ff";
            dctx.fillRect(sx, sy, 140, 190);
            dctx.fillStyle = "#b03030";
            dctx.beginPath();
            dctx.arc(sx + 118, sy + 22, 11, 0, Math.PI * 2);
            dctx.fill();
            dctx.fillStyle = "#221a3e";
            dctx.font = "bold 15px 'Segoe UI', system-ui, sans-serif";
            dctx.textAlign = "center";
            dctx.fillText(title, sx + 62, sy + 28);
            dctx.fillStyle = "#8a84a8";
            for (let ln = 0; ln < 8; ln++) {
              dctx.fillRect(sx + 16, sy + 52 + ln * 16, 108 - (ln % 3) * 18, 6);
            }
          };
          sheet(24, 46, "HỢP ĐỒNG");
          sheet(186, 46, "VĂN BẢN");
          sheet(348, 46, "QUY ĐỊNH");
          dctx.fillStyle = "#e8c860";
          dctx.font = "bold 19px 'Segoe UI', system-ui, sans-serif";
          dctx.textAlign = "center";
          dctx.fillText("BẢNG VĂN BẢN PHÁP CHẾ", 256, 28);
        }
        const docTex = new THREE.CanvasTexture(docCanvas);
        docTex.colorSpace = THREE.SRGBColorSpace;
        const docFace = new THREE.Mesh(
          new THREE.PlaneGeometry(2.44, 1.34),
          new THREE.MeshBasicMaterial({ map: docTex }),
        );
        docFace.position.set(room.w / 2 - 0.23, 1.7, 0.6);
        docFace.rotation.y = -Math.PI / 2;
        g.add(docFace);
      }

      if (room.id === "screening") {
        // Screening room: a big dark screen on the back wall and two rows
        // of cinema seats facing it, clear of the staff desks at the front.
        const sFrame = new THREE.Mesh(
          new THREE.BoxGeometry(4.6, 2.1, 0.14),
          new THREE.MeshStandardMaterial({ color: 0x0d0a24, roughness: 0.4 }),
        );
        sFrame.position.set(0.6, 1.8, -room.d / 2 + 0.3);
        const sFace = new THREE.Mesh(
          new THREE.PlaneGeometry(4.3, 1.85),
          new THREE.MeshStandardMaterial({ color: 0x1c2f57, emissive: 0x2b4a8f, emissiveIntensity: 0.5, roughness: 0.3 }),
        );
        sFace.position.set(0.6, 1.8, -room.d / 2 + 0.39);
        g.add(sFrame, sFace);
        const seatMat = new THREE.MeshStandardMaterial({ color: 0x7a2230, roughness: 0.9 });
        for (const rz of [-0.9, 0.35]) {
          for (const cx of [-0.6, 0.6, 1.8]) {
            const ped = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.45), seatMat);
            ped.position.set(cx, 0.38, rz);
            const seatM = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.09, 0.55), seatMat);
            seatM.position.set(cx, 0.58, rz);
            seatM.castShadow = true;
            const backM = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.1), seatMat);
            backM.position.set(cx, 1.0, rz + 0.27);
            backM.castShadow = true;
            g.add(ped, seatM, backM);
          }
        }
      }

      if (room.id === "warehouse") {
        // Warehouse: extra shelf rows along the left wall and stacked
        // product boxes in the back corner, walkway kept clear.
        for (const sz of [-0.9, 0.9]) {
          const sh = buildShelf();
          sh.position.set(-room.w / 2 + 0.55, 0.22, sz);
          sh.rotation.y = Math.PI / 2;
          g.add(sh);
        }
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 0.95 });
        const boxMat2 = new THREE.MeshStandardMaterial({ color: 0x7a6242, roughness: 0.95 });
        const stack = (bx: number, bz: number, n: number, m: THREE.Material) => {
          for (let k = 0; k < n; k++) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.85), m);
            b.position.set(bx, 0.47 + k * 0.52, bz);
            b.castShadow = true;
            g.add(b);
          }
        };
        stack(room.w / 2 - 1.0, -room.d / 2 + 1.0, 3, boxMat);
        stack(room.w / 2 - 2.0, -room.d / 2 + 1.0, 2, boxMat2);
        stack(room.w / 2 - 1.0, -room.d / 2 + 2.0, 1, boxMat2);
      }

      if (room.id === "print") {
        // Print room: two printer tables along the back wall with paper
        // stacks, clear of the staff desks.
        const tableMat = new THREE.MeshStandardMaterial({ color: 0x4c3a75, roughness: 0.85 });
        for (const px of [-1.9, 0.4]) {
          const tbl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.72, 0.8), tableMat);
          tbl.position.set(px, 0.58, -room.d / 2 + 0.85);
          tbl.castShadow = true;
          const pBody = new THREE.Mesh(
            new THREE.BoxGeometry(1.05, 0.36, 0.66),
            new THREE.MeshStandardMaterial({ color: 0xd9d5ea, roughness: 0.5 }),
          );
          pBody.position.set(px, 1.12, -room.d / 2 + 0.85);
          pBody.castShadow = true;
          const paper = new THREE.Mesh(
            new THREE.BoxGeometry(0.62, 0.03, 0.44),
            new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
          );
          paper.position.set(px, 1.32, -room.d / 2 + 0.87);
          paper.rotation.x = -0.15;
          const stackP = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.3, 0.4),
            new THREE.MeshStandardMaterial({ color: 0xf5f2ff, roughness: 0.9 }),
          );
          stackP.position.set(px + 1.15, 0.37, -room.d / 2 + 0.85);
          g.add(tbl, pBody, paper, stackP);
        }
      }

      if (room.id === "meeting") {
        // Long meeting table with chairs all around; seats are recorded so
        // people in a meeting actually sit at the table.
        const tableTop = new THREE.Mesh(
          new THREE.BoxGeometry(4.4, 0.1, 1.7),
          new THREE.MeshStandardMaterial({ color: 0x74552f, roughness: 0.75 }),
        );
        tableTop.position.y = 0.76;
        tableTop.castShadow = true;
        const tableLegL = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.74, 1.4),
          new THREE.MeshStandardMaterial({ color: 0x5d4630, roughness: 0.85 }),
        );
        tableLegL.position.set(-1.9, 0.38, 0);
        const tableLegR = tableLegL.clone();
        tableLegR.position.x = 1.9;
        g.add(tableTop, tableLegL, tableLegR);
        const chairMat = new THREE.MeshStandardMaterial({ color: 0x2e2456, roughness: 0.9 });
        const seatDefs: { pos: THREE.Vector3; rotY: number }[] = [];
        const chairAt = (cx: number, cz: number, rotY: number) => {
          const seatM = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.52), chairMat);
          seatM.position.set(cx, 0.48, cz);
          const backM = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.09), chairMat);
          backM.position.set(cx, 0.86, cz);
          backM.rotation.y = rotY;
          backM.translateZ(0.26);
          g.add(seatM, backM);
          seatDefs.push({
            pos: new THREE.Vector3(room.x + cx, 0.22, room.z + cz),
            rotY,
          });
        };
        chairAt(-1.4, -1.35, Math.PI);
        chairAt(0, -1.35, Math.PI);
        chairAt(1.4, -1.35, Math.PI);
        chairAt(-1.4, 1.35, 0);
        chairAt(0, 1.35, 0);
        chairAt(1.4, 1.35, 0);
        meetingSeatsRef.current = seatDefs;
        // Whiteboard showing the latest meeting minutes.
        const boardBack = new THREE.Mesh(
          new THREE.BoxGeometry(3.3, 1.7, 0.06),
          new THREE.MeshStandardMaterial({ color: 0x2e2456, roughness: 0.6 }),
        );
        boardBack.position.set(0, 1.8, -room.d / 2 + 0.22);
        const mbCanvas = document.createElement("canvas");
        mbCanvas.width = 512;
        mbCanvas.height = 288;
        const mbCtx = mbCanvas.getContext("2d");
        const mbTex = new THREE.CanvasTexture(mbCanvas);
        mbTex.colorSpace = THREE.SRGBColorSpace;
        drawMeetingBoard(mbCtx, mbTex, null);
        meetingBoardRef.current = { g: mbCtx, tex: mbTex };
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(3.2, 1.6),
          new THREE.MeshBasicMaterial({ map: mbTex }),
        );
        board.position.set(0, 1.8, -room.d / 2 + 0.26);
        g.add(boardBack, board);
      }

      // Workstations + seated avatars.
      const perRow = room.staff.length > 3 ? 3 : Math.max(room.staff.length, 1);
      // Ghế đầu tiên của phòng = điểm camera "ngồi gần bàn" của phòng.
      const seatAnchors: { pos: THREE.Vector3; rotY: number }[] = [];
      room.staff.forEach((person, i) => {
        const isQcDesk = room.id === "video" && person.id === "qc";
        let px = 0;
        let pz = 0;
        let unitRotY = 0;
        if (isQcDesk) {
          // QC sits apart at the front-right, facing the big screen.
          px = room.w / 2 - 2.1;
          pz = 1.5;
        } else if (room.id === "chairman") {
          // The chairman's desk in the back band of the square
          // suite, against the
          // back wall, the chairman seated BEHIND it (between desk and
          // back wall) facing the front glass and the office in
          // front: the
          // whole unit turns 180° so the monitor and keyboard face him
          // and his back is to the wall, never to the room.
          px = 0;
          pz = -5.2;
          unitRotY = Math.PI;
        } else if (room.id === "ceo" && person.id === "tro-ly") {
          // Trợ lý Tổng giám đốc sits INSIDE this room — the Chủ
          // tịch's correction: NOT in a row with the Tổng giám đốc.
          // Her desk stands on the room's right side, LOWER (well
          // toward the front of the TGĐ's back desk) and OFFSET
          // sideways off his axis, turned to FACE the long meeting
          // table across the room — never back-to it, never
          // sideways, never in line with his desk.
          px = 3.1;
          pz = 0.1;
          unitRotY = Math.PI / 2;
        } else if (room.id === "clerical" && person.id === "van-thu") {
          // Văn thư has her OWN room — the former Trợ lý room on
          // the executive zone's left flank, reassigned to her by
          // the Chủ tịch. She does NOT sit in the Tổng giám đốc
          // room and NOT in a row with him. Her desk stands against
          // her room's west wall, turned to FACE east — toward the
          // long meeting table in the Tổng giám đốc room — never
          // back-to it, never sideways.
          px = -2.6;
          pz = 0;
          unitRotY = -Math.PI / 2;
        } else if (room.id === "ceo") {
          // Same executive logic for the Tổng giám đốc: behind the desk,
          // facing the door of his room, back to the back wall.
          px = 0;
          pz = -2.9;
          unitRotY = Math.PI;
        } else if (isPost(room.id)) {
          // Duty desks face outward, toward the people coming up the
          // central axis to meet the Tổng giám đốc or the Chủ tịch.
          px = 0;
          pz = -0.3;
          unitRotY = Math.PI;
        } else if (room.id === "director") {
          px = -2.4;
          pz = -0.9;
        } else if (room.id === "screening") {
          // Screening staff sit at a front desk row facing the big screen.
          px = (i - 1) * 2.2;
          pz = 2.0;
        } else if (room.id === "meeting") {
          // Meeting-room staff desks stand in the two back corners, clear
          // of the big meeting table and the whiteboard.
          px = i === 0 ? -3.0 : 3.0;
          pz = -2.1;
        } else if (room.id === "video") {
          const col = i % 3;
          const rowIdx = Math.floor(i / 3);
          px = (col - 1) * 1.9 - 0.95;
          pz = 0.9 - rowIdx * 2.2;
        } else {
          const col = i % perRow;
          const rowIdx = Math.floor(i / perRow);
          px = (col - (perRow - 1) / 2) * 2.3;
          pz = -0.5 + rowIdx * 2.1;
        }
        const unit = buildWorkstation(
          person,
          staffLamp[person.id] ?? "idle",
          room.id === "chairman" || person.id === "tong-giam-doc",
          {
            coffee: ["video", "director", "ceo", "chairman"].includes(room.id),
            steamSink: steamRef.current,
            onScreen: (g2, tex) => deskScreensRef.current.set(person.id, { g: g2, tex }),
          },
        );
        unit.position.set(px, 0.22, pz);
        unit.rotation.y = unitRotY;
        g.add(unit);
        if (person.id === "le-tan") {
          // Bảng tên đứng trên mặt bàn Lễ tân, hướng ra sảnh cho khách và
          // mọi người đi ngang đều đọc được: "LỄ TÂN · NGỌC ANH" — bàn có
          // tên, có người trực hẳn hoi, không phải bàn trống.
          const plateCanvas = document.createElement("canvas");
          plateCanvas.width = 512;
          plateCanvas.height = 112;
          const pctx2 = plateCanvas.getContext("2d");
          if (pctx2) {
            pctx2.fillStyle = "#0b3d4a";
            pctx2.fillRect(0, 0, 512, 112);
            pctx2.strokeStyle = "#d4af37";
            pctx2.lineWidth = 5;
            pctx2.strokeRect(5, 5, 502, 102);
            pctx2.fillStyle = "#f2c14e";
            pctx2.font = "bold 44px Georgia, serif";
            pctx2.textAlign = "center";
            pctx2.textBaseline = "middle";
            pctx2.fillText("LỄ TÂN · NGỌC ANH", 256, 58);
          }
          const plateTex2 = new THREE.CanvasTexture(plateCanvas);
          plateTex2.colorSpace = THREE.SRGBColorSpace;
          const deskPlate = new THREE.Mesh(
            new THREE.BoxGeometry(0.92, 0.2, 0.03),
            new THREE.MeshStandardMaterial({ color: 0x0b3d4a, roughness: 0.4 }),
          );
          deskPlate.position.set(0, 1.06, 0.32);
          deskPlate.rotation.x = -0.16;
          const deskPlateFace = new THREE.Mesh(
            new THREE.PlaneGeometry(0.88, 0.17),
            new THREE.MeshBasicMaterial({ map: plateTex2 }),
          );
          deskPlateFace.position.set(0, 1.065, 0.337);
          deskPlateFace.rotation.x = -0.16;
          g.add(deskPlate, deskPlateFace);
        }
        // The desk lamp material is registered inside buildWorkstation via a
        // shared map keyed by traversal order; simpler: re-find the bulb.
        unit.traverse((o) => {
          if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) {
            lampMats.set(person.id, o.material as THREE.MeshStandardMaterial);
          }
        });

        const rig = buildAvatar(person.id, person.color);
        // Bảng tên trên đầu: nhỏ, treo cao trên đầu, màu theo cấp
        // bậc, CHỈ hiện tên. Mặc định ẩn — vòng lặp render mới
        // quyết hiện ai theo mức zoom / hover / bấm chọn / công
        // tắc Bật/Tắt, và nâng so le các bảng gần nhau.
        const tagRank = staffTagRank(person.id);
        const headTag = makeHeadTag(
          person.name ?? `Nhân viên ${person.initials}`,
          tagRank,
        );
        headTag.position.set(0, TAG_BASE_Y, 0);
        headTag.visible = false;
        rig.group.add(headTag);
        headTagsRef.current.set(person.id, {
          sprite: headTag,
          rank: tagRank,
          liftGoal: 0,
        });
        // The seat sits on the side of the desk its person works
        // from: behind the executive desks (Chủ tịch, Tổng giám
        // đốc, duty posts) that is the back side; for the two desks
        // the Chủ tịch turned to face the long meeting table — the
        // Trợ lý desk inside the Tổng giám đốc room and the Văn
        // thư desk in her own room — it is the side AWAY from that
        // table, so both women face the table across their desks.
        let seatOffX = 0;
        let seatOffZ =
          isPost(room.id) || room.id === "ceo" || room.id === "chairman"
            ? -0.62
            : 0.62;
        if (room.id === "ceo" && person.id === "tro-ly") {
          seatOffX = 0.62;
          seatOffZ = 0;
        } else if (room.id === "clerical" && person.id === "van-thu") {
          seatOffX = -0.62;
          seatOffZ = 0;
        }
        const seatPos = new THREE.Vector3(
          room.x + px + seatOffX,
          baseY + 0.22,
          room.z + pz + seatOffZ,
        );
        if (seatAnchors.length === 0) seatAnchors.push({ pos: seatPos.clone(), rotY: unitRotY });
        staffDeskRef.current.set(person.id, { pos: seatPos.clone(), rotY: unitRotY });
        rig.group.position.copy(seatPos);
        rig.group.userData.roomId = room.id;
        rig.group.userData.staffId = person.id;
        // Status bubble floating above the head, redrawn from real task data.
        const bCanvas = document.createElement("canvas");
        bCanvas.width = 512;
        bCanvas.height = 160;
        const bCtx = bCanvas.getContext("2d");
        const bTex = new THREE.CanvasTexture(bCanvas);
        bTex.colorSpace = THREE.SRGBColorSpace;
        const bSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: bTex, transparent: true, depthTest: false }),
        );
        bSprite.scale.set(2.3, 0.72, 1);
        bSprite.position.set(0, 2.12, 0);
        bSprite.renderOrder = 11;
        bSprite.visible = false;
        rig.group.add(bSprite);
        bubbleRef.current.set(person.id, { g: bCtx, tex: bTex, sprite: bSprite, last: "" });
        world.add(rig.group);
        pickables.push(rig.group);
        // A document folder some people carry on reporting / receiving
        // trips — shown only while such a trip is on (see the render loop).
        const folder = new THREE.Mesh(
          new THREE.BoxGeometry(0.36, 0.46, 0.035),
          new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.6 }),
        );
        folder.position.set(0.24, 0.78, -0.3);
        folder.rotation.x = -0.15;
        folder.visible = false;
        rig.bodyGroup.add(folder);
        const phaseSeed = person.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
        rigs.set(person.id, {
          ...rig,
          seat: seatPos,
          // Home door: the Chủ tịch room's only door is its ONE
          // MAIN DOOR at the centre of its interior partition,
          // reached from either of the two FLIPPED straight
          // stairs (feet at the room's front wall, flights
          // climbing INTO the room along the interior corridor)
          // — the home point is the right stair's foot approach
          // in the hallway below, in front of its passage
          // (routes climb the stairs explicitly — see
          // computeRoute);
          // department rooms — and the Trợ lý / Thư ký rooms on the
          // two flanks — use the door in the wall facing the central
          // shared floor / the wide inter-row walkway; the Tổng giám đốc
          // room and the open Lễ tân post use the front point.
          door:
            room.id === "chairman"
              ? chairStairFoot(1)
              : room.x !== 0 && !isPost(room.id)
                ? new THREE.Vector3(
                    room.x + (room.x < 0 ? 1 : -1) * (room.w / 2 + 0.55),
                    baseY + 0.22,
                    room.z,
                  )
                : new THREE.Vector3(room.x, baseY + 0.22, room.z + room.d / 2 + 0.55),
          seatRotY: unitRotY,
          sit: 1,
          pos: seatPos.clone(),
          phase: phaseSeed % 6,
          via: null,
          path: [],
          targetKey: "",
          stride: 0,
          speed: 0.78 + (phaseSeed % 55) / 100,
          startAt: 0,
          pauseUntil: 0,
          nextPauseAt: 6 + (phaseSeed % 8),
          folder,
        });
      });
      const firstSeat = seatAnchors[0];
      if (firstSeat) {
        const rf = roomFocus.get(room.id);
        if (rf) {
          rf.desk = firstSeat.pos;
          rf.deskRotY = firstSeat.rotY;
        }
      }

      world.add(g);
    }

    // The strip in front of the Tổng giám đốc room (in front of his
    // glass front at z=-5.0) is kept COMPLETELY EMPTY: no
    // meeting table, no chairs, nothing in the walkway — and with
    // the Trợ lý / Thư ký rooms moved out to the flanks, the whole
    // front face stays open and airy, straight through to the hall. The long guest /
    // meeting table that used to stand here now lives INSIDE the
    // Tổng giám đốc room, laid lengthwise along the room for
    // receiving guests (see the "ceo" dressing block), with its
    // presentation screen and whiteboard inside with it.

    // =====================================================================
    // 5 KHU TIỆN ÍCH CÔNG SỞ trên 2 lô đất trống hai bên sườn Phòng Chủ
    // tịch (Chủ tịch chốt thêm hết): TRÁI = Khu vườn xanh (hồ cá nhỏ, ghế
    // đá, cây cảnh) + Khu giải trí (bàn bi-a, bàn bóng bàn, ghế thư giãn)
    // + Khu đọc sách / thư viện nhỏ (kệ sách, ghế đọc, đèn ấm); PHẢI =
    // Khu ăn uống (quầy cà phê, bàn ăn, tủ lạnh, lò vi sóng) + Khu thể
    // thao nhẹ (máy chạy bộ, xe đạp tập, thảm yoga). Mỗi khu có THẢM nối
    // THẲNG từ dải thảm hành lang bên dưới (z=-14.5) và các dải thảm ngang
    // chạy dọc từng khu — đường đi thẳng, ngắn nhất, mọi phòng đều thông
    // ra hành lang chính và tới được mọi khu, không phòng nào đi vòng
    // (nút NAV bổ sung + blockers nội thất ở phần định tuyến bên dưới).
    {
      const zones = new THREE.Group();
      const carpetMat = new THREE.MeshStandardMaterial({ color: 0x7a2230, roughness: 1 });
      const woodMat2 = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 0.7 });
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a94a8, roughness: 0.9 });
      const addZonePlant = (x: number, z: number, s = 1.15) => {
        const p = buildPlant();
        p.scale.setScalar(s);
        p.position.set(x, 0, z);
        p.traverse((o) => {
          if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) plantsRef.current.push(o);
        });
        zones.add(p);
      };
      const zoneLabel = (id: string, name: string, x: number, z: number, dist: number) => {
        const label = makeLabelSprite(name);
        label.position.set(x, 3.3, z);
        zones.add(label);
        roomFocus.set(id, { center: new THREE.Vector3(x, 0.05, z), dist });
      };
      const carpet = (w: number, d: number, x: number, z: number) => {
        const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), carpetMat);
        c.position.set(x, 0.028, z);
        c.receiveShadow = true;
        zones.add(c);
      };
      // Thảm nối thẳng: dọc từ hành lang bên dưới vào sâu từng bên + ngang
      // dọc hai hàng khu — một mạng thảm liền với thảm sảnh chính.
      carpet(2.4, 13.4, -17.5, -21.2);
      carpet(2.4, 13.4, 17.5, -21.2);
      carpet(17.5, 2.2, -18.6, -20.6);
      carpet(17.5, 2.2, 18.6, -19.8);
      carpet(17.5, 2.2, -18.6, -25.7);
      carpet(17.5, 2.2, 18.6, -25.7);

      // ---- TRÁI · KHU VƯỜN XANH: thảm cỏ, hồ cá nhỏ, ghế đá, cây cảnh.
      const grass = new THREE.Mesh(new THREE.BoxGeometry(17, 0.035, 5.8), new THREE.MeshStandardMaterial({ color: 0x2f6b33, roughness: 1 }));
      grass.position.set(-19, 0.02, -25.9);
      grass.receiveShadow = true;
      zones.add(grass);
      const pond = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.16, 24), new THREE.MeshStandardMaterial({ color: 0x2e6da4, roughness: 0.15, metalness: 0.2 }));
      pond.position.set(-19.5, 0.06, -26.6);
      zones.add(pond);
      const pondRim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.09, 8, 28), stoneMat);
      pondRim.rotation.x = Math.PI / 2;
      pondRim.position.set(-19.5, 0.13, -26.6);
      zones.add(pondRim);
      for (const [fx, fz, fr] of [[-19.9, -26.3, 0.5], [-19.0, -26.9, 2.4], [-19.4, -26.5, 4.2]] as const) {
        const fish = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf28c28, roughness: 0.5 }));
        fish.scale.set(1.6, 0.5, 0.7);
        fish.position.set(fx, 0.13, fz);
        fish.rotation.y = fr;
        zones.add(fish);
      }
      for (const bx of [-16.6, -22.4]) {
        const bench = new THREE.Group();
        const seatB = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.5), stoneMat);
        seatB.position.y = 0.45;
        seatB.castShadow = true;
        const legB1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.44), stoneMat);
        legB1.position.set(-0.6, 0.21, 0);
        const legB2 = legB1.clone();
        legB2.position.x = 0.6;
        bench.add(seatB, legB1, legB2);
        bench.position.set(bx, 0, -24.9);
        zones.add(bench);
      }
      addZonePlant(-27.5, -27.8, 1.35);
      addZonePlant(-10.6, -27.8, 1.35);
      addZonePlant(-27.5, -23.4, 1.1);
      zoneLabel("zone-garden", "Khu vườn xanh", -19, -25.6, 13);

      // ---- TRÁI · KHU GIẢI TRÍ: bàn bi-a, bàn bóng bàn, ghế thư giãn.
      const funRug = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.03, 5.2), new THREE.MeshStandardMaterial({ color: 0x4a3a6e, roughness: 1 }));
      funRug.position.set(-19, 0.022, -20.6);
      funRug.receiveShadow = true;
      zones.add(funRug);
      const billiard = new THREE.Group();
      {
        const top = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.12, 1.45), new THREE.MeshStandardMaterial({ color: 0x1e7a46, roughness: 0.85 }));
        top.position.y = 0.8;
        top.castShadow = true;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(2.86, 0.09, 1.6), woodMat2);
        rail.position.y = 0.76;
        billiard.add(rail, top);
        for (const [lx, lz] of [[-1.2, -0.55], [1.2, -0.55], [-1.2, 0.55], [1.2, 0.55]] as const) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.74, 0.14), woodMat2);
          leg.position.set(lx, 0.37, lz);
          billiard.add(leg);
        }
        const ballCols = [0xf5f2ea, 0xd43a2f, 0xf2c14e, 0x2f5d8a];
        ballCols.forEach((col, i) => {
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 0.25 }));
          ball.position.set(-0.5 + i * 0.32, 0.9, (i % 2 === 0 ? -0.2 : 0.22));
          billiard.add(ball);
        });
        const cue = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 1.45, 8), woodMat2);
        cue.position.set(0.9, 0.93, 0.45);
        cue.rotation.z = Math.PI / 2 - 0.06;
        cue.rotation.y = 0.4;
        billiard.add(cue);
      }
      billiard.position.set(-22, 0, -20.6);
      zones.add(billiard);
      const pingpong = new THREE.Group();
      {
        const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.06, 1.35), new THREE.MeshStandardMaterial({ color: 0x2456a8, roughness: 0.6 }));
        top.position.y = 0.76;
        top.castShadow = true;
        const net = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 1.35), new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.8 }));
        net.position.y = 0.86;
        pingpong.add(top, net);
        for (const [lx, lz] of [[-1.05, -0.5], [1.05, -0.5], [-1.05, 0.5], [1.05, 0.5]] as const) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.74, 0.09), stoneMat);
          leg.position.set(lx, 0.37, lz);
          pingpong.add(leg);
        }
        const ballP = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
        ballP.position.set(0.5, 0.83, 0.2);
        pingpong.add(ballP);
      }
      pingpong.position.set(-14.8, 0, -20.6);
      zones.add(pingpong);
      for (const cz of [-19.7, -21.5]) {
        const chair = new THREE.Group();
        const seatC = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x8e44ad, roughness: 0.85 }));
        seatC.position.y = 0.46;
        const backC = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.1), seatC.material as THREE.Material);
        backC.position.set(0.28, 0.85, 0);
        backC.rotation.z = -0.15;
        chair.add(seatC, backC);
        chair.position.set(-11.6, 0, cz);
        zones.add(chair);
      }
      addZonePlant(-27.8, -18.6, 1.1);
      zoneLabel("zone-fun", "Khu giải trí", -19, -20.6, 13);

      // ---- TRÁI · THƯ VIỆN NHỎ: kệ sách, ghế đọc, đèn ấm.
      for (const sx of [-23.3, -20.6]) {
        const shelf = buildShelf();
        shelf.position.set(sx, 0, -16.55);
        shelf.rotation.y = Math.PI;
        zones.add(shelf);
      }
      for (const cx of [-22.6, -19.9]) {
        const chair = new THREE.Group();
        const seatC = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.58), new THREE.MeshStandardMaterial({ color: 0x74552f, roughness: 0.8 }));
        seatC.position.y = 0.45;
        const backC = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.66, 0.1), seatC.material as THREE.Material);
        backC.position.set(0, 0.82, -0.27);
        chair.add(seatC, backC);
        chair.position.set(cx, 0, -18.2);
        zones.add(chair);
      }
      const readLamp = new THREE.Group();
      {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.45, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 }));
        pole.position.y = 0.72;
        const shade = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.18, 0.22, 12, 1, true),
          new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.5, emissive: 0xffc978, emissiveIntensity: 0.55, side: THREE.DoubleSide }),
        );
        shade.position.y = 1.5;
        readLamp.add(pole, shade);
      }
      readLamp.position.set(-17.9, 0, -17.7);
      zones.add(readLamp);
      addZonePlant(-11.2, -16.9, 1.0);
      zoneLabel("zone-library", "Thư viện nhỏ", -19, -17.5, 12);

      // ---- PHẢI · KHU ĂN UỐNG: quầy cà phê, bàn ăn, tủ lạnh, lò vi sóng.
      const dineFloor = new THREE.Mesh(new THREE.BoxGeometry(17, 0.03, 5.8), new THREE.MeshStandardMaterial({ color: 0x5d4630, roughness: 1 }));
      dineFloor.position.set(19, 0.022, -25.9);
      dineFloor.receiveShadow = true;
      zones.add(dineFloor);
      const counter = new THREE.Group();
      {
        const bodyK = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.92, 0.72), woodMat2);
        bodyK.position.y = 0.46;
        bodyK.castShadow = true;
        const topK = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.06, 0.86), new THREE.MeshStandardMaterial({ color: 0x3a2c66, roughness: 0.4 }));
        topK.position.y = 0.95;
        counter.add(bodyK, topK);
        const machine = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.5), new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.35, metalness: 0.5 }));
        machine.position.set(-1.6, 1.25, 0);
        const machineGlow = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x22c55e, emissiveIntensity: 1.6 }));
        machineGlow.position.set(-1.35, 1.38, 0.26);
        counter.add(machine, machineGlow);
        for (const cupX of [-0.6, -0.25, 0.9]) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.07, 10), new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.4 }));
          cup.position.set(cupX, 1.02, 0.15);
          counter.add(cup);
        }
        const micro = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.45), new THREE.MeshStandardMaterial({ color: 0xd9d5ea, roughness: 0.4 }));
        micro.position.set(2.2, 1.18, 0);
        const microDoor = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.02), new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.2, metalness: 0.4 }));
        microDoor.position.set(2.12, 1.18, 0.24);
        counter.add(micro, microDoor);
      }
      counter.position.set(17.5, 0, -28.45);
      zones.add(counter);
      const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.9, 0.8), new THREE.MeshStandardMaterial({ color: 0xe8e6f5, roughness: 0.3, metalness: 0.35 }));
      fridge.position.set(22.6, 0.95, -28.4);
      fridge.castShadow = true;
      zones.add(fridge);
      for (const tx of [15.5, 21.5]) {
        const tableG = new THREE.Group();
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 20), woodMat2);
        top.position.y = 0.74;
        top.castShadow = true;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.72, 10), woodMat2);
        post.position.y = 0.37;
        tableG.add(top, post);
        for (let ci = 0; ci < 3; ci++) {
          const a = (ci / 3) * Math.PI * 2 + 0.5;
          const ch = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.42), new THREE.MeshStandardMaterial({ color: 0x3aa79c, roughness: 0.8 }));
          ch.position.set(Math.cos(a) * 1.25, 0.25, Math.sin(a) * 1.25);
          tableG.add(ch);
        }
        tableG.position.set(tx, 0, -24.6);
        zones.add(tableG);
      }
      addZonePlant(27.8, -23.6, 1.15);
      zoneLabel("zone-dining", "Khu ăn uống", 19, -25.6, 13);

      // ---- PHẢI · KHU THỂ THAO NHẸ: máy chạy bộ, xe đạp tập, thảm yoga.
      const gymFloor = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.03, 6.6), new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 1 }));
      gymFloor.position.set(19, 0.022, -19.8);
      gymFloor.receiveShadow = true;
      zones.add(gymFloor);
      for (const tx of [13.2, 15.9]) {
        const tread = new THREE.Group();
        const belt = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.14, 1.8), new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.6 }));
        belt.position.y = 0.09;
        belt.castShadow = true;
        const postL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.05, 0.07), stoneMat);
        postL.position.set(-0.33, 0.55, -0.8);
        const postR = postL.clone();
        postR.position.x = 0.33;
        const console_ = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0x2456a8, roughness: 0.4 }));
        console_.position.set(0, 1.12, -0.8);
        tread.add(belt, postL, postR, console_);
        tread.position.set(tx, 0, -17.6);
        zones.add(tread);
      }
      for (const bx of [13.2, 15.9]) {
        const bike = new THREE.Group();
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 18), new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.4, metalness: 0.5 }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(0, 0.34, -0.3);
        const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 8), stoneMat);
        seatPost.position.set(0, 0.55, 0.28);
        const seatBk = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.3), new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.6 }));
        seatBk.position.set(0, 0.85, 0.28);
        const barPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 8), stoneMat);
        barPost.position.set(0, 0.62, -0.28);
        bike.add(wheel, seatPost, seatBk, barPost);
        bike.position.set(bx, 0, -21.8);
        zones.add(bike);
      }
      const matCols = [0xc65b7c, 0x3aa79c, 0x5c6bc0];
      matCols.forEach((col, i) => {
        const mat = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.025, 1.85), new THREE.MeshStandardMaterial({ color: col, roughness: 0.95 }));
        mat.position.set(21.6 + (i % 2) * 1.15, 0.045, -18.7 - Math.floor(i / 2) * 2.3);
        mat.receiveShadow = true;
        zones.add(mat);
      });
      addZonePlant(27.8, -17.0, 1.1);
      zoneLabel("zone-sport", "Khu thể thao nhẹ", 19, -19.8, 13);

      world.add(zones);
    }

    // Central tea garden: a big bonsai in the middle, an aquarium on the
    // west side and tea tables on the east — the open heart of the floor,
    // ringed by the open shared floor.
    const tea = new THREE.Group();
    const teaRug = new THREE.Mesh(
      new THREE.BoxGeometry(12.8, 0.04, 5.4),
      new THREE.MeshStandardMaterial({ color: 0x63502e, roughness: 1 }),
    );
    teaRug.position.set(0, 0.035, 9.4);
    teaRug.receiveShadow = true;
    tea.add(teaRug);
    // Bonsai: wide pot, bent trunk, layered foliage blobs (they sway).
    const bonsai = new THREE.Group();
    const bPot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.88, 0.66, 0.55, 14),
      new THREE.MeshStandardMaterial({ color: 0x74563a, roughness: 0.85 }),
    );
    bPot.position.y = 0.28;
    bPot.castShadow = true;
    const bSoil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.06, 14),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 }),
    );
    bSoil.position.y = 0.56;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4230, roughness: 0.95 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.24, 0.95, 8), trunkMat);
    trunk.position.set(0.05, 1.0, 0);
    trunk.rotation.z = 0.16;
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.7, 8), trunkMat);
    branch.position.set(0.32, 1.5, 0.05);
    branch.rotation.z = -0.7;
    bonsai.add(bPot, bSoil, trunk, branch);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d46, roughness: 0.9 });
    const blob = (x: number, y: number, z: number, r: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), leafMat);
      m.position.set(x, y, z);
      m.scale.y = 0.62;
      m.castShadow = true;
      bonsai.add(m);
      plantsRef.current.push(m);
    };
    blob(0, 1.95, 0, 0.9);
    blob(-0.62, 1.66, 0.12, 0.58);
    blob(0.58, 1.72, -0.08, 0.62);
    bonsai.position.set(0, 0, 9.4);
    bonsai.scale.setScalar(1.65);
    tea.add(bonsai);
    // Aquarium on a stand: gravel, water, glass, little plants, live fish.
    const tank = new THREE.Group();
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.72, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x2c2158, roughness: 0.85 }),
    );
    stand.position.y = 0.36;
    const gravel = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.07, 0.82),
      new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 }),
    );
    gravel.position.y = 0.79;
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(2.42, 0.78, 0.84),
      new THREE.MeshStandardMaterial({ color: 0x2b6cb0, transparent: true, opacity: 0.45, roughness: 0.15 }),
    );
    water.position.y = 1.2;
    const tankGlass = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.86, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1 }),
    );
    tankGlass.position.y = 1.2;
    tank.add(stand, gravel, water, tankGlass);
    for (const px of [-0.75, 0.85]) {
      const weed = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.52, 8),
        new THREE.MeshStandardMaterial({ color: 0x2e9e63, roughness: 0.9 }),
      );
      weed.position.set(px, 1.06, 0.08);
      tank.add(weed);
    }
    tank.position.set(0, 0, 13.6);
    tank.scale.set(2.7, 1, 1.55);
    tea.add(tank);
    const fishColors = [0xff8c42, 0xffd23f, 0xef476f, 0x4cc9f0, 0xff8c42];
    fishColors.forEach((c, i) => {
      const f = new THREE.Group();
      const fMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), fMat);
      body.scale.set(1.7, 0.75, 0.5);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 8), fMat);
      tail.position.x = -0.19;
      tail.rotation.z = Math.PI / 2;
      f.add(body, tail);
      f.position.set(0, 1.2, 13.6);
      tea.add(f);
      fishes.push({
        g: f,
        cx: 0,
        cy: 1.1 + (i % 3) * 0.17,
        cz: 13.6,
        phase: i * 1.37,
        speed: 0.55 + (i % 3) * 0.13,
        range: 2.55,
      });
    });
    // Tea tables with chairs and steaming cups.
    const teaChairMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.85 });
    const teaTable = (tx: number, tz: number) => {
      const grp = new THREE.Group();
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.82, 0.82, 0.07, 20),
        new THREE.MeshStandardMaterial({ color: 0x74552f, roughness: 0.7 }),
      );
      top.position.y = 0.72;
      top.castShadow = true;
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 0.7, 10),
        teaChairMat,
      );
      leg.position.y = 0.36;
      grp.add(top, leg);
      for (const s of [-1, 1]) {
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.04, 0.08, 10),
          new THREE.MeshStandardMaterial({ color: 0xf2f0fa, roughness: 0.4 }),
        );
        cup.position.set(0.3 * s, 0.79, 0.12 * s);
        grp.add(cup);
        for (let i = 0; i < 2; i++) {
          const mat = new THREE.SpriteMaterial({
            map: getSteamTexture(),
            transparent: true,
            opacity: 0,
            depthWrite: false,
          });
          const sp = new THREE.Sprite(mat);
          sp.position.set(tx + 0.3 * s, 0.9, tz + 0.12 * s);
          sp.scale.setScalar(0.13);
          tea.add(sp);
          steamRef.current.push({ sprite: sp, mat, baseY: 0.9, phase: (i + (s > 0 ? 2 : 0)) / 4 });
        }
      }
      grp.position.set(tx, 0, tz);
      tea.add(grp);
      for (const a of [0.5, 2.6, 4.5]) {
        const chair = new THREE.Group();
        const seatM = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.44), teaChairMat);
        seatM.position.y = 0.45;
        const backM = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.07), teaChairMat);
        backM.position.set(0, 0.78, 0.22);
        chair.add(seatM, backM);
        chair.position.set(tx + Math.sin(a) * 1.05, 0, tz + Math.cos(a) * 1.05);
        chair.rotation.y = a;
        tea.add(chair);
      }
    };
    // Tea area in front of the koi pond: two tea tables with chairs.
    teaTable(-2.9, 17.3);
    teaTable(2.9, 17.3);
    // Two sofas flanking the tea area, facing inward.
    for (const sx of [-5.5, 5.5]) {
      const sofa = buildSofa(0x5d4a2f);
      sofa.position.set(sx, 0, 17.3);
      sofa.rotation.y = sx < 0 ? -Math.PI / 2 : Math.PI / 2;
      tea.add(sofa);
    }
    for (const [px, pz] of [[-6.2, 8.4], [6.2, 8.4], [-6.2, 12.0], [6.2, 12.0], [-6.2, 15.4], [6.2, 15.4]] as const) {
      const p = buildPlant();
      p.position.set(px, 0, pz);
      p.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) {
          plantsRef.current.push(o);
        }
      });
      tea.add(p);
    }
    world.add(tea);

    // Lobby at the front edge: company sign, reception desk, waiting sofas.
    const lobby = new THREE.Group();
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 1024;
    signCanvas.height = 200;
    const sg = signCanvas.getContext("2d");
    if (sg) {
      sg.fillStyle = "#17102e";
      sg.fillRect(0, 0, 1024, 200);
      sg.strokeStyle = "#a78bfa";
      sg.lineWidth = 6;
      sg.strokeRect(8, 8, 1008, 184);
      sg.fillStyle = "#ffffff";
      sg.font = "bold 84px 'Segoe UI', system-ui, sans-serif";
      sg.textAlign = "center";
      sg.fillText("MUSE COMPANY", 512, 96);
      sg.fillStyle = "#e8c860";
      sg.font = "40px 'Segoe UI', system-ui, sans-serif";
      sg.fillText("★ CỬA CHÍNH CÔNG TY ★", 512, 158);
    }
    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(7.6, 1.5),
      new THREE.MeshBasicMaterial({ map: signTex, color: 0xdedede }),
    );
    sign.position.set(0, 1.9, 21.6);
    sign.rotation.y = Math.PI;
    const signBack = new THREE.Mesh(
      new THREE.BoxGeometry(7.8, 1.7, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x241a4a, roughness: 0.7 }),
    );
    signBack.position.set(0, 1.9, 21.68);
    // LED halo behind the MUSE COMPANY sign: a slightly larger warm
    // emissive plate peeking out around the sign's edges (blooms).
    const signHalo = new THREE.Mesh(new THREE.BoxGeometry(8.3, 2.05, 0.05), ledMat);
    signHalo.position.set(0, 1.9, 21.8);
    const postL = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.2, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x3a2c66, roughness: 0.7 }),
    );
    postL.position.set(-3.4, 0.6, 21.68);
    const postR = postL.clone();
    postR.position.x = 3.4;
    // Red carpet at the main entrance (the Lễ tân desk stands in the
    // middle in front of the Tổng giám đốc room, per the floor plan).
    const carpet = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.03, 3.6),
      new THREE.MeshStandardMaterial({ color: 0x8e1f2f, roughness: 1 }),
    );
    carpet.position.set(0, 0.02, 20.2);
    carpet.receiveShadow = true;
    const waitSofa = buildSofa(0x44508e);
    waitSofa.position.set(-6, 0, 20.1);
    waitSofa.rotation.y = Math.PI;
    // Lobby plants stand at the FAR forecourt corners: the main entrance
    // itself — doorway, red carpet and both door corners — stays
    // completely clear, exactly as the reference image shows.
    const lobbyPlant = buildPlant();
    lobbyPlant.position.set(10.8, 0, 20.9);
    const lobbyPlant2 = buildPlant();
    lobbyPlant2.position.set(-10.8, 0, 20.9);
    lobby.add(sign, signBack, signHalo, postL, postR, carpet, waitSofa, lobbyPlant, lobbyPlant2);
    for (const lp of [lobbyPlant, lobbyPlant2]) {
      lp.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) {
          plantsRef.current.push(o);
        }
      });
    }
    world.add(lobby);

    focusRef.current = (roomId: string | null, staffId?: string | null) => {
      const cam = camRef.current;
      // Bay VÀO TRONG phòng, hạ xuống sát bàn: đích là đầu người đang
      // ngồi gõ phím, camera đứng trước mặt chếch một góc (thấy mặt +
      // tay gõ + màn hình), khoảng cách ~3.1 — ngồi gần như ảnh mẫu.
      const flyDesk = (pos: THREE.Vector3, rotY: number) => {
        cam.targetGoal.set(pos.x, pos.y + 0.95 - FLOOR_DROP, pos.z);
        cam.distGoal = 3.1;
        cam.elevGoal = 0.34;
        cam.thetaGoal = rotY + Math.PI - 0.55;
      };
      if (staffId) {
        const sd = staffDeskRef.current.get(staffId);
        if (sd) {
          flyDesk(sd.pos, sd.rotY);
          return;
        }
      }
      if (!roomId) {
        // Toàn cảnh: quay về góc TỔNG GIÁM SÁT toàn công ty.
        cam.targetGoal.set(0, 0.6 - FLOOR_DROP, -2.5);
        cam.distGoal = 54;
        cam.elevGoal = 0.78;
        cam.thetaGoal = 0.7;
        return;
      }
      const f = roomFocusRef.current.get(roomId);
      if (!f) return;
      if (f.desk) {
        flyDesk(f.desk, f.deskRotY ?? 0);
        return;
      }
      cam.targetGoal.copy(f.center);
      cam.distGoal = f.dist;
      cam.elevGoal = 0.72;
    };

    // Camera controls — NO mode buttons and nothing to switch:
    // LEFT-drag (or ONE finger on touch) PANS — it grabs the scene and
    // moves the view to any department room; it does NOT merely orbit
    // in place. Right-drag, middle-drag or Space + left-drag pan the
    // same way. Rotating (orbit) on touch is the TWO-finger drag; the
    // wheel zooms toward the cursor. The pan target is NOT clamped to
    // any region, so the view can be dragged anywhere without getting
    // stuck in one corner. Dragging only moves the camera, never a
    // room. Double-click flies into a room; two fingers also
    // pinch-zoom while they rotate.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(0.5 - FLOOR_DROP));
    const pointers = new Map<number, { x: number; y: number }>();
    let downX = 0;
    let downY = 0;
    let downT = 0;
    let panning = false;
    let spaceDown = false;
    let pinchD = 0;
    let pinchMX = 0;
    let pinchMY = 0;

    const el = renderer.domElement;
    el.style.touchAction = "none";
    el.style.cursor = "grab";

    const setPointer = (ev: { clientX: number; clientY: number }) => {
      const rect = el.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const pickAt = (ev: { clientX: number; clientY: number }) => {
      setPointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, true);
      const hit = hits[0];
      if (!hit) return null;
      let obj: THREE.Object3D | null = hit.object;
      let staffId: string | null = null;
      let roomId: string | null = null;
      while (obj) {
        if (!staffId && obj.userData.staffId) staffId = obj.userData.staffId as string;
        if (!roomId && obj.userData.roomId) roomId = obj.userData.roomId as string;
        obj = obj.parent;
      }
      return { staffId, roomId };
    };

    const panBy = (dx: number, dy: number) => {
      const cam = camRef.current;
      const k = cam.distGoal * 0.0022;
      const sin = Math.sin(cam.thetaGoal);
      const cos = Math.cos(cam.thetaGoal);
      const se = Math.sin(cam.elevGoal);
      const ce = Math.cos(cam.elevGoal);
      // Camera right and up axes in world space.
      const rx = cos;
      const rz = -sin;
      const ux = -sin * se;
      const uy = ce;
      const uz = -cos * se;
      // NO region clamp on x/z: the user can drag the view to any room
      // in the office, however far, without the pan ever hitting a wall.
      // The y bound is only a loose sanity rail (far outside anything a
      // drag can reach in practice), never a wall the pan bumps into.
      cam.targetGoal.x += (-dx * rx + dy * ux) * k;
      cam.targetGoal.y = THREE.MathUtils.clamp(cam.targetGoal.y + dy * uy * k, -2 - FLOOR_DROP, 24);
      cam.targetGoal.z += (-dx * rz + dy * uz) * k;
    };

    const onDown = (ev: PointerEvent) => {
      try {
        el.setPointerCapture(ev.pointerId);
      } catch {
        // Capture is a nicety; dragging still works without it.
      }
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      setHover(null);
      hoverIdRef.current = null;
      if (pointers.size === 1) {
        downX = ev.clientX;
        downY = ev.clientY;
        downT = performance.now();
        // A single drag ALWAYS pans (moves the view): left button,
        // right button, middle button, Space + left, or one touch
        // finger — every one of them grabs the scene and drags it to a
        // new place. Left-drag must never degrade to rotate-only.
        // (spaceDown is still tracked so Space never scrolls the page,
        // but panning no longer depends on it.)
        void spaceDown;
        panning = true;
        el.style.cursor = "grabbing";
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (a && b) {
          pinchD = Math.hypot(a.x - b.x, a.y - b.y);
          pinchMX = (a.x + b.x) / 2;
          pinchMY = (a.y + b.y) / 2;
        }
      }
    };
    const onMove = (ev: PointerEvent) => {
      const prev = pointers.get(ev.pointerId);
      if (!prev) {
        // Hover: show the name card of the person under the cursor.
        if (ev.pointerType === "mouse") {
          const pick = pickAt(ev);
          if (pick?.staffId) {
            const rect = el.getBoundingClientRect();
            setHover({
              id: pick.staffId,
              x: ev.clientX - rect.left,
              y: ev.clientY - rect.top,
            });
            hoverIdRef.current = pick.staffId;
            el.style.cursor = "pointer";
          } else {
            setHover(null);
            hoverIdRef.current = null;
            el.style.cursor = "grab";
          }
        }
        return;
      }
      const dx = ev.clientX - prev.x;
      const dy = ev.clientY - prev.y;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 1) {
        // One pointer (any mouse button, or one touch finger) PANS:
        // the view travels to wherever the drag takes it. Holding Alt
        // or Shift while dragging ROTATES instead — light, direct
        // orbiting with the mouse, so xoay không còn khó: a short
        // drag turns the view a long way and the follow smoothing
        // (theta lerp in the render loop) keeps it silky.
        if (ev.altKey || ev.shiftKey) {
          const cam = camRef.current;
          cam.thetaGoal += dx * 0.0075;
          cam.elevGoal = THREE.MathUtils.clamp(cam.elevGoal + dy * 0.0045, 0.08, 1.5);
        } else if (panning) panBy(dx, dy);
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const cam = camRef.current;
        if (pinchD > 0 && d > 0) {
          cam.distGoal = THREE.MathUtils.clamp(cam.distGoal * (pinchD / d), 3.5, 110);
        }
        // Two-finger drag ROTATES (orbits) — the rotate gesture on
        // touch. Dragging the pair sideways turns the view around the
        // scene; dragging it up/down tilts the elevation, over the
        // same wide range as before (almost ground level to almost
        // straight overhead) so rotation never feels stuck at an
        // angle; only the last few degrees before the poles are held
        // back to keep the orbit math stable.
        cam.thetaGoal += (mx - pinchMX) * 0.0085;
        cam.elevGoal = THREE.MathUtils.clamp(
          cam.elevGoal + (my - pinchMY) * 0.005,
          0.08,
          1.5,
        );
        pinchD = d;
        pinchMX = mx;
        pinchMY = my;
      }
    };
    const onUp = (ev: PointerEvent) => {
      const wasSingle = pointers.size === 1 && pointers.has(ev.pointerId);
      pointers.delete(ev.pointerId);
      if (pointers.size === 0) el.style.cursor = "grab";
      if (!wasSingle) return;
      const moved = Math.hypot(ev.clientX - downX, ev.clientY - downY);
      if (moved > 6 || performance.now() - downT > 600) return;
      const pick = pickAt(ev);
      if (!pick) return;
      if (pick.staffId) {
        // Người vừa bấm chọn: bảng tên của người đó luôn hiện
        // (kể cả khi zoom xa) cho tới khi bấm chọn người khác —
        // và camera bay vào phòng, hạ xuống sát bàn của đúng
        // người đó để nhìn cận cảnh họ đang làm việc.
        pickedIdRef.current = pick.staffId;
        selectStaffRef.current(pick.staffId);
        if (pick.roomId) setFocusedId(pick.roomId);
        focusRef.current(pick.roomId, pick.staffId);
        return;
      }
      if (pick.roomId) {
        setFocusedId(pick.roomId);
        focusRef.current(pick.roomId);
      }
    };
    const onCancel = (ev: PointerEvent) => {
      pointers.delete(ev.pointerId);
      if (pointers.size === 0) el.style.cursor = "grab";
    };
    const onLeave = () => {
      if (pointers.size === 0) {
        setHover(null);
        hoverIdRef.current = null;
      }
    };
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const cam = camRef.current;
      const delta = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
      const newDist = THREE.MathUtils.clamp(cam.distGoal * Math.exp(delta * 0.0012), 3.5, 110);
      // Zoom toward the point under the cursor, not the view centre.
      setPointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hitP = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hitP)) {
        const ratio = newDist / cam.distGoal;
        cam.targetGoal.sub(hitP).multiplyScalar(ratio).add(hitP);
        // No region clamp here either: zooming toward the cursor must
        // never fight the unlimited drag pan.
      }
      cam.distGoal = newDist;
    };
    const onDbl = (ev: MouseEvent) => {
      const pick = pickAt(ev);
      if (pick?.roomId) {
        setFocusedId(pick.roomId);
        focusRef.current(pick.roomId);
      }
    };
    const onCtx = (ev: Event) => ev.preventDefault();
    const spaceGuard = (ev: KeyboardEvent): boolean => {
      if (ev.code !== "Space") return false;
      const t = ev.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
      )
        return false;
      return true;
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (spaceGuard(ev)) spaceDown = true;
      // Phím mũi tên cũng xoay / nghiêng camera được — thêm một đường
      // xoay dễ nữa ngoài chuột và hai ngón tay.
      const tag = (ev.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const cam = camRef.current;
      if (ev.key === "ArrowLeft") {
        cam.thetaGoal += 0.22;
        ev.preventDefault();
      } else if (ev.key === "ArrowRight") {
        cam.thetaGoal -= 0.22;
        ev.preventDefault();
      } else if (ev.key === "ArrowUp") {
        cam.elevGoal = THREE.MathUtils.clamp(cam.elevGoal + 0.08, 0.08, 1.5);
        ev.preventDefault();
      } else if (ev.key === "ArrowDown") {
        cam.elevGoal = THREE.MathUtils.clamp(cam.elevGoal - 0.08, 0.08, 1.5);
        ev.preventDefault();
      }
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (spaceGuard(ev)) spaceDown = false;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDbl);
    el.addEventListener("contextmenu", onCtx);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Walking routes: NO corridors and NO fixed forced detour.
    // The floor is one open shared floor — the central hall and
    // the open walkways between the room rows form a waypoint
    // graph laid over that open floor; every trip takes the
    // SHORTEST clear path through that graph, out of the room's
    // door (which opens straight onto the shared floor) and into
    // the target's door, never through glass, desks or chairs.
    // The layout stays TIDY and BALANCED: the plot and its
    // shared walkways are split evenly, mirrored across the
    // central axis — the open floor is the same width on both
    // sides, so every trip can take either side and nobody gets
    // stuck or funnelled one way. The main axis runs straight
    // from the main entrance up through the central hall to the
    // executive row, and the shared walkways never cross a room.
    // Every trip is driven by a real task state.
    // The Chủ tịch room is reached by its 2 FLIPPED straight
    // stairs — KHÔNG CÒN BAN CÔNG / SẢNH NGOÀI, KHÔNG CÒN CẦU
    // THANG ĐẶNG TRƯỚC, KHÔNG CÒN CẦU THANG SƯỜN PHÒNG CHỦ
    // TỊCH, KHÔNG CÒN THANG TRONG 2 KHE BÊN PHÒNG TỔNG GIÁM
    // ĐỐC: the room stands raised on its low podium
    // (CHAIR_LEVEL) behind the executive row, and the path
    // follows the carpeted executive lane and the HALLWAY
    // BELOW (the back strip — now left completely clear, with
    // its own NAV nodes, so the inner rooms can walk it end to
    // end) to the FOOT of the stair on the walker's side —
    // the foot stands right at the room's front wall, at that
    // side's open passage, where the old flight's head used to
    // arrive — climbs the flight tread by tread INTO the room
    // along the interior partition corridor (hành lang) to the
    // middle, and in through the room's ONE SINGLE MAIN DOOR.
    // Along the entry axis the stairs sit AFTER the 3 short
    // entrance steps — through the main gate, up those 3 steps,
    // across the carpeted hall, and only then to the stair
    // feet; the stairs never stand before the 3 steps and never
    // block them. Approaches are fed symmetrically from both
    // sides, matching the balanced plot.
    const meetingRoom = rooms.find((r) => r.id === "meeting");
    const MEETING_DOOR = meetingRoom
      ? new THREE.Vector3(
          meetingRoom.x + (meetingRoom.w / 2 + 0.55),
          0.22,
          meetingRoom.z,
        )
      : new THREE.Vector3(-6.35, 0.22, 17.4);

    interface Rect {
      x1: number;
      x2: number;
      z1: number;
      z2: number;
    }
    const rectOf = (r: OfficeRoomDef, pad: number): Rect => ({
      x1: r.x - r.w / 2 - pad,
      x2: r.x + r.w / 2 + pad,
      z1: r.z - r.d / 2 - pad,
      z2: r.z + r.d / 2 + pad,
    });
    const roomRects: Rect[] = rooms
      .filter((r) => !isPost(r.id))
      .map((r) => rectOf(r, 0.25));
    const blockers: Rect[] = [
      ...roomRects,
      ...rooms.filter((r) => isPost(r.id)).map((r) => rectOf(r, 0.1)),
      { x1: -3.5, x2: 3.5, z1: 12.7, z2: 14.5 }, // koi tank
      // NO stair blockers in the slots beside the Tổng giám đốc room any more: the two flights were FLIPPED into the Chủ tịch room itself (inside that room's own rect, which already blocks graph routes — trips there use the explicit climb points), so the slots and the hallway below are open walkways now.
      { x1: 5.0, x2: 6.0, z1: 16.3, z2: 18.3 }, // tea sofas
      { x1: -6.0, x2: -5.0, z1: 16.3, z2: 18.3 },
      { x1: -7.0, x2: -5.0, z1: 19.6, z2: 20.6 }, // lobby sofa
      // Nội thất 5 khu tiện ích hai bên sườn Phòng Chủ tịch: đường đi
      // vòng qua đúng như mắt thấy, không xuyên bàn ghế / máy móc.
      { x1: -23.5, x2: -20.5, z1: -21.5, z2: -19.7 }, // bàn bi-a
      { x1: -16.2, x2: -13.4, z1: -21.5, z2: -19.7 }, // bàn bóng bàn
      { x1: -25.0, x2: -18.7, z1: -17.1, z2: -16.0 }, // kệ sách thư viện
      { x1: 14.0, x2: 21.0, z1: -29.0, z2: -27.9 }, // quầy cà phê
      { x1: 22.0, x2: 23.2, z1: -28.9, z2: -27.9 }, // tủ lạnh
      { x1: 12.7, x2: 16.5, z1: -18.6, z2: -16.6 }, // máy chạy bộ
      { x1: 12.7, x2: 16.5, z1: -22.5, z2: -21.1 }, // xe đạp tập
    ];
    const blockCircles = [
      { x: 0, z: 9.4, r: 1.7 }, // bonsai
      { x: -2.9, z: 17.3, r: 1.2 }, // tea tables
      { x: 2.9, z: 17.3, r: 1.2 },
      { x: -19.5, z: -26.6, r: 1.85 }, // hồ cá khu vườn xanh
      { x: 15.5, z: -24.6, r: 1.1 }, // bàn ăn tròn 1
      { x: 21.5, z: -24.6, r: 1.1 }, // bàn ăn tròn 2
    ];
    const blockedAt = (x: number, z: number): boolean =>
      blockers.some((b) => x > b.x1 && x < b.x2 && z > b.z1 && z < b.z2) ||
      blockCircles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
    const losClear = (a: THREE.Vector3, b: THREE.Vector3): boolean => {
      const d = a.distanceTo(b);
      const n = Math.max(2, Math.ceil(d / 0.35));
      for (let i = 1; i < n; i++) {
        // Samples hugging either endpoint are exempt: people step right
        // up to a chair, a desk edge or a doorway.
        const along = (i / n) * d;
        if (along < 0.55 || d - along < 0.55) continue;
        if (blockedAt(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)) return false;
      }
      return true;
    };
    // Waypoints spread over the open shared floor: the central
    // hall, post gaps, the open back ground around the Chủ tịch
    // room and the open floor between and across the room rows
    // — no corridor lanes.
    const NAV: [number, number][] = [
      [0, -3.2], [4.2, -3.2], [-4.2, -3.2], [7.9, -3.2], [-7.9, -3.2],
      [6.55, -9], [-6.55, -9], [6.55, -12.2], [-6.55, -12.2],
      [0, -14.5], [6.55, -14.5], [-6.55, -14.5], [12.2, -14.5], [-12.2, -14.5], [17.6, -14.5], [-17.6, -14.5],
      [18.5, -8], [-18.5, -8], [18.5, -16], [-18.5, -16],
      [18.5, -24], [-18.5, -24], [2.35, 3.9], [-2.35, 3.9],
      [2.35, 6.4], [-2.35, 6.4],
      [7.8, -2.6], [-7.8, -2.6], [7.8, 1.6], [-7.8, 1.6],
      [4.6, 7.6], [-4.6, 7.6], [0, 6.4], [4.6, 11], [-4.6, 11],
      [4.6, 16], [-4.6, 16], [4.6, 20.3], [-4.6, 20.3], [0, 20.8],
      // Nút trên LƯỚI CHUẨN ĐỀU (Chủ tịch đính chính): nút dọc theo
      // lối đi dọc 3.0 ở tâm từng hàng phòng (−10.2 / −1.0 / 8.2 /
      // 17.4) và nút ngang ở tâm từng hành lang ngang 3.0 giữa các
      // hàng (−5.6 / 3.6 / 12.8) — từ sảnh (±10) qua lối dọc (±17.6)
      // tới cột ngoài (±23): hàng nào, cột nào cũng có nút đường đi
      // ngay cửa, không phòng nào phải đi vòng xa hơn phòng khác.
      [17.6, -10.2], [-17.6, -10.2],
      [10, -5.6], [-10, -5.6], [17.6, -5.6], [-17.6, -5.6], [23, -5.6], [-23, -5.6],
      [17.6, -1.0], [-17.6, -1.0],
      [10, 3.6], [-10, 3.6], [17.6, 3.6], [-17.6, 3.6], [23, 3.6], [-23, 3.6],
      [17.6, 8.2], [-17.6, 8.2],
      [10, 12.8], [-10, 12.8], [17.6, 12.8], [-17.6, 12.8], [23, 12.8], [-23, 12.8],
      [17.6, 17.4], [-17.6, 17.4],
      // Nút đường đi vào 5 khu tiện ích: chạy dọc dải thảm dọc ±17.5 và
      // các dải thảm ngang từng khu — từ hành lang bên dưới (z=-14.5) vào
      // thẳng từng khu, thẳng và ngắn, không khu nào phải đi vòng.
      [17.5, -17.2], [-17.5, -17.2], [17.5, -20.5], [-17.5, -20.5],
      [17.5, -25.7], [-17.5, -25.7], [11, -20.5], [-11, -20.5],
      [24, -20.5], [-24, -20.5], [11, -25.7], [-11, -25.7],
      [24, -25.7], [-24, -25.7], [11, -17.2], [-11, -17.2],
      [24, -17.2], [-24, -17.2],
    ];
    const NAV_NODES = NAV.map(([x, z]) => new THREE.Vector3(x, 0.22, z));
    // Shortest path over the waypoint graph (Dijkstra), with the start
    // and end points added as temporary nodes joined by line of sight.
    const graphPath = (from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] => {
      const pts: THREE.Vector3[] = [from, ...NAV_NODES, to];
      const n = pts.length;
      const dist = new Array<number>(n).fill(Infinity);
      const prev = new Array<number>(n).fill(-1);
      const done = new Array<boolean>(n).fill(false);
      dist[0] = 0;
      for (let k = 0; k < n; k++) {
        let u = -1;
        let best = Infinity;
        for (let i = 0; i < n; i++) {
          if (!done[i] && (dist[i] ?? Infinity) < best) {
            best = dist[i] ?? Infinity;
            u = i;
          }
        }
        if (u < 0) break;
        done[u] = true;
        if (u === n - 1) break;
        const pu = pts[u];
        if (!pu) break;
        for (let v = 0; v < n; v++) {
          if (v === u || done[v]) continue;
          const pv = pts[v];
          if (!pv || !losClear(pu, pv)) continue;
          const nd = (dist[u] ?? Infinity) + pu.distanceTo(pv);
          if (nd < (dist[v] ?? Infinity)) {
            dist[v] = nd;
            prev[v] = u;
          }
        }
      }
      if (!Number.isFinite(dist[n - 1] ?? Infinity)) return [to.clone()];
      const path: THREE.Vector3[] = [];
      let cur = n - 1;
      while (cur > 0) {
        const p = pts[cur];
        if (!p) break;
        path.unshift(p.clone());
        cur = prev[cur] ?? -1;
      }
      return path;
    };
    const rawRoomOf = (p: THREE.Vector3): OfficeRoomDef | undefined =>
      rooms.find(
        (r) =>
          !isPost(r.id) &&
          Math.abs(p.x - r.x) < r.w / 2 &&
          Math.abs(p.z - r.z) < r.d / 2,
      );

    const computeRoute = (
      rig: AvatarRig,
      target: THREE.Vector3,
      targetDoor: THREE.Vector3 | null,
    ): THREE.Vector3[] => {
      const pts: THREE.Vector3[] = [];
      let start = rig.pos.clone();
      const startRoom = rawRoomOf(rig.pos);
      const targetRoom = rawRoomOf(target);
      const dedupe = (list: THREE.Vector3[]): THREE.Vector3[] =>
        list.filter(
          (p, i) => i === list.length - 1 || p.distanceTo(list[i + 1] ?? p) > 0.3,
        );
      // Same-room trip: walk straight across the room, no
      // shared-floor route needed (the Chủ tịch room included —
      // inside it everything is on its one raised floor).
      if (startRoom && targetRoom === startRoom) {
        pts.push(target.clone());
        return dedupe(pts);
      }
      if (startRoom) {
        // Starting inside a room: out through its own door onto
        // the shared floor. The Chủ tịch room leaves through its
        // ONE MAIN DOOR into the interior corridor, along the
        // corridor to the side matching the destination, DOWN
        // that side's FLIPPED straight stair (its head lands on
        // the corridor floor in front of the pushed-back
        // partition, its foot at the front wall) and out that
        // side's open passage (KHÔNG CÒN BAN CÔNG / SẢNH NGOÀI,
        // KHÔNG CÒN CẦU THANG ĐẶNG TRƯỚC / SƯỜN PHÒNG CHỦ TỊCH,
        // KHÔNG CÒN THANG TRONG KHE): main door → corridor →
        // tread by tread down the flight → passage → the
        // carpeted hallway below.
        if (startRoom.id === "chairman") {
          const side = target.x < 0 ? -1 : 1;
          pts.push(...chairStairDown(side));
          start = chairStairFoot(side);
        } else {
          pts.push(rig.door.clone());
          start = rig.door.clone();
        }
      }
      if (targetRoom && targetRoom.id === "chairman") {
        // Arriving at the Chủ tịch room: across the carpeted
        // shared floor (and along the now-clear hallway below)
        // to the foot of the stair on the walker's side — the
        // foot stands right at the room's front wall, at that
        // side's open passage — UP that flight tread by tread
        // INTO the room, along the interior corridor to the
        // middle and in through the ONE MAIN DOOR to the target.
        const side = start.x < 0 ? -1 : 1;
        pts.push(...graphPath(start, chairStairFoot(side)));
        pts.push(...chairStairDown(side).reverse().slice(1), target.clone());
        return dedupe(pts);
      }
      const end = targetDoor ?? target;
      pts.push(...graphPath(start, end));
      if (targetDoor && targetDoor.distanceTo(target) > 0.05) pts.push(target.clone());
      return dedupe(pts);
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const w = mount.clientWidth || 320;
      const h = mount.clientHeight || 300;
      renderer.setSize(w, h);
      if (composer) composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let raf = 0;
    let prevT = 0;
    let fpsFrames = 0;
    let fpsLastT = 0;
    const clock = new THREE.Clock();
    const tmpTarget = new THREE.Vector3();
    const tmpDir = new THREE.Vector3();
    // Base walking pace (metres per second), scaled per person by their
    // own speed factor: some walk briskly, some stroll — nobody runs.
    const WALK_SPEED = 1.25;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      try {
        const t = clock.getElapsedTime();
        const dt = Math.min(Math.max(t - prevT, 0), 0.05);
        prevT = t;
        const cam = camRef.current;
        // The camera tracks its goal briskly: while dragging, the view
        // must land where the mouse took it almost immediately — a slow
        // drift here is what made panning feel stuck and laggy.
        // Xoay theo cung ngắn nhất: bay từ góc tổng giám sát vào
        // sát bàn (lệch gần nửa vòng) không quay vòng dài qua tường.
        const dTheta = Math.atan2(
          Math.sin(cam.thetaGoal - cam.theta),
          Math.cos(cam.thetaGoal - cam.theta),
        );
        cam.theta += dTheta * 0.22;
        cam.elev += (cam.elevGoal - cam.elev) * 0.22;
        cam.dist += (cam.distGoal - cam.dist) * 0.16;
        cam.target.lerp(cam.targetGoal, 0.2);
        const ce = Math.cos(cam.elev);
        camera.position.set(
          cam.target.x + cam.dist * Math.sin(cam.theta) * ce,
          cam.target.y + cam.dist * Math.sin(cam.elev),
          cam.target.z + cam.dist * Math.cos(cam.theta) * ce,
        );
        camera.lookAt(cam.target);

        // BẢNG TÊN TRÊN ĐẦU (Chủ tịch chốt): bình thường ẨN HẾT
        // — ở mức zoom xa / góc nhìn thường (dist > 38) không
        // bảng nào tự hiện, sàn sạch hoàn toàn; chỉ người đang
        // được di chuột vào hoặc đã bấm chọn mới hiện bảng của
        // mình, ở mọi mức zoom. Zoom vào vừa (dist <= 38) hiện
        // thêm Chủ tịch / Tổng giám đốc / trưởng phòng; zoom
        // thật gần (dist <= 22) mới hiện tất cả nhân viên. Công
        // tắc tắt thì ẩn hẳn. Các bảng đang hiện mà gần nhau
        // trên màn hình tự SO LE nâng lên né nhau theo từng
        // nấc, không dính cụm; người được hover/bấm chọn giữ
        // nguyên vị trí, các bảng khác né quanh họ.
        {
          const tags = headTagsRef.current;
          if (tags.size > 0) {
            camera.updateMatrixWorld();
            const on = tagsOnRef.current;
            const dist = cam.dist;
            const focusId =
              hoverIdRef.current ?? pickedIdRef.current;
            const viewW = el.clientWidth || 1;
            const viewH = el.clientHeight || 1;
            const ppu =
              viewH /
              (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
            const tagWpx = 1.35 * ppu;
            const tagHpx = 0.3 * ppu;
            const rankPrio: Record<TagRank, number> = {
              chairman: 1,
              ceo: 2,
              head: 3,
              staff: 4,
            };
            const visible: {
              id: string;
              sx: number;
              sy: number;
              prio: number;
              liftGoal: number;
            }[] = [];
            tags.forEach((tag, id) => {
              const isFocus = id === focusId;
              const rankOk =
                dist <= 22
                  ? true
                  : dist <= 38
                    ? tag.rank !== "staff"
                    : false;
              const show = on && (rankOk || isFocus);
              tag.sprite.visible = show;
              if (!show) {
                tag.liftGoal = 0;
                tag.sprite.position.y +=
                  (TAG_BASE_Y - tag.sprite.position.y) * 0.25;
                return;
              }
              tag.sprite.getWorldPosition(tmpDir);
              tmpDir.project(camera);
              visible.push({
                id,
                sx: (tmpDir.x * 0.5 + 0.5) * viewW,
                sy: (-tmpDir.y * 0.5 + 0.5) * viewH,
                prio: isFocus ? 0 : rankPrio[tag.rank],
                liftGoal: 0,
              });
            });
            visible.sort((a, b) => a.prio - b.prio || a.sy - b.sy);
            const placed: { x: number; y: number }[] = [];
            for (const item of visible) {
              let lift = 0;
              let sy = item.sy;
              let guard = 0;
              while (
                guard < 5 &&
                placed.some(
                  (p) =>
                    Math.abs(p.x - item.sx) < tagWpx * 0.85 &&
                    Math.abs(p.y - sy) < tagHpx * 1.2,
                )
              ) {
                lift += 0.34;
                sy -= 0.34 * ppu;
                guard += 1;
              }
              item.liftGoal = lift;
              placed.push({ x: item.sx, y: sy });
            }
            for (const item of visible) {
              const tag = tags.get(item.id);
              if (!tag) continue;
              tag.liftGoal = item.liftGoal;
              const goalY = TAG_BASE_Y + tag.liftGoal;
              tag.sprite.position.y += (goalY - tag.sprite.position.y) * 0.25;
            }
          }
        }

        // BONG BÓNG CHỮ TRÊN ĐẦU: ĐÃ BỎ HẲN (Chủ tịch chốt) —
        // mọi sprite bong bóng luôn tắt, không điều kiện nào bật
        // lại; chỉ còn bảng tên nhỏ trên đầu theo công tắc Bảng tên.
        {
          bubbleRef.current.forEach((entry) => {
            entry.sprite.visible = false;
          });
        }

        if (!reduced) {
          rigs.forEach((rig, id) => {
            const kind = presenceRef.current[id] ?? "idle";
            let target = rig.seat;
            let targetRotY = rig.seatRotY;
            let targetSit = 1;
            let targetDoor: THREE.Vector3 | null = null;
            let lean = 0;
            let restVariant = -1;
            if (kind === "meeting" && (id === "dao-dien" || id === "qc")) {
              const seatDef = meetingSeatsRef.current[id === "dao-dien" ? 1 : 4];
              if (seatDef) {
                target = seatDef.pos;
                targetRotY = seatDef.rotY;
                targetSit = 1;
                targetDoor = MEETING_DOOR;
              }
            } else if (kind === "report-ceo") {
              // Director walks up the carpeted executive lane,
              // along the now-clear hallway below to the FOOT of
              // the flipped straight stair at the Chủ tịch room's
              // front wall, UP that flight INTO the room, along
              // the interior corridor and through the ONE MAIN
              // DOOR of the Chủ tịch room — raised on its low
              // podium — to report the final result to the Chủ
              // tịch.
              const ceoRig = rigs.get("chu-tich");
              if (ceoRig) {
                tmpTarget.copy(ceoRig.seat);
                tmpTarget.x += 1.7;
                tmpTarget.z += 1.0;
                target = tmpTarget;
                targetRotY = Math.PI / 2 - 0.35;
                targetSit = 0;
              }
            } else if (kind === "reporting") {
              // The assignee carries the work to the QC desk and waits there,
              // hands stopped, while QC reviews it.
              const qcRig = rigs.get("qc");
              if (qcRig && qcRig !== rig) {
                tmpTarget.copy(qcRig.seat);
                tmpTarget.x += 1.3;
                tmpTarget.z += 0.3;
                target = tmpTarget;
                targetRotY = Math.PI / 2;
                targetSit = 0;
                targetDoor = qcRig.door;
              }
            } else if (kind === "checking") {
              // Walk over to the desk of the person whose work is being
              // checked; fall back to the spot in front of the big screen.
              const targetId = walkTargetRef.current[id];
              const targetRig = targetId ? rigs.get(targetId) : undefined;
              if (targetRig && targetRig !== rig) {
                tmpTarget.copy(targetRig.seat);
                tmpTarget.x += 1.2;
                tmpTarget.z += 0.2;
                target = tmpTarget;
                targetRotY = -Math.PI / 2 + 0.35;
                targetSit = 0;
                targetDoor = targetRig.door;
              } else {
                const spot = checkSpotsRef.current.get(id);
                if (spot) {
                  target = spot;
                  targetRotY = 0;
                  targetSit = 0;
                }
              }
            } else if (kind === "a2a") {
              // New task waiting: walk the shared floor to the Director's desk,
              // receive the brief there, then the state flips to working and
              // the same route brings them back to their own desk.
              const dirRig = rigs.get("dao-dien");
              if (dirRig && dirRig !== rig) {
                tmpTarget.copy(dirRig.seat);
                tmpTarget.x += 1.4;
                tmpTarget.z += 0.4;
                target = tmpTarget;
                targetRotY = Math.PI / 2;
                targetSit = 0;
                targetDoor = dirRig.door;
              } else {
                tmpTarget.copy(rig.seat);
                tmpTarget.x += 1.35;
                tmpTarget.z += 0.25;
                target = tmpTarget;
                targetRotY = -0.5;
                targetSit = 0;
              }
            } else if (kind === "resting") {
              // Real rest, only when the person holds no open task: rotate by
              // person between leaning back at the desk (Zzz), the lobby sofa
              // and standing by the desk with a coffee. No model is called.
              restVariant = rig.phase % 3;
              if (id === "tong-giam-doc") {
                // The Tổng giám đốc takes tea at the central tea area.
                restVariant = 1;
                target = new THREE.Vector3(3.44, 0, 16.4);
                targetRotY = 2.6;
                targetSit = 1;
                lean = 1;
              } else if (restVariant === 1) {
                // Relax spots spread across the office so people do not
                // pile onto one sofa: lobby sofa, tea-table chairs, tea
                // sofas and the bonsai garden edge — picked per person
                // with a small sideways offset.
                const relaxSpots: [number, number, number][] = [
                  [-6.6, 19.45, 0],
                  [-5.2, 19.45, 0],
                  [-2.4, 18.2, 0.5],
                  [3.4, 18.2, 0.5],
                  [-2.4, 16.4, 2.6],
                  [1.9, 17.1, 4.5],
                  [-6.1, 16.2, -1.2],
                  [6.1, 16.2, 1.2],
                  // Điểm thư giãn trong 5 khu tiện ích hai bên sườn: ghế
                  // đá khu vườn xanh, ghế đọc thư viện, ghế bàn ăn khu ăn
                  // uống, ghế thư giãn khu giải trí — người rảnh đi thẳng
                  // theo thảm vào tận khu, không đi vòng.
                  [-16.6, -24.9, -2.4],
                  [-22.6, -18.2, 0],
                  [15.5, -23.2, 3.1],
                  [-11.6, -19.7, -1.57],
                ];
                const spot = relaxSpots[rig.phase % relaxSpots.length] ?? relaxSpots[0];
                const jx = ((rig.phase * 37 + id.length * 13) % 5 - 2) * 0.22;
                target = new THREE.Vector3((spot?.[0] ?? -6.6) + jx, 0, spot?.[1] ?? 19.45);
                targetRotY = spot?.[2] ?? 0;
                targetSit = 1;
                lean = 1;
              } else if (restVariant === 2) {
                tmpTarget.copy(rig.seat);
                tmpTarget.x += 1.0;
                tmpTarget.z += 0.45;
                target = tmpTarget;
                targetRotY = -0.6;
                targetSit = 0;
              } else {
                lean = 1;
              }
            }
            // Heading back to one's own desk: enter through one's own
            // door (front-band rooms route via the front walkway).
            if (!targetDoor && target === rig.seat) targetDoor = rig.door;
            // Route through door + shared floor
            // instead of cutting straight through desks and glass.
            const targetKey = `${kind}:${target.x.toFixed(1)},${target.z.toFixed(1)}`;
            if (targetKey !== rig.targetKey) {
              rig.targetKey = targetKey;
              rig.path = computeRoute(rig, target, targetDoor);
              // Staggered departures, each on their own clock: nobody sets
              // off in a row or comes back in a row.
              rig.startAt = t + (rig.phase % 5) * 0.45;
              rig.pauseUntil = 0;
              rig.nextPauseAt = t + 4 + (rig.phase % 7);
            }
            // Carrying a document folder on reporting / receiving /
            // checking trips, hands free otherwise.
            if (rig.folder) {
              rig.folder.visible =
                kind === "reporting" || kind === "a2a" || kind === "checking";
            }
            const dest = rig.path[0] ?? target;
            // Natural walking toward each waypoint at each person's own
            // pace — never the old distance-proportional lerp, which
            // launched people across the room and slowed them near the
            // target. Standing up comes first: a seated person rises
            // before the first step and sits back down only once arrived,
            // so nobody ever slides across the floor still seated.
            const distTarget = rig.pos.distanceTo(target);
            const effSit = targetSit === 1 && distTarget > 0.45 ? 0 : targetSit;
            rig.sit += (effSit - rig.sit) * Math.min(1, dt * 5);
            // Mid-trip pauses on each person's own rhythm: stop for a
            // chat, a glance around, a moment by the tea area — then walk
            // on. Pauses only happen en route, never at the destination.
            if (
              rig.path.length > 1 &&
              distTarget > 2.5 &&
              t >= rig.startAt &&
              t > rig.nextPauseAt
            ) {
              const pauseDur = 1.4 + ((rig.phase * 29 + Math.floor(t)) % 30) / 10;
              rig.pauseUntil = t + pauseDur;
              rig.nextPauseAt = t + pauseDur + 6 + ((rig.phase * 53) % 80) / 10;
            }
            const paused = t < rig.pauseUntil || t < rig.startAt;
            let moved = 0;
            if ((rig.sit < 0.7 || distTarget <= 0.5) && !paused) {
              tmpDir.copy(dest).sub(rig.pos);
              const dDest = tmpDir.length();
              if (dDest > 0.0001) {
                const step = Math.min(dDest, WALK_SPEED * rig.speed * dt);
                rig.pos.addScaledVector(tmpDir.normalize(), step);
                moved = step;
              }
              if (rig.path.length > 0 && rig.pos.distanceTo(dest) < 0.22) rig.path.shift();
            }
            // The stride phase advances with the distance actually
            // covered, so legs, arms and the body bob swing exactly in
            // step with the movement — no foot sliding, no marching on
            // the spot, and everything settles the moment they stop.
            rig.stride += moved * 5.0;
            rig.group.position.copy(rig.pos);
            const phase = rig.phase;
            const sit = rig.sit;
            const walking = moved > 0.0005 && sit < 0.75;
            // Face the walking direction while moving; face the stance
            // direction once arrived. Wrapped-angle lerp.
            let desiredRot = targetRotY;
            if (walking) {
              desiredRot = Math.atan2(-(dest.x - rig.pos.x), -(dest.z - rig.pos.z));
            }
            let dr = desiredRot - rig.group.rotation.y;
            while (dr > Math.PI) dr -= Math.PI * 2;
            while (dr < -Math.PI) dr += Math.PI * 2;
            rig.group.rotation.y += dr * Math.min(1, dt * 6.5);
            // Legs: seated thighs forward; walking legs swing in stride.
            if (walking) {
              const sw = Math.sin(rig.stride + phase) * 0.5 * (1 - sit);
              rig.legL.rotation.x = 1.35 * sit + sw;
              rig.legR.rotation.x = 1.35 * sit - sw;
            } else {
              rig.legL.rotation.x = 1.35 * sit;
              rig.legR.rotation.x = 1.35 * sit;
            }
            rig.legL.position.y = 0.52 - 0.3 * sit;
            rig.legR.position.y = 0.52 - 0.3 * sit;
            // Body height / lean: seated drop, walking bob, resting lean-back.
            rig.bodyGroup.position.y = -0.3 * sit;
            if (walking) {
              rig.bodyGroup.position.y += Math.abs(Math.sin(rig.stride + phase)) * 0.04 * (1 - sit);
              rig.bodyGroup.rotation.x = 0.05;
            } else if (lean) {
              rig.bodyGroup.rotation.x = -0.16;
            } else if (kind === "working" && sit > 0.8) {
              rig.bodyGroup.position.y += Math.abs(Math.sin(t * 6.5)) * 0.018;
              rig.bodyGroup.rotation.x = 0.06 + Math.sin(t * 6.5) * 0.012;
            } else {
              rig.bodyGroup.rotation.x = 0;
            }
            // Arms and head per state. Reset side-tilts every frame first.
            rig.armL.rotation.z = 0;
            rig.armR.rotation.z = 0;
            rig.head.rotation.y = 0;
            if (walking) {
              const sw = Math.sin(rig.stride + phase) * 0.34 * (1 - sit);
              rig.armL.rotation.x = sw;
              rig.armR.rotation.x = -sw;
              rig.head.rotation.x = 0.04;
            } else if (kind === "working" && sit > 0.8) {
              // Hands on the keyboard, eyes on the monitor — with a lived
              // rhythm: mostly typing, sometimes the mouse, sometimes a sip
              // of coffee, sometimes a stretch. Cycle differs per person.
              const cyc = (t + phase * 7) % 40;
              if (cyc > 37) {
                rig.armL.rotation.x = -2.65 + Math.sin(t * 2 + phase) * 0.08;
                rig.armR.rotation.x = -2.65 - Math.sin(t * 2 + phase) * 0.08;
                rig.head.rotation.x = -0.16;
              } else if (cyc > 30) {
                rig.armL.rotation.x = -1.02 + Math.sin(t * 6.5 + phase) * 0.09;
                rig.armR.rotation.x = -2.1;
                rig.armR.rotation.z = -0.3;
                rig.head.rotation.x = 0.02;
              } else if (cyc > 20 && cyc <= 22.5) {
                rig.armL.rotation.x = -1.02 + Math.sin(t * 6.5 + phase) * 0.09;
                rig.armR.rotation.x = -0.6 + Math.sin(t * 9 + phase) * 0.05;
                rig.armR.rotation.z = -0.3;
                rig.head.rotation.x = 0.15;
              } else {
                rig.armL.rotation.x = -1.02 + Math.sin(t * 6.5 + phase) * 0.09;
                rig.armR.rotation.x = -1.02 + Math.sin(t * 6.5 + phase + 1.4) * 0.09;
                rig.head.rotation.x = 0.14 + Math.sin(t * 6.5 + phase) * 0.02;
              }
            } else if (kind === "meeting") {
              rig.armR.rotation.x = -0.55 + Math.sin(t * 1.9 + phase) * 0.28;
              rig.armL.rotation.x = -0.15 + Math.sin(t * 1.3 + phase) * 0.06;
              rig.head.rotation.x = Math.sin(t * 2.3 + phase) * 0.07;
              rig.head.rotation.y = Math.sin(t * 0.7 + phase) * 0.2;
            } else if (kind === "reporting" || kind === "report-ceo" || kind === "a2a") {
              // Standing at the desk, reporting / receiving: arms folded,
              // attention on the person across the desk.
              rig.armL.rotation.x = -0.5;
              rig.armL.rotation.z = 0.45;
              rig.armR.rotation.x = -0.5;
              rig.armR.rotation.z = -0.45;
              rig.head.rotation.x = 0.05 + Math.sin(t * 1.1 + phase) * 0.02;
            } else if (kind === "resting") {
              if (restVariant === 2) {
                // Standing with a coffee: one hand holds the cup up.
                rig.armL.rotation.x = Math.sin(t * 1.4 + phase) * 0.05;
                rig.armR.rotation.x = -1.85;
                rig.armR.rotation.z = -0.25;
                rig.head.rotation.x = 0.02;
                rig.head.rotation.y = Math.sin(t * 0.45 + phase) * 0.3;
              } else {
                // Leaning back / on the sofa, head nodding — the "Zzz" state.
                rig.armL.rotation.x = -0.3;
                rig.armR.rotation.x = -0.3;
                rig.head.rotation.x = 0.3 + Math.sin(t * 0.85 + phase) * 0.055;
              }
            } else if (sit > 0.8) {
              // Seated and calm (idle / sắp mở): hands in lap, looking around
              // slowly — present and waiting, never fake-typing.
              rig.armL.rotation.x = -0.72;
              rig.armR.rotation.x = -0.72;
              rig.head.rotation.x = 0.06;
              rig.head.rotation.y = Math.sin(t * 0.5 + phase) * 0.28;
            } else {
              rig.armL.rotation.x = Math.sin(t * 1.4 + phase) * 0.06;
              rig.armR.rotation.x = -Math.sin(t * 1.4 + phase) * 0.06;
              rig.head.rotation.x = Math.sin(t * 0.9 + phase) * 0.03;
            }
            // Lễ tân chào khách: Ngọc Anh LUÔN ngồi tại bàn Lễ tân giữa
            // sảnh; hễ có đồng nghiệp / khách đi tới gần bàn là cô ngẩng
            // đầu và VẪY TAY CHÀO — bàn trực có người thật đang chào đón,
            // không bao giờ là bàn trống.
            if (id === "le-tan" && sit > 0.8) {
              let guestNear = false;
              rigs.forEach((other, otherId) => {
                if (otherId !== id && other.pos.distanceTo(rig.pos) < 2.7) guestNear = true;
              });
              if (guestNear) {
                rig.armR.rotation.x = -2.95;
                rig.armR.rotation.z = -0.35 + Math.sin(t * 7.5) * 0.3;
                rig.armL.rotation.x = -0.4;
                rig.head.rotation.x = 0.02;
                rig.head.rotation.y = Math.sin(t * 1.2) * 0.12;
              }
            }
          });
          // Doors swing open for anyone passing through and close again
          // once nobody is near.
          const doorPos = new THREE.Vector3();
          for (const d of doors) {
            d.pivot.getWorldPosition(doorPos);
            let near = false;
            rigs.forEach((rig) => {
              if (
                Math.abs(rig.pos.y - doorPos.y) < 1.6 &&
                Math.hypot(rig.pos.x - doorPos.x, rig.pos.z - doorPos.z) < 1.7
              ) {
                near = true;
              }
            });
            const targetAngle = near ? 1.85 * d.swing : 0;
            d.pivot.rotation.y += (targetAngle - d.pivot.rotation.y) * 0.12;
          }
          // Xe ngoài phố chạy thật hai chiều, vòng lại ở hai đầu phố.
          for (const c of carsRef.current) {
            c.g.position.x += c.speed * c.dir * dt;
            if (c.g.position.x > 47) c.g.position.x = -47;
            if (c.g.position.x < -47) c.g.position.x = 47;
          }
          // Fish cruise back and forth inside the aquarium.
          for (const f of fishes) {
            const ph = t * f.speed + f.phase;
            f.g.position.set(
              f.cx + Math.sin(ph) * f.range,
              f.cy + Math.sin(t * 1.7 + f.phase) * 0.05,
              f.cz + Math.cos(ph * 0.7) * 0.2,
            );
            f.g.rotation.y = Math.cos(ph) >= 0 ? 0 : Math.PI;
          }
          // Koi circle the rockery in the Chairman corridor pond;
          // the waterfall's streak texture scrolls down its sheet
          // and the foam ring breathes where the water lands.
          for (const f of pondKoi) {
            const a = f.phase + f.dir * t * f.speed;
            const vx = -Math.sin(a) * f.rx * f.dir;
            const vz = Math.cos(a) * f.rz * f.dir;
            f.g.position.set(
              f.cx + Math.cos(a) * f.rx,
              f.cy + Math.sin(t * 1.9 + f.phase) * 0.02,
              f.cz + Math.sin(a) * f.rz,
            );
            f.g.rotation.y = Math.atan2(-vz, vx);
          }
          if (pondFallTex) pondFallTex.offset.y = -((t * 0.85) % 1);
          if (pondFoam) {
            const fs = 1 + Math.sin(t * 3.1) * 0.09;
            pondFoam.scale.set(fs, fs, 1);
          }
          // Plants sway gently, coffee steam rises, the printer LED blinks.
          plantsRef.current.forEach((leaf, i) => {
            leaf.rotation.z = Math.sin(t * 0.8 + i * 1.7) * 0.05;
          });
          for (const s of steamRef.current) {
            const k = (t * 0.18 + s.phase) % 1;
            s.sprite.position.y = s.baseY + k * 0.42;
            s.mat.opacity = 0.3 * Math.sin(k * Math.PI);
            const sc = 0.13 + k * 0.15;
            s.sprite.scale.set(sc, sc, 1);
          }
          if (printerLedRef.current) {
            printerLedRef.current.emissiveIntensity = Math.sin(t * 3.4) > 0.3 ? 1.4 : 0.4;
          }
          roomLampMatsRef.current.forEach((mat, id) => {
            const kind = roomLampRef.current[id];
            mat.emissiveIntensity = kind === "review" ? 0.95 + Math.sin(t * 4) * 0.3 : 1.0;
          });
        }
        // The wall clock runs on the real time of day.
        const clk = clockHandsRef.current;
        if (clk) {
          const now = new Date();
          const s = now.getSeconds() + now.getMilliseconds() / 1000;
          const m = now.getMinutes() + s / 60;
          const h = (now.getHours() % 12) + m / 60;
          clk.s.rotation.x = -(s / 60) * Math.PI * 2;
          clk.m.rotation.x = -(m / 60) * Math.PI * 2;
          clk.h.rotation.x = -(h / 12) * Math.PI * 2;
        }
        if (composer) composer.render();
        else renderer.render(scene, camera);
        // Live FPS readout (acceptance metric for the graphics
        // upgrade): refresh the chip twice a second.
        fpsFrames += 1;
        if (t - fpsLastT >= 0.5) {
          if (fpsRef.current) {
            fpsRef.current.textContent = String(Math.round(fpsFrames / (t - fpsLastT)));
          }
          fpsFrames = 0;
          fpsLastT = t;
        }
      } catch {
        // The next frame is already scheduled above; a single bad frame
        // must not blank the office.
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDbl);
      el.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      try {
        composer?.dispose();
      } catch {
        // Disposal is best-effort on unmount.
      }
      renderer.dispose();
      mount.removeChild(el);
    };
    // Scene is built once from the static room layout; live status flows
    // through the lamp-material and presence refs below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live lamp updates from real task data.
  useEffect(() => {
    lampMatsRef.current.forEach((mat, id) => {
      mat.emissive.setHex(LAMP_COLORS[staffLamp[id] ?? "idle"]);
    });
  }, [staffLamp]);

  useEffect(() => {
    roomLampMatsRef.current.forEach((mat, id) => {
      mat.emissive.setHex(LAMP_COLORS[roomLamp[id] ?? "idle"]);
    });
    // Ceiling lights follow whether the room is staffed/open.
    ceilMatsRef.current.forEach((mat, id) => {
      mat.emissiveIntensity = (roomLamp[id] ?? "idle") === "soon" ? 0.18 : 0.8;
    });
    ceilLightsRef.current.forEach((light, id) => {
      light.intensity = (roomLamp[id] ?? "idle") === "soon" ? 2 : 6.5;
    });
    // Chấm trạng thái trên nhãn phòng vẽ lại theo đèn phòng hiện tại.
    roomLabelRef.current.forEach((entry, id) => {
      const canvas = entry.tex.image as HTMLCanvasElement | undefined;
      const g = canvas?.getContext("2d");
      if (g) {
        paintRoomLabel(g, entry.name, roomLamp[id] ?? "idle");
        entry.tex.needsUpdate = true;
      }
    });
  }, [roomLamp]);

  // Ánh sáng văn phòng + phố ngoài kính chạy theo GIỜ THỰC trên máy
  // (App truyền giờ dạng thập phân, cập nhật 30 giây/lần): nội suy
  // mượt giữa các mốc trong ngày — đêm ấm LED → bình minh → BAN NGÀY
  // SÁNG RÕ (trời xanh, nắng trắng mạnh, nhìn thấu ra đường/cây/xe)
  // → chiều vàng → hoàng hôn cam → đêm. Đèn đường, đèn pha xe và
  // cửa sổ nhà đối diện tự sáng dần theo hệ số "night".
  useEffect(() => {
    const scene = sceneRef.current;
    const key = keyLightRef.current;
    const ambient = ambientRef.current;
    if (!scene || !key || !ambient) return;
    interface SkyKey {
      h: number;
      bg: number;
      skyTop: number;
      skyHor: number;
      skyBot: number;
      keyColor: number;
      keyI: number;
      ambI: number;
      hemiI: number;
      fogNear: number;
      fogFar: number;
      night: number;
      ground: number;
    }
    const keys: SkyKey[] = [
      { h: 0, bg: 0x0b0820, skyTop: 0x04030e, skyHor: 0x191038, skyBot: 0x030309, keyColor: 0x8fb4ff, keyI: 0.35, ambI: 0.3, hemiI: 0.22, fogNear: 85, fogFar: 215, night: 1, ground: 0x141126 },
      { h: 4.5, bg: 0x0b0820, skyTop: 0x04030e, skyHor: 0x191038, skyBot: 0x030309, keyColor: 0x8fb4ff, keyI: 0.35, ambI: 0.3, hemiI: 0.22, fogNear: 85, fogFar: 215, night: 1, ground: 0x141126 },
      { h: 5.75, bg: 0x1a1433, skyTop: 0x1c2a52, skyHor: 0x7a4460, skyBot: 0x07060f, keyColor: 0xd9a0b0, keyI: 0.5, ambI: 0.4, hemiI: 0.3, fogNear: 90, fogFar: 230, night: 0.85, ground: 0x1d1832 },
      { h: 6.75, bg: 0x2c2144, skyTop: 0x3a5f9e, skyHor: 0xffa25e, skyBot: 0x0d0a1a, keyColor: 0xffc98a, keyI: 1.05, ambI: 0.6, hemiI: 0.45, fogNear: 100, fogFar: 260, night: 0.45, ground: 0x2c2c3a },
      { h: 8, bg: 0x39548c, skyTop: 0x2f74d6, skyHor: 0xc4e2f2, skyBot: 0x1a2440, keyColor: 0xfff1d6, keyI: 1.6, ambI: 0.9, hemiI: 0.58, fogNear: 130, fogFar: 300, night: 0, ground: 0x55624e },
      { h: 12, bg: 0x3f66a8, skyTop: 0x1f6fe6, skyHor: 0xd6eefb, skyBot: 0x22345c, keyColor: 0xffffff, keyI: 1.7, ambI: 0.97, hemiI: 0.64, fogNear: 140, fogFar: 320, night: 0, ground: 0x5d6d54 },
      { h: 15.5, bg: 0x3d5f9e, skyTop: 0x2a72da, skyHor: 0xcfe6f4, skyBot: 0x1f3050, keyColor: 0xfff3da, keyI: 1.72, ambI: 0.94, hemiI: 0.62, fogNear: 135, fogFar: 310, night: 0, ground: 0x59684f },
      { h: 17.25, bg: 0x37456e, skyTop: 0x35619f, skyHor: 0xf6c87e, skyBot: 0x182238, keyColor: 0xffdf9f, keyI: 1.55, ambI: 0.85, hemiI: 0.55, fogNear: 120, fogFar: 290, night: 0.1, ground: 0x4c5545 },
      { h: 18.5, bg: 0x2a2148, skyTop: 0x2c2a66, skyHor: 0xff7a3c, skyBot: 0x0d0a1e, keyColor: 0xff9a5c, keyI: 1.0, ambI: 0.55, hemiI: 0.4, fogNear: 100, fogFar: 250, night: 0.55, ground: 0x33303f },
      { h: 19.5, bg: 0x120c2a, skyTop: 0x0a0824, skyHor: 0x40245c, skyBot: 0x05040e, keyColor: 0x8fb4ff, keyI: 0.42, ambI: 0.33, hemiI: 0.25, fogNear: 88, fogFar: 220, night: 0.95, ground: 0x171430 },
      { h: 20.5, bg: 0x0b0820, skyTop: 0x04030e, skyHor: 0x191038, skyBot: 0x030309, keyColor: 0x8fb4ff, keyI: 0.35, ambI: 0.3, hemiI: 0.22, fogNear: 85, fogFar: 215, night: 1, ground: 0x141126 },
      { h: 24, bg: 0x0b0820, skyTop: 0x04030e, skyHor: 0x191038, skyBot: 0x030309, keyColor: 0x8fb4ff, keyI: 0.35, ambI: 0.3, hemiI: 0.22, fogNear: 85, fogFar: 215, night: 1, ground: 0x141126 },
    ];
    const hh = ((hour % 24) + 24) % 24;
    let a = keys[0] as SkyKey;
    let b = keys[keys.length - 1] as SkyKey;
    for (let i = 0; i < keys.length - 1; i++) {
      const k0 = keys[i] as SkyKey;
      const k1 = keys[i + 1] as SkyKey;
      if (hh >= k0.h && hh <= k1.h) {
        a = k0;
        b = k1;
        break;
      }
    }
    const span = Math.max(b.h - a.h, 0.0001);
    const f = THREE.MathUtils.clamp((hh - a.h) / span, 0, 1);
    const mixHex = (x: number, y: number) =>
      new THREE.Color(x).lerp(new THREE.Color(y), f);
    const mixNum = (x: number, y: number) => x + (y - x) * f;
    const bg = mixHex(a.bg, b.bg);
    scene.background = bg;
    scene.fog = new THREE.Fog(bg.getHex(), mixNum(a.fogNear, b.fogNear), mixNum(a.fogFar, b.fogFar));
    const sky = skyMatRef.current;
    if (sky) {
      (sky.uniforms.topColor?.value as THREE.Color | undefined)?.copy(mixHex(a.skyTop, b.skyTop));
      (sky.uniforms.horizonColor?.value as THREE.Color | undefined)?.copy(mixHex(a.skyHor, b.skyHor));
      (sky.uniforms.bottomColor?.value as THREE.Color | undefined)?.copy(mixHex(a.skyBot, b.skyBot));
    }
    key.color.copy(mixHex(a.keyColor, b.keyColor));
    key.intensity = mixNum(a.keyI, b.keyI);
    ambient.intensity = mixNum(a.ambI, b.ambI);
    if (hemiRef.current) hemiRef.current.intensity = mixNum(a.hemiI, b.hemiI);
    const night = mixNum(a.night, b.night);
    if (streetGlowMatRef.current) {
      streetGlowMatRef.current.emissiveIntensity = 0.2 + night * 1.5;
    }
    facadeMatsRef.current.forEach((m) => {
      m.emissiveIntensity = night * 0.65;
    });
    if (groundMatRef.current) groundMatRef.current.color.copy(mixHex(a.ground, b.ground));
  }, [hour]);

  // The big screens show the clip currently under QC.
  useEffect(() => {
    for (const s of screensRef.current) drawScreen(s.g, s.tex, qcTitle, s.heading);
  }, [qcTitle]);

  // Each desk monitor shows its owner's current task.
  useEffect(() => {
    deskScreensRef.current.forEach((entry, id) => {
      drawDeskScreen(entry.g, entry.tex, staffScreen[id] ?? "");
    });
  }, [staffScreen]);

  // Status bubbles above heads follow the real task state.
  useEffect(() => {
    bubbleRef.current.forEach((entry, id) => {
      const text = staffBubble[id] ?? "";
      if (text !== entry.last) {
        entry.last = text;
        drawBubble(entry, text);
      }
    });
  }, [staffBubble]);

  // The meeting whiteboard shows the newest saved minutes.
  useEffect(() => {
    const mb = meetingBoardRef.current;
    if (mb) drawMeetingBoard(mb.g, mb.tex, meetingBoard);
  }, [meetingBoard]);

  const focusedRoom = rooms.find((r) => r.id === focusedId) ?? null;
  // Tên phòng/khu đang xem — chỉ còn dùng trong nhãn trợ năng
  // của nút Toàn cảnh ở mép phải; không còn thẻ nào hiện lên
  // canvas nữa.
  const focusedName =
    focusedRoom?.name ?? (focusedId ? ZONE_NAMES[focusedId] : undefined) ?? null;

  return (
    <div>
    <div className="relative">
      <div
        ref={mountRef}
        className="h-[360px] w-full overflow-hidden rounded-[var(--radius)] sm:h-[460px]"
        role="img"
        aria-label="Văn phòng 3D: kéo chuột trái để di chuyển góc nhìn tới phòng bất kỳ, kéo chuột phải hoặc giữ phím cách rồi kéo cũng di chuyển như vậy, lăn chuột để phóng to thu nhỏ vào vị trí con trỏ, nhấp đúp vào phòng để phóng vào phòng đó, trên điện thoại kéo một ngón để di chuyển và kéo hai ngón để xoay, di chuột lên nhân viên để xem thẻ, bấm vào nhân viên để mở thẻ nhân viên — trên thẻ có nút Trò chuyện để mở cuộc trò chuyện với người đó"
      />
      {error ? (
        <p className="absolute inset-x-3 top-3 rounded bg-red-900/85 px-3 py-2 text-sm text-white">
          {error}
        </p>
      ) : null}
      {/* KHÔNG còn thẻ hover nổi theo chuột nữa (Chủ tịch chốt bỏ
          hết thẻ/bong bóng phủ lên canvas): di chuột vào nhân viên
          chỉ đổi con trỏ + hiện bảng tên trên đầu của người đó
          trong cảnh 3D; bấm vào người là mở thẻ nhân viên ở cột
          phải, ngoài khung 3D. */}
            {focusedId ? (
        <button
          type="button"
          onClick={() => {
            setFocusedId(null);
            focusRef.current(null);
          }}
          aria-label={`Đang xem ${focusedName ?? "phòng"}. Bấm để quay về góc tổng giám sát toàn công ty`}
          className="absolute right-2 top-2 z-10 flex h-8 items-center rounded-full bg-[#17102e]/85 px-3 text-xs font-semibold text-white shadow"
        >
          Toàn cảnh
        </button>
      ) : null}
      <div
        className="absolute bottom-2 left-2 z-10 flex h-8 items-center rounded-full bg-[#17102e]/85 px-3 text-xs font-semibold text-white shadow"
        aria-label="Tốc độ khung hình của văn phòng 3D, cập nhật trực tiếp"
      >
        FPS:&nbsp;<span ref={fpsRef}>–</span>
      </div>
      <button
        type="button"
        onClick={() => toggleTags()}
        aria-pressed={showTags}
        aria-label={showTags ? "Tắt bảng tên nhân viên" : "Bật bảng tên nhân viên"}
        className="absolute bottom-2 right-12 z-10 flex h-8 items-center rounded-full bg-[#17102e]/85 px-3 text-xs font-semibold text-white shadow"
      >
        Bảng tên: {showTags ? "Bật" : "Tắt"}
      </button>
      <button
        type="button"
        onClick={() => setShowGuide((v) => !v)}
        aria-expanded={showGuide}
        aria-label={showGuide ? "Đóng hướng dẫn điều khiển văn phòng 3D" : "Mở hướng dẫn điều khiển văn phòng 3D"}
        className="absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#17102e]/85 text-sm font-bold text-white shadow"
      >
        ?
      </button>
      {showGuide ? (
        <div className="absolute bottom-11 left-3 right-12 rounded-lg bg-[#17102e]/92 px-3 py-2 text-xs leading-relaxed text-[#c9bdf5] shadow-lg">
          <p className="hidden sm:block">
            Kéo chuột trái: di chuyển tới phòng bất kỳ · Giữ Alt hoặc Shift + kéo: XOAY nhẹ, mượt · Phím mũi tên ← →: cũng xoay · Lăn chuột: phóng to/thu nhỏ · Bấm phòng / nhân viên / nhấp đúp: bay vào trong phòng, ngồi gần bàn · Bấm Toàn cảnh: quay về góc tổng giám sát
          </p>
          <p className="sm:hidden">
            1 ngón: di chuyển · 2 ngón kéo ngang: xoay nhẹ · Chụm: zoom · Bấm tên phòng ở thanh chọn phía trên: bay vào ngồi gần bàn · Toàn cảnh: quay về tổng giám sát
          </p>
        </div>
      ) : null}
      </div>
          </div>
  );
}
