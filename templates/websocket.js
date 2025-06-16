	var stream = null;
	var websocket_id = null;
	var websocket_session = null;
	var userid = null;
	var audioId = null;
	var userInfo = null;

	function getCookie(c_name) {
		    if (document.cookie.length > 0) {
			c_start = document.cookie.indexOf(c_name + "=");
			if (c_start != -1) {
			    c_start = c_start + c_name.length + 1;
			    c_end = document.cookie.indexOf(";", c_start);
			    if (c_end == -1) {
				c_end = document.cookie.length;
			    }
			    return unescape(document.cookie.substring(c_start, c_end));
			}
		    }
		    return "";
		}
	
		function send_message(sessionid, message){
			var request = new Request('/life-of-sounds/session/'+sessionid, {
							method: 'GET',
							headers: new Headers({
										'Accept': 'application/json'
									})
				});
				fetch(request)
					.then((response)=> response.json())
					.then((data)=> {
					console.log(data['Id'])
					var blob = new Blob([message], { type: "text/plain" });
					var metadata = JSON.stringify({
								'type': 'text'
								,'userid': data['Id']
							});
					var combined_blob = new Blob([metadata,' ' ,blob], {type: "application/octet-stream"});
					websocket_session.send(combined_blob);
					})

		}

		function process_message(){
				if (websocket_session == null){
					alert("Websocket has not been initialized");
					return; 
				}
				var x = document.getElementById("myText").value;
				var sessionid = getCookie("session");
				 send_message(sessionid, x)


		}

	function generateUniqueId() {
		return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
		}
	
	async function  delete_existing_websocket(userid, sessionid){
		var request = new Request("/life-of-sounds/websocket?userid='"+userid+"'&sessionid='"+sessionid+"'" ,{
							method: 'DELETE',
							headers: new Headers({
										'Accept': 'application/json'
									})
				});
		var response = await fetch(request);
		if (response.status== 200){

		}




	}
	
	function main() {
			console.log(getCookie("session"));
			if (websocket_session == null){
				var sessionid = getCookie("session");
				var request = new Request('/life-of-sounds/session/'+sessionid, {
							method: 'GET',
							headers: new Headers({
										'Accept': 'application/json'
									})
				});
				fetch(request)
					.then((response)=> response.json())
					.then((data)=> {
						delete_existing_websocket(data["Id"], sessionid);
						start_websocket(data,sessionid);
						sessionStorage.setItem('userid', data["Id"]);
    					// create_table_data('audio', data["Id"], 1)


					})
	}
		}

	async function get_audio(){

		var request = new Request('/life-of-sounds/session/user',{
					method: 'GET',
					headers: new Headers({
							'Accept': 'application/json'
							})
				});
		fetch(request)
			.then((response)=> response.json())
			.then((data)=> {
					console.log(data.Id);

					var audiorequest = new Request('/life-of-sounds/studio/audio?userid='+data.Id, {
								method: 'GET',
								headers: new Headers({
										'Accept': 'application/json'
										})
							});
					fetch(audiorequest);
				});
	}

	async function stop_websocket(){
		var request = new Request('/life-of-sounds/websocket/'+websocket_id, {
					method: 'DELETE',
					headers: new Headers({
							'Accept': 'application/json'
							})
				});
	 var response = await fetch(request);
	 if (response.status == 404){
		 alert("Websocket session not found");
		}
	}

	async function update_websocket(user,sessionid){
		var connected_on = new Date().toISOString();
		var request = new Request('/life-of-sounds/websocket', {
					method: 'PATCH',
					headers: new Headers({
								'Accept': 'application/json'
							})
					 ,body: JSON.stringify({
							userid: user["Id"]
							,sessionid: sessionid
                            ,connected_on: connected_on
							,Id: generateUniqueId()
						    })
			});
		var response =  await fetch(request);
		if (response.status == 400){
			alert("Error creating session.")
			return;
		}
	}

	async function start_websocket(user,sessionid){
		websocket_session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/websocket');
		is_connected = false
		websocket_session.onopen = () => {
			console.log("Websocket connection established");	
			alert("Connected.")
			is_connected = true;
			// update_websocket(user,sessionid)		
		}
		websocket_session.onmessage = (event) => {
				console.log("Message from server:", event.data);
				h3 = document.createElement('h3')
				elem = document.getElementById("messagebox")
				if (event.data == "clear"){
					elem.innerHTML = ''
				}else  if (event.data == "live_studio"){
					location.href = '/life-of-sounds/home/live_studio'

				}else  if (event.data == "purple"){
					document.body.style.backgroundColor = 'purple'
				}else  if (event.data == "grey"){
					document.body.style.backgroundColor = 'grey'
				}else  if (event.data == "red"){
					document.body.style.backgroundColor = 'red'
				}else  if (event.data == "orange"){
					document.body.style.backgroundColor = 'orange'
				}else  if (event.data == "black"){
					document.body.style.backgroundColor = 'black'
				}else  if (event.data == "white"){
					document.body.style.backgroundColor = 'white'
				}else  if (event.data == "green"){
					document.body.style.backgroundColor = 'green'
				}else  if (event.data == "yellow"){
					document.body.style.backgroundColor = 'yellow'
				}else  if (event.data == "blue"){
					document.body.style.backgroundColor = 'blue'
				}else  if (event.data == "pink"){
					document.body.style.backgroundColor = 'pink'
				}else	{
					h3.textContent = event.data
				elem.appendChild(h3)
				}
		}
		websocket_session.onerror = (error) => {
			console.error("Websocket error:", error);

		}
		websocket_session.onclose = () => {
			console.log("Websocket connection closed");

		}			
		if (is_connected){
			alert("Connected!")
		}
			

	}

	async function update_audio(userid){
		var endtime = new Date().toISOString();
		var data = {}
		data['endtime'] = endtime
		data['userid'] = userid
		var request = new Request('/life-of-sounds/audio', {
					method: 'PATCH'
					,headers: new Headers({
						'Accept': 'application/json',
						'Content-Type': 'text/json'	
					}),
					body: JSON.stringify(data)
				
				
				});
		const response = await fetch(request);
		if (response.status == 200){
	  			// create_table_data('audio', userid, 1)
				var elem = document.getElementById("fade-text")
				elem.innerHTML = "";

		}

	}
	
	async function close_microphone(){
		if (stream == null){
			alert("No Microphone detected");
			return;
		}
		stream.getTracks().forEach(track => track.stop());
		stream = null;
		var sessionid = getCookie("session");

		
		var request = new Request('/life-of-sounds/session/'+sessionid, {
								method: 'GET',
								headers: new Headers({
											'Accept': 'application/json'
										})
					});
	fetch(request)
						.then((response)=> response.json())
						.then((data)=> {
							update_audio(data['Id']);
						})

    //   document.getElementById("audio_table_container").innerHTML = "";



		
	}

    function process_chunk(data_chunk){
    //    const audioCtx = new AudioContext();
    //   const source = audioCtx.createMediaStreamSource(stream);


    }
	
	async function start_recording(uniqueId,audioName,  database, source,sessionid){
		stream = await navigator.mediaDevices.getUserMedia({audio: true});
		let chunks = [];
		let mediaRecorder = new MediaRecorder(stream);
		let sequence = 0;
		mediaRecorder.ondataavailable = function (e) {
		websocket_session.send(e.data);
		chunks.push(e.data);
		console.log(e.data)
		};

	    mediaRecorder.onstop = function(e){
		    const blob = new Blob(chunks, { 'type' : 'audio/ogg; codecs=opus' });
		    const audioUrl = URL.createObjectURL(blob);
		    var audio = document.getElementById("audio_stream_id");
		    console.log(audio);
		    audio.src =  audioUrl;
			websocket_session.send("Audio Stopped");



	    }
	    mediaRecorder.start(10);
		var elem = document.getElementById("fade-text")
		var text = document.createElement("p")
		text.textContent = "Recording..."
		elem.appendChild(text)
	}
	
	async function create_audio(uniqueId, audioName,path, source, database,userid,starttime){
			var data =JSON.stringify({
			"starttime":starttime
			,"audioName": audioName
			,"userid":userid 
			,"audioId" : uniqueId
			,"path": path
			,"source": source
			,"database": database
			});

	var request = new Request('/life-of-sounds/audio', {
			method: 'POST'
			,headers: new Headers({
				'Accept': 'application/json',
				'Content-Type': 'text/json'
			}),
			body: data


		});
		var response = await fetch(request);
		if (response.status == 200) {
			}


	}
	
	async function open_microphone(){
		if (websocket_session == null){
			alert("Websocket has not been initialized");
			return;
		}
		var sessionid = getCookie("session");
		let uniqueId = generateUniqueId();
		var  audioName = 'Audio_'+uniqueId;
		let source = 'recordings'
		let database = 'users'
		
		var starttime = new Date().toISOString();
		
		var request = new Request('/life-of-sounds/session/'+sessionid, {
							method: 'GET',
							headers: new Headers({
										'Accept': 'application/json'
									})
				});
		
		fetch(request)
			.then((response)=> response.json())
			.then((data)=> {
			console.log(data)
			let path = database+"/"+ data["Id"]+ "/" +source+ '/'+audioName + '.webm';

			create_audio(uniqueId, audioName,path, source, database,data['Id'],starttime)
			
			})
		start_recording(uniqueId,audioName, database, source,sessionid)
	
	}
	window.onload = function() {
	main();

};
  
 
