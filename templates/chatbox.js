
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

function onTestChange(){
        var key = window.event.keyCode;
        if (key === 13) {
            event.preventDefault();
            send_message(null);
            return false;
        }
        else {
            return true;
        }
    }

function change_sessionname(){
        let new_sessionname = document.getElementById('sessionname').value
        let old_sessionname = sessionStorage.getItem("sessionname");
        let userid = sessionStorage.getItem("userid");
        let username = sessionStorage.getItem("username");
        let sessionId = window.location.hash.split("session=")[1]

        var request = new Request('/life-of-sounds/live_studio/session', {
                            method: 'PATCH',
                            headers: new Headers({
                                        'Accept': 'application/json',
                                        'Content-Type': 'text/json'
                                    })
                            ,body: JSON.stringify({
                                "sessionId":sessionId
                                ,"name":new_sessionname
                            })
                    });
        fetch(request)
        .then((response) => {
            if (response.status == 200){ 
                let message =  "**<b>"+username+"</b> changed the session name to <b>"+ new_sessionname+"</b>"
                if (websocket_session == null || websocket_session == undefined){return}

                websocket_session.send(JSON.stringify({
                      "operation": "session"
                        ,"request" : "PATCH"
                        ,'name': new_sessionname
                        ,'sessionId': sessionId
                }))
                sessionStorage.setItem("sessionname", new_sessionname);
                send_message(message)
            }else{
                alert("Error Changing Username")
            }
        })
        
    }

function change_username(){
        // if (websocket_session == null){return}
        let new_username = document.getElementById('username').value
        let old_username = sessionStorage.getItem("username");
        let userid = sessionStorage.getItem("userId");
        let sessionname = sessionStorage.getItem("sessionname");

        var request = new Request('/life-of-sounds/live_studio/client', {
                            method: 'PATCH',
                            headers: new Headers({
                                        'Accept': 'application/json',
                                        'Content-Type': 'text/json'
                                    })
                            ,body: JSON.stringify({
                                "userId":userid
                                ,"username":new_username
                            })
                    });
        fetch(request)
        .then((response) => {
            console.log("response.status =", response.status); // response.status = 200
            if (response.status == 200){ 
                let message =  "**<b>"+old_username+"</b> has changed its name to: <b>"+ new_username+"</b>"
                sessionStorage.setItem("username", new_username);
                send_message(message)
            }else{
                alert("Error Changing Username")
            }
        })
        
    }
    
function display_username(username){
        document.getElementById("username").hidden = false
        const container = document.getElementById('username-container');
        const label = document.createElement('span'); 
        label.id = 'spantext2'
        label.textContent = "Username: ";
        label.setAttribute('for', 'username'); 
        label.style.display = 'block'; 
        label.style.marginBottom = '5px';
        label.style.marginTop = '15px';
        document.getElementById("username").value = username
        const username_input = document.getElementById('username');
        container.insertBefore(label, username_input);
    }
    