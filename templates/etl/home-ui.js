function switchTabPanel(evt, cityName) {
  var i, tabcontent, tablinks;
  tabcontent = document.getElementsByClassName("tabcontent");
  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }
  tablinks = document.getElementsByClassName("tablinks");
  for (i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }
  document.getElementById(cityName).style.display = "flex";
  document.getElementById(cityName).style.flexDirection = "column";
  document.getElementById(cityName).style.gap = "30px";

  if (evt && evt.currentTarget) {
    evt.currentTarget.className += " active";
  }
  if (cityName === "scheduled_triggers") {
    refreshScheduledTriggerRuns();
  }
}

var cachedTriggers = [];
var selectedTriggerId = "";
var scheduledTriggerRuns = [];

function updateScheduledTriggerOptions(triggers, activePipelineId) {
  var select = document.getElementById("scheduled_trigger_select");
  if (!select) {
    return;
  }
  select.innerHTML = "";
  var effectivePipelineId = activePipelineId || pipeline_id || "";
  var filtered = Array.isArray(triggers)
    ? triggers.filter(function(item) {
        if (!effectivePipelineId) {
          return true;
        }
        return !item.pipeline_id || item.pipeline_id === effectivePipelineId;
      })
    : [];
  filtered.forEach(function(item) {
    var opt = document.createElement("option");
    opt.value = item.trigger_id || "";
    opt.textContent = item.name || item.trigger_id || "Untitled Trigger";
    select.appendChild(opt);
  });
  var hasSelected = filtered.some(function(item) {
    return item.trigger_id === selectedTriggerId;
  });
  if ((!selectedTriggerId || !hasSelected) && filtered.length) {
    selectedTriggerId = filtered[0].trigger_id || "";
  }
  if (selectedTriggerId) {
    select.value = selectedTriggerId;
  }
  refreshScheduledTriggerRuns();
}

function setSelectedTrigger(triggerId) {
  selectedTriggerId = triggerId || "";
  var select = document.getElementById("scheduled_trigger_select");
  if (select && selectedTriggerId) {
    select.value = selectedTriggerId;
  }
}

function refreshScheduledTriggerRuns() {
  var list = document.getElementById("scheduled_trigger_list");
  var empty = document.getElementById("scheduled_trigger_empty");
  var table = document.getElementById("scheduled_trigger_table");
  if (!table || !empty) {
    return;
  }
  if (!selectedTriggerId) {
    table.innerHTML = "";
    empty.textContent = "Select a trigger to see run history.";
    empty.style.display = "block";
    return;
  }
  var request = new Request("/etl/trigger/runs?triggerId=" + encodeURIComponent(selectedTriggerId), {
    method: "GET",
    headers: new Headers({
      "Accept": "application/json"
    })
  });
  fetch(request)
    .then(function(response) {
      if (!response.ok) {
        return { runs: [] };
      }
      return response.json();
    })
    .then(function(result) {
      var runs = result && Array.isArray(result.runs) ? result.runs : [];
      renderScheduledTriggerRuns(runs);
    })
    .catch(function(error) {
      console.error(error);
    });
}

function renderScheduledTriggerRuns(runs) {
  var list = document.getElementById("scheduled_trigger_table");
  var empty = document.getElementById("scheduled_trigger_empty");
  if (!list || !empty) {
    return;
  }
  list.innerHTML = "";
  if (!runs.length) {
    empty.textContent = "No executions logged yet.";
    empty.style.display = "block";
    scheduledTriggerRuns = [];
    return;
  }
  empty.style.display = "none";
  var triggerName = getTriggerNameById(selectedTriggerId);
  scheduledTriggerRuns = runs.slice().map(function(entry) {
    var startedAt = entry.started_at || "";
    var finishedAt = entry.finished_at || "";
    return {
      "trigger name": triggerName || selectedTriggerId,
      "start": formatRunTimestamp(startedAt) || "Unknown",
      "end": finishedAt ? formatRunTimestamp(finishedAt) : "In progress",
      "duration": formatRunDuration(startedAt, finishedAt),
      "status": entry.status || "unknown"
    };
  }).reverse();
  createTable(scheduledTriggerRuns, list, "scheduled_trigger");
  decorateStatusTable("scheduled_trigger_table");
}

function formatRunTimestamp(value) {
  if (!value) {
    return "";
  }
  var parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function getTriggerNameById(triggerId) {
  if (!triggerId || !Array.isArray(cachedTriggers)) {
    return "";
  }
  var match = cachedTriggers.find(function(item) {
    return item.trigger_id === triggerId;
  });
  return match ? (match.name || "") : "";
}

function formatRunDuration(startValue, endValue) {
  if (!startValue || !endValue) {
    return "In progress";
  }
  var start = new Date(startValue);
  var end = new Date(endValue);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return "Unknown";
  }
  var diffMs = Math.max(0, end.getTime() - start.getTime());
  var totalMinutesRaw = diffMs / 60000;
  var totalMinutes = Math.floor(totalMinutesRaw);
  var hours = Math.floor(totalMinutes / 60);
  var minutes = totalMinutes % 60;
  if (totalMinutes === 0) {
    return totalMinutesRaw.toFixed(2) + " min";
  }
  if (hours <= 0) {
    return minutes + " min";
  }
  return hours + " hr " + minutes + " min";
}

function decorateStatusTable(tableId) {
  var container = document.getElementById(tableId);
  if (!container) {
    return;
  }
  var table = container.querySelector("table");
  if (!table) {
    return;
  }
  var headers = Array.from(table.querySelectorAll("thead th"));
  var statusIndex = headers.findIndex(function(th) {
    return (th.dataset.label || "").toLowerCase() === "status";
  });
  if (statusIndex === -1) {
    return;
  }
  var rows = table.querySelectorAll("tbody tr");
  rows.forEach(function(row) {
    var cell = row.children[statusIndex];
    if (!cell) {
      return;
    }
    var value = (cell.textContent || "").trim().toLowerCase();
    var pill = document.createElement("span");
    pill.className = "pill";
    if (value === "success") {
      pill.classList.add("pill-success");
    } else if (value === "in progress") {
      pill.classList.add("pill-running");
      var dot = document.createElement("span");
      dot.className = "dot";
      pill.appendChild(dot);
    } else if (value === "error") {
      pill.classList.add("pill-error");
    } else {
      pill.classList.add("pill-neutral");
    }
    pill.appendChild(document.createTextNode(value || "unknown"));
    cell.textContent = "";
    cell.appendChild(pill);
  });
}

function createGoogleLoginButton() {
  var container = document.getElementById("chart_container");
  if (!container || document.getElementById("googleLoginButton")) {
    return;
  }

  var button = document.createElement("button");
  button.id = "googleLoginButton";
  button.type = "button";
  button.className = "google-login-button";
  button.setAttribute("aria-label", "Sign in with Google");
  button.innerHTML = [
    '<span class="google-login-icon" aria-hidden="true">',
    '<svg viewBox="0 0 24 24" role="img">',
    '<path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-1.4 3.5-5.1 3.5-3.1 0-5.6-2.5-5.6-5.6S8.9 6 12 6c1.8 0 3 .7 3.7 1.4l2.5-2.5C16.8 3.5 14.6 2.6 12 2.6 7.2 2.6 3.4 6.4 3.4 11.2S7.2 19.8 12 19.8c5.2 0 8.6-3.6 8.6-8.6 0-.6-.1-1.1-.2-1.6H12z"/>',
    '<path fill="#34A853" d="M3.9 7.2l3 2.2C7.8 7.6 9.7 6 12 6c1.8 0 3 .7 3.7 1.4l2.5-2.5C16.8 3.5 14.6 2.6 12 2.6c-3.4 0-6.3 1.9-8.1 4.6z"/>',
    '<path fill="#FBBC05" d="M12 19.8c2.6 0 4.8-.9 6.4-2.4l-3-2.4c-.8.6-1.9 1-3.4 1-2.3 0-4.3-1.6-5-3.7l-3 2.3c1.7 3.3 5.1 5.2 8 5.2z"/>',
    '<path fill="#4285F4" d="M20.4 11.2c0-.6-.1-1.1-.2-1.6H12v3.6h5.1c-.3 1.3-1.4 2.9-3.4 3.7l3 2.4c1.8-1.6 2.7-4 2.7-7.1z"/>',
    "</svg>",
    "</span>",
    "<span>Sign in</span>"
  ].join("");

  button.addEventListener("click", function() {
    startGoogleLogin(button);
  });

  container.appendChild(button);
  updateGoogleLoginButtonStatus();
}

function startGoogleLogin(button) {
  if (button) {
    button.disabled = true;
    button.classList.add("is-loading");
  }

  var oauthConfig = window.GOOGLE_OAUTH_CONFIG || {};
  var payload = {
    client_id: oauthConfig.client_id || "",
    redirect_uri: oauthConfig.redirect_uri || "",
    scopes: oauthConfig.scopes || "",
    state: oauthConfig.state || ""
  };
  var fallbackUrl = buildGoogleLoginUrl(payload);

  var request = new Request("/etl/google/login", {
    method: "POST",
    headers: new Headers({
      "Accept": "application/json",
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });

  fetch(request)
    .then(function(response) {
      if (!response.ok) {
        throw new Error("Google login request failed");
      }
      return response.json();
    })
    .then(function(data) {
      if (!data || !data.url) {
        if (fallbackUrl) {
          window.location.href = fallbackUrl;
          return;
        }
        throw new Error("Google login URL missing");
      }
      window.location.href = data.url;
    })
    .catch(function(error) {
      console.error(error);
      if (button) {
        button.disabled = false;
        button.classList.remove("is-loading");
      }
    });
}

function buildGoogleLoginUrl(payload) {
  if (!payload || !payload.client_id || !payload.redirect_uri) {
    return null;
  }
  var params = new URLSearchParams({
    client_id: payload.client_id,
    redirect_uri: payload.redirect_uri,
    response_type: "code",
    scope: payload.scopes || "openid email profile",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true"
  });
  if (payload.state) {
    params.set("state", payload.state);
  }
  return "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
}

function updateGoogleLoginButtonStatus() {
  var button = document.getElementById("googleLoginButton");
  if (!button) {
    return;
  }
  var request = new Request("/etl/google/status", {
    method: "GET",
    headers: new Headers({
      "Accept": "application/json"
    })
  });
  fetch(request)
    .then(function(response) {
      if (!response.ok) {
        throw new Error("Google status request failed");
      }
      return response.json();
    })
    .then(function(data) {
      if (!data || !data.logged_in) {
        return;
      }
      window.googleLoginProfile = data;
      loadPipelineFromBlobStorage();
      fetchPipelineList();
      fetchSavedPipelineList();
      fetchTriggerList();
      var icon = button.querySelector(".google-login-icon");
      var label = button.querySelector("span:last-child");
      if (icon && data.picture) {
        icon.innerHTML = '<img class="google-login-avatar" src="' + data.picture + '" alt="Google profile">';
      }
      if (label) {
        label.textContent = data.name ? data.name : "Signed in";
      }
      button.classList.add("is-signed-in");
      if (data.email) {
        button.title = data.email;
      }
    })
    .catch(function(error) {
      console.error(error);
    });
}


document.addEventListener("DOMContentLoaded", function() {
  var body = document.body;
  var toggleButtons = [
    document.getElementById("sidebarToggle"),
    document.getElementById("sidebarToggleFloating")
  ];
  var searchInput = document.getElementById("activitySearch");
  var activityButtons = Array.prototype.slice.call(
    document.querySelectorAll(".sidebar-buttons .create_operator")
  );
  var activityGroups = Array.prototype.slice.call(
    document.querySelectorAll(".activity-group")
  );
  var groupToggle = document.getElementById("groupToggle");
  var newPipelineButton = document.getElementById("newPipelineButton");
  var newSavedPipelineButton = document.getElementById("newSavedPipelineButton");
  var newTriggerButton = document.getElementById("newTriggerButton");
  var pipelinePanel = document.querySelector(".pipeline-panel");
  var savedPipelinePanel = document.querySelector(".pipeline-panel--pipelines");
  var triggerGroup = document.getElementById("savedTriggersGroup");
  var sidebarButtons = document.querySelector(".sidebar-buttons");
  var scheduledTriggerSelect = document.getElementById("scheduled_trigger_select");
  var scheduledTriggerRefresh = document.getElementById("scheduled_trigger_refresh");
  var scheduledTriggerExport = document.getElementById("scheduled_trigger_export");
  var pipelineGroup = null;
  var savedPipelineGroup = null;
  var ingestGroup = null;
  Array.prototype.slice.call(document.querySelectorAll(".activity-group summary")).some(function(summary) {
    if ((summary.textContent || "").trim().toLowerCase() === "ingest") {
      ingestGroup = summary.parentElement;
      return true;
    }
    return false;
  });

  function syncSidebarToggle() {
    var isCollapsed = body.classList.contains("sidebar-collapsed");
    toggleButtons.forEach(function(button) {
      if (!button) {
        return;
      }
      button.textContent = isCollapsed ? "Activities" : "Hide";
      button.setAttribute(
        "aria-label",
        isCollapsed ? "Show activities panel" : "Collapse activities panel"
      );
    });
  }

  function toggleSidebar() {
    body.classList.toggle("sidebar-collapsed");
    syncSidebarToggle();
    window.dispatchEvent(new Event("resize"));
    if (window.applyFlowchartPanZoom) {
      window.applyFlowchartPanZoom();
    }
  }

  function syncGroupToggle() {
    if (!groupToggle) {
      return;
    }
    var allOpen = activityGroups.every(function(group) {
      return group.open;
    });
    if (pipelineGroup) {
      allOpen = allOpen && pipelineGroup.open;
    }
    if (savedPipelineGroup) {
      allOpen = allOpen && savedPipelineGroup.open;
    }
    if (triggerGroup) {
      allOpen = allOpen && triggerGroup.open;
    }
    groupToggle.textContent = allOpen ? "Collapse All" : "Expand All";
    groupToggle.setAttribute(
      "aria-label",
      allOpen ? "Collapse all activity groups" : "Expand all activity groups"
    );
  }

  if (groupToggle) {
    groupToggle.addEventListener("click", function() {
      var shouldOpenAll = activityGroups.some(function(group) {
        return !group.open;
      });
      if (pipelineGroup && !pipelineGroup.open) {
        shouldOpenAll = true;
      }
      if (savedPipelineGroup && !savedPipelineGroup.open) {
        shouldOpenAll = true;
      }
      if (triggerGroup && !triggerGroup.open) {
        shouldOpenAll = true;
      }
      activityGroups.forEach(function(group) {
        group.open = shouldOpenAll;
      });
      if (pipelineGroup) {
        pipelineGroup.open = shouldOpenAll;
      }
      if (savedPipelineGroup) {
        savedPipelineGroup.open = shouldOpenAll;
      }
      if (triggerGroup) {
        triggerGroup.open = shouldOpenAll;
      }
      syncGroupToggle();
    });
  }

  if (scheduledTriggerSelect) {
    scheduledTriggerSelect.addEventListener("change", function() {
      setSelectedTrigger(this.value);
      refreshScheduledTriggerRuns();
    });
  }
  if (scheduledTriggerRefresh) {
    scheduledTriggerRefresh.addEventListener("click", function() {
      refreshScheduledTriggerRuns();
    });
  }
  if (scheduledTriggerExport) {
    scheduledTriggerExport.addEventListener("click", function() {
      if (!scheduledTriggerRuns.length) {
        return;
      }
      var data = jsonToCsv(scheduledTriggerRuns);
      const blob = new Blob([data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "scheduled_trigger_runs.csv";
      a.click();
    });
  }
  if (newPipelineButton) {
    newPipelineButton.addEventListener("click", function() {
      setActivePipelineType("dataflow");
      if (typeof window.flowchartClearWorkspace === "function") {
        window.flowchartClearWorkspace();
      }
    });
  }
  if (newSavedPipelineButton) {
    newSavedPipelineButton.addEventListener("click", function() {
      setActivePipelineType("pipeline");
      if (typeof window.flowchartClearWorkspace === "function") {
        window.flowchartClearWorkspace();
      }
    });
  }
  if (newTriggerButton) {
    newTriggerButton.addEventListener("click", function() {
      if (typeof window.openTriggerModal === "function") {
        window.openTriggerModal("select");
      }
    });
  }

  if (pipelinePanel && ingestGroup && sidebarButtons) {
    var pipelineDetails = document.createElement("details");
    pipelineDetails.className = "pipeline-collapsible";
    pipelineDetails.open = true;
    var pipelineSummary = document.createElement("summary");
    pipelineSummary.textContent = "Saved Dataflows";
    pipelineSummary.setAttribute("aria-controls", "pipelinePanelBody");
    var pipelineBody = document.createElement("div");
    pipelineBody.className = "pipeline-collapsible-body";
    pipelineBody.id = "pipelinePanelBody";
    pipelineBody.appendChild(pipelinePanel);
    pipelineDetails.appendChild(pipelineSummary);
    pipelineDetails.appendChild(pipelineBody);
    sidebarButtons.insertBefore(pipelineDetails, ingestGroup.nextSibling);
    if (triggerGroup) {
      sidebarButtons.insertBefore(triggerGroup, ingestGroup.nextSibling);
    }
    pipelineGroup = pipelineDetails;
  }
  if (savedPipelinePanel && pipelineGroup && sidebarButtons) {
    var savedPipelineDetails = document.createElement("details");
    savedPipelineDetails.className = "pipeline-collapsible";
    savedPipelineDetails.open = true;
    var savedPipelineSummary = document.createElement("summary");
    savedPipelineSummary.textContent = "Saved Pipelines";
    savedPipelineSummary.setAttribute("aria-controls", "savedPipelinePanelBody");
    var savedPipelineBody = document.createElement("div");
    savedPipelineBody.className = "pipeline-collapsible-body";
    savedPipelineBody.id = "savedPipelinePanelBody";
    savedPipelineBody.appendChild(savedPipelinePanel);
    savedPipelineDetails.appendChild(savedPipelineSummary);
    savedPipelineDetails.appendChild(savedPipelineBody);
    sidebarButtons.insertBefore(savedPipelineDetails, pipelineGroup.nextSibling);
    savedPipelineGroup = savedPipelineDetails;
  }

  activityGroups.forEach(function(group) {
    group.addEventListener("toggle", syncGroupToggle);
  });
  if (triggerGroup) {
    triggerGroup.addEventListener("toggle", syncGroupToggle);
  }
  if (savedPipelineGroup) {
    savedPipelineGroup.addEventListener("toggle", syncGroupToggle);
  }

  toggleButtons.forEach(function(button) {
    if (button) {
      button.addEventListener("click", toggleSidebar);
    }
  });

  if (searchInput) {
    searchInput.addEventListener("input", function(event) {
      var query = (event.target.value || "").trim().toLowerCase();
      activityButtons.forEach(function(button) {
        var label = (button.textContent || "").toLowerCase();
        var matches = query.length === 0 || label.indexOf(query) !== -1;
        button.style.display = matches ? "" : "none";
      });

      activityGroups.forEach(function(group) {
        if (group.classList.contains("saved-triggers-group")) {
          return;
        }
        var groupButtons = group.querySelectorAll(".create_operator");
        var hasVisible = false;
        for (var i = 0; i < groupButtons.length; i++) {
          if (groupButtons[i].style.display !== "none") {
            hasVisible = true;
            break;
          }
        }
        group.style.display = hasVisible ? "" : "none";
      });

      var pipelineList = document.getElementById("pipelineList");
      if (pipelineList) {
        var rows = pipelineList.querySelectorAll(".pipeline-list-row");
        rows.forEach(function(row) {
          var labelEl = row.querySelector(".pipeline-list-label");
          var name = (labelEl && labelEl.textContent ? labelEl.textContent : "").toLowerCase();
          var matches = query.length === 0 || name.indexOf(query) !== -1;
          row.style.display = matches ? "" : "none";
        });
      }
      var savedPipelineList = document.getElementById("savedPipelineList");
      if (savedPipelineList) {
        var savedRows = savedPipelineList.querySelectorAll(".pipeline-list-row");
        savedRows.forEach(function(row) {
          var labelEl = row.querySelector(".pipeline-list-label");
          var name = (labelEl && labelEl.textContent ? labelEl.textContent : "").toLowerCase();
          var matches = query.length === 0 || name.indexOf(query) !== -1;
          row.style.display = matches ? "" : "none";
        });
      }
    });
  }

  syncGroupToggle();
  syncSidebarToggle();
  createGoogleLoginButton();
});

document.addEventListener("mousemove", function(event) {
  // console.log('Mouse X:', event.clientX, 'Mouse Y:', event.clientY);
});

let pipeline_id;
var activePipelineType = "dataflow";
var pipelineNameCounter = 1;
var suspendPipelineSave = false;
var emptyPipelineSeeded = false;
var suppressEmptyPipelineSeed = false;
var disableEmptyPipelineSeed = false;
var cachedPipelines = [];
var cachedSavedPipelines = [];
var operatorI = 0;

function reserveNextOperatorId() {
  var maxExisting = -1;
  if (typeof $flowchart !== "undefined" && $flowchart && $flowchart.length) {
    try {
      var operators = $flowchart.flowchart("getOperators") || {};
      Object.keys(operators).forEach(function(key) {
        var n = parseInt(key, 10);
        if (!isNaN(n) && n > maxExisting) {
          maxExisting = n;
        }
      });
    } catch (e) {}
  }
  var next = Math.max(operatorI, maxExisting + 1);
  operatorI = next + 1;
  if (typeof window.flowchartSetOperatorIndex === "function") {
    try { window.flowchartSetOperatorIndex(operatorI); } catch (e) {}
  }
  return next;
}

function setOperatorIndexFromActivities(activities) {
  var ids = [];
  if (activities && typeof activities === "object") {
    Object.keys(activities).forEach(function(operatorId) {
      var parsed = parseInt(operatorId, 10);
      if (!isNaN(parsed)) {
        ids.push(parsed);
      }
    });
  }
  var nextId = ids.length ? Math.max.apply(null, ids) + 1 : 0;
  operatorI = nextId;
  if (typeof window.flowchartSetOperatorIndex === "function") {
    window.flowchartSetOperatorIndex(nextId);
  }
}

function normalizeLinkOperatorIds(links) {
  if (!links || typeof links !== "object") {
    return links;
  }
  Object.keys(links).forEach(function(linkId) {
    var link = links[linkId];
    if (!link) {
      return;
    }
    if (link.fromOperator != null) {
      link.fromOperator = String(link.fromOperator);
    }
    if (link.toOperator != null) {
      link.toOperator = String(link.toOperator);
    }
  });
  return links;
}

function setCurrentPipelineId(value) {
  pipeline_id = value;
  try {
    localStorage.setItem("etl_pipeline_id", value || "");
  } catch (error) {
    // ignore storage errors
  }
}

function setActivePipelineType(type) {
  if (type !== "dataflow" && type !== "pipeline") {
    return;
  }
  var wasInNotebookMode = document.body.classList.contains("notebook-mode");
  if (window.NB && typeof window.NB.hideNotebookView === "function") {
    window.NB.hideNotebookView();
  }
  if (wasInNotebookMode) {
    // The chart container was display:none under notebook-mode — force a layout pass
    // and a flowchart redraw on the next frame so links/operators paint immediately
    // instead of waiting for the user to interact with the canvas.
    var chartEl = document.getElementById("chart_container");
    if (chartEl) {
      void chartEl.offsetHeight;
    }
    requestAnimationFrame(function() {
      if ($flowchart && $flowchart.flowchart) {
        try { $flowchart.flowchart("redrawLinksLayer"); } catch (_) { /* ignore */ }
      }
      if (typeof window.repositionImportPlaceholder === "function") {
        window.repositionImportPlaceholder();
      }
      if (typeof window.repositionSelectPlaceholders === "function") {
        window.repositionSelectPlaceholders();
      }
      if (typeof window.scheduleLinkAddRefresh === "function") {
        window.scheduleLinkAddRefresh();
      }
    });
  }
  activePipelineType = type;
  try {
    localStorage.setItem("etl_pipeline_type", type);
  } catch (error) {
    // ignore storage errors
  }
  renderPipelineListSelection(type === "dataflow" ? pipeline_id : "");
  renderSavedPipelineListSelection(type === "pipeline" ? pipeline_id : "");
  // Clear notebook highlight when switching to dataflow/pipeline.
  document.querySelectorAll('#notebookList .ds-sidebar-list-row.is-active').forEach(function(r) {
    r.classList.remove('is-active');
  });
  var importPlaceholderEl = document.getElementById("importPlaceholder");
  var selectPlaceholdersEl = document.getElementById("selectPlaceholders");
  var linkAddLayerEl = document.getElementById("linkAddLayer");
  if (type === "pipeline") {
    if (importPlaceholderEl) {
      importPlaceholderEl.style.visibility = "hidden";
    }
    if (selectPlaceholdersEl) {
      selectPlaceholdersEl.innerHTML = "";
    }
    if (linkAddLayerEl) {
      linkAddLayerEl.innerHTML = "";
    }
    if (typeof window.setOperatorDraggingEnabled === "function") {
      window.setOperatorDraggingEnabled(true);
    }
  } else {
    if (importPlaceholderEl) {
      importPlaceholderEl.style.visibility = "";
    }
    if (typeof window.repositionImportPlaceholder === "function") {
      window.repositionImportPlaceholder();
    }
    if (typeof window.repositionSelectPlaceholders === "function") {
      window.repositionSelectPlaceholders();
    }
    if (typeof window.scheduleLinkAddRefresh === "function") {
      window.scheduleLinkAddRefresh();
    }
    if (typeof window.setOperatorDraggingEnabled === "function") {
      window.setOperatorDraggingEnabled(false);
    }
  }
  if (typeof window.updatePipelineActivitiesTab === "function") {
    window.updatePipelineActivitiesTab();
  }
  updateTriggerVisibility();
}
window.setActivePipelineType = setActivePipelineType;

function updateTriggerVisibility() {
  const triggerButton = document.getElementById("createTrigger");
  const triggerGroup = document.getElementById("savedTriggersGroup");
  const triggerTab = document.getElementById("tabScheduledTriggers");
  const isPipeline = activePipelineType === "pipeline";
  if (triggerButton) {
    triggerButton.disabled = !isPipeline;
    triggerButton.classList.toggle("is-disabled", !isPipeline);
    triggerButton.setAttribute("aria-disabled", isPipeline ? "false" : "true");
  }
  if (triggerGroup) {
    triggerGroup.style.display = isPipeline ? "" : "none";
  }
  if (triggerTab) {
    triggerTab.style.display = isPipeline ? "" : "none";
  }
}

function placeholdersEnabled() {
  return activePipelineType === "dataflow";
}

function getPipelineStorageBase(type) {
  return type === "pipeline" ? "pipeline" : "dataflow";
}

function getAvailableDataflows() {
  return Array.isArray(cachedPipelines) ? cachedPipelines : [];
}
window.getAvailableDataflows = getAvailableDataflows;

function getAvailablePipelines() {
  return Array.isArray(cachedSavedPipelines) ? cachedSavedPipelines : [];
}
window.getAvailablePipelines = getAvailablePipelines;

function generatePipelineId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "pipeline-" + Date.now().toString(16);
}

function getNextPipelineName() {
  var name = "pipeline_" + pipelineNameCounter;
  var list = document.getElementById("pipelineList");
  if (list) {
    var maxIndex = 0;
    var labels = Array.from(list.querySelectorAll(".pipeline-list-label"));
    labels.forEach(function(label) {
      var text = (label.textContent || "").trim();
      var match = /^pipeline_(\d+)$/.exec(text);
      if (match) {
        var num = parseInt(match[1], 10);
        if (!isNaN(num)) {
          maxIndex = Math.max(maxIndex, num);
        }
      }
    });
    if (maxIndex >= pipelineNameCounter) {
      pipelineNameCounter = maxIndex + 1;
    }
    name = "pipeline_" + pipelineNameCounter;
  }
  pipelineNameCounter += 1;
  return name;
}

async function post_pipeline(googleId, pipelineId, body) {
  var base = getPipelineStorageBase(activePipelineType);
  var request = new Request("/blob-storage/etl/" + base + "/save?googleId=" + googleId + "&pipelineId=" + pipelineId, {
    method: "POST",
    headers: new Headers({
      "Accept": "application/json"
    }),
    body: JSON.stringify(body)
  });

  fetch(request);
}

async function post_trigger(googleId, triggerId, body) {
  var request = new Request("/blob-storage/etl/trigger/save?googleId=" + googleId + "&triggerId=" + triggerId, {
    method: "POST",
    headers: new Headers({
      "Accept": "application/json"
    }),
    body: JSON.stringify(body)
  });

  return fetch(request);
}

async function post_trigger_cron(body) {
  var request = new Request("/etl/trigger/cron", {
    method: "POST",
    headers: new Headers({
      "Accept": "application/json"
    }),
    body: JSON.stringify(body)
  });

  return fetch(request);
}

async function post_trigger_cron_delete(triggerId) {
  var request = new Request("/etl/trigger/cron/delete", {
    method: "POST",
    headers: new Headers({
      "Accept": "application/json"
    }),
    body: JSON.stringify({ trigger_id: triggerId })
  });

  return fetch(request);
}

function renderPipelineListSelection(activeId) {
  var list = document.getElementById("pipelineList");
  if (!list) {
    return;
  }
  var entries = list.querySelectorAll("[data-pipeline-id]");
  entries.forEach(function(entry) {
    var id = entry.getAttribute("data-pipeline-id");
    if (id && id === activeId) {
      entry.classList.add("is-active");
    } else {
      entry.classList.remove("is-active");
    }
  });
}

function renderSavedPipelineListSelection(activeId) {
  var list = document.getElementById("savedPipelineList");
  if (!list) {
    return;
  }
  var entries = list.querySelectorAll("[data-pipeline-id]");
  entries.forEach(function(entry) {
    var id = entry.getAttribute("data-pipeline-id");
    if (id && id === activeId) {
      entry.classList.add("is-active");
    } else {
      entry.classList.remove("is-active");
    }
  });
}

function renderPipelineList(pipelines) {
  cachedPipelines = Array.isArray(pipelines) ? pipelines.slice() : [];
  window.cachedDataflows = cachedPipelines.slice();
  if (typeof window.refreshDataflowActivityOptions === "function") {
    window.refreshDataflowActivityOptions(window.cachedDataflows);
  }
  var list = document.getElementById("pipelineList");
  if (!list) {
    return;
  }
  list.innerHTML = "";
  var pipelineCountEl = document.getElementById("pipelineCount");
  if (pipelineCountEl) pipelineCountEl.textContent = String(cachedPipelines.length);
  function getDuplicateName(baseName) {
    var normalized = (baseName || "pipeline").replace(/_duplicate_\d+$/i, "");
    var maxIndex = 0;
    var sourceList = (floatingMenu && Array.isArray(floatingMenu._pipelines)) ? floatingMenu._pipelines : pipelines;
    sourceList.forEach(function(item) {
      var name = (item && item.pipeline_name) || "";
      var match = name.match(new RegExp("^" + normalized.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "_duplicate_(\\d+)$", "i"));
      if (match && match[1]) {
        var idx = parseInt(match[1], 10);
        if (!isNaN(idx)) {
          maxIndex = Math.max(maxIndex, idx);
        }
      }
    });
    return normalized + "_duplicate_" + (maxIndex + 1);
  }
  var floatingMenu = document.getElementById("pipelineOptionsMenu");
  if (!floatingMenu) {
    floatingMenu = document.createElement("div");
    floatingMenu.id = "pipelineOptionsMenu";
    floatingMenu.className = "pipeline-options-menu pipeline-options-menu--floating";
    var renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.textContent = "Rename Pipeline";
    renameBtn.addEventListener("click", function() {
      var pipelineId = floatingMenu.dataset.pipelineId;
      var pipelineName = floatingMenu.dataset.pipelineName || "Untitled Pipeline";
      closePipelineMenus();
      if (!pipelineId) {
        return;
      }
      var nextName = prompt("Rename pipeline", pipelineName);
      if (!nextName) {
        return;
      }
      var request = new Request("/blob-storage/etl/dataflow/load?pipelineId=" + pipelineId, {
        method: "GET",
        headers: new Headers({
          "Accept": "application/json"
        })
      });
      fetch(request)
        .then(function(response) {
          if (!response.ok) {
            return null;
          }
          return response.json();
        })
        .then(function(pipeline) {
          if (!pipeline) {
            return;
          }
          pipeline.pipeline_name = nextName.trim() || "pipeline";
          if (!pipeline.pipeline_id) {
            pipeline.pipeline_id = pipelineId;
          }
          var googleId = "unknown";
          if (window.googleLoginProfile && (window.googleLoginProfile.google_id || window.googleLoginProfile.email)) {
            googleId = window.googleLoginProfile.google_id || window.googleLoginProfile.email;
          }
          var safeGoogleId = googleId.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
          if (!safeGoogleId) {
            safeGoogleId = "unknown";
          }
          setActivePipelineType("dataflow");
          post_pipeline(safeGoogleId, pipeline.pipeline_id, pipeline);
          fetchPipelineList();
          if (pipeline_id === pipelineId) {
            $("#pipeline_title").val(pipeline.pipeline_name);
          }
        })
        .catch(function(error) {
          console.error(error);
        });
    });
    var duplicateBtn = document.createElement("button");
    duplicateBtn.type = "button";
    duplicateBtn.textContent = "Duplicate Pipeline";
    duplicateBtn.addEventListener("click", function() {
      var pipelineId = floatingMenu.dataset.pipelineId;
      if (!pipelineId) {
        return;
      }
      closePipelineMenus();
      var request = new Request("/blob-storage/etl/dataflow/load?pipelineId=" + pipelineId, {
        method: "GET",
        headers: new Headers({
          "Accept": "application/json"
        })
      });
      fetch(request)
        .then(function(response) {
          if (!response.ok) {
            return null;
          }
          return response.json();
        })
        .then(function(pipeline) {
          if (!pipeline) {
            return;
          }
          var newId = generatePipelineId();
          var nextName = getDuplicateName(pipeline.pipeline_name || "pipeline");
          pipeline.pipeline_id = newId;
          pipeline.pipeline_name = nextName;
          var googleId = "unknown";
          if (window.googleLoginProfile && (window.googleLoginProfile.google_id || window.googleLoginProfile.email)) {
            googleId = window.googleLoginProfile.google_id || window.googleLoginProfile.email;
          }
          var safeGoogleId = googleId.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
          if (!safeGoogleId) {
            safeGoogleId = "unknown";
          }
          setActivePipelineType("dataflow");
          post_pipeline(safeGoogleId, pipeline.pipeline_id, pipeline);
          fetchPipelineList();
        })
        .catch(function(error) {
          console.error(error);
        });
    });
    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "is-destructive";
    deleteBtn.textContent = "Delete Pipeline";
    deleteBtn.addEventListener("click", function() {
      var pipelineId = floatingMenu.dataset.pipelineId;
      closePipelineMenus();
      if (!pipelineId) {
        return;
      }
      deletePipeline(pipelineId);
    });
    floatingMenu.appendChild(renameBtn);
    floatingMenu.appendChild(duplicateBtn);
    floatingMenu.appendChild(deleteBtn);
    document.body.appendChild(floatingMenu);
  }
  floatingMenu._pipelines = pipelines;
  function closePipelineMenus() {
    if (floatingMenu) {
      floatingMenu.classList.remove("is-open");
      floatingMenu.dataset.pipelineId = "";
      floatingMenu.dataset.pipelineName = "";
    }
    var openTriggers = list.querySelectorAll(".pipeline-options-trigger[aria-expanded=\"true\"]");
    openTriggers.forEach(function(trigger) {
      trigger.setAttribute("aria-expanded", "false");
      var card = trigger.closest(".pipeline-list-item");
      if (card) {
        card.classList.remove("menu-open");
      }
    });
  }
  if (!list.dataset.menuBound) {
    document.addEventListener("click", function() {
      closePipelineMenus();
    });
    list.dataset.menuBound = "true";
  }
  pipelines.forEach(function(item) {
    var row = document.createElement("div");
    row.className = "pipeline-list-row";
    var card = document.createElement("div");
    card.className = "pipeline-list-item buttons ds-sidebar-list-row";
    card.setAttribute("data-pipeline-id", item.pipeline_id);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    var icon = document.createElement("span");
    icon.className = "activity-icon icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6h6v6H6z"/><path d="M12 12h6v6h-6z"/><path d="M12 9l3 3"/></svg>';
    var label = document.createElement("span");
    label.className = "pipeline-list-label label";
    label.textContent = item.pipeline_name || "Untitled Pipeline";
    var menuTrigger = document.createElement("button");
    menuTrigger.type = "button";
    menuTrigger.className = "pipeline-options-trigger btn btn-ghost btn-icon";
    menuTrigger.setAttribute("aria-label", "Pipeline options");
    menuTrigger.setAttribute("aria-haspopup", "true");
    menuTrigger.setAttribute("aria-expanded", "false");
    menuTrigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg>';
    menuTrigger.addEventListener("click", function(event) {
      event.stopPropagation();
      var isOpen = floatingMenu.classList.contains("is-open");
      closePipelineMenus();
      if (!isOpen) {
        var rect = menuTrigger.getBoundingClientRect();
        floatingMenu.style.left = (rect.right - 180) + "px";
        floatingMenu.style.top = (rect.bottom + 6) + "px";
        floatingMenu.dataset.pipelineId = item.pipeline_id;
        floatingMenu.dataset.pipelineName = item.pipeline_name || "Untitled Pipeline";
        floatingMenu.classList.add("is-open");
      }
      menuTrigger.setAttribute("aria-expanded", (!isOpen).toString());
      if (!isOpen) {
        card.classList.add("menu-open");
      } else {
        card.classList.remove("menu-open");
      }
    });
    card.addEventListener("click", function() {
      setActivePipelineType("dataflow");
      loadPipelineById(item.pipeline_id);
    });
    card.addEventListener("keydown", function(event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActivePipelineType("dataflow");
        loadPipelineById(item.pipeline_id);
      }
    });
    card.appendChild(icon);
    card.appendChild(label);
    card.appendChild(menuTrigger);
    row.appendChild(card);
    list.appendChild(row);
  });
  renderPipelineListSelection(activePipelineType === "dataflow" ? pipeline_id : "");
}

function renderSavedPipelineList(pipelines) {
  cachedSavedPipelines = Array.isArray(pipelines) ? pipelines.slice() : [];
  if (typeof window.refreshPipelineActivityOptions === "function") {
    window.refreshPipelineActivityOptions(cachedSavedPipelines);
  }
  var list = document.getElementById("savedPipelineList");
  if (!list) {
    return;
  }
  list.innerHTML = "";
  var savedPipelineCountEl = document.getElementById("savedPipelineCount");
  if (savedPipelineCountEl) savedPipelineCountEl.textContent = String(cachedSavedPipelines.length);
  function getDuplicateName(baseName) {
    var normalized = (baseName || "pipeline").replace(/_duplicate_\d+$/i, "");
    var maxIndex = 0;
    var sourceList = (floatingMenu && Array.isArray(floatingMenu._pipelines)) ? floatingMenu._pipelines : pipelines;
    sourceList.forEach(function(item) {
      var name = (item && item.pipeline_name) || "";
      var match = name.match(new RegExp("^" + normalized.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "_duplicate_(\\d+)$", "i"));
      if (match && match[1]) {
        var idx = parseInt(match[1], 10);
        if (!isNaN(idx)) {
          maxIndex = Math.max(maxIndex, idx);
        }
      }
    });
    return normalized + "_duplicate_" + (maxIndex + 1);
  }
  var floatingMenu = document.getElementById("savedPipelineOptionsMenu");
  if (!floatingMenu) {
    floatingMenu = document.createElement("div");
    floatingMenu.id = "savedPipelineOptionsMenu";
    floatingMenu.className = "pipeline-options-menu pipeline-options-menu--floating";
    var renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.textContent = "Rename Pipeline";
    renameBtn.addEventListener("click", function() {
      var pipelineId = floatingMenu.dataset.pipelineId;
      var pipelineName = floatingMenu.dataset.pipelineName || "Untitled Pipeline";
      closePipelineMenus();
      if (!pipelineId) {
        return;
      }
      var nextName = prompt("Rename pipeline", pipelineName);
      if (!nextName) {
        return;
      }
      var request = new Request("/blob-storage/etl/pipeline/load?pipelineId=" + pipelineId, {
        method: "GET",
        headers: new Headers({
          "Accept": "application/json"
        })
      });
      fetch(request)
        .then(function(response) {
          if (!response.ok) {
            return null;
          }
          return response.json();
        })
        .then(function(pipeline) {
          if (!pipeline) {
            return;
          }
          pipeline.pipeline_name = nextName.trim() || "pipeline";
          if (!pipeline.pipeline_id) {
            pipeline.pipeline_id = pipelineId;
          }
          var googleId = "unknown";
          if (window.googleLoginProfile && (window.googleLoginProfile.google_id || window.googleLoginProfile.email)) {
            googleId = window.googleLoginProfile.google_id || window.googleLoginProfile.email;
          }
          var safeGoogleId = googleId.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
          if (!safeGoogleId) {
            safeGoogleId = "unknown";
          }
          setActivePipelineType("pipeline");
          post_pipeline(safeGoogleId, pipeline.pipeline_id, pipeline);
          fetchSavedPipelineList();
          if (pipeline_id === pipelineId) {
            $("#pipeline_title").val(pipeline.pipeline_name);
          }
        })
        .catch(function(error) {
          console.error(error);
        });
    });
    var duplicateBtn = document.createElement("button");
    duplicateBtn.type = "button";
    duplicateBtn.textContent = "Duplicate Pipeline";
    duplicateBtn.addEventListener("click", function() {
      var pipelineId = floatingMenu.dataset.pipelineId;
      if (!pipelineId) {
        return;
      }
      closePipelineMenus();
      var request = new Request("/blob-storage/etl/pipeline/load?pipelineId=" + pipelineId, {
        method: "GET",
        headers: new Headers({
          "Accept": "application/json"
        })
      });
      fetch(request)
        .then(function(response) {
          if (!response.ok) {
            return null;
          }
          return response.json();
        })
        .then(function(pipeline) {
          if (!pipeline) {
            return;
          }
          var newId = generatePipelineId();
          var nextName = getDuplicateName(pipeline.pipeline_name || "pipeline");
          pipeline.pipeline_id = newId;
          pipeline.pipeline_name = nextName;
          var googleId = "unknown";
          if (window.googleLoginProfile && (window.googleLoginProfile.google_id || window.googleLoginProfile.email)) {
            googleId = window.googleLoginProfile.google_id || window.googleLoginProfile.email;
          }
          var safeGoogleId = googleId.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
          if (!safeGoogleId) {
            safeGoogleId = "unknown";
          }
          setActivePipelineType("pipeline");
          post_pipeline(safeGoogleId, pipeline.pipeline_id, pipeline);
          fetchSavedPipelineList();
        })
        .catch(function(error) {
          console.error(error);
        });
    });
    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "is-destructive";
    deleteBtn.textContent = "Delete Pipeline";
    deleteBtn.addEventListener("click", function() {
      var pipelineId = floatingMenu.dataset.pipelineId;
      closePipelineMenus();
      if (!pipelineId) {
        return;
      }
      deleteSavedPipeline(pipelineId);
    });
    floatingMenu.appendChild(renameBtn);
    floatingMenu.appendChild(duplicateBtn);
    floatingMenu.appendChild(deleteBtn);
    document.body.appendChild(floatingMenu);
  }
  floatingMenu._pipelines = pipelines;
  function closePipelineMenus() {
    if (floatingMenu) {
      floatingMenu.classList.remove("is-open");
      floatingMenu.dataset.pipelineId = "";
      floatingMenu.dataset.pipelineName = "";
    }
    var openTriggers = list.querySelectorAll(".pipeline-options-trigger[aria-expanded=\"true\"]");
    openTriggers.forEach(function(trigger) {
      trigger.setAttribute("aria-expanded", "false");
      var card = trigger.closest(".pipeline-list-item");
      if (card) {
        card.classList.remove("menu-open");
      }
    });
  }
  if (!list.dataset.menuBound) {
    document.addEventListener("click", function() {
      closePipelineMenus();
    });
    list.dataset.menuBound = "true";
  }
  pipelines.forEach(function(item) {
    var row = document.createElement("div");
    row.className = "pipeline-list-row";
    var card = document.createElement("div");
    card.className = "pipeline-list-item buttons ds-sidebar-list-row";
    card.setAttribute("data-pipeline-id", item.pipeline_id);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    var icon = document.createElement("span");
    icon.className = "activity-icon icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6h6v6H6z"/><path d="M12 12h6v6h-6z"/><path d="M12 9l3 3"/></svg>';
    var label = document.createElement("span");
    label.className = "pipeline-list-label label";
    label.textContent = item.pipeline_name || "Untitled Pipeline";
    var menuTrigger = document.createElement("button");
    menuTrigger.type = "button";
    menuTrigger.className = "pipeline-options-trigger btn btn-ghost btn-icon";
    menuTrigger.setAttribute("aria-label", "Pipeline options");
    menuTrigger.setAttribute("aria-haspopup", "true");
    menuTrigger.setAttribute("aria-expanded", "false");
    menuTrigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg>';
    menuTrigger.addEventListener("click", function(event) {
      event.stopPropagation();
      var isOpen = floatingMenu.classList.contains("is-open");
      closePipelineMenus();
      if (!isOpen) {
        var rect = menuTrigger.getBoundingClientRect();
        floatingMenu.style.left = (rect.right - 180) + "px";
        floatingMenu.style.top = (rect.bottom + 6) + "px";
        floatingMenu.dataset.pipelineId = item.pipeline_id;
        floatingMenu.dataset.pipelineName = item.pipeline_name || "Untitled Pipeline";
        floatingMenu.classList.add("is-open");
      }
      menuTrigger.setAttribute("aria-expanded", (!isOpen).toString());
      if (!isOpen) {
        card.classList.add("menu-open");
      } else {
        card.classList.remove("menu-open");
      }
    });
    card.addEventListener("click", function() {
      setActivePipelineType("pipeline");
      loadSavedPipelineById(item.pipeline_id);
    });
    card.addEventListener("keydown", function(event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActivePipelineType("pipeline");
        loadSavedPipelineById(item.pipeline_id);
      }
    });
    card.appendChild(icon);
    card.appendChild(label);
    card.appendChild(menuTrigger);
    row.appendChild(card);
    list.appendChild(row);
  });
  renderSavedPipelineListSelection(activePipelineType === "pipeline" ? pipeline_id : "");
}

function getPipelineNameById(pipelineId) {
  if (!pipelineId) {
    return "";
  }
  var list = activePipelineType === "pipeline" ? cachedSavedPipelines : cachedPipelines;
  var match = list.find(function(item) {
    return item && item.pipeline_id === pipelineId;
  });
  return match ? (match.pipeline_name || "") : "";
}

function renderTriggerList(triggers, pipelineId) {
  if (activePipelineType !== "pipeline") {
    return;
  }
  var list = document.getElementById("triggerList");
  if (!list) {
    return;
  }
  list.innerHTML = "";
  if (!Array.isArray(triggers)) {
    return;
  }
  cachedTriggers = triggers.slice();
  var triggerCountEl = document.getElementById("triggerCount");
  if (triggerCountEl) triggerCountEl.textContent = String(cachedTriggers.length);
  var floatingMenu = document.getElementById("triggerOptionsMenu");
  if (!floatingMenu) {
    floatingMenu = document.createElement("div");
    floatingMenu.id = "triggerOptionsMenu";
    floatingMenu.className = "pipeline-options-menu pipeline-options-menu--floating";
    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "is-destructive";
    deleteBtn.textContent = "Delete Trigger";
    deleteBtn.addEventListener("click", function() {
      var triggerId = floatingMenu.dataset.triggerId;
      closeTriggerMenus();
      if (!triggerId) {
        return;
      }
      deleteTrigger(triggerId);
    });
    floatingMenu.appendChild(deleteBtn);
    document.body.appendChild(floatingMenu);
  }
  function closeTriggerMenus() {
    if (floatingMenu) {
      floatingMenu.classList.remove("is-open");
      floatingMenu.dataset.triggerId = "";
    }
    var openTriggers = list.querySelectorAll(".pipeline-options-trigger[aria-expanded=\"true\"]");
    openTriggers.forEach(function(trigger) {
      trigger.setAttribute("aria-expanded", "false");
      var card = trigger.closest(".pipeline-list-item");
      if (card) {
        card.classList.remove("menu-open");
      }
    });
  }
  if (!list.dataset.menuBound) {
    document.addEventListener("click", function() {
      closeTriggerMenus();
    });
    list.dataset.menuBound = "true";
  }
  var effectivePipelineId = pipelineId || pipeline_id || "";
  triggers.forEach(function(item) {
    if (effectivePipelineId && item.pipeline_id && item.pipeline_id !== effectivePipelineId) {
      return;
    }
    var row = document.createElement("div");
    row.className = "pipeline-list-row";
    var card = document.createElement("div");
    card.className = "pipeline-list-item buttons ds-sidebar-list-row";
    card.setAttribute("data-trigger-id", item.trigger_id || "");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    var icon = document.createElement("span");
    icon.className = "activity-icon icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 11-14h-6l1-6z"/></svg>';
    var label = document.createElement("span");
    label.className = "pipeline-list-label label";
    label.textContent = item.name || "Untitled Trigger";
    var menuTrigger = document.createElement("button");
    menuTrigger.type = "button";
    menuTrigger.className = "pipeline-options-trigger btn btn-ghost btn-icon";
    menuTrigger.setAttribute("aria-label", "Trigger options");
    menuTrigger.setAttribute("aria-haspopup", "true");
    menuTrigger.setAttribute("aria-expanded", "false");
    menuTrigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg>';
    menuTrigger.addEventListener("click", function(event) {
      event.stopPropagation();
      var isOpen = floatingMenu.classList.contains("is-open");
      closeTriggerMenus();
      if (!isOpen) {
        var rect = menuTrigger.getBoundingClientRect();
        floatingMenu.style.left = (rect.right - 180) + "px";
        floatingMenu.style.top = (rect.bottom + 6) + "px";
        floatingMenu.dataset.triggerId = item.trigger_id || "";
        floatingMenu.classList.add("is-open");
      }
      menuTrigger.setAttribute("aria-expanded", (!isOpen).toString());
      if (!isOpen) {
        card.classList.add("menu-open");
      } else {
        card.classList.remove("menu-open");
      }
    });
    card.addEventListener("click", function() {
      if (!item.trigger_id) {
        return;
      }
      setSelectedTrigger(item.trigger_id);
      var request = new Request("/blob-storage/etl/trigger/load?triggerId=" + item.trigger_id, {
        method: "GET",
        headers: new Headers({
          "Accept": "application/json"
        })
      });
      fetch(request)
        .then(function(response) {
          if (!response.ok) {
            return null;
          }
          return response.json();
        })
        .then(function(data) {
          if (!data) {
            return;
          }
          openTriggerModalWithData(data);
        })
        .catch(function(error) {
          console.error(error);
        });
    });
    card.addEventListener("keydown", function(event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.click();
      }
    });
    card.appendChild(icon);
    card.appendChild(label);
    card.appendChild(menuTrigger);
    row.appendChild(card);
    list.appendChild(row);
  });
  updateScheduledTriggerOptions(cachedTriggers, effectivePipelineId);
}

