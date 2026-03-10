---
keywords: [youtube, video, embed, iframe, player, media]
scope: feature
---
# YouTube Embed

> Secure YouTube embedding that prevents students from navigating away to unrelated content.

## Principles

- **Privacy-enhanced mode**: Always use `youtube-nocookie.com` instead of `youtube.com`.
- **Sandbox isolation**: The `sandbox` attribute on the iframe is the primary protection — only allow `allow-scripts allow-same-origin`. Omitting `allow-popups` blocks "Watch on YouTube" and "More Videos" link navigation.
- **Strategic overlays**: Transparent overlays block right-click access to areas the sandbox can't cover (title bar, YouTube logo, recommendation grids).
- **IFrame Player API**: Use the YouTube IFrame Player API (`enablejsapi: 1`) to track player state and toggle overlays contextually.

## Embed URL Parameters

```
rel=0              — suppress related videos (best effort, not guaranteed)
modestbranding=1   — remove YouTube logo
iv_load_policy=3   — hide annotations
enablejsapi=1      — enable JavaScript API for state tracking
fs=0               — disable fullscreen (optional)
showinfo=0         — hide video info bar
autoplay=0         — no autoplay
controls=1         — show player controls
disablekb=1        — disable keyboard shortcuts
origin=<app-origin> — security: set to window.location.origin
```

## Overlay Strategy

Five overlay zones, keyed to player state:

| # | Zone | When | Purpose |
|---|------|------|---------|
| 1 | Top bar (full width, 60px) | Always | Block title link and "Copy Link" |
| 2 | Bottom-right (10% width, 36px) | Always | Block YouTube logo |
| 3 | Bottom-left (25% width, 50px) | Before play (state -1, 5) | Block "Watch on YouTube" |
| 4 | Center band (full width, 30% height) | On pause (state 2) | Block "More Videos" suggestions |
| 5 | Most of frame (full width, 87% height) | On end (state 0) | Block end-screen recommendations |

All overlays are `position: absolute`, `backgroundColor: transparent`, `pointerEvents: auto`, and suppress `onContextMenu` and `onClick`.

## Player States

```
-1  unstarted
 0  ended
 1  playing
 2  paused
 3  buffering
 5  video cued
```

## IFrame Attributes

```html
<iframe
  sandbox="allow-scripts allow-same-origin"
  allow="accelerometer; encrypted-media; gyroscope"
/>
```

Do **not** add `allow-popups` to the sandbox — that is what prevents navigation away from the embedded player.

## Notes

- `rel=0` and `modestbranding=1` are suggestions YouTube may override, especially on mobile. The sandbox + overlays are the real protection.
- JavaScript event listeners on the parent cannot intercept clicks inside the iframe — that's why overlays and sandbox are necessary.
- The component is client-side only (depends on `window` and React hooks).
