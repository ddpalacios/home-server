// web/src/routes/embed.js
//
// Embed route: the widget-embed snippet page.
// Loaded lazily via window.__dashboardLoadRouteModule.
//
// The embed section has no significant deferred data load — the snippet
// is populated synchronously by ensureAuthenticated() (which updates
// #embedScriptBox with the account's widget.js URL) and the copy button
// is wired in the main boot IIFE. This module exists for pattern
// consistency; init() is intentionally a no-op.
//
// If embed-specific deferred behavior is added in the future, wire it
// via the SECTION_ON_ENTER.embed shim in index.html.

let _initialized = false;

export function init() {
  if (_initialized) return;
  _initialized = true;
  // No deferred setup needed — embed section is static markup + a
  // pre-populated <pre> tag and a copy button wired at boot.
}
