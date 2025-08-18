	let canvas = document.querySelector("#visualizer");
    let ctx = canvas.getContext("2d");
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    var pixel_size = 10
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
		// setInterval(async () => {
		// 				// console.log(JSON.parse(message)['cords'].length);
		// 				if (JSON.parse(message)['cords'].length > 0){
		// 					websocket_session.send(message);
		// 				}
		// 		}, 100); 
	}
	websocket_session.onmessage = (event) => {
			// console.log("Message from server:", event.data);
			  var cords = JSON.parse(event.data)
					client_view_cords = []
					display_cords = cords['c']
					numRows = cords['h']
					numCols = cords['w']
					// for (let i=0; i<display_cords.length; i++){
					// 	var x =  display_cords[i]['x']
					// 	var y =  display_cords[i]['y']
					// 	displayCord_map.set(x+','+y, display_cords[i])
					// }
					// display_cords.array.forEach(element => {
					// 	displayCord_map.set(element['x']+","+element['y'])
					// });
				
					// var w = cords['w'] 
					// var h = cords['h'] 

					// for (let i=0; i<h; i++){
					// 	for (let j=0; j<w; j++){
					// 		var x = j*pixel_size;
                    //         var y = i * pixel_size;
					// 		client_view_cords.push({'x':x, 'y':y, 'p':pixel_size })
					// 		// ctx.rect(mouse_x+(pixel_size*j) ,  mouse_y+(pixel_size*i), pixel_size, pixel_size);

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
			for (let i=0; i< display_cords.length; i++){
				var x = display_cords[i]['x']*pixel_size;
				var y = display_cords[i]['y'] * pixel_size;
				ctx.fillStyle ="purple"; 
				ctx.fillRect(x,y ,pixel_size, pixel_size)
			}

			// for (let i =0; i<numRows; i++){
            //         for (let j =0; j<numCols; j++){
			// 			   var x = j*pixel_size;
            //                 var y = i * pixel_size;
            //                 ctx.beginPath();
            //                 ctx.lineWidth = ".1";
            //                 ctx.strokeStyle = "green";
            //                 ctx.rect(x, y, pixel_size, pixel_size);
            //                 ctx.stroke();
            //                 ctx.closePath();
            //         }
            //     }
        }
    }

