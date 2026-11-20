# Bundled fonts

`manifest.json` is the source of truth: every file's origin URL, SHA-256, byte size, delivery (`vendored` or `fetched`) and licence file (all SIL Open Font License 1.1). Verify with `pnpm --filter backend fonts:verify`; install fetched files with `pnpm --filter backend fonts:fetch`.

| Use | Location | Source |
| --- | --- | --- |
| Cover typography (S07) | `notosans*.ttf` (variable) | google/fonts @ `869789e8` |
| Interior text, non-CJK | `interior/*.ttf` (static, vendored) | notofonts/notofonts.github.io @ `739604e0`, unhinted TTF |
| Interior text, CJK | `fetched/*.ttf` (static, git-ignored) | fonts.gstatic.com versioned files: Noto Sans SC v41, JP v57, KR v40 |

Interior PDFs need static TrueType faces. Chromium embeds variable fonts, CFF-based OTF and synthesized bold as Type 3 fonts, which print preflight commonly rejects. The renderer only requests weights 400 and 700 and disables bold synthesis. Synthesized italic is allowed for scripts without an italic face.

Families: Noto Serif and Noto Sans (Latin, Greek, Cyrillic, Vietnamese; with italics), Noto Sans Mono, Noto Serif/Sans Bengali, Noto Naskh Arabic and Noto Sans Arabic (Arabic, Persian), Noto Nastaliq Urdu, Noto Serif/Sans Devanagari, Noto Serif/Sans Tamil, and Noto Sans SC/JP/KR. Never change a file in place. Add new files with new hashes and record the change, because existing exports were rendered with the old bytes. Scripts outside this list are reported as missing glyphs. No coverage is claimed for them.
