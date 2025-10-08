    var nameList = [
	'Time','Past','Future','Dev',
	'Fly','Flying','Soar','Soaring','Power','Falling',
	'Fall','Jump','Cliff','Mountain','Rend','Red','Blue',
	'Green','Yellow','Gold','Demon','Demonic','Panda','Cat',
	'Kitty','Kitten','Zero','Memory','Trooper','XX','Bandit',
	'Fear','Light','Glow','Tread','Deep','Deeper','Deepest',
	'Mine','Your','Worst','Enemy','Hostile','Force','Video',
	'Game','Donkey','Mule','Colt','Cult','Cultist','Magnum',
	'Gun','Assault','Recon','Trap','Trapper','Redeem','Code',
	'Script','Writer','Near','Close','Open','Cube','Circle',
	'Geo','Genome','Germ','Spaz','Shot','Echo','Beta','Alpha',
	'Gamma','Omega','Seal','Squid','Money','Cash','Lord','King',
	'Duke','Rest','Fire','Flame','Morrow','Break','Breaker','Numb',
	'Ice','Cold','Rotten','Sick','Sickly','Janitor','Camel','Rooster',
	'Sand','Desert','Dessert','Hurdle','Racer','Eraser','Erase','Big',
	'Small','Short','Tall','Sith','Bounty','Hunter','Cracked','Broken',
	'Sad','Happy','Joy','Joyful','Crimson','Destiny','Deceit','Lies',
	'Lie','Honest','Destined','Bloxxer','Hawk','Eagle','Hawker','Walker',
	'Zombie','Sarge','Capt','Captain','Punch','One','Two','Uno','Slice',
	'Slash','Melt','Melted','Melting','Fell','Wolf','Hound',
	'Legacy','Sharp','Dead','Mew','Chuckle','Bubba','Bubble','Sandwich',
	'Smasher','Extreme','Multi','Universe','Ultimate','Death','Ready','Monkey',   'Elevator','Wrench','Grease','Head','Theme','Grand','Cool','Kid','Boy',
	'Girl','Vortex','Paradox'
	];
    var websocket = null;
    function randomLightColor() {
        const r = Math.floor(150 + Math.random() * 105); 
        const g = Math.floor(150 + Math.random() * 105);
        const b = Math.floor(150 + Math.random() * 105);
        return `rgb(${r}, ${g}, ${b})`;
    } 
 
    function getCursorPosition(canvas, event) {
        const rect = canvas.getBoundingClientRect()
        var x = event.clientX - rect.left
        var y = event.clientY - rect.top
        var current_x = Math.floor(x/pixel_size)
        var current_y = Math.floor(y/pixel_size)
        let active_cells = []
        color = randomLightColor();
        for (let i=0; i<mag_view_h*10; i++){
                for (let j=0; j<mag_view_w*10; j++){
                    gol.grid[current_y+i][current_x + j] =1
                    }
            }
        if (websocket != null){
            websocket.send_payload({'grid_x': current_x, 'grid_y': current_y})
        }

}     

	   /*
        for (let i=0; i<mag_view_h*10; i++){
                for (let j=0; j<mag_view_w*10; j++){
                    gol.grid[current_y+i][current_x + j] =1
                    active_cells.push({'x': current_x + j, 'y': current_y+i})
                    }
            }
        if (websocket != null){
            websocket.send_payload(active_cells)
        }
	*/

    function mouseMove(e){
        e.preventDefault();
        cPostX = e.pageX - canvas.offsetLeft;
        cPostY = e.pageY - canvas.offsetTop;
        mouse_x = cPostX;
        mouse_y = cPostY;
        if (websocket != null){
            websocket.send_coordinates(mouse_x, mouse_y)
        }

        var current_x = Math.floor(mouse_x/pixel_size)
        var current_y = Math.floor(mouse_y/pixel_size)
        // gol.grid[current_y][current_x] = 1
        // let active_cells = []
        // for (let i=0; i<mag_view_h; i++){
        //         for (let j=0; j<mag_view_w; j++){
        //             gol.grid[current_y+i][ current_x + j] =1
        //             active_cells.push({'x': current_x + j, 'y': current_y+i})
        //         }
        //     }

        //  if (websocket != null){
        //     websocket.send_payload(active_cells)
        // }
	}
    function draw_host_cursor(){
        ctx.beginPath();
        ctx.lineWidth = "1";
        ctx.strokeStyle = "red";
        var s = pixel_size*2 
        for (let i=0; i<mag_view_h; i++){
            for (let j=0; j<mag_view_w; j++){
                ctx.rect(mouse_x+(s*j) ,  mouse_y+(s*i), s, s);
            }
        }
            ctx.stroke();
            ctx.closePath();
        }

    function draw_client_cursor(){
        ctx.beginPath();
        ctx.lineWidth = "1";
        ctx.strokeStyle = "blue";
        let current_userId = sessionStorage.getItem('userId');
        var s = pixel_size*2 
        for (const [key, value] of connected_clients) {
            if (key != current_userId){
                let client_x = value['x']
                let client_y = value['y']
                for (let i=0; i<mag_view_h; i++){
                    for (let j=0; j<mag_view_w; j++){
                        ctx.rect(client_x+(s*j) , client_y+(s*i), s, s);
                    }
                }
            }
        }
        ctx.stroke();
        ctx.closePath();
	}
    function start_session(sessionId, current_user){
        websocket = new Websocket_Session(sessionId,current_user['Id'],current_user['fullname']);
        websocket.initialize()
        websocket.session.onmessage = async (event) => {
                let data = JSON.parse(event.data)
		console.log("Message from server",data)
                if (data['operation'] == 'message'){
                    let content = data['content']
                    let is_notification = data["is_notification"]
                    let username = data['username']
                    add_message_to_chat(username, content, is_notification)
                }
                else if (data['request'] == 'DELETE' && data['operation'] == 'session'){
                    // console.log("Message from server", event.data);
                    
                    websocket.session.close()
                    location.href = "/game_of_life/"
                }
                else if (data['operation'] == 'coordinates' && data['request'] == 'MOUSE'){
                    let client_x = data['content']['x']
                    let client_y = data['content']['y']
                    if (connected_clients.has(data['userId']) == true){
                            connected_clients.set(data['userId'], {'x': client_x, 'y':client_y})
                        }
                }
                else if (data['operation'] == 'client' && data['request'] == 'POST'){
                    let clients = await websocket.get_clients()
                    clients['values'].forEach(client => {
                        if (connected_clients.has(client['userId']) == false){
                            connected_clients.set(client['userId'], {'x': 0, 'y':0})
                        }
                    });
                }
                else if (data['operation'] == 'send' && data['request'] == 'PAYLOAD'){
			var current_y = data['content']['grid_y']
			var current_x = data['content']['grid_x']

			for (let i=0; i<mag_view_h*10; i++){
				for (let j=0; j<mag_view_w*10; j++){
				    gol.grid[current_y+i][current_x + j] =1
				    }
			    }
                }

        }
    }
    async function get_session_by_sessionId(sessionId){
		var request = new Request('life-of-sounds/session?Id='+sessionId, {
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
    async function get_session_by_userId(userId){
		var request = new Request('life-of-sounds/session?userId='+userId, {
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
    async function start_page(user){
        if (window.location.hash){
            let isHost = 0
            let sessionid = window.location.hash.split("session=")[1]
            sessionStorage.setItem("sessionid", sessionid)
            var request = new Request('life-of-sounds/session?userId='+user['Id'], {
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
    async function create_user(){
            var request = new Request('/life-of-sounds/user', {
                                method: 'POST',
                                headers: new Headers({
                                            'Accept': 'application/json'
                                        })
			       ,body: JSON.stringify({
					       "username": generate()
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
         var request = new Request('/life-of-sounds/user', {
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
         var request = new Request('/life-of-sounds/session', {
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
    function generate() {
		return nameList[Math.floor( Math.random() * nameList.length )] + " " + nameList[Math.floor( Math.random() * nameList.length )];
	};
    function display_invitation_link(chatbox_contents_div){
        let cpy_btn = document.createElement('button');
        cpy_btn.className = 'buttons'
        cpy_btn.textContent = "Copy Invitation URL"
        cpy_btn.style.backgroundColor ='rgba(4, 241, 83, 0.364)';
                cpy_btn.addEventListener('mouseover', function () {
                cpy_btn.style.backgroundColor = 'rgba(4, 200, 4, 0.9)';
                });
                cpy_btn.addEventListener('mouseout', function () {
                    cpy_btn.style.backgroundColor = 'rgba(4, 241, 83, 0.364)';
                });

        cpy_btn.onclick = function () {
                let sessionId = sessionStorage.getItem("sessionId");
                cpy_btn.style.backgroundColor = 'rgba(4, 200, 4, 0.9)';
                navigator.clipboard.writeText(window.location.href + "session/join?Id="+sessionId );
                cpy_btn.textContent = "Copied!"
                setTimeout(function(){ 
                    cpy_btn.textContent = "Copy Invitation URL"
                    }, 2000);
                }
        chatbox_contents_div.appendChild(cpy_btn)

    }   
    function display_session_button(){
        let isHost = sessionStorage.getItem('isHost');
        var chatbox =  document.getElementById("chatbox");
        var session_btn =  document.getElementById("session_btn");

        
        var stop_session_btn = document.createElement("button")
        stop_session_btn.style.marginTop = "10px"

        
        stop_session_btn.textContent = "Stop Session"
        let default_color =  'rgba(152, 0, 0, 0.551)'
        let onhover_color = 'rgba(152, 0, 0, 0.815)'; 
        if (isHost == 'false'){
            stop_session_btn.textContent = "Leave Session"
            default_color =  'rgba(152, 147, 0, 0.55)'
            onhover_color = 'rgba(147, 152, 0, 0.81)'; 
            stop_session_btn.onclick = function(){
               location.href = "/game_of_life/"
            }
        }else{
            stop_session_btn.onclick = function(){
                let sessionId = sessionStorage.getItem("sessionId")
                var request = new Request('life-of-sounds/session?Id='+sessionId, {
                                    method: 'DELETE',
                                    headers: new Headers({
                                                'Accept': 'application/json'
                                            })
                        });
                fetch(request)
                websocket.close_all_connections();
                location.href = "/game_of_life/"
                // session_btn.style.display = "inline-block"
                // stop_session_btn.style.display = "none"
                // var chatbox_contents =  document.getElementById("chatbox_contents");
                // var chatbox =  document.getElementById("chatbox");
                // chatbox.removeChild(chatbox_contents)
                websocket = null;
            }
        }

        stop_session_btn.style.backgroundColor = default_color
        stop_session_btn.addEventListener('mouseover', function () {
            stop_session_btn.style.backgroundColor = onhover_color
        });
        stop_session_btn.addEventListener('mouseout', function () {
            stop_session_btn.style.backgroundColor = default_color
        });
        stop_session_btn.className = "buttons"
        session_btn.style.display = "none"
        
        chatbox.append(stop_session_btn);
    }  
    function add_message_to_chat(username, message, is_notification){
        let p = document.createElement('p');
        p.style.cursor = 'default'
        p.style.color = 'white'
        if (is_notification){
            p.innerHTML  = message;
        }else{
            p.innerHTML  = "<b>"+username+ ":</b> "+message;
            }
        let chat = document.getElementById('messages')
        chat.appendChild(p);
        chat.scrollTop = chat.scrollHeight;
    }
    function send_message(current_user){
        const messagebox = document.getElementById("messagebox");
        let text = document.getElementById("messagebox").value
        text = text.replace("`","")
        text = text.replace("\\", "")
        text = text.replace("'", "")
        add_message_to_chat(current_user['fullname'], text, 0)
        websocket.send_message(current_user['fullname'],text, 0)
        document.getElementById("messagebox").value = ''
        let chat = document.getElementById('messages')
        chat.scrollTop = chat.scrollHeight;
    }
    function load_messages(current_user, sessionId){
        let data_request = new Request('/life-of-sounds/live_studio/session/messages?sessionId='+sessionId, {
                    method: 'GET'
                    ,headers: new Headers({
                        'Accept': 'application/json'
                        })
                });
        fetch(data_request)
            .then((response)=> response.json())
            .then((data)=> {
                let messages = data['values'];
		        
                console.log(messages);
                messages.forEach(element => {
                    let text = element['content']
                    let is_notification = element['is_notification']
                    add_message_to_chat(element['username'], text, is_notification)
                });
                let chat = document.getElementById('messages')
                chat.scrollTop = chat.scrollHeight;
            });
    }
    function listenToSubmit(event, current_user){
        var key = event.keyCode;
        if (key === 13) {
            event.preventDefault();
            send_message(current_user)
            return false;
        }
        else {
            return true;
        }
    }
    function display_session(sessionName,current_user){
        let isHost = sessionStorage.getItem('isHost');
        var chatbox =  document.getElementById("chatbox");
        var chatbox_contents_div = document.createElement("div");

        chatbox_contents_div.id = "chatbox_contents"
        chatbox_contents_div.style.cursor = 'default'

        const sessionName_header = document.createElement("h1");
        sessionName_header.innerHTML = sessionName
        sessionName_header.style.color = 'white'
        sessionName_header.style.textAlign = 'center'
        sessionName_header.style.cursor = 'default'
        // sessionName_header.contentEditable = true
        // sessionName_header.addEventListener("input", function() {
        //     console.log(this.textContent)
        // });
        chatbox_contents_div.appendChild(sessionName_header);
        
        if (isHost == 'true'){
            display_invitation_link(chatbox_contents_div);
        }

        const username_title = document.createElement("p");
        username_title.innerHTML = "Your Username:"
        username_title.style.color = 'white'
        username_title.style.textAlign = 'center'
        username_title.style.cursor = 'default'
        chatbox_contents_div.appendChild(username_title)

        const username_header = document.createElement("h3");
        username_header.innerHTML = current_user['fullname']
        username_header.style.color = 'white'
        username_header.style.textAlign = 'center'
        username_header.style.cursor = 'default'
        // username_header.contentEditable = true
        // username_header.addEventListener("input", function() {
        //     console.log(this.textContent)
        // });
        chatbox_contents_div.appendChild(username_header)


        const chats_div = document.createElement("div");
        chats_div.id = 'messages'
        chats_div.style.cursor = 'default'
        chats_div.style.scrollbarWidth = "thin";    
        chats_div.style.scrollBehavior = "smooth";
        chats_div.style.maxHeight = "400px";  
        chats_div.style.overflowY = "auto";  
        chats_div.style.overflowX = "hidden"; 

        chatbox_contents_div.style.padding = "0.5em";
        chatbox_contents_div.appendChild(chats_div)


        const message_box = document.createElement("textarea");
        message_box.id = "messagebox"
        message_box.addEventListener("keypress", (e) => {
            listenToSubmit(e, current_user);
        });
        const send_btn = document.createElement("button");
        send_btn.className = 'buttons'
        send_btn.style.marginBottom = "10px"
        send_btn.textContent = "Send"
        send_btn.style.position = 'absolute'
        send_btn.style.bottom = 0
        send_btn.style.left = 0
        chatbox_contents_div.appendChild(send_btn)

        message_box.rows = 5 
        message_box.style.position ="absolute"
        message_box.cols = 45
        message_box.style.resize = "none"
        message_box.style.backgroundColor = "rgba(180, 217, 249, 0.04)"
        message_box.style.color = 'white'
        message_box.style.width = '95%'
        message_box.style.cursor = 'text'
        message_box.style.bottom = send_btn.offsetHeight + 'px'; 
        message_box.style.marginBottom = "55px"
        message_box.style.marginLeft = "5px"
        message_box.style.left = 0
        message_box.style.textWrap = 'soft'
        message_box.placeholder = "Type a message here..."
        send_btn.style.backgroundColor ='rgba(4, 241, 83, 0.364)';
        send_btn.addEventListener('mouseover', function () {
        send_btn.style.backgroundColor = 'rgba(4, 200, 4, 0.9)';
        });
        send_btn.addEventListener('mouseout', function () {
            send_btn.style.backgroundColor = 'rgba(4, 241, 83, 0.364)';
        });
        send_btn.onclick = function(){
            send_message(current_user)
        }
        chatbox_contents_div.appendChild(message_box)
        chatbox.appendChild(chatbox_contents_div)
    }
    function draw(){
        ctx.clearRect(0, 0, canvas.width, canvas.height);
       draw_host_cursor();
        draw_client_cursor();
        gol.initialize();
        gol.updateGrid();
        gol.draw_grid();
        requestAnimationFrame(draw);
    }
    document.getElementById("session_btn").onclick =  async function () {
        let sessionName = prompt("Session Name:", "The "+generate()+ " Session");
        if (sessionName == null){
            alert("No Session Created.")
            return
        }
        var current_user = await get_user();
        var newSession = await create_session(sessionName, current_user);
        if (newSession == null){
            alert("Error Creating New Session")
        }
        sessionStorage.setItem("sessionId", newSession['sessionId'])
        sessionStorage.setItem("isHost", true)
        display_session_button();
        display_session(sessionName, current_user);
        start_session(newSession['sessionId'], current_user)
    }
    document.getElementById("chatbox_btn").onclick = function(){
        var chatbox =  document.getElementById("chatbox");
        var content =  document.getElementById("content");
        var chatbox_btn =  document.getElementById("chatbox_btn");
        if (chatbox.style.display != 'none'){
            chatbox.style.display = "none"
            content.style.height = "0px"
            chatbox_btn.textContent = "View Chat"
            chatbox_btn.style.backgroundColor ='rgba(4, 200, 4, 0.9)';
            chatbox_btn.addEventListener('mouseover', function () {
            chatbox_btn.style.backgroundColor = 'rgba(4, 200, 4, 0.9)';
            });
            chatbox_btn.addEventListener('mouseout', function () {
                chatbox_btn.style.backgroundColor = 'rgba(4, 241, 83, 0.364)';
            });
           
        }else{
            chatbox.style.display = 'inline-block'
            chatbox_btn.textContent = "Hide Chat"
            chatbox_btn.style.backgroundColor = 'rgba(152, 0, 0, 0.815)'
            chatbox_btn.addEventListener('mouseover', function () {
            chatbox_btn.style.backgroundColor = 'rgba(152, 0, 0, 0.815)'; 
            });
            chatbox_btn.addEventListener('mouseout', function () {
                chatbox_btn.style.backgroundColor = 'rgba(152, 0, 0, 0.551)';
            });
            content.style.height = "";
        }
    }
    window.addEventListener("load", async function(){
        let current_user = await get_user();
        let userId = current_user['Id']
        let current_session = null;
        let sessionId = null;
        let sessionName = null;
        this.sessionStorage.setItem("userId", userId);

        if (this.window.location.href.includes("session/join?Id=")){
            sessionId = this.window.location.href.split("session/join?Id=")[1];
            if (sessionId != '' && sessionId.length > 0){
                current_session = await get_session_by_sessionId(sessionId)
                if (current_session == null){
                    this.alert("Session Not Found"); 
                    return;
                }
                sessionName = current_session['name']
                this.sessionStorage.setItem("isHost", false)
            }else{
                this.alert("Invalid Join Session ID")
            }
	 }
	else{
            current_session = await get_session_by_userId(userId);
            if (current_session == null){
                    this.alert("Session Retrieval Server Error"); 
                    return;
                }
		console.log(current_session);
            if (current_session['values'].length > 0){
                sessionId = current_session['values'][0]['sessionid']
                sessionName = current_session['values'][0]['name']
                this.sessionStorage.setItem("isHost", true)
	    }
    }
        if (sessionId != null && sessionName != null){
                sessionStorage.setItem("sessionId", sessionId)
                display_session_button();
                display_session(sessionName, current_user);
                load_messages(current_user, sessionId);
                start_session(sessionId, current_user);
            }
    })
/*
        let current_user = await get_user();
        let userId = current_user['Id']
        let current_session = null;
        let sessionId = null;
        let sessionName = null;
        this.sessionStorage.setItem("userId", userId)

        if (this.window.location.href.includes("session/join?Id=")){
            sessionId = this.window.location.href.split("session/join?Id=")[1];
            if (sessionId != '' && sessionId.length > 0){
                current_session = await get_session_by_sessionId(sessionId)
                if (current_session == null){
                    this.alert("Session Not Found"); 
                    return;
                }
                sessionName = current_session['name']
                this.sessionStorage.setItem("isHost", false)
            }else{
                this.alert("Invalid Join Session ID")
            }
        }else{
            current_session = await get_session_by_userId(userId);
            if (current_session == null){
                    this.alert("Session Retrieval Server Error"); 
                    return;
                }
            if (current_session['values'].length > 0){
                sessionId = current_session['values'][0]['sessionid']
                sessionName = current_session['values'][0]['name']
                this.sessionStorage.setItem("isHost", true)
            }
        }
        if (sessionId != null && sessionName != null){
                sessionStorage.setItem("sessionId", sessionId)
                display_session_button();
                display_session(sessionName, current_user);
                load_messages(current_user, sessionId);
                start_session(sessionId, current_user);
            }
    })

*/
    canvas.addEventListener('mousedown', function(e) {
	getCursorPosition(canvas, e)
    })
    canvas.addEventListener("mousemove", mouseMove, false);
    draw()