function draw_small_grid_lines(){

	ctx.beginPath();
		ctx.lineWidth = "1";
		ctx.strokeStyle = "red";
		var s = pixel_size 
		for (let i=0; i<mag_view_h; i++){
			for (let j=0; j<mag_view_w; j++){
				ctx.rect(mouse_x+(s*j) ,  mouse_y+(s*i), s, s);
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
	var current_x = Math.floor(mouse_x/pixel_size)
	var current_y = Math.floor(mouse_y/pixel_size)
	var client_cords = []
	for (let i=0; i<mag_view_h; i++){
			for (let j=0; j<mag_view_w; j++){
				client_cords.push({'x': current_x + j, 'y': current_y+i})
				}
		}
	if (switch_grid_off){
		websocket_session.send(JSON.stringify({
					'op': 'sub', 
					 "cords": client_cords}));
	}
	else{
		websocket_session.send(JSON.stringify({
					'op': 'add', 
					 "cords": client_cords}));

     }
	}

function getCursorPosition(canvas, event) {
	const rect = canvas.getBoundingClientRect()
	var x = event.clientX - rect.left
	var y = event.clientY - rect.top
	var current_x = Math.floor(x/pixel_size)
	var current_y = Math.floor(y/pixel_size)
	var client_cords = []
	console.log(current_x, current_y)
	for (let i=0; i<50; i++){
			for (let j=0; j<50; j++){
				client_cords.push({'x': current_x + j, 'y': current_y+i})
				}
		}
		if (switch_grid_off){
			websocket_session.send(JSON.stringify({
					'op': 'sub', 
					 "cords": client_cords}));
		}else{
			websocket_session.send(JSON.stringify({
							'op': 'add', 
							"cords": client_cords}));
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
				var w = -2
				var h = 0
				websocket_session.send(JSON.stringify({
					"op": "resize"
					,"w": w
					, "h": h}));

				numRows += h
				numCols +=w
			
            }else if (code == 38){
                console.log("Up");
				var w = 0
				var h = -2
				websocket_session.send(JSON.stringify({
					"op": "resize"
					,"w": w
					, "h": h}));

				numRows += h
				numCols +=w

            }else if (code == 39){
                console.log("Right");
				var w = 2
				var h = 0
				websocket_session.send(JSON.stringify({
						"op": "resize"
						,"w": w
						, "h": h}));

					numRows += h
					numCols +=w


            } else if (code == 40){
                console.log("Down");
				var w = 0
				var h = 2
				websocket_session.send(JSON.stringify({
					"op": "resize"
					,"w": w
					, "h": h}));

				numRows += h
				numCols +=w

            }else if (code == 82){
                console.log("reset");
				reset_grid()

			}else if (code == 87){
				console.log('w')
				websocket_session.send(JSON.stringify({
					"op": "move",
					"y": -1,
					"x": 0
					}));
			}else if (code == 65){
				console.log('a')
				websocket_session.send(JSON.stringify({
					"op": "move",
					"x": -1,
					"y": 0
					}));
			}else if (code == 83){
				console.log('s')
				websocket_session.send(JSON.stringify({
					"op": "move",
					"y":1,
					"x": 0
					}));
			}else if (code == 68){
				console.log('d')
				websocket_session.send(JSON.stringify({
					"op": "move",
					"x": 1,
					"y": 0
					}));
			}else if (code == 69){
				console.log('e')
				pixel_size +=1
			}else if (code == 81){
				console.log('e')
				pixel_size -=1
			}
			else if (code == 86){
				console.log('v');
				if (switch_grid_off){
					switch_grid_off = false 
				}else{
					switch_grid_off = true;
				}
			}
			else if (code == 70){
				console.log('f');
				if (switch_patten_off){
					switch_patten_off = false 
				}else{
					switch_patten_off = true;
				}

				websocket_session.send(JSON.stringify({
					"op": "pattern",
					"v": switch_patten_off
					}));
			}

}

window.addEventListener('keydown',check,false);
canvas.addEventListener("mousemove", mouseMove, false);
canvas.addEventListener('mousedown', function(e) {
	getCursorPosition(canvas, e)
})
function mainLoop(){
	ctx.clearRect(0, 0, canvas.width, canvas.height);
// 	if (numCols == null || numRows == null){
// 		requestAnimationFrame(mainLoop);
// 	}

	draw_big_grid_lines();
	draw_small_grid_lines()

	
// for (let i=0; i<display_cords.length; i++){
// 		var rect_x = display_cords[i]['x']
// 		var rect_y = display_cords[i]['y']
// 		var rect_p = display_cords[i]['p']
// 		try{
// 		big_canvas_grid[Math.floor(rect_y/pixel_size)][Math.floor(rect_x/pixel_size)] = 2
// 		}catch(error){}
		// ctx.fillStyle ="red"; 
		// ctx.fillRect(rect_x,rect_y ,rect_p, rect_p)
// 	}
	

// 	big_canvas_grid = updateGrid() 

// 	var client_cords = []
// 	for (let i =0; i<numRows; i++){
// 		for (let j =0; j<numCols; j++){
// 			var x = (j * (pixel_size)) 
// 			var y = (i * (pixel_size)) 
// 			if (big_canvas_grid[i][j] == 1  ){
// 				ctx.fillStyle = "rgba(255,0,255,255)";
// 				var scale = 2
// 				var scaled_pixel_size = pixel_size * scale 
// 				ctx.fillRect(x ,y , scaled_pixel_size, scaled_pixel_size);
// 				client_cords.push({
// 					"x": x
// 					,"y": y
// 					,"p": scaled_pixel_size
// 				})
// 			}
// 		}
// 	}

// 	message = JSON.stringify({
// 								"type": "live",
// 								"cords": client_cords
// 							})	


	requestAnimationFrame(mainLoop);
}
start_websocket()
mainLoop()