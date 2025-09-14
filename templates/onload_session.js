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

function generate() {
		return nameList[Math.floor( Math.random() * nameList.length )] + " " + nameList[Math.floor( Math.random() * nameList.length )];
	};

    
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

    // document.getElementById("show_chat").onclick = function () {
    //     document.getElementById("show_chat").style.display = "none";
    //     document.getElementById("hide_chat").style.display = "inline-block";
    //     document.getElementById("chatbox").hidden = false;
    //     // windowResize()
    
        
    // }
    
    // document.getElementById("hide_chat").onclick = function () {
    //     document.getElementById("hide_chat").style.display = "none";
    //     document.getElementById("show_chat").style.display = "inline-block";
    //     document.getElementById("chatbox").hidden = true;
    //     // windowResize()

    // }


function display_invitation_link(){
    let chat = document.getElementById('chatbox')
    let input = document.createElement('p');
    input.id = 'myInput'

    input.style.textAlign = "center"
    input.style.color = "white"
    input.style.cursor = 'default'
    input.innerText = window.location.href 
    chat.appendChild(input);
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
            var copyText = document.getElementById("myInput");
            console.log()
                navigator.clipboard.writeText(copyText.textContent);
                cpy_btn.textContent = "Copied!"
            }
    chat.appendChild(cpy_btn)

    }   

    function display_session(sessionName,current_user){
        var chatbox =  document.getElementById("chatbox");
        var session_btn =  document.getElementById("session_btn");
        const sessionName_header = document.createElement("h1");
        sessionName_header.innerHTML = sessionName
        sessionName_header.style.color = 'white'
        sessionName_header.style.textAlign = 'center'
        sessionName_header.style.cursor = 'pointer'
        sessionName_header.contentEditable = true
        sessionName_header.addEventListener("input", function() {
            console.log(this.textContent)
        });
        chatbox.appendChild(sessionName_header)
        session_btn.textContent = "Stop Session"
        session_btn.style.backgroundColor = 'rgba(152, 0, 0, 0.551)';
        session_btn.addEventListener('mouseover', function () {
        session_btn.style.backgroundColor = 'rgba(152, 0, 0, 0.815)'; 
        });
        session_btn.addEventListener('mouseout', function () {
            session_btn.style.backgroundColor = 'rgba(152, 0, 0, 0.551)';
        });
        display_invitation_link()
        const username_title = document.createElement("p");
        username_title.innerHTML = "Your Username:"
        username_title.style.color = 'white'
        username_title.style.textAlign = 'center'
        username_title.style.cursor = 'default'
        chatbox.appendChild(username_title)

        const username_header = document.createElement("h3");
        username_header.innerHTML = current_user['fullname']
        username_header.style.color = 'white'
        username_header.style.textAlign = 'center'
        username_header.style.cursor = 'pointer'
        username_header.contentEditable = true
        username_header.addEventListener("input", function() {
            console.log(this.textContent)
        });
        chatbox.appendChild(username_header)


        const chats_div = document.createElement("div");
        chats_div.id = 'messages'
        chats_div.style.cursor = 'default'
        chats_div.style.scrollbarWidth = "thin";    
        chats_div.style.scrollBehavior = "smooth";
        chats_div.style.maxHeight = "400px";  
        chats_div.style.overflowY = "auto";  
        chats_div.style.overflowX = "hidden"; 

        chats_div.style.padding = "0.5em";

        for (let i=0; i< 10; i++){
        var t = document.createElement("p")
        t.innerHTML = "From User: HELLO!!!"
        t.style.color = "white"
        t.style.cursor = "default"
        chats_div.appendChild(t)
        chats_div.scrollTop = chats_div.scrollHeight;

        }
      
        chatbox.appendChild(chats_div)



        




        const message_box = document.createElement("textarea");
        const send_btn = document.createElement("button");
        send_btn.className = 'buttons'
        send_btn.style.marginBottom = "10px"
        send_btn.textContent = "Send"
        send_btn.style.position = 'absolute'
        send_btn.style.bottom = 0
        send_btn.style.left = 0
        chatbox.appendChild(send_btn)

        message_box.rows = 5 
        message_box.style.position ="absolute"
        message_box.cols = 45
        message_box.style.resize = "none"
        message_box.style.backgroundColor = "rgba(180, 217, 249, 0.04)"
        message_box.style.color = 'white'
        message_box.style.width = '95%'
        message_box.style.cursor = 'text'
        message_box.style.bottom = send_btn.offsetHeight + 'px'; 
        message_box.style.marginBottom = "15px"
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



        chatbox.appendChild(message_box)



    }

    document.getElementById("session_btn").onclick =  async function () {
        let sessionName = prompt("Session Name:", "The "+generate()+ " Session");
        var current_user = await get_user();
        console.log(current_user)
        display_session(sessionName, current_user)


//   <textarea id="messagebox" rows="5" cols="45" style="width: 100%;" wrap="soft" onkeypress="onTestChange();" placeholder="Type a message here..." ></textarea>

            // let userId = sessionStorage.getItem("userId");
            // let username = sessionStorage.getItem("username");
            // if (userId == null || userId == undefined){
            //     alert("Error Retrieving User Info")
            //     return;
            // }
            // let sessionName = prompt("Session Name:", "The "+generate()+ " Session");
            // var request = new Request('/life-of-sounds/live_studio/session', {
            //                 method: 'POST',
            //                 headers: new Headers({
            //                             'Accept': 'application/json',
            //                             'Content-Type': 'text/json'
            //                         })
            //                 ,body: JSON.stringify({'name': sessionName,'userid': userId,'username':username})});
            //     fetch(request)
            //             .then((response)=> response.json())
            //             .then((data)=> {
            //                 if (data.hasOwnProperty("sessionId")){
            //                     location.hash = "session=" + data['sessionId'];
            //                     let sessionname = data['name']
            //                     let sessionid =  data['sessionId'];
            //                     sessionStorage.setItem("sessionid",sessionid);
            //                     sessionStorage.setItem("sessionname",sessionname);
            //                     let isHost = 1
            //                     start_websocket(sessionid, userId,username, isHost);
            //                 }
            //             });
        
    }

    // document.getElementById("stop_session").onclick = function () {
    //     let sessionId = sessionStorage.getItem("sessionid");
    //      websocket_session.send(JSON.stringify({
    //                 'operation': "session"
    //                 ,"request" : "DELETE"
    //                 ,'sessionId': sessionId
    //             }))
    //     var request = new Request('life-of-sounds/live_studio/session?Id='+sessionId, {
    //                 method: 'DELETE',
    //                 headers: new Headers({
    //                             'Accept': 'application/json'
    //                         })
    //     });
	// 	fetch(request)
    //     websocket_session.close()
    // }

    // window.addEventListener("load", function(){
    //      get_user()
    // })
    