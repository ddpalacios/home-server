class Websocket_Session{
	#protocol
	constructor(sessionId, userId, username){
		this.sessionId = sessionId;
		this.userId = userId;
		this.username = username;
		this.session = null;
		this.#protocol = {
			"operation": null
            ,"request" : null
            ,'timestamp': new Date().toISOString()
            ,'sessionId': this.sessionId
			,'userId': this.userId
			,'username': this.username
            ,"content": null
            ,"is_notification": null
		}
	}
	close_all_connections(){
		let operation = "session";
		let request = "DELETE";
		this.#protocol['operation'] = operation;
		this.#protocol['request'] = request;
		this.session.send(JSON.stringify(this.#protocol))
	}
	send_message(message, is_notification){
		let operation = "message";
		let request = "POST";
		this.#protocol['operation'] = operation;
		this.#protocol['request'] = request;
		this.#protocol['content'] = message;
		this.#protocol['is_notification'] = is_notification;
		this.session.send(JSON.stringify(this.#protocol))
	}
	initialize(){
		this.session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/live_studio/session?Id='+this.sessionId);
		this.session.onopen = () => {
            console.log("Websocket connection established");
			let operation = "client";
			let request = "POST";
			this.#protocol['operation'] = operation;
			this.#protocol['request'] = request;
			this.session.send(JSON.stringify(this.#protocol))
        }
		this.session.onclose = () => {
            alert("Session Closed")

        }
	}
}



// function handle_message(data){
//         let username = data['username'];
//         let text = data['content']
//         let p = document.createElement('p');
//         let is_notification= data['is_notification']
//         if (is_notification){
//             p.innerHTML  = text;
//         }else{
//             p.innerHTML  = "<b>"+username+ ":</b> "+text;
//         }
//         let chat = document.getElementById('messages')
//         chat.appendChild(p);
//     }
    
// function send_message(message){
//         if (websocket_session == null){return;}
//         let username = sessionStorage.getItem("username");
//         let userid = sessionStorage.getItem("userId");
//         let sessionid = sessionStorage.getItem("sessionid");
//         let text = null;
//         let is_notification = 0;
//         if (message == null || message == undefined){
//             text = document.getElementById("messagebox").value
//             let p = document.createElement('p');
//             p.innerHTML  = "<b>"+username+ ":</b> "+text;
//             let chat = document.getElementById('messages')
//             chat.appendChild(p);
//         }else{
//             text = message
//             let p = document.createElement('p');
//             p.innerHTML  = text;
//             let chat = document.getElementById('messages')
//             chat.appendChild(p);
//             is_notification = 1
//         }
//         websocket_session.send(JSON.stringify({
//             "operation": "message"
//             ,"request" : "POST"
//             ,'username': username
//             ,'userid':userid
//             ,'timestamp': new Date().toISOString()
//             ,'sessionId': sessionid
//             ,"content": text
//             ,"is_notification": is_notification
//         }))
//         chat.scrollTop = chat.scrollHeight;
//         document.getElementById("messagebox").value = ''
//     }

// function load_messages(sessionid){
//         let data_request = new Request('/life-of-sounds/live_studio/session/messages?sessionId='+sessionid, {
//                     method: 'GET'
//                     ,headers: new Headers({
//                         'Accept': 'application/json'
//                         })
//                 });
//         fetch(data_request)
//             .then((response)=> response.json())
//             .then((data)=> {
//                 let messages = data['values'];
//                 messages.forEach(element => {
//                     console.log(element['username'],element['content'])
//                     let username = element['username'];
//                     let text = element['content']
//                     let is_notification = element['is_notification']
//                     let p = document.createElement('p');
//                     if (is_notification){
//                          p.innerHTML  = text;
//                     }else{
//                          p.innerHTML  = "<b>"+username+ ":</b> "+text;
//                     }
//                     let chat = document.getElementById('messages')
//                     chat.appendChild(p);
//                 });
//                 let chat = document.getElementById('messages')
//                 chat.scrollTop = chat.scrollHeight;
//             });
//     }

// function display_invitation_link(){
//          let message = "Invitation Link:"
//         let p = document.createElement('h1');
//         p.id = "invitation_title"
//         p.textContent = message;
//         let chat = document.getElementById('chat')
//         chat.appendChild(p);
//         let input = document.createElement('textarea');
//         input.id = "myInput"
//         input.rows = 5
//         input.cols = 10
//         input.wrap = "soft"
//         let cpy_btn = document.createElement('button');
//         cpy_btn.id = 'cpy_btn'
//         cpy_btn.style.marginTop = "10px"
//         cpy_btn.textContent = "Copy URL"
//         cpy_btn.className = "create-btn"
//         cpy_btn.onclick = function () {
//             var copyText = document.getElementById("myInput");
//                 copyText.select();
//                 copyText.setSelectionRange(0, 99999); // For mobile devices
//                 navigator.clipboard.writeText(copyText.value);
//                 cpy_btn.textContent = "Copied!"
//             }
//         input.value = window.location.href 
//         input.disabled= true;
//         chat = document.getElementById('chat')
//         chat.appendChild(input);
//         chat.appendChild(cpy_btn);
//     }   

// function removeElement(id) {
//         var elem = document.getElementById(id);
//         return elem.parentNode.removeChild(elem);
//     }

// function hide_activated_session(){
//         document.getElementById("stop_session").style.display = "none";
//         document.getElementById("username").hidden = true;
//         document.getElementById("sessionname").hidden = true;

//         document.getElementById("create_session").style.display = "inline-block";
//         let chat = document.getElementById('messages');
//         chat.innerHTML = "";
//         removeElement('myInput')
//         removeElement('invitation_title')
//         removeElement('cpy_btn')
//         removeElement('spantext1')
//         removeElement('spantext2')
//     }
    
// function display_activated_session(sessionid, username, isHost){
//         document.getElementById("create_session").style.display = "none";
//         let sessionname = sessionStorage.getItem("sessionname");
//         document.getElementById("sessionname").hidden = false
//         document.getElementById("sessionname").value = sessionname
//         document.getElementById("stop_session").style.display = "inline-block";
//         if (isHost==0){
//             document.getElementById("stop_session").style.backgroundColor = "#FFC107";
//             document.getElementById("stop_session").value = "Leave Session";
//             document.getElementById("stop_session").onclick = function (){
//                 location.href = "live_studio"  
//                 }
//         }else{
//             display_invitation_link()
//         }

//         const container = document.getElementById('username-container');
//         const slable = document.createElement('span'); 
//         slable.id = 'spantext1'
//         slable.textContent = "Session: ";
//         slable.setAttribute('for', 'sessionanme'); 
//         slable.style.display = 'block'; 
//         slable.style.marginBottom = '5px';
//         const sessionname_input = document.getElementById('sessionname');
//         container.insertBefore(slable, sessionname_input);
//     }

// function start_websocket(sessionid, userid,username, isHost){
// 		if (websocket_session != null){return;}
// 				websocket_session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/live_studio/session?Id='+sessionid);
			// 	websocket_session.onopen = () => {
			// 		console.log("Websocket connection established");                    
					// websocket_session.send(JSON.stringify({
					// 	'operation': "client"
					// 	,"request" : "POST"
					// 	,'sessionId': sessionid
					// 	,'userid': userid
					// 	,'name': username
					// }))           
			// 		display_activated_session(sessionid, username, isHost);
			// }
		
// 			websocket_session.onmessage = (event) => {
// 				console.log("Message from server", event.data);
// 				let data = JSON.parse(event.data)
// 				if (data['operation'] == 'message'){
// 					handle_message(data);
// 				}else if (data['request'] == 'PATCH' && data['operation'] == 'session'){
// 					let name = data['name'];
// 					document.getElementById("sessionname").value = name
// 				}
// 				else if (data['request'] == 'DELETE' && data['operation'] == 'session'){
// 					websocket_session.close()
// 				}
// 				else if (data['request'] == 'POST' && data['operation'] == 'client'){
// 					let username = data['name'];
// 					let new_login = data['new_login'];
// 					if (new_login){
// 						let text = "<b>"+username+"</b> has joined the chat.";
// 						send_message(text)
// 					}
// 				}
// 			}
// 			websocket_session.onclose = () => {
// 		        hide_activated_session();
// 				alert("Websocket connection closed");
// 				location.href = 'https://' + window.location.host  +'/life-of-sounds/live_studio'
// 	}
//     }