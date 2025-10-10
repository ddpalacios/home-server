const stops = document.getElementById("stops");
const stopNameInput = document.getElementById("stopName")
const busRouteInput = document.getElementById("busRoute");
const directionInput = document.getElementById("direction");
const datalist = document.getElementById("routes");   
var rtclr = null;
var websocket = null;
live_interval_id = null;
let socketId= null
   
var map = L.map('map', {zoomControl: false}).setView([41.881832, -87.623177], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
maxZoom: 22,
attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
var markerGroup = L.layerGroup();
var pLineGroup = L.layerGroup()
var liveTrainMarkerGroup = L.layerGroup();
var markergroups = []
var stopMarkerGroup = L.layerGroup();
var selectedMarkerGroup = L.layerGroup();
markergroups.push(stopMarkerGroup)
markergroups.push(selectedMarkerGroup)
markergroups.push(liveTrainMarkerGroup)

function start_session(onstartmesg, sendTo){
        websocket = new Websocket_Session();
        websocket.initialize()
        
        websocket.session.onmessage = async (event) => {
                let data = JSON.parse(event.data)
                console.log("Message From Server:",data)
                if (data['request'] == 'new_connection'){
                  socketId = data['value']
                  websocket.send_payload(onstartmesg,sendTo, socketId)
                }else{
                  handle_payload(data)
                  document.getElementById('bronzejsonContainer').innerHTML = prettyPrintJson(data['values']['prd']['bronze']);
                  document.getElementById('silverjsonContainer').innerHTML = prettyPrintJson(data['values']['prd']['silver']);
                  document.getElementById('goldjsonContainer').innerHTML = prettyPrintJson(data['values']['prd']['gold']);

                //   document.querySelectorAll('.json-box').forEach(box => {
                //   box.addEventListener('click', () => box.classList.toggle('expanded'));
                // });
                }
        }
    }

function draw_bus_icon(vinfo, stop_pred){
       let vlat = vinfo['lat']
       let vlon = vinfo['lon']
       let popup_html = `
        <div style="font-family: 'Segoe UI', sans-serif; min-width: 200px;">
          <h3 style="margin: 0; font-size: 16px; color: #00704a;">
            Bus ${vinfo['vid']} - Route ${vinfo['rt']}
          </h3>
          <p style="margin: 4px 0; font-size: 14px;">
            <strong>Direction:</strong> ${stop_pred['rtdir'] || 'Unknown'}
          </p>
          <p style="margin: 4px 0; font-size: 14px;">
            <strong>Destination:</strong> ${vinfo['des'] || stop_pred['des'] || 'N/A'}
          </p>
          <p style="margin: 4px 0; font-size: 14px;">
            <strong>Next Stop:</strong> ${stop_pred['stpnm'] || 'N/A'}
          </p>
          <p style="margin: 4px 0; font-size: 14px;">
            <strong>Arrival:</strong> ${stop_pred['prdtm'] || '—'}
          </p>
          <p style="margin: 6px 0 0; font-size: 43px; color: red;">
            <em>
              ${stop_pred['prdctdn'] 
                ? (stop_pred['prdctdn'] === 'DUE' ? '1 min away' : `${stop_pred['prdctdn']} min away`) 
                : ''}
            </em>
          </p>

        </div>
      `;

        var busIcon = L.divIcon({
        className: 'bus-icon',
        html: `
            <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="purple">
            <path d="M4 16c0 1.1.9 2 2 2v1.5c0 .8.7 1.5 1.5 1.5S9 20.3 9 19.5V18h6v1.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V18c1.1 0 2-.9 2-2V6c0-2-2-4-8-4s-8 2-8 4v10zm2-7h12v5H6V9zm0-3h12v2H6V6z"/>
            </svg>
        `,
        iconSize: [56, 56],
        iconAnchor: [28, 28]
        });


      let marker = L.marker([vlat, vlon], { icon: busIcon })
      var popup = L.popup()
      .setContent(popup_html);

      marker.bindPopup(popup).openPopup();
          marker.on('mouseover', function (e) {
          this.openPopup();
      });
      marker.on('mouseout', function (e) {
          this.closePopup();
      });

      liveTrainMarkerGroup.addLayer(marker);
      liveTrainMarkerGroup.addTo(map);

    }



function prettyPrintJson(obj) {
        let json = JSON.stringify(obj, null, 2);
        json = json
            .replace(/&/g, '&amp;') 
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|\b\d+\b)/g, match => {
            let color = '#ce9178';
            if (/^"/.test(match)) {
                color = /:$/.test(match) ? '#9cdcfe' : '#ce9178';
            } else if (/true|false/.test(match)) {
                color = '#569cd6';
            } else if (/null/.test(match)) {
                color = '#569cd6';
            } else if (/^[0-9]+$/.test(match)) {
                color = '#b5cea8';
            }
            return `<span style="color:${color}">${match}</span>`;
            });
            return json
}

