import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  brief: text("brief").notNull().default(""),
  room: text("room").notNull().default("video"),
  assignee: text("assignee").notNull().default("dao-dien"),
  status: text("status", {
    enum: ["ASSIGNED", "IN_PROGRESS", "REVIEW", "APPROVED", "REVISION_REQUIRED"],
  })
    .notNull()
    .default("ASSIGNED"),
  aspectRatio: text("aspect_ratio").notNull().default("9:16"),
  sceneSeconds: real("scene_seconds"),
  totalSeconds: real("total_seconds"),
  characterLock: text("character_lock").notNull().default(""),
  referenceNote: text("reference_note").notNull().default(""),
  gateBrief: text("gate_brief").notNull().default("PENDING"),
  gateFrame: text("gate_frame").notNull().default("PENDING"),
  gateFinal: text("gate_final").notNull().default("PENDING"),
  // Auto-orchestrated pipeline (TGĐ Muse điều phối): NONE = chưa mở
  // dự án; RUNNING = dây chuyền đang chạy; PAUSED = Chủ tịch tạm
  // dừng; BLOCKED = trượt QC quá max_retries, chờ Chủ tịch xử lý;
  // SCREENING = đang ở Phòng Chiếu Thử chờ duyệt Final; DONE = xong.
  pipelineState: text("pipeline_state", {
    enum: ["NONE", "RUNNING", "PAUSED", "BLOCKED", "SCREENING", "DONE"],
  })
    .notNull()
    .default("NONE"),
  currentStage: text("current_stage").notNull().default(""),
  blockedReason: text("blocked_reason").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const qcReviews = sqliteTable("qc_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  stage: text("stage", { enum: ["first_frame", "full_clip"] })
    .notNull()
    .default("first_frame"),
  verdict: text("verdict", { enum: ["APPROVED", "REVISION_REQUIRED"] }).notNull(),
  checkFace: integer("check_face").notNull().default(0),
  checkMotion: integer("check_motion").notNull().default(0),
  checkText: integer("check_text").notNull().default(0),
  checkRatio: integer("check_ratio").notNull().default(0),
  checkCharacter: integer("check_character").notNull().default(0),
  reason: text("reason").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  taskId: integer("task_id").references(() => tasks.id),
  room: text("room").notNull().default("video"),
  owner: text("owner").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  note: text("note").notNull().default(""),
  version: text("version").notNull().default("v1"),
  returnReason: text("return_reason").notNull().default(""),
  fileSize: integer("file_size"),
  fileMd5: text("file_md5").notNull().default(""),
  publishable: integer("publishable").notNull().default(0),
  // File thật lưu trong kho văn phòng (ctx.blobs) khi sản phẩm là đầu
  // ra của một khâu dây chuyền: blobKey để nghe thử / xem trước / sửa
  // ngay trong web; stageKey = khâu đã sinh ra file; durationSeconds =
  // thời lượng đo thật từ file (WAV đọc header phía server, định dạng
  // khác do trình duyệt đo trước khi tải lên).
  blobKey: text("blob_key").notNull().default(""),
  stageKey: text("stage_key").notNull().default(""),
  durationSeconds: real("duration_seconds"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const pipelineStages = sqliteTable("pipeline_stages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  stageKey: text("stage_key").notNull(),
  room: text("room").notNull().default(""),
  assignee: text("assignee").notNull().default(""),
  status: text("status", {
    enum: ["PENDING", "RUNNING", "DONE", "BLOCKED"],
  })
    .notNull()
    .default("PENDING"),
  retries: integer("retries").notNull().default(0),
  forced: integer("forced").notNull().default(0),
  outputProductId: integer("output_product_id"),
  lastQcProductId: integer("last_qc_product_id").notNull().default(0),
  qcNote: text("qc_note").notNull().default(""),
  // JSON of measured facts about the accepted output (scene/cue
  // count, audio seconds, file bytes…) — written by the QC gate from
  // the real file, never typed by hand.
  params: text("params").notNull().default(""),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const stageReports = sqliteTable("stage_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  stageKey: text("stage_key").notNull().default(""),
  actor: text("actor").notNull().default(""),
  summary: text("summary").notNull().default(""),
  productId: integer("product_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const officeSettings = sqliteTable("office_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channel: text("channel", { enum: ["company", "direct"] })
    .notNull()
    .default("company"),
  sender: text("sender").notNull(),
  body: text("body").notNull(),
  // "" = the shared line for that channel; a staff id = a 1-1 direct
  // thread with that staff member (channel "direct").
  recipient: text("recipient").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const characters = sqliteTable("characters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  cellLabel: text("cell_label").notNull().default(""),
  description: text("description").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actor: text("actor").notNull().default(""),
  action: text("action").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const staffProfiles = sqliteTable("staff_profiles", {
  staffId: text("staff_id").primaryKey(),
  capability: text("capability", {
    enum: ["video", "image", "both", "none"],
  })
    .notNull()
    .default("video"),
  quotaUsedPct: real("quota_used_pct").notNull().default(0),
  note: text("note").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const brandItems = sqliteTable("brand_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category", {
    enum: ["outfit", "setting", "tone", "voice", "text"],
  })
    .notNull()
    .default("outfit"),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const meetings = sqliteTable("meetings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  room: text("room").notNull().default("video"),
  title: text("title").notNull(),
  decisions: text("decisions").notNull().default(""),
  actions: text("actions").notNull().default(""),
  risks: text("risks").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
