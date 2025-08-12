	let canvas = document.querySelector("#visualizer");
    let ctx = canvas.getContext("2d");
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    var pixel_size = 20
	var websocket_session = null;
    var numRows =  Math.floor(canvas.height / pixel_size);
    var numCols = Math.floor(canvas.width / pixel_size);
    var big_canvas_grid = []
    var small_canvas_grid = []
	var mouse_x = 0;
	var mouse_y = 0;
    var mag_view_w =20
    var mag_view_h = 20
    var c_view_x = 0
    var c_view_y = 0;
    var big_grid_cords = []
    var map = new Map();
	var res = []
	var display_cords = []

async function start_websocket(){
	if (websocket_session != null){return;}
	websocket_session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/websocket');

	websocket_session.onopen = () => {
		console.log("Websocket connection established");	
	}
	websocket_session.onmessage = (event) => {
			// console.log("Message from server:", event.data);
			  var cords = JSON.parse(event.data)
				if (cords['type'] == 'live'){
					display_cords = cords['cords']
				}

	}
	websocket_session.onerror = (error) => {
		console.error("Websocket error:", error);

	}
	websocket_session.onclose = () => {
		console.log("Websocket connection closed");

	}			
}
function draw_big_grid_lines(){
        if (big_canvas_grid.length ==  0){
            // initial grid
            for (let i =0; i<numRows; i++){
                big_canvas_grid[i] = []
                for (let j =0; j<numCols; j++){
                    big_canvas_grid[i][j] = 0;
                }
            }
        }else{
            for (let i =0; i<numRows; i++){
                    for (let j =0; j<numCols; j++){
                            var x = j*pixel_size;
                            var y = i * pixel_size;
                            ctx.beginPath();
                            ctx.lineWidth = ".1";
                            ctx.strokeStyle = "green";
                            ctx.rect(x, y, pixel_size, pixel_size);
                            ctx.stroke();
                            ctx.closePath();
                    }
                }
        }
    }

function draw_small_grid_lines(){
		
		ctx.beginPath();
		ctx.lineWidth = "1";
		ctx.strokeStyle = "red";
		for (let i=0; i<mag_view_h; i++){
			for (let j=0; j<mag_view_w; j++){
				ctx.rect(mouse_x+(pixel_size*j) ,  mouse_y+(pixel_size*i), pixel_size, pixel_size);
		}
	}
		ctx.stroke();
		ctx.closePath();

	}

	
function mouseMove(e){
	e.preventDefault();
	cPostX = e.pageX - canvas.offsetLeft;
	cPostY = e.pageY - canvas.offsetTop;
	mouse_x = cPostX;
	mouse_y = cPostY;
	

     }

function getCursorPosition(canvas, event) {
	const rect = canvas.getBoundingClientRect()
	var x = event.clientX - rect.left
	var y = event.clientY - rect.top
	console.log("x: " + Math.floor(x/pixel_size) + " y: " +  Math.floor(y/pixel_size) + " width: "+ rect.width + " height: "+ rect.height)
	for (let i=0; i<mag_view_h; i++){
				for (let j=0; j<mag_view_w; j++){
					ctx.rect(mouse_x+(pixel_size*j) ,  mouse_y+(pixel_size*i), pixel_size, pixel_size);
			}
		}
    //     for (let i =0; i<numRows; i++){
    //         for (let j =0; j<numCols; j++){
	// 				var new_x = j * pixel_size
	// 		 		var new_y = i * pixel_size
	// 				if (x > new_x - mag_view_w && x <= new_x + mag_view_w && y >= new_y - mag_view_h && y <= new_y + mag_view_h){
	// 					console.log("Clicked at", new_x, new_y)
						
	// 				}
	// 		}
	// }
}
canvas.addEventListener("mousemove", mouseMove, false);
canvas.addEventListener('mousedown', function(e) {
	getCursorPosition(canvas, e)
})
function mainLoop(){
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	draw_big_grid_lines();
	draw_small_grid_lines()

	// ctx.beginPath();
	// ctx.lineWidth = ".8";
	// ctx.strokeStyle = "black";
	// ctx.rect(mouse_x, mouse_y, pixel_size, pixel_size);
	// ctx.stroke();
	// ctx.closePath();

	for (let i=0; i<display_cords.length; i++){
		var rect_x = display_cords[i]['x']
		var rect_y = display_cords[i]['y']
		var rect_p = display_cords[i]['p']
		ctx.fillStyle ="red"; 
		ctx.fillRect(rect_x,rect_y ,rect_p, rect_p)
	}
	requestAnimationFrame(mainLoop);
}
start_websocket()
mainLoop()