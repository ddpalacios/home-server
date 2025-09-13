    function get_session_by_userId(userId, username){
		var request = new Request('life-of-sounds/live_studio/session?userId='+userId, {
							method: 'GET',
							headers: new Headers({
										'Accept': 'application/json'
									})
				});

        fetch(request).then(async(response) => {
                        if (response.ok) {
                            try{
                                const data = await response.json();
                                console.log(data)
                                if (data['values'].length > 0 ){
                                    let sessionid = data['values'][0]['sessionid']
                                    let userid = data['values'][0]['userid']
                                    sessionStorage.setItem("sessionname", data['values'][0]['name'])
                                    sessionStorage.setItem("sessionid", sessionid)
                                    if (!location.hash){
                                        location.hash = "session=" + sessionid;
                                    }
                                    load_messages(sessionid);
                                    let isHost = 1
                                    start_websocket(sessionid, userid, username, isHost);
                                }else{
                                    if (window.location.hash){
                                        let isHost = 0
                                        let sessionid = window.location.hash.split("session=")[1]
                                        sessionStorage.setItem("sessionid", sessionid)
                                        get_session_by_sessionId(sessionid, userId,username, isHost);
                                    }
                                }
                               
                            }catch(error){}
                        }else{
                            console.log("No Existing Session Found")
                        }
                    }).catch(e => console.error('EXCEPTION: ', e))
    }

    function get_session_by_sessionId(sessionId, userid,username,isHost){
		var request = new Request('life-of-sounds/live_studio/session?Id='+sessionId, {
							method: 'GET',
							headers: new Headers({
										'Accept': 'application/json'
									})
				});

        fetch(request).then(async(response) => {
                        if (response.ok) {
                            try{
                                const data = await response.json();
                                let sessionname = data['name']
                                sessionStorage.setItem("sessionname", sessionname);

                                load_messages(sessionId);
                                start_websocket(sessionId, userid, username,isHost);
                            }catch(error){}
                        }else{
                            console.log("No Existing Session Found")
                        }
                    }).catch(e => console.error('EXCEPTION: ', e))
    }

    async function start_page(user){
        if (window.location.hash){
            let isHost = 0
            let sessionid = window.location.hash.split("session=")[1]
            sessionStorage.setItem("sessionid", sessionid)
            var request = new Request('life-of-sounds/live_studio/session?userId='+user['Id'], {
                                        method: 'GET',
                                        headers: new Headers({
                                                    'Accept': 'application/json'
                                                })});
            var response = await fetch(request);
            if (response.ok) { 
                const data = await response.json()
                if (data['values'].length > 0){
                    if (data['values'][0]['sessionid'] == sessionid){
                        let isHost = 1
                        console.log(data)
                        let sessionname = data['values'][0]['name']
                        sessionStorage.setItem("sessionname", sessionname);
                        load_messages(sessionid);
                        start_websocket(sessionid, user['Id'], user['fullname'],isHost);    
                    }else{
                        get_session_by_sessionId(sessionid, user['Id'],user['fullname'], isHost);
                    }
                }else{
                    get_session_by_sessionId(sessionid, user['Id'],user['fullname'], isHost);
                }
            } else {
                console.error(`HTTP Error: ${response.status}`); 
            }
        }else{
            get_session_by_userId(user['Id'], user['fullname'])
        }

    }

    function post_user(){
            let username = prompt("Your Name:", generate());
            var request = new Request('live_studio/user', {
                                method: 'POST',
                                headers: new Headers({
                                            'Accept': 'application/json'
                                        })
			       ,body: JSON.stringify({
					       "username": username
				       })
                    });
            fetch(request).then(async(response) => {
                    if (response.ok) {
                        try{
                            const data = await response.json();
                            sessionStorage.setItem("userId", data['Id'])
                            sessionStorage.setItem("username", data['fullname'])
                            display_username(data['fullname']);
                            start_page(data);
                        }catch(error){}
                    }   
                }).catch(e => console.error('EXCEPTION: ', e))

    }

    function get_user(){
         var request = new Request('live_studio/user', {
                                method: 'GET',
                                headers: new Headers({
                                            'Accept': 'application/json'
                                        })
                    });
            
            fetch(request).then(async(response) => {
                        if (response.ok) {
                            try{
                                const data = await response.json();
                                sessionStorage.setItem("userId", data['Id'])
                                sessionStorage.setItem("username", data['fullname'])
                                display_username(data['fullname']);
                                start_page(data);
                            }catch(error){}
                        }else{
                            post_user()
                        }
                    }).catch(e => console.error('EXCEPTION: ', e))
    }

    document.getElementById("show_chat").onclick = function () {
        document.getElementById("show_chat").style.display = "none";
        document.getElementById("hide_chat").style.display = "inline-block";
        document.getElementById("chatbox").hidden = false;
        // windowResize()
    
        
    }
    
    document.getElementById("hide_chat").onclick = function () {
        document.getElementById("hide_chat").style.display = "none";
        document.getElementById("show_chat").style.display = "inline-block";
        document.getElementById("chatbox").hidden = true;
        // windowResize()

    }

    document.getElementById("create_session").onclick = function () {
            let userId = sessionStorage.getItem("userId");
            let username = sessionStorage.getItem("username");
            if (userId == null || userId == undefined){
                alert("Error Retrieving User Info")
                return;
            }
            let sessionName = prompt("Session Name:", "The "+generate()+ " Session");
            var request = new Request('/life-of-sounds/live_studio/session', {
                            method: 'POST',
                            headers: new Headers({
                                        'Accept': 'application/json',
                                        'Content-Type': 'text/json'
                                    })
                            ,body: JSON.stringify({'name': sessionName,'userid': userId,'username':username})});
                fetch(request)
                        .then((response)=> response.json())
                        .then((data)=> {
                            if (data.hasOwnProperty("sessionId")){
                                location.hash = "session=" + data['sessionId'];
                                let sessionname = data['name']
                                let sessionid =  data['sessionId'];
                                sessionStorage.setItem("sessionid",sessionid);
                                sessionStorage.setItem("sessionname",sessionname);
                                let isHost = 1
                                start_websocket(sessionid, userId,username, isHost);
                            }
                        });
        
    }

    document.getElementById("stop_session").onclick = function () {
        let sessionId = sessionStorage.getItem("sessionid");
         websocket_session.send(JSON.stringify({
                    'operation': "session"
                    ,"request" : "DELETE"
                    ,'sessionId': sessionId
                }))
        var request = new Request('life-of-sounds/live_studio/session?Id='+sessionId, {
                    method: 'DELETE',
                    headers: new Headers({
                                'Accept': 'application/json'
                            })
        });
		fetch(request)
        websocket_session.close()
    }

    window.addEventListener("load", function(){
         get_user()
    })
    