    let websocket = null;
    let chosen_train_route = null;

    function plot_pattern(patterns){
        let latLngs = []
        patterns.forEach(element => {
            let cords = [element['lat'], element['lon']]
            latLngs.push(cords)
        });
        // console.log(latLngs)
        var polyline = L.polyline(latLngs, { color: 'blue', weight: 5, smoothFactor:1 });
        pLineGroup.addLayer(polyline)
        pLineGroup.addTo(map)

        latLngs = []
        patterns.forEach(element => {
                    if (element.hasOwnProperty("stpnm")){
                        let cords = [element['lat'], element['lon'], element['stpnm']]
                        latLngs.push(cords)

                    }
                });
        let color = 'blue'
        latLngs.forEach(([lat, lon,stpnm]) => {
            
            var marker = L.circleMarker([lat, lon], {
                                    color: 'white',      
                                    fillColor:color, 
                                    fillOpacity: 0.8,
                                    radius: 5   
                                });

            let popup_html = `<h1> `+stpnm+`</h1>`
            var popup = L.popup()
                .setContent(popup_html);
            marker.bindPopup(popup).openPopup();
                marker.on('mouseover', function (e) {
                this.openPopup();
            });
            marker.on('mouseout', function (e) {
                this.closePopup();
            });
            pLineGroup.addLayer(marker); 
        });


        map.fitBounds(polyline.getBounds());

    }

    async function handle_search_query(selected_value, type, routes){
        if (type == 'train'){ 
            chosen_train_route = selected_value
            // websocket.send_message("HI")
            routes.forEach(element => {
                if (element['rt'] == selected_value){
                    console.log(element['northbound'] + " | "+ element['southbound'])
                }
            });
        }
        else if (type == 'bus'){
            pLineGroup.clearLayers();
            markerGroup.clearLayers();
            chosen_train_route = null;
            // websocket.send_message("HI")
            let bus_patterns = await get_bus_patterns()
             routes.forEach(element => {
                if (element['rt'] == selected_value){
                    // console.log(element['directions'][0]['name'] +" | "+ element['directions'][1]['name'])
                    bus_patterns['bustime-response']['routes'].forEach(bp => {
                        if (bp['rt'] == selected_value){
                            bp['pattern'].forEach(p => {
                                plot_pattern(p['pt'])

                                
                            });

                        }
                        
                    });


                }
            });

        }

    }

    async function populist_searchlist(){
        let ul = document.getElementById("myUL");
        var trainlines = await get_train_lines()
        var busroutes = await get_bus_routes()
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
        if (busroutes != null){
            let values = busroutes['bustime-response']['routes']
            values.forEach(element => {
                let li = document.createElement('li')
                let a = document.createElement('a')
                a.style.cursor = 'pointer'

                a.innerHTML = element['rt'] + " - " + element['rtnm']
                a.value =  element['rt']
                 a.onclick = function(){
                    handle_search_query(this.value, 'bus', values)
                }
                li.appendChild(a)
                ul.appendChild(li)
        });


        }
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
           
    }

    function start_session(sessionId, current_user){
        websocket = new Websocket_Session(sessionId,current_user['Id'],current_user['fullname']);
        websocket.initialize()
        websocket.session.onmessage = async (event) => {
                let data = JSON.parse(event.data)
                if (data['originalTableName'] == 'ttpositions.aspx'){
                    handle_train_positions(data)
                }
                else if (data['originalTableName'] == 'getroutes'){
                }
        }
    }

    function display_session(){
        var chatbox =  document.getElementById("chatbox");
        var chatbox_contents_div = document.createElement("div");
        const send_btn = document.createElement("button");
        send_btn.className = 'buttons'
        send_btn.textContent = "Green Line"
        send_btn.style.marginTop = "10px"
        send_btn.style.backgroundColor ='rgba(4, 241, 83, 0.364)';
        send_btn.addEventListener('mouseover', function () {
        send_btn.style.backgroundColor = 'rgba(4, 200, 4, 0.9)';
        });
        send_btn.addEventListener('mouseout', function () {
            send_btn.style.backgroundColor = 'rgba(4, 241, 83, 0.364)';
        });
        chatbox_contents_div.appendChild(send_btn)
        chatbox.appendChild(chatbox_contents_div)
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
    
    async function create_session(sessionName, user){
         let userId = user['Id'];
         let fullName = user['fullName'];
         var request = new Request('/life-of-sounds/live_studio/session', {
                            method: 'POST',
                            headers: new Headers({
                                        'Accept': 'application/json',
                                        'Content-Type': 'text/json'
                                    })
                            ,body: JSON.stringify({'name': sessionName,'userid': userId,'username':fullName})});
        var response = await fetch(request);
        var session = null;
        if (response.ok){ 
            session = await response.json()
        }
        return session;
    }

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
    async function get_bus_routes(){
        var request = new Request('/blob-storage/bronze/CTA/ctabustracker/getroutes', {
                            method: 'GET',
                            headers: new Headers({'Accept': 'application/json'})});
        var response = await fetch(request);
        let result = null
        if (response.ok){ 
            result = await response.json()
        }
        return result;
    }

   window.addEventListener("load", async function(){
        let current_user = await get_user();
        let userId = current_user['Id']
        this.sessionStorage.setItem("userId", userId)
        let current_session = await get_session_by_userId(userId);
        let sessionId = null;
        if (current_session == null){
                this.alert("Session Retrieval Server Error"); 
                return;
            }
        if (current_session['values'].length == 0){
            current_session = await create_session("chicago-transits", current_user);
            sessionId = current_session['sessionId']
        }else{
            sessionId = current_session['values'][0]['sessionid']
        }
        this.sessionStorage.setItem("sessionId", sessionId)
        if (sessionId != null && userId != null){
            populist_searchlist()
            start_session(sessionId, current_user);
        }
    })
