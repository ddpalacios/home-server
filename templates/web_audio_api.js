let canvas = document.querySelector("#visualizer");
let ctx = canvas.getContext("2d");
const width = canvas.clientWidth;
const height = canvas.clientHeight;
const dpr = window.devicePixelRatio || 1;
canvas.width = width * dpr;
canvas.height = height * dpr;
ctx.scale(dpr, dpr);
let dataArray;
let analyser;
var pixel_size = 3
var websocket_session = null;
var numRows =  Math.floor(canvas.height / pixel_size);
var numCols = Math.floor(canvas.width / pixel_size);
var big_canvas_grid = []
var small_canvas_grid = []
var mag_view_w =100
var mag_view_h = 100
var switch_patten_off = true
var c_view_x = 0
var c_view_y = 0;
var big_grid_cords = []
var client_cords  = []
var map = new Map();
var big_map = new Map();
var rect_color_map = new Map();
var res = []
var display_cords = []
var message = [{'type': null, 'cords':[]}]
var color =  "rgba(0,0,255,255)";
var reset_grid = false

function set_y(y){
	if (y > numRows-1){
		y = numRows-1;
	}else if (y <0){
		y = 0;
	}

	return y;

}
function set_x(x){
	if (x > numCols-1){
		x = numCols-1;
	}else if (x <0){
		x = 0;
	}

	return x;

}
function dedupe_array(arr){
	var prev_x = null;
	var prev_y = null;
	var res = []
	 for (let i=0; i < arr.length; i++){
		  var x = Math.floor(arr[i]['x']);
		  var y = Math.floor(arr[i]['y']);
		 if (prev_x == null && prev_y == null){
			 prev_x = x
			 prev_y = y
			 continue
		 }
		 if (x == prev_x && y == prev_y){
			 continue;
		 }
		 res.push({ 'y':y, "x": x});
		 prev_x = x
		 prev_y = y
	 }
	return res
}

function createGrid() {
  if (analyser == null){
    return
  }

  analyser.getByteTimeDomainData(dataArray);
  var bufferLength = dataArray.length
  const WIDTH = numCols//canvas.width;
  const HEIGHT = numRows//anvas.height;
  const sliceWidth = WIDTH/ bufferLength;
  let x = 0;
  var arr = []

  for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] /128;
          const y = (v * HEIGHT) / 2 ;
	  arr.push({ 'y':y, "x": x});
        // ctx.beginPath();
        // ctx.lineWidth = "1";
        // ctx.strokeStyle = "yellow";
        // ctx.rect(x, y, pixel_size, pixel_size);
        // ctx.stroke();
        // ctx.closePath();
	  x += sliceWidth;

  }
//   console.log(arr, numCols, numRows)
//   arr = dedupe_array(arr)
// //   console.log(numCols, numRows, dedupe_array(arr))

//   prev_x = null;
//   prev_y = null;
//   dedupe_array(arr);
//   grid_cord = []
//   for (let i=0; i<arr.length; i++){
// 	  x = Math.floor(arr[i]['x']);
// 	  y = Math.floor(arr[i]['y']);
// 	if (prev_x == null && prev_y == null){
// 			 grid_cord.push({"x":x, "y": y });
// 			 prev_x = x
// 			 prev_y = y
// 			 continue;
// 		 }
// 	 cords = {}
// 	 if (y < prev_y){
// 		cords["y"] = set_y(y);
// 	 }
// 	 else if (y > prev_y){
// 		cords["y"] = set_y(y);
// 	 }else{
// 		cords["y"] = set_y(y);
// 	 }
// 	 if (x > prev_x){
// 		cords["x"] = set_x(x+1);
// 	 }else if (x < prev_x){
// 		cords["x"] = set_x(x-1);
// 	 }else{
// 		cords["x"] = set_x(x);
// 	 }
// 	 grid_cord.push(cords)
// 	 prev_x = x
// 	 prev_y = y
//   }
//   dedupe_array(grid_cord);
// if (reset_grid){
//  big_canvas_grid = [] 
// }
// if (big_canvas_grid.length ==  0){
//   for (let i =0; i<numRows; i++){
// 	  big_canvas_grid[i] = []
// 	  for (let j =0; j<numCols; j++){
// 		 big_canvas_grid[i][j] = 0;
// 	  }
//   }
// }
  for (let i=0; i<arr.length; i++){
	  var x_cord = Math.floor(arr[i]['x'] ) 
	  var y_cord = Math.floor(arr[i]['y'] )
	  big_canvas_grid[y_cord][x_cord] = 1;
  }
}


