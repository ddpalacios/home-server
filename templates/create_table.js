
  
  function createTable(jsonArray,tableContainer) {
    tableContainer.innerHTML = ""; // Clear previous table
    if (!jsonArray.length) {
      tableContainer.textContent = "No data matches your filter.";
      return;
    }


    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    // Header
    const headerRow = document.createElement("tr");
    columns.forEach(key => {
      const th = document.createElement("th");
      th.textContent = key;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Rows
    jsonArray.forEach(item => {
      const row = document.createElement("tr");
      columns.forEach(key => {
        const td = document.createElement("td");
        td.textContent = item[key];
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    tableContainer.appendChild(table);
  }

