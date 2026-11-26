import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import type { Actions } from "../../server/src/actions";
import { api, type ApiResponse } from "./api";
import {
Office3D,
LAMP_CSS,
LAMP_LABELS,
type LampKind,
type OfficeRoomDef,
} from "./Office3D";

const FIELDS = actionFields<typeof Actions>();

type Task = ApiResponse<typeof api, "listTasks">["tasks"][number];
type TaskStatus = Task["status"];
type Product = ApiResponse<typeof api, "listProducts">["products"][number];
type ChatMessage = ApiResponse<typeof api, "listMessages">["messages"][number];
type Character = ApiResponse<typeof api, "listCharacters">["characters"][number];
type AuditEntry = ApiResponse<typeof api, "listAudit">["entries"][number];
type QcReview = ApiResponse<typeof api, "listQcReviews">["reviews"][number];
type PipelineData = ApiResponse<typeof api, "getPipeline">;
type PipelineStage = PipelineData["stages"][number];
type JournalEntry = ApiResponse<typeof api, "listJournal">["entries"][number];
type MeetingRow = ApiResponse<typeof api, "listMeetings">["meetings"][number];
type ConsoleSettings = ApiResponse<typeof api, "getConsoleSettings">;
type Decision = ApiResponse<typeof api, "listDecisions">["decisions"][number];
type Proposal = ApiResponse<typeof api, "listProposals">["proposals"][number];
type Veto = ApiResponse<typeof api, "listVetoes">["vetoes"][number];
type Risk = ApiResponse<typeof api, "listRisks">["risks"][number];
type Channel = ApiResponse<typeof api, "listChannels">["channels"][number];

// ---------------------------------------------------------------------------
// Cột phải sống + thanh chức năng (theo mẫu Phim Trường Drama AI mà Chủ
// tịch gửi): nhật ký được phân trạng thái từ CHÍNH dữ liệu thật trong
// nhật ký kiểm toán / báo cáo khâu — ĐÃ XONG khi QC đạt hoặc duyệt
// Final, Lỗi khi trượt QC / dừng dây chuyền, Chờ chốt khi vào chiếu
// thử. Không dòng nào bịa: mọi mục đều truy ngược được về audit/messages.
// ---------------------------------------------------------------------------

type JournalStatus = "done" | "running" | "error" | "waiting" | "meeting" | "info";

const JOURNAL_STATUS_META: Record<JournalStatus, { label: string; color: string }> = {
  done: { label: "ĐÃ XONG", color: "#16a34a" },
  running: { label: "Đang chạy", color: "#0284c7" },
  error: { label: "Lỗi / QC trượt", color: "#dc2626" },
  waiting: { label: "Chờ chốt", color: "#d97706" },
  meeting: { label: "Họp", color: "#7c3aed" },
  info: { label: "Thông tin", color: "#8b87a0" },
};

function journalStatusOf(e: JournalEntry): JournalStatus {
  const t = `${e.title} · ${e.detail}`;
  if (/trượt QC|DỪNG dây chuyền|QC: Làm lại|Lỗi local/.test(t)) return "error";
  if (/đạt QC|QC: Đạt|Duyệt Final|hoàn tất|ĐÃ XONG/.test(t)) return "done";
  if (/chờ Chủ tịch duyệt|vào chiếu thử|Chờ duyệt|chờ chốt/.test(t)) return "waiting";
  if (e.kind === "hop" || /họp|Họp/.test(e.title)) return "meeting";
  if (e.kind === "viec") return "running";
  return "info";
}

/**
 * Màu chấm trạng thái PHÒNG theo đúng chốt của Chủ tịch (đỏ đang
 * chạy · xanh đã xong · xám đang chờ) — dùng thống nhất cho nhãn
 * phòng 3D và chip chọn phòng, khác với đèn trạng thái việc cá nhân.
 */
function roomDotColor(kind: LampKind): string {
  switch (kind) {
    case "working":
    case "revision":
      return "#ef4444";
    case "approved":
      return "#22c55e";
    case "review":
      return "#f59e0b";
    case "assigned":
      return "#38bdf8";
    default:
      return "#9ca3af";
  }
}

/** Giờ dạng HH:MM:SS như cột nhật ký trong ảnh mẫu. */
function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour12: false });
}

/** Nhiều dòng nhật ký nhắc việc bằng mã "#12" — bấm dòng là mở đúng việc. */
function hashTaskId(text: string): number | null {
  const m = text.match(/#(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Dự án dây chuyền đang sống (đang chạy / dừng / kẹt / chiếu thử / xong). */
function livePipeTask(tasks: Task[]): Task | null {
  return (
    tasks.find((t) => ["RUNNING", "PAUSED", "BLOCKED", "SCREENING"].includes(t.pipeline_state)) ??
    tasks.find((t) => t.pipeline_state === "DONE") ??
    null
  );
}

const lsGetNum = (k: string): number => {
  try {
    return Number(localStorage.getItem(k) ?? 0) || 0;
  } catch {
    return 0;
  }
};
const lsSetNum = (k: string, v: number) => {
  try {
    localStorage.setItem(k, String(v));
  } catch {
    // localStorage không khả dụng — chuông thông báo vẫn chạy, chỉ không nhớ mốc đã đọc.
  }
};

type View =
  | "overview"
  | "org"
  | "talk"
  | "board"
  | "assign"
  | "chat"
  | "direct"
  | "warehouse"
  | "brandkit"
  | "kpi"
  | "report"
  | "meetings"
  | "journal"
  | "audit";

interface StaffMember {
  id: string;
  name: string;
  role: string;
  roomId: string;
  color: string;
  threeColor: number;
  gender: "Nam" | "Nữ";
}

const STAFF: StaffMember[] = [
  { id: "chu-tich", name: "Hưởng", role: "Chủ tịch công ty — Định hướng, giám sát", roomId: "chairman", color: "#d4af37", threeColor: 0xd4af37, gender: "Nam" },
  { id: "van-thu", name: "Thanh Mai", role: "Văn thư — phòng riêng ở sườn trái khu điều hành (chỗ Phòng Trợ lý cũ), quản hồ sơ trình ký cho Chủ tịch", roomId: "clerical", color: "#c2703e", threeColor: 0xc2703e, gender: "Nữ" },
  { id: "tong-giam-doc", name: "Muse", role: "Tổng giám đốc — Điều hành toàn công ty", roomId: "ceo", color: "#f59e0b", threeColor: 0xf59e0b, gender: "Nam" },
  { id: "thu-ky", name: "Bảo Trân", role: "Thư ký Chủ tịch — phòng riêng ở sườn phải khu điều hành, đã dời khỏi mặt tiền sảnh", roomId: "secretary", color: "#2dd4bf", threeColor: 0x2dd4bf, gender: "Nữ" },
  { id: "tro-ly", name: "Thu Trang", role: "Trợ lý Tổng giám đốc — ngồi trong Phòng Tổng giám đốc, bàn đặt thấp hơn, lệch sang phải, đối diện bàn họp dài, không ngang hàng với Tổng giám đốc", roomId: "ceo", color: "#38bdf8", threeColor: 0x38bdf8, gender: "Nữ" },
  { id: "le-tan", name: "Ngọc Anh", role: "Lễ tân — bàn trực mở ở giữa sảnh, ngay trước khoảng trống thông thoáng trước Phòng Tổng giám đốc", roomId: "reception", color: "#fb923c", threeColor: 0xfb923c, gender: "Nữ" },
  { id: "dao-dien", name: "Muse — Đạo diễn", role: "Giám đốc kiêm Đạo diễn sản xuất · Trưởng phòng Video", roomId: "video", color: "#7c5cf0", threeColor: 0x7c5cf0, gender: "Nam" },
  { id: "video-01", name: "Minh Tuấn — Video 01", role: "Nhân viên dựng video", roomId: "video", color: "#38bdf8", threeColor: 0x38bdf8, gender: "Nam" },
  { id: "video-02", name: "Thu Hằng — Video 02", role: "Nhân viên dựng video", roomId: "video", color: "#f472b6", threeColor: 0xf472b6, gender: "Nữ" },
  { id: "video-03", name: "Đức Anh — Video 03", role: "Nhân viên dựng video", roomId: "video", color: "#34d399", threeColor: 0x34d399, gender: "Nam" },
  { id: "qc", name: "Ngọc Linh — QC", role: "Kiểm soát chất lượng", roomId: "video", color: "#fbbf24", threeColor: 0xfbbf24, gender: "Nữ" },
  { id: "tp-marketing", name: "Mai Phương", role: "Trưởng phòng Marketing", roomId: "marketing", color: "#a8a29e", threeColor: 0xa8a29e, gender: "Nữ" },
  { id: "marketing-nv1", name: "Văn Hùng", role: "Nhân viên Marketing", roomId: "marketing", color: "#4a7fb5", threeColor: 0x4a7fb5, gender: "Nam" },
  { id: "marketing-nv2", name: "Thanh Thảo", role: "Nhân viên Marketing", roomId: "marketing", color: "#3aa79c", threeColor: 0x3aa79c, gender: "Nữ" },
  { id: "tp-chien-luoc", name: "Quốc Bảo", role: "Trưởng phòng Chiến lược", roomId: "strategy", color: "#94a3b8", threeColor: 0x94a3b8, gender: "Nam" },
  { id: "strategy-nv1", name: "Khánh Ly", role: "Nhân viên Chiến lược", roomId: "strategy", color: "#c65b7c", threeColor: 0xc65b7c, gender: "Nữ" },
  { id: "strategy-nv2", name: "Hoàng Nam", role: "Nhân viên Chiến lược", roomId: "strategy", color: "#607d3b", threeColor: 0x607d3b, gender: "Nam" },
  { id: "tp-nhan-su", name: "Hồng Nhung", role: "Trưởng phòng Nhân sự", roomId: "hr", color: "#b8a29e", threeColor: 0xb8a29e, gender: "Nữ" },
  { id: "hr-nv1", name: "Tiến Đạt", role: "Nhân viên Nhân sự", roomId: "hr", color: "#51749e", threeColor: 0x51749e, gender: "Nam" },
  { id: "hr-nv2", name: "Mỹ Duyên", role: "Nhân viên Nhân sự", roomId: "hr", color: "#7a9e43", threeColor: 0x7a9e43, gender: "Nữ" },
  { id: "tp-kinh-doanh", name: "Trọng Nghĩa", role: "Trưởng phòng Kinh doanh", roomId: "sales", color: "#9ca3af", threeColor: 0x9ca3af, gender: "Nam" },
  { id: "sales-nv1", name: "Lan Anh", role: "Nhân viên Kinh doanh", roomId: "sales", color: "#b5524a", threeColor: 0xb5524a, gender: "Nữ" },
  { id: "sales-nv2", name: "Quang Huy", role: "Nhân viên Kinh doanh", roomId: "sales", color: "#8060b8", threeColor: 0x8060b8, gender: "Nam" },
  { id: "tp-noi-dung", name: "Trí Dũng", role: "Trưởng phòng Nội dung", roomId: "content", color: "#b07d4f", threeColor: 0xb07d4f, gender: "Nam" },
  { id: "content-nv1", name: "Phương Chi", role: "Nhân viên Nội dung", roomId: "content", color: "#d4805f", threeColor: 0xd4805f, gender: "Nữ" },
  { id: "content-nv2", name: "Minh Khôi", role: "Nhân viên Nội dung", roomId: "content", color: "#5f8a7d", threeColor: 0x5f8a7d, gender: "Nam" },
  { id: "tp-am-thanh", name: "Tuấn Kiệt", role: "Trưởng phòng Âm thanh", roomId: "sound", color: "#546e7a", threeColor: 0x546e7a, gender: "Nam" },
  { id: "sound-nv1", name: "Thanh Tùng", role: "Nhân viên Âm thanh", roomId: "sound", color: "#8d6e63", threeColor: 0x8d6e63, gender: "Nam" },
  { id: "sound-nv2", name: "Ngọc Trâm", role: "Nhân viên Âm thanh", roomId: "sound", color: "#66bb6a", threeColor: 0x66bb6a, gender: "Nữ" },
  { id: "tp-dang-tai", name: "Khánh Huyền", role: "Trưởng phòng Đăng tải & SEO", roomId: "publish", color: "#5c6bc0", threeColor: 0x5c6bc0, gender: "Nữ" },
  { id: "publish-nv1", name: "Đức Huy", role: "Nhân viên Đăng tải & SEO", roomId: "publish", color: "#c05c5c", threeColor: 0xc05c5c, gender: "Nam" },
  { id: "publish-nv2", name: "Thùy Linh", role: "Nhân viên Đăng tải & SEO", roomId: "publish", color: "#ab7bc0", threeColor: 0xab7bc0, gender: "Nữ" },
  { id: "tp-chieu", name: "Hoàng Sơn", role: "Trưởng phòng Chiếu", roomId: "screening", color: "#0ea5e9", threeColor: 0x0ea5e9, gender: "Nam" },
  { id: "chieu-nv1", name: "Thanh Hà", role: "Nhân viên Phòng Chiếu", roomId: "screening", color: "#f43f5e", threeColor: 0xf43f5e, gender: "Nữ" },
  { id: "chieu-nv2", name: "Tuấn Anh", role: "Nhân viên Phòng Chiếu", roomId: "screening", color: "#22c55e", threeColor: 0x22c55e, gender: "Nam" },
  { id: "tk-kho", name: "Văn Đức", role: "Quản kho — Kho Sản phẩm", roomId: "warehouse", color: "#eab308", threeColor: 0xeab308, gender: "Nam" },
  { id: "kho-nv1", name: "Thu Thủy", role: "Nhân viên Kho Sản phẩm", roomId: "warehouse", color: "#06b6d4", threeColor: 0x06b6d4, gender: "Nữ" },
  { id: "kho-nv2", name: "Hải Đăng", role: "Nhân viên Kho Sản phẩm", roomId: "warehouse", color: "#a855f7", threeColor: 0xa855f7, gender: "Nam" },
  { id: "tp-in-an", name: "Đức Long", role: "Trưởng phòng In ấn", roomId: "print", color: "#ec4899", threeColor: 0xec4899, gender: "Nam" },
  { id: "in-an-nv1", name: "Hồng Anh", role: "Nhân viên Phòng In ấn", roomId: "print", color: "#14b8a6", threeColor: 0x14b8a6, gender: "Nữ" },
  { id: "in-an-nv2", name: "Quốc Anh", role: "Nhân viên Phòng In ấn", roomId: "print", color: "#f97316", threeColor: 0xf97316, gender: "Nam" },
  { id: "tp-tai-chinh", name: "Đức Thịnh", role: "Trưởng phòng Tài chính – Kế toán", roomId: "finance", color: "#2e7d5b", threeColor: 0x2e7d5b, gender: "Nam" },
  { id: "finance-nv1", name: "Thu Hiền", role: "Nhân viên Tài chính – Kế toán", roomId: "finance", color: "#d4a017", threeColor: 0xd4a017, gender: "Nữ" },
  { id: "finance-nv2", name: "Văn Phong", role: "Nhân viên Tài chính – Kế toán", roomId: "finance", color: "#4a6fa5", threeColor: 0x4a6fa5, gender: "Nam" },
  { id: "tp-phap-che", name: "Đình Phong", role: "Trưởng phòng Pháp chế", roomId: "legal", color: "#5b4a8a", threeColor: 0x5b4a8a, gender: "Nam" },
  { id: "legal-nv1", name: "Mai Chi", role: "Nhân viên Pháp chế", roomId: "legal", color: "#c65b7c", threeColor: 0xc65b7c, gender: "Nữ" },
  { id: "legal-nv2", name: "Hữu Thắng", role: "Nhân viên Pháp chế", roomId: "legal", color: "#607d8a", threeColor: 0x607d8a, gender: "Nam" },
  { id: "tp-hop", name: "Minh Châu", role: "Trưởng phòng Họp Lớn — quản lý lịch họp và biên bản", roomId: "meeting", color: "#8b5cf6", threeColor: 0x8b5cf6, gender: "Nữ" },
  { id: "hop-nv1", name: "Văn Toàn", role: "Nhân viên Phòng Họp Lớn — hỗ trợ họp và thiết bị", roomId: "meeting", color: "#65a30d", threeColor: 0x65a30d, gender: "Nam" },
  // Tầng quản trị mới (cơ cấu tiệm cận / vượt WINHUB): các ghế này
  // thuộc tầng sơ đồ tổ chức + quản trị — vị trí trong sơ đồ và
  // khối báo cáo ghi ở tab Sơ đồ tổ chức; mặt bằng 3D 2 tầng giữ
  // nguyên khóa, không phá hành lang.
  { id: "kiem-toan", name: "Quang Minh", role: "Trưởng Kiểm toán nội bộ — ĐỘC LẬP, báo cáo thẳng Chủ tịch, không qua Tổng giám đốc", roomId: "kiem-toan", color: "#b91c1c", threeColor: 0xb91c1c, gender: "Nam" },
  { id: "gd-chat-luong", name: "Bảo Ngọc", role: "Giám đốc Chất lượng toàn công ty — QC toàn công ty, bản quyền, duyệt mẫu, quyền VETO ghi mã lý do", roomId: "chat-luong", color: "#dc2626", threeColor: 0xdc2626, gender: "Nữ" },
  { id: "tp-rd", name: "Anh Tuấn", role: "Trưởng phòng R&D — nghiên cứu định dạng, công cụ, mẫu mới; trực thuộc Tổng giám đốc", roomId: "rd", color: "#7c3aed", threeColor: 0x7c3aed, gender: "Nam" },
  { id: "rd-nv1", name: "Thảo Nguyên", role: "Nhân viên R&D — thử nghiệm nhỏ, đo kết quả trước khi vào sản xuất", roomId: "rd", color: "#0d9488", threeColor: 0x0d9488, gender: "Nữ" },
  { id: "rd-nv2", name: "Minh Đức", role: "Nhân viên R&D — làm mẫu thử, ghi chép thí nghiệm", roomId: "rd", color: "#b45309", threeColor: 0xb45309, gender: "Nam" },
  { id: "tong-quan-nen-tang", name: "Phương Anh", role: "Tổng quản nền tảng — quản kênh YouTube / TikTok / Facebook, lịch đăng, mốc kiếm tiền", roomId: "nen-tang", color: "#059669", threeColor: 0x059669, gender: "Nữ" },
  { id: "nen-tang-nv1", name: "Hoàng Anh", role: "Nhân viên Quản lý nền tảng — theo lịch đăng và số liệu từng kênh", roomId: "nen-tang", color: "#4d7c0f", threeColor: 0x4d7c0f, gender: "Nam" },
  { id: "tp-cong-nghe", name: "Trí Đức", role: "Giám đốc Công nghệ / CTO — kỹ thuật, API, an toàn tài khoản; chờ kết nối local, chưa có model nào chạy", roomId: "cong-nghe", color: "#0369a1", threeColor: 0x0369a1, gender: "Nam" },
  { id: "cong-nghe-nv1", name: "Thanh Sơn", role: "Nhân viên Công nghệ — kỹ thuật & hạ tầng (chờ local)", roomId: "cong-nghe", color: "#57534e", threeColor: 0x57534e, gender: "Nam" },
  { id: "cong-nghe-nv2", name: "Mỹ Linh", role: "Nhân viên Công nghệ — API & an toàn tài khoản (chờ local)", roomId: "cong-nghe", color: "#be185d", threeColor: 0xbe185d, gender: "Nữ" },
];

const staffById = (id: string): StaffMember =>
  STAFF.find((s) => s.id === id) ?? {
    id,
    name: id,
    role: "",
    roomId: "video",
    color: "#7c5cf0",
    threeColor: 0x7c5cf0,
    gender: "Nam",
  };

const VIDEO_TEAM = ["dao-dien", "video-01", "video-02", "video-03", "qc"];

/** Short chat label a staff member sends under: "Đạo diễn", "Video 01", "QC", or their name. */
function chatLabel(s: StaffMember): string {
  if (s.id === "chu-tich") return "Chủ tịch";
  if (s.id === "tong-giam-doc") return "Tổng giám đốc";
  if (s.id === "dao-dien") return "Đạo diễn";
  const parts = s.name.split(" — ");
  return parts.length > 1 ? (parts[parts.length - 1] ?? s.name) : s.name;
}

/** Lowercases and strips Vietnamese diacritics so "@dao dien" matches Đạo diễn. */
function foldClient(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

/** Resolves a message sender name to a staff member for the avatar. */
function memberByChatName(sender: string): StaffMember {
  return (
    STAFF.find((s) => s.name === sender) ??
    STAFF.find((s) => chatLabel(s) === sender) ??
    STAFF.find((s) => foldClient(chatLabel(s)) === foldClient(sender)) ??
    ({ id: sender, name: sender, role: "", roomId: "video", color: "#7c5cf0", threeColor: 0x7c5cf0, gender: "Nam" } as StaffMember)
  );
}

const MENTION_LABELS = STAFF.filter((s) => s.id !== "chu-tich")
  .map((s) => chatLabel(s))
  .sort((a, b) => b.length - a.length);

const WORD_CHAR_CLIENT = /[a-z0-9]/;

/** True when a folded staff name appears as a whole name in folded text. */
function mentionsNameClient(folded: string, alias: string): boolean {
  let idx = folded.indexOf(alias);
  while (idx >= 0) {
    const before = idx === 0 ? "" : (folded[idx - 1] ?? "");
    const after = folded[idx + alias.length] ?? "";
    if ((before === "" || before === "@" || !WORD_CHAR_CLIENT.test(before)) && (after === "" || !WORD_CHAR_CLIENT.test(after))) return true;
    idx = folded.indexOf(alias, idx + 1);
  }
  return false;
}

/**
 * Renders a message body with staff names highlighted — plain names said in
 * normal conversation (Đạo diễn, Video 01, Ngọc Linh…) highlight exactly like
 * the old @mentions did; no "@" is needed to tag anyone.
 */
function renderBody(body: string, onDark: boolean): React.ReactNode {
  const folded = foldClient(body);
  type Span = { start: number; end: number };
  const spans: Span[] = [];
  for (const label of MENTION_LABELS) {
    const needle = foldClient(label);
    let idx = folded.indexOf(needle);
    while (idx >= 0) {
      const before = idx === 0 ? "" : (folded[idx - 1] ?? "");
      const after = folded[idx + needle.length] ?? "";
      const start = before === "@" ? idx - 1 : idx;
      const boundaryBefore = start === 0 || !WORD_CHAR_CLIENT.test(folded[start - 1] ?? "");
      if (boundaryBefore && (after === "" || !WORD_CHAR_CLIENT.test(after))) {
        spans.push({ start, end: idx + needle.length });
      }
      idx = folded.indexOf(needle, idx + needle.length);
    }
  }
  if (spans.length === 0) return body;
  spans.sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && sp.start < last.end) continue;
    merged.push(sp);
  }
  const out: React.ReactNode[] = [];
  let pos = 0;
  merged.forEach((sp, i) => {
    if (sp.start > pos) out.push(body.slice(pos, sp.start));
    out.push(
      <strong key={i} className={onDark ? "text-amber-200" : "text-[var(--accent)]"}>
        {body.slice(sp.start, sp.end)}
      </strong>,
    );
    pos = sp.end;
  });
  if (pos < body.length) out.push(body.slice(pos));
  return out;
}

const ROOMS: { id: string; name: string; active: boolean }[] = [
  { id: "chairman", name: "Phòng Chủ tịch", active: true },
  { id: "ceo", name: "Phòng Tổng giám đốc", active: true },
  { id: "clerical", name: "Phòng Văn thư", active: true },
  { id: "secretary", name: "Phòng Thư ký Chủ tịch", active: true },
  { id: "reception", name: "Khu trực Lễ tân", active: true },
  { id: "strategy", name: "Phòng Chiến lược", active: true },
  { id: "hr", name: "Phòng Nhân sự", active: true },
  { id: "content", name: "Phòng Nội dung", active: true },
  { id: "screening", name: "Phòng Chiếu", active: true },
  { id: "video", name: "Phòng Video", active: true },
  { id: "sound", name: "Phòng Âm thanh", active: true },
  { id: "meeting", name: "Phòng Họp Lớn", active: true },
  { id: "marketing", name: "Phòng Marketing", active: true },
  { id: "publish", name: "Phòng Đăng tải & SEO", active: true },
  { id: "sales", name: "Phòng Kinh doanh", active: true },
  { id: "warehouse", name: "Kho Sản phẩm", active: true },
  { id: "print", name: "Phòng In ấn", active: true },
  { id: "finance", name: "Phòng Tài chính – Kế toán", active: true },
  { id: "legal", name: "Phòng Pháp chế", active: true },
  { id: "kiem-toan", name: "Phòng Kiểm toán nội bộ", active: true },
  { id: "chat-luong", name: "Phòng Chất lượng toàn công ty", active: true },
  { id: "rd", name: "Phòng R&D", active: true },
  { id: "nen-tang", name: "Tổng quản nền tảng", active: true },
  { id: "cong-nghe", name: "Phòng Công nghệ", active: true },
];

const OFFICE_ROOMS: OfficeRoomDef[] = [
  // PHÒNG CHỦ TỊCH — ĐÍNH CHÍNH MỚI NHẤT CỦA CHỦ TỊCH: phòng
  // MỞ RỘNG RỘNG BẰNG ĐÚNG HÀNH LANG CHÍNH GIỮA — bề rộng 16.0
  // bằng đúng chiều rộng sảnh / hành lang chính giữa (thảm sảnh
  // rộng 16.0), KHÔNG rộng hơn, KHÔNG hẹp hơn, KHÔNG thụt vào,
  // KHÔNG để khoảng trống hai bên phòng; chiều sâu giữ 13.1
  // (tâm x=0, z=-22.25; mặt trước z=-15.7, tường sau z=-28.8,
  // nền đất mở rộng ra sau tới z=-29.4), diện tích ~210, vẫn to
  // hơn HẲN Phòng Tổng giám đốc 9.6 × 8.3 ≈ 80 ở ngay phía
  // trước, KHÔNG còn hình chữ nhật dài 32.2 × 13.1 như trước.
  // CỐT NỀN phòng ĐÃ HẠ XUỐNG THẤP: phòng đặt trên BỆ NÂNG THẤP
  // 1.35 (9 bậc × 0.15) — hạ hẳn từ bệ cao 2.82 cũ, nhưng KHÔNG
  // nằm ngang mặt đất tầng 1, vào phòng phải lên cầu thang.
  // XÓA HẲN BAN CÔNG — KHÔNG còn ban công, KHÔNG còn sảnh ngoài
  // trước phòng. ĐÚNG 2 CẦU THANG THẲNG tại x=±6.55, ĐẢO NGƯỢC
  // (đính chính mới nhất): CHÂN THANG ĐẶT NGAY TẠI VÁCH TRƯỚC
  // PHÒNG — chính chỗ ĐỈNH THANG của bản trước nay thành CHÂN
  // THANG, chân thang đặt từ đó, tại lối mở ở mặt trước phòng
  // phía đó — mỗi cầu thang ĐI THẲNG MỘT MẠCH NGƯỢC VÀO TRONG
  // PHÒNG, leo lên dọc theo HÀNH LANG VÁCH NGĂN, ĐẦU THANG chạm
  // SÀN HÀNH LANG trong phòng: không cong, không chữ L, không
  // đặt đằng trước, không đặt dọc sườn Phòng Chủ tịch, KHÔNG
  // còn thang nào đứng trong 2 cái khe hai bên Phòng Tổng
  // giám đốc nữa. HÀNH LANG BÊN DƯỚI trước phòng (dải thảm
  // sau hàng điều hành) ĐƯỢC CHỪA TRỐNG HOÀN TOÀN cho PHÒNG
  // BÊN TRONG (Chiến lược, Nhân sự) có đường đi thông suốt
  // ngang qua. VÁCH NGĂN + HÀNH LANG ĐÃ LÙI THẬT VÀO TRONG
  // PHÒNG (đính chính mới nhất): bản đảo cầu thang chỉ đổi
  // thang, vách ngăn với hành lang vẫn ở chỗ cũ cách mặt
  // trước 2.3 — nay LÙI SÂU THÊM ĐÚNG BẰNG CHỖ HÀNH LANG ĐÃ
  // CHỐT (2.3): vách ngăn từ z=-18.07 về z=-20.37, cách mặt
  // trước 4.6, hành lang chạy sâu 4.6 từ mặt trước tới vách
  // ngăn, nhìn thấy rõ đã lùi. PHÒNG CHỈ CÓ 1 CỬA CHÍNH DUY
  // NHẤT Ở GIỮA: trong phòng có VÁCH NGĂN tạo HÀNH LANG dọc
  // mặt trước — lên thang vào hành lang, đi dọc hành lang
  // vào giữa, qua cửa chính duy nhất mới vào phòng. Hai cầu thang nằm SAU 3 BẬC NGẮN TRƯỚC CỬA CHÍNH
  // theo trục đi vào: qua cửa chính, lên 3 bậc ngắn, qua sảnh,
  // đi dọc hành lang bên dưới rồi mới tới chân cầu thang ngay
  // tại vách trước phòng — không đặt cầu thang trước 3 bậc,
  // không chắn 3 bậc. Hai vách sườn phòng là kính kín suốt
  // không cửa; Phòng Chiến lược (trái) và Phòng Nhân sự (phải)
  // ở hàng sau tầng 1 đứng hẳn hoi trên sàn tầng 1, không bị
  // gì che — xem Office3D.tsx.
  { id: "chairman", name: "Phòng Chủ tịch", x: 0, z: -22.25, w: 16.0, d: 13.1, floor: 0x543d8f, staff: [{ id: "chu-tich", initials: "CT", color: 0xd4af37, name: "Hưởng — Chủ tịch", gender: "Nam" }] },
  // TẦNG 1 — mặt bằng nhau hết, cùng một sàn phẳng, không bệ nâng,
  // không bậc cao thấp. Hàng sau THẲNG HÀNG: Phòng Chiến lược (trái),
  // Phòng Tổng giám đốc (giữa), Phòng Nhân sự (phải) — tường sau cả
  // ba phòng cùng một tuyến z=-13.3, chạm sát phía sau. Phòng TGĐ lớn
  // hơn và SÂU hơn (8.3) nên mặt tiền của nó (z=-5.0) NHÔ ra phía
  // trước khoảng 1/3 chiều sâu phòng so với Chiến lược / Nhân sự
  // (mặt tiền z=-7.1), sàn vẫn cùng cao độ tầng 1, không nâng. Phòng
  // TGĐ nằm NGAY PHÍA TRƯỚC Phòng Chủ tịch (phòng Chủ tịch ở
  // chính giữa phía sau, mở rộng rộng bằng đúng hành lang chính
  // giữa 16.0 × sâu 13.1, đặt trên bệ nâng thấp 1.35 đã hạ cốt
  // nền, vào phòng bằng đúng 2 cầu thang thẳng ĐẢO NGƯỢC — chân
  // thang ngay tại vách trước Phòng Chủ tịch (chỗ đỉnh thang
  // cũ), thang leo ngược vào trong dọc hành lang vách ngăn
  // trong Phòng Chủ tịch rồi vào cửa chính duy nhất ở giữa;
  // hành lang bên dưới trước phòng để trống hoàn toàn, 2 cầu
  // thang không che Chiến lược / Nhân sự.
  // Bàn tiếp khách dài đặt DỌC BÊN TRONG phòng TGĐ (bàn
  // dài, ghế 2 bên, bảng trắng + màn hình họp gắn trong phòng);
  // khoảng trống trước Phòng Tổng giám đốc để TRỐNG hoàn toàn.
  // TRỢ LÝ TGĐ ngồi NGAY TRONG phòng TGĐ — đính chính của Chủ
  // tịch: KHÔNG ngồi ngang hàng với Tổng giám đốc; bàn trợ lý đặt
  // THẤP HƠN (lệch hẳn về phía trước so với bàn TGĐ ở phía sau) và
  // LỆCH SANG BÊN PHẢI, quay mặt ĐỐI DIỆN bàn họp dài — không quay
  // lưng vào bàn họp, không quay ngang. VĂN THƯ CÓ PHÒNG RIÊNG
  // hẳn hoi: Phòng Văn thư đặt ĐÚNG CHỖ Phòng Trợ lý cũ ở sườn
  // trái khu điều hành (x -12.2, z -1.0 — thẳng hàng ngang với Nội
  // dung / Marketing trên lưới chuẩn) — văn thư KHÔNG ngồi
  // trong phòng TGĐ, không ngồi ngang hàng với TGĐ; bàn văn thư
  // trong phòng riêng cũng quay mặt về phía bàn họp dài trong
  // phòng TGĐ, không quay lưng, không quay ngang. Phòng Thư ký
  // Chủ tịch giữ phòng riêng ở sườn phải (x 12.2, z -1.0). Hai
  // phòng sườn thẳng cột với Chiến lược / Nhân sự và Phòng Chiếu,
  // mỗi phòng riêng hẳn hoi, kích thước 7.8 × 6.2 BẰNG ĐÚNG các
  // phòng ban khác — không làm nhỏ hơn — đủ bàn ghế tủ, cửa mở ở
  // vách trong hướng ra lối đi chung như các phòng ban.
  // MẶT TIỀN SẢNH ĐỂ THOÁNG: trước khu điều hành CHỈ còn bàn Lễ tân
  // MỞ ở GIỮA sảnh (không phòng) — nhìn thẳng từ cửa chính thấy
  // sảnh, bonsai, bể Koi và khu điều hành, không phòng nào chắn.
  // Hai ô trống ở đầu sau hai cột ngoài đã được Chủ tịch chốt:
  // TRÁI đặt Phòng Tài chính – Kế toán, PHẢI đặt Phòng Pháp chế
  // (xem cuối danh sách phòng) — không còn ô trống nào chưa chốt.
  { id: "ceo", name: "Tổng giám đốc", x: 0, z: -9.15, w: 9.6, d: 8.3, floor: 0x4a3482, staff: [{ id: "tong-giam-doc", initials: "TG", color: 0xf59e0b, name: "Muse — Tổng giám đốc", gender: "Nam" }, { id: "tro-ly", initials: "TT", color: 0x38bdf8, name: "Thu Trang — Trợ lý TGĐ", gender: "Nữ" }] },
  { id: "secretary", name: "Thư ký Chủ tịch", x: 12.2, z: -1.0, w: 7.8, d: 6.2, floor: 0x3a2c6e, staff: [{ id: "thu-ky", initials: "BT", color: 0x2dd4bf, name: "Bảo Trân", gender: "Nữ" }] },
  { id: "clerical", name: "Văn thư", x: -12.2, z: -1.0, w: 7.8, d: 6.2, floor: 0x3a2c6e, staff: [{ id: "van-thu", initials: "TM", color: 0xc2703e, name: "Thanh Mai", gender: "Nữ" }] },
  { id: "reception", name: "Lễ tân", x: 0, z: 1.1, w: 3.4, d: 2.8, floor: 0x3a2c6e, staff: [{ id: "le-tan", initials: "NA", color: 0xfb923c, name: "Ngọc Anh", gender: "Nữ" }] },
  { id: "strategy", name: "Chiến lược", x: -12.2, z: -10.2, w: 7.8, d: 6.2, floor: 0x332a5e, staff: [{ id: "tp-chien-luoc", initials: "QB", color: 0x44506e, name: "Quốc Bảo", gender: "Nam" }, { id: "strategy-nv1", initials: "KL", color: 0xc65b7c, name: "Khánh Ly", gender: "Nữ" }, { id: "strategy-nv2", initials: "HN", color: 0x607d3b, name: "Hoàng Nam", gender: "Nam" }] },
  { id: "hr", name: "Nhân sự", x: 12.2, z: -10.2, w: 7.8, d: 6.2, floor: 0x332a5e, staff: [{ id: "tp-nhan-su", initials: "HN", color: 0xa8577a, name: "Hồng Nhung", gender: "Nữ" }, { id: "hr-nv1", initials: "TĐ", color: 0x51749e, name: "Tiến Đạt", gender: "Nam" }, { id: "hr-nv2", initials: "MD", color: 0x7a9e43, name: "Mỹ Duyên", gender: "Nữ" }] },
  // LƯỚI PHÒNG ĐỀU NHAU CẢ HÀNG DỌC LẪN HÀNG NGANG (Chủ tịch đính
  // chính mới nhất — bản cũ hàng thì sát nhau 0.4, hàng thì thưa 3.8,
  // cột trong/ngoài còn lệch hàng nhau 0.8): MỌI phòng ban thường
  // đứng trên MỘT LƯỚI CHUẨN DUY NHẤT — kích thước 7.8×6.2 bằng nhau
  // hết; 2 CỘT mỗi bên ở x ±12.2 (trong) và ±23.0 (ngoài), lối đi dọc
  // giữa 2 cột rộng đúng 3.0; 4 HÀNG ngang THẲNG HÀNG cả cột trong
  // lẫn cột ngoài ở z −10.2 / −1.0 / 8.2 / 17.4 — bước hàng đều 9.2,
  // nên HÀNH LANG NGANG giữa mọi cặp hàng rộng đúng 3.0, bằng đúng
  // lối đi dọc 3.0: không hàng nào sát nhau, không hàng nào thưa
  // hơn, không phòng nào to hơn. Thứ tự từ sau ra trước — TRÁI:
  // Tài chính – Kế toán / Chiến lược (hàng sau) → Nội dung / Văn thư
  // → Video / Phòng Chiếu → Âm thanh / Phòng Họp Lớn (hàng trước);
  // PHẢI đối xứng: Pháp chế / Nhân sự → Marketing / Thư ký → Kinh
  // doanh / Đăng tải & SEO → In ấn / Kho Sản phẩm. Cửa mọi phòng mở
  // ở vách trong hướng ra sảnh giữa (cột trong) hoặc ra lối đi dọc
  // 3.0 (cột ngoài), và MỌI khoảng hành lang ngang 3.0 đều có dải
  // thảm ngang nối lối dọc với sảnh — phòng nào cũng thông hành
  // lang, lối đi đều nhau hết. Đạo diễn ngồi trong Phòng Video với
  // vai trò Trưởng phòng Video.
  { id: "content", name: "Nội dung", x: -23.0, z: -1.0, w: 7.8, d: 6.2, floor: 0x332a5e, staff: [{ id: "tp-noi-dung", initials: "TD", color: 0xb07d4f, name: "Trí Dũng", gender: "Nam" }, { id: "content-nv1", initials: "PC", color: 0xd4805f, name: "Phương Chi", gender: "Nữ" }, { id: "content-nv2", initials: "MK", color: 0x5f8a7d, name: "Minh Khôi", gender: "Nam" }] },
  { id: "screening", name: "Phòng Chiếu", x: -12.2, z: 8.2, w: 7.8, d: 6.2, floor: 0x332a5e, staff: [{ id: "tp-chieu", initials: "HS", color: 0x0ea5e9, name: "Hoàng Sơn", gender: "Nam" }, { id: "chieu-nv1", initials: "TH", color: 0xf43f5e, name: "Thanh Hà", gender: "Nữ" }, { id: "chieu-nv2", initials: "TA", color: 0x22c55e, name: "Tuấn Anh", gender: "Nam" }] },
  {
    id: "video", name: "Phòng Video", x: -23.0, z: 8.2, w: 7.8, d: 6.2, floor: 0x513a94,
    staff: [
      { id: "dao-dien", initials: "ĐĐ", color: 0x7c5cf0, name: "Muse — Đạo diễn", gender: "Nam" },
      { id: "video-01", initials: "MT", color: 0x38bdf8, name: "Minh Tuấn", gender: "Nam" },
      { id: "video-02", initials: "TH", color: 0xf472b6, name: "Thu Hằng", gender: "Nữ" },
      { id: "video-03", initials: "ĐA", color: 0x34d399, name: "Đức Anh", gender: "Nam" },
      { id: "qc", initials: "NL", color: 0xfbbf24, name: "Ngọc Linh — QC", gender: "Nữ" },
    ],
  },
  { id: "sound", name: "Âm thanh", x: -23.0, z: 17.4, w: 7.8, d: 6.2, floor: 0x332a5e, staff: [{ id: "tp-am-thanh", initials: "TK", color: 0x546e7a, name: "Tuấn Kiệt", gender: "Nam" }, { id: "sound-nv1", initials: "TT", color: 0x8d6e63, name: "Thanh Tùng", gender: "Nam" }, { id: "sound-nv2", initials: "NT", color: 0x66bb6a, name: "Ngọc Trâm", gender: "Nữ" }] },
  { id: "meeting", name: "Phòng Họp Lớn", x: -12.2, z: 17.4, w: 7.8, d: 6.2, floor: 0x3a2c6e, staff: [{ id: "tp-hop", initials: "MC", color: 0x8b5cf6, name: "Minh Châu", gender: "Nữ" }, { id: "hop-nv1", initials: "VT", color: 0x65a30d, name: "Văn Toàn", gender: "Nam" }] },
  { id: "marketing", name: "Marketing", x: 23.0, z: -1.0, w: 7.8, d: 6.2, floor: 0x332a5e, staff: [{ id: "tp-marketing", initials: "MP", color: 0x8e44ad, name: "Mai Phương", gender: "Nữ" }, { id: "marketing-nv1", initials: "VH", color: 0x4a7fb5, name: "Văn Hùng", gender: "Nam" }, { id: "marketing-nv2", initials: "TT", color: 0x3aa79c, name: "Thanh Thảo", gender: "Nữ" }] },
  { id: "publish", name: "Đăng tải & SEO", x: 12.2, z: 8.2, w: 7.8, d: 6.2, floor: 0x332a5e, staff: [{ id: "tp-dang-tai", initials: "KH", color: 0x5c6bc0, name: "Khánh Huyền", gender: "Nữ" }, { id: "publish-nv1", initials: "ĐH", color: 0xc05c5c, name: "Đức Huy", gender: "Nam" }, { id: "publish-nv2", initials: "TL", color: 0xab7bc0, name: "Thùy Linh", gender: "Nữ" }] },
  { id: "sales", name: "Kinh doanh", x: 23.0, z: 8.2, w: 7.8, d: 6.2, floor: 0x332a5e, staff: [{ id: "tp-kinh-doanh", initials: "TN", color: 0x37474f, name: "Trọng Nghĩa", gender: "Nam" }, { id: "sales-nv1", initials: "LA", color: 0xb5524a, name: "Lan Anh", gender: "Nữ" }, { id: "sales-nv2", initials: "QH", color: 0x8060b8, name: "Quang Huy", gender: "Nam" }] },
  { id: "warehouse", name: "Kho Sản phẩm", x: 12.2, z: 17.4, w: 7.8, d: 6.2, floor: 0x332a5e, staff: [{ id: "tk-kho", initials: "VĐ", color: 0xeab308, name: "Văn Đức", gender: "Nam" }, { id: "kho-nv1", initials: "TT", color: 0x06b6d4, name: "Thu Thủy", gender: "Nữ" }, { id: "kho-nv2", initials: "HĐ", color: 0xa855f7, name: "Hải Đăng", gender: "Nam" }] },
  { id: "print", name: "Phòng In ấn", x: 23.0, z: 17.4, w: 7.8, d: 6.2, floor: 0x332a5e, staff: [{ id: "tp-in-an", initials: "ĐL", color: 0xec4899, name: "Đức Long", gender: "Nam" }, { id: "in-an-nv1", initials: "HA", color: 0x14b8a6, name: "Hồng Anh", gender: "Nữ" }, { id: "in-an-nv2", initials: "QA", color: 0xf97316, name: "Quốc Anh", gender: "Nam" }] },
  // HAI Ô TRỐNG cuối cùng hai bên đã được Chủ tịch chốt: TRÁI là
  // Phòng Tài chính – Kế toán, PHẢI là Phòng Pháp chế — lấp đúng ô
  // trống ở đầu sau của hai cột ngoài (x ±23, z=-10.2), kích thước
  // 7.8 × 6.2 bằng các phòng ban khác, mỗi phòng 1 trưởng phòng +
  // 2 nhân viên ngồi bàn làm việc. KHÔNG đặt phòng họp hay phòng
  // nghỉ vào hai ô này.
  { id: "finance", name: "Tài chính – Kế toán", x: -23.0, z: -10.2, w: 7.8, d: 6.2, floor: 0x332a5e, staff: [{ id: "tp-tai-chinh", initials: "ĐT", color: 0x2e7d5b, name: "Đức Thịnh", gender: "Nam" }, { id: "finance-nv1", initials: "TH", color: 0xd4a017, name: "Thu Hiền", gender: "Nữ" }, { id: "finance-nv2", initials: "VP", color: 0x4a6fa5, name: "Văn Phong", gender: "Nam" }] },
  { id: "legal", name: "Pháp chế", x: 23.0, z: -10.2, w: 7.8, d: 6.2, floor: 0x332a5e, staff: [{ id: "tp-phap-che", initials: "ĐP", color: 0x5b4a8a, name: "Đình Phong", gender: "Nam" }, { id: "legal-nv1", initials: "MC", color: 0xc65b7c, name: "Mai Chi", gender: "Nữ" }, { id: "legal-nv2", initials: "HT", color: 0x607d8a, name: "Hữu Thắng", gender: "Nam" }] },
];

// ---------------------------------------------------------------------------
// SƠ ĐỒ TỔ CHỨC MUSE COMPANY (Chủ tịch duyệt: lên sơ đồ trước, nối
// vào văn phòng / pipeline sau — bản này nối cả hai): Chủ tịch
// Hưởng → Kiểm toán nội bộ độc lập báo thẳng Chủ tịch; Tổng giám
// đốc Muse điều hành, trình Chủ tịch; Văn phòng Chủ tịch (Thư ký
// + Văn thư) giữ Sổ quyết định; Hội đồng cố vấn 5 người chỉ khuyến
// nghị khi ≥3/5 đồng ý, có biên bản bỏ phiếu; R&D và Tổng quản nền
// tảng trực thuộc Tổng giám đốc; 5 khối giám đốc báo thẳng Tổng
// giám đốc. Chủ tịch chỉ có 2 điểm chạm: duyệt MỞ dự án và duyệt
// FINAL — giữ nguyên như pipeline hiện tại.
// ---------------------------------------------------------------------------

interface OrgBlock {
  key: string;
  name: string;
  directorId: string;
  directorTitle: string;
  rooms: string[];
  note: string;
}

const ORG_BLOCKS: OrgBlock[] = [
  {
    key: "san-xuat",
    name: "1 · Sản xuất",
    directorId: "dao-dien",
    directorTitle: "Giám đốc Sản xuất",
    rooms: ["content", "video", "sound", "screening"],
    note: "Nội dung · Video · Âm thanh · Chiếu — dây chuyền sản xuất chính, chạy qua kênh TASK.",
  },
  {
    key: "chat-luong",
    name: "2 · Chất lượng",
    directorId: "gd-chat-luong",
    directorTitle: "Giám đốc Chất lượng · VETO",
    rooms: ["chat-luong", "legal"],
    note: "QC toàn công ty · bản quyền & tuân thủ (Pháp chế) · hội đồng duyệt mẫu — quyền VETO bắt buộc ghi mã lý do, sửa xong mới qua.",
  },
  {
    key: "phat-trien",
    name: "3 · Phát triển",
    directorId: "tp-chien-luoc",
    directorTitle: "Giám đốc Phát triển",
    rooms: ["strategy"],
    note: "Chiến lược · dữ liệu & phân tích · cộng đồng & tương tác — do Phòng Chiến lược phụ trách cả ba mảng.",
  },
  {
    key: "kinh-doanh",
    name: "4 · Kinh doanh",
    directorId: "tp-kinh-doanh",
    directorTitle: "Giám đốc Kinh doanh",
    rooms: ["sales", "marketing", "publish", "finance"],
    note: "Kinh doanh · Marketing · Đăng tải & SEO · Tài chính – Kế toán.",
  },
  {
    key: "cong-nghe",
    name: "5 · Công nghệ",
    directorId: "tp-cong-nghe",
    directorTitle: "Giám đốc Công nghệ / CTO",
    rooms: ["cong-nghe"],
    note: "Kỹ thuật & hạ tầng · API · an toàn tài khoản — CHỜ KẾT NỐI LOCAL: chưa có model nào chạy, mục Model để trống cho tới khi local nối thật.",
  },
];

/** Phòng ban thuộc khối nào (theo room id của việc) — dùng cho KPI từng khối. */
const blockOfRoom = (roomId: string): OrgBlock | undefined =>
  ORG_BLOCKS.find((b) => b.rooms.includes(roomId));

/** 5 thành viên Hội đồng cố vấn — khuyến nghị chỉ thành khi ≥3/5 đồng ý. */
const COUNCIL_MEMBERS: { staffId: string; seat: string }[] = [
  { staffId: "tp-chien-luoc", seat: "Cố vấn Chiến lược" },
  { staffId: "tp-phap-che", seat: "Cố vấn Pháp chế & bản quyền" },
  { staffId: "tp-tai-chinh", seat: "Cố vấn Tài chính" },
  { staffId: "gd-chat-luong", seat: "Cố vấn Chất lượng" },
  { staffId: "tp-cong-nghe", seat: "Cố vấn Công nghệ" },
];

/** Mã lý do VETO chuẩn hoá — VETO không có mã thì không tính là VETO. */
const VETO_CODES: { code: string; label: string }[] = [
  { code: "BQ-01", label: "Bản quyền — nhạc / âm thanh chưa rõ quyền" },
  { code: "BQ-02", label: "Bản quyền — hình ảnh / tư liệu chưa rõ quyền" },
  { code: "CL-01", label: "Chất lượng — lỗi kỹ thuật hình / tiếng" },
  { code: "CL-02", label: "Chất lượng — sai chuẩn mẫu / nhân vật / tỉ lệ" },
  { code: "AT-01", label: "An toàn tài khoản — nguy cơ bị đánh dấu / hạn chế kênh" },
  { code: "AT-02", label: "An toàn tài khoản — vi phạm chính sách nền tảng" },
  { code: "KH-01", label: "Khác — ghi rõ lý do bên dưới" },
];

const STATUS_META: Record<TaskStatus, { label: string; lamp: LampKind; badge: string }> = {
  ASSIGNED: { label: "Chờ nhận", lamp: "assigned", badge: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  IN_PROGRESS: { label: "Đang làm", lamp: "working", badge: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200" },
  REVIEW: { label: "Chờ duyệt", lamp: "review", badge: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  APPROVED: { label: "Đạt", lamp: "approved", badge: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200" },
  REVISION_REQUIRED: { label: "Làm lại", lamp: "revision", badge: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" },
};

const BOARD_COLUMNS: TaskStatus[] = [
  "ASSIGNED",
  "IN_PROGRESS",
  "REVIEW",
  "APPROVED",
  "REVISION_REQUIRED",
];

const QC_CHECKS: { key: string; label: string }[] = [
  { key: "check_face", label: "Mặt khớp đúng ô nhân vật đã khóa trong Brand Kit" },
  { key: "check_motion", label: "Tay và chuyển động tự nhiên, không lỗi AI" },
  { key: "check_text", label: "Không có chữ AI méo, phụ đề đúng tiếng Việt" },
  { key: "check_ratio", label: "Đúng tỉ lệ khung hình và đúng nhịp giây của brief" },
  { key: "check_character", label: "Nhân vật, trang phục, bối cảnh đúng brief đã chốt" },
];

function lampForTasks(tasks: Task[]): LampKind {
  if (tasks.some((t) => t.status === "REVISION_REQUIRED")) return "revision";
  if (tasks.some((t) => t.status === "REVIEW")) return "review";
  if (tasks.some((t) => t.status === "IN_PROGRESS")) return "working";
  if (tasks.some((t) => t.status === "ASSIGNED")) return "assigned";
  if (tasks.length > 0) return "approved";
  return "idle";
}

type Presence =
  | "meeting"
  | "a2a"
  | "working"
  | "checking"
  | "reporting"
  | "report-ceo"
  | "resting"
  | "idle"
  | "soon";

const PRESENCE_META: Record<Presence, { label: string; color: string }> = {
  meeting: { label: "Đang họp QC", color: "#f59e0b" },
  a2a: { label: "Đi nhận việc", color: "#38bdf8" },
  working: { label: "Đang làm tại bàn", color: "#22c55e" },
  checking: { label: "Đi kiểm tra việc", color: "#a78bfa" },
  reporting: { label: "Đi nộp / báo cáo — chờ duyệt", color: "#f59e0b" },
  "report-ceo": { label: "Lên báo cáo Chủ tịch", color: "#f2c14e" },
  resting: { label: "Đang thư giãn — chờ việc", color: "#94a3b8" },
  idle: { label: "Rảnh — chờ việc", color: "#8b87a0" },
  soon: { label: "Sắp mở — đang chờ việc", color: "#55506e" },
};

// Lịch làm việc của công ty — như ngoài đời: 07:30 vào làm, 08:00 họp sáng
// 5 phút, 12:00–13:00 nghỉ ăn trưa, 17:30 báo cáo cuối ngày, 18:30 tan làm,
// thứ 7 & chủ nhật nghỉ. Pha hiện tại lái presence, bong bóng thoại và đèn
// phòng: giờ nghỉ trưa mọi người rời bàn ra khu ăn uống / khu trà thư giãn,
// ngoài giờ văn phòng nghỉ hẳn.
type OfficePhase = "off" | "morning" | "lunch" | "afternoon" | "wrap";

interface OfficePhaseInfo {
  phase: OfficePhase;
  label: string;
  meetingNow: boolean;
}

function officePhaseOf(d: Date): OfficePhaseInfo {
  const day = d.getDay();
  const mins = d.getHours() * 60 + d.getMinutes();
  if (day === 0 || day === 6 || mins < 7 * 60 + 30 || mins >= 18 * 60 + 30) {
    return { phase: "off", label: day === 0 || day === 6 ? "Cuối tuần — công ty nghỉ" : "Ngoài giờ làm việc — văn phòng nghỉ", meetingNow: false };
  }
  if (mins >= 12 * 60 && mins < 13 * 60) {
    return { phase: "lunch", label: "Giờ nghỉ trưa 12:00–13:00 — nhân viên đang ăn trưa, tán gẫu", meetingNow: false };
  }
  if (mins >= 17 * 60 + 30) {
    return { phase: "wrap", label: "Cuối ngày — Đạo diễn báo cáo tổng kết, chuẩn bị tan làm 18:30", meetingNow: false };
  }
  return {
    phase: mins < 12 * 60 ? "morning" : "afternoon",
    label: mins < 12 * 60 ? "Giờ làm việc buổi sáng" : "Giờ làm việc buổi chiều",
    meetingNow: mins >= 8 * 60 && mins < 8 * 60 + 5,
  };
}

// Presence state machine — khớp 100% với bảng việc thật, không diễn khi không
// có việc: Chờ nhận → đi tới bàn Đạo diễn nhận việc; Đang làm / Làm lại → về
// bàn gõ phím sửa; Chờ duyệt → nhân viên đi nộp cho QC, QC + Đạo diễn vào họp
// QC; Đạt + qua cổng cuối → Đạo diễn lên khoang Tổng giám đốc báo cáo; hết
// việc → thư giãn tự nhiên trong văn phòng. Mọi phòng ban đều đã mở.
// Lễ tân Ngọc Anh là ngoại lệ cố định: LUÔN ngồi trực tại bàn Lễ tân giữa
// sảnh trong giờ làm việc — bàn Lễ tân không bao giờ trống người.
function presenceFor(staffId: string, tasks: Task[], info?: OfficePhaseInfo): Presence {
  const member = STAFF.find((s) => s.id === staffId);
  if (member && !ROOMS.find((r) => r.id === member.roomId)?.active) return "soon";
  const phase = info ?? officePhaseOf(new Date());
  if (phase.phase === "off") return staffId === "chu-tich" ? "working" : "idle";
  if (phase.phase === "lunch") return staffId === "chu-tich" ? "working" : "resting";
  if (phase.meetingNow && (staffId === "dao-dien" || staffId === "qc" || staffId.startsWith("tp-") || staffId === "tk-kho")) return "meeting";
  if (staffId === "le-tan") return "working";
  const mine = tasks.filter((t) => t.assignee === staffId);
  const open = tasks.filter((t) => t.status !== "APPROVED");
  // Chủ tịch ngồi MỘT MÌNH trong Phòng Chủ tịch phía sau — phòng
  // mở rộng rộng bằng đúng hành lang chính giữa, trên bệ nâng
  // thấp, lên bằng 2 cầu thang thẳng đảo ngược (chân thang tại
  // vách trước phòng, thang leo vào trong dọc hành lang vách
  // ngăn) vào cửa chính duy nhất ở giữa — phòng
  // không có thêm nhân viên nào; Văn thư ngồi ở Phòng Văn thư riêng
  // của mình ở sườn trái khu điều hành; Thư ký luôn trực ở phòng
  // riêng của mình ở sườn phải khu điều hành.
  if (staffId === "chu-tich") return "working";
  if (staffId === "van-thu") return "working";
  if (staffId === "thu-ky") return "working";
  if (staffId === "tro-ly") return open.length > 0 ? "working" : "resting";
  if (staffId === "dao-dien") {
    if (tasks.some((t) => t.status === "REVIEW")) return "meeting";
    if (
      tasks.length > 0 &&
      open.length === 0 &&
      tasks.some((t) => t.gate_final === "APPROVED")
    )
      return "report-ceo";
    if (tasks.some((t) => t.status === "IN_PROGRESS")) return "checking";
    // Có việc Chờ nhận hoặc đang mở: Đạo diễn ngồi bàn mình giao việc / điều phối.
    if (open.length > 0) return "working";
  }
  if (staffId === "qc") {
    if (tasks.some((t) => t.status === "REVIEW")) return "meeting";
    if (tasks.some((t) => t.status === "IN_PROGRESS")) return "checking";
    // Ngoài hai việc thật trên, QC rảnh — không gán "đang làm" giả.
  }
  if (mine.some((t) => t.status === "REVIEW")) return "reporting";
  if (mine.some((t) => t.status === "ASSIGNED")) return "a2a";
  if (mine.some((t) => t.status === "IN_PROGRESS" || t.status === "REVISION_REQUIRED"))
    return "working";
  // Không có việc thật của mình → thư giãn tự nhiên trong văn phòng (khu
  // bàn trà, sofa, cà phê, trò chuyện) — không giả vờ bận, không bịa việc.
  // Có việc được giao là trạng thái tự chuyển sang làm theo các nhánh trên.
  return "resting";
}

function PresencePill({ presence }: { presence: Presence }) {
  const meta = PRESENCE_META[presence];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ borderColor: meta.color, color: meta.color }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

const AVATAR_INITIALS: Record<string, string> = {
  "tong-giam-doc": "M",
  "dao-dien": "ĐĐ",
  "video-01": "V1",
  "video-02": "V2",
  "video-03": "V3",
  qc: "QC",
};

function Avatar({ member, size = 40 }: { member: StaffMember; size?: number }) {
  const initials =
    AVATAR_INITIALS[member.id] ??
    member.name
      .split(" ")
      .slice(-2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ backgroundColor: member.color, width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

function LampDot({ kind, size = 10 }: { kind: LampKind; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        backgroundColor: LAMP_CSS[kind],
        width: size,
        height: size,
        boxShadow: `0 0 6px ${LAMP_CSS[kind]}`,
      }}
    />
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.badge}`}>
      <LampDot kind={meta.lamp} size={7} />
      {meta.label}
    </span>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[var(--radius)] border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--dim)]">
      {children}
    </p>
  );
}

/**
 * Chuông thông báo gọn ở góc trên phải: chỉ gom các dòng nhật ký QUAN
 * TRỌNG (lỗi / trượt QC / dừng dây chuyền / chờ chốt / họp giải cứu) từ
 * nhật ký thật. Số đỏ = số dòng quan trọng chưa đọc. Cảnh báo mới chỉ
 * hiện 1 dòng ngắn trên cùng rồi tự ẩn sau 5 giây.
 */
function NotificationBell({ onOpenEntry }: { onOpenEntry: (e: JournalEntry) => void }) {
  const [open, setOpen] = useState(false);
  const [readAt, setReadAt] = useState<number>(() => lsGetNum("office_notif_read_at"));
  const [clearedAt, setClearedAt] = useState<number>(() => lsGetNum("office_notif_cleared_at"));
  const [toastKey, setToastKey] = useState<string | null>(null);
  const seenRef = useRef<string | null>(null);
  const journalQ = useQuery({
    queryKey: ["journal", "bell"],
    queryFn: () => api.listJournal({ day_start_ms: 0, day_end_ms: 0, room: "", staff_id: "", limit: 120 }),
    refetchInterval: 15000,
  });
  const entries = journalQ.data?.entries ?? [];
  const important = entries.filter((e) => {
    const s = journalStatusOf(e);
    return s === "error" || s === "waiting" || e.title.includes("giải cứu");
  });
  const visible = important.filter((e) => new Date(e.time).getTime() > clearedAt);
  const unread = visible.filter((e) => new Date(e.time).getTime() > readAt);
  const newestKey = important[0]?.key ?? "";
  const toastEntry = toastKey ? (important.find((e) => e.key === toastKey) ?? null) : null;

  useEffect(() => {
    if (!newestKey) return;
    if (seenRef.current === null) {
      seenRef.current = newestKey;
      return;
    }
    if (newestKey !== seenRef.current) {
      seenRef.current = newestKey;
      const newest = important.find((e) => e.key === newestKey);
      if (newest && new Date(newest.time).getTime() > readAt) {
        setToastKey(newestKey);
        const t = window.setTimeout(() => setToastKey(null), 5000);
        return () => window.clearTimeout(t);
      }
    }
    // important/readAt thay đổi theo dữ liệu truy vấn; mốc so sánh thật là newestKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestKey]);

  const markAllRead = () => {
    const now = Date.now();
    setReadAt(now);
    lsSetNum("office_notif_read_at", now);
  };
  const clearAll = () => {
    const now = Date.now();
    setClearedAt(now);
    setReadAt(now);
    lsSetNum("office_notif_cleared_at", now);
    lsSetNum("office_notif_read_at", now);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unread.length > 0 ? `Thông báo — ${unread.length} chưa đọc` : "Thông báo"}
        className="relative flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-base"
      >
        <span aria-hidden="true">🔔</span>
        {unread.length > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
            {unread.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
            <p className="text-sm font-bold">Thông báo quan trọng</p>
            <span className="text-xs text-[var(--dim)]">{unread.length} chưa đọc</span>
          </div>
          {visible.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--dim)]">
              Chưa có cảnh báo quan trọng nào trong nhật ký. QC trượt, dừng dây chuyền, chờ chốt và họp giải cứu sẽ hiện ở đây.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {visible.slice(0, 15).map((e) => {
                const st = journalStatusOf(e);
                const meta = JOURNAL_STATUS_META[st];
                const isUnread = new Date(e.time).getTime() > readAt;
                return (
                  <li key={e.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setReadAt((prev) => Math.max(prev, new Date(e.time).getTime()));
                        setOpen(false);
                        onOpenEntry(e);
                      }}
                      className={`block w-full border-l-4 px-3 py-2 text-left hover:bg-[var(--bg)] ${isUnread ? "bg-[var(--bg)]/60" : ""}`}
                      style={{ borderLeftColor: meta.color }}
                    >
                      <span className="flex items-center gap-2 text-xs">
                        <span className="font-bold" style={{ color: meta.color }}>{meta.label}</span>
                        <span className="text-[var(--dim)]">[{fmtClock(e.time)}]</span>
                        <span className="font-semibold">{e.actor || "—"}</span>
                        {isUnread ? <span className="ml-auto h-2 w-2 rounded-full bg-red-600" aria-label="Chưa đọc" /> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-sm">{e.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex gap-2 border-t border-[var(--border)] px-3 py-2">
            <button type="button" onClick={markAllRead} className="min-h-9 flex-1 rounded-[var(--radius)] border border-[var(--border)] px-2 text-xs font-semibold">
              Đánh dấu đã đọc hết
            </button>
            <button type="button" onClick={clearAll} className="min-h-9 flex-1 rounded-[var(--radius)] border border-[var(--border)] px-2 text-xs font-semibold text-red-600">
              Xóa hết
            </button>
          </div>
        </div>
      ) : null}
      {toastEntry ? (
        <div
          role="alert"
          className="fixed left-1/2 top-3 z-50 flex w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-2 rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          <span className="min-w-0 flex-1 truncate">
            [{JOURNAL_STATUS_META[journalStatusOf(toastEntry)].label}] {toastEntry.actor}: {toastEntry.title}
          </span>
          <button type="button" onClick={() => setToastKey(null)} aria-label="Đóng cảnh báo" className="min-h-8 min-w-8 shrink-0 rounded-full font-bold">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

const CONSOLE_DEFAULTS: ConsoleSettings = {
  model_mode: "",
  model_script: "",
  model_voice: "",
  model_visuals: "",
  model_edit: "",
  episode: "Tập 01",
  project_name: "",
};

// Máy local của Chủ tịch CHƯA kết nối: phần Model để trống, không liệt
// kê tên model nào như đã có sẵn. Danh sách model thật chỉ xuất hiện
// khi kết nối local thật được thiết lập trên máy Chủ tịch.
const MODEL_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— Chưa có model — chờ kết nối local —" },
];
const STAGE_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— Chưa có model — chờ kết nối local —" },
];
const EPISODE_OPTIONS: string[] = Array.from({ length: 12 }, (_, i) => `Tập ${String(i + 1).padStart(2, "0")}`);

/**
 * Thanh chức năng trên cùng kiểu Phim Trường: trạng thái kết nối, phần
 * Model, chọn Tập, tên dự án, Phòng họp (có số báo), Tiên ký (local),
 * Chạy thử (Demo), Hiện/Ẩn tên và nút Bấm máy. Model / Tiên ký / Demo
 * chạy trên MÁY LOCAL của Chủ tịch: máy CHƯA kết nối nên phần Model để
 * TRỐNG — chỉ hiện "Chờ kết nối local", không liệt kê tên model nào
 * như đã có sẵn; danh sách model thật chỉ hiện khi kết nối local thật
 * được thiết lập trên máy Chủ tịch. Tuyệt đối không giả lập là đang
 * chạy. Bấm máy khởi động phần điều phối trên web (TGĐ chạy dây
 * chuyền); các khâu nặng vẫn chờ file local.
 */
function FunctionBar({
  tasks,
  go,
  openTask,
  showNames,
  onToggleNames,
  meetingAlerts,
  onOpenMeetings,
}: {
  tasks: Task[];
  go: (v: View) => void;
  openTask: (t: Task) => void;
  showNames: boolean;
  onToggleNames: () => void;
  meetingAlerts: number;
  onOpenMeetings: () => void;
}) {
  const queryClient = useQueryClient();
  const settingsQ = useQuery({ queryKey: ["console-settings"], queryFn: () => api.getConsoleSettings({}) });
  const [draft, setDraft] = useState<ConsoleSettings | null>(null);
  useEffect(() => {
    if (settingsQ.data && !draft) setDraft(settingsQ.data);
    // Chỉ nạp bản nháp lần đầu; các lần refetch sau không ghi đè chữ đang gõ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQ.data]);
  const cfg: ConsoleSettings = draft ?? settingsQ.data ?? CONSOLE_DEFAULTS;

  const [localNote, setLocalNote] = useState<string | null>(null);
  useEffect(() => {
    if (!localNote) return;
    const t = window.setTimeout(() => setLocalNote(null), 6000);
    return () => window.clearTimeout(t);
  }, [localNote]);

  const saveMut = useMutation({
    mutationFn: async (next: ConsoleSettings) => await api.setConsoleSettings(next),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["console-settings"] }),
    onError: (e) => setLocalNote(e instanceof Error ? e.message : String(e)),
  });
  const update = (patch: Partial<ConsoleSettings>, save = true) => {
    const next = { ...cfg, ...patch };
    setDraft(next);
    if (save) saveMut.mutate(next);
  };

  const pipeTask = livePipeTask(tasks);
  const bamMayTarget = pipeTask ?? tasks.find((t) => t.pipeline_state === "NONE") ?? null;
  const invalidatePipe = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    void queryClient.invalidateQueries({ queryKey: ["journal"] });
  };
  const openMut = useMutation({
    mutationFn: async (id: number) => await api.approveProjectOpen({ task_id: id, actor: "Chủ tịch" }),
    onSuccess: invalidatePipe,
    onError: (e) => setLocalNote(e instanceof Error ? e.message : String(e)),
  });
  const resumeMut = useMutation({
    mutationFn: async (id: number) => await api.resumePipeline({ task_id: id, actor: "Chủ tịch" }),
    onSuccess: invalidatePipe,
    onError: (e) => setLocalNote(e instanceof Error ? e.message : String(e)),
  });
  const advanceMut = useMutation({
    mutationFn: async (id: number) => await api.advancePipeline({ task_id: id }),
    onSuccess: invalidatePipe,
    onError: (e) => setLocalNote(e instanceof Error ? e.message : String(e)),
  });
  const bamMayBusy = openMut.isPending || resumeMut.isPending || advanceMut.isPending;

  const bamMay = () => {
    if (!bamMayTarget) {
      go("assign");
      return;
    }
    const st = bamMayTarget.pipeline_state;
    if (st === "NONE") openMut.mutate(bamMayTarget.id);
    else if (st === "PAUSED") resumeMut.mutate(bamMayTarget.id);
    else if (st === "RUNNING") advanceMut.mutate(bamMayTarget.id);
    else openTask(bamMayTarget); // BLOCKED / SCREENING / DONE: mở dự án để Chủ tịch xử lý / duyệt Final
  };
  const bamMayLabel =
    bamMayTarget?.pipeline_state === "BLOCKED"
      ? "Bấm máy — đang kẹt, mở xử lý"
      : bamMayTarget?.pipeline_state === "SCREENING"
        ? "Bấm máy — mở duyệt Final"
        : "Bấm máy";

  const localWait = (what: string) =>
    setLocalNote(
      `${what} chạy trên máy local của Chủ tịch (model local, RTX 3060) — máy chưa kết nối nên đang CHỜ KẾT NỐI LOCAL, web không giả lập chạy. Phần Model đang để trống vì chưa có model nào; khi máy local kết nối thật, danh sách model sẽ hiện để chọn.`,
    );

  const selCls =
    "min-h-9 rounded-md border border-white/25 bg-[#241b4d] px-2 py-1 text-xs font-medium text-white";
  const stageModelRow = (label: string, field: "model_script" | "model_voice" | "model_visuals" | "model_edit") => (
    <label className="flex items-center gap-2 text-xs text-[#c9bdf5]">
      <span className="w-28 shrink-0">{label}</span>
      <select
        aria-label={`Model cho khâu ${label}`}
        value={cfg[field]}
        disabled
        onChange={(e) => update({ [field]: e.target.value } as Partial<ConsoleSettings>)}
        className={`${selCls} flex-1 disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {STAGE_MODEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );

  return (
    <section aria-label="Thanh chức năng" className="mb-3 rounded-[var(--radius)] bg-[#17102e] px-3 py-2.5 text-white shadow">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-3 text-xs font-medium">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
            Đã kết nối server
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
            Local: Chờ kết nối local
          </span>
        </span>
        <label className="flex items-center gap-1.5 text-xs text-[#c9bdf5]">
          Model
          <select
            aria-label="Chọn model cho pipeline local"
            value={cfg.model_mode}
            disabled
            onChange={(e) => update({ model_mode: e.target.value })}
            className={`${selCls} max-w-[240px] disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {MODEL_MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[#c9bdf5]">
          Tập
          <select
            aria-label="Chọn tập"
            value={cfg.episode}
            onChange={(e) => update({ episode: e.target.value })}
            className={selCls}
          >
            {EPISODE_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <input
          {...FIELDS.setConsoleSettings.project_name}
          aria-label="Tên dự án"
          value={cfg.project_name}
          placeholder={pipeTask ? pipeTask.title : "Tên dự án"}
          onChange={(e) => update({ project_name: e.target.value }, false)}
          onBlur={() => {
            if (draft) saveMut.mutate(draft);
          }}
          className="min-h-9 w-44 rounded-md border border-white/25 bg-white px-2 py-1 text-xs font-medium text-[#221a3e]"
        />
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenMeetings}
            aria-label={meetingAlerts > 0 ? `Phòng họp — ${meetingAlerts} việc cần họp/xử lý` : "Phòng họp"}
            className="relative min-h-9 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ring-white/25 hover:bg-white/15"
          >
            Phòng họp
            {meetingAlerts > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-amber-950">
                {meetingAlerts}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => localWait("Tiên ký (local)")}
            className="min-h-9 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ring-white/25 hover:bg-white/15"
          >
            Tiên ký (local)
          </button>
          <button
            type="button"
            onClick={() => localWait("Chạy thử (Demo)")}
            className="min-h-9 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ring-white/25 hover:bg-white/15"
          >
            Chạy thử (Demo)
          </button>
          <button
            type="button"
            onClick={onToggleNames}
            aria-pressed={showNames}
            className="min-h-9 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ring-white/25 hover:bg-white/15"
          >
            {showNames ? "Ẩn tên" : "Hiện tên"}
          </button>
          <button
            type="button"
            onClick={bamMay}
            disabled={bamMayBusy}
            className="min-h-9 rounded-md bg-amber-400 px-4 py-1.5 text-sm font-bold text-amber-950 shadow hover:bg-amber-300 disabled:opacity-60"
          >
            {bamMayLabel}
          </button>
        </span>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-[#c9bdf5]">
          Model theo khâu — chưa có model, chờ kết nối local
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {stageModelRow("Kịch bản & SRT", "model_script")}
          {stageModelRow("Thu voice", "model_voice")}
          {stageModelRow("Ảnh & phân cảnh", "model_visuals")}
          {stageModelRow("Dựng & chiếu thử", "model_edit")}
        </div>
      </details>
      {localNote ? (
        <p role="status" className="mt-2 rounded-md bg-amber-400/15 px-2.5 py-1.5 text-xs text-amber-200">
          {localNote}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Dòng trạng thái ngay trên khung 3D: [ĐÃ XONG] ai vừa xong việc gì ·
 * đang chờ chốt gì · giờ hiện tại — mọi chữ đều lấy từ nhật ký thật và
 * trạng thái dây chuyền thật, đồng hồ chạy theo giờ máy.
 */
function StatusLine({ pipeTask, pipeData }: { pipeTask: Task | null; pipeData: PipelineData | undefined }) {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const journalQ = useQuery({
    queryKey: ["journal", "statusline"],
    queryFn: () => api.listJournal({ day_start_ms: 0, day_end_ms: 0, room: "", staff_id: "", limit: 40 }),
    refetchInterval: 15000,
  });
  const entries = journalQ.data?.entries ?? [];
  const latestDone = entries.find((e) => journalStatusOf(e) === "done") ?? null;
  const latestAny = entries[0] ?? null;
  const currentStage = pipeData?.stages.find((s) => s.stage_key === pipeData.current_stage) ?? null;
  const waitingText = !pipeTask
    ? "chưa có dự án nào trên dây chuyền"
    : pipeData?.pipeline_state === "SCREENING"
      ? "chờ Chủ tịch duyệt Final tại Phòng Chiếu Thử"
      : pipeData?.pipeline_state === "BLOCKED"
        ? `chờ Chủ tịch xử lý khâu kẹt: ${currentStage?.name ?? pipeTask.current_stage}`
        : pipeData?.pipeline_state === "PAUSED"
          ? "dây chuyền đang tạm dừng — chờ Chủ tịch cho chạy tiếp"
          : pipeData?.pipeline_state === "DONE"
            ? "dự án đã hoàn tất"
            : currentStage
              ? `chờ khâu ${currentStage.name} (${currentStage.room_name}) nộp file / qua QC`
              : "đang chờ điều phối";
  const shown = latestDone ?? latestAny;
  const shownMeta = shown ? JOURNAL_STATUS_META[journalStatusOf(shown)] : null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius)] border border-[var(--border)] bg-[#17102e] px-3 py-2 text-sm text-white">
      {shown && shownMeta ? (
        <span className="min-w-0 flex-1 truncate">
          <span className="font-bold" style={{ color: shownMeta.color === "#16a34a" ? "#4ade80" : shownMeta.color }}>
            [{shownMeta.label}]
          </span>{" "}
          <span className="font-semibold">{shown.actor || "—"}:</span> {shown.title}
          {shown.detail ? <span className="text-[#c9bdf5]"> — {shown.detail}</span> : null}
        </span>
      ) : (
        <span className="min-w-0 flex-1 text-[#c9bdf5]">Chưa có hoạt động nào trong nhật ký.</span>
      )}
      <span className="text-xs text-[#c9bdf5]">Chờ chốt: {waitingText}</span>
      <span className="font-mono text-sm font-bold tabular-nums" aria-label="Giờ hiện tại">
        {clock.toLocaleTimeString("vi-VN", { hour12: false })}
      </span>
    </div>
  );
}

/**
 * Cột phải SỐNG cạnh văn phòng 3D (theo ảnh mẫu Phim Trường): 2 tab
 * Phòng họp / Nhật ký, nút đóng, dòng "Hiện tại" bấm được để mở thẻ
 * nhân viên (thẻ có nút Trò chuyện), dải khâu dây chuyền với trạng
 * thái chờ local từng khâu + xem file thật ngay trong cột + các nút
 * làm việc luôn (Pause / Resume / Mở sửa tay / Duyệt cưỡng bức /
 * Tiếp tục từ đây), và danh sách nhật ký theo giờ, màu theo vai, lọc
 * được theo ngày / phòng / người / trạng thái, tìm kiếm nhanh — bấm
 * một dòng là camera bay tới đúng phòng, mở đúng việc / đúng người.
 */
function LiveRail({
  tasks,
  tab,
  onTabChange,
  onClose,
  go,
  openStaff,
  openTask,
  openTaskAtStage,
  zoomToRoom,
}: {
  tasks: Task[];
  tab: "meetings" | "journal";
  onTabChange: (t: "meetings" | "journal") => void;
  onClose: () => void;
  go: (v: View) => void;
  openStaff: (s: StaffMember) => void;
  openTask: (t: Task) => void;
  openTaskAtStage: (t: Task, stageKey: string) => void;
  zoomToRoom: (roomId: string, staffId?: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const pipeTask = livePipeTask(tasks);
  const pipeQ = useQuery({
    queryKey: ["pipeline", pipeTask?.id ?? -1],
    queryFn: () => api.getPipeline({ task_id: pipeTask!.id }),
    enabled: !!pipeTask,
    refetchInterval: 15000,
  });
  const pipe = pipeQ.data;
  const stages = pipe?.stages ?? [];
  const currentStage = stages.find((s) => s.stage_key === pipe?.current_stage) ?? null;
  const [selectedStageKey, setSelectedStageKey] = useState<string | null>(null);
  const selectedStage =
    stages.find((s) => s.stage_key === selectedStageKey) ?? currentStage ?? stages[0] ?? null;

  const stageTextQ = useQuery({
    queryKey: ["stage-output", pipeTask?.id ?? -1, selectedStage?.stage_key ?? ""],
    queryFn: () => api.getStageOutput({ task_id: pipeTask!.id, stage_key: selectedStage!.stage_key }),
    enabled: !!pipeTask && !!selectedStage && selectedStage.kind === "text" && !!selectedStage.output_file_name,
  });

  const [railError, setRailError] = useState<string | null>(null);
  const [railNote, setRailNote] = useState<string | null>(null);
  const invalidateRail = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    void queryClient.invalidateQueries({ queryKey: ["journal"] });
    void queryClient.invalidateQueries({ queryKey: ["meetings"] });
  };
  const railFail = (e: unknown) => setRailError(e instanceof Error ? e.message : String(e));
  const pauseMut = useMutation({
    mutationFn: async (id: number) => await api.pausePipeline({ task_id: id, actor: "Chủ tịch" }),
    onSuccess: () => { setRailNote("Đã tạm dừng dây chuyền tại khâu hiện tại."); invalidateRail(); },
    onError: railFail,
  });
  const resumeMut = useMutation({
    mutationFn: async (id: number) => await api.resumePipeline({ task_id: id, actor: "Chủ tịch" }),
    onSuccess: (r) => { setRailNote(r.note); invalidateRail(); },
    onError: railFail,
  });
  const forceMut = useMutation({
    mutationFn: async (v: { id: number; stageKey: string }) =>
      await api.forcePassStage({ task_id: v.id, stage_key: v.stageKey, actor: "Chủ tịch" }),
    onSuccess: (r) => { setRailNote(r.note); invalidateRail(); },
    onError: railFail,
  });
  const resumeFromMut = useMutation({
    mutationFn: async (v: { id: number; stageKey: string }) =>
      await api.resumeFromStage({ task_id: v.id, stage_key: v.stageKey, actor: "Chủ tịch" }),
    onSuccess: (r) => { setRailNote(r.note); invalidateRail(); },
    onError: railFail,
  });
  const railBusy = pauseMut.isPending || resumeMut.isPending || forceMut.isPending || resumeFromMut.isPending;

  // --- Nhật ký: lọc theo ngày / phòng / người ở server, trạng thái +
  // tìm kiếm lọc ngay tại cột (dữ liệu đã tải là thật từ listJournal).
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };
  const [jDate, setJDate] = useState(todayStr);
  const [jAllDays, setJAllDays] = useState(false);
  const [jRoom, setJRoom] = useState("");
  const [jStaff, setJStaff] = useState("");
  const [jStatus, setJStatus] = useState<"" | JournalStatus>("");
  const [jSearch, setJSearch] = useState("");
  const jDayStart = jAllDays ? 0 : new Date(`${jDate}T00:00:00`).getTime();
  const jDayEnd = jAllDays ? 0 : jDayStart + 86400000;
  const journalQ = useQuery({
    queryKey: ["journal", "rail", jDayStart, jDayEnd, jRoom, jStaff],
    queryFn: () => api.listJournal({ day_start_ms: jDayStart, day_end_ms: jDayEnd, room: jRoom, staff_id: jStaff, limit: 300 }),
    refetchInterval: 10000,
  });
  const rawEntries = journalQ.data?.entries ?? [];
  const entries = rawEntries.filter((e) => {
    if (jStatus && journalStatusOf(e) !== jStatus) return false;
    if (jSearch.trim()) {
      const q = foldClient(jSearch.trim());
      const hay = foldClient(`${e.actor} ${e.title} ${e.detail}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const latestEntry = rawEntries[0] ?? null;

  const meetingsQ = useQuery({ queryKey: ["meetings"], queryFn: () => api.listMeetings({}) });
  const meetings: MeetingRow[] = meetingsQ.data?.meetings ?? [];
  const blockedTasks = tasks.filter((t) => t.pipeline_state === "BLOCKED");
  const meetingAlerts = blockedTasks.length + tasks.filter((t) => t.status === "REVIEW").length;

  const currentInfo = (() => {
    if (pipeTask && currentStage && pipe) {
      const st = pipe.pipeline_state;
      const label =
        st === "DONE" ? "ĐÃ XONG" :
        st === "BLOCKED" ? "ĐANG KẸT — CHỜ CHỦ TỊCH" :
        st === "PAUSED" ? "ĐÃ TẠM DỪNG" :
        st === "SCREENING" ? "CHỜ DUYỆT FINAL" : "ĐANG CHẠY";
      return {
        staffId: currentStage.assignee,
        name: currentStage.assignee_name,
        label,
        text: `khâu ${currentStage.name} · dự án #${pipeTask.id} "${pipeTask.title}"`,
      };
    }
    if (latestEntry) {
      const meta = JOURNAL_STATUS_META[journalStatusOf(latestEntry)];
      return {
        staffId: latestEntry.staff_id,
        name: latestEntry.actor || "—",
        label: meta.label,
        text: latestEntry.title,
      };
    }
    return null;
  })();

  const openEntry = (e: JournalEntry) => {
    if (e.room) zoomToRoom(e.room, e.staff_id ?? undefined);
    const tid = hashTaskId(`${e.title} ${e.detail}`);
    const t = tid ? tasks.find((x) => x.id === tid) : undefined;
    if (t) {
      openTask(t);
      return;
    }
    if (e.staff_id) {
      const s = STAFF.find((x) => x.id === e.staff_id);
      if (s) {
        openStaff(s);
        return;
      }
    }
    if (e.kind === "hop") go("meetings");
  };

  const stageDot = (s: PipelineStage): string =>
    s.status === "DONE" ? "#22c55e" : s.status === "BLOCKED" ? "#dc2626" : s.status === "RUNNING" ? "#ef4444" : "#9ca3af";
  const needsForce = (s: PipelineStage): boolean =>
    !!pipeTask && (s.status === "BLOCKED" || s.retries >= (pipe?.max_retries ?? 3));

  const smallSel =
    "min-h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 text-xs text-[var(--text)]";

  return (
    <aside
      id="live-rail"
      aria-label="Cột phải: phòng họp và nhật ký trực tiếp"
      className="flex max-h-[860px] w-full shrink-0 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-sm xl:w-[352px]"
    >
      <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-1.5">
        <button
          type="button"
          onClick={() => onTabChange("meetings")}
          aria-pressed={tab === "meetings"}
          className={`relative min-h-9 flex-1 rounded-md px-2 text-sm font-semibold ${tab === "meetings" ? "bg-[var(--accent)] text-white" : "text-[var(--dim)] hover:bg-[var(--bg)]"}`}
        >
          Phòng họp
          {meetingAlerts > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
              {meetingAlerts}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => onTabChange("journal")}
          aria-pressed={tab === "journal"}
          className={`min-h-9 flex-1 rounded-md px-2 text-sm font-semibold ${tab === "journal" ? "bg-[var(--accent)] text-white" : "text-[var(--dim)] hover:bg-[var(--bg)]"}`}
        >
          Nhật ký
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng cột phải"
          className="min-h-9 min-w-9 rounded-md text-lg font-bold text-[var(--dim)] hover:bg-[var(--bg)]"
        >
          ×
        </button>
      </div>

      {currentInfo ? (
        <button
          type="button"
          onClick={() => {
            const s = STAFF.find((x) => x.id === currentInfo.staffId);
            if (s) openStaff(s);
          }}
          aria-label={`Hiện tại: ${currentInfo.name} — ${currentInfo.label}. Bấm để mở thẻ nhân viên`}
          className="block w-full border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-left"
        >
          <span className="text-xs text-[var(--dim)]">Hiện tại: </span>
          <span className="text-sm font-bold">{currentInfo.name}</span>{" "}
          <span
            className="text-xs font-bold"
            style={{ color: currentInfo.label === "ĐÃ XONG" ? "#16a34a" : currentInfo.label.startsWith("ĐANG KẸT") ? "#dc2626" : "#0284c7" }}
          >
            — {currentInfo.label}
          </span>
          <span className="block truncate text-xs text-[var(--dim)]">{currentInfo.text} · bấm để mở thẻ (có nút Trò chuyện)</span>
        </button>
      ) : null}

      {tab === "journal" ? (
        <>
          {pipeTask && stages.length > 0 ? (
            <div className="border-b border-[var(--border)] px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold">
                  Dây chuyền dự án #{pipeTask.id}
                  <span className="ml-1.5 font-medium text-[var(--dim)]">
                    {(PIPELINE_STATE_META[pipe?.pipeline_state ?? pipeTask.pipeline_state] ?? { label: pipeTask.pipeline_state }).label}
                  </span>
                </p>
                <span className="ml-auto flex gap-1.5">
                  {pipe?.pipeline_state === "RUNNING" ? (
                    <button type="button" disabled={railBusy} onClick={() => pauseMut.mutate(pipeTask.id)} className="min-h-8 rounded-md bg-amber-500 px-2.5 text-xs font-bold text-white disabled:opacity-50">
                      Pause
                    </button>
                  ) : null}
                  {pipe?.pipeline_state === "PAUSED" ? (
                    <button type="button" disabled={railBusy} onClick={() => resumeMut.mutate(pipeTask.id)} className="min-h-8 rounded-md bg-[var(--accent)] px-2.5 text-xs font-bold text-white disabled:opacity-50">
                      Resume
                    </button>
                  ) : null}
                </span>
              </div>
              <ol className="mt-1.5 space-y-1">
                {stages.map((s) => {
                  const isSel = selectedStage?.stage_key === s.stage_key;
                  const waitingLocal = s.status === "RUNNING" && !s.output_file_name;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedStageKey(s.stage_key)}
                        aria-pressed={isSel}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${isSel ? "bg-[var(--bg)] ring-1 ring-[var(--accent)]" : "hover:bg-[var(--bg)]"}`}
                      >
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.status === "RUNNING" ? "animate-pulse" : ""}`} style={{ backgroundColor: stageDot(s) }} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{s.name}</span>
                          <span className="block truncate text-[11px] text-[var(--dim)]">
                            {s.room_name} · {s.assignee_name}
                            {waitingLocal ? " · Chờ kết nối local — chờ file từ máy Chủ tịch" : ""}
                            {s.status === "DONE" ? " · ĐÃ XONG" : ""}
                            {s.retries > 0 ? ` · trượt QC ${s.retries}/${pipe?.max_retries ?? 3}` : ""}
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${(STAGE_STATUS_META[s.status] ?? { cls: "" }).cls}`}>
                          {(STAGE_STATUS_META[s.status] ?? { label: s.status }).label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {selectedStage ? (
                <div className="mt-2 rounded-md border border-[var(--border)] px-2.5 py-2">
                  <p className="text-xs font-bold">
                    Khâu {selectedStage.name}
                    {selectedStage.output_file_name ? (
                      <>
                        {" "}· file:{" "}
                        {selectedStage.output_url ? (
                          <a href={selectedStage.output_url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent)] underline">
                            {selectedStage.output_file_name}
                          </a>
                        ) : (
                          <span className="font-semibold">{selectedStage.output_file_name}</span>
                        )}
                      </>
                    ) : (
                      <span className="font-medium text-[var(--dim)]"> · chưa có file đầu ra</span>
                    )}
                  </p>
                  {formatStageParams(selectedStage.params) ? (
                    <p className="mt-0.5 text-[11px] text-[var(--dim)]">Đo từ file thật: {formatStageParams(selectedStage.params)}</p>
                  ) : null}
                  {selectedStage.qc_note ? (
                    <p className="mt-0.5 text-[11px] font-medium text-red-700">QC: {selectedStage.qc_note}</p>
                  ) : null}
                  <StageOutputPreview stage={selectedStage} />
                  {selectedStage.kind === "text" && stageTextQ.data?.text_content ? (
                    <pre className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-md bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                      {stageTextQ.data.text_content}
                    </pre>
                  ) : null}
                  {selectedStage.kind !== "gate" ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => openTaskAtStage(pipeTask, selectedStage.stage_key)}
                        className="min-h-8 rounded-md border border-[var(--border)] px-2.5 text-xs font-semibold"
                      >
                        Mở sửa tay
                      </button>
                      <button
                        type="button"
                        disabled={railBusy}
                        onClick={() => resumeFromMut.mutate({ id: pipeTask.id, stageKey: selectedStage.stage_key })}
                        className="min-h-8 rounded-md border border-[var(--accent)] px-2.5 text-xs font-semibold text-[var(--accent)] disabled:opacity-50"
                      >
                        Tiếp tục từ đây
                      </button>
                      {needsForce(selectedStage) ? (
                        <button
                          type="button"
                          disabled={railBusy}
                          onClick={() => forceMut.mutate({ id: pipeTask.id, stageKey: selectedStage.stage_key })}
                          className="min-h-8 rounded-md bg-red-600 px-2.5 text-xs font-bold text-white disabled:opacity-50"
                        >
                          Duyệt cưỡng bức (QC quá {pipe?.max_retries ?? 3} lần)
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openTaskAtStage(pipeTask, selectedStage.stage_key)}
                      className="mt-2 min-h-8 rounded-md border border-[var(--accent)] px-2.5 text-xs font-semibold text-[var(--accent)]"
                    >
                      Mở dự án — duyệt Final
                    </button>
                  )}
                </div>
              ) : null}
              {railNote ? <p className="mt-2 rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">{railNote}</p> : null}
              {railError ? <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800">{railError}</p> : null}
            </div>
          ) : null}

          <div className="space-y-1.5 border-b border-[var(--border)] px-3 py-2">
            <input
              type="search"
              aria-label="Tìm kiếm nhanh trong nhật ký"
              value={jSearch}
              onChange={(e) => setJSearch(e.target.value)}
              placeholder="Tìm nhanh: tên người, việc, file…"
              className="min-h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                aria-label="Lọc nhật ký theo ngày"
                value={jDate}
                disabled={jAllDays}
                onChange={(e) => setJDate(e.target.value)}
                className={`${smallSel} disabled:opacity-50`}
              />
              <label className="flex min-h-9 items-center gap-1 text-xs">
                <input type="checkbox" aria-label="Hiện nhật ký mọi ngày" checked={jAllDays} onChange={(e) => setJAllDays(e.target.checked)} className="h-4 w-4" />
                Mọi ngày
              </label>
              <select aria-label="Lọc nhật ký theo phòng" value={jRoom} onChange={(e) => setJRoom(e.target.value)} className={smallSel}>
                <option value="">Mọi phòng</option>
                {ROOMS.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <select aria-label="Lọc nhật ký theo người" value={jStaff} onChange={(e) => setJStaff(e.target.value)} className={smallSel}>
                <option value="">Mọi người</option>
                {STAFF.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select
                aria-label="Lọc nhật ký theo trạng thái"
                value={jStatus}
                onChange={(e) => setJStatus(e.target.value as "" | JournalStatus)}
                className={smallSel}
              >
                <option value="">Mọi trạng thái</option>
                <option value="done">ĐÃ XONG</option>
                <option value="running">Đang chạy</option>
                <option value="error">Lỗi / QC trượt</option>
                <option value="waiting">Chờ chốt</option>
                <option value="meeting">Họp</option>
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {journalQ.isPending ? (
              <p className="px-1 text-sm text-[var(--dim)]">Đang tải nhật ký…</p>
            ) : entries.length === 0 ? (
              <p className="px-1 text-sm text-[var(--dim)]">Chưa có dòng nhật ký nào khớp bộ lọc. Nới ngày / phòng / người / trạng thái để xem thêm.</p>
            ) : (
              <ol className="space-y-1">
                {entries.map((e) => {
                  const st = journalStatusOf(e);
                  const meta = JOURNAL_STATUS_META[st];
                  const member = e.staff_id ? staffById(e.staff_id) : memberByChatName(e.actor);
                  return (
                    <li key={e.key}>
                      <button
                        type="button"
                        onClick={() => openEntry(e)}
                        aria-label={`Nhật ký ${fmtClock(e.time)} — ${e.actor}: ${e.title}. Bấm để bay tới đúng người, phòng, việc`}
                        className="block w-full rounded-md border-l-4 px-2 py-1.5 text-left hover:bg-[var(--bg)]"
                        style={{ borderLeftColor: member.color }}
                      >
                        <span className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
                          <span className="font-mono tabular-nums text-[var(--dim)]">[{fmtClock(e.time)}]</span>
                          <span className="font-bold" style={{ color: member.color }}>{e.actor || "—"}</span>
                          <span className="font-bold" style={{ color: meta.color }}>{meta.label}</span>
                        </span>
                        <span className="mt-0.5 block text-[13px] font-medium leading-snug">{e.title}</span>
                        {e.detail ? <span className="block truncate text-xs text-[var(--dim)]">{e.detail}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {blockedTasks.map((t) => (
            <div key={t.id} className="mb-2 rounded-md border-2 border-red-400 bg-red-50 px-3 py-2.5" role="alert">
              <p className="text-sm font-bold text-red-800">Họp giải cứu — dự án #{t.id} "{t.title}" đã dừng</p>
              <p className="mt-0.5 text-xs text-red-800">{t.blocked_reason || "Khâu hiện tại trượt QC quá số lần cho phép."}</p>
              <p className="mt-1 text-xs text-red-800">
                TGĐ đã tự mở họp giải cứu và ghi biên bản bên dưới. Chủ tịch xử lý ngay tại đây:
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => openTaskAtStage(t, t.current_stage)}
                  className="min-h-9 rounded-md bg-red-600 px-3 text-xs font-bold text-white"
                >
                  Mở sửa tay
                </button>
                <button
                  type="button"
                  disabled={railBusy}
                  onClick={() => forceMut.mutate({ id: t.id, stageKey: t.current_stage })}
                  className="min-h-9 rounded-md border-2 border-red-600 px-3 text-xs font-bold text-red-700 disabled:opacity-50"
                >
                  Duyệt cưỡng bức
                </button>
                <button
                  type="button"
                  onClick={() => zoomToRoom("meeting")}
                  className="min-h-9 rounded-md border border-red-300 px-3 text-xs font-semibold text-red-800"
                >
                  Bay tới Phòng Họp Lớn
                </button>
              </div>
            </div>
          ))}
          {railNote ? <p className="mb-2 rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">{railNote}</p> : null}
          {railError ? <p className="mb-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800">{railError}</p> : null}
          <p className="text-xs text-[var(--dim)]">
            Biên bản họp thật của công ty — họp giải cứu do TGĐ tự triệu tập khi một khâu trượt QC đều nằm ở đây,
            kèm Quyết định / Việc cần làm / Rủi ro.
          </p>
          {meetingsQ.isPending ? (
            <p className="mt-2 text-sm text-[var(--dim)]">Đang tải biên bản…</p>
          ) : meetings.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--dim)]">Chưa có biên bản họp nào.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {meetings.slice(0, 10).map((m) => (
                <li key={m.id} className="rounded-md border border-[var(--border)] px-3 py-2">
                  <p className="text-sm font-bold leading-snug">{m.title}</p>
                  <p className="text-[11px] text-[var(--dim)]">
                    {ROOMS.find((r) => r.id === m.room)?.name ?? m.room} · {fmtClock(m.created_at)} · {new Date(m.created_at).toLocaleDateString("vi-VN")}
                  </p>
                  {m.decisions ? <p className="mt-1 line-clamp-3 text-xs"><span className="font-semibold">Quyết định:</span> {m.decisions}</p> : null}
                  {m.actions ? <p className="mt-0.5 line-clamp-3 text-xs"><span className="font-semibold">Việc cần làm:</span> {m.actions}</p> : null}
                  {m.risks ? <p className="mt-0.5 line-clamp-2 text-xs text-red-700"><span className="font-semibold">Rủi ro:</span> {m.risks}</p> : null}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => go("meetings")}
            className="mt-3 min-h-10 w-full rounded-md border border-[var(--accent)] px-3 text-sm font-semibold text-[var(--accent)]"
          >
            Mở Phòng họp & biên bản đầy đủ →
          </button>
        </div>
      )}
    </aside>
  );
}

/**
 * Thanh bước dây chuyền ở dưới khung 3D (theo ảnh mẫu): Bước 0 & 7 —
 * Ghế Đạo Diễn · Bước 1 · Cổng 1 · Bước 2–4 · Cổng 2 · Bước 5 · Cổng 3
 * · Bước 6 · Cổng 4. Chấm màu theo đúng trạng thái thật của từng khâu
 * (đỏ đang chạy, xanh đã xong, xám đang chờ); bấm một bước là mở đúng
 * khâu đó trong dự án để xem file thật / sửa tay / chạy tiếp từ đây.
 */
function StepBar({
  tasks,
  go,
  openTask,
  openTaskAtStage,
}: {
  tasks: Task[];
  go: (v: View) => void;
  openTask: (t: Task) => void;
  openTaskAtStage: (t: Task, stageKey: string) => void;
}) {
  const pipeTask = livePipeTask(tasks);
  const pipeQ = useQuery({
    queryKey: ["pipeline", pipeTask?.id ?? -1],
    queryFn: () => api.getPipeline({ task_id: pipeTask!.id }),
    enabled: !!pipeTask,
    refetchInterval: 20000,
  });
  const stages = pipeQ.data?.stages ?? [];
  const currentStageKey = pipeQ.data?.current_stage ?? "";
  type StepStatus = "done" | "running" | "error" | "waiting";
  const statusOf = (keys: string[]): StepStatus => {
    const ss = stages.filter((s) => keys.includes(s.stage_key));
    if (ss.some((s) => s.status === "BLOCKED")) return "error";
    if (ss.some((s) => s.status === "RUNNING")) return "running";
    if (ss.length > 0 && ss.every((s) => s.status === "DONE")) return "done";
    return "waiting";
  };
  const dotColor = (s: StepStatus): string =>
    s === "done" ? "#22c55e" : s === "running" ? "#ef4444" : s === "error" ? "#dc2626" : "#9ca3af";
  const directorStatus: StepStatus =
    pipeQ.data?.pipeline_state === "DONE" ? "done" :
    pipeQ.data?.pipeline_state === "BLOCKED" ? "error" :
    pipeQ.data?.pipeline_state === "RUNNING" ? "running" : "waiting";
  const steps: { key: string; label: string; sub: string; status: StepStatus; isCurrent: boolean; onClick: () => void }[] = [
    {
      key: "director",
      label: "Bước 0 & 7",
      sub: "Ghế Đạo Diễn — mở dự án & chốt Final",
      status: directorStatus,
      isCurrent: false,
      onClick: () => (pipeTask ? openTask(pipeTask) : go("board")),
    },
    {
      key: "g1",
      label: "Bước 1 · Cổng 1",
      sub: "Kịch bản & SRT — Phòng Nội dung",
      status: statusOf(["script"]),
      isCurrent: currentStageKey === "script",
      onClick: () => (pipeTask ? openTaskAtStage(pipeTask, "script") : go("board")),
    },
    {
      key: "g2",
      label: "Bước 2–4 · Cổng 2",
      sub: "Thu voice · Ảnh & phân cảnh · Dựng",
      status: statusOf(["voice", "visuals", "edit"]),
      isCurrent: ["voice", "visuals", "edit"].includes(currentStageKey),
      onClick: () =>
        pipeTask
          ? openTaskAtStage(pipeTask, ["voice", "visuals", "edit"].includes(currentStageKey) ? currentStageKey : "voice")
          : go("board"),
    },
    {
      key: "g3",
      label: "Bước 5 · Cổng 3",
      sub: "Chiếu thử & duyệt Final — Phòng Chiếu",
      status: statusOf(["screening"]),
      isCurrent: currentStageKey === "screening",
      onClick: () => (pipeTask ? openTaskAtStage(pipeTask, "screening") : go("board")),
    },
    {
      key: "g4",
      label: "Bước 6 · Cổng 4",
      sub: "Đăng tải & lưu kho sản phẩm",
      status: pipeQ.data?.pipeline_state === "DONE" ? "done" : "waiting",
      isCurrent: false,
      onClick: () => go("warehouse"),
    },
  ];
  return (
    <nav aria-label="Các bước dây chuyền sản xuất" className="mt-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {steps.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={s.onClick}
            aria-label={`${s.label}: ${s.sub}`}
            className={`rounded-[var(--radius)] border bg-[#17102e] px-3 py-2.5 text-left text-white ${
              s.isCurrent ? "border-amber-400 ring-2 ring-amber-400/70" : "border-white/15 hover:border-amber-300/60"
            }`}
          >
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[#c9bdf5]">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.status === "running" ? "animate-pulse" : ""}`} style={{ backgroundColor: dotColor(s.status) }} aria-hidden="true" />
              {s.label}
            </span>
            <span className="mt-0.5 block text-[13px] font-semibold leading-snug">{s.sub}</span>
            <span className="mt-0.5 block text-[11px] text-[#a79fd0]">
              {s.status === "done" ? "ĐÃ XONG" : s.status === "running" ? "Đang chạy" : s.status === "error" ? "Đang kẹt — cần xử lý" : pipeTask ? "Đang chờ" : "Chưa có dự án trên dây chuyền"}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Overview({
  tasks,
  go,
  openTask,
  openTaskAtStage,
  openStaff,
  openChat,
}: {
  tasks: Task[];
  go: (v: View) => void;
  openTask: (t: Task) => void;
  openTaskAtStage: (t: Task, stageKey: string) => void;
  openStaff: (s: StaffMember) => void;
  openChat: (s: StaffMember) => void;
}) {
  // Thanh chức năng + cột phải sống: Hiện/Ẩn tên điều khiển từ thanh
  // trên cùng (đồng bộ với nút trên canvas), cột phải mở sẵn với 2
  // tab Phòng họp / Nhật ký và đóng được bằng nút ×.
  const [showNames, setShowNames] = useState(true);
  const [railOpen, setRailOpen] = useState(true);
  const [railTab, setRailTab] = useState<"meetings" | "journal">("journal");
  const pipeTaskOverview = livePipeTask(tasks);
  const pipeOverviewQ = useQuery({
    queryKey: ["pipeline", pipeTaskOverview?.id ?? -1],
    queryFn: () => api.getPipeline({ task_id: pipeTaskOverview!.id }),
    enabled: !!pipeTaskOverview,
    refetchInterval: 20000,
  });
  const meetingAlertsOverview =
    tasks.filter((t) => t.pipeline_state === "BLOCKED").length +
    tasks.filter((t) => t.status === "REVIEW").length;
  const openRailMeetings = () => {
    setRailTab("meetings");
    setRailOpen(true);
    window.setTimeout(() => {
      document.getElementById("live-rail")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
  };
  const staffLamp = useMemo(() => {
    const map: Record<string, LampKind> = {};
    for (const s of STAFF) {
      if (s.roomId === "ceo") map[s.id] = tasks.some((t) => t.status === "REVIEW") ? "review" : "idle";
      else if (!ROOMS.find((r) => r.id === s.roomId)?.active) map[s.id] = "soon";
      else if (s.id === "dao-dien")
        map[s.id] = lampForTasks(tasks.filter((t) => t.room === "video"));
      else if (s.id === "qc")
        map[s.id] = tasks.some((t) => t.status === "REVIEW")
          ? "review"
          : tasks.some((t) => t.status === "REVISION_REQUIRED")
            ? "revision"
            : "idle";
      else map[s.id] = lampForTasks(tasks.filter((t) => t.assignee === s.id));
    }
    for (const room of OFFICE_ROOMS) {
      for (const p of room.staff) {
        if (!(p.id in map)) {
          map[p.id] = ROOMS.find((r) => r.id === room.id)?.active ? "idle" : "soon";
        }
      }
    }
    return map;
  }, [tasks]);

  const roomLamp = useMemo(() => {
    const map: Record<string, LampKind> = {};
    for (const r of ROOMS) {
      if (!r.active) map[r.id] = "soon";
      else if (r.id === "video") map[r.id] = lampForTasks(tasks);
      else if (r.id === "ceo") map[r.id] = tasks.some((t) => t.status === "REVIEW") ? "review" : "idle";
      // Đơn vị tầng quản trị (Kiểm toán, Chất lượng, R&D, Nền
      // tảng, Công nghệ) KHÔNG có phòng 3D trên mặt bằng đã khóa
      // và không nhận việc trên bảng việc: đèn luôn "chờ" — bản
      // cũ cho chúng mượn đèn của mọi việc nên chip nào cũng đỏ
      // "đang chạy" dù đơn vị không hề chạy việc gì.
      else if (!OFFICE_ROOMS.some((o) => o.id === r.id)) map[r.id] = "idle";
      else map[r.id] = tasks.length > 0 ? lampForTasks(tasks) : "idle";
    }
    map["meeting"] = tasks.some((t) => t.status === "REVIEW") ? "review" : "idle";
    return map;
  }, [tasks]);

  const [nowDate, setNowDate] = useState(() => new Date());
  const phaseInfo = useMemo(() => officePhaseOf(nowDate), [nowDate]);

  const presenceMap = useMemo(() => {
    const map: Record<string, Presence> = {};
    for (const s of STAFF) map[s.id] = presenceFor(s.id, tasks, phaseInfo);
    for (const room of OFFICE_ROOMS) {
      for (const p of room.staff) {
        if (!(p.id in map)) {
          map[p.id] = ROOMS.find((r) => r.id === room.id)?.active ? "idle" : "soon";
        }
      }
    }
    // KHỚP KHÂU ĐANG CHẠY (audit 2026-11-26): presenceFor chỉ nhìn
    // trạng thái VIỆC (task) — việc dây chuyền giữ IN_PROGRESS suốt
    // mọi khâu nên người của khâu đã xong vẫn hiện "đang làm", còn
    // người của khâu ĐANG CHẠY (vd Trưởng phòng Âm thanh ở khâu
    // Thu voice) lại hiện "thư giãn" vì việc không đứng tên mình.
    // Phủ sự thật từ chính dữ liệu dây chuyền: khâu RUNNING → đúng
    // người phụ trách khâu đó "working"; người phụ trách các khâu
    // khác của CÙNG dự án mà không còn việc thật nào khác → hạ về
    // "resting" (khâu của họ chưa tới lượt / đã xong). Chỉ áp trong
    // giờ làm việc, không phá họp sáng / nghỉ trưa / ngoài giờ.
    const pipe = pipeOverviewQ.data;
    const inWorkPhase =
      phaseInfo.phase === "morning" || phaseInfo.phase === "afternoon" || phaseInfo.phase === "wrap";
    if (pipe && pipeTaskOverview && inWorkPhase && !phaseInfo.meetingNow) {
      const runningStage = pipe.stages.find((s) => s.status === "RUNNING");
      const pipeBusy =
        pipe.pipeline_state === "RUNNING" || pipe.pipeline_state === "PAUSED" || pipe.pipeline_state === "SCREENING";
      if (pipeBusy) {
        const fixedRoles = new Set(["chu-tich", "van-thu", "thu-ky", "le-tan", "tro-ly", "dao-dien", "qc"]);
        for (const st of pipe.stages) {
          const who = st.assignee;
          if (!who || fixedRoles.has(who) || !(who in map)) continue;
          if (runningStage && st.stage_key === runningStage.stage_key) continue;
          // Khâu của người này không phải khâu đang chạy: chỉ hạ
          // khi họ không còn việc thật nào khác ngoài dự án này.
          const otherWork = tasks.some(
            (t) =>
              t.id !== pipeTaskOverview.id &&
              t.assignee === who &&
              (t.status === "IN_PROGRESS" || t.status === "REVISION_REQUIRED" || t.status === "ASSIGNED"),
          );
          if (!otherWork && map[who] === "working") map[who] = "resting";
        }
        if (runningStage && runningStage.assignee in map) {
          map[runningStage.assignee] = "working";
        }
      }
    }
    return map;
  }, [tasks, phaseInfo, pipeOverviewQ.data, pipeTaskOverview]);

  const [focusReq, setFocusReq] = useState<{ roomId: string; staffId?: string | null; nonce: number } | null>(null);
  const zoomToRoom = (roomId: string, staffId?: string | null) =>
    setFocusReq((prev) => ({ roomId, staffId: staffId ?? null, nonce: (prev?.nonce ?? 0) + 1 }));

  const videoTasks = tasks;
  const approved = videoTasks.filter((t) => t.status === "APPROVED").length;
  const progress = videoTasks.length > 0 ? Math.round((approved / videoTasks.length) * 100) : 0;

  const [hour, setHour] = useState(() => new Date().getHours());
  // Giờ thập phân cho hiệu ứng sáng tối 3D theo giờ thực: bình minh /
  // hoàng hôn chuyển mượt theo từng phút, không nhảy bậc theo giờ chẵn.
  const [hourFrac, setHourFrac] = useState(() => {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  });
  // Đoạn mô tả dài dưới canvas 3D: mặc định thu gọn 1 dòng,
  // bấm "Xem thêm" mới mở hết (Chủ tịch chốt).
  const [descOpen, setDescOpen] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setHour(d.getHours());
      setHourFrac(d.getHours() + d.getMinutes() / 60);
      setNowDate(d);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Đời sống công sở chạy nền: mỗi phút gọi một nhịp — nhân viên tự chào
  // nhau buổi sáng, họp sáng 5 phút có biên bản, 12:00 gọi nhau ăn trưa,
  // 17:30 Đạo diễn báo cáo cuối ngày, sinh nhật được chúc mừng, người rảnh
  // mới tán gẫu (có việc là tập trung làm). Tin mới hiện vào kênh công ty
  // nhờ invalidate dưới đây + vòng poll 3 giây của khung chat.
  const lifeQueryClient = useQueryClient();
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      try {
        const res = await api.runOfficeLife({
          date_key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
          hour: d.getHours(),
          minute: d.getMinutes(),
          weekday: d.getDay(),
        });
        if (!cancelled && res.posted.length > 0) {
          void lifeQueryClient.invalidateQueries({ queryKey: ["messages"] });
          void lifeQueryClient.invalidateQueries({ queryKey: ["meetings"] });
        }
      } catch {
        // Ambient office life must never break the office view.
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [lifeQueryClient]);
  const qcTask = tasks.find((t) => t.status === "REVIEW") ?? null;

  const meetingsQ = useQuery({ queryKey: ["meetings"], queryFn: () => api.listMeetings({}) });
  const latestMeeting = meetingsQ.data?.meetings[0] ?? null;
  const meetingBoard = latestMeeting
    ? { decisions: latestMeeting.decisions, actions: latestMeeting.actions }
    : null;

  // What each desk monitor shows: the task its owner is really holding.
  const staffScreenText = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of STAFF) {
      if (!ROOMS.find((r) => r.id === s.roomId)?.active) {
        map[s.id] = `${s.name}\nPhòng sắp mở`;
        continue;
      }
      if (s.id === "chu-tich") {
        map[s.id] = "Chủ tịch\nPhê duyệt & chỉ đạo toàn công ty";
        continue;
      }
      if (s.id === "van-thu") {
        map[s.id] = "Văn thư\nNgồi ở Phòng Văn thư riêng — quản hồ sơ trình ký";
        continue;
      }
      if (s.id === "thu-ky") {
        map[s.id] = "Thư ký Chủ tịch\nTrực — tiếp nhận hồ sơ trình ký";
        continue;
      }
      if (s.id === "le-tan") {
        map[s.id] = "Lễ tân — Ngọc Anh\nTrực sảnh — chào đón & hỗ trợ mọi người";
        continue;
      }
      if (s.id === "tong-giam-doc") {
        map[s.id] = "Tổng giám đốc\nĐiều hành toàn công ty";
        continue;
      }
      if (s.id === "dao-dien") {
        const open = tasks.filter((t) => t.status !== "APPROVED").length;
        map[s.id] = `Đạo diễn — điều phối\n${open} việc đang mở`;
        continue;
      }
      if (s.id === "qc") {
        const rt = tasks.find((t) => t.status === "REVIEW");
        map[s.id] = rt ? `QC — đang duyệt\n#${rt.id} ${rt.title}` : "QC\nChờ việc chờ duyệt";
        continue;
      }
      const mine = tasks.filter((t) => t.assignee === s.id);
      const doing = mine.find((t) => t.status === "IN_PROGRESS");
      const redo = mine.find((t) => t.status === "REVISION_REQUIRED");
      const rev = mine.find((t) => t.status === "REVIEW");
      const wait = mine.find((t) => t.status === "ASSIGNED");
      if (doing) map[s.id] = `${s.name} — Đang làm\n#${doing.id} ${doing.title}`;
      else if (redo) map[s.id] = `${s.name} — Làm lại\n#${redo.id} ${redo.title}`;
      else if (rev) map[s.id] = `${s.name} — Chờ QC\n#${rev.id} ${rev.title}`;
      else if (wait) map[s.id] = `${s.name} — Chờ nhận\n#${wait.id} ${wait.title}`;
      else map[s.id] = `${s.name}\nSẵn sàng nhận việc`;
    }
    for (const room of OFFICE_ROOMS) {
      for (const p of room.staff) {
        if (!map[p.id]) {
          map[p.id] = ROOMS.find((r) => r.id === room.id)?.active
            ? "Sẵn sàng nhận việc"
            : "Phòng sắp mở";
        }
      }
    }
    return map;
  }, [tasks]);

  const effectiveRoomLamp = useMemo(() => {
    if (phaseInfo.phase !== "off") return roomLamp;
    const map: Record<string, LampKind> = {};
    for (const r of ROOMS) map[r.id] = "soon";
    return map;
  }, [roomLamp, phaseInfo]);

  const effectiveStaffLamp = useMemo(() => {
    if (phaseInfo.phase !== "off") return staffLamp;
    const map: Record<string, LampKind> = {};
    for (const s of STAFF) map[s.id] = "idle";
    return map;
  }, [staffLamp, phaseInfo]);

  // Short status bubbles floating above heads in the 3D office.
  const staffBubbleMap = useMemo(() => {
    const map: Record<string, string> = {};
    const reviewTask = tasks.find((t) => t.status === "REVIEW");
    const lunchPhrases = [
      "Đang ăn trưa ở khu ăn uống — tán gẫu với đồng nghiệp",
      "Nghỉ trưa — uống trà ở khu vườn xanh",
      "Đang ăn trưa, chiều 13:00 làm tiếp",
      "Nghỉ trưa — đọc sách ở thư viện nhỏ",
    ];
    const restPhrases = [
      "Đang thư giãn ở khu vườn xanh — có việc là làm ngay",
      "Đang đọc sách ở thư viện nhỏ — có việc là làm ngay",
      "Đang chơi bi-a ở khu giải trí — có việc là làm ngay",
      "Đang pha cà phê ở khu ăn uống — có việc là làm ngay",
      "Đang tập nhẹ ở khu thể thao — có việc là làm ngay",
      "Đang uống trà, tán gẫu ở sảnh — có việc là làm ngay",
    ];
    STAFF.forEach((s, idx) => {
      const p = presenceMap[s.id] ?? "idle";
      if (phaseInfo.phase === "off" && s.id !== "chu-tich") {
        map[s.id] = "Ngoài giờ làm việc — văn phòng nghỉ";
        return;
      }
      if (s.id === "le-tan") {
        map[s.id] = "Lễ tân Ngọc Anh trực sảnh — xin chào, em giúp gì được ạ?";
        return;
      }
      if (phaseInfo.phase === "lunch" && p === "resting") {
        map[s.id] = lunchPhrases[idx % lunchPhrases.length] ?? lunchPhrases[0] ?? "";
        return;
      }
      if (phaseInfo.meetingNow && p === "meeting") {
        map[s.id] = "Đang họp sáng toàn công ty — 5 phút";
        return;
      }
      if (p === "soon") {
        map[s.id] = "Phòng sắp mở — đang chờ việc";
      } else if (p === "resting") {
        map[s.id] = restPhrases[(idx + hour) % restPhrases.length] ?? restPhrases[0] ?? "";
      } else if (p === "report-ceo") {
        map[s.id] = "Báo cáo Chủ tịch kết quả cuối";
      } else if (p === "meeting") {
        map[s.id] = reviewTask ? `Đang họp QC việc #${reviewTask.id}` : "Đang họp QC";
      } else if (p === "reporting") {
        const t = tasks.find((x) => x.assignee === s.id && x.status === "REVIEW");
        map[s.id] = t ? `Đã nộp #${t.id} — chờ QC duyệt` : "Đang nộp bài — chờ duyệt";
      } else if (s.id === "qc" && p === "checking") {
        map[s.id] = "Đang đi kiểm tra việc…";
      } else if (p === "a2a") {
        map[s.id] = "Đang đi nhận việc…";
      } else if (p === "working") {
        if (s.id === "dao-dien" && tasks.some((x) => x.status === "ASSIGNED")) {
          map[s.id] = "Đang giao việc…";
        } else {
          // Người của khâu ĐANG CHẠY trong dây chuyền: bong bóng
          // gọi đúng tên khâu + dự án (khớp presenceMap đã phủ
          // theo khâu) thay vì tra việc đứng tên — việc dây
          // chuyền không đứng tên từng khâu.
          const runStage = pipeOverviewQ.data?.stages.find((x) => x.status === "RUNNING");
          const redo = tasks.find((x) => x.assignee === s.id && x.status === "REVISION_REQUIRED");
          const t = tasks.find((x) => x.assignee === s.id && x.status === "IN_PROGRESS");
          if (runStage && runStage.assignee === s.id && pipeOverviewQ.data) {
            map[s.id] = `Đang chạy khâu "${runStage.name}" — dự án #${pipeOverviewQ.data.task_id}`;
          } else if (redo) map[s.id] = `Đang sửa lại #${redo.id} theo QC`;
          else if (t) map[s.id] = `Đang làm #${t.id}: ${t.title.slice(0, 30)}`;
          else if (s.id === "dao-dien") map[s.id] = "Đang điều phối phòng";
          else if (s.id === "qc") map[s.id] = "Đang trực QC";
        }
      } else if (p === "checking" && s.id === "dao-dien") {
        map[s.id] = "Đang đi kiểm tra việc…";
      }
    });
    return map;
  }, [tasks, presenceMap, phaseInfo, hour, pipeOverviewQ.data]);

  // Bong bóng ĐÃ XONG: CHỈ người vừa xong việc mới có — khâu dây
  // chuyền vừa Đạt QC trong 30 phút gần nhất (hoặc việc vừa được
  // duyệt Đạt) thì bong bóng của đúng người đó đổi thành dòng
  // "ĐÃ XONG · giờ — việc" nền xanh; mọi người khác giữ bong bóng
  // trạng thái thường, không ai bị gắn ĐÃ XONG thay người khác.
  const staffBubbleFinal = useMemo(() => {
    const map = { ...staffBubbleMap };
    const stages = pipeOverviewQ.data?.stages ?? [];
    const recentDone = stages
      .filter((s) => s.status === "DONE" && s.finished_at && Date.now() - new Date(s.finished_at).getTime() < 30 * 60 * 1000)
      .sort((a, b) => (a.finished_at! < b.finished_at! ? 1 : -1))[0];
    if (recentDone) {
      map[recentDone.assignee] = `ĐÃ XONG · ${fmtClock(recentDone.finished_at!)} — ${recentDone.name}`;
      return map;
    }
    const recentApproved = tasks.find(
      (t) => t.status === "APPROVED" && Date.now() - new Date(t.updated_at).getTime() < 30 * 60 * 1000,
    );
    if (recentApproved) {
      map[recentApproved.assignee] = `ĐÃ XONG · ${fmtClock(recentApproved.updated_at)} — #${recentApproved.id} ${recentApproved.title.slice(0, 26)}`;
    }
    return map;
  }, [staffBubbleMap, pipeOverviewQ.data, tasks]);

  // When QC / Đạo diễn go checking, they walk to the desk of whoever holds
  // the task currently in progress.
  const walkTargetMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    const doing = tasks.find((t) => t.status === "IN_PROGRESS");
    if (doing) {
      map["qc"] = doing.assignee;
      map["dao-dien"] = doing.assignee;
    }
    return map;
  }, [tasks]);

  // (staffInfoMap is built further below, after busyText is defined.)

  const busyText = (s: StaffMember): string => {
    if (!ROOMS.find((r) => r.id === s.roomId)?.active) return "Sắp mở — chờ brief đầu tiên của phòng";
    if (s.id === "dao-dien") {
      const n = videoTasks.filter((t) => t.status !== "APPROVED").length;
      return n > 0 ? `Đang điều phối ${n} việc chưa chốt` : "Rảnh — sẵn sàng nhận brief mới";
    }
    if (s.id === "qc") {
      const n = videoTasks.filter((t) => t.status === "REVIEW").length;
      if (n > 0) return `Đang có ${n} việc chờ QC duyệt`;
      const doing = videoTasks.find((t) => t.status === "IN_PROGRESS");
      if (doing)
        return `Đang đi kiểm tra việc #${doing.id} đang làm của ${staffById(doing.assignee).name}`;
      return "Rảnh — chưa có việc chờ duyệt";
    }
    if (s.id === "chu-tich") return "Ngồi một mình trong phòng riêng phía sau — rộng bằng đúng hành lang chính giữa, trên bệ nâng thấp, lên bằng 2 cầu thang thẳng đảo ngược (chân thang tại vách trước phòng, thang leo vào trong dọc hành lang vách ngăn) vào cửa chính duy nhất ở giữa — phê duyệt cuối toàn công ty";
    if (s.id === "van-thu") return "Ngồi ở Phòng Văn thư riêng (sườn trái khu điều hành) — quản hồ sơ, giấy tờ trình ký cho Chủ tịch";
    if (s.id === "thu-ky") return "Ngồi phòng riêng ở sườn phải khu điều hành — ai lên gặp Chủ tịch đều qua đây trước";
    if (s.id === "tro-ly") return "Ngồi trong Phòng Tổng giám đốc — bàn thấp hơn, lệch sang phải, đối diện bàn họp dài — chạy việc cho Tổng giám đốc";
    if (s.id === "le-tan") return "Luôn trực tại bàn Lễ tân mở ở giữa sảnh — mặc đồng phục, đeo thẻ nhân viên, chào đón mọi người và trả lời chat, không rời bàn trong giờ làm việc";
    if (s.id === "tong-giam-doc") return "Chỉ chốt brief và duyệt kết quả cuối";
    // Cùng một sự thật theo KHÂU như presenceMap (audit 2026-11-26):
    // người phụ trách một khâu của dự án dây chuyền đang sống thì
    // dòng mô tả gọi đúng khâu đó — bản cũ chỉ tra việc đứng tên
    // nên Trưởng phòng Âm thanh hiện "Rảnh — sẵn sàng nhận cảnh
    // mới" ngay dưới pill "Đang làm tại bàn" trong lúc khâu Thu
    // voice của anh ta đang chạy.
    const pipe = pipeOverviewQ.data;
    if (pipe && pipeTaskOverview && pipe.pipeline_state !== "DONE" && pipe.pipeline_state !== "NONE") {
      const myStage = pipe.stages.find((st) => st.assignee === s.id);
      if (myStage) {
        if (myStage.status === "RUNNING")
          return `Đang chạy khâu "${myStage.name}" — dự án #${pipe.task_id}`;
        if (myStage.status === "BLOCKED")
          return `Khâu "${myStage.name}" đang kẹt — dự án #${pipe.task_id}, chờ Chủ tịch xử lý`;
        if (myStage.status === "DONE")
          return `Đã xong khâu "${myStage.name}" — dự án #${pipe.task_id}, chờ các khâu sau`;
        return `Chờ tới lượt khâu "${myStage.name}" — dự án #${pipe.task_id}`;
      }
    }
    const mine = videoTasks.filter((t) => t.assignee === s.id);
    const doing = mine.find((t) => t.status === "IN_PROGRESS");
    if (doing) return `Đang bận — việc #${doing.id} "${doing.title}"`;
    const waiting = mine.find((t) => t.status === "ASSIGNED");
    if (waiting) return `Có việc chờ nhận — #${waiting.id} "${waiting.title}"`;
    const redo = mine.find((t) => t.status === "REVISION_REQUIRED");
    if (redo) return `Cần làm lại — việc #${redo.id} "${redo.title}"`;
    return "Rảnh — sẵn sàng nhận cảnh mới";
  };

  // Hover card data for every avatar in the 3D office.
  const staffInfoMap = useMemo(() => {
    const map: Record<string, { name: string; role: string; task: string }> = {};
    for (const s of STAFF)
      map[s.id] = { name: s.name, role: `${s.role} · ${s.gender}`, task: busyText(s) };
    for (const room of OFFICE_ROOMS) {
      for (const p of room.staff) {
        if (!map[p.id]) {
          const active = ROOMS.find((r) => r.id === room.id)?.active;
          map[p.id] = {
            name: p.name ?? `Nhân viên ${p.initials}`,
            role: active
              ? `Nhân viên phòng ban · ${p.gender ?? ""}`
              : `Nhân viên — phòng sắp mở · ${p.gender ?? ""}`,
            task: active ? "Chưa giữ việc nào" : "Phòng chưa mở — đang chờ việc, chưa có việc thật",
          };
        }
      }
    }
    return map;
    // busyText is derived from tasks/videoTasks and the live
    // pipeline's stage truth; recompute when either changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, pipeOverviewQ.data, pipeTaskOverview]);

  return (
    <div className="space-y-5">
      <FunctionBar
        tasks={tasks}
        go={go}
        openTask={openTask}
        showNames={showNames}
        onToggleNames={() => setShowNames((v) => !v)}
        meetingAlerts={meetingAlertsOverview}
        onOpenMeetings={openRailMeetings}
      />
      <section aria-label="Văn phòng 3D">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
          <span className="font-semibold text-[var(--text)]">Lịch công ty:</span>
          <span className="text-[var(--dim)]">07:30 vào làm · 08:00 họp sáng 5 phút · 12:00–13:00 nghỉ ăn trưa · 17:30 báo cáo cuối ngày · 18:30 tan làm · Thứ 7 & Chủ nhật nghỉ</span>
          <span className="ml-auto inline-flex items-center gap-1.5 font-medium text-[var(--accent)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Bây giờ: {phaseInfo.label}
          </span>
        </div>
        <nav aria-label="Chọn phòng ban để bay tới" className="mb-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <p className="mb-1.5 text-xs font-semibold text-[var(--text)]">
            Tổng giám sát — bấm Toàn cảnh để về góc giám sát toàn công ty; bấm tên phòng là camera bay vào trong phòng, ngồi gần bàn làm việc:
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => zoomToRoom("")}
              aria-label="Quay về góc tổng giám sát toàn công ty"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white"
            >
              Toàn cảnh
            </button>
            {ROOMS.map((room) =>
              OFFICE_ROOMS.some((o) => o.id === room.id) ? (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => zoomToRoom(room.id)}
                  aria-label={`Bay camera tới ${room.name}`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <span
                    className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ backgroundColor: roomDotColor(effectiveRoomLamp[room.id] ?? "idle") }}
                    aria-hidden="true"
                  />
                  {room.name}
                </button>
              ) : (
                // Phòng tầng quản trị không có phòng 3D trên mặt
                // bằng đã khóa: bản cũ vẫn vẽ chip "Bay camera tới"
                // nhưng bấm vào không bay đi đâu cả (Office3D
                // không có phòng đó để đáp). Nay chip mở thẳng Sơ
                // đồ tổ chức — đúng nơi đơn vị này sống — và viền
                // đứt nét như chip khu tiện ích để phân biệt.
                <button
                  key={room.id}
                  type="button"
                  onClick={() => go("org")}
                  aria-label={`Xem ${room.name} trong sơ đồ tổ chức (đơn vị tầng quản trị, không có phòng 3D)`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <span
                    className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ backgroundColor: roomDotColor(effectiveRoomLamp[room.id] ?? "idle") }}
                    aria-hidden="true"
                  />
                  {room.name}
                </button>
              ),
            )}
            {[
              { id: "zone-garden", name: "Khu vườn xanh" },
              { id: "zone-fun", name: "Khu giải trí" },
              { id: "zone-library", name: "Thư viện nhỏ" },
              { id: "zone-dining", name: "Khu ăn uống" },
              { id: "zone-sport", name: "Khu thể thao nhẹ" },
            ].map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => zoomToRoom(zone.id)}
                aria-label={`Bay camera tới ${zone.name}`}
                className="min-h-8 rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {zone.name}
              </button>
            ))}
          </div>
        </nav>
        <StatusLine pipeTask={pipeTaskOverview} pipeData={pipeOverviewQ.data} />
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">
        <Office3D
          rooms={OFFICE_ROOMS}
          staffLamp={effectiveStaffLamp}
          roomLamp={effectiveRoomLamp}
          presence={presenceMap}
          focusRequest={focusReq}
          hour={hourFrac}
          qcTitle={qcTask ? `#${qcTask.id} ${qcTask.title}` : null}
          onSelectRoom={(roomId) => {
            if (roomId === "meeting") go("meetings");
            else if (roomId === "chairman" || roomId === "ceo" || roomId === "director") go("direct");
            else go("board");
          }}
          onSelectStaff={(id) => {
            const known = STAFF.find((s) => s.id === id);
            if (known) {
              openStaff(known);
              // Bấm nhân viên trong 3D: camera bay vào phòng, ngồi gần bàn của đúng người đó.
              zoomToRoom(known.roomId, id);
              return;
            }
            const room = OFFICE_ROOMS.find((r) => r.staff.some((p) => p.id === id));
            const person = room?.staff.find((p) => p.id === id);
            if (room) zoomToRoom(room.id, id);
            openStaff({
              id,
              name: person?.name ?? id,
              role: "Nhân viên — phòng sắp mở",
              roomId: room?.id ?? "video",
              color: "#8b87a0",
              threeColor: 0x8b87a0,
              gender: person?.gender ?? "Nam",
            });
          }}
          staffScreen={staffScreenText}
          staffBubble={staffBubbleFinal}
          staffInfo={staffInfoMap}
          walkTarget={walkTargetMap}
          meetingBoard={meetingBoard}
          showNames={showNames}
          onToggleNames={() => setShowNames((v) => !v)}
        />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--dim)]">
          {(Object.keys(LAMP_LABELS) as LampKind[]).filter((k) => k !== "soon").map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <LampDot kind={k} size={8} /> {LAMP_LABELS[k]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#ef4444]" /> Nhãn phòng: đỏ đang chạy
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#22c55e]" /> xanh đã xong
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#9ca3af]" /> xám đang chờ
          </span>
        </div>
          </div>
          {railOpen ? (
            <LiveRail
              tasks={tasks}
              tab={railTab}
              onTabChange={setRailTab}
              onClose={() => setRailOpen(false)}
              go={go}
              openStaff={openStaff}
              openTask={openTask}
              openTaskAtStage={openTaskAtStage}
              zoomToRoom={zoomToRoom}
            />
          ) : (
            <button
              type="button"
              onClick={() => setRailOpen(true)}
              aria-label="Mở cột phải: phòng họp và nhật ký"
              className="min-h-11 shrink-0 rounded-[var(--radius)] border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] xl:self-start"
            >
              Mở cột Nhật ký & Phòng họp
            </button>
          )}
        </div>
        <StepBar tasks={tasks} go={go} openTask={openTask} openTaskAtStage={openTaskAtStage} />
        <div className="mt-1 text-xs text-[var(--dim)]">
          <p className={descOpen ? undefined : "line-clamp-1"}>
          Nhân viên đi lại theo đúng việc thật trên bảng việc: có việc Chờ nhận thì đi tới bàn Đạo diễn nhận việc rồi về bàn gõ phím; nộp Chờ duyệt thì mang tài liệu tới bàn QC báo cáo và dừng tay chờ; bị trả Làm lại thì quay về bàn sửa; Đạt hết và qua cổng cuối thì Đạo diễn đi dọc lối thảm trong khe bên phòng mình, rồi đi dọc hành lang bên dưới trước Phòng Chủ tịch (đã chừa trống hoàn toàn, không còn cầu thang nào chắn) tới chân cầu thang ngay tại vách trước Phòng Chủ tịch, leo cầu thang thẳng đảo ngược ngược vào trong phòng dọc hành lang vách ngăn, đi dọc hành lang vào giữa rồi qua cửa chính duy nhất của Phòng Chủ tịch (phòng trên bệ nâng thấp 1.35 đã hạ cốt nền, đúng 2 cầu thang thẳng đảo ngược — chân thang đặt ngay tại vách trước phòng chỗ đỉnh thang cũ, đầu thang chạm sàn hành lang trong phòng — vách ngăn và hành lang đã LÙI SÂU vào trong phòng thêm đúng bằng chỗ hành lang đã chốt 2,3, vách ngăn nay cách vách trước 4,6 (không còn ở chỗ cũ) — phòng chỉ có 1 cửa chính duy nhất ở giữa vách ngăn trong phòng) báo cáo. Không còn đường vòng bắt buộc: mỗi người tự chọn đường ngắn và tự nhiên nhất qua sảnh và lối đi chung cân đối hai bên — toàn bộ lối đi chung đều TRẢI THẢM liền một mạng, không hành lang nào thiếu thảm (sảnh / hành lang chính giữa chạy thẳng từ cửa chính sau 3 bậc ngắn tới khu điều hành, 2 lối thảm dọc giữa hai dãy phòng mỗi bên, các đoạn thảm nối ngang, dải thảm phía sau trước Phòng Chủ tịch, các góc nối cuối dải thảm và dải mỏng sau hàng phòng sau đều đã lấp thảm, hành lang trong Phòng Chủ tịch trải thảm kín từ vách ngăn tới tận mép cắt), các phòng mở cửa thẳng ra thảm và đi thông được với nhau qua thảm và sảnh chung, không phòng nào bị kẹt, không lối nào bị chắn, cửa tự mở khi có người tới và đóng lại khi không có ai — không đi xuyên vách kính hay bàn ghế. Mỗi người một nhịp riêng: người đi nhanh, người thong thả, có người dừng lại trò chuyện giữa đường, có người ghé khu bàn trà, giờ xuất phát so le nhau chứ không đi thành một loạt rồi quay về đồng loạt. Chưa có việc thật thì nhân viên thư giãn tự nhiên trong văn phòng: ngồi khu bàn trà, ra sofa, pha cà phê, trò chuyện — không giả vờ bận, có việc giao là vào bàn làm ngay. HAI BÊN SƯỜN ĐẤT TRỐNG cạnh Phòng Chủ tịch nay là 5 KHU TIỆN ÍCH CÔNG SỞ: bên trái là Khu vườn xanh (hồ cá nhỏ, ghế đá, cây cảnh), Khu giải trí (bàn bi-a, bàn bóng bàn, ghế thư giãn) và Khu đọc sách / thư viện nhỏ (kệ sách, ghế đọc, đèn ấm); bên phải là Khu ăn uống (quầy cà phê, bàn ăn, tủ lạnh, lò vi sóng) và Khu thể thao nhẹ (máy chạy bộ, xe đạp tập, thảm yoga). Mọi khu đều có THẢM nối THẲNG từ hành lang bên dưới trước Phòng Chủ tịch và từ sảnh chính vào tận nơi — đường đi thẳng, ngắn nhất, không phòng ban nào phải đi vòng, mọi phòng đều thông ra hành lang chính và tới được mọi khu. Lễ tân Ngọc Anh LUÔN ngồi trực tại bàn Lễ tân mở ở giữa sảnh trong giờ làm việc — mặc đồng phục, đeo thẻ nhân viên, vẫy tay chào khi có người tới gần, trả lời chat — bàn Lễ tân không bao giờ trống người.
          Bố cục đúng ảnh mẫu: dưới cùng ở giữa là Cửa chính công ty với thảm đỏ; lối đi chung mở ở giữa chạy từ cuối trục tới cửa chính, dẫn tới Sảnh trung tâm có bonsai lớn, bể cá Koi và khu bàn trà — toàn bộ tầng 1 là một mặt sàn mở chung và toàn bộ lối đi chung đều TRẢI THẢM liền một mạng ngay ngắn, cân đối hai bên: sảnh / hành lang chính giữa trải thảm chạy THẲNG một mạch từ cửa chính (sau 3 bậc ngắn) tới tận khu điều hành, hai lối thảm dọc giữa hai dãy phòng mỗi bên, các đoạn thảm nối ngang và dải thảm phía sau trước Phòng Chủ tịch; các phòng mở cửa thẳng ra thảm và đi thông được với nhau qua thảm và sảnh chung, không phòng nào bị kẹt, không lối nào bị chắn. Hai bên trục, mỗi bên 2 dãy dọc phòng ban đã mở đầy đủ nhân sự — trái: Tài chính – Kế toán, Nội dung, Phòng Chiếu, Video, Âm thanh, Phòng Họp Lớn; phải: Pháp chế, Marketing, Đăng tải & SEO, Kinh doanh, Kho Sản phẩm, Phòng In ấn — và khoảng mở dọc giữa 2 dãy mỗi bên cũng rộng rãi (từ khe 0,5 trước đây lên 3,0) và được TRẢI THẢM thành lối đi dọc, đi lại thoải mái không còn chỗ nào chật hẹp giữa các phòng; cửa các phòng đều mở thẳng ra thảm và sảnh chung. Các lô phòng và đường đi PHÂN LÔ CÂN ĐỐI HAI BÊN trục giữa: phòng ban xếp đều hai phía, lối đi chung rộng đều nhau, nhân vật đi đường nào cũng thông — không bị kẹt, không lệch một bên. Tầng 1 nằm trên MỘT MẶT SÀN PHẲNG: Phòng Tổng giám đốc ở tầng 1, vào sâu bên trong — nằm ngay phía trước Phòng Chủ tịch, mặt trước là vách kính trong suốt nhìn ra khoảng trống thông thoáng phía trước phòng; Phòng Chủ tịch ở chính giữa phía sau, MỞ RỘNG RỘNG BẰNG ĐÚNG HÀNH LANG CHÍNH GIỮA: rộng 16.0 bằng đúng chiều rộng sảnh / hành lang chính giữa (không rộng hơn, không hẹp hơn, không thụt vào, không để khoảng trống hai bên phòng) × sâu 13.1, rộng to hơn hẳn Phòng Tổng giám đốc, và CỐT NỀN ĐÃ HẠ XUỐNG THẤP: phòng đặt trên BỆ NÂNG THẤP 1.35 (hạ hẳn từ bệ cao 2.82 cũ, không nằm ngang mặt đất): KHÔNG CÒN BAN CÔNG, KHÔNG còn sảnh ngoài trước phòng nữa — vào phòng bằng ĐÚNG 2 CẦU THANG THẲNG ĐẢO NGƯỢC: chân mỗi cầu thang đặt ngay tại vách trước phòng — chính chỗ đỉnh thang của bản trước nay thành chân thang, chân thang đặt từ đó, tại một lối mở ở phía đó (trái tại x=-6.55, phải tại x=+6.55) — mỗi cầu thang đi thẳng một mạch NGƯỢC VÀO TRONG PHÒNG, leo lên dọc hành lang vách ngăn, đầu thang chạm sàn hành lang trong phòng — VÁCH NGĂN VÀ HÀNH LANG ĐÃ LÙI SÂU VÀO TRONG PHÒNG THÊM ĐÚNG BẰNG CHỖ HÀNH LANG ĐÃ CHỐT 2,3: vách ngăn lùi từ cách vách trước 2,3 về cách vách trước 4,6, hành lang chạy sâu 4,6 từ vách trước tới vách ngăn, nhìn thấy rõ đã lùi, không còn ở chỗ cũ; KHÔNG còn cầu thang nào đứng trong 2 cái khe hai bên Phòng Tổng giám đốc, và HÀNH LANG BÊN DƯỚI trước phòng (dải thảm sau hàng điều hành) được CHỪA TRỐNG HOÀN TOÀN cho PHÒNG BÊN TRONG (Chiến lược, Nhân sự) có đường đi thông suốt ngang qua; mép hành lang trong phòng đã CẮT BẰNG ĐÚNG ĐỈNH CẦU THANG (không thừa ra, không thụt vào, thẳng hàng với cả 2 đầu thang — 2 vách đá hẹp thừa hai bên rãnh thang đã bỏ hẳn) và ngay trên mép cắt là LAN CAN THẤP THOÁNG NHƯ TAY VỊN CẦU THANG (một tay vịn tròn đồng + chấn song mảnh thưa, cao 0,80 trên sàn hành lang — KHÔNG lan can cao, KHÔNG kính, KHÔNG tấm kín, KHÔNG tường chắn, nhìn thông suốt dọc hành lang); khoảng trống vừa cắt ngay phía trước hành lang là HỒ CÁ COI PHONG THỦY: hòn non bộ ở giữa hồ, thác nước chảy vào trong về phía cửa chính (tụ tài), cá coi bơi quanh hòn non bộ, nước trong, cây xanh, đá đẹp — hồ không chắn lối đi hành lang, không chắn cửa chính duy nhất; lên thang là vào HÀNH LANG do VÁCH NGĂN trong phòng tạo thành dọc theo mặt trước, đi dọc hành lang vào giữa rồi mới qua ĐÚNG 1 CỬA CHÍNH DUY NHẤT ở giữa vách ngăn vào phòng — phòng không có cửa nào khác; KHÔNG cong, KHÔNG chữ L, KHÔNG đặt đằng trước, KHÔNG phải cầu thang sườn Phòng Chủ tịch, hai vách sườn phòng đoạn trước — đứng sát bên 2 cầu thang và bịt 2 đầu hành lang — ĐÃ BỎ HẲN, thay bằng LAN CAN ĐỒNG THẤP THOÁNG ĐỒNG BỘ với lan can hành lang (cùng chất liệu đồng, cùng chiều cao 0,80, tay vịn tròn + chấn song mảnh thưa như tay vịn cầu thang) chạy dọc 2 đầu hành lang — bên cầu thang không còn vách to nào, cầu thang thoáng cả hai phía; vách sườn kính chỉ còn ở đoạn phòng chính phía sau vách ngăn, kín suốt không cửa; hai cầu thang nằm SAU 3 BẬC NGẮN TRƯỚC CỬA CHÍNH theo trục đi vào — qua cửa chính, lên 3 bậc ngắn, qua sảnh, đi dọc hành lang bên dưới rồi mới tới chân cầu thang ngay tại vách trước phòng, cầu thang không đặt trước 3 bậc, không chắn 3 bậc; qua lan can thấp mặt trước phòng nhìn ra được Phòng Tổng giám đốc ngay phía trước, Phòng Chiến lược bên trái, Phòng Nhân sự bên phải, 4 dãy phòng ban, sảnh lễ tân, bonsai, bể Koi, bàn trà và cửa chính, bao quát toàn bộ công ty. Chiến lược bên trái, Nhân sự bên phải được đẩy lên sát hết phía sau ở hàng cuối tầng 1, cùng hàng với Phòng Tổng giám đốc, mặt sau chạm tường cuối đất, không chừa khoảng trống phía sau, không nằm lửng ở giữa. Khoảng trống ngay phía trước Phòng Tổng giám đốc để TRỐNG hoàn toàn, thông thoáng, không đặt bàn ghế gì chắn lối đi chung; bàn tiếp khách/họp dài của Tổng giám đốc đặt DỌC bên trong phòng TGĐ để tiếp khách, kèm bảng trắng và màn hình họp gắn trong phòng ở đầu bàn; mặt tiền phía trước khu điều hành để THOÁNG — chỉ còn bàn Lễ tân mở ở giữa sảnh (chỉ bàn trực, không có phòng), nhìn thẳng từ cửa chính thấy sảnh, bonsai, bể Koi và khu điều hành; Trợ lý Tổng giám đốc ngồi ngay trong Phòng Tổng giám đốc — bàn đặt thấp hơn, lệch sang bên phải, quay mặt đối diện bàn họp dài, không ngang hàng với bàn Tổng giám đốc; Phòng Văn thư riêng đặt đúng chỗ Phòng Trợ lý cũ ở sườn trái khu điều hành và Phòng Thư ký Chủ tịch ở sườn phải — phòng riêng hẳn hoi, rộng rãi, đủ bàn làm việc, ghế, tủ hồ sơ, cây và lối đi thoải mái, cửa mở ra lối đi chung; bàn Văn thư trong phòng riêng cũng quay mặt về phía bàn họp dài trong Phòng Tổng giám đốc, không quay lưng, không quay ngang; rồi mới tới Sảnh trung tâm với bonsai, bể Koi và khu bàn trà. Phòng Chủ tịch ở chính giữa phía sau rộng 16.0 × 13.1 (rộng bằng đúng hành lang chính giữa), trên bệ nâng thấp 1.35, rộng to nhất toàn văn phòng rõ rệt, một mình một phòng và CHỈ MỘT MÌNH Chủ tịch trong phòng — không thêm nhân viên, không bàn văn thư, không bàn làm việc phụ: phía sau là chỗ bàn Chủ tịch quay mặt ra mặt trước, hai bên là khu tiếp khách và kệ tủ dọc tường. Nội thất trong phòng kín và đầy đủ như ảnh mẫu: bàn chính chữ L, tủ hồ sơ dọc tường sau, giá sách, bộ sofa tiếp khách với bàn tròn, cây lớn ở các góc, đèn chùm trên bàn chính và đèn tường ấm, tranh phong cảnh lớn, thảm đỏ lớn dưới khu bàn. Hai bên sườn Phòng Chủ tịch là đất trống thoáng cùng cốt nền tầng 1, lối đi vòng ra sau thông thoáng, không cầu thang sườn, không khoang thang nào chắn lối hay che Phòng Chiến lược / Nhân sự — ra vào phòng chỉ bằng cửa chính duy nhất ở giữa vách ngăn trong phòng, tới cửa đó bằng hành lang vách ngăn và 2 cầu thang thẳng đảo ngược (chân thang tại vách trước phòng, thang leo vào trong dọc hành lang), không qua ban công hay sảnh ngoài nào. Toàn bộ công ty có tường bao kính khép kín xung quanh, chỉ chừa Cửa chính ở mặt trước. Cốt nền văn phòng đã HẠ XUỐNG 3 BẬC: mặt sàn tầng 1 cao hơn nền đất ngoài đúng 3 bậc (3 × 0.15), và ngay trước Cửa chính có đúng 3 BẬC NGẮN bước lên vào văn phòng — mỗi bậc cao 0.15, mặt bậc sâu 0.34, bậc ngắn vừa bước, không cao, bề ngang đúng khẩu độ cửa chính nên không chắn lối đi. Camera không có nút chuyển chế độ và phân biệt bấm với giữ kéo bằng ngưỡng lệch nhỏ: bấm / chạm rồi thả nhanh là camera DI CHUYỂN TỚI đúng chỗ vừa bấm — bấm phòng thì tới phòng, bấm sàn thì tâm nhìn dời tới đúng điểm đó, bấm nhân vật thì bay gần đúng người đó và mở thẻ hồ sơ của họ; giữ chuột trái hoặc giữ 1 ngón rồi kéo là XOAY quanh điểm đang xem (không cần 2 ngón); kéo chuột phải hoặc giữ phím cách rồi kéo là di chuyển mịn; lăn chuột hoặc chụm 2 ngón là zoom vào điểm đang chỉ; nhấp đúp vào phòng để bay vào ngồi gần bàn; bấm nút Toàn cảnh để bay ra góc tổng giám sát. Trên thẻ nhân viên có nút Trò chuyện, bấm nút Trò chuyện đó mới mở cuộc trò chuyện riêng với người đó để chat ngay, không cần tìm tên trong danh sách, không cần gõ @ (bấm vào nhân viên không tự mở chat).
          </p>
          <button
            type="button"
            onClick={() => setDescOpen((v) => !v)}
            aria-expanded={descOpen}
            className="mt-1 font-semibold text-[var(--accent)]"
          >
            {descOpen ? "Thu gọn" : "Xem thêm"}
          </button>
        </div>
      </section>

      <section aria-label="Tình hình Phòng Video" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {BOARD_COLUMNS.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => go("board")}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-xs text-[var(--dim)]">
              <LampDot kind={STATUS_META[st].lamp} size={8} />
              {STATUS_META[st].label}
            </span>
            <span className="font-display mt-1 block text-2xl font-bold">
              {tasks.filter((t) => t.status === st).length}
            </span>
          </button>
        ))}
      </section>

      <section aria-label="Tiến độ Phòng Video" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Tiến độ Phòng Video — trưởng phòng: Đạo diễn</span>
          <span className="text-[var(--dim)]">
            {approved}/{videoTasks.length} việc Đạt · {progress}%
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--bg)]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
        </div>
      </section>

      {tasks.length === 0 ? (
        <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-5">
          <h2 className="font-display text-lg font-bold">Công ty đã sẵn sàng, chưa có việc nào</h2>
          <p className="mt-1 text-sm text-[var(--dim)]">
            Tổng giám đốc giao việc đầu tiên cho Đạo diễn: ghi brief, khóa nhân vật và ảnh tham chiếu,
            tỉ lệ khung hình, thời lượng từng cảnh. Đạo diễn chia cảnh xuống Video 01–03, nhân viên xác nhận
            nhận việc, nộp khung đầu cho QC duyệt trước khi dựng full clip.
          </p>
          <button
            type="button"
            onClick={() => go("assign")}
            className="mt-3 min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 font-medium text-white"
          >
            + Giao việc đầu tiên
          </button>
        </section>
      ) : null}

      <section aria-label="Sơ đồ tổ chức và nhân sự">
        <h2 className="font-display mb-2 text-lg font-bold">Sơ đồ công ty</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ROOMS.map((room) => {
            const members = STAFF.filter((s) => s.roomId === room.id);
            return (
              <div key={room.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-bold">{room.name}</h3>
                  <span className="inline-flex items-center gap-1.5 text-xs text-[var(--dim)]">
                    <LampDot kind={roomLamp[room.id] ?? "idle"} size={8} />
                    {room.active ? LAMP_LABELS[roomLamp[room.id] ?? "idle"] : "Sắp mở"}
                  </span>
                </div>
                {OFFICE_ROOMS.some((r) => r.id === room.id) ? (
                  <button
                    type="button"
                    onClick={() => zoomToRoom(room.id)}
                    aria-label={`Phóng to văn phòng 3D vào ${room.name}`}
                    className="mt-1 min-h-8 text-xs font-semibold text-[var(--accent)]"
                  >
                    Zoom 3D vào phòng này →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => go("org")}
                    aria-label={`Xem vị trí của ${room.name} trong sơ đồ tổ chức`}
                    className="mt-1 min-h-8 text-xs font-semibold text-[var(--accent)]"
                  >
                    Đơn vị tầng quản trị — xem trong Sơ đồ tổ chức →
                  </button>
                )}
                <ul className="mt-2 space-y-2.5">
                  {members.map((s) => (
                    <li key={s.id} className="flex items-start gap-2.5">
                      <Avatar member={s} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium leading-tight">
                          {s.name} · {s.gender} <LampDot kind={staffLamp[s.id] ?? "idle"} size={7} />
                          <PresencePill presence={presenceMap[s.id] ?? presenceFor(s.id, tasks)} />
                        </p>
                        <p className="text-xs text-[var(--dim)]">{s.role}</p>
                        <p className="text-xs text-[var(--dim)]">{busyText(s)}</p>
                        <span className="mt-0.5 flex flex-wrap gap-x-3">
                          {s.id !== "chu-tich" ? (
                            <button
                              type="button"
                              onClick={() => openChat(s)}
                              aria-label={`Trò chuyện với ${s.name}`}
                              className="min-h-8 text-xs font-semibold text-[var(--accent)]"
                            >
                              Trò chuyện →
                            </button>
                          ) : null}
                          {room.active ? (
                            <button
                              type="button"
                              onClick={() => openStaff(s)}
                              aria-label={`Xem tiến độ và can thiệp việc của ${s.name}`}
                              className="min-h-8 text-xs font-semibold text-[var(--accent)]"
                            >
                              Xem tiến độ & can thiệp →
                            </button>
                          ) : null}
                        </span>
                      </div>
                    </li>
                  ))}
                  {!room.active ? (
                    <li className="text-xs text-[var(--dim)]">
                      Phòng đủ đội hình 3 bàn (1 trưởng phòng + 2 nhân viên, có nam có nữ) — cả đội đang hiện diện ở trạng thái chờ việc, phòng ghi rõ sắp mở chứ chưa nhận việc thật nào.
                    </li>
                  ) : null}
                  {room.id === "chairman" ? (
                    <li className="text-xs text-[var(--dim)]">
                      Phòng MỞ RỘNG RỘNG BẰNG ĐÚNG HÀNH LANG CHÍNH GIỮA: rộng 16.0 bằng đúng chiều rộng sảnh / hành lang chính giữa (không rộng hơn, không hẹp hơn, không thụt vào, không để khoảng trống hai bên phòng) × sâu 13.1 — rộng to nhất toàn công ty, to hơn hẳn Phòng Tổng giám đốc — nằm một mình chính giữa phía sau, CỐT NỀN ĐÃ HẠ XUỐNG THẤP: phòng đặt trên BỆ NÂNG THẤP 1.35 (hạ hẳn từ bệ cao 2.82 cũ, không nằm ngang mặt đất). Hai bên sườn phòng là đất trống thoáng cùng cốt nền tầng 1. KHÔNG CÒN BAN CÔNG, KHÔNG còn sảnh ngoài trước phòng. Vào phòng bằng ĐÚNG 2 CẦU THANG THẲNG ĐẢO NGƯỢC: chân mỗi cầu thang đặt ngay tại vách trước phòng (tại x=±6.55) — chính chỗ đỉnh thang của bản trước nay thành chân thang, chân thang đặt từ đó, tại một lối mở ở phía đó — mỗi cầu thang đi thẳng một mạch NGƯỢC VÀO TRONG PHÒNG, leo lên dọc hành lang vách ngăn, đầu thang chạm sàn hành lang trong phòng — VÁCH NGĂN VÀ HÀNH LANG ĐÃ LÙI SÂU VÀO TRONG PHÒNG THÊM ĐÚNG BẰNG CHỖ HÀNH LANG ĐÃ CHỐT 2,3: vách ngăn lùi từ cách vách trước 2,3 về cách vách trước 4,6, hành lang chạy sâu 4,6 từ vách trước tới vách ngăn, nhìn thấy rõ đã lùi, không còn ở chỗ cũ; không còn cầu thang nào đứng trong 2 cái khe hai bên Phòng Tổng giám đốc, hành lang bên dưới trước phòng để trống hoàn toàn cho phòng bên trong đi — mép hành lang trong phòng CẮT BẰNG ĐÚNG ĐỈNH CẦU THANG với LAN CAN THẤP THOÁNG như tay vịn cầu thang ngay trên mép cắt (tay vịn tròn đồng + chấn song mảnh thưa, cao 0,80 — không lan can cao, không tấm kín, không tường chắn, nhìn thông suốt dọc hành lang), và ngay phía trước hành lang là HỒ CÁ COI hòn non bộ phong thủy trong khoảng trống vừa cắt (thác nước chảy vào trong, cá coi bơi quanh hòn non bộ, không chắn lối đi, không chắn cửa chính) — lên thang vào HÀNH LANG do VÁCH NGĂN trong phòng tạo thành dọc mặt trước, đi dọc hành lang vào giữa rồi qua ĐÚNG 1 CỬA CHÍNH DUY NHẤT ở giữa vách ngăn mới vào phòng — KHÔNG cong, KHÔNG chữ L, KHÔNG đặt đằng trước, KHÔNG phải cầu thang sườn; hai vách sườn phòng đoạn trước — sát bên 2 cầu thang và 2 đầu hành lang — đã bỏ hẳn, thay bằng lan can đồng thấp thoáng đồng bộ với lan can hành lang (cùng chất liệu đồng, cùng cao 0,80) — bên cầu thang không còn vách to nào; vách sườn kính chỉ còn ở đoạn phòng chính sau vách ngăn, kín suốt không cửa. Hai cầu thang nằm SAU 3 BẬC NGẮN TRƯỚC CỬA CHÍNH theo trục đi vào: qua cửa chính, lên 3 bậc ngắn, qua sảnh, đi dọc hành lang bên dưới rồi mới tới chân cầu thang ngay tại vách trước phòng — không đặt trước 3 bậc, không chắn 3 bậc. Bên trong: dọc mặt trước là hành lang vách ngăn với cửa chính duy nhất ở giữa; qua cửa chính là phòng chính với bàn gỗ lớn chữ L của Chủ tịch sát tường sau quay mặt ra mặt trước, ghế da lưng cao, 2 ghế khách đối diện, thảm đỏ lớn dưới khu bàn, sofa da dọc tường trái với bàn tròn tiếp khách, tủ hồ sơ gỗ óc chó và giá sách dọc tường sau, biển tên vàng, cờ đỏ sao vàng và cờ Muse 2 bên bàn, tranh phong cảnh lớn ở tường phải, đèn chùm và đèn tường. Phòng CHỈ CÓ MỘT MÌNH Chủ tịch: không thêm nhân viên nào, không bàn văn thư, không bàn làm việc phụ nào trong phòng. Qua lan can thấp mặt trước phòng nhìn ra thấy Phòng Tổng giám đốc ngay phía trước, Chiến lược bên trái, Nhân sự bên phải và toàn bộ văn phòng. Cây trong phòng đứng ở góc phòng chính sau vách ngăn — không cây nào chắn hành lang, lối mở hay cửa chính.
                    </li>
                  ) : null}
                  {room.id === "ceo" ? (
                    <li className="text-xs text-[var(--dim)]">
                      Phòng ở tầng 1, vào sâu bên trong — nằm ngay phía trước Phòng Chủ tịch (phòng Chủ tịch ở chính giữa phía sau, mở rộng rộng bằng đúng hành lang chính giữa 16.0 × sâu 13.1, trên bệ nâng thấp 1.35 đã hạ cốt nền, KHÔNG còn ban công hay sảnh ngoài — vào phòng bằng đúng 2 cầu thang thẳng đảo ngược — chân thang ngay tại vách trước Phòng Chủ tịch, thang leo ngược vào trong dọc hành lang vách ngăn trong Phòng Chủ tịch rồi qua cửa chính duy nhất ở giữa; hành lang bên dưới trước Phòng Chủ tịch để trống hoàn toàn cho phòng bên trong đi, nhìn ra thấy rõ toàn bộ phòng này); mặt trước phòng là vách kính trong suốt. Hai bên sườn Phòng Chủ tịch là đất trống thoáng cùng cốt nền tầng 1, không cầu thang sườn nào ở phía sau. Chiến lược bên trái, Nhân sự bên phải cùng hàng cuối với phòng này, tường sau cả ba phòng thẳng một tuyến — hai phòng đó ở tầng 1 hẳn hoi, không bị gì che. Bên trong phòng, phía trái là bàn tiếp khách/họp dài đặt dọc theo phòng với ghế 2 bên để Tổng giám đốc tiếp khách, bảng trắng và màn hình họp gắn trong phòng ở đầu bàn; phía phải là BÀN TRỢ LÝ của Thu Trang — Trợ lý ngồi ngay trong phòng này, bàn đặt THẤP HƠN và LỆCH SANG BÊN so với bàn Tổng giám đốc ở phía sau, quay mặt ĐỐI DIỆN bàn họp dài, không ngang hàng với Tổng giám đốc, không quay lưng vào bàn họp, không quay ngang. Văn thư KHÔNG ngồi trong phòng này: Thanh Mai có Phòng Văn thư riêng ở sườn trái khu điều hành. Khoảng trống phía trước phòng để trống hoàn toàn, thông thoáng, không bàn ghế gì chắn lối đi chung; mặt tiền phía trước để thoáng — chỉ còn bàn Lễ tân mở ở giữa sảnh, Phòng Văn thư (trái) và Phòng Thư ký Chủ tịch (phải) ở hai bên sườn khu điều hành, không chắn mặt tiền.
                    </li>
                  ) : null}
                  {room.id === "secretary" ? (
                    <li className="text-xs text-[var(--dim)]">
                      Phòng riêng hẳn hoi ở SƯỜN PHẢI khu điều hành — đã dời khỏi mặt tiền sảnh, lùi vào bên sườn, thẳng cột với Phòng Nhân sự, trước mặt Phòng Nhân sự: kích thước 7.8 × 6.2 BẰNG ĐÚNG các phòng ban khác, không làm nhỏ hơn; đủ bàn làm việc, ghế, tủ hồ sơ, cây và lối đi, cửa mở ở vách trong hướng ra lối đi chung — Thư ký làm việc trong phòng của mình, không ngồi cùng phòng Tổng giám đốc, không ở trên Tổng giám đốc; ai lên gặp Chủ tịch đều qua đây trước.
                    </li>
                  ) : null}
                  {room.id === "clerical" ? (
                    <li className="text-xs text-[var(--dim)]">
                      Phòng Văn thư RIÊNG hẳn hoi ở SƯỜN TRÁI khu điều hành — đặt đúng chỗ Phòng Trợ lý Tổng giám đốc cũ (Trợ lý đã chuyển vào ngồi trong Phòng Tổng giám đốc): thẳng cột với Phòng Chiến lược, trước mặt Phòng Chiến lược, kích thước 7.8 × 6.2 BẰNG ĐÚNG các phòng ban khác, không làm nhỏ hơn; đủ bàn làm việc, ghế, tủ hồ sơ, cây và lối đi, cửa mở ở vách trong hướng ra lối đi chung. Văn thư ngồi trong phòng riêng của mình — KHÔNG ngồi trong Phòng Tổng giám đốc, KHÔNG ngồi ngang hàng với Tổng giám đốc; bàn văn thư quay mặt về phía bàn họp dài trong Phòng Tổng giám đốc, không quay lưng vào bàn họp, không quay ngang. Văn thư quản hồ sơ, giấy tờ trình ký cho Chủ tịch.
                    </li>
                  ) : null}
                  {room.id === "reception" ? (
                    <li className="text-xs text-[var(--dim)]">
                      Bàn trực mở ở GIỮA sảnh — điểm trực DUY NHẤT còn lại ở mặt tiền, hai bên không còn phòng nào chắn: nhìn thẳng từ Cửa chính thấy sảnh, bàn Lễ tân, bonsai, bể Koi và khu điều hành phía sau. Mặt bàn quay ra phía người tới — Lễ tân đón khách từ Cửa chính, tiếp nhận và hướng dẫn khách tới đúng phòng; Phòng Văn thư và Phòng Thư ký Chủ tịch ở hai bên sườn khu điều hành hỗ trợ.
                    </li>
                  ) : null}
                  {room.id === "finance" ? (
                    <li className="text-xs text-[var(--dim)]">
                      Phòng lấp đúng ô trống ở đầu sau cột ngoài bên TRÁI theo chốt của Chủ tịch — kích thước 7.8 × 6.2 bằng các phòng ban khác: trưởng phòng và 2 nhân viên ngồi bàn kế toán làm việc, trong phòng có tủ hồ sơ, két sắt ở vách phải và bảng trắng — lo tài chính, kế toán của công ty. Không phải phòng họp, không phải phòng nghỉ.
                    </li>
                  ) : null}
                  {room.id === "legal" ? (
                    <li className="text-xs text-[var(--dim)]">
                      Phòng lấp đúng ô trống ở đầu sau cột ngoài bên PHẢI theo chốt của Chủ tịch — kích thước 7.8 × 6.2 bằng các phòng ban khác: trưởng phòng và 2 nhân viên ngồi bàn làm việc, trong phòng có tủ hợp đồng dọc vách trái và bảng văn bản ở vách phải — lo pháp chế, hợp đồng, văn bản của công ty. Không phải phòng họp, không phải phòng nghỉ.
                    </li>
                  ) : null}
                  {room.id === "kiem-toan" ? (
                    <li className="text-xs text-[var(--dim)]">
                      Đơn vị ĐỘC LẬP trong sơ đồ tổ chức: Kiểm toán nội bộ báo cáo thẳng Chủ tịch, không qua Tổng giám đốc — kiểm nhật ký làm việc, lượt QC, kho sản phẩm, Sổ quyết định và giữ bảng rủi ro cùng Khối Chất lượng. Thuộc tầng quản trị (tab Sơ đồ tổ chức), không chen vào mặt bằng 2 tầng đã khóa để khỏi phá hành lang.
                    </li>
                  ) : null}
                  {room.id === "chat-luong" ? (
                    <li className="text-xs text-[var(--dim)]">
                      Khối Chất lượng toàn công ty: QC mọi khối (không chỉ Phòng Video), bản quyền & tuân thủ cùng Pháp chế, hội đồng duyệt mẫu — quyền VETO bắt buộc ghi mã lý do, phát và gỡ VETO ở tab Sơ đồ tổ chức. Ngọc Linh — QC ngồi tại Phòng Video nhưng nghiệp vụ thuộc khối này.
                    </li>
                  ) : null}
                  {room.id === "rd" ? (
                    <li className="text-xs text-[var(--dim)]">
                      Phòng R&D trực thuộc Tổng giám đốc: nghiên cứu định dạng, công cụ và mẫu mới — vòng thử nghiệm nhỏ, đo kết quả thật rồi mới đề xuất đưa vào sản xuất qua Hội đồng cố vấn.
                    </li>
                  ) : null}
                  {room.id === "nen-tang" ? (
                    <li className="text-xs text-[var(--dim)]">
                      Tổng quản nền tảng giữ sổ kênh YouTube / TikTok / Facebook, lịch đăng và mốc kiếm tiền — sổ kênh ở tab Sơ đồ tổ chức; số liệu chỉ ghi khi có kết nối thật, không bịa số.
                    </li>
                  ) : null}
                  {room.id === "cong-nghe" ? (
                    <li className="text-xs text-[var(--dim)]">
                      Khối Công nghệ (CTO): kỹ thuật & hạ tầng, API, an toàn tài khoản — CHỜ KẾT NỐI LOCAL: chưa có model nào chạy, mục Model để trống cho tới khi máy local của Chủ tịch nối thật.
                    </li>
                  ) : null}
                </ul>
                {room.active && room.id === "video" ? (
                  <button type="button" onClick={() => go("board")} className="mt-3 min-h-9 text-sm font-medium text-[var(--accent)]">
                    Mở bảng việc của phòng →
                  </button>
                ) : room.active ? (
                  <button type="button" onClick={() => go("direct")} className="mt-3 min-h-9 text-sm font-medium text-[var(--accent)]">
                    Mở tin riêng với Đạo diễn →
                  </button>
                ) : (
                  <p className="mt-3 text-xs text-[var(--dim)]">Phòng chưa mở: trưởng phòng đã có mặt, chưa nhận brief nào.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {tasks.length > 0 ? (
        <section aria-label="Việc mới nhất">
          <h2 className="font-display mb-2 text-lg font-bold">Việc mới nhất</h2>
          <ul className="space-y-2">
            {tasks.slice(0, 4).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTask(t)}
                  className="flex w-full items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.title}</span>
                    <span className="text-xs text-[var(--dim)]">
                      {staffById(t.assignee).name} · {fmtTime(t.updated_at)}
                    </span>
                  </span>
                  <StatusPill status={t.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function TaskCard({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }) {
  const assignee = staffById(task.assignee);
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left"
    >
      <span className="block font-medium leading-snug">{task.title}</span>
      <span className="mt-2 flex items-center gap-2 text-xs text-[var(--dim)]">
        <Avatar member={assignee} size={20} />
        {assignee.name} · {task.aspect_ratio}
        {task.scene_seconds ? ` · ~${task.scene_seconds}s/cảnh` : ""}
      </span>
      <span className="mt-1 block text-xs text-[var(--dim)]">Cập nhật {fmtTime(task.updated_at)}</span>
      {task.status === "REVIEW" ? (
        <span className="mt-1 block text-xs font-semibold text-amber-600">
          ⏸ Đang dừng ở hàng đợi duyệt — nhân viên không tự chạy tiếp, chờ QC kết luận
        </span>
      ) : null}
      {task.pipeline_state === "BLOCKED" ? (
        <span className="mt-1 block text-xs font-bold text-red-700">
          DÂY CHUYỀN ĐÃ DỪNG — trượt QC quá 3 lần, chờ Chủ tịch xử lý (mở việc để sửa tay / duyệt cưỡng bức)
        </span>
      ) : task.pipeline_state === "SCREENING" ? (
        <span className="mt-1 block text-xs font-semibold text-sky-700">
          Đang ở Phòng Chiếu Thử — chờ Chủ tịch duyệt Final
        </span>
      ) : task.pipeline_state === "RUNNING" ? (
        <span className="mt-1 block text-xs font-medium text-emerald-700">
          Dây chuyền tự động đang chạy — khâu hiện tại: {task.current_stage}
        </span>
      ) : task.pipeline_state === "PAUSED" ? (
        <span className="mt-1 block text-xs font-medium text-amber-700">
          Dây chuyền đang tạm dừng tại khâu {task.current_stage}
        </span>
      ) : task.pipeline_state === "DONE" ? (
        <span className="mt-1 block text-xs font-medium text-violet-700">
          Dự án đã hoàn tất — Chủ tịch đã duyệt Final
        </span>
      ) : null}
    </button>
  );
}

function Board({ tasks, openTask }: { tasks: Task[]; openTask: (t: Task) => void }) {
  if (tasks.length === 0) {
    return (
      <EmptyNote>
        Bảng việc đang trống. Tổng giám đốc bấm "+ Giao việc" để giao brief đầu tiên cho Đạo diễn —
        việc sẽ hiện ở cột "Chờ nhận" cho tới khi nhân viên xác nhận.
      </EmptyNote>
    );
  }
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-5 lg:overflow-visible">
      {BOARD_COLUMNS.map((st) => {
        const col = tasks.filter((t) => t.status === st);
        return (
          <section
            key={st}
            aria-label={`Cột ${STATUS_META[st].label}`}
            className="w-[240px] shrink-0 snap-start lg:w-auto"
          >
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <LampDot kind={STATUS_META[st].lamp} size={9} />
              {STATUS_META[st].label}
              <span className="text-[var(--dim)]">({col.length})</span>
            </h3>
            <div className="space-y-2">
              {col.map((t) => (
                <TaskCard key={t.id} task={t} onOpen={openTask} />
              ))}
              {col.length === 0 ? <p className="text-xs text-[var(--dim)]">Chưa có việc.</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Global operating-mode switch on the main control bar: Tự động
 * (default — TGĐ Muse orchestrates) / Thủ công (Chairman steps the
 * line himself). */
function PipelineModeToggle() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["pipeline-settings"],
    queryFn: () => api.getPipelineSettings({}),
  });
  const mode = settings.data?.mode ?? "auto";
  const mut = useMutation({
    mutationFn: async (m: "auto" | "manual") =>
      await api.setPipelineMode({ mode: m, actor: "Chủ tịch" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pipeline-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  return (
    <div
      className="flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-0.5"
      role="group"
      aria-label="Chế độ vận hành dây chuyền sản xuất"
      title="Chế độ vận hành dây chuyền: Tự động = TGĐ Muse tự điều phối các khâu; Thủ công = Chủ tịch bấm từng bước"
    >
      {(["auto", "manual"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => mut.mutate(m)}
          className={`min-h-9 rounded-full px-2.5 py-1 text-xs font-semibold ${
            mode === m ? "bg-[var(--accent)] text-white" : "text-[var(--dim)]"
          }`}
        >
          {m === "auto" ? "Tự động" : "Thủ công"}
        </button>
      ))}
    </div>
  );
}

const PIPELINE_STATE_META: Record<string, { label: string; cls: string }> = {
  NONE: { label: "Chưa mở dự án", cls: "bg-gray-200 text-gray-800" },
  RUNNING: { label: "Dây chuyền đang chạy", cls: "bg-emerald-100 text-emerald-900" },
  PAUSED: { label: "Đang tạm dừng", cls: "bg-amber-100 text-amber-900" },
  BLOCKED: { label: "ĐÃ DỪNG — trượt QC quá 3 lần", cls: "bg-red-100 text-red-900" },
  SCREENING: { label: "Đang chiếu thử — chờ duyệt Final", cls: "bg-sky-100 text-sky-900" },
  DONE: { label: "Hoàn tất — đã duyệt Final", cls: "bg-violet-100 text-violet-900" },
};

const STAGE_STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Chờ tới lượt", cls: "bg-gray-200 text-gray-800" },
  RUNNING: { label: "Đang làm", cls: "bg-emerald-100 text-emerald-900" },
  DONE: { label: "Đạt QC", cls: "bg-violet-100 text-violet-900" },
  BLOCKED: { label: "Bị chặn", cls: "bg-red-100 text-red-900" },
};

function formatStageParams(raw: string): string {
  if (!raw) return "";
  try {
    const p = JSON.parse(raw) as Record<string, number | string>;
    const parts: string[] = [];
    if (typeof p.cues === "number") parts.push(`${p.cues} phân cảnh (cue)`);
    if (typeof p.last_end_seconds === "number") parts.push(`SRT tới ${p.last_end_seconds}s`);
    if (typeof p.duration_seconds === "number") parts.push(`thời lượng ${p.duration_seconds}s`);
    if (typeof p.files === "number") parts.push(`${p.files} file ảnh/cảnh`);
    if (typeof p.expected_scenes === "number") parts.push(`cần ${p.expected_scenes} cảnh`);
    if (typeof p.chars === "number") parts.push(`${p.chars} ký tự`);
    if (typeof p.bytes === "number") parts.push(`${p.bytes} byte`);
    return parts.join(" · ");
  } catch {
    return "";
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = typeof reader.result === "string" ? reader.result : "";
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => reject(new Error("Không đọc được file đã chọn."));
    reader.readAsDataURL(file);
  });
}

/** Measures a media file's real duration in the browser before upload. */
function measureMediaDuration(file: File, isVideo: boolean): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(isVideo ? "video" : "audio");
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = window.setTimeout(() => done(null), 9000);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done(Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 10) / 10 : null);
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    el.src = url;
  });
}

function StageOutputPreview({ stage }: { stage: PipelineStage }) {
  if (!stage.output_url || !stage.output_file_name) return null;
  const ext = stage.output_file_name.split(".").pop()?.toLowerCase() ?? "";
  if (stage.kind === "audio") {
    return <audio controls src={stage.output_url} className="mt-2 w-full" aria-label={`Nghe thử ${stage.output_file_name}`} />;
  }
  if (stage.kind === "video" || ext === "mp4" || ext === "mov") {
    return (
      <video controls src={stage.output_url} className="mt-2 max-h-64 w-full rounded-[var(--radius)] bg-black" aria-label={`Xem trước ${stage.output_file_name}`} />
    );
  }
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
    return (
      <img src={stage.output_url} alt={`Đầu ra khâu ${stage.name}: ${stage.output_file_name}`} className="mt-2 max-h-56 w-full rounded-[var(--radius)] object-contain" />
    );
  }
  return null;
}

function PipelineSection({
  task,
  onDone,
  focusStage,
}: {
  task: Task;
  onDone: () => void;
  focusStage?: { stageKey: string; nonce: number } | null;
}) {
  const queryClient = useQueryClient();
  const pipe = useQuery({
    queryKey: ["pipeline", task.id],
    queryFn: () => api.getPipeline({ task_id: task.id }),
  });
  // Bấm một bước trên thanh bước / một khâu trong cột phải là mở dự án
  // và cuộn thẳng tới đúng khâu đó — không phải tự kéo tìm.
  useEffect(() => {
    if (!focusStage || !pipe.data) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`pipe-stage-${focusStage.stageKey}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(t);
  }, [focusStage, pipe.data]);
  const data = pipe.data;
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [finalNote, setFinalNote] = useState("");
  const [uploadingStage, setUploadingStage] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["pipeline", task.id] });
    void queryClient.invalidateQueries({ queryKey: ["pipeline-settings"] });
    onDone();
  };

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const openMut = useMutation({
    mutationFn: async () => await api.approveProjectOpen({ task_id: task.id, actor: "Chủ tịch" }),
    onSuccess: () => {
      setNote("Chủ tịch đã duyệt mở dự án — TGĐ bắt đầu điều phối dây chuyền tự động.");
      invalidate();
    },
    onError: fail,
  });
  const advanceMut = useMutation({
    mutationFn: async () => await api.advancePipeline({ task_id: task.id }),
    onSuccess: (r) => {
      setNote(r.note);
      invalidate();
    },
    onError: fail,
  });
  const pauseMut = useMutation({
    mutationFn: async () => await api.pausePipeline({ task_id: task.id, actor: "Chủ tịch" }),
    onSuccess: () => {
      setNote("Đã tạm dừng dây chuyền tại khâu hiện tại.");
      invalidate();
    },
    onError: fail,
  });
  const resumeMut = useMutation({
    mutationFn: async () => await api.resumePipeline({ task_id: task.id, actor: "Chủ tịch" }),
    onSuccess: (r) => {
      setNote(r.note);
      invalidate();
    },
    onError: fail,
  });
  const forceMut = useMutation({
    mutationFn: async (stageKey: string) =>
      await api.forcePassStage({ task_id: task.id, stage_key: stageKey, actor: "Chủ tịch" }),
    onSuccess: (r) => {
      setNote(r.note);
      invalidate();
    },
    onError: fail,
  });
  const resumeFromMut = useMutation({
    mutationFn: async (stageKey: string) =>
      await api.resumeFromStage({ task_id: task.id, stage_key: stageKey, actor: "Chủ tịch" }),
    onSuccess: (r) => {
      setNote(r.note);
      invalidate();
    },
    onError: fail,
  });
  const finalMut = useMutation({
    mutationFn: async (decision: "APPROVED" | "CHANGES") =>
      await api.approveFinal({ task_id: task.id, decision, note: finalNote.trim(), actor: "Chủ tịch" }),
    onSuccess: (r) => {
      setNote(r.note);
      setFinalNote("");
      invalidate();
    },
    onError: fail,
  });
  const editTextMut = useMutation({
    mutationFn: async (stageKey: string) =>
      await api.editStageOutputText({ task_id: task.id, stage_key: stageKey, content: editText, actor: "Chủ tịch" }),
    onSuccess: (r) => {
      setNote(r.pipeline.note);
      setEditingStage(null);
      invalidate();
    },
    onError: fail,
  });

  const openTextEditor = async (stageKey: string) => {
    setError(null);
    try {
      const out = await api.getStageOutput({ task_id: task.id, stage_key: stageKey });
      setEditText(out.text_content);
      setEditingStage(stageKey);
    } catch (e) {
      fail(e);
    }
  };

  const handleUpload = async (stageKey: string, file: File) => {
    setError(null);
    setUploadingStage(stageKey);
    try {
      if (file.size > 6 * 1024 * 1024) {
        throw new Error("File lớn hơn 6MB — bản nặng giữ ở pipeline local trên máy Chủ tịch, kho web chỉ nhận bản đầu ra để QC/xem trước (tối đa 6MB).");
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      let textContent: string | null = null;
      if (ext === "txt" || ext === "srt") textContent = await file.text();
      let duration: number | null = null;
      if (["wav", "mp3", "m4a", "ogg"].includes(ext)) duration = await measureMediaDuration(file, false);
      if (["mp4", "mov"].includes(ext)) duration = await measureMediaDuration(file, true);
      const b64 = await readFileAsBase64(file);
      const res = await api.uploadStageOutput({
        task_id: task.id,
        stage_key: stageKey,
        file_name: file.name,
        mime: file.type || "application/octet-stream",
        data_base64: b64,
        duration_seconds: duration,
        text_content: textContent,
        actor: "Pipeline local",
      });
      setNote(res.pipeline.note);
      invalidate();
    } catch (e) {
      fail(e);
    } finally {
      setUploadingStage(null);
    }
  };

  const stateMeta = PIPELINE_STATE_META[data?.pipeline_state ?? task.pipeline_state] ?? { label: "Chưa mở dự án", cls: "bg-gray-200 text-gray-800" };
  const stages = data?.stages ?? [];
  const doneCount = stages.filter((s) => s.status === "DONE").length;
  const runningStage = stages.find((s) => s.stage_key === data?.current_stage);
  const busy =
    openMut.isPending || advanceMut.isPending || pauseMut.isPending || resumeMut.isPending ||
    forceMut.isPending || resumeFromMut.isPending || finalMut.isPending || editTextMut.isPending;

  return (
    <section aria-label="Dây chuyền sản xuất tự động" className="mt-3 rounded-[var(--radius)] border-2 border-[var(--accent)]/40 bg-[var(--surface)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display font-bold">Dây chuyền tự động — TGĐ Muse điều phối</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stateMeta.cls}`}>{stateMeta.label}</span>
        {data ? (
          <span className="text-xs text-[var(--dim)]">
            Chế độ: {data.mode === "auto" ? "Tự động (TGĐ tự chạy)" : "Thủ công (Chủ tịch bấm từng bước)"} · QC tối đa {data.max_retries} lần/khâu
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[var(--dim)]">
        Chủ tịch chỉ có 2 điểm chạm phê duyệt: (1) duyệt mở dự án từ brief, (2) duyệt Final tại Phòng Chiếu Thử.
        Mọi khâu trung gian TGĐ tự bàn giao nối tiếp — mỗi khâu phải qua cổng QC trên file thật trong kho văn phòng
        (đúng định dạng, file tồn tại, thời lượng voice khớp phân cảnh). Việc nặng (GPU/VRAM) chạy tuần tự ở pipeline
        local trên máy Chủ tịch và nộp file đầu ra vào đây.
      </p>

      {stages.length > 0 ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              Tiến độ: {doneCount}/{stages.length} khâu đạt
              {runningStage && data?.pipeline_state !== "DONE"
                ? ` · Đang làm việc: ${runningStage.room_name} — ${runningStage.assignee_name} (khâu ${runningStage.name})`
                : ""}
            </span>
            <span className="text-[var(--dim)]">{Math.round((doneCount / stages.length) * 100)}%</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--bg)]" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={stages.length} aria-label="Tiến độ dây chuyền">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${(doneCount / stages.length) * 100}%` }} />
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {data?.pipeline_state === "NONE" || task.pipeline_state === "NONE" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => openMut.mutate()}
            className="min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Chủ tịch: Duyệt mở dự án (điểm chạm 1/2)
          </button>
        ) : null}
        {data?.pipeline_state === "RUNNING" ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => pauseMut.mutate()}
              className="min-h-11 rounded-[var(--radius)] bg-amber-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Tạm dừng (Pause)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => advanceMut.mutate()}
              className="min-h-11 rounded-[var(--radius)] border border-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent)] disabled:opacity-50"
            >
              {data.mode === "manual" ? "Chạy bước tiếp theo" : "TGĐ chạy điều phối ngay"}
            </button>
          </>
        ) : null}
        {data?.pipeline_state === "PAUSED" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => resumeMut.mutate()}
            className="min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Tiếp tục (Resume) từ khâu hiện tại
          </button>
        ) : null}
        {data?.pipeline_state === "SCREENING" ? (
          <span className="text-sm text-[var(--dim)]">Bản dựng đang ở Phòng Chiếu Thử — xem mục duyệt Final bên dưới.</span>
        ) : null}
      </div>

      {data?.pipeline_state === "BLOCKED" ? (
        <div className="mt-3 rounded-[var(--radius)] border-2 border-red-400 bg-red-50 px-3 py-3" role="alert">
          <p className="text-sm font-bold text-red-800">DÂY CHUYỀN ĐÃ DỪNG — cần Chủ tịch xử lý</p>
          <p className="mt-1 text-sm text-red-800">{data.blocked_reason}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const key = data.current_stage;
                const st = stages.find((s) => s.stage_key === key);
                if (st?.kind === "text") void openTextEditor(key);
                else setEditingStage(key);
              }}
              className="min-h-11 rounded-[var(--radius)] bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Mở sửa tay
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => forceMut.mutate(data.current_stage)}
              className="min-h-11 rounded-[var(--radius)] border-2 border-red-600 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
            >
              Duyệt cưỡng bức (Force Pass)
            </button>
          </div>
        </div>
      ) : null}

      {note ? <p className="mt-2 rounded-[var(--radius)] bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{note}</p> : null}
      {error ? <p className="mt-2 rounded-[var(--radius)] bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {pipe.isError ? <p className="mt-2 text-sm text-red-600">Không tải được trạng thái dây chuyền.</p> : null}

      <ol className="mt-3 space-y-2">
        {stages.map((s) => {
          const meta = STAGE_STATUS_META[s.status] ?? { label: s.status, cls: "bg-gray-200 text-gray-800" };
          const facts = formatStageParams(s.params);
          const isCurrent = s.stage_key === data?.current_stage && data?.pipeline_state !== "DONE";
          return (
            <li
              key={s.id}
              id={`pipe-stage-${s.stage_key}`}
              className={`rounded-[var(--radius)] border px-3 py-2.5 ${isCurrent ? "border-[var(--accent)] bg-[var(--bg)]" : "border-[var(--border)]"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-sm font-bold">{s.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>
                  {meta.label}{s.forced ? " · duyệt cưỡng bức" : ""}
                </span>
                {s.retries > 0 ? <span className="text-xs font-medium text-red-700">Trượt QC {s.retries}/{data?.max_retries ?? 3} lần</span> : null}
                <span className="ml-auto text-xs text-[var(--dim)]">{s.room_name} · {s.assignee_name}</span>
              </div>
              {facts ? <p className="mt-1 text-xs text-[var(--dim)]">Thông số đo từ file thật: {facts}</p> : null}
              {s.qc_note ? <p className="mt-1 text-xs font-medium text-red-700">QC: {s.qc_note}</p> : null}
              {s.output_file_name ? (
                <p className="mt-1 text-xs">
                  File đầu ra:{" "}
                  {s.output_url ? (
                    <a href={s.output_url} target="_blank" rel="noreferrer" className="font-medium text-[var(--accent)] underline">
                      {s.output_file_name}
                    </a>
                  ) : (
                    <span className="font-medium">{s.output_file_name}</span>
                  )}
                  {s.output_file_size ? ` · ${s.output_file_size} byte` : ""}
                  {s.output_duration_seconds ? ` · ${s.output_duration_seconds}s` : ""}
                </p>
              ) : (
                <p className="mt-1 text-xs text-[var(--dim)]">Chưa có file đầu ra trong kho.</p>
              )}
              <StageOutputPreview stage={s} />
              {s.kind !== "gate" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="min-h-10 cursor-pointer rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-xs font-medium">
                    {uploadingStage === s.stage_key ? "Đang tải lên…" : "Nộp / nộp lại file đầu ra"}
                    <input
                      type="file"
                      aria-label={`Nộp file đầu ra cho khâu ${s.name}`}
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUpload(s.stage_key, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {s.kind === "text" && s.output_file_name ? (
                    <button
                      type="button"
                      onClick={() => void openTextEditor(s.stage_key)}
                      className="min-h-10 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-xs font-medium"
                    >
                      Sửa nội dung ngay
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => resumeFromMut.mutate(s.stage_key)}
                    className="min-h-10 rounded-[var(--radius)] border border-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent)] disabled:opacity-50"
                  >
                    Tiếp tục từ khâu này
                  </button>
                </div>
              ) : null}
              {editingStage === s.stage_key && s.kind === "text" ? (
                <div className="mt-2">
                  <label className="text-xs font-medium" htmlFor={`stage-edit-${s.stage_key}`}>
                    Sửa trực tiếp nội dung {s.name} (bản sửa lưu thành phiên bản mới, các khâu sau chạy lại từ đây):
                  </label>
                  <textarea
                    id={`stage-edit-${s.stage_key}`}
                    {...FIELDS.editStageOutputText.content}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={10}
                    className="mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !editText.trim()}
                      onClick={() => editTextMut.mutate(s.stage_key)}
                      className="min-h-10 rounded-[var(--radius)] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Lưu bản sửa & chạy tiếp từ khâu này
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingStage(null)}
                      className="min-h-10 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-xs font-medium"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              ) : null}
              {editingStage === s.stage_key && s.kind !== "text" && s.kind !== "gate" ? (
                <p className="mt-2 rounded-[var(--radius)] bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Sửa tay khâu này: dùng nút "Nộp / nộp lại file đầu ra" ở trên để thay file bằng bản đã sửa ở pipeline local,
                  rồi bấm "Tiếp tục từ khâu này" — dây chuyền chạy lại từ đây, không reset cả dự án.
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      {data?.pipeline_state === "SCREENING" ? (
        <div className="mt-3 rounded-[var(--radius)] border-2 border-sky-300 bg-sky-50 px-3 py-3">
          <p className="text-sm font-bold text-sky-900">Phòng Chiếu Thử — điểm chạm phê duyệt 2/2 của Chủ tịch</p>
          <p className="mt-1 text-xs text-sky-900">
            Xem bản dựng ở khâu "Dựng bản chiếu thử" phía trên (nghe/xem trực tiếp từ file thật trong kho), rồi quyết định:
          </p>
          <label className="mt-2 block text-xs font-medium text-sky-900" htmlFor="final-note">
            Ghi chú duyệt / lý do trả về sửa:
          </label>
          <textarea
            id="final-note"
            {...FIELDS.approveFinal.note}
            value={finalNote}
            onChange={(e) => setFinalNote(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => finalMut.mutate("APPROVED")}
              className="min-h-11 rounded-[var(--radius)] bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Duyệt Final — hoàn tất & xuất bản
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => finalMut.mutate("CHANGES")}
              className="min-h-11 rounded-[var(--radius)] border-2 border-sky-600 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50"
            >
              Trả về sửa (chạy lại từ khâu Dựng)
            </button>
          </div>
        </div>
      ) : null}

      {data && data.reports.length > 0 ? (
        <div className="mt-3">
          <h4 className="text-sm font-bold">Báo cáo các khâu (gắn file đầu ra thật)</h4>
          <ul className="mt-1.5 space-y-1.5">
            {data.reports.map((r) => (
              <li key={r.id} className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2 text-xs">
                <span className="font-semibold">{r.actor}</span> · {fmtTime(r.created_at)} — {r.summary}
                {r.product_url ? (
                  <>
                    {" "}· File:{" "}
                    <a href={r.product_url} target="_blank" rel="noreferrer" className="font-medium text-[var(--accent)] underline">
                      {r.product_file_name || "mở file"}
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function GatesSection({ task, onDone }: { task: Task; onDone: () => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const gateMut = useMutation({
    mutationFn: async (input: { gate: "brief" | "frame" | "final"; decision: "APPROVED" | "CHANGES" }) =>
      await api.setGate({
        task_id: task.id,
        gate: input.gate,
        decision: input.decision,
        note: (notes[input.gate] ?? "").trim(),
      }),
    onSuccess: () => {
      setError(null);
      onDone();
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const gates: { key: "brief" | "frame" | "final"; label: string; value: string; hint: string }[] = [
    { key: "brief", label: "Cổng 1 — Duyệt brief", value: task.gate_brief, hint: "Tổng giám đốc chốt brief trước khi phòng bắt tay làm." },
    { key: "frame", label: "Cổng 2 — Duyệt khung đầu mẫu", value: task.gate_frame, hint: "Tổng giám đốc duyệt khung đầu mẫu; các cảnh lẻ ở giữa Đạo diễn tự xử." },
    { key: "final", label: "Cổng 3 — Duyệt bản cuối", value: task.gate_final, hint: "Chỉ duyệt khi việc đã qua QC Đạt." },
  ];

  return (
    <section aria-label="Ba cổng duyệt của Tổng giám đốc" className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <h3 className="font-display font-bold">3 cổng duyệt của Tổng giám đốc</h3>
      <p className="mt-1 text-xs text-[var(--dim)]">
        Việc lẻ ở giữa do Giám đốc / Đạo diễn tự xử; Tổng giám đốc chỉ chốt 3 cổng này.
      </p>
      <div className="mt-2 space-y-3">
        {gates.map((g) => (
          <div key={g.key} className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{g.label}</span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  g.value === "APPROVED"
                    ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"
                    : g.value === "CHANGES"
                      ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200"
                      : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                }`}
              >
                {g.value === "APPROVED" ? "Đã duyệt" : g.value === "CHANGES" ? "Trả về sửa" : "Chờ duyệt"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--dim)]">{g.hint}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                {...FIELDS.setGate.note}
                aria-label={`Ghi chú ${g.label}`}
                value={notes[g.key] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [g.key]: e.target.value }))}
                placeholder="Ghi chú của Tổng giám đốc (không bắt buộc)…"
                className="min-h-10 min-w-[200px] flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
              />
              <button
                type="button"
                disabled={gateMut.isPending || (g.key === "final" && task.status !== "APPROVED")}
                onClick={() => gateMut.mutate({ gate: g.key, decision: "APPROVED" })}
                className="min-h-10 rounded-[var(--radius)] bg-green-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Duyệt
              </button>
              <button
                type="button"
                disabled={gateMut.isPending}
                onClick={() => gateMut.mutate({ gate: g.key, decision: "CHANGES" })}
                className="min-h-10 rounded-[var(--radius)] border border-red-400 px-3 py-1.5 text-sm font-medium text-red-600 disabled:opacity-50"
              >
                Trả về sửa
              </button>
            </div>
            {g.key === "final" && task.status !== "APPROVED" ? (
              <p className="mt-1 text-xs text-[var(--dim)]">Cổng 3 mở khi việc đạt QC Đạt.</p>
            ) : null}
          </div>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}

function StaffPanel({
  member,
  tasks,
  onClose,
  openTask,
  openChat,
}: {
  member: StaffMember;
  tasks: Task[];
  onClose: () => void;
  openTask: (t: Task) => void;
  openChat: (s: StaffMember) => void;
}) {
  const mine =
    member.id === "dao-dien" || member.id === "tong-giam-doc"
      ? tasks
      : member.id === "qc"
        ? tasks.filter((t) => t.status === "REVIEW" || t.assignee === "qc")
        : tasks.filter((t) => t.assignee === member.id);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 sm:items-center" role="dialog" aria-modal="true" aria-label={`Tiến độ của ${member.name}`}>
      <div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-[var(--bg)] px-4 pb-6 pt-4 sm:rounded-2xl">
        <div className="flex items-center gap-3">
          <Avatar member={member} size={44} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold leading-tight">{member.name}</h2>
            <p className="text-xs text-[var(--dim)]">{member.role}</p>
          </div>
          <PresencePill presence={presenceFor(member.id, tasks)} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onClose} aria-label="Đóng panel nhân viên" className="min-h-9 text-sm font-medium text-[var(--accent)]">
            ← Quay lại
          </button>
          {member.id !== "chu-tich" ? (
            <button
              type="button"
              onClick={() => openChat(member)}
              aria-label={`Trò chuyện với ${member.name}`}
              className="ml-auto min-h-10 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              Trò chuyện với {chatLabel(member)}
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Đây là "màn hình làm việc" của {member.name}: tiến độ thật từ bảng việc đã lưu. Bấm vào một việc để mở
          chi tiết và can thiệp sửa hướng (chuyển trạng thái, QC, cổng duyệt).
          {member.id !== "chu-tich" ? " Muốn nói chuyện riêng thì bấm nút Trò chuyện ở trên — cuộc trò chuyện với người này sẽ mở ra để chat ngay." : ""}
        </p>
        {mine.length === 0 ? (
          <EmptyNote>{member.name} chưa giữ việc nào.</EmptyNote>
        ) : (
          <ul className="mt-3 space-y-2">
            {mine.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTask(t)}
                  className="flex w-full items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">#{t.id} {t.title}</span>
                    <span className="text-xs text-[var(--dim)]">
                      Phụ trách {staffById(t.assignee).name} · cập nhật {fmtTime(t.updated_at)}
                    </span>
                  </span>
                  <StatusPill status={t.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MeetingsView({ tasks }: { tasks: Task[] }) {
  const queryClient = useQueryClient();
  const [room, setRoom] = useState("video");
  const [title, setTitle] = useState("");
  const [decisions, setDecisions] = useState("");
  const [actionsText, setActionsText] = useState("");
  const [risks, setRisks] = useState("");
  const [error, setError] = useState<string | null>(null);

  const meetings = useQuery({ queryKey: ["meetings"], queryFn: () => api.listMeetings({}) });
  type Meeting = ApiResponse<typeof api, "listMeetings">["meetings"][number];
  const rows: Meeting[] = meetings.data?.meetings ?? [];
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: () => api.listProfiles({}) });
  const profileRows: Profile[] = profiles.data?.profiles ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["meetings"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
  };

  const createMut = useMutation({
    mutationFn: async () =>
      await api.createMeeting({
        room,
        title: title.trim(),
        decisions: decisions.trim(),
        actions: actionsText.trim(),
        risks: risks.trim(),
        actor: "Đạo diễn",
      }),
    onSuccess: () => {
      setTitle("");
      setDecisions("");
      setActionsText("");
      setRisks("");
      setError(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const delMut = useMutation({
    mutationFn: async (id: number) => await api.deleteMeeting({ id, actor: "Tổng giám đốc" }),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const draftFromData = () => {
    const done = tasks.filter((t) => t.status === "APPROVED");
    const gatesOk = tasks.filter((t) => t.gate_final === "APPROVED");
    setDecisions(
      [
        ...done.map((t) => `Chốt Đạt việc #${t.id} "${t.title}" (${staffById(t.assignee).name})`),
        ...gatesOk.map((t) => `Tổng giám đốc đã duyệt bản cuối việc #${t.id}`),
      ].join("\n") || "Chưa có quyết định nào từ dữ liệu hiện tại.",
    );
    const open = tasks.filter((t) => t.status !== "APPROVED");
    setActionsText(
      open
        .map((t) => `Việc #${t.id} "${t.title}" — ${staffById(t.assignee).name} — ${STATUS_META[t.status].label}`)
        .join("\n") || "Không còn việc mở.",
    );
    const riskLines: string[] = [];
    for (const t of tasks.filter((x) => x.status === "REVISION_REQUIRED")) {
      riskLines.push(`Việc #${t.id} "${t.title}" đang bị trả làm lại — nguy cơ trễ nhịp phòng`);
    }
    for (const p of profileRows.filter((x) => x.quota_used_pct >= 90)) {
      riskLines.push(`Ghế ${staffById(p.staff_id).name} đã dùng ${p.quota_used_pct}% hạn mức media tuần — sắp chạm trần`);
    }
    for (const t of tasks.filter((x) => x.status === "REVIEW")) {
      riskLines.push(`Việc #${t.id} "${t.title}" đang dừng ở hàng đợi duyệt, chờ QC kết luận`);
    }
    setRisks(riskLines.join("\n") || "Chưa thấy rủi ro nào từ dữ liệu hiện tại.");
    if (!title.trim()) {
      setTitle(`Họp ${ROOMS.find((r) => r.id === room)?.name ?? "phòng ban"} — ${new Date().toLocaleDateString("vi-VN")}`);
    }
  };

  const taCls = "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-sm text-[var(--dim)]">
        Mỗi phòng ban có phòng họp riêng. Khi có việc Chờ duyệt, phòng Video coi như đang họp QC — đèn phòng
        trong văn phòng 3D nhấp nháy. Biên bản luôn gồm 3 phần: Quyết định / Việc cần làm / Rủi ro, và có thể
        soạn tự động từ dữ liệu việc thật rồi sửa lại trước khi lưu.
      </p>
      <form
        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) {
            setError("Chưa có tiêu đề cuộc họp.");
            return;
          }
          createMut.mutate();
        }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Phòng họp</span>
            <select aria-label="Phòng họp" value={room} onChange={(e) => setRoom(e.target.value)} className="min-h-11 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-2">
              {ROOMS.map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.active ? "" : " (sắp mở)"}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-[220px] flex-1 text-sm">
            <span className="mb-1 block font-medium">Tiêu đề cuộc họp *</span>
            <input {...FIELDS.createMeeting.title} aria-label="Tiêu đề cuộc họp" value={title} onChange={(e) => setTitle(e.target.value)} className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3" />
          </label>
          <button type="button" onClick={draftFromData} className="min-h-11 rounded-[var(--radius)] border border-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent)]">
            Soạn biên bản từ dữ liệu hiện tại
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Quyết định</span>
            <textarea {...FIELDS.createMeeting.decisions} aria-label="Quyết định của cuộc họp" value={decisions} onChange={(e) => setDecisions(e.target.value)} rows={5} className={taCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Việc cần làm</span>
            <textarea {...FIELDS.createMeeting.actions} aria-label="Việc cần làm sau cuộc họp" value={actionsText} onChange={(e) => setActionsText(e.target.value)} rows={5} className={taCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Rủi ro</span>
            <textarea {...FIELDS.createMeeting.risks} aria-label="Rủi ro ghi trong biên bản" value={risks} onChange={(e) => setRisks(e.target.value)} rows={5} className={taCls} />
          </label>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={createMut.isPending} className="mt-3 min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-60">
          Lưu biên bản họp
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyNote>Chưa có biên bản nào. Cuộc họp đầu tiên thường là họp QC của Phòng Video.</EmptyNote>
      ) : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display font-bold">{m.title}</h3>
                <span className="text-xs text-[var(--dim)]">
                  {ROOMS.find((r) => r.id === m.room)?.name ?? m.room} · {fmtTime(m.created_at)}
                </span>
              </div>
              <div className="mt-2 grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <p className="font-semibold">Quyết định</p>
                  <p className="whitespace-pre-wrap text-[var(--dim)]">{m.decisions || "—"}</p>
                </div>
                <div>
                  <p className="font-semibold">Việc cần làm</p>
                  <p className="whitespace-pre-wrap text-[var(--dim)]">{m.actions || "—"}</p>
                </div>
                <div>
                  <p className="font-semibold">Rủi ro</p>
                  <p className="whitespace-pre-wrap text-[var(--dim)]">{m.risks || "—"}</p>
                </div>
              </div>
              <button type="button" onClick={() => delMut.mutate(m.id)} className="mt-2 min-h-9 text-sm font-medium text-red-600">
                Xóa biên bản
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskDetail({
  task,
  onClose,
  go,
  focusStage,
}: {
  task: Task;
  onClose: () => void;
  go: (v: View) => void;
  focusStage?: { stageKey: string; nonce: number } | null;
}) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<"first_frame" | "full_clip">("first_frame");
  const [verdict, setVerdict] = useState<"APPROVED" | "REVISION_REQUIRED">("APPROVED");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [qcError, setQcError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [productTitle, setProductTitle] = useState(task.title);
  const [productFile, setProductFile] = useState("");
  const [productNote, setProductNote] = useState("");
  const [productVersion, setProductVersion] = useState("v1");
  const [productSize, setProductSize] = useState("");
  const [productMd5, setProductMd5] = useState("");
  const [productReturnReason, setProductReturnReason] = useState("");
  const [productPublishable, setProductPublishable] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reviews = useQuery({
    queryKey: ["qc-reviews", task.id],
    queryFn: () => api.listQcReviews({ task_id: task.id }),
  });
  const reviewRows: QcReview[] = reviews.data?.reviews ?? [];
  const firstFrameApproved = reviewRows.some(
    (r) => r.stage === "first_frame" && r.verdict === "APPROVED",
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["qc-reviews", task.id] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
    void queryClient.invalidateQueries({ queryKey: ["messages"] });
  };

  const statusMut = useMutation({
    mutationFn: async (input: { status: TaskStatus; actor: string }) =>
      await api.updateTaskStatus({ id: task.id, status: input.status, actor: input.actor }),
    onSuccess: invalidate,
    onError: (e) => setFlowError(e instanceof Error ? e.message : String(e)),
  });

  const messageMut = useMutation({
    mutationFn: async (input: { channel: "company" | "direct"; sender: string; body: string }) =>
      await api.sendMessage(input),
    onSuccess: invalidate,
    onError: (e) => setFlowError(e instanceof Error ? e.message : String(e)),
  });

  const assignee = staffById(task.assignee);

  const flow = (status: TaskStatus, actor: string, message?: { channel: "company" | "direct"; sender: string; body: string }) => {
    setFlowError(null);
    statusMut.mutate(
      { status, actor },
      { onSuccess: () => { if (message) messageMut.mutate(message); } },
    );
  };

  const qcMut = useMutation({
    mutationFn: async () =>
      await api.submitQcReview({
        task_id: task.id,
        stage,
        verdict,
        check_face: !!checks.check_face,
        check_motion: !!checks.check_motion,
        check_text: !!checks.check_text,
        check_ratio: !!checks.check_ratio,
        check_character: !!checks.check_character,
        reason: reason.trim(),
        actor: "QC",
      }),
    onSuccess: () => {
      setReason("");
      setChecks({});
      setQcError(null);
      invalidate();
    },
    onError: (e) => setQcError(e instanceof Error ? e.message : String(e)),
  });

  const submitQc = () => {
    if (stage === "full_clip" && !firstFrameApproved) {
      setQcError("Chưa duyệt khung đầu: phải QC khung đầu Đạt trước khi QC full clip.");
      return;
    }
    if (verdict === "APPROVED" && !QC_CHECKS.every((c) => checks[c.key])) {
      setQcError("Muốn chốt Đạt phải tick đủ cả 5 mục trong checklist QC.");
      return;
    }
    if (verdict === "REVISION_REQUIRED" && !reason.trim()) {
      setQcError("Kết quả Làm lại bắt buộc ghi lý do cụ thể để nhân viên sửa đúng chỗ.");
      return;
    }
    qcMut.mutate();
  };

  const productMut = useMutation({
    mutationFn: async () =>
      await api.addProduct({
        title: productTitle.trim(),
        task_id: task.id,
        owner: assignee.name,
        file_name: productFile.trim(),
        note: productNote.trim(),
        version: productVersion,
        return_reason: productReturnReason.trim(),
        file_size: productSize ? Number(productSize) : null,
        file_md5: productMd5.trim(),
        publishable: productPublishable,
        actor: "Đạo diễn",
      }),
    onSuccess: () => {
      setProductFile("");
      setProductNote("");
      setProductError(null);
      invalidate();
    },
    onError: (e) => setProductError(e instanceof Error ? e.message : String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async () => await api.deleteTask({ id: task.id, actor: "Tổng giám đốc" }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => setFlowError(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 sm:items-center" role="dialog" aria-modal="true" aria-label={`Chi tiết việc ${task.title}`}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-[var(--bg)] px-4 pb-6 pt-4 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold leading-snug">{task.title}</h2>
            <p className="mt-1 text-xs text-[var(--dim)]">
              Việc #{task.id} · Phòng Video · Giao cho {assignee.name} · Tạo {fmtTime(task.created_at)}
            </p>
          </div>
          <StatusPill status={task.status} />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng chi tiết việc"
          className="mt-2 min-h-9 text-sm font-medium text-[var(--accent)]"
        >
          ← Quay lại
        </button>

        <section aria-label="Brief" className="mt-2 space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
          <p><span className="font-medium">Brief:</span> {task.brief || "—"}</p>
          <p><span className="font-medium">Khóa nhân vật:</span> {task.character_lock || "—"}</p>
          <p><span className="font-medium">Ảnh tham chiếu:</span> {task.reference_note || "—"}</p>
          <p>
            <span className="font-medium">Kỹ thuật:</span> {task.aspect_ratio}
            {task.scene_seconds ? ` · ~${task.scene_seconds} giây/cảnh` : ""}
            {task.total_seconds ? ` · tổng ~${task.total_seconds} giây` : ""}
          </p>
        </section>

        <section aria-label="Luồng làm việc" className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <h3 className="font-display font-bold">Luồng làm việc của phòng</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {task.status === "ASSIGNED" ? (
              <button
                type="button"
                className="min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
                onClick={() =>
                  flow("IN_PROGRESS", assignee.name, {
                    channel: "company",
                    sender: assignee.name,
                    body: `@Đạo diễn — ${assignee.name} ĐÃ NHẬN việc #${task.id} "${task.title}", chuyển Đang làm ạ.`,
                  })
                }
              >
                {assignee.name}: Xác nhận nhận việc → Đang làm
              </button>
            ) : null}
            {task.status === "IN_PROGRESS" ? (
              <>
                <button
                  type="button"
                  className="min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
                  onClick={() =>
                    flow("REVIEW", assignee.name, {
                      channel: "company",
                      sender: assignee.name,
                      body: `@Đạo diễn @QC — ${assignee.name} nộp KHUNG ĐẦU việc #${task.id} "${task.title}" để duyệt mặt trước khi dựng full clip ạ.`,
                    })
                  }
                >
                  Nộp khung đầu → Chờ duyệt
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-[var(--radius)] border border-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent)]"
                  onClick={() =>
                    flow("REVIEW", assignee.name, {
                      channel: "company",
                      sender: assignee.name,
                      body: `@Đạo diễn @QC — ${assignee.name} nộp FULL CLIP việc #${task.id} "${task.title}" (REVIEW) kèm sản phẩm trong Kho sản phẩm ạ.`,
                    })
                  }
                >
                  Nộp full clip → Chờ duyệt
                </button>
              </>
            ) : null}
            {task.status === "REVISION_REQUIRED" ? (
              <button
                type="button"
                className="min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
                onClick={() =>
                  flow("IN_PROGRESS", assignee.name, {
                    channel: "company",
                    sender: assignee.name,
                    body: `@Đạo diễn — ${assignee.name} đã đọc lý do QC trả, đang làm lại việc #${task.id} "${task.title}" ạ.`,
                  })
                }
              >
                {assignee.name}: Nhận làm lại → Đang làm
              </button>
            ) : null}
            {task.status === "REVIEW" ? (
              <p className="text-sm text-[var(--dim)]">Đang chờ QC chấm ở mục QC bên dưới — QC là người chốt Đạt / Làm lại.</p>
            ) : null}
            {task.status === "APPROVED" ? (
              <p className="text-sm text-[var(--dim)]">Việc đã Đạt. Đạo diễn nhập sản phẩm vào kho và báo cáo Tổng giám đốc.</p>
            ) : null}
            <button
              type="button"
              className="min-h-11 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm font-medium"
              onClick={() =>
                messageMut.mutate({
                  channel: "direct",
                  sender: "Đạo diễn",
                  body: `Báo cáo Tổng giám đốc — Việc #${task.id} "${task.title}": trạng thái hiện tại ${STATUS_META[task.status].label}, người phụ trách ${assignee.name}. Em chịu trách nhiệm kiểm soát tới kết quả cuối ạ.`,
                })
              }
            >
              Đạo diễn: Báo cáo Tổng giám đốc
            </button>
          </div>
          {flowError ? <p className="mt-2 text-sm text-red-600">{flowError}</p> : null}
        </section>

        <GatesSection task={task} onDone={invalidate} />

        <PipelineSection task={task} onDone={invalidate} focusStage={focusStage} />

        <section aria-label="QC" className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <h3 className="font-display font-bold">QC — duyệt khung đầu trước, full clip sau</h3>
          <p className="mt-1 text-xs text-[var(--dim)]">
            Phân quyền: QC độc lập chấm việc của nhân viên; người làm không tự duyệt việc của mình.
          </p>
          <p className="mt-1 text-xs text-[var(--dim)]">
            Quy định bắt buộc: khung đầu phải Đạt mới được dựng và duyệt full clip.
            {firstFrameApproved ? " Khung đầu của việc này đã Đạt." : " Việc này chưa có khung đầu Đạt."}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Giai đoạn</span>
              <select
                aria-label="Giai đoạn QC"
                value={stage}
                onChange={(e) => setStage(e.target.value as "first_frame" | "full_clip")}
                className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-2"
              >
                <option value="first_frame">Khung đầu</option>
                <option value="full_clip" disabled={!firstFrameApproved}>
                  Full clip{firstFrameApproved ? "" : " (chờ khung đầu Đạt)"}
                </option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Kết quả</span>
              <select
                aria-label="Kết quả QC"
                value={verdict}
                onChange={(e) => setVerdict(e.target.value as "APPROVED" | "REVISION_REQUIRED")}
                className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-2"
              >
                <option value="APPROVED">Đạt</option>
                <option value="REVISION_REQUIRED">Làm lại</option>
              </select>
            </label>
          </div>
          <fieldset className="mt-3">
            <legend className="text-sm font-medium">Checklist QC bắt buộc</legend>
            <div className="mt-1 space-y-1.5">
              {QC_CHECKS.map((c) => (
                <label key={c.key} className="flex min-h-9 items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0"
                    checked={!!checks[c.key]}
                    onChange={(e) => setChecks((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium">Lý do làm lại / ghi chú QC</span>
            <textarea
              {...FIELDS.submitQcReview.reason}
              aria-label="Lý do làm lại hoặc ghi chú QC"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ví dụ: Cảnh dài 7,04s vượt chuẩn 2–3s; camera zoom trôi làm Bố lệch khỏi khung; biểu cảm cuối là của cảnh sau…"
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
            />
          </label>
          {qcError ? <p className="mt-2 text-sm text-red-600">{qcError}</p> : null}
          <button
            type="button"
            onClick={submitQc}
            disabled={qcMut.isPending}
            className="mt-3 min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            Ghi kết quả QC
          </button>

          <h4 className="mt-4 text-sm font-semibold">Lịch sử QC của việc này</h4>
          {reviews.isPending ? (
            <p className="mt-1 text-sm text-[var(--dim)]">Đang tải…</p>
          ) : reviewRows.length === 0 ? (
            <p className="mt-1 text-sm text-[var(--dim)]">Chưa có lượt QC nào.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {reviewRows.map((r) => (
                <li key={r.id} className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2 text-sm">
                  <span className="font-medium">
                    {r.stage === "first_frame" ? "Khung đầu" : "Full clip"} —{" "}
                    {r.verdict === "APPROVED" ? "ĐẠT" : "LÀM LẠI"}
                  </span>{" "}
                  <span className="text-xs text-[var(--dim)]">{fmtTime(r.created_at)}</span>
                  <span className="mt-1 block text-xs text-[var(--dim)]">
                    Checklist: mặt {r.check_face ? "✓" : "✗"} · tay/chuyển động {r.check_motion ? "✓" : "✗"} · chữ{" "}
                    {r.check_text ? "✓" : "✗"} · tỉ lệ/nhịp {r.check_ratio ? "✓" : "✗"} · nhân vật{" "}
                    {r.check_character ? "✓" : "✗"}
                  </span>
                  {r.reason ? <span className="mt-1 block">{r.reason}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Nhập kho sản phẩm" className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <h3 className="font-display font-bold">Nhập kho sản phẩm từ việc này</h3>
          <p className="mt-0.5 text-xs text-[var(--dim)]">
            Lưu ý: nộp vào kho mới là "tuyên bố xong" của người làm — chỉ kết luận QC Đạt ở trên mới tính là đã kiểm chứng.
          </p>
          <div className="mt-2 space-y-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tên sản phẩm</span>
              <input
                {...FIELDS.addProduct.title}
                aria-label="Tên sản phẩm"
                value={productTitle}
                onChange={(e) => setProductTitle(e.target.value)}
                className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tên file</span>
              <input
                {...FIELDS.addProduct.file_name}
                aria-label="Tên file sản phẩm"
                value={productFile}
                onChange={(e) => setProductFile(e.target.value)}
                placeholder="vd: canh05-v2-720x1280.mp4"
                className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Phiên bản</span>
                <select aria-label="Phiên bản sản phẩm" value={productVersion} onChange={(e) => setProductVersion(e.target.value)} className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-2">
                  <option value="v1">v1</option>
                  <option value="v2">v2</option>
                  <option value="v3">v3</option>
                  <option value="final">Bản cuối</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Dung lượng file (byte)</span>
                <input {...FIELDS.addProduct.file_size} aria-label="Dung lượng file tính bằng byte" type="number" value={productSize} onChange={(e) => setProductSize(e.target.value)} placeholder="vd: 1666881" className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Mã MD5 của file</span>
                <input {...FIELDS.addProduct.file_md5} aria-label="Mã MD5 của file" value={productMd5} onChange={(e) => setProductMd5(e.target.value)} placeholder="md5 đã kiểm chứng…" className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3" />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Lý do bị trả về (nếu bản này từng bị QC trả)</span>
              <input {...FIELDS.addProduct.return_reason} aria-label="Lý do bị trả về" value={productReturnReason} onChange={(e) => setProductReturnReason(e.target.value)} placeholder="vd: v1 bị trả vì dài 7,04s, zoom trôi, biểu cảm cuối sai nhịp…" className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3" />
            </label>
            <label className="flex min-h-10 items-center gap-2.5 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={productPublishable} onChange={(e) => setProductPublishable(e.target.checked)} />
              Đây là bản được đăng (bản chính thức)
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Ghi chú</span>
              <textarea
                {...FIELDS.addProduct.note}
                aria-label="Ghi chú sản phẩm"
                value={productNote}
                onChange={(e) => setProductNote(e.target.value)}
                rows={2}
                placeholder="Thông số, kết quả QC, lưu ý khi dùng…"
                className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              />
            </label>
            {productError ? <p className="text-sm text-red-600">{productError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={productMut.isPending || !productTitle.trim()}
                onClick={() => productMut.mutate()}
                className="min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-60"
              >
                Thêm vào kho
              </button>
              <button
                type="button"
                onClick={() => go("warehouse")}
                className="min-h-11 rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 font-medium"
              >
                Mở kho sản phẩm
              </button>
            </div>
          </div>
        </section>

        <section aria-label="Xóa việc" className="mt-3 px-1">
          {confirmDelete ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span>Xóa hẳn việc này và lịch sử QC của nó?</span>
              <button
                type="button"
                onClick={() => deleteMut.mutate()}
                className="min-h-9 rounded bg-red-600 px-3 py-1.5 font-medium text-white"
              >
                Xác nhận xóa
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-9 px-2 font-medium">
                Hủy
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-9 text-sm font-medium text-red-600">
              Xóa việc này
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

function AssignView({ done, tasks }: { done: () => void; tasks: Task[] }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [assignee, setAssignee] = useState("dao-dien");
  const [aspect, setAspect] = useState("9:16");
  const [sceneSeconds, setSceneSeconds] = useState("");
  const [totalSeconds, setTotalSeconds] = useState("");
  const [characterLock, setCharacterLock] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  const characters = useQuery({
    queryKey: ["characters"],
    queryFn: () => api.listCharacters({}),
  });
  const charRows: Character[] = characters.data?.characters ?? [];

  const createMut = useMutation({
    mutationFn: async () =>
      await api.createTask({
        title: title.trim(),
        brief: brief.trim(),
        assignee,
        aspect_ratio: aspect,
        scene_seconds: sceneSeconds ? Number(sceneSeconds) : null,
        total_seconds: totalSeconds ? Number(totalSeconds) : null,
        character_lock: characterLock.trim(),
        reference_note: referenceNote.trim(),
        actor: "Tổng giám đốc",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
      done();
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const submit = () => {
    if (!title.trim()) {
      setTitleError("Chưa có tên việc — Đạo diễn cần một tên ngắn để chia cảnh và báo cáo.");
      return;
    }
    setTitleError(null);
    setError(null);
    createMut.mutate();
  };

  const inputCls =
    "min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3";

  return (
    <form
      className="mx-auto max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-[var(--dim)]">
        Tổng giám đốc chỉ giao cho Đạo diễn (hoặc giao thẳng một nhân viên Video). Việc mới vào cột
        "Chờ nhận" — nhân viên xác nhận nhận việc trong bảng việc thì mới chuyển "Đang làm", và mọi lần
        giao / nhận / nộp / duyệt đều ghi vào Nhật ký kiểm toán.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Tên việc *</span>
        <input {...FIELDS.createTask.title} aria-label="Tên việc" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="vd: Video gia đình — Cảnh 05: Bố đưa kem ốc quế khổng lồ" className={inputCls} />
        {titleError ? <span className="mt-1 block text-red-600">{titleError}</span> : null}
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Brief chi tiết</span>
        <textarea {...FIELDS.createTask.brief} aria-label="Brief chi tiết" value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} placeholder="Nội dung cảnh, cảm xúc theo nhịp, bối cảnh, ánh sáng, điều tuyệt đối không được sai…" className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Giao cho</span>
          <select aria-label="Giao cho" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputCls}>
            {VIDEO_TEAM.map((id) => {
              const open = tasks.filter((t) => t.assignee === id && t.status !== "APPROVED").length;
              return (
                <option key={id} value={id}>
                  {staffById(id).name} — {id === "dao-dien" ? "Trưởng phòng Video" : staffById(id).role} · đang giữ {open} việc
                </option>
              );
            })}
          </select>
          {(() => {
            const open = tasks.filter((t) => t.assignee === assignee && t.status !== "APPROVED").length;
            return open >= 3 ? (
              <span className="mt-1 block text-amber-600">
                Cảnh báo quá tải: {staffById(assignee).name} đang giữ {open} việc chưa chốt — cân nhắc chia cho ghế khác.
              </span>
            ) : null;
          })()}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tỉ lệ khung hình</span>
          <select aria-label="Tỉ lệ khung hình" value={aspect} onChange={(e) => setAspect(e.target.value)} className={inputCls}>
            <option value="9:16">9:16 dọc (720x1280)</option>
            <option value="16:9">16:9 ngang (1280x720)</option>
            <option value="1:1">1:1 vuông</option>
            <option value="4:5">4:5</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Thời lượng mỗi cảnh (giây)</span>
          <input {...FIELDS.createTask.scene_seconds} aria-label="Thời lượng mỗi cảnh tính bằng giây" type="number" value={sceneSeconds} onChange={(e) => setSceneSeconds(e.target.value)} placeholder="vd: 3" className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tổng thời lượng (giây)</span>
          <input {...FIELDS.createTask.total_seconds} aria-label="Tổng thời lượng tính bằng giây" type="number" value={totalSeconds} onChange={(e) => setTotalSeconds(e.target.value)} placeholder="vd: 15" className={inputCls} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Khóa nhân vật</span>
        <textarea {...FIELDS.createTask.character_lock} aria-label="Khóa nhân vật" value={characterLock} onChange={(e) => setCharacterLock(e.target.value)} rows={3} placeholder="Mỗi nhân vật = đúng 1 ô đã khóa trong Brand Kit. vd: Bố = ô Variation 1 duy nhất (polo navy, kính gọng đen)…" className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
      </label>
      {charRows.length > 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <p className="text-sm font-medium">Nhân vật đã khóa trong Brand Kit (bấm để chèn vào khóa nhân vật):</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {charRows.map((c) => (
              <button
                key={c.id}
                type="button"
                className="min-h-9 rounded-full border border-[var(--border)] px-3 py-1 text-sm"
                onClick={() =>
                  setCharacterLock((prev) =>
                    `${prev}${prev ? "\n" : ""}${c.name}${c.cell_label ? ` = ô ${c.cell_label}` : ""}${c.description ? ` (${c.description})` : ""}`,
                  )
                }
              >
                {c.name}{c.cell_label ? ` · ô ${c.cell_label}` : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Ảnh tham chiếu / ghi chú nguồn</span>
        <textarea {...FIELDS.createTask.reference_note} aria-label="Ảnh tham chiếu và ghi chú nguồn" value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} rows={2} placeholder="Mô tả ảnh tham chiếu đã chốt và nơi lưu file gốc trong máy của Tổng giám đốc…" className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" disabled={createMut.isPending} className="min-h-12 w-full rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2.5 font-semibold text-white disabled:opacity-60 sm:w-auto">
        Giao việc cho {staffById(assignee).name}
      </button>
    </form>
  );
}

function ChatThread({
  channel,
  recipient = "",
  defaultSender,
  senderOptions,
  placeholder,
  emptyText,
  replyTargetLabel,
  autoFocusInput = false,
}: {
  channel: "company" | "direct";
  recipient?: string;
  defaultSender: string;
  senderOptions: string[];
  placeholder: string;
  emptyText: string;
  /** Staff label that always answers leadership messages in this thread (1-1 DM, direct line). */
  replyTargetLabel?: string;
  /** Focus the message box on open so the user can type right away. */
  autoFocusInput?: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey: ["messages", string, string] = ["messages", channel, recipient];
  const [sender, setSender] = useState(defaultSender);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  const messages = useQuery({
    queryKey,
    queryFn: () => api.listMessages({ channel, recipient }),
    // Live thread: poll so staff replies and posts from task actions show
    // up on their own without reopening the tab.
    refetchInterval: 3000,
  });
  const rows: ChatMessage[] = messages.data?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [rows.length]);

  useEffect(() => {
    if (autoFocusInput) areaRef.current?.focus();
  }, [autoFocusInput]);

  const sendMut = useMutation({
    mutationFn: async (input: { sender: string; body: string }) =>
      await api.sendMessage({ channel, recipient, sender: input.sender, body: input.body }),
    onMutate: async (input) => {
      // The message appears the moment Gửi is pressed. It is only rolled
      // back if the server actually rejects it — and then the draft text
      // is still in the box, so nothing the user typed is ever lost.
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<{ messages: ChatMessage[] }>(queryKey);
      const temp: ChatMessage = {
        id: -Date.now(),
        channel,
        sender: input.sender,
        body: input.body,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData(queryKey, {
        messages: [...(prev?.messages ?? []), temp],
      });
      return { prev };
    },
    onError: (e, _input, context) => {
      if (context?.prev) queryClient.setQueryData(queryKey, context.prev);
      setAwaiting(null);
      setError(e instanceof Error ? e.message : String(e));
    },
    onSuccess: () => {
      setBody("");
      setError(null);
      setAwaiting(null);
      setMention(null);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const isLeadership = sender === "Chủ tịch" || sender === "Tổng giám đốc";

  const expectedRepliers = (text: string): string[] => {
    if (!isLeadership) return [];
    if (replyTargetLabel) return [replyTargetLabel];
    if (channel !== "company") return [];
    const folded = foldClient(text);
    const found: string[] = [];
    for (const s of STAFF) {
      if (s.id === "chu-tich") continue;
      const label = chatLabel(s);
      if (label === sender) continue;
      const aliases = [label, s.name, s.id.replace(/-/g, " ")];
      if (aliases.some((a) => mentionsNameClient(folded, foldClient(a)))) found.push(label);
      if (found.length >= 3) break;
    }
    if (found.length === 0) {
      // A greeting to the room at large is answered by the Lễ tân on duty.
      const casual = ["chao", "hello", "hey", "khoe khong", "vui", "dua", "an trua", "ca phe", "cam on"].some((m) =>
        folded.includes(m),
      );
      if (casual) {
        found.push("Ngọc Anh");
        if (["ca nha", "moi nguoi", "ca cong ty", "tat ca", "anh em"].some((m) => folded.includes(m))) found.push("Đạo diễn");
      }
    }
    return found;
  };

  const submit = () => {
    const text = body.trim();
    if (!text) {
      setError("Tin nhắn đang trống — gõ nội dung rồi mới gửi.");
      return;
    }
    const targets = expectedRepliers(text);
    setAwaiting(targets.length ? targets.join(", ") : null);
    setError(null);
    sendMut.mutate({ sender, body: text });
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setBody(v);
    const pos = e.target.selectionStart ?? v.length;
    const upto = v.slice(0, pos);
    const m = upto.match(/@([^@\n]*)$/);
    const q = m?.[1] ?? null;
    if (m && q !== null && q.length <= 30) {
      setMention({ start: pos - q.length - 1, query: q });
    } else {
      setMention(null);
    }
  };

  const suggestions = mention
    ? STAFF.filter((s) => s.id !== "chu-tich")
        .filter((s) => {
          const q = foldClient(mention.query);
          return !q || foldClient(chatLabel(s)).includes(q) || foldClient(s.name).includes(q);
        })
        .slice(0, 6)
    : [];

  const pickMention = (s: StaffMember) => {
    if (!mention) return;
    const before = body.slice(0, mention.start);
    const after = body.slice(mention.start + 1 + mention.query.length);
    // The name goes in as plain text — no "@" needed to reach the person.
    setBody(`${before}${chatLabel(s)} ${after}`);
    setMention(null);
    areaRef.current?.focus();
  };

  const insertMention = (label: string) => {
    setBody((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${label} `);
    areaRef.current?.focus();
  };

  const quickMentions = ["Đạo diễn", "Video 01", "Video 02", "Video 03", "QC"];

  return (
    <div className="flex flex-col gap-3">
      <div className="min-h-[300px] space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-4">
        {messages.isPending ? (
          <p className="text-sm text-[var(--dim)]">Đang tải tin nhắn…</p>
        ) : rows.length === 0 ? (
          <EmptyNote>{emptyText}</EmptyNote>
        ) : (
          rows.map((m) => {
            const isBoss = m.sender === "Chủ tịch" || m.sender === "Tổng giám đốc";
            const member = memberByChatName(m.sender);
            return (
              <div key={m.id} className={`flex gap-2.5 ${isBoss ? "flex-row-reverse" : ""}`}>
                <Avatar member={member} size={34} />
                <div
                  className={`max-w-[85%] rounded-[var(--radius)] px-3 py-2 ${
                    isBoss ? "bg-[var(--accent)] text-white" : "bg-[var(--bg)]"
                  }`}
                >
                  <p className={`text-xs font-semibold ${isBoss ? "text-white/85" : "text-[var(--dim)]"}`}>
                    {m.sender} · {fmtTime(m.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{renderBody(m.body, isBoss)}</p>
                </div>
              </div>
            );
          })
        )}
        {awaiting ? (
          <p className="animate-pulse text-sm text-[var(--dim)]">{awaiting} đang trả lời…</p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {channel === "company" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-[var(--dim)]">Gọi nhanh:</span>
          {quickMentions.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => insertMention(label)}
              className="min-h-8 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium"
            >
              {label}
            </button>
          ))}
          <span className="text-xs text-[var(--dim)]">— hoặc cứ gõ thẳng tên bất kỳ nhân viên nào trong câu chat bình thường (không cần @), người đó sẽ trả lời ngay.</span>
        </div>
      ) : null}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Người gửi</span>
            <select aria-label="Người gửi" value={sender} onChange={(e) => setSender(e.target.value)} className="min-h-11 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2">
              {senderOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="relative min-w-[220px] flex-1 text-sm">
            <span className="mb-1 block font-medium">Nội dung</span>
            {mention && suggestions.length > 0 ? (
              <ul aria-label="Gợi ý nhân viên" className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-full overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pickMention(s)}
                      className="flex min-h-10 w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--bg)]"
                    >
                      <Avatar member={s} size={24} />
                      <span className="font-medium">{chatLabel(s)}</span>
                      <span className="truncate text-xs text-[var(--dim)]">{s.name} · {s.role}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <textarea
              {...FIELDS.sendMessage.body}
              ref={areaRef}
              aria-label="Nội dung tin nhắn"
              value={body}
              onChange={handleBodyChange}
              rows={2}
              placeholder={placeholder}
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            />
          </label>
          <button type="submit" disabled={sendMut.isPending} className="min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-5 py-2 font-semibold text-white disabled:opacity-60">
            Gửi tin
          </button>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </div>
  );
}

function ChatView({ channel, tasks }: { channel: "company" | "direct"; tasks: Task[] }) {
  const queryClient = useQueryClient();
  const [reportError, setReportError] = useState<string | null>(null);

  const reportMut = useMutation({
    mutationFn: async (input: { sender: string; body: string }) =>
      await api.sendMessage({ channel, recipient: "", sender: input.sender, body: input.body }),
    onSuccess: () => {
      setReportError(null);
      void queryClient.invalidateQueries({ queryKey: ["messages", channel, ""] });
    },
    onError: (e) => setReportError(e instanceof Error ? e.message : String(e)),
  });

  const reportable = tasks.filter((t) => t.status !== "APPROVED");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      {channel === "company" ? (
        <p className="text-sm text-[var(--dim)]">
          Kênh chung toàn công ty: nói chuyện bình thường, cứ gõ thẳng tên nhân viên (vd Đạo diễn, Video 01,
          Ngọc Linh — không cần @) là tin tới đúng người đó và người đó trả lời ngay trong kênh. Chào hỏi,
          tán gẫu cũng được — nhân viên trả lời như người thật. Tin xác nhận nhận việc, nộp khung đầu, nộp
          REVIEW và kết quả QC từ chi tiết việc cũng hiện ở đây.
        </p>
      ) : (
        <p className="text-sm text-[var(--dim)]">
          Kênh riêng Tổng giám đốc ↔ Đạo diễn: chỉ chốt brief và nhận báo cáo kết quả cuối. Đạo diễn chịu
          trách nhiệm kiểm soát toàn bộ sản phẩm nhân viên bàn giao, không đẩy lỗi lên Tổng giám đốc.
        </p>
      )}

      {channel === "direct" && reportable.length > 0 ? (
        <section aria-label="Báo cáo nhanh" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <h3 className="font-display text-sm font-bold">Đạo diễn báo cáo nhanh theo việc</h3>
          <ul className="mt-2 space-y-2">
            {reportable.slice(0, 5).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  #{t.id} {t.title} — <span className="text-[var(--dim)]">{STATUS_META[t.status].label}, {staffById(t.assignee).name}</span>
                </span>
                <button
                  type="button"
                  className="min-h-9 shrink-0 rounded-[var(--radius)] border border-[var(--accent)] px-3 py-1 text-sm font-medium text-[var(--accent)]"
                  onClick={() =>
                    reportMut.mutate({
                      sender: "Đạo diễn",
                      body: `Báo cáo Tổng giám đốc — Việc #${t.id} "${t.title}": ${STATUS_META[t.status].label}, phụ trách ${staffById(t.assignee).name}. Em đang đốc thúc tới kết quả cuối ạ.`,
                    })
                  }
                >
                  Báo cáo việc này
                </button>
              </li>
            ))}
          </ul>
          {reportError ? <p className="mt-2 text-sm text-red-600">{reportError}</p> : null}
        </section>
      ) : null}

      <ChatThread
        key={channel}
        channel={channel}
        recipient=""
        defaultSender="Chủ tịch"
        senderOptions={
          channel === "direct"
            ? ["Chủ tịch", "Tổng giám đốc", "Đạo diễn"]
            : ["Chủ tịch", "Tổng giám đốc", "Đạo diễn", "Video 01", "Video 02", "Video 03", "QC"]
        }
        placeholder={
          channel === "company"
            ? "vd: Video 01 — nhận Cảnh 05, nộp khung đầu trước khi dựng full clip…"
            : "Nhắn brief hoặc chốt việc với Đạo diễn…"
        }
        emptyText={
          channel === "company"
            ? "Chưa có tin nào. Chủ tịch nhắn câu đầu tiên — cứ gõ thẳng tên nhân viên (không cần @) để gọi đúng người, người được gọi sẽ trả lời ngay tại đây."
            : "Chưa có tin riêng nào. Tổng giám đốc nhắn brief đầu tiên cho Đạo diễn ở đây."
        }
        replyTargetLabel={channel === "direct" ? "Đạo diễn" : undefined}
      />
    </div>
  );
}

type TalkThreadSel =
  | { kind: "company" }
  | { kind: "direct" }
  | { kind: "dm"; staffId: string };

function TalkView({
  focusStaffId = null,
  focusNonce = 0,
  openStaff,
}: {
  focusStaffId?: string | null;
  focusNonce?: number;
  openStaff?: (s: StaffMember) => void;
}) {
  const [thread, setThread] = useState<TalkThreadSel>({ kind: "company" });

  // Nút "Trò chuyện" trên thẻ của một nhân vật (mở từ văn phòng 3D, sơ đồ
  // công ty hay panel hồ sơ) đưa thẳng tới cuộc trò chuyện riêng với
  // người đó. Bấm vào nhân vật KHÔNG tự mở chat — phải bấm nút Trò
  // chuyện thì mới tới đây.
  useEffect(() => {
    if (!focusStaffId) return;
    if (focusStaffId === "chu-tich") setThread({ kind: "company" });
    else setThread({ kind: "dm", staffId: focusStaffId });
  }, [focusStaffId, focusNonce]);
  const dmStaff = thread.kind === "dm" ? staffById(thread.staffId) : null;
  const staffList = STAFF.filter((s) => s.id !== "chu-tich");
  const roomName = (roomId: string) => ROOMS.find((r) => r.id === roomId)?.name ?? roomId;

  const threadBtnCls = (active: boolean) =>
    `flex min-h-12 w-full items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-left ${
      active ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--bg)]"
    }`;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section aria-label="Danh sách cuộc trò chuyện" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-display font-bold">Trò chuyện giao tiếp</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--dim)]">
            Chat với cả công ty hoặc nhắn riêng từng nhân viên. Tin gửi là hiện ngay, và nhân viên được
            gọi sẽ trả lời ngay trong khung chat. Cũng có thể bấm vào bất kỳ nhân vật nào trong văn
            phòng 3D rồi bấm nút Trò chuyện trên thẻ của họ để mở đúng cuộc trò chuyện riêng này.
          </p>
        </div>
        <div className="space-y-1 px-2 py-2">
          <button type="button" onClick={() => setThread({ kind: "company" })} aria-current={thread.kind === "company" ? "true" : undefined} className={threadBtnCls(thread.kind === "company")}>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Chat toàn công ty</span>
              <span className={`block truncate text-xs ${thread.kind === "company" ? "text-white/80" : "text-[var(--dim)]"}`}>Tất cả phòng ban — gõ thẳng tên là gọi đúng người, không cần @</span>
            </span>
          </button>
          <button type="button" onClick={() => setThread({ kind: "direct" })} aria-current={thread.kind === "direct" ? "true" : undefined} className={threadBtnCls(thread.kind === "direct")}>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Tin riêng Tổng giám đốc ↔ Đạo diễn</span>
              <span className={`block truncate text-xs ${thread.kind === "direct" ? "text-white/80" : "text-[var(--dim)]"}`}>Chốt brief, nhận báo cáo kết quả cuối</span>
            </span>
          </button>
        </div>
        <p className="px-4 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--dim)]">
          Nhắn riêng từng nhân viên
        </p>
        <ul className="max-h-[44vh] space-y-0.5 overflow-y-auto px-2 pb-3 lg:max-h-[58vh]">
          {staffList.map((s) => {
            const active = thread.kind === "dm" && thread.staffId === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setThread({ kind: "dm", staffId: s.id })}
                  aria-current={active ? "true" : undefined}
                  className={`flex min-h-11 w-full items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-1.5 text-left ${
                    active ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--bg)]"
                  }`}
                >
                  <Avatar member={s} size={34} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className={`block truncate text-xs ${active ? "text-white/80" : "text-[var(--dim)]"}`}>
                      {roomName(s.roomId)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Khung trò chuyện" className="min-w-0">
        {thread.kind === "company" ? (
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Chat toàn công ty</h2>
              <p className="text-sm text-[var(--dim)]">Mọi phòng ban đều đọc được. Nói chuyện bình thường, gõ thẳng tên nhân viên (vd Đạo diễn, Video 01, Ngọc Linh — không cần @) là gọi đúng người — người đó trả lời ngay tại đây, chào hỏi tán gẫu cũng tự nhiên như người thật.</p>
            </div>
            <ChatThread
              key="talk-company"
              channel="company"
              recipient=""
              defaultSender="Chủ tịch"
              senderOptions={["Chủ tịch", "Tổng giám đốc", "Đạo diễn", "Video 01", "Video 02", "Video 03", "QC"]}
              placeholder="Nhắn cho cả công ty, hoặc gõ thẳng tên nhân viên để gọi đúng người…"
              emptyText="Chưa có tin nào trong kênh toàn công ty. Chủ tịch nhắn câu đầu tiên — gõ thẳng tên nhân viên (vd Đạo diễn, Video 01, Ngọc Linh) là gọi đúng người, người được gọi sẽ trả lời ngay tại đây."
            />
          </div>
        ) : thread.kind === "direct" ? (
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Tin riêng Tổng giám đốc ↔ Đạo diễn</h2>
              <p className="text-sm text-[var(--dim)]">Chốt brief và nhận báo cáo kết quả cuối — Đạo diễn trả lời ngay tại đây.</p>
            </div>
            <ChatThread
              key="talk-direct"
              channel="direct"
              recipient=""
              defaultSender="Chủ tịch"
              senderOptions={["Chủ tịch", "Tổng giám đốc", "Đạo diễn"]}
              placeholder="Nhắn brief hoặc chốt việc với Đạo diễn…"
              emptyText="Chưa có tin riêng nào. Chủ tịch nhắn brief đầu tiên cho Đạo diễn ở đây — Đạo diễn sẽ trả lời ngay."
              replyTargetLabel="Đạo diễn"
            />
          </div>
        ) : dmStaff ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar member={dmStaff} size={44} />
              <div className="min-w-0">
                <h2 className="font-display truncate text-lg font-bold">{dmStaff.name}</h2>
                <p className="truncate text-sm text-[var(--dim)]">{dmStaff.role} · {roomName(dmStaff.roomId)}</p>
              </div>
              {openStaff ? (
                <button
                  type="button"
                  onClick={() => openStaff(dmStaff)}
                  aria-label={`Xem tiến độ và việc của ${dmStaff.name}`}
                  className="ml-auto min-h-9 shrink-0 rounded-[var(--radius)] border border-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent)]"
                >
                  Xem tiến độ & việc
                </button>
              ) : null}
            </div>
            <ChatThread
              key={`talk-dm-${dmStaff.id}`}
              channel="direct"
              recipient={dmStaff.id}
              autoFocusInput
              defaultSender="Chủ tịch"
              senderOptions={["Chủ tịch", "Tổng giám đốc"]}
              placeholder={`Nhắn riêng cho ${chatLabel(dmStaff)}…`}
              emptyText={`Chưa có tin riêng nào với ${dmStaff.name}. Chủ tịch nhắn câu đầu tiên — ${chatLabel(dmStaff)} sẽ trả lời ngay tại đây.`}
              replyTargetLabel={chatLabel(dmStaff)}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} byte`;
}

function Warehouse({ products, tasks }: { products: Product[]; tasks: Task[] }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [owner, setOwner] = useState("Đạo diễn");
  const [version, setVersion] = useState("v1");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
  };

  const addMut = useMutation({
    mutationFn: async () =>
      await api.addProduct({
        title: title.trim(),
        owner,
        file_name: fileName.trim(),
        note: note.trim(),
        version,
        actor: "Đạo diễn",
      }),
    onSuccess: () => {
      setTitle("");
      setFileName("");
      setNote("");
      setError(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const delMut = useMutation({
    mutationFn: async (id: number) => await api.deleteProduct({ id, actor: "Tổng giám đốc" }),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const taskTitle = (id: number | null) =>
    id == null ? null : (tasks.find((t) => t.id === id)?.title ?? `Việc #${id}`);

  return (
    <div className="space-y-4">
      <form
        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) {
            setError("Chưa có tên sản phẩm.");
            return;
          }
          addMut.mutate();
        }}
      >
        <h2 className="font-display font-bold">Nhập kho thủ công</h2>
        <p className="mt-0.5 text-xs text-[var(--dim)]">
          Sản phẩm nộp từ chi tiết việc sẽ tự vào kho kèm phiên bản và mã kiểm tra file. Kho chỉ lưu thông tin
          sản phẩm trong văn phòng này — file gốc vẫn nằm ở máy của công ty, không qua link tải lạ.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tên sản phẩm *</span>
            <input {...FIELDS.addProduct.title} aria-label="Tên sản phẩm trong kho" value={title} onChange={(e) => setTitle(e.target.value)} className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tên file</span>
            <input {...FIELDS.addProduct.file_name} aria-label="Tên file trong kho" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="vd: PILOT-15s-final.mp4" className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Người nộp</span>
            <select aria-label="Người nộp sản phẩm" value={owner} onChange={(e) => setOwner(e.target.value)} className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-2">
              {["Đạo diễn", "Video 01", "Video 02", "Video 03", "QC"].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Phiên bản</span>
            <select aria-label="Phiên bản trong kho" value={version} onChange={(e) => setVersion(e.target.value)} className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-2">
              <option value="v1">v1</option>
              <option value="v2">v2</option>
              <option value="v3">v3</option>
              <option value="final">Bản cuối</option>
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Ghi chú</span>
            <input {...FIELDS.addProduct.note} aria-label="Ghi chú sản phẩm trong kho" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thông số kỹ thuật, kết quả QC…" className="min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3" />
          </label>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={addMut.isPending} className="mt-3 min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-60">
          Thêm vào kho
        </button>
      </form>

      {products.length === 0 ? (
        <EmptyNote>Kho đang trống. Sản phẩm đầu tiên sẽ vào kho từ chi tiết một việc đã Đạt, hoặc nhập thủ công ở trên.</EmptyNote>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => (
            <li key={p.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium leading-snug">{p.title}</h3>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-xs font-semibold">{p.version === "final" ? "Bản cuối" : p.version}</span>
                  {p.publishable ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-900 dark:bg-green-950 dark:text-green-200">ĐƯỢC ĐĂNG</span>
                  ) : null}
                </span>
              </div>
              <dl className="mt-2 space-y-1 text-xs text-[var(--dim)]">
                <div>Phòng Video{p.owner ? ` · ${p.owner}` : ""} · {fmtTime(p.created_at)}</div>
                {p.file_name ? <div>File: {p.file_name}</div> : null}
                {p.file_size != null || p.file_md5 ? (
                  <div>Kiểm tra file: {fmtBytes(p.file_size)}{p.file_md5 ? ` · md5 ${p.file_md5}` : ""}</div>
                ) : null}
                {taskTitle(p.task_id) ? <div>Thuộc việc: {taskTitle(p.task_id)}</div> : null}
                {p.return_reason ? <div className="text-red-500">Lý do từng bị trả: {p.return_reason}</div> : null}
                {p.note ? <div className="whitespace-pre-wrap text-sm text-[var(--text)]">{p.note}</div> : null}
              </dl>
              {confirmId === p.id ? (
                <span className="mt-2 flex items-center gap-2 text-sm">
                  <button type="button" onClick={() => delMut.mutate(p.id)} className="min-h-9 rounded bg-red-600 px-3 py-1 font-medium text-white">Xác nhận xóa</button>
                  <button type="button" onClick={() => setConfirmId(null)} className="min-h-9 px-2 font-medium">Hủy</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmId(p.id)} className="mt-2 min-h-9 text-sm font-medium text-red-600">
                  Xóa khỏi kho
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const BRAND_CATEGORIES: { key: "outfit" | "setting" | "tone" | "voice" | "text"; label: string }[] = [
  { key: "outfit", label: "Trang phục" },
  { key: "setting", label: "Bối cảnh" },
  { key: "tone", label: "Tone màu" },
  { key: "voice", label: "Giọng đọc" },
  { key: "text", label: "Chữ trên hình" },
];

function BrandKit() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [cell, setCell] = useState("");
  const [desc, setDesc] = useState("");
  const [itemCategory, setItemCategory] = useState<"outfit" | "setting" | "tone" | "voice" | "text">("outfit");
  const [itemTitle, setItemTitle] = useState("");
  const [itemDetail, setItemDetail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const characters = useQuery({ queryKey: ["characters"], queryFn: () => api.listCharacters({}) });
  const charRows: Character[] = characters.data?.characters ?? [];
  const items = useQuery({ queryKey: ["brand-items"], queryFn: () => api.listBrandItems({}) });
  type BrandItem = ApiResponse<typeof api, "listBrandItems">["items"][number];
  const itemRows: BrandItem[] = items.data?.items ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["characters"] });
    void queryClient.invalidateQueries({ queryKey: ["brand-items"] });
    void queryClient.invalidateQueries({ queryKey: ["audit"] });
  };

  const addCharMut = useMutation({
    mutationFn: async () =>
      await api.addCharacter({ name: name.trim(), cell_label: cell.trim(), description: desc.trim(), actor: "Đạo diễn" }),
    onSuccess: () => {
      setName("");
      setCell("");
      setDesc("");
      setError(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const delCharMut = useMutation({
    mutationFn: async (id: number) => await api.deleteCharacter({ id, actor: "Tổng giám đốc" }),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const addItemMut = useMutation({
    mutationFn: async () =>
      await api.addBrandItem({ category: itemCategory, title: itemTitle.trim(), detail: itemDetail.trim(), actor: "Đạo diễn" }),
    onSuccess: () => {
      setItemTitle("");
      setItemDetail("");
      setError(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const delItemMut = useMutation({
    mutationFn: async (id: number) => await api.deleteBrandItem({ id, actor: "Tổng giám đốc" }),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const inputCls = "min-h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-3";

  return (
    <div className="space-y-4">
      <p className="rounded-[var(--radius)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        Chuẩn duy nhất của toàn công ty: video mẫu + ảnh tham chiếu đã chốt trong Brand Kit này.
        <strong> Cấm lấy cảnh đã duyệt làm chuẩn mới</strong> — cảnh đạt chỉ là sản phẩm, không bao giờ thành chuẩn thay cho bản gốc.
      </p>

      <section aria-label="Khóa mặt nhân vật" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <h2 className="font-display font-bold">Khóa mặt nhân vật</h2>
        {charRows.length === 0 ? (
          <div className="mt-2 rounded-[var(--radius)] border border-dashed border-[var(--border)] px-3 py-3 text-sm text-[var(--dim)]">
            <p className="font-medium text-[var(--text)]">Ví dụ minh họa (chưa phải dữ liệu thật):</p>
            <p className="mt-1">
              "Bố — ô Variation 1 duy nhất: ~35 tuổi, người Việt 100%, kính gọng đen, áo polo navy" ·
              "Mẹ — ô A duy nhất: váy be, tóc đen dài" · "Con gái — ô 1: váy tím nhiều nơ" ·
              "Em bé — ô chính diện trên-trái: áo xanh bạc hà, ngồi ghế ăn".
            </p>
            <p className="mt-1">Khóa nhân vật thật của dự án đầu tiên bằng form dưới đây.</p>
          </div>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {charRows.map((c) => (
              <li key={c.id} className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2.5">
                <p className="font-medium">
                  {c.name}
                  {c.cell_label ? <span className="text-[var(--dim)]"> · ô {c.cell_label}</span> : null}
                </p>
                {c.description ? <p className="mt-0.5 text-sm text-[var(--dim)]">{c.description}</p> : null}
                <button type="button" onClick={() => delCharMut.mutate(c.id)} className="mt-1 min-h-9 text-sm font-medium text-red-600">
                  Bỏ khóa
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-3 grid gap-2 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              setError("Chưa có tên nhân vật.");
              return;
            }
            addCharMut.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tên nhân vật *</span>
            <input {...FIELDS.addCharacter.name} aria-label="Tên nhân vật" value={name} onChange={(e) => setName(e.target.value)} placeholder="vd: Bố" className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Ô tham chiếu đã khóa</span>
            <input {...FIELDS.addCharacter.cell_label} aria-label="Ô tham chiếu đã khóa" value={cell} onChange={(e) => setCell(e.target.value)} placeholder="vd: Variation 1" className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Mô tả khóa</span>
            <input {...FIELDS.addCharacter.description} aria-label="Mô tả khóa nhân vật" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Tuổi, trang phục, đặc điểm nhận diện…" className={inputCls} />
          </label>
          <button type="submit" disabled={addCharMut.isPending} className="min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-60 sm:col-span-3 sm:w-auto">
            Khóa nhân vật
          </button>
        </form>
      </section>

      <section aria-label="Chuẩn dùng chung toàn công ty" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <h2 className="font-display font-bold">Chuẩn dùng chung: trang phục · bối cảnh · tone màu · giọng đọc · chữ trên hình</h2>
        {itemRows.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--dim)]">Chưa có mục nào — thêm chuẩn đầu tiên bằng form dưới đây.</p>
        ) : (
          <div className="mt-2 space-y-3">
            {BRAND_CATEGORIES.map((cat) => {
              const rows = itemRows.filter((i) => i.category === cat.key);
              if (rows.length === 0) return null;
              return (
                <div key={cat.key}>
                  <h3 className="text-sm font-semibold">{cat.label}</h3>
                  <ul className="mt-1 space-y-1.5">
                    {rows.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2 text-sm">
                        <span>
                          <span className="font-medium">{i.title}</span>
                          {i.detail ? <span className="block text-[var(--dim)]">{i.detail}</span> : null}
                        </span>
                        <button type="button" onClick={() => delItemMut.mutate(i.id)} className="min-h-9 shrink-0 text-sm font-medium text-red-600">
                          Xóa
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        <form
          className="mt-3 grid gap-2 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!itemTitle.trim()) {
              setError("Chưa có tên mục Brand Kit.");
              return;
            }
            addItemMut.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Loại chuẩn</span>
            <select aria-label="Loại chuẩn Brand Kit" value={itemCategory} onChange={(e) => setItemCategory(e.target.value as typeof itemCategory)} className={inputCls}>
              {BRAND_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tên mục *</span>
            <input {...FIELDS.addBrandItem.title} aria-label="Tên mục Brand Kit" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder="vd: Bếp sáng ấm áp" className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Chi tiết chuẩn</span>
            <input {...FIELDS.addBrandItem.detail} aria-label="Chi tiết chuẩn Brand Kit" value={itemDetail} onChange={(e) => setItemDetail(e.target.value)} placeholder="Mô tả đúng chuẩn phải theo…" className={inputCls} />
          </label>
          <button type="submit" disabled={addItemMut.isPending} className="min-h-11 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-60 sm:col-span-3 sm:w-auto">
            Thêm mục Brand Kit
          </button>
        </form>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </section>
    </div>
  );
}

type AnyReview = ApiResponse<typeof api, "listAllQcReviews">["reviews"][number];
type Profile = ApiResponse<typeof api, "listProfiles">["profiles"][number];

const CAPABILITY_LABELS: Record<string, string> = {
  video: "Dựng được VIDEO",
  image: "Chỉ tạo được ảnh động",
  both: "Cả video và ảnh",
  none: "Chưa khảo sát",
};

function ProfileEditor({ staffId, profile }: { staffId: string; profile: Profile | undefined }) {
  const queryClient = useQueryClient();
  const [capability, setCapability] = useState(profile?.capability ?? "video");
  const [quota, setQuota] = useState(profile ? String(profile.quota_used_pct) : "0");
  const [note, setNote] = useState(profile?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setCapability(profile.capability);
      setQuota(String(profile.quota_used_pct));
      setNote(profile.note);
    }
  }, [profile?.staff_id, profile?.capability, profile?.quota_used_pct, profile?.note]);

  const mut = useMutation({
    mutationFn: async () =>
      await api.upsertProfile({
        staff_id: staffId,
        capability: capability as "video" | "image" | "both" | "none",
        quota_used_pct: Number(quota) || 0,
        note: note.trim(),
        actor: "Đạo diễn",
      }),
    onSuccess: () => {
      setSaved(true);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["profiles"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const inputCls = "min-h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm";
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-4">
      <label className="block text-xs">
        <span className="mb-1 block font-medium">Năng lực</span>
        <select aria-label={`Năng lực của ${staffId}`} value={capability} onChange={(e) => setCapability(e.target.value as typeof capability)} className={inputCls}>
          <option value="video">Dựng được VIDEO</option>
          <option value="image">Chỉ tạo được ảnh động</option>
          <option value="both">Cả video và ảnh</option>
          <option value="none">Chưa khảo sát</option>
        </select>
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium">Hạn mức media đã dùng (%)</span>
        <input {...FIELDS.upsertProfile.quota_used_pct} aria-label={`Hạn mức đã dùng của ${staffId}`} type="number" step="1" value={quota} onChange={(e) => setQuota(e.target.value)} className={inputCls} />
      </label>
      <label className="block text-xs sm:col-span-1">
        <span className="mb-1 block font-medium">Ghi chú ghế</span>
        <input {...FIELDS.upsertProfile.note} aria-label={`Ghi chú ghế ${staffId}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="vd: ghế chạm 90% hạn mức tuần…" className={inputCls} />
      </label>
      <div className="flex items-end">
        <button type="button" disabled={mut.isPending} onClick={() => { setSaved(false); mut.mutate(); }} className="min-h-10 rounded-[var(--radius)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {saved ? "Đã lưu ✓" : "Lưu hồ sơ"}
        </button>
      </div>
      {error ? <p className="text-sm text-red-600 sm:col-span-4">{error}</p> : null}
    </div>
  );
}

function KpiView({ tasks }: { tasks: Task[] }) {
  const allReviews = useQuery({ queryKey: ["all-reviews"], queryFn: () => api.listAllQcReviews({}) });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: () => api.listProfiles({}) });
  const reviews: AnyReview[] = allReviews.data?.reviews ?? [];
  const profileRows: Profile[] = profiles.data?.profiles ?? [];
  const profileOf = (id: string) => profileRows.find((p) => p.staff_id === id);

  const checkLabels: Record<string, string> = Object.fromEntries(QC_CHECKS.map((c) => [c.key, c.label]));

  const staffKpi = (staffId: string) => {
    const mine = tasks.filter((t) => t.assignee === staffId);
    const myReviews = reviews.filter((r) => mine.some((t) => t.id === r.task_id));
    let ffTotal = 0;
    let ffPass = 0;
    for (const t of mine) {
      const ff = reviews.filter((r) => r.task_id === t.id && r.stage === "first_frame");
      const first = ff[ff.length - 1];
      if (first) {
        ffTotal += 1;
        if (first.verdict === "APPROVED") ffPass += 1;
      }
    }
    const revisions = myReviews.filter((r) => r.verdict === "REVISION_REQUIRED").length;
    const scenes = mine.map((t) => t.scene_seconds).filter((v): v is number => v != null);
    const avgScene = scenes.length > 0 ? scenes.reduce((a, b) => a + b, 0) / scenes.length : null;
    const errorCounts = new Map<string, number>();
    for (const r of myReviews.filter((x) => x.verdict === "REVISION_REQUIRED")) {
      for (const c of QC_CHECKS) {
        if (!r[c.key as keyof AnyReview]) {
          errorCounts.set(c.key, (errorCounts.get(c.key) ?? 0) + 1);
        }
      }
    }
    const topErrors = [...errorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    const open = mine.filter((t) => t.status !== "APPROVED").length;
    return { mine, ffTotal, ffPass, revisions, avgScene, topErrors, open };
  };

  const roomRevisions = reviews.filter((r) => r.verdict === "REVISION_REQUIRED").length;
  const roomApprovedTasks = tasks.filter((t) => t.status === "APPROVED").length;

  return (
    <div className="space-y-4">
      <section aria-label="KPI từng khối" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <h2 className="font-display font-bold">KPI từng khối — 5 khối giám đốc báo thẳng Tổng giám đốc</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Tính từ việc thật trên kênh TASK theo phòng thuộc khối: tổng việc, tỉ lệ Đạt, số việc đang Làm lại
          (gồm cả việc bị VETO đẩy về) và việc quá hạn chốt. Khối nào chưa có việc qua kênh TASK thì hiện 0 —
          không ước lượng.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {ORG_BLOCKS.map((b) => {
            const mine = tasks.filter((t) => b.rooms.includes(t.room));
            const approvedN = mine.filter((t) => t.status === "APPROVED").length;
            const revisionN = mine.filter((t) => t.status === "REVISION_REQUIRED").length;
            const overdue = mine.filter(
              (t) => t.status !== "APPROVED" && Date.now() - new Date(t.created_at).getTime() > 3 * 86400000,
            ).length;
            const rate = mine.length > 0 ? Math.round((approvedN / mine.length) * 100) : null;
            return (
              <div key={b.key} className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2">
                <p className="font-display text-sm font-bold">{b.name}</p>
                <p className="text-xs text-[var(--dim)]">{staffById(b.directorId).name} — {b.directorTitle}</p>
                <dl className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--dim)]">Tổng việc</dt>
                    <dd className="font-display text-lg font-bold">{mine.length}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--dim)]">Tỉ lệ Đạt</dt>
                    <dd className="font-display text-lg font-bold">{rate != null ? `${rate}%` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--dim)]">Đang làm lại</dt>
                    <dd className="font-display text-lg font-bold">{revisionN}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--dim)]">Quá 3 ngày chưa chốt</dt>
                    <dd className={`font-display text-lg font-bold ${overdue > 0 ? "text-red-600" : ""}`}>{overdue}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </section>
      <section aria-label="KPI Phòng Video" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <h2 className="font-display font-bold">KPI Phòng Video (tính từ dữ liệu việc + QC đã lưu)</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Tổng việc: {tasks.length} · Đã Đạt: {roomApprovedTasks} · Tổng vòng làm lại toàn phòng: {roomRevisions} ·
          Tổng lượt QC: {reviews.length}
        </p>
        {tasks.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--dim)]">Chưa có dữ liệu — KPI sẽ tự hiện khi có việc và lượt QC đầu tiên.</p>
        ) : null}
      </section>

      {VIDEO_TEAM.map((id) => {
        const s = staffById(id);
        const k = staffKpi(id);
        const profile = profileOf(id);
        const quotaUsed = profile?.quota_used_pct ?? 0;
        return (
          <section key={id} aria-label={`KPI ${s.name}`} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <Avatar member={s} size={36} />
              <div>
                <h3 className="font-display font-bold leading-tight">{s.name}</h3>
                <p className="text-xs text-[var(--dim)]">{s.role}</p>
              </div>
              <span className="ml-auto text-sm text-[var(--dim)]">
                {k.open > 0 ? `Đang giữ ${k.open} việc chưa chốt` : "Rảnh — không giữ việc nào"}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2">
                <dt className="text-xs text-[var(--dim)]">Đạt khung đầu lần đầu</dt>
                <dd className="font-display text-lg font-bold">
                  {k.ffTotal > 0 ? `${Math.round((k.ffPass / k.ffTotal) * 100)}% (${k.ffPass}/${k.ffTotal})` : "—"}
                </dd>
              </div>
              <div className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2">
                <dt className="text-xs text-[var(--dim)]">Số vòng làm lại</dt>
                <dd className="font-display text-lg font-bold">{k.revisions}</dd>
              </div>
              <div className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2">
                <dt className="text-xs text-[var(--dim)]">Thời lượng TB / cảnh</dt>
                <dd className="font-display text-lg font-bold">{k.avgScene != null ? `${k.avgScene.toFixed(1)}s` : "—"}</dd>
              </div>
              <div className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2">
                <dt className="text-xs text-[var(--dim)]">Hạn mức đã tiêu</dt>
                <dd className="font-display text-lg font-bold">{profile ? `${quotaUsed}%` : "Chưa ghi"}</dd>
              </div>
              <div className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2">
                <dt className="text-xs text-[var(--dim)]">Năng lực ghế</dt>
                <dd className="text-sm font-semibold">{profile ? CAPABILITY_LABELS[profile.capability] : "Chưa khảo sát"}</dd>
              </div>
              <div className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2">
                <dt className="text-xs text-[var(--dim)]">Lỗi hay gặp</dt>
                <dd className="text-xs font-medium leading-snug">
                  {k.topErrors.length > 0
                    ? k.topErrors.map(([key, n]) => `${checkLabels[key]} (${n})`).join("; ")
                    : "Chưa có lỗi bị trả"}
                </dd>
              </div>
            </dl>
            <ProfileEditor staffId={id} profile={profile} />
          </section>
        );
      })}
      <section aria-label="Hồ sơ năng lực các phòng ban" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <h2 className="font-display font-bold">Hồ sơ năng lực — các phòng ban</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Toàn bộ phòng ban đã mở và đủ đội hình 1 trưởng phòng + 2 nhân viên (có nam có nữ, có tên riêng). Hồ sơ
          năng lực của từng ghế ghi ở đây để giao việc đúng người; ghế nào chưa có việc thật thì đang thư giãn trong
          văn phòng, có việc giao là vào bàn làm ngay.
        </p>
        <div className="mt-2 space-y-3">
          {STAFF.filter((s) => s.id !== "tong-giam-doc" && !VIDEO_TEAM.includes(s.id)).map((s) => (
            <div key={s.id} className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Avatar member={s} size={26} />
                <span className="font-semibold">{s.name} · {s.gender}</span>
                <span className="text-[var(--dim)]">{s.role}</span>
              </p>
              <ProfileEditor staffId={s.id} profile={profileOf(s.id)} />
            </div>
          ))}
        </div>
      </section>
      <p className="text-xs text-[var(--dim)]">
        Hồ sơ năng lực do Đạo diễn cập nhật sau mỗi lần khảo sát ghế (dựng được video hay chỉ tạo ảnh động) và theo
        hạn mức media thực tế của ghế — không giao quá tải: mục Giao việc cảnh báo khi một ghế đang giữ từ 3 việc chưa chốt.
      </p>
    </div>
  );
}

function ReportView({ tasks, products }: { tasks: Task[]; products: Product[] }) {
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: () => api.listProfiles({}) });
  const profileRows: Profile[] = profiles.data?.profiles ?? [];
  // Quản trị từ SỔ THẬT: quyết định đã ghi, VETO đang hiệu lực, rủi
  // ro mức cao còn mở và kết quả bỏ phiếu của Hội đồng cố vấn — đọc
  // thẳng từ các sổ quản trị, không gõ tay.
  const govDecisions = useQuery({ queryKey: ["decisions"], queryFn: () => api.listDecisions({}) });
  const govVetoes = useQuery({ queryKey: ["vetoes"], queryFn: () => api.listVetoes({}) });
  const govRisks = useQuery({ queryKey: ["risks"], queryFn: () => api.listRisks({}) });
  const govProposals = useQuery({ queryKey: ["proposals"], queryFn: () => api.listProposals({}) });
  // Báo cáo sáng TỰ ĐỘNG TỪ NHẬT KÝ THẬT: toàn bộ số liệu dưới đây
  // đếm từ các dòng nhật ký của ngày hôm qua (kiểm toán + báo cáo
  // khâu + biên bản) — không gõ tay, không ước lượng.
  const yWindow = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 1);
    return { start: start.getTime(), end: start.getTime() + 86400000 };
  }, []);
  const yJournalQ = useQuery({
    queryKey: ["journal", "report-yesterday", yWindow.start],
    queryFn: () =>
      api.listJournal({ day_start_ms: yWindow.start, day_end_ms: yWindow.end, room: "", staff_id: "", limit: 300 }),
  });
  const yEntries = yJournalQ.data?.entries ?? [];
  const yDone = yEntries.filter((e) => journalStatusOf(e) === "done");
  const yErr = yEntries.filter((e) => journalStatusOf(e) === "error");
  const yWait = yEntries.filter((e) => journalStatusOf(e) === "waiting");
  const yMeet = yEntries.filter((e) => e.kind === "hop");
  const today = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const done = tasks.filter((t) => t.status === "APPROVED");
  const stuck = tasks.filter((t) => t.status === "REVISION_REQUIRED" || t.status === "REVIEW");
  const needsCeo = tasks.filter(
    (t) =>
      t.gate_brief === "PENDING" ||
      t.gate_frame === "PENDING" ||
      (t.status === "APPROVED" && t.gate_final === "PENDING"),
  );
  const publishable = products.filter((p) => p.publishable);

  const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <h2 className="font-display font-bold">{title}</h2>
      <div className="mt-1.5 text-sm">{children}</div>
    </section>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <header>
        <h2 className="font-display text-2xl font-bold">Báo cáo sáng — {today}</h2>
        <p className="text-sm text-[var(--dim)]">
          Một trang cho Tổng giám đốc, tổng hợp từ dữ liệu việc thật trong văn phòng. Việc lẻ ở giữa Đạo diễn tự xử,
          báo cáo này chỉ nêu: đã xong gì, đang kẹt gì, cần Tổng giám đốc quyết gì.
        </p>
      </header>
      <Block title="Nhật ký hôm qua — tự tổng hợp từ nhật ký thật">
        {yJournalQ.isPending ? (
          <p className="text-[var(--dim)]">Đang đọc nhật ký hôm qua…</p>
        ) : yEntries.length === 0 ? (
          <p className="text-[var(--dim)]">Hôm qua chưa có dòng nhật ký nào — công ty chưa ghi nhận hoạt động nào trong ngày hôm qua.</p>
        ) : (
          <>
            <p>
              Hôm qua công ty ghi <strong>{yEntries.length}</strong> dòng nhật ký:{" "}
              <strong>{yDone.length}</strong> mốc ĐÃ XONG · <strong>{yErr.length}</strong> lỗi / trượt QC ·{" "}
              <strong>{yWait.length}</strong> mục chờ chốt · <strong>{yMeet.length}</strong> cuộc họp / biên bản.
            </p>
            {yDone.length > 0 ? (
              <>
                <p className="mt-2 font-semibold">Đã xong hôm qua:</p>
                <ul className="list-inside list-disc space-y-1">
                  {yDone.slice(0, 8).map((e) => (
                    <li key={e.key}>
                      [{fmtClock(e.time)}] {e.actor} — {e.title}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {yErr.length > 0 ? (
              <>
                <p className="mt-2 font-semibold text-red-700">Lỗi / trượt QC hôm qua:</p>
                <ul className="list-inside list-disc space-y-1">
                  {yErr.slice(0, 5).map((e) => (
                    <li key={e.key}>
                      [{fmtClock(e.time)}] {e.actor} — {e.title}
                      {e.detail ? `: ${e.detail}` : ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {yWait.length > 0 ? (
              <p className="mt-2">
                Đang chờ chốt từ hôm qua: {yWait.slice(0, 4).map((e) => e.title).join(" · ")}
              </p>
            ) : null}
          </>
        )}
      </Block>
      <Block title="Quản trị & rủi ro — từ sổ thật của công ty">
        {(() => {
          const decs = govDecisions.data?.decisions ?? [];
          const vets = (govVetoes.data?.vetoes ?? []).filter((v) => v.active);
          const highRisks = (govRisks.data?.risks ?? []).filter((r) => r.status !== "closed" && r.severity === "high");
          const openRisks = (govRisks.data?.risks ?? []).filter((r) => r.status === "open");
          const props = govProposals.data?.proposals ?? [];
          const adopted = props.filter((p) => p.status === "ADOPTED");
          const openProps = props.filter((p) => p.status === "OPEN");
          if (decs.length === 0 && vets.length === 0 && highRisks.length === 0 && props.length === 0) {
            return (
              <p className="text-[var(--dim)]">
                Sổ quyết định, sổ VETO, bảng rủi ro và biên bản Hội đồng cố vấn chưa có mục nào cần báo — quản
                trị đang yên.
              </p>
            );
          }
          return (
            <>
              <p>
                Sổ quyết định đã ghi <strong>{decs.length}</strong> quyết định · VETO đang hiệu lực:{" "}
                <strong>{vets.length}</strong> · Rủi ro mức CAO còn mở: <strong>{highRisks.length}</strong> ·
                Rủi ro đang mở: <strong>{openRisks.length}</strong> · Hội đồng cố vấn:{" "}
                <strong>{adopted.length}</strong> khuyến nghị đã đạt 3/5, <strong>{openProps.length}</strong>{" "}
                đề xuất đang bỏ phiếu.
              </p>
              {vets.length > 0 ? (
                <>
                  <p className="mt-2 font-semibold text-red-700">VETO đang chặn:</p>
                  <ul className="list-inside list-disc space-y-1">
                    {vets.slice(0, 5).map((v) => (
                      <li key={v.id}>
                        [{v.reason_code}] {v.target} — {v.reason}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {highRisks.length > 0 ? (
                <>
                  <p className="mt-2 font-semibold text-red-700">Rủi ro CAO cần Chủ tịch biết:</p>
                  <ul className="list-inside list-disc space-y-1">
                    {highRisks.slice(0, 5).map((r) => (
                      <li key={r.id}>
                        [{RISK_CATEGORY_LABELS[r.category]}] {r.title}
                        {r.owner ? ` — phụ trách: ${r.owner}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {decs.length > 0 ? (
                <p className="mt-2">
                  Quyết định mới nhất: {decs.slice(0, 3).map((d) => `"${d.title}"`).join(" · ")}
                </p>
              ) : null}
            </>
          );
        })()}
      </Block>
      <Block title={`Việc đã xong (${done.length})`}>
        {done.length === 0 ? (
          <p className="text-[var(--dim)]">Chưa có việc nào chốt Đạt.</p>
        ) : (
          <ul className="list-inside list-disc space-y-1">
            {done.map((t) => (
              <li key={t.id}>
                #{t.id} {t.title} — {staffById(t.assignee).name}
                {t.gate_final === "APPROVED" ? " · Tổng giám đốc đã duyệt bản cuối" : " · chờ duyệt bản cuối (Cổng 3)"}
              </li>
            ))}
          </ul>
        )}
        {publishable.length > 0 ? (
          <p className="mt-1">Sản phẩm được đăng đã vào kho: {publishable.map((p) => `"${p.title}"`).join(", ")}.</p>
        ) : null}
      </Block>
      <Block title={`Việc đang kẹt (${stuck.length})`}>
        {stuck.length === 0 ? (
          <p className="text-[var(--dim)]">Không có việc nào đang kẹt ở Chờ duyệt / Làm lại.</p>
        ) : (
          <ul className="list-inside list-disc space-y-1">
            {stuck.map((t) => (
              <li key={t.id}>
                #{t.id} {t.title} — {STATUS_META[t.status].label}, phụ trách {staffById(t.assignee).name}
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block title={`Cần Tổng giám đốc quyết (${needsCeo.length})`}>
        {needsCeo.length === 0 ? (
          <p className="text-[var(--dim)]">Không có cổng duyệt nào đang chờ.</p>
        ) : (
          <ul className="list-inside list-disc space-y-1">
            {needsCeo.map((t) => (
              <li key={t.id}>
                #{t.id} {t.title} — chờ:{" "}
                {[
                  t.gate_brief === "PENDING" ? "Cổng 1 duyệt brief" : null,
                  t.gate_frame === "PENDING" ? "Cổng 2 duyệt khung đầu mẫu" : null,
                  t.status === "APPROVED" && t.gate_final === "PENDING" ? "Cổng 3 duyệt bản cuối" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block title="Hạn mức media đã tiêu theo ghế">
        {profileRows.length === 0 ? (
          <p className="text-[var(--dim)]">Chưa ghế nào ghi hạn mức — Đạo diễn cập nhật ở mục KPI & Năng lực sau mỗi lần khảo sát.</p>
        ) : (
          <ul className="list-inside list-disc space-y-1">
            {profileRows.map((p) => (
              <li key={p.staff_id}>
                {staffById(p.staff_id).name}: đã dùng {p.quota_used_pct}% hạn mức tuần
                {p.quota_used_pct >= 90 ? " — SẮP CHẠM TRẦN, không giao thêm việc tốn media" : ""}
                {p.note ? ` (${p.note})` : ""}
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}

const JOURNAL_KIND_META: Record<string, { label: string; color: string }> = {
  viec: { label: "Việc", color: "#22c55e" },
  chat: { label: "Trò chuyện", color: "#38bdf8" },
  hop: { label: "Họp", color: "#f59e0b" },
  "doi-song": { label: "Đời sống", color: "#f472b6" },
  khac: { label: "Khác", color: "#8b87a0" },
};

function JournalView() {
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const [date, setDate] = useState(today);
  const [allDays, setAllDays] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [staffId, setStaffId] = useState("");
  const dayStart = allDays ? 0 : new Date(`${date}T00:00:00`).getTime();
  const dayEnd = allDays ? 0 : dayStart + 86400000;
  const journalQ = useQuery({
    queryKey: ["journal", dayStart, dayEnd, roomId, staffId],
    queryFn: () => api.listJournal({ day_start_ms: dayStart, day_end_ms: dayEnd, room: roomId, staff_id: staffId, limit: 300 }),
    refetchInterval: 15000,
  });
  const entries = journalQ.data?.entries ?? [];
  const roomName = (id: string) => ROOMS.find((r) => r.id === id)?.name ?? (id ? id : "—");
  const fmtDayTime = (iso: string) =>
    new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <p className="text-sm text-[var(--dim)]">
        Nhật ký làm việc của toàn công ty, ghi theo thời gian: ai làm gì, lúc nào — giao việc nào, nộp gì,
        QC duyệt hay làm lại, họp nào, khen thưởng, nhắc nhở, cả chào hỏi và tán gẫu giờ nghỉ. Lọc theo
        ngày, theo phòng hoặc theo từng người.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Ngày</span>
          <input
            type="date"
            aria-label="Chọn ngày xem nhật ký"
            value={date}
            disabled={allDays}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-11 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 disabled:opacity-50"
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={allDays} onChange={(e) => setAllDays(e.target.checked)} className="h-4 w-4" />
          Tất cả các ngày
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Phòng ban</span>
          <select aria-label="Lọc theo phòng ban" value={roomId} onChange={(e) => setRoomId(e.target.value)} className="min-h-11 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2">
            <option value="">Tất cả phòng ban</option>
            {ROOMS.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Nhân viên</span>
          <select aria-label="Lọc theo nhân viên" value={staffId} onChange={(e) => setStaffId(e.target.value)} className="min-h-11 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2">
            <option value="">Tất cả nhân viên</option>
            {STAFF.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      </div>
      {journalQ.isPending ? (
        <p className="text-sm text-[var(--dim)]">Đang tải nhật ký…</p>
      ) : entries.length === 0 ? (
        <EmptyNote>Chưa có hoạt động nào khớp bộ lọc này. Đổi ngày, phòng hoặc người để xem thêm.</EmptyNote>
      ) : (
        <ol className="space-y-2">
          {entries.map((e) => {
            const meta = JOURNAL_KIND_META[e.kind] ?? JOURNAL_KIND_META["khac"]!;
            return (
              <li key={e.key} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="font-medium">{e.title}</span>
                  <span className="text-xs text-[var(--dim)]">
                    {fmtDayTime(e.time)} · {e.actor || "—"} · {roomName(e.room)}
                  </span>
                </p>
                {e.detail ? <p className="mt-0.5 whitespace-pre-wrap text-[var(--dim)]">{e.detail}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function AuditView() {
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.listAudit({ limit: 100 }) });
  const rows: AuditEntry[] = audit.data?.entries ?? [];
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-3 text-sm text-[var(--dim)]">
        Mọi lần giao việc, nhận việc, chuyển trạng thái, nộp, QC duyệt và quyết định ở 3 cổng của Tổng giám đốc
        đều ghi lại ở đây: ai làm, làm gì, lúc nào. QC độc lập — người làm không tự duyệt việc của mình.
      </p>
      {audit.isPending ? (
        <p className="text-sm text-[var(--dim)]">Đang tải nhật ký…</p>
      ) : rows.length === 0 ? (
        <EmptyNote>Nhật ký đang trống — thao tác đầu tiên của công ty sẽ được ghi tại đây.</EmptyNote>
      ) : (
        <ol className="space-y-2">
          {rows.map((e) => (
            <li key={e.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm">
              <span className="font-medium">{e.action}</span>{" "}
              <span className="text-xs text-[var(--dim)]">
                · {e.actor || "—"} · {fmtTime(e.created_at)}
              </span>
              {e.detail ? <span className="mt-0.5 block text-[var(--dim)]">{e.detail}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const GOV_INPUT =
  "min-h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm";
const GOV_BTN =
  "min-h-10 rounded-[var(--radius)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60";

function DecisionsPanel() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["decisions"], queryFn: () => api.listDecisions({}) });
  const rows: Decision[] = q.data?.decisions ?? [];
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [by, setBy] = useState<"chu-tich" | "tong-giam-doc">("chu-tich");
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: async () =>
      await api.addDecision({ title: title.trim(), body: body.trim(), decided_by: by, actor: "Văn thư" }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["decisions"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const submit = () => {
    if (!title.trim()) {
      setError("Ghi tiêu đề quyết định trước khi lưu vào sổ.");
      return;
    }
    mut.mutate();
  };
  return (
    <section aria-label="Sổ quyết định" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <h3 className="font-display font-bold">Sổ quyết định — Văn phòng Chủ tịch giữ sổ</h3>
      <p className="mt-1 text-sm text-[var(--dim)]">
        Mọi quyết định của Chủ tịch và Tổng giám đốc đều ghi vào sổ này qua Văn thư — truy lại được theo ngày,
        không quyết miệng ngoài sổ.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Tiêu đề quyết định *</span>
          <input {...FIELDS.addDecision.title} value={title} onChange={(e) => setTitle(e.target.value)} className={GOV_INPUT} placeholder="vd: Chốt định dạng video tuần này…" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Người quyết</span>
          <select aria-label="Người quyết" value={by} onChange={(e) => setBy(e.target.value as typeof by)} className={GOV_INPUT}>
            <option value="chu-tich">Chủ tịch Hưởng</option>
            <option value="tong-giam-doc">Tổng giám đốc Muse</option>
          </select>
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="mb-1 block font-medium">Nội dung quyết định</span>
          <textarea {...FIELDS.addDecision.body} value={body} onChange={(e) => setBody(e.target.value)} rows={2} className={GOV_INPUT} placeholder="Quyết gì, áp dụng từ khi nào, ai thực hiện…" />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={mut.isPending} onClick={submit} className={GOV_BTN}>
          Ghi vào Sổ quyết định
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
      {q.isPending ? (
        <p className="mt-3 text-sm text-[var(--dim)]">Đang mở sổ…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--dim)]">Sổ còn trống — chưa có quyết định nào được ghi.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {rows.map((d) => (
            <li key={d.id} className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2 text-sm">
              <p className="font-semibold">
                {d.title}{" "}
                <span className="ml-1 rounded-full bg-[#241b4d] px-2 py-0.5 text-xs font-bold text-white">
                  {d.decided_by === "chu-tich" ? "Chủ tịch quyết" : "TGĐ quyết"}
                </span>
              </p>
              {d.body ? <p className="mt-0.5">{d.body}</p> : null}
              <p className="mt-0.5 text-xs text-[var(--dim)]">Ghi sổ {fmtTime(d.created_at)} · Văn thư giữ sổ</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ProposalCard({ p }: { p: Proposal }) {
  const queryClient = useQueryClient();
  const [member, setMember] = useState<string>(COUNCIL_MEMBERS[0]?.staffId ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: async (vote: "YES" | "NO") =>
      await api.castVote({
        proposal_id: p.id,
        member: member as "tp-chien-luoc" | "tp-phap-che" | "tp-tai-chinh" | "gd-chat-luong" | "tp-cong-nghe",
        vote,
        note: note.trim(),
      }),
    onSuccess: () => {
      setNote("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const statusBadge =
    p.status === "ADOPTED"
      ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"
      : p.status === "REJECTED"
        ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200"
        : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  const statusLabel =
    p.status === "ADOPTED"
      ? `ĐÃ THÀNH KHUYẾN NGHỊ (${p.yes}/5 đồng ý)`
      : p.status === "REJECTED"
        ? `KHÔNG ĐẠT (${p.no}/5 phản đối)`
        : `Đang bỏ phiếu — ${p.yes} đồng ý · ${p.no} phản đối (cần 3/5)`;
  return (
    <li className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2.5 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{p.title}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusBadge}`}>{statusLabel}</span>
      </p>
      {p.detail ? <p className="mt-0.5">{p.detail}</p> : null}
      <p className="mt-0.5 text-xs text-[var(--dim)]">
        Đề xuất bởi {p.proposer || "—"} · mở {fmtTime(p.created_at)}
        {p.closed_at ? ` · chốt biên bản ${fmtTime(p.closed_at)}` : ""}
      </p>
      <div className="mt-2" aria-label={`Thanh tỉ lệ phiếu đề xuất ${p.id}`}>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--border)]">
          <div className="bg-green-500" style={{ width: `${(p.yes / 5) * 100}%` }} />
          <div className="bg-red-500" style={{ width: `${(p.no / 5) * 100}%` }} />
        </div>
        <p className="mt-1 text-xs text-[var(--dim)]">Ngưỡng khuyến nghị: 3/5 đồng ý · mỗi thành viên 1 phiếu, đổi phiếu thì phiếu mới thay phiếu cũ trong biên bản.</p>
      </div>
      {p.votes.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
          {p.votes.map((v) => (
            <li key={v.member} className="text-xs">
              <strong>{staffById(v.member).name}</strong> ({COUNCIL_MEMBERS.find((m) => m.staffId === v.member)?.seat ?? ""}) —{" "}
              {v.vote === "YES" ? "ĐỒNG Ý" : "PHẢN ĐỐI"}
              {v.note ? `: ${v.note}` : ""} · {fmtTime(v.created_at)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--dim)]">Biên bản bỏ phiếu: chưa có phiếu nào.</p>
      )}
      {p.status === "OPEN" ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Thành viên bỏ phiếu</span>
            <select aria-label={`Thành viên bỏ phiếu cho đề xuất ${p.id}`} value={member} onChange={(e) => setMember(e.target.value)} className={GOV_INPUT}>
              {COUNCIL_MEMBERS.map((m) => (
                <option key={m.staffId} value={m.staffId}>
                  {staffById(m.staffId).name} — {m.seat}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Ý kiến ghi biên bản</span>
            <input {...FIELDS.castVote.note} aria-label={`Ý kiến biên bản đề xuất ${p.id}`} value={note} onChange={(e) => setNote(e.target.value)} className={GOV_INPUT} placeholder="Lý do đồng ý / phản đối…" />
          </label>
          <div className="flex items-end gap-2">
            <button type="button" disabled={mut.isPending} onClick={() => mut.mutate("YES")} className="min-h-10 rounded-[var(--radius)] bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
              Đồng ý
            </button>
            <button type="button" disabled={mut.isPending} onClick={() => mut.mutate("NO")} className="min-h-10 rounded-[var(--radius)] bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
              Phản đối
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </li>
  );
}

function CouncilPanel() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["proposals"], queryFn: () => api.listProposals({}) });
  const rows: Proposal[] = q.data?.proposals ?? [];
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [proposer, setProposer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: async () =>
      await api.createProposal({ title: title.trim(), detail: detail.trim(), proposer: proposer.trim() }),
    onSuccess: () => {
      setTitle("");
      setDetail("");
      setProposer("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const submit = () => {
    if (!title.trim()) {
      setError("Ghi tiêu đề đề xuất trước khi mở bỏ phiếu.");
      return;
    }
    mut.mutate();
  };
  return (
    <section aria-label="Hội đồng cố vấn" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <h3 className="font-display font-bold">Hội đồng cố vấn — 5 người, khuyến nghị khi 3/5 đồng ý</h3>
      <p className="mt-1 text-sm text-[var(--dim)]">
        Hội đồng chỉ KHUYẾN NGHỊ — Chủ tịch và Tổng giám đốc quyết cuối. Mọi phiếu đều vào biên bản bỏ phiếu,
        ai đồng ý ai phản đối truy lại được.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Đề xuất *</span>
          <input {...FIELDS.createProposal.title} value={title} onChange={(e) => setTitle(e.target.value)} className={GOV_INPUT} placeholder="vd: Thử định dạng Shorts mới…" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Người đề xuất</span>
          <input {...FIELDS.createProposal.proposer} value={proposer} onChange={(e) => setProposer(e.target.value)} className={GOV_INPUT} placeholder="vd: Trưởng phòng Chiến lược" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Chi tiết</span>
          <input {...FIELDS.createProposal.detail} value={detail} onChange={(e) => setDetail(e.target.value)} className={GOV_INPUT} placeholder="Căn cứ, rủi ro, kỳ vọng…" />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={mut.isPending} onClick={submit} className={GOV_BTN}>
          Mở đề xuất bỏ phiếu
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
      {q.isPending ? (
        <p className="mt-3 text-sm text-[var(--dim)]">Đang tải đề xuất…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--dim)]">Chưa có đề xuất nào — hội đồng chưa họp việc gì.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((p) => (
            <ProposalCard key={p.id} p={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function VetoPanel({ tasks }: { tasks: Task[] }) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["vetoes"], queryFn: () => api.listVetoes({}) });
  const rows: Veto[] = q.data?.vetoes ?? [];
  const active = rows.filter((v) => v.active);
  const [taskId, setTaskId] = useState<string>("");
  const [target, setTarget] = useState("");
  const [code, setCode] = useState<string>("CL-01");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: async () =>
      await api.issueVeto({
        task_id: taskId ? Number(taskId) : null,
        target: target.trim(),
        reason_code: code as "BQ-01" | "BQ-02" | "CL-01" | "CL-02" | "AT-01" | "AT-02" | "KH-01",
        reason: reason.trim(),
        actor: "GĐ Chất lượng",
      }),
    onSuccess: () => {
      setTaskId("");
      setTarget("");
      setReason("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["vetoes"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const lift = useMutation({
    mutationFn: async (id: number) => await api.liftVeto({ id, actor: "GĐ Chất lượng" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vetoes"] });
      void queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const submit = () => {
    if (!reason.trim()) {
      setError("VETO bắt buộc ghi lý do cụ thể — không chặn miệng.");
      return;
    }
    if (!taskId && !target.trim()) {
      setError("Chọn một việc hoặc ghi tên sản phẩm bị chặn.");
      return;
    }
    mut.mutate();
  };
  return (
    <section aria-label="Quyền VETO của Khối Chất lượng" className="rounded-[var(--radius)] border border-red-300 bg-[var(--surface)] px-4 py-3 dark:border-red-900">
      <h3 className="font-display font-bold text-red-700 dark:text-red-300">Quyền VETO — Khối Chất lượng (đang hiệu lực: {active.length})</h3>
      <p className="mt-1 text-sm text-[var(--dim)]">
        VETO dừng ngay sản phẩm lỗi: việc bị VETO bị đẩy về Làm lại (dây chuyền đang chạy thì DỪNG kèm mã VETO),
        bắt buộc ghi MÃ LÝ DO — sửa xong đúng mã đó, gỡ VETO rồi QC duyệt lại từ đầu mới qua được.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Việc bị VETO (kênh TASK)</span>
          <select aria-label="Việc bị VETO" value={taskId} onChange={(e) => setTaskId(e.target.value)} className={GOV_INPUT}>
            <option value="">— Không gắn việc, ghi tay đối tượng bên cạnh —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.id} {t.title} ({STATUS_META[t.status].label})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Đối tượng (khi không gắn việc)</span>
          <input {...FIELDS.issueVeto.target} value={target} onChange={(e) => setTarget(e.target.value)} className={GOV_INPUT} placeholder="vd: Bản mẫu tập 03…" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Mã lý do *</span>
          <select aria-label="Mã lý do VETO" value={code} onChange={(e) => setCode(e.target.value)} className={GOV_INPUT}>
            {VETO_CODES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Lý do cụ thể *</span>
          <input {...FIELDS.issueVeto.reason} value={reason} onChange={(e) => setReason(e.target.value)} className={GOV_INPUT} placeholder="Lỗi ở đâu, sửa thế nào mới hết…" />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={mut.isPending} onClick={submit} className="min-h-10 rounded-[var(--radius)] bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
          Phát VETO
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
      {q.isPending ? (
        <p className="mt-3 text-sm text-[var(--dim)]">Đang tải sổ VETO…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--dim)]">Chưa có lệnh VETO nào — chất lượng đang thông suốt.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((v) => (
            <li key={v.id} className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">VETO {v.reason_code}</span>
                <span className="font-semibold">{v.target}</span>
                {v.active ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-900 dark:bg-red-950 dark:text-red-200">ĐANG CHẶN</span>
                ) : (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-900 dark:bg-green-950 dark:text-green-200">
                    Đã gỡ {v.lifted_at ? fmtTime(v.lifted_at) : ""} bởi {v.lifted_by}
                  </span>
                )}
              </p>
              <p className="mt-0.5">{v.reason}</p>
              <p className="mt-0.5 text-xs text-[var(--dim)]">
                {VETO_CODES.find((c) => c.code === v.reason_code)?.label ?? ""} · phát bởi GĐ Chất lượng · {fmtTime(v.created_at)}
              </p>
              {v.active ? (
                <button
                  type="button"
                  disabled={lift.isPending}
                  onClick={() => lift.mutate(v.id)}
                  aria-label={`Gỡ VETO ${v.reason_code} cho ${v.target}`}
                  className="mt-1.5 min-h-9 rounded-[var(--radius)] border border-green-600 px-3 py-1 text-sm font-medium text-green-700 disabled:opacity-60 dark:text-green-300"
                >
                  Đã sửa xong — gỡ VETO
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const RISK_CATEGORY_LABELS: Record<Risk["category"], string> = {
  copyright: "Bản quyền",
  account: "An toàn tài khoản",
  platform: "Chính sách nền tảng",
  other: "Khác",
};
const RISK_SEVERITY_LABELS: Record<Risk["severity"], string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "CAO",
};
const RISK_STATUS_LABELS: Record<Risk["status"], string> = {
  open: "Đang mở",
  monitoring: "Đang theo dõi",
  closed: "Đã đóng",
};

function RiskPanel() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["risks"], queryFn: () => api.listRisks({}) });
  const rows: Risk[] = q.data?.risks ?? [];
  const openHigh = rows.filter((r) => r.status !== "closed" && r.severity === "high");
  const [category, setCategory] = useState<Risk["category"]>("copyright");
  const [severity, setSeverity] = useState<Risk["severity"]>("medium");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: async () =>
      await api.addRisk({ category, severity, title: title.trim(), detail: detail.trim(), owner: owner.trim(), actor: "Kiểm toán" }),
    onSuccess: () => {
      setTitle("");
      setDetail("");
      setOwner("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["risks"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const setStatus = useMutation({
    mutationFn: async (args: { id: number; status: Risk["status"] }) =>
      await api.setRiskStatus({ id: args.id, status: args.status, actor: "Kiểm toán" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["risks"] }),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const submit = () => {
    if (!title.trim()) {
      setError("Ghi tên rủi ro trước khi đưa lên bảng.");
      return;
    }
    mut.mutate();
  };
  return (
    <section aria-label="Bảng rủi ro" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <h3 className="font-display font-bold">Bảng rủi ro — bản quyền & an toàn tài khoản</h3>
      <p className="mt-1 text-sm text-[var(--dim)]">
        Kiểm toán nội bộ và Khối Chất lượng cùng giữ bảng này. Rủi ro mức CAO còn mở sẽ nổi đỏ lên Báo cáo sáng
        trình Chủ tịch.
        {openHigh.length > 0 ? <strong className="text-red-600"> Hiện có {openHigh.length} rủi ro CAO đang mở.</strong> : null}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Loại rủi ro</span>
          <select aria-label="Loại rủi ro" value={category} onChange={(e) => setCategory(e.target.value as Risk["category"])} className={GOV_INPUT}>
            {Object.entries(RISK_CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Mức độ</span>
          <select aria-label="Mức độ rủi ro" value={severity} onChange={(e) => setSeverity(e.target.value as Risk["severity"])} className={GOV_INPUT}>
            {Object.entries(RISK_SEVERITY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Tên rủi ro *</span>
          <input {...FIELDS.addRisk.title} value={title} onChange={(e) => setTitle(e.target.value)} className={GOV_INPUT} placeholder="vd: Nhạc nền tập mới chưa rõ quyền…" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Người phụ trách xử lý</span>
          <input {...FIELDS.addRisk.owner} value={owner} onChange={(e) => setOwner(e.target.value)} className={GOV_INPUT} placeholder="vd: Pháp chế / CTO" />
        </label>
        <label className="block text-xs sm:col-span-2 lg:col-span-4">
          <span className="mb-1 block font-medium">Chi tiết & cách xử lý</span>
          <input {...FIELDS.addRisk.detail} value={detail} onChange={(e) => setDetail(e.target.value)} className={GOV_INPUT} placeholder="Nguy cơ ở đâu, đang xử lý thế nào…" />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={mut.isPending} onClick={submit} className={GOV_BTN}>
          Đưa lên bảng rủi ro
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
      {q.isPending ? (
        <p className="mt-3 text-sm text-[var(--dim)]">Đang tải bảng rủi ro…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--dim)]">Bảng rủi ro đang trống — chưa ghi nhận rủi ro nào.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-2 rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.severity === "high" ? "bg-red-600 text-white" : r.severity === "medium" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-[var(--border)]"}`}>
                    {RISK_SEVERITY_LABELS[r.severity]}
                  </span>
                  <span className="font-semibold">{r.title}</span>
                  <span className="text-xs text-[var(--dim)]">{RISK_CATEGORY_LABELS[r.category]}{r.owner ? ` · phụ trách: ${r.owner}` : ""}</span>
                </p>
                {r.detail ? <p className="mt-0.5">{r.detail}</p> : null}
                <p className="text-xs text-[var(--dim)]">Ghi {fmtTime(r.created_at)} · cập nhật {fmtTime(r.updated_at)}</p>
              </div>
              <label className="block text-xs">
                <span className="sr-only">Trạng thái rủi ro {r.title}</span>
                <select
                  aria-label={`Trạng thái rủi ro ${r.title}`}
                  value={r.status}
                  disabled={setStatus.isPending}
                  onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value as Risk["status"] })}
                  className="min-h-9 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
                >
                  {Object.entries(RISK_STATUS_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PLATFORM_LABELS: Record<Channel["platform"], string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
};
const CHANNEL_STATUS_LABELS: Record<Channel["status"], string> = {
  active: "Đang hoạt động",
  paused: "Tạm dừng",
  risk: "Có rủi ro — cần xử lý",
};

function ChannelsPanel() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["channels"], queryFn: () => api.listChannels({}) });
  const rows: Channel[] = q.data?.channels ?? [];
  const [platform, setPlatform] = useState<Channel["platform"]>("youtube");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [status, setStatus] = useState<Channel["status"]>("active");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: async () =>
      await api.upsertChannel({ id: null, platform, name: name.trim(), handle: handle.trim(), status, note: note.trim(), actor: "Tổng quản nền tảng" }),
    onSuccess: () => {
      setName("");
      setHandle("");
      setNote("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const del = useMutation({
    mutationFn: async (id: number) => await api.deleteChannel({ id, actor: "Tổng quản nền tảng" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["channels"] }),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });
  const submit = () => {
    if (!name.trim()) {
      setError("Ghi tên kênh trước khi lưu vào sổ nền tảng.");
      return;
    }
    mut.mutate();
  };
  return (
    <section aria-label="Tổng quản nền tảng" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <h3 className="font-display font-bold">Tổng quản nền tảng — sổ kênh YouTube / TikTok / Facebook</h3>
      <p className="mt-1 text-sm text-[var(--dim)]">
        Tổng quản nền tảng giữ sổ kênh, lịch đăng và mốc kiếm tiền của từng kênh. Sổ này chỉ ghi kênh thật do
        công ty quản; số liệu lượt xem / doanh thu chỉ hiện khi có kết nối thật — chưa kết nối thì để trống,
        không bịa số.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Nền tảng</span>
          <select aria-label="Nền tảng của kênh" value={platform} onChange={(e) => setPlatform(e.target.value as Channel["platform"])} className={GOV_INPUT}>
            {Object.entries(PLATFORM_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Tên kênh *</span>
          <input {...FIELDS.upsertChannel.name} value={name} onChange={(e) => setName(e.target.value)} className={GOV_INPUT} placeholder="Tên kênh thật…" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Handle / đường dẫn</span>
          <input {...FIELDS.upsertChannel.handle} value={handle} onChange={(e) => setHandle(e.target.value)} className={GOV_INPUT} placeholder="@kenh…" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Trạng thái</span>
          <select aria-label="Trạng thái kênh" value={status} onChange={(e) => setStatus(e.target.value as Channel["status"])} className={GOV_INPUT}>
            {Object.entries(CHANNEL_STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium">Ghi chú (lịch đăng, mốc kiếm tiền…)</span>
          <input {...FIELDS.upsertChannel.note} value={note} onChange={(e) => setNote(e.target.value)} className={GOV_INPUT} placeholder="vd: Đăng 1 video/ngày…" />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={mut.isPending} onClick={submit} className={GOV_BTN}>
          Thêm kênh vào sổ
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
      {q.isPending ? (
        <p className="mt-3 text-sm text-[var(--dim)]">Đang mở sổ kênh…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--dim)]">Sổ kênh đang trống — Tổng quản nền tảng chưa ghi kênh nào. Thêm kênh thật của công ty vào đây để theo dõi.</p>
      ) : (
        (Object.keys(PLATFORM_LABELS) as Channel["platform"][]).map((pf) => {
          const list = rows.filter((c) => c.platform === pf);
          if (list.length === 0) return null;
          return (
            <div key={pf} className="mt-3">
              <h4 className="font-display text-sm font-bold">{PLATFORM_LABELS[pf]} ({list.length} kênh)</h4>
              <ul className="mt-1.5 space-y-1.5">
                {list.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2 text-sm">
                    <span className="font-semibold">{c.name}</span>
                    {c.handle ? <span className="text-[var(--dim)]">{c.handle}</span> : null}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.status === "risk" ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" : c.status === "paused" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"}`}>
                      {CHANNEL_STATUS_LABELS[c.status]}
                    </span>
                    {c.note ? <span className="text-[var(--dim)]">{c.note}</span> : null}
                    <button
                      type="button"
                      disabled={del.isPending}
                      onClick={() => del.mutate(c.id)}
                      aria-label={`Xóa kênh ${c.name} khỏi sổ`}
                      className="ml-auto min-h-8 px-2 text-xs font-semibold text-red-600 disabled:opacity-60"
                    >
                      Xóa
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}

function OrgView({ tasks, go }: { tasks: Task[]; go: (v: View) => void }) {
  const vetoQ = useQuery({ queryKey: ["vetoes"], queryFn: () => api.listVetoes({}) });
  const activeVetoes = (vetoQ.data?.vetoes ?? []).filter((v) => v.active).length;
  const blockStats = (b: OrgBlock) => {
    const mine = tasks.filter((t) => b.rooms.includes(t.room));
    return {
      total: mine.length,
      approved: mine.filter((t) => t.status === "APPROVED").length,
      revision: mine.filter((t) => t.status === "REVISION_REQUIRED").length,
      open: mine.filter((t) => t.status !== "APPROVED").length,
    };
  };
  const personCard = (staffId: string, title: string, note?: string) => {
    const s = staffById(staffId);
    return (
      <div className="rounded-[var(--radius)] bg-[var(--bg)] px-3 py-2">
        <p className="flex items-center gap-2 text-sm">
          <Avatar member={s} size={30} />
          <span>
            <strong>{s.name}</strong> · <span className="text-[var(--dim)]">{title}</span>
          </span>
        </p>
        <p className="mt-1 text-xs text-[var(--dim)]">{note ?? s.role}</p>
      </div>
    );
  };
  return (
    <div className="space-y-4">
      <section aria-label="Sơ đồ tổ chức MUSE COMPANY" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <h2 className="font-display text-lg font-bold">Sơ đồ tổ chức — MUSE COMPANY</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Cơ cấu đã nâng tiệm cận và vượt mô hình tập đoàn tham chiếu: thêm kiểm toán độc lập, cố vấn bỏ phiếu
          3/5 có biên bản, VETO ghi mã lý do, bảng rủi ro và KPI từng khối. Kênh giao việc chính thức là kênh{" "}
          <strong>TASK</strong> (Bảng việc + Giao việc) — giao việc, báo cáo, duyệt đều qua TASK, không giao
          miệng ngoài sổ. Chủ tịch chỉ có <strong>2 điểm chạm</strong>: duyệt MỞ dự án và duyệt FINAL.
        </p>
        <div className="mx-auto mt-4 max-w-md rounded-[var(--radius)] bg-[#241b4d] px-4 py-3 text-center text-white">
          <p className="font-display text-lg font-bold">CHỦ TỊCH — HƯỞNG</p>
          <p className="text-xs text-[#c9bdf5]">Đầu tư · Định hướng · Quyết định quan trọng — chỉ duyệt mở dự án & duyệt Final</p>
        </div>
        <div className="mx-auto h-4 w-px bg-[var(--border)]" aria-hidden="true" />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-[var(--radius)] border-2 border-red-300 px-3 py-2.5 dark:border-red-900">
            <h3 className="font-display font-bold text-red-700 dark:text-red-300">KIỂM TOÁN NỘI BỘ — ĐỘC LẬP</h3>
            <p className="mb-2 text-xs text-[var(--dim)]">Báo cáo THẲNG Chủ tịch, không qua Tổng giám đốc — kiểm nhật ký, QC, kho sản phẩm, Sổ quyết định và bảng rủi ro.</p>
            {personCard("kiem-toan", "Trưởng Kiểm toán nội bộ")}
          </div>
          <div className="rounded-[var(--radius)] border-2 border-[var(--accent)] px-3 py-2.5">
            <h3 className="font-display font-bold">TỔNG GIÁM ĐỐC — MUSE</h3>
            <p className="mb-2 text-xs text-[var(--dim)]">Điều hành toàn công ty · Trình Chủ tịch — điều phối dây chuyền qua kênh TASK, maker ≠ approver.</p>
            {personCard("tong-giam-doc", "Tổng giám đốc")}
            <div className="mt-2">{personCard("tro-ly", "Trợ lý Tổng giám đốc")}</div>
          </div>
          <div className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2.5">
            <h3 className="font-display font-bold">VĂN PHÒNG CHỦ TỊCH</h3>
            <p className="mb-2 text-xs text-[var(--dim)]">Giữ Sổ quyết định · hồ sơ trình ký · biên bản hội đồng.</p>
            {personCard("thu-ky", "Thư ký Chủ tịch")}
            <div className="mt-2">{personCard("van-thu", "Văn thư — giữ Sổ quyết định")}</div>
          </div>
        </div>
        <div className="mx-auto h-4 w-px bg-[var(--border)]" aria-hidden="true" />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2.5">
            <h3 className="font-display font-bold">HỘI ĐỒNG CỐ VẤN QUYẾT SÁCH</h3>
            <p className="mb-2 text-xs text-[var(--dim)]">5 cố vấn · chỉ KHUYẾN NGHỊ khi ≥3/5 đồng ý · biên bản bỏ phiếu ở panel dưới.</p>
            <ul className="space-y-1.5">
              {COUNCIL_MEMBERS.map((m) => (
                <li key={m.staffId}>{personCard(m.staffId, m.seat)}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2.5">
            <h3 className="font-display font-bold">PHÒNG R&D</h3>
            <p className="mb-2 text-xs text-[var(--dim)]">Nghiên cứu & Phát triển · Trực thuộc Tổng giám đốc — thử nghiệm nhỏ, đo kết quả rồi mới đưa vào sản xuất.</p>
            {personCard("tp-rd", "Trưởng phòng R&D")}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {personCard("rd-nv1", "Nhân viên R&D")}
              {personCard("rd-nv2", "Nhân viên R&D")}
            </div>
          </div>
          <div className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2.5">
            <h3 className="font-display font-bold">TỔNG QUẢN NỀN TẢNG</h3>
            <p className="mb-2 text-xs text-[var(--dim)]">YouTube · TikTok · Facebook — giữ sổ kênh, lịch đăng, mốc kiếm tiền ở panel dưới.</p>
            {personCard("tong-quan-nen-tang", "Tổng quản nền tảng")}
            <div className="mt-2">{personCard("nen-tang-nv1", "Nhân viên Quản lý nền tảng")}</div>
          </div>
        </div>
        <h3 className="font-display mt-5 font-bold">5 KHỐI CHỨC NĂNG — GIÁM ĐỐC BÁO CÁO THẲNG TỔNG GIÁM ĐỐC</h3>
        <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ORG_BLOCKS.map((b) => {
            const st = blockStats(b);
            const director = staffById(b.directorId);
            return (
              <div key={b.key} className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2.5">
                <h4 className="font-display font-bold">{b.name}</h4>
                <p className="mt-1 flex items-center gap-2 text-sm">
                  <Avatar member={director} size={28} />
                  <span>
                    <strong>{director.name}</strong> · {b.directorTitle}
                  </span>
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {b.rooms.map((rid) => {
                    const room = ROOMS.find((r) => r.id === rid);
                    const members = STAFF.filter((s) => s.roomId === rid);
                    return (
                      <li key={rid} className="rounded bg-[var(--bg)] px-2 py-1.5">
                        <span className="font-medium">{room?.name ?? rid}</span>
                        <span className="block text-xs text-[var(--dim)]">
                          {members.length > 0 ? members.map((m) => m.name).join(" · ") : "Đội hình theo phòng"}
                          {rid === "chat-luong" ? " · Ngọc Linh — QC (ngồi Phòng Video, thuộc Khối Chất lượng)" : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-[var(--dim)]">{b.note}</p>
                <p className="mt-1 text-xs font-medium">
                  KPI khối (từ kênh TASK): {st.total} việc · {st.approved} đã đạt · {st.revision} đang làm lại · {st.open} chưa chốt
                  {b.key === "chat-luong" ? ` · ${activeVetoes} VETO đang hiệu lực` : ""}
                </p>
              </div>
            );
          })}
          <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] px-3 py-2.5">
            <h4 className="font-display font-bold">Kênh TASK chính thức</h4>
            <p className="mt-1 text-sm text-[var(--dim)]">
              Mọi giao việc, báo cáo khâu, duyệt mẫu và QC đi qua kênh TASK — việc nào cũng có brief, khóa nhân
              vật, người phụ trách và lịch sử duyệt truy lại được.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => go("board")} className="min-h-10 rounded-[var(--radius)] bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white">
                Mở Bảng việc (TASK)
              </button>
              <button type="button" onClick={() => go("assign")} className="min-h-10 rounded-[var(--radius)] border border-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent)]">
                Giao việc mới
              </button>
              <button type="button" onClick={() => go("kpi")} className="min-h-10 rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-sm font-medium">
                KPI từng khối →
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--dim)]">
              Phòng ban hỗ trợ ngoài 5 khối: Lễ tân · Nhân sự · Kho Sản phẩm · In ấn · Phòng Họp Lớn — vẫn thuộc
              điều hành chung của Tổng giám đốc.
            </p>
          </div>
        </div>
      </section>

      <DecisionsPanel />
      <CouncilPanel />
      <VetoPanel tasks={tasks} />
      <RiskPanel />
      <ChannelsPanel />
    </div>
  );
}

const NAV_ITEMS: { key: View; label: string }[] = [
  { key: "overview", label: "Tổng quan" },
  { key: "org", label: "Sơ đồ tổ chức" },
  { key: "talk", label: "Trò chuyện giao tiếp" },
  { key: "chat", label: "Chat toàn công ty" },
  { key: "direct", label: "Tin riêng" },
  { key: "board", label: "Bảng việc" },
  { key: "assign", label: "Giao việc" },
  { key: "warehouse", label: "Kho sản phẩm" },
  { key: "brandkit", label: "Brand Kit" },
  { key: "kpi", label: "KPI & Năng lực" },
  { key: "report", label: "Báo cáo sáng" },
  { key: "meetings", label: "Phòng họp" },
  { key: "journal", label: "Nhật ký làm việc" },
  { key: "audit", label: "Kiểm toán" },
];

const VIEW_TITLES: Record<View, string> = {
  overview: "Tổng quan công ty",
  org: "Sơ đồ tổ chức — MUSE COMPANY",
  talk: "Trò chuyện giao tiếp",
  chat: "Chat toàn công ty",
  direct: "Tin riêng · Tổng giám đốc ↔ Đạo diễn",
  board: "Bảng việc — Phòng Video",
  assign: "Giao việc cho Đạo diễn",
  warehouse: "Kho sản phẩm",
  brandkit: "Brand Kit · Khóa nhân vật & chuẩn chung",
  kpi: "KPI & Hồ sơ năng lực",
  report: "Báo cáo sáng",
  meetings: "Phòng họp & biên bản",
  journal: "Nhật ký làm việc toàn công ty",
  audit: "Nhật ký kiểm toán",
};

export function App() {
  const [view, setView] = useState<View>("overview");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  // Mở dự án tại đúng một khâu: thanh bước ở dưới và cột phải dùng
  // chung đường này — PipelineSection tự cuộn tới khâu được chỉ định.
  const [stageFocus, setStageFocus] = useState<{ stageKey: string; nonce: number } | null>(null);
  const openTaskAtStage = (t: Task, stageKey: string) => {
    setStageFocus({ stageKey, nonce: Date.now() });
    setSelectedTask(t);
  };
  // Nút "Trò chuyện" trên thẻ của bất kỳ nhân vật nào (thẻ mở ra khi bấm
  // vào nhân vật trong văn phòng 3D, hoặc nút Trò chuyện ở sơ đồ công
  // ty) mở cuộc trò chuyện riêng với người đó ở tab Trò chuyện — bấm
  // vào nhân vật KHÔNG tự mở chat, phải bấm nút Trò chuyện mới mở.
  const [talkFocus, setTalkFocus] = useState<{ staffId: string; nonce: number } | null>(null);
  const openChatWith = (member: StaffMember) => {
    setSelectedStaff(null);
    setSelectedTask(null);
    setTalkFocus((prev) => ({ staffId: member.id, nonce: (prev?.nonce ?? 0) + 1 }));
    setView("talk");
  };

  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: () => api.listTasks({}) });
  const tasks: Task[] = tasksQuery.data?.tasks ?? [];
  const productsQuery = useQuery({ queryKey: ["products"], queryFn: () => api.listProducts({}) });
  const products: Product[] = productsQuery.data?.products ?? [];

  const reviewCount = tasks.filter((t) => t.status === "REVIEW").length;
  const liveTask = selectedTask ? (tasks.find((t) => t.id === selectedTask.id) ?? null) : null;

  const go = (v: View) => setView(v);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] md:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-[#241b4d] text-white md:flex">
        <div className="px-4 pb-2 pt-6">
          <p className="font-display text-lg font-bold leading-tight">Văn phòng<br />phòng ban ảo</p>
          <p className="mt-1 text-xs text-[#c9bdf5]">Toàn bộ phòng ban đang hoạt động</p>
        </div>
        <nav aria-label="Điều hướng chính" className="flex-1 space-y-1 px-2 py-3">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => go(item.key)}
              aria-current={view === item.key ? "page" : undefined}
              className={`flex min-h-11 w-full items-center justify-between rounded-[var(--radius)] px-3 py-2 text-left text-sm font-medium ${
                view === item.key
                  ? "bg-[#6d28d9]"
                  : item.key === "talk"
                    ? "bg-white/10 font-semibold ring-1 ring-inset ring-[#a78bfa]/70 hover:bg-white/15"
                    : "hover:bg-white/10"
              }`}
            >
              {item.label}
              {item.key === "board" && reviewCount > 0 ? (
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">{reviewCount} chờ duyệt</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="px-4 py-4">
          <div className="flex items-center gap-2.5">
            <Avatar member={staffById("tong-giam-doc")} size={38} />
            <div>
              <p className="text-sm font-semibold leading-tight">Muse</p>
              <p className="text-xs text-[#c9bdf5]">Tổng giám đốc</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[#a79fd0]">
            Mọi thao tác trên trang này ghi vào dữ liệu công ty thật. Máy chạy việc thật nằm ở chat Đạo diễn trong Muse.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 bg-[var(--bg)]/95 pt-safe backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">
            <h1 className="font-display text-xl font-bold">{VIEW_TITLES[view]}</h1>
            <div className="flex shrink-0 items-center gap-2">
              <NotificationBell
                onOpenEntry={(e) => {
                  const tid = hashTaskId(`${e.title} ${e.detail}`);
                  const t = tid ? tasks.find((x) => x.id === tid) : undefined;
                  if (t) setSelectedTask(t);
                  else if (e.kind === "hop") go("meetings");
                  else go("journal");
                }}
              />
              <PipelineModeToggle />
              <button
                type="button"
                onClick={() => go("talk")}
                className="min-h-10 rounded-[var(--radius)] border border-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-[var(--accent)]"
              >
                Trò chuyện
              </button>
              <button
                type="button"
                onClick={() => go("assign")}
                className="min-h-10 rounded-[var(--radius)] bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white"
              >
                + Giao việc
              </button>
            </div>
          </div>
          <nav aria-label="Điều hướng di động" className="flex gap-1.5 overflow-x-auto px-4 pb-2.5 md:hidden">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => go(item.key)}
                aria-current={view === item.key ? "page" : undefined}
                className={`min-h-10 shrink-0 rounded-full px-3.5 py-2 text-sm font-medium ${
                  view === item.key
                    ? "bg-[#241b4d] text-white"
                    : item.key === "talk"
                      ? "bg-[#ede9fe] font-semibold text-[#4c1d95] ring-1 ring-inset ring-[#6d28d9]/50"
                      : "bg-[var(--surface)] text-[var(--text)]"
                }`}
              >
                {item.label}
                {item.key === "board" && reviewCount > 0 ? ` (${reviewCount})` : ""}
              </button>
            ))}
          </nav>
        </header>

        <main className="px-4 pb-10 pt-1">
          {tasksQuery.isError ? (
            <p className="mb-3 rounded-[var(--radius)] bg-red-100 px-3 py-2 text-sm text-red-800">
              Không tải được dữ liệu công ty — thử tải lại trang.
            </p>
          ) : null}
          {view === "overview" ? (
            <Overview tasks={tasks} go={go} openTask={setSelectedTask} openTaskAtStage={openTaskAtStage} openStaff={setSelectedStaff} openChat={openChatWith} />
          ) : view === "org" ? (
            <OrgView tasks={tasks} go={go} />
          ) : view === "talk" ? (
            <TalkView focusStaffId={talkFocus?.staffId ?? null} focusNonce={talkFocus?.nonce ?? 0} openStaff={setSelectedStaff} />
          ) : view === "board" ? (
            <Board tasks={tasks} openTask={setSelectedTask} />
          ) : view === "assign" ? (
            <AssignView tasks={tasks} done={() => go("board")} />
          ) : view === "chat" ? (
            <ChatView channel="company" tasks={tasks} />
          ) : view === "direct" ? (
            <ChatView channel="direct" tasks={tasks} />
          ) : view === "warehouse" ? (
            <Warehouse products={products} tasks={tasks} />
          ) : view === "brandkit" ? (
            <BrandKit />
          ) : view === "kpi" ? (
            <KpiView tasks={tasks} />
          ) : view === "report" ? (
            <ReportView tasks={tasks} products={products} />
          ) : view === "meetings" ? (
            <MeetingsView tasks={tasks} />
          ) : view === "journal" ? (
            <JournalView />
          ) : (
            <AuditView />
          )}
        </main>
      </div>

      {selectedStaff && !liveTask ? (
        <StaffPanel
          member={selectedStaff}
          tasks={tasks}
          openChat={openChatWith}
          onClose={() => setSelectedStaff(null)}
          openTask={(t) => {
            setSelectedStaff(null);
            setSelectedTask(t);
          }}
        />
      ) : null}

      {liveTask ? (
        <TaskDetail task={liveTask} onClose={() => setSelectedTask(null)} go={go} focusStage={stageFocus} />
      ) : null}
    </div>
  );
}