async function start_websocket(){
	if (websocket_session != null){return;}
	websocket_session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/websocket');

	websocket_session.onopen = () => {
		console.log("Websocket connection established");	
		setInterval(async () => {
						// console.log(JSON.parse(message)['cords']);
                        if (JSON.parse(message).hasOwnProperty("c")) {
                            if (JSON.parse(message)['c'].length > 0){
                                websocket_session.send(message);

                            }
                    }
				}, 1); 
                


                // 	setInterval(async () => {
				// 		// console.log(JSON.parse(message)['cords']);
                //             if (!switch_patten_off){
                //                     // if (JSON.parse(message)['c'].length > 0){
                //                     //             for (let i =0; i<numRows; i++){
                //                     //                 for (let j =0; j<numCols; j++){
                //                     //                     if (i ==100 || i == 200 || j == 200 || j == 100 || j == 300 || j == 400){
                //                     //                             big_canvas_grid[i][j] = 1
                //                     //                             // break
                //                     //                         }
                //                     //                 }
                //                     //             }
                //                     // }
                //     }
				// }, 2000); 



              
	}
	websocket_session.onmessage = (event) => {
			// console.log("Message from server:", event.data);
			  var cords = JSON.parse(event.data)
            if (cords.hasOwnProperty("op")) {
                if (cords['op'] == "resize"){
                    var w = cords['w']
                    var h = cords['h']
                    mag_view_w +=w 
                    mag_view_h +=h
                }
                 if (cords['op'] == "move"){
                    var x = cords['x']
                    var y = cords['y']
                    c_view_x +=x 
                    c_view_y +=y
                }
                 if (cords['op'] == "add"){
                    client_cords = cords['cords']
                    for (let i =0; i<cords['cords'].length; i++){
                        var x = cords['cords'][i]['x']
                        var y = cords['cords'][i]['y']
                        if (map.has(x+","+y)){
                             var big_x = map.get(x+','+y).split(",")[0]
                             var big_y = map.get(x+','+y).split(",")[1]
                             big_canvas_grid[big_y][big_x] = 1
                             rect_color_map.set(big_x+","+big_y, "purple")
                        }
                    }
                 }
                 if (cords['op'] == "sub"){
                     client_cords = cords['cords']
                    for (let i =0; i<cords['cords'].length; i++){
                        var x = cords['cords'][i]['x']
                        var y = cords['cords'][i]['y']
                        if (map.has(x+","+y)){
                             var big_x = map.get(x+','+y).split(",")[0]
                             var big_y = map.get(x+','+y).split(",")[1]
                             big_canvas_grid[big_y][big_x] = 0
                            //  rect_color_map.set(big_x+","+big_y, "purple")
                        }
                    }

                 }
                 if (cords['op'] == "pattern"){
                        switch_patten_off = false
                          if (JSON.parse(message)['c'].length > 0){
                                                for (let i =0; i<numRows; i++){
                                                    for (let j =0; j<numCols; j++){
                                                        if (i ==100 || i == 200 || j == 200 || j == 100 || j == 300 || j == 400){
                                                                big_canvas_grid[i][j] = 1
                                                                // break
                                                            }
                                                    }
                                                }
                                    }
                    }
                    console.log(switch_patten_off)

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
        var newGrid = [];
        for (let i = 0; i < numRows; i++) {
            newGrid[i] = [];
            for (let j = 0; j < numCols; j++) {
                const neighbors = countNeighbors(i, j);
                if ((big_canvas_grid[i][j] === 1) && (neighbors < 2 || neighbors > 3)) {
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
                    //    if (i ==100 || i == 200 || j == 200 || j == 100 || j == 300 || j == 400){
                    //         big_canvas_grid[i][j] = 1
                    //         // break
                    //     }
                }
            }
        }else{
           

            
            // for (let i =0; i<numRows; i++){
            //         for (let j =0; j<numCols; j++){
            //                 var x = j*pixel_size;
            //                 var y = i * pixel_size;
                            // ctx.beginPath();
                            // ctx.lineWidth = ".1";
                            // ctx.strokeStyle = "green";
                            // ctx.rect(x, y, pixel_size, pixel_size);
                            // ctx.stroke();
                            // ctx.closePath();
            //         }
            //     }
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
        }else{
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
                                        ctx.lineWidth = ".03";
                                        ctx.strokeStyle = "white";
                                        ctx.rect(new_x, new_y, pixel_size, pixel_size);
                                        ctx.stroke();
                                        ctx.closePath();
                                        new_x = j + x 
                                        new_y = i + y
                                        var bx = c_view_x+w
                                        var by = c_view_y+h
                                        map.set(w+","+h, bx+","+by)
                                        big_map.set(bx+","+by, w+","+h)
                                }
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
    createGrid()

	big_canvas_grid = updateGrid() 


	for (let i =0; i<numRows; i++){
		for (let j =0; j<numCols; j++){
			var x = j * pixel_size
			var y = i * pixel_size
			if (big_canvas_grid[i][j] ==1){
                    if (big_map.has(j+','+i)){
					    ctx.fillStyle = 'purple'
                    }
                    else if (rect_color_map.has(j+','+i)){
					    ctx.fillStyle = 'purple'
                    }else{
					ctx.fillStyle = color
                    }
					ctx.fillRect(x, y , pixel_size, pixel_size);
			}
		}
	}
    big_map = new Map();
    
	var res = []
	for (let h=0; h<mag_view_h; h++){
            for (let w=0; w<mag_view_w; w++){
                var x = w * pixel_size
			    var y =h * pixel_size
                    if (map.has(w+','+h)){
                        var big_x = map.get(w+','+h).split(",")[0]
                        var big_y = map.get(w+','+h).split(",")[1]
                        if (big_canvas_grid[big_y][big_x] == 1){ 
                            var scale = 1
							var scaled_x = Math.floor((w*pixel_size)*scale)
							var scaled_y = Math.floor((h*pixel_size)*scale)
							var scaled_pixel_size = pixel_size * scale 
							res.push({
								"x": w,
								"y": h,
							    });
                        }
                    }
                }
            }
			message = JSON.stringify({
                                 "w": mag_view_w
                                ,"h": mag_view_h
                                ,"c":res
							})	
							
	requestAnimationFrame(mainLoop);
}
async function start_microphone(){
  const constraints = { audio: true };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  const micGain = audioCtx.createGain();
  micGain.gain.value = 5// reduce input gain
  const filter = audioCtx.createBiquadFilter();
  source.connect(micGain).connect(analyser);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(dataArray);
};

start_microphone()
window.addEventListener('keydown',check,false);
start_websocket()
mainLoop()