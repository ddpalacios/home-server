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
    var mag_view_w =100
    var mag_view_h = 50
    var c_view_x = 0
    var c_view_y = 0;
    var big_grid_cords = []
    var map = new Map();
	var res = []
	var display_cords = []
	var message = [{'type': null, 'cords':[]}]

async function start_websocket(){
	if (websocket_session != null){return;}
	websocket_session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/websocket');

	websocket_session.onopen = () => {
		console.log("Websocket connection established");	
		setInterval(async () => {
						// console.log(JSON.parse(message)['cords'].length);
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
					for (let i=0; i<display_cords.length; i++){
						 var x = display_cords[i].x / pixel_size
						 var y =  display_cords[i].y / pixel_size
						 if (map.has(x+','+y)){
							var big_x = map.get(x+','+y).split(",")[0]
                        	var big_y = map.get(x+','+y).split(",")[1]
							big_canvas_grid[big_y][big_x] = 1

						 }
					}
					
				}

	}
	websocket_session.onerror = (error) => {
		console.error("Websocket error:", error);

	}
	websocket_session.onclose = () => {
		console.log("Websocket connection closed");

	}			
}




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
                if (big_canvas_grid[i][j] === 1 && (neighbors < 2 || neighbors > 3)) {
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
        map = new Map();
        if (small_canvas_grid.length ==  0){
            // initial grid
            for (let i =0; i<mag_view_h; i++){
                small_canvas_grid[i] = []
                for (let j =0; j<mag_view_w; j++){
                    small_canvas_grid[i][j] = 0;
                }
            }
        }
        for (let i =0; i<numRows; i++){
            for (let j =0; j<numCols; j++){
                if (j == c_view_x && i == c_view_y){
                    var x = j * pixel_size
		            var y = i * pixel_size
                    for (let h=0; h<mag_view_h; h++){
                            for (let w=0; w<mag_view_w; w++){
                                    var new_x = x + (w*pixel_size)
                                    var new_y = y + (h*pixel_size)
                                    ctx.beginPath();
                                    ctx.lineWidth = "1";
                                    ctx.strokeStyle = "black";
                                    ctx.rect(new_x, new_y, pixel_size, pixel_size);
                                    ctx.stroke();
                                    ctx.closePath();
                                    new_x = j + x 
                                    new_y = i + y
                                    var bx = c_view_x+w
                                    var by = c_view_y+h
                                    map.set(w+","+h, bx+","+by)
                            }
                        }
                    }
                }
            }
    }
function check(e) {
        var code = e.keyCode;
		console.log(big_grid_cords)
            if (code == 37){
                console.log("Left");
                c_view_x -=1

            }else if (code == 38){
                console.log("Up");
                c_view_y -=1

            }else if (code == 39){
                console.log("Right");
                c_view_x +=1

            } else if (code == 40){
                console.log("Down");
                c_view_y +=1

            }
}
function mainLoop(){
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	draw_big_grid_lines();
	draw_small_grid_lines();

	for (let i =0; i<numRows; i++){
		for (let j =0; j<numCols; j++){
			if (i ==50){
				big_canvas_grid[i][j] = 1
			}
		}
	}

	// for (let i=0; i<display_cords.length; i++){
	// 	var rect_x = display_cords[i]['x']
	// 	var rect_y = display_cords[i]['y']
	// 	var rect_p = display_cords[i]['p']
	// 	// try{
	// 	// big_canvas_grid[Math.floor(rect_y/pixel_size)][Math.floor(rect_x/pixel_size)] = 2
	// 	// }catch(error){}
	// 	ctx.fillStyle ="blue"; 
	// 	ctx.fillRect(rect_x,rect_y ,rect_p, rect_p)
	// }

	big_canvas_grid = updateGrid() 

	for (let i =0; i<numRows; i++){
		for (let j =0; j<numCols; j++){
			var x = j * pixel_size
			var y = i * pixel_size
			if (big_canvas_grid[i][j] ==1){
				ctx.fillStyle = "rgba(255,0,0,255)";
				ctx.fillRect(x, y , pixel_size, pixel_size);
			}
			
		}
	}


	// for (let h=0; h<mag_view_h; h++){
    //         for (let w=0; w<mag_view_w; w++){
	// 				var x = (w * pixel_size)
	// 				var y = (h * pixel_size)
	// 				if (small_canvas_grid[h][w] ==1){
	// 					ctx.fillStyle = "rgba(0,0,255,255)";
	// 					ctx.fillRect(x, y , pixel_size, pixel_size);
	// 				}
	// 			}
	// 		}
	var res = []
	for (let h=0; h<mag_view_h; h++){
            for (let w=0; w<mag_view_w; w++){
                    if (map.has(w+','+h)){
                        var big_x = map.get(w+','+h).split(",")[0]
                        var big_y = map.get(w+','+h).split(",")[1]
                        if (big_canvas_grid[big_y][big_x] == 1){
                            // console.log("Rect at ",w+","+h )
                            // console.log("Scaled cords",w*5+","+h*5 )
                            ctx.fillStyle = "rgba(255,0,0,255)";
                            var scale = 1
							var scaled_x = Math.floor((w*pixel_size)*scale)
							var scaled_y = Math.floor((h*pixel_size)*scale)
							var scaled_pixel_size = pixel_size * scale 
							res.push({
								"x": scaled_x,
								"y": scaled_y,
								"p": scaled_pixel_size
							    });
			                // ctx.fillRect(scaled_x, scaled_y, scaled_pixel_size, scaled_pixel_size);
                        }
                    }
                }
            }
			message = JSON.stringify({
								"type": "live",
								"cords": res
							})	
							
	requestAnimationFrame(mainLoop);
}
window.addEventListener('keydown',check,false);
start_websocket()
mainLoop()