function handle_payload(payload){
      if (!payload.hasOwnProperty("values")){
        console.log("Values not found")
        return
      }
      let values = payload['values']
      if (values.hasOwnProperty("prd")){
        let predictions = values['prd']
        if (predictions.hasOwnProperty("Stop_Predictions")){
          let stop_predictions = predictions['Stop_Predictions']
       
          if (predictions.hasOwnProperty("Vehicle_Predictions")){
            let vehicle_predictions = predictions['Vehicle_Predictions']
            liveTrainMarkerGroup.clearLayers()
            let busEst = []
            vehicle_predictions.forEach(element => {
              stop_predictions.forEach(stp => {
                if (stp['vid'] == element['vid']){
                  let est = stp['prdctdn']
                  if (est == 'DUE'){
                    est = 1 
                  }else{
                    est = parseInt(est)
                  }
                  busEst.push(est)
                  draw_bus_icon(element, stp)
                }
              });
            });
            bustEst = busEst.sort((a, b) => a - b);
            console.log(busEst)
            console.log("Next Bus Arrival Time:", busEst[0], "min away")
            document.getElementById("next_arrival").innerHTML =busEst[0] + " min away"
            document.getElementById('total_inservice').innerHTML = busEst.length

          }
        }
      }
    }


function draw_route_line(target_routes, rtcolor){
      let latLngs = []
      liveTrainMarkerGroup.clearLayers()
      markerGroup.clearLayers();
      selectedMarkerGroup.clearLayers();
      
      target_routes.forEach(r => {
          let cords = [r['lat'], r['lon']]
          latLngs.push(cords)
          console.log(r)
          popup_html = `
            <div style="font-family: 'Segoe UI', sans-serif; min-width: 180px;">
              <h3 style="margin: 0 0 6px 0; font-size: 16px; color: ${r['rtclr'] || '#004e64'};">
                Route ${r['rt'] || 'N/A'}
              </h3>
              <p style="margin: 2px 0; font-size: 14px;">
                <strong>Stop:</strong> ${r['stpnm'] || 'Unknown Stop'}
              </p>
              <p style="margin: 2px 0; font-size: 14px;">
                <strong>Direction:</strong> ${r['rtdir'] || 'Unknown'}
              </p>
              <p style="margin: 2px 0; font-size: 13px; color: #555;">
                <strong>Stop ID:</strong> ${r['stpid'] || 'N/A'}
              </p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 6px 0;">
              <p style="margin: 2px 0; font-size: 12px; color: #777;">
                <em>Lat:</em> ${r['lat']?.toFixed(6) || '—'}, 
                <em>Lon:</em> ${r['lon']?.toFixed(6) || '—'}
              </p>
            </div>
          `

          create_circle_marker(r['lat'],r['lon'], rtcolor, popup_html,selectedMarkerGroup)

      });
        // create_polyline(latLngs, rtcolor)
    }

async function get_routes(){
      var request = new Request('/blob-storage/bronze/CTA/ctabustracker/getroutes', {
                          method: 'GET',
                          headers: new Headers({'Accept': 'application/json'})});
      var response = await fetch(request);
      let result = null
      if (response.ok){ 
          result = await response.json()
          console.log(result)
          result = result['bustime-response']['routes']
      }
      return result;
  }

async function silver_get_routes(rt){
        var request = new Request('/blob-storage/silver/CTA/ctabustracker/getroutes', {
                            method: 'GET',
                            headers: new Headers({'Accept': 'application/json'})});
        var response = await fetch(request);
        let result = null
        if (response.ok){ 
            result = await response.json()
            result = result['values']
            if (rt != null && rt != undefined){
              filtered_results = []
              result.forEach(element => {
                if (element['rt']==rt){
                  filtered_results.push(element)
                }
              });
              result = filtered_results
            }
        }
        return result;
    }

async function get_route_stops(){
        var request = new Request('/blob-storage/silver/CTA/ctabustracker/getroutestops', {
                  method: 'GET',
                  headers: new Headers({'Accept': 'application/json'})});
        var response = await fetch(request);
        let result = null
        if (response.ok){ 
            result = await response.json()
            result = result['values']
        }
        return result;
    }

function create_circle_marker(lat,lon, color, popup_html, group){
        var marker = L.circleMarker([lat, lon], {
                                color: 'black',      
                                fillColor: color, 
                                fillOpacity: 0.8,
                                radius: 25 
                            });
        var popup = L.popup()
            .setContent(popup_html);

        marker.bindPopup(popup).openPopup();
            marker.on('mouseover', function (e) {
            this.openPopup();
        });
        marker.on('mouseout', function (e) {
            this.closePopup();
        });

        group.addLayer(marker);
        group.addTo(map);
    }

function create_polyline(latLngs, linecolor){
          pLineGroup.clearLayers();
          var polyline = L.polyline(latLngs, { color: linecolor, weight: 8 });
          pLineGroup.addLayer(polyline)
          pLineGroup.addTo(map)
          map.fitBounds(polyline.getBounds());

      }

async function populate_routes() {
    const routes = await get_routes();
    console.log(routes);
    const datalist = document.getElementById("routes");

    datalist.innerHTML = "";

    routes.forEach(route => {
        const option = document.createElement("option");
        option.value = route['rt'] + ' - ' + route['rtnm'];
        option.dataset.directions = JSON.stringify(route['directions']);
        option.dataset.rt = JSON.stringify(route['rt']);
        option.dataset.rtclr = JSON.stringify(route['rtclr']);
        datalist.appendChild(option);
    });
}

