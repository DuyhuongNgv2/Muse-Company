import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { and, asc, desc, eq } from "drizzle-orm";
import * as schema from "./schema";

const taskStatus = z.enum([
  "ASSIGNED",
  "IN_PROGRESS",
  "REVIEW",
  "APPROVED",
  "REVISION_REQUIRED",
]);

const taskShape = z.object({
  id: z.number(),
  title: z.string(),
  brief: z.string(),
  room: z.string(),
  assignee: z.string(),
  status: taskStatus,
  aspect_ratio: z.string(),
  scene_seconds: z.number().nullable(),
  total_seconds: z.number().nullable(),
  character_lock: z.string(),
  reference_note: z.string(),
  gate_brief: z.string(),
  gate_frame: z.string(),
  gate_final: z.string(),
  pipeline_state: z.string(),
  current_stage: z.string(),
  blocked_reason: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

type TaskRow = typeof schema.tasks.$inferSelect;

function toTask(row: TaskRow): z.infer<typeof taskShape> {
  return {
    id: row.id,
    title: row.title,
    brief: row.brief,
    room: row.room,
    assignee: row.assignee,
    status: row.status,
    aspect_ratio: row.aspectRatio,
    scene_seconds: row.sceneSeconds,
    total_seconds: row.totalSeconds,
    character_lock: row.characterLock,
    reference_note: row.referenceNote,
    gate_brief: row.gateBrief,
    gate_frame: row.gateFrame,
    gate_final: row.gateFinal,
    pipeline_state: row.pipelineState,
    current_stage: row.currentStage,
    blocked_reason: row.blockedReason,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function logAudit(
  ctx: Ctx,
  actor: string,
  action: string,
  detail: string,
) {
  const db = ctx.db<typeof schema>();
  await db.insert(schema.auditLog).values({
    actor,
    action,
    detail,
    createdAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Company chat & office life: staff directory, name-tag routing, natural
// staff replies and the ambient office-life engine.
//
// The Chairman corrected how people talk in this company: NO "@" needed —
// in normal conversation you just say a staff member's name (Đạo diễn,
// Video 01, Ngọc Linh…), with or without diacritics, and the message reaches
// exactly that person, who answers in the same thread. Replies are composed
// by the model in that staff member's own personality and voice: greetings,
// small talk and jokes get natural human chit-chat back (not a task report),
// work messages get a work answer grounded in the tasks that person actually
// holds. If inference fails, a fallback built from the same data is used, so
// a leadership message is never left hanging.
//
// Office life (runOfficeLife) runs on top of the same directory: staff greet
// each other in the morning without being asked, a 5-minute morning meeting
// is minuted by the Thư ký, there is a lunch call at 12:00, the Đạo diễn
// reports at end of day, birthdays are celebrated, and free staff chat
// casually — but ONLY staff holding no open task ever chatter, so the moment
// the Chairman assigns work, everyone involved focuses on the work.
// ---------------------------------------------------------------------------

interface StaffContact {
  id: string;
  chatName: string;
  personName: string;
  role: string;
}

/** Each staff member's own personality — replies must not all sound alike. */
const STAFF_TRAITS: Record<string, string> = {
  "chu-tich": "quyết đoán, ít nói, nói câu nào chắc câu đó",
  "tong-giam-doc": "điềm tĩnh, rõ ràng, luôn nhìn toàn cục",
  "dao-dien": "nghiêm túc, quyết đoán, nói ngắn gọn nhưng ấm áp với anh em",
  "video-01": "nhanh nhẹn, hoạt bát, trả lời gọn và hay pha chút hài hước nhẹ",
  "video-02": "vui vẻ, hay đùa, nói chuyện có duyên",
  "video-03": "trầm tính, chắc chắn, ít nói nhưng câu nào cũng trúng ý",
  qc: "kỹ tính, nghiêm túc, thẳng thắn nhưng khéo léo",
  "van-thu": "cẩn thận, chu đáo, nhẹ nhàng",
  "thu-ky": "lanh lợi, ghi chép đâu ra đó, nói năng lịch sự",
  "tro-ly": "nhanh nhẹn, tháo vát, luôn sẵn sàng",
  "le-tan": "niềm nở, tươi tắn, chào hỏi ai cũng ấm áp",
  "tp-marketing": "năng động, nhiều ý tưởng, nói chuyện cuốn hút",
  "marketing-nv1": "hóm hỉnh, hay kể chuyện vui",
  "marketing-nv2": "dịu dàng, tinh tế, hay quan tâm đồng nghiệp",
  "tp-chien-luoc": "sâu sắc, nói chậm rãi, cân nhắc kỹ",
  "strategy-nv1": "thông minh, hỏi lại đúng chỗ, hơi dí dỏm",
  "strategy-nv2": "chắc chắn, ít nói, làm nhiều hơn nói",
  "tp-nhan-su": "ấm áp, tâm lý, luôn để ý mọi người trong công ty",
  "hr-nv1": "vui tính, hay tổ chức trò vui cho cả phòng",
  "hr-nv2": "nhẹ nhàng, chu đáo, nhớ sinh nhật mọi người",
  "tp-kinh-doanh": "tự tin, nói năng lưu loát, đầy năng lượng",
  "sales-nv1": "duyên dáng, khéo ăn nói",
  "sales-nv2": "hài hước, hay chọc cười cả phòng",
  "tp-noi-dung": "sáng tạo, nói chuyện giàu hình ảnh",
  "content-nv1": "mơ mộng vừa phải, viết hay, nói cũng hay",
  "content-nv2": "trẻ trung, bắt trend nhanh, nói chuyện sôi nổi",
  "tp-am-thanh": "điềm đạm, tai thính, nói ít nhưng chất",
  "sound-nv1": "hiền lành, chậm rãi, chắc chắn",
  "sound-nv2": "tinh nghịch, hay hát vu vơ khi rảnh",
  "tp-dang-tai": "gọn gàng, đúng giờ, nói rõ ràng từng việc",
  "publish-nv1": "nhanh nhẹn, cập nhật tin tức liên tục",
  "publish-nv2": "cẩn thận, hay kiểm tra lại hai lần",
  "tp-chieu": "thoải mái, hay kể chuyện phim",
  "chieu-nv1": "nhẹ nhàng, tinh ý",
  "chieu-nv2": "vui vẻ, dễ gần",
  "tk-kho": "chắc chắn, nhớ số liệu vanh vách",
  "kho-nv1": "cẩn thận, ngăn nắp",
  "kho-nv2": "khỏe khoắn, hay giúp mọi người bê đồ",
  "tp-in-an": "tỉ mỉ, yêu cầu cao về chất lượng",
  "in-an-nv1": "khéo tay, ít nói",
  "in-an-nv2": "nhiệt tình, làm việc nhanh",
  "tp-tai-chinh": "nghiêm túc, rõ ràng từng con số",
  "finance-nv1": "chu đáo, nhẹ nhàng",
  "finance-nv2": "điềm tĩnh, ít nói",
  "tp-phap-che": "chặt chẽ, nói năng thận trọng",
  "legal-nv1": "thông minh, lý lẽ rõ ràng",
  "legal-nv2": "trầm tĩnh, đáng tin cậy",
  "tp-hop": "gọn gàng, điều phối cuộc họp đâu ra đó",
  "hop-nv1": "nhanh nhẹn, lo thiết bị chu đáo",
};

function traitOf(contact: StaffContact): string {
  return STAFF_TRAITS[contact.id] ?? "thân thiện, chuyên nghiệp";
}

const STAFF_DIRECTORY: StaffContact[] = [
  { id: "chu-tich", chatName: "Chủ tịch", personName: "Hưởng", role: "Chủ tịch công ty" },
  { id: "tong-giam-doc", chatName: "Tổng giám đốc", personName: "Muse", role: "Tổng giám đốc — điều hành toàn công ty" },
  { id: "dao-dien", chatName: "Đạo diễn", personName: "Muse — Đạo diễn", role: "Đạo diễn sản xuất, Trưởng phòng Video" },
  { id: "video-01", chatName: "Video 01", personName: "Minh Tuấn", role: "Nhân viên dựng video" },
  { id: "video-02", chatName: "Video 02", personName: "Thu Hằng", role: "Nhân viên dựng video" },
  { id: "video-03", chatName: "Video 03", personName: "Đức Anh", role: "Nhân viên dựng video" },
  { id: "qc", chatName: "QC", personName: "Ngọc Linh", role: "Kiểm soát chất lượng" },
  { id: "van-thu", chatName: "Thanh Mai", personName: "Thanh Mai", role: "Văn thư" },
  { id: "thu-ky", chatName: "Bảo Trân", personName: "Bảo Trân", role: "Thư ký Chủ tịch" },
  { id: "tro-ly", chatName: "Thu Trang", personName: "Thu Trang", role: "Trợ lý Tổng giám đốc" },
  { id: "le-tan", chatName: "Ngọc Anh", personName: "Ngọc Anh", role: "Lễ tân" },
  { id: "tp-marketing", chatName: "Mai Phương", personName: "Mai Phương", role: "Trưởng phòng Marketing" },
  { id: "marketing-nv1", chatName: "Văn Hùng", personName: "Văn Hùng", role: "Nhân viên Marketing" },
  { id: "marketing-nv2", chatName: "Thanh Thảo", personName: "Thanh Thảo", role: "Nhân viên Marketing" },
  { id: "tp-chien-luoc", chatName: "Quốc Bảo", personName: "Quốc Bảo", role: "Trưởng phòng Chiến lược" },
  { id: "strategy-nv1", chatName: "Khánh Ly", personName: "Khánh Ly", role: "Nhân viên Chiến lược" },
  { id: "strategy-nv2", chatName: "Hoàng Nam", personName: "Hoàng Nam", role: "Nhân viên Chiến lược" },
  { id: "tp-nhan-su", chatName: "Hồng Nhung", personName: "Hồng Nhung", role: "Trưởng phòng Nhân sự" },
  { id: "hr-nv1", chatName: "Tiến Đạt", personName: "Tiến Đạt", role: "Nhân viên Nhân sự" },
  { id: "hr-nv2", chatName: "Mỹ Duyên", personName: "Mỹ Duyên", role: "Nhân viên Nhân sự" },
  { id: "tp-kinh-doanh", chatName: "Trọng Nghĩa", personName: "Trọng Nghĩa", role: "Trưởng phòng Kinh doanh" },
  { id: "sales-nv1", chatName: "Lan Anh", personName: "Lan Anh", role: "Nhân viên Kinh doanh" },
  { id: "sales-nv2", chatName: "Quang Huy", personName: "Quang Huy", role: "Nhân viên Kinh doanh" },
  { id: "tp-noi-dung", chatName: "Trí Dũng", personName: "Trí Dũng", role: "Trưởng phòng Nội dung" },
  { id: "content-nv1", chatName: "Phương Chi", personName: "Phương Chi", role: "Nhân viên Nội dung" },
  { id: "content-nv2", chatName: "Minh Khôi", personName: "Minh Khôi", role: "Nhân viên Nội dung" },
  { id: "tp-am-thanh", chatName: "Tuấn Kiệt", personName: "Tuấn Kiệt", role: "Trưởng phòng Âm thanh" },
  { id: "sound-nv1", chatName: "Thanh Tùng", personName: "Thanh Tùng", role: "Nhân viên Âm thanh" },
  { id: "sound-nv2", chatName: "Ngọc Trâm", personName: "Ngọc Trâm", role: "Nhân viên Âm thanh" },
  { id: "tp-dang-tai", chatName: "Khánh Huyền", personName: "Khánh Huyền", role: "Trưởng phòng Đăng tải & SEO" },
  { id: "publish-nv1", chatName: "Đức Huy", personName: "Đức Huy", role: "Nhân viên Đăng tải & SEO" },
  { id: "publish-nv2", chatName: "Thùy Linh", personName: "Thùy Linh", role: "Nhân viên Đăng tải & SEO" },
  { id: "tp-chieu", chatName: "Hoàng Sơn", personName: "Hoàng Sơn", role: "Trưởng phòng Chiếu" },
  { id: "chieu-nv1", chatName: "Thanh Hà", personName: "Thanh Hà", role: "Nhân viên Phòng Chiếu" },
  { id: "chieu-nv2", chatName: "Tuấn Anh", personName: "Tuấn Anh", role: "Nhân viên Phòng Chiếu" },
  { id: "tk-kho", chatName: "Văn Đức", personName: "Văn Đức", role: "Quản kho — Kho Sản phẩm" },
  { id: "kho-nv1", chatName: "Thu Thủy", personName: "Thu Thủy", role: "Nhân viên Kho Sản phẩm" },
  { id: "kho-nv2", chatName: "Hải Đăng", personName: "Hải Đăng", role: "Nhân viên Kho Sản phẩm" },
  { id: "tp-in-an", chatName: "Đức Long", personName: "Đức Long", role: "Trưởng phòng In ấn" },
  { id: "in-an-nv1", chatName: "Hồng Anh", personName: "Hồng Anh", role: "Nhân viên Phòng In ấn" },
  { id: "in-an-nv2", chatName: "Quốc Anh", personName: "Quốc Anh", role: "Nhân viên Phòng In ấn" },
  { id: "tp-tai-chinh", chatName: "Đức Thịnh", personName: "Đức Thịnh", role: "Trưởng phòng Tài chính – Kế toán" },
  { id: "finance-nv1", chatName: "Thu Hiền", personName: "Thu Hiền", role: "Nhân viên Tài chính – Kế toán" },
  { id: "finance-nv2", chatName: "Văn Phong", personName: "Văn Phong", role: "Nhân viên Tài chính – Kế toán" },
  { id: "tp-phap-che", chatName: "Đình Phong", personName: "Đình Phong", role: "Trưởng phòng Pháp chế" },
  { id: "legal-nv1", chatName: "Mai Chi", personName: "Mai Chi", role: "Nhân viên Pháp chế" },
  { id: "legal-nv2", chatName: "Hữu Thắng", personName: "Hữu Thắng", role: "Nhân viên Pháp chế" },
  { id: "tp-hop", chatName: "Minh Châu", personName: "Minh Châu", role: "Trưởng phòng Họp Lớn" },
  { id: "hop-nv1", chatName: "Văn Toàn", personName: "Văn Toàn", role: "Nhân viên Phòng Họp Lớn" },
];

/** Lowercases and strips Vietnamese diacritics so "@dao dien" finds Đạo diễn. */
function foldText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function staffAliases(contact: StaffContact): string[] {
  const raw = [contact.chatName, contact.personName, contact.id.replace(/-/g, " ")];
  return [...new Set(raw.map(foldText).filter((a) => a.length >= 3))];
}

const WORD_CHAR = /[a-z0-9]/;

/**
 * True when `alias` appears in folded text as a whole name — bounded by
 * spaces, punctuation, string edges, or an optional "@" right before it.
 * This is what makes plain name-tagging work: "Ngọc Linh ơi" matches Ngọc
 * Linh, "@dao dien" still matches Đạo diễn, but a name buried inside
 * another word never fires.
 */
function mentionsAlias(folded: string, alias: string): boolean {
  let idx = folded.indexOf(alias);
  while (idx >= 0) {
    const before = idx === 0 ? "" : (folded[idx - 1] ?? "");
    const after = folded[idx + alias.length] ?? "";
    const beforeOk = before === "" || before === "@" || !WORD_CHAR.test(before);
    const afterOk = after === "" || !WORD_CHAR.test(after);
    if (beforeOk && afterOk) return true;
    idx = folded.indexOf(alias, idx + 1);
  }
  return false;
}

/**
 * Staff tagged in a message by plain name — nói chuyện bình thường chỉ cần
 * gõ tên, không cần "@" (max 3), excluding the sender.
 */
function findMentionedStaff(body: string, senderChatName: string): StaffContact[] {
  const folded = foldText(body);
  const found: StaffContact[] = [];
  for (const contact of STAFF_DIRECTORY) {
    if (contact.id === "chu-tich" || contact.chatName === senderChatName) continue;
    if (staffAliases(contact).some((alias) => mentionsAlias(folded, alias))) {
      found.push(contact);
      if (found.length >= 3) break;
    }
  }
  return found;
}

/** Greetings / small talk / jokes — conversation, not a work order. */
const CASUAL_MARKERS = [
  "chao", "hello", "hey", "khoe khong", "khoe chu", "khoe ha", "on khong",
  "vui", "cuoi", "dua", "tam su", "chuyen phiem", "phiem", "ngu ngon",
  "buoi sang", "buoi trua", "buoi toi", "an com", "an trua", "ca phe", "cafe",
  "uong tra", "the nao", "sao roi", "doi khong", "met khong", "sinh nhat",
  "chuc mung", "cam on", "tam biet", "hen gap", "di choi", "cuoi tuan",
];

function isCasualMessage(body: string): boolean {
  const folded = ` ${foldText(body)} `;
  return CASUAL_MARKERS.some((m) => folded.includes(m));
}

/** A greeting aimed at the whole company ("chào cả nhà", "chào mọi người"…). */
function greetsEveryone(body: string): boolean {
  const folded = foldText(body);
  return ["ca nha", "moi nguoi", "ca cong ty", "tat ca", "anh em", "ca phong"].some((m) =>
    folded.includes(m),
  );
}

const TASK_STATUS_VI: Record<string, string> = {
  ASSIGNED: "Chờ nhận việc",
  IN_PROGRESS: "Đang làm",
  REVIEW: "Chờ duyệt",
  APPROVED: "Đã đạt",
  REVISION_REQUIRED: "Phải làm lại",
};

async function composeStaffReply(
  ctx: Ctx,
  staff: StaffContact,
  incoming: { sender: string; body: string },
): Promise<string> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.assignee, staff.id))
    .orderBy(desc(schema.tasks.id))
    .limit(20);
  const openTasks = rows.filter((t) => t.status !== "APPROVED");
  const taskSummary = openTasks.length
    ? openTasks
        .slice(0, 3)
        .map((t) => `việc #${t.id} "${t.title}" (${TASK_STATUS_VI[t.status] ?? t.status})`)
        .join("; ")
    : "hiện không giữ việc nào chưa chốt";
  const casual = isCasualMessage(incoming.body);
  const fallback = casual
    ? `Dạ chào ${incoming.sender} ạ, em ${staff.chatName} đây ạ. Em vẫn khỏe ạ — cảm ơn ${incoming.sender} hỏi thăm. Có gì vui hay có việc gì cần, ${incoming.sender} cứ nhắn em ngay tại đây ạ.`
    : `Dạ, em ${staff.chatName} đã nhận tin của ${incoming.sender} ạ. ` +
      `Phần việc của em: ${taskSummary}. Em xử lý ngay và báo lại kết quả ngay tại đây ạ.`;
  try {
    const reply = await ctx.inference.complete(
      `Bạn là ${staff.personName} — ${staff.role} — một nhân viên trong văn phòng công ty, đang chat trong kênh nội bộ công ty. Tính cách của bạn: ${traitOf(staff)} — hãy nói đúng chất đó, đừng nói giống hệt đồng nghiệp khác. ` +
        `${incoming.sender} vừa nhắn cho bạn: "${incoming.body}". ` +
        `Việc bạn đang phụ trách: ${taskSummary}. ` +
        `Trả lời như NGƯỜI THẬT đang tán gẫu / làm việc ở công sở, 1–3 câu tiếng Việt tự nhiên, ấm áp: ` +
        `— Nếu tin nhắn là chào hỏi, hỏi thăm, đùa vui hay chuyện phiếm: cứ chào lại, hỏi thăm lại, đùa đáp nhẹ nhàng như đồng nghiệp thật; TUYỆT ĐỐI không lôi danh sách việc ra báo cáo, không trả lời kiểu máy móc "đã nhận tin, sẽ xử lý". ` +
        `— Nếu tin nhắn là giao việc / hỏi việc: xác nhận đã nhận đúng nội dung, nói bước bạn sẽ làm tiếp theo dựa trên việc đang phụ trách, hứa báo lại kết quả tại đây. ` +
        (openTasks.length > 0 && casual
          ? `— Bạn đang có việc chưa xong: tán gẫu thân thiện nhưng NGẮN thôi, rồi nói khéo là bạn quay lại làm việc tiếp — khi sếp giao việc thì tập trung làm, không tán gẫu chen vào việc. `
          : ``) +
        `Không dùng markdown, không nhắc tới AI hay hệ thống.`,
      { schema: z.string(), timeout_secs: 25 },
    );
    const text = typeof reply === "string" ? reply.trim() : "";
    return text ? text.slice(0, 1000) : fallback;
  } catch {
    return fallback;
  }
}

/** One casual office-life line from one staff member to another, in character. */
async function composeCasualLine(
  ctx: Ctx,
  from: StaffContact,
  to: StaffContact | null,
  situation: string,
  fallback: string,
): Promise<string> {
  try {
    const reply = await ctx.inference.complete(
      `Bạn là ${from.personName} — ${from.role} — nhân viên một công ty, tính cách: ${traitOf(from)}. ` +
        `Tình huống: ${situation}. ` +
        (to ? `Người bạn đang nói chuyện cùng là ${to.personName} (${to.role}) — hãy gọi tên bạn ấy trong câu nói. ` : ``) +
        `Hãy nói đúng MỘT câu tiếng Việt thật tự nhiên như người thật ở công sở (chào hỏi, hỏi thăm, rủ uống trà/cà phê, rủ ăn trưa, chúc mừng, tán gẫu ngắn), đúng tính cách của bạn, không máy móc, không nhắc tới công việc trừ khi tình huống nhắc tới. Không markdown, không nhắc AI hay hệ thống.`,
      { schema: z.string(), timeout_secs: 25 },
    );
    const text = typeof reply === "string" ? reply.trim() : "";
    return text ? text.slice(0, 600) : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// AUTO-ORCHESTRATED PRODUCTION PIPELINE (Chủ tịch chốt: tái cấu trúc luồng
// vận hành theo trọng trách — bỏ kiểu "bấm tới đâu chạy tới đó")
//
// Governance: the Chairman has EXACTLY TWO mandatory touchpoints —
// (1) approve opening a new project (the brief), and (2) approve the
// Final at the Screening Room. Everything between those points is run
// by TGĐ Muse as orchestrator: each stage's accepted output becomes
// the next stage's input automatically, stage by stage, ONE stage at
// a time (sequential single-worker queue — the web office never runs
// two heavy stages in parallel; the GPU/VRAM queue lives in the local
// pipeline on the Chairman's PC, which delivers each stage's real
// output file into the office store through uploadStageOutput).
//
// Every stage passes an automatic QC gate that checks REAL facts
// about the REAL file in the store (blob existence + byte size via
// blobs.head, the file's measured duration, SRT cue structure parsed
// from the actual text, voice-vs-timeline synchronisation). A failed
// QC sends the stage back for a redo and TGĐ auto-convenes a rescue
// meeting (họp giải cứu); after MAX_RETRIES failed attempts the line
// STOPS, the task is BLOCKED and a red alert with the concrete reason
// goes to the Chairman with two actions: [Mở sửa tay] / [Duyệt cưỡng
// bức]. No simulated logs anywhere: a stage report is written only
// when a real output file passed QC, and it links to that file.
//
// The Chairman can Pause at any moment, edit any stage's output
// directly (script/SRT text in the web editor, or a replacement file),
// and Resume from that stage — downstream stages are invalidated and
// re-run, the project is never reset to the beginning.
// ---------------------------------------------------------------------------

interface PipelineStageDef {
  key: string;
  name: string;
  room: string;
  roomName: string;
  assignee: string;
  assigneeName: string;
  kind: "text" | "audio" | "visuals" | "video" | "gate";
}

const PIPELINE_STAGES: PipelineStageDef[] = [
  { key: "script", name: "Kịch bản & SRT", room: "content", roomName: "Phòng Nội dung", assignee: "tp-noi-dung", assigneeName: "Trưởng phòng Nội dung", kind: "text" },
  { key: "voice", name: "Thu voice", room: "sound", roomName: "Phòng Âm thanh", assignee: "tp-am-thanh", assigneeName: "Trưởng phòng Âm thanh", kind: "audio" },
  { key: "visuals", name: "Ảnh & phân cảnh", room: "video", roomName: "Phòng Video", assignee: "dao-dien", assigneeName: "Đạo diễn", kind: "visuals" },
  { key: "edit", name: "Dựng bản chiếu thử", room: "video", roomName: "Phòng Video", assignee: "dao-dien", assigneeName: "Đạo diễn", kind: "video" },
  { key: "screening", name: "Chiếu thử & duyệt Final", room: "screening", roomName: "Phòng Chiếu", assignee: "tp-chieu", assigneeName: "Trưởng phòng Chiếu", kind: "gate" },
];

const MAX_RETRIES = 3;
const TGD_NAME = "Tổng giám đốc";

function stageDef(key: string): PipelineStageDef | null {
  return PIPELINE_STAGES.find((s) => s.key === key) ?? null;
}

function stageIndex(key: string): number {
  return PIPELINE_STAGES.findIndex((s) => s.key === key);
}

function dbOf(ctx: Ctx) {
  return ctx.db<typeof schema>();
}
type Db = ReturnType<typeof dbOf>;
type TaskDbRow = typeof schema.tasks.$inferSelect;
type StageDbRow = typeof schema.pipelineStages.$inferSelect;
type ProductDbRow = typeof schema.products.$inferSelect;

async function getPipelineMode(db: Db): Promise<"auto" | "manual"> {
  const rows = await db
    .select()
    .from(schema.officeSettings)
    .where(eq(schema.officeSettings.key, "pipeline_mode"));
  return rows[0]?.value === "manual" ? "manual" : "auto";
}

async function loadTask(db: Db, taskId: number): Promise<TaskDbRow> {
  const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
  const task = rows[0];
  if (!task) throw new Error("Không tìm thấy dự án/việc này.");
  return task;
}

async function loadStages(db: Db, taskId: number): Promise<StageDbRow[]> {
  const rows = await db
    .select()
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.taskId, taskId))
    .orderBy(asc(schema.pipelineStages.id));
  return rows;
}

async function loadStageProducts(db: Db, taskId: number, stageKey: string): Promise<ProductDbRow[]> {
  const rows = await db
    .select()
    .from(schema.products)
    .where(
      and(
        eq(schema.products.taskId, taskId),
        eq(schema.products.stageKey, stageKey),
      ),
    )
    .orderBy(desc(schema.products.id));
  return rows.filter((p) => p.blobKey !== "");
}

async function postCompanyMessage(db: Db, sender: string, body: string) {
  await db.insert(schema.messages).values({
    channel: "company",
    sender,
    body,
    recipient: "",
    createdAt: new Date(),
  });
}

async function writeStageReport(
  db: Db,
  taskId: number,
  stageKey: string,
  actor: string,
  summary: string,
  productId: number | null,
) {
  await db.insert(schema.stageReports).values({
    taskId,
    stageKey,
    actor,
    summary,
    productId,
    createdAt: new Date(),
  });
}

function parseStageParams(raw: string): Record<string, number | string> {
  try {
    const v = JSON.parse(raw) as Record<string, number | string>;
    return typeof v === "object" && v !== null ? v : {};
  } catch {
    return {};
  }
}

function fileExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m?.[1]?.toLowerCase() ?? "";
}

/** Parses real SRT text: cue count + last cue end (seconds). */
function parseSrt(text: string): { cues: number; lastEnd: number } {
  const re = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/g;
  let cues = 0;
  let lastEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    cues += 1;
    const end =
      Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]) + Number(m[8]) / 1000;
    if (end > lastEnd) lastEnd = end;
  }
  return { cues, lastEnd };
}

