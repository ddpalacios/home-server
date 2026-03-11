    let websocket = null;
    let chosen_train_route = null;

    function create_circle_marker(lat,lon, color, popup_html, group){
        var marker = L.circleMarker([lat, lon], {
                                color: 'black',      
                                fillColor: color, 
                                fillOpacity: 0.8,
                                radius: 15 
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
        var polyline = L.polyline(latLngs, { color: linecolor, weight: 5 });
        pLineGroup.addLayer(polyline)
        pLineGroup.addTo(map)
        map.fitBounds(polyline.getBounds());

    }

    async function handle_search_query(selected_value, type, routes){
        if (type == 'train'){ 
            chosen_train_route = selected_value
            if (live_interval_id != null){
                clearInterval(live_interval_id)
            }
            websocket.send_message({'type': 'train', 'value': selected_value})
            live_interval_id = setInterval(() => {
                                websocket.send_message({'type': 'train', 'value': selected_value})
                                }, 5000);
            routes.forEach(element => {
                if (element['rt'] == selected_value){
                    console.log(element['northbound'] + " | "+ element['southbound'])
                }
            });
        }
    }

    async function get_prediction(type,routeinfo){
        if (type == 'bus'){
            let stpid = routeinfo['stpid']
            let rt = routeinfo['rt']
            let direction = routeinfo['rtdir']
            if (live_interval_id != null){
                clearInterval(live_interval_id)
            }
            websocket.send_message({'type': 'bus','request': 'getpredictions', 'param': {'rt': rt, 'stpid': stpid, 'rtdir': direction}})
            live_interval_id = setInterval(() => {
                                websocket.send_message({'type': 'bus','request': 'getpredictions', 'param': {'rt': rt, 'stpid': stpid, 'rtdir': direction}})
                                }, 5000);
        }

    }
    async function plot_route_names(type,routeinfo) {
        if (type == 'bus'){
            let rt = routeinfo['rt']
            let rtnm = routeinfo['rtnm']
            let direction = routeinfo['direction']
            let routes = await get_routes() //TODO: ADD FILTER TO API
            let target_routes = []
            let rtcolor = null
            for (let i = 0; i<routes.length; i++){
                let route = routes[i]
                 if (route['rt'] == rt && route['rtdir'] == direction){
                    target_routes.push(route)
                    if (rtcolor == null){
                        rtcolor = route['rtclr']
                    }
                }
            }
            if (target_routes.length > 0){
                let latLngs = []
                markerGroup.clearLayers();
                target_routes.forEach(r => {
                    let cords = [r['lat'], r['lon']]
                    latLngs.push(cords)
                    // popup_html = `<h1>`+r['stpnm']+`</h1>`
                    // create_circle_marker(r['lat'],r['lon'], rtcolor, popup_html)

                });
                create_polyline(latLngs, rtcolor)
            }

        }
        
    }

    function popuate_direction(type, routeinfo){
        let ul = document.getElementById("myUL");
        let searchlist =document.getElementById("searchlist")
        let backbtn = document.createElement('button')
        backbtn.className  = 'buttons'
        backbtn.style.backgroundColor = "red"
        backbtn.style.marginBottom = "10px"
        backbtn.innerHTML = "Back"
        backbtn.onclick = function(){
            searchlist.removeChild(backbtn);
            if (live_interval_id != null){
                clearInterval(live_interval_id)
                live_interval_id=null;
                
            }
            markergroups.forEach(element => {
                element.clearLayers()
                
            });
            ul.replaceChildren();
            populist_searchlist()
        }
        searchlist.insertBefore(backbtn, searchlist.firstChild);
        ul.replaceChildren();
        directions = null
        if (type == 'bus'){
            directions = routeinfo['directions']
            directions = directions.split(',')
        }

        if (directions != null){
            directions.forEach(direction => {
                let li = document.createElement('li')
                let a = document.createElement('a')
                a.style.cursor = 'pointer'
                a.innerHTML = direction
                if (routeinfo.hasOwnProperty('stpnm')){
                    a.dataset.info = JSON.stringify({'direction': direction, 'rt': routeinfo['rt'], 'rtnm': routeinfo['stpnm']})
                    a.onclick = async function(){
                        console.log(this.dataset.info)
                        // plot_route_names('bus',JSON.parse(this.dataset.info))
                        // populate_routes(JSON.parse(this.dataset.info))
                        
                        // get_prediction('bus',tr)
                        // get_prediction('bus',JSON.parse(this.dataset.info))
                    }
                }
                else if (routeinfo.hasOwnProperty('rtnm')){
                    a.dataset.info = JSON.stringify({'rt': routeinfo['rt'], 'direction': direction, 'rtnm': routeinfo['rtnm']})
                     a.onclick = function(){
                        plot_route_names('bus',JSON.parse(this.dataset.info))
                        populate_routes(JSON.parse(this.dataset.info))
                    }
                }
              
                li.appendChild(a)
                ul.appendChild(li)
                
                
            });
        }
    }

    async function populate_routes(routeinfo) {
        let ul = document.getElementById("myUL");
        ul.replaceChildren();

        let rt = routeinfo['rt']
        let direction = routeinfo['direction']
        let rtnm = routeinfo['rtnm']
        let routes = await get_routes()
        let target_routes = []
        if (routes != null){
            for (let i=0; i< routes.length; i++){
                let route = routes[i]
                if (route['rt'] == rt && route['rtdir'] == direction){
                    target_routes.push(route)
                }
            }
        }

        target_routes.forEach(tr => {
            let li = document.createElement('li')
            let a = document.createElement('a')
            a.style.cursor = 'pointer'
            a.innerHTML = rt+" - "+ tr['stpnm']
            a.onclick = function(){
                selectedMarkerGroup.clearLayers();
                let popup_html = `<h1>`+tr['stpnm']+`</h1>`
                create_circle_marker(tr['lat'],tr['lon'], tr['rtclr'], popup_html, selectedMarkerGroup)
                get_prediction('bus',tr)
            }

            a.onmouseenter = function() {
                stopMarkerGroup.clearLayers();
                let popup_html = `<h1>`+tr['stpnm']+`</h1>`
                create_circle_marker(tr['lat'],tr['lon'], 'black', popup_html, stopMarkerGroup)
                map.panTo([tr['lat'],tr['lon']])
                };

            a.onmouseleave = function(){
                stopMarkerGroup.clearLayers();

            }
            a.dataset.info = JSON.stringify({'direction': direction, 'rt':rt, 'stpnm': tr['stpnm']})
            li.appendChild(a)
            ul.appendChild(li)

            
        });


        
    }

    async function populist_searchlist(){
        let ul = document.getElementById("myUL");
        var trainlines = await get_train_lines()
        var busroutesdirections = await get_route_directions()
        var routenames = await get_routenames()
        if (trainlines != null){
            let values = trainlines['ctatt']['values']
            values.forEach(element => {
                let li = document.createElement('li')
                let a = document.createElement('a')
                a.style.cursor = 'pointer'
                a.innerHTML = element['rt']
                a.value = element['rt']
                a.onclick = function(){
                    handle_search_query(this.value, 'train', values)
                }
                li.appendChild(a)
                ul.appendChild(li)
        });
        }
        if (routenames != null){
            routenames.forEach(routename => {
                let li = document.createElement('li')
                let a = document.createElement('a')
                a.style.cursor = 'pointer'
                a.innerHTML = routename['rt'] + " - " + routename['rtnm']
                a.value =  routename['rt']
                a.dataset.info = JSON.stringify(routename)
                 a.onclick = function(){
                    let routeinfo = JSON.parse(this.dataset.info)
                    let directions = routeinfo['directions'].split(',')
                    directions.forEach(d => {
                        let r = {'rt': routeinfo['rt'], 'direction': d, 'rtnm': routeinfo['rtnm']}
                        plot_route_names('bus',r)
                    });
                    popuate_direction('bus', JSON.parse(this.dataset.info))
                }
                li.appendChild(a)
                ul.appendChild(li)
            });
        }


        // if (busroutesdirections != null){
        //     busroutesdirections.forEach(element => {
        //         let li = document.createElement('li')
        //         let a = document.createElement('a')
        //         a.style.cursor = 'pointer'

        //         a.innerHTML = element['rt'] + " - " + element['stpnm']
        //         a.value =  element['rt']
        //         a.dataset.info = JSON.stringify(element)
        //          a.onclick = function(){
        //             console.log(this.dataset.info)
        //             popuate_direction('bus', JSON.parse(this.dataset.info))
        //             // handle_search_query(this.value, 'bus', values)
        //         }
        //         li.appendChild(a)
        //         ul.appendChild(li)
        // });


        // }
        myFunction()

    }

    function handle_train_positions(data){
                color_map = {
                            'red': 'Red'
                            ,'blue':'Blue'
                            ,'g': 'Green'
                            ,'y': 'Yellow'
                            ,'p': 'Purple'
                            ,'brn': 'Brown'
                            ,'org':'Orange'
                            ,'pink':'Pink'
                        }
                markerGroup.clearLayers();
                if (chosen_train_route == null){
                    return
                }
                // websocket.send_message({'type': 'train', 'value': chosen_train_route, 'running': 1})

                pLineGroup.clearLayers();

                
                data['values'].forEach(train => {
                    if (!train.hasOwnProperty('train')){
                        return;
                    }
                        color = color_map[train['@name']]
                        if (color != chosen_train_route){
                            return
                        }

                        let trains =  train['train']
                        if (!Array.isArray(trains)){
                            trains = [trains]

                        }
                        trains.forEach(element => {
                                let lat = element['lat']
                                let lon = element['lon']
                                
                                var marker = L.circleMarker([lat, lon], {
                                    color: 'white',      
                                    fillColor: color, 
                                    fillOpacity: 0.8,
                                    radius: 20      
                                });
                                const d = new Date(element['arrT']);
                                let isApproaching  = element['isApp']
                                let isDelayed  = element['isDly']
                                let popup_html = `
                                        <b><a style=color:`+color+`;>`+color+` Line</a></b>
                                        <h2 style=color:`+color+`;>To: `+element['destNm']+`</h2>
                                        <h3>Next Stop: `+element['nextStaNm']+`</h3>
                                        <h3>Arrival Time: `+d.toLocaleTimeString()+`</h3>
                                `
                                    if (isDelayed == 1){
                                    popup_html += `<h2 style="color:red;">DELAYED</h2>`
                                    
                                }
                                if (isApproaching == 1){
                                    popup_html += `<h2 style="color:red;">APPROACHING</h2>`
                                }
                                
                                var popup = L.popup()
                                    .setContent(popup_html);

                                marker.bindPopup(popup).openPopup();
                                    marker.on('mouseover', function (e) {
                                    this.openPopup();
                                });
                                marker.on('mouseout', function (e) {
                                    this.closePopup();
                                });

                                markerGroup.addLayer(marker);
                                markerGroup.addTo(map);
                                
                            });
                    
                });
    }

    function handle_bus_routes(data){
           console.log(data)
            markerGroup.clearLayers();
            let rt = data['values']['rt']
            data['values']['vehicles'].forEach(bus => {
                let lat = bus['lat']
                let lon = bus['lon']
                var marker = L.circleMarker([lat, lon], {
                                color: 'white',      
                                fillColor: "red", 
                                fillOpacity: 0.8,
                                radius: 20      
                            });
                let popup_html = `
                            <b><h1>Route: `+rt+`</h1></b>
                            <h2>To: `+bus['des']+`</h2>
                            `
                if (bus['dly']){
                    popup_html += `<h2 style="color:red;">DELAYED</h2>`
                    }

                var popup = L.popup()
                    .setContent(popup_html);

                marker.bindPopup(popup).openPopup();
                    marker.on('mouseover', function (e) {
                    this.openPopup();
                });
                marker.on('mouseout', function (e) {
                    this.closePopup();
                });

                markerGroup.addLayer(marker);
                markerGroup.addTo(map);
            });
    }


     function handle_bus_predictions(data){
           console.log(data)
           liveTrainMarkerGroup.clearLayers()
           data.forEach(prd => {
            vinfo = prd['vehicle_info']
            vlat = vinfo['lat']
            vlon = vinfo['lon']
            let popup_html =  `
                        <h1>`+vinfo['vid']+`</h1>
                        <h3>Arrival Time: `+prd['prdtm']+`</h3>`

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

            

            // create_circle_marker(vlat, vlon,'purple',popup_html,liveTrainMarkerGroup )
            
           });
    }


    function start_session(){
        websocket = new Websocket_Session();
        websocket.initialize()
        websocket.session.onmessage = async (event) => {
                let data = JSON.parse(event.data)
                if (data['originalTableName'] == 'ttpositions.aspx'){
                    handle_train_positions(data)
                }
                else if (data['originalTableName'] == 'getvehicles'){
                    handle_bus_routes(data)
                }else if (data['originalTableName'] == 'getpredictions'){
                        if (live_interval_id != null){
                            handle_bus_predictions(data['values']['prd'])
                }
                }
        }
    }

    async function get_session_by_userId(userId){
		var request = new Request('life-of-sounds/live_studio/session?userId='+userId, {
							method: 'GET',
							headers: new Headers({
										'Accept': 'application/json'
									})
				});
        var session = null;
        var response = await fetch(request);
        if (response.ok){ 
            session = await response.json()
        }
        return session;

    }
    
    async function create_user(){
            var request = new Request('/life-of-sounds/live_studio/user', {
                                method: 'POST',
                                headers: new Headers({
                                            'Accept': 'application/json'
                                        })
			       ,body: JSON.stringify({
					       "username":'admin'
				       })
                    });

            var response = await fetch(request);
            if (response.ok){ 
                try{
                    const data = await response.json()
                    return data;
                }catch(error){}
            }
            return null;
    }
    async function get_user(){
         var request = new Request('/life-of-sounds/live_studio/user', { // TODO Change routing to not reflect other app name
                                method: 'GET',
                                headers: new Headers({'Accept': 'application/json'})});
            var user = null;
            var response = await fetch(request);
            if (response.ok){ 
                user = await response.json()
            }else{
                user = create_user();
            }
            return user;
    }
    
    // async function create_session(sessionName, user){
    //      let userId = user['Id'];
    //      let fullName = user['fullName'];
    //      var request = new Request('/life-of-sounds/live_studio/session', {
    //                         method: 'POST',
    //                         headers: new Headers({
    //                                     'Accept': 'application/json',
    //                                     'Content-Type': 'text/json'
    //                                 })
    //                         ,body: JSON.stringify({'name': sessionName,'userid': userId,'username':fullName})});
    //     var response = await fetch(request);
    //     var session = null;
    //     if (response.ok){ 
    //         session = await response.json()
    //     }
    //     return session;
    // }

    async function get_bus_patterns() {
        var request = new Request('/blob-storage/bronze/CTA/ctabustracker/getpatterns', {
                            method: 'GET',
                            headers: new Headers({'Accept': 'application/json'})});
        var response = await fetch(request);
        let result = null
        if (response.ok){ 
            result = await response.json()
        }
        return result;
        
    }

    async function get_train_lines(){
        var request = new Request('/blob-storage/bronze/CTA/api.transitchicago/tlines', {
                            method: 'GET',
                            headers: new Headers({'Accept': 'application/json'})});
        var response = await fetch(request);
        let result = null
        if (response.ok){ 
            result = await response.json()
        }
        return result;
    }
    async function get_route_directions(){
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

     async function get_routenames(){
        var request = new Request('/blob-storage/silver/CTA/ctabustracker/getroutenames', {
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

     async function get_routes(){
        var request = new Request('/blob-storage/silver/CTA/ctabustracker/getroutes', {
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

   window.addEventListener("load", async function(){
    start_session();
    // populist_searchlist();
    })
