# WAIT4.IT

Add timestamped commentary to any YouTube video and share it with friends. No accounts, no backend — just paste, comment, and share.

## How it works

1. Paste a YouTube link and hit **Watch**
2. Click **Add Comment** to pause and annotate any moment
3. Click **Generate Link** to get a shareable URL

Recipients open the link and see speech bubbles pop up at each timestamp as the video plays — spoiler-free.

## Tech

- Single static page — HTML, CSS, JS
- YouTube IFrame Player API for playback and timestamp capture
- [LZ-String](https://github.com/pieroxy/lz-string) compresses commentary data into the URL hash
- localStorage for draft persistence
- Hosted on GitHub Pages

## Run locally

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
