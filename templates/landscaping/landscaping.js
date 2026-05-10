(function () {
  "use strict";

  // ==========================================================================
  // Config
  // ==========================================================================
  const ACCOUNT_ID = "cust_0b0df4b8";
  const CHAT_ENDPOINT = "/chat";
  const CHAT_RESET_ENDPOINT = "/chat-reset";
  const CRYSTAL_LAKE_ZIPS = new Set([
    "60012", "60013", "60014", "60039", "60042",
    "60050", "60098", "60102", "60142", "60156"
  ]);
  const ZIP_CITY = {
    "60012": "Crystal Lake", "60014": "Crystal Lake", "60013": "Cary",
    "60042": "McHenry", "60050": "McHenry", "60098": "Woodstock",
    "60102": "Algonquin", "60156": "Lake in the Hills", "60142": "Huntley",
    "60039": "Crystal Lake"
  };

  // ==========================================================================
  // Landscaper directory.
  //
  // At runtime, fetchLandscapers() loads the cleaned 203-pro dataset from
  // gs://$GOLD_BUCKET/Google/Places API/landscaping-pros.json (via
  // /landscaping/pros) and replaces this list. The hardcoded entries
  // below are the fallback if the gold fetch fails (network, dataset
  // not yet built, etc.) — keeps the matching flow functional.
  // ==========================================================================
  let LANDSCAPERS = [
    { id: "greenbrook", name: "Greenbrook Lawn & Landscape", city: "Crystal Lake, IL",
      zips: ["60012","60013","60014","60039","60042","60050"],
      services: ["lawn_care","seasonal","irrigation"],
      sizes: ["small","medium","large"],
      budgets: ["under_500","500_2k","2k_10k"],
      timelines: ["asap","month","season","flexible"],
      blurb: "Full-service lawn care with weekly mowing plans and seasonal cleanups.",
      phone: "(815) 555-0142", email: "jobs@greenbrook.example", rating: 4.8, reviews: 128 },
    { id: "stoneoak", name: "StoneOak Hardscapes", city: "Cary, IL",
      zips: ["60013","60014","60010","60102"],
      services: ["hardscape","design_install"],
      sizes: ["medium","large","xlarge"],
      budgets: ["2k_10k","10k_plus"],
      timelines: ["month","season","flexible"],
      blurb: "Paver patios, retaining walls, and custom outdoor living spaces.",
      phone: "(815) 555-0178", email: "quotes@stoneoak.example", rating: 4.9, reviews: 94 },
    { id: "rootsandshoots", name: "Roots & Shoots Design", city: "Crystal Lake, IL",
      zips: ["60012","60014","60050","60098"],
      services: ["design_install","tree_shrub"],
      sizes: ["small","medium","large"],
      budgets: ["500_2k","2k_10k","10k_plus"],
      timelines: ["month","season","flexible"],
      blurb: "Native plantings, garden design, and sustainable landscape installs.",
      phone: "(815) 555-0164", email: "hello@rootsandshoots.example", rating: 4.7, reviews: 71 },
    { id: "lakesidetree", name: "Lakeside Tree & Shrub", city: "Lake in the Hills, IL",
      zips: ["60156","60102","60014"],
      services: ["tree_shrub","seasonal"],
      sizes: ["small","medium","large","xlarge"],
      budgets: ["under_500","500_2k","2k_10k"],
      timelines: ["asap","month","season"],
      blurb: "Certified arborists — pruning, removal, and tree health care.",
      phone: "(815) 555-0191", email: "arbor@lakesidetree.example", rating: 4.6, reviews: 62 },
    { id: "flowspro", name: "FlowsPro Irrigation", city: "Algonquin, IL",
      zips: ["60102","60156","60014","60013"],
      services: ["irrigation"],
      sizes: ["small","medium","large","xlarge"],
      budgets: ["500_2k","2k_10k","10k_plus"],
      timelines: ["month","season","flexible"],
      blurb: "Sprinkler systems, French drains, and drainage solutions.",
      phone: "(815) 555-0133", email: "info@flowspro.example", rating: 4.8, reviews: 54 },
    { id: "fourseasons", name: "Four Seasons Crystal Lake", city: "Crystal Lake, IL",
      zips: ["60012","60014","60050","60098","60156"],
      services: ["lawn_care","seasonal","tree_shrub"],
      sizes: ["small","medium","large"],
      budgets: ["under_500","500_2k"],
      timelines: ["asap","month","season","flexible"],
      blurb: "Reliable mowing, fall/spring cleanups, and snow removal.",
      phone: "(815) 555-0125", email: "hello@fourseasons.example", rating: 4.5, reviews: 207 }
  ];

  // Fetch the cleaned pro dataset from gold via /landscaping/pros and
  // swap the LANDSCAPERS list. Best-effort — failures keep the fallback.
  async function fetchLandscapers() {
    try {
      const res = await fetch("/landscaping/pros", {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.pros) && data.pros.length > 0) {
        LANDSCAPERS = data.pros;
        // Re-populate the City dropdown now that the real 200-pro
        // dataset is in (the fallback only had ~6 cities).
        if (typeof populateCityOptions === "function") {
          try { populateCityOptions(); } catch (_) {}
        }
      }
    } catch (_) { /* keep fallback */ }
  }

  // Service-keyword → projectType mapping (used to infer from chat)
  const KEYWORD_TO_SERVICE = [
    { svc: "lawn_care", words: ["mow","mowing","lawn","aerate","aeration","fertiliz","overseed","thatch"] },
    { svc: "design_install", words: ["design","redesign","install","makeover","plant bed","planting","garden design","landscape design"] },
    { svc: "hardscape", words: ["patio","paver","walkway","retaining","fire pit","hardscape","flagstone","brick"] },
    { svc: "tree_shrub", words: ["tree","shrub","prune","pruning","arborist","stump"] },
    { svc: "irrigation", words: ["irrigation","sprinkler","drainage","french drain","boggy","wet spot","flooding","grade"] },
    { svc: "seasonal", words: ["cleanup","leaf","leaves","snow","gutter","seasonal"] }
  ];

  // ==========================================================================
  // State
  // ==========================================================================
  const state = {
    step: 0,
    answers: {
      projectType: null, propertySize: null, budget: null,
      timeline: null, zip: "", name: "", email: "", phone: "", notes: ""
    },
    matches: [],
    compare: new Set(),
    sessionId: ensureSessionId(),
    chatBusy: false,
    completed: false,
    editing: false   // user clicked "Update notes" on /done → edit step-6
  };

  function ensureSessionId() {
    // Stored in sessionStorage so each browser tab/session gets its own
    // conversation thread — the chatbot keys history on this id, so a
    // stable id throughout the visit means the advisor remembers what
    // was said earlier in this same session. Closing the tab starts a
    // fresh conversation, which matches what users expect from a chat.
    const key = "landscapingSessionId";
    let id = sessionStorage.getItem(key);
    if (!id) {
      // One-time migration: if we wrote an id to localStorage in the
      // old version of this code, lift it into sessionStorage so an
      // in-progress conversation isn't broken on page refresh.
      const legacy = localStorage.getItem(key);
      if (legacy) {
        id = legacy;
        localStorage.removeItem(key);
      } else {
        id = (window.crypto && window.crypto.randomUUID)
          ? window.crypto.randomUUID()
          : Date.now() + "-" + Math.random().toString(16).slice(2);
      }
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  // ==========================================================================
  // DOM helpers
  // ==========================================================================
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));

  // ==========================================================================
  // Navigation: sticky nav shadow + mobile toggle + scroll-spy
  // ==========================================================================
  function initNav() {
    const nav = $("#topnav");
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const toggle = $("#mobileToggle");
    const menu = $("#mainNav");
    if (toggle && menu) {
      toggle.addEventListener("click", () => {
        menu.classList.toggle("open");
        toggle.setAttribute("aria-expanded", menu.classList.contains("open"));
      });
      menu.addEventListener("click", (e) => {
        if (e.target.tagName === "A") menu.classList.remove("open");
      });
    }
  }

  // ==========================================================================
  // Reveal-on-scroll animations
  // ==========================================================================
  function initReveal() {
    if (!("IntersectionObserver" in window)) {
      $$(".reveal").forEach((el) => el.classList.add("visible"));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach((el) => obs.observe(el));
  }

  // ==========================================================================
  // ZIP checker (hero)
  // ==========================================================================
  function initZipCheck() {
    const input = $("#zipCheckInput");
    const btn = $("#zipCheckBtn");
    const result = $("#zipResult");
    if (!input || !btn) return;

    const check = () => {
      const v = input.value.replace(/\D/g, "").slice(0, 5);
      input.value = v;
      if (v.length !== 5) {
        result.className = "zip-result no";
        result.textContent = "Please enter a 5-digit ZIP.";
        return;
      }
      if (CRYSTAL_LAKE_ZIPS.has(v)) {
        const city = ZIP_CITY[v] || "your area";
        result.className = "zip-result ok";
        result.textContent = "✓ We serve " + city + ". Scroll down to chat with our AI or get matched.";
        state.answers.zip = v;
        const wizZip = $("#zip");
        if (wizZip) wizZip.value = v;
      } else {
        result.className = "zip-result no";
        result.textContent = "We don't have pros in that ZIP yet — try a nearby McHenry County ZIP.";
      }
    };
    btn.addEventListener("click", check);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); check(); }
    });
  }

  // ==========================================================================
  // Cost estimator
  // ==========================================================================
  const EST_PRICING = {
    mowing:     { base: 1200, perSqftAbove1000: 0.35, label: "season" },
    cleanup:    { base: 275,  perSqftAbove1000: 0.18, label: "project" },
    design:     { base: 4000, perSqftAbove1000: 2.75, label: "project" },
    patio:      { base: 0,    perSqftAbove1000: 26,   minBase: 200, label: "installed" },
    irrigation: { base: 3500, perSqftAbove1000: 0.95, label: "installed" }
  };
  function estimate(svc, sqft) {
    const p = EST_PRICING[svc];
    if (!p) return { lo: 0, hi: 0, label: "" };
    const base = svc === "patio" ? sqft * p.perSqftAbove1000 : p.base + Math.max(0, sqft - 1000) * p.perSqftAbove1000;
    const lo = Math.round(base * 0.85 / 50) * 50;
    const hi = Math.round(base * 1.25 / 50) * 50;
    return { lo, hi, label: p.label };
  }
  function initEstimator() {
    const svc = $("#estService");
    const size = $("#estSize");
    const sizeVal = $("#estSizeVal");
    const amount = $("#estAmount");
    if (!svc || !size || !amount) return;
    const update = () => {
      sizeVal.textContent = Number(size.value).toLocaleString();
      const { lo, hi } = estimate(svc.value, Number(size.value));
      amount.textContent = "$" + lo.toLocaleString() + " – $" + hi.toLocaleString();
    };
    svc.addEventListener("change", update);
    size.addEventListener("input", update);
    update();
  }

  // ==========================================================================
  // Chatbot navigation API — window.LandscapingNav
  // ==========================================================================
  // Public surface that any chatbot widget on this page can call. The
  // existing /chat panel reads inline directives ([scroll:services] etc.)
  // out of the bot's reply and dispatches through here. Future chatbot
  // widgets dropped in via <script> tag can call window.LandscapingNav
  // directly using the same vocabulary documented in chatbot-prompt.md.

  const NAV_SECTIONS = new Set([
    "top", "categories", "how", "services", "pros",
    "cost", "faq", "ask-ai", "service-area"
  ]);
  const NAV_CATEGORIES = new Set([
    "lawn_care", "design_install", "hardscape", "tree_shrub",
    "irrigation", "seasonal", "all"
  ]);
  const NAV_FAQ_TOPICS = new Set([
    "cost", "planting_time", "licensing", "booking_lead_time",
    "watering", "is_matching_free"
  ]);
  const NAV_COST_KEYS = new Set([
    "mowing_weekly", "lawn_care_season", "cleanup", "aeration",
    "design_install", "paver_patio", "retaining_wall",
    "irrigation_small", "tree_removal", "snow_seasonal"
  ]);
  // Inline directive shapes the bot can put in its reply text. The
  // current bot prompt emits [takeover:INTENT:VALUE]; legacy directives
  // are still parsed and mapped to a takeover for backwards compat.
  //   [takeover:intent:value]    primary form (intent in INTENT_TYPES)
  //   [scroll:section]           legacy → mapped to general/process
  //   [filter-services:cat]      legacy → mapped to pro_search
  //   [highlight-cost:key]       legacy → mapped to cost
  //   [open-faq:topic]           legacy → mapped to general
  //   [start-match]              direct nav, bypasses takeover
  //   [start-match:cat]          direct nav with category pre-selected
  //   [goto:/path]               direct nav, bypasses takeover
  const NAV_DIRECTIVE_RE =
    /\[(takeover|scroll|filter-services|highlight-cost|open-faq|start-match|goto)(?::([^\]]*))?\]/gi;
  const INTENT_TYPES = new Set([
    "pro_search", "cost", "plant", "general", "process",
    "off_topic", "ambiguous"
  ]);

  function navPulse(el) {
    if (!el) return;
    el.classList.remove("nav-pulse");
    void el.offsetWidth;   // reset the animation
    el.classList.add("nav-pulse");
    setTimeout(() => el && el.classList && el.classList.remove("nav-pulse"), 1500);
  }

  function navScroll(section) {
    if (!NAV_SECTIONS.has(section)) return false;
    const el = document.getElementById(section);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    navPulse(el);
    return true;
  }

  function navFilterServices(category) {
    const grid = document.querySelector(".services-grid");
    if (!grid) return false;
    const cards = $$(".service-card", grid);
    const cat = NAV_CATEGORIES.has(category) ? category : "all";
    cards.forEach((card) => {
      const matches = cat === "all" || card.dataset.service === cat;
      card.classList.toggle("dimmed", cat !== "all" && !matches);
      card.classList.toggle("spotlit", cat !== "all" && matches);
    });
    navScroll("services");
    return true;
  }

  function navHighlightCost(key) {
    if (!NAV_COST_KEYS.has(key)) return false;
    // Clear prior highlights, then mark this one.
    $$(".cost-row.spotlit").forEach((el) => el.classList.remove("spotlit"));
    const row = document.querySelector('[data-cost="' + key + '"]');
    if (!row) return false;
    row.classList.add("spotlit");
    navScroll("cost");
    setTimeout(() => row.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    navPulse(row);
    return true;
  }

  function navOpenFAQ(topic) {
    if (!NAV_FAQ_TOPICS.has(topic)) return false;
    const faq = document.querySelector('[data-faq="' + topic + '"]');
    if (!faq) return false;
    faq.open = true;
    navScroll("faq");
    setTimeout(() => faq.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    navPulse(faq);
    return true;
  }

  function navStartMatch(category) {
    if (category && NAV_CATEGORIES.has(category) && category !== "all") {
      preselectAnswer("projectType", category);
    }
    navigateMatch(stepUrl(1));
    return true;
  }

  function navGoto(url) {
    if (typeof url !== "string" || !url.length) return false;
    if (!url.startsWith("/")) return false;
    if (/\/match\//.test(url)) {
      navigateMatch(url);
    } else {
      window.location.href = url;
    }
    return true;
  }

  function navApplyDirective(d) {
    if (!d || typeof d !== "object") return false;
    const v = (d.value == null ? "" : String(d.value)).trim();
    const action = String(d.action || "").toLowerCase();
    switch (action) {
      case "takeover": {
        // value format: "INTENT:VALUE" (value optional)
        const i = v.indexOf(":");
        const intent = (i === -1 ? v : v.slice(0, i)).trim().toLowerCase();
        const value = (i === -1 ? "" : v.slice(i + 1)).trim();
        return completeTakeover(intent, value, d.answer || "");
      }
      // Legacy directives — fold into takeover so old bot replies still
      // produce the new full-screen result.
      case "filter-services":
        return completeTakeover("pro_search", v || "all", d.answer || "");
      case "highlight-cost":
        return completeTakeover("cost", v, d.answer || "");
      case "open-faq":
        return completeTakeover("general", v, d.answer || "");
      case "scroll":
        return completeTakeover("general", v, d.answer || "");
      // Direct-nav directives — these intentionally bypass the takeover
      // because they're explicit "take me there now" actions.
      case "start-match":       return navStartMatch(v);
      case "goto":              return navGoto(v);
    }
    return false;
  }

  function navParseDirectives(text) {
    if (!text || typeof text !== "string") return { cleaned: "", directives: [] };
    const directives = [];
    NAV_DIRECTIVE_RE.lastIndex = 0;
    const cleaned = text
      .replace(NAV_DIRECTIVE_RE, (_, action, value) => {
        directives.push({
          action: String(action).toLowerCase(),
          value: (value || "").trim()
        });
        return "";
      })
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { cleaned, directives };
  }

  // ==========================================================================
  // Location — geolocation permission, service-area check, persistence
  // ==========================================================================
  const LOCATION_KEY = "landscaping_user_location";
  const LOCATION_QUERY_RE =
    /\b(near\s*me|by\s*me|around\s*me|close\s*to\s*me|local\s*to\s*me|nearby|in\s*my\s*(area|neighborhood|town|city|zip)|in\s*your\s*area|where\s*i\s*live)\b/i;
  // Crystal Lake at ~(42.2412, -88.3162). Bounding box of ~30 mi.
  const SERVICE_AREA_BOUNDS = {
    latMin: 41.81, latMax: 42.68,
    lngMin: -88.91, lngMax: -87.73
  };
  const GEOLOCATION_TIMEOUT_MS = 8000;

  // Cities in / around the service area. Used for nearest-city label
  // when the visitor shares browser geolocation. We pick the closest
  // city within 8 miles; further than that, the label is null and the
  // bot falls back to generic 'in your area' framing.
  const CITIES = [
    { name: "Crystal Lake",      lat: 42.2412, lng: -88.3162 },
    { name: "Cary",              lat: 42.2114, lng: -88.2384 },
    { name: "Algonquin",         lat: 42.1656, lng: -88.2942 },
    { name: "Lake in the Hills", lat: 42.1820, lng: -88.3320 },
    { name: "McHenry",           lat: 42.3336, lng: -88.2670 },
    { name: "Woodstock",         lat: 42.3148, lng: -88.4487 },
    { name: "Huntley",           lat: 42.1684, lng: -88.4287 },
    { name: "Oakwood Hills",     lat: 42.2330, lng: -88.3500 },
    { name: "Prairie Grove",     lat: 42.2520, lng: -88.2730 },
    { name: "Fox River Grove",   lat: 42.2025, lng: -88.2120 },
    { name: "Island Lake",       lat: 42.2750, lng: -88.1900 },
    { name: "Bull Valley",       lat: 42.3070, lng: -88.3500 },
    { name: "Marengo",           lat: 42.2492, lng: -88.6081 },
    { name: "Spring Grove",      lat: 42.4419, lng: -88.2370 },
    { name: "Wonder Lake",       lat: 42.3853, lng: -88.3400 },
    { name: "Johnsburg",         lat: 42.3814, lng: -88.2470 },
    { name: "Carpentersville",   lat: 42.1230, lng: -88.2620 },
    { name: "East Dundee",       lat: 42.1014, lng: -88.2870 },
    { name: "West Dundee",       lat: 42.1003, lng: -88.3015 },
    { name: "Sleepy Hollow",     lat: 42.1011, lng: -88.3289 },
    { name: "Pingree Grove",     lat: 42.0747, lng: -88.4119 },
    { name: "Hampshire",         lat: 42.0939, lng: -88.5275 },
    { name: "Elgin",             lat: 42.0354, lng: -88.2826 },
    { name: "South Elgin",       lat: 42.0067, lng: -88.2945 },
    { name: "St. Charles",       lat: 41.9139, lng: -88.3092 },
    { name: "Barrington",        lat: 42.1542, lng: -88.1373 },
    { name: "Barrington Hills",  lat: 42.1572, lng: -88.1925 },
    { name: "Lake Zurich",       lat: 42.1973, lng: -88.0884 },
    { name: "Wauconda",          lat: 42.2589, lng: -88.1394 },
    { name: "Hawthorn Woods",    lat: 42.2353, lng: -88.0529 },
    { name: "Long Grove",        lat: 42.1908, lng: -87.9872 },
    { name: "Hoffman Estates",   lat: 42.0451, lng: -88.0944 },
    { name: "Schaumburg",        lat: 42.0334, lng: -88.0834 }
  ];

  function haversineMiles(lat1, lng1, lat2, lng2) {
    const R = 3959; // earth radius, miles
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  function nearestCityLabel(lat, lng) {
    let best = null;
    let bestD = Infinity;
    for (const c of CITIES) {
      const d = haversineMiles(lat, lng, c.lat, c.lng);
      if (d < bestD) { bestD = d; best = c; }
    }
    // Only attach a label if we're within 8 miles of a known city.
    return (best && bestD <= 8) ? best.name : null;
  }

  function loadLocation() {
    try {
      const raw = sessionStorage.getItem(LOCATION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object") ? parsed : null;
    } catch (_) { return null; }
  }
  function saveLocation(loc) {
    try { sessionStorage.setItem(LOCATION_KEY, JSON.stringify(loc)); } catch (_) {}
  }
  function clearLocation() {
    try { sessionStorage.removeItem(LOCATION_KEY); } catch (_) {}
  }
  function isInServiceArea(lat, lng) {
    return lat >= SERVICE_AREA_BOUNDS.latMin && lat <= SERVICE_AREA_BOUNDS.latMax
        && lng >= SERVICE_AREA_BOUNDS.lngMin && lng <= SERVICE_AREA_BOUNDS.lngMax;
  }
  function queryMentionsLocation(query) {
    return typeof query === "string" && LOCATION_QUERY_RE.test(query);
  }
  function requestGeolocation() {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) return reject(new Error("unavailable"));
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error("timeout")); }
      }, GEOLOCATION_TIMEOUT_MS);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          resolve({
            lat, lng,
            accuracy_m: pos.coords.accuracy,
            in_service_area: isInServiceArea(lat, lng),
            label: nearestCityLabel(lat, lng),
            granted_at: Date.now()
          });
        },
        (err) => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          reject(new Error(err && err.code === 1 ? "denied" : "error"));
        },
        { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 600000 }
      );
    });
  }
  // Best-effort permission state read so we can show the right UI.
  // Resolves to "granted" | "prompt" | "denied" | "unsupported".
  async function locationPermissionState() {
    if (!("geolocation" in navigator)) return "unsupported";
    if (!navigator.permissions || !navigator.permissions.query) return "prompt";
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      return status.state || "prompt";
    } catch (_) { return "prompt"; }
  }

  function showLocStatus(text, opts) {
    const wrap = $("#takeoverLocStatus");
    const txt = $("#takeoverLocText");
    const btn = $("#takeoverLocBtn");
    if (!wrap || !txt) return;
    txt.textContent = text;
    wrap.hidden = false;
    wrap.classList.toggle("is-error", !!(opts && opts.error));
    if (btn) {
      btn.hidden = !(opts && opts.button);
      btn.textContent = (opts && opts.button) || "";
    }
  }
  function hideLocStatus() {
    const wrap = $("#takeoverLocStatus");
    if (wrap) wrap.hidden = true;
  }

  // Resolve to a location object (existing or fresh) or null.
  // Visible: when a prompt is happening, the loading screen shows a
  // status pill so the user knows to look for the browser dialog.
  async function resolveLocationForQuery(query, opts) {
    const force = !!(opts && opts.force);
    const cached = loadLocation();
    if (cached && !force) return cached;
    if (!force && !queryMentionsLocation(query)) return null;
    const state = await locationPermissionState();
    if (state === "unsupported") {
      // No geolocation API at all (rare). Move on quietly.
      return null;
    }
    if (state === "denied" && !force) {
      // Browser remembered a previous block — calling getCurrentPosition
      // would just reject silently. Tell the user, then proceed without.
      showLocStatus("Location is blocked in your browser settings.", {
        error: true, button: "Try again"
      });
      return null;
    }
    showLocStatus("Sharing your location for nearby results — your browser may ask permission.");
    try {
      const loc = await requestGeolocation();
      saveLocation(loc);
      showLocStatus("Location shared.", {});
      // Auto-hide after a beat so it doesn't compete with the result.
      setTimeout(hideLocStatus, 1200);
      return loc;
    } catch (e) {
      const reason = (e && e.message) || "error";
      const text = reason === "denied"
        ? "Location not shared — using general results."
        : reason === "timeout"
          ? "Location request timed out — using general results."
          : "Couldn't get location — using general results.";
      showLocStatus(text, { error: reason === "denied" });
      setTimeout(hideLocStatus, 1800);
      return null;
    }
  }

  // Wire up the in-status "Share location" / "Try again" button so the
  // click itself counts as a fresh user gesture (which Chromium uses to
  // re-trigger the permission prompt even when state is "denied").
  function bindLocStatusButton() {
    const btn = $("#takeoverLocBtn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      btn.hidden = true;
      try {
        const loc = await requestGeolocation();
        saveLocation(loc);
        // Update the current takeover entry so the result re-renders
        // with the new pill on next route resolution.
        const id = currentTakeoverId();
        if (id) {
          const entry = loadTakeoverEntry(id) || {};
          entry.location = loc;
          saveTakeoverEntry(id, entry);
        }
        showLocStatus("Location shared.", {});
        setTimeout(hideLocStatus, 1200);
        // Re-render result if we're already past loading.
        if (!$("#takeoverResult").hidden) renderTakeoverResult();
      } catch (_) {
        showLocStatus("Couldn't get location. Open your browser settings to allow it for this site.",
          { error: true });
      }
    });
  }

  // ==========================================================================
  // Takeover flow — full-screen result page driven by chat
  // ==========================================================================
  const TAKEOVER_KEY = "landscaping_takeover_state";
  const PATHNAME_ASK_EMPTY_RE = /^\/(landscaping|landscape)\/ask\/?$/;
  const PATHNAME_ASK_RESULT_RE = /^\/(landscaping|landscape)\/ask\/result\/([A-Za-z0-9_-]{1,32})\/?$/;
  const STAGE_BEAT_MS = 480;
  const STAGE_3_MS = 220;
  const RESULT_RENDER_DELAY_MS = 200;
  const SLOW_MESSAGE_MS = 5000;
  const HARD_TIMEOUT_MS = 12000;

  function askEmptyUrl()      { return pathPrefix() + "/ask"; }
  function askResultUrl(id)   { return pathPrefix() + "/ask/result/" + id; }
  function currentTakeoverId() {
    const m = window.location.pathname.match(PATHNAME_ASK_RESULT_RE);
    return m ? m[2] : null;
  }
  function genQueryId() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // sessionStorage map keyed by query_id so refresh / browser back
  // restores the right state for the URL the user is on.
  function loadAllTakeoverState() {
    try {
      const raw = sessionStorage.getItem(TAKEOVER_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (_) { return {}; }
  }
  function saveTakeoverEntry(id, entry) {
    const all = loadAllTakeoverState();
    all[id] = entry;
    // Cap retained entries so sessionStorage doesn't grow unbounded.
    const ids = Object.keys(all);
    if (ids.length > 8) {
      ids.sort((a, b) => (all[a].started_at || 0) - (all[b].started_at || 0))
         .slice(0, ids.length - 8)
         .forEach((k) => delete all[k]);
    }
    try { sessionStorage.setItem(TAKEOVER_KEY, JSON.stringify(all)); } catch (_) {}
  }
  function loadTakeoverEntry(id) {
    if (!id) return null;
    return loadAllTakeoverState()[id] || null;
  }

  // --- State machine: stages 1, 2, 3 progressing through pending → running → done
  let _stageTimers = [];
  let _slowTimer = null;
  let _hardTimer = null;
  function clearStageTimers() {
    _stageTimers.forEach((t) => clearTimeout(t));
    _stageTimers = [];
    if (_slowTimer)  { clearTimeout(_slowTimer);  _slowTimer = null;  }
    if (_hardTimer)  { clearTimeout(_hardTimer);  _hardTimer = null;  }
  }
  function setStage(n, stateName) {
    const li = document.querySelector('.takeover-progress li[data-stage="' + n + '"]');
    if (!li) return;
    li.classList.remove("pending", "running", "done");
    li.classList.add(stateName);
  }
  function resetStages() {
    setStage(1, "pending");
    setStage(2, "pending");
    setStage(3, "pending");
    const slow = $("#takeoverLoadingSlow");
    if (slow) slow.hidden = true;
  }

  function showTakeoverPanel(name) {
    const map = {
      loading: "#takeoverLoading",
      result:  "#takeoverResult",
      empty:   "#takeoverEmpty",
      error:   "#takeoverError"
    };
    Object.keys(map).forEach((p) => {
      const el = $(map[p]);
      if (!el) return;
      const isTarget = (p === name);
      if (!isTarget) {
        el.classList.remove("fade-in");
        el.hidden = true;
      }
    });
    const target = $(map[name]);
    if (!target) return;
    target.hidden = false;
    void target.offsetWidth;
    target.classList.add("fade-in");
  }

  function startTakeoverLoading() {
    clearStageTimers();
    hideLocStatus();
    showTakeoverPanel("loading");
    resetStages();
    setStage(1, "running");
    _slowTimer = setTimeout(() => {
      const slow = $("#takeoverLoadingSlow");
      if (slow) slow.hidden = false;
    }, SLOW_MESSAGE_MS);
    _hardTimer = setTimeout(() => {
      const id = currentTakeoverId();
      const entry = loadTakeoverEntry(id);
      if (!entry || !entry.completed_at) {
        failTakeover();
      }
    }, HARD_TIMEOUT_MS);
  }

  function finishLoadingThenRender() {
    clearStageTimers();
    setStage(1, "done");
    setStage(2, "running");
    _stageTimers.push(setTimeout(() => {
      setStage(2, "done");
      setStage(3, "running");
      _stageTimers.push(setTimeout(() => {
        setStage(3, "done");
        _stageTimers.push(setTimeout(renderTakeoverResult, RESULT_RENDER_DELAY_MS));
      }, STAGE_3_MS));
    }, STAGE_BEAT_MS));
  }

  // Begin takeover: store query, navigate, show loading. Called from any
  // chat surface BEFORE the chat fetch resolves so the user sees feedback
  // immediately; the resolved fetch later calls completeTakeover().
  function startTakeover(query) {
    if (typeof query !== "string" || !query.trim()) return null;
    const trimmed = query.trim();
    const qid = genQueryId();
    saveTakeoverEntry(qid, {
      query: trimmed, intent: null, value: null, answer: null,
      started_at: Date.now(), completed_at: null
    });
    history.pushState({ takeoverRoute: true }, "", askResultUrl(qid));
    routePage();
    return qid;
  }

  function completeTakeover(intent, value, answer) {
    const id = currentTakeoverId();
    if (!id) return false;   // not on a result URL → nothing to complete
    const entry = loadTakeoverEntry(id) || { started_at: Date.now() };
    entry.intent = INTENT_TYPES.has(intent) ? intent : "general";
    entry.value = value || "";
    entry.answer = answer || "";
    entry.completed_at = Date.now();
    saveTakeoverEntry(id, entry);
    finishLoadingThenRender();
    return true;
  }

  function failTakeover() {
    clearStageTimers();
    showTakeoverPanel("error");
  }

  function renderTakeoverResult() {
    const id = currentTakeoverId();
    const entry = loadTakeoverEntry(id);
    const container = $("#takeoverResult");
    if (!entry || !entry.completed_at || !container) {
      failTakeover();
      return;
    }
    container.innerHTML = renderResultMarkup(entry);
    showTakeoverPanel("result");
    // Re-bind any "Ask another" / quick-prompt buttons rendered within.
    bindTakeoverResultActions(container);
  }

  // Hook for chat surfaces: parse the bot's reply, complete takeover.
  // Called by both the inline chat and (via window.LandscapingNav) the
  // widget on landscape pages where takeover is active.
  function ingestBotReply(rawAnswer) {
    const { cleaned, directives } = navParseDirectives(rawAnswer || "");
    const id = currentTakeoverId();
    if (!id) {
      // Not in a takeover yet (e.g., chat sent without startTakeover) —
      // fall through to old applyDirective behavior so existing surfaces
      // still get something. Shouldn't happen in normal flow.
      if (directives.length) navApplyDirective(directives[0]);
      return { cleaned, directives };
    }
    if (directives.length) {
      const d = { ...directives[0], answer: cleaned };
      navApplyDirective(d);
    } else {
      // Bot didn't emit any directive — render the answer as a generic
      // "general" result so the loading screen doesn't hang.
      completeTakeover("general", "", cleaned);
    }
    return { cleaned, directives };
  }

  // ---------- RESULT VARIANTS (Phase 1 ships PRO_SEARCH; others fall back) ----------
  const PRO_SEARCH_CONTENT = {
    lawn_care: {
      label: "lawn care",
      icon: "🌱",
      explainer:
        "We don't list pros publicly — instead we match you with up to three local " +
        "lawn-care pros based on your property, schedule, and budget.",
      cta: "Get matched with lawn-care pros",
      costs: [
        { service: "Weekly mowing (¼ acre)", range: "$40 – $55 / visit" },
        { service: "Full-service lawn care (season)", range: "$1,200 – $2,400" },
        { service: "Aeration + overseeding",         range: "$180 – $380" }
      ],
      ask: [
        "How long have you mowed in this area?",
        "Do you carry liability insurance — can I see proof?",
        "Are mowing visits the same crew each week?",
        "What's your policy on missed visits or weather days?"
      ]
    },
    hardscape: {
      label: "hardscaping",
      icon: "🪨",
      explainer:
        "We don't list pros publicly — instead we match you with up to three local " +
        "hardscaping landscapers based on your project, location, and timeline.",
      cta: "Get matched with hardscaping pros",
      costs: [
        { service: "Paver patio (per sqft)",        range: "$18 – $35" },
        { service: "Retaining wall (per linear ft)", range: "$65 – $150" },
        { service: "Fire pit (built-in, installed)", range: "$1,800 – $4,500" }
      ],
      ask: [
        "What base depth and material do you use under pavers?",
        "Do you offer a workmanship warranty? How long?",
        "Will you pull permits if my project needs them?",
        "Can you share photos of three similar Crystal Lake jobs?"
      ]
    },
    design_install: {
      label: "landscape design & install",
      icon: "🌷",
      explainer:
        "We don't list pros publicly — instead we match you with up to three local " +
        "design-and-install landscapers based on your yard, taste, and budget.",
      cta: "Get matched with design pros",
      costs: [
        { service: "Landscape design + install", range: "$4,000 – $15,000" },
        { service: "Foundation plantings",       range: "$1,500 – $4,500" },
        { service: "Outdoor lighting",           range: "$2,500 – $6,000" }
      ],
      ask: [
        "Will I see a planting plan before any work starts?",
        "Do you specify native or pollinator-friendly plants by default?",
        "What's your plant-survival warranty in year one?",
        "Who maintains the install for the first growing season?"
      ]
    },
    tree_shrub: {
      label: "tree & shrub",
      icon: "🌳",
      explainer:
        "We don't list pros publicly — instead we match you with up to three local " +
        "tree and shrub specialists, including ISA-certified arborists where the job calls for it.",
      cta: "Get matched with tree pros",
      costs: [
        { service: "Tree removal (mature)",       range: "$650 – $2,400" },
        { service: "Pruning (per tree)",          range: "$180 – $650" },
        { service: "Stump grinding (per stump)", range: "$120 – $400" }
      ],
      ask: [
        "Are you ISA-certified — can I see your card?",
        "What's your insurance coverage for tree work near structures?",
        "Will you grind the stump and haul debris, or quote separately?",
        "What's your cleanup standard for the property when done?"
      ]
    },
    irrigation: {
      label: "irrigation & drainage",
      icon: "💧",
      explainer:
        "We don't list pros publicly — instead we match you with up to three local " +
        "irrigation pros for sprinkler systems, French drains, and yard grading.",
      cta: "Get matched with irrigation pros",
      costs: [
        { service: "Irrigation system (small yard)", range: "$3,500 – $6,500" },
        { service: "French drain (per linear ft)",   range: "$30 – $75" },
        { service: "Yard regrading",                 range: "$1,500 – $5,000" }
      ],
      ask: [
        "Are you a registered Illinois irrigation contractor?",
        "Do you install rain sensors or smart controllers by default?",
        "What's your warranty on installation and on the equipment?",
        "How do you handle winterization in year one?"
      ]
    },
    seasonal: {
      label: "seasonal cleanup & snow",
      icon: "❄️",
      explainer:
        "We don't list pros publicly — instead we match you with up to three local " +
        "seasonal-cleanup and snow-removal services for spring, fall, and winter.",
      cta: "Get matched with seasonal pros",
      costs: [
        { service: "Spring or fall cleanup",  range: "$275 – $650" },
        { service: "Snow & ice, seasonal",    range: "$350 – $900" },
        { service: "Gutter clearing (1-story)", range: "$120 – $250" }
      ],
      ask: [
        "What's included in your spring or fall cleanup scope?",
        "How quickly do you respond after a snowfall?",
        "Is salt or eco-melt included or extra?",
        "Do you offer prepay or per-event pricing for snow?"
      ]
    },
    all: {
      label: "landscaping",
      icon: "🌿",
      explainer:
        "We don't list pros publicly — instead we match you with up to three local " +
        "landscapers based on your project, location, and timeline.",
      cta: "Get matched with landscapers",
      costs: [
        { service: "Weekly mowing (¼ acre)",      range: "$40 – $55 / visit" },
        { service: "Paver patio (per sqft)",       range: "$18 – $35" },
        { service: "Landscape design + install",   range: "$4,000 – $15,000" }
      ],
      ask: [
        "Are you registered and insured in Crystal Lake / McHenry County?",
        "Can you share three local references I can call?",
        "What's your timeline for a project this size?",
        "What's your written-quote and change-order process?"
      ]
    }
  };

  function renderLocationPill(entry) {
    const loc = entry && entry.location;
    if (!loc) return "";
    if (loc.in_service_area) {
      const label = loc.label
        ? "In " + loc.label
        : "In your area · McHenry County";
      return '<div class="takeover-pill takeover-pill-ok" aria-label="Location shared">' +
        '<span aria-hidden="true">📍</span> ' + esc(label) +
        '</div>';
    }
    return '<div class="takeover-pill takeover-pill-warn" aria-label="Outside service area">' +
      '<span aria-hidden="true">📍</span> ' +
      'Outside our usual service area — we\'ll still try' +
      '</div>';
  }

  // If the query asked about "near me" but no location made it onto the
  // takeover entry (denied / timeout / never prompted), show a banner
  // that lets the user try again with a real click gesture.
  function renderLocationCTA(entry) {
    if (!entry || entry.location) return "";
    if (!queryMentionsLocation(entry.query || "")) return "";
    return [
      '<div class="takeover-loc-banner is-error">',
        '<span class="takeover-loc-banner-text">',
          '📍 You asked about pros near you, but I don\'t have your location yet.',
          ' Share it for nearby results.',
        '</span>',
        '<button type="button" class="btn btn-primary btn-sm" data-takeover-share-location>',
          'Share location',
        '</button>',
      '</div>'
    ].join("");
  }

  function renderResultMarkup(entry) {
    const pill = renderLocationPill(entry);
    const cta = renderLocationCTA(entry);
    let body;
    switch (entry.intent) {
      case "pro_search": body = renderProSearchMarkup(entry); break;
      case "cost":       body = renderCostMarkup(entry);      break;
      case "plant":      body = renderPlantMarkup(entry);     break;
      case "general":    body = renderGeneralMarkup(entry);   break;
      case "process":    body = renderProcessMarkup(entry);   break;
      case "off_topic":  body = renderOffTopicMarkup(entry);  break;
      case "ambiguous":  body = renderAmbiguousMarkup(entry); break;
      default:           body = renderFallbackMarkup(entry);
    }
    return pill + cta + body;
  }

  // ===== COST VARIANT =====
  const COST_DATA = {
    mowing_weekly: {
      label: "weekly mowing",
      range: "$40 – $55 per visit",
      typical: "For a typical ¼-acre yard: about $1,200 – $2,400 across the full season.",
      why: [
        "Lot size — bigger yards take longer per visit.",
        "Frequency — weekly visits cost less per cut than every other week.",
        "Edging and trimming — included by some pros, billed separately by others.",
        "Slope and obstacles — hilly yards or yards with lots of beds slow the cut."
      ]
    },
    lawn_care_season: {
      label: "full-season lawn care",
      range: "$1,200 – $2,400 / season",
      typical: "Covers weekly mowing, edging, and a few visits for fertilization or aeration.",
      why: [
        "How many fertilizer rounds the program includes.",
        "Whether aeration and overseeding are bundled or extra.",
        "Crabgrass / weed treatments — pre-emergent vs as-needed.",
        "Spring and fall cleanup add-ons."
      ]
    },
    cleanup: {
      label: "spring or fall cleanup",
      range: "$275 – $650 per visit",
      typical: "For a typical residential lot, one full cleanup runs about $275 – $650.",
      why: [
        "Leaf volume — heavy oak/maple yards take longer.",
        "Whether bagged debris is hauled away or curbside.",
        "Bed cleanup vs lawn cleanup vs both.",
        "Add-ons like gutter clearing or shrub pruning."
      ]
    },
    aeration: {
      label: "aeration plus overseeding",
      range: "$180 – $380",
      typical: "Most ¼-acre lawns: about $180 – $380 for core aeration with overseeding.",
      why: [
        "Lot size and access for the aerator.",
        "Whether overseeding is included.",
        "Type of seed (basic blend vs premium fescue).",
        "Topdressing with compost adds material + labor."
      ]
    },
    design_install: {
      label: "landscape design and install",
      range: "$4,000 – $15,000",
      typical: "Most full-yard makeovers in McHenry County land between $4,000 and $15,000.",
      why: [
        "Scope — a single bed redo vs a full-yard refresh.",
        "Plant maturity — 1-gallon vs 5-gallon vs balled-and-burlapped.",
        "Hardscape included — pathways, edging, lighting.",
        "Soil prep — replacing or amending poor soil adds materials."
      ]
    },
    paver_patio: {
      label: "a paver patio",
      range: "$18 – $35 per square foot installed",
      typical: "For a typical 300 sqft patio: $5,400 – $10,500.",
      why: [
        "Materials — basic concrete pavers vs premium stone.",
        "Site access — easy vs tight backyards add labor.",
        "Site prep — removing existing concrete or grading.",
        "Decorative features — borders, patterns, fire pits."
      ]
    },
    retaining_wall: {
      label: "a retaining wall",
      range: "$65 – $150 per linear foot",
      typical: "For a 30-foot wall around 3 feet tall: roughly $2,000 – $4,500.",
      why: [
        "Block type — basic concrete vs natural stone vs poured.",
        "Wall height — over 4 ft typically needs engineering.",
        "Drainage requirements — a French drain behind a wall adds cost.",
        "Excavation — site grading and base prep."
      ]
    },
    irrigation_small: {
      label: "an irrigation system for a small yard",
      range: "$3,500 – $6,500",
      typical: "Small yards (¼ acre or less) typically come in around $3,500 – $6,500 installed.",
      why: [
        "Number of zones — more zones, more controllers and runs.",
        "Smart controllers — Wi-Fi / weather-aware add 10–20%.",
        "Trenching difficulty — clay soil or roots slow the install.",
        "Permits and backflow preventer requirements."
      ]
    },
    tree_removal: {
      label: "tree removal",
      range: "$650 – $2,400",
      typical: "Mature tree removal in McHenry County usually runs $650 – $2,400.",
      why: [
        "Trunk diameter and height.",
        "Proximity to structures or power lines.",
        "Whether the stump is ground out or left.",
        "Cleanup standard and debris hauling."
      ]
    },
    snow_seasonal: {
      label: "seasonal snow & ice",
      range: "$350 – $900 per season",
      typical: "Most residential driveways: $350 – $900 for the full season.",
      why: [
        "Driveway size and slope.",
        "Per-event vs seasonal pricing.",
        "Salt or eco-melt included or extra.",
        "Trigger depth (when they show up — 1\" vs 2\" vs 3\")."
      ]
    }
  };

  function renderCostMarkup(entry) {
    const key = (entry.value || "").toLowerCase();
    const data = COST_DATA[key];
    const wrapper = entry.answer
      ? '<p class="takeover-answer">' + esc(entry.answer) + "</p>"
      : "";
    if (!data) {
      // Bot picked a key we don't have a card for — show the bot's text
      // honestly and let the visitor get matched for an exact quote.
      return [
        '<h1 class="takeover-result-headline">Here\'s what I know about that price.</h1>',
        wrapper || '<p class="takeover-answer">I don\'t have a precise range for that one — a matched pro can give you an exact quote.</p>',
        '<div class="takeover-card-cta">',
          '<a class="btn btn-primary" href="' + pathPrefix() + '/match/step-1" data-takeover-match data-cat="all">Get matched for a quote</a>',
          '<button type="button" class="btn btn-outline" data-takeover-ask-another>Ask something else</button>',
        '</div>'
      ].join("");
    }
    const whyHTML = data.why.map((row) => "<li>" + esc(row) + "</li>").join("");
    return [
      '<h1 class="takeover-result-headline">Here\'s what ' + esc(data.label) +
        ' typically cost in Crystal Lake.</h1>',
      wrapper,
      '<div class="takeover-card takeover-cost-card">',
        '<div class="takeover-cost-label">' + esc(capitalize(data.label)) + '</div>',
        '<div class="takeover-cost-range">' + esc(data.range) + '</div>',
        '<div class="takeover-cost-typical">' + esc(data.typical) + '</div>',
      '</div>',
      '<div class="takeover-card">',
        '<h3>Why the range?</h3>',
        '<ul class="takeover-why-list">' + whyHTML + '</ul>',
        '<div class="takeover-card-cta">',
          '<a class="btn btn-outline" href="' + pathPrefix() + '#cost" data-takeover-exit>Try the cost calculator</a>',
          '<a class="btn btn-primary" href="' + pathPrefix() + '/match/step-1" data-takeover-match data-cat="all">Get matched for a real quote</a>',
        '</div>',
      '</div>',
      '<div class="takeover-result-followups">',
        '<button type="button" class="btn btn-ghost" data-takeover-ask-another>Ask another question</button>',
      '</div>'
    ].join("");
  }

  // ===== PLANT VARIANT =====
  // Small curated plant set. Tags drive filtering — when the bot returns
  // a value like "shade" or "deer_resistant", we filter by that tag.
  const PLANT_DATA = [
    { id: "wild_geranium", common: "Wild geranium", sci: "Geranium maculatum",
      tags: ["native", "shade", "partial_sun", "spring_bloom"],
      note: "Native to Northern Illinois woodlands; thrives in shade." },
    { id: "wood_aster", common: "Wood aster", sci: "Eurybia divaricata",
      tags: ["native", "shade", "fall_bloom", "deer_resistant"],
      note: "Tough native that flowers when most shade plants are done." },
    { id: "virginia_bluebells", common: "Virginia bluebells", sci: "Mertensia virginica",
      tags: ["native", "shade", "spring_bloom"],
      note: "Spring ephemeral — vivid blue, then dies back by midsummer." },
    { id: "sensitive_fern", common: "Sensitive fern", sci: "Onoclea sensibilis",
      tags: ["native", "shade", "moist", "deer_resistant"],
      note: "Wetland-friendly fern; happy in damp shady corners." },
    { id: "hostas", common: "Hostas", sci: "Hosta spp.",
      tags: ["shade", "moist", "low_maintenance"],
      note: "Non-native but reliable; many cultivars for shade beds." },
    { id: "purple_coneflower", common: "Purple coneflower", sci: "Echinacea purpurea",
      tags: ["native", "sun", "summer_bloom", "pollinator_friendly", "drought_tolerant"],
      note: "Backbone of any sunny native bed; goldfinches love the seed heads." },
    { id: "black_eyed_susan", common: "Black-eyed Susan", sci: "Rudbeckia hirta",
      tags: ["native", "sun", "summer_bloom", "pollinator_friendly", "deer_resistant"],
      note: "Tough perennial that thrives in clay soil and full sun." },
    { id: "butterfly_milkweed", common: "Butterfly milkweed", sci: "Asclepias tuberosa",
      tags: ["native", "sun", "summer_bloom", "pollinator_friendly", "drought_tolerant"],
      note: "Host plant for monarchs; bright orange blooms in midsummer." },
    { id: "little_bluestem", common: "Little bluestem", sci: "Schizachyrium scoparium",
      tags: ["native", "sun", "drought_tolerant", "deer_resistant", "grass"],
      note: "Native prairie grass — copper-red fall color, winter interest." },
    { id: "switchgrass", common: "Switchgrass", sci: "Panicum virgatum",
      tags: ["native", "sun", "drought_tolerant", "deer_resistant", "grass"],
      note: "Tall ornamental native grass; great backdrop for perennial beds." },
    { id: "serviceberry", common: "Serviceberry", sci: "Amelanchier arborea",
      tags: ["native", "sun", "partial_sun", "spring_bloom", "tree", "pollinator_friendly"],
      note: "Small native tree — white spring flowers, edible berries, fall color." },
    { id: "ninebark", common: "Ninebark", sci: "Physocarpus opulifolius",
      tags: ["native", "sun", "shrub", "deer_resistant", "drought_tolerant"],
      note: "Tough native shrub with peeling bark for winter interest." },
    { id: "smooth_hydrangea", common: "Smooth hydrangea", sci: "Hydrangea arborescens",
      tags: ["native", "shade", "partial_sun", "shrub", "summer_bloom"],
      note: "Native hydrangea with big white flowers; tolerates more shade than panicle types." },
    { id: "joe_pye_weed", common: "Joe Pye weed", sci: "Eutrochium maculatum",
      tags: ["native", "sun", "moist", "summer_bloom", "pollinator_friendly", "deer_resistant"],
      note: "Tall native — magnet for monarchs and swallowtails." }
  ];

  // Map common bot value tokens to plant tags.
  const PLANT_TAG_ALIASES = {
    shade: "shade", shady: "shade", "low light": "shade",
    sun: "sun", sunny: "sun", "full sun": "sun",
    native: "native", natives: "native",
    deer: "deer_resistant", deer_resistant: "deer_resistant", "deer-resistant": "deer_resistant",
    drought: "drought_tolerant", drought_tolerant: "drought_tolerant",
    pollinator: "pollinator_friendly", pollinators: "pollinator_friendly",
    butterfly: "pollinator_friendly", bee: "pollinator_friendly",
    moist: "moist", wet: "moist", boggy: "moist",
    spring: "spring_bloom", summer: "summer_bloom", fall: "fall_bloom",
    grass: "grass", grasses: "grass",
    tree: "tree", trees: "tree",
    shrub: "shrub", shrubs: "shrub"
  };

  function resolvePlantTags(rawValue) {
    const v = (rawValue || "").toLowerCase().trim();
    if (!v) return [];
    // Allow comma-separated lists like "shade,deer_resistant" so a
    // refined follow-up turn can stack tags.
    const tokens = v.split(/[,]+/).map((s) => s.trim()).filter(Boolean);
    const tags = new Set();
    tokens.forEach((tok) => {
      const norm = tok.replace(/[_\s\-]+/g, " ").trim();
      if (PLANT_TAG_ALIASES[norm]) {
        tags.add(PLANT_TAG_ALIASES[norm]);
        return;
      }
      // Try individual words inside the token.
      norm.split(/\s+/).forEach((w) => {
        if (PLANT_TAG_ALIASES[w]) tags.add(PLANT_TAG_ALIASES[w]);
      });
    });
    return Array.from(tags);
  }

  function renderPlantMarkup(entry) {
    const value = entry.value || "";
    const tags = resolvePlantTags(value);
    let plants = PLANT_DATA;
    if (tags.length) {
      plants = PLANT_DATA.filter((p) => tags.every((t) => p.tags.includes(t)));
      if (plants.length === 0) {
        // Loosen: any-tag match
        plants = PLANT_DATA.filter((p) => tags.some((t) => p.tags.includes(t)));
      }
    }
    plants = plants.slice(0, 6);

    const wrapper = entry.answer
      ? '<p class="takeover-answer">' + esc(entry.answer) + "</p>"
      : "";

    const headline = tags.length
      ? "Here's what works in our area — " + esc(tags.map((t) => t.replace(/_/g, " ")).join(", ")) + "."
      : "Here's what works in our area.";

    const cardsHTML = plants.map((p) => {
      const tagBadges = p.tags
        .filter((t) => ["native", "deer_resistant", "drought_tolerant", "pollinator_friendly"].indexOf(t) !== -1)
        .slice(0, 2)
        .map((t) => '<span class="takeover-plant-tag">' + esc(t.replace(/_/g, " ")) + '</span>')
        .join("");
      return [
        '<div class="takeover-plant-card">',
          '<div class="takeover-plant-name">' + esc(p.common) + '</div>',
          '<div class="takeover-plant-sci"><em>' + esc(p.sci) + '</em></div>',
          '<div class="takeover-plant-tags">' + tagBadges + '</div>',
          '<p class="takeover-plant-note">' + esc(p.note) + '</p>',
        '</div>'
      ].join("");
    }).join("");

    if (plants.length === 0) {
      return [
        '<h1 class="takeover-result-headline">Hmm, nothing exact in our guide for that.</h1>',
        wrapper,
        '<div class="takeover-card">',
          '<p>Our planting guide has the full list of plants we work with around Crystal Lake. Try the guide, or get matched with a designer who can tailor a list for your yard.</p>',
          '<div class="takeover-card-cta">',
            '<a class="btn btn-outline" href="/landscape/guide">Browse the planting guide</a>',
            '<a class="btn btn-primary" href="' + pathPrefix() + '/match/step-1" data-takeover-match data-cat="design_install">Get matched with a designer</a>',
          '</div>',
        '</div>'
      ].join("");
    }

    return [
      '<h1 class="takeover-result-headline">' + esc(headline) + '</h1>',
      wrapper,
      '<div class="takeover-plant-grid">' + cardsHTML + '</div>',
      '<div class="takeover-result-followups">',
        '<a class="btn btn-outline" href="/landscape/guide">Browse the full planting guide</a>',
        '<a class="btn btn-primary" href="' + pathPrefix() + '/match/step-1" data-takeover-match data-cat="design_install">Get matched with a designer</a>',
        '<button type="button" class="btn btn-ghost" data-takeover-ask-another>Ask another question</button>',
      '</div>'
    ].join("");
  }

  // ===== GENERAL VARIANT (FAQ / glossary / ordinance lookup) =====
  const GENERAL_DATA = {
    licensing: {
      title: "Are landscapers licensed in Illinois?",
      body: "Illinois doesn't require a statewide landscaper license. Specific trades — irrigation contractors and applicators of restricted-use pesticides — do need state credentials. Most McHenry County municipalities also require contractor registration and proof of liability insurance, so check with your city before hiring.",
      footer: "Source: Illinois Dept. of Financial &amp; Professional Regulation (IDFPR); Crystal Lake city contractor registration.",
      related: ["booking_lead_time", "is_matching_free", "vetting"]
    },
    watering: {
      title: "Crystal Lake watering rules.",
      body: "Crystal Lake has water-conservation rules during the warm-weather months: odd/even sprinkling tied to your address, with morning/evening hour limits. Exact start and end dates are set by the city ordinance.",
      footer: "Check crystallake.org or call Public Works for the current schedule before installing or running irrigation.",
      related: ["irrigation_small", "zone_5a"]
    },
    planting_time: {
      title: "When to plant in Northern Illinois.",
      body: "Crystal Lake sits in USDA Zone 6a (per the 2023 USDA Plant Hardiness Zone Map update — previously Zone 5a). The safe spring planting window opens after the last frost, usually mid-May. Fall planting (September through mid-October) is ideal for trees, shrubs, and perennials because cooler soil reduces transplant shock.",
      footer: "Source: USDA Plant Hardiness Zone Map (2023); University of Illinois Extension.",
      related: ["zone_5a", "watering"]
    },
    booking_lead_time: {
      title: "How far in advance to book a landscaper.",
      body: "Spring cleanups: book by mid-February. Summer installs: by early April. Fall cleanups: by mid-August. Irrigation and hardscape projects typically need 3–6 weeks lead time during peak season.",
      footer: "These windows are typical for McHenry County pros. Holiday weeks and weather can shift them.",
      related: ["matching", "is_matching_free"]
    },
    is_matching_free: {
      title: "Is matching free?",
      body: "Yes. Matching and chatting with our advisor are free. You only pay the landscaper directly for the work you choose to hire them for. We don't charge pros for leads or take a cut of your project.",
      footer: "Honesty note: we may add features in the future that cost money — we'll be upfront about it if we do.",
      related: ["matching", "vetting"]
    },
    zone_5a: {
      title: "What Zone 5a/6a means around Crystal Lake.",
      body: "USDA cold-hardiness rating. Crystal Lake sits in Zone 6a per the 2023 USDA map update (previously Zone 5a) — average annual extreme minimum temperatures of −10°F to −5°F. Plan for a frost-free window of roughly May 15 to October 5, though early and late frosts happen.",
      footer: "Source: USDA Plant Hardiness Zone Map, 2023.",
      related: ["planting_time", "watering"]
    }
  };

  function renderGeneralMarkup(entry) {
    const key = (entry.value || "").toLowerCase().replace(/[\s\-]+/g, "_");
    const data = GENERAL_DATA[key];
    const wrapper = entry.answer
      ? '<p class="takeover-answer">' + esc(entry.answer) + "</p>"
      : "";
    if (!data) {
      return [
        '<h1 class="takeover-result-headline">Here\'s what I found.</h1>',
        wrapper || '<p class="takeover-answer">I don\'t have a card for that one in our guide yet.</p>',
        '<div class="takeover-card-cta">',
          '<a class="btn btn-outline" href="/landscape/guide">Browse the full guide</a>',
          '<button type="button" class="btn btn-primary" data-takeover-ask-another>Ask something else</button>',
        '</div>'
      ].join("");
    }
    const relatedHTML = (data.related || []).filter((r) => GENERAL_DATA[r]).slice(0, 3).map((r) =>
      '<button type="button" class="takeover-related" data-takeover-disambiguate ' +
      'data-intent="general" data-value="' + esc(r) + '" ' +
      'data-q="Tell me about ' + esc(GENERAL_DATA[r].title.replace(/\.$/, "")) + '">' +
      esc(GENERAL_DATA[r].title) + '</button>'
    ).join("");
    return [
      '<h1 class="takeover-result-headline">' + esc(data.title) + '</h1>',
      '<div class="takeover-card">',
        '<p>' + esc(data.body) + '</p>',
        data.footer ? '<p class="takeover-card-footer">' + data.footer + '</p>' : "",
      '</div>',
      relatedHTML ? [
        '<div class="takeover-supporting-block takeover-related-block">',
          '<h4>Related</h4>',
          '<div class="takeover-related-list">' + relatedHTML + '</div>',
        '</div>'
      ].join("") : "",
      '<div class="takeover-result-followups">',
        '<a class="btn btn-primary" href="' + pathPrefix() + '/match/step-1" data-takeover-match data-cat="all">Get matched with a pro</a>',
        '<button type="button" class="btn btn-ghost" data-takeover-ask-another>Ask another question</button>',
      '</div>'
    ].join("");
  }

  // ===== PROCESS VARIANT =====
  const PROCESS_DATA = {
    matching: {
      title: "How matching works.",
      steps: [
        "You answer six quick questions about your project.",
        "We match you with up to three local pros who actually do that type of work in your ZIP.",
        "The pros reach out — usually within 24–48 hours.",
        "You pick one, or none. No commitment."
      ],
      honesty: "We don't take payment from landscapers. We don't sell your contact info. Your project details only go to the pros you choose to hire."
    },
    vetting: {
      title: "How we pick the pros.",
      steps: [
        "Pros register their service area, categories, and basic insurance / registration info.",
        "We verify the local registration and insurance documents we can.",
        "We track which jobs they actually complete and how customers rate them.",
        "Pros who don't show up, don't honor quotes, or rack up complaints get removed."
      ],
      honesty: "Honest note: this is a small directory; we don't claim to have audited every pro the way a state licensing board would. Always confirm a pro's credentials yourself before signing."
    },
    is_free: {
      title: "Yes, matching is free.",
      steps: [
        "Free for homeowners — no fees, no sign-up paywall, no hidden charges.",
        "Free chats with the advisor.",
        "You only pay the pro you hire, directly. Their quote is between you and them.",
        "We don't charge pros per-lead, so they're not chasing the loudest customer."
      ],
      honesty: "We may launch paid features for pros eventually (like premium listings). If we do, we'll keep matching free for homeowners and disclose any difference in placement."
    }
  };

  function renderProcessMarkup(entry) {
    const key = (entry.value || "matching").toLowerCase();
    const data = PROCESS_DATA[key] || PROCESS_DATA.matching;
    const wrapper = entry.answer
      ? '<p class="takeover-answer">' + esc(entry.answer) + "</p>"
      : "";
    const stepsHTML = data.steps.map((s, i) =>
      '<li><span class="takeover-process-num">' + (i + 1) + '</span><span>' + esc(s) + '</span></li>'
    ).join("");
    return [
      '<h1 class="takeover-result-headline">' + esc(data.title) + '</h1>',
      wrapper,
      '<div class="takeover-card">',
        '<ol class="takeover-process-steps">' + stepsHTML + '</ol>',
        '<p class="takeover-card-footer">' + esc(data.honesty) + '</p>',
        '<div class="takeover-card-cta">',
          '<a class="btn btn-primary" href="' + pathPrefix() + '/match/step-1" data-takeover-match data-cat="all">Get matched</a>',
          '<button type="button" class="btn btn-outline" data-takeover-disambiguate ' +
            'data-intent="process" data-value="vetting" ' +
            'data-q="How do you vet the pros">How do you vet the pros?</button>',
        '</div>',
      '</div>',
      '<div class="takeover-result-followups">',
        '<button type="button" class="btn btn-ghost" data-takeover-ask-another>Ask another question</button>',
      '</div>'
    ].join("");
  }

  // ===== OFF_TOPIC VARIANT =====
  function renderOffTopicMarkup(entry) {
    const wrapper = entry.answer
      ? '<p class="takeover-answer">' + esc(entry.answer) + "</p>"
      : "";
    const userQuery = (loadTakeoverEntry(currentTakeoverId()) || {}).query || "";
    const safeQ = userQuery
      ? '<p class="takeover-offtopic-query">For "<em>' + esc(userQuery) + '</em>", you\'d want a different resource.</p>'
      : "";
    return [
      '<h1 class="takeover-result-headline">I only know landscaping in Crystal Lake &amp; McHenry County.</h1>',
      wrapper,
      '<div class="takeover-card">',
        safeQ,
        '<ul class="takeover-offtopic-list">',
          '<li>Plumbing — try a local plumbing service.</li>',
          '<li>Roofing — try a local roofer.</li>',
          '<li>Other home services — Angi or Nextdoor are decent starting points.</li>',
        '</ul>',
        '<p>Or ask me about something landscaping-related:</p>',
        '<div class="takeover-offtopic-suggestions">',
          '<button type="button" class="takeover-example" data-q="What plants grow in shade?">"What plants grow in shade?"</button>',
          '<button type="button" class="takeover-example" data-q="How much is mowing?">"How much is mowing?"</button>',
          '<button type="button" class="takeover-example" data-q="I need help with my yard">"I need help with my yard"</button>',
        '</div>',
      '</div>',
      '<div class="takeover-result-followups">',
        '<button type="button" class="btn btn-ghost" data-takeover-ask-another>Ask landscaping question</button>',
        '<a class="btn btn-outline" href="' + pathPrefix() + '" data-takeover-exit>Go home</a>',
      '</div>'
    ].join("");
  }

  // ===== AMBIGUOUS VARIANT =====
  // Default 3 disambiguation options if the bot's value isn't in our table.
  function ambiguousOptionsFor(value) {
    const v = (value || "").toLowerCase();
    const known = {
      patio: [
        { intent: "pro_search", value: "hardscape", icon: "🪨", title: "Find a pro to build a patio",      sub: "I'll match you with a hardscaping landscaper" },
        { intent: "cost",       value: "paver_patio", icon: "💰", title: "Get a cost estimate for a patio", sub: "I'll show you typical patio prices" },
        { intent: "plant",      value: "shade",     icon: "🌿", title: "Plant ideas around a patio",       sub: "I'll show plants that work near patios" }
      ],
      lawn: [
        { intent: "pro_search", value: "lawn_care", icon: "🌱", title: "Find a lawn-care pro",           sub: "I'll line up local mowing & lawn pros" },
        { intent: "cost",       value: "mowing_weekly", icon: "💰", title: "Get a mowing price",         sub: "I'll show typical Crystal Lake mowing rates" },
        { intent: "general",    value: "watering", icon: "💧", title: "Lawn watering rules",            sub: "I'll show the city watering schedule" }
      ],
      tree: [
        { intent: "pro_search", value: "tree_shrub", icon: "🌳", title: "Find a tree pro",                sub: "Pruning, removal, planting" },
        { intent: "cost",       value: "tree_removal", icon: "💰", title: "Tree removal cost",            sub: "Typical mature-tree removal pricing" },
        { intent: "plant",      value: "tree",      icon: "🌿", title: "Plant ideas — small trees",      sub: "Native trees that work in our area" }
      ],
      garden: [
        { intent: "pro_search", value: "design_install", icon: "🌷", title: "Find a designer",            sub: "I'll match you with a design pro" },
        { intent: "plant",      value: "native",   icon: "🌿", title: "Native plant ideas",              sub: "Plants that thrive in McHenry County" },
        { intent: "cost",       value: "design_install", icon: "💰", title: "Design + install costs",   sub: "Typical price ranges around here" }
      ]
    };
    return known[v] || [
      { intent: "pro_search", value: "all",   icon: "🔨", title: "Find a pro for this",      sub: "I'll match you with a local landscaper" },
      { intent: "cost",       value: "",      icon: "💰", title: "Get cost ranges",          sub: "Typical Crystal Lake pricing" },
      { intent: "general",    value: "",      icon: "📖", title: "Browse the planting guide", sub: "Plants and ordinances for the area" }
    ];
  }

  function renderAmbiguousMarkup(entry) {
    const value = entry.value || "";
    const opts = ambiguousOptionsFor(value);
    const wrapper = entry.answer
      ? '<p class="takeover-answer">' + esc(entry.answer) + "</p>"
      : "";
    const phrase = value
      ? 'When you said "<em>' + esc(value) + '</em>" — did you mean:'
      : "Did you mean one of these?";
    const cardsHTML = opts.map((o) =>
      '<button type="button" class="takeover-ambig-card" data-takeover-disambiguate ' +
        'data-intent="' + esc(o.intent) + '" data-value="' + esc(o.value) + '" ' +
        'data-q="' + esc(o.title) + '">' +
        '<span class="takeover-ambig-icon" aria-hidden="true">' + o.icon + '</span>' +
        '<span class="takeover-ambig-body">' +
          '<span class="takeover-ambig-title">' + esc(o.title) + '</span>' +
          '<span class="takeover-ambig-sub">' + esc(o.sub) + '</span>' +
        '</span>' +
      '</button>'
    ).join("");
    return [
      '<h1 class="takeover-result-headline">I want to make sure I help you find the right thing.</h1>',
      wrapper,
      '<p class="takeover-ambig-phrase">' + phrase + '</p>',
      '<div class="takeover-ambig-list">' + cardsHTML + '</div>',
      '<div class="takeover-result-followups">',
        '<button type="button" class="btn btn-ghost" data-takeover-ask-another>Ask differently</button>',
      '</div>'
    ].join("");
  }

  function renderProSearchMarkup(entry) {
    const cat = (entry.value || "all").toLowerCase();
    const safe = NAV_CATEGORIES.has(cat) ? cat : "all";
    const c = PRO_SEARCH_CONTENT[safe] || PRO_SEARCH_CONTENT.all;
    const matchHref = pathPrefix() + "/match/step-1";
    const wrapper = entry.answer
      ? '<p class="takeover-answer">' + esc(entry.answer) + "</p>"
      : "";
    const costsHTML = c.costs.map((row) =>
      "<li><strong>" + esc(row.service) + "</strong> — " + esc(row.range) + "</li>"
    ).join("");
    const askHTML = c.ask.map((q) => "<li>" + esc(q) + "</li>").join("");
    return [
      '<h1 class="takeover-result-headline">Let\'s find you a ' +
        esc(c.label) + " pro.</h1>",
      wrapper,
      '<div class="takeover-card">',
        '<h3>' + c.icon + ' ' + esc(capitalize(c.label)) +
          ' projects in McHenry County</h3>',
        '<p>' + esc(c.explainer) + '</p>',
        '<p>It takes about 30 seconds and you\'re under no commitment.</p>',
        '<div class="takeover-card-cta">',
          '<a class="btn btn-primary btn-lg" href="' +
            matchHref + '" data-takeover-match data-cat="' +
            esc(safe) + '">' + esc(c.cta) + ' →</a>',
          '<button type="button" class="btn btn-outline" data-takeover-ask-another>',
            'Ask something else',
          '</button>',
        '</div>',
      '</div>',
      '<div class="takeover-supporting">',
        '<div class="takeover-supporting-block">',
          '<h4>💰 Typical ' + esc(c.label) + ' costs</h4>',
          '<ul>' + costsHTML + '</ul>',
        '</div>',
        '<div class="takeover-supporting-block">',
          '<h4>📋 Questions to ask any ' + esc(c.label) + ' pro</h4>',
          '<ul>' + askHTML + '</ul>',
        '</div>',
      '</div>'
    ].join("");
  }

  function renderFallbackMarkup(entry) {
    const matchHref = pathPrefix() + "/match/step-1";
    const headline = ({
      cost:      "Here's what I know about that price.",
      plant:     "Here's what works in our area.",
      general:   "Here's what I found.",
      process:   "Here's how it works.",
      off_topic: "I only know landscaping in Crystal Lake & McHenry County.",
      ambiguous: "Want to narrow that down?"
    })[entry.intent] || "Here's what I found.";
    const answer = entry.answer
      ? '<p class="takeover-answer">' + esc(entry.answer) + "</p>"
      : '<p class="takeover-answer">I couldn\'t find a precise answer. Try rephrasing or get matched with a pro who can help.</p>';
    return [
      '<h1 class="takeover-result-headline">' + esc(headline) + '</h1>',
      '<div class="takeover-card">',
        answer,
        '<div class="takeover-card-cta">',
          '<button type="button" class="btn btn-outline" data-takeover-ask-another>Ask another question</button>',
          '<a class="btn btn-primary" href="' + matchHref + '" data-takeover-match data-cat="all">Get matched with a pro →</a>',
        '</div>',
      '</div>'
    ].join("");
  }

  function capitalize(s) {
    if (!s || typeof s !== "string") return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function bindTakeoverResultActions(container) {
    $$('[data-takeover-ask-another]', container).forEach((btn) => {
      btn.addEventListener("click", () => {
        history.pushState({ takeoverRoute: true }, "", askEmptyUrl());
        routePage();
        const inp = $("#takeoverInput");
        if (inp) inp.focus();
      });
    });
    $$('[data-takeover-match]', container).forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const cat = a.getAttribute("data-cat");
        if (cat && cat !== "all" && NAV_CATEGORIES.has(cat)) {
          preselectAnswer("projectType", cat);
        }
        navigateMatch(stepUrl(1));
      });
    });
    $$('.takeover-example', container).forEach((btn) => {
      btn.addEventListener("click", () => {
        const q = btn.dataset.q || btn.textContent;
        if (q) submitChatQuery(q);
      });
    });
    // "Share location" banner click — fresh user-gesture call to
    // getCurrentPosition (some browsers require this if a previous
    // call ran inside a now-stale gesture context).
    $$('[data-takeover-share-location]', container).forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Sharing…";
        try {
          const loc = await requestGeolocation();
          saveLocation(loc);
          // Re-fire the same query so the bot now gets the location and
          // the result frames "in your area".
          const id = currentTakeoverId();
          const entry = id ? loadTakeoverEntry(id) : null;
          if (entry && entry.query) {
            submitChatQuery(entry.query);
          }
        } catch (e) {
          btn.disabled = false;
          btn.textContent = "Try again";
          const reason = (e && e.message) || "error";
          if (reason === "denied") {
            btn.textContent = "Blocked — open browser settings";
            btn.disabled = true;
          }
        }
      });
    });
    // Clarification / related-link clicks: skip the bot turn, write a
    // fresh takeover entry for the chosen intent + value, render it.
    $$('[data-takeover-disambiguate]', container).forEach((btn) => {
      btn.addEventListener("click", () => {
        const intent = btn.getAttribute("data-intent") || "general";
        const value  = btn.getAttribute("data-value") || "";
        const phrasing = btn.getAttribute("data-q") || "";
        const qid = genQueryId();
        saveTakeoverEntry(qid, {
          query: phrasing, intent: intent, value: value,
          answer: "", started_at: Date.now(), completed_at: Date.now()
        });
        history.pushState({ takeoverRoute: true }, "", askResultUrl(qid));
        routePage();
      });
    });
  }

  // Inject up-to-3 recent queries into the empty state, ahead of the
  // static examples. Only entries from the current session are shown.
  function renderEmptyRecentQueries() {
    const empty = $("#takeoverEmpty");
    if (!empty) return;
    let recentBlock = $("#takeoverRecent");
    if (recentBlock) recentBlock.remove();   // re-render fresh each visit
    const all = loadAllTakeoverState();
    const entries = Object.keys(all).map((k) => all[k])
      .filter((e) => e && e.query && e.completed_at)
      .sort((a, b) => (b.completed_at || 0) - (a.completed_at || 0));
    const seen = new Set();
    const recent = [];
    for (const e of entries) {
      const q = e.query.trim();
      if (q && !seen.has(q)) { seen.add(q); recent.push(e); }
      if (recent.length >= 3) break;
    }
    if (recent.length === 0) return;
    recentBlock = document.createElement("div");
    recentBlock.id = "takeoverRecent";
    recentBlock.className = "takeover-recent";
    recentBlock.innerHTML =
      '<p class="takeover-recent-label">Pick up where you left off:</p>' +
      '<ul class="takeover-recent-list">' +
      recent.map((e) =>
        '<li><button type="button" class="takeover-example takeover-recent-item" ' +
        'data-q="' + esc(e.query) + '">' +
        '<span class="takeover-recent-icon" aria-hidden="true">↩</span>' +
        '<span class="takeover-recent-text">' + esc(e.query) + '</span>' +
        '</button></li>'
      ).join("") +
      '</ul>';
    // Insert at the top of #takeoverEmpty, before the static examples.
    const sub = empty.querySelector(".takeover-empty-sub");
    if (sub) {
      sub.parentNode.insertBefore(recentBlock, sub);
    } else {
      empty.insertBefore(recentBlock, empty.firstChild);
    }
    // Wire up the buttons (delegated body click won't reach buttons here).
    $$('.takeover-recent-item', recentBlock).forEach((btn) => {
      btn.addEventListener("click", () => {
        const q = btn.dataset.q;
        if (q) submitChatQuery(q);
      });
    });
  }

  function bindTakeoverShell() {
    const form = $("#takeoverForm");
    const input = $("#takeoverInput");
    if (form && input) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const val = (input.value || "").trim();
        if (!val) return;
        input.value = "";
        submitChatQuery(val);
      });
    }
    // Home-page ask bar — triggers a full-screen takeover with results
    const homeForm  = $("#aiAskForm");
    const homeInput = $("#aiAskInput");
    if (homeForm && homeInput) {
      homeForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const val = (homeInput.value || "").trim();
        if (!val) return;
        runHomeSearch(val);
      });
    }
    // Close handlers (back button + show-all + ESC)
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-search-back]")) {
        e.preventDefault();
        clearHomeSearch();
      }
      if (e.target.closest("[data-search-show-all]")) {
        clearHomeSearch();
        const tbl = document.getElementById("pros-table");
        if (tbl) tbl.scrollIntoView({ behavior: "smooth" });
      }
      // "Change" affordance on the results header — wipes stored
      // location and re-runs the search so the prompt fires again.
      const changeBtn = e.target.closest("[data-search-change-loc]");
      if (changeBtn) {
        e.preventDefault();
        try { sessionStorage.removeItem("user_location"); } catch (_) {}
        const lastQuery = document.getElementById("aiAskInput");
        const q = (lastQuery && lastQuery.value) || "";
        if (q) {
          // Restore the home view briefly, then re-run with no stored location.
          clearHomeSearch();
          setTimeout(() => runHomeSearch(q), 60);
        }
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("home-search-active")) {
        clearHomeSearch();
      }
    });
    $$('.takeover-example').forEach((btn) => {
      btn.addEventListener("click", () => {
        const q = btn.dataset.q || btn.textContent;
        submitChatQuery(q);
      });
    });
    const retry = $("#takeoverRetry");
    if (retry) retry.addEventListener("click", () => {
      const id = currentTakeoverId();
      const entry = id ? loadTakeoverEntry(id) : null;
      if (entry && entry.query) submitChatQuery(entry.query);
      else { history.pushState({}, "", askEmptyUrl()); routePage(); }
    });
  }

  // Single entry point used by all chat surfaces (inline #chatShell,
  // takeover-input, future widgets) on /landscaping. Starts the takeover
  // immediately, resolves geolocation if the query needs it, then fires
  // /chat. The browser permission prompt may appear during stage-1
  // loading — that's fine, the user is busy answering it.
  async function submitChatQuery(query) {
    if (!query || !query.trim()) return;
    startTakeover(query);
    let location = null;
    try {
      location = await resolveLocationForQuery(query);
    } catch (_) { /* swallow */ }
    // Stash on the current takeover entry so the renderer can show the pill.
    if (location) {
      const id = currentTakeoverId();
      const entry = id ? loadTakeoverEntry(id) : null;
      if (entry) {
        entry.location = location;
        saveTakeoverEntry(id, entry);
      }
    }
    const body = {
      message: query,
      accountid: ACCOUNT_ID,
      session_id: state.sessionId,
      kb_type: "client",
      router_mode: true
    };
    if (location) body.location = location;
    fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
      .then((r) => r.json())
      .then((data) => {
        const ans = data.answer || data.response || "";
        ingestBotReply(ans);
      })
      .catch(() => failTakeover());
  }

  const LandscapingNav = {
    scroll: navScroll,
    filterServices: navFilterServices,
    highlightCost: navHighlightCost,
    openFAQ: navOpenFAQ,
    startMatch: navStartMatch,
    goto: navGoto,
    applyDirective: navApplyDirective,
    parseDirectives: navParseDirectives,
    // Takeover surface — used by the inline chat, takeover input, and
    // any chatbot widget that wants to drive the page through full-screen
    // result takeovers instead of inline page tweaks.
    startTakeover: startTakeover,
    completeTakeover: completeTakeover,
    failTakeover: failTakeover,
    submitQuery: submitChatQuery,
    ingestBotReply: ingestBotReply
  };
  window.LandscapingNav = LandscapingNav;

  // ==========================================================================
  // Match flow — routing, state persistence, transitions
  // ==========================================================================
  const QUESTION_STEPS = 6;
  const FADE_MS = 200;
  const MATCH_STORAGE_KEY = "landscaping_match_state";
  const PATHNAME_STEP_RE = /^\/(landscaping|landscape)\/match\/step-(\d)\/?$/;
  const PATHNAME_DONE_RE = /^\/(landscaping|landscape)\/match\/done\/?$/;

  function pathPrefix() {
    return window.location.pathname.indexOf("/landscape/") === 0 ||
           window.location.pathname === "/landscape"
      ? "/landscape" : "/landscaping";
  }
  function stepUrl(n)   { return pathPrefix() + "/match/step-" + n; }
  function doneUrl()    { return pathPrefix() + "/match/done"; }
  function landingUrl() { return pathPrefix(); }

  // ---- sessionStorage persistence ----
  function loadMatchState() {
    try {
      const raw = sessionStorage.getItem(MATCH_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        if (saved.answers) Object.assign(state.answers, saved.answers);
        state.completed = !!saved.completed;
        state.editing = !!saved.editing;
      }
    } catch (_) { /* corrupt state — ignore */ }
  }
  function saveMatchState() {
    try {
      sessionStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify({
        answers: state.answers,
        completed: !!state.completed,
        editing: !!state.editing
      }));
    } catch (_) {}
  }
  function clearMatchState() {
    try { sessionStorage.removeItem(MATCH_STORAGE_KEY); } catch (_) {}
    state.answers = {
      projectType: null, propertySize: null, budget: null,
      timeline: null, zip: "", name: "", email: "", phone: "", notes: ""
    };
    state.matches = [];
    state.completed = false;
    state.editing = false;
    $$(".option").forEach((o) => o.classList.remove("selected"));
    ["zip", "name", "email", "phone", "notes"].forEach((id) => {
      const el = $("#" + id);
      if (el) el.value = "";
    });
  }

  // ---- Routing ----
  function parseRoute(pathname) {
    const stepM = pathname.match(PATHNAME_STEP_RE);
    if (stepM) {
      const n = Number(stepM[2]);
      if (n >= 1 && n <= QUESTION_STEPS) return { kind: "step", step: n - 1 };
      return { kind: "landing" };
    }
    if (PATHNAME_DONE_RE.test(pathname)) return { kind: "done" };
    const askResultM = pathname.match(PATHNAME_ASK_RESULT_RE);
    if (askResultM) return { kind: "ask-result", id: askResultM[2] };
    if (PATHNAME_ASK_EMPTY_RE.test(pathname)) return { kind: "ask-empty" };
    return { kind: "landing" };
  }

  // Wizard retired. "Get matched" CTAs (still scattered across the page)
  // now mean "go to the top of the home page" — that's where the AI
  // search bar lives, which is the new matching flow. If the user is
  // already on /landscaping (or any in-app SPA path), smooth-scroll to
  // the top and exit any takeover/article modes. If they're on a
  // separate static page (e.g. /landscape/guide), let the browser
  // navigate normally to the absolute /landscaping URL.
  function navigateMatch(url, _opts) {
    const path = window.location.pathname;
    const onHome = path === "/landscapers" || path === "/landscapers/" ||
                   path === "/landscaping" || path === "/landscaping/" ||
                   path === "/landscape"   || path === "/landscape/";
    // Exit any in-app modes (article view, takeover, search results)
    // so the hero is what the user lands on at the top.
    document.body.classList.remove("article-mode", "takeover-mode", "home-search-active");
    const stage = document.getElementById("article-stage");
    if (stage) { stage.hidden = true; stage.innerHTML = ""; }
    const searchResults = document.getElementById("searchResults");
    if (searchResults) searchResults.hidden = true;
    if (onHome) {
      // Smooth-scroll to the top of the page (the hero with the AI
      // search bar). Don't change the URL — already on home.
      try {
        window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
      } catch (_) {
        window.scrollTo(0, 0);
      }
      // Normalize deep-link paths to the canonical /landscapers home so
      // a refresh stays put.
      if (path !== "/landscapers") {
        try { history.replaceState({}, "", "/landscapers"); } catch (_) {}
      }
      return;
    }
    // Off-home (e.g., /landscapers/<slug>/ profile pages, /guide pages):
    // navigate to the canonical home.
    window.location.href = (url && url.indexOf("/match") === -1) ? url : "/landscapers";
  }

  // routePage owns the body classes for landing / match / takeover modes
  // and renders the right surface for the current URL.
  function routePage() {
    const route = parseRoute(window.location.pathname);
    const body = document.body;
    const wasTakeoverMode = body.classList.contains("takeover-mode");
    const wasMatchMode    = body.classList.contains("match-mode");
    const willBeTakeover  = (route.kind === "ask-result" || route.kind === "ask-empty");
    const willBeMatch     = (route.kind === "step" || route.kind === "done");

    // Article stage routes — /landscaping/services + /services/<slug>
    const articleSlug = articleSlugFromPath(window.location.pathname);
    if (articleSlug !== false) {
      body.classList.remove("match-mode", "takeover-mode");
      const matchFlow = $("#match-flow");
      if (matchFlow) { matchFlow.hidden = true; matchFlow.setAttribute("aria-hidden", "true"); }
      const askFlow = $("#takeover-flow");
      if (askFlow) { askFlow.hidden = true; askFlow.setAttribute("aria-hidden", "true"); }
      showArticleStage(articleSlug);
      return;
    } else if (body.classList.contains("article-mode")) {
      hideArticleStage();
    }

    // Hide both flow containers first; routePage will show the right one.
    if (willBeTakeover) {
      body.classList.add("takeover-mode");
      body.classList.remove("match-mode");
      const flow = $("#takeover-flow");
      if (flow) { flow.hidden = false; flow.setAttribute("aria-hidden", "false"); }
      const matchFlow = $("#match-flow");
      if (matchFlow) { matchFlow.hidden = true; matchFlow.setAttribute("aria-hidden", "true"); }
      return renderTakeoverForRoute(route);
    }
    if (willBeMatch) {
      // Wizard retired — collapse step/done routes to landing.
      body.classList.remove("match-mode");
      body.classList.remove("takeover-mode");
      const flow = $("#match-flow");
      if (flow) { flow.hidden = true; flow.setAttribute("aria-hidden", "true"); }
      const askFlow = $("#takeover-flow");
      if (askFlow) { askFlow.hidden = true; askFlow.setAttribute("aria-hidden", "true"); }
      history.replaceState({}, "", "/landscaping");
      return;
    }
    // Landing.
    body.classList.remove("match-mode");
    body.classList.remove("takeover-mode");
    const matchFlow = $("#match-flow");
    if (matchFlow) { matchFlow.hidden = true; matchFlow.setAttribute("aria-hidden", "true"); }
    const askFlow = $("#takeover-flow");
    if (askFlow) { askFlow.hidden = true; askFlow.setAttribute("aria-hidden", "true"); }
  }

  function renderTakeoverForRoute(route) {
    if (route.kind === "ask-empty") {
      clearStageTimers();
      renderEmptyRecentQueries();
      showTakeoverPanel("empty");
      return;
    }
    // ask-result
    const entry = loadTakeoverEntry(route.id);
    if (!entry) {
      // Refresh on /ask/result/:id without prior state — show empty so
      // the user can try again.
      clearStageTimers();
      showTakeoverPanel("empty");
      return;
    }
    if (entry.completed_at) {
      // Completed already — just render the result view directly.
      clearStageTimers();
      renderTakeoverResult();
      return;
    }
    // In progress: show loading and wait for completeTakeover.
    startTakeoverLoading();
  }

  function routeMatch() { routePage(); }   // legacy alias for backwards compat

  function routeMatchInternal(route /*, wasMatchMode */) {
    const card = $(".match-flow-card");
    if (route.kind === "done") {
      if (!state.completed || !hasAnswers()) {
        transitionTo(card, () => showEmptyView(card));
      } else {
        transitionTo(card, () => showDoneView(card));
      }
      return;
    }
    if (route.kind === "step") {
      if (state.completed && !state.editing) {
        transitionTo(card, () => showWarningView(card));
      } else {
        transitionTo(card, () => showStepView(card, route.step));
      }
    }
  }

  function hasAnswers() {
    const a = state.answers;
    return !!a.projectType && !!a.email;
  }

  // ---- View transitions: 200ms fade-out → swap → 200ms fade-in ----
  function transitionTo(card, showFn) {
    if (!card) { showFn(); return; }
    const visible = card.querySelector(".fade-in");
    if (visible) {
      visible.classList.remove("fade-in");
      setTimeout(() => {
        visible.hidden = true;
        showFn();
      }, FADE_MS);
    } else {
      showFn();
    }
  }

  function hideAllPanels(card) {
    $$(".match-step, .match-done, .match-empty, .match-warning", card)
      .forEach((el) => { el.hidden = true; el.classList.remove("fade-in"); });
  }

  function fadeInPanel(el) {
    if (!el) return;
    el.hidden = false;
    void el.offsetWidth;   // force reflow so the opacity transition runs
    el.classList.add("fade-in");
  }

  function showStepView(card, stepIdx) {
    card.classList.remove("done-mode", "empty-mode", "warning-mode");
    hideAllPanels(card);
    state.step = stepIdx;
    restoreAnswerForStep(stepIdx);
    fadeInPanel(card.querySelector('.match-step[data-step="' + stepIdx + '"]'));
    renderProgress();
    updateNav();
    updateLiveCount();
    resetScroll();
    setTimeout(() => {
      const el = card.querySelector('.match-step[data-step="' + stepIdx + '"]');
      const focusable = el && el.querySelector("input, textarea, .option");
      if (focusable && typeof focusable.focus === "function") {
        try { focusable.focus({ preventScroll: true }); }
        catch (_) { focusable.focus(); }
      }
    }, FADE_MS + 30);
  }

  function showDoneView(card) {
    card.classList.add("done-mode");
    card.classList.remove("empty-mode", "warning-mode");
    hideAllPanels(card);
    computeMatches();
    saveMatchState();
    renderResults();
    fadeInPanel($("#matchDone"));
    resetScroll();
  }

  function showEmptyView(card) {
    card.classList.add("empty-mode");
    card.classList.remove("done-mode", "warning-mode");
    hideAllPanels(card);
    fadeInPanel($("#matchEmpty"));
    resetScroll();
  }

  function showWarningView(card) {
    card.classList.add("warning-mode");
    card.classList.remove("done-mode", "empty-mode");
    hideAllPanels(card);
    fadeInPanel($("#matchWarning"));
    resetScroll();
  }

  function resetScroll() {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function restoreAnswerForStep(stepIdx) {
    const a = state.answers;
    const optionMap = {
      0: { q: "projectType",  val: a.projectType  },
      1: { q: "propertySize", val: a.propertySize },
      2: { q: "budget",       val: a.budget       },
      3: { q: "timeline",     val: a.timeline     }
    };
    if (optionMap[stepIdx]) {
      const { q, val } = optionMap[stepIdx];
      const group = document.querySelector('.options[data-question="' + q + '"]');
      if (group) {
        $$(".option", group).forEach((o) => {
          o.classList.toggle("selected", val !== null && o.dataset.value === val);
        });
      }
    } else if (stepIdx === 4) {
      const zip = $("#zip");
      if (zip) zip.value = a.zip || "";
    } else if (stepIdx === 5) {
      ["name", "email", "phone", "notes"].forEach((id) => {
        const el = $("#" + id);
        if (el) el.value = a[id] || "";
      });
    }
  }

  // ---- Progress dots / Next-Back nav ----
  function renderProgress() {
    const bar = $("#progressBar");
    if (!bar) return;
    bar.innerHTML = "";
    for (let i = 0; i < QUESTION_STEPS; i++) {
      const dot = document.createElement("span");
      if (i < state.step) dot.classList.add("filled");
      if (i === state.step) { dot.classList.add("filled"); dot.classList.add("current"); }
      bar.appendChild(dot);
    }
  }

  function currentStepValid() {
    const a = state.answers;
    switch (state.step) {
      case 0: return !!a.projectType;
      case 1: return !!a.propertySize;
      case 2: return !!a.budget;
      case 3: return !!a.timeline;
      case 4: return /^\d{5}$/.test(a.zip);
      case 5: return a.name.trim().length > 0 &&
                     /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email);
      default: return true;
    }
  }

  function updateNav() {
    const back = $("#backBtn");
    const next = $("#nextBtn");
    if (!back || !next) return;
    back.hidden = state.step === 0;
    next.disabled = !currentStepValid();
    next.textContent = state.step === QUESTION_STEPS - 1
      ? (state.editing ? "Save and continue →" : "See my matches →")
      : "Next →";
  }

  function liveMatchCount() {
    const a = state.answers;
    if (!a.projectType) return null;
    return LANDSCAPERS.filter((pro) => {
      if (!pro.services.includes(a.projectType)) return false;
      if (a.propertySize && !pro.sizes.includes(a.propertySize)) return false;
      if (a.budget && a.budget !== "unsure" && !pro.budgets.includes(a.budget)) return false;
      if (a.timeline && !pro.timelines.includes(a.timeline)) return false;
      return true;
    }).length;
  }

  function updateLiveCount() {
    const el = $("#liveCount");
    if (!el) return;
    if (state.step === 0) { el.textContent = ""; return; }
    const n = liveMatchCount();
    if (n === null) { el.textContent = ""; return; }
    el.textContent = n === 0
      ? "No pros match yet — adjust your answers or reach out and we'll expand our directory."
      : n + " pro" + (n === 1 ? "" : "s") + " match so far.";
  }

  // ---- Bindings ----
  function bindMatchFlow() {
    $$(".options").forEach((group) => {
      const question = group.dataset.question;
      group.addEventListener("click", (e) => {
        const btn = e.target.closest(".option");
        if (!btn) return;
        $$(".option", group).forEach((o) => o.classList.remove("selected"));
        btn.classList.add("selected");
        state.answers[question] = btn.dataset.value;
        saveMatchState();
        updateNav();
        updateLiveCount();
      });
    });

    const zip = $("#zip");
    if (zip) {
      zip.addEventListener("input", (e) => {
        const cleaned = e.target.value.replace(/\D/g, "").slice(0, 5);
        e.target.value = cleaned;
        state.answers.zip = cleaned;
        saveMatchState();
        const wrap = zip.closest(".field");
        if (wrap) wrap.classList.toggle(
          "invalid", cleaned.length > 0 && !/^\d{5}$/.test(cleaned)
        );
        updateNav();
      });
    }

    ["name", "email", "phone", "notes"].forEach((field) => {
      const el = $("#" + field);
      if (!el) return;
      el.addEventListener("input", (e) => {
        state.answers[field] = e.target.value;
        saveMatchState();
        const wrap = el.closest(".field");
        if (wrap) {
          if (field === "email") {
            const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value);
            wrap.classList.toggle("invalid", e.target.value.length > 0 && !valid);
          } else if (field === "name") {
            wrap.classList.toggle("invalid", false);
          }
        }
        updateNav();
      });
    });

    const backBtn = $("#backBtn");
    if (backBtn) backBtn.addEventListener("click", () => {
      // Mirror browser back — keeps the history stack sane and lets the
      // user's back button do the same thing as our in-flow ← Back.
      // If the user landed here directly (no prior entry), fall back to
      // pushing the previous URL so the button still works.
      if (window.history.length > 1) {
        window.history.back();
      } else {
        navigateMatch(state.step === 0 ? landingUrl() : stepUrl(state.step));
      }
    });

    const nextBtn = $("#nextBtn");
    if (nextBtn) nextBtn.addEventListener("click", () => {
      if (!currentStepValid()) return;
      if (state.step === QUESTION_STEPS - 1) {
        // Final step — record completion and go to /done.
        state.completed = true;
        state.editing = false;
        saveMatchState();
        navigateMatch(doneUrl());
        return;
      }
      navigateMatch(stepUrl(state.step + 2));   // 0-indexed step → next URL number
    });

    const modalClose = $("#modalClose");
    if (modalClose) modalClose.addEventListener("click", () => {
      $("#thanksModal").classList.remove("show");
    });

    const doneUpdate = $("#doneUpdate");
    if (doneUpdate) doneUpdate.addEventListener("click", () => {
      // Open step-6 in edit mode without losing completion state.
      state.editing = true;
      saveMatchState();
      navigateMatch(stepUrl(QUESTION_STEPS));
      // After navigate, focus the notes textarea.
      setTimeout(() => {
        const notes = $("#notes");
        if (notes) {
          try { notes.focus({ preventScroll: true }); } catch (_) { notes.focus(); }
        }
      }, FADE_MS + 60);
    });

    const restartBtn = $("#restartBtn");
    if (restartBtn) restartBtn.addEventListener("click", () => {
      clearMatchState();
      navigateMatch(stepUrl(1));
    });

    // Delegate clicks on all match-flow-related anchors so SPA navigation
    // happens without a full page load.
    document.body.addEventListener("click", (e) => {
      const a = e.target.closest(
        "a[data-match-start], a[data-match-exit], a[data-match-internal], a[data-takeover-exit]"
      );
      if (!a) return;
      // Honor open-in-new-tab / modifier-click defaults
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigateMatch(a.getAttribute("href"));
    });

    window.addEventListener("popstate", routePage);
  }

  // ==========================================================================
  // Matching
  // ==========================================================================
  function scoreLandscaper(pro, a) {
    if (!pro.services.includes(a.projectType)) return 0;
    let score = 3;
    if (pro.zips.includes(a.zip)) score += 3;
    if (pro.sizes.includes(a.propertySize)) score += 2;
    if (a.budget === "unsure" || pro.budgets.includes(a.budget)) score += 2;
    if (pro.timelines.includes(a.timeline)) score += 2;
    score += (pro.rating - 4.5) * 2;
    return score;
  }

  function computeMatches() {
    const a = state.answers;
    state.matches = LANDSCAPERS
      .map((pro) => ({ pro, score: scoreLandscaper(pro, a) }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 3);
  }

  function renderResults() {
    const list = $("#matchesList");
    const none = $("#noMatches");
    const lede = $("#matchDoneLede");
    if (!list) return;
    list.innerHTML = "";

    if (state.matches.length === 0) {
      list.hidden = true;
      if (none) none.hidden = false;
      if (lede) {
        lede.innerHTML = "We don't have a perfect local match yet — we'll reach out " +
          "when one is available. Hold tight.";
      }
      return;
    }
    list.hidden = false;
    if (none) none.hidden = true;
    if (lede) {
      const projectLabel = serviceLabel(state.answers.projectType || "").toLowerCase();
      const subjectLabel = projectLabel || "project";
      lede.innerHTML = "Three local pros will reach out within <strong>24–48 hours</strong> " +
        "about your " + esc(subjectLabel) + ".";
    }

    state.matches.forEach(({ pro, score }) => {
      list.appendChild(buildMatchCard(pro, score, true));
    });

    $$(".contact-btn", list).forEach((btn) => {
      btn.addEventListener("click", () => submitLead(btn.dataset.pro));
    });
    $$(".view-profile-btn", list).forEach((btn) => {
      btn.addEventListener("click", () => openProProfile(btn.dataset.pro));
    });
  }

  function buildMatchCard(pro, score, showCompare) {
    const el = document.createElement("div");
    el.className = "match";
    const initials = pro.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const tags = pro.services.slice(0, 3)
      .map((s) => `<span class="tag">${serviceLabel(s)}</span>`).join("");

    const profile = pro.profile || null;
    const chips = [];
    if (profile) {
      const pricing = profile.pricing || {};
      if (pricing.free_estimates === true) {
        chips.push(`<span class="chip chip-positive">✓ Free estimates</span>`);
      }
      const creds = profile.credentials || {};
      const certCount = Array.isArray(creds.certifications) ? creds.certifications.length : 0;
      if ((creds.licensed && String(creds.licensed).trim()) || certCount > 0 || (creds.insured && String(creds.insured).trim())) {
        const credLabel = certCount > 0
          ? `🏅 ${esc(creds.certifications[0])}`
          : (creds.licensed ? `🏅 Licensed` : `🛡 Insured`);
        chips.push(`<span class="chip chip-cred">${credLabel}</span>`);
      }
    }
    const chipsHtml = chips.length
      ? `<div class="chips">${chips.join("")}</div>` : "";

    const whenToUse = (profile && (profile.when_to_use || "").trim()) || "";
    const whenLine = whenToUse
      ? `<p class="when-to-use">${esc(whenToUse)}</p>` : "";

    let themesHtml = "";
    if (profile && Array.isArray(profile.review_themes) && profile.review_themes.length) {
      const top = profile.review_themes.slice(0, 3)
        .map((t) => esc((t && t.theme) || "")).filter(Boolean);
      if (top.length) {
        themesHtml = `<div class="review-themes"><span class="themes-label">Customers say:</span> ${top.join(" · ")}</div>`;
      }
    }

    const phoneClean = (pro.phone || "").replace(/\D/g, "");
    const websiteUrl = pro.website || "";
    const websiteLink = websiteUrl
      ? `<a href="${esc(websiteUrl)}" target="_blank" rel="noopener" class="contact-link">🌐 Website</a>` : "";
    const phoneLink = pro.phone
      ? `<a href="tel:${phoneClean}" class="contact-link">📞 ${esc(pro.phone)}</a>` : "";
    const contactRow = (websiteLink || phoneLink)
      ? `<div class="contact-row">${phoneLink}${websiteLink}</div>` : "";

    el.innerHTML = `
      <div class="avatar" aria-hidden="true">${initials}</div>
      <div class="body">
        <h4>${esc(pro.name)}</h4>
        <div class="meta">${esc(pro.city)} · ★ ${pro.rating.toFixed(1)} (${pro.reviews})</div>
        <div class="tags">${tags}</div>
        ${chipsHtml}
        ${whenLine || `<p>${esc(pro.blurb)}</p>`}
        ${themesHtml}
        ${contactRow}
        <div class="actions">
          <button class="btn btn-primary btn-sm contact-btn" data-pro="${pro.id}">Request a quote</button>
          <a href="tel:${phoneClean}" class="btn btn-outline btn-sm">Call</a>
          ${profile ? `<button class="btn btn-ghost btn-sm view-profile-btn" data-pro="${pro.id}">View profile →</button>` : ""}
          ${showCompare ? `<label class="compare-toggle"><input type="checkbox" data-compare="${pro.id}"> Compare</label>` : ""}
        </div>
        ${score != null ? `<div class="score">Match score: ${score.toFixed(1)}</div>` : ""}
      </div>
    `;
    return el;
  }

  // ==========================================================================
  // Full pro profile slide-over panel
  // ==========================================================================
  // ==========================================================================
  // Pro profile slide-over — at-a-glance card + 4-tab details
  // ==========================================================================
  let _currentPro = null;
  let _profileTab = "reviews";

  function openProProfile(proId) {
    const pro = LANDSCAPERS.find((p) => p.id === proId);
    if (!pro) return;
    const profile = pro.profile || {};
    const reviews = pro.verbatim_reviews || [];
    const overlay = ensureProfileOverlay();

    _currentPro = pro;
    _profileTab = "reviews";

    overlay.innerHTML = renderProfileHTML(pro, profile, reviews);
    overlay.classList.add("show");
    document.body.classList.add("profile-open");

    overlay.querySelector("[data-profile-close]").addEventListener("click", closeProProfile);
    overlay.querySelector(".profile-backdrop").addEventListener("click", closeProProfile);
    overlay.querySelectorAll(".profile-tab").forEach((btn) => {
      btn.addEventListener("click", () => setProfileTab(btn.dataset.tab));
    });
    overlay.querySelectorAll("[data-action='contact']").forEach((btn) => {
      btn.addEventListener("click", () => openContactModal(pro.id));
    });

    document.addEventListener("keydown", _profileEscHandler);
    setProfileTab("reviews");
  }

  function setProfileTab(tab) {
    if (!_currentPro) return;
    _profileTab = tab;
    const ov = document.querySelector(".profile-overlay");
    if (!ov) return;
    ov.querySelectorAll(".profile-tab").forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    const target = ov.querySelector("#profileTabContent");
    if (!target) return;
    const profile = _currentPro.profile || {};
    const reviews = _currentPro.verbatim_reviews || [];
    if (tab === "reviews")  target.innerHTML = renderTabReviews(_currentPro, profile, reviews);
    if (tab === "pricing")  target.innerHTML = renderTabPricing(_currentPro, profile);
    if (tab === "warranty") target.innerHTML = renderTabWarranty(_currentPro, profile);
    if (tab === "concerns") target.innerHTML = renderTabConcerns(_currentPro, profile);
    target.scrollTop = 0;
  }

  function _profileEscHandler(e) {
    if (e.key === "Escape") closeProProfile();
  }

  function closeProProfile() {
    const ov = document.querySelector(".profile-overlay");
    if (!ov) return;
    ov.classList.remove("show");
    document.body.classList.remove("profile-open");
    document.removeEventListener("keydown", _profileEscHandler);
    _currentPro = null;
  }

  function ensureProfileOverlay() {
    let ov = document.querySelector(".profile-overlay");
    if (ov) return ov;
    ov = document.createElement("div");
    ov.className = "profile-overlay";
    document.body.appendChild(ov);
    return ov;
  }


  function parseYearsNum(text) {
    if (!text) return 0;
    const s = String(text);
    const yearMatch = s.match(/(?:19|20)\d{2}/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0], 10);
      const yrs = new Date().getFullYear() - year;
      if (yrs > 0 && yrs < 200) return yrs;
    }
    const yrsOnly = s.match(/(\d{1,3})\s*\+?\s*years?/i);
    if (yrsOnly) return parseInt(yrsOnly[1], 10);
    return 0;
  }

  function formatYearsInBusiness(text) {
    const n = parseYearsNum(text);
    if (n) return `${n}+ years in business`;
    return "";
  }

  // ----- Why-hire-them composer (deterministic, plain-English) -----

  // Plain-English service descriptors (5-year-old test).
  // "They take care of {thing}." → reads like a real person explaining.
  const SERVICE_DESCRIPTORS = {
    lawn_care:      "lawns",
    design_install: "garden design",
    hardscape:      "patios, walkways, and walls",
    tree_shrub:     "trees and shrubs",
    irrigation:     "sprinklers and drainage",
    seasonal:       "yard cleanups",
  };

  // Phrases banned from generated copy. If a theme matches any of these
  // (case-insensitive), drop it before joining into the second sentence.
  const FILLER_PATTERNS = [
    /^(professional|professionalism)\b/i,
    /^(amazing|excellent|great|outstanding|wonderful)$/i,
    // "high-quality / high quality" anywhere — the LLM tacks it onto generic
    // nouns ("work", "installation", "results") which conveys nothing.
    /\bhigh.?quality\b/i,
    /^solid choice$/i,
    /^great option$/i,
    /\bcustomer satisfaction\b/i,
    /\bsatisfaction guaranteed\b/i,
    /\bmakes? them a (strong|great|solid|good)\b/i,
    /\blooking to enhance\b/i,
    /\bstrong choice for\b/i,
  ];
  function isFiller(s) {
    const t = String(s || "").trim();
    return !t || FILLER_PATTERNS.some((re) => re.test(t));
  }

  // Lowercase the first character unless the first word is an acronym.
  function inlineLowercase(s) {
    if (!s) return s;
    const firstWord = s.split(/\s+/)[0] || "";
    if (firstWord.length > 1 && firstWord === firstWord.toUpperCase()) return s;
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  function composeWhyHire(pro, profile) {
    if (!pro) return "";
    const services = pro.services || [];
    const yearsNum = parseYearsNum((profile || {}).years_in_business);
    const reviewCount = pro.reviews || 0;

    // Sentence 1: plain-English what-they-do
    // 1 service → "They take care of {thing}."
    // 2-3 services → "They handle most landscaping jobs."
    // 4+ → "They're a local landscaping pro."
    let s1;
    if (services.length === 1) {
      const thing = SERVICE_DESCRIPTORS[services[0]];
      s1 = thing ? `They take care of ${thing}.` : "They're a local landscaping pro.";
    } else if (services.length >= 2 && services.length <= 3) {
      s1 = "They handle most landscaping jobs.";
    } else {
      s1 = "They're a local landscaping pro.";
    }

    // Sentence 2: experience (years) — only if 5+ years
    let s2 = "";
    if (yearsNum >= 5) {
      s2 = `They've been doing this for ${yearsNum}+ years.`;
    } else if (yearsNum > 0) {
      s2 = `Newer business — ${yearsNum} year${yearsNum === 1 ? "" : "s"} in.`;
    }

    // Sentence 3: customer praise — only if 25+ reviews
    let s3 = "";
    if (reviewCount >= 25) {
      const themes = ((profile || {}).review_themes || [])
        .filter((t) => t && t.theme && t.polarity !== "caution")
        .map((t) => String(t.theme).trim())
        .filter((t) => t && !isFiller(t))
        .slice(0, 3)
        .map(inlineLowercase);
      if (themes.length >= 2) {
        const joined = themes.length === 3
          ? `${themes[0]}, ${themes[1]}, and ${themes[2]}`
          : themes.join(" and ");
        s3 = `Customers love their ${joined}.`;
      }
    }

    return [s1, s2, s3].filter(Boolean).join(" ");
  }

  // ----- Richer prelude composers (use real LLM-extracted data) -----

  // "About them" — concrete facts only. Refuses to generate filler if
  // the underlying data is sparse.
  function composeAboutThem(pro, profile) {
    if (!pro) return "";
    const profileObj = profile || {};

    // No website at all → say so honestly
    if (!pro.website && !profileObj.services_offered && !profileObj.years_in_business) {
      return `${pro.name} doesn't have a website on file. We can't say more about them than what's in their Google listing.`;
    }

    // Website present but extraction was thin (no services_offered AND
    // no years AND no service area) → also be honest
    const services_offered = (profileObj.services_offered || []).filter((s) => s && String(s).trim());
    const yearsNum = parseYearsNum(profileObj.years_in_business);
    const serviceArea = (profileObj.service_area || "").trim();

    if (!services_offered.length && !yearsNum && !serviceArea) {
      return `${pro.name}'s website didn't have detailed information when we checked. Reach out to them directly for specifics.`;
    }

    // We have at least some real signal. Build a fact-anchored description.
    const services = pro.services || [];
    const reviewCount = pro.reviews || 0;
    const creds = profileObj.credentials || {};
    const certs = (creds.certifications || [])
      .filter((c) => c && String(c).trim().length >= 5)
      .slice(0, 2);

    // Sentence 1 — what they do, anchored in actual services_offered
    let s1;
    if (services_offered.length >= 3) {
      // Use the LLM's actual extracted service list
      const top = services_offered.slice(0, 3).join(", ");
      s1 = `${pro.name} offers ${top}${services_offered.length > 3 ? ", and more" : ""}.`;
    } else if (services_offered.length >= 1) {
      s1 = `${pro.name} offers ${services_offered.join(" and ")}.`;
    } else if (services.length === 1) {
      const thing = SERVICE_DESCRIPTORS[services[0]];
      s1 = `${pro.name} ${thing ? `takes care of ${thing}` : "is a local landscaping pro"}.`;
    } else if (services.length >= 2 && services.length <= 3) {
      s1 = `${pro.name} handles multiple landscaping services.`;
    } else {
      s1 = `${pro.name} is a local landscaping business.`;
    }

    // Sentence 2 — years (only if present)
    let s2 = "";
    if (yearsNum >= 5)      s2 = `They've been in business for ${yearsNum}+ years.`;
    else if (yearsNum > 0)  s2 = `Newer business — ${yearsNum} year${yearsNum === 1 ? "" : "s"} in operation.`;

    // Sentence 3 — credentials (only when concrete)
    let s3 = "";
    if (certs.length) {
      s3 = `Team credentials: ${certs.join(", ")}.`;
    } else if (creds.licensed && creds.insured) {
      s3 = `They are licensed and insured.`;
    } else if (creds.licensed) {
      s3 = `They are licensed.`;
    }

    // Sentence 4 — review evidence (only when sample is meaningful)
    let s4 = "";
    if (reviewCount >= 25) {
      const themes = ((profileObj.review_themes) || [])
        .filter((t) => t && t.theme && t.polarity !== "caution")
        .map((t) => String(t.theme).trim())
        .filter((t) => t && !isFiller(t))
        .slice(0, 3)
        .map(inlineLowercase);
      if (themes.length >= 2) {
        const joined = themes.length === 3
          ? `${themes[0]}, ${themes[1]}, and ${themes[2]}`
          : themes.join(" and ");
        s4 = `Customer reviews mention ${joined}.`;
      }
    }

    return [s1, s2, s3, s4].filter(Boolean).join(" ");
  }

  // "They do" — actual services from the LLM extraction. If empty,
  // returns "" so the prelude row can be hidden honestly rather than
  // falling back to generic specialty taglines.
  function composeWhatTheyDo(profile) {
    const offered = (profile || {}).services_offered || [];
    const cleaned = offered
      .map((s) => String(s || "").trim().replace(/[.;]+$/, ""))
      .filter((s) => {
        if (!s) return false;
        if (s.length > 50) return false;
        if (/customer satisfaction|satisfaction guarantee/i.test(s)) return false;
        return true;
      });
    const uniq = [];
    const seen = new Set();
    for (const s of cleaned) {
      const k = s.toLowerCase();
      if (!seen.has(k)) { seen.add(k); uniq.push(s); }
      if (uniq.length >= 6) break;
    }
    return uniq.length ? uniq.join(", ") : "";
  }

  // "They work in" — service area + city if both present.
  function composeWhereTheyWork(pro, profile) {
    const sa = ((profile || {}).service_area || "").trim();
    const city = (pro && pro.city) || "";
    if (sa && city) {
      // If service area already mentions the city, keep verbatim.
      const cityShort = city.split(",")[0].trim();
      return sa.toLowerCase().includes(cityShort.toLowerCase())
        ? sa
        : `${sa} (based in ${cityShort})`;
    }
    return sa || city || "";
  }

  // Specialty list cleanup — drop generic noise, drop overlong phrases,
  // dedupe, return at most 4 items in 3-6 word range.
  const SPECIALTY_NOISE = [
    /^customer (satisfaction|service|focus)/i,
    /^(high.?quality|excellent|amazing|outstanding|professional)$/i,
    /^great service$/i,
    /^excellent service$/i,
    /^professionalism$/i,
  ];
  function cleanSpecialties(items) {
    const out = [];
    const seen = new Set();
    for (const raw of (items || [])) {
      let s = String(raw || "").trim().replace(/[.;]+$/, "");
      if (!s) continue;
      if (SPECIALTY_NOISE.some((re) => re.test(s))) continue;
      if (FILLER_PATTERNS.some((re) => re.test(s))) continue;
      const wc = s.split(/\s+/).length;
      if (wc < 2 || wc > 7) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= 4) break;
    }
    return out;
  }

  function renderProfileHTML(pro, profile, reviews) {
    const yearsNum   = parseYearsNum((profile || {}).years_in_business);
    const yearsLabel = yearsNum ? `${yearsNum} years in business` : "";

    const meta = [
      pro.city,
      pro.rating ? `★ ${pro.rating.toFixed(1)} (${(pro.reviews || 0).toLocaleString()} reviews)` : "",
      yearsLabel,
    ].filter(Boolean);

    // Credential pills — filled green checkmark style
    const creds   = (profile || {}).credentials || {};
    const pricing = (profile || {}).pricing || {};
    const pills = [];
    if (creds.licensed && String(creds.licensed).trim()) pills.push("Licensed");
    if (creds.insured  && String(creds.insured).trim())  pills.push("Insured");
    if (pricing.free_estimates === true) pills.push("Free quotes");

    const reviewCount = (pro.reviews || 0).toLocaleString();

    return `
      <div class="profile-backdrop"></div>
      <aside class="profile-panel" role="dialog" aria-label="Pro profile">
        <button class="profile-close" data-profile-close aria-label="Close">✕</button>

        <div class="profile-glance">
          <header class="profile-glance-header">
            <h2>${esc(pro.name)}</h2>
            <div class="profile-glance-meta">${meta.map(esc).join("  ·  ")}</div>
          </header>

          <button type="button" class="profile-contact-cta" data-action="contact" data-pro="${esc(pro.id)}">
            <span aria-hidden="true">📩</span> Contact Business
          </button>
          <p class="profile-cta-sub">Faster than calling · No spam · Pros reply in 1-2 days</p>

          ${pills.length ? `
          <div class="profile-pills" role="list">
            ${pills.map((p) => `<span class="profile-pill" role="listitem"><span class="pill-icon" aria-hidden="true">✅</span>${esc(p)}</span>`).join("")}
          </div>` : ""}
        </div>

        <nav class="profile-tabs" role="tablist" aria-label="Profile sections">
          <button type="button" class="profile-tab active" data-tab="reviews"  role="tab" aria-selected="true">Reviews (${reviewCount})</button>
          <button type="button" class="profile-tab"        data-tab="pricing"  role="tab" aria-selected="false">Pricing</button>
          <button type="button" class="profile-tab"        data-tab="warranty" role="tab" aria-selected="false">Warranty</button>
          <button type="button" class="profile-tab"        data-tab="concerns" role="tab" aria-selected="false">Concerns</button>
        </nav>

        <div class="profile-tab-content" id="profileTabContent" role="tabpanel"></div>
      </aside>`;
  }

  // ----- Tab content renderers -----

  function renderTabReviews(pro, profile, reviews) {
    // Plain-text prelude — concrete, evidence-rich lines (no generic
    // marketing copy). Pulls from real fields in the silver profile.
    const aboutText  = composeAboutThem(pro, profile);
    const servicesText = composeWhatTheyDo(profile);
    const whereText  = composeWhereTheyWork(pro, profile);

    const preludeBits = [];
    if (aboutText)    preludeBits.push(`<p class="tab-prelude-line"><strong>About them:</strong> ${esc(aboutText)}</p>`);
    if (servicesText) preludeBits.push(`<p class="tab-prelude-line"><strong>They do:</strong> ${esc(servicesText)}</p>`);
    if (whereText)    preludeBits.push(`<p class="tab-prelude-line"><strong>They work in:</strong> ${esc(whereText)}</p>`);
    const prelude = preludeBits.length
      ? `<div class="tab-prelude">${preludeBits.join("")}</div>` : "";

    const themes = ((profile || {}).review_themes || [])
      .filter((t) => t && t.theme && t.polarity !== "caution")
      .slice(0, 4);
    const themesHtml = themes.length ? `
      <h4 class="tab-subhead">What customers tend to praise</h4>
      <ul class="tab-praise">${
        themes.map((t) => `<li>✓ ${esc(t.theme)}</li>`).join("")
      }</ul>` : "";

    const usable = (reviews || []).filter((r) => r.text && r.text.length > 30).slice(0, 3);
    let cards;
    if (usable.length) {
      cards = `
        <h4 class="tab-subhead tab-subhead-spaced">Recent reviews</h4>
        <div class="tab-reviews">${
          usable.map((r) => {
            const rt = r.rating || 0;
            const stars = "★".repeat(rt) + "☆".repeat(5 - rt);
            const snippet = (r.text || "").slice(0, 280) + (r.text && r.text.length > 280 ? "…" : "");
            return `
              <article class="tab-review-card">
                <div class="tab-review-head">
                  <span class="tab-review-stars">${stars}</span>
                  <span class="tab-review-author">${esc(r.author || "Google reviewer")}</span>
                  ${r.relative_time ? `<span class="tab-review-when">· ${esc(r.relative_time)}</span>` : ""}
                </div>
                <p>${esc(snippet)}</p>
              </article>`;
          }).join("")
        }</div>`;
    } else {
      cards = `<p class="tab-empty">No customer reviews yet for this pro.</p>`;
    }

    const link = pro.google_maps_uri ? `
      <p class="tab-link"><a href="${esc(pro.google_maps_uri)}" target="_blank" rel="noopener">See all ${(pro.reviews || 0).toLocaleString()} reviews on Google →</a></p>` : "";

    return `${prelude}${themesHtml}${cards}${link}`;
  }

  function renderTabPricing(pro, profile) {
    const pricing = (profile || {}).pricing || {};
    const free        = pricing.free_estimates === true;
    const hasSpec     = pricing.has_specific_pricing === true;
    const serviceArea = ((profile || {}).service_area || "").trim();
    const quotesFromR = pricing.quotes_from_reviews || [];

    const lines = [];
    lines.push(`<p>${free ? "✓ They give free estimates." : "They may charge for an estimate — ask first."}</p>`);
    lines.push(`<p>${hasSpec ? "✓ Some prices listed on their website." : "They don't list prices online."}</p>`);
    if (serviceArea) lines.push(`<p><strong>Where they work:</strong> ${esc(serviceArea)}</p>`);
    if (quotesFromR.length) {
      lines.push(`<p><strong>Prices customers mentioned:</strong></p>
        <ul class="tab-list">${quotesFromR.slice(0, 5).map((q) => `<li>${esc(q)}</li>`).join("")}</ul>`);
    }

    return `
      <div class="tab-block">${lines.join("")}</div>
      <p class="tab-note">To get a real price, ask them for a quote. They usually reply in 1-2 days.</p>`;
  }

  function renderTabWarranty(pro, profile) {
    const warrantyText = ((profile || {}).warranty || "").trim();
    const verbatim = warrantyText
      ? `<p class="tab-quote-line">"${esc(warrantyText)}"</p>`
      : `<p class="tab-empty">They don't list their warranty online.</p>`;

    return `
      <h4 class="tab-subhead">🔨 Their warranty</h4>
      ${verbatim}

      <h4 class="tab-subhead tab-subhead-spaced">What's normal in this business</h4>
      <ul class="tab-list">
        <li>Most landscapers cover plants for 1 year.</li>
        <li>Most cover their work for at least 2 years.</li>
      </ul>
      <p class="tab-note">Get the warranty in writing before you say yes.</p>`;
  }

  function renderTabConcerns(pro, profile) {
    const themes = ((profile || {}).review_themes || []).filter((t) => t && t.theme);
    const positives = themes.filter((t) => t.polarity !== "caution").slice(0, 4);
    const cautions  = themes.filter((t) => t.polarity === "caution");
    const redFlags  = (profile || {}).red_flags || [];

    const positivesHtml = positives.length ? `
      <h4 class="tab-subhead">What customers love</h4>
      <ul class="tab-praise">${positives.map((t) => `<li>✓ ${esc(t.theme)}</li>`).join("")}</ul>` : "";

    const concernsList = (cautions.length || redFlags.length)
      ? `<h4 class="tab-subhead tab-subhead-spaced">Things to watch for</h4>
         <ul class="tab-list">
           ${cautions.map((t) => `<li>⚠ ${esc(t.theme)}</li>`).join("")}
           ${redFlags.map((c) => `<li>⚠ ${esc(c)}</li>`).join("")}
         </ul>`
      : `<p class="tab-note tab-no-flags">✓ Recent reviews look good — no big complaints.</p>`;

    const cityShort = (pro.city || "").split(",")[0].trim() || "your city";
    const questions = `
      <h4 class="tab-subhead tab-subhead-spaced">Things to ask before you say yes</h4>
      <ul class="tab-list">
        <li>Are you registered with the City of ${esc(cityShort)}?</li>
        <li>Can I talk to 3 nearby customers you've worked for?</li>
        <li>Will the price stay the same, or could it grow as you work?</li>
        <li>If something dies or breaks, will you fix it for free?</li>
      </ul>`;

    return `${positivesHtml}${concernsList}${questions}`;
  }

  // ==========================================================================
  // One-Click Contact modal (Phase 3)
  // ==========================================================================
  const CONTACT_STORAGE_KEY = "landscaping_contact_v1";
  const CONTACT_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

  function getSavedContact() {
    try {
      const raw = localStorage.getItem(CONTACT_STORAGE_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      if (data && data._savedAt && (Date.now() - data._savedAt) > CONTACT_TTL_MS) {
        localStorage.removeItem(CONTACT_STORAGE_KEY);
        return {};
      }
      return data || {};
    } catch (_) { return {}; }
  }

  function saveContact(info) {
    try {
      localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify({
        name:  info.name || "",
        email: info.email || "",
        phone: info.phone || "",
        save:  true,
        _savedAt: Date.now(),
      }));
    } catch (_) { /* localStorage may be disabled — ignore */ }
  }

  function clearSavedContact() {
    try { localStorage.removeItem(CONTACT_STORAGE_KEY); } catch (_) {}
  }

  function ensureContactOverlay() {
    let ov = document.querySelector(".contact-overlay");
    if (ov) return ov;
    ov = document.createElement("div");
    ov.className = "contact-overlay";
    document.body.appendChild(ov);
    return ov;
  }

  function openContactModal(proId) {
    const pro = LANDSCAPERS.find((p) => p.id === proId);
    if (!pro) return;
    const saved = getSavedContact();
    const overlay = ensureContactOverlay();
    overlay.innerHTML = renderContactModalHTML(pro, saved);
    overlay.classList.add("show");
    document.body.classList.add("contact-modal-open");

    overlay.querySelectorAll("[data-contact-close]").forEach((b) =>
      b.addEventListener("click", closeContactModal));
    overlay.querySelector(".contact-backdrop").addEventListener("click", closeContactModal);
    overlay.querySelector("#contactForm").addEventListener("submit", (e) => handleContactSubmit(e, pro));
    document.addEventListener("keydown", _contactEscHandler);

    // Focus the description field if name/email/phone are pre-filled,
    // otherwise focus the first empty field.
    setTimeout(() => {
      const desc  = overlay.querySelector("#contactDescription");
      const name  = overlay.querySelector("#contactName");
      if (saved.name && saved.email && saved.phone && desc) desc.focus();
      else if (name) name.focus();
    }, 80);
  }

  function _contactEscHandler(e) {
    if (e.key === "Escape") closeContactModal();
  }

  function closeContactModal() {
    const ov = document.querySelector(".contact-overlay");
    if (!ov) return;
    ov.classList.remove("show");
    document.body.classList.remove("contact-modal-open");
    document.removeEventListener("keydown", _contactEscHandler);
  }

  const CONTACT_WEBHOOK_URL = "https://justgotalead.com/v1/triggers/wh_GPR2wyl3dbKiqYCDZviqB7cK";

  function renderContactModalHTML(pro, saved) {
    return `
      <div class="contact-backdrop"></div>
      <div class="contact-modal" role="dialog" aria-labelledby="contactTitle" aria-modal="true">
        <button type="button" class="contact-close" data-contact-close aria-label="Close">✕</button>

        <header class="contact-modal-header">
          <h3 id="contactTitle">Contact ${esc(pro.name)}</h3>
        </header>

        <form id="contactForm" action="https://justgotalead.com/v1/triggers/wh_GPR2wyl3dbKiqYCDZviqB7cK" method="POST">
          <label class="contact-field">
            <span class="contact-field-label">Your name <span class="contact-req">*</span></span>
            <input name="name" type="text" required placeholder="Full name" autocomplete="name" value="${esc((saved && saved.name) || "")}" />
          </label>
          <label class="contact-field">
            <span class="contact-field-label">Your email <span class="contact-req">*</span></span>
            <input name="email" type="text" required placeholder="Email address" autocomplete="email" inputmode="email" value="${esc((saved && saved.email) || "")}" />
          </label>
          <label class="contact-field">
            <span class="contact-field-label">Your phone <span class="contact-req">*</span></span>
            <input name="phone" type="tel" required placeholder="Phone number" autocomplete="tel" inputmode="tel" value="${esc((saved && saved.phone) || "")}" />
          </label>
          <label class="contact-field">
            <span class="contact-field-label">When <span class="contact-req">*</span></span>
            <input name="date_needed" type="date" required />
          </label>
          <label class="contact-field">
            <span class="contact-field-label">Project Description <span class="contact-req">*</span></span>
            <textarea name="project_description" required placeholder="Describe your project — what, where, and timing."></textarea>
          </label>

          <button type="submit">Send</button>
        </form>

        <div class="contact-error" id="contactError" role="alert" aria-live="polite"></div>
      </div>`;
  }

  async function handleContactSubmit(e, pro) {
    e.preventDefault();
    const form = e.target;
    const errEl = document.getElementById("contactError");
    if (errEl) errEl.textContent = "";

    // Field names match the webhook's expected schema exactly:
    //   name, email, phone, date_needed, project_description
    const name        = form.elements["name"].value.trim();
    const email       = form.elements["email"].value.trim();
    const phoneRaw    = form.elements["phone"].value.trim();
    const dateNeeded  = form.elements["date_needed"].value.trim();
    const description = form.elements["project_description"].value.trim();

    // Normalize the phone to 10-digit US format (e.g. 2247356291) so the
    // downstream activity flow's call action receives a value it can dial.
    // Strips parens, spaces, dashes, dots, plus signs. If the user entered
    // an 11-digit number starting with 1 (like +1 224 735 6291 or
    // 1-224-735-6291), drops the leading country-code 1.
    let phone = phoneRaw.replace(/\D+/g, "");
    if (phone.length === 11 && phone.startsWith("1")) phone = phone.slice(1);

    if (!name || !email || !phoneRaw || !dateNeeded || !description) {
      if (errEl) errEl.textContent = "Please fill in every field.";
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (errEl) errEl.textContent = "Please enter a valid email address.";
      return;
    }
    if (phone.length !== 10) {
      if (errEl) errEl.textContent = "Please enter a 10-digit US phone number (e.g. 224 735 6291).";
      return;
    }

    const body = new URLSearchParams();
    body.append("name",                name);
    body.append("email",               email);
    body.append("phone",               phone);
    body.append("date_needed",         dateNeeded);
    body.append("project_description", description);
    // Attach a wide slice of the picked landscaper's profile so any
    // downstream step (email body, AI voice prompt, Google Sheet row,
    // CRM merge tag) can reference them as {landscape_*} variables.
    // Backend keeps every landscape_* key on lead.fields even if the
    // CRM form definition didn't declare them, so the merge tags
    // resolve regardless.
    const profile = (pro && pro.profile) || {};
    const credentials = profile.credentials || {};
    const pricing = profile.pricing || {};
    const joinList = (v) => Array.isArray(v) ? v.filter(Boolean).join(", ") : (v || "");
    const fieldsToAttach = {
      landscape_email:            (pro.email || pro.contact_email || ""),
      landscape_phonenumber:      pro.phone || "",
      landscape_name:             pro.name || "",
      landscape_pro_id:           pro.id || "",
      landscape_website:          pro.website || "",
      landscape_address:          pro.address || "",
      landscape_city:             pro.city || "",
      landscape_rating:           pro.rating ? String(pro.rating) : "",
      landscape_reviews:          pro.reviews ? String(pro.reviews) : "",
      landscape_services:         joinList(pro.services),
      landscape_blurb:            pro.blurb || "",
      landscape_summary:          profile.summary_for_homeowner || "",
      landscape_specialties:      joinList(profile.specialties),
      landscape_services_offered: joinList(profile.services_offered),
      landscape_service_area:     profile.service_area || "",
      landscape_years_in_business: profile.years_in_business || "",
      landscape_warranty:         profile.warranty || "",
      landscape_when_to_use:      profile.when_to_use || "",
      landscape_certifications:   joinList(credentials.certifications),
      landscape_licensed:         credentials.licensed || "",
      landscape_insured:          credentials.insured || "",
      landscape_free_estimates:   pricing.free_estimates === true ? "yes"
                                  : pricing.free_estimates === false ? "no" : "",
      landscape_pricing_quotes:   pricing.quotes_from_site || "",
      landscape_google_maps_uri:  pro.google_maps_uri || "",
    };
    Object.entries(fieldsToAttach).forEach(([k, v]) => {
      if (v !== "" && v != null) body.append(k, v);
    });

    // Fire-and-forget UX: persist contact, close modal, show success
    // toast IMMEDIATELY. Run the network call in the background — with
    // mode:"no-cors" the response is opaque anyway, so blocking the
    // user on it gives us no signal.
    saveContact({ name, email, phone });
    void phoneRaw;
    closeContactModal();
    showContactToast(`Sent to ${pro.name}. They typically reply within 24-48 hours.`, "success");

    fetch(form.action, {
      method:    "POST",
      mode:      "no-cors",
      headers:   { "Content-Type": "application/x-www-form-urlencoded" },
      body:      body.toString(),
      keepalive: true,   // request finishes even if user navigates away
    }).catch((err) => {
      console.warn("[contact] background submit failed:", err);
    });
  }

  function showContactToast(msg, kind) {
    let toast = document.getElementById("contactToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "contactToast";
      toast.className = "contact-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.remove("toast-success", "toast-error", "show");
    toast.classList.add(kind === "error" ? "toast-error" : "toast-success");
    // Force reflow so transitions re-trigger
    void toast.offsetWidth;
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove("show"), 4500);
  }

  // ── Claim-listing modal ────────────────────────────────────────────
  // Self-service opt-in. The landscaper confirms they're the owner,
  // gives the email/phone they want leads sent to, and ticks the
  // consent checkbox. POST goes to /landscaping/pros/<id>/claim which
  // sets auto_route_consented=true on their override record.
  function openClaimModal(proId) {
    const pro = LANDSCAPERS.find((p) => p.id === proId);
    if (!pro) return;
    const overlay = ensureContactOverlay();   // reuse the contact overlay shell
    overlay.innerHTML = renderClaimModalHTML(pro);
    overlay.classList.add("show");
    document.body.classList.add("contact-modal-open");
    overlay.querySelectorAll("[data-contact-close]").forEach((b) =>
      b.addEventListener("click", closeContactModal));
    overlay.querySelector(".contact-backdrop").addEventListener("click", closeContactModal);
    overlay.querySelector("#claimForm").addEventListener("submit", (e) => handleClaimSubmit(e, pro));
    document.addEventListener("keydown", _contactEscHandler);
    setTimeout(() => {
      const f = overlay.querySelector("#claimEmail") || overlay.querySelector("#claimPhone");
      if (f) f.focus();
    }, 80);
  }

  function renderClaimModalHTML(pro) {
    const email = (pro && pro.email) || "";
    const phone = (pro && pro.phone) || "";
    return `
      <div class="contact-backdrop"></div>
      <div class="contact-modal" role="dialog" aria-labelledby="claimTitle" aria-modal="true">
        <button type="button" class="contact-close" data-contact-close aria-label="Close">✕</button>
        <header class="contact-modal-header">
          <h3 id="claimTitle">Claim ${esc(pro.name)}</h3>
          <p class="claim-modal-sub">Confirm you're the owner so we can send homeowner leads directly to you. Free, no contract.</p>
        </header>
        <form id="claimForm" onsubmit="return false;">
          <label class="contact-field">
            <span class="contact-field-label">Your name</span>
            <input id="claimName" name="name" type="text" placeholder="Owner / manager name" autocomplete="name" />
          </label>
          <label class="contact-field">
            <span class="contact-field-label">Email for leads</span>
            <input id="claimEmail" name="email" type="email" placeholder="leads@yourbusiness.com" autocomplete="email" inputmode="email" value="${esc(email)}" />
          </label>
          <label class="contact-field">
            <span class="contact-field-label">Phone for leads</span>
            <input id="claimPhone" name="phone" type="tel" placeholder="(815) 555-0123" autocomplete="tel" inputmode="tel" value="${esc(phone)}" />
          </label>
          <fieldset class="claim-channel">
            <legend>Preferred lead delivery</legend>
            <label><input type="radio" name="preferred_channel" value="email" checked> Email</label>
            <label><input type="radio" name="preferred_channel" value="phone"> Phone call</label>
            <label><input type="radio" name="preferred_channel" value="sms"> Text message</label>
            <label><input type="radio" name="preferred_channel" value="either"> Either / both</label>
          </fieldset>
          <label class="contact-field">
            <span class="contact-field-label">Anything we should know? (optional)</span>
            <textarea id="claimNotes" name="notes" rows="2" placeholder="Hours, services to include/exclude, etc."></textarea>
          </label>
          <label class="claim-consent">
            <input type="checkbox" id="claimConsent" required>
            <span>Yes, send me homeowner leads matched to my services. I can opt out any time.</span>
          </label>
          <button type="submit" class="claim-submit">Claim listing</button>
        </form>
        <div class="contact-error" id="claimError" role="alert" aria-live="polite"></div>
      </div>`;
  }

  async function handleClaimSubmit(e, pro) {
    e.preventDefault();
    const form  = e.target;
    const errEl = document.getElementById("claimError");
    if (errEl) errEl.textContent = "";
    const payload = {
      name:  (form.elements["name"].value  || "").trim(),
      email: (form.elements["email"].value || "").trim(),
      phone: (form.elements["phone"].value || "").trim(),
      preferred_channel: (form.elements["preferred_channel"].value || "email").trim(),
      notes: (form.elements["notes"].value || "").trim(),
      consent: !!form.elements["consent"] && !!document.getElementById("claimConsent").checked,
    };
    if (!payload.consent) {
      if (errEl) errEl.textContent = "Please confirm you want to receive leads.";
      return;
    }
    if (!payload.email && !payload.phone) {
      if (errEl) errEl.textContent = "Provide at least an email or phone for lead delivery.";
      return;
    }
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      if (errEl) errEl.textContent = "Please enter a valid email address.";
      return;
    }
    const submit = form.querySelector("button[type=submit]");
    const original = submit ? submit.textContent : "Claim listing";
    if (submit) { submit.disabled = true; submit.textContent = "Submitting…"; }
    try {
      const r = await fetch("/landscaping/pros/" + encodeURIComponent(pro.id) + "/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || j.error || ("HTTP " + r.status));
      // Reflect locally so the badge appears without a page reload.
      const local = LANDSCAPERS.find((p) => p.id === pro.id);
      if (local) {
        local.auto_route_consented = true;
        if (payload.email) local.email = payload.email;
        if (payload.phone) local.phone = payload.phone;
      }
      closeContactModal();
      showContactToast(`Thanks — ${pro.name} is now claimed. Lead routing is active.`, "success");
    } catch (err) {
      if (submit) { submit.disabled = false; submit.textContent = original; }
      if (errEl) errEl.textContent = "Couldn't save: " + (err && err.message || err);
    }
  }

  // Expose for use by other modules (chat takeover, etc.)
  window.openProProfile = openProProfile;
  window.openContactModal = openContactModal;
  window.openClaimModal = openClaimModal;

  // ==========================================================================
  // Filterable directory TABLE (replaces the old card grid)
  // ==========================================================================
  const TABLE_PAGE_SIZE = 5;
  const tableState = {
    search: "",
    city: "",                // dropdown filter — exact match on pro.city
    service: "",
    minRating: 0,
    freeEst: false,
    licensed: false,
    nearby: false,           // when true + user has location, filter to <=30 miles
    sort: "rating",
    page: 0,
    expanded: new Set(),
  };
  let tableBound = false;
  let cityOptionsPopulated = false;

  function renderDirectory() {
    const tbody = $("#prosTableBody");
    if (!tbody) return;
    bindTableControls();
    populateCityOptions();
    applyTableFilters();
  }

  // Populate the City dropdown with distinct cities found in the
  // currently-loaded LANDSCAPERS list, sorted alphabetically. Idempotent
  // on the dataset — re-runs only add new cities. Called after the gold
  // dataset replaces the fallback list, and on first directory render.
  function populateCityOptions() {
    const sel = $("#pfCity");
    if (!sel) return;
    const cities = Array.from(new Set(
      LANDSCAPERS.map((p) => (p.city || "").trim()).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));
    if (!cities.length) return;
    // Remember selected value so a re-populate doesn't drop the user's pick
    const current = sel.value;
    // Wipe everything except the leading "All cities" option.
    while (sel.options.length > 1) sel.remove(1);
    cities.forEach((c) => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
    if (current && cities.includes(current)) sel.value = current;
    cityOptionsPopulated = true;
  }

  function bindTableControls() {
    if (tableBound) return;
    tableBound = true;
    const search   = $("#pfSearch");
    const city     = $("#pfCity");
    const service  = $("#pfService");
    const rating   = $("#pfRating");
    const sortSel  = $("#pfSort");
    const freeEst  = $("#pfFreeEst");
    const licensed = $("#pfLicensed");
    const nearby   = $("#pfNearby");
    const reset    = $("#pfReset");

    if (search) {
      let t;
      search.addEventListener("input", (e) => {
        clearTimeout(t);
        t = setTimeout(() => {
          tableState.search = (e.target.value || "").trim().toLowerCase();
          tableState.page = 0;
          applyTableFilters();
        }, 120);
      });
    }
    if (city)     city.addEventListener("change",     (e) => { tableState.city = e.target.value; tableState.page = 0; applyTableFilters(); });
    if (service)  service.addEventListener("change",  (e) => { tableState.service = e.target.value; tableState.page = 0; applyTableFilters(); });
    if (rating)   rating.addEventListener("change",   (e) => { tableState.minRating = parseFloat(e.target.value) || 0; tableState.page = 0; applyTableFilters(); });
    if (sortSel)  sortSel.addEventListener("change",  (e) => { tableState.sort = e.target.value; tableState.page = 0; applyTableFilters(); });
    if (freeEst)  freeEst.addEventListener("change",  (e) => { tableState.freeEst = !!e.target.checked; tableState.page = 0; applyTableFilters(); });
    if (licensed) licensed.addEventListener("change", (e) => { tableState.licensed = !!e.target.checked; tableState.page = 0; applyTableFilters(); });
    if (nearby)   nearby.addEventListener("change",   (e) => { tableState.nearby = !!e.target.checked; tableState.page = 0; applyTableFilters(); });
    if (reset) {
      reset.addEventListener("click", () => {
        tableState.search = ""; tableState.city = ""; tableState.service = ""; tableState.minRating = 0;
        tableState.freeEst = false; tableState.licensed = false;
        tableState.nearby = false; tableState.sort = "rating";
        tableState.page = 0;
        tableState.expanded.clear();
        if (search)   search.value = "";
        if (city)     city.value = "";
        if (service)  service.value = "";
        if (rating)   rating.value  = "0";
        if (sortSel)  sortSel.value = "rating";
        if (freeEst)  freeEst.checked  = false;
        if (licensed) licensed.checked = false;
        if (nearby)   nearby.checked  = false;
        applyTableFilters();
      });
    }

    syncNearbyToggleVisibility();

    // Pagination — Prev / Next buttons
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-table-page]");
      if (!btn) return;
      const dir = btn.dataset.tablePage;
      const totalPages = btn.dataset.tableTotalPages
        ? parseInt(btn.dataset.tableTotalPages, 10) : 1;
      if (dir === "prev" && tableState.page > 0) tableState.page -= 1;
      if (dir === "next" && tableState.page < totalPages - 1) tableState.page += 1;
      applyTableFilters();
      // Don't auto-scroll the table into view — users already have it
      // on screen when they click Prev/Next, and yanking the page
      // around interrupts what they were reading.
    });

    const tbody = $("#prosTableBody");
    if (tbody) {
      tbody.addEventListener("click", (e) => {
        const action = e.target.closest("[data-table-action]");
        if (action) {
          e.stopPropagation();
          const id = action.dataset.pro;
          if (action.dataset.tableAction === "profile") openProProfile(id);
          else if (action.dataset.tableAction === "quote")   openContactModal(id);
          return;
        }
        const row = e.target.closest("tr.pro-row");
        if (!row) return;
        const id = row.dataset.pro;
        if (tableState.expanded.has(id)) tableState.expanded.delete(id);
        else tableState.expanded.add(id);
        applyTableFilters();
      });
    }
  }

  function applyTableFilters() {
    const tbody = $("#prosTableBody");
    const counter = $("#pfCount");
    if (!tbody) return;

    // Resolve user lat/lng once for distance filtering + sorting
    const userLoc = getUserLocation();
    const userLL  = locationLatLng(userLoc);

    let list = LANDSCAPERS.filter((p) => {
      // Free-text search now matches against name, city, and ZIP codes
      // — so a homeowner can type "Algonquin" or "60014" and get
      // results without having to use the dropdown.
      if (tableState.search) {
        const q     = tableState.search;
        const name  = (p.name || "").toLowerCase();
        const city  = (p.city || "").toLowerCase();
        const zips  = Array.isArray(p.zips) ? p.zips.join(" ") : "";
        if (!name.includes(q) && !city.includes(q) && !zips.includes(q)) return false;
      }
      if (tableState.city && (p.city || "") !== tableState.city) return false;
      if (tableState.service && !(p.services || []).includes(tableState.service)) return false;
      if (tableState.minRating > 0 && (p.rating || 0) < tableState.minRating) return false;
      if (tableState.freeEst) {
        const fe = ((p.profile || {}).pricing || {}).free_estimates;
        if (fe !== true) return false;
      }
      if (tableState.licensed) {
        const c = (p.profile || {}).credentials || {};
        const has = (c.licensed && String(c.licensed).trim()) || (c.insured && String(c.insured).trim())
                  || (Array.isArray(c.certifications) && c.certifications.length > 0);
        if (!has) return false;
      }
      return true;
    });

    // Compute miles per pro if we have a usable user lat/lng
    if (userLL) {
      list = list.map((p) => {
        const lat = (typeof p.lat === "number") ? p.lat : null;
        const lng = (typeof p.lng === "number") ? p.lng : null;
        const _miles = (lat != null && lng != null)
          ? haversineMiles(userLL.lat, userLL.lng, lat, lng) : null;
        return Object.assign({}, p, { _miles });
      });
    }

    // Optional nearby filter — only applies when toggle is on AND we have lat/lng
    if (tableState.nearby && userLL && userLoc && userLoc.in_service_area) {
      list = list.filter((p) => p._miles == null || p._miles <= 30);
    }

    list.sort((a, b) => {
      if (tableState.sort === "distance") {
        const ma = (a._miles == null) ? Infinity : a._miles;
        const mb = (b._miles == null) ? Infinity : b._miles;
        if (ma !== mb) return ma - mb;
        return (b.rating || 0) - (a.rating || 0);
      }
      if (tableState.sort === "name")    return a.name.localeCompare(b.name);
      if (tableState.sort === "reviews") return (b.reviews || 0) - (a.reviews || 0);
      const dr = (b.rating || 0) - (a.rating || 0);
      if (dr) return dr;
      return (b.reviews || 0) - (a.reviews || 0);
    });

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
    if (tableState.page >= totalPages) tableState.page = totalPages - 1;
    if (tableState.page < 0) tableState.page = 0;

    const start = tableState.page * TABLE_PAGE_SIZE;
    const end   = Math.min(start + TABLE_PAGE_SIZE, total);
    const pageList = list.slice(start, end);

    if (counter) {
      if (total === 0) {
        counter.textContent = `No pros match your filters. Try resetting.`;
      } else {
        counter.textContent = `Showing ${start + 1}–${end} of ${total} pros`;
      }
    }

    tbody.innerHTML = pageList.map((p) => buildTableRow(p)).join("");

    renderTablePagination(total, totalPages);
  }

  function renderTablePagination(total, totalPages) {
    const wrap = document.querySelector(".pros-table-wrap");
    if (!wrap) return;
    let pager = document.getElementById("prosTablePager");
    if (!pager) {
      pager = document.createElement("div");
      pager.id = "prosTablePager";
      pager.className = "pros-table-pager";
      wrap.parentNode.insertBefore(pager, wrap.nextSibling);
    }

    if (total <= TABLE_PAGE_SIZE) {
      pager.innerHTML = "";
      pager.style.display = "none";
      return;
    }
    pager.style.display = "";

    const cur = tableState.page;
    const isFirst = cur === 0;
    const isLast  = cur >= totalPages - 1;

    pager.innerHTML = `
      <button type="button" class="pager-btn" data-table-page="prev" data-table-total-pages="${totalPages}" ${isFirst ? "disabled" : ""} aria-label="Previous page">← Prev</button>
      <span class="pager-status">Page ${cur + 1} of ${totalPages}</span>
      <button type="button" class="pager-btn" data-table-page="next" data-table-total-pages="${totalPages}" ${isLast  ? "disabled" : ""} aria-label="Next page">Next →</button>
    `;
  }

  function buildTableRow(pro) {
    const id = pro.id || "";
    const expanded = tableState.expanded.has(id);
    const initials = pro.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const services = (pro.services || []).slice(0, 3)
      .map((s) => `<span class="tag">${esc(serviceLabel(s))}</span>`).join("");

    const profile = pro.profile || null;
    const trust = [];
    if (profile && (profile.pricing || {}).free_estimates === true) {
      trust.push(`<span class="chip chip-positive">✓ Free est.</span>`);
    }
    if (profile) {
      const c = profile.credentials || {};
      const certCount = Array.isArray(c.certifications) ? c.certifications.length : 0;
      const lic = c.licensed && String(c.licensed).trim();
      const ins = c.insured && String(c.insured).trim();
      if (lic || ins || certCount > 0) {
        const label = certCount > 0 ? `🏅 ${esc(c.certifications[0])}`
                                    : (lic ? `🏅 Licensed` : `🛡 Insured`);
        trust.push(`<span class="chip chip-cred">${label}</span>`);
      }
    }
    const trustHtml = trust.length ? `<div class="trust-chips">${trust.join("")}</div>` : `<span class="muted">—</span>`;

    const star = (pro.rating || 0).toFixed(1);
    const revs = pro.reviews || 0;

    const detail = expanded ? `
      <tr class="pro-detail-row" data-detail-for="${esc(id)}">
        <td colspan="5">${buildRowDetail(pro)}</td>
      </tr>` : "";

    return `
      <tr class="pro-row${expanded ? " expanded" : ""}" data-pro="${esc(id)}">
        <td class="col-pro">
          <div class="pro-cell">
            <div class="pro-avatar">${esc(initials)}</div>
            <div>
              <div class="pro-name"><span class="row-toggle">›</span>${esc(pro.name)}</div>
              <div class="pro-city">${esc(pro.city || "")}${typeof pro._miles === "number" ? `  ·  ${pro._miles.toFixed(1)} mi` : ""}</div>
            </div>
          </div>
        </td>
        <td class="col-rating rating-cell">
          <span class="stars">★ ${star}</span>
          <span class="rev-count"> (${revs})</span>
        </td>
        <td class="col-services"><div class="svc-chips">${services}</div></td>
        <td class="col-trust">${trustHtml}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button type="button" class="row-btn" data-table-action="profile" data-pro="${esc(id)}">Profile</button>
          </div>
        </td>
      </tr>
      ${detail}`;
  }

  function buildRowDetail(pro) {
    const profile = pro.profile || {};
    const reviews = (pro.verbatim_reviews || []).slice(0, 5);
    // Use the richer "About them" description (real services, years, certs,
    // review themes) under the "Why hire them" header — same content the
    // slide-over profile shows.
    const summary = composeAboutThem(pro, profile);
    const phoneClean = (pro.phone || "").replace(/\D/g, "");

    const reviewsHtml = reviews.length
      ? `<div class="pd-reviews">${
          reviews.map((r) => {
            const rt = r.rating || 0;
            const stars = "★".repeat(rt) + "☆".repeat(5 - rt);
            const author = (r.author || "Google reviewer").trim();
            const when = (r.relative_time || "").trim();
            const txt = (r.text || "").slice(0, 380) + (r.text && r.text.length > 380 ? "…" : "");
            return `
              <div class="pd-review">
                <div class="pd-rev-head">
                  <span class="pd-rev-stars">${stars}</span>
                  <span>${esc(author)}</span>
                  ${when ? `<span>· ${esc(when)}</span>` : ""}
                </div>
                <p>${esc(txt)}</p>
              </div>`;
          }).join("")
        }</div>`
      : `<p class="pd-no-reviews">No customer reviews available for this pro.</p>`;

    const actions = `
      <div class="pd-actions">
        <button type="button" class="pd-quote" data-table-action="quote" data-pro="${esc(pro.id)}">Request a quote</button>
        ${pro.phone ? `<a href="tel:${phoneClean}" class="pd-secondary">📞 ${esc(pro.phone)}</a>` : ""}
        ${pro.website ? `<a href="${esc(pro.website)}" target="_blank" rel="noopener" class="pd-secondary">🌐 Website</a>` : ""}
        <button type="button" class="pd-secondary" data-table-action="profile" data-pro="${esc(pro.id)}">View full profile →</button>
      </div>`;

    return `
      <div class="pro-detail-content">
        ${summary  ? `<h4>Why hire them</h4><p class="pd-summary">${esc(summary)}</p>` : ""}
        <div class="pd-section">
          <h4>What customers say (top ${reviews.length || 0})</h4>
          ${reviewsHtml}
        </div>
        ${actions}
      </div>`;
  }

  // ==========================================================================
  // Service articles — inline SPA (same fade-left animation as the AI search)
  // ==========================================================================
  const ARTICLE_ORDER = [
    "lawn-care", "landscape-design", "hardscaping",
    "tree-shrub-care", "irrigation-drainage", "seasonal-cleanup",
  ];

  const ARTICLE_SHORT = {
    "lawn-care":           "Mowing, fertilization, aeration, weed control, seeding.",
    "landscape-design":    "Yard makeovers, planting beds, design plans, ornamentals.",
    "hardscaping":         "Patios, walkways, retaining walls, fire pits, outdoor kitchens.",
    "tree-shrub-care":     "Pruning, removal, disease and pest management, planting.",
    "irrigation-drainage": "Sprinkler systems, smart controllers, French drains, grading.",
    "seasonal-cleanup":    "Spring and fall cleanups, leaf removal, snow management.",
  };

  // Article-image manifest — fetched lazily on first article render.
  // Maps slug → {section_id: {file, ...}}. When present, the renderer
  // swaps the gradient placeholder for a real <img>. When absent,
  // gradient placeholder is used. Network failure is silent — the
  // article still renders.
  let _articleImageManifest = null;
  let _articleImageManifestPromise = null;

  function loadArticleImageManifest() {
    if (_articleImageManifest !== null) return Promise.resolve(_articleImageManifest);
    if (_articleImageManifestPromise) return _articleImageManifestPromise;
    _articleImageManifestPromise = fetch("/landscaping/img/articles/manifest.json", {
      cache: "force-cache",
    }).then((r) => r.ok ? r.json() : {})
      .catch(() => ({}))
      .then((data) => {
        _articleImageManifest = data && data.profiles ? data : (data || {});
        return _articleImageManifest;
      });
    return _articleImageManifestPromise;
  }

  function articleImageURL(slug, sectionId) {
    if (!_articleImageManifest) return null;
    const slot = (_articleImageManifest[slug] || {})[sectionId];
    if (!slot || !slot.file) return null;
    // Manifest "file" looks like "img/articles/lawn-care/hero.jpg".
    // Prepend /landscaping/ to make a full URL.
    return "/landscaping/" + slot.file;
  }

  // Map service category → article slug used for fallback company-card
  // images (we use the matching article's hero image when no
  // per-business photo exists).
  const CATEGORY_TO_ARTICLE_SLUG = {
    lawn_care:      "lawn-care",
    design_install: "landscape-design",
    hardscape:      "hardscaping",
    tree_shrub:     "tree-shrub-care",
    irrigation:     "irrigation-drainage",
    seasonal:       "seasonal-cleanup",
  };

  // Per-pro website image manifest. Built by
  // local-server/scripts/fetch_pro_website_images.py — pulls the og:image
  // (or twitter:image / first big <img>) from each pro's listed website
  // and saves it under templates/landscaping/img/pros/. Keyed by pro id.
  let _proImageManifest = null;
  let _proImageManifestPromise = null;

  function loadProImageManifest() {
    if (_proImageManifest !== null) return Promise.resolve(_proImageManifest);
    if (_proImageManifestPromise) return _proImageManifestPromise;
    _proImageManifestPromise = fetch("/landscaping/img/pros/manifest.json", {
      cache: "no-cache",
    }).then((r) => r.ok ? r.json() : {})
      .catch(() => ({}))
      .then((data) => {
        _proImageManifest = data || {};
        return _proImageManifest;
      });
    return _proImageManifestPromise;
  }

  function companyCardImageURL(pro) {
    // Only return a real image when the pro has one of their own
    // (og:image scraped from their website). Otherwise, return null so
    // the card falls back to the per-category gradient + emoji theme
    // (PRO_IMG_THEME) — keeps cards looking deliberate when we have no
    // photo on file.
    if (_proImageManifest && pro && pro.id) {
      const slot = _proImageManifest[pro.id];
      if (slot && slot.file) return "/landscaping/" + slot.file;
    }
    return null;
  }

  // Each section gets a friendly emoji header so the page reads like an
  // illustrated storybook rather than a wall of text. Generic across articles.
  const SECTION_EMOJI = {
    "what-it-includes":  "📋",
    "when-you-need-it":  "🗓️",
    "what-to-look-for":  "🔍",
    "common-mistakes":   "⚠️",
    "diy-vs-pro":        "🛠️",
    "questions-to-ask":  "❓",
  };

  const ARTICLES = {
    "lawn-care": {
      title: "Lawn care & maintenance", icon: "🌿",
      hero_label: "Lawn care basics",
      theme: "green",
      subtitle: "Everything you need to know about keeping a healthy lawn in Crystal Lake.",
      read_minutes: 8, last_updated: "May 2026", match_query: "lawn care",
      sections: [
        { id: "what-it-includes", h: "What lawn care includes",
          html: "<p class=\"as-lede\">A full lawn-care program around Crystal Lake usually means <strong>weekly mowing</strong> during the growing season plus <strong>4-6 visits a year</strong> for the things that actually keep grass thick.</p>" +
                "<ul><li><strong>Mowing</strong> — weekly April through October, height kept at <mark>3.5-4 inches</mark> (any shorter stresses the grass).</li>" +
                "<li><strong>Fertilization</strong> — 4-5 rounds: early spring, late spring, summer, late summer, late fall.</li>" +
                "<li><strong>Core aeration</strong> — mechanical plug aeration, almost always in <strong>fall</strong> for our cool-season grass.</li>" +
                "<li><strong>Overseeding</strong> — usually paired with fall aeration, runs $0.10-$0.20/sq ft on top.</li>" +
                "<li><strong>Weed control</strong> — pre-emergent in early spring (mid-April), spot treatment after.</li>" +
                "<li><strong>Edging</strong> along sidewalks, driveways, and beds — usually included in mowing visits.</li></ul>" },
        { id: "when-you-need-it", h: "When you need it",
          html: "<p class=\"as-lede\">If your lot is <strong>a quarter-acre or larger</strong>, ongoing service almost always pays for itself in time and equipment. Smaller lots can be DIY if you have the gear.</p>" +
                "<p>Spring and fall do the heavy lifting — that's when 80% of the value happens (cleanup, fertilizer, aeration, overseeding). Mid-summer is mostly \"just keep mowing,\" so some homeowners drop to lighter service in July and August.</p>" +
                "<aside class=\"as-callout\"><strong>💡 Local rule:</strong> Crystal Lake's odd/even watering ordinance runs May 15 - Sep 15, mornings and evenings only. A pro who manages your lawn should know this without being asked.</aside>" +
                "<p class=\"as-source\">Further reading: <a href=\"https://constructionhow.com/4-benefits-of-hiring-lawn-maintenance-services/\" target=\"_blank\" rel=\"noopener\">Benefits of hiring lawn maintenance services</a></p>" },
        { id: "what-to-look-for", h: "What to look for in a pro",
          html: "<p class=\"as-lede\">The thing that separates a good lawn pro from an average one is whether they can explain <strong>why</strong> they do what they do — pointing to soil, grass species, and season.</p>" +
                "<ul><li>They explain <strong>why</strong> they're applying each fertilizer, not just \"it's what we do.\"</li>" +
                "<li>They <strong>aerate in fall</strong>, not spring — fall is correct for cool-season grass like ours.</li>" +
                "<li>They <strong>mulch clippings</strong> by default; bagging only on request. Clippings recycle nitrogen back into the lawn.</li>" +
                "<li>They offer organic or low-chemical options if you ask, with real product names.</li>" +
                "<li>They mention soil testing — Northern Illinois clay benefits from a $20 soil test every 2-3 years.</li></ul>" },
        { id: "common-mistakes", h: "Common mistakes homeowners make",
          html: "<p class=\"as-lede\"><mark>The single biggest mistake is mowing too short.</mark> Kentucky bluegrass and fescue thrive at 3.5-4 inches — cut shorter and you stress the lawn into weeds.</p>" +
                "<ul><li><strong>Mowing too short</strong> (under 3 inches) — stresses cool-season grass and invites crabgrass.</li>" +
                "<li><strong>Watering daily for short periods</strong> — better to water <strong>deep and infrequent</strong> (1 inch total per week, 2-3 sessions max).</li>" +
                "<li><strong>Fertilizing too early in spring</strong> — wait until the grass has greened up and is actively growing (typically late April).</li>" +
                "<li><strong>Using \"weed-and-feed\" products</strong> on established lawns — the pre-emergent half does nothing once the lawn is set, you're paying for filler.</li>" +
                "<li><strong>Skipping fall aeration</strong> — easily the highest-ROI single visit you can do, and most homeowners skip it.</li></ul>" +
                "<p class=\"as-source\">Further reading: <a href=\"https://landzie.com/blog/common-lawn-care-mistakes/\" target=\"_blank\" rel=\"noopener\">Common lawn care mistakes</a></p>" },
        { id: "diy-vs-pro", h: "DIY vs. hire a pro",
          html: "<p class=\"as-lede\">A useful rule of thumb: under <strong>1/4 acre</strong>, DIY usually wins. Over <strong>1/2 acre</strong>, hiring almost always wins on time alone.</p>" +
                "<p>Many homeowners do basic mowing themselves and <strong>hire out fertilization and aeration</strong> — that's the highest-leverage split. Aerator rental runs $80-$120/day and the equipment is heavy; one professional visit is usually cheaper.</p>" +
                "<p class=\"as-source\">Further reading: <a href=\"https://www.vibrantlivingnewsletter.com/single-post/2020/02/27/should-you-hire-a-professional-landscaper\" target=\"_blank\" rel=\"noopener\">Should you hire a professional landscaper?</a></p>" },
        { id: "questions-to-ask", h: "Questions to ask before hiring",
          html: "<p class=\"as-lede\">A short list that quickly separates real pros from \"a guy with a mower.\"</p>" +
                "<ul><li><strong>What products do you use?</strong> Can I see the labels?</li>" +
                "<li><strong>How do you handle clippings</strong> — mulch or bag? <em>(Mulch is the right default for our climate.)</em></li>" +
                "<li><strong>Do you aerate in spring or fall?</strong> <em>(Correct answer: fall for cool-season grass.)</em></li>" +
                "<li><strong>What's your schedule reliability</strong> — what happens after rain delays?</li>" +
                "<li><strong>Are you registered with the City of Crystal Lake</strong>, and do you carry liability insurance?</li></ul>" },
      ],
      sources: "University of Illinois Extension Lawn Talk; Crystal Lake watering ordinance",
    },
    "landscape-design": {
      title: "Landscape design & install", icon: "🎨",
      hero_label: "Designing your yard",
      theme: "peach",
      subtitle: "Designing a yard you actually use, with plants suited to Northern Illinois clay.",
      read_minutes: 7, last_updated: "May 2026", match_query: "landscape design",
      sections: [
        { id: "what-it-includes", h: "What landscape design includes",
          html: "<p class=\"as-lede\">A real design project has <strong>three phases</strong> — assessment, plan, install. Skipping the first two is how you end up with a yard that looks pretty for one season then falls apart.</p>" +
                "<ul><li><strong>Site assessment</strong> — sun mapping, soil test, drainage check, existing plants, sightlines from inside the house.</li>" +
                "<li><strong>Design plan</strong> — overhead drawing, plant list with mature sizes, hardscape elements, often a 3D rendering.</li>" +
                "<li><strong>Installation</strong> — bed prep (huge in our clay), planting, mulching, drip irrigation if included.</li>" +
                "<li><strong>Plant warranty</strong> — 1-year on plants is the industry standard; ask in writing.</li></ul>" },
        { id: "when-you-need-it", h: "When you need it",
          html: "<p class=\"as-lede\">The three classic triggers: a <strong>major yard renovation</strong>, a <strong>new construction home</strong> with a bare lot, or beds that just look tired and need a fresh plan.</p>" +
                "<ul><li>Before any project that moves more than $5K of dirt or plants.</li>" +
                "<li>When existing beds have lost structure and you want a real plan, not another round of marigolds.</li>" +
                "<li>When you're moving into a new construction home and the builder's \"landscaping\" is two boxwoods and sod.</li></ul>" },
        { id: "what-to-look-for", h: "What to look for in a pro",
          html: "<p class=\"as-lede\">A real designer asks about <strong>how you live in the yard</strong> — kids, dogs, parties, sightlines from the kitchen — not just what plants you like.</p>" +
                "<ul><li>They ask about your <strong>lifestyle</strong> and how you actually use the yard, not just plant preferences.</li>" +
                "<li>They include a real <strong>site assessment</strong> — not just \"what do you want planted?\"</li>" +
                "<li>They specify plants that thrive in our <strong>clay-heavy soil</strong> and freeze-thaw winters (or explain why for borderline picks).</li>" +
                "<li>They give you a <strong>written design plan</strong> you can keep — and reference later, even if you swap installers.</li>" +
                "<li>They're members of <strong>ILCA</strong> (Illinois Landscape Contractors Association) or have an APLD designer on staff.</li></ul>" +
                "<aside class=\"as-callout\"><strong>💡 Heads up:</strong> The site assessment is the most-skipped step. A pro who shows up, walks the yard for 5 minutes, and quotes a planting plan is selling plants — not designing a yard.</aside>" },
        { id: "common-mistakes", h: "Common mistakes homeowners make",
          html: "<p class=\"as-lede\">Most regret comes from <mark>buying plants by what they look like at the nursery</mark>, not by mature size and 4-season interest.</p>" +
                "<ul><li><strong>Buying plants without measuring</strong> — that 18-inch nursery shrub becomes 8 feet wide in 5 years.</li>" +
                "<li><strong>Planting too late in fall</strong> — after mid-October, plants don't have time to establish roots before frost.</li>" +
                "<li><strong>Skipping soil prep in our clay</strong> — \"we'll just dig a hole\" is how plants die in year two.</li>" +
                "<li><strong>Going all-annuals</strong> — they need replacing every year. Perennials and shrubs do more work for less cost over 5 years.</li>" +
                "<li><strong>Ignoring winter</strong> — an all-deciduous bed looks bare from November through April. Mix in some evergreens.</li></ul>" },
        { id: "diy-vs-pro", h: "DIY vs. hire a pro",
          html: "<p class=\"as-lede\">A useful split: <strong>small beds</strong> (10×10 ft, 5-8 plants) are very DIY-able. <strong>Whole-yard makeovers</strong> almost always warrant a pro for the design at minimum.</p>" +
                "<p>A great middle path: <strong>hire a designer for the plan</strong>, then DIY the install over a couple weekends. You get the expertise where it matters (plant selection, layout, soil prep) and save the labor markup.</p>" },
        { id: "questions-to-ask", h: "Questions to ask before hiring",
          html: "<p class=\"as-lede\">Five questions that separate a real designer from a glorified plant retailer.</p>" +
                "<ul><li><strong>Can I see your portfolio</strong> of installs in McHenry County specifically?</li>" +
                "<li><strong>What's your plant warranty</strong>, in writing?</li>" +
                "<li><strong>Do you provide a written design plan</strong> I can keep?</li>" +
                "<li><strong>How do you handle plants that fail</strong> in year 1?</li>" +
                "<li><strong>Are you a member of ILCA</strong> or do you have an APLD designer on staff?</li></ul>" },
      ],
      sources: "Illinois Landscape Contractors Association (ILCA); APLD design standards",
    },
    "hardscaping": {
      title: "Hardscaping", icon: "🪨",
      hero_label: "Patios, walls & walkways",
      theme: "stone",
      subtitle: "Patios, walls, and walkways built to survive Northern Illinois freeze-thaw.",
      read_minutes: 8, last_updated: "May 2026", match_query: "hardscaping",
      sections: [
        { id: "what-it-includes", h: "What hardscaping includes",
          html: "<p class=\"as-lede\">Hardscape covers everything in the yard that <strong>isn't a plant</strong> — and around here, it's where the budget and the durability questions live.</p>" +
                "<ul><li><strong>Patios</strong> — paver, poured concrete, or natural stone. Pavers run roughly <mark>$18-$30/sq ft installed</mark>.</li>" +
                "<li><strong>Walkways and driveways</strong> — stone, brick, paver, or stamped concrete.</li>" +
                "<li><strong>Retaining walls</strong> — segmental block, stone, timber. Anything over 4 ft requires engineering.</li>" +
                "<li><strong>Outdoor kitchens and fire pits</strong> — gas or wood-burning, plus optional pergolas or shade structures.</li>" +
                "<li><strong>Steps, edging, decorative stone</strong> — the small details that make hardscape look intentional.</li></ul>" },
        { id: "when-you-need-it", h: "When you need it",
          html: "<p class=\"as-lede\">The single biggest driver: <strong>making the yard usable</strong>. A patio turns 200 sq ft of grass into outdoor living space — same square footage, much higher value.</p>" +
                "<ul><li>Adding usable outdoor space (most common driver — accounts for ~60% of projects).</li>" +
                "<li>Solving <strong>drainage problems</strong> with retaining walls, swales, or French drains.</li>" +
                "<li>Replacing a <strong>deteriorating concrete patio</strong> that's heaved or cracked beyond repair.</li>" +
                "<li><strong>Property value</strong> — done well, hardscape recoups 60-80% at resale, and tops what new plantings return.</li></ul>" },
        { id: "what-to-look-for", h: "What to look for in a pro",
          html: "<p class=\"as-lede\">Around here it all comes down to one phrase: <strong>base prep</strong>. Get it right and the patio outlives you. Skimp and it's heaved in three winters.</p>" +
                "<ul><li>They lead with <strong>base preparation</strong>: 4-6 inches of compacted gravel + a sand or polymeric setting bed. Anything less is a future repair bill.</li>" +
                "<li>They reference our <strong>freeze-thaw cycles</strong> (~30 per winter) without being prompted.</li>" +
                "<li>They <strong>pull permits</strong> when required (Crystal Lake patios over 144 sq ft typically need one). The contractor handles it, not you.</li>" +
                "<li>They <strong>call 811 (JULIE)</strong> before digging — it's required by Illinois law, no exceptions.</li>" +
                "<li>They explain <strong>edging restraints</strong> and how they'll keep pavers from creeping outward over time.</li></ul>" +
                "<aside class=\"as-callout\"><strong>💡 Heads up:</strong> Base prep is roughly 40% of the project cost — and the line item nobody warns you about. If a quote feels suspiciously cheap, this is where corners are getting cut.</aside>" },
        { id: "common-mistakes", h: "Common mistakes homeowners make",
          html: "<p class=\"as-lede\">Most failures come from <mark>cutting corners on the foundation</mark> — the part you can't see once it's installed.</p>" +
                "<ul><li><strong>Skimping on base prep</strong> — patios fail in 2-3 winters without a proper compacted base.</li>" +
                "<li><strong>Not addressing drainage</strong> — water pooling causes shifting, weed growth, and joint sand washout.</li>" +
                "<li><strong>Choosing pavers without considering snow removal</strong> — smooth, large-format pavers are dramatically easier to shovel than small textured ones.</li>" +
                "<li><strong>Forgetting edging restraints</strong> — without spike-down edging, pavers creep outward and joints open.</li>" +
                "<li><strong>Picking color first, durability second</strong> — light pavers show stains; some natural stones don't handle salt well.</li></ul>" },
        { id: "diy-vs-pro", h: "DIY vs. hire a pro",
          html: "<p class=\"as-lede\">Rough rule: <strong>under 100 sq ft, simple square shape</strong> = DIY-able if you're handy. Bigger, curved, or sloped = hire.</p>" +
                "<p>Retaining walls <strong>over 4 feet</strong> require engineering and a permit — always hire those, no exceptions. The math on lateral pressure and drainage isn't worth getting wrong.</p>" },
        { id: "questions-to-ask", h: "Questions to ask before hiring",
          html: "<p class=\"as-lede\">Five questions that will quickly tell you whether the contractor knows our climate.</p>" +
                "<ul><li><strong>What base depth do you build to?</strong> <em>(4 inches minimum; 6 inches better in clay.)</em></li>" +
                "<li><strong>What's your workmanship warranty?</strong> <em>(2+ years on labor is standard.)</em></li>" +
                "<li><strong>Will you pull the permit?</strong> <em>(\"Yes\" is the right answer; \"you should\" is a red flag.)</em></li>" +
                "<li><strong>Will you call 811?</strong> <em>(Required by law; should be a non-question.)</em></li>" +
                "<li><strong>Can I see patios you've installed in McHenry County</strong> that are 5+ years old?</li></ul>" },
      ],
      sources: "ICPI installation guidelines; Crystal Lake building permit requirements; JULIE 811 Illinois",
    },
    "tree-shrub-care": {
      title: "Tree & shrub care", icon: "🌳",
      hero_label: "Trees & shrubs",
      theme: "forest",
      subtitle: "Pruning, removal, and disease management — when an arborist matters.",
      read_minutes: 8, last_updated: "May 2026", match_query: "tree work",
      sections: [
        { id: "what-it-includes", h: "What tree & shrub care includes",
          html: "<p class=\"as-lede\">Tree work is the highest-stakes category in landscaping — equipment near power lines, gravity, and very expensive mistakes if it goes wrong.</p>" +
                "<ul><li><strong>Pruning</strong> — timing matters and varies by species (oaks: winter only; flowering shrubs: right after bloom).</li>" +
                "<li><strong>Disease and pest treatment</strong> — emerald ash borer, oak wilt, apple scab, fungal issues. Treatment runs ~<mark>$10/diameter inch</mark> for trunk injection.</li>" +
                "<li><strong>Removal</strong> of dead, dying, or hazardous trees — typically $400-$2,500 depending on size and access.</li>" +
                "<li><strong>Planting</strong> of new trees and shrubs, with proper hole prep for our clay.</li>" +
                "<li><strong>Cabling and bracing</strong> to stabilize structurally weak trees and prevent splits.</li></ul>" },
        { id: "when-you-need-it", h: "When you need it",
          html: "<p class=\"as-lede\">Most homeowners under-maintain trees — until a storm makes the decision for them. <strong>Annual inspection by an arborist</strong> is cheap insurance for any tree over 20 ft.</p>" +
                "<ul><li><strong>Annual or biannual pruning</strong> maintains health, form, and reduces storm-damage risk.</li>" +
                "<li><strong>After storm damage</strong> — even small breaks invite disease and create future hazards.</li>" +
                "<li>When you notice <strong>dieback</strong>, unusual leaf color, bark damage, or D-shaped exit holes (EAB signature).</li>" +
                "<li>Before <strong>construction work</strong> — root damage from a backhoe can kill a tree two years later.</li></ul>" },
        { id: "what-to-look-for", h: "What to look for in a pro",
          html: "<p class=\"as-lede\">In tree work, <strong>credentials and insurance are not optional</strong>. The cost of a mistake comes out of either their pocket or yours.</p>" +
                "<ul><li>They are an <strong>ISA Certified Arborist</strong> (or have one on staff who reviews recommendations).</li>" +
                "<li>They carry <strong>$1M+ liability insurance</strong> and workers' comp — ask to see the certificate.</li>" +
                "<li>They explain <strong>why</strong> they're recommending pruning or removal, with evidence — not just \"it looks bad.\"</li>" +
                "<li>They <strong>refuse to \"top\" a tree</strong>. This is a non-negotiable; topping is malpractice.</li>" +
                "<li>They handle <strong>clean-up and haul-away</strong> and don't leave you with a yard full of brush.</li></ul>" +
                "<aside class=\"as-callout\"><strong>💡 Heads up:</strong> If anyone offers to \"top\" a tree (cutting all main branches back to stubs), say no and find someone else. Topping weakens trees, creates weak regrowth, and turns into a future hazard. Reputable arborists refuse the job.</aside>" },
        { id: "common-mistakes", h: "Common mistakes homeowners make",
          html: "<p class=\"as-lede\">Two big regrets around here: <mark>ignoring emerald ash borer until the tree is past saving</mark>, and pruning oaks at the wrong time of year.</p>" +
                "<ul><li><strong>Ignoring emerald ash borer signs</strong> until the tree is past saving — early treatment ($150-$300) beats late removal ($1,500+).</li>" +
                "<li><strong>Pruning oaks April through July</strong> — high oak wilt risk in our area. Prune oaks in <strong>winter only</strong>.</li>" +
                "<li><strong>Removing healthy lower branches</strong> \"to clean up the look\" — this stresses trees, especially young ones.</li>" +
                "<li><strong>Hiring uninsured tree services</strong> — one mistake becomes your homeowner's-insurance problem and a year of paperwork.</li>" +
                "<li><strong>Letting storm damage sit</strong> — small breaks become big hazards in the next windstorm.</li></ul>" },
        { id: "diy-vs-pro", h: "DIY vs. hire a pro",
          html: "<p class=\"as-lede\">Useful split: <strong>shrubs you can reach without a ladder</strong> = DIY. <strong>Anything over 15 ft, near power lines, or requiring a chainsaw at height</strong> = hire.</p>" +
                "<p>Diagnosis of tree health issues is <strong>always</strong> arborist territory. Misdiagnosing oak wilt vs. drought stress vs. EAB can cost a $5,000 mature tree.</p>" },
        { id: "questions-to-ask", h: "Questions to ask before hiring",
          html: "<p class=\"as-lede\">Five questions that filter out the \"two guys and a truck\" outfits from real arborists.</p>" +
                "<ul><li><strong>Are you ISA Certified?</strong> Can I see your certification number?</li>" +
                "<li><strong>What's your insurance coverage?</strong> Can I get a certificate listing me as additional insured?</li>" +
                "<li><strong>Do you climb or use a bucket truck?</strong> <em>(Both are valid; experience matters more than method.)</em></li>" +
                "<li><strong>Will you \"top\" my tree?</strong> <em>(Correct answer: no — they should refuse and explain why.)</em></li>" +
                "<li><strong>Do you handle clean-up and haul-away</strong>, or do I get a yard full of brush?</li></ul>" },
      ],
      sources: "International Society of Arboriculture; Illinois Department of Agriculture EAB program; Morton Arboretum tree species recommendations",
    },
    "irrigation-drainage": {
      title: "Irrigation & drainage", icon: "💧",
      hero_label: "Water & drainage",
      theme: "blue",
      subtitle: "Sprinklers, drip lines, French drains, and yard grading for Northern Illinois clay.",
      read_minutes: 7, last_updated: "May 2026", match_query: "irrigation and drainage",
      sections: [
        { id: "what-it-includes", h: "What irrigation & drainage includes",
          html: "<p class=\"as-lede\">Two related categories that often overlap: <strong>getting water to plants</strong>, and <strong>getting water away from your house</strong>. Pros that do both well are gold.</p>" +
                "<ul><li><strong>Sprinkler system installation</strong> — typically 4-8 zones for a residential lot, runs <mark>$3,500-$7,500</mark> installed.</li>" +
                "<li><strong>Drip irrigation</strong> for beds — much more efficient for plantings, easier to retrofit.</li>" +
                "<li><strong>Smart controllers</strong> — Wi-Fi, weather-aware. Cuts water bills 20-40% vs. fixed schedules.</li>" +
                "<li><strong>French drains</strong> for yard water management — typical residential install runs $25-$50/linear foot.</li>" +
                "<li><strong>Yard grading</strong> to redirect water away from foundations.</li>" +
                "<li><strong>Backflow preventer installation</strong> — required by Illinois plumbing code, requires a licensed plumber.</li></ul>" },
        { id: "when-you-need-it", h: "When you need it",
          html: "<p class=\"as-lede\">Drainage problems get worse every year you ignore them. <strong>If water pools near your foundation, fix it this season</strong> — basement repair costs 10x more than yard grading.</p>" +
                "<ul><li>Lawn or beds suffering from <strong>inconsistent watering</strong> (brown patches that won't recover).</li>" +
                "<li><strong>Water pooling</strong> in the yard or, worse, near the foundation.</li>" +
                "<li>Ongoing <strong>wet basement</strong> — often a yard-grading issue, not a foundation issue.</li>" +
                "<li>Wanting to <strong>reduce manual watering effort</strong> or your water bill.</li></ul>" },
        { id: "what-to-look-for", h: "What to look for in a pro",
          html: "<p class=\"as-lede\">For drainage especially, the <strong>diagnosis matters more than the install</strong>. A good pro walks the yard during or after rain before quoting.</p>" +
                "<ul><li>They do a real <strong>site assessment</strong> — pressure test, meter check, soil test — not just \"we'll install zones.\"</li>" +
                "<li>They <strong>install a backflow preventer</strong> as part of every job. Required by IL plumbing code.</li>" +
                "<li>They include or explain <strong>winterization</strong> — blowing the system out before first hard freeze.</li>" +
                "<li>They <strong>size the system to your water pressure</strong> and meter — oversized systems lose pressure and coverage.</li>" +
                "<li>They use <strong>smart controllers</strong> by default, not 90s-era timer boxes.</li></ul>" +
                "<aside class=\"as-callout\"><strong>💡 Heads up:</strong> A backflow preventer is required by Illinois plumbing code and protects the public water supply. If a contractor offers to skip it or won't pull the permit, walk away — they're cutting a legal corner.</aside>" },
        { id: "common-mistakes", h: "Common mistakes homeowners make",
          html: "<p class=\"as-lede\">The most common waste of money: <mark>watering daily for 10 minutes</mark>. Lawns need deep, infrequent water — not daily sprinkles.</p>" +
                "<ul><li><strong>Set-and-forget</strong> on the controller — smart controllers fix this automatically.</li>" +
                "<li><strong>Watering daily for 10 minutes</strong> — better to water deep <strong>2-3 times per week</strong> for 20-30 minutes.</li>" +
                "<li><strong>Skipping winterization</strong> — Northern Illinois freezes will crack pipes and valves. Budget $75-$150/year for blow-out.</li>" +
                "<li><strong>Too many heads per zone</strong> — pressure drops, coverage suffers, costs more in the long run.</li>" +
                "<li><strong>Ignoring the watering ordinance</strong> (May 15-Sep 15, odd/even by address, mornings and evenings only).</li></ul>" },
        { id: "diy-vs-pro", h: "DIY vs. hire a pro",
          html: "<p class=\"as-lede\">Drip irrigation in beds is <strong>very DIY-able</strong> with a $50 kit from any hardware store. Full lawn systems require digging, plumbing, and a backflow preventer — hire.</p>" +
                "<p>French drains and yard grading are pure pro territory — <strong>the math on slope, pipe size, and discharge point is real</strong>, and DIY mistakes show up as a wet basement two years later.</p>" },
        { id: "questions-to-ask", h: "Questions to ask before hiring",
          html: "<p class=\"as-lede\">Five questions specific to our climate and code requirements.</p>" +
                "<ul><li><strong>Do you install backflow preventers</strong> and pull the permit?</li>" +
                "<li><strong>What's your warranty</strong> on heads, valves, and labor?</li>" +
                "<li><strong>Do you offer winterization</strong>, and what's the schedule?</li>" +
                "<li><strong>Can I see the design plan</strong> before installation?</li>" +
                "<li><strong>Are you a licensed plumber</strong> (required for backflow work) or do you sub it out?</li></ul>" },
      ],
      sources: "City of Crystal Lake watering ordinance; Illinois plumbing code Section 890.1140 (backflow prevention)",
    },
    "seasonal-cleanup": {
      title: "Seasonal cleanup", icon: "🍂",
      hero_label: "Seasonal cleanups",
      theme: "amber",
      subtitle: "Spring & fall cleanups and snow management — when to book and what's included.",
      read_minutes: 7, last_updated: "May 2026", match_query: "seasonal cleanup",
      sections: [
        { id: "what-it-includes", h: "What seasonal cleanup includes",
          html: "<p class=\"as-lede\">Three related services that almost always come from the same pro: <strong>spring cleanup, fall cleanup, and winter snow management</strong>.</p>" +
                "<ul><li><strong>Spring cleanup</strong> — debris removal, bed clearing, edging refresh, first-cut prep. Runs <mark>$200-$500</mark> for a typical lot.</li>" +
                "<li><strong>Fall cleanup</strong> — leaf removal, perennial cutback, gutter clearing, beds prepared for winter. <mark>$250-$700</mark> depending on tree cover.</li>" +
                "<li><strong>Snow and ice management</strong> — plowing, shoveling, salting. Per-storm or seasonal contract.</li>" +
                "<li><strong>Winter storm preparation</strong> — wrapping tender shrubs, anti-desiccant spray on evergreens.</li>" +
                "<li><strong>Annual mulch refresh</strong> — typically spring; budget $50-$80/cubic yard installed.</li></ul>" },
        { id: "when-you-need-it", h: "When you need it",
          html: "<p class=\"as-lede\">Even DIY-heavy homeowners often <strong>hire just the cleanups</strong> — they're physical, time-bound work that happens at the busiest times of the year.</p>" +
                "<ul><li>Most homeowners hire seasonal cleanup at minimum, even if they handle weekly maintenance themselves.</li>" +
                "<li>Especially valuable for <strong>older homeowners</strong>, frequent travelers, or anyone with mature trees (leaf volume gets unmanageable fast).</li>" +
                "<li><strong>Snow management contracts</strong> typically run November through March.</li>" +
                "<li>Mulch refresh has the highest curb-appeal-per-dollar of any spring task.</li></ul>" +
                "<aside class=\"as-callout\"><strong>💡 Heads up:</strong> Snow contracts book up by mid-October. Don't wait until the first storm — by then the good services are already at capacity.</aside>" },
        { id: "what-to-look-for", h: "What to look for in a pro",
          html: "<p class=\"as-lede\">For snow especially, <strong>reliability beats price</strong>. The cheapest plow service that ghosts you during a 12-inch storm isn't actually cheap.</p>" +
                "<ul><li>They <strong>specify what's included</strong> in spring vs. fall cleanup packages — these are different jobs.</li>" +
                "<li>They offer both <strong>contract pricing</strong> (predictable) and <strong>per-visit pricing</strong> (flexible).</li>" +
                "<li>For snow: they have <strong>backup equipment and drivers</strong>. One truck breaks = service stops if they don't.</li>" +
                "<li>They use <strong>pet- and plant-safe ice melt</strong> (calcium chloride or magnesium chloride; not rock salt near beds).</li>" +
                "<li>They publish a <strong>snow trigger</strong> — the depth that activates plowing (usually 2 inches).</li></ul>" },
        { id: "common-mistakes", h: "Common mistakes homeowners make",
          html: "<p class=\"as-lede\">The most common mistake is <mark>over-cleaning</mark>. Some leaf litter actually helps the soil; perennial seed heads feed birds through winter.</p>" +
                "<ul><li><strong>Removing every fallen leaf</strong> — a thin layer mulches the lawn naturally. Mowing them in beats raking them out.</li>" +
                "<li><strong>Cutting back perennials too early</strong> — leaving seed heads feeds birds and adds winter interest.</li>" +
                "<li><strong>Using rock salt on driveways adjacent to lawn</strong> — it kills grass at the edges all summer.</li>" +
                "<li><strong>Not signing a snow contract until November</strong> — good services book up by October.</li>" +
                "<li><strong>Forgetting to protect tender plants</strong> before first frost (typically early-to-mid October).</li></ul>" },
        { id: "diy-vs-pro", h: "DIY vs. hire a pro",
          html: "<p class=\"as-lede\">Spring cleanup is <strong>very DIY-able</strong> with a free weekend. Fall cleanup gets harder fast as leaf volume balloons. Snow management depends on driveway size and your relationship with a 4 AM alarm.</p>" +
                "<p>For mature lots with lots of trees, <strong>fall is when hiring pays for itself</strong> — you're often dealing with 20+ bags of leaves over multiple weekends.</p>" },
        { id: "questions-to-ask", h: "Questions to ask before hiring",
          html: "<p class=\"as-lede\">Five questions to ask before signing a contract — especially the snow ones.</p>" +
                "<ul><li><strong>What's included</strong> in your spring vs. fall cleanup packages?</li>" +
                "<li>For snow: <strong>what's your trigger depth</strong>, and how soon after the storm do you finish?</li>" +
                "<li>Do you have <strong>backup equipment and drivers</strong> for storms?</li>" +
                "<li><strong>What ice melt do you use</strong>, and is it safe for pets and plants?</li>" +
                "<li><strong>When do contracts need to be signed</strong> for the season — and what's your cancellation policy?</li></ul>" },
      ],
      sources: "National Weather Service Chicago snow climatology; City of Crystal Lake snow removal ordinance",
    },
  };

  function renderArticleStageIndex() {
    const cards = ARTICLE_ORDER.map((slug) => {
      const a = ARTICLES[slug];
      const imgURL = articleImageURL(slug, "hero");
      const inner = imgURL
        ? `<img src="${esc(imgURL)}" alt="" loading="lazy" /><span class="as-idx-card-emoji as-idx-card-emoji-overlay">${esc(a.icon)}</span>`
        : `<span class="as-idx-card-emoji">${esc(a.icon)}</span>`;
      return `
        <a class="as-idx-card as-theme-${esc(a.theme)}${imgURL ? " as-has-img" : ""}" data-article-slug="${esc(slug)}" href="/landscaping/services/${esc(slug)}">
          <div class="as-idx-card-img" aria-hidden="true">${inner}</div>
          <div class="as-idx-card-body">
            <h3>${esc(a.title)}</h3>
            <p>${esc(ARTICLE_SHORT[slug] || "")}</p>
            <span class="as-idx-card-cta">Read the guide →</span>
          </div>
        </a>`;
    }).join("");
    return `
      <div class="as-container">
        <div class="as-idx-hero">
          <h1>Landscaping services in Crystal Lake</h1>
          <p>Read about what each service involves, what to look for in a pro, and when to hire vs. handle it yourself. Plain English, regional specifics, no marketing fluff.</p>
        </div>
        <div class="as-idx-grid">${cards}</div>
      </div>`;
  }

  function renderArticleStageBody(slug) {
    const a = ARTICLES[slug];
    if (!a) {
      return `<div class="as-narrow" style="padding:64px 24px;text-align:center;">
        <h1 style="font-family:'Marcellus',serif;font-weight:400;font-size:32px;">Article not found</h1>
        <p>Try the <a class="as-back" data-article-slug="">services index</a>.</p>
      </div>`;
    }
    const toc = `
      <nav class="as-toc" aria-label="In this guide">
        <p class="as-toc-label">In this guide</p>
        <ul>${a.sections.map((s) => {
          const em = SECTION_EMOJI[s.id] || "•";
          return `<li><a href="#${esc(s.id)}"><span class="as-toc-em">${esc(em)}</span> ${esc(s.h)}</a></li>`;
        }).join("")}</ul>
      </nav>`;
    const body = a.sections.map((s, i) => {
      const em = SECTION_EMOJI[s.id] || "•";
      const flip = (i % 2 === 1) ? " as-section-row-flip" : "";
      const imgURL = articleImageURL(slug, s.id);
      const imgInner = imgURL
        ? `<img src="${esc(imgURL)}" alt="" loading="lazy" />
           <span class="as-section-img-emoji as-section-img-emoji-overlay">${esc(em)}</span>`
        : `<span class="as-section-img-emoji">${esc(em)}</span>`;
      return `
        <section id="${esc(s.id)}" class="as-section-row${flip}" data-as-reveal>
          <div class="as-section-img as-theme-${esc(a.theme)}${imgURL ? " as-has-img" : ""}" aria-hidden="true">
            ${imgInner}
          </div>
          <div class="as-section-content">
            <h2><span class="as-section-h-emoji" aria-hidden="true">${esc(em)}</span> ${esc(s.h)}</h2>
            ${s.html}
          </div>
        </section>`;
    }).join("");
    const otherSlugs = ARTICLE_ORDER.filter((x) => x !== slug);
    const related = `
      <div class="as-related">
        <p class="as-related-label">Other landscaping services</p>
        <div class="as-related-pills">
          ${otherSlugs.map((s) => `<a class="as-related-pill" data-article-slug="${esc(s)}" href="/landscaping/services/${esc(s)}">${esc(ARTICLES[s].icon)} ${esc(ARTICLES[s].title)}</a>`).join("")}
        </div>
      </div>`;
    const cta = `
      <div class="as-cta">
        <h3>Ready to find a ${esc(a.title.toLowerCase())} pro?</h3>
        <p>We'll match you with up to three local pros in McHenry County. Free, no commitment.</p>
        <a class="as-cta-btn" data-article-cta="${esc(a.match_query)}" href="/landscaping?q=${encodeURIComponent(a.match_query)}">Get matched in 30 seconds →</a>
      </div>`;
    const sources = a.sources ? `<p class="as-sources"><strong>Sources:</strong> ${esc(a.sources)}</p>` : "";
    const heroImgURL = articleImageURL(slug, "hero");
    const hero = `
      <div class="as-hero-img as-theme-${esc(a.theme)}${heroImgURL ? " as-has-img" : ""}" aria-hidden="true">
        ${heroImgURL ? `<img src="${esc(heroImgURL)}" alt="" loading="eager" />` : ""}
        <span class="as-hero-emoji${heroImgURL ? " as-hero-emoji-overlay" : ""}">${esc(a.icon)}</span>
        <span class="as-hero-label">${esc(a.hero_label || a.title)}</span>
      </div>`;

    return `
      <div class="as-narrow">
        <a class="as-back" data-article-back-home title="Back to services">Back to services</a>
        <p class="as-breadcrumb"><a data-article-home>Home</a> / <a data-article-slug="">Services</a> / ${esc(a.title)}</p>
        ${hero}
        <header class="as-art-header">
          <h1>${esc(a.title)}</h1>
          <p class="as-subtitle">${esc(a.subtitle)}</p>
          <p class="as-meta">${esc(a.read_minutes)}-min read · Updated ${esc(a.last_updated)}</p>
        </header>
        ${toc}
        <article class="as-body">${body}</article>
        ${cta}
        ${related}
        ${sources}
        <div class="as-footer-spacer"></div>
      </div>`;
  }

  function showArticleStage(slug) {
    const stage = document.getElementById("article-stage");
    if (!stage) return;
    document.title = slug
      ? `${ARTICLES[slug] ? ARTICLES[slug].title : "Article"} in Crystal Lake | McHenry County Landscapers`
      : "Landscaping services in Crystal Lake | McHenry County Landscapers";
    document.body.classList.add("article-mode");

    const renderNow = () => {
      stage.innerHTML = slug ? renderArticleStageBody(slug) : renderArticleStageIndex();
      stage.hidden = false;
      armArticleReveals(stage);
    };

    // Render immediately with whatever we have (gradient placeholders if
    // the manifest hasn't loaded yet), then re-render once images arrive.
    renderNow();
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (!_articleImageManifest) {
      loadArticleImageManifest().then(() => {
        if (!document.body.classList.contains("article-mode")) return;
        renderNow();
      });
    }
  }

  function armArticleReveals(root) {
    if (!root || !("IntersectionObserver" in window)) return;
    const targets = root.querySelectorAll("[data-as-reveal]");
    if (!targets.length) return;
    let i = 0;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // small stagger so multi-card-in-view loads cascade
          const el = entry.target;
          setTimeout(() => el.classList.add("as-revealed"), (i++ % 6) * 70);
          obs.unobserve(el);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    targets.forEach((t) => obs.observe(t));
  }

  function hideArticleStage() {
    const stage = document.getElementById("article-stage");
    if (stage) { stage.hidden = true; stage.innerHTML = ""; }
    document.body.classList.remove("article-mode");
  }

  function articleSlugFromPath(path) {
    const m = path.match(/^\/(?:landscaping|landscape)\/services(?:\/([a-z0-9-]+))?\/?$/);
    if (!m) return false;             // not a services route
    return m[1] || "";                // "" = index, slug otherwise
  }

  // Smooth fade-exit-left — 380ms gentle ease, larger horizontal travel,
  // subtle scale-down so the section feels like it's drifting away rather
  // than snapping. Returns when the transition completes.
  function fadeExitLeft(el) {
    return new Promise((resolve) => {
      if (!el) return resolve();
      const D = 380;
      el.style.transition =
        `transform ${D}ms cubic-bezier(0.4, 0, 0.2, 1),` +
        ` opacity ${D}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      el.style.willChange = "transform, opacity";
      void el.offsetWidth;
      el.style.transform = "translateX(-80px) scale(0.985)";
      el.style.opacity = "0";
      setTimeout(() => {
        el.style.transition = "";
        el.style.transform = "";
        el.style.opacity = "";
        el.style.willChange = "";
        resolve();
      }, D);
    });
  }

  // Click on a service card → fade THAT section out (where the user is
  // looking), then enter article mode. Origin-anchored animation.
  async function navigateToArticleWithFade(slug, originEl) {
    if (!document.body.classList.contains("article-mode")) {
      const section = originEl ? originEl.closest("section") : null;
      if (section) {
        await fadeExitLeft(section);
      } else {
        // Fallback to fading the hero content if the click didn't come
        // from a section (e.g. programmatic navigation)
        const heroContent = document.getElementById("heroContent");
        if (heroContent) await fadeExitLeft(heroContent);
      }
    }
    history.pushState({ articleRoute: true }, "",
      "/landscaping/services" + (slug ? "/" + slug : ""));
    showArticleStage(slug);
  }

  function bindArticleStage() {
    // Service cards on the home page
    document.querySelectorAll('.service-card[href^="/landscaping/services/"]').forEach((card) => {
      card.addEventListener("click", (e) => {
        e.preventDefault();
        const m = card.getAttribute("href").match(/\/landscaping\/services\/(.+)/);
        if (m) navigateToArticleWithFade(m[1], card);
      });
    });

    // Delegated click handlers for any in-stage links (back, related, breadcrumb)
    document.addEventListener("click", (e) => {
      // Back / breadcrumb services link → index (slug = "")
      const slugLink = e.target.closest("[data-article-slug]");
      if (slugLink) {
        e.preventDefault();
        const slug = slugLink.getAttribute("data-article-slug") || "";
        history.pushState({ articleRoute: true }, "",
          "/landscaping/services" + (slug ? "/" + slug : ""));
        showArticleStage(slug);
        return;
      }
      // Breadcrumb "Home" → exit article mode (lands at top of home)
      if (e.target.closest("[data-article-home]")) {
        e.preventDefault();
        history.pushState({}, "", "/landscaping");
        hideArticleStage();
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        return;
      }
      // "← Back to services" → fade the article away, exit article mode,
      // jump to the services section on the home page (same animation
      // family as the forward navigation).
      if (e.target.closest("[data-article-back-home]")) {
        e.preventDefault();
        const stage = document.getElementById("article-stage");
        const finish = () => {
          history.pushState({}, "", "/landscaping");
          hideArticleStage();
          requestAnimationFrame(() => {
            const target = document.getElementById("services");
            if (target) {
              const y = target.getBoundingClientRect().top + window.pageYOffset;
              window.scrollTo({ top: y, left: 0, behavior: "instant" });
            }
            // Soft slide-in for the services section so it doesn't pop
            const svc = target;
            if (svc) {
              svc.style.transition = "transform 380ms cubic-bezier(0.16, 1, 0.3, 1), opacity 380ms cubic-bezier(0.16, 1, 0.3, 1)";
              svc.style.transform = "translateX(40px)";
              svc.style.opacity = "0";
              void svc.offsetWidth;
              requestAnimationFrame(() => {
                svc.style.transform = "translateX(0)";
                svc.style.opacity = "1";
                setTimeout(() => {
                  svc.style.transition = ""; svc.style.transform = ""; svc.style.opacity = "";
                }, 400);
              });
            }
          });
        };
        if (stage && !stage.hidden) fadeExitLeft(stage).then(finish);
        else finish();
        return;
      }
      // CTA "Get matched" — exit article mode + run the search
      const cta = e.target.closest("[data-article-cta]");
      if (cta) {
        e.preventDefault();
        const q = cta.getAttribute("data-article-cta") || "landscaping";
        history.pushState({}, "", "/landscaping");
        hideArticleStage();
        // Wait one frame so layout settles, then run the search
        setTimeout(() => runHomeSearch(q), 30);
        return;
      }
    });
  }

  // ==========================================================================
  // In-page AI search — keeps hero+input visible, replaces page below
  // ==========================================================================

  // Keyword → service-category classifier. Each category has positive
  // keyword/phrase patterns that score the query toward it.
  const SEARCH_KEYWORDS = {
    tree_shrub: {
      label: "Tree care pros",
      label_short: "tree care",
      patterns: [/\btrees?\b/i, /\bbranch/i, /\bprune?/i, /\barborist/i, /\bstump/i,
                 /\bshrubs?\b/i, /\bbush(es)?\b/i, /\btrim/i, /\bcanopy/i, /\bdiseased? tree/i],
    },
    lawn_care: {
      label: "Lawn care pros",
      label_short: "lawn care",
      patterns: [/\blawn/i, /\bgrass/i, /\bmow/i, /\bmowing/i, /\bweed/i, /\bfertili[sz]/i,
                 /\baerat/i, /\boverseed/i, /\bsod\b/i, /\bturf\b/i, /\byard maint/i],
    },
    hardscape: {
      label: "Hardscape pros",
      label_short: "hardscaping",
      patterns: [/\bpatio/i, /\bpaver/i, /\bwalkway/i, /\bretaining wall/i, /\bbrick/i,
                 /\bstone\b/i, /\bfire pit/i, /\boutdoor kitchen/i, /\bpathway/i, /\bdriveway/i],
    },
    design_install: {
      label: "Design pros",
      label_short: "garden design",
      patterns: [/\bdesign/i, /\bgarden/i, /\bplanting/i, /\bmakeover/i, /\blandscape\b/i,
                 /\bnative plant/i, /\bbackyard renov/i, /\bfront yard/i, /\bornamental/i,
                 /\bflower bed/i, /\binstall plant/i],
    },
    irrigation: {
      label: "Irrigation pros",
      label_short: "sprinklers and drainage",
      patterns: [/\bsprinkler/i, /\birrigation/i, /\bdrainage/i, /\bfrench drain/i,
                 /\bsoggy/i, /\bboggy/i, /\bwet (yard|spot)/i, /\bgrade\b/i, /\bgrading/i,
                 /\bwater(ing)? (system|control)/i],
    },
    seasonal: {
      label: "Seasonal cleanup pros",
      label_short: "seasonal cleanup",
      patterns: [/\bsnow\b/i, /\bplow/i, /\bleaf/i, /\bleaves/i, /\bcleanup/i, /\bclean[- ]?up/i,
                 /\bgutter/i, /\bspring (clean|prep)/i, /\bfall (clean|prep)/i],
    },
  };

  // Sort modifiers parsed from the query.
  const SEARCH_SORT_MODS = {
    rating:  /\bbest\b|\btop[- ]?rated\b|\bhighest[- ]?rated\b|\b5[- ]star/i,
    reviews: /\bmost reviewed\b|\bpopular\b|\bbig company\b|\bestablished\b/i,
    cheap:   /\bcheap\b|\baffordable\b|\bbudget\b|\blow[- ]?cost\b/i,
  };

  // ----- Full-text knowledge-base scoring -----
  // Build a single lowercase searchable blob per pro from EVERY profile
  // field we have: name, city, services_offered, summary, when_to_use,
  // service_area, specialties, certifications, warranty, review themes,
  // and verbatim review text. Cached on the pro object after first build.
  const SEARCH_STOP_WORDS = new Set([
    "a","an","and","or","the","in","on","at","of","for","to","with","by",
    "from","my","our","your","this","that","i","we","you","it","is","are",
    "am","was","were","be","been","do","does","did","have","has","had",
    "can","could","should","would","will","need","want","get","find",
    "looking","look","search","near","me","some","any","all","please",
    "would","like","help","there","their","them","they","just","really",
    "very","also","new","best","good","great",
  ]);

  function tokenizeQuery(q) {
    return String(q || "").toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .filter((t) => t.length >= 2 && !SEARCH_STOP_WORDS.has(t));
  }

  function buildProSearchText(pro) {
    const profile = pro.profile || {};
    const reviews = pro.verbatim_reviews || [];
    const creds = profile.credentials || {};
    const themes = (profile.review_themes || []).map((t) => t && t.theme).filter(Boolean);
    const parts = [
      pro.name, pro.city, pro.address,
      profile.summary_for_homeowner,
      profile.when_to_use,
      profile.service_area,
      (profile.services_offered || []).join(" "),
      (profile.specialties || []).join(" "),
      (profile.common_concerns_addressed || []).join(" "),
      profile.warranty,
      (creds.certifications || []).join(" "),
      themes.join(" "),
      reviews.map((r) => (r.text || "")).join(" "),
    ].filter(Boolean).join(" ").toLowerCase();
    return parts;
  }

  function scoreProForQuery(pro, tokens) {
    if (!tokens.length) return 0;
    const text = pro._search_text || (pro._search_text = buildProSearchText(pro));
    let hits = 0;
    for (const t of tokens) if (text.includes(t)) hits += 1;
    return hits;
  }

  function parseSearchQuery(text) {
    const q = String(text || "").toLowerCase();

    // Score each category by # patterns matched
    const scores = {};
    for (const [cat, def] of Object.entries(SEARCH_KEYWORDS)) {
      let score = 0;
      for (const re of def.patterns) if (re.test(q)) score += 1;
      if (score > 0) scores[cat] = score;
    }

    // Pick top categories (allow multi-match if user said e.g. "patio and lawn")
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topScore = ranked.length ? ranked[0][1] : 0;
    const matched = ranked
      .filter(([, s]) => s === topScore || s >= topScore - 1) // allow ties + close 2nd
      .map(([c]) => c);

    // Sort preference
    let sortBy = "rating"; // default
    if (SEARCH_SORT_MODS.reviews.test(q))      sortBy = "reviews";
    else if (SEARCH_SORT_MODS.cheap.test(q))   sortBy = "reviews"; // proxy for popularity
    else if (SEARCH_SORT_MODS.rating.test(q))  sortBy = "rating";

    return { matched, sortBy };
  }

  function pageSectionsToToggle() {
    return [
      "#choose-path", "#categories", "#how", "#ask-ai",
      "#services", "#pros-table", "#cost", "#faq", "#service-area",
    ].map((s) => document.querySelector(s)).filter(Boolean);
  }

  const _wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ----- Static ZIP → city map for the McHenry County service area
  // Centroid lat/lng included so we can sort search results by distance
  // when the user gives us a ZIP (no browser geolocation available).
  const SERVICE_AREA_ZIPS = {
    "60010": { city: "Barrington",        state: "IL", in_service_area: true, lat: 42.1530, lng: -88.1359 },
    "60012": { city: "Crystal Lake",      state: "IL", in_service_area: true, lat: 42.2756, lng: -88.3403 },
    "60013": { city: "Cary",              state: "IL", in_service_area: true, lat: 42.2228, lng: -88.2354 },
    "60014": { city: "Crystal Lake",      state: "IL", in_service_area: true, lat: 42.2367, lng: -88.3184 },
    "60020": { city: "Fox Lake",          state: "IL", in_service_area: true, lat: 42.4181, lng: -88.1864 },
    "60021": { city: "Fox River Grove",   state: "IL", in_service_area: true, lat: 42.1972, lng: -88.2150 },
    "60030": { city: "Grayslake",         state: "IL", in_service_area: true, lat: 42.3500, lng: -88.0500 },
    "60033": { city: "Harvard",           state: "IL", in_service_area: true, lat: 42.4225, lng: -88.6120 },
    "60034": { city: "Hebron",            state: "IL", in_service_area: true, lat: 42.4717, lng: -88.4359 },
    "60039": { city: "McHenry",           state: "IL", in_service_area: true, lat: 42.3486, lng: -88.2735 },
    "60041": { city: "Fox Lake",          state: "IL", in_service_area: true, lat: 42.4181, lng: -88.1864 },
    "60042": { city: "Island Lake",       state: "IL", in_service_area: true, lat: 42.2786, lng: -88.1948 },
    "60046": { city: "Antioch",           state: "IL", in_service_area: true, lat: 42.4769, lng: -88.0956 },
    "60047": { city: "Lake Zurich",       state: "IL", in_service_area: true, lat: 42.1969, lng: -88.0934 },
    "60050": { city: "McHenry",           state: "IL", in_service_area: true, lat: 42.3486, lng: -88.2735 },
    "60051": { city: "McHenry",           state: "IL", in_service_area: true, lat: 42.3486, lng: -88.2735 },
    "60071": { city: "Richmond",          state: "IL", in_service_area: true, lat: 42.4839, lng: -88.3037 },
    "60072": { city: "Ringwood",          state: "IL", in_service_area: true, lat: 42.4133, lng: -88.3262 },
    "60097": { city: "Wonder Lake",       state: "IL", in_service_area: true, lat: 42.3725, lng: -88.3370 },
    "60098": { city: "Woodstock",         state: "IL", in_service_area: true, lat: 42.3147, lng: -88.4470 },
    "60102": { city: "Algonquin",         state: "IL", in_service_area: true, lat: 42.1656, lng: -88.2942 },
    "60142": { city: "Huntley",           state: "IL", in_service_area: true, lat: 42.1675, lng: -88.4287 },
    "60156": { city: "Lake in the Hills", state: "IL", in_service_area: true, lat: 42.1881, lng: -88.3331 },
    "60180": { city: "Union",             state: "IL", in_service_area: true, lat: 42.2278, lng: -88.5379 },
  };

  // Resolve a location object to lat/lng for distance sorting.
  function locationLatLng(loc) {
    if (!loc) return null;
    if (typeof loc.lat === "number" && typeof loc.lng === "number") {
      return { lat: loc.lat, lng: loc.lng };
    }
    if (loc.zip && SERVICE_AREA_ZIPS[loc.zip]) {
      const e = SERVICE_AREA_ZIPS[loc.zip];
      return { lat: e.lat, lng: e.lng };
    }
    return null;
  }

  function lookupZip(zip) {
    if (!/^\d{5}$/.test(zip)) return null;
    if (SERVICE_AREA_ZIPS[zip]) return { ...SERVICE_AREA_ZIPS[zip], zip };
    return { zip, city: null, state: null, in_service_area: false };
  }

  // Detect a ZIP literal in a free-text query (e.g. "lawn care 60014").
  function extractZipFromQuery(q) {
    const m = String(q || "").match(/\b(\d{5})\b/);
    return m ? m[1] : null;
  }

  // ----- User-location persistence (sessionStorage) -----
  const USER_LOC_KEY = "user_location";
  function getUserLocation() {
    try {
      const raw = sessionStorage.getItem(USER_LOC_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function setUserLocation(loc) {
    try { sessionStorage.setItem(USER_LOC_KEY, JSON.stringify(loc)); } catch (_) {}
  }

  // ----- Non-blocking location helper -----
  // Lives under the AI input on the results page. Renders either an
  // "ask" state (Use location / ZIP / dismiss) or a "set" state
  // ("Showing for {city} · Change"). Updates results in place.
  function _heroLocHelperEl() { return document.getElementById("heroLocHelper"); }

  function hideLocationHelper() {
    const el = _heroLocHelperEl();
    if (!el) return;
    el.hidden = true;
    el.innerHTML = "";
  }

  function showLocationStatus(loc) {
    const el = _heroLocHelperEl();
    if (!el || !loc) return;
    if (loc.in_service_area && loc.city) {
      el.className = "hero-loc-helper is-set";
      el.innerHTML = `
        <span class="hloc-check" aria-hidden="true">✓</span>
        <span class="hloc-set-text">Showing pros near <strong>${esc(loc.city)}</strong></span>
        <button type="button" class="hloc-change" data-loc-change>Change</button>`;
    } else if (loc.zip) {
      el.className = "hero-loc-helper is-set is-out-of-area";
      el.innerHTML = `
        <span class="hloc-warn" aria-hidden="true">!</span>
        <span class="hloc-set-text">No pros found in <strong>${esc(loc.zip)}</strong> yet — showing all</span>
        <button type="button" class="hloc-change" data-loc-change>Change</button>`;
    } else {
      el.className = "hero-loc-helper is-quiet";
      el.innerHTML = `
        <button type="button" class="hloc-add" data-loc-change>
          <span class="hloc-add-icon" aria-hidden="true">📍</span>
          Add your location for nearby pros
        </button>`;
    }
    el.hidden = false;
  }

  function showLocationAsk() {
    const el = _heroLocHelperEl();
    if (!el) return;
    el.className = "hero-loc-helper is-ask";
    el.innerHTML = `
      <div class="hloc-ask-head">
        <span class="hloc-ask-emoji" aria-hidden="true">📍</span>
        <span class="hloc-ask-title">Want nearby pros?</span>
        <button type="button" class="hloc-dismiss" data-loc-dismiss aria-label="Skip for now">✕</button>
      </div>
      <div class="hloc-ask-body">
        <button type="button" class="hloc-geo-btn" data-loc-geo>
          <span class="hloc-geo-icon" aria-hidden="true">📡</span>
          <span class="hloc-geo-label">Use my location</span>
        </button>
        <span class="hloc-or">or</span>
        <form class="hloc-zip-form" data-loc-zip-form>
          <span class="hloc-zip-icon" aria-hidden="true">🏠</span>
          <input type="text" inputmode="numeric" maxlength="5"
                 placeholder="Enter ZIP" data-loc-zip-input aria-label="ZIP code" />
          <button type="submit">Go →</button>
        </form>
      </div>
      <p class="hloc-msg" data-loc-msg hidden></p>`;
    el.hidden = false;
  }

  // Wire helper interactions via delegation (set up once on DOMContentLoaded).
  function bindLocationHelper() {
    const el = _heroLocHelperEl();
    if (!el) return;

    el.addEventListener("click", async (e) => {
      // Use my location
      if (e.target.closest("[data-loc-geo]")) {
        const btn = e.target.closest("[data-loc-geo]");
        const msg = el.querySelector("[data-loc-msg]");
        btn.disabled = true; btn.textContent = "Asking your browser…";
        if (msg) { msg.hidden = true; msg.textContent = ""; }
        try {
          const r = await requestGeolocation();
          const loc = {
            source: "browser_geolocation",
            zip: null,
            city: r.label || null,
            state: r.label ? "IL" : null,
            in_service_area: !!r.in_service_area,
            lat: r.lat, lng: r.lng,
            captured_at: new Date().toISOString(),
          };
          setUserLocation(loc);
          showLocationStatus(loc);
          rerunSearchWithLocation();
        } catch (err) {
          btn.disabled = false; btn.textContent = "Use my location";
          if (msg) {
            msg.hidden = false;
            msg.textContent = (err && err.message === "denied")
              ? "No worries — type your ZIP instead."
              : "Couldn't get your location. Try typing your ZIP.";
          }
        }
        return;
      }
      // Dismiss the ask — keep the quiet "add location" pill
      if (e.target.closest("[data-loc-dismiss]")) {
        setUserLocation({ source: "dismissed", in_service_area: false, captured_at: new Date().toISOString() });
        showLocationStatus(getUserLocation());
        return;
      }
      // Change / re-add — wipe stored location, show the full ask again
      if (e.target.closest("[data-loc-change]")) {
        try { sessionStorage.removeItem(USER_LOC_KEY); } catch (_) {}
        showLocationAsk();
        return;
      }
    });

    el.addEventListener("submit", (e) => {
      const form = e.target.closest("[data-loc-zip-form]");
      if (!form) return;
      e.preventDefault();
      const input = form.querySelector("[data-loc-zip-input]");
      const msg   = el.querySelector("[data-loc-msg]");
      const zip = (input && input.value || "").trim();
      if (!/^\d{5}$/.test(zip)) {
        if (msg) { msg.hidden = false; msg.textContent = "That doesn't look like a US ZIP. Try again."; }
        return;
      }
      const info = lookupZip(zip);
      const loc = {
        source: "manual_zip",
        zip,
        city: (info && info.city) || null,
        state: (info && info.state) || null,
        in_service_area: !!(info && info.in_service_area),
        captured_at: new Date().toISOString(),
      };
      setUserLocation(loc);
      showLocationStatus(loc);
      rerunSearchWithLocation();
    });
  }

  function rerunSearchWithLocation() {
    syncNearbyToggleVisibility();
    applyTableFilters();
    const homeIn = document.getElementById("aiAskInput");
    const q = (homeIn && homeIn.value) || "";
    if (!q) return;
    renderHomeSearchResults(q, getUserLocation());
  }

  // Show/hide the directory table's "Nearby only" toggle based on whether
  // the user has shared a usable location.
  function syncNearbyToggleVisibility() {
    const wrap   = document.getElementById("pfNearbyWrap");
    const label  = document.getElementById("pfNearbyLabel");
    const toggle = document.getElementById("pfNearby");
    if (!wrap) return;
    const loc = getUserLocation();
    const ll  = locationLatLng(loc);
    const usable = !!(ll && loc && loc.in_service_area);
    wrap.hidden = !usable;
    if (usable && label) {
      label.textContent = loc.city
        ? `Within 30 mi of ${loc.city}`
        : "Within 30 mi of you";
    }
    if (!usable && toggle) {
      tableState.nearby = false;
      toggle.checked = false;
    }
  }

  function _runLoadingStages(container) {
    return new Promise((resolve) => {
      const steps = container.querySelectorAll(".hero-loading-steps li");
      steps.forEach((li) => li.classList.remove("active", "done"));
      let i = 0;
      const tick = () => {
        if (i > 0) steps[i - 1].classList.replace("active", "done");
        if (i < steps.length) {
          steps[i].classList.add("active");
          i += 1;
          setTimeout(tick, 360);
        } else resolve();
      };
      tick();
    });
  }

  async function runHomeSearch(query) {
    const heroContent  = document.getElementById("heroContent");
    const heroLoading  = document.getElementById("heroStageLoading");
    const wrap         = document.getElementById("searchResults");
    if (!heroContent || !heroLoading || !wrap) return;

    document.body.classList.add("home-search-active");
    const homeIn = document.getElementById("aiAskInput");
    if (homeIn) homeIn.value = query;

    // Compare selections are scoped to a single result set.
    // If the query is different from the last one, drop them.
    if (window._lastSearchQuery !== query) {
      clearCompare();
      window._lastSearchQuery = query;
    }

    pageSectionsToToggle().forEach((el) => { el.dataset._homeShown = "1"; el.hidden = true; });

    // If query has an explicit ZIP, capture it as the location silently.
    let location = getUserLocation();
    const explicitZip = extractZipFromQuery(query);
    if (!location && explicitZip) {
      const info = lookupZip(explicitZip);
      location = {
        source: "query_zip",
        zip: explicitZip,
        city: (info && info.city) || null,
        state: (info && info.state) || null,
        in_service_area: !!(info && info.in_service_area),
        captured_at: new Date().toISOString(),
      };
      setUserLocation(location);
    }

    // Phase A — hero exit (250ms)
    heroContent.style.willChange = "transform, opacity";
    heroContent.classList.add("exiting");
    await _wait(250);
    heroContent.hidden = true;
    heroContent.classList.remove("exiting");
    heroContent.style.willChange = "";
    await _wait(50);

    // Phase C — loading entry (250ms)
    heroLoading.hidden = false;
    void heroLoading.offsetWidth;
    heroLoading.style.willChange = "transform, opacity";
    heroLoading.classList.add("entering");
    await _wait(250);
    heroLoading.style.willChange = "";

    // Phase D — 3-stage loading
    await _runLoadingStages(heroLoading);

    // Phase E — loading slot exits up, results render below
    heroLoading.style.willChange = "transform, opacity";
    heroLoading.classList.add("exiting-up");
    await _wait(200);
    heroLoading.hidden = true;
    heroLoading.classList.remove("entering", "exiting-up");
    heroLoading.style.willChange = "";

    renderHomeSearchResults(query, getUserLocation());
    wrap.hidden = false;

    // Show the non-blocking location helper under the AI input.
    // If we already have a location → show status. Otherwise → show ask.
    const stored = getUserLocation();
    if (stored) showLocationStatus(stored);
    else        showLocationAsk();
  }

  function renderHomeSearchResults(query, locationArg) {
    const { matched } = parseSearchQuery(query);
    const tokens = tokenizeQuery(query);
    const userLL = locationLatLng(locationArg);

    // Full-text scoring across every profile field we have.
    // Drops pros with score 0 (no token matches anywhere in their profile).
    let list = LANDSCAPERS.map((p) => {
      const score = scoreProForQuery(p, tokens);
      const lat = (typeof p.lat === "number") ? p.lat : null;
      const lng = (typeof p.lng === "number") ? p.lng : null;
      const _miles = (userLL && lat != null && lng != null)
        ? haversineMiles(userLL.lat, userLL.lng, lat, lng) : null;
      return Object.assign({}, p, { _score: score, _miles });
    });

    // If the query had any tokens at all, require at least one match.
    if (tokens.length) {
      list = list.filter((p) => p._score > 0);
    }

    // Hard-cap to within 30 miles when user is in service area (avoids
    // showing distant matches that happen to mention the keyword).
    if (userLL && locationArg && locationArg.in_service_area) {
      list = list.filter((p) => p._miles == null || p._miles <= 30);
    }

    // Sort: relevance (desc) → distance (asc, if location set) → rating (desc)
    list.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      if (userLL) {
        const ma = a._miles == null ? Infinity : a._miles;
        const mb = b._miles == null ? Infinity : b._miles;
        if (ma !== mb) return ma - mb;
      }
      const dr = (b.rating || 0) - (a.rating || 0);
      if (dr) return dr;
      return (b.reviews || 0) - (a.reviews || 0);
    });

    const top = list.slice(0, 12);

    let eyebrow = `Looking for: "${query}"`;
    if (locationArg && locationArg.city && locationArg.in_service_area) {
      eyebrow += ` near ${locationArg.city}`;
    }
    document.getElementById("searchEyebrow").textContent = eyebrow;

    // Title — use a friendly category label when the query maps cleanly,
    // otherwise show a generic "Pros that match" header.
    const titleEl = document.getElementById("searchOutputTitle");
    if (matched.length === 1) {
      titleEl.textContent = SEARCH_KEYWORDS[matched[0]].label;
    } else if (matched.length >= 2) {
      const labels = matched.map((c) => SEARCH_KEYWORDS[c].label_short);
      titleEl.textContent = `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]} pros`;
    } else if (top.length > 0) {
      titleEl.textContent = "Pros that match what you said";
    } else {
      titleEl.textContent = "Hmm, no matches";
    }

    let subSort;
    if (userLL && locationArg && locationArg.in_service_area) subSort = "closest first";
    else if (tokens.length)                                    subSort = "best match";
    else                                                       subSort = "highest rated";
    document.getElementById("searchOutputSub").textContent =
      top.length ? `${top.length} pro${top.length === 1 ? "" : "s"} found · sorted by ${subSort}` : "";

    document.getElementById("searchEmpty").hidden = top.length > 0;
    if (top.length === 0) {
      const cityLabel = (locationArg && locationArg.city) || "your area";
      document.getElementById("searchEmptyMsg").textContent =
        userLL && locationArg && locationArg.in_service_area
          ? `No pros within 30 miles of ${cityLabel} mention "${query}". Try different words or change your location.`
          : `No pros in our directory mention "${query}". Try different words, or browse the full directory.`;
    }

    const listEl = document.getElementById("searchOutputList");
    const compareHint = top.length >= 2
      ? `<div class="search-compare-hint">
           <span class="search-compare-hint-icon" aria-hidden="true">💡</span>
           <span><strong>Tip:</strong> Tap <span class="search-compare-hint-pill">☐ Compare</span> on 2 or 3 pros to see them side by side.</span>
         </div>`
      : "";
    listEl.innerHTML = compareHint + top.map(buildSearchCard).join("");
    listEl.querySelectorAll("[data-search-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.pro;
        if (btn.dataset.searchAction === "profile") openProProfile(id);
        else if (btn.dataset.searchAction === "contact") openContactModal(id);
        else if (btn.dataset.searchAction === "claim") openClaimModal(id);
      });
    });
    listEl.querySelectorAll("[data-compare-pro]").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        e.stopPropagation();
        toggleCompare(cb.dataset.comparePro);
      });
      cb.addEventListener("click", (e) => e.stopPropagation());
    });
    listEl.querySelectorAll(".search-card-compare").forEach((wrap) => {
      wrap.addEventListener("click", (e) => e.stopPropagation());
    });
    listEl.querySelectorAll(".search-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button, label, input")) return;
        openProProfile(card.dataset.pro);
      });
    });
    updateCompareBar();
  }

  // Per-service-category emoji + gradient theme — used as a fallback
  // image when a pro doesn't have a logo/photo on file.
  const PRO_IMG_THEME = {
    lawn_care:      { emoji: "🌿", grad1: "#b3dfbe", grad2: "#5fa56e" },
    design_install: { emoji: "🎨", grad1: "#fbd9b8", grad2: "#e09a5f" },
    hardscape:      { emoji: "🪨", grad1: "#d4cfc4", grad2: "#8a8377" },
    tree_shrub:     { emoji: "🌳", grad1: "#9bc4a4", grad2: "#2f6f4a" },
    irrigation:     { emoji: "💧", grad1: "#b8d8ec", grad2: "#4a8fbf" },
    seasonal:       { emoji: "🍂", grad1: "#f9d390", grad2: "#c97a30" },
  };
  const PRO_IMG_DEFAULT = { emoji: "🌳", grad1: "#b3dfbe", grad2: "#2f6f4a" };

  function buildSearchCard(pro) {
    const initials = (pro.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const rating = (pro.rating || 0).toFixed(1);
    const reviews = (pro.reviews || 0).toLocaleString();
    const profile = pro.profile || {};
    const yearsNum = parseYearsNum(profile.years_in_business);
    // Full About-them description — multi-sentence with services + years
    // + customer reviews. Reads like "State Line Landscaping offers
    // Residential Lawn Mowing... They've been in business for 35+ years.
    // Customer reviews mention..."
    const aboutText = composeAboutThem(pro, profile);
    const services = (pro.services || []).slice(0, 3)
      .map((s) => `<span class="search-card-tag">${esc(serviceLabel(s))}</span>`).join("");

    const theme = PRO_IMG_THEME[(pro.services || [])[0]] || PRO_IMG_DEFAULT;
    const photoURL = companyCardImageURL(pro);

    const checked = state.compare.has(pro.id);
    const disabled = !checked && state.compare.size >= COMPARE_MAX;
    return `
      <article class="search-card${checked ? " is-compare-selected" : ""}" data-pro="${esc(pro.id)}" tabindex="0">
        <div class="search-card-photo${photoURL ? " has-img" : ""}" aria-hidden="true"
             style="--g1:${theme.grad1}; --g2:${theme.grad2};">
          ${photoURL ? `<img src="${esc(photoURL)}" alt="" loading="lazy" />` : ""}
          <span class="search-card-photo-emoji${photoURL ? " is-overlay" : ""}">${esc(theme.emoji)}</span>
          <span class="search-card-photo-initials">${esc(initials)}</span>
        </div>
        <div class="search-card-body">
          <div class="search-card-head">
            <h3>${esc(pro.name)}</h3>
            <div class="search-card-rating">
              <span class="search-card-stars" aria-hidden="true">★</span>
              <span><strong>${rating}</strong>  (${reviews})</span>
            </div>
          </div>
          <div class="search-card-meta">
            ${pro.city ? `<span>📍 ${esc(pro.city)}</span>` : ""}
            ${typeof pro._miles === "number" ? `<span>${pro._miles.toFixed(1)} mi away</span>` : ""}
            ${yearsNum ? `<span>${yearsNum}+ yrs</span>` : ""}
          </div>
          ${aboutText ? `<p class="search-card-why">${esc(aboutText)}</p>` : ""}
          ${services ? `<div class="search-card-tags">${services}</div>` : ""}
          <div class="search-card-actions">
            <button type="button" class="search-card-btn search-card-btn-primary" data-search-action="contact" data-pro="${esc(pro.id)}">
              📩 Contact Business
            </button>
            <button type="button" class="search-card-btn search-card-btn-ghost" data-search-action="profile" data-pro="${esc(pro.id)}">
              See profile →
            </button>
            <label class="search-card-compare${checked ? " is-checked" : ""}${disabled ? " is-disabled" : ""}"
                   title="${disabled ? "You can compare up to 3 at a time. Remove one to add this." : "Add to comparison"}">
              <input type="checkbox" data-compare-pro="${esc(pro.id)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
              <span class="compare-icon" aria-hidden="true">${checked ? "✓" : "+"}</span>
              <span>${checked ? "Added to compare" : "Add to compare"}</span>
            </label>
          </div>
          <div class="search-card-claim">
            ${pro.auto_route_consented
              ? `<span class="claim-badge" title="The owner has confirmed this listing">✓ Verified by owner</span>`
              : `<button type="button" class="claim-link" data-search-action="claim" data-pro="${esc(pro.id)}">
                   Are you the owner? Claim this listing →
                 </button>`}
          </div>
        </div>
      </article>`;
  }

  function clearHomeSearch() {
    const wrap         = document.getElementById("searchResults");
    const heroContent  = document.getElementById("heroContent");
    const heroLoading  = document.getElementById("heroStageLoading");
    if (wrap) wrap.hidden = true;
    if (heroLoading) {
      heroLoading.hidden = true;
      heroLoading.classList.remove("entering", "exiting-up");
    }
    hideLocationHelper();
    if (heroContent) {
      heroContent.hidden = false;
      heroContent.classList.remove("exiting");
    }
    document.body.classList.remove("home-search-active");
    const homeIn = document.getElementById("aiAskInput");
    if (homeIn) homeIn.value = "";
    pageSectionsToToggle().forEach((el) => {
      if (el.dataset._homeShown === "1") {
        el.hidden = false;
        delete el.dataset._homeShown;
      }
    });
    const top = document.getElementById("top");
    if (top) top.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ==========================================================================
  // Two-path chooser — wire the buttons to scroll to the right section
  // ==========================================================================
  function bindPathChooser() {
    document.querySelectorAll(".path-card").forEach((card) => {
      card.addEventListener("click", () => {
        const targetId = card.dataset.target;
        const target = document.getElementById(targetId);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (targetId === "ask-ai") {
          setTimeout(() => {
            const inp = document.getElementById("chatInput");
            if (inp) inp.focus();
          }, 480);
        }
      });
    });
  }

  function serviceLabel(s) {
    return ({
      lawn_care: "Lawn care", design_install: "Design & install",
      hardscape: "Hardscaping", tree_shrub: "Tree & shrub",
      irrigation: "Irrigation", seasonal: "Seasonal cleanup"
    })[s] || s;
  }

  // ==========================================================================
  // Compare landscapers — selection / sticky bar / persistence
  // ==========================================================================
  const COMPARE_MAX = 3;
  const COMPARE_KEY = "compare_selection_v1";

  function loadCompareFromStorage() {
    try {
      const raw = sessionStorage.getItem(COMPARE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        state.compare = new Set(arr.slice(0, COMPARE_MAX));
      }
    } catch (_) {}
  }
  function saveCompareToStorage() {
    try {
      sessionStorage.setItem(COMPARE_KEY, JSON.stringify(Array.from(state.compare)));
    } catch (_) {}
  }
  function clearCompare() {
    state.compare.clear();
    saveCompareToStorage();
    syncCompareCheckboxes();
    updateCompareBar();
  }

  function toggleCompare(id) {
    if (!id) return;
    if (state.compare.has(id)) {
      state.compare.delete(id);
    } else {
      if (state.compare.size >= COMPARE_MAX) return; // cap
      state.compare.add(id);
    }
    saveCompareToStorage();
    syncCompareCheckboxes();
    updateCompareBar();
  }

  // Re-sync every Compare checkbox + card visual state on the page
  function syncCompareCheckboxes() {
    document.querySelectorAll("[data-compare-pro]").forEach((cb) => {
      const id = cb.dataset.comparePro;
      const isOn = state.compare.has(id);
      const atCap = !isOn && state.compare.size >= COMPARE_MAX;
      cb.checked = isOn;
      cb.disabled = atCap;
      const wrap = cb.closest(".search-card-compare");
      if (wrap) {
        wrap.classList.toggle("is-checked", isOn);
        wrap.classList.toggle("is-disabled", atCap);
        const icon  = wrap.querySelector(".compare-icon");
        const label = wrap.querySelector("span:not(.compare-icon)");
        if (icon)  icon.textContent  = isOn ? "✓" : "+";
        if (label) label.textContent = isOn ? "Added to compare" : "Add to compare";
      }
      const card = cb.closest(".search-card");
      if (card) card.classList.toggle("is-compare-selected", isOn);
    });
  }

  function updateCompareBar() {
    const bar    = document.getElementById("compareBar");
    const txt    = document.getElementById("compareText");
    const pills  = document.getElementById("comparePills");
    const cta    = document.getElementById("compareBtn");
    const hint   = document.getElementById("compareHint");
    if (!bar) return;
    const n = state.compare.size;
    bar.hidden = n === 0;
    if (n === 0) return;
    if (txt) txt.textContent = `${n} of ${COMPARE_MAX} selected`;
    if (pills) {
      pills.innerHTML = Array.from(state.compare).map((id) => {
        const pro = LANDSCAPERS.find((p) => p.id === id);
        if (!pro) return "";
        const initials = (pro.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
        return `<button type="button" class="compare-pill" data-compare-remove="${esc(id)}" title="Remove ${esc(pro.name)}">
                  <span class="compare-pill-avatar">${esc(initials)}</span>
                  <span class="compare-pill-name">${esc(pro.name.split(/\s+/).slice(0, 3).join(" "))}</span>
                  <span class="compare-pill-x" aria-hidden="true">×</span>
                </button>`;
      }).join("");
    }
    if (cta) cta.disabled = n < 2;
    if (hint) {
      hint.textContent = n < 2 ? "Pick at least one more to compare." :
                         n < 3 ? "You can add one more, or compare now." :
                                 "Maximum reached — compare now.";
    }
  }

  function bindCompareBar() {
    const bar = document.getElementById("compareBar");
    const cta = document.getElementById("compareBtn");
    const clr = document.getElementById("compareClear");
    if (cta) {
      cta.addEventListener("click", () => {
        if (state.compare.size < 2) return;
        openCompareView(Array.from(state.compare));
      });
    }
    if (clr) clr.addEventListener("click", clearCompare);
    if (bar) {
      bar.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-compare-remove]");
        if (rm) {
          state.compare.delete(rm.dataset.compareRemove);
          saveCompareToStorage();
          syncCompareCheckboxes();
          updateCompareBar();
        }
      });
    }
  }

  // ==========================================================================
  // Compare view — side-by-side parallel columns + bounded Q&A
  // ==========================================================================
  const COMPARE_QA_KEY_PREFIX = "compare_qa_v1::";

  // Service categories shown as rows (matches the search keyword set)
  const COMPARE_SERVICE_ROWS = [
    { key: "lawn_care",       label: "Lawn care" },
    { key: "design_install",  label: "Garden design" },
    { key: "hardscape",       label: "Hardscaping" },
    { key: "tree_shrub",      label: "Tree work" },
    { key: "irrigation",      label: "Irrigation" },
    { key: "seasonal",        label: "Seasonal cleanup" },
  ];

  // Build a normalized comparison record for one pro. Only pulls fields
  // that come straight from the pro's profile / website / Google Places
  // listing — nothing inferred or assumed. Missing fields stay missing
  // (rendered as "—") so users never see a fabricated "No".
  function buildCompareRow(pro) {
    if (!pro) return null;
    const profile = pro.profile || {};
    const creds = profile.credentials || {};
    const pricing = profile.pricing || {};
    const cleanList = (arr) => Array.isArray(arr)
      ? arr.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    const positiveThemes = Array.isArray(profile.review_themes)
      ? profile.review_themes
          .filter((t) => t && (t.polarity === "positive") && t.theme)
          .map((t) => String(t.theme).trim())
      : [];
    const proServices = pro.services || [];
    return {
      id:      pro.id,
      name:    pro.name,
      city:    pro.city || "",
      address: pro.address || "",
      phone:   pro.phone || "",
      website: pro.website || "",
      rating:  pro.rating || 0,
      reviews: pro.reviews || 0,
      years:   parseYearsNum(profile.years_in_business),  // 0 = not listed
      service_area:     (profile.service_area || "").trim(),
      services_offered: cleanList(profile.services_offered),
      specialties:      cleanList(profile.specialties),
      praise:           positiveThemes,
      free_estimates:   pricing.free_estimates === true,    // only "true" is signal
      has_pricing_info: pricing.has_specific_pricing === true,
      licensed_text:    String(creds.licensed || "").trim(),
      insured_text:     String(creds.insured  || "").trim(),
      certifications:   cleanList(creds.certifications),
      // Internal-only category map for the Q&A engine. NOT rendered in
      // the compare table (we display services_offered as text instead).
      services: COMPARE_SERVICE_ROWS.reduce((acc, r) => {
        acc[r.key] = proServices.includes(r.key); return acc;
      }, {}),
      licensed: !!String(creds.licensed || "").trim(),
      insured:  !!String(creds.insured  || "").trim(),
    };
  }

  function openCompareView(ids) {
    const overlay = document.getElementById("compareView");
    if (!overlay) return;
    const pros = ids.map((id) => LANDSCAPERS.find((p) => p.id === id)).filter(Boolean);
    const rows = pros.map(buildCompareRow);
    if (rows.length < 2) return;

    document.body.classList.add("compare-view-open");
    overlay.hidden = false;
    overlay.innerHTML = renderCompareHTML(rows);
    overlay.scrollTop = 0;

    // Wire close + per-column actions + Q&A
    overlay.querySelectorAll("[data-compare-close]").forEach((b) =>
      b.addEventListener("click", closeCompareView));
    overlay.querySelectorAll("[data-compare-action]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.dataset.pro;
        if (b.dataset.compareAction === "profile") openProProfile(id);
        else if (b.dataset.compareAction === "contact") openContactModal(id);
      });
    });
    document.addEventListener("keydown", _compareEsc);
    bindCompareQA(rows);
  }

  function _compareEsc(e) { if (e.key === "Escape") closeCompareView(); }

  function closeCompareView() {
    const overlay = document.getElementById("compareView");
    if (!overlay) return;
    overlay.hidden = true;
    overlay.innerHTML = "";
    document.body.classList.remove("compare-view-open");
    document.removeEventListener("keydown", _compareEsc);
  }

  // Only show a row if at least one selected pro has real data for it.
  // Avoids rows full of "—" when nobody listed that fact.
  function compareRowHasData(rows, key) {
    switch (key) {
      case "phone":            return rows.some((r) => r.phone);
      case "service_area":     return rows.some((r) => r.service_area);
      case "years":            return rows.some((r) => r.years > 0);
      case "services_offered": return rows.some((r) => r.services_offered.length);
      case "specialties":      return rows.some((r) => r.specialties.length);
      case "praise":           return rows.some((r) => r.praise.length);
      case "free_estimates":   return rows.some((r) => r.free_estimates);
      case "licensed":         return rows.some((r) => r.licensed_text);
      case "insured":          return rows.some((r) => r.insured_text);
      case "certifications":   return rows.some((r) => r.certifications.length);
      case "website":          return rows.some((r) => r.website);
      default:                 return true;
    }
  }

  function renderCompareHTML(rows) {
    const N = rows.length;
    const colsClass = `cv-cols-${N}`;
    const lastQuery = window._lastSearchQuery || "";

    // Header row (sticky on scroll)
    const header = `
      <div class="cv-header-row ${colsClass}">
        <div class="cv-cell cv-rowlabel"></div>
        ${rows.map((r) => {
          const initials = (r.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
          return `
          <div class="cv-cell cv-col-header">
            <div class="cv-col-avatar">${esc(initials)}</div>
            <h3>${esc(r.name)}</h3>
            <div class="cv-col-city">${esc(r.city)}</div>
          </div>`;
        }).join("")}
      </div>`;

    // Compute "best in row" markers for numeric fields
    const maxRating  = Math.max(...rows.map((r) => r.rating));
    const maxReviews = Math.max(...rows.map((r) => r.reviews));
    const maxYears   = Math.max(...rows.map((r) => r.years));

    const notListed   = `<span class="cv-not-listed">—</span>`;
    const textCell    = (val) => `<div class="cv-cell">${val ? esc(val) : notListed}</div>`;
    const listCell    = (arr, max = 8) => {
      if (!arr || !arr.length) return `<div class="cv-cell">${notListed}</div>`;
      const items = arr.slice(0, max).map((x) => `<li>${esc(x)}</li>`).join("");
      const more = arr.length > max ? `<li class="cv-more">+${arr.length - max} more</li>` : "";
      return `<div class="cv-cell"><ul class="cv-list">${items}${more}</ul></div>`;
    };

    const ratingCell = (r) => {
      const isBest = r.rating > 0 && r.rating === maxRating && rows.filter(x => x.rating === maxRating).length < rows.length;
      return `<div class="cv-cell cv-numeric ${isBest ? "is-best" : ""}">
                <span class="cv-rating-stars">★</span>
                <strong>${(r.rating || 0).toFixed(1)}</strong>
                <span class="cv-meta">(${(r.reviews || 0).toLocaleString()})</span>
                ${r.reviews > 0 && r.reviews === maxReviews && rows.filter(x => x.reviews === maxReviews).length < rows.length ? `<span class="cv-badge">Most reviews</span>` : ""}
              </div>`;
    };
    const yearsCell = (r) => {
      if (r.years <= 0) return `<div class="cv-cell">${notListed}</div>`;
      const isBest = r.years === maxYears && rows.filter(x => x.years === maxYears).length < rows.length;
      return `<div class="cv-cell cv-numeric ${isBest ? "is-best" : ""}">
                <strong>${r.years}+ yrs</strong>
                ${isBest ? `<span class="cv-badge">Most experience</span>` : ""}
              </div>`;
    };
    const phoneCell = (r) => `<div class="cv-cell">${
      r.phone ? `<a href="tel:${esc(r.phone.replace(/[^0-9+]/g, ""))}" class="cv-link">${esc(r.phone)}</a>` : notListed
    }</div>`;
    const websiteCell = (r) => `<div class="cv-cell">${
      r.website ? `<a href="${esc(r.website)}" target="_blank" rel="noopener" class="cv-link">Visit website →</a>` : notListed
    }</div>`;
    // For "free estimates" we ONLY show the row when a pro actually
    // states it on their site. Pros without a clear yes get "—" — we
    // never render a fabricated "No".
    const freeEstCell = (r) => `<div class="cv-cell">${r.free_estimates ? "Yes — free estimates" : notListed}</div>`;

    const buildRow = (label, cellsFn, klass = "") =>
      `<div class="cv-data-row ${colsClass} ${klass}">
        <div class="cv-cell cv-rowlabel">${esc(label)}</div>
        ${rows.map(cellsFn).join("")}
      </div>`;

    // Row order is roughly "what customers ask first" → contact details.
    // Each row is text-only; missing data shows as "—" with no checkmark
    // or X (we don't manufacture answers we can't verify).
    const dataRows = [];
    dataRows.push(buildRow("Rating", ratingCell));
    if (compareRowHasData(rows, "years"))            dataRows.push(buildRow("Years in business", yearsCell));
    if (compareRowHasData(rows, "service_area"))     dataRows.push(buildRow("Service area",      (r) => textCell(r.service_area)));
    if (compareRowHasData(rows, "services_offered")) dataRows.push(buildRow("Services they list",(r) => listCell(r.services_offered, 10)));
    if (compareRowHasData(rows, "specialties"))      dataRows.push(buildRow("Specialties",       (r) => listCell(r.specialties)));
    if (compareRowHasData(rows, "praise"))           dataRows.push(buildRow("What customers praise", (r) => listCell(r.praise)));
    if (compareRowHasData(rows, "free_estimates"))   dataRows.push(buildRow("Free estimates",    freeEstCell));
    if (compareRowHasData(rows, "licensed"))         dataRows.push(buildRow("Licensing",         (r) => textCell(r.licensed_text)));
    if (compareRowHasData(rows, "insured"))          dataRows.push(buildRow("Insurance",         (r) => textCell(r.insured_text)));
    if (compareRowHasData(rows, "certifications"))   dataRows.push(buildRow("Certifications",    (r) => listCell(r.certifications)));
    if (compareRowHasData(rows, "phone"))            dataRows.push(buildRow("Phone", phoneCell));
    if (compareRowHasData(rows, "website"))          dataRows.push(buildRow("Website", websiteCell));

    // Action row
    const actionRow = `
      <div class="cv-data-row ${colsClass} cv-action-row">
        <div class="cv-cell cv-rowlabel"></div>
        ${rows.map((r) => `
          <div class="cv-cell cv-actions">
            <button type="button" class="cv-btn cv-btn-primary" data-compare-action="contact" data-pro="${esc(r.id)}">📩 Contact</button>
            <button type="button" class="cv-btn cv-btn-ghost"   data-compare-action="profile" data-pro="${esc(r.id)}">See profile →</button>
          </div>`).join("")}
      </div>`;

    // Q&A panel — Phase 3
    const qaPanel = renderCompareQAPanel(rows);

    return `
      <div class="cv-backdrop" data-compare-close></div>
      <div class="cv-panel" role="dialog" aria-label="Side-by-side comparison">
        <header class="cv-bar">
          <button type="button" class="cv-back" data-compare-close>← Back to results</button>
          <div class="cv-title-block">
            <h2 class="cv-title">Compare landscapers</h2>
            ${lastQuery ? `<p class="cv-subtitle">${rows.length} selected for "${esc(lastQuery)}"</p>` : `<p class="cv-subtitle">${rows.length} selected</p>`}
          </div>
          <button type="button" class="cv-close" data-compare-close aria-label="Close">✕</button>
        </header>

        <div class="cv-scroll">
          <div class="cv-table" role="table">
            <div class="cv-sticky-header">${header}</div>
            ${dataRows.join("")}
            ${actionRow}
          </div>
          ${qaPanel}
        </div>
      </div>`;
  }

  // ----- Phase 3: Bounded Q&A -----

  function renderCompareQAPanel(rows) {
    const suggestions = buildSuggestedQuestions(rows);
    return `
      <section class="cv-qa">
        <h3>💬 Ask about these landscapers</h3>
        <form class="cv-qa-form" data-compare-qa-form>
          <input type="text" class="cv-qa-input" placeholder="Ask a question…" data-compare-qa-input aria-label="Ask a question about these landscapers" />
          <button type="submit" class="cv-qa-send">Ask</button>
        </form>
        ${suggestions.length ? `
        <div class="cv-qa-suggestions">
          <span class="cv-qa-hint">Try asking:</span>
          ${suggestions.map((s) => `<button type="button" class="cv-qa-chip" data-compare-qa-chip>${esc(s)}</button>`).join("")}
        </div>` : ""}
        <div class="cv-qa-thread" data-compare-qa-thread aria-live="polite"></div>
      </section>`;
  }

  function buildSuggestedQuestions(rows) {
    const out = [];
    const yearsAny = rows.some((r) => r.years > 0);
    const yearsDiffer = (new Set(rows.map((r) => r.years))).size > 1;
    if (yearsAny && yearsDiffer) out.push("Which has the most experience?");

    // Find a service that's offered by some but not all
    for (const sr of COMPARE_SERVICE_ROWS) {
      const yesCount = rows.filter((r) => r.services[sr.key]).length;
      if (yesCount > 0 && yesCount < rows.length) {
        out.push(`Which one offers ${sr.label.toLowerCase()}?`);
        break;
      }
    }

    if (rows.length >= 2) {
      out.push(`What's the difference between ${rows[0].name.split(/\s+/)[0]} and ${rows[1].name.split(/\s+/)[0]}?`);
    }

    const reviewsDiffer = (new Set(rows.map((r) => r.reviews))).size > 1;
    if (reviewsDiffer) out.push("Which has the most reviews?");

    return out.slice(0, 4);
  }

  function bindCompareQA(rows) {
    const overlay = document.getElementById("compareView");
    if (!overlay) return;
    const form   = overlay.querySelector("[data-compare-qa-form]");
    const input  = overlay.querySelector("[data-compare-qa-input]");
    const thread = overlay.querySelector("[data-compare-qa-thread]");
    if (!form || !input || !thread) return;

    // Restore prior conversation for this exact comparison (same set of ids)
    const convoKey = COMPARE_QA_KEY_PREFIX + rows.map((r) => r.id).sort().join(",");
    let convo = [];
    try {
      const raw = sessionStorage.getItem(convoKey);
      convo = raw ? JSON.parse(raw) : [];
    } catch (_) { convo = []; }
    const renderConvo = () => {
      thread.innerHTML = convo.map((m) => `
        <div class="cv-qa-msg cv-qa-${esc(m.role)}">
          <div class="cv-qa-bubble">${m.role === "ai" ? formatQAResponse(m.text) : esc(m.text)}</div>
        </div>`).join("");
      thread.scrollTop = thread.scrollHeight;
    };
    renderConvo();

    const ask = (q) => {
      const question = String(q || "").trim();
      if (!question) return;
      convo.push({ role: "user", text: question });
      const answer = answerCompareQuestion(question, rows);
      convo.push({ role: "ai", text: answer });
      try { sessionStorage.setItem(convoKey, JSON.stringify(convo)); } catch (_) {}
      input.value = "";
      renderConvo();
    };

    form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
    overlay.querySelectorAll("[data-compare-qa-chip]").forEach((b) => {
      b.addEventListener("click", () => ask(b.textContent));
    });
  }

  // Format the AI response — preserve newlines and bold markers
  function formatQAResponse(text) {
    return esc(text).replace(/\n/g, "<br>")
                    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  // ----- Deterministic, bounded answer engine -----
  // Pattern-matches questions over the comparison rows. Refuses to invent
  // attributes that aren't in our data; refuses to pick a winner; offers
  // trade-offs instead.

  const _UNTRACKED_FIELDS = [
    { re: /\b(reliab|trust|honest|hones?ty|integrity)/i, name: "reliability" },
    { re: /\b(quality|workmanship)\b/i,                 name: "work quality" },
    { re: /\b(speed|how fast|response time|how quickly)/i, name: "response speed" },
    { re: /\bfriendly|nice|polite/i,                    name: "staff friendliness" },
    { re: /\bcheap|cheapest|affordab|expensive|costly|price\b|cost\b/i, name: "price" },
    { re: /\b(safe|safety)\b/i,                          name: "safety record" },
    { re: /\b(award|certif|accredit)/i,                  name: "award details" },
  ];

  function answerCompareQuestion(q, rows) {
    const ql = q.toLowerCase();
    const N = rows.length;

    // Picks-a-winner trap: refuse and offer trade-offs
    if (/(which|who).*(best|should i pick|recommend|right one|good for me)/i.test(q)
        || /\bbest for me\b/i.test(q)
        || /\bpick (one|for me)\b/i.test(q)) {
      const tradeoffs = [];
      const yearsTop = rows.slice().sort((a, b) => b.years - a.years)[0];
      if (yearsTop && yearsTop.years > 0) tradeoffs.push(`${yearsTop.name} has the most experience (${yearsTop.years}+ yrs)`);
      const revTop = rows.slice().sort((a, b) => b.reviews - a.reviews)[0];
      if (revTop) tradeoffs.push(`${revTop.name} has the most reviews (${revTop.reviews})`);
      const mostSvc = rows.slice().sort((a, b) =>
        Object.values(b.services).filter(Boolean).length -
        Object.values(a.services).filter(Boolean).length)[0];
      const mostSvcN = Object.values(mostSvc.services).filter(Boolean).length;
      if (mostSvcN >= 2) tradeoffs.push(`${mostSvc.name} covers the most service types (${mostSvcN})`);
      return `I can't pick for you — that depends on what you value most. Here's what stands out from the data:\n\n` +
             tradeoffs.map((t) => `• ${t}`).join("\n") +
             `\n\nDecide based on what matters most: experience, review volume, or services covered.`;
    }

    // Untracked-attribute trap
    for (const u of _UNTRACKED_FIELDS) {
      if (u.re.test(ql)) {
        return untrackedAnswer(u.name, rows);
      }
    }

    // "What's the difference between X and Y?"
    const diffMatch = ql.match(/difference between\s+(.+?)\s+(?:and|vs\.?|&)\s+(.+?)(?:\?|$)/i);
    if (diffMatch) {
      const r1 = matchProByName(diffMatch[1], rows);
      const r2 = matchProByName(diffMatch[2], rows);
      if (r1 && r2 && r1 !== r2) return diffPair(r1, r2);
    }

    // "Which has the most/least <thing>?"
    if (/\b(most|highest|top|best rated|biggest)\b.*\b(reviews?|reviewed)\b/i.test(q)) {
      const sorted = rows.slice().sort((a, b) => b.reviews - a.reviews);
      const top = sorted[0];
      return `${top.name} has the most reviews (${top.reviews.toLocaleString()}). ` +
             `For comparison: ${sorted.slice(1).map((r) => `${r.name} has ${r.reviews.toLocaleString()}`).join(", ")}.`;
    }
    if (/\b(most|highest|best|top)\b.*\b(rated|rating|stars?)\b/i.test(q)) {
      const sorted = rows.slice().sort((a, b) => b.rating - a.rating);
      if (sorted[0].rating === sorted[sorted.length - 1].rating) {
        return `All ${N} are rated ${sorted[0].rating.toFixed(1)} stars. To break the tie, look at review counts: ` +
               sorted.map((r) => `${r.name} has ${r.reviews.toLocaleString()}`).join(", ") + ".";
      }
      return `${sorted[0].name} has the highest rating at ${sorted[0].rating.toFixed(1)} (${sorted[0].reviews.toLocaleString()} reviews).`;
    }
    if (/\b(most|longest|highest)\b.*\b(experience|years)\b/i.test(q)
        || /\bhow long\b/i.test(q)) {
      const withYears = rows.filter((r) => r.years > 0);
      if (!withYears.length) return `Years in business isn't listed for any of these — you'd need to ask each business.`;
      const sorted = withYears.slice().sort((a, b) => b.years - a.years);
      return `${sorted[0].name} has the most experience at ${sorted[0].years}+ years.` +
             (sorted.length > 1 ? ` Compared with: ${sorted.slice(1).map((r) => `${r.name} (${r.years}+ yrs)`).join(", ")}.` : "") +
             (rows.length > withYears.length ? ` Years not listed for ${rows.length - withYears.length} of them.` : "");
    }

    // "Which offers <service>?"
    for (const sr of COMPARE_SERVICE_ROWS) {
      if (ql.includes(sr.label.toLowerCase()) ||
          (sr.key === "tree_shrub" && /\btree|arboris|prune/.test(ql)) ||
          (sr.key === "lawn_care"  && /\blawn|grass|mow/.test(ql))    ||
          (sr.key === "hardscape"  && /\bpatio|paver|stone|wall/.test(ql)) ||
          (sr.key === "irrigation" && /\bsprink|irrig|drain/.test(ql))     ||
          (sr.key === "design_install" && /\bdesign|garden/.test(ql))      ||
          (sr.key === "seasonal"   && /\bsnow|cleanup|leaf/.test(ql))) {
        const yes = rows.filter((r) => r.services[sr.key]);
        const no  = rows.filter((r) => !r.services[sr.key]);
        if (!yes.length) return `None of these offer ${sr.label.toLowerCase()}.`;
        if (!no.length)  return `All ${N} offer ${sr.label.toLowerCase()}.`;
        return `${yes.map((r) => r.name).join(" and ")} offer ${sr.label.toLowerCase()}. ` +
               `${no.map((r) => r.name).join(" and ")} ${no.length === 1 ? "doesn't" : "don't"} list it.`;
      }
    }

    // "Which is closest to me?"
    if (/\bclosest|nearest|near me\b/i.test(q)) {
      const loc = getUserLocation();
      const ll = locationLatLng(loc);
      if (!ll) return `I'd need to know your location first. Add it via the location pill on the home page.`;
      const withDist = rows.map((r) => {
        const pro = LANDSCAPERS.find((p) => p.id === r.id);
        const lat = pro && typeof pro.lat === "number" ? pro.lat : null;
        const lng = pro && typeof pro.lng === "number" ? pro.lng : null;
        return Object.assign({}, r, {
          _miles: (lat != null && lng != null) ? haversineMiles(ll.lat, ll.lng, lat, lng) : null,
        });
      }).filter((r) => r._miles != null);
      if (!withDist.length) return `I don't have coordinates for these businesses to measure distance.`;
      withDist.sort((a, b) => a._miles - b._miles);
      return `${withDist[0].name} is closest at ${withDist[0]._miles.toFixed(1)} miles. ` +
             withDist.slice(1).map((r) => `${r.name} is ${r._miles.toFixed(1)} miles`).join(", ") + ".";
    }

    // "Are these all reliable / safe?" (untracked, will hit trap above usually)
    if (/\bare these\b|\bare they\b/i.test(q)) {
      // Fall through to a generic data-anchored answer
    }

    // "What does X mean?" — explain a field
    const fieldMatch = ql.match(/what does\s+([a-z ]+?)\s+mean/i)
                    || ql.match(/explain\s+([a-z ]+)/i);
    if (fieldMatch) {
      const f = fieldMatch[1].trim();
      if (/insured/.test(f))  return `"Insured" means the business carries liability insurance — coverage if something gets damaged on the job. We mark it Yes when their site says they're insured.`;
      if (/license/.test(f))  return `"Licensed" means they're registered to operate as a contractor. We mark it Yes when their site says they're licensed.`;
      if (/year/.test(f))     return `"Years in business" is the number of years they've been registered as a business, parsed from their website (e.g. "since 2006" → 20+ years).`;
      if (/free quote/.test(f)) return `"Free quotes" means they don't charge to give you an estimate. We mark it Yes when their site explicitly says so.`;
      if (/rating/.test(f))   return `Rating is the average star rating from Google reviews. The number in parentheses is the total review count.`;
    }

    // Fallback — summarize what we have, honestly
    return summarizeRows(rows);
  }

  function untrackedAnswer(field, rows) {
    return `${capitalize(field)} isn't a field we track in this comparison. ` +
      `What I can tell you from the data: ` +
      rows.map((r) => `${r.name} is rated ${r.rating.toFixed(1)} (${r.reviews.toLocaleString()} reviews)`).join("; ") +
      `. To check ${field}, you'd want to ask the businesses directly.`;
  }

  function diffPair(r1, r2) {
    const same = [];
    const diff = [];
    if (r1.rating === r2.rating) same.push(`both rated ${r1.rating.toFixed(1)}`);
    else                          diff.push(`${r1.name}: ${r1.rating.toFixed(1)} stars vs ${r2.name}: ${r2.rating.toFixed(1)} stars`);
    if (r1.reviews !== r2.reviews) diff.push(`reviews — ${r1.name}: ${r1.reviews}, ${r2.name}: ${r2.reviews}`);
    if (r1.years !== r2.years) {
      const a = r1.years > 0 ? `${r1.years}+ yrs` : "not listed";
      const b = r2.years > 0 ? `${r2.years}+ yrs` : "not listed";
      diff.push(`years — ${r1.name}: ${a}, ${r2.name}: ${b}`);
    }
    const svcDiff = COMPARE_SERVICE_ROWS.filter((sr) => r1.services[sr.key] !== r2.services[sr.key]);
    if (svcDiff.length) {
      diff.push(`services — ${svcDiff.map((sr) => {
        const a = r1.services[sr.key] ? r1.name : r2.name;
        return `${sr.label.toLowerCase()} only by ${a}`;
      }).join(", ")}`);
    } else {
      same.push("same services covered");
    }
    if (r1.licensed !== r2.licensed) diff.push(`licensed — ${r1.name}: ${r1.licensed ? "yes" : "not listed"}, ${r2.name}: ${r2.licensed ? "yes" : "not listed"}`);
    if (r1.insured  !== r2.insured)  diff.push(`insured — ${r1.name}: ${r1.insured ? "yes" : "not listed"}, ${r2.name}: ${r2.insured ? "yes" : "not listed"}`);

    let out = `${r1.name} vs ${r2.name}:\n\n`;
    if (diff.length) out += `**Differences:**\n` + diff.map((d) => `• ${d}`).join("\n") + "\n\n";
    if (same.length) out += `**Same:** ${same.join(", ")}.`;
    if (!diff.length && !same.length) out = "No major differences I can see in the data.";
    return out.trim();
  }

  function matchProByName(snippet, rows) {
    const s = String(snippet || "").trim().toLowerCase();
    if (!s) return null;
    return rows.find((r) => r.name.toLowerCase().includes(s))
        || rows.find((r) => s.split(/\s+/).every((w) => r.name.toLowerCase().includes(w)))
        || null;
  }

  function summarizeRows(rows) {
    return `I can compare specific fields: rating, reviews, years in business, services covered, licensed/insured, free quotes, and service area. Try asking:\n` +
      `• "Which has the most reviews?"\n` +
      `• "Which offers hardscaping?"\n` +
      `• "What's the difference between ${rows[0].name.split(/\s+/)[0]} and ${rows[1].name.split(/\s+/)[0]}?"`;
  }

  function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

  // ==========================================================================
  // Lead submission (no storage — shows success modal)
  // ==========================================================================
  function submitLead(proId) {
    const pro = LANDSCAPERS.find((p) => p.id === proId);
    if (!pro) return;
    // For now, just show thanks. Outbound contact wiring comes next.
    const modal = $("#thanksModal");
    const title = $("#thanksTitle");
    const body = modal.querySelector("p");
    title.textContent = `Request sent to ${pro.name}!`;
    body.innerHTML = `We'll let ${esc(pro.name)} know you'd like a quote. Reach them directly at <a href="tel:${pro.phone.replace(/\D/g,"")}">${esc(pro.phone)}</a> or <a href="mailto:${esc(pro.email)}">${esc(pro.email)}</a>.`;
    modal.classList.add("show");
  }

  // ==========================================================================
  // AI Chat — primary engagement feature
  // ==========================================================================
  const BOT_GREETING = "Hi! I'm your Crystal Lake landscape advisor. Tell me about your yard or your project — I can help with plants, costs, timing, and picking the right local pro. What's on your mind?";

  function addMessage(role, text, opts) {
    const body = $("#chatBody");
    const msg = document.createElement("div");
    msg.className = "chat-msg " + role;
    if (opts && opts.html) {
      msg.innerHTML = text;
    } else if (role === "bot" && typeof text === "string" && text.indexOf("\n") !== -1) {
      // Render bot replies as a stack of short paragraphs. The advisor
      // prompt asks the model to use blank-line-separated paragraphs of
      // 1-2 sentences each; we honor that here so replies don't read as
      // one solid block of text. Falls back to a single textContent set
      // when there are no line breaks.
      const paras = text
        .replace(/\r\n/g, "\n")
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter(Boolean);
      paras.forEach((p) => {
        const el = document.createElement("p");
        el.className = "chat-msg-para";
        // Single \n inside a paragraph becomes a soft <br> for things
        // like numbered lists the model sometimes emits one-per-line.
        const lines = p.split("\n");
        lines.forEach((ln, i) => {
          if (i > 0) el.appendChild(document.createElement("br"));
          el.appendChild(document.createTextNode(ln));
        });
        msg.appendChild(el);
      });
    } else {
      msg.textContent = text;
    }
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
    return msg;
  }

  function addTyping() {
    const body = $("#chatBody");
    const el = document.createElement("div");
    el.className = "chat-msg bot typing";
    el.innerHTML = `<span class="dots"><span></span><span></span><span></span></span>`;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  function renderChipsFromSuggestions(suggestions) {
    const chips = $("#chatChips");
    chips.innerHTML = "";
    (suggestions || []).slice(0, 4).forEach((text) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.dataset.prompt = text;
      b.textContent = text;
      chips.appendChild(b);
    });
  }

  // Infer project type from conversation and persist for the matching flow.
  function inferAndPrefill(text) {
    const lower = text.toLowerCase();
    let changed = false;
    if (!state.answers.projectType) {
      for (const row of KEYWORD_TO_SERVICE) {
        if (row.words.some((w) => lower.includes(w))) {
          state.answers.projectType = row.svc;
          changed = true;
          const btn = document.querySelector(
            '.options[data-question="projectType"] .option[data-value="' + row.svc + '"]'
          );
          if (btn) {
            $$(".option", btn.parentElement).forEach((o) => o.classList.remove("selected"));
            btn.classList.add("selected");
          }
          break;
        }
      }
    }
    const zipMatch = text.match(/\b(600\d{2})\b/);
    if (zipMatch && CRYSTAL_LAKE_ZIPS.has(zipMatch[1])) {
      state.answers.zip = zipMatch[1];
      changed = true;
      const zipEl = $("#zip"); if (zipEl) zipEl.value = zipMatch[1];
      const zipCheck = $("#zipCheckInput"); if (zipCheck) zipCheck.value = zipMatch[1];
    }
    if (!state.answers.timeline) {
      if (/(asap|urgent|this week|emergency)/.test(lower)) {
        state.answers.timeline = "asap"; changed = true;
      } else if (/(this month|next couple weeks)/.test(lower)) {
        state.answers.timeline = "month"; changed = true;
      }
    }
    if (changed) saveMatchState();
    updateLiveCount();
  }

  async function sendMessage(text) {
    const input = $("#chatInput");
    const send = $("#chatSend");
    if (!text || state.chatBusy) return;
    state.chatBusy = true;
    send.disabled = true;
    input.value = "";
    addMessage("user", text);
    inferAndPrefill(text);

    const typingEl = addTyping();

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          accountid: ACCOUNT_ID,
          session_id: state.sessionId,
          kb_type: "client",
          // The inline panel only ever runs on /landscaping, where
          // window.LandscapingNav is present. Always opt into router mode.
          router_mode: true
        })
      });

      let data = null;
      try { data = await res.json(); } catch (_) {}

      typingEl.remove();

      if (!res.ok || !data) {
        addMessage("bot", "Hmm, I couldn't reach the advisor service just now. You can still get matched using the form below — or call (815) 555-0100.");
      } else {
        const rawAnswer = data.answer || data.response || "Got it.";
        // Parse [scroll:...] / [filter-services:...] / etc directives so
        // the page can react to the bot's intent. Cleaned text is what the
        // visitor sees in the message; directives drive page updates.
        const { cleaned, directives } = LandscapingNav.parseDirectives(rawAnswer);
        const botMsg = addMessage("bot", cleaned || rawAnswer);

        // Some bots return structured directives at the API level too
        // (data.directives = [{action, value}, ...]). Honor them.
        if (Array.isArray(data.directives)) {
          data.directives.forEach((d) => directives.push(d));
        }

        // Apply directives. Cap at one to keep the page calm.
        if (directives.length) {
          LandscapingNav.applyDirective(directives[0]);
        } else if (/match|get matched|form|wizard|pro/i.test(rawAnswer)) {
          // Fallback for older bots that don't yet emit directives.
          const cta = document.createElement("div");
          cta.style.marginTop = "8px";
          cta.innerHTML = '<a href="' + stepUrl(1) + '" class="btn btn-outline btn-sm" data-match-start>Start quick match →</a>';
          botMsg.appendChild(cta);
        }

        if (Array.isArray(data.next_questions) && data.next_questions.length) {
          renderChipsFromSuggestions(data.next_questions);
        }
      }
    } catch (err) {
      typingEl.remove();
      addMessage("bot", "Couldn't reach the advisor service — please try again in a moment.");
    } finally {
      state.chatBusy = false;
      send.disabled = false;
      input.focus();
    }
  }

  function initChat() {
    addMessage("bot", BOT_GREETING);

    const form = $("#chatForm");
    const input = $("#chatInput");
    const send = $("#chatSend");

    // The chat panel keeps the conversation inline — the bot's reply
    // appears as a message bubble below the user's message. No
    // full-page takeover.
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = (input.value || "").trim();
      if (!v) return;
      sendMessage(v);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const v = (input.value || "").trim();
        if (!v) return;
        sendMessage(v);
      }
    });

    // Suggestion chips — one click sends that prompt to the inline chat.
    $("#chatChips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      sendMessage(b.dataset.prompt);
    });

    // Service cards now navigate to /landscaping/services/<slug> articles
    // (anchor href). No JS click handler needed — let the browser handle it.
    // Keeping a no-op forEach in case other code still iterates them.
    $$(".service-card").forEach((card) => {
      // intentionally empty — anchor navigation handles the click
    });

    // Reset chat
    $("#resetChat").addEventListener("click", async (e) => {
      e.preventDefault();
      $("#chatBody").innerHTML = "";
      addMessage("bot", BOT_GREETING);
      try {
        await fetch(CHAT_RESET_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountid: ACCOUNT_ID,
            session_id: state.sessionId,
            kb_type: "client"
          })
        });
      } catch (_) { /* best-effort */ }
    });
  }

  // ==========================================================================
  // Hero search + category tiles → start the matching flow
  // ==========================================================================
  function preselectAnswer(question, value) {
    state.answers[question] = value;
    saveMatchState();
    const group = document.querySelector(
      '.options[data-question="' + question + '"]'
    );
    if (!group) return;
    const btn = group.querySelector('.option[data-value="' + value + '"]');
    if (!btn) return;
    $$(".option", group).forEach((o) => o.classList.remove("selected"));
    btn.classList.add("selected");
  }

  function initHeroSearch() {
    const form = $("#heroSearch");
    const svc = $("#heroService");
    const zip = $("#heroZip");
    const btn = $("#heroSubmit");
    if (!form || !svc || !zip || !btn) return;
    zip.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 5);
    });
    function go() {
      const service = svc.value;
      if (!service) { svc.focus(); return; }
      const zipVal = (zip.value || "").trim();
      const serviceText = (svc.options[svc.selectedIndex].text || "").toLowerCase();
      const query = (zipVal && /^\d{5}$/.test(zipVal))
        ? `${serviceText} near ${zipVal}`
        : serviceText;
      runHomeSearch(query);
    }
    btn.addEventListener("click", (e) => { e.preventDefault(); go(); });
    form.addEventListener("submit", (e) => { e.preventDefault(); go(); });
  }

  // Plain-English label for a service category (used by category tiles
  // and anywhere else we synthesize a search query from a category id).
  function searchQueryForCategory(cat) {
    return ({
      lawn_care: "lawn care",
      design_install: "landscape design",
      hardscape: "hardscaping",
      tree_shrub: "tree work",
      irrigation: "irrigation and drainage",
      seasonal: "seasonal cleanup",
    })[cat] || "landscaping";
  }

  function initCategoryTiles() {
    const tiles = $$(".cat-tile");
    if (!tiles.length) return;
    tiles.forEach((tile) => {
      tile.addEventListener("click", () => {
        const cat = tile.dataset.cat;
        runHomeSearch(searchQueryForCategory(cat));
      });
    });
  }

  // ==========================================================================
  // Start
  // ==========================================================================
  document.addEventListener("DOMContentLoaded", () => {
    // If the user deep-linked to a /match or /ask URL, switch into the
    // right mode synchronously BEFORE other init runs so the landing page
    // doesn't flash. The inline pre-paint guard (html.is-match-route /
    // html.is-takeover-route) handled this for first paint; we mirror it
    // on the body class now and drop the html-level hints.
    const initialKind = parseRoute(window.location.pathname).kind;
    // The 6-question wizard has been retired in favour of the AI-driven
    // home search. If the user landed on a /step-N or /done URL (old
    // bookmark, browser back), silently redirect them to the home page.
    if (initialKind === "step" || initialKind === "done") {
      history.replaceState({}, "", "/landscaping");
    } else if (initialKind === "ask-result" || initialKind === "ask-empty") {
      document.body.classList.add("takeover-mode");
      const flow = $("#takeover-flow");
      if (flow) { flow.hidden = false; flow.setAttribute("aria-hidden", "false"); }
    }
    document.documentElement.classList.remove("is-match-route");
    document.documentElement.classList.remove("is-takeover-route");

    initNav();
    initReveal();
    initZipCheck();
    initEstimator();
    loadMatchState();
    bindMatchFlow();
    bindTakeoverShell();
    loadCompareFromStorage();
    bindCompareBar();
    updateCompareBar();
    initChat();
    initHeroSearch();
    initCategoryTiles();
    bindPathChooser();
    // Kick off image manifest fetches in the background so company cards
    // and articles can render real photos on first paint. If the search
    // results are already visible by the time a manifest arrives, redo
    // the cards so they pick up their photos.
    const rerenderIfSearchOpen = () => {
      const listEl = document.getElementById("searchOutputList");
      if (!listEl) return;
      if (!document.body.classList.contains("home-search-active")) return;
      if (typeof window._lastSearchQuery === "string" && window._lastSearchQuery) {
        renderHomeSearchResults(window._lastSearchQuery, getUserLocation());
      }
    };
    loadArticleImageManifest().then(rerenderIfSearchOpen);
    loadProImageManifest().then(rerenderIfSearchOpen);
    bindLocationHelper();
    bindLocStatusButton();
    bindArticleStage();
    window.addEventListener("popstate", () => routePage());
    // Render the right view for the current URL.
    routePage();
    // Fetch the real pros from gold in the background. When it
    // resolves, swap the LANDSCAPERS list and re-render the directory
    // so the landing page shows the full set instead of the 6-pro
    // fallback. The match flow consults LANDSCAPERS at match-time
    // (in computeMatches), so it picks up the new list automatically.
    renderDirectory();   // initial render with fallback

    // Deep-link via ?q=... — used by service-article CTAs to land
    // homeowners directly into a pre-filled AI search.
    const _params = new URLSearchParams(window.location.search);
    const _deepQuery = (_params.get("q") || "").trim();

    fetchLandscapers().then(() => {
      renderDirectory();
      // Once the full pro list is loaded, run any deep-linked search
      if (_deepQuery) {
        // Strip the query param from the URL so reload doesn't loop
        history.replaceState({}, "", window.location.pathname);
        runHomeSearch(_deepQuery);
      }
    });
  });
})();