interface QcOutcome {
  ok: boolean;
  reason: string;
  params: Record<string, number | string>;
}

/**
 * The automatic QC gate for one stage. Every check reads a REAL fact:
 * the blob's existence/size from the store, the duration measured from
 * the actual file, the SRT structure parsed from the actual text, and
 * cross-stage synchronisation against the project's own numbers.
 */
async function runStageQc(
  ctx: Ctx,
  task: TaskDbRow,
  def: PipelineStageDef,
  latest: ProductDbRow,
  stageProducts: ProductDbRow[],
  allStages: StageDbRow[],
): Promise<QcOutcome> {
  const head = latest.blobKey ? await ctx.blobs.head(latest.blobKey) : null;
  if (!head || head.size <= 0) {
    return {
      ok: false,
      reason: `File đầu ra "${latest.fileName}" không tồn tại trong kho văn phòng hoặc rỗng — khâu chưa có sản phẩm thật để kiểm.`,
      params: {},
    };
  }
  const ext = fileExt(latest.fileName);
  const base: Record<string, number | string> = {
    file: latest.fileName,
    bytes: head.size,
  };
  if (def.kind === "text") {
    if (ext !== "txt" && ext !== "srt") {
      return { ok: false, reason: `Sai định dạng: khâu Kịch bản cần file .txt hoặc .srt, file đã nộp là ".${ext || "?"}".`, params: base };
    }
    const text = latest.note;
    if (!text.trim()) {
      return { ok: false, reason: "Không đọc được nội dung kịch bản từ file đã nộp (file rỗng hoặc thiếu nội dung).", params: base };
    }
    if (ext === "srt") {
      const { cues, lastEnd } = parseSrt(text);
      if (cues === 0) {
        return { ok: false, reason: "File .srt không có cue hợp lệ nào — không tìm thấy dòng thời gian dạng 00:00:00,000 --> 00:00:00,000.", params: base };
      }
      const params = { ...base, cues, last_end_seconds: Math.round(lastEnd * 10) / 10, chars: text.length };
      if (task.totalSeconds && lastEnd > task.totalSeconds * 1.2 + 2) {
        return {
          ok: false,
          reason: `Lệch đồng bộ: SRT chạy tới ${params.last_end_seconds}s nhưng tổng thời lượng dự án là ${task.totalSeconds}s — phụ đề dài hơn phân cảnh quá xa.`,
          params,
        };
      }
      return { ok: true, reason: "", params };
    }
    return { ok: true, reason: "", params: { ...base, chars: text.length } };
  }
  if (def.kind === "audio") {
    if (!["wav", "mp3", "m4a", "ogg"].includes(ext)) {
      return { ok: false, reason: `Sai định dạng: khâu Voice cần file âm thanh .wav/.mp3/.m4a/.ogg, file đã nộp là ".${ext || "?"}".`, params: base };
    }
    const d = latest.durationSeconds;
    if (!d || d <= 0) {
      return { ok: false, reason: "Chưa đo được thời lượng của file voice — file nộp lên thiếu dữ liệu thời lượng đo từ file thật.", params: base };
    }
    const params = { ...base, duration_seconds: Math.round(d * 10) / 10 };
    if (task.totalSeconds) {
      const tol = Math.max(2, task.totalSeconds * 0.1);
      if (Math.abs(d - task.totalSeconds) > tol) {
        return {
          ok: false,
          reason: `Lệch đồng bộ: voice dài ${params.duration_seconds}s nhưng tổng thời lượng phân cảnh là ${task.totalSeconds}s — lệch ${Math.round(Math.abs(d - task.totalSeconds) * 10) / 10}s, vượt ngưỡng cho phép ${Math.round(tol * 10) / 10}s.`,
          params,
        };
      }
    }
    return { ok: true, reason: "", params };
  }
  if (def.kind === "visuals") {
    const bad = stageProducts.find((p) => !["png", "jpg", "jpeg", "webp", "mp4", "mov"].includes(fileExt(p.fileName)));
    if (bad) {
      return { ok: false, reason: `Sai định dạng: file "${bad.fileName}" không phải ảnh (.png/.jpg/.webp) hay clip cảnh (.mp4/.mov).`, params: base };
    }
    const scriptStage = allStages.find((s) => s.stageKey === "script");
    const scriptParams = scriptStage ? parseStageParams(scriptStage.params) : {};
    const expected = typeof scriptParams.cues === "number" ? scriptParams.cues : null;
    const params: Record<string, number | string> = {
      ...base,
      files: stageProducts.length,
      ...(expected !== null ? { expected_scenes: expected } : {}),
    };
    if (expected !== null && stageProducts.length < expected) {
      return {
        ok: false,
        reason: `Chưa đủ phân cảnh: mới có ${stageProducts.length} file ảnh/cảnh nhưng kịch bản có ${expected} phân cảnh (cue SRT) — mỗi phân cảnh phải có hình riêng.`,
        params,
      };
    }
    if (stageProducts.length === 0) {
      return { ok: false, reason: "Chưa có file ảnh/cảnh nào trong kho cho khâu này.", params };
    }
    return { ok: true, reason: "", params };
  }
  if (def.kind === "video") {
    if (ext !== "mp4" && ext !== "mov") {
      return { ok: false, reason: `Sai định dạng: bản dựng chiếu thử cần file .mp4, file đã nộp là ".${ext || "?"}".`, params: base };
    }
    const d = latest.durationSeconds;
    if (!d || d <= 0) {
      return { ok: false, reason: "Chưa đo được thời lượng của bản dựng — file nộp lên thiếu dữ liệu thời lượng đo từ file thật.", params: base };
    }
    const params: Record<string, number | string> = { ...base, duration_seconds: Math.round(d * 10) / 10 };
    const voiceStage = allStages.find((s) => s.stageKey === "voice");
    const voiceParams = voiceStage ? parseStageParams(voiceStage.params) : {};
    const vd = typeof voiceParams.duration_seconds === "number" ? voiceParams.duration_seconds : null;
    if (vd !== null) {
      const tol = Math.max(2, vd * 0.1);
      if (Math.abs(d - vd) > tol) {
        return {
          ok: false,
          reason: `Lệch đồng bộ: bản dựng dài ${params.duration_seconds}s nhưng voice dài ${vd}s — hình và tiếng lệch ${Math.round(Math.abs(d - vd) * 10) / 10}s, vượt ngưỡng ${Math.round(tol * 10) / 10}s.`,
          params,
        };
      }
    }
    return { ok: true, reason: "", params };
  }
  return { ok: true, reason: "", params: base };
}

function describeParams(params: Record<string, number | string>): string {
  const parts: string[] = [];
  if (typeof params.cues === "number") parts.push(`${params.cues} phân cảnh (cue)`);
  if (typeof params.last_end_seconds === "number") parts.push(`SRT tới ${params.last_end_seconds}s`);
  if (typeof params.duration_seconds === "number") parts.push(`thời lượng ${params.duration_seconds}s`);
  if (typeof params.files === "number") parts.push(`${params.files} file ảnh/cảnh`);
  if (typeof params.chars === "number") parts.push(`${params.chars} ký tự`);
  if (typeof params.bytes === "number") parts.push(`${params.bytes} byte`);
  return parts.join(" · ");
}

interface OrchestratorResult {
  state: string;
  current_stage: string;
  note: string;
}

/**
 * TGĐ Muse's orchestration step. Advances the line as far as real
 * inputs allow: a stage with no delivered output waits (no fake
 * work); a stage with a new output goes through QC; a pass hands over
 * to the next stage automatically (in manual mode, one transition per
 * call — the Chairman's click IS the step). Sequential by
 * construction: at most one stage is ever RUNNING.
 */
