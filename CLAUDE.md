# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WAIT4.IT is a client-side single-page web app for creating and sharing timestamped YouTube video commentary. Users paste a YouTube URL, add time-stamped comments while watching, then generate a shareable link. Viewers see comment "bubbles" appear at designated timestamps during playback.

## Architecture

Three UI states managed by showing/hiding sections in `index.html`:
- **Landing** (`#landing`) — URL input form
- **Creator** (`#creator`) — Two-column layout: YouTube player + comment editor panel
- **Viewer** (`#viewer`) — YouTube player with floating comment bubbles at timestamps

All logic lives in `app.js` (~480 lines). Styling in `style.css` (~560 lines). No framework, no build step.

Comment data is JSON-encoded, compressed with LZ-String, and stored in the URL fragment (`#`). Format: `{ v: "videoId", c: [{ t: secondsFloat, s: "text" }, ...] }`. Drafts autosave to localStorage under key `wait4it-draft`.

External dependencies (all via CDN, no package manager):
- YouTube IFrame Player API
- LZ-String (URL-safe compression)

## Development & Deployment

**No build process.** Open `index.html` directly in a browser or use any static file server.

**Hosting:** GitHub Pages from the `prod` branch, custom domain `wait4.it` (configured via CNAME file).

**To deploy:** push to `prod` branch. GitHub Pages serves automatically.

**Branches:** `main` (development), `prod` (production/GitHub Pages).

## Conventions

- See `conventions/youtube-embed.md` for YouTube iframe embedding security guidelines (sandbox isolation, overlay strategy).
