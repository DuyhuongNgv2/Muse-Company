# Data Plan

No external data sources: the artifact is populated by user input and its own actions. If that changes, finalize the plan again with a `data_plan` object carrying the `markdown` body.

One internal exception, ordered by the user ("Fix all" for the Cảnh 05 project): the `bootstrapCanh05` action copies the character lock and standards VERBATIM from the user's own task #1 record (its `character_lock` and `brief` fields — Bố = ô Variation 1, Con gái = ô Variation 2, park-gate setting, golden-hour tone, no-text rule) into the Brand Kit tables, opens that task's pipeline, and delivers a script SRT whose three cues are the brief's own beats (0–2s, 2–4s, 4–5s). No external source and no invented content: everything traces back to the user's own task row.

## GitHub backup (ordered by the user 2026-11-26: "Đẩy phiên bản mới lên git đi, xóa bản cũ đi")

- Repo: https://github.com/DuyhuongNgv2/Muse-Company (public; description "Văn phòng ảo Muse Company — Chủ tịch Hưởng, Tổng giám đốc Muse, các phòng ban làm việc, giao việc, QC, trò chuyện như công sở thật." — from the GitHub API repo record).
- State after the push: the repo was empty before (GitHub API: "This repository is empty", size 0, no branches), so there was no old code on GitHub to delete. Branch `main` now holds exactly ONE parentless commit, `2307cdb8218c87328acec8a6d90b21fa9c93a089`, whose tree (29 files) is the artifact's v44 source verbatim (App.tsx / Office3D.tsx / actions.ts SHA-256 verified equal to the live v44 build before upload) plus a new `README.md` and `.gitignore`. No other branches or tags exist. The same `README.md` is kept in the artifact root so both copies match.
- Runtime data (`app.db`, blobs) is NOT in the repo; only source (client, server, drizzle, configs) is backed up.