function seedEmptyPipelineIfNeeded(pipelines) {
  if (emptyPipelineSeeded) {
    return;
  }
  if (pipeline_id) {
    return;
  }
  if (disableEmptyPipelineSeed) {
    return;
  }
  if (suppressEmptyPipelineSeed) {
    suppressEmptyPipelineSeed = false;
    return;
  }
  if (!Array.isArray(pipelines) || pipelines.length > 0) {
    return;
  }
  if (!window.googleLoginProfile || !window.googleLoginProfile.logged_in) {
    return;
  }
  emptyPipelineSeeded = true;
  if (typeof window.flowchartClearWorkspace === "function") {
    window.flowchartClearWorkspace();
    return;
  }
  var googleId = window.googleLoginProfile.google_id || window.googleLoginProfile.email || "unknown";
  var safeGoogleId = googleId.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
  if (!safeGoogleId) {
    safeGoogleId = "unknown";
  }
  if (!pipeline_id) {
    setCurrentPipelineId(generatePipelineId());
  }
  var data = {};
  if ($flowchart && $flowchart.flowchart) {
    data = $flowchart.flowchart("getData", pipeline_id || "local") || {};
  }
  if (!data.activities) {
    data.activities = {};
  }
  if (!data.links) {
    data.links = {};
  }
  data.pipeline_name = getNextPipelineName();
  data.description = "";
  data.pipeline_id = pipeline_id;
  data.google_id = safeGoogleId;
  setActivePipelineType("dataflow");
  post_pipeline(safeGoogleId, pipeline_id, data);
  fetchPipelineList();
}

function fetchPipelineList() {
  var googleId = "unknown";
  if (window.googleLoginProfile && (window.googleLoginProfile.google_id || window.googleLoginProfile.email)) {
    googleId = window.googleLoginProfile.google_id || window.googleLoginProfile.email;
  }
  var safeGoogleId = googleId.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
  var request = new Request("/blob-storage/etl/dataflow/list?googleId=" + safeGoogleId, {
    method: "GET",
    headers: new Headers({
      "Accept": "application/json"
    })
  });
  fetch(request)
    .then(function(response) {
      if (!response.ok) {
        return { values: [] };
      }
      return response.json();
    })
    .then(function(result) {
      if (!result || !Array.isArray(result.values)) {
        return;
      }
      renderPipelineList(result.values);
      seedEmptyPipelineIfNeeded(result.values);
      if (!pipeline_id && result.values.length) {
        loadPipelineById(result.values[0].pipeline_id);
      }
    })
    .catch(function(error) {
      console.error(error);
    });
}

function fetchSavedPipelineList() {
  var googleId = "unknown";
  if (window.googleLoginProfile && (window.googleLoginProfile.google_id || window.googleLoginProfile.email)) {
    googleId = window.googleLoginProfile.google_id || window.googleLoginProfile.email;
  }
  var safeGoogleId = googleId.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
  var request = new Request("/blob-storage/etl/pipeline/list?googleId=" + safeGoogleId, {
    method: "GET",
    headers: new Headers({
      "Accept": "application/json"
    })
  });
  fetch(request)
    .then(function(response) {
      if (!response.ok) {
        return { values: [] };
      }
      return response.json();
    })
    .then(function(result) {
      if (!result || !Array.isArray(result.values)) {
        return;
      }
      renderSavedPipelineList(result.values);
    })
    .catch(function(error) {
      console.error(error);
    });
}
window.fetchSavedPipelineList = fetchSavedPipelineList;

function fetchTriggerList(activePipelineId) {
  if (activePipelineType !== "pipeline") {
    return;
  }
  var googleId = "unknown";
  if (window.googleLoginProfile && (window.googleLoginProfile.google_id || window.googleLoginProfile.email)) {
    googleId = window.googleLoginProfile.google_id || window.googleLoginProfile.email;
  }
  var safeGoogleId = googleId.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
  var request = new Request("/blob-storage/etl/trigger/list?googleId=" + safeGoogleId, {
    method: "GET",
    headers: new Headers({
      "Accept": "application/json"
    })
  });
  fetch(request)
    .then(function(response) {
      if (!response.ok) {
        return { values: [] };
      }
      return response.json();
    })
    .then(function(result) {
      if (!result || !Array.isArray(result.values)) {
        return;
      }
      renderTriggerList(result.values, activePipelineId);
    })
    .catch(function(error) {
      console.error(error);
    });
}

function loadPipelineById(pipelineId) {
  if (!pipelineId) {
    return;
  }
  setActivePipelineType("dataflow");
  var request = new Request("/blob-storage/etl/dataflow/load?pipelineId=" + pipelineId, {
    method: "GET",
    headers: new Headers({
      "Accept": "application/json"
    })
  });
  fetch(request)
    .then(function(response) {
      if (!response.ok) {
        if (pipeline_id === pipelineId) {
          setCurrentPipelineId("");
          try {
            localStorage.removeItem("etl_pipeline_id");
          } catch (error) {
            // ignore
          }
        }
        fetchPipelineList();
        return null;
      }
      return response.json();
    })
    .then(function(pipeline) {
      if (!pipeline) {
        return;
      }
      if (!pipeline.pipeline_id) {
        pipeline.pipeline_id = pipelineId;
      }
      LoadFromBlobStorage(pipeline);
      renderPipelineListSelection(pipelineId);
      renderSavedPipelineListSelection("");
      fetchTriggerList(pipelineId);
    })
    .catch(function(error) {
      console.error(error);
    });
}

function loadSavedPipelineById(pipelineId) {
  if (!pipelineId) {
    return;
  }
  setActivePipelineType("pipeline");
  fetchPipelineList();
  var request = new Request("/blob-storage/etl/pipeline/load?pipelineId=" + pipelineId, {
    method: "GET",
    headers: new Headers({
      "Accept": "application/json"
    })
  });
  fetch(request)
    .then(function(response) {
      if (!response.ok) {
        if (pipeline_id === pipelineId) {
          setCurrentPipelineId("");
          try {
            localStorage.removeItem("etl_pipeline_id");
          } catch (error) {
            // ignore
          }
        }
        fetchSavedPipelineList();
        return null;
      }
      return response.json();
    })
    .then(function(pipeline) {
      if (!pipeline) {
        return;
      }
      if (!pipeline.pipeline_id) {
        pipeline.pipeline_id = pipelineId;
      }
      LoadFromBlobStorage(pipeline);
      renderSavedPipelineListSelection(pipelineId);
      renderPipelineListSelection("");
      fetchTriggerList(pipelineId);
    })
    .catch(function(error) {
      console.error(error);
    });
}
window.loadSavedPipelineById = loadSavedPipelineById;

function loadPipelineFromBlobStorage() {
  if (!$flowchart) {
    return;
  }
  var storedPipelineId = pipeline_id;
  var storedPipelineType = "dataflow";
  try {
    storedPipelineType = localStorage.getItem("etl_pipeline_type") || "dataflow";
  } catch (error) {
    storedPipelineType = "dataflow";
  }
  if (!storedPipelineId) {
    try {
      storedPipelineId = localStorage.getItem("etl_pipeline_id") || "";
    } catch (error) {
      storedPipelineId = "";
    }
  }
  if (!storedPipelineId) {
    fetchPipelineList();
    fetchSavedPipelineList();
    return;
  }
  if (storedPipelineType === "pipeline") {
    loadSavedPipelineById(storedPipelineId);
  } else {
    loadPipelineById(storedPipelineId);
  }
}

function LoadFromBlobStorage(pipeline) {
  if (!$flowchart || !pipeline || !pipeline.activities) {
    return;
  }
  suspendPipelineSave = true;
  var existing = $flowchart.flowchart("getOperators") || {};
  Object.keys(existing).forEach(function(operatorId) {
    $flowchart.flowchart("deleteOperator", operatorId);
  });
  main_activities = {};
  var settingsPanel = document.getElementById("selected_activity_settings");
  if (settingsPanel) {
    settingsPanel.innerHTML = "";
  }
  if (pipeline.pipeline_id) {
    setCurrentPipelineId(pipeline.pipeline_id);
  }
  if (pipeline.pipeline_name) {
    $("#pipeline_title").val(pipeline.pipeline_name);
  }
  if (pipeline.description) {
    $("#pipeline_description").val(pipeline.description);
  }
  let activities = pipeline["activities"];
  let links = normalizeLinkOperatorIds(pipeline["links"] || {});
  Object.keys(activities).forEach(operatorId => {
    let operatorData = activities[operatorId];
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    if (operatorData.properties && operatorData.properties.settings) {
      $flowchart.flowchart("setSettings", operatorId, operatorData.properties.settings);
    }
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    if (operatorData.properties && operatorData.properties.activity_description) {
      if (typeof window.flowchartApplyActivityDescription === "function") {
        window.flowchartApplyActivityDescription(operatorId, operatorData.properties.activity_description);
      }
    }
    let a;
    if (operatorData.properties.activityType == "import") {
      a = new Import_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "flatten") {
      a = new Flatten_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "http_request") {
      a = new Http_Request_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "http_sink") {
      a = new Http_Sink_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "filter") {
      a = new Filter_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "group") {
      a = new Group_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "join") {
      a = new Join_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "custom") {
      a = new Custom_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "replace") {
      a = new Replace_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "fill") {
      a = new Fill_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "clean") {
      a = new Clean_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "dedupe") {
      a = new Dedupe_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "cast") {
      a = new Cast_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "regex") {
      a = new Regex_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "pivot") {
      a = new Pivot_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "window") {
      a = new Window_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "split") {
      a = new Split_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "sheets_read") {
      a = new GoogleSheets_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "sheets_write") {
      a = new GoogleSheets_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "select") {
      a = new Select_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "sort") {
      a = new Sort_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "append") {
      a = new Append_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "dataflow") {
      a = new DataFlow_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "stream") {
      a = new Stream_Activity($flowchart, new_activity);
    }
    if (operatorData.properties.activityType == "combine") {
      a = new Combine_Activity($flowchart, new_activity);
    }
    main_activities[operatorId] = a;
    activites = $flowchart.flowchart("getOperators");
  });

  $flowchart.flowchart("setData", { links: {} });
  Object.keys(links).forEach(function(linkId) {
    var link = links[linkId];
    if (!link || link.fromOperator == null || link.toOperator == null) {
      return;
    }
    var linkData = {
      fromOperator: String(link.fromOperator),
      fromConnector: link.fromConnector || "output",
      toOperator: String(link.toOperator),
      toConnector: link.toConnector || "input",
      locked: true
    };
    if (link.color) {
      linkData.color = link.color;
    }
    $flowchart.flowchart("addLink", linkData);
    var flowchartInstance = $flowchart.flowchart("instance");
    if (flowchartInstance && typeof onLinkCreation === "function") {
      onLinkCreation(flowchartInstance, linkData);
    }
  });
  Object.keys(main_activities).forEach(function(operatorId) {
    var activity = main_activities[operatorId];
    if (activity) {
      activity.activity = $flowchart.flowchart("getOperatorActivity", operatorId);
      activity.activityId = operatorId;
      if (typeof activity._restore_saved_settings === "function") {
        activity._restore_saved_settings();
      }
    }
  });
  setOperatorIndexFromActivities(activities);
  if (activePipelineType === "pipeline") {
    setOperatorDraggingEnabled(true);
  } else {
    setOperatorDraggingEnabled(false);
  }
  setTimeout(function() {
    if (typeof window.repositionImportPlaceholder === "function") {
      window.repositionImportPlaceholder();
    }
    if (typeof window.repositionSelectPlaceholders === "function") {
      window.repositionSelectPlaceholders();
    }
    if (typeof window.scheduleLinkAddRefresh === "function") {
      window.scheduleLinkAddRefresh();
    }
  }, 0);
  suspendPipelineSave = false;
}

function openTriggerModalWithData(trigger) {
  if (!trigger) {
    return;
  }
  var modal = document.getElementById("triggerModal");
  if (modal) {
    modal.dataset.triggerId = trigger.trigger_id || "";
    modal.dataset.pipelineName = getPipelineNameById(trigger.pipeline_id || "") || "";
  }
  var nameField = document.getElementById("trigger_name");
  var descriptionField = document.getElementById("trigger_description");
  var startDateField = document.getElementById("trigger_start_date");
  var recurrenceValueField = document.getElementById("trigger_recurrence_value");
  var recurrenceUnitField = document.getElementById("trigger_recurrence_unit");
  var weekdays = document.getElementById("trigger_weekdays");
  var hours = document.getElementById("trigger_hours");
  if (nameField) nameField.value = trigger.name || "";
  if (descriptionField) descriptionField.value = trigger.description || "";
  if (startDateField) startDateField.value = trigger.start_date || "";
  if (recurrenceValueField && trigger.recurrence) {
    recurrenceValueField.value = trigger.recurrence.value != null ? String(trigger.recurrence.value) : "1";
  }
  if (recurrenceUnitField && trigger.recurrence) {
    recurrenceUnitField.value = trigger.recurrence.unit || "minutes";
  }
  if (weekdays) {
    var checked = Array.isArray(trigger.recurrence && trigger.recurrence.days)
      ? trigger.recurrence.days
      : [];
    Array.from(weekdays.querySelectorAll("input[type=\"checkbox\"]")).forEach(function(input) {
      input.checked = checked.indexOf(input.value) !== -1;
    });
  }
  if (hours) {
    var checkedHours = Array.isArray(trigger.recurrence && trigger.recurrence.hours)
      ? trigger.recurrence.hours
      : [];
    var hourMinutesMap = {};
    checkedHours.forEach(function(entry) {
      if (entry == null) {
        return;
      }
      var parts = String(entry).split(":");
      var hourValue = parts[0] || "";
      var minuteValue = parts[1] || "00";
      if (hourValue.length === 1) {
        hourValue = "0" + hourValue;
      }
      if (minuteValue.length === 1) {
        minuteValue = "0" + minuteValue;
      }
      hourMinutesMap[hourValue] = minuteValue;
    });
    Array.from(hours.querySelectorAll("input[type=\"checkbox\"]")).forEach(function(input) {
      var minuteSelect = input.closest("label") && input.closest("label").querySelector(".trigger-hour-minutes");
      if (Object.prototype.hasOwnProperty.call(hourMinutesMap, input.value)) {
        input.checked = true;
        if (minuteSelect) {
          minuteSelect.value = hourMinutesMap[input.value];
          minuteSelect.disabled = false;
        }
      } else {
        input.checked = false;
        if (minuteSelect) {
          minuteSelect.value = "00";
          minuteSelect.disabled = true;
        }
      }
    });
  }
  if (typeof window.updateTriggerWeekdays === "function") {
    window.updateTriggerWeekdays();
  }
  if (typeof window.openTriggerModal === "function") {
    window.openTriggerModal("current");
  }
}

function deletePipeline(pipelineId) {
  if (!pipelineId) {
    return;
  }
  if (!confirm("Are you sure you want to delete this dataflow? This cannot be undone.")) return;
  disableEmptyPipelineSeed = true;
  var pipelineList = document.getElementById("pipelineList");
  var pipelineRow = pipelineList ? pipelineList.querySelector(".pipeline-list-item[data-pipeline-id=\"" + pipelineId + "\"]") : null;
  if (pipelineRow && pipelineRow.parentElement) {
    pipelineRow.parentElement.remove();
  }
  var request = new Request("/blob-storage/etl/dataflow/delete?pipelineId=" + pipelineId, {
    method: "POST",
    headers: new Headers({
      "Accept": "application/json"
    })
  });
  fetch(request)
    .then(function(response) {
      if (response.ok && pipeline_id === pipelineId && typeof window.flowchartClearWorkspace === "function") {
        suppressEmptyPipelineSeed = true;
        window.flowchartClearWorkspace({ skipNewPipeline: true, skipSave: true, skipFetch: true });
      }
    })
    .catch(function(error) {
      console.error(error);
    })
    .finally(function() {
      fetchPipelineList();
      fetchTriggerList(pipeline_id);
    });
}

function deleteSavedPipeline(pipelineId) {
  if (!pipelineId) {
    return;
  }
  if (!confirm("Are you sure you want to delete this pipeline? This cannot be undone.")) return;
  disableEmptyPipelineSeed = true;
  var pipelineList = document.getElementById("savedPipelineList");
  var pipelineRow = pipelineList ? pipelineList.querySelector(".pipeline-list-item[data-pipeline-id=\"" + pipelineId + "\"]") : null;
  if (pipelineRow && pipelineRow.parentElement) {
    pipelineRow.parentElement.remove();
  }
  var request = new Request("/blob-storage/etl/pipeline/delete?pipelineId=" + pipelineId, {
    method: "POST",
    headers: new Headers({
      "Accept": "application/json"
    })
  });
  fetch(request)
    .then(function(response) {
      if (response.ok && pipeline_id === pipelineId && typeof window.flowchartClearWorkspace === "function") {
        suppressEmptyPipelineSeed = true;
        window.flowchartClearWorkspace({ skipNewPipeline: true, skipSave: true, skipFetch: true });
        setCurrentPipelineId("");
        renderSavedPipelineListSelection("");
      }
    })
    .catch(function(error) {
      console.error(error);
    })
    .finally(function() {
      fetchSavedPipelineList();
    });
}

function deleteTrigger(triggerId) {
  if (!triggerId) {
    return;
  }
  if (!confirm("Are you sure you want to delete this trigger? This cannot be undone.")) return;
  if (triggerId === selectedTriggerId) {
    selectedTriggerId = "";
  }
  var triggerRow = document.querySelector(".pipeline-list-item[data-trigger-id=\"" + triggerId + "\"]");
  if (triggerRow && triggerRow.parentElement) {
    triggerRow.parentElement.remove();
  }
  var request = new Request("/blob-storage/etl/trigger/delete?triggerId=" + triggerId, {
    method: "POST",
    headers: new Headers({
      "Accept": "application/json"
    })
  });
  Promise.all([fetch(request), post_trigger_cron_delete(triggerId)])
    .catch(function(error) {
      console.error(error);
    })
    .finally(function() {
      fetchTriggerList(pipeline_id);
    });
}

