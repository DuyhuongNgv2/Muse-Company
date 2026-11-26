# MUSE COMPANY — source package

Source of the Muse Company virtual office (web fullstack space), exported 2026-11-26 (R2, after the daylight/camera fix build reported 05:25 UTC).

Contents: client/ (React + Three.js office UI), server/ (actions + schema),
drizzle/ (SQL migrations), package.json / bun.lock / tsconfig files, space.json.

Excluded on purpose: node_modules, build output (dist), app.db and blobs
(runtime data of the live office), caches and audit screenshots.

Note: package.json references @hatch/space-sdk from a local Muse runtime
path, so this source builds inside the Muse space runtime as-is; outside
that runtime that one dependency needs replacing.
