# Ensemble: design concept

Serve locally: `npx serve docs/design-concept` (or open `index.html` directly). Everything is static; fonts come from Google Fonts.

## Big idea: the score

An ensemble plays from a shared score. Ensemble writes that score for your AI tools:
one rule set, translated for each "instrument" (Claude Code, Codex, Gemini CLI, Cursor, Copilot),
and in the Orchestrator a conductor keeps several models in time.

The metaphor sits in small details. It never replaces plain labels.
- **Rehearsal marks:** the boxed letters A–F label every screen in the nav and section headers, the way a conductor points the band to "letter C".
- **Note heads as status:** hollow = queued, half-filled accent = running, filled ink = done, dashed accent = waiting for approval, solid accent = failed. One shape language replaces rainbow badges.
- **Staves:** the hero shows one staff per tool, with config files as notes. The DAG canvas sits on faint five-line staves.
- **Rests and wrong notes:** the empty state is a whole rest on a blank staff. The error state is a single red-pencil margin.

Mood: **ink-on-paper, precise, calm.**

## Default theme: light (dark via `prefers-color-scheme`)

Light is the default because the core job is reading. Users compare code with plain-English
explanations, paragraph by paragraph. Many are beginners on phones, often outdoors or in class.
Warm paper with near-black ink keeps long reading comfortable and suits the sheet-music idea.
Dark ("orchestra pit") is a full palette of its own, not an inversion. A Theme button in the preview flips it for review.

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F5F2EA` | `#15140F` | page base (neutral) |
| `--paper-2` | `#EDE8DC` | `#1E1C17` | code wells, hovers |
| `--paper-3` | `#E2DBCB` | `#2A2720` | tracks, skeletons |
| `--card` | `#FBF9F4` | `#1A1914` | panels |
| `--ink` | `#1C1B18` | `#EEE9DD` | text, primary buttons |
| `--ink-2` | `#4A463E` | `#C3BCAD` | body secondary |
| `--ink-3` | `#6E685C` | `#9A9384` | meta (AA on paper: 4.9:1 / 6:1) |
| `--rule` | `#D6CEBD` | `#38342B` | borders, staff lines |
| `--accent` | `#B8381C` | `#EE7451` | the one accent: "red pencil" (5.5:1 / 6.3:1) |
| `--accent-soft` | `#F3DCD2` | `#3A2119` | risky-line and deleted-line wash |

The accent means only three things: **now** (running, current step), **risk** (unsafe permission, problem)
and **the primary action of a moment**. Everything else is ink.

- **Font:** Instrument Sans (variable; display uses `font-stretch: 82%` for tight, editorial headings) + JetBrains Mono for code and numbers.
- **Type scale:** 12 / 14 / 16 / 20 / 28 / clamp(36–68) px.
- **Spacing:** 4, 8, 12, 16, 24, 32, 48, 64, 96 px (4/8 grid).
- **Radius:** 6px everywhere (4px for small inner chips). One shadow token.
- **Motion:** `--dur: 160ms`; springs via CSS `linear()` easing; all UI transitions are under 200ms.

## Physics

1. **Spring-loaded DAG nodes (Orchestrator):** drag a task with pointer or touch. On release it springs home
   (semi-implicit Euler, k=520, d=26, settles in about 200ms with slight overshoot) and the edges stretch live.
   If you drop it closer to its sibling's slot, the two swap order within that stage. The physics has a job: it reorders the plan.
2. **Springy toggle** for risky permissions: the thumb squashes on press and overshoots slightly on release.
3. **Press feedback:** buttons and chips scale to 0.96 with a spring return. Toasts arrive on a spring.

`prefers-reduced-motion`: springs snap instantly, pulse, shimmer and edge flow stop, and smooth scroll is turned off.

## Screens in the preview
A Home (signed out) · B Questionnaire step with live file preview · C Generated files with side-by-side
explanations and an opt-in risky permission · D Doctor results with diffs and fixes ·
E Plan brief, editable DAG, live run (meters, budget bar, per-task model plus why, agent messages,
judge score, approvals inbox, pause/cancel/re-run) · F Empty, skeleton, error and toast states.

## Accessibility notes
Semantic landmarks. Every input is labelled. Focus rings use the accent with a 2px offset. Nodes are real buttons (Tab, then Enter to inspect).
Live regions cover run status, messages and toasts. No horizontal scroll at 360px (checked with Playwright). Zero console errors.
Still to do in the real build: a keyboard alternative to drag-to-reorder (for example Alt+Arrow).