async function populate_stops(rt, direction) {
  const routes = await get_route_stops();
  console.log(routes);
  const datalist = document.getElementById("stops");

  datalist.innerHTML = "";

  routes.forEach(route => {
    if (route['rt'] == rt && route['directions'].includes(direction)){
      const option = document.createElement("option");
      option.value =route['stpnm']
      datalist.appendChild(option);
    }
  });
}

busRouteInput.addEventListener("input", async () => {
          const busroute_selection = busRouteInput.value;
          const selectedOption = Array.from(datalist.options).find(
            o => o.value === busroute_selection
          );

          if (selectedOption) {
              if (live_interval_id != null){
                clearInterval(live_interval_id)
            }
            directionInput.value= ""
            const directions = JSON.parse(selectedOption.dataset.directions);
            const rt = JSON.parse(selectedOption.dataset.rt);
            rtclr = JSON.parse(selectedOption.dataset.rtclr);
            console.log("Valid route selected:", rt, rtclr,directions);
            let target_routes = await silver_get_routes(rt);
            draw_route_line(target_routes, rtclr)




            const datalist = document.getElementById("directions");
            datalist.innerHTML = "";
            directions.forEach(d => {
                const option = document.createElement("option");
                option.value = d['name']
                datalist.appendChild(option);
              });
          }else{
            directionInput.value= ""
            const datalist = document.getElementById("directions");
            document.getElementById("stopName").value = ""
            document.getElementById("stops").innerHTML = ""
            datalist.innerHTML = "";
           pLineGroup.clearLayers();

          }
        });

directionInput.addEventListener("input", async () => {
      const routeValue = busRouteInput.value.trim();
      const directionValue = directionInput.value.trim();

      const routeOption = Array.from(datalist.options).find(
        o => o.value === routeValue
      );

      if (routeOption && directionValue) {
        const routeId = JSON.parse(routeOption.dataset.rt);
        const direction = directionValue;
        let target_routes = await silver_get_routes(routeId);
        let filtered_results = []
        target_routes.forEach(element => {
          if (element['rtdir'] == direction){
            filtered_results.push(element)
          }
        });
        target_routes = filtered_results
        
        draw_route_line(target_routes, rtclr)


        console.log("Selected Route:", routeId);
        console.log("Selected Direction:", direction);

        populate_stops(routeId, direction);
      } else {
        // Either route or direction is empty → clear stops
        console.log("Clearing stops");
      liveTrainMarkerGroup.clearLayers()
        if (live_interval_id != null){
                clearInterval(live_interval_id)
            }

        const stopInput = document.getElementById("stopName");
        stopInput.value = "";
        document.getElementById("stops").innerHTML = "";
        // pLineGroup.clearLayers();
      }
    });

stopNameInput.addEventListener("input",async () => {
      const routeValue = busRouteInput.value.trim();
      const directionValue = directionInput.value.trim();
      const stopNameValue = stopNameInput.value.trim();
        const routeOption = Array.from(datalist.options).find(
        o => o.value === routeValue
      );

      if (routeOption && directionValue) {
        const routeId = JSON.parse(routeOption.dataset.rt);
        let target_routes = await silver_get_routes(routeId);
        let filtered_results = []
        target_routes.forEach(element => {
          if (element['rtdir'] == directionValue && element['stpnm'] == stopNameValue){
            filtered_results.push(element)
          }
        });
        target_routes = filtered_results
        if (live_interval_id != null){
                clearInterval(live_interval_id)
            }
        if (target_routes.length > 0){
          let lat = target_routes[0]['lat']
          let lon = target_routes[0]['lon']
          map.setView([lat, lon], 12);
          
          socketId = start_session({'type': 'bus', 'values':target_routes},'tcp')
       
          live_interval_id = setInterval(() => {
              if (websocket.session.readyState === WebSocket.OPEN){
                    websocket.send_payload({'type': 'bus', 'values':target_routes},'tcp', socketId)
                                
              }
            }, 5000);

        }
        draw_route_line(target_routes, rtclr)
      }

      
    })

document.querySelectorAll('.outputs').forEach(el => {
  el.addEventListener('click', function () {
    const element = this;

    if (document.fullscreenElement) {
      document.exitFullscreen();
      element.style.cursor = 'zoom-in';
      return;
    }

    element.requestFullscreen().then(() => {
      element.style.cursor = 'zoom-out';
      element.style.maxHeight = 'none';
      element.style.width = '100%';
    }).catch(err => {
      console.error("Fullscreen failed:", err);
    });
  });
});

// Reset style whenzzexiting fullscreen
document.addEventListener('fullscreenchange', () => {
  document.querySelectorAll('.outputs').forEach(el => {
    if (!document.fullscreenElement) {
      el.style.maxHeight = '500px';
      el.style.cursor = 'zoom-in';
    }
  });
});


populate_routes()