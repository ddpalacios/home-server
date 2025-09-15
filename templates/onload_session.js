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

    function start_session(sessionId, current_user){
        websocket = new Websocket_Session(sessionId,current_user['Id']);
        websocket.initialize()
       
        websocket.session.onmessage = (event) => {
            console.log("Message from server", event.data);
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
    async function create_user(){
            var request = new Request('live_studio/user', {
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
         var request = new Request('live_studio/user', {
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
    function generate() {
		return nameList[Math.floor( Math.random() * nameList.length )] + " " + nameList[Math.floor( Math.random() * nameList.length )];
	};
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
            cpy_btn.style.backgroundColor = 'rgba(4, 200, 4, 0.9)';
            navigator.clipboard.writeText(window.location.href );
            cpy_btn.textContent = "Copied!"
            setTimeout(function(){ 
                 cpy_btn.textContent = "Copy Invitation URL"
                }, 2000);
            }
    chatbox_contents_div.appendChild(cpy_btn)

    }   
    function display_session_button(){
        var chatbox =  document.getElementById("chatbox");
        var session_btn =  document.getElementById("session_btn");
        var stop_session_btn = document.createElement("button")
        stop_session_btn.textContent = "Stop Session"
        stop_session_btn.style.marginTop = "10px"
        stop_session_btn.style.backgroundColor = 'rgba(152, 0, 0, 0.551)';
        stop_session_btn.addEventListener('mouseover', function () {
            stop_session_btn.style.backgroundColor = 'rgba(152, 0, 0, 0.815)'; 
        });
        stop_session_btn.addEventListener('mouseout', function () {
            stop_session_btn.style.backgroundColor = 'rgba(152, 0, 0, 0.551)';
        });
        stop_session_btn.className = "buttons"
        session_btn.style.display = "none"
        
        
        stop_session_btn.onclick = function(){
            let sessionId = sessionStorage.getItem("sessionId")
            var request = new Request('life-of-sounds/live_studio/session?Id='+sessionId, {
                                method: 'DELETE',
                                headers: new Headers({
                                            'Accept': 'application/json'
                                        })
                    });
            fetch(request)
            session_btn.style.display = "inline-block"
            stop_session_btn.style.display = "none"
            var chatbox_contents =  document.getElementById("chatbox_contents");
            var chatbox =  document.getElementById("chatbox");
            chatbox.removeChild(chatbox_contents)
        }


        chatbox.append(stop_session_btn);
    }  

    function add_message_to_chat(current_user, message){
        let username = current_user['fullname']
        let p = document.createElement('p');
        p.style.cursor = 'default'
        p.style.color = 'white'
        p.innerHTML  = "<b>"+username+ ":</b>   "+message;
        let chat = document.getElementById('messages')
        chat.appendChild(p);
    }

    function send_message(current_user){
        const messagebox = document.getElementById("messagebox");
        text = document.getElementById("messagebox").value
        add_message_to_chat(current_user, text)
        websocket.send_message(text, 0)
        document.getElementById("messagebox").value = ''
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
        var chatbox =  document.getElementById("chatbox");
        var chatbox_contents_div = document.createElement("div");

        chatbox_contents_div.id = "chatbox_contents"
        chatbox_contents_div.style.cursor = 'default'


        const sessionName_header = document.createElement("h1");
        sessionName_header.innerHTML = sessionName
        sessionName_header.style.color = 'white'
        sessionName_header.style.textAlign = 'center'
        sessionName_header.style.cursor = 'pointer'
        sessionName_header.contentEditable = true
        sessionName_header.addEventListener("input", function() {
            console.log(this.textContent)
        });
        chatbox_contents_div.appendChild(sessionName_header);
        
        display_invitation_link(chatbox_contents_div);

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
        username_header.style.cursor = 'pointer'
        username_header.contentEditable = true
        username_header.addEventListener("input", function() {
            console.log(this.textContent)
        });
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

        // for (let i=0; i< 10; i++){
        // var t = document.createElement("p")
        // t.innerHTML = "From User: HELLO!!!"
        // t.style.color = "white"
        // t.style.cursor = "default"
        // chats_div.appendChild(t)
        // chats_div.scrollTop = chats_div.scrollHeight;

        // }
      
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
        chatbox_contents_div.appendChild(message_box)
        chatbox.appendChild(chatbox_contents_div)
    }
    document.getElementById("session_btn").onclick =  async function () {
        let sessionName = prompt("Session Name:", "The "+generate()+ " Session");
        if (sessionName == null){
            alert("No Session Created.")
            return
        }
        var current_user = await get_user();
        console.log(current_user)
        var newSession = await create_session(sessionName, current_user);
        if (newSession == null){
            alert("Error Creating New Session")
        }
        console.log(newSession)
        sessionStorage.setItem("sessionId", newSession['sessionId'])
        location.hash = "session=" + newSession['sessionId'];
        display_session_button();
        display_session(sessionName, current_user);
        start_session(newSession['sessionId'], current_user)
    }
    window.addEventListener("load", async function(){
         let current_user = await get_user();
         console.log(current_user)
         let userId = current_user['Id']
         let current_session = await get_session_by_userId(userId);
         if (current_session['values'].length ==0){
         }else{
            console.log(current_session)
            sessionStorage.setItem("sessionId", current_session['values'][0]['sessionid'])
            display_session_button();
            display_session(current_session['values'][0]['name'], current_user);
            start_session(current_session['values'][0]['sessionid'], current_user)
         }
    })
    