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
      activityGroups.forEach(function(group) {
        group.open = shouldOpenAll;
      });
      syncGroupToggle();
    });
  }

  activityGroups.forEach(function(group) {
    group.addEventListener("toggle", syncGroupToggle);
  });

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
    });
  }

  syncGroupToggle();
  syncSidebarToggle();
});

document.addEventListener("mousemove", function(event) {
  // console.log('Mouse X:', event.clientX, 'Mouse Y:', event.clientY);
});

let pipeline_id;
async function post_pipeline(userId, body) {
  var request = new Request("/blob-storage/bronze/etl/pipeline?userId=" + userId, {
    method: "POST",
    headers: new Headers({
      "Accept": "application/json"
    }),
    body: JSON.stringify(body)
  });

  fetch(request);
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
  const activity = $flowchart && $flowchart.flowchart
    ? $flowchart.flowchart("getOperatorActivity", activityId)
    : null;
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
  table.classList.add("table-resizable");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const sortState = { key: null, direction: "asc" };

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
        let value = item[key];
        if (key.indexOf(".") !== -1) {
          const parts = key.split(".");
          value = item;
          for (let i = 0; i < parts.length; i++) {
            if (value == null) {
              break;
            }
            value = value[parts[i]];
          }
        }
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
  };

  const headerRow = document.createElement("tr");
  const columns = [];
  Object.keys(jsonArray[0]).forEach(key => {
    const value = jsonArray[0][key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.keys(value).forEach(child => {
        columns.push(key + "." + child);
      });
    } else {
      columns.push(key);
    }
  });
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
        const aVal = a[key];
        const bVal = b[key];
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

  if (!columnSelect.options.length) {
    columns.forEach(col => {
      const opt = document.createElement("option");
      opt.value = col;
      opt.textContent = col;
      columnSelect.appendChild(opt);
    });
  }

  if (!filterInput.dataset.bound) {
    filterInput.addEventListener("input", () => {
      const column = columnSelect.value;
      const filterText = filterInput.value.toLowerCase();

      const filteredData = jsonArray.filter(item =>
        String(item[column]).toLowerCase().includes(filterText)
      );

      createTable(filteredData, tableContainer, activityId);
    });
    filterInput.dataset.bound = true;
  }
}