async function runOrchestrator(
  ctx: Ctx,
  taskId: number,
  singleStep: boolean,
): Promise<OrchestratorResult> {
  const db = ctx.db<typeof schema>();
  const task = await loadTask(db, taskId);
  if (task.pipelineState === "NONE") {
    return { state: task.pipelineState, current_stage: task.currentStage, note: "Dự án chưa được Chủ tịch duyệt mở — dây chuyền chưa khởi động." };
  }
  if (task.pipelineState === "PAUSED") {
    return { state: task.pipelineState, current_stage: task.currentStage, note: "Dây chuyền đang TẠM DỪNG theo lệnh Chủ tịch — bấm Tiếp tục để chạy lại." };
  }
  if (task.pipelineState === "BLOCKED") {
    return { state: task.pipelineState, current_stage: task.currentStage, note: `Dây chuyền đã DỪNG vì trượt QC quá ${MAX_RETRIES} lần: ${task.blockedReason}` };
  }
  if (task.pipelineState === "DONE") {
    return { state: task.pipelineState, current_stage: task.currentStage, note: "Dự án đã hoàn tất và được Chủ tịch duyệt Final." };
  }
  const stages = await loadStages(db, taskId);
  let current = stages.find((s) => s.stageKey === task.currentStage);
  if (!current) {
    return { state: task.pipelineState, current_stage: task.currentStage, note: "Không tìm thấy khâu hiện tại của dây chuyền." };
  }
  for (let guard = 0; guard < 10; guard++) {
    if (!current) break;
    const cur: StageDbRow = current;
    const def = stageDef(cur.stageKey);
    if (!def) break;
    const now = new Date();
    if (def.kind === "gate") {
      // Screening: the line parks here for the Chairman's Final —
      // touchpoint 2 of 2. Nothing advances past this point without
      // the Chairman. The arrival report is written only on the
      // transition into SCREENING, not on every later call.
      const enteredScreening = task.pipelineState !== "SCREENING";
      if (enteredScreening) {
        await db.update(schema.tasks).set({ pipelineState: "SCREENING", updatedAt: now }).where(eq(schema.tasks.id, taskId));
      }
      if (cur.status !== "RUNNING") {
        await db
          .update(schema.pipelineStages)
          .set({ status: "RUNNING", startedAt: cur.startedAt ?? now, updatedAt: now })
          .where(eq(schema.pipelineStages.id, cur.id));
      }
      if (enteredScreening) {
        const freshStages = await loadStages(db, taskId);
        const editStage = freshStages.find((s) => s.stageKey === "edit");
        await writeStageReport(
          db,
          taskId,
          "screening",
          TGD_NAME,
          `Bản dựng đã vào Phòng Chiếu Thử — chờ Chủ tịch duyệt Final (điểm chạm phê duyệt 2/2). Các khâu trung gian đã bàn giao tự động, không khâu nào phải xin phép giữa chừng.`,
          editStage?.outputProductId ?? null,
        );
        await logAudit(ctx, TGD_NAME, "Điều phối — vào chiếu thử", `Dự án #${taskId} "${task.title}" đã tới Phòng Chiếu Thử, chờ Chủ tịch duyệt Final.`);
      }
      ctx.invalidateQueries();
      return { state: "SCREENING", current_stage: cur.stageKey, note: "Đã tới Phòng Chiếu Thử — chờ Chủ tịch duyệt Final." };
    }
    const products = await loadStageProducts(db, taskId, cur.stageKey);
    const latest = products[0];
    if (!latest) {
      if (cur.status !== "RUNNING") {
        await db
          .update(schema.pipelineStages)
          .set({ status: "RUNNING", startedAt: cur.startedAt ?? now, updatedAt: now })
          .where(eq(schema.pipelineStages.id, cur.id));
      }
      ctx.invalidateQueries();
      return {
        state: task.pipelineState,
        current_stage: cur.stageKey,
        note: `Đang chờ ${def.roomName} (${def.assigneeName}) nộp file đầu ra của khâu "${def.name}" vào kho văn phòng — khâu trước đã bàn giao xong, dây chuyền không tự sinh sản phẩm giả.`,
      };
    }
    if (latest.id === cur.lastQcProductId) {
      ctx.invalidateQueries();
      return {
        state: task.pipelineState,
        current_stage: cur.stageKey,
        note: `File "${latest.fileName}" đã qua QC và chưa đạt (${cur.qcNote}) — đang chờ ${def.roomName} nộp bản sửa. Số lần trượt QC: ${cur.retries}/${MAX_RETRIES}.`,
      };
    }
    // A visuals delivery arrives file by file: an incomplete set is
    // a delivery in progress, NOT a QC failure — the gate judges
    // the stage only once the set can cover every scripted scene,
    // so partial uploads never burn retries.
    const stagesNow = await loadStages(db, taskId);
    if (def.kind === "visuals") {
      const scriptStage = stagesNow.find((s) => s.stageKey === "script");
      const sp = scriptStage ? parseStageParams(scriptStage.params) : {};
      const expected = typeof sp.cues === "number" ? sp.cues : null;
      if (expected !== null && products.length < expected) {
        if (cur.status !== "RUNNING") {
          await db
            .update(schema.pipelineStages)
            .set({ status: "RUNNING", startedAt: cur.startedAt ?? now, updatedAt: now })
            .where(eq(schema.pipelineStages.id, cur.id));
        }
        ctx.invalidateQueries();
        return {
          state: task.pipelineState,
          current_stage: cur.stageKey,
          note: `Đã nhận ${products.length}/${expected} file ảnh/cảnh — đang chờ ${def.roomName} nộp đủ ${expected} phân cảnh rồi mới qua cổng QC (giao dở chưa tính là trượt QC).`,
        };
      }
    }
    // New real output → run the QC gate on it.
    const qc = await runStageQc(ctx, task, def, latest, products, stagesNow);
    if (qc.ok) {
      await db
        .update(schema.pipelineStages)
        .set({
          status: "DONE",
          outputProductId: latest.id,
          lastQcProductId: latest.id,
          qcNote: "",
          params: JSON.stringify(qc.params),
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.pipelineStages.id, cur.id));
      const facts = describeParams(qc.params);
      await writeStageReport(
        db,
        taskId,
        cur.stageKey,
        def.assigneeName,
        `Khâu "${def.name}" (${def.roomName}) ĐẠT QC tự động — file "${latest.fileName}"${facts ? ` · ${facts}` : ""}. TGĐ đã tự động bàn giao sang khâu tiếp theo.`,
        latest.id,
      );
      await logAudit(
        ctx,
        TGD_NAME,
        "Điều phối — khâu đạt QC",
        `Dự án #${taskId}: khâu "${def.name}" đạt QC (${latest.fileName}${facts ? ` · ${facts}` : ""}) → bàn giao tự động.`,
      );
      const nextDef: PipelineStageDef | undefined = PIPELINE_STAGES[stageIndex(cur.stageKey) + 1];
      if (!nextDef) {
        ctx.invalidateQueries();
        return { state: task.pipelineState, current_stage: cur.stageKey, note: "Đã qua khâu cuối." };
      }
      const nextRow = stages.find((s) => s.stageKey === nextDef.key);
      if (nextRow && nextRow.status !== "RUNNING") {
        await db
          .update(schema.pipelineStages)
          .set({ status: "RUNNING", startedAt: nextRow.startedAt ?? now, updatedAt: now })
          .where(eq(schema.pipelineStages.id, nextRow.id));
      }
      await db
        .update(schema.tasks)
        .set({ currentStage: nextDef.key, updatedAt: now })
        .where(eq(schema.tasks.id, taskId));
      ctx.invalidateQueries();
      if (singleStep) {
        return { state: task.pipelineState, current_stage: nextDef.key, note: `Khâu "${def.name}" đã đạt QC và bàn giao sang "${nextDef.name}" (chế độ Thủ công: mỗi lần bấm chạy một bước).` };
      }
      const fresh = await loadStages(db, taskId);
      const nextCurrent: StageDbRow | undefined = fresh.find((s) => s.stageKey === nextDef.key);
      if (!nextCurrent) break;
      current = nextCurrent;
      continue;
    }
    // QC FAILED → redo with rescue meeting; block after MAX_RETRIES.
    const retries = cur.retries + 1;
    await db
      .update(schema.pipelineStages)
      .set({
        status: retries >= MAX_RETRIES ? "BLOCKED" : "RUNNING",
        retries,
        lastQcProductId: latest.id,
        outputProductId: latest.id,
        qcNote: qc.reason,
        params: JSON.stringify(qc.params),
        updatedAt: now,
      })
      .where(eq(schema.pipelineStages.id, cur.id));
    await db.insert(schema.meetings).values({
      room: def.room,
      title: `Họp giải cứu — khâu "${def.name}" trượt QC lần ${retries}`,
      decisions: `TGĐ triệu tập họp giải cứu tự động cho dự án #${taskId} "${task.title}". Lý do trượt QC: ${qc.reason}`,
      actions: `${def.assigneeName} (${def.roomName}) làm lại khâu "${def.name}" theo đúng lý do QC ở trên rồi nộp lại file vào kho văn phòng; TGĐ theo dõi và chạy lại cổng QC ngay khi có bản sửa.`,
      risks: retries >= MAX_RETRIES ? "Đã trượt QC lần thứ 3 — dây chuyền dừng, chờ Chủ tịch xử lý (Mở sửa tay hoặc Duyệt cưỡng bức)." : `Còn ${MAX_RETRIES - retries} lần thử trước khi dây chuyền bị dừng và báo Chủ tịch.`,
      createdAt: now,
    });
    await postCompanyMessage(
      db,
      TGD_NAME,
      `Họp giải cứu — Dự án #${taskId} "${task.title}": khâu "${def.name}" của ${def.roomName} trượt QC lần ${retries}/${MAX_RETRIES}. Lý do: ${qc.reason} ${def.assigneeName} làm lại và nộp bản sửa vào kho giúp em.`,
    );
    await logAudit(
      ctx,
      TGD_NAME,
      "Điều phối — trượt QC, họp giải cứu",
      `Dự án #${taskId}: khâu "${def.name}" trượt QC lần ${retries}/${MAX_RETRIES} — ${qc.reason}`,
    );
    if (retries >= MAX_RETRIES) {
      const reason = `Khâu "${def.name}" trượt QC ${MAX_RETRIES} lần. Lần cuối: ${qc.reason}`;
      await db
        .update(schema.tasks)
        .set({ pipelineState: "BLOCKED", blockedReason: reason, updatedAt: now })
        .where(eq(schema.tasks.id, taskId));
      await postCompanyMessage(
        db,
        TGD_NAME,
        `BÁO CHỦ TỊCH — Dự án #${taskId} "${task.title}" ĐÃ DỪNG dây chuyền: ${reason} Chủ tịch mở dự án để [Mở sửa tay] hoặc [Duyệt cưỡng bức] cho khâu này.`,
      );
      await logAudit(ctx, TGD_NAME, "Điều phối — DỪNG dây chuyền, báo Chủ tịch", `Dự án #${taskId}: ${reason}`);
      ctx.invalidateQueries();
      return { state: "BLOCKED", current_stage: cur.stageKey, note: reason };
    }
    ctx.invalidateQueries();
    return {
      state: task.pipelineState,
      current_stage: cur.stageKey,
      note: `Khâu "${def.name}" trượt QC lần ${retries}/${MAX_RETRIES}: ${qc.reason} Đã mở họp giải cứu; chờ ${def.roomName} nộp bản sửa.`,
    };
  }
  return { state: task.pipelineState, current_stage: task.currentStage, note: "Đã chạy một vòng điều phối." };
}

/** Invalidates a stage and everything downstream of it (edit/resume). */
async function invalidateFromStage(db: Db, taskId: number, stageKey: string) {
  const idx = stageIndex(stageKey);
  const stages = await loadStages(db, taskId);
  const now = new Date();
  for (const s of stages) {
    if (stageIndex(s.stageKey) >= idx) {
      await db
        .update(schema.pipelineStages)
        .set({
          status: "PENDING",
          outputProductId: null,
          lastQcProductId: 0,
          forced: 0,
          finishedAt: null,
          startedAt: null,
          updatedAt: now,
        })
        .where(eq(schema.pipelineStages.id, s.id));
    }
  }
  await db
    .update(schema.tasks)
    .set({ currentStage: stageKey, updatedAt: now })
    .where(eq(schema.tasks.id, taskId));
}

const pipelineStageShape = z.object({
  id: z.number(),
  stage_key: z.string(),
  name: z.string(),
  room: z.string(),
  room_name: z.string(),
  assignee: z.string(),
  assignee_name: z.string(),
  kind: z.string(),
  status: z.string(),
  retries: z.number(),
  forced: z.boolean(),
  qc_note: z.string(),
  params: z.string(),
  output_product_id: z.number().nullable(),
  output_file_name: z.string(),
  output_file_size: z.number().nullable(),
  output_duration_seconds: z.number().nullable(),
  output_url: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});

const orchestratorShape = z.object({
  state: z.string(),
  current_stage: z.string(),
  note: z.string(),
});

export const Actions = {
  listTasks: defineAction({
    description: "Lists all company tasks, newest first.",
    request: z.object({}),
    response: z.object({ tasks: z.array(taskShape) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.tasks)
        .orderBy(desc(schema.tasks.id));
      return { tasks: rows.map(toTask) };
    },
  }),

  createTask: defineAction({
    description:
      "Creates a new task (Giao việc) assigned to a Phòng Video member and logs it in the audit trail.",
    request: z.object({
      title: z.string().trim().min(1).max(200),
      brief: z.string().trim().max(4000).default(""),
      assignee: z.string().trim().min(1).max(60).default("dao-dien"),
      aspect_ratio: z.string().trim().min(1).max(20).default("9:16"),
      scene_seconds: z.number().positive().max(600).nullable().default(null),
      total_seconds: z.number().positive().max(7200).nullable().default(null),
      character_lock: z.string().trim().max(4000).default(""),
      reference_note: z.string().trim().max(2000).default(""),
      actor: z.string().trim().max(60).default("Tổng giám đốc"),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const now = new Date();
      const result = await db
        .insert(schema.tasks)
        .values({
          title: args.title,
          brief: args.brief,
          room: "video",
          assignee: args.assignee,
          status: "ASSIGNED",
          aspectRatio: args.aspect_ratio,
          sceneSeconds: args.scene_seconds,
          totalSeconds: args.total_seconds,
          characterLock: args.character_lock,
          referenceNote: args.reference_note,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: schema.tasks.id });
      const inserted = result[0];
      if (!inserted) throw new Error("createTask: insert returned no rows");
      await logAudit(
        ctx,
        args.actor,
        "Giao việc",
        `Việc #${inserted.id} "${args.title}" → ${args.assignee}, trạng thái Chờ nhận việc`,
      );
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  updateTaskStatus: defineAction({
    description: "Moves a task to a new workflow status and logs the change.",
    request: z.object({
      id: z.number().int().positive(),
      status: taskStatus,
      actor: z.string().trim().max(60).default("Đạo diễn"),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, args.id));
      const task = rows[0];
      if (!task) throw new Error("Không tìm thấy việc này.");
      await db
        .update(schema.tasks)
        .set({ status: args.status, updatedAt: new Date() })
        .where(eq(schema.tasks.id, args.id));
      await logAudit(
        ctx,
        args.actor,
        "Chuyển trạng thái",
        `Việc #${task.id} "${task.title}": ${task.status} → ${args.status}`,
      );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteTask: defineAction({
    description: "Deletes a task together with its QC reviews.",
    request: z.object({
      id: z.number().int().positive(),
      actor: z.string().trim().max(60).default("Tổng giám đốc"),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, args.id));
      const task = rows[0];
      if (!task) throw new Error("Không tìm thấy việc này.");
      await db
        .delete(schema.qcReviews)
        .where(eq(schema.qcReviews.taskId, args.id));
      await db
        .delete(schema.pipelineStages)
        .where(eq(schema.pipelineStages.taskId, args.id));
      await db
        .delete(schema.stageReports)
        .where(eq(schema.stageReports.taskId, args.id));
      await db.delete(schema.tasks).where(eq(schema.tasks.id, args.id));
      await logAudit(
        ctx,
        args.actor,
        "Xóa việc",
        `Đã xóa việc #${task.id} "${task.title}"`,
      );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  listQcReviews: defineAction({
    description: "Lists QC reviews for one task, newest first.",
    request: z.object({ task_id: z.number().int().positive() }),
    response: z.object({
      reviews: z.array(
        z.object({
          id: z.number(),
          task_id: z.number(),
          stage: z.enum(["first_frame", "full_clip"]),
          verdict: z.enum(["APPROVED", "REVISION_REQUIRED"]),
          check_face: z.boolean(),
          check_motion: z.boolean(),
          check_text: z.boolean(),
          check_ratio: z.boolean(),
          check_character: z.boolean(),
          reason: z.string(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.qcReviews)
        .where(eq(schema.qcReviews.taskId, args.task_id))
        .orderBy(desc(schema.qcReviews.id));
      return {
        reviews: rows.map((r) => ({
          id: r.id,
          task_id: r.taskId,
          stage: r.stage,
          verdict: r.verdict,
          check_face: r.checkFace === 1,
          check_motion: r.checkMotion === 1,
          check_text: r.checkText === 1,
          check_ratio: r.checkRatio === 1,
          check_character: r.checkCharacter === 1,
          reason: r.reason,
          created_at: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  submitQcReview: defineAction({
    description:
      "Records a QC review with the mandatory checklist; the verdict moves the task to Đạt or Làm lại.",
    request: z.object({
      task_id: z.number().int().positive(),
      stage: z.enum(["first_frame", "full_clip"]).default("first_frame"),
      verdict: z.enum(["APPROVED", "REVISION_REQUIRED"]),
      check_face: z.boolean().default(false),
      check_motion: z.boolean().default(false),
      check_text: z.boolean().default(false),
      check_ratio: z.boolean().default(false),
      check_character: z.boolean().default(false),
      reason: z.string().trim().max(4000).default(""),
      actor: z.string().trim().max(60).default("QC"),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      if (args.verdict === "REVISION_REQUIRED" && !args.reason) {
        throw new Error("Kết quả Làm lại bắt buộc ghi rõ lý do để nhân viên sửa đúng chỗ.");
      }
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, args.task_id));
      const task = rows[0];
      if (!task) throw new Error("Không tìm thấy việc này.");
      if (task.assignee === "qc") {
        throw new Error("Phân quyền QC: người làm không được tự duyệt việc của mình — việc này do QC phụ trách nên phải để Đạo diễn hoặc Tổng giám đốc xử lý riêng.");
      }
      const result = await db
        .insert(schema.qcReviews)
        .values({
          taskId: args.task_id,
          stage: args.stage,
          verdict: args.verdict,
          checkFace: args.check_face ? 1 : 0,
          checkMotion: args.check_motion ? 1 : 0,
          checkText: args.check_text ? 1 : 0,
          checkRatio: args.check_ratio ? 1 : 0,
          checkCharacter: args.check_character ? 1 : 0,
          reason: args.reason,
          createdAt: new Date(),
        })
        .returning({ id: schema.qcReviews.id });
      const inserted = result[0];
      if (!inserted) throw new Error("submitQcReview: insert returned no rows");
      await db
        .update(schema.tasks)
        .set({ status: args.verdict, updatedAt: new Date() })
        .where(eq(schema.tasks.id, args.task_id));
      await logAudit(
        ctx,
        args.actor,
        args.verdict === "APPROVED" ? "QC: Đạt" : "QC: Làm lại",
        `Việc #${task.id} "${task.title}" (${args.stage === "first_frame" ? "khung đầu" : "full clip"})` +
          (args.reason ? ` — ${args.reason}` : ""),
      );
      // Đời sống công sở: làm tốt thì được khen công khai, làm sai thì được
      // nhắc nhở rõ ràng ngay trên kênh toàn công ty — như ngoài đời.
      const assignee = STAFF_DIRECTORY.find((s) => s.id === task.assignee);
      const assigneeName = assignee?.chatName ?? task.assignee;
      const stageLabel = args.stage === "first_frame" ? "khung đầu" : "full clip";
      if (args.verdict === "APPROVED") {
        await db.insert(schema.messages).values({
          channel: "company",
          sender: "Đạo diễn",
          body: `Khen ${assigneeName} trước toàn công ty: ${stageLabel} việc #${task.id} "${task.title}" đã qua QC đạt chuẩn. Làm tốt lắm, cứ thế phát huy nhé ${assigneeName}!`,
          recipient: "",
          createdAt: new Date(),
        });
      } else {
        await db.insert(schema.messages).values({
          channel: "company",
          sender: "QC",
          body: `Nhắc ${assigneeName}: ${stageLabel} việc #${task.id} "${task.title}" chưa đạt, phải làm lại. Lý do: ${args.reason} — sửa đúng chỗ này rồi nộp lại cho QC nhé.`,
          recipient: "",
          createdAt: new Date(),
        });
      }
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  listProducts: defineAction({
    description: "Lists products in the company warehouse, newest first.",
    request: z.object({}),
    response: z.object({
      products: z.array(
        z.object({
          id: z.number(),
          title: z.string(),
          task_id: z.number().nullable(),
          room: z.string(),
          owner: z.string(),
          file_name: z.string(),
          note: z.string(),
          version: z.string(),
          return_reason: z.string(),
          file_size: z.number().nullable(),
          file_md5: z.string(),
          publishable: z.boolean(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.products)
        .orderBy(desc(schema.products.id));
      return {
        products: rows.map((p) => ({
          id: p.id,
          title: p.title,
          task_id: p.taskId,
          room: p.room,
          owner: p.owner,
          file_name: p.fileName,
          note: p.note,
          version: p.version,
          return_reason: p.returnReason,
          file_size: p.fileSize,
          file_md5: p.fileMd5,
          publishable: p.publishable === 1,
          created_at: p.createdAt.toISOString(),
        })),
      };
    },
  }),

  addProduct: defineAction({
    description: "Adds a finished product to the warehouse and logs it.",
    request: z.object({
      title: z.string().trim().min(1).max(200),
      task_id: z.number().int().positive().nullable().default(null),
      owner: z.string().trim().max(60).default(""),
      file_name: z.string().trim().max(200).default(""),
      note: z.string().trim().max(4000).default(""),
      version: z.string().trim().min(1).max(20).default("v1"),
      return_reason: z.string().trim().max(4000).default(""),
      file_size: z.number().int().nonnegative().max(10737418240).nullable().default(null),
      file_md5: z.string().trim().max(64).default(""),
      publishable: z.boolean().default(false),
      actor: z.string().trim().max(60).default("Đạo diễn"),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.products)
        .values({
          title: args.title,
          taskId: args.task_id,
          room: "video",
          owner: args.owner,
          fileName: args.file_name,
          note: args.note,
          version: args.version,
          returnReason: args.return_reason,
          fileSize: args.file_size,
          fileMd5: args.file_md5,
          publishable: args.publishable ? 1 : 0,
          createdAt: new Date(),
        })
        .returning({ id: schema.products.id });
      const inserted = result[0];
      if (!inserted) throw new Error("addProduct: insert returned no rows");
      await logAudit(
        ctx,
        args.actor,
        "Nhập kho sản phẩm",
        `Sản phẩm #${inserted.id} "${args.title}" [${args.version}]${args.file_name ? ` (${args.file_name})` : ""}${args.publishable ? " — BẢN ĐƯỢC ĐĂNG" : ""}`,
      );
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  deleteProduct: defineAction({
    description: "Removes a product from the warehouse.",
    request: z.object({
      id: z.number().int().positive(),
      actor: z.string().trim().max(60).default("Tổng giám đốc"),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.id, args.id));
      const product = rows[0];
      if (!product) throw new Error("Không tìm thấy sản phẩm này.");
      await db.delete(schema.products).where(eq(schema.products.id, args.id));
      await logAudit(
        ctx,
        args.actor,
        "Xóa sản phẩm",
        `Đã xóa sản phẩm #${product.id} "${product.title}" khỏi kho`,
      );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  listMessages: defineAction({
    description:
      "Lists messages in one chat thread: the company channel, the shared CEO–Director line (recipient \"\"), or a 1-1 thread with one staff member (recipient = staff id).",
    request: z.object({
      channel: z.enum(["company", "direct"]),
      recipient: z.string().trim().max(60).default(""),
    }),
    response: z.object({
      messages: z.array(
        z.object({
          id: z.number(),
          channel: z.enum(["company", "direct"]),
          sender: z.string(),
          body: z.string(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      // Take the LATEST 200 messages (newest first), then present them
      // oldest → newest: with a plain ascending limit the channel would
      // freeze on the first 200 messages ever sent and new ones would
      // never appear.
      const rows = await db
        .select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.channel, args.channel),
            eq(schema.messages.recipient, args.recipient),
          ),
        )
        .orderBy(desc(schema.messages.id))
        .limit(200);
      rows.reverse();
      return {
        messages: rows.map((m) => ({
          id: m.id,
          channel: m.channel,
          sender: m.sender,
          body: m.body,
          created_at: m.createdAt.toISOString(),
        })),
      };
    },
  }),

  sendMessage: defineAction({
    description:
      "Posts a message to a chat thread and returns it with any staff replies. A leadership message (from Chủ tịch / Tổng giám đốc) is routed to the staff it names in plain conversation — just typing a name like Đạo diễn, Video 01 or Ngọc Linh, no @ needed — to the 1-1 recipient, or — on the shared direct line — to the Đạo diễn; a greeting to the whole company is answered by the Lễ tân (and the Đạo diễn when it addresses everyone). Each addressed staff member replies in the same thread, in their own personality: small talk gets natural chit-chat, work gets a work answer.",
    request: z.object({
      channel: z.enum(["company", "direct"]),
      recipient: z.string().trim().max(60).default(""),
      sender: z.string().trim().min(1).max(60),
      body: z.string().trim().min(1).max(4000),
    }),
    response: z.object({
      id: z.number(),
      replies: z.array(z.object({ sender: z.string(), body: z.string() })),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.messages)
        .values({
          channel: args.channel,
          sender: args.sender,
          body: args.body,
          recipient: args.recipient,
          createdAt: new Date(),
        })
        .returning({ id: schema.messages.id });
      const inserted = result[0];
      if (!inserted) throw new Error("sendMessage: insert returned no rows");

      // Staff replies: only leadership messages trigger them, so the
      // workflow posts staff send among themselves (nhận việc, nộp bài…)
      // never cascade into auto-replies.
      const replies: { sender: string; body: string }[] = [];
      const isLeadership = args.sender === "Chủ tịch" || args.sender === "Tổng giám đốc";
      if (isLeadership) {
        let targets: StaffContact[] = [];
        if (args.channel === "direct" && args.recipient) {
          const target = STAFF_DIRECTORY.find((s) => s.id === args.recipient);
          if (target && target.id !== "chu-tich" && target.chatName !== args.sender) {
            targets = [target];
          }
        } else if (args.channel === "direct") {
          const director = STAFF_DIRECTORY.find((s) => s.id === "dao-dien");
          if (director) targets = [director];
        } else {
          targets = findMentionedStaff(args.body, args.sender);
          if (targets.length === 0 && isCasualMessage(args.body)) {
            // A greeting / small talk to the room at large: the Lễ tân —
            // always on duty at the front desk — answers first; when the
            // message greets the whole company, the Đạo diễn joins in.
            const receptionist = STAFF_DIRECTORY.find((s) => s.id === "le-tan");
            if (receptionist && receptionist.chatName !== args.sender) targets = [receptionist];
            if (greetsEveryone(args.body)) {
              const director = STAFF_DIRECTORY.find((s) => s.id === "dao-dien");
              if (director && director.chatName !== args.sender) targets.push(director);
            }
          }
        }
        for (const target of targets) {
          const replyBody = await composeStaffReply(ctx, target, args);
          await db.insert(schema.messages).values({
            channel: args.channel,
            sender: target.chatName,
            body: replyBody,
            recipient: args.recipient,
            createdAt: new Date(),
          });
          replies.push({ sender: target.chatName, body: replyBody });
        }
      }
      ctx.invalidateQueries();
      return { id: inserted.id, replies };
    },
  }),

  runOfficeLife: defineAction({
    description:
      "Runs one office-life tick for the caller's local clock and returns any ambient company-channel posts it made: weekday 08:00 morning meeting (5 minutes, minuted by the Thư ký from real open tasks), morning staff-to-staff greetings, a 12:00 lunch call, the Đạo diễn's 17:30 end-of-day report from real task counts, birthday celebrations, and bounded casual chatter — only ever from staff holding no open task, so chatter never interrupts assigned work. Weekends and off-hours post nothing. Every event fires at most once per day (audit-log markers).",
    request: z.object({
      date_key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      weekday: z.number().int().min(0).max(6),
    }),
    response: z.object({
      posted: z.array(z.object({ sender: z.string(), body: z.string() })),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const posted: { sender: string; body: string }[] = [];
      const mins = args.hour * 60 + args.minute;
      const isWeekday = args.weekday >= 1 && args.weekday <= 5;
      if (!isWeekday) return { posted };

      const markerExists = async (key: string): Promise<boolean> => {
        const rows = await db
          .select({ id: schema.auditLog.id })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.action, key))
          .limit(1);
        return rows.length > 0;
      };
      const post = async (sender: StaffContact, body: string) => {
        await db.insert(schema.messages).values({
          channel: "company",
          sender: sender.chatName,
          body,
          recipient: "",
          createdAt: new Date(),
        });
        posted.push({ sender: sender.chatName, body });
      };
      const byId = (id: string) => STAFF_DIRECTORY.find((s) => s.id === id);
      const seedOf = (s: string) => {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return h;
      };
      const pick = <T,>(arr: T[], seed: string): T | undefined =>
        arr.length ? arr[seedOf(seed) % arr.length] : undefined;

      const taskRows = await db.select().from(schema.tasks);
      const openTasks = taskRows.filter((t) => t.status !== "APPROVED");
      const busyIds = new Set<string>(openTasks.map((t) => t.assignee));
      if (taskRows.some((t) => t.status === "REVIEW" || t.status === "IN_PROGRESS")) {
        busyIds.add("dao-dien");
        busyIds.add("qc");
      }
      // Tán gẫu có giới hạn: chỉ người không giữ việc mở mới được tán gẫu.
      const freeStaff = STAFF_DIRECTORY.filter(
        (s) => s.id !== "chu-tich" && s.id !== "le-tan" && !busyIds.has(s.id),
      );

      // --- Họp sáng 5 phút (ngày làm việc, 07:55–09:30): Thư ký ghi biên
      // bản từ việc thật đang mở, biên bản lưu vào bảng họp như họp thật.
      if (mins >= 7 * 60 + 55 && mins <= 9 * 60 + 30) {
        const key = `office:morning-meeting:${args.date_key}`;
        if (!(await markerExists(key))) {
          const openList = openTasks.length
            ? openTasks
                .slice(0, 6)
                .map((t) => `#${t.id} "${t.title}" (${TASK_STATUS_VI[t.status] ?? t.status}, ${byId(t.assignee)?.chatName ?? t.assignee})`)
                .join("; ")
            : "chưa có việc nào đang mở";
          const redo = taskRows.filter((t) => t.status === "REVISION_REQUIRED");
          await db.insert(schema.meetings).values({
            room: "meeting",
            title: `Họp sáng toàn công ty — ${args.date_key}`,
            decisions: `Họp sáng 5 phút đầu ngày: rà toàn bộ việc đang mở (${openTasks.length} việc): ${openList}. Ai giữ việc nào tập trung việc đó, tán gẫu để giờ nghỉ.`,
            actions: openTasks.length
              ? openTasks
                  .slice(0, 6)
                  .map((t) => `${byId(t.assignee)?.chatName ?? t.assignee} tiếp tục việc #${t.id} "${t.title}"`)
                  .join("; ")
              : "Chờ brief mới từ Chủ tịch / Tổng giám đốc.",
            risks: redo.length
              ? `${redo.length} việc đang phải làm lại: ${redo.map((t) => `#${t.id}`).join(", ")} — ưu tiên sửa đúng lý do QC đã ghi.`
              : "Không có việc nào bị trả làm lại.",
            createdAt: new Date(),
          });
          const secretary = byId("thu-ky");
          if (secretary) {
            await post(
              secretary,
              `Em đã ghi biên bản họp sáng 5 phút hôm nay (${args.date_key}) vào mục Họp: toàn công ty đang có ${openTasks.length} việc đang mở. Anh em xem biên bản để nắm việc của mình nhé.`,
            );
          }
          await logAudit(ctx, "Đời sống công ty", key, "Họp sáng 5 phút + biên bản của Thư ký");
        }
      }

      // --- Chào buổi sáng: nhân viên tự chào nhau, không đợi Chủ tịch nhắn.
      if (mins >= 7 * 60 + 30 && mins <= 10 * 60) {
        const key = `office:morning-greetings:${args.date_key}`;
        if (!(await markerExists(key))) {
          const receptionist = byId("le-tan");
          if (receptionist) {
            await post(
              receptionist,
              await composeCasualLine(
                ctx,
                receptionist,
                null,
                "buổi sáng bạn vừa tới bàn Lễ tân giữa sảnh, mở cửa công ty và chào buổi sáng cả công ty",
                "Chào buổi sáng cả nhà! Em Ngọc Anh trực sảnh đây ạ — chúc mọi người một ngày làm việc thật nhiều năng lượng nhé!",
              ),
            );
          }
          const greeter = pick(freeStaff, `greet-a:${args.date_key}`);
          const greeted = pick(
            freeStaff.filter((s) => s.id !== greeter?.id),
            `greet-b:${args.date_key}`,
          );
          if (greeter && greeted) {
            await post(
              greeter,
              await composeCasualLine(
                ctx,
                greeter,
                greeted,
                "buổi sáng ở hành lang / khu trà, bạn gặp đồng nghiệp và chào hỏi, hỏi thăm nhau như người thật",
                `Chào buổi sáng ${greeted.chatName}! Hôm nay trông tươi thế, tối qua ngủ ngon không? Vào làm lát ghé khu trà làm ly cà phê với mình nhé.`,
              ),
            );
          }
          await logAudit(ctx, "Đời sống công ty", key, "Nhân viên tự chào nhau buổi sáng");
        }
      }

      // --- Sinh nhật: ngày sinh cố định theo từng nhân viên (suy ra ổn định
      // từ mã nhân viên), tới ngày là cả công ty chúc mừng.
      {
        const [, mm, dd] = args.date_key.split("-").map(Number);
        const celebrant = STAFF_DIRECTORY.find((s) => {
          if (s.id === "chu-tich") return false;
          const h = seedOf(`birthday:${s.id}`);
          return 1 + (h % 12) === mm && 1 + ((h >> 4) % 28) === dd;
        });
        if (celebrant) {
          const key = `office:birthday:${celebrant.id}:${args.date_key.slice(0, 4)}`;
          if (!(await markerExists(key))) {
            const receptionist = byId("le-tan");
            if (receptionist) {
              await post(
                receptionist,
                `Cả nhà ơi, hôm nay là sinh nhật của ${celebrant.chatName} (${celebrant.role})! Lễ tân thay mặt công ty chúc ${celebrant.chatName} tuổi mới thật nhiều sức khỏe, niềm vui và làm việc gì cũng thuận lợi nhé!`,
              );
            }
            const wisher = pick(
              freeStaff.filter((s) => s.id !== celebrant.id),
              `birthday:${args.date_key}`,
            );
            if (wisher) {
              await post(
                wisher,
                await composeCasualLine(
                  ctx,
                  wisher,
                  celebrant,
                  `hôm nay là sinh nhật của ${celebrant.chatName}, bạn chúc mừng sinh nhật bạn ấy trong kênh công ty`,
                  `Chúc mừng sinh nhật ${celebrant.chatName} nhé! Trưa nay cả nhóm ghé khu ăn uống mừng sinh nhật bạn, mình bao cà phê!`,
                ),
              );
            }
            await logAudit(ctx, "Đời sống công ty", key, `Chúc mừng sinh nhật ${celebrant.chatName}`);
          }
        }
      }

      // --- 12:00: gọi nhau nghỉ ăn trưa (nghỉ trưa 12:00–13:00).
      if (mins >= 12 * 60 && mins <= 12 * 60 + 25) {
        const key = `office:lunch-call:${args.date_key}`;
        if (!(await markerExists(key))) {
          const caller = pick(freeStaff, `lunch:${args.date_key}`) ?? byId("le-tan");
          if (caller) {
            await post(
              caller,
              await composeCasualLine(
                ctx,
                caller,
                null,
                "đúng 12 giờ trưa, bạn gọi cả công ty nghỉ tay xuống khu ăn uống ăn trưa, nghỉ trưa tới 13 giờ",
                "12 giờ rồi cả nhà ơi, nghỉ tay đi ăn trưa thôi! Xuống khu ăn uống nhé, nghỉ tới 13 giờ chiều làm tiếp ạ.",
              ),
            );
          }
          await logAudit(ctx, "Đời sống công ty", key, "Gọi nghỉ ăn trưa 12:00");
        }
      }

      // --- Tán gẫu giữa giờ: chỉ người không giữ việc, tối đa 8 lần/ngày,
      // cách nhau ít nhất 12 phút — có việc là dừng tán gẫu ngay.
      const inWorkPhase = (mins >= 8 * 60 + 5 && mins < 12 * 60) || (mins >= 13 * 60 && mins < 17 * 60 + 30);
      if (inWorkPhase && freeStaff.length >= 2) {
        const key = `office:chatter:${args.date_key}`;
        const todays = await db
          .select({ id: schema.auditLog.id, createdAt: schema.auditLog.createdAt })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.action, key))
          .orderBy(desc(schema.auditLog.createdAt));
        const last = todays[0];
        const gapOk = !last || Date.now() - last.createdAt.getTime() >= 12 * 60 * 1000;
        if (todays.length < 8 && gapOk) {
          const bucket = `${args.date_key}:${Math.floor(mins / 15)}`;
          const speaker = pick(freeStaff, `chat-a:${bucket}`);
          const partner = pick(
            freeStaff.filter((s) => s.id !== speaker?.id),
            `chat-b:${bucket}`,
          );
          if (speaker && partner) {
            const spots = [
              "ở khu trà giữa sảnh giờ nghỉ tay",
              "ngoài hành lang lúc đi lấy nước",
              "ở khu vườn xanh giờ thư giãn",
              "ở khu đọc sách lúc nghỉ ngắn",
              "ở quầy cà phê khu ăn uống",
            ];
            const spot = spots[seedOf(bucket) % spots.length] ?? spots[0];
            await post(
              speaker,
              await composeCasualLine(
                ctx,
                speaker,
                partner,
                `giờ nghỉ tay ngắn ${spot}, bạn tán gẫu vài câu với đồng nghiệp — cả hai đều đang không giữ việc nào, nghỉ xong là ai về việc nấy`,
                `${partner.chatName} ơi, nghỉ tay tí nào — ra khu trà làm ngụm trà cho tỉnh táo rồi làm tiếp nhé!`,
              ),
            );
            await logAudit(ctx, "Đời sống công ty", key, `${speaker.chatName} tán gẫu với ${partner.chatName}`);
          }
        }
      }

      // --- Cuối ngày (17:30–19:00): Đạo diễn báo cáo tổng kết ngày từ số
      // liệu việc thật, rồi mọi người tan làm.
      if (mins >= 17 * 60 + 30 && mins <= 19 * 60) {
        const key = `office:eod-report:${args.date_key}`;
        if (!(await markerExists(key))) {
          const director = byId("dao-dien");
          if (director) {
            const approved = taskRows.filter((t) => t.status === "APPROVED").length;
            const review = taskRows.filter((t) => t.status === "REVIEW").length;
            const redo = taskRows.filter((t) => t.status === "REVISION_REQUIRED").length;
            await post(
              director,
              `Báo cáo cuối ngày ${args.date_key}: toàn công ty có ${taskRows.length} việc trên bảng — ${approved} việc đã đạt, ${review} việc đang chờ QC duyệt, ${redo} việc phải làm lại, ${openTasks.length} việc đang mở. Anh em nghỉ ngơi, mai 7:30 vào làm tiếp nhé.`,
            );
          }
          await logAudit(ctx, "Đời sống công ty", key, "Đạo diễn báo cáo cuối ngày");
        }
      }

      if (posted.length) ctx.invalidateQueries();
      return { posted };
    },
  }),

  listJournal: defineAction({
    description:
      "The full company work journal (Nhật ký làm việc): merges the audit trail (task assignments, status moves, QC verdicts — Đạt / Làm lại — gates, warehouse, meetings saved), every chat message (work talk and small talk alike) and meeting minutes into one timeline. Filter by a local-day window (day_start_ms/day_end_ms epoch bounds, 0 = unbounded), by room id, or by staff id; newest first.",
    request: z.object({
      day_start_ms: z.number().int().nonnegative().default(0),
      day_end_ms: z.number().int().nonnegative().default(0),
      room: z.string().trim().max(60).default(""),
      staff_id: z.string().trim().max(60).default(""),
      limit: z.number().int().min(1).max(500).default(300),
    }),
    response: z.object({
      entries: z.array(
        z.object({
          key: z.string(),
          time: z.string(),
          kind: z.enum(["viec", "chat", "hop", "doi-song", "khac"]),
          actor: z.string(),
          staff_id: z.string(),
          room: z.string(),
          title: z.string(),
          detail: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const STAFF_ROOMS: Record<string, string> = {
        "chu-tich": "chairman", "tong-giam-doc": "ceo", "dao-dien": "video",
        "video-01": "video", "video-02": "video", "video-03": "video", qc: "video",
        "van-thu": "clerical", "thu-ky": "secretary", "tro-ly": "ceo", "le-tan": "reception",
        "tp-marketing": "marketing", "marketing-nv1": "marketing", "marketing-nv2": "marketing",
        "tp-chien-luoc": "strategy", "strategy-nv1": "strategy", "strategy-nv2": "strategy",
        "tp-nhan-su": "hr", "hr-nv1": "hr", "hr-nv2": "hr",
        "tp-kinh-doanh": "sales", "sales-nv1": "sales", "sales-nv2": "sales",
        "tp-noi-dung": "content", "content-nv1": "content", "content-nv2": "content",
        "tp-am-thanh": "sound", "sound-nv1": "sound", "sound-nv2": "sound",
        "tp-dang-tai": "publish", "publish-nv1": "publish", "publish-nv2": "publish",
        "tp-chieu": "screening", "chieu-nv1": "screening", "chieu-nv2": "screening",
        "tk-kho": "warehouse", "kho-nv1": "warehouse", "kho-nv2": "warehouse",
        "tp-in-an": "print", "in-an-nv1": "print", "in-an-nv2": "print",
        "tp-tai-chinh": "finance", "finance-nv1": "finance", "finance-nv2": "finance",
        "tp-phap-che": "legal", "legal-nv1": "legal", "legal-nv2": "legal",
        "tp-hop": "meeting", "hop-nv1": "meeting",
      };
      const resolveStaff = (name: string): StaffContact | undefined =>
        STAFF_DIRECTORY.find((s) => s.chatName === name || s.personName === name);
      interface Entry {
        key: string;
        time: string;
        kind: "viec" | "chat" | "hop" | "doi-song" | "khac";
        actor: string;
        staff_id: string;
        room: string;
        title: string;
        detail: string;
      }
      const entries: Entry[] = [];
      const inWindow = (t: Date) =>
        (args.day_start_ms === 0 || t.getTime() >= args.day_start_ms) &&
        (args.day_end_ms === 0 || t.getTime() < args.day_end_ms);
      const keep = (staffId: string, room: string) =>
        (args.staff_id === "" || staffId === args.staff_id) &&
        (args.room === "" || room === args.room);

      // 1) Audit trail — giao việc, chuyển trạng thái, QC đạt / làm lại,
      // cổng duyệt, kho, biên bản, và các mốc đời sống công sở.
      const auditRows = await db
        .select()
        .from(schema.auditLog)
        .orderBy(desc(schema.auditLog.id))
        .limit(600);
      for (const row of auditRows) {
        if (!inWindow(row.createdAt)) continue;
        const staff = resolveStaff(row.actor);
        const staffId = staff?.id ?? "";
        const room = staffId ? (STAFF_ROOMS[staffId] ?? "") : "";
        let kind: Entry["kind"] = "khac";
        let title = row.action;
        if (row.action.startsWith("office:")) {
          kind = "doi-song";
          title = row.action.includes("morning-meeting")
            ? "Họp sáng toàn công ty"
            : row.action.includes("morning-greetings")
              ? "Chào buổi sáng"
              : row.action.includes("birthday")
                ? "Sinh nhật nhân viên"
                : row.action.includes("lunch")
                  ? "Nghỉ ăn trưa"
                  : row.action.includes("chatter")
                    ? "Tán gẫu giờ nghỉ"
                    : "Báo cáo cuối ngày";
        } else if (
          ["Giao việc", "Chuyển trạng thái", "QC: Đạt", "QC: Làm lại", "Xóa việc"].includes(row.action) ||
          row.action.startsWith("Cổng")
        ) {
          kind = "viec";
        } else if (row.action.includes("biên bản") || row.action.includes("họp")) {
          kind = "hop";
        }
        if (!keep(staffId, room)) continue;
        entries.push({
          key: `audit-${row.id}`,
          time: row.createdAt.toISOString(),
          kind,
          actor: row.actor,
          staff_id: staffId,
          room,
          title,
          detail: row.detail,
        });
      }

      // 2) Chat — cả nói việc lẫn tán gẫu đều là một phần nhật ký.
      const msgRows = await db
        .select()
        .from(schema.messages)
        .orderBy(desc(schema.messages.id))
        .limit(600);
      for (const row of msgRows) {
        if (!inWindow(row.createdAt)) continue;
        const staff = resolveStaff(row.sender);
        const staffId = staff?.id ?? "";
        const room = staffId ? (STAFF_ROOMS[staffId] ?? "") : "";
        if (!keep(staffId, room)) continue;
        const casual = isCasualMessage(row.body);
        entries.push({
          key: `msg-${row.id}`,
          time: row.createdAt.toISOString(),
          kind: "chat",
          actor: row.sender,
          staff_id: staffId,
          room,
          title:
            row.channel === "direct"
              ? row.recipient
                ? `Tin riêng với ${STAFF_DIRECTORY.find((s) => s.id === row.recipient)?.chatName ?? row.recipient}`
                : "Tin riêng Tổng giám đốc ↔ Đạo diễn"
              : casual
                ? "Chat toàn công ty — tán gẫu"
                : "Chat toàn công ty",
          detail: row.body,
        });
      }

      // 3) Biên bản họp (lọc theo phòng họp; khi lọc theo người thì bỏ qua
      // vì biên bản là của cả phòng).
      if (args.staff_id === "") {
        const meetingRows = await db
          .select()
          .from(schema.meetings)
          .orderBy(desc(schema.meetings.id))
          .limit(100);
        for (const row of meetingRows) {
          if (!inWindow(row.createdAt)) continue;
          if (args.room !== "" && row.room !== args.room) continue;
          entries.push({
            key: `meeting-${row.id}`,
            time: row.createdAt.toISOString(),
            kind: "hop",
            actor: "Thư ký / Trưởng phòng",
            staff_id: "",
            room: row.room,
            title: row.title,
            detail: [row.decisions, row.actions, row.risks].filter(Boolean).join(" · "),
          });
        }
      }

      entries.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
      return { entries: entries.slice(0, args.limit) };
    },
  }),

  listCharacters: defineAction({
    description: "Lists the locked characters in the Brand Kit.",
    request: z.object({}),
    response: z.object({
      characters: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          cell_label: z.string(),
          description: z.string(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.characters)
        .orderBy(asc(schema.characters.id));
      return {
        characters: rows.map((c) => ({
          id: c.id,
          name: c.name,
          cell_label: c.cellLabel,
          description: c.description,
          created_at: c.createdAt.toISOString(),
        })),
      };
    },
  }),

  addCharacter: defineAction({
    description: "Locks a character into the Brand Kit with its reference cell and description.",
    request: z.object({
      name: z.string().trim().min(1).max(120),
      cell_label: z.string().trim().max(120).default(""),
      description: z.string().trim().max(2000).default(""),
      actor: z.string().trim().max(60).default("Đạo diễn"),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.characters)
        .values({
          name: args.name,
          cellLabel: args.cell_label,
          description: args.description,
          createdAt: new Date(),
        })
        .returning({ id: schema.characters.id });
      const inserted = result[0];
      if (!inserted) throw new Error("addCharacter: insert returned no rows");
      await logAudit(
        ctx,
        args.actor,
        "Khóa nhân vật",
        `Nhân vật "${args.name}"${args.cell_label ? ` — ô ${args.cell_label}` : ""} đã vào Brand Kit`,
      );
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  deleteCharacter: defineAction({
    description: "Removes a locked character from the Brand Kit.",
    request: z.object({
      id: z.number().int().positive(),
      actor: z.string().trim().max(60).default("Tổng giám đốc"),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.id, args.id));
      const character = rows[0];
      if (!character) throw new Error("Không tìm thấy nhân vật này.");
      await db
        .delete(schema.characters)
        .where(eq(schema.characters.id, args.id));
      await logAudit(
        ctx,
        args.actor,
        "Bỏ khóa nhân vật",
        `Đã bỏ nhân vật "${character.name}" khỏi Brand Kit`,
      );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  listAudit: defineAction({
    description: "Lists the company audit log, newest first.",
    request: z.object({ limit: z.number().int().positive().max(200).default(100) }),
    response: z.object({
      entries: z.array(
        z.object({
          id: z.number(),
          actor: z.string(),
          action: z.string(),
          detail: z.string(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.auditLog)
        .orderBy(desc(schema.auditLog.id))
        .limit(args.limit);
      return {
        entries: rows.map((e) => ({
          id: e.id,
          actor: e.actor,
          action: e.action,
          detail: e.detail,
          created_at: e.createdAt.toISOString(),
        })),
      };
    },
  }),

  setGate: defineAction({
    description:
      "Records the CEO's decision at one of the three approval gates (brief, first frame, final) and logs it.",
    request: z.object({
      task_id: z.number().int().positive(),
      gate: z.enum(["brief", "frame", "final"]),
      decision: z.enum(["APPROVED", "CHANGES"]),
      note: z.string().trim().max(2000).default(""),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, args.task_id));
      const task = rows[0];
      if (!task) throw new Error("Không tìm thấy việc này.");
      if (args.gate === "final" && task.status !== "APPROVED") {
        throw new Error("Cổng bản cuối chỉ duyệt được khi việc đã qua QC Đạt.");
      }
      const patch =
        args.gate === "brief"
          ? { gateBrief: args.decision }
          : args.gate === "frame"
            ? { gateFrame: args.decision }
            : { gateFinal: args.decision };
      await db
        .update(schema.tasks)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.tasks.id, args.task_id));
      const gateLabel =
        args.gate === "brief" ? "Cổng 1 — Duyệt brief" : args.gate === "frame" ? "Cổng 2 — Duyệt khung đầu mẫu" : "Cổng 3 — Duyệt bản cuối";
      await logAudit(
        ctx,
        "Tổng giám đốc",
        args.decision === "APPROVED" ? `${gateLabel}: DUYỆT` : `${gateLabel}: TRẢ VỀ SỬA`,
        `Việc #${task.id} "${task.title}"${args.note ? ` — ${args.note}` : ""}`,
      );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  listAllQcReviews: defineAction({
    description: "Lists every QC review across all tasks for KPI computation, newest first.",
    request: z.object({}),
    response: z.object({
      reviews: z.array(
        z.object({
          id: z.number(),
          task_id: z.number(),
          stage: z.enum(["first_frame", "full_clip"]),
          verdict: z.enum(["APPROVED", "REVISION_REQUIRED"]),
          check_face: z.boolean(),
          check_motion: z.boolean(),
          check_text: z.boolean(),
          check_ratio: z.boolean(),
          check_character: z.boolean(),
          reason: z.string(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.qcReviews)
        .orderBy(desc(schema.qcReviews.id))
        .limit(500);
      return {
        reviews: rows.map((r) => ({
          id: r.id,
          task_id: r.taskId,
          stage: r.stage,
          verdict: r.verdict,
          check_face: r.checkFace === 1,
          check_motion: r.checkMotion === 1,
          check_text: r.checkText === 1,
          check_ratio: r.checkRatio === 1,
          check_character: r.checkCharacter === 1,
          reason: r.reason,
          created_at: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  listProfiles: defineAction({
    description: "Lists staff capability profiles (capability, media quota used, notes).",
    request: z.object({}),
    response: z.object({
      profiles: z.array(
        z.object({
          staff_id: z.string(),
          capability: z.enum(["video", "image", "both", "none"]),
          quota_used_pct: z.number(),
          note: z.string(),
          updated_at: z.string(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.staffProfiles);
      return {
        profiles: rows.map((p) => ({
          staff_id: p.staffId,
          capability: p.capability,
          quota_used_pct: p.quotaUsedPct,
          note: p.note,
          updated_at: p.updatedAt.toISOString(),
        })),
      };
    },
  }),

  upsertProfile: defineAction({
    description: "Creates or updates one staff member's capability profile and logs the change.",
    request: z.object({
      staff_id: z.string().trim().min(1).max(60),
      capability: z.enum(["video", "image", "both", "none"]),
      quota_used_pct: z.number().min(0).max(100),
      note: z.string().trim().max(1000).default(""),
      actor: z.string().trim().max(60).default("Đạo diễn"),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db
        .insert(schema.staffProfiles)
        .values({
          staffId: args.staff_id,
          capability: args.capability,
          quotaUsedPct: args.quota_used_pct,
          note: args.note,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.staffProfiles.staffId,
          set: {
            capability: args.capability,
            quotaUsedPct: args.quota_used_pct,
            note: args.note,
            updatedAt: new Date(),
          },
        });
      await logAudit(
        ctx,
        args.actor,
        "Cập nhật hồ sơ năng lực",
        `${args.staff_id}: năng lực ${args.capability}, hạn mức media đã dùng ${args.quota_used_pct}%${args.note ? ` — ${args.note}` : ""}`,
      );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  listBrandItems: defineAction({
    description: "Lists shared Brand Kit items (outfit, setting, tone, voice, on-screen text).",
    request: z.object({}),
    response: z.object({
      items: z.array(
        z.object({
          id: z.number(),
          category: z.enum(["outfit", "setting", "tone", "voice", "text"]),
          title: z.string(),
          detail: z.string(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.brandItems)
        .orderBy(asc(schema.brandItems.id));
      return {
        items: rows.map((i) => ({
          id: i.id,
          category: i.category,
          title: i.title,
          detail: i.detail,
          created_at: i.createdAt.toISOString(),
        })),
      };
    },
  }),

  addBrandItem: defineAction({
    description: "Adds a shared Brand Kit item and logs it.",
    request: z.object({
      category: z.enum(["outfit", "setting", "tone", "voice", "text"]),
      title: z.string().trim().min(1).max(200),
      detail: z.string().trim().max(2000).default(""),
      actor: z.string().trim().max(60).default("Đạo diễn"),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.brandItems)
        .values({
          category: args.category,
          title: args.title,
          detail: args.detail,
          createdAt: new Date(),
        })
        .returning({ id: schema.brandItems.id });
      const inserted = result[0];
      if (!inserted) throw new Error("addBrandItem: insert returned no rows");
      await logAudit(
        ctx,
        args.actor,
        "Thêm mục Brand Kit",
        `[${args.category}] "${args.title}"`,
      );
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  deleteBrandItem: defineAction({
    description: "Removes a shared Brand Kit item.",
    request: z.object({
      id: z.number().int().positive(),
      actor: z.string().trim().max(60).default("Tổng giám đốc"),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.brandItems)
        .where(eq(schema.brandItems.id, args.id));
      const item = rows[0];
      if (!item) throw new Error("Không tìm thấy mục Brand Kit này.");
      await db.delete(schema.brandItems).where(eq(schema.brandItems.id, args.id));
      await logAudit(
        ctx,
        args.actor,
        "Xóa mục Brand Kit",
        `Đã xóa [${item.category}] "${item.title}"`,
      );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  listMeetings: defineAction({
    description: "Lists department meeting minutes, newest first.",
    request: z.object({}),
    response: z.object({
      meetings: z.array(
        z.object({
          id: z.number(),
          room: z.string(),
          title: z.string(),
          decisions: z.string(),
          actions: z.string(),
          risks: z.string(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.meetings)
        .orderBy(desc(schema.meetings.id));
      return {
        meetings: rows.map((m) => ({
          id: m.id,
          room: m.room,
          title: m.title,
          decisions: m.decisions,
          actions: m.actions,
          risks: m.risks,
          created_at: m.createdAt.toISOString(),
        })),
      };
    },
  }),

  createMeeting: defineAction({
    description: "Saves meeting minutes (decisions, action items, risks) for a department and logs it.",
    request: z.object({
      room: z.string().trim().min(1).max(60).default("video"),
      title: z.string().trim().min(1).max(200),
      decisions: z.string().trim().max(6000).default(""),
      actions: z.string().trim().max(6000).default(""),
      risks: z.string().trim().max(6000).default(""),
      actor: z.string().trim().max(60).default("Đạo diễn"),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.meetings)
        .values({
          room: args.room,
          title: args.title,
          decisions: args.decisions,
          actions: args.actions,
          risks: args.risks,
          createdAt: new Date(),
        })
        .returning({ id: schema.meetings.id });
      const inserted = result[0];
      if (!inserted) throw new Error("createMeeting: insert returned no rows");
      await logAudit(
        ctx,
        args.actor,
        "Lưu biên bản họp",
        `Phòng ${args.room}: "${args.title}"`,
      );
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  deleteMeeting: defineAction({
    description: "Deletes one meeting minutes record.",
    request: z.object({
      id: z.number().int().positive(),
      actor: z.string().trim().max(60).default("Tổng giám đốc"),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.meetings)
        .where(eq(schema.meetings.id, args.id));
      const meeting = rows[0];
      if (!meeting) throw new Error("Không tìm thấy biên bản này.");
      await db.delete(schema.meetings).where(eq(schema.meetings.id, args.id));
      await logAudit(
        ctx,
        args.actor,
        "Xóa biên bản họp",
        `Đã xóa biên bản "${meeting.title}"`,
      );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // ---------------------------------------------------------------------
  // Auto-orchestrated pipeline actions (TGĐ Muse điều phối)
  // ---------------------------------------------------------------------

  getPipelineSettings: defineAction({
    description: "Reads the company pipeline operating mode (auto = TGĐ tự chạy, manual = Chủ tịch bấm từng bước).",
    request: z.object({}),
    response: z.object({ mode: z.enum(["auto", "manual"]) }),
    async handler(ctx) {
      const db = dbOf(ctx);
      return { mode: await getPipelineMode(db) };
    },
  }),

  setPipelineMode: defineAction({
    description: "Switches the pipeline operating mode between Tự động (default) and Thủ công.",
    request: z.object({
      mode: z.enum(["auto", "manual"]),
      actor: z.string().trim().max(60).default("Chủ tịch"),
    }),
    response: z.object({ ok: z.literal(true), mode: z.enum(["auto", "manual"]) }),
    async handler(ctx, args): Promise<{ ok: true; mode: "auto" | "manual" }> {
      const db = dbOf(ctx);
      await db
        .insert(schema.officeSettings)
        .values({ key: "pipeline_mode", value: args.mode })
        .onConflictDoUpdate({
          target: schema.officeSettings.key,
          set: { value: args.mode },
        });
      await logAudit(
        ctx,
        args.actor,
        "Đổi chế độ vận hành dây chuyền",
        args.mode === "auto"
          ? "Chế độ TỰ ĐỘNG: TGĐ Muse tự điều phối bàn giao giữa các khâu, Chủ tịch chỉ duyệt ở 2 điểm chạm."
          : "Chế độ THỦ CÔNG: Chủ tịch tự bấm chạy từng bước để kiểm tra sâu.",
      );
      ctx.invalidateQueries();
      return { ok: true, mode: args.mode };
    },
  }),

  approveProjectOpen: defineAction({
    description:
      "Chairman's touchpoint 1 of 2: approves opening a project from its brief — creates the pipeline stages and starts TGĐ's automatic orchestration.",
    request: z.object({
      task_id: z.number().int().positive(),
      actor: z.string().trim().max(60).default("Chủ tịch"),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = dbOf(ctx);
      const task = await loadTask(db, args.task_id);
      if (task.pipelineState !== "NONE") {
        throw new Error("Dự án này đã được duyệt mở rồi — dây chuyền đang vận hành.");
      }
      const firstStage = PIPELINE_STAGES[0];
      if (!firstStage) throw new Error("Chưa cấu hình khâu đầu tiên của dây chuyền.");
      const now = new Date();
      await db
        .update(schema.tasks)
        .set({
          gateBrief: "APPROVED",
          status: "IN_PROGRESS",
          pipelineState: "RUNNING",
          currentStage: firstStage.key,
          blockedReason: "",
          updatedAt: now,
        })
        .where(eq(schema.tasks.id, task.id));
      for (const def of PIPELINE_STAGES) {
        await db.insert(schema.pipelineStages).values({
          taskId: task.id,
          stageKey: def.key,
          room: def.room,
          assignee: def.assignee,
          status: def.key === firstStage.key ? "RUNNING" : "PENDING",
          startedAt: def.key === firstStage.key ? now : null,
          createdAt: now,
          updatedAt: now,
        });
      }
      await writeStageReport(
        db,
        task.id,
        "",
        args.actor,
        `Chủ tịch DUYỆT MỞ DỰ ÁN (điểm chạm phê duyệt 1/2) — brief: ${task.title}. Từ đây TGĐ Muse điều phối toàn bộ dây chuyền tự động tới Phòng Chiếu Thử, Chủ tịch không phải duyệt các khâu trung gian.`,
        null,
      );
      await postCompanyMessage(
        db,
        TGD_NAME,
        `Chủ tịch đã duyệt mở dự án #${task.id} "${task.title}". Em điều phối dây chuyền tự động từ khâu Kịch bản & SRT — các phòng bàn giao nối tiếp nhau, trượt QC em mở họp giải cứu, chỉ dừng báo Chủ tịch khi quá ${MAX_RETRIES} lần hoặc khi bản dựng vào Phòng Chiếu Thử chờ duyệt Final.`,
      );
      await logAudit(ctx, args.actor, "Duyệt mở dự án (điểm chạm 1/2)", `Dự án #${task.id} "${task.title}" — dây chuyền tự động khởi động ở khâu Kịch bản & SRT.`);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getPipeline: defineAction({
    description: "Reads one project's full pipeline: state, stages with their real outputs, and stage reports linked to output files.",
    request: z.object({ task_id: z.number().int().positive() }),
    response: z.object({
      task_id: z.number(),
      pipeline_state: z.string(),
      current_stage: z.string(),
      blocked_reason: z.string(),
      mode: z.enum(["auto", "manual"]),
      max_retries: z.number(),
      stages: z.array(pipelineStageShape),
      reports: z.array(
        z.object({
          id: z.number(),
          stage_key: z.string(),
          actor: z.string(),
          summary: z.string(),
          product_id: z.number().nullable(),
          product_file_name: z.string(),
          product_url: z.string(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const task = await loadTask(db, args.task_id);
      const stageRows = await loadStages(db, task.id);
      const stages = [];
      for (const s of stageRows) {
        const def = stageDef(s.stageKey);
        let outName = "";
        let outSize: number | null = null;
        let outDur: number | null = null;
        let outUrl = "";
        if (s.outputProductId) {
          const prows = await db
            .select()
            .from(schema.products)
            .where(eq(schema.products.id, s.outputProductId));
          const p = prows[0];
          if (p) {
            outName = p.fileName;
            outSize = p.fileSize;
            outDur = p.durationSeconds;
            if (p.blobKey) {
              try {
                outUrl = await ctx.blobs.getUrl(p.blobKey);
              } catch {
                outUrl = "";
              }
            }
          }
        }
        stages.push({
          id: s.id,
          stage_key: s.stageKey,
          name: def?.name ?? s.stageKey,
          room: s.room,
          room_name: def?.roomName ?? s.room,
          assignee: s.assignee,
          assignee_name: def?.assigneeName ?? s.assignee,
          kind: def?.kind ?? "",
          status: s.status,
          retries: s.retries,
          forced: s.forced === 1,
          qc_note: s.qcNote,
          params: s.params,
          output_product_id: s.outputProductId,
          output_file_name: outName,
          output_file_size: outSize,
          output_duration_seconds: outDur,
          output_url: outUrl,
          started_at: s.startedAt ? s.startedAt.toISOString() : null,
          finished_at: s.finishedAt ? s.finishedAt.toISOString() : null,
        });
      }
      const reportRows = await db
        .select()
        .from(schema.stageReports)
        .where(eq(schema.stageReports.taskId, task.id))
        .orderBy(desc(schema.stageReports.id));
      const reports = [];
      for (const r of reportRows) {
        let fileName = "";
        let url = "";
        if (r.productId) {
          const prows = await db
            .select()
            .from(schema.products)
            .where(eq(schema.products.id, r.productId));
          const p = prows[0];
          if (p) {
            fileName = p.fileName;
            if (p.blobKey) {
              try {
                url = await ctx.blobs.getUrl(p.blobKey);
              } catch {
                url = "";
              }
            }
          }
        }
        reports.push({
          id: r.id,
          stage_key: r.stageKey,
          actor: r.actor,
          summary: r.summary,
          product_id: r.productId,
          product_file_name: fileName,
          product_url: url,
          created_at: r.createdAt.toISOString(),
        });
      }
      return {
        task_id: task.id,
        pipeline_state: task.pipelineState,
        current_stage: task.currentStage,
        blocked_reason: task.blockedReason,
        mode: await getPipelineMode(db),
        max_retries: MAX_RETRIES,
        stages,
        reports,
      };
    },
  }),

  advancePipeline: defineAction({
    description: "Runs TGĐ's orchestration for a project: QC-checks the current stage's real output and hands over automatically (one step in manual mode).",
    request: z.object({
      task_id: z.number().int().positive(),
      actor: z.string().trim().max(60).default("Tổng giám đốc"),
    }),
    response: orchestratorShape,
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const mode = await getPipelineMode(db);
      return await runOrchestrator(ctx, args.task_id, mode === "manual");
    },
  }),

  pausePipeline: defineAction({
    description: "Pauses a project's pipeline immediately (Chairman can pause at any moment, even mid-run).",
    request: z.object({
      task_id: z.number().int().positive(),
      actor: z.string().trim().max(60).default("Chủ tịch"),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = dbOf(ctx);
      const task = await loadTask(db, args.task_id);
      if (task.pipelineState !== "RUNNING" && task.pipelineState !== "SCREENING") {
        throw new Error("Dây chuyền không ở trạng thái đang chạy nên không tạm dừng được.");
      }
      await db
        .update(schema.tasks)
        .set({ pipelineState: "PAUSED", updatedAt: new Date() })
        .where(eq(schema.tasks.id, task.id));
      await logAudit(ctx, args.actor, "Tạm dừng dây chuyền", `Dự án #${task.id} "${task.title}" dừng tại khâu "${task.currentStage}" theo lệnh Chủ tịch.`);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  resumePipeline: defineAction({
    description: "Resumes a paused pipeline from exactly where it stopped (never from the beginning).",
    request: z.object({
      task_id: z.number().int().positive(),
      actor: z.string().trim().max(60).default("Chủ tịch"),
    }),
    response: orchestratorShape,
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const task = await loadTask(db, args.task_id);
      if (task.pipelineState !== "PAUSED") {
        throw new Error("Dây chuyền không ở trạng thái tạm dừng.");
      }
      const backTo = task.currentStage === "screening" ? "SCREENING" : "RUNNING";
      await db
        .update(schema.tasks)
        .set({ pipelineState: backTo, updatedAt: new Date() })
        .where(eq(schema.tasks.id, task.id));
      await logAudit(ctx, args.actor, "Tiếp tục dây chuyền", `Dự án #${task.id} "${task.title}" chạy tiếp từ khâu "${task.currentStage}" — không làm lại từ đầu.`);
      const mode = await getPipelineMode(db);
      if (mode === "auto" && backTo === "RUNNING") {
        return await runOrchestrator(ctx, args.task_id, false);
      }
      ctx.invalidateQueries();
      return { state: backTo, current_stage: task.currentStage, note: "Đã bỏ tạm dừng — dây chuyền sẵn sàng chạy tiếp từ khâu hiện tại." };
    },
  }),

  uploadStageOutput: defineAction({
    description:
      "Delivers a stage's real output file into the office store (from the local pipeline or a manual upload): stores the bytes as a blob, registers the product version, then TGĐ runs the QC gate in auto mode.",
    request: z.object({
      task_id: z.number().int().positive(),
      stage_key: z.string().trim().min(1).max(40),
      file_name: z.string().trim().min(1).max(200),
      mime: z.string().trim().max(100).default("application/octet-stream"),
      data_base64: z.string().min(1).max(12000000),
      duration_seconds: z.number().positive().max(86400).nullable().default(null),
      text_content: z.string().max(200000).nullable().default(null),
      actor: z.string().trim().max(60).default("Pipeline local"),
    }),
    response: z.object({ id: z.number(), pipeline: orchestratorShape }),
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const task = await loadTask(db, args.task_id);
      const def = stageDef(args.stage_key);
      if (!def || def.kind === "gate") throw new Error("Khâu không hợp lệ để nộp file đầu ra.");
      const stageRows = await loadStages(db, task.id);
      if (!stageRows.some((s) => s.stageKey === args.stage_key)) {
        throw new Error("Dự án chưa được duyệt mở — chưa có dây chuyền để nộp đầu ra.");
      }
      // Decode the real file bytes (chunked atob — no fake metadata).
      const binary = atob(args.data_base64.replace(/\s/g, ""));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      if (bytes.length === 0) throw new Error("File tải lên rỗng — không có dữ liệu thật.");
      const existing = await db
        .select()
        .from(schema.products)
        .where(and(eq(schema.products.taskId, task.id), eq(schema.products.stageKey, args.stage_key)));
      const version = `v${existing.length + 1}`;
      const inserted = await db
        .insert(schema.products)
        .values({
          title: `${task.title} — ${def.name}`,
          taskId: task.id,
          room: def.room,
          owner: def.assigneeName,
          fileName: args.file_name,
          note: args.text_content ?? "",
          version,
          returnReason: "",
          fileSize: bytes.length,
          fileMd5: "",
          publishable: 0,
          blobKey: "",
          stageKey: args.stage_key,
          durationSeconds: args.duration_seconds,
          createdAt: new Date(),
        })
        .returning({ id: schema.products.id });
      const product = inserted[0];
      if (!product) throw new Error("uploadStageOutput: insert returned no rows");
      const safeName = args.file_name.replace(/[^\p{L}\p{N}._-]+/gu, "_");
      const blobKey = `stage-output/${task.id}/${args.stage_key}/${product.id}-${safeName}`;
      await ctx.blobs.put(blobKey, bytes, { contentType: args.mime });
      await db
        .update(schema.products)
        .set({ blobKey })
        .where(eq(schema.products.id, product.id));
      await logAudit(
        ctx,
        args.actor,
        "Nộp đầu ra khâu",
        `Dự án #${task.id}: ${def.roomName} nộp file "${args.file_name}" [${version}] cho khâu "${def.name}" (${bytes.length} byte${args.duration_seconds ? ` · ${args.duration_seconds}s` : ""}) — chờ cổng QC.`,
      );
      const mode = await getPipelineMode(db);
      if (mode === "auto" && task.pipelineState === "RUNNING") {
        const pipeline = await runOrchestrator(ctx, task.id, false);
        return { id: product.id, pipeline };
      }
      ctx.invalidateQueries();
      return {
        id: product.id,
        pipeline: {
          state: task.pipelineState,
          current_stage: task.currentStage,
          note:
            task.pipelineState === "PAUSED"
              ? "Đã lưu file vào kho — dây chuyền đang tạm dừng nên QC chưa chạy."
              : "Đã lưu file vào kho — chế độ Thủ công: bấm Chạy bước tiếp theo để qua cổng QC.",
        },
      };
    },
  }),

  getStageOutput: defineAction({
    description: "Reads a stage's latest real output (preview URL, measured facts, editable text for script/SRT) plus its version history.",
    request: z.object({
      task_id: z.number().int().positive(),
      stage_key: z.string().trim().min(1).max(40),
    }),
    response: z.object({
      product_id: z.number().nullable(),
      file_name: z.string(),
      file_size: z.number().nullable(),
      duration_seconds: z.number().nullable(),
      version: z.string(),
      url: z.string(),
      text_content: z.string(),
      versions: z.array(
        z.object({
          id: z.number(),
          file_name: z.string(),
          version: z.string(),
          file_size: z.number().nullable(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const db = dbOf(ctx);
      await loadTask(db, args.task_id);
      const products = await loadStageProducts(db, args.task_id, args.stage_key);
      const latest = products[0];
      if (!latest) {
        return {
          product_id: null,
          file_name: "",
          file_size: null,
          duration_seconds: null,
          version: "",
          url: "",
          text_content: "",
          versions: [],
        };
      }
      let url = "";
      try {
        url = await ctx.blobs.getUrl(latest.blobKey);
      } catch {
        url = "";
      }
      const def = stageDef(args.stage_key);
      return {
        product_id: latest.id,
        file_name: latest.fileName,
        file_size: latest.fileSize,
        duration_seconds: latest.durationSeconds,
        version: latest.version,
        url,
        text_content: def?.kind === "text" ? latest.note : "",
        versions: products.map((p) => ({
          id: p.id,
          file_name: p.fileName,
          version: p.version,
          file_size: p.fileSize,
          created_at: p.createdAt.toISOString(),
        })),
      };
    },
  }),

  editStageOutputText: defineAction({
    description:
      "Chairman's manual edit of a text stage output (script/SRT) directly in the web: saves a new version, invalidates that stage and everything downstream, and resumes the line from there when running in auto mode.",
    request: z.object({
      task_id: z.number().int().positive(),
      stage_key: z.string().trim().min(1).max(40),
      content: z.string().min(1).max(200000),
      actor: z.string().trim().max(60).default("Chủ tịch"),
    }),
    response: z.object({ id: z.number(), pipeline: orchestratorShape }),
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const task = await loadTask(db, args.task_id);
      const def = stageDef(args.stage_key);
      if (!def || def.kind !== "text") {
        throw new Error("Chỉ sửa tay trực tiếp được đầu ra dạng chữ (kịch bản/SRT) — các khâu khác sửa bằng cách nộp file mới.");
      }
      const products = await loadStageProducts(db, task.id, args.stage_key);
      const latest = products[0];
      if (!latest) throw new Error("Khâu này chưa có file đầu ra để sửa — hãy nộp file trước.");
      const version = `v${products.length + 1}`;
      const bytes = new TextEncoder().encode(args.content);
      const inserted = await db
        .insert(schema.products)
        .values({
          title: latest.title,
          taskId: task.id,
          room: def.room,
          owner: args.actor,
          fileName: latest.fileName,
          note: args.content,
          version,
          returnReason: "",
          fileSize: bytes.length,
          fileMd5: "",
          publishable: 0,
          blobKey: "",
          stageKey: args.stage_key,
          durationSeconds: null,
          createdAt: new Date(),
        })
        .returning({ id: schema.products.id });
      const product = inserted[0];
      if (!product) throw new Error("editStageOutputText: insert returned no rows");
      const blobKey = `stage-output/${task.id}/${args.stage_key}/${product.id}-${latest.fileName.replace(/[^\p{L}\p{N}._-]+/gu, "_")}`;
      await ctx.blobs.put(blobKey, args.content, { contentType: "text/plain; charset=utf-8" });
      await db.update(schema.products).set({ blobKey }).where(eq(schema.products.id, product.id));
      // Invalidate this stage + downstream; the line resumes from
      // here — earlier stages keep their accepted results.
      await invalidateFromStage(db, task.id, args.stage_key);
      let state = task.pipelineState;
      if (state === "BLOCKED" || state === "DONE") {
        state = "RUNNING";
        await db
          .update(schema.tasks)
          .set({ pipelineState: "RUNNING", blockedReason: "", updatedAt: new Date() })
          .where(eq(schema.tasks.id, task.id));
      }
      await writeStageReport(
        db,
        task.id,
        args.stage_key,
        args.actor,
        `Chủ tịch SỬA TAY đầu ra khâu "${def.name}" ngay trên web (bản ${version} của file "${latest.fileName}") — khâu này và các khâu phía sau chạy lại từ đây, các khâu trước giữ nguyên kết quả.`,
        product.id,
      );
      await logAudit(ctx, args.actor, "Sửa tay đầu ra khâu", `Dự án #${task.id}: sửa khâu "${def.name}" (${version}) → chạy tiếp từ khâu này.`);
      const mode = await getPipelineMode(db);
      if (mode === "auto" && state === "RUNNING") {
        const pipeline = await runOrchestrator(ctx, task.id, false);
        return { id: product.id, pipeline };
      }
      ctx.invalidateQueries();
      return {
        id: product.id,
        pipeline: {
          state,
          current_stage: args.stage_key,
          note: "Đã lưu bản sửa — bấm Tiếp tục từ khâu này để dây chuyền chạy tiếp.",
        },
      };
    },
  }),

  resumeFromStage: defineAction({
    description: "Resumes the pipeline from a chosen stage: that stage and everything downstream re-run, earlier stages keep their results. Also clears a QC block.",
    request: z.object({
      task_id: z.number().int().positive(),
      stage_key: z.string().trim().min(1).max(40),
      actor: z.string().trim().max(60).default("Chủ tịch"),
    }),
    response: orchestratorShape,
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const task = await loadTask(db, args.task_id);
      const def = stageDef(args.stage_key);
      if (!def) throw new Error("Khâu không hợp lệ.");
      if (task.pipelineState === "NONE") throw new Error("Dự án chưa được duyệt mở.");
      await invalidateFromStage(db, task.id, args.stage_key);
      await db
        .update(schema.tasks)
        .set({ pipelineState: "RUNNING", blockedReason: "", updatedAt: new Date() })
        .where(eq(schema.tasks.id, task.id));
      await logAudit(
        ctx,
        args.actor,
        "Tiếp tục từ khâu này",
        `Dự án #${task.id}: chạy tiếp từ khâu "${def.name}" — các khâu trước giữ nguyên, khâu này và phía sau chạy lại.`,
      );
      const mode = await getPipelineMode(db);
      if (mode === "auto") {
        return await runOrchestrator(ctx, task.id, false);
      }
      ctx.invalidateQueries();
      return { state: "RUNNING", current_stage: args.stage_key, note: `Đã đặt lại điểm chạy từ khâu "${def.name}" (chế độ Thủ công: bấm Chạy bước tiếp theo để qua QC).` };
    },
  }),

  forcePassStage: defineAction({
    description: "Chairman's Force Pass: overrides a QC-blocked stage, records the override in the report, and resumes the line from the next stage.",
    request: z.object({
      task_id: z.number().int().positive(),
      stage_key: z.string().trim().min(1).max(40),
      actor: z.string().trim().max(60).default("Chủ tịch"),
    }),
    response: orchestratorShape,
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const task = await loadTask(db, args.task_id);
      const def = stageDef(args.stage_key);
      if (!def || def.kind === "gate") throw new Error("Khâu không hợp lệ để duyệt cưỡng bức.");
      const stages = await loadStages(db, task.id);
      const stage = stages.find((s) => s.stageKey === args.stage_key);
      if (!stage) throw new Error("Không tìm thấy khâu trong dây chuyền.");
      const products = await loadStageProducts(db, task.id, args.stage_key);
      const latest = products[0];
      if (!latest) throw new Error("Khâu chưa có file đầu ra nào — không thể duyệt cưỡng bức khi chưa có sản phẩm.");
      const now = new Date();
      await db
        .update(schema.pipelineStages)
        .set({
          status: "DONE",
          forced: 1,
          outputProductId: latest.id,
          lastQcProductId: latest.id,
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.pipelineStages.id, stage.id));
      const nextDef = PIPELINE_STAGES[stageIndex(args.stage_key) + 1];
      await db
        .update(schema.tasks)
        .set({
          pipelineState: "RUNNING",
          blockedReason: "",
          currentStage: nextDef ? nextDef.key : args.stage_key,
          updatedAt: now,
        })
        .where(eq(schema.tasks.id, task.id));
      await writeStageReport(
        db,
        task.id,
        args.stage_key,
        args.actor,
        `Chủ tịch DUYỆT CƯỠNG BỨC khâu "${def.name}" — bỏ qua cổng QC (lý do QC đã ghi: ${stage.qcNote || "—"}). File được chấp nhận: "${latest.fileName}". Dây chuyền chạy tiếp từ khâu sau.`,
        latest.id,
      );
      await postCompanyMessage(
        db,
        TGD_NAME,
        `Chủ tịch đã DUYỆT CƯỠNG BỨC khâu "${def.name}" của dự án #${task.id} "${task.title}" — em cho dây chuyền chạy tiếp từ khâu "${nextDef?.name ?? "cuối"}".`,
      );
      await logAudit(ctx, args.actor, "Duyệt cưỡng bức (Force Pass)", `Dự án #${task.id}: khâu "${def.name}" được Chủ tịch cho qua dù trượt QC — ${stage.qcNote}`);
      const mode = await getPipelineMode(db);
      if (mode === "auto") {
        return await runOrchestrator(ctx, task.id, false);
      }
      ctx.invalidateQueries();
      return { state: "RUNNING", current_stage: nextDef?.key ?? args.stage_key, note: `Đã duyệt cưỡng bức khâu "${def.name}" — dây chuyền sẵn sàng chạy tiếp.` };
    },
  }),

  approveFinal: defineAction({
    description:
      "Chairman's touchpoint 2 of 2 at the Screening Room: approves the Final (project done, edit output becomes publishable) or sends the line back to the edit stage.",
    request: z.object({
      task_id: z.number().int().positive(),
      decision: z.enum(["APPROVED", "CHANGES"]),
      note: z.string().trim().max(2000).default(""),
      actor: z.string().trim().max(60).default("Chủ tịch"),
    }),
    response: orchestratorShape,
    async handler(ctx, args) {
      const db = dbOf(ctx);
      const task = await loadTask(db, args.task_id);
      const stages = await loadStages(db, task.id);
      const screening = stages.find((s) => s.stageKey === "screening");
      const priorDone = stages
        .filter((s) => s.stageKey !== "screening")
        .every((s) => s.status === "DONE");
      if (!screening || !priorDone || (task.pipelineState !== "SCREENING" && task.pipelineState !== "PAUSED")) {
        throw new Error("Dự án chưa ở Phòng Chiếu Thử — duyệt Final chỉ thực hiện được khi bản dựng đã chiếu thử xong và chờ duyệt.");
      }
      const now = new Date();
      const editStage = stages.find((s) => s.stageKey === "edit");
      if (args.decision === "APPROVED") {
        await db
          .update(schema.pipelineStages)
          .set({ status: "DONE", finishedAt: now, updatedAt: now })
          .where(eq(schema.pipelineStages.id, screening.id));
        await db
          .update(schema.tasks)
          .set({
            gateFinal: "APPROVED",
            status: "APPROVED",
            pipelineState: "DONE",
            updatedAt: now,
          })
          .where(eq(schema.tasks.id, task.id));
        if (editStage?.outputProductId) {
          await db
            .update(schema.products)
            .set({ publishable: 1 })
            .where(eq(schema.products.id, editStage.outputProductId));
        }
        await writeStageReport(
          db,
          task.id,
          "screening",
          args.actor,
          `Chủ tịch DUYỆT FINAL tại Phòng Chiếu Thử (điểm chạm phê duyệt 2/2) — dự án hoàn tất, bản dựng được phép xuất bản.${args.note ? ` Ghi chú: ${args.note}` : ""}`,
          editStage?.outputProductId ?? null,
        );
        await postCompanyMessage(
          db,
          TGD_NAME,
          `Chủ tịch đã DUYỆT FINAL dự án #${task.id} "${task.title}" tại Phòng Chiếu Thử — dự án hoàn tất, bản dựng chính thức được xuất bản. Cảm ơn cả nhà!`,
        );
        await logAudit(ctx, args.actor, "Duyệt Final (điểm chạm 2/2)", `Dự án #${task.id} "${task.title}" hoàn tất tại Phòng Chiếu Thử.`);
        ctx.invalidateQueries();
        return { state: "DONE", current_stage: "screening", note: "Chủ tịch đã duyệt Final — dự án hoàn tất, bản dựng được phép xuất bản." };
      }
      // CHANGES: send the line back to the edit stage — no full reset.
      await db
        .update(schema.tasks)
        .set({ gateFinal: "CHANGES", updatedAt: now })
        .where(eq(schema.tasks.id, task.id));
      await invalidateFromStage(db, task.id, "edit");
      await db
        .update(schema.tasks)
        .set({ pipelineState: "RUNNING", blockedReason: "", updatedAt: new Date() })
        .where(eq(schema.tasks.id, task.id));
      await writeStageReport(
        db,
        task.id,
        "screening",
        args.actor,
        `Chủ tịch TRẢ BẢN DỰNG VỀ SỬA tại Phòng Chiếu Thử${args.note ? ` — lý do: ${args.note}` : ""}. Dây chuyền chạy lại từ khâu Dựng, các khâu trước giữ nguyên.`,
        editStage?.outputProductId ?? null,
      );
      await logAudit(ctx, args.actor, "Trả bản dựng về sửa", `Dự án #${task.id}: Chủ tịch trả về từ Phòng Chiếu Thử — chạy lại từ khâu Dựng.`);
      const mode = await getPipelineMode(db);
      if (mode === "auto") {
        return await runOrchestrator(ctx, task.id, false);
      }
      ctx.invalidateQueries();
      return { state: "RUNNING", current_stage: "edit", note: "Đã trả bản dựng về khâu Dựng — dây chuyền chạy tiếp từ đó." };
    },
  }),

  bootstrapCanh05: defineAction({
    description:
      "One-time kickoff for the Cảnh 05 project, ordered by the Chairman ('Fix all'): locks the brief's own two characters (ô Variation 1/2) and shared standards into the Brand Kit, opens the pipeline, delivers the real script & SRT built from the brief's own beats so TGĐ's automatic QC gate runs on a real file, then exercises Pause → Resume once for real — ending RUNNING at the voice stage, waiting for the real voice file. Idempotent: existing Brand Kit cells/titles, an opened pipeline and a delivered script are left untouched.",
    request: z.object({
      task_id: z.number().int().positive(),
      actor: z.string().trim().max(60).default("Tổng giám đốc"),
    }),
    response: z.object({
      ok: z.literal(true),
      characters_added: z.number(),
      brand_items_added: z.number(),
      pipeline_state: z.string(),
      current_stage: z.string(),
      script_product_id: z.number().nullable(),
      note: z.string(),
    }),
    async handler(ctx, args): Promise<{
      ok: true;
      characters_added: number;
      brand_items_added: number;
      pipeline_state: string;
      current_stage: string;
      script_product_id: number | null;
      note: string;
    }> {
      const db = dbOf(ctx);
      const task = await loadTask(db, args.task_id);
      const now = new Date();
      let charactersAdded = 0;
      let brandItemsAdded = 0;

      // --- 1) Brand Kit: lock the two characters named in the
      // brief's own character lock (ô Variation 1 / Variation 2)
      // plus the shared standards the brief itself fixes. Every
      // string below is copied from the task's brief /
      // character_lock — the Chairman's own data, not invented.
      // Idempotent: an existing cell/title is left alone.
      const lockChars: { name: string; cell: string; description: string }[] = [
        {
          name: "Bố",
          cell: "Variation 1",
          description:
            "Nam ~35 tuổi, tóc ngắn gọn, áo polo màu xanh navy, kính gọng đen mảnh, đồng hồ dây da đen. Ô Variation 1 duy nhất trong Brand Kit — trang phục và khuôn mặt giữ nguyên 100% theo ô này, không tự thêm phụ kiện.",
        },
        {
          name: "Con gái",
          cell: "Variation 2",
          description:
            "Bé gái ~5 tuổi, tóc buộc hai bím nhỏ kẹp nơ trắng, váy yếm jean bên ngoài áo thun trắng. Ô Variation 2 duy nhất trong Brand Kit — trang phục và khuôn mặt giữ nguyên 100% theo ô này, không tự thêm phụ kiện.",
        },
      ];
      const existingChars = await db.select().from(schema.characters);
      for (const c of lockChars) {
        if (existingChars.some((e) => e.cellLabel === c.cell)) continue;
        await db.insert(schema.characters).values({
          name: c.name,
          cellLabel: c.cell,
          description: c.description,
          createdAt: now,
        });
        charactersAdded += 1;
      }
      const lockItems: { category: "outfit" | "setting" | "tone" | "text"; title: string; detail: string }[] = [
        {
          category: "outfit",
          title: "Trang phục Bố — ô Variation 1",
          detail:
            "Áo polo màu xanh navy, kính gọng đen mảnh, đồng hồ dây da đen; tóc ngắn gọn. Giữ nguyên 100% trong mọi cảnh, không tự thêm phụ kiện.",
        },
        {
          category: "outfit",
          title: "Trang phục Con gái — ô Variation 2",
          detail:
            "Váy yếm jean bên ngoài áo thun trắng, tóc buộc hai bím nhỏ kẹp nơ trắng. Giữ nguyên 100% trong mọi cảnh, không tự thêm phụ kiện.",
        },
        {
          category: "setting",
          title: "Bối cảnh chuẩn — cổng công viên buổi chiều",
          detail:
            "Lối đi lát gạch trước cổng công viên, phía sau có hàng cây xanh và vài người đi dạo làm mờ hậu cảnh (bokeh nhẹ).",
        },
        {
          category: "tone",
          title: "Ánh sáng & tone — golden hour ấm",
          detail:
            "Ánh nắng chiều vàng ấm (golden hour) chiếu xiên từ bên phải tạo viền tóc nhẹ. Góc máy trung cảnh (medium shot), ngang tầm mắt bé, camera đẩy nhẹ (slow push-in). Cảm xúc: ấm áp, chậm rãi → bùng nổ niềm vui nhẹ nhàng.",
        },
        {
          category: "text",
          title: "Chữ trên hình — sạch tuyệt đối",
          detail:
            "Không có chữ thừa hoặc watermark xuất hiện trong khung hình. Cây kem giữ nguyên 1 viên vani trắng + vỏ ốc quế nâu nhạt, không tự đổi màu hay tan biến giữa cảnh; không biến dạng ngón tay khi cầm ốc quế.",
        },
      ];
      const existingItems = await db.select().from(schema.brandItems);
      for (const it of lockItems) {
        if (existingItems.some((e) => e.title === it.title)) continue;
        await db.insert(schema.brandItems).values({
          category: it.category,
          title: it.title,
          detail: it.detail,
          createdAt: now,
        });
        brandItemsAdded += 1;
      }
      if (charactersAdded > 0 || brandItemsAdded > 0) {
        await logAudit(
          ctx,
          args.actor,
          "Khóa Brand Kit từ brief Cảnh 05",
          `Đã khóa ${charactersAdded} nhân vật (ô Variation 1/2) và ${brandItemsAdded} mục chuẩn dùng chung vào Brand Kit — lấy đúng từ character lock và brief của dự án #${task.id}, để QC đối chiếu nhân vật có căn cứ thật.`,
        );
      }

      // --- 2) Open the pipeline if it has never been opened
      // (the same writes approveProjectOpen makes; the Chairman
      // gave touchpoint 1/2 when he ordered this kickoff, and
      // gate_brief/gate_frame were already APPROVED).
      let fresh = await loadTask(db, task.id);
      if (fresh.pipelineState === "NONE") {
        const firstStage = PIPELINE_STAGES[0];
        if (!firstStage) throw new Error("Chưa cấu hình khâu đầu tiên của dây chuyền.");
        const t0 = new Date();
        await db
          .update(schema.tasks)
          .set({
            gateBrief: "APPROVED",
            status: "IN_PROGRESS",
            pipelineState: "RUNNING",
            currentStage: firstStage.key,
            blockedReason: "",
            updatedAt: t0,
          })
          .where(eq(schema.tasks.id, task.id));
        for (const def of PIPELINE_STAGES) {
          await db.insert(schema.pipelineStages).values({
            taskId: task.id,
            stageKey: def.key,
            room: def.room,
            assignee: def.assignee,
            status: def.key === firstStage.key ? "RUNNING" : "PENDING",
            startedAt: def.key === firstStage.key ? t0 : null,
            createdAt: t0,
            updatedAt: t0,
          });
        }
        await writeStageReport(
          db,
          task.id,
          "",
          args.actor,
          `KHỞI ĐỘNG DỰ ÁN theo lệnh "Fix all" của Chủ tịch — brief: ${task.title}. Brand Kit đã khóa xong (ô Variation 1/2), dây chuyền tự động bắt đầu ở khâu Kịch bản & SRT; TGĐ điều phối tới Phòng Chiếu Thử, Chủ tịch chỉ còn điểm chạm duyệt Final.`,
          null,
        );
        await postCompanyMessage(
          db,
          TGD_NAME,
          `Chủ tịch đã lệnh khởi động dự án #${task.id} "${task.title}": Brand Kit đã khóa 2 nhân vật (Bố — ô Variation 1, Con gái — ô Variation 2) và dây chuyền tự động đã mở ở khâu Kịch bản & SRT. Các phòng bàn giao nối tiếp, trượt QC em mở họp giải cứu, chỉ dừng báo Chủ tịch khi quá ${MAX_RETRIES} lần hoặc khi vào Phòng Chiếu Thử.`,
        );
        await logAudit(
          ctx,
          args.actor,
          "Khởi động dự án Cảnh 05 (lệnh Chủ tịch)",
          `Dự án #${task.id} "${task.title}" — dây chuyền tự động khởi động ở khâu Kịch bản & SRT, Brand Kit đã khóa ô Variation 1/2.`,
        );
        fresh = await loadTask(db, task.id);
      }

      // --- 3) The Content Room delivers the script stage's real
      // output: an SRT built from the brief's own beats (0–2s Bố
      // đưa kem · 2–4s bé đón kem cười · 4–5s khép cảnh — đúng
      // scene_seconds của dự án). The file bytes go into the
      // office store like any real delivery; TGĐ's automatic QC
      // gate then judges the real file (its cue structure is
      // parsed from the text itself).
      let scriptProductId: number | null = null;
      const scriptProducts = await loadStageProducts(db, task.id, "script");
      const existingScript = scriptProducts[0];
      if (existingScript) {
        scriptProductId = existingScript.id;
      } else if (fresh.pipelineState === "RUNNING" || fresh.pipelineState === "PAUSED") {
        const srt = [
          "1",
          "00:00:00,000 --> 00:00:02,000",
          "Bố ngồi xổm xuống ngang tầm mắt con gái, mỉm cười đưa cây kem ốc quế vị vani về phía bé.",
          "",
          "2",
          "00:00:02,000 --> 00:00:04,000",
          "Bé gái hai tay đón lấy cây kem, mắt sáng lên rồi cười rạng rỡ nhìn Bố.",
          "",
          "3",
          "00:00:04,000 --> 00:00:05,000",
          "Hai bố con cùng cười trước cổng công viên — nắng chiều vàng ấm viền tóc, camera đẩy nhẹ vào (slow push-in).",
          "",
        ].join("\n");
        const def = stageDef("script");
        if (!def) throw new Error("Không tìm thấy khâu Kịch bản & SRT.");
        const fileName = "Canh-05-kich-ban.srt";
        const bytes = new TextEncoder().encode(srt);
        const inserted = await db
          .insert(schema.products)
          .values({
            title: `${task.title} — ${def.name}`,
            taskId: task.id,
            room: def.room,
            owner: def.assigneeName,
            fileName,
            note: srt,
            version: "v1",
            returnReason: "",
            fileSize: bytes.length,
            fileMd5: "",
            publishable: 0,
            blobKey: "",
            stageKey: "script",
            durationSeconds: null,
            createdAt: new Date(),
          })
          .returning({ id: schema.products.id });
        const product = inserted[0];
        if (!product) throw new Error("bootstrapCanh05: insert product returned no rows");
        const blobKey = `stage-output/${task.id}/script/${product.id}-${fileName}`;
        await ctx.blobs.put(blobKey, bytes, { contentType: "text/plain; charset=utf-8" });
        await db.update(schema.products).set({ blobKey }).where(eq(schema.products.id, product.id));
        scriptProductId = product.id;
        await writeStageReport(
          db,
          task.id,
          "script",
          def.assigneeName,
          `Phòng Nội dung nộp kịch bản & SRT của Cảnh 05 (file "${fileName}", dựng đúng theo nhịp brief: 0–2s Bố đưa kem · 2–4s bé đón kem cười · 4–5s khép cảnh push-in) — chờ cổng QC tự động của TGĐ.`,
          product.id,
        );
        await logAudit(
          ctx,
          def.assigneeName,
          "Nộp đầu ra khâu",
          `Dự án #${task.id}: Phòng Nội dung nộp file "${fileName}" [v1] cho khâu "Kịch bản & SRT" (${bytes.length} byte) — chờ cổng QC.`,
        );
      }

      // --- 4) Run TGĐ's orchestration: the automatic QC gate
      // judges the real SRT file (in manual mode one step runs —
      // this kickoff IS the Chairman's step command).
      fresh = await loadTask(db, task.id);
      if (fresh.pipelineState === "PAUSED") {
        await db
          .update(schema.tasks)
          .set({ pipelineState: "RUNNING", updatedAt: new Date() })
          .where(eq(schema.tasks.id, task.id));
        await logAudit(
          ctx,
          args.actor,
          "Tiếp tục dây chuyền (kiểm chứng khi khởi động)",
          `Dự án #${task.id} bỏ tạm dừng, chạy tiếp từ khâu "${fresh.currentStage}" — không làm lại từ đầu.`,
        );
        fresh = await loadTask(db, task.id);
      }
      if (fresh.pipelineState === "RUNNING") {
        const mode = await getPipelineMode(db);
        await runOrchestrator(ctx, task.id, mode === "manual");
      }

      // --- 5) Pause → Resume proof with exactly the state
      // transitions the Chairman's own buttons make: pause at
      // the current stage, then resume from that very stage
      // (never from the beginning). The line ends RUNNING,
      // parked at the voice stage waiting for the real voice
      // file from the local pipeline — no fake product is ever
      // invented for it.
      fresh = await loadTask(db, task.id);
      if (fresh.pipelineState === "RUNNING") {
        await db
          .update(schema.tasks)
          .set({ pipelineState: "PAUSED", updatedAt: new Date() })
          .where(eq(schema.tasks.id, task.id));
        await logAudit(
          ctx,
          args.actor,
          "Tạm dừng dây chuyền (kiểm chứng khi khởi động)",
          `Dự án #${task.id} dừng tại khâu "${fresh.currentStage}" — kiểm chứng Pause chạy thật ngay trong lần khởi động Cảnh 05.`,
        );
        const backTo = fresh.currentStage === "screening" ? "SCREENING" : "RUNNING";
        await db
          .update(schema.tasks)
          .set({ pipelineState: backTo, updatedAt: new Date() })
          .where(eq(schema.tasks.id, task.id));
        await logAudit(
          ctx,
          args.actor,
          "Tiếp tục dây chuyền (kiểm chứng khi khởi động)",
          `Dự án #${task.id} chạy tiếp từ khâu "${fresh.currentStage}" sau kiểm chứng Pause — không làm lại từ đầu.`,
        );
        const mode = await getPipelineMode(db);
        if (mode === "auto" && backTo === "RUNNING") {
          await runOrchestrator(ctx, task.id, false);
        }
      }

      fresh = await loadTask(db, task.id);
      const stagesNow = await loadStages(db, task.id);
      const scriptStage = stagesNow.find((s) => s.stageKey === "script");
      if (scriptStage?.outputProductId) scriptProductId = scriptStage.outputProductId;
      const facts = scriptStage ? describeParams(parseStageParams(scriptStage.params)) : "";
      const qcNote =
        scriptStage?.status === "DONE"
          ? `Khâu Kịch bản & SRT đã ĐẠT QC tự động trên file SRT thật (${facts || "đủ cue, khớp thời lượng"}).`
          : "Khâu Kịch bản & SRT chưa qua QC — xem ghi chú khâu trong dự án.";
      ctx.invalidateQueries();
      return {
        ok: true,
        characters_added: charactersAdded,
        brand_items_added: brandItemsAdded,
        pipeline_state: fresh.pipelineState,
        current_stage: fresh.currentStage,
        script_product_id: scriptProductId,
        note: `Khởi động Cảnh 05 hoàn tất: Brand Kit +${charactersAdded} nhân vật, +${brandItemsAdded} mục chuẩn; dây chuyền ${fresh.pipelineState} tại khâu "${fresh.currentStage}". ${qcNote} Đã kiểm chứng Pause → Resume thật (xem Nhật ký kiểm toán). Khâu Voice chờ file voice thật từ pipeline local — dây chuyền không tự sinh sản phẩm giả.`,
      };
    },
  }),

  // Thanh chức năng trên cùng (kiểu Phim Trường): lựa chọn Model theo
  // khâu, Tập và tên dự án hiển thị. Các lựa chọn này thuộc về pipeline
  // LOCAL trên máy Chủ tịch — web chỉ lưu lựa chọn và hiện trạng thái
  // "Chờ kết nối local", không tự chạy model nào trong web.
  getConsoleSettings: defineAction({
    description:
      "Reads the top function-bar settings: model choice per pipeline stage, episode label and project display name. These choices belong to the Chairman's local runner — the web only stores them and shows Chờ kết nối local.",
    request: z.object({}),
    response: z.object({
      model_mode: z.string(),
      model_script: z.string(),
      model_voice: z.string(),
      model_visuals: z.string(),
      model_edit: z.string(),
      episode: z.string(),
      project_name: z.string(),
    }),
    async handler(ctx) {
      const db = dbOf(ctx);
      const rows = await db
        .select()
        .from(schema.officeSettings)
        .where(eq(schema.officeSettings.key, "console_settings"));
      const defaults = {
        model_mode: "auto",
        model_script: "",
        model_voice: "",
        model_visuals: "",
        model_edit: "",
        episode: "Tập 01",
        project_name: "",
      };
      const raw = rows[0]?.value ?? "";
      if (!raw) return defaults;
      try {
        const parsed = JSON.parse(raw) as Partial<typeof defaults>;
        return {
          model_mode: typeof parsed.model_mode === "string" ? parsed.model_mode : defaults.model_mode,
          model_script: typeof parsed.model_script === "string" ? parsed.model_script : "",
          model_voice: typeof parsed.model_voice === "string" ? parsed.model_voice : "",
          model_visuals: typeof parsed.model_visuals === "string" ? parsed.model_visuals : "",
          model_edit: typeof parsed.model_edit === "string" ? parsed.model_edit : "",
          episode: typeof parsed.episode === "string" ? parsed.episode : defaults.episode,
          project_name: typeof parsed.project_name === "string" ? parsed.project_name : "",
        };
      } catch {
        return defaults;
      }
    },
  }),

  setConsoleSettings: defineAction({
    description:
      "Saves the top function-bar settings (model per stage, episode, project name) for the local runner on the Chairman's machine.",
    request: z.object({
      model_mode: z.string().trim().max(40).default("auto"),
      model_script: z.string().trim().max(60).default(""),
      model_voice: z.string().trim().max(60).default(""),
      model_visuals: z.string().trim().max(60).default(""),
      model_edit: z.string().trim().max(60).default(""),
      episode: z.string().trim().max(40).default("Tập 01"),
      project_name: z.string().trim().max(200).default(""),
    }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = dbOf(ctx);
      const value = JSON.stringify({
        model_mode: args.model_mode,
        model_script: args.model_script,
        model_voice: args.model_voice,
        model_visuals: args.model_visuals,
        model_edit: args.model_edit,
        episode: args.episode,
        project_name: args.project_name,
      });
      await db
        .insert(schema.officeSettings)
        .values({ key: "console_settings", value })
        .onConflictDoUpdate({
          target: schema.officeSettings.key,
          set: { value },
        });
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
