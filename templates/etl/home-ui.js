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

  toggleButtons.forEach(function(button) {
    if (button) {
      button.addEventListener("click", toggleSidebar);
    }
  });

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
        td.textContent = item[key];
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
  };

  const headerRow = document.createElement("tr");
  const columns = Object.keys(jsonArray[0]);
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

  let limit = 100;
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
  }
  window.applyFlowchartPanZoom = applyPanZoom;

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
        console.log("Target activity for select", activity);
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
        //   target_activity._sync_columns(null, $flowchart, target_activity);
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

      update_missing_columns_message(operatorId, settings_div);
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
  });

  const $workspace = $("#flowchartworkspace");
  $workspace.addClass("flowchart-pan-ready");

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
    if ($(event.target).closest(".flowchart-operator, .flowchart-link, .flowchart-operator-connector").length) {
      return;
    }
    isPanning = true;
    panStart = { x: event.clientX, y: event.clientY };
    panOrigin = { x: panOffset.x, y: panOffset.y };
    $workspace.addClass("flowchart-panning");
  });

  $(document).on("mousemove", function(event) {
    if (!isPanning) {
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
    if (running) { return; }
    let activity_previews = document.getElementById("activity_previews");
    let data_preview_container = ensurePreviewContainer(targetId);
    let loading_text = document.createElement("h1");
    loading_text.textContent = "Loading...";
    loading_text.style.color = "black";
    activity_previews.prepend(loading_text);
    running = true;
    let pipeline_data = await run_pipeline($flowchart, [targetId.toString()]);
    let outputs = null;
    if (pipeline_data && Array.isArray(pipeline_data.ordered_nodes)) {
      const activities = build_ordered_activities_payload($flowchart, pipeline_data, targetId);
      const response = await post_ordered_activities(activities);
      if (response && Array.isArray(response.results)) {
        response.results.forEach(entry => {
          if (entry && entry.operatorId != null && entry.result) {
            $flowchart.flowchart("setoutputVal", entry.operatorId, "output", entry.result);
          }
        });
        const target_result = response.results.find(entry => entry && entry.operatorId == targetId);
        outputs = target_result ? target_result.result : null;
      }
    }
    running = false;

    activity_previews.removeChild(loading_text);
    if (!outputs) {
      outputs = $flowchart.flowchart("getoutputVal", targetId, "output");
    }
    if (outputs && outputs.values) {
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
      let data = await run_pipeline($flowchart);
      console.log("ORDERED", data)
      const activities = build_ordered_activities_payload($flowchart, data);
      console.log("ACTIVITIES", activities)
      const validation_errors = validate_pipeline_activities(activities);
      if (validation_errors.length > 0) {
        alert("Pipeline has an error. Check activity settings.")
        return
      }
      await post_ordered_activities(activities)


    } else {
      button.setAttribute("aria-label", "Run pipeline");
      icon.innerHTML = '<path d="M8 5l11 7-11 7V5z"></path>';
    }
  });

  var operatorI = 0;
  $("#import_activity").on("click", function() {
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorId = operatorI;
    var operatorData = {
      operatorId: operatorId,
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Import Data",
        fileType: null,
        settings: null,
        dependencies: [],
        activityType: "import",
        activityId: operatorId,
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
    let import_activity = new Import_Activity($flowchart, new_activity);
    main_activities[operatorId] = import_activity;
    activites = $flowchart.flowchart("getOperators");
  });

  $("#select_activity").on("click", function() {
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
    let split_activity = new Select_Activity($flowchart, new_activity);
    main_activities[operatorId] = split_activity;
    activites = $flowchart.flowchart("getOperators");
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

  $("#flatten_activity").on("click", function() {
    var operatorId = "created_operator_flat" + operatorI;
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
    var operatorId = operatorI;
    const footer = document.getElementById("footer");
    startHeight = parseInt(window.getComputedStyle(footer).height, 10);
    var operatorData = {
      top: ($flowchart.height() / 2) - (startHeight / 2),
      left: ($flowchart.width() / 2) - 100 + (operatorI * 10),
      properties: {
        title: "Google Sheets (Read)",
        activityType: "sheets_read",
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
    operatorI++;
    $flowchart.flowchart("createOperator", operatorId, operatorData);
    let new_activity = $flowchart.flowchart("getOperatorActivity", operatorId);
    let sheets_activity = new GoogleSheets_Activity($flowchart, new_activity);
    main_activities[operatorId] = sheets_activity;
    activites = $flowchart.flowchart("getOperators");
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
    if (activity.activityType == "import" || activity.activityType == "sheets_read") {
      activity_data = activity?.inputs?.input?.value?.values ?? activity?.outputs?.output?.value?.values ?? null
    }
    return {
      operatorId: operatorId,
      activityType: activity.activityType,
      settings: settings,
      data: activity_data
    }
  })
}

async function post_ordered_activities(activities){
  if (!Array.isArray(activities) || activities.length === 0) {
    return null
  }
  const body = { activities: activities }
  const request = new Request('/etl/run/', {
    method: 'POST',
    headers: new Headers({
      'Accept': 'application/json'
    }),
    body: JSON.stringify(body)
  })
  const response = await fetch(request)
  if (response.ok){
    try{
      return await response.json()
    }catch(error){
      return null
    }
  }
  return null
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
