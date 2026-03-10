# Wait4It Design

**Plan:** `2026-03-09-wait4it.md`

## Overview

Wait4It is a single-page static site (one `index.html`) that lets a user paste a YouTube link, watch the video, and add timestamped commentary by clicking a "Pop!" button. When finished, they generate a shareable URL where the commentary data is compressed into the URL hash fragment. Recipients open the link and see the same video with Pop Up Video-style speech bubbles appearing in the top-right corner at each timestamp — spoiler-free, no login, no server.

## Architecture

**Single file, two modes.** The page detects whether a hash fragment is present on load:
- **No hash → Creator mode:** URL input, embedded player, "Pop!" button, comment list, "Generate Link" button.
- **Hash present → Viewer mode:** Embedded player, bubble engine, no editing controls.

**Data shape:**
```json
{
  "v": "youtube-video-id",
  "c": [
    { "t": 12.5, "s": "This part is hilarious" },
    { "t": 45.0, "s": "Watch the background!" }
  ]
}
```
- `v`: YouTube video ID (11 chars)
- `c`: comments array, sorted by `t` (timestamp in seconds)
- `t`: float, seconds from video start
- `s`: string, the comment text

**Encoding pipeline:** `JSON.stringify → LZString.compressToEncodedURIComponent → window.location.hash`

**Decoding pipeline:** `window.location.hash → LZString.decompressFromEncodedURIComponent → JSON.parse`

**External dependencies (CDN):**
- YouTube IFrame Player API: `https://www.youtube.com/iframe_api`
- LZ-String: cdnjs (latest, ~5KB)

**YouTube embedding:** Follow the YouTube Embed convention with a lighter touch — use `youtube-nocookie.com`, `enablejsapi: 1`, and standard embed parameters, but skip the overlay lockdown strategy (not needed for a casual sharing tool). Keep `sandbox="allow-scripts allow-same-origin"` on the iframe.

**Bubble display:** Fixed position, top-right corner of the video container. One bubble at a time. Pop-in animation (scale from 0 → overshoot → settle). Auto-dismiss after `max(3s, text.length * 50ms)` capped at 8s. If a new comment triggers while one is showing, the current bubble is replaced immediately.

## Diagrams

- [High-level architecture](diagrams/2026-03-09-wait4it-arch.mmd)
- [Creator & viewer flow](diagrams/2026-03-09-wait4it-flow.mmd)

## Task Specs

### Set up project scaffolding

**Goal:** Create the single `index.html` file with the base HTML structure, CSS, and JS scaffolding. Both modes share this file.
**Interfaces:**
- `index.html` — single entry point
- CSS: inline `<style>` block
- JS: inline `<script>` block at end of body (after CDN script tags)
**Implementation notes:**
- HTML structure: header (logo/title), main container (switches between landing, creator, and viewer states), footer.
- Landing state: centered card with URL input, "Watch" button, and a brief tagline ("Add Pop Up Video-style commentary to any YouTube video and share it with friends").
- Load LZ-String from cdnjs via `<script>` tag.
- Load YouTube IFrame API via `<script src="https://www.youtube.com/iframe_api">`.
- No build tools. Dev with `npx serve .` or just open the file.
**Acceptance criteria:** Opening `index.html` shows the styled landing page with URL input. No console errors. YouTube API and LZ-String are loaded.
**Tests:** Manual — open in browser, verify layout renders, check console for script load errors.
**Dependencies:** None.

---

### Implement YouTube URL parsing

**Goal:** Extract a YouTube video ID from any common URL format the user might paste.
**Interfaces:**
```js
function parseVideoId(input) → string | null
```
**Implementation notes:**
Supported formats:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- `https://youtube.com/watch?v=VIDEO_ID&t=123` (strip params)
- `https://m.youtube.com/watch?v=VIDEO_ID`
- Bare video ID (11 alphanumeric + `-_` chars)

Single regex or small set of regexes. Return `null` for invalid input. YouTube video IDs are exactly 11 characters: `[A-Za-z0-9_-]{11}`.

Show inline error text below the input when invalid. Clear error on next input change.
**Acceptance criteria:** All listed URL formats correctly return the video ID. Invalid URLs return null and show an error message.
**Tests:** Manual — paste each format into the input and verify. Could add a small self-test function in a `// dev-only` block.
**Dependencies:** Scaffolding.

---

### Embed YouTube player with IFrame API

**Goal:** Once a video ID is extracted, create the YouTube player instance and transition from landing to creator mode.
**Interfaces:**
```js
let player; // YT.Player instance
function loadPlayer(videoId) → void
function onPlayerReady(event) → void
function onPlayerStateChange(event) → void
```
**Implementation notes:**
- Use `new YT.Player('player-container', { ... })` with the `onReady` and `onStateChange` callbacks.
- Embed URL params per convention: `rel=0, modestbranding=1, iv_load_policy=3, enablejsapi=1, autoplay=0, controls=1, origin=window.location.origin`.
- Use `youtube-nocookie.com` host.
- Player container is a `<div>` inside the main area; the API replaces it with an iframe.
- Add `sandbox="allow-scripts allow-same-origin"` to the iframe after creation (the API creates the iframe, so apply sandbox via `player.getIframe().setAttribute(...)` in `onPlayerReady`).
- Skip the overlay lockdown — not needed for this use case.
- On state change, track current state for the "Pop!" button (only enable when playing or paused).
**Acceptance criteria:** Valid video ID loads and plays. Player state events fire. Player fills the container responsively (16:9 aspect ratio maintained).
**Tests:** Manual — paste a URL, verify video loads, play/pause, check console for state events.
**Dependencies:** Scaffolding, URL parsing.
**Conventions:** YouTube Embed (lighter touch — nocookie + embed params + sandbox, skip overlays).

---

### Build creator mode: capture timestamped comments

**Goal:** Let the user add, edit, and delete timestamped comments while watching.
**Interfaces:**
```js
let comments = []; // { t: number, s: string }[]
function addComment(time, text) → void
function editComment(index, newText) → void
function deleteComment(index) → void
function renderCommentList() → void
```
**Implementation notes:**
- "Pop!" button positioned below or beside the player. On click:
  1. Call `player.pauseVideo()`
  2. Capture `player.getCurrentTime()` (round to 1 decimal)
  3. Show an inline text input + "Add" button below the Pop! button
  4. On submit: push `{ t, s }` to `comments`, re-sort by `t`, re-render list, clear input
- Comment list below the player: each row shows timestamp (formatted as `MM:SS`), text, edit icon, delete icon.
- Edit: inline — clicking edit replaces the text with an input pre-filled with current text. Save on Enter or blur.
- Delete: remove from array, re-render. No confirmation needed (lightweight tool).
- Disable "Pop!" button when video is not loaded or in ended state.
- Format helper: `function formatTime(seconds) → "M:SS"` or `"H:MM:SS"` for videos over 1 hour.
**Acceptance criteria:** Can add multiple comments, list stays sorted by time, edit and delete work, Pop! pauses the video and captures correct timestamp.
**Tests:** Manual — add comments at various points, verify sort order, edit one, delete one, verify list updates.
**Dependencies:** Player embed.

---

### Add localStorage draft persistence

**Goal:** Auto-save work-in-progress so the creator doesn't lose comments if they close the tab.
**Interfaces:**
```js
const STORAGE_KEY = 'wait4it-draft';
function saveDraft() → void   // called on every comment change
function loadDraft() → { v: string, c: array } | null
function clearDraft() → void
```
**Implementation notes:**
- Save `{ v: videoId, c: comments }` as JSON to `localStorage` under `STORAGE_KEY`.
- Call `saveDraft()` after every add/edit/delete and after initial video load.
- On page load (when no hash is present): check for a draft. If found, show a "Resume draft?" prompt with the video ID and comment count. On confirm, load the video and populate comments. On decline, clear draft and show landing.
- "Clear draft" button visible in creator mode (small, secondary style).
- Wrap localStorage calls in try/catch (private browsing may throw).
**Acceptance criteria:** Adding comments and refreshing the page offers to restore the draft. Clearing the draft removes it. Works gracefully when localStorage is unavailable.
**Tests:** Manual — add comments, refresh, verify restore prompt. Clear draft, refresh, verify landing page.
**Dependencies:** Creator mode.

---

### Implement URL hash encoding

**Goal:** Serialize commentary data into a compressed URL hash and copy the shareable link.
**Interfaces:**
```js
function generateLink() → string  // returns the full URL
function getDataSize() → number   // returns estimated URL length
```
**Implementation notes:**
- Serialize: `JSON.stringify({ v: videoId, c: comments })`
- Compress: `LZString.compressToEncodedURIComponent(json)`
- Build URL: `window.location.origin + window.location.pathname + '#' + compressed`
- "Generate Link" button in creator mode. On click:
  1. Build the URL
  2. Copy to clipboard via `navigator.clipboard.writeText()` (fall back to `document.execCommand('copy')`)
  3. Show a brief "Link copied!" confirmation toast
  4. Display the URL in a read-only text field so the user can also manually copy
- Show a live character/size counter near the generate button. If estimated URL length exceeds 6KB, show a yellow warning. If over 8KB, show a red warning suggesting fewer/shorter comments.
- Minimum validation: at least 1 comment required to generate.
**Acceptance criteria:** Generated URL is valid and decodable. Clipboard copy works. Size warnings appear at thresholds.
**Tests:** Manual — generate a link, paste it in a new tab, verify it decodes. Test with many comments to trigger size warnings.
**Dependencies:** Creator mode, LZ-String CDN loaded.

---

### Build viewer mode: decode hash and render

**Goal:** Detect a hash fragment on load, decode it, load the video, and prepare for bubble display.
**Interfaces:**
```js
function decodeHash(hash) → { v: string, c: array } | null
function enterViewerMode(data) → void
```
**Implementation notes:**
- On page load: check `window.location.hash`. If present and length > 1:
  1. Strip the `#` prefix
  2. `LZString.decompressFromEncodedURIComponent(hash)` → JSON string
  3. `JSON.parse(json)` → validate shape (`v` is string, `c` is array of `{t, s}`)
  4. If valid: hide landing/creator UI, show viewer layout, call `loadPlayer(data.v)`, store comments for bubble engine
  5. If invalid: show a friendly error ("This link appears to be broken or expired") with a link back to the landing page
- Viewer layout: player centered, no input fields, no Pop! button. Optionally show a small "Create your own" link to the landing page.
- The comment data is passed to the bubble engine (next task) but not rendered as a visible list — spoiler-free.
**Acceptance criteria:** A valid generated link opens directly into viewer mode with the correct video loaded. Invalid hashes show an error. No creator UI is visible.
**Tests:** Manual — open a generated link, verify viewer mode. Tamper with the hash, verify error handling.
**Dependencies:** URL parsing, player embed, LZ-String CDN loaded.

---

### Implement Pop Up Video bubble display

**Goal:** Show comments as animated speech bubbles in the top-right of the video at the correct timestamps.
**Interfaces:**
```js
function startBubbleEngine(comments) → void
function stopBubbleEngine() → void
function showBubble(comment) → void
function dismissBubble() → void
```
**Implementation notes:**
- Bubble engine starts when the player enters playing state (state 1) in viewer mode.
- Poll `player.getCurrentTime()` every 250ms via `setInterval`.
- Track `lastTime` to detect seek-back: if current time < lastTime - 1s, reset shown flags for comments after the new time.
- For each poll tick, check if any unshown comment has `t <= currentTime`. If so, show the earliest one.
- `showBubble()`:
  1. Create or reuse a bubble DOM element positioned in the top-right corner of the video container
  2. Set text content
  3. Trigger pop-in animation (CSS: `transform: scale(0) → scale(1.1) → scale(1)` with `ease-out`, ~300ms)
  4. Set a dismiss timer: `max(3000, text.length * 50)` ms, capped at 8000ms
  5. Dismiss animation: fade out + scale down (~200ms), then hide
- If a new comment triggers while a bubble is visible, dismiss immediately and show the new one.
- Bubble DOM structure: a `<div>` with the bubble class, containing a `<p>` for text. Positioned `absolute` within the player container, `top: 12px; right: 12px`.
- Bubble style: rounded corners, subtle background (semi-transparent white or light yellow), dark text, small drop shadow, triangular pointer/tail on the bottom-left pointing toward the video. Bold sans-serif font.
- Stop the engine on pause (state 2) and ended (state 0). Resume on play.
**Acceptance criteria:** Bubbles appear at correct timestamps with animation, auto-dismiss, handle seek-back, and don't stack/overlap.
**Tests:** Manual — play a video with several comments, verify timing and animation. Seek backward, verify comments re-trigger. Pause and resume, verify engine stops and restarts.
**Dependencies:** Viewer mode, player embed.

---

### Style and polish

**Goal:** Make the app visually polished, mobile-friendly, and self-explanatory.
**Interfaces:** CSS only — no new JS interfaces.
**Implementation notes:**
- Color scheme: clean and minimal. Dark header/footer, light content area. Accent color for the "Pop!" button (bright yellow or orange to evoke VH1 Pop Up Video).
- Typography: system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`). Bold for bubble text.
- Responsive layout:
  - Desktop: player centered, max-width ~800px, comment list below
  - Mobile: full-width player, stacked layout, larger tap targets for Pop! button
- Player container: 16:9 aspect ratio via padding-bottom trick or `aspect-ratio: 16/9`.
- Landing page: centered card layout with tagline, input, and a 3-step "how it works" section (1. Paste a YouTube link, 2. Pop! to add commentary, 3. Share the link).
- "Pop!" button: large, round, bright — the primary action in creator mode.
- Bubble style refinement: the VH1 look — rounded speech bubble with a pointed tail, slightly playful font weight, subtle pop-in overshoot animation.
- Transitions between states (landing → creator, landing → viewer) should feel smooth — simple fade or slide.
**Acceptance criteria:** Looks polished on desktop and mobile. First-time users understand the flow. Bubble style evokes Pop Up Video.
**Tests:** Manual — test on desktop and mobile viewport sizes. Check contrast ratios for accessibility.
**Dependencies:** All functional tasks complete.

---

### Handle edge cases and limits

**Goal:** Gracefully handle error states and boundary conditions.
**Interfaces:** No new interfaces — adds guards and error handling to existing functions.
**Implementation notes:**
- **Invalid hash:** Show "This link seems broken" with a "Start fresh" link. Don't crash.
- **URL too long:** Already handled by size warnings in the encoding task. Add a hard block at 10KB (refuse to generate, suggest trimming).
- **Video unavailable:** YouTube API fires an error event. Show "This video is unavailable" in the player container.
- **Mobile quirks:** YouTube IFrame API on mobile doesn't support `pauseVideo()` before user interaction. The Pop! button should gracefully handle this — if pause fails, still capture the timestamp.
- **Rapid timestamps:** If two comments are within 1 second of each other, the bubble engine should show them sequentially — the second waits for the first to dismiss (use a minimum display time of 2 seconds in this case).
- **Empty comments:** Prevent adding comments with empty or whitespace-only text.
- **Clipboard API:** Fall back to `execCommand('copy')` if `navigator.clipboard` is unavailable. Show "Copied!" or "Copy failed — select the URL above" accordingly.
- **localStorage unavailable:** Catch errors, skip draft features silently.
**Acceptance criteria:** No uncaught errors in any edge case. User sees helpful messages when things go wrong.
**Tests:** Manual — test each edge case deliberately (invalid hash, unavailable video, empty comment, mobile viewport).
**Dependencies:** All functional tasks complete.
