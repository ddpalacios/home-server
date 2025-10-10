  let data = [
  {
    "originalColumnName": "rt",
    "columnName": "Route",
    "description": "Unique route identifier assigned to each bus line.",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': true
  },
  {
    "originalColumnName": "stpnm",
    "columnName": "Stop_Name",
    "description": "Name of the bus stop or location.",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': true


  },
  {
    "originalColumnName": "vehical_lat",
    "columnName": "Bus_Latitude",
    "description": "Latitude coordinate of the actual bus.",
    "dataType": "FLOAT",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': true

  },
  {
    "originalColumnName": "vehical_lon",
    "columnName": "Bus_Longitude",
    "description": "Longitude coordinate of the actual bus.",
    "dataType": "FLOAT",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': true

  },
  {
    "originalColumnName": "stpid",
    "columnName": "Stop_ID",
    "description": "Unique stop identifier used by the CTA system.",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': true

  },
  {
    "originalColumnName": "rtdir",
    "columnName": "Direction",
    "description": "Direction of the route (e.g., Northbound, Southbound).",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': true

  },
  {
    "originalColumnName": "prdtm",
    "columnName": "Predicted_Time",
    "description": "Date & Time of bus arrival to the stop",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': true

  },
  {
    "originalColumnName": "prdctdn",
    "columnName": "Predicted_ArrivesIn",
    "description": "Date & Time of bus arrival in minutes to stop",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': true

  },
  {
    "originalColumnName": "dly",
    "columnName": "Bus_IsDelayed",
    "description": "True/False if bus is delayed to arrive at station",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': true

  }
  ,
  {
    "originalColumnName": "tmstmp",
    "columnName": "Sync_TimeStamp",
    "description": "Synchronized time stamp with CTA",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  }
  ,
  {
    "originalColumnName": "typ",
    "columnName": "Type",
    "description": "Vehical code type",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  }
   ,
  {
    "originalColumnName": "vid",
    "columnName": "Vehical ID",
    "description": "Vehical Identifier",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  }
  ,
  {
    "originalColumnName": "dstp",
    "columnName": "DistanceStop",
    "description": "Linear Distance (feet) left to be traveled",
    "dataType": "INT",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  }
   ,
  {
    "originalColumnName": "rtdd",
    "columnName": "Route Language",
    "description": "Language Specific route designator",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  }
    ,
  {
    "originalColumnName": "des",
    "columnName": "Destination",
    "description": "target destiniation of vehical",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': true

  }
   ,
  {
    "originalColumnName": "tablockid",
    "columnName": "Tab Lock ID",
    "description": "Scheduled Block Identifer for work currently being performed by the vehical",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  }
   ,
  {
    "originalColumnName": "tatripid",
    "columnName": "TA_Trip_Identifier",
    "description": " TA's version of the scheduled trip identifier for the vehicle's current trip. ",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  },
  {
    "originalColumnName": "origtatripno",
    "columnName": "TA_Original_Trip_Identifier",
    "description": " Trip ID defined by the TA scheduling system",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  } , {
    "originalColumnName": "dyn",
    "columnName": "Dynamic_Action",
    "description": "The dynamic action type affecting this prediction",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  }
  , {
    "originalColumnName": "zone",
    "columnName": "Zone",
    "description": "The zone name if the vehicle has entered a defined zones, otherwise blank. ",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  }  , {
    "originalColumnName": "psgld",
    "columnName": "Passenger_Load",
    "description": " String representing the ratio of the current passenger count to the vehicle's total capacity",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  }
   , {
    "originalColumnName": "stst",
    "columnName": "Scehduled_Start",
    "description": " Contains the time (in seconds past midnight) of the scheduled start of the trip.",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  }  , {
    "originalColumnName": "stsd",
    "columnName": "Formatted_Scehduled_Start",
    "description": " Contains the date (in “yyyy-mm-dd” format) of the scheduled start of the trip. ",
    "dataType": "STRING",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  }
  , {
    "originalColumnName": "flagstop",
    "columnName": "Flag_Stop",
    "description": "An integer code representing the flagstop information for the prediction. ",
    "dataType": "INT",
    "source": "CTA",
    "database": "ctabustracker",
    "tableName": "CTA_BusPrediction",
    "originalTableName": "getpredictions"
    ,'isIncluded': false

  }
  
  
]
//   let tableContainer = document.getElementById("table-container-columndefinitions");
//   let columnSelect = document.getElementById("columnSelect-columndefinitions");
//   let filterInput = document.getElementById("filterInput-columndefinitions");



//   filterInput.addEventListener("input", () => {
//       const column = columnSelect.value;
//       const filterText = filterInput.value.toLowerCase();
//         console.log( filterInput.value)

//       const filteredData = data.filter(item =>
//         String(item[column]).toLowerCase().includes(filterText)
//       );
//       createTable(filteredData,tableContainer);
//     });

//   let columns = Object.keys(data[0]);
//   columns.forEach(col => {
//       const option = document.createElement("option");
//       option.value = col;
//       option.textContent = col;
//       columnSelect.appendChild(option);
//   });
//   createTable(data,tableContainer)


//      data =[{
//     'originalTableName': "ttpositions.aspx",
//     'tableName': 'CTA_TrainPosition',
//     'source': "CTA",
//     'unrollBy': "route",
//     'database': "lapi.transitchicago",
//     'api_version': "1.0",
//     'description': "Real-time train positions and status information."
// },
// {
//     "originalTableName": "getroutes",
//     "tableName": "CTA_BusRoute",
//     'source': "CTA",
//     'unrollBy': 'routes',
//     'database': "ctabustracker",
//     'api_version': "v3",
//     'description': "List of all CTA bus routes with route details."
// },
// {
//     "originalTableName": "getpatterns",
//     "tableName": "CTA_BusPatterns",
//     'source': "CTA",
//     'unrollBy': 'ptr',
//     'database': "ctabustracker",
//     'api_version': "v3",
//     'description': "Bus route patterns and stop sequences."
// },
// {
//     "originalTableName": "getvehicles",
//     "tableName": "CTA_BusVehicle",
//     'source': "CTA",
//     'unrollBy': 'vehicle',
//     'database': "ctabustracker",
//     'api_version': "v3",
//     'description': "Current locations and status of CTA buses."
// },
// {
//     "originalTableName": "getpredictions",
//     "tableName": "CTA_BusPrediction",
//     'source': "CTA",
//     'unrollBy': 'prd',
//     'database': "ctabustracker",
//     'api_version': "v3",
//     'description': "Predicted arrival times for CTA buses at stops."
// }]



 tableContainer = document.getElementById("table-container-definitions");
   columnSelect = document.getElementById("columnSelect-definitions");
   filterInput = document.getElementById("filterInput-definitions");



  filterInput.addEventListener("input", () => {
      const column = columnSelect.value;
      const filterText = filterInput.value.toLowerCase();
      const filteredData = data.filter(item =>
        String(item[column]).toLowerCase().includes(filterText)
      );
      createTable(filteredData,tableContainer);
    });

   columns = Object.keys(data[0]);
  columns.forEach(col => {
      const option = document.createElement("option");
      option.value = col;
      option.textContent = col;
      columnSelect.appendChild(option);
  });
  createTable(data,tableContainer)