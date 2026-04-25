/* Standalone login page — POSTs to /etl/google/login, then redirects to Google OAuth. */

(function () {
  "use strict";

  const button = document.getElementById("loginButton");
  const errorBox = document.getElementById("loginError");

  function showError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  function setBusy(busy) {
    if (!button) return;
    button.disabled = !!busy;
    button.classList.toggle("is-busy", !!busy);
  }

  // If they're already signed in, send them straight to /etl.
  fetch("/etl/google/status", { credentials: "same-origin" })
    .then(function (r) { return r.json(); })
    .then(function (data) { if (data && data.logged_in) window.location.replace("/etl"); })
    .catch(function () { /* offline / no backend yet */ });

  if (button) {
    button.addEventListener("click", function () {
      const cfg = window.GOOGLE_OAUTH_CONFIG || {};
      if (!cfg.client_id || !cfg.redirect_uri) {
        showError("OAuth client configuration is missing. Check GOOGLE_OAUTH_CONFIG.");
        return;
      }
      setBusy(true);
      fetch("/etl/google/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          client_id: cfg.client_id,
          redirect_uri: cfg.redirect_uri,
          scopes: cfg.scopes,
          state: cfg.state,
        }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("Login request failed (" + r.status + ")");
          return r.json();
        })
        .then(function (data) {
          if (data && data.url) {
            window.location.href = data.url;
          } else {
            throw new Error(data && data.error ? data.error : "Could not start sign-in.");
          }
        })
        .catch(function (err) {
          setBusy(false);
          showError(err && err.message ? err.message : "Sign-in failed.");
        });
    });
  }
})();
