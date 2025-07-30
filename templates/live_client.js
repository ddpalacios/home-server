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
cellSize = 2
let grid_cords = [];
let mouse_cords = []
var prev_cords = []
var numRows =  Math.floor(canvas.height / cellSize);
var numCols = Math.floor(canvas.width / cellSize);

function mouseMove(e){
	e.preventDefault();
	cPostX = e.pageX - canvas.offsetLeft;
	cPostY = e.pageY - canvas.offsetTop;
	websocket_session.send(JSON.stringify({"type": 'mousemove', "x": cPostX, "y": cPostY }));

}
setInterval(() => {
	for (let i = 0; i < mouse_cords.length; i++) {
		const x = mouse_cords[i].x;
		const y = mouse_cords[i].y;
		ctx.clearRect(x, y, 20, 20); 
	}
	mouse_cords = [];
}, 2000);

var image_w = 500;
var image_h = 500;
async function start_websocket(){
	websocket_session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/websocket');
	websocket_session.onopen = () => {
		console.log("Websocket connection established");	
		canvas.addEventListener("mousemove", mouseMove, false);
		ctx.beginPath()
		ctx.strokeStyle = "red"
		ctx.rect(0,0, image_w,image_h);
		ctx.stroke();
		ctx.closePath();
	}

	websocket_session.onmessage = (event) => {
				var cords = JSON.parse(event.data)
		 		console.log(cords);
				if (cords['type'] == 'live'){
					for (var i=0; i<grid_cords.length; i++){
							var x = grid_cords[i]['x']
							var y = grid_cords[i]['y']
							ctx.clearRect(x, y, 50, 50);
						}

					grid_cords = [];
					console.log(cords['cords'])
					for (var i =0; i<cords['cords'].length; i++){
						if (i >= 1){break;}
						var x = cords['cords'][i].x;
						var y = cords['cords'][i].y;
						ctx.fillStyle = "black"
						ctx.fillRect(x,y,50,50);
						grid_cords.push({'x': x, 'y': y})
					}
				}

				if (cords['type'] == 'mousemove'){
					var cellSize = 20
					for (var i=0; i<mouse_cords.length; i++){
							var x = mouse_cords[i]['x']
							var y = mouse_cords[i]['y']
							ctx.clearRect(x, y, cellSize, cellSize);
						}
					mouse_cords = [];

					var m_x = cords['x']
					var m_y = cords['y']
					ctx.fillStyle ="red"; 
					ctx.fillRect(m_x,m_y ,cellSize, cellSize)
					mouse_cords.push({'x': m_x, 'y': m_y})
					console.log(mouse_cords.length)
						

				}
		}

	websocket_session.onerror = (error) => {
		console.error("Websocket error:", error);

	}
	websocket_session.onclose = () => {
		console.log("Websocket connection closed");

	}			
}
start_websocket()

                  
