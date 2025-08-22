	let canvas = document.querySelector("#visualizer");
    let ctx = canvas.getContext("2d");
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    var pixel_size = 5
	var websocket_session = null;
    var numRows =  Math.floor(canvas.height / pixel_size);
    var numCols = Math.floor(canvas.width / pixel_size);
    var big_canvas_grid = []
    var small_canvas_grid = []
	var client_view_cords = []
	var switch_grid_off = false
	var switch_patten_off = true
	var mouse_x = 0;
	var mouse_y = 0;
    var mag_view_w =5
    var mag_view_h = 5
    var c_view_x = 0
    var c_view_y = 0;
    var big_grid_cords = []
    var map = new Map();
    var displayCord_map = new Map();
	var res = []
	var display_cords = {}
	var message = [{'type': null, 'cords':[]}]


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
async function start_websocket(){
	if (websocket_session != null){return;}
	console.log(window.location.href.split("join=")[1])
	let invitation_id = window.location.href.split("join=")[1]
	websocket_session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/live_studio/invite?Id='+invitation_id);

	websocket_session.onopen = () => {
		console.log("Websocket connection established");
		websocket_session.send(JSON.stringify({
			"operation":"onopen",
			"status": 1,
            "client_name": generate(),
			"message":"Connection Successfully Established"
        }))
	
	}
	websocket_session.onmessage = (event) => {
			console.log("Message from server:", event.data);

	}
	websocket_session.onerror = (error) => {
		console.error("Websocket error:", error);

	}
	websocket_session.onclose = () => {
		console.log("Websocket connection closed");

	}			
}
start_websocket()