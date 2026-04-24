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
  // Landscaper directory (sample)
  // ==========================================================================
  const LANDSCAPERS = [
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
    chatBusy: false
  };

  function ensureSessionId() {
    const key = "landscapingSessionId";
    let id = localStorage.getItem(key);
    if (!id) {
      id = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : Date.now() + "-" + Math.random().toString(16).slice(2);
      localStorage.setItem(key, id);
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
  // Wizard
  // ==========================================================================
  const QUESTION_STEPS = 6;

  function showStep(n) {
    state.step = n;
    $$(".wizard-step").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.step) === n);
    });
    renderProgress();
    updateNav();
    updateLiveCount();
    if (n === 6) renderResults();
  }

  function renderProgress() {
    const bar = $("#progressBar");
    bar.innerHTML = "";
    if (state.step >= 6) { bar.style.display = "none"; return; }
    bar.style.display = "flex";
    for (let i = 0; i < QUESTION_STEPS; i++) {
      const span = document.createElement("span");
      if (i <= state.step) span.classList.add("active");
      bar.appendChild(span);
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
    const nav = $("#wizardNav");
    if (state.step >= 6) { nav.style.display = "none"; return; }
    nav.style.display = "flex";
    back.style.visibility = state.step === 0 ? "hidden" : "visible";
    next.disabled = !currentStepValid();
    next.textContent = state.step === 5 ? "See my matches →" : "Next →";
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
    if (state.step === 0 || state.step >= 6) { el.textContent = ""; return; }
    const n = liveMatchCount();
    if (n === null) { el.textContent = ""; return; }
    el.textContent = n === 0
      ? "No pros match yet — adjust your answers or reach out and we'll expand our directory."
      : `${n} pro${n === 1 ? "" : "s"} match so far.`;
  }

  function bindWizard() {
    $$(".options").forEach((group) => {
      const question = group.dataset.question;
      group.addEventListener("click", (e) => {
        const btn = e.target.closest(".option");
        if (!btn) return;
        $$(".option", group).forEach((o) => o.classList.remove("selected"));
        btn.classList.add("selected");
        state.answers[question] = btn.dataset.value;
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
        zip.parentElement.classList.toggle(
          "invalid",
          cleaned.length > 0 && !/^\d{5}$/.test(cleaned)
        );
        updateNav();
      });
    }

    ["name", "email", "phone", "notes"].forEach((field) => {
      const el = $("#" + field);
      if (!el) return;
      el.addEventListener("input", (e) => {
        state.answers[field] = e.target.value;
        const wrap = el.parentElement;
        if (field === "email") {
          const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value);
          wrap.classList.toggle("invalid", e.target.value.length > 0 && !valid);
        } else if (field === "name") {
          wrap.classList.toggle("invalid", false);
        }
        updateNav();
      });
    });

    $("#backBtn").addEventListener("click", () => {
      if (state.step > 0) showStep(state.step - 1);
    });
    $("#nextBtn").addEventListener("click", () => {
      if (!currentStepValid()) return;
      if (state.step === 5) { computeMatches(); showStep(6); return; }
      showStep(state.step + 1);
    });
    $("#modalClose").addEventListener("click", () => {
      $("#thanksModal").classList.remove("show");
      resetWizard();
    });
  }

  function resetWizard() {
    state.answers = {
      projectType: null, propertySize: null, budget: null,
      timeline: null, zip: "", name: "", email: "", phone: "", notes: ""
    };
    state.matches = [];
    $$(".option").forEach((o) => o.classList.remove("selected"));
    ["zip", "name", "email", "phone", "notes"].forEach((id) => {
      const el = $("#" + id);
      if (el) el.value = "";
    });
    showStep(0);
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
    const subtitle = $("#resultsSubtitle");
    list.innerHTML = "";

    if (state.matches.length === 0) {
      list.style.display = "none";
      none.style.display = "block";
      subtitle.textContent = "We couldn't find an exact match — here's what's next.";
      return;
    }
    list.style.display = "flex";
    none.style.display = "none";
    subtitle.textContent = "Based on your answers, these pros are the best fit.";

    state.matches.forEach(({ pro, score }) => {
      list.appendChild(buildMatchCard(pro, score, true));
    });

    $$(".contact-btn", list).forEach((btn) => {
      btn.addEventListener("click", () => submitLead(btn.dataset.pro));
    });
  }

  function buildMatchCard(pro, score, showCompare) {
    const el = document.createElement("div");
    el.className = "match";
    const initials = pro.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const tags = pro.services.slice(0, 3)
      .map((s) => `<span class="tag">${serviceLabel(s)}</span>`).join("");

    el.innerHTML = `
      <div class="avatar" aria-hidden="true">${initials}</div>
      <div class="body">
        <h4>${esc(pro.name)}</h4>
        <div class="meta">${esc(pro.city)} · ★ ${pro.rating.toFixed(1)} (${pro.reviews})</div>
        <div class="tags">${tags}</div>
        <p>${esc(pro.blurb)}</p>
        <div class="actions">
          <button class="btn btn-primary btn-sm contact-btn" data-pro="${pro.id}">Request a quote</button>
          <a href="tel:${pro.phone.replace(/\D/g,"")}" class="btn btn-outline btn-sm">Call</a>
          ${showCompare ? `<label class="compare-toggle"><input type="checkbox" data-compare="${pro.id}"> Compare</label>` : ""}
        </div>
        ${score != null ? `<div class="score">Match score: ${score.toFixed(1)}</div>` : ""}
      </div>
    `;
    return el;
  }

  function renderDirectory() {
    const dir = $("#prosDirectory");
    if (!dir) return;
    dir.innerHTML = "";
    LANDSCAPERS.forEach((pro) => {
      const card = buildMatchCard(pro, null, true);
      dir.appendChild(card);
    });
    dir.addEventListener("click", (e) => {
      const btn = e.target.closest(".contact-btn");
      if (btn) submitLead(btn.dataset.pro);
    });
    dir.addEventListener("change", (e) => {
      const box = e.target.closest('[data-compare]');
      if (!box) return;
      if (box.checked) state.compare.add(box.dataset.compare);
      else state.compare.delete(box.dataset.compare);
      if (state.compare.size > 2) {
        box.checked = false;
        state.compare.delete(box.dataset.compare);
        alert("Compare up to two pros at a time.");
      }
      updateCompareBar();
    });
  }

  function serviceLabel(s) {
    return ({
      lawn_care: "Lawn care", design_install: "Design & install",
      hardscape: "Hardscaping", tree_shrub: "Tree & shrub",
      irrigation: "Irrigation", seasonal: "Seasonal cleanup"
    })[s] || s;
  }

  function updateCompareBar() {
    const bar = $("#compareBar");
    const text = $("#compareText");
    const n = state.compare.size;
    text.textContent = `${n} pro${n === 1 ? "" : "s"} selected`;
    bar.classList.toggle("show", n > 0);
  }

  function bindCompareBar() {
    $("#compareBtn").addEventListener("click", () => {
      if (state.compare.size < 2) {
        alert("Select two pros to compare.");
        return;
      }
      const ids = Array.from(state.compare);
      const pros = ids.map((id) => LANDSCAPERS.find((p) => p.id === id));
      const msg = pros.map((p) =>
        `${p.name} — ${p.city} — ★ ${p.rating} — ${p.services.map(serviceLabel).join(", ")} — ${p.phone}`
      ).join("\n\n");
      alert("Side-by-side:\n\n" + msg);
    });
    $("#compareClear").addEventListener("click", () => {
      state.compare.clear();
      $$("[data-compare]").forEach((b) => (b.checked = false));
      updateCompareBar();
    });
  }

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
    if (opts && opts.html) msg.innerHTML = text;
    else msg.textContent = text;
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

  // Infer project type from conversation and pre-fill wizard.
  function inferAndPrefill(text) {
    const lower = text.toLowerCase();
    if (!state.answers.projectType) {
      for (const row of KEYWORD_TO_SERVICE) {
        if (row.words.some((w) => lower.includes(w))) {
          state.answers.projectType = row.svc;
          const btn = document.querySelector(`.options[data-question="projectType"] .option[data-value="${row.svc}"]`);
          if (btn) { $$(".option", btn.parentElement).forEach((o) => o.classList.remove("selected")); btn.classList.add("selected"); }
          break;
        }
      }
    }
    // ZIP extraction
    const zipMatch = text.match(/\b(600\d{2})\b/);
    if (zipMatch && CRYSTAL_LAKE_ZIPS.has(zipMatch[1])) {
      state.answers.zip = zipMatch[1];
      const zipEl = $("#zip"); if (zipEl) zipEl.value = zipMatch[1];
      const zipCheck = $("#zipCheckInput"); if (zipCheck) zipCheck.value = zipMatch[1];
    }
    // Urgency
    if (!state.answers.timeline) {
      if (/(asap|urgent|this week|emergency)/.test(lower)) state.answers.timeline = "asap";
      else if (/(this month|next couple weeks)/.test(lower)) state.answers.timeline = "month";
    }
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
          kb_type: "client"
        })
      });

      let data = null;
      try { data = await res.json(); } catch (_) {}

      typingEl.remove();

      if (!res.ok || !data) {
        addMessage("bot", "Hmm, I couldn't reach the advisor service just now. You can still get matched using the form below — or call (815) 555-0100.");
      } else {
        const answer = data.answer || data.response || "Got it.";
        const botMsg = addMessage("bot", answer);

        // If the AI response mentions getting matched, offer inline CTA
        if (/match|get matched|form|wizard|pro/i.test(answer)) {
          const cta = document.createElement("div");
          cta.style.marginTop = "8px";
          cta.innerHTML = `<a href="#wizard" class="btn btn-outline btn-sm">Start quick match →</a>`;
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

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = (input.value || "").trim();
      if (v) sendMessage(v);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const v = (input.value || "").trim();
        if (v) sendMessage(v);
      }
    });

    // Chip delegation (chips get replaced on each response)
    $("#chatChips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      sendMessage(b.dataset.prompt);
    });

    // Service cards: "Ask the AI →" prefills a question
    $$(".service-card").forEach((card) => {
      card.addEventListener("click", () => {
        const q = card.dataset.question;
        if (!q) return;
        document.querySelector("#ask-ai").scrollIntoView({ behavior: "smooth" });
        setTimeout(() => sendMessage(q), 400);
      });
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
  // Start
  // ==========================================================================
  document.addEventListener("DOMContentLoaded", () => {
    initNav();
    initReveal();
    initZipCheck();
    initEstimator();
    bindWizard();
    renderDirectory();
    bindCompareBar();
    initChat();
    showStep(0);
  });
})();