function jsonToCsv(jsonData) {
  if (!Array.isArray(jsonData) || jsonData.length === 0) return "";

  const headers = [...new Set(jsonData.flatMap(obj => Object.keys(obj)))];

  const escape = (val) => {
    if (val === null || val === undefined) return "";
    val = String(val);
    if (/[",\n\r]/.test(val)) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csv = [
    headers.join(","),
    ...jsonData.map(obj => headers.map(h => escape(obj[h])).join(","))
  ].join("\n");

  return csv;
}

function createTable(jsonArray, tableContainer, activityId) {
  const filterInput = document.getElementById(activityId + "_filterInput");
  const columnSelect = document.getElementById(activityId + "_columnSelect");
  let activity = null;
  if (activityId && $flowchart && $flowchart.flowchart) {
    try {
      if ($flowchart.flowchart("doesOperatorExists", activityId)) {
        activity = $flowchart.flowchart("getOperatorActivity", activityId);
      }
    } catch (error) {
      activity = null;
    }
  }
  const prettyJson = activity && activity.activityType === "http_request";

  if (jsonArray && !Array.isArray(jsonArray)) {
    jsonArray = [jsonArray];
  }

  tableContainer.innerHTML = "";

  if (!jsonArray.length) {
    tableContainer.textContent = "No data matches your filter.";
    return;
  }

  const table = document.createElement("table");
  table.classList.add("table-resizable", "table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const sortState = { key: null, direction: "asc" };

  const resolveValue = (item, key) => {
    if (!key) {
      return undefined;
    }
    if (key.indexOf(".") === -1) {
      return item ? item[key] : undefined;
    }
    const parts = key.split(".");
    let value = item;
    for (let i = 0; i < parts.length; i++) {
      if (value == null) {
        return undefined;
      }
      value = value[parts[i]];
    }
    return value;
  };

  const updateSortIndicators = () => {
    const headers = thead.querySelectorAll("th");
    headers.forEach((header) => {
      const label = header.dataset.label;
      if (!label) {
        return;
      }
      let suffix = "";
      if (sortState.key === label) {
        suffix = sortState.direction === "asc" ? " ▲" : " ▼";
      }
      header.firstChild.textContent = label + suffix;
    });
  };

  const renderRows = (rows) => {
    tbody.innerHTML = "";
    rows.forEach(item => {
      const row = document.createElement("tr");
      columns.forEach(key => {
        const td = document.createElement("td");
        let value = resolveValue(item, key);
        if (prettyJson && value && typeof value === "object") {
          td.textContent = JSON.stringify(value, null, 2);
          td.style.whiteSpace = "pre-wrap";
        } else if (value && typeof value === "object") {
          td.textContent = JSON.stringify(value);
        } else {
          td.textContent = value;
        }
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    if (activityId === "scheduled_trigger") {
      decorateStatusTable("scheduled_trigger_table");
    }
  };

  const headerRow = document.createElement("tr");
  const columns = [];
  const columnSet = new Set();
  jsonArray.forEach(item => {
    Object.keys(item || {}).forEach(key => {
      const value = item[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.keys(value).forEach(child => {
          columnSet.add(key + "." + child);
        });
      } else {
        columnSet.add(key);
      }
    });
  });
  columnSet.forEach(key => columns.push(key));
  columns.forEach((key, index) => {
    const th = document.createElement("th");
    const labelSpan = document.createElement("span");
    labelSpan.textContent = key;
    th.appendChild(labelSpan);
    th.dataset.label = key;
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const nextDirection =
        sortState.key === key && sortState.direction === "asc" ? "desc" : "asc";
      sortState.key = key;
      sortState.direction = nextDirection;

      const sorted = [...jsonArray].sort((a, b) => {
        const aVal = resolveValue(a, key);
        const bVal = resolveValue(b, key);
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return nextDirection === "asc" ? -1 : 1;
        if (bVal == null) return nextDirection === "asc" ? 1 : -1;
        if (typeof aVal === "number" && typeof bVal === "number") {
          return nextDirection === "asc" ? aVal - bVal : bVal - aVal;
        }
        return nextDirection === "asc"
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      });

      renderRows(sorted);
      updateSortIndicators();
    });
    const resizer = document.createElement("div");
    resizer.className = "column-resizer";
    resizer.addEventListener("mousedown", (event) => {
      event.stopPropagation();
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = th.offsetWidth;
      const columnIndex = index;

      function onMouseMove(moveEvent) {
        const delta = moveEvent.clientX - startX;
        const nextWidth = Math.max(80, startWidth + delta);
        th.style.width = nextWidth + "px";
        table.querySelectorAll("tr").forEach(row => {
          const cell = row.children[columnIndex];
          if (cell) {
            cell.style.width = nextWidth + "px";
          }
        });
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
    th.appendChild(resizer);
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  updateSortIndicators();

  let limit = 5000;
  let count = 0;
  const limitedRows = [];
  jsonArray.forEach(item => {
    if (count < limit) {
      limitedRows.push(item);
      count += 1;
    }
  });
  renderRows(limitedRows);

  table.appendChild(thead);
  table.appendChild(tbody);
  tableContainer.appendChild(table);
  if (activityId === "scheduled_trigger") {
    decorateStatusTable("scheduled_trigger_table");
  }

  if (columnSelect) {
    if (!columnSelect.options.length) {
      columns.forEach(col => {
        const opt = document.createElement("option");
        opt.value = col;
        opt.textContent = col;
        columnSelect.appendChild(opt);
      });
    }
  }

  if (filterInput && columnSelect) {
    if (!filterInput.dataset.bound) {
      filterInput.addEventListener("input", () => {
        const column = columnSelect.value;
        const filterText = filterInput.value.toLowerCase();

        const filteredData = jsonArray.filter(item => {
          const value = resolveValue(item, column);
          return String(value).toLowerCase().includes(filterText);
        });

        createTable(filteredData, tableContainer, activityId);
      });
      filterInput.dataset.bound = true;
    }
  }
}

function areArraysEqual(arr1, arr2) {
  return arr1.length === arr2.length && new Set(arr1).size === new Set(arr2).size && arr1.every(item => arr2.includes(item));
}

function getHttpSinkInputPayload(operatorId) {
  if (!$flowchart || !operatorId) {
    return null;
  }
  const deps = $flowchart.flowchart("getDependencies") || {};
  const entry = deps[operatorId] || {};
  const dependencyIds = Array.isArray(entry.dependencies) ? entry.dependencies : [];
  if (dependencyIds.length) {
    const depId = dependencyIds[dependencyIds.length - 1];
    const output = $flowchart.flowchart("getoutputVal", depId, "output");
    if (output && output.values !== undefined) {
      return output.values;
    }
    if (output !== undefined) {
      return output;
    }
  }
  const activity = $flowchart.flowchart("getOperatorActivity", operatorId);
  const inputValue = activity && activity.inputs && activity.inputs.input && activity.inputs.input.value;
  if (inputValue && inputValue.values !== undefined) {
    return inputValue.values;
  }
  return inputValue || null;
}

function updateHttpSinkBodyPreview(operatorId) {
  const activity = main_activities[operatorId];
  if (!activity || typeof activity.update_body_preview !== "function") {
    return;
  }
  activity.update_body_preview(getHttpSinkInputPayload(operatorId));
}

var main_activities = {};
let height_offset = 300;
var $flowchart;



$(document).ready(function() {
  $flowchart = $("#flowchartworkspace");
  var $container = $flowchart.parent();

  $flowchart.flowchart({
    defaultSelectedLinkColor: "#1d4ed8",
    defaultLinkColor: "#5b7cff",
    linkWidth: 6,
    grid: 10,
    multipleLinksOnInput: false,
    multipleLinksOnOutput: true
  });

  if (!pipeline_id) {
    try {
      var storedPipelineId = localStorage.getItem("etl_pipeline_id") || "";
      if (storedPipelineId) {
        setCurrentPipelineId(storedPipelineId);
      } else {
        setCurrentPipelineId(generatePipelineId());
      }
    } catch (error) {
      setCurrentPipelineId(generatePipelineId());
    }
  }



  function getOperatorData($element) {
    var nbInputs = parseInt($element.data("nb-inputs"), 10);
    var nbOutputs = parseInt($element.data("nb-outputs"), 10);
    var data = {
      properties: {
        title: $element.text(),
        inputs: {},
        outputs: {}
      }
    };

    var i = 0;
    for (i = 0; i < nbInputs; i++) {
      data.properties.inputs["input_" + i] = {
        label: "Input " + (i + 1)
      };
    }
    for (i = 0; i < nbOutputs; i++) {
      data.properties.outputs["output_" + i] = {
        label: "Output " + (i + 1)
      };
    }

    return data;
  }

  var $operatorProperties = $("#operator_properties");
  var $pipelineProperties = $("#pipeline_properties");
  var $selected_activity_settings = $("#selected_activity_settings");
  var $data_preview_settings = $("#data_preview");
  $data_preview_settings.hide();
  $operatorProperties.hide();
  $pipelineProperties.show();
  $selected_activity_settings.hide();
  var $linkProperties = $("#link_properties");
  $linkProperties.hide();
  var $operatorTitle = $("#operator_title");
  var $operatorDescription = $("#operator_description");
  var $linkColor = $("#link_color");
  var $tabGeneral = $("#tabGeneral");
  var $tabSettings = $("#tabSettings");
  var $tabDataPreview = $("#tabDataPreview");
  var $tabActivities = $("#tabActivities");
  $tabActivities.hide();
  var zoomLevel = 1;
  var panOffset = { x: 0, y: 0 };
  var isPanning = false;
  var panStart = { x: 0, y: 0 };
  var panOrigin = { x: 0, y: 0 };
  var importPlaceholder = document.getElementById("importPlaceholder");
  var selectPlaceholders = document.getElementById("selectPlaceholders");
  var ingestMenu = document.getElementById("ingestMenu");
  var importSlotGap = 60;
  var importBaseLeft = 50;
  var importBaseTop = 50;
  var selectBaseOffset = 240;
  var selectStepOffset = 60;
  var branchLinkColors = ["#ff4d4f", "#fa8c16", "#fadb14", "#52c41a", "#13c2c2", "#1890ff", "#722ed1", "#eb2f96"];
  var branchColorIndex = 0;
  var chooseMenu = document.getElementById("chooseMenu");
  var chooseMenuList = document.getElementById("chooseMenuList");
  var chooseMenuSearch = document.getElementById("chooseMenuSearch");
  var linkAddLayer = document.getElementById("linkAddLayer");
  var activeChoosePlaceholder = null;
  var activeInsertLink = null;
  var allowLockedLinkDelete = false;
  var isSelecting = false;
  var selectionStart = { x: 0, y: 0 };
  var selectionBox = null;
  var linkAddRefreshTimer = null;

  function setOperatorDraggingEnabled(enabled) {
    if (!$flowchart || !$flowchart.length) {
      return;
    }
    var flowchartInstance = $flowchart.flowchart("instance");
    if (flowchartInstance && flowchartInstance.options) {
      flowchartInstance.options.canUserMoveOperators = !!enabled;
    }
    $flowchart.find(".flowchart-operator").each(function() {
      try {
        $(this).draggable(enabled ? "enable" : "disable");
      } catch (error) {
        // ignore
      }
    });
    var refData = $flowchart.flowchart("getDataRef");
    if (refData && refData.operators) {
      Object.keys(refData.operators).forEach(function(operatorId) {
        var op = refData.operators[operatorId];
        if (op && op.internal && op.internal.properties) {
          op.internal.properties.locked = !enabled;
        }
      });
    }
  }
  window.setOperatorDraggingEnabled = setOperatorDraggingEnabled;

  function updatePipelineActivitiesTab() {
    var showActivities = activePipelineType === "pipeline";
    if (showActivities) {
      $tabActivities.show();
    } else {
      $tabActivities.hide();
      if ($("#tab_activities").is(":visible")) {
        $tabGeneral.trigger("click");
      }
    }
  }
  window.updatePipelineActivitiesTab = updatePipelineActivitiesTab;

  function clearFlowchartWorkspace(options) {
    var opts = options || {};
    suspendPipelineSave = true;
    var operators = $flowchart.flowchart("getOperators") || {};
    Object.keys(operators).forEach(function(operatorId) {
      $flowchart.flowchart("deleteOperator", operatorId);
    });
    main_activities = {};
    if ($selected_activity_settings && $selected_activity_settings.length) {
      $selected_activity_settings.empty();
    }
    if (selectPlaceholders) {
      selectPlaceholders.innerHTML = "";
    }
    if (importPlaceholder) {
      if (placeholdersEnabled()) {
        importPlaceholder.style.visibility = "";
        importPlaceholder.style.left = importBaseLeft + "px";
        importPlaceholder.style.top = importBaseTop + "px";
      } else {
        importPlaceholder.style.visibility = "hidden";
      }
    }
    if (typeof window.flowchartSetOperatorIndex === "function") {
      window.flowchartSetOperatorIndex(0);
    }
    operatorI = 0;
    if (opts.skipNewPipeline) {
      setCurrentPipelineId("");
      $("#pipeline_title").val("");
      $("#pipeline_description").val("");
    } else {
      setCurrentPipelineId(generatePipelineId());
      $("#pipeline_title").val(getNextPipelineName());
      $("#pipeline_description").val("");
    }
    suspendPipelineSave = false;
    repositionImportPlaceholder();
    repositionSelectPlaceholders();
    scheduleLinkAddRefresh();
    if (!opts.skipSave) {
      schedulePipelineSave();
    }
    if (!opts.skipFetch) {
      fetchPipelineList();
    }
  }
  window.flowchartClearWorkspace = clearFlowchartWorkspace;

  function getNextBranchColor() {
    var color = branchLinkColors[branchColorIndex % branchLinkColors.length];
    branchColorIndex += 1;
    return color;
  }



  function applyPanZoom() {
    const workspace = document.getElementById("flowchartworkspace");
    const container = document.getElementById("chart_container");
    if (!workspace) {
      return;
    }
    if (container) {
      const extraX = Math.abs(panOffset.x) / zoomLevel;
      const extraY = Math.abs(panOffset.y) / zoomLevel;
      const scaledWidth = container.clientWidth / zoomLevel + extraX * 2;
      const scaledHeight = container.clientHeight / zoomLevel + extraY * 2;
      workspace.style.width = `${scaledWidth}px`;
      workspace.style.height = `${scaledHeight}px`;
      const linksLayer = workspace.querySelector(".flowchart-links-layer");
      const operatorsLayer = workspace.querySelector(".flowchart-operators-layer");
      const tempLayer = workspace.querySelector(".flowchart-temporary-link-layer");
      if (linksLayer) {
        linksLayer.style.width = `${scaledWidth}px`;
        linksLayer.style.height = `${scaledHeight}px`;
        linksLayer.style.transform = "";
      }
      if (operatorsLayer) {
        operatorsLayer.style.width = `${scaledWidth}px`;
        operatorsLayer.style.height = `${scaledHeight}px`;
        operatorsLayer.style.transform = "";
      }
      if (tempLayer) {
        tempLayer.style.width = `${scaledWidth}px`;
        tempLayer.style.height = `${scaledHeight}px`;
        tempLayer.style.transform = "";
      }
    }
    const transformValue = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`;
    workspace.style.transform = transformValue;
    $flowchart.flowchart("setPositionRatio", zoomLevel);
    document.body.classList.toggle("zoomed-out", zoomLevel < 1);
    const containmentTarget = "#flowchartworkspace";
    $flowchart.find(".flowchart-operator").each(function() {
      try {
        $(this).draggable("option", "containment", containmentTarget);
      } catch (error) {
        // ignore if draggable not yet initialized
      }
    });
    scheduleLinkAddRefresh();
  }
  window.applyFlowchartPanZoom = applyPanZoom;


  function scheduleLinkAddRefresh() {
    if (!linkAddLayer) {
      return;
    }
    if (!placeholdersEnabled()) {
      linkAddLayer.innerHTML = "";
      return;
    }
    if (linkAddRefreshTimer) {
      clearTimeout(linkAddRefreshTimer);
    }
    linkAddRefreshTimer = setTimeout(refreshLinkAddButtons, 0);
  }
  window.scheduleLinkAddRefresh = scheduleLinkAddRefresh;

  function getLinkMidpoint(linkId) {
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.links || !data.links[linkId]) {
      return null;
    }
    var link = data.links[linkId];
    var path = link?.internal?.els?.path;
    if (path && typeof path.getTotalLength === "function") {
      var length = path.getTotalLength();
      var point = path.getPointAtLength(length / 2);
      if (point) {
        return { x: point.x, y: point.y };
      }
    }
    var fromEl = data.operators?.[link.fromOperator]?.internal?.els?.operator;
    var toEl = data.operators?.[link.toOperator]?.internal?.els?.operator;
    if (!fromEl || !toEl || !fromEl.length || !toEl.length) {
      return null;
    }
    var fromLeft = parseInt(fromEl.css("left"), 10) || 0;
    var fromTop = parseInt(fromEl.css("top"), 10) || 0;
    var fromWidth = fromEl.outerWidth() || 0;
    var fromHeight = fromEl.outerHeight() || 0;
    var toLeft = parseInt(toEl.css("left"), 10) || 0;
    var toTop = parseInt(toEl.css("top"), 10) || 0;
    var toWidth = toEl.outerWidth() || 0;
    var toHeight = toEl.outerHeight() || 0;
    return {
      x: (fromLeft + fromWidth + toLeft) / 2,
      y: (fromTop + fromHeight / 2 + toTop + toHeight / 2) / 2
    };
  }

  function refreshLinkAddButtons() {
    if (!linkAddLayer) {
      return;
    }
    if (!placeholdersEnabled()) {
      linkAddLayer.innerHTML = "";
      return;
    }
    linkAddLayer.innerHTML = "";
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.links) {
      return;
    }
    Object.keys(data.links).forEach(function(linkId) {
      var link = data.links[linkId];
      var midpoint = getLinkMidpoint(linkId);
      if (!link || !midpoint) {
        return;
      }
      if (link.toConnector === "input_2") {
        return;
      }
      var button = document.createElement("button");
      button.type = "button";
      button.className = "link-add-button";
      button.textContent = "+";
      button.setAttribute("aria-label", "Insert activity");
      button.setAttribute("data-link-id", linkId);
      button.setAttribute("data-from-id", link.fromOperator);
      button.setAttribute("data-to-id", link.toOperator);
      button.style.left = (midpoint.x - 14) + "px";
      button.style.top = (midpoint.y - 14) + "px";
      linkAddLayer.appendChild(button);
    });
  }

  function openChooseMenuAt(left, top) {
    if (!chooseMenu) {
      return;
    }
    if (!placeholdersEnabled()) {
      return;
    }
    chooseMenu.style.display = "flex";
    chooseMenu.setAttribute("aria-hidden", "false");
    chooseMenu.style.left = left + "px";
    chooseMenu.style.top = top + "px";
    if (chooseMenuSearch) {
      chooseMenuSearch.value = "";
      chooseMenuSearch.focus();
    }
    if (chooseMenuList) {
      var items = chooseMenuList.querySelectorAll("button[data-activity]");
      var hideSink = false;
      if (activeInsertLink) {
        var data = $flowchart.flowchart("getDataRef");
        var link = data && data.links ? data.links[activeInsertLink.linkId] : null;
        var fromId = activeInsertLink.fromId || link?.fromOperator;
        var toId = activeInsertLink.toId || link?.toOperator;
        hideSink = isSinkOperator(fromId) || isSinkOperator(toId);
      }
      items.forEach(function(item) {
        if (hideSink) {
          var activity = item.getAttribute("data-activity");
          if (activity === "sheets_write" || activity === "http_sink") {
            item.style.display = "none";
            return;
          }
        }
        item.style.display = "";
      });
      var newRowButton = chooseMenuList.querySelector("button[data-action=\"new-row\"]");
      if (newRowButton) {
        newRowButton.style.display = activeInsertLink ? "" : "none";
        newRowButton.classList.remove("is-active");
      }
      var sinkHeader = chooseMenuList.querySelector(".activity-group-label[data-group=\"sink\"]");
      if (sinkHeader) {
        var sinkButtons = chooseMenuList.querySelectorAll("button[data-group=\"sink\"]");
        sinkHeader.style.display = sinkButtons.length ? "" : "none";
      }
    }
  }

  function getImportSlotPosition() {
    if (!importPlaceholder) {
      return { left: importBaseLeft, top: importBaseTop };
    }
    return {
      left: parseInt(importPlaceholder.style.left || String(importBaseLeft), 10),
      top: parseInt(importPlaceholder.style.top || String(importBaseTop), 10)
    };
  }

  function advanceImportSlot(currentTop, height) {
    if (!importPlaceholder) {
      return;
    }
    var nextTop = currentTop + height + importSlotGap;
    importPlaceholder.style.top = nextTop + "px";
  }

  function getMaxBottomForTypes(types) {
    var operators = $flowchart.flowchart("getOperators") || {};
    var maxBottom = null;
    Object.keys(operators).forEach(function(id) {
      var operator = operators[id];
      var activityType = operator?.internal?.properties?.activityType || operator?.properties?.activityType;
      if (types.indexOf(activityType) === -1) {
        return;
      }
      var el = operator?.internal?.els?.operator;
      if (!el || !el.length) {
        return;
      }
      var top = parseInt(el.css("top"), 10) || 0;
      var height = el.outerHeight() || 0;
      var bottom = top + height;
      if (maxBottom === null || bottom > maxBottom) {
        maxBottom = bottom;
      }
    });
    return maxBottom;
  }

  function getMaxBottomForOperators() {
    var operators = $flowchart.flowchart("getOperators") || {};
    var maxBottom = null;
    Object.keys(operators).forEach(function(id) {
      var operator = operators[id];
      var el = operator?.internal?.els?.operator;
      if (!el || !el.length) {
        return;
      }
      var top = parseInt(el.css("top"), 10) || 0;
      var height = el.outerHeight() || 0;
      var bottom = top + height;
      if (maxBottom === null || bottom > maxBottom) {
        maxBottom = bottom;
      }
    });
    return maxBottom;
  }

  function repositionImportPlaceholder() {
    if (!placeholdersEnabled()) {
      if (importPlaceholder) {
        importPlaceholder.style.visibility = "hidden";
      }
      return;
    }
    if (!importPlaceholder) {
      return;
    }
    var maxBottom = getMaxBottomForOperators();

    if (maxBottom === null) {
      importPlaceholder.style.left = importBaseLeft + "px";
      importPlaceholder.style.top = importBaseTop + "px";
      return;
    }

    importPlaceholder.style.left = importBaseLeft + "px";
    importPlaceholder.style.top = (maxBottom + importSlotGap) + "px";
  }

  function ensureSelectPlaceholder(ingestId) {
    if (!placeholdersEnabled()) {
      return null;
    }
    if (!selectPlaceholders) {
      return null;
    }
    var existing = selectPlaceholders.querySelector("[data-ingest-id='" + ingestId + "']");
    if (existing) {
      return existing;
    }
    var button = document.createElement("button");
    button.type = "button";
    button.className = "select-placeholder";
    button.textContent = "+ Choose Activity";
    button.setAttribute("data-ingest-id", ingestId);
    selectPlaceholders.appendChild(button);
    return button;
  }

  function updateSelectPlaceholderPosition(ingestId) {
    if (!placeholdersEnabled()) {
      return;
    }
    if (!selectPlaceholders) {
      return;
    }
    var operators = $flowchart.flowchart("getOperators") || {};
    var lastNode = getLastNodeForIngest(ingestId);
    var baseOperator = operators[lastNode] || operators[ingestId];
    var activityType = baseOperator?.internal?.properties?.activityType || baseOperator?.properties?.activityType;
    if (activityType === "sheets_write" || activityType === "http_sink") {
      var existing = selectPlaceholders.querySelector("[data-ingest-id='" + ingestId + "']");
      if (existing) {
        existing.remove();
      }
      return;
    }
    var placeholder = ensureSelectPlaceholder(ingestId);
    var el = baseOperator?.internal?.els?.operator;
    if (!el || !el.length) {
      return;
    }
    var top = parseInt(el.css("top"), 10) || 0;
    var left = parseInt(el.css("left"), 10) || 0;
    var width = el.outerWidth() || selectBaseOffset;
    placeholder.style.top = top + "px";
    placeholder.style.left = (left + width + selectStepOffset) + "px";
  }

  function repositionSelectPlaceholders() {
    if (!placeholdersEnabled()) {
      if (selectPlaceholders) {
        selectPlaceholders.innerHTML = "";
      }
      return;
    }
    if (!selectPlaceholders) {
      return;
    }
    var operators = $flowchart.flowchart("getOperators") || {};
    var ingestIds = [];
    Object.keys(operators).forEach(function(id) {
      var operator = operators[id];
      var activityType = operator?.internal?.properties?.activityType || operator?.properties?.activityType;
      if (activityType === "import" || activityType === "sheets_read" || activityType === "http_request") {
        ingestIds.push(id);
      }
    });
    var existing = Array.from(selectPlaceholders.querySelectorAll(".select-placeholder"));
    existing.forEach(function(placeholder) {
      if (placeholder.classList.contains("branch-placeholder")) {
        return;
      }
      var ingestId = placeholder.getAttribute("data-ingest-id");
      if (ingestIds.indexOf(ingestId) === -1) {
        placeholder.remove();
      }
    });
    ingestIds.forEach(function(ingestId) {
      updateSelectPlaceholderPosition(ingestId);
    });
  }
  window.repositionImportPlaceholder = repositionImportPlaceholder;
  window.repositionSelectPlaceholders = repositionSelectPlaceholders;

  function isSinkOperator(operatorId) {
    if (operatorId == null) {
      return false;
    }
    var operators = $flowchart.flowchart("getOperators") || {};
    var operator = operators[operatorId];
    var activityType = operator?.internal?.properties?.activityType || operator?.properties?.activityType;
    return activityType === "sheets_write" || activityType === "http_sink";
  }

  function createIngestAtSlot(activityType) {
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorId = reserveNextOperatorId();
    var slot = getImportSlotPosition();
    var title = "Import Data";
    if (activityType === "sheets_read") {
      title = "Google Sheets (Read)";
    } else if (activityType === "http_request") {
      title = "HTTP Request";
    }
    var operatorData = {
      operatorId: operatorId,
      top: slot.top,
      left: slot.left,
      properties: {
        title: title,
        fileType: null,
        settings: null,
        dependencies: [],
        activityType: activityType,
        activityId: operatorId,
        locked: true,
        inputs: {
          input: {
            label: "",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);

    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    if (activityType === "import") {
      let import_activity = new Import_Activity($flowchart, new_activity);
      main_activities[operatorId] = import_activity;
    } else if (activityType === "sheets_read") {
      let sheets_activity = new GoogleSheets_Activity($flowchart, new_activity);
      main_activities[operatorId] = sheets_activity;
    } else if (activityType === "http_request") {
      let http_activity = new Http_Request_Activity($flowchart, new_activity);
      main_activities[operatorId] = http_activity;
    }
    activites = $flowchart.flowchart("getOperators");

    const operatorElement = new_activity?.internal?.els?.operator;
    if (operatorElement && operatorElement.length) {
      advanceImportSlot(slot.top, operatorElement.outerHeight());
    } else {
      advanceImportSlot(slot.top, 120);
    }
    repositionSelectPlaceholders();
  }

  function getLatestIngestId() {
    var operators = $flowchart.flowchart("getOperators") || {};
    var latest = null;
    var latestTop = null;
    Object.keys(operators).forEach(function(id) {
      var operator = operators[id];
      var activityType = operator?.internal?.properties?.activityType || operator?.properties?.activityType;
      if (activityType !== "import" && activityType !== "sheets_read" && activityType !== "http_request") {
        return;
      }
      var el = operator?.internal?.els?.operator;
      if (!el || !el.length) {
        return;
      }
      var top = parseInt(el.css("top"), 10) || 0;
      if (latestTop === null || top > latestTop) {
        latestTop = top;
        latest = id;
      }
    });
    return latest;
  }

  function createSelectAtPlaceholder(placeholder) {
    var operatorId = reserveNextOperatorId();
    var slot = {
      left: parseInt(placeholder.style.left || String(importBaseLeft + selectBaseOffset), 10),
      top: parseInt(placeholder.style.top || String(importBaseTop), 10)
    };
    var operatorData = {
      top: slot.top,
      left: slot.left,
      properties: {
        title: "Select",
        dependencies: [],
        settings: { "datatypes": [], "drop": [], "select": [] },
        activityType: "select",
        locked: true,
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let select_activity = new Select_Activity($flowchart, new_activity);
    main_activities[operatorId] = select_activity;
    activites = $flowchart.flowchart("getOperators");
    createAutoLinkFromPlaceholder(placeholder, operatorId);
    updateSelectPlaceholderPosition(placeholder.getAttribute("data-ingest-id"));
  }

  function createActivityAtPlaceholder(activityType, placeholder) {
    if (!placeholder) {
      return;
    }
    var branchFromId = placeholder.getAttribute("data-from-id");
    var branchColor = placeholder.getAttribute("data-branch-color");
    if (activityType === "select") {
      if (branchFromId) {
        var slot = {
          left: parseInt(placeholder.style.left || String(importBaseLeft + selectBaseOffset), 10),
          top: parseInt(placeholder.style.top || String(importBaseTop), 10)
        };
        var operatorId = reserveNextOperatorId();
        var operatorData = {
          top: slot.top,
          left: slot.left,
          properties: {
            title: "Select",
            dependencies: [],
            settings: { "datatypes": [], "drop": [], "select": [] },
            activityType: "select",
            locked: true,
            inputs: {
              input: {
                label: "Input",
                value: { "datatypes": null, "values": null }
              }
            },
            outputs: {
              output: {
                label: "Output",
                value: { "datatypes": null, "values": null }
              }
            }
          }
        };
        $flowchart.flowchart("createOperator", operatorId, operatorData);
        let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
        let select_activity = new Select_Activity($flowchart, new_activity);
        main_activities[operatorId] = select_activity;
        activites = $flowchart.flowchart("getOperators");
        createAutoLink(branchFromId, operatorId, branchColor);
        placeholder.remove();
        createBranchNextPlaceholder(operatorId, branchColor);
        repositionSelectPlaceholders();
        scheduleLinkAddRefresh();
      } else {
        createSelectAtPlaceholder(placeholder);
      }
      return;
    }
    var slot = {
      left: parseInt(placeholder.style.left || String(importBaseLeft + selectBaseOffset), 10),
      top: parseInt(placeholder.style.top || String(importBaseTop), 10)
    };
    var idsBefore = Object.keys($flowchart.flowchart("getOperators") || {});
    var buttonMap = {
      select: "#select_activity",
      filter: "#filter_activity",
      sort: "#sort_activity",
      join: "#join_activity",
      aggregate: "#aggregate_activity",
      custom: "#custom_activity",
      replace: "#replace_activity",
      fill: "#fill_activity",
      clean: "#clean_activity",
      dedupe: "#dedupe_activity",
      cast: "#cast_activity",
      regex: "#regex_activity",
      pivot: "#pivot_activity",
      window: "#window_activity",
      split: "#split_activity",
      combine: "#combine_activity",
      append: "#append_activity",
      flatten: "#flatten_activity",
      sheets_write: "#sheets_write_activity",
      http_sink: "#http_sink_activity"
    };
    var selector = buttonMap[activityType];
    if (!selector) {
      console.warn("createActivityAtPlaceholder: unknown activityType", activityType);
      return;
    }
    var btn = document.querySelector(selector);
    if (!btn) {
      console.warn("createActivityAtPlaceholder: missing button", selector);
      return;
    }
    btn.click();
    var idsAfter = Object.keys($flowchart.flowchart("getOperators") || {});
    var addedIds = idsAfter.filter(function(id) { return idsBefore.indexOf(id) === -1; });
    if (addedIds.length !== 1) {
      console.warn("createActivityAtPlaceholder: expected 1 new operator, got", addedIds.length);
      return;
    }
    var newId = parseInt(addedIds[0], 10);
    if (isNaN(newId)) { newId = addedIds[0]; }
    {
      var operators = $flowchart.flowchart("getOperators") || {};
      var operatorData = operators[newId];
      if (operatorData && operatorData.internal && operatorData.internal.els && operatorData.internal.els.operator) {
        operatorData.top = slot.top;
        operatorData.left = slot.left;
        operatorData.internal.els.operator.css({ left: slot.left, top: slot.top });
        operatorData.internal.properties.locked = true;
        if (branchFromId) {
          createAutoLink(branchFromId, newId, branchColor);
          placeholder.remove();
          createBranchNextPlaceholder(newId, branchColor);
          repositionSelectPlaceholders();
          scheduleLinkAddRefresh();
        } else {
          createAutoLinkFromPlaceholder(placeholder, newId);
          updateSelectPlaceholderPosition(placeholder.getAttribute("data-ingest-id"));
        }
      }
    }
  }

  function resolveInputConnector(activity) {
    if (!activity || !activity.inputs) {
      return "input";
    }
    if (activity.inputs.input_1) {
      return "input_1";
    }
    if (activity.inputs.input) {
      return "input";
    }
    var keys = Object.keys(activity.inputs);
    return keys.length > 0 ? keys[0] : "input";
  }

  function linkExists(fromId, toId, toConnector) {
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.links) {
      return false;
    }
    return Object.keys(data.links).some(function(linkId) {
      var link = data.links[linkId];
      return link.fromOperator == fromId &&
        link.toOperator == toId &&
        link.toConnector == toConnector;
    });
  }

  function createAutoLink(fromId, toId, color) {
    if (fromId == null || toId == null) {
      return;
    }
    var activity = $flowchart.flowchart("getOperatorActivity", toId);
    var toConnector = resolveInputConnector(activity);
    createAutoLinkWithConnector(fromId, toId, toConnector, color);
  }

  function createAutoLinkWithConnector(fromId, toId, toConnector, color) {
    if (fromId == null || toId == null) {
      return;
    }
    var dataRef = $flowchart.flowchart("getDataRef");
    if (!dataRef || !dataRef.operators || !dataRef.operators[fromId] || !dataRef.operators[toId]) {
      return;
    }
    if (!dataRef.operators[fromId].internal || !dataRef.operators[toId].internal) {
      return;
    }
    if (linkExists(fromId, toId, toConnector)) {
      return;
    }
    var linkData = {
      fromOperator: fromId,
      fromConnector: "output",
      toOperator: toId,
      toConnector: toConnector,
      locked: true
    };
    if (color) {
      linkData.color = color;
    }
    var linkId = $flowchart.flowchart("addLink", linkData);
    if (color && linkId != null) {
      $flowchart.flowchart("setLinkMainColor", linkId, color);
    }
    var flowchartInstance = $flowchart.flowchart("instance");
    if (flowchartInstance && typeof onLinkCreation === "function") {
      onLinkCreation(flowchartInstance, linkData);
    }
    schedulePipelineSave();
  }

  function createAutoLinkFromPlaceholder(placeholder, toId) {
    if (!placeholder) {
      return;
    }
    var ingestId = placeholder.getAttribute("data-ingest-id");
    if (!ingestId) {
      return;
    }
    var fromId = getLastNodeForIngest(ingestId) || ingestId;
    createAutoLink(fromId, toId);
    updateSelectPlaceholderPosition(ingestId);
  }

  function getLastNodeForIngest(ingestId) {
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.links) {
      return ingestId;
    }
    var current = ingestId;
    var seen = {};
    while (current != null && !seen[current]) {
      seen[current] = true;
      var next = null;
      Object.keys(data.links).some(function(linkId) {
        var link = data.links[linkId];
        if (!link || !link.locked) {
          return false;
        }
        if (link.fromOperator == current) {
          next = link.toOperator;
          return true;
        }
        return false;
      });
      if (next == null) {
        return current;
      }
      current = next;
    }
    return current || ingestId;
  }

  function getIngestForNode(nodeId) {
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.links || !data.operators) {
      return null;
    }
    var current = nodeId;
    var seen = {};
    while (current != null && !seen[current]) {
      seen[current] = true;
      var operator = data.operators[current];
      var activityType = operator?.internal?.properties?.activityType || operator?.properties?.activityType;
      if (activityType === "import" || activityType === "sheets_read" || activityType === "http_request") {
        return current;
      }
      var previous = null;
      Object.keys(data.links).some(function(linkId) {
        var link = data.links[linkId];
        if (!link || !link.locked) {
          return false;
        }
        if (link.toOperator == current) {
          previous = link.fromOperator;
          return true;
        }
        return false;
      });
      if (!previous) {
        return null;
      }
      current = previous;
    }
    return null;
  }

  function getChainFrom(startId) {
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.links) {
      return [];
    }
    var chain = [];
    var current = startId;
    var seen = {};
    while (current != null && !seen[current]) {
      seen[current] = true;
      chain.push(current);
      var next = null;
      Object.keys(data.links).some(function(linkId) {
        var link = data.links[linkId];
        if (!link || !link.locked) {
          return false;
        }
        if (link.fromOperator == current) {
          next = link.toOperator;
          return true;
        }
        return false;
      });
      if (!next) {
        break;
      }
      current = next;
    }
    return chain;
  }

  function shiftChainRight(startId, deltaX) {
    if (!deltaX) {
      return;
    }
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.operators) {
      return;
    }
    var chain = getChainFrom(startId);
    chain.forEach(function(id) {
      var operator = data.operators[id];
      var el = operator?.internal?.els?.operator;
      if (!operator || !el || !el.length) {
        return;
      }
      var left = parseInt(el.css("left"), 10) || 0;
      var top = parseInt(el.css("top"), 10) || 0;
      var nextLeft = left + deltaX;
      operator.left = nextLeft;
      operator.top = top;
      el.css({ left: nextLeft, top: top });
    });
    $flowchart.flowchart("redrawLinksLayer");
  }

  function isSameRow(fromEl, toEl) {
    if (!fromEl || !toEl || !fromEl.length || !toEl.length) {
      return true;
    }
    var fromTop = parseInt(fromEl.css("top"), 10) || 0;
    var toTop = parseInt(toEl.css("top"), 10) || 0;
    return Math.abs(fromTop - toTop) <= 30;
  }

  function compactChainFrom(startId) {
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.operators || !data.links) {
      return;
    }
    var current = startId;
    var seen = {};
    while (current != null && !seen[current]) {
      seen[current] = true;
      var currentEl = data.operators?.[current]?.internal?.els?.operator;
      if (!currentEl || !currentEl.length) {
        break;
      }
      var next = null;
      Object.keys(data.links).some(function(linkId) {
        var link = data.links[linkId];
        if (!link || !link.locked) {
          return false;
        }
        if (link.fromOperator == current) {
          next = link.toOperator;
          return true;
        }
        return false;
      });
      if (!next) {
        break;
      }
      var nextEl = data.operators?.[next]?.internal?.els?.operator;
      if (!nextEl || !nextEl.length) {
        break;
      }
      if (!isSameRow(currentEl, nextEl)) {
        break;
      }
      var currentLeft = parseInt(currentEl.css("left"), 10) || 0;
      var currentWidth = currentEl.outerWidth() || 0;
      var nextLeft = currentLeft + currentWidth + selectStepOffset;
      data.operators[next].left = nextLeft;
      nextEl.css({ left: nextLeft, top: parseInt(nextEl.css("top"), 10) || 0 });
      current = next;
    }
    $flowchart.flowchart("redrawLinksLayer");
  }

  function shiftRowRight(anchorEl, startLeft, delta) {
    if (!delta) {
      return;
    }
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.operators) {
      return;
    }
    var anchorTop = parseInt(anchorEl.css("top"), 10) || 0;
    Object.keys(data.operators).forEach(function(operatorId) {
      var operator = data.operators[operatorId];
      var el = operator?.internal?.els?.operator;
      if (!el || !el.length) {
        return;
      }
      var top = parseInt(el.css("top"), 10) || 0;
      if (Math.abs(top - anchorTop) > 30) {
        return;
      }
      var left = parseInt(el.css("left"), 10) || 0;
      if (left < startLeft) {
        return;
      }
      var nextLeft = left + delta;
      operator.left = nextLeft;
      operator.top = top;
      el.css({ left: nextLeft, top: top });
    });
    $flowchart.flowchart("redrawLinksLayer");
  }

  function shiftImportPlaceholderDown(delta) {
    if (!placeholdersEnabled()) {
      return;
    }
    if (!importPlaceholder || !delta) {
      return;
    }
    var currentTop = parseInt(importPlaceholder.style.top || String(importBaseTop), 10);
    importPlaceholder.style.top = (currentTop + delta) + "px";
  }

  function createBranchPlaceholder(linkContext) {
    if (!placeholdersEnabled()) {
      return;
    }
    if (!selectPlaceholders || !linkContext) {
      return;
    }
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.links) {
      return;
    }
    var link = data.links[linkContext.linkId];
    if (!link) {
      return;
    }
    var fromId = linkContext.fromId || link.fromOperator;
    var toId = linkContext.toId || link.toOperator;
    var fromEl = data.operators?.[fromId]?.internal?.els?.operator;
    var toEl = data.operators?.[toId]?.internal?.els?.operator;
    if (!fromEl || !fromEl.length) {
      return;
    }
    var fromLeft = parseInt(fromEl.css("left"), 10) || 0;
    var fromTop = parseInt(fromEl.css("top"), 10) || 0;
    var fromWidth = fromEl.outerWidth() || 0;
    var fromHeight = fromEl.outerHeight() || 0;
    var targetLeft = fromLeft + fromWidth + selectStepOffset;
    if (toEl && toEl.length) {
      targetLeft = parseInt(toEl.css("left"), 10) || targetLeft;
    }
    var rowGap = fromHeight + importSlotGap;
    var targetTop = fromTop + rowGap;

    shiftRowsDown(fromTop, rowGap);
    shiftImportPlaceholderDown(rowGap);

    var branchColor = linkContext.branchColor || getNextBranchColor();
    linkContext.branchColor = branchColor;
    var existing = selectPlaceholders.querySelector(".branch-placeholder[data-link-id='" + linkContext.linkId + "']");
    if (existing) {
      existing.remove();
    }
    var placeholder = document.createElement("button");
    placeholder.type = "button";
    placeholder.className = "select-placeholder branch-placeholder";
    placeholder.textContent = "+ Choose Activity";
    placeholder.setAttribute("data-from-id", fromId);
    placeholder.setAttribute("data-link-id", linkContext.linkId);
    placeholder.setAttribute("data-branch-color", branchColor);
    placeholder.style.left = targetLeft + "px";
    placeholder.style.top = targetTop + "px";
    selectPlaceholders.appendChild(placeholder);

    repositionSelectPlaceholders();
    scheduleLinkAddRefresh();
  }

  function createBranchNextPlaceholder(fromId, branchColor) {
    if (!placeholdersEnabled()) {
      return;
    }
    if (!selectPlaceholders || fromId == null) {
      return;
    }
    var data = $flowchart.flowchart("getDataRef");
    var operator = data?.operators?.[fromId];
    var activityType = operator?.internal?.properties?.activityType || operator?.properties?.activityType;
    if (activityType === "sheets_write" || activityType === "http_sink") {
      return;
    }
    var el = operator?.internal?.els?.operator;
    if (!el || !el.length) {
      return;
    }
    var left = parseInt(el.css("left"), 10) || 0;
    var top = parseInt(el.css("top"), 10) || 0;
    var width = el.outerWidth() || selectBaseOffset;
    var placeholder = document.createElement("button");
    placeholder.type = "button";
    placeholder.className = "select-placeholder branch-placeholder";
    placeholder.textContent = "+ Choose Activity";
    placeholder.setAttribute("data-from-id", fromId);
    if (branchColor) {
      placeholder.setAttribute("data-branch-color", branchColor);
    }
    placeholder.style.left = (left + width + selectStepOffset) + "px";
    placeholder.style.top = top + "px";
    selectPlaceholders.appendChild(placeholder);
  }
  function shiftRowsDown(anchorTop, delta) {
    if (!delta) {
      return;
    }
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.operators) {
      return;
    }
    Object.keys(data.operators).forEach(function(operatorId) {
      var operator = data.operators[operatorId];
      var el = operator?.internal?.els?.operator;
      if (!el || !el.length) {
        return;
      }
      var top = parseInt(el.css("top"), 10) || 0;
      if (top <= anchorTop + 30) {
        return;
      }
      var left = parseInt(el.css("left"), 10) || 0;
      var nextTop = top + delta;
      operator.top = nextTop;
      operator.left = left;
      el.css({ left: left, top: nextTop });
    });
    if (selectPlaceholders && placeholdersEnabled()) {
      var placeholders = Array.from(selectPlaceholders.querySelectorAll(".select-placeholder"));
      placeholders.forEach(function(placeholder) {
        var top = parseInt(placeholder.style.top || "0", 10) || 0;
        if (top <= anchorTop + 30) {
          return;
        }
        placeholder.style.top = (top + delta) + "px";
      });
    }
    $flowchart.flowchart("redrawLinksLayer");
  }

  function ensureRowGapFromOperator(operatorId, minGap) {
    var data = $flowchart.flowchart("getDataRef");
    var operator = data?.operators?.[operatorId];
    var el = operator?.internal?.els?.operator;
    if (!el || !el.length) {
      return;
    }
    var rowTop = parseInt(el.css("top"), 10) || 0;
    var left = parseInt(el.css("left"), 10) || 0;
    var width = el.outerWidth() || 0;
    var startLeft = left + width;
    var minBlockingLeft = null;
    Object.keys(data.operators || {}).forEach(function(id) {
      if (id == operatorId) {
        return;
      }
      var otherEl = data.operators[id]?.internal?.els?.operator;
      if (!otherEl || !otherEl.length) {
        return;
      }
      var top = parseInt(otherEl.css("top"), 10) || 0;
      if (Math.abs(top - rowTop) > 30) {
        return;
      }
      var otherLeft = parseInt(otherEl.css("left"), 10) || 0;
      if (otherLeft < startLeft) {
        return;
      }
      if (minBlockingLeft === null || otherLeft < minBlockingLeft) {
        minBlockingLeft = otherLeft;
      }
    });
    if (minBlockingLeft === null) {
      return;
    }
    var currentGap = minBlockingLeft - startLeft;
    if (currentGap < minGap) {
      shiftRowRight(el, minBlockingLeft, minGap - currentGap);
    }
  }

  function ensureRowGapFromPosition(anchorEl, startLeft, minGap) {
    if (!anchorEl || !anchorEl.length) {
      return;
    }
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.operators) {
      return;
    }
    var rowTop = parseInt(anchorEl.css("top"), 10) || 0;
    var minBlockingLeft = null;
    Object.keys(data.operators).forEach(function(id) {
      var otherEl = data.operators[id]?.internal?.els?.operator;
      if (!otherEl || !otherEl.length) {
        return;
      }
      var top = parseInt(otherEl.css("top"), 10) || 0;
      if (Math.abs(top - rowTop) > 30) {
        return;
      }
      var otherLeft = parseInt(otherEl.css("left"), 10) || 0;
      if (otherLeft < startLeft) {
        return;
      }
      if (minBlockingLeft === null || otherLeft < minBlockingLeft) {
        minBlockingLeft = otherLeft;
      }
    });
    if (minBlockingLeft === null) {
      return;
    }
    var currentGap = minBlockingLeft - startLeft;
    if (currentGap < minGap) {
      shiftRowRight(anchorEl, minBlockingLeft, minGap - currentGap);
    }
  }

  function createSelectAtPosition(slot) {
    var operatorId = reserveNextOperatorId();
    var operatorData = {
      top: slot.top,
      left: slot.left,
      properties: {
        title: "Select",
        dependencies: [],
        settings: { "datatypes": [], "drop": [], "select": [] },
        activityType: "select",
        locked: true,
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let select_activity = new Select_Activity($flowchart, new_activity);
    main_activities[operatorId] = select_activity;
    activites = $flowchart.flowchart("getOperators");
    return operatorId;
  }

  function positionOperator(operatorId, slot) {
    var operators = $flowchart.flowchart("getOperators") || {};
    var operatorData = operators[operatorId];
    var el = operatorData?.internal?.els?.operator;
    if (!operatorData || !el || !el.length) {
      return;
    }
    operatorData.top = slot.top;
    operatorData.left = slot.left;
    el.css({ left: slot.left, top: slot.top });
    if (operatorData.internal && operatorData.internal.properties) {
      operatorData.internal.properties.locked = true;
    }
  }

  function createActivityAtPosition(activityType, slot) {
    if (activityType === "select") {
      return createSelectAtPosition(slot);
    }
    var buttonMap = {
      select: "#select_activity",
      filter: "#filter_activity",
      sort: "#sort_activity",
      join: "#join_activity",
      aggregate: "#aggregate_activity",
      custom: "#custom_activity",
      replace: "#replace_activity",
      fill: "#fill_activity",
      clean: "#clean_activity",
      dedupe: "#dedupe_activity",
      cast: "#cast_activity",
      regex: "#regex_activity",
      pivot: "#pivot_activity",
      window: "#window_activity",
      split: "#split_activity",
      combine: "#combine_activity",
      append: "#append_activity",
      flatten: "#flatten_activity",
      sheets_write: "#sheets_write_activity",
      http_sink: "#http_sink_activity"
    };
    var selector = buttonMap[activityType];
    if (!selector) {
      console.warn("createActivityAtPosition: unknown activityType", activityType);
      return null;
    }
    var btn = document.querySelector(selector);
    if (!btn) {
      console.warn("createActivityAtPosition: missing button", selector);
      return null;
    }
    var idsBefore = Object.keys($flowchart.flowchart("getOperators") || {});
    btn.click();
    var idsAfter = Object.keys($flowchart.flowchart("getOperators") || {});
    var addedIds = idsAfter.filter(function(id) { return idsBefore.indexOf(id) === -1; });
    if (addedIds.length !== 1) {
      console.warn("createActivityAtPosition: expected 1 new operator, got", addedIds.length);
      return null;
    }
    var newId = parseInt(addedIds[0], 10);
    if (isNaN(newId)) { newId = addedIds[0]; }
    positionOperator(newId, slot);
    return newId;
  }

  function createActivityBetween(activityType, linkContext) {
    if (!linkContext) {
      return;
    }
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.links) {
      return;
    }
    var link = data.links[linkContext.linkId];
    if (!link) {
      return;
    }
    var linkColor = link.color;
    var fromId = linkContext.fromId || link.fromOperator;
    var toId = linkContext.toId || link.toOperator;
    var fromEl = data.operators?.[fromId]?.internal?.els?.operator;
    var toEl = data.operators?.[toId]?.internal?.els?.operator;
    var fromLeft = fromEl && fromEl.length ? parseInt(fromEl.css("left"), 10) || 0 : 0;
    var fromTop = fromEl && fromEl.length ? parseInt(fromEl.css("top"), 10) || 0 : 0;
    var fromWidth = fromEl && fromEl.length ? fromEl.outerWidth() || 0 : 0;
    var insertGap = selectStepOffset;
    var extraAfterGap = 50;
    var targetLeft = fromLeft + fromWidth + insertGap;
    var targetTop = fromTop;
    var newId = createActivityAtPosition(activityType, { left: targetLeft, top: targetTop });
    if (newId == null) {
      return;
    }
    var newOperatorEl = data.operators?.[newId]?.internal?.els?.operator;
    var newWidth = newOperatorEl && newOperatorEl.length ? newOperatorEl.outerWidth() || 0 : 0;
    if (fromEl && fromEl.length) {
      ensureRowGapFromPosition(fromEl, targetLeft + newWidth, extraAfterGap);
    }
    if (isSameRow(fromEl, toEl)) {
      var toLeft = toEl && toEl.length ? parseInt(toEl.css("left"), 10) || 0 : 0;
      var existingGap = toLeft - (fromLeft + fromWidth);
      var neededGap = newWidth + insertGap + extraAfterGap;
      var shiftBy = existingGap < neededGap ? (neededGap - existingGap) : 0;
      if (shiftBy) {
        shiftChainRight(toId, shiftBy);
      }
    }
    allowLockedLinkDelete = true;
    try {
      $flowchart.flowchart("deleteLink", linkContext.linkId);
    } finally {
      allowLockedLinkDelete = false;
    }
    createAutoLink(fromId, newId, linkColor);
    createAutoLinkWithConnector(newId, toId, link.toConnector || resolveInputConnector($flowchart.flowchart("getOperatorActivity", toId)), linkColor);
    var ingestId = getIngestForNode(fromId);
    if (ingestId) {
      updateSelectPlaceholderPosition(ingestId);
    }
    scheduleLinkAddRefresh();
  }

  function createActivityAsNewRow(activityType, linkContext) {
    if (!linkContext) {
      return;
    }
    var data = $flowchart.flowchart("getDataRef");
    if (!data || !data.links) {
      return;
    }
    var link = data.links[linkContext.linkId];
    if (!link) {
      return;
    }
    var fromId = linkContext.fromId || link.fromOperator;
    var toId = linkContext.toId || link.toOperator;
    var fromEl = data.operators?.[fromId]?.internal?.els?.operator;
    var toEl = data.operators?.[toId]?.internal?.els?.operator;
    var fromLeft = fromEl && fromEl.length ? parseInt(fromEl.css("left"), 10) || 0 : 0;
    var fromTop = fromEl && fromEl.length ? parseInt(fromEl.css("top"), 10) || 0 : 0;
    var fromWidth = fromEl && fromEl.length ? fromEl.outerWidth() || 0 : 0;
    var fromHeight = fromEl && fromEl.length ? fromEl.outerHeight() || 0 : 0;
    var targetLeft = fromLeft + fromWidth + selectStepOffset;
    if (toEl && toEl.length) {
      targetLeft = parseInt(toEl.css("left"), 10) || targetLeft;
    }
    var rowGap = fromHeight + importSlotGap;
    var targetTop = fromTop + rowGap;
    shiftRowsDown(fromTop, rowGap);
    var newId = createActivityAtPosition(activityType, { left: targetLeft, top: targetTop });
    if (newId == null) {
      return;
    }
    createAutoLink(fromId, newId);
    var ingestId = getIngestForNode(fromId);
    if (ingestId) {
      updateSelectPlaceholderPosition(ingestId);
    }
    scheduleLinkAddRefresh();
  }

  function ensureDescriptionElement(operatorId) {
    const body = document.getElementById("activity_body_" + operatorId);
    if (!body) {
      return null;
    }
    body.style.position = "relative";
    let description = body.querySelector(".flowchart-operator-description");
    if (!description) {
      description = document.createElement("div");
      description.className = "flowchart-operator-description";
      body.prepend(description);
    }
    description.style.position = "absolute";
    description.style.left = "0";
    description.style.right = "0";
    description.style.top = "0";
    description.style.pointerEvents = "none";
    description.style.whiteSpace = "pre-wrap";
    description.style.background = "rgba(255, 255, 255, 0.9)";
    description.style.padding = "2px 6px";
    description.style.borderRadius = "6px";
    description.style.zIndex = "1";
    let content = body.querySelector(".flowchart-operator-body-content");
    if (!content) {
      content = document.createElement("div");
      content.className = "flowchart-operator-body-content";
      const children = Array.from(body.children).filter(child => child !== description);
      children.forEach(child => content.appendChild(child));
      body.appendChild(content);
    }
    return description;
  }

  function updateOperatorDescription(operatorId, text) {
    const descriptionText = text ? text.trim() : "";
    const descriptionEl = ensureDescriptionElement(operatorId);
    if (descriptionEl) {
      descriptionEl.textContent = descriptionText;
      descriptionEl.style.display = descriptionText ? "block" : "none";
    }
    const flowchartData = $flowchart.flowchart("getDataRef");
    if (flowchartData && flowchartData.operators && flowchartData.operators[operatorId]) {
      flowchartData.operators[operatorId].properties =
        flowchartData.operators[operatorId].properties || {};
      flowchartData.operators[operatorId].properties.activity_description = descriptionText;
      if (flowchartData.operators[operatorId].internal) {
        flowchartData.operators[operatorId].internal.properties.activity_description = descriptionText;
      }
    }
  }
  window.flowchartApplyActivityDescription = updateOperatorDescription;

  function setActivityTabsVisible(isVisible) {
    if (isVisible) {
      $tabSettings.show();
      $tabDataPreview.show();
      if (activePipelineType === "pipeline") {
        $tabActivities.show();
      } else {
        $tabActivities.hide();
      }
    } else {
      $tabSettings.hide();
      $tabDataPreview.hide();
      $tabActivities.hide();
      $tabGeneral.trigger("click");
    }
    updatePipelineActivitiesTab();
  }

  function applySavedSettingsToActivity(operatorId) {
    if (!$flowchart || operatorId == null) {
      return;
    }
    var activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    if (!activity || !activity.settings) {
      return;
    }
    var settings = activity.settings;
    var rows = null;
    if (activity.activityType && Array.isArray(settings[activity.activityType])) {
      rows = settings[activity.activityType];
    } else if (Array.isArray(settings)) {
      rows = settings;
    } else if (typeof settings === "object") {
      Object.keys(settings).some(function(key) {
        if (Array.isArray(settings[key])) {
          rows = settings[key];
          return true;
        }
        return false;
      });
    }
    if (activity.activityType === "replace" && Array.isArray(rows)) {
      var filterFn = null;
      if (activityInstance && typeof activityInstance._is_meaningful_setting === "function") {
        filterFn = activityInstance._is_meaningful_setting.bind(activityInstance);
      } else {
        filterFn = function(statement) {
          if (!statement || typeof statement !== "object") {
            return false;
          }
          var hasValue = function(value) {
            return value != null && String(value).trim() !== "";
          };
          return (
            hasValue(statement.find_value) ||
            hasValue(statement.value) ||
            hasValue(statement.new_column_name) ||
            hasValue(statement.renamed_name) ||
            hasValue(statement.columnName_2 || statement.column_name_2) ||
            hasValue(statement.operation) ||
            hasValue(statement.condition_value) ||
            hasValue(statement.else_value)
          );
        };
      }
      rows = rows.filter(filterFn);
      if (activity.settings && Array.isArray(activity.settings.replace)) {
        activity.settings.replace = rows;
      }
      if ($flowchart) {
        $flowchart.flowchart("setSettings", operatorId, { replace: rows });
      }
    }
    if (!rows || rows.length === 0) {
      return;
    }
    var activityInstance = main_activities[operatorId];
    var container = document.getElementById(operatorId + "_column_edit");
    if (!container) {
      var settings_div = document.getElementById("selected_activity_settings");
      if (!settings_div) {
        return;
      }
      container = document.createElement("div");
      container.id = operatorId + "_column_edit";
      settings_div.appendChild(container);
    }
    if (activity.activityType === "flatten" && activityInstance) {
      container.innerHTML = "";
      if (typeof activityInstance._setup_column_container === "function") {
        var addButton = document.createElement("button");
        addButton.innerHTML = activityInstance.add_button_label || "+ Add Flatten";
        addButton.className = "buttons add-button";
        addButton.addEventListener("click", function(event) {
          activityInstance._add_column(event, $flowchart, activityInstance);
        });
        activityInstance._setup_column_container(container, addButton);
      }
      var savedColumns = rows.map(function(item) {
        return item.unroll_by || item.columnName || item.column_name;
      }).filter(Boolean);
      var options = savedColumns.length > 0 ? savedColumns : [""];
      rows.forEach(function(statement) {
        var value = statement.unroll_by || statement.columnName || statement.column_name || "";
        var settingsRow = [
          { type: "span", label: "Flatten Array", color: "black" },
          { type: "selector", options: options, default_value: value, name: "unroll_by" },
          { type: "button", label: "DROP", color: "red" }
        ];
        var column_edit_element = activityInstance.get_column_selection_element($flowchart, settingsRow);
        var column_wrapper = document.createElement("div");
        column_wrapper.className = "select-column-row";
        var drag_handle = document.createElement("span");
        drag_handle.className = "drag-handle";
        drag_handle.title = "Drag to reorder";
        column_wrapper.appendChild(drag_handle);
        column_wrapper.appendChild(column_edit_element);
        container.appendChild(column_wrapper);
      });
      if (typeof activityInstance._enable_column_sorting === "function") {
        activityInstance._enable_column_sorting(container);
      }
      if (activityInstance && typeof activityInstance.get_operation_settings === "function") {
        activityInstance.get_operation_settings();
      }
      return;
    }

    if (activity.activityType === "join" && activityInstance) {
      if (typeof activityInstance._restore_saved_settings === "function") {
        activityInstance._restore_saved_settings();
        return;
      }
    }

    if (activity.activityType === "custom" && activityInstance) {
      container.innerHTML = "";
      rows.forEach(function(statement) {
        activityInstance._add_column(null, $flowchart, activityInstance, statement);
      });
      if (activityInstance && typeof activityInstance.get_operation_settings === "function") {
        activityInstance.get_operation_settings();
      }
      return;
    }

    if (activityInstance && typeof activityInstance._setup_column_container === "function") {
      var hasActions = container.querySelector(".column-settings-actions");
      if (!hasActions && activityInstance.add_button_label && typeof activityInstance._add_column === "function") {
        var addButton = document.createElement("button");
        addButton.innerHTML = activityInstance.add_button_label;
        addButton.className = "buttons add-button";
        addButton.addEventListener("click", function(event) {
          activityInstance._add_column(event, $flowchart, activityInstance);
        });
        activityInstance._setup_column_container(container, addButton);
      }
    }

    function collectRows() {
      var collected = [];
      Array.from(container.children).forEach(function(child) {
        var row = child;
        if (row.classList && row.classList.contains("select-column-row")) {
          var inner = row.querySelector(".rename_settings");
          if (inner) {
            row = inner;
          }
        }
        if (row && row.querySelectorAll && row.querySelectorAll("[name]").length > 0) {
          collected.push(row);
        }
      });
      return collected;
    }

    function buildFallbackRow(statement) {
      if (!activityInstance || typeof activityInstance.get_column_selection_element !== "function") {
        return null;
      }
      const rowsSpec = [];
      const addSelect = (name, value, multiple) => {
        const opts = Array.isArray(value) ? value : (value ? [value] : [""]);
        rowsSpec.push({
          type: "selector",
          options: opts,
          default_value: Array.isArray(value) ? value : (value || ""),
          name: name,
          multiple: !!multiple
        });
      };
      const addInput = (name, value) => {
        rowsSpec.push({
          type: "input",
          placeholder: "",
          value: value || "",
          name: name
        });
      };

      if (statement.columnName_1 || statement.column_name_1) {
        addSelect("column_name_1", statement.columnName_1 || statement.column_name_1);
      }
      if (statement.columnName_2 || statement.column_name_2) {
        addSelect("column_name_2", statement.columnName_2 || statement.column_name_2);
      }
      if (statement.columnName || statement.column_name) {
        if (Array.isArray(statement.columnName)) {
          addSelect("multiple_column_names", statement.columnName, true);
        } else {
          addSelect("column_name", statement.columnName || statement.column_name);
        }
      }
      if (statement.new_column_name || statement.renamed_name) {
        addInput("new_column_name", statement.new_column_name || statement.renamed_name);
      }
      if (statement.new_column_name_1) {
        addInput("new_column_name_1", statement.new_column_name_1);
      }
      if (statement.new_column_name_2) {
        addInput("new_column_name_2", statement.new_column_name_2);
      }
      if (statement.data_type) {
        addSelect("data_type", statement.data_type);
      }
      if (statement.orderby) {
        addSelect("orderby", statement.orderby);
      }
      if (statement.operation) {
        addSelect("operation", statement.operation);
      }
      if (statement.condition_value) {
        addInput("condition_value", statement.condition_value);
      }
      if (statement.find_value) {
        addInput("find_value", statement.find_value);
      }
      if (statement.value) {
        addInput("value", statement.value);
      }
      if (statement.replace_value_source) {
        addSelect("replace_value_source", statement.replace_value_source);
      }
      if (statement.replace_value_column) {
        addSelect("replace_value_column", statement.replace_value_column);
      }
      if (statement.value_source) {
        addSelect("value_source", statement.value_source);
      }
      if (statement.value_offset_direction) {
        addSelect("value_offset_direction", statement.value_offset_direction);
      }
      if (statement.value_offset_amount) {
        addInput("value_offset_amount", statement.value_offset_amount);
      }
      if (statement.value_offset_unit) {
        addSelect("value_offset_unit", statement.value_offset_unit);
      }
      if (statement.date_start_column) {
        addSelect("date_start_column", statement.date_start_column);
      }
      if (statement.date_end_column) {
        addSelect("date_end_column", statement.date_end_column);
      }
      if (statement.date_base_column) {
        addSelect("date_base_column", statement.date_base_column);
      }
      if (statement.date_days_column) {
        addSelect("date_days_column", statement.date_days_column);
      }
      if (statement.date_compare_column) {
        addSelect("date_compare_column", statement.date_compare_column);
      }
      if (statement.then_value) {
        addInput("then_value", statement.then_value);
      }
      if (statement.else_value) {
        addInput("else_value", statement.else_value);
      }
      if (statement.logical) {
        addSelect("logical", statement.logical);
      }
      if (statement.case) {
        addSelect("case", statement.case);
      }
      if (statement.unroll_by) {
        addInput("unroll_by", statement.unroll_by);
      }
      if (statement.header_key) {
        addInput("header_key", statement.header_key);
      }
      if (statement.header_value) {
        addInput("header_value", statement.header_value);
      }
      if (statement.url) {
        addInput("url", statement.url);
      }
      if (statement.request_type) {
        addSelect("request_type", statement.request_type);
      }
      if (statement.body) {
        addInput("body", statement.body);
      }
      if (statement.pagination_mode) {
        addSelect("pagination_mode", statement.pagination_mode);
      }
      if (statement.next_page_property) {
        addInput("next_page_property", statement.next_page_property);
      }
      if (statement.continuation_property) {
        addInput("continuation_property", statement.continuation_property);
      }
      if (statement.continuation_query_param) {
        addInput("continuation_query_param", statement.continuation_query_param);
      }

      if (rowsSpec.length === 0) {
        return null;
      }
      return activityInstance.get_column_selection_element($flowchart, rowsSpec);
    }

    var rowElements = collectRows();
    while (rowElements.length < rows.length && activityInstance && typeof activityInstance._add_column === "function") {
      var beforeLength = rowElements.length;
      activityInstance._add_column(null, $flowchart, activityInstance);
      rowElements = collectRows();
      if (rowElements.length <= beforeLength) {
        break;
      }
    }
    if (rowElements.length === 0 && rows.length > 0) {
      rows.forEach(function(statement) {
        var fallbackRow = buildFallbackRow(statement);
        if (fallbackRow) {
          container.appendChild(fallbackRow);
        }
      });
      rowElements = collectRows();
    }
    rows.forEach(function(statement, index) {
      var row = rowElements[index];
      if (!row || !statement) {
        return;
      }
      var elements = row.querySelectorAll("[name]");
      elements.forEach(function(element) {
        var name = element.name;
        var value = null;
        if (name === "multiple_column_names") {
          value = Array.isArray(statement.columnName) ? statement.columnName : [];
        } else if (name === "column_name") {
          value = statement.columnName || statement.column_name;
        } else if (name === "column_name_1") {
          value = statement.columnName_1 || statement.column_name_1;
        } else if (name === "column_name_2") {
          value = statement.columnName_2 || statement.column_name_2;
        } else if (name === "new_column_name") {
          value = statement.new_column_name || statement.renamed_name;
        } else if (name === "new_column_name_1") {
          value = statement.new_column_name_1;
        } else if (name === "new_column_name_2") {
          value = statement.new_column_name_2;
        } else if (name === "data_type") {
          value = statement.data_type;
        } else if (name === "orderby") {
          value = statement.orderby;
        } else if (name === "operation") {
          value = statement.operation;
        } else if (name === "condition_value") {
          value = statement.condition_value;
        } else if (name === "find_value") {
          value = statement.find_value;
      } else if (name === "value") {
        value = statement.value;
      } else if (name === "replace_value_source") {
        value = statement.replace_value_source;
      } else if (name === "replace_value_column") {
        value = statement.replace_value_column;
      } else if (name === "value_source") {
        value = statement.value_source;
      } else if (name === "value_offset_direction") {
        value = statement.value_offset_direction;
      } else if (name === "value_offset_amount") {
        value = statement.value_offset_amount;
      } else if (name === "value_offset_unit") {
        value = statement.value_offset_unit;
      } else if (name === "date_start_column") {
        value = statement.date_start_column;
      } else if (name === "date_end_column") {
        value = statement.date_end_column;
      } else if (name === "date_base_column") {
        value = statement.date_base_column;
      } else if (name === "date_days_column") {
        value = statement.date_days_column;
      } else if (name === "date_compare_column") {
        value = statement.date_compare_column;
      } else if (name === "then_value") {
        value = statement.then_value;
      } else if (name === "else_value") {
          value = statement.else_value;
      } else if (name === "logical") {
        value = statement.logical;
      } else if (name === "case") {
          value = statement.case;
        } else if (name === "unroll_by") {
          value = statement.unroll_by;
        } else if (name === "header_key") {
          value = statement.header_key;
        } else if (name === "header_value") {
          value = statement.header_value;
        } else if (name === "url") {
          value = statement.url;
        } else if (name === "request_type") {
          value = statement.request_type;
        } else if (name === "body") {
          value = statement.body;
        }
        if (value == null) {
          return;
        }
        if (element.tagName === "SELECT") {
          if (element.multiple) {
            var values = Array.isArray(value) ? value : [value];
            values.forEach(function(item) {
              if (Array.from(element.options).every(function(option) { return option.value !== item; })) {
                var newOption = document.createElement("option");
                newOption.value = item;
                newOption.textContent = item;
                element.appendChild(newOption);
              }
            });
            Array.from(element.options).forEach(function(option) {
              option.selected = values.indexOf(option.value) !== -1;
            });
          } else {
            if (Array.from(element.options).every(function(option) { return option.value !== value; })) {
              var option = document.createElement("option");
              option.value = value;
              option.textContent = value;
              element.appendChild(option);
            }
            element.value = value;
          }
          if (name === "value_source") {
            element.dispatchEvent(new Event("change"));
          }
        } else {
          element.value = value;
        }
      });
    });
    if (activityInstance && typeof activityInstance.get_operation_settings === "function") {
      activityInstance.get_operation_settings();
    }
  }

  setActivityTabsVisible(false);

  $flowchart.flowchart({

    onOperatorSelect: function(operatorId) {
      $operatorProperties.show();
      $pipelineProperties.hide();
      setActivityTabsVisible(true);
      var $activity_previews = $("#activity_previews");
      $activity_previews.children().hide();
      $selected_activity_settings.show();
      const previewContainer = ensurePreviewContainer(operatorId);
      if (previewContainer) {
        $(previewContainer).show();
      }

      const refreshButton = document.getElementById("refresh_preview");
      const exportButton = document.getElementById("export_preview");
      if (refreshButton) {
        refreshButton.value = operatorId;
      }
      if (exportButton) {
        exportButton.value = operatorId;
      }
      $operatorTitle.val($flowchart.flowchart("getOperatorTitle", operatorId));
      let activity = $flowchart.flowchart("getOperatorActivity", operatorId);
      let currentDescription =
        activity.activity_description ||
        $flowchart.flowchart("getOperatorBody", operatorId) ||
        "";
      if (typeof currentDescription !== "string") {
        currentDescription = "";
      }
      $operatorDescription.val(currentDescription);
      updateOperatorDescription(operatorId, currentDescription);
      let all_dependecies = $flowchart.flowchart("getDependencies");



      console.log("Selected", activity, "dependencies", all_dependecies);



      let settings_div = document.getElementById("selected_activity_settings");
      Array.from(settings_div.children).forEach(child => {
        child.style.display = "none";
      });
      if (activity.activityType == "import") {
        // Adds specific settings for import activity

        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        if (found) {
          for (let i = 0; i < settings_div.children.length; i++) {
            if (settings_div.children[i].id == elem.id && settings_div.children[i] !== elem) {
              settings_div.children[i].replaceWith(elem);
              break;
            }
          }
        }
      }

      if (activity.activityType == "dataflow") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        if (typeof window.refreshDataflowActivityOptions === "function") {
          window.refreshDataflowActivityOptions(getAvailableDataflows());
        }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        if (found) {
          for (let i = 0; i < settings_div.children.length; i++) {
            if (settings_div.children[i].id == elem.id && settings_div.children[i] !== elem) {
              settings_div.children[i].replaceWith(elem);
              break;
            }
          }
        }
      }

      if (activity.activityType == "pipeline") {
        let target_activity = main_activities[operatorId];
        if (!target_activity) {
          target_activity = new Pipeline_Activity($flowchart, activity);
          main_activities[operatorId] = target_activity;
        }
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        if (typeof window.refreshPipelineActivityOptions === "function") {
          window.refreshPipelineActivityOptions(getAvailablePipelines());
        }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        if (found) {
          for (let i = 0; i < settings_div.children.length; i++) {
            if (settings_div.children[i].id == elem.id && settings_div.children[i] !== elem) {
              settings_div.children[i].replaceWith(elem);
              break;
            }
          }
        }
      }

      if (activity.activityType == "stream") {
        let target_activity = main_activities[operatorId];
        if (!target_activity) {
          target_activity = new Stream_Activity($flowchart, activity);
          main_activities[operatorId] = target_activity;
        }
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        if (found) {
          for (let i = 0; i < settings_div.children.length; i++) {
            if (settings_div.children[i].id == elem.id && settings_div.children[i] !== elem) {
              settings_div.children[i].replaceWith(elem);
              break;
            }
          }
        }
      }

      if (activity.activityType == "filter") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        if (found) {
          for (let i = 0; i < settings_div.children.length; i++) {
            if (settings_div.children[i].id == elem.id && settings_div.children[i] !== elem) {
              settings_div.children[i].replaceWith(elem);
              break;
            }
          }
        }
      }

      if (activity.activityType == "join") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        if (found) {
          for (let i = 0; i < settings_div.children.length; i++) {
            if (settings_div.children[i].id == elem.id && settings_div.children[i] !== elem) {
              settings_div.children[i].replaceWith(elem);
              break;
            }
          }
        }
      }

      if (activity.activityType == "group") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        if (found) {
          for (let i = 0; i < settings_div.children.length; i++) {
            if (settings_div.children[i].id == elem.id && settings_div.children[i] !== elem) {
              settings_div.children[i].replaceWith(elem);
              break;
            }
          }
        }
      }

      if (activity.activityType == "custom") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        if (found) {
          for (let i = 0; i < settings_div.children.length; i++) {
            if (settings_div.children[i].id == elem.id && settings_div.children[i] !== elem) {
              settings_div.children[i].replaceWith(elem);
              break;
            }
          }
        }
      }
      if (activity.activityType == "replace") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        if (found) {
          for (let i = 0; i < settings_div.children.length; i++) {
            if (settings_div.children[i].id == elem.id && settings_div.children[i] !== elem) {
              settings_div.children[i].replaceWith(elem);
              break;
            }
          }
        }
        if (target_activity && typeof target_activity._ensure_add_button === "function") {
          target_activity._ensure_add_button();
        }
        if (target_activity && typeof target_activity._prune_empty_rows === "function") {
          target_activity._prune_empty_rows();
        }
      }
      if (activity.activityType == "flatten") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        if (found) {
          for (let i = 0; i < settings_div.children.length; i++) {
            if (settings_div.children[i].id == elem.id && settings_div.children[i] !== elem) {
              settings_div.children[i].replaceWith(elem);
              break;
            }
          }
        }
      }
      if (activity.activityType == "http_request" || activity.activityType == "http_sink") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        if (found) {
          for (let i = 0; i < settings_div.children.length; i++) {
            if (settings_div.children[i].id == elem.id && settings_div.children[i] !== elem) {
              settings_div.children[i].replaceWith(elem);
              break;
            }
          }
        }
        if (target_activity && typeof target_activity._restore_saved_settings === "function") {
          target_activity._restore_saved_settings();
        }
        if (activity.activityType == "http_sink") {
          updateHttpSinkBodyPreview(operatorId);
        }
      }
      if (activity.activityType == "fill") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        if (found) {
          for (let i = 0; i < settings_div.children.length; i++) {
            if (settings_div.children[i].id == elem.id && settings_div.children[i] !== elem) {
              settings_div.children[i].replaceWith(elem);
              break;
            }
          }
        }
      }
      if (activity.activityType == "clean") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
      }
      if (activity.activityType == "dedupe") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
      }
      if (activity.activityType == "cast") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
      }
      if (activity.activityType == "regex") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
      }
      if (activity.activityType == "pivot") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
      }
      if (activity.activityType == "window") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
      }
      if (activity.activityType == "sheets_read") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
      }
      if (activity.activityType == "sheets_write") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
      }

      if (activity.activityType == "split") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
      }

      if (activity.activityType == "combine") {
        let target_activity = main_activities[operatorId];
        if (!target_activity) {
          target_activity = new Combine_Activity($flowchart, activity);
          main_activities[operatorId] = target_activity;
        }
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return true; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
      }

      if (activity.activityType == "select") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found && elem.children.length > 0) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
        // if (target_activity && typeof target_activity._sync_columns === "function") {
        //   const operator_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
        //   if (operator_activity && operator_activity.outputs && operator_activity.outputs.output) {
        //     $flowchart.flowchart('setinputVal', operatorId, 'input', operator_activity.outputs.output.value);
        //   }
          // target_activity._sync_columns(null, $flowchart, target_activity);
        // }
      }
      if (activity.activityType == "sort") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
          if (settings_div.children[i].id == elem.id + "_column_edit") {
            found = true;
            settings_div.children[i].style.display = "flex";
            settings_div.children[i].style.flexDirection = "column";
            settings_div.children[i].style.gap = "15px";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
      }
      if (activity.activityType == "append") {
        let target_activity = main_activities[operatorId];
        let elem = target_activity.settings;
        if (elem == null || elem == undefined) { return; }
        let found = false;
        for (let i = 0; i < settings_div.children.length; i++) {
          if (settings_div.children[i].id == elem.id) {
            found = true;
            settings_div.children[i].style.display = "block";
          }
        }
        if (!found) {
          settings_div.insertBefore(elem, settings_div.firstChild);
        }
      }

      applySavedSettingsToActivity(operatorId);
      function syncActivitySettings() {
        var target_activity = main_activities[operatorId];
        if (target_activity && typeof target_activity.get_operation_settings === "function") {
          target_activity.get_operation_settings();
        }
      }
      settings_div.oninput = syncActivitySettings;
      settings_div.onchange = function() {
        syncActivitySettings();
        schedulePipelineSave();
      };
      settings_div.onfocusout = function(event) {
        if (!event || !event.target) {
          return;
        }
        if (settings_div.contains(event.target)) {
          schedulePipelineSave();
        }
      };
      // update_missing_columns_message(operatorId, settings_div);
      return true;
    },
    onOperatorUnselect: function() {
      $operatorProperties.hide();
      $pipelineProperties.show();
      $selected_activity_settings.hide();
      $data_preview_settings.hide();
      setActivityTabsVisible(false);

      return true;
    },
    onLinkSelect: function(linkId) {
      $linkProperties.show();
      $linkColor.val($flowchart.flowchart("getLinkMainColor", linkId));
      return true;
    },
    onLinkUnselect: function() {
      $linkProperties.hide();
      return true;
    }
    ,onLinkCreate: function(linkId, linkData) {
      scheduleLinkAddRefresh();
      setTimeout(repositionSelectPlaceholders, 0);
      if (linkData && linkData.toConnector === "input_2") {
        var data = $flowchart.flowchart("getDataRef");
        var targetType = data?.operators?.[linkData.toOperator]?.internal?.properties?.activityType
          || data?.operators?.[linkData.toOperator]?.properties?.activityType;
        if (targetType === "join") {
          ensureRowGapFromOperator(linkData.fromOperator, selectStepOffset + 50);
        }
      }
      return true;
    }
    ,onAfterChange: function() {
      scheduleLinkAddRefresh();
      setTimeout(repositionSelectPlaceholders, 0);
      schedulePipelineSave();
    }
    ,onOperatorDelete: function(operatorId, forced) {
      var data = $flowchart.flowchart("getDataRef");
      var previousId = null;
      var nextId = null;
      var nextConnector = null;
      if (main_activities && main_activities[operatorId]) {
        delete main_activities[operatorId];
      }
      if (selectPlaceholders) {
        var placeholders = Array.from(selectPlaceholders.querySelectorAll(".select-placeholder.branch-placeholder"));
        placeholders.forEach(function(placeholder) {
          var fromId = placeholder.getAttribute("data-from-id");
          if (fromId && fromId.toString() === operatorId.toString()) {
            placeholder.remove();
          }
        });
      }
      if (data && data.links) {
        Object.keys(data.links).forEach(function(linkId) {
          var link = data.links[linkId];
          if (!link || !link.locked) {
            return;
          }
          if (link.toOperator == operatorId) {
            previousId = link.fromOperator;
          }
          if (link.fromOperator == operatorId) {
            nextId = link.toOperator;
            nextConnector = link.toConnector;
          }
        });
      }
      setTimeout(function() {
        if (previousId != null && nextId != null) {
          createAutoLinkWithConnector(previousId, nextId, nextConnector || resolveInputConnector($flowchart.flowchart("getOperatorActivity", nextId)));
          var prevEl = data?.operators?.[previousId]?.internal?.els?.operator;
          var nextEl = data?.operators?.[nextId]?.internal?.els?.operator;
          if (prevEl && prevEl.length && nextEl && nextEl.length && isSameRow(prevEl, nextEl)) {
            compactChainFrom(previousId);
          }
        }
        repositionImportPlaceholder();
        repositionSelectPlaceholders();
        scheduleLinkAddRefresh();
        schedulePipelineSave();
      }, 0);
      schedulePipelineSave();
      return true;
    }
    ,onLinkDelete: function(linkId, forced) {
      var data = $flowchart.flowchart("getDataRef");
      if (!data || !data.links || forced) {
        return true;
      }
      var link = data.links[linkId];
      if (link && link.locked) {
        return allowLockedLinkDelete;
      }
      setTimeout(repositionSelectPlaceholders, 0);
      schedulePipelineSave();
      return true;
    }
  });

  const $workspace = $("#flowchartworkspace");
  $workspace.addClass("flowchart-pan-ready");
  const $chartContainer = $("#chart_container");
  if ($chartContainer.length) {
    selectionBox = document.createElement("div");
    selectionBox.className = "flowchart-selection-box";
    selectionBox.style.display = "none";
    $chartContainer[0].appendChild(selectionBox);
  }

  function setZoom(nextZoom) {
    zoomLevel = Math.min(2, Math.max(0.5, nextZoom));
    applyPanZoom();
  }

  $("#zoomIn").on("click", function() {
    setZoom(zoomLevel + 0.1);
  });

  $("#zoomOut").on("click", function() {
    setZoom(zoomLevel - 0.1);
  });

  $("#zoomReset").on("click", function() {
    zoomLevel = 1;
    panOffset = { x: 0, y: 0 };
    applyPanZoom();
  });


  $workspace.on("mousedown", function(event) {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    if ($(event.target).closest(".flowchart-operator, .flowchart-link, .flowchart-operator-connector").length) {
      return;
    }
    if (event.shiftKey || event.button === 1) {
      isPanning = true;
      panStart = { x: event.clientX, y: event.clientY };
      panOrigin = { x: panOffset.x, y: panOffset.y };
      $workspace.addClass("flowchart-panning");
      return;
    }
    if (!selectionBox) {
      return;
    }
    isSelecting = true;
    selectionStart = { x: event.clientX, y: event.clientY };
    selectionBox.style.display = "block";
    selectionBox.style.left = "0px";
    selectionBox.style.top = "0px";
    selectionBox.style.width = "0px";
    selectionBox.style.height = "0px";
    $flowchart.flowchart("unselectOperator");
    $flowchart.flowchart("unselectLink");
    $flowchart.find(".flowchart-operator").removeClass("multi-selected");
  });

  $(document).on("mousemove", function(event) {
    if (!isPanning) {
      if (!isSelecting || !selectionBox || !$chartContainer.length) {
        return;
      }
      const containerRect = $chartContainer[0].getBoundingClientRect();
      const startX = selectionStart.x - containerRect.left;
      const startY = selectionStart.y - containerRect.top;
      const currentX = event.clientX - containerRect.left;
      const currentY = event.clientY - containerRect.top;
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      selectionBox.style.left = `${left}px`;
      selectionBox.style.top = `${top}px`;
      selectionBox.style.width = `${width}px`;
      selectionBox.style.height = `${height}px`;

      const selectionRect = {
        left: containerRect.left + left,
        top: containerRect.top + top,
        right: containerRect.left + left + width,
        bottom: containerRect.top + top + height
      };
      $flowchart.find(".flowchart-operator").each(function() {
        const rect = this.getBoundingClientRect();
        const intersects = !(rect.right < selectionRect.left ||
          rect.left > selectionRect.right ||
          rect.bottom < selectionRect.top ||
          rect.top > selectionRect.bottom);
        this.classList.toggle("multi-selected", intersects);
      });
      return;
    }
    panOffset.x = panOrigin.x + (event.clientX - panStart.x);
    panOffset.y = panOrigin.y + (event.clientY - panStart.y);
    applyPanZoom();
  });

  $(document).on("mouseup", function() {
    if (isPanning) {
      isPanning = false;
      $workspace.removeClass("flowchart-panning");
    }
    if (isSelecting) {
      isSelecting = false;
      if (selectionBox) {
        selectionBox.style.display = "none";
      }
    }
  });


  applyPanZoom();

  $operatorTitle.keyup(function() {
    var selectedOperatorId = $flowchart.flowchart("getSelectedOperatorId");
    if (selectedOperatorId != null) {
      $flowchart.flowchart("setOperatorTitle", selectedOperatorId, $operatorTitle.val());
    }
  });

  $operatorDescription.on("input", function() {
    var selectedOperatorId = $flowchart.flowchart("getSelectedOperatorId");
    if (selectedOperatorId != null) {
      updateOperatorDescription(selectedOperatorId, $operatorDescription.val());
    }
  });
  $operatorDescription.on("blur", function() {
    schedulePipelineSave();
  });

  $linkColor.change(function() {
    var selectedLinkId = $flowchart.flowchart("getSelectedLinkId");
    if (selectedLinkId != null) {
      $flowchart.flowchart("setLinkMainColor", selectedLinkId, $linkColor.val());
    }
  });

  $("html").keyup(function(e) {
    if (e.keyCode == 46) {
      $flowchart.flowchart("deleteSelected");
      schedulePipelineSave();
    }
  });

  $(".delete_selected_button").on("click", function() {
    $flowchart.flowchart("deleteSelected");
    schedulePipelineSave();
  });

  function resolvePreviewTargetId(buttonId) {
    const button = document.getElementById(buttonId);
    if (button && button.value) {
      return button.value;
    }
    const selectedId = $flowchart.flowchart("getSelectedOperatorId");
    if (selectedId != null) {
      return selectedId.toString();
    }
    return null;
  }

  $("#export_preview").on("click", async function() {
    const targetId = resolvePreviewTargetId(this.id);
    if (!targetId) {
      return;
    }
    let data = $flowchart.flowchart("getoutputVal", targetId, "output");
    data = jsonToCsv(data.values);
    const blob = new Blob([data], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "download.csv";
    a.click();
  });

  let running = false;
  function ensurePreviewContainer(activityId) {
    let activity_previews = document.getElementById("activity_previews");
    let data_preview_container = document.getElementById(activityId + "_data_preview");
    if (data_preview_container == null || data_preview_container == undefined) {
      data_preview_container = document.createElement("div");
      data_preview_container.id = activityId + "_data_preview";
      let table_responsive = document.createElement("div");
      let data_table_container = document.createElement("div");
      data_table_container.id = "data_table_container";
      table_responsive.className = "table-responsive";
      let t = document.createElement("table");
      t.id = activityId + "_data_table";
      data_table_container.appendChild(t);
      table_responsive.appendChild(data_table_container);
      data_preview_container.appendChild(table_responsive);
      activity_previews.appendChild(data_preview_container);
    }
    let filter_div = data_preview_container.querySelector(".filter-bar");
    if (!filter_div) {
      filter_div = document.createElement("div");
      filter_div.className = "filter-bar";
      data_preview_container.prepend(filter_div);
    }
    let filter_left = filter_div.querySelector(".filter-bar-left");
    if (!filter_left) {
      filter_left = document.createElement("div");
      filter_left.className = "filter-bar-left";
      filter_div.appendChild(filter_left);
    }
    let label = filter_left.querySelector("label");
    if (!label) {
      label = document.createElement("label");
      label.innerHTML = "Filter by column:";
      filter_left.appendChild(label);
    }
    let select = filter_left.querySelector("select");
    if (!select) {
      select = document.createElement("select");
      filter_left.appendChild(select);
    }
    select.id = activityId + "_columnSelect";
    let input = filter_left.querySelector("input");
    if (!input) {
      input = document.createElement("input");
      filter_left.appendChild(input);
    }
    input.id = activityId + "_filterInput";
    input.placeholder = "Enter filter text...";
    let actions_div = filter_div.querySelector(".preview-actions");
    if (!actions_div) {
      actions_div = document.createElement("div");
      actions_div.className = "preview-actions";
      actions_div.style.display = "flex";
      actions_div.style.gap = "10px";
      filter_div.appendChild(actions_div);
    }
    const refresh_button = document.getElementById("refresh_preview");
    if (refresh_button) {
      refresh_button.classList.add("export-button");
      refresh_button.style.background = "";
      actions_div.appendChild(refresh_button);
    }
    const export_button = document.getElementById("export_preview");
    if (export_button) {
      export_button.classList.add("export-button");
      actions_div.appendChild(export_button);
    }
    return data_preview_container;
  }

  $("#refresh_preview").on("click", async function() {
    const targetId = resolvePreviewTargetId(this.id);
    if (!targetId) {
      return;
    }
    // Prevent overlapping preview requests.
    if (running) { return; }
    let activity_previews = document.getElementById("activity_previews");
    let data_preview_container = ensurePreviewContainer(targetId);
    // Show a transient loading state while the ordered run completes.
    let loading_text = document.createElement("div");
    loading_text.className = "preview-loading";
    loading_text.innerHTML = '<span class="pill pill-running"><span class="dot"></span>Loading preview…</span>';
    activity_previews.prepend(loading_text);
    running = true;
    // Ask the server for dependency order, then run the ordered activities.
    let pipeline_data = await get_ordered_nodes($flowchart, [targetId.toString()]);
    let outputs = null;
    if (pipeline_data && Array.isArray(pipeline_data.ordered_nodes)) {
      const activities = build_ordered_activities_payload($flowchart, pipeline_data, targetId);
      const response = await post_ordered_activities(activities, true);

      if (response && Array.isArray(response.results)) {
        response.results.forEach(entry => {
          if (entry && entry.operatorId != null && entry.result) {
            console.log("Storing output for operator:", entry.operatorId, entry.result);
            $flowchart.flowchart("setoutputVal", entry.operatorId, "output", entry.result);
          }
        });
        response.results.forEach(entry => {
          if (!entry || entry.operatorId == null || !entry.result) {
            return;
          }
          const links = $flowchart.flowchart("getLinksFrom", entry.operatorId) || [];
          links.forEach(link => {
            if (!link || link.toOperator == null) {
              return;
            }
            const toOperator = $flowchart.flowchart("getOperatorActivity", link.toOperator);
            if (!toOperator) {
              return;
            }
            if (toOperator.activityType === "join" || toOperator.activityType === "append") {
              const fromOperator = $flowchart.flowchart("getOperatorActivity", entry.operatorId);
              if (link.toConnector === "input_1") {
                $flowchart.flowchart("setinputVal", link.toOperator, "input_1", fromOperator);
              } else if (link.toConnector === "input_2") {
                $flowchart.flowchart("setinputVal", link.toOperator, "input_2", fromOperator);
              }
            } else {
              $flowchart.flowchart("setinputVal", link.toOperator, "input", entry.result);
            }
          });
        });
        if (typeof main_activities === "object" && main_activities !== null) {
          Object.keys(main_activities).forEach(function(operatorId) {
            var activity = main_activities[operatorId];
            if (activity) {
              if ($flowchart.flowchart("doesOperatorExists", operatorId)) {
                activity.activity = $flowchart.flowchart("getOperatorActivity", operatorId);
                activity.activityId = operatorId;
              }
            }
          });
        }
        const target_result = response.results.find(entry => entry && entry.operatorId == targetId);
        outputs = target_result ? target_result.result : null;
      }
    }
    running = false;

    // Remove loading state and fall back to cached outputs if needed.
    activity_previews.removeChild(loading_text);
    if (!outputs) {
      outputs = $flowchart.flowchart("getoutputVal", targetId, "output");
    }
    const targetActivity = $flowchart.flowchart("getOperatorActivity", targetId);
    if (targetActivity && targetActivity.activityType === "http_sink") {
      updateHttpSinkBodyPreview(targetId);
    }
    // Render preview table for the selected activity output.
    if (outputs && outputs.values) {
      console.log("Using cached outputs for preview:", outputs);
      createTable(outputs.values, document.getElementById(targetId + "_data_table"), targetId);
    }
  });

  $("#run_pipeline").on("click", async function() {
    const button = this;
    const icon = button.querySelector(".run-icon");
    const label = button.querySelector("span");
    const triggerButton = document.getElementById("createTrigger");
    let monitorStarted = false;
    if (button.classList.contains("is-running")) {
      return;
    }
    let activites = $flowchart.flowchart("getOperators");
    if (!activites || Object.keys(activites).length === 0) {
      alert("Add at least one activity to the canvas before running.");
      return;
    }

    button.classList.add("is-running");
    button.setAttribute("aria-label", "Stop pipeline");
    if (label) label.textContent = "Running...";
    icon.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2"></rect>';
    if (triggerButton) {
      triggerButton.disabled = true;
      triggerButton.setAttribute("aria-disabled", "true");
    }
    try {
      let data = await get_ordered_nodes($flowchart);
      const activities = build_ordered_activities_payload($flowchart, data);
      const validation_errors = validate_pipeline_activities(activities);
      if (validation_errors.length > 0) {
        alert("Pipeline has an error. Check activity settings.")
        return
      }
      var pipelineName = ($("#pipeline_title").val() || "").trim();
      if (!pipelineName && pipeline_id) {
        pipelineName = getPipelineNameById(pipeline_id) || "";
      }
      await post_ordered_activities(activities, false, {
        pipeline_id: pipeline_id || "",
        pipeline_name: pipelineName || "Untitled Pipeline"
      })
      if (pipeline_id) {
        monitorStarted = true;
        startPipelineRunMonitor(pipeline_id, button, label, icon, triggerButton);
      }
    } catch (error) {
      console.error("Pipeline run failed:", error);
    } finally {
      if (!monitorStarted) {
        button.classList.remove("is-running");
        button.setAttribute("aria-label", "Run pipeline");
        if (label) label.textContent = "Run Flow";
        icon.innerHTML = '<path d="M8 5l11 7-11 7V5z"></path>';
        if (triggerButton) {
          triggerButton.disabled = false;
          triggerButton.removeAttribute("aria-disabled");
        }
      }
    }
  });

  let pipelineRunMonitor = null;
  async function fetchLatestPipelineRun(pipelineId) {
    if (!pipelineId) {
      return null;
    }
    const request = new Request("/etl/pipeline/runs?pipelineId=" + encodeURIComponent(pipelineId), {
      method: "GET",
      headers: new Headers({
        "Accept": "application/json"
      })
    });
    try {
      const response = await fetch(request);
      if (!response.ok) {
        return null;
      }
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.runs) || !payload.runs.length) {
        return null;
      }
      return payload.runs[payload.runs.length - 1];
    } catch (error) {
      return null;
    }
  }

  function resetRunButton(button, label, icon, triggerButton) {
    button.classList.remove("is-running");
    button.setAttribute("aria-label", "Run pipeline");
    if (label) label.textContent = "Run Flow";
    icon.innerHTML = '<path d="M8 5l11 7-11 7V5z"></path>';
    if (triggerButton) {
      triggerButton.disabled = false;
      triggerButton.removeAttribute("aria-disabled");
    }
  }

  function startPipelineRunMonitor(pipelineId, button, label, icon, triggerButton) {
    if (pipelineRunMonitor) {
      clearInterval(pipelineRunMonitor);
    }
    pipelineRunMonitor = setInterval(async () => {
      const latest = await fetchLatestPipelineRun(pipelineId);
      if (!latest || latest.status === "in progress") {
        return;
      }
      clearInterval(pipelineRunMonitor);
      pipelineRunMonitor = null;
      resetRunButton(button, label, icon, triggerButton);
    }, 3000);
  }

  (function initTriggerModal() {
    const triggerButton = document.getElementById("createTrigger");
    const modal = document.getElementById("triggerModal");
    if (!triggerButton || !modal) {
      return;
    }
    const closeTargets = modal.querySelectorAll("[data-trigger-close]");
    const recurrenceUnit = document.getElementById("trigger_recurrence_unit");
    const weekdays = document.getElementById("trigger_weekdays");
    const hours = document.getElementById("trigger_hours");
    const okButton = document.getElementById("triggerModalOk");

  function setPipelineField(mode) {
      var pipelineNameField = document.getElementById("trigger_pipeline_name");
      var pipelineSelect = document.getElementById("trigger_pipeline_select");
      var currentName = (modal.dataset.pipelineName || "").trim();
      if (!currentName) {
        currentName = ($("#pipeline_title").val() || "").trim();
      }
      if (!currentName && pipeline_id) {
        currentName = getPipelineNameById(pipeline_id);
      }
      if (!pipelineNameField || !pipelineSelect) {
        return;
      }
      if (mode === "select") {
        pipelineNameField.classList.add("trigger-field-hidden");
        pipelineSelect.classList.remove("trigger-field-hidden");
        pipelineSelect.innerHTML = "";
        cachedSavedPipelines.forEach(function(item) {
          var opt = document.createElement("option");
          opt.value = item.pipeline_id || "";
          opt.textContent = item.pipeline_name || "Untitled Pipeline";
          pipelineSelect.appendChild(opt);
        });
        if (pipeline_id) {
          pipelineSelect.value = pipeline_id;
        }
      } else {
        pipelineSelect.classList.add("trigger-field-hidden");
        pipelineNameField.classList.remove("trigger-field-hidden");
        pipelineNameField.value = currentName || "Untitled Pipeline";
      }
    }

    function openModal(mode) {
      modal.removeAttribute("inert");
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      setPipelineField(mode || "current");
      var firstField = document.getElementById("trigger_pipeline_name") ||
        document.getElementById("trigger_pipeline_select") ||
        document.getElementById("trigger_name");
      if (firstField && typeof firstField.focus === "function") {
        firstField.focus();
      }
    }

    function closeModal() {
      if (modal.contains(document.activeElement)) {
        triggerButton.focus();
      }
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      modal.setAttribute("inert", "");
      modal.dataset.triggerId = "";
      modal.dataset.pipelineName = "";
    }

    function updateWeekdays() {
      if (!recurrenceUnit || !weekdays) {
        return;
      }
      const unit = recurrenceUnit.value;
      const isWeekly = unit === "weekly";
      const showHours = unit === "weekly" || unit === "days";
      weekdays.classList.toggle("is-visible", isWeekly);
      weekdays.setAttribute("aria-hidden", isWeekly ? "false" : "true");
      if (hours) {
        hours.classList.toggle("is-visible", showHours);
        hours.classList.toggle("trigger-field-hidden", !showHours);
        hours.setAttribute("aria-hidden", showHours ? "false" : "true");
      }
    }

    function syncHourMinuteSelection(target) {
      if (!target || target.type !== "checkbox") {
        return;
      }
      var minuteSelect = target.closest("label") && target.closest("label").querySelector(".trigger-hour-minutes");
      if (!minuteSelect) {
        return;
      }
      if (target.checked) {
        minuteSelect.disabled = false;
        if (!minuteSelect.value) {
          minuteSelect.value = "00";
        }
      } else {
        minuteSelect.value = "00";
        minuteSelect.disabled = true;
      }
    }

    window.openTriggerModal = openModal;
    window.updateTriggerWeekdays = updateWeekdays;

    triggerButton.addEventListener("click", function() {
      if (activePipelineType !== "pipeline") {
        alert("Triggers are only available in the pipeline workspace.");
        return;
      }
      openModal("current");
    });
    closeTargets.forEach(function(target) {
      target.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function(event) {
      if (event.key === "Escape" && modal.classList.contains("is-open")) {
        closeModal();
      }
    });
    if (recurrenceUnit) {
      recurrenceUnit.addEventListener("change", updateWeekdays);
      updateWeekdays();
    }
    if (hours) {
      var minuteOptionsHtml = "";
      for (var i = 0; i < 60; i += 1) {
        var value = i < 10 ? "0" + i : String(i);
        minuteOptionsHtml += "<option value=\"" + value + "\">" + value + "</option>";
      }
      hours.querySelectorAll(".trigger-hour-minutes").forEach(function(select) {
        if (!select.options.length) {
          select.innerHTML = minuteOptionsHtml;
        }
        select.value = "00";
        select.disabled = true;
      });
      hours.querySelectorAll("input[type=\"checkbox\"]").forEach(function(input) {
        syncHourMinuteSelection(input);
      });
      hours.addEventListener("change", function(event) {
        syncHourMinuteSelection(event.target);
      });
    }

    if (okButton) {
      okButton.addEventListener("click", async function() {
        const nameField = document.getElementById("trigger_name");
        const startDateField = document.getElementById("trigger_start_date");
        const recurrenceValueField = document.getElementById("trigger_recurrence_value");
        const recurrenceUnitField = document.getElementById("trigger_recurrence_unit");
        const pipelineSelectField = document.getElementById("trigger_pipeline_select");
        const pipelineNameField = document.getElementById("trigger_pipeline_name");
        const hoursField = document.getElementById("trigger_hours");
        const nameValue = nameField ? nameField.value.trim() : "";
        const startDateValue = startDateField ? startDateField.value.trim() : "";
        const recurrenceValue = recurrenceValueField ? recurrenceValueField.value.trim() : "";
        const recurrenceUnit = recurrenceUnitField ? recurrenceUnitField.value.trim() : "";
        if (!nameValue || !startDateValue || !recurrenceValue || !recurrenceUnit) {
          alert("Please fill out Name, Start date, and Recurrence.");
          return;
        }
        if (Number(recurrenceValue) <= 0) {
          alert("Recurrence value must be greater than 0.");
          return;
        }
        var selectedHours = [];
        if ((recurrenceUnit === "weekly" || recurrenceUnit === "days") && hoursField) {
          selectedHours = Array.from(hoursField.querySelectorAll("input:checked")).map(function(input) {
            var hourValue = input.value;
            var minuteSelect = input.closest("label") && input.closest("label").querySelector(".trigger-hour-minutes");
            var minuteValue = minuteSelect && minuteSelect.value ? minuteSelect.value : "00";
            return hourValue + ":" + minuteValue;
          });
          if (!selectedHours.length) {
            alert("Please select at least one hour.");
            return;
          }
        }
        const googleIdSource = window.googleLoginProfile && (window.googleLoginProfile.google_id || window.googleLoginProfile.email)
          ? window.googleLoginProfile.google_id || window.googleLoginProfile.email
          : "unknown";
        const safeGoogleId = googleIdSource.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
        const existingTriggerId = modal.dataset.triggerId;
        const triggerId = existingTriggerId || ("triggers_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8));
        const selectedPipelineId = pipelineSelectField && !pipelineSelectField.classList.contains("trigger-field-hidden")
          ? pipelineSelectField.value
          : (pipeline_id || "");
        var recurrencePayload = {
          value: Number(recurrenceValue),
          unit: recurrenceUnit,
          hours: selectedHours
        };
        if (recurrenceUnit === "weekly") {
          recurrencePayload.days = Array.from(document.querySelectorAll("#trigger_weekdays input:checked")).map(function(input) {
            return input.value;
          });
        }
        const orderedData = await get_ordered_nodes($flowchart);
        const commandActivities = build_ordered_activities_payload($flowchart, orderedData);
        const payload = {
          google_id: safeGoogleId,
          trigger_id: triggerId,
          pipeline_id: selectedPipelineId,
          name: nameValue,
          description: (document.getElementById("trigger_description") || {}).value || "",
          start_date: startDateValue,
          command: commandActivities,
          recurrence: recurrencePayload
        };
        console.log("Trigger saved (placeholder).", payload);
        await post_trigger(safeGoogleId, triggerId, payload);
        await post_trigger_cron(payload);
        fetchTriggerList();
        const descriptionField = document.getElementById("trigger_description");
        if (nameField) nameField.value = "";
        if (descriptionField) descriptionField.value = "";
        if (startDateField) startDateField.value = "";
        if (recurrenceValueField) recurrenceValueField.value = "1";
        if (recurrenceUnitField) recurrenceUnitField.value = "minutes";
        if (pipelineSelectField) {
          pipelineSelectField.selectedIndex = 0;
        }
        if (hoursField) {
          hoursField.querySelectorAll("input:checked").forEach(function(input) {
            input.checked = false;
          });
          hoursField.querySelectorAll(".trigger-hour-minutes").forEach(function(select) {
            select.value = "00";
            select.disabled = true;
          });
        }
        document.querySelectorAll("#trigger_weekdays input:checked").forEach(function(input) {
          input.checked = false;
        });
        if (typeof updateWeekdays === "function") {
          updateWeekdays();
        }
        closeModal();
      });
    }
  })();

  $("#pipeline_title").on("blur", function() {
    schedulePipelineSave();
  });
  $("#pipeline_description").on("blur", function() {
    schedulePipelineSave();
  });

  $("#import_activity").on("click", function() {
    createIngestAtSlot("import");
  });

  if (importPlaceholder) {
    importPlaceholder.addEventListener("click", function() {
      if (!ingestMenu) {
        createIngestAtSlot("import");
        return;
      }
      ingestMenu.style.display = ingestMenu.style.display === "flex" ? "none" : "flex";
      ingestMenu.setAttribute("aria-hidden", ingestMenu.style.display === "none" ? "true" : "false");
      var slot = getImportSlotPosition();
      ingestMenu.style.left = slot.left + "px";
      ingestMenu.style.top = slot.top + "px";
    });
  }

  if (selectPlaceholders) {
    selectPlaceholders.addEventListener("click", function(event) {
      if (!placeholdersEnabled()) {
        return;
      }
      var target = event.target.closest(".select-placeholder");
      if (!target) {
        return;
      }
      activeChoosePlaceholder = target;
      activeInsertLink = null;
      if (!chooseMenu) {
        createSelectAtPlaceholder(target);
        return;
      }
      var left = parseInt(target.style.left || String(importBaseLeft), 10);
      var top = parseInt(target.style.top || String(importBaseTop), 10);
      openChooseMenuAt(left + 10, top + 60);
    });
  }

  if (linkAddLayer) {
    linkAddLayer.addEventListener("click", function(event) {
      var target = event.target.closest(".link-add-button");
      if (!target) {
        return;
      }
      var linkId = target.getAttribute("data-link-id");
      if (!linkId) {
        return;
      }
      activeInsertLink = {
        linkId: linkId,
        fromId: target.getAttribute("data-from-id"),
        toId: target.getAttribute("data-to-id"),
        mode: null
      };
      activeChoosePlaceholder = null;
      var left = parseInt(target.style.left || "0", 10);
      var top = parseInt(target.style.top || "0", 10);
      openChooseMenuAt(left + 10, top + 34);
    });
  }

  if (ingestMenu) {
    ingestMenu.addEventListener("click", function(event) {
      var button = event.target.closest("button[data-ingest]");
      if (!button) {
        return;
      }
      var type = button.getAttribute("data-ingest");
      createIngestAtSlot(type);
      ingestMenu.style.display = "none";
      ingestMenu.setAttribute("aria-hidden", "true");
    });
  }

  if (chooseMenuList) {
    var iconMap = {
      select: '<svg viewBox="0 0 24 24"><path d="M5 6h10M5 12h10M5 18h10"/><path d="M18 6l1.5 1.5L22 5"/></svg>',
      filter: '<svg viewBox="0 0 24 24"><path d="M3 5h18l-7 8v5l-4 2v-7z"/></svg>',
      sort: '<svg viewBox="0 0 24 24"><path d="M7 4v16M7 4l-3 3M7 4l3 3"/><path d="M17 20V4M17 20l-3-3M17 20l3-3"/></svg>',
      join: '<svg viewBox="0 0 24 24"><path d="M7 7h4v4H7zM13 13h4v4h-4z"/><path d="M11 9l2 2"/></svg>',
      aggregate: '<svg viewBox="0 0 24 24"><path d="M4 18h4M10 14h4M16 10h4"/></svg>',
      custom: '<svg viewBox="0 0 24 24"><path d="M4 16l6-6 4 4 6-6"/></svg>',
      replace: '<svg viewBox="0 0 24 24"><path d="M4 18h6l8-8-6-6-8 8z"/><path d="M14 6l4 4"/></svg>',
      fill: '<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M6 12h12"/><path d="M9 17h6"/></svg>',
      clean: '<svg viewBox="0 0 24 24"><path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/></svg>',
      dedupe: '<svg viewBox="0 0 24 24"><path d="M7 7h10v10H7z"/><path d="M4 4h10v10H4z"/></svg>',
      cast: '<svg viewBox="0 0 24 24"><path d="M4 6h16"/><path d="M8 12h8"/><path d="M10 18h4"/></svg>',
      regex: '<svg viewBox="0 0 24 24"><path d="M5 7h14"/><path d="M7 12h10"/><path d="M9 17h6"/></svg>',
      pivot: '<svg viewBox="0 0 24 24"><path d="M5 5h6v6H5z"/><path d="M13 5h6v6h-6z"/><path d="M5 13h6v6H5z"/></svg>',
      window: '<svg viewBox="0 0 24 24"><path d="M4 6h16"/><path d="M6 12h12"/><path d="M8 18h8"/></svg>',
      split: '<svg viewBox="0 0 24 24"><path d="M4 6l8 8M4 18l8-8"/><path d="M14 6h6M14 18h6"/></svg>',
      combine: '<svg viewBox="0 0 24 24"><path d="M4 7h6v4H4zM14 13h6v4h-6z"/><path d="M10 9l4 4"/></svg>',
      append: '<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
      flatten: '<svg viewBox="0 0 24 24"><path d="M4 7h10M4 12h16M4 17h12"/><path d="M16 6l3 3-3 3"/></svg>',
      sheets_write: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h6"/></svg>',
      http_sink: '<svg viewBox="0 0 24 24"><path d="M4 12h16"/><path d="M14 6l6 6-6 6"/></svg>'
    };
    var newRowButton = document.createElement("button");
    newRowButton.type = "button";
    newRowButton.className = "create_operator buttons";
    newRowButton.setAttribute("data-action", "new-row");
    newRowButton.innerHTML =
      '<span class="activity-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>' +
      "</span>" +
      "Add as new flow";
    chooseMenuList.appendChild(newRowButton);
    var options = [
      { type: "select", label: "Select" },
      { type: "filter", label: "Filter" },
      { type: "sort", label: "Sort" },
      { type: "join", label: "Join" },
      { type: "aggregate", label: "Aggregate" },
      { type: "custom", label: "Custom" },
      { type: "replace", label: "Replace" },
      { type: "fill", label: "Fill" },
      { type: "clean", label: "Trim/Clean" },
      { type: "dedupe", label: "Dedupe" },
      { type: "cast", label: "Type Cast" },
      { type: "regex", label: "Regex Extract" },
      { type: "pivot", label: "Pivot/Unpivot" },
      { type: "window", label: "Window/Rank" },
      { type: "split", label: "Split" },
      { type: "combine", label: "Combine" },
      { type: "append", label: "Append" },
      { type: "flatten", label: "Flatten" }
    ];
    var sinkOptions = [
      { type: "sheets_write", label: "Google Sheets (Write)" },
      { type: "http_sink", label: "HTTP Request (Post)" }
    ];
    options.forEach(function(option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "create_operator buttons";
      button.setAttribute("data-activity", option.type);
      button.innerHTML =
        '<span class="activity-icon" aria-hidden="true">' +
        (iconMap[option.type] || "") +
        "</span>" +
        option.label;
      chooseMenuList.appendChild(button);
    });
    if (sinkOptions.length) {
      var sinkHeader = document.createElement("div");
      sinkHeader.className = "activity-group-label";
      sinkHeader.setAttribute("data-group", "sink");
      sinkHeader.textContent = "Sink";
      chooseMenuList.appendChild(sinkHeader);
      sinkOptions.forEach(function(option) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "create_operator buttons";
        button.setAttribute("data-activity", option.type);
        button.setAttribute("data-group", "sink");
        button.innerHTML =
          '<span class="activity-icon" aria-hidden="true">' +
          (iconMap[option.type] || "") +
          "</span>" +
          option.label;
        chooseMenuList.appendChild(button);
      });
    }
  }

  if (chooseMenuList) {
    chooseMenuList.addEventListener("click", function(event) {
      var button = event.target.closest("button[data-activity]");
      var actionButton = event.target.closest("button[data-action=\"new-row\"]");
      if (actionButton && activeInsertLink) {
        createBranchPlaceholder(activeInsertLink);
        chooseMenu.style.display = "none";
        chooseMenu.setAttribute("aria-hidden", "true");
        if (chooseMenuSearch) {
          chooseMenuSearch.value = "";
        }
        var resetButtons = chooseMenuList.querySelectorAll("button[data-activity], button[data-action=\"new-row\"]");
        resetButtons.forEach(function(item) {
          item.style.display = "";
          item.classList.remove("is-active");
        });
        activeChoosePlaceholder = null;
        activeInsertLink = null;
        return;
      }
      if (!button || (!activeChoosePlaceholder && !activeInsertLink)) {
        return;
      }
      var type = button.getAttribute("data-activity");
      if (activeInsertLink) {
        createActivityBetween(type, activeInsertLink);
      } else {
        createActivityAtPlaceholder(type, activeChoosePlaceholder);
      }
      chooseMenu.style.display = "none";
      chooseMenu.setAttribute("aria-hidden", "true");
      if (chooseMenuSearch) {
        chooseMenuSearch.value = "";
      }
      var buttons = chooseMenuList.querySelectorAll("button[data-activity], button[data-action=\"new-row\"]");
      buttons.forEach(function(item) {
        item.style.display = "";
        item.classList.remove("is-active");
      });
      activeChoosePlaceholder = null;
      activeInsertLink = null;
    });
  }

  if (chooseMenuSearch) {
    chooseMenuSearch.addEventListener("input", function(event) {
      var query = (event.target.value || "").toLowerCase();
      var buttons = chooseMenuList ? chooseMenuList.querySelectorAll("button[data-activity], button[data-action=\"new-row\"]") : [];
      buttons.forEach(function(button) {
        if (button.getAttribute("data-action") === "new-row") {
          button.style.display = activeInsertLink ? "" : "none";
          return;
        }
        var label = (button.textContent || "").toLowerCase();
        if (button.getAttribute("data-activity") === "sheets_write" || button.getAttribute("data-activity") === "http_sink") {
          var data = $flowchart.flowchart("getDataRef");
          var link = data && data.links ? data.links[activeInsertLink?.linkId] : null;
          var fromId = activeInsertLink?.fromId || link?.fromOperator;
          var toId = activeInsertLink?.toId || link?.toOperator;
          if (activeInsertLink && (isSinkOperator(fromId) || isSinkOperator(toId))) {
            button.style.display = "none";
            return;
          }
        }
        button.style.display = label.indexOf(query) !== -1 ? "" : "none";
      });
      if (chooseMenuList) {
        var sinkHeader = chooseMenuList.querySelector(".activity-group-label[data-group=\"sink\"]");
        if (sinkHeader) {
          var sinkButtons = chooseMenuList.querySelectorAll("button[data-group=\"sink\"]");
          var anyVisible = false;
          sinkButtons.forEach(function(button) {
            if (button.style.display !== "none") {
              anyVisible = true;
            }
          });
          sinkHeader.style.display = anyVisible ? "" : "none";
        }
      }
    });
  }

  document.addEventListener("click", function(event) {
    if (ingestMenu && importPlaceholder) {
      if (event.target !== importPlaceholder && !importPlaceholder.contains(event.target) && !ingestMenu.contains(event.target)) {
        ingestMenu.style.display = "none";
        ingestMenu.setAttribute("aria-hidden", "true");
      }
    }
    if (chooseMenu && activeChoosePlaceholder) {
      if (!chooseMenu.contains(event.target) && !event.target.closest(".select-placeholder")) {
        chooseMenu.style.display = "none";
        chooseMenu.setAttribute("aria-hidden", "true");
        activeChoosePlaceholder = null;
      }
    }
    if (chooseMenu && activeInsertLink) {
      if (!chooseMenu.contains(event.target) && !event.target.closest(".link-add-button")) {
        chooseMenu.style.display = "none";
        chooseMenu.setAttribute("aria-hidden", "true");
        activeInsertLink = null;
      }
    }
  });

  function createSelectAtFallback() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Select",
        dependencies: [],
        settings: { "datatypes": [], "drop": [], "select": [] },
        activityType: "select",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let select_activity = new Select_Activity($flowchart, new_activity);
    main_activities[operatorId] = select_activity;
    activites = $flowchart.flowchart("getOperators");
  }

  $("#select_activity").on("click", function() {
    var ingestId = getLatestIngestId();
    if (ingestId && selectPlaceholders) {
      var placeholder = ensureSelectPlaceholder(ingestId);
      createSelectAtPlaceholder(placeholder);
      return;
    }
    createSelectAtFallback();
  });

  $("#sort_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Sort",
        activityType: "sort",
        dependencies: [],
        settings: { "datatypes": [], "drop": [], "select": [] },
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let sort_activity = new Sort_Activity($flowchart, new_activity);
    main_activities[operatorId] = sort_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#join_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Join",
        activityType: "join",
        dependencies: [],

        inputs: {
          input_1: {
            label: "Table 1",
            value: null
          },
          input_2: {
            label: "Table 2",
            value: null
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: null

          }
        }
      }
    };

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let join_activity = new Join_Activity($flowchart, new_activity);
    main_activities[operatorId] = join_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#aggregate_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Aggregate",
        activityType: "group",
        dependencies: [],
        settings: { "datatypes": [], "drop": [], "select": [] },
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let group_activity = new Group_Activity($flowchart, new_activity);
    main_activities[operatorId] = group_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#custom_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Custom",
        dependencies: [],

        settings: { "datatypes": [], "drop": [], "select": [] },
        activityType: "custom",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let custom_activity = new Custom_Activity($flowchart, new_activity);
    main_activities[operatorId] = custom_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#replace_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Replace",
        dependencies: [],

        settings: { "datatypes": [], "drop": [], "select": [] },
        activityType: "replace",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let replace_activity = new Replace_Activity($flowchart, new_activity);
    main_activities[operatorId] = replace_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#fill_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Fill",
        dependencies: [],

        activityType: "fill",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let fill_activity = new Fill_Activity($flowchart, new_activity);
    main_activities[operatorId] = fill_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#clean_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Trim/Clean",
        dependencies: [],

        activityType: "clean",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let clean_activity = new Clean_Activity($flowchart, new_activity);
    main_activities[operatorId] = clean_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#dedupe_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Dedupe",
        dependencies: [],

        activityType: "dedupe",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let dedupe_activity = new Dedupe_Activity($flowchart, new_activity);
    main_activities[operatorId] = dedupe_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#cast_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Type Cast",
        dependencies: [],

        activityType: "cast",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let cast_activity = new Cast_Activity($flowchart, new_activity);
    main_activities[operatorId] = cast_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#regex_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Regex Extract",
        dependencies: [],

        activityType: "regex",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let regex_activity = new Regex_Activity($flowchart, new_activity);
    main_activities[operatorId] = regex_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#pivot_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Pivot/Unpivot",
        dependencies: [],

        activityType: "pivot",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let pivot_activity = new Pivot_Activity($flowchart, new_activity);
    main_activities[operatorId] = pivot_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#window_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Window/Rank",
        dependencies: [],

        activityType: "window",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let window_activity = new Window_Activity($flowchart, new_activity);
    main_activities[operatorId] = window_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#flatten_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Flatten",
        dependencies: [],
        activityType: "flatten",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let flatten_activity = new Flatten_Activity($flowchart, new_activity);
    main_activities[operatorId] = flatten_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#filter_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Filter",
        dependencies: [],

        activityType: "filter",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let filter_activity = new Filter_Activity($flowchart, new_activity);
    main_activities[operatorId] = filter_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#split_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Split",
        dependencies: [],

        settings: { "datatypes": [], "drop": [], "select": [] },
        activityType: "split",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let split_activity = new Split_Activity($flowchart, new_activity);
    main_activities[operatorId] = split_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#combine_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Combine",
        dependencies: [],
        settings: {},
        activityType: "combine",
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let combine_activity = new Combine_Activity($flowchart, new_activity);
    main_activities[operatorId] = combine_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#sheets_read_activity").on("click", function() {
    createIngestAtSlot("sheets_read");
  });

  $("#http_request_activity").on("click", function() {
    createIngestAtSlot("http_request");
  });

  $("#sheets_write_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Google Sheets (Write)",
        activityType: "sheets_write",
        dependencies: [],
        settings: {},
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "",
            value: null
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let sheets_activity = new GoogleSheets_Activity($flowchart, new_activity);
    main_activities[operatorId] = sheets_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#http_sink_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "HTTP Request (Post)",
        activityType: "http_sink",
        dependencies: [],
        settings: {},
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "",
            value: null
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let http_activity = new Http_Sink_Activity($flowchart, new_activity);
    main_activities[operatorId] = http_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#append_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Append",
        activityType: "append",
        dependencies: [],
        inputs: {
          input_1: {
            label: "Table 1",
            value: null
          },
          input_2: {
            label: "Table 2",
            value: null
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: null
          }
        }
      }
    };

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let append_activity = new Append_Activity($flowchart, new_activity);
    main_activities[operatorId] = append_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#dataflow_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Dataflow",
        activityType: "dataflow",
        dependencies: [],
        settings: {},
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let dataflow_activity = new DataFlow_Activity($flowchart, new_activity);
    main_activities[operatorId] = dataflow_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#pipeline_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Pipeline",
        activityType: "pipeline",
        dependencies: [],
        settings: {},
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let pipeline_activity = new Pipeline_Activity($flowchart, new_activity);
    main_activities[operatorId] = pipeline_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#stream_activity").on("click", function() {
    var operatorId = reserveNextOperatorId();
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Stream",
        activityType: "stream",
        dependencies: [],
        settings: {},
        inputs: {
          input: {
            label: "Input",
            value: { "datatypes": null, "values": null }
          }
        },
        outputs: {
          output: {
            label: "Output",
            value: { "datatypes": null, "values": null }
          }
        }
      }
    };
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let stream_activity = new Stream_Activity($flowchart, new_activity);
    main_activities[operatorId] = stream_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  var $draggableOperators = $(".draggable_operator");
  $draggableOperators.draggable({
    cursor: "move",
    opacity: 0.7,
    appendTo: "body",
    zIndex: 1000,

    helper: function(e) {
      var $this = $(this);
      var data = getOperatorData($this);
      return $flowchart.flowchart("getOperatorElement", data);
    },
    stop: function(e, ui) {
      var $this = $(this);
      var elOffset = ui.offset;
      var containerOffset = $container.offset();
      if (elOffset.left > containerOffset.left &&
        elOffset.top > containerOffset.top &&
        elOffset.left < containerOffset.left + $container.width() &&
        elOffset.top < containerOffset.top + $container.height()) {

        var flowchartOffset = $flowchart.offset();

        var relativeLeft = elOffset.left - flowchartOffset.left;
        var relativeTop = elOffset.top - flowchartOffset.top;

        var positionRatio = $flowchart.flowchart("getPositionRatio");
        relativeLeft /= positionRatio;
        relativeTop /= positionRatio;

        var data = getOperatorData($this);
        data.left = relativeLeft;
        data.top = relativeTop;

        $flowchart.flowchart("addOperator", data);
      }
    }
  });

  var pipelineSaveTimer = null;
  function schedulePipelineSave() {
    if (window.streamAutoFetchActive) {
      return;
    }
    if (suspendPipelineSave) {
      return;
    }
    if (pipelineSaveTimer) {
      clearTimeout(pipelineSaveTimer);
    }
    pipelineSaveTimer = setTimeout(function() {
      Flow2Text(1);
    }, 50);
  }
  window.flowchartSchedulePipelineSave = schedulePipelineSave;

  function sanitizePipelinePayload(data) {
    if (!data || typeof data !== "object") {
      return data;
    }
    var payload = JSON.parse(JSON.stringify(data));

    function wipePortValues(portGroup) {
      if (!portGroup || typeof portGroup !== "object") {
        return;
      }
      Object.keys(portGroup).forEach(function(key) {
        var port = portGroup[key];
        if (port && typeof port === "object" && Object.prototype.hasOwnProperty.call(port, "value")) {
          port.value = null;
        }
      });
    }

    function wipePorts(container) {
      if (!container || typeof container !== "object") {
        return;
      }
      wipePortValues(container.inputs);
      wipePortValues(container.outputs);
    }

    function wipeLinkDetails(details) {
      if (!Array.isArray(details)) {
        return;
      }
      details.forEach(function(detail) {
        if (!detail || typeof detail !== "object") {
          return;
        }
        wipePortValues(detail.inputs);
        wipePortValues(detail.outputs);
      });
    }

    var activities = payload.activities || payload.operators;
    if (activities && typeof activities === "object") {
      Object.keys(activities).forEach(function(operatorId) {
        var operator = activities[operatorId];
        if (!operator || typeof operator !== "object") {
          return;
        }
        wipePorts(operator);
        if (operator.properties) {
          wipePorts(operator.properties);
          wipeLinkDetails(operator.properties.link_to_details);
          wipeLinkDetails(operator.properties.link_from_details);
        }
        wipeLinkDetails(operator.link_to_details);
        wipeLinkDetails(operator.link_from_details);
      });
    }

    return payload;
  }

  function Flow2Text(retryCount) {
    var data = null;
    try {
      var operators = $flowchart.flowchart("getOperators") || {};
      Object.keys(operators).forEach(function(operatorId) {
        $flowchart.flowchart("getOperatorActivity", operatorId);
      });
      if (typeof main_activities === "object" && main_activities !== null) {
        Object.keys(main_activities).forEach(function(key) {
          var activity = main_activities[key];
          if (!activity || typeof activity.get_operation_settings !== "function") {
            return;
          }
          var element = document.getElementById(activity.activityId);
          if (!element) {
            return;
          }
          activity.get_operation_settings();
        });
      }
      data = $flowchart.flowchart("getData", pipeline_id || "local");
    } catch (error) {
      if (retryCount && retryCount < 3) {
        setTimeout(function() {
          Flow2Text(retryCount + 1);
        }, 100);
      }
      return;
    }
    var googleId = "unknown";
    if (window.googleLoginProfile && (window.googleLoginProfile.google_id || window.googleLoginProfile.email)) {
      googleId = window.googleLoginProfile.google_id || window.googleLoginProfile.email;
    }
    var safeGoogleId = googleId.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
    if (!safeGoogleId) {
      safeGoogleId = "unknown";
    }
    if (!pipeline_id) {
      setCurrentPipelineId(generatePipelineId());
    }
    var pipelineName = ($("#pipeline_title").val() || "pipeline").trim();
    if (!pipelineName) {
      pipelineName = "pipeline";
    }
    var payload = sanitizePipelinePayload(data || {});
    payload.pipeline_name = pipelineName;
    payload.description = ($("#pipeline_description").val() || "").trim();
    payload.pipeline_id = pipeline_id;
    payload.google_id = safeGoogleId;
    post_pipeline(safeGoogleId, pipeline_id, payload);
    if (activePipelineType === "pipeline") {
      fetchSavedPipelineList();
    } else {
      fetchPipelineList();
    }
  }
  $("#get_data").click(Flow2Text);

  function Text2Flow() {
    var raw = $("#flowchart_data").val();
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) {
      console.warn("Text2Flow: invalid JSON", e);
      return;
    }
    $flowchart.flowchart("setData", data);
  }
  $("#set_data").click(Text2Flow);

  function SaveToLocalStorage() {
    if (typeof localStorage !== "object") {
      alert("local storage not available");
      return;
    }
    Flow2Text();
    var raw = $("#flowchart_data").val();
    if (raw) localStorage.setItem("stgLocalFlowChart", raw);
  }
  $("#save_local").click(SaveToLocalStorage);

  function LoadFromLocalStorage() {
    let raw = sessionStorage.getItem("user_json");
    if (!raw) return;
    let user;
    try { user = JSON.parse(raw); } catch (e) { return; }
    if (!user || !user.pipelines || !user.pipelines.values) return;
    let pipelines = user["pipelines"]["values"];
    if (!pipelines.length) return;
    let activities = pipelines[0]["activities"];
    let links = normalizeLinkOperatorIds(pipelines[0]["links"]);
    Object.keys(activities).forEach(operatorId => {
      let operatorData = activities[operatorId];
      $flowchart.flowchart("createOperator", operatorId, operatorData);
      let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
      let a;
      if (operatorData.properties.activityType == "import") {
        a = new Import_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "flatten") {
        a = new Flatten_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "http_request") {
        a = new Http_Request_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "http_sink") {
        a = new Http_Sink_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "filter") {
        a = new Filter_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "group") {
        a = new Group_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "join") {
        a = new Join_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "custom") {
        a = new Custom_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "replace") {
        a = new Replace_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "fill") {
        a = new Fill_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "clean") {
        a = new Clean_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "dedupe") {
        a = new Dedupe_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "cast") {
        a = new Cast_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "regex") {
        a = new Regex_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "pivot") {
        a = new Pivot_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "window") {
        a = new Window_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "split") {
        a = new Split_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "sheets_read") {
        a = new GoogleSheets_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "sheets_write") {
        a = new GoogleSheets_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "select") {
        a = new Select_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "sort") {
        a = new Sort_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "append") {
        a = new Append_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "dataflow") {
        a = new DataFlow_Activity($flowchart, new_activity);
      }
      if (operatorData.properties.activityType == "stream") {
        a = new Stream_Activity($flowchart, new_activity);
      }

      main_activities[operatorId] = a;
      activites = $flowchart.flowchart("getOperators");
    });

    $flowchart.flowchart("setData", {
      activities: activities,
      links: links || {}
    });
    setOperatorIndexFromActivities(activities);
  }
  $("#load_local").click(LoadFromLocalStorage);

  repositionImportPlaceholder();
  repositionSelectPlaceholders();
  scheduleLinkAddRefresh();

});

function build_ordered_activities_payload(flowchart, data, targetId){
  if (!data || !Array.isArray(data.ordered_nodes)) {
    return []
  }
  const selected_id = flowchart.flowchart("getSelectedOperatorId")
  return data.ordered_nodes.map(node => {
    const operatorId = node.tableName
    const activity = flowchart.flowchart("getOperatorActivity", operatorId)
    const main_activity = main_activities[operatorId]
    let settings = activity ? activity.settings : null
    const should_refresh = (selected_id != null && selected_id.toString() === operatorId.toString())
      || (targetId != null && targetId.toString() === operatorId.toString())
    if (main_activity && should_refresh) {
      settings = main_activity.get_operation_settings()
    }
    let activity_data = null
    if (activity.activityType == "import" || activity.activityType == "sheets_read" || activity.activityType == "http_request") {
      activity_data = activity?.inputs?.input?.value?.values ?? activity?.outputs?.output?.value?.values ?? null
    } else if (activity.activityType == "join" || activity.activityType == "append") {
      const table_1 = activity?.inputs?.input_1?.value?.outputs?.output?.value?.values ?? null
      const table_2 = activity?.inputs?.input_2?.value?.outputs?.output?.value?.values ?? null
      if (table_1 && table_2) {
        activity_data = { table_1: table_1, table_2: table_2 }
      }
    }
    let dependencies = Array.isArray(node.dependencies)
      ? node.dependencies.map(dep => dep.toString())
      : get_dependency_ids(activity)
    return {
      operatorId: operatorId,
      activityType: activity.activityType,
      settings: settings,
      data: activity_data,
      dependencies: dependencies
    }
  })
}

function getHttpRequestSettingsFromActivity(activity) {
  if (!activity) {
    return null;
  }
  const settings = activity.settings || activity.operations || {};
  if (Array.isArray(settings.call) && settings.call.length) {
    return settings.call[0];
  }
  if (settings.call && typeof settings.call === "object") {
    return settings.call;
  }
  return settings || null;
}

function isBlobStorageUrl(url) {
  return typeof url === "string" && url.indexOf("/blob-storage/") !== -1;
}

window.getHttpRequestSettingsFromActivity = getHttpRequestSettingsFromActivity;
window.isBlobStorageUrl = isBlobStorageUrl;

function get_dependency_ids(activity){
  const raw = Array.isArray(activity?.dependencies) ? activity.dependencies : []
  let slot1 = null
  let slot2 = null
  const rest = []
  raw.forEach(dep => {
    if (dep === null || dep === undefined) {
      return
    }
    const dep_id = dep && dep.operatorId !== undefined ? dep.operatorId : dep
    const connector = dep && dep.connector ? dep.connector : null
    if (connector === "input_1") {
      slot1 = dep_id
      return
    }
    if (connector === "input_2") {
      slot2 = dep_id
      return
    }
    rest.push(dep_id)
  })
  const ordered = []
  if (slot1 !== null) {
    ordered.push(slot1)
  }
  if (slot2 !== null) {
    ordered.push(slot2)
  }
  rest.forEach(dep_id => {
    if (!ordered.includes(dep_id)) {
      ordered.push(dep_id)
    }
  })
  return ordered.map(dep => dep.toString())
}

function get_input_columns(values){
  if (!values) {
    return []
  }
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return []
    }
    return Object.keys(values[0] || {})
  }
  if (typeof values === "object") {
    return Object.keys(values)
  }
  return []
}

function collect_missing_columns(activity, settings){
  if (!activity || !settings) {
    return []
  }
  const missing = new Set()
  const input_columns = get_input_columns(activity?.inputs?.input?.value?.values)
  const input_columns_1 = get_input_columns(activity?.inputs?.input_1?.value?.outputs?.output?.value?.values)
  const input_columns_2 = get_input_columns(activity?.inputs?.input_2?.value?.outputs?.output?.value?.values)

  const check_column = (name, columns) => {
    if (!name || !columns || columns.length === 0) {
      return
    }
    if (!columns.includes(name)) {
      missing.add(name)
    }
  }

  if (Array.isArray(settings.select)) {
    settings.select.forEach(item => check_column(item.column_name, input_columns))
  }
  if (Array.isArray(settings.where)) {
    settings.where.forEach(item => check_column(item.columnName, input_columns))
  }
  if (Array.isArray(settings.replace)) {
    settings.replace.forEach(item => {
      check_column(item.columnName_1, input_columns)
      check_column(item.columnName_2, input_columns)
    })
  }
  if (Array.isArray(settings.split)) {
    settings.split.forEach(item => check_column(item.columnName, input_columns))
  }
  if (Array.isArray(settings.group)) {
    settings.group.forEach(item => {
      if (Array.isArray(item.columnName)) {
        item.columnName.forEach(name => check_column(name, input_columns))
      }
      check_column(item.value, input_columns)
    })
  }
  if (Array.isArray(settings.sort)) {
    settings.sort.forEach(item => check_column(item.columnName, input_columns))
  }
  if (Array.isArray(settings.custom)) {
    settings.custom.forEach(item => check_column(item.columnName, input_columns))
  }
  if (Array.isArray(settings.combine)) {
    settings.combine.forEach(item => {
      check_column(item.columnName_1, input_columns)
      check_column(item.columnName_2, input_columns)
    })
  }
  if (Array.isArray(settings.join)) {
    settings.join.forEach(item => {
      check_column(item.columnName_1, input_columns_1)
      check_column(item.columnName_2, input_columns_2)
    })
  }
  return Array.from(missing)
}

function update_missing_columns_message(operatorId, settings_div){
  if (!settings_div) {
    return
  }
  const activity = $flowchart.flowchart("getOperatorActivity", operatorId)
  const settings = activity ? activity.settings : null
  const missing = collect_missing_columns(activity, settings)
  const message_id = operatorId + "_missing_columns"
  let message = document.getElementById(message_id)
  if (missing.length === 0) {
    if (message) {
      message.remove()
    }
    return
  }
  if (!message) {
    message = document.createElement("div")
    message.id = message_id
    message.style.color = "red"
    message.style.fontWeight = "600"
    message.style.marginBottom = "8px"
    settings_div.insertBefore(message, settings_div.firstChild)
  }
  message.textContent = "This column no longer exists: " + missing.join(", ")
}

function validate_pipeline_activities(activities){
  if (!Array.isArray(activities)) {
    return []
  }
  const errors = []
  activities.forEach(activity_payload => {
    const operatorId = activity_payload.operatorId
    const activity = $flowchart.flowchart("getOperatorActivity", operatorId)
    const missing = collect_missing_columns(activity, activity_payload.settings)
    if (missing.length > 0) {
      errors.push({ operatorId: operatorId, missing: missing })
    }
  })
  return errors
}


var defaultFlowchartData = {
  operators: {
    operator1: {
      top: 20,
      left: 20,
      properties: {
        title: "Operator 1",
        inputs: {},
        outputs: {
          output_1: {
            label: "Output 1",
          }
        }
      }
    },
    operator2: {
      top: 80,
      left: 300,
      properties: {
        title: "Operator 2",
        inputs: {
          input_1: {
            label: "Input 1",
          },
          input_2: {
            label: "Input 2",
          },
        },
        outputs: {}
      }
    },
  },
  links: {
    link_1: {
      fromOperator: "operator1",
      fromConnector: "output_1",
      toOperator: "operator2",
      toConnector: "input_2",
    },
  }
};
if (false) console.log("remove lint unused warning", defaultFlowchartData);

const footer = document.getElementById("footer");
const handle = document.getElementById("resizeHandle");

let isResizing = false;
let startY, startHeight;

handle.addEventListener("mousedown", e => {
  isResizing = true;

  startY = e.clientY;
  startHeight = parseInt(window.getComputedStyle(footer).height, 10);
  document.body.style.userSelect = "none";
});

document.addEventListener("mousemove", e => {
  if (!isResizing) return;
  const dy = startY - e.clientY;
  footer.style.height = `${startHeight + dy}px`;
  if (window.applyFlowchartPanZoom) {
    window.applyFlowchartPanZoom();
  }
});

document.addEventListener("mouseup", () => {
  isResizing = false;
  document.body.style.userSelect = "";
  if (window.applyFlowchartPanZoom) {
    window.applyFlowchartPanZoom();
  }
});
