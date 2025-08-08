websocket_session = null;
var grid = [];
let canvas = document.querySelector("#visualizer");
let ctx = canvas.getContext("2d");
const width = canvas.clientWidth;
const height = canvas.clientHeight;

const dpr = window.devicePixelRatio || 1;
canvas.width = width * dpr;
canvas.height = height * dpr;
ctx.scale(dpr, dpr);
pixel_size = 10
let grid_cords = [];
let mouse_cords = []
var prev_cords = []
var numRows =  Math.floor(canvas.height / pixel_size);
var numCols = Math.floor(canvas.width / pixel_size);

function mouseMove(e){
	e.preventDefault();
	cPostX = e.pageX - canvas.offsetLeft;
	cPostY = e.pageY - canvas.offsetTop;
	websocket_session.send(JSON.stringify({"type": 'mousemove', "x": cPostX, "y": cPostY }));

}
/*
setInterval(() => {
	for (let i = 0; i < mouse_cords.length; i++) {
		const x = mouse_cords[i].x;
		const y = mouse_cords[i].y;
		ctx.clearRect(x, y, 20, 20); 
	}
	mouse_cords = [];
}, 2000);
*/

var image_w = 500;
var image_h = 500;
async function start_websocket(){
	websocket_session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/websocket');
	websocket_session.onopen = () => {
		console.log("Websocket connection established");	
		canvas.addEventListener("mousemove", mouseMove, false);
	}

	websocket_session.onmessage = (event) => {
				var cords = JSON.parse(event.data)
				if (cords['type'] == 'live'){
					ctx.clearRect(0, 0, canvas.width, canvas.height);
					var r = cords['cords']
					for (let i=0; i<r.length; i++){
						var val = r[i];
						var x = val['x']
						var y = val['y']
						var w = val['w']
						var h = val['h']
						var p = val['p']
						/*
						if ((new_x > 0 && new_x < canvas.width) && 
							new_y > 0 && new_y < canvas.height) {
							console.log(new_x, new_y, p*w,p*h)
						}
						*/
					}	

				}
				if (cords['type'] == 'mousemove'){
					var pixel_size = 20
					for (var i=0; i<mouse_cords.length; i++){
							var x = mouse_cords[i]['x']
							var y = mouse_cords[i]['y']
							ctx.clearRect(x, y, pixel_size, pixel_size);
						}
					mouse_cords = [];

					var m_x = cords['x']
					var m_y = cords['y']
					ctx.fillStyle ="red"; 
					ctx.fillRect(m_x,m_y ,pixel_size, pixel_size)
					mouse_cords.push({'x': m_x, 'y': m_y})
					//console.log(mouse_cords.length)
				}
		}
	websocket_session.onerror = (error) => {
		console.error("Websocket error:", error);

	}
	websocket_session.onclose = () => {
		console.log("Websocket connection closed");

	}			
}

function getCursorPosition(canvas, event) {
	const rect = canvas.getBoundingClientRect()
	var x = event.clientX - rect.left
	var y = event.clientY - rect.top
	console.log("x: " + x + " y: " + y + " width: "+ rect.width + " height: "+ rect.height)

}

canvas.addEventListener('mousedown', function(e) {
	 getCursorPosition(canvas, e);
});

function mainLoop(){
	ctx.fillStyle ="red"; 
	console.log(canvas.width-600, canvas.height - 198, 20*5,20*5)
	ctx.fillRect(500, 500, 20*5,20*5);
	/*
	 if (grid.length ==  0){
		 for (let i =0; i<numRows; i++){
			 grid[i] = [];
			 for (let j=0; j<numCols; j++){
				  var x = j * pixel_size;
				  var y = i * pixel_size
				  grid[i][j] = 0;
			 }
		 }

	 }else{

		 for (let i =0; i<numRows; i++){
			 for (let j=0; j<numCols; j++){
				  var x = j * pixel_size;
				  var y = i * pixel_size;
				  if (grid[i][j] == 1){
					  ctx.fillStyle = "rgba(255,0,0,255)";
				  }else{
					  ctx.fillStyle = "rgba(0,0,0,0.9)";
				  }
				  ctx.fillRect(x + 1, y + 1, pixel_size, pixel_size);
			 }
		 }
	 }
	 requestAnimationFrame(mainLoop);
	 */
}


start_websocket()
mainLoop();

                  
