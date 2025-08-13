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
    var mag_view_w =5
    var mag_view_h = 5
    var c_view_x = 0
    var c_view_y = 0;
    var big_grid_cords = []
    var map = new Map();
	var res = []
	var display_cords = []
	var message = [{'type': null, 'cords':[]}]
function countNeighbors(row, col) {
        let count = 0;
        for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            const r = row + i;
            const c = col + j;
            if (r >= 0 && r < numRows && c >= 0 &&
            c < numCols && !(i === 0 && j === 0)) {
            count += big_canvas_grid[r][c];
            }
        }
        }
        return count;
}
function updateGrid() {
        const newGrid = [];
        for (let i = 0; i < numRows; i++) {
            newGrid[i] = [];
            for (let j = 0; j < numCols; j++) {
                const neighbors = countNeighbors(i, j);
                if ((big_canvas_grid[i][j] === 1 || big_canvas_grid[i][j] === 2)  && (neighbors < 2 || neighbors > 3)) {
                newGrid[i][j] = 0;
                } else if (big_canvas_grid[i][j] === 0 && neighbors === 3) {
                newGrid[i][j] = 1;
                } else {
                newGrid[i][j] = big_canvas_grid[i][j];
                }
            }
        }
        big_canvas_grid = newGrid;
        return big_canvas_grid
}

async function start_websocket(){
	if (websocket_session != null){return;}
	websocket_session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/websocket');

	websocket_session.onopen = () => {
		console.log("Websocket connection established");
		setInterval(async () => {
						console.log(JSON.parse(message)['cords'].length);
						if (JSON.parse(message)['cords'].length > 0){
							websocket_session.send(message);
						}
				}, 100); 
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
					var scale = 5
					var scaled_x = (x*pixel_size)*scale
					var scaled_y = (y*pixel_size)*scale

					var grid_x = Math.floor(x/pixel_size)
					var grid_y = Math.floor(y/pixel_size)


					big_canvas_grid[grid_y+i][grid_x+j] = 1
				}
				
		}
}
function reset_grid(){
 for (let i =0; i<numRows; i++){
                big_canvas_grid[i] = []
                for (let j =0; j<numCols; j++){
                    big_canvas_grid[i][j] = 0;
                }
            }


}

function check(e) {
        var code = e.keyCode;
            if (code == 37){
                console.log("Left");

            }else if (code == 38){
                console.log("Up");

            }else if (code == 39){
                console.log("Right");

            } else if (code == 40){
                console.log("Down");
            }else if (code == 82){
                console.log("reset");
				reset_grid()

            }
}

window.addEventListener('keydown',check,false);
canvas.addEventListener("mousemove", mouseMove, false);
canvas.addEventListener('mousedown', function(e) {
	getCursorPosition(canvas, e)
})
function mainLoop(){
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	draw_big_grid_lines();
	draw_small_grid_lines()

	
for (let i=0; i<display_cords.length; i++){
		var rect_x = display_cords[i]['x']
		var rect_y = display_cords[i]['y']
		var rect_p = display_cords[i]['p']
		try{
		big_canvas_grid[Math.floor(rect_y/pixel_size)][Math.floor(rect_x/pixel_size)] = 2
		}catch(error){}
		ctx.fillStyle ="red"; 
		ctx.fillRect(rect_x,rect_y ,rect_p, rect_p)
	}
	

	big_canvas_grid = updateGrid() 

	var client_cords = []
	for (let i =0; i<numRows; i++){
		for (let j =0; j<numCols; j++){
			var x = (j * (pixel_size)) 
			var y = (i * (pixel_size)) 
			if (big_canvas_grid[i][j] ==1  ){
				ctx.fillStyle = "rgba(255,0,255,255)";
				var scale = 1
				var scaled_pixel_size = pixel_size * scale 
				ctx.fillRect(x ,y , scaled_pixel_size, scaled_pixel_size);
				client_cords.push({
					"x": x
					,"y": y
					,"p": scaled_pixel_size
				})
			}
		}
	}

	message = JSON.stringify({
								"type": "live",
								"cords": client_cords
							})	


	requestAnimationFrame(mainLoop);
}
start_websocket()
mainLoop()