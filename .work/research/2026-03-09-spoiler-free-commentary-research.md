# Spoiler-Free Commentary Sharing Research

## 2026-03-09 — Initial research for timestamped commentary tool

### Applicable Conventions

| Convention | Source Layer | Key Rules |
|---|---|---|
| YouTube Embed | `conventions/` (project-local) | 1. Use `youtube-nocookie.com` for privacy-enhanced mode 2. Sandbox iframe with `allow-scripts allow-same-origin` only 3. Use IFrame Player API (`enablejsapi: 1`) for state tracking 4. Overlay strategy to block navigation away from player 5. Client-side only (depends on `window`) |

### Codebase Patterns

- **Pattern:** Greenfield project — no existing code
- **Location:** Project root `/Users/pacej/Documents/dev/wait4it/`
- **Notes:** Only a `conventions/` directory with YouTube embed guidelines exists. No framework, build system, or dependencies chosen yet.

### Key Design Considerations

- **No backend / no login:** User wants everything self-contained — no server, no auth, no database. The output is a downloadable HTML file that recipients open locally.
- **YouTube IFrame API integration:** The YouTube Embed convention already defines how to embed videos securely with JS API access. The `enablejsapi: 1` parameter gives access to `player.getCurrentTime()`, `player.seekTo()`, and player state events — all needed for timestamp-linked commentary.
- **Spoiler-free by design:** Commentary must be hidden until the viewer reaches each timestamp. This means the HTML file needs to track playback position and reveal notes progressively.
- **Self-contained HTML:** The generated file must include all CSS/JS inline. Only external dependency should be YouTube's IFrame API script (`https://www.youtube.com/iframe_api`).
- **Sharing model:** Creator builds commentary on a "creator page" (the website). Output is a single `.html` file they download and share (via any channel — email, messaging, file share, etc.).

### Architecture Options

| Approach | Pros | Cons |
|---|---|---|
| **Single static site + downloadable HTML** | Simplest. One page for creation, generates a self-contained HTML file. No hosting needed for sharing. | File sharing is less convenient than a URL. Large commentary could make the file big. |
| **URL with encoded data** | Share via link. Data in URL hash/fragment (never sent to server). | URL length limits (~2KB safe, ~8KB max). Only works for short commentary. |
| **Hybrid: tiny server for paste-bin style storage** | Clean URLs, no file size limit. | Adds server dependency, contradicts "no login / lightweight" goal. |
| **GitHub Pages / static host + hash-based routing** | Free hosting, URL sharing, no backend. | Still needs data storage — could use URL hash for small payloads or prompt file upload. |

**Recommendation:** Start with the downloadable HTML approach — it's the most aligned with the stated goals. Optionally support URL-hash encoding for short commentaries as a convenience feature.

### Technical Approach

1. **Creator page (the website itself):**
   - Embed YouTube video using conventions (nocookie, sandboxed, IFrame API)
   - Pause button captures `player.getCurrentTime()`
   - Text input for commentary at that timestamp
   - "Generate" button builds a self-contained HTML string and triggers download

2. **Generated HTML file (what gets shared):**
   - Embeds the same YouTube video
   - Contains commentary data as inline JSON
   - JS watches `player.getCurrentTime()` on an interval
   - Reveals commentary entries as timestamps are reached
   - Commentary entries hidden by default (spoiler-free)
   - Optional: "show all" toggle for non-spoiler-sensitive viewers

3. **Tech stack options:**
   - Pure HTML/CSS/JS (no build step) — simplest, matches the lightweight goal
   - Vanilla JS with YouTube IFrame API
   - Could optionally use a static site generator but likely unnecessary

### Gaps & Recommendations

- [ ] Decide on tech stack — pure vanilla HTML/JS recommended given "lightweight" goal
- [ ] Define the creator UX flow: paste URL → watch & pause → add notes → generate file
- [ ] Determine how to handle video URL parsing (extract YouTube video ID from various URL formats)
- [ ] Consider mobile experience — YouTube IFrame API has limitations on mobile (autoplay blocked, some events differ)
- [ ] Decide on commentary display style — sidebar? overlay? below player?
- [ ] Consider whether to support non-YouTube video sources (Vimeo, direct MP4, etc.) or YouTube-only
- [ ] Determine if pause-to-comment should auto-pause the video or just capture the current time
- [ ] Plan the visual design — minimal CSS that works well in both the creator tool and generated HTML files
- [ ] Consider accessibility — keyboard navigation, screen reader support for commentary
- [ ] Think about edge cases: what if two comments have the same timestamp? What about editing/deleting comments before generating?