function areArraysEqual(arr1, arr2) {
  return arr1.length === arr2.length && new Set(arr1).size === new Set(arr2).size && arr1.every(item => arr2.includes(item));
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
    if (linkAddRefreshTimer) {
      clearTimeout(linkAddRefreshTimer);
    }
    linkAddRefreshTimer = setTimeout(refreshLinkAddButtons, 0);
  }

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
        if (hideSink && item.getAttribute("data-activity") === "sheets_write") {
          item.style.display = "none";
          return;
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
    if (!selectPlaceholders) {
      return;
    }
    var operators = $flowchart.flowchart("getOperators") || {};
    var lastNode = getLastNodeForIngest(ingestId);
    var baseOperator = operators[lastNode] || operators[ingestId];
    var activityType = baseOperator?.internal?.properties?.activityType || baseOperator?.properties?.activityType;
    if (activityType === "sheets_write") {
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

  function isSinkOperator(operatorId) {
    if (operatorId == null) {
      return false;
    }
    var operators = $flowchart.flowchart("getOperators") || {};
    var operator = operators[operatorId];
    var activityType = operator?.internal?.properties?.activityType || operator?.properties?.activityType;
    return activityType === "sheets_write";
  }

  function createIngestAtSlot(activityType) {
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorId = operatorI;
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
    operatorI++;
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
    var operatorId = operatorI;
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
    operatorI++;
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
        var operatorId = operatorI;
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
        operatorI++;
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
    var beforeId = operatorI;
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
      sheets_write: "#sheets_write_activity"
    };
    var selector = buttonMap[activityType];
    if (selector) {
      var btn = document.querySelector(selector);
      if (btn) {
        btn.click();
      }
    }
    var newId = operatorI - 1;
    if (newId >= beforeId) {
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
    if (!importPlaceholder || !delta) {
      return;
    }
    var currentTop = parseInt(importPlaceholder.style.top || String(importBaseTop), 10);
    importPlaceholder.style.top = (currentTop + delta) + "px";
  }

  function createBranchPlaceholder(linkContext) {
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
    if (!selectPlaceholders || fromId == null) {
      return;
    }
    var data = $flowchart.flowchart("getDataRef");
    var operator = data?.operators?.[fromId];
    var activityType = operator?.internal?.properties?.activityType || operator?.properties?.activityType;
    if (activityType === "sheets_write") {
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
    if (selectPlaceholders) {
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
    var operatorId = operatorI;
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
    operatorI++;
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
    var beforeId = operatorI;
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
      sheets_write: "#sheets_write_activity"
    };
    var selector = buttonMap[activityType];
    if (selector) {
      var btn = document.querySelector(selector);
      if (btn) {
        btn.click();
      }
    }
    var newId = operatorI - 1;
    if (newId >= beforeId) {
      positionOperator(newId, slot);
      return newId;
    }
    return null;
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
    let description = body.querySelector(".flowchart-operator-description");
    if (!description) {
      description = document.createElement("div");
      description.className = "flowchart-operator-description";
      body.prepend(description);
    }
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
      flowchartData.operators[operatorId].properties.description = descriptionText;
      if (flowchartData.operators[operatorId].internal) {
        flowchartData.operators[operatorId].internal.properties.description = descriptionText;
      }
    }
  }

  function setActivityTabsVisible(isVisible) {
    if (isVisible) {
      $tabSettings.show();
      $tabDataPreview.show();
    } else {
      $tabSettings.hide();
      $tabDataPreview.hide();
      $tabGeneral.trigger("click");
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
        activity.description ||
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
      }
      if (activity.activityType == "http_request") {
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
        if (!target_activity) { return; }
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
    }
    ,onOperatorDelete: function(operatorId, forced) {
      var data = $flowchart.flowchart("getDataRef");
      var previousId = null;
      var nextId = null;
      var nextConnector = null;
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
      }, 0);
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

  $linkColor.change(function() {
    var selectedLinkId = $flowchart.flowchart("getSelectedLinkId");
    if (selectedLinkId != null) {
      $flowchart.flowchart("setLinkMainColor", selectedLinkId, $linkColor.val());
    }
  });

  $("html").keyup(function(e) {
    if (e.keyCode == 46) {
      $flowchart.flowchart("deleteSelected");
    }
  });

  $(".delete_selected_button").on("click", function() {
    $flowchart.flowchart("deleteSelected");
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
      refresh_button.style.background = "linear-gradient(135deg, #111827 0%, #4b5563 100%)";
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
    let loading_text = document.createElement("h1");
    loading_text.textContent = "Loading...";
    loading_text.style.color = "#ffffff";
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
    // Render preview table for the selected activity output.
    if (outputs && outputs.values) {
      console.log("Using cached outputs for preview:", outputs);
      createTable(outputs.values, document.getElementById(targetId + "_data_table"), targetId);
    }
  });

  $("#run_pipeline").on("click", async function() {
    const button = this;
    const icon = button.querySelector(".run-icon");
    button.classList.toggle("is-running");
    if (button.classList.contains("is-running")) {
      button.setAttribute("aria-label", "Stop pipeline");
      icon.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2"></rect>';
      let activites = $flowchart.flowchart("getOperators");
      console.log(activites)
      let data = await get_ordered_nodes($flowchart);
      console.log("ORDERED", data)
      const activities = build_ordered_activities_payload($flowchart, data);
      console.log("ACTIVITIES", activities)
      const validation_errors = validate_pipeline_activities(activities);
      if (validation_errors.length > 0) {
        alert("Pipeline has an error. Check activity settings.")
        return
      }
      await post_ordered_activities(activities, false)


    } else {
      button.setAttribute("aria-label", "Run pipeline");
      icon.innerHTML = '<path d="M8 5l11 7-11 7V5z"></path>';
    }
  });

  var operatorI = 0;
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
      sheets_write: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h6"/></svg>'
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
      { type: "sheets_write", label: "Google Sheets (Write)" }
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
        if (button.getAttribute("data-activity") === "sheets_write") {
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
    var operatorId = operatorI;
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
    operatorI++;
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
    var operatorId = operatorI;
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
    operatorI++;
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let sort_activity = new Sort_Activity($flowchart, new_activity);
    main_activities[operatorId] = sort_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#join_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let join_activity = new Join_Activity($flowchart, new_activity);
    main_activities[operatorId] = join_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#aggregate_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let group_activity = new Group_Activity($flowchart, new_activity);
    main_activities[operatorId] = group_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#custom_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let custom_activity = new Custom_Activity($flowchart, new_activity);
    main_activities[operatorId] = custom_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#replace_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let replace_activity = new Replace_Activity($flowchart, new_activity);
    main_activities[operatorId] = replace_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#fill_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let fill_activity = new Fill_Activity($flowchart, new_activity);
    main_activities[operatorId] = fill_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#clean_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let clean_activity = new Clean_Activity($flowchart, new_activity);
    main_activities[operatorId] = clean_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#dedupe_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let dedupe_activity = new Dedupe_Activity($flowchart, new_activity);
    main_activities[operatorId] = dedupe_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#cast_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let cast_activity = new Cast_Activity($flowchart, new_activity);
    main_activities[operatorId] = cast_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#regex_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let regex_activity = new Regex_Activity($flowchart, new_activity);
    main_activities[operatorId] = regex_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#pivot_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let pivot_activity = new Pivot_Activity($flowchart, new_activity);
    main_activities[operatorId] = pivot_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#window_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let window_activity = new Window_Activity($flowchart, new_activity);
    main_activities[operatorId] = window_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#flatten_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let flatten_activity = new Flatten_Activity($flowchart, new_activity);
    main_activities[operatorId] = flatten_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#filter_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let filter_activity = new Filter_Activity($flowchart, new_activity);
    main_activities[operatorId] = filter_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#split_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let split_activity = new Split_Activity($flowchart, new_activity);
    main_activities[operatorId] = split_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#combine_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;
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
    var operatorId = operatorI;
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
    operatorI++;
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let sheets_activity = new GoogleSheets_Activity($flowchart, new_activity);
    main_activities[operatorId] = sheets_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#append_activity").on("click", function() {
    var operatorId = operatorI;
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
    operatorI++;

    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let append_activity = new Append_Activity($flowchart, new_activity);
    main_activities[operatorId] = append_activity;
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

  function Flow2Text() {
    var data = $flowchart.flowchart("getData", pipeline_id);
    let userId = sessionStorage.getItem("userId");
    data = { "values": [data] };
    post_pipeline(userId, data);
  }
  $("#get_data").click(Flow2Text);

  function Text2Flow() {
    var data = JSON.parse($("#flowchart_data").val());
    $flowchart.flowchart("setData", data);
  }
  $("#set_data").click(Text2Flow);

  function SaveToLocalStorage() {
    if (typeof localStorage !== "object") {
      alert("local storage not available");
      return;
    }
    Flow2Text();
    localStorage.setItem("stgLocalFlowChart", $("#flowchart_data").val());
  }
  $("#save_local").click(SaveToLocalStorage);

  function LoadFromLocalStorage() {
    let user = sessionStorage.getItem("user_json");
    user = JSON.parse(user);
    let pipelines = user["pipelines"]["values"];
    let activities = pipelines[0]["activities"];
    let links = pipelines[0]["links"];
    let Ids = [];
    Object.keys(activities).forEach(operatorId => {
      let operatorData = activities[operatorId];
      Ids.push(parseInt(operatorId));
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

      main_activities[operatorId] = a;
      activites = $flowchart.flowchart("getOperators");
    });

    $flowchart.flowchart("setData", pipelines[0]);
    const maxVal = Math.max(...Ids);
    operatorI = maxVal + 1;
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
    return {
      operatorId: operatorId,
      activityType: activity.activityType,
      settings: settings,
      data: activity_data
    }
  })
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
