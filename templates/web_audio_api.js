let canvas = document.querySelector("#visualizer");
let ctx = canvas.getContext("2d", { willReadFrequently: true });
console.log(canvas, ctx);
let dataArray;
var grid = [];
var c = []
var gol_cords = []
var nav_cords = []
var websocket_session = null;
let analyser;
canvas.style.background = "white"
var reset_grid = false;
var mouse_cords = null; 
var pixel_size = 10;

var numRows = 0;
var numCols = 0;
const width = canvas.clientWidth;
const height = canvas.clientHeight;

const dpr = window.devicePixelRatio || 1;
canvas.width = width * dpr;
canvas.height = height * dpr;
ctx.scale(dpr, dpr);
var cellColor = "green";

//alert(numRows + " "+ numCols);


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

function sigmoid(z){
	return 1 / (1+Math.exp(-z));
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
	arr = res;
}

function createGrid() {

  analyser.getByteTimeDomainData(dataArray);
  //console.log(dataArray);
  var bufferLength = dataArray.length
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const sliceWidth = numCols / bufferLength;
  let x = 0;
  var arr = []

  for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] /128;
          const y = (v * numRows) / 2 ;
	  arr.push({ 'y':y, "x": x});
	  x += sliceWidth;
  }

  prev_x = null;
  prev_y = null;
  dedupe_array(arr);
  grid_cord = []
  for (let i=0; i<arr.length; i++){
	  x = Math.floor(arr[i]['x']);
	  y = Math.floor(arr[i]['y']);
	if (prev_x == null && prev_y == null){
			 grid_cord.push({"x":x, "y": y });
			 prev_x = x
			 prev_y = y
			 continue;
		 }
	 cords = {}
	 if (y < prev_y){
		cords["y"] = set_y(y);
	 }
	 else if (y > prev_y){
		cords["y"] = set_y(y);
	 }else{
		cords["y"] = set_y(y);
	 }
	 if (x > prev_x){
		cords["x"] = set_x(x+1);
	 }else if (x < prev_x){
		cords["x"] = set_x(x-1);
	 }else{
		cords["x"] = set_x(x);
	 }
	 grid_cord.push(cords)
	 prev_x = x
	 prev_y = y
  }
  dedupe_array(grid_cord);
if (reset_grid){
 grid = [] 
}
if (grid.length ==  0){
  for (let i =0; i<numRows; i++){
	  grid[i] = []
	  for (let j =0; j<numCols; j++){
		 grid[i][j] = 0;
	  }
  }
}
  for (let i=0; i<grid_cord.length; i++){
	  var x_cord = grid_cord[i]['x']
	  var y_cord = grid_cord[i]['y']
	  grid[y_cord][x_cord] = 1;
  }
}

function generateUniqueColors(n) {
  const colors = [];
  for (let i = 0; i < n; i++) {
    const hue = Math.floor((360 / n) * i);
    colors.push(`hsl(${hue}, 50%, 50%)`);
  }
  return colors;
}

function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath()
    ctx.strokeStyle = 'red';
    ctx.rect(c_view_x, c_view_y, 50, 50);
    ctx.stroke();
    ctx.closePath()
    if (mouse_cords  != null){
	    var s = 20
	    var x = mouse_cords['x']
	    var y = mouse_cords['y']
	    ctx.fillStyle ="red"; 
	    ctx.fillRect(x,y ,s, s)
    }
    c = [];
    for (let i = 0; i < numRows; i++) {
	for (let j = 0; j < numCols; j++) {
	    if (grid[i][j] === 1) {
		c.push({"x": j*pixel_size ,"y": i*pixel_size});
		var r_a = 1;
		ctx.fillStyle =  `rgba(177, 101, 255, 1)`;
		ctx.fillRect((j * pixel_size), i *
			     pixel_size, pixel_size, pixel_size);
	    }
	}
    }
}
function updateGrid() {
    const newGrid = [];
    for (let i = 0; i < numRows; i++) {
	newGrid[i] = [];
	for (let j = 0; j < numCols; j++) {
	    const neighbors = countNeighbors(i, j);
	    if (grid[i][j] === 1 && (neighbors < 2 || neighbors > 3)) {
		newGrid[i][j] = 0;
	    } else if (grid[i][j] === 0 && neighbors === 3) {
		newGrid[i][j] = 1;
	    } else {
		newGrid[i][j] = grid[i][j];
	    }
	}
    }
    grid = newGrid;
    return grid
    
}
function countNeighbors(row, col) {
    let count = 0;
    for (let i = -1; i <= 1; i++) {
	for (let j = -1; j <= 1; j++) {
	    const r = row + i;
	    const c = col + j;
	    if (r >= 0 && r < numRows && c >= 0 &&
		c < numCols && !(i === 0 && j === 0)) {
		count += grid[r][c];
	    }
	}
    }
    return count;
}

async function start_microphone(){
  const constraints = { audio: true };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  const micGain = audioCtx.createGain();
  micGain.gain.value = 10// reduce input gain
  const filter = audioCtx.createBiquadFilter();
  source.connect(micGain).connect(analyser);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(dataArray);
};

function chunkString(str, size) {
  let chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}
function generateBigPayload() {
    var payload = ""; 
    for (let i = 0; i < 128; i++) {
	    payload = payload+ "a"
    }
    return payload;
}
var step_size = pixel_size;
var mag_view_w = 100 
var mag_view_h =100 
var c_view_x =mag_view_w 
var c_view_y =mag_view_h
function check(e) {
    var code = e.keyCode;
    if (code == 37){
	    console.log("Left");
	    mag_view_w -= 50;
	 //   c_view_x -=step_size;
    }else if (code == 38){
	    console.log("Up");
	    mag_view_h +=50 
//	    c_view_y -=step_size; 

    }else if (code == 39){
	    console.log("Right");

	    mag_view_w += 50;
//	    c_view_x +=step_size;
    } else if (code == 40){
	    console.log("Down");
	    mag_view_h -=50 
//	    c_view_y +=step_size;
    }else if (code == 65){
	    pixel_size +=2
    }else if (code == 88){
	    pixel_size -=2
    }
    
}
window.addEventListener('keydown',check,false);

async function start_websocket(){
	if (websocket_session != null){return;}
	websocket_session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/websocket');

	websocket_session.onopen = () => {
		console.log("Websocket connection established");	

		/*
		setInterval(async () => {
		    imageData = ctx.getImageData(c_view_x, c_view_y, 50, 200);
		    var data = imageData.data
		    for (var i =0; i<data.length; i+=4) {
			var r = data[i];
			var g = data[i + 1];
			var b = data[i+2];
			var a = data[i+3];
			if (r == 0  && g == 0 && b == 0){
				continue;
			}if (r == 177  && g == 101 && b == 255 ){
			    var painted_vals = []
				var x = (i / 4) % 50;
				var y = Math.floor((i / 4) / 50);
				painted_vals.push({"r":r, "g":g, "b": b,  'idx': i})
				var message = JSON.stringify({
					"type": "live"
					,"cords": painted_vals
				})
				websocket_session.send(message)
			}
		}
		console.log(painted_vals);
		var message = JSON.stringify({
			"type": "live"
			,"cords": painted_vals
		})
		websocket_session.send(message)
	    }, 100); 
	    */
	}
	websocket_session.onmessage = (event) => {
			console.log("Message from server:", event.data);
			 mouse_cords = JSON.parse(event.data);

	}
	websocket_session.onerror = (error) => {
		console.error("Websocket error:", error);

	}
	websocket_session.onclose = () => {
		console.log("Websocket connection closed");

	}			
}


function mainLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    step_size = pixel_size;
    numRows =  Math.floor(canvas.height / pixel_size);
    numCols = Math.floor(canvas.width / pixel_size);

    if (grid.length ==  0){
	  // initial grid
	  for (let i =0; i<numRows; i++){
		  grid[i] = []
		  for (let j =0; j<numCols; j++){
			 grid[i][j] = 0;
		  }
	  }
   }else{
	  for (let i =0; i<numRows; i++){
		  for (let j =0; j<numCols; j++){
			var x = j * pixel_size
			var y = i * pixel_size
			 if (grid[i][j]  == 1){
			    ctx.fillStyle = "rgba(255,0,0,255)";
			    ctx.fillRect(x + 1, y + 1, pixel_size, pixel_size);
			 }
		  }
	  }

   }
   grid = updateGrid() 
    for (let i = 0; i < numRows; i++) {
	for (let j = 0; j < numCols; j++) {
		var x = j * pixel_size
		var y = i * pixel_size
		 if ( x >= c_view_x - mag_view_w && x <= c_view_x + mag_view_w &&y >= c_view_y - mag_view_h && y <= c_view_y + mag_view_h) {
			    ctx.beginPath();
			    ctx.lineWidth = ".5";
			    ctx.strokeStyle = "red";
			    ctx.rect(x, y, pixel_size, pixel_size);
			    ctx.stroke();
			    ctx.closePath();
		} else {
		    ctx.fillStyle = "rgba(0,0,0,0.9)";
		    ctx.fillRect(x + 1, y + 1, pixel_size, pixel_size);
		}
    }
}
    requestAnimationFrame(mainLoop);
}

function getCursorPosition(canvas, event) {
	const rect = canvas.getBoundingClientRect()
	var x = event.clientX - rect.left
	var y = event.clientY - rect.top
	console.log("x: " + x + " y: " + y + " width: "+ rect.width + " height: "+ rect.height)

	for (let i = 0; i < numRows; i++) {
		for (let j = 0; j < numCols; j++) {
			 x = j * pixel_size
			 y = i * pixel_size
			 if ( x >= c_view_x - mag_view_w && x <= c_view_x + mag_view_w &&y >= c_view_y - mag_view_h && y <= c_view_y + mag_view_h) {
				 grid[i][j] = 1;
			}
	}
}
}

canvas.addEventListener('mousedown', function(e) {
	getCursorPosition(canvas, e)
})

function windowResize() {
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	const dpr = window.devicePixelRatio || 1;
	canvas.width = width * dpr;
	canvas.height = height * dpr;
	ctx.scale(dpr, dpr)
};

function mouseMove(e){
	e.preventDefault();
	cPostX = e.pageX - canvas.offsetLeft;
	cPostY = e.pageY - canvas.offsetTop;
	c_view_x = cPostX;
	c_view_y = cPostY;

	//websocket_session.send(JSON.stringify({"type": 'mousemove', "x": cPostX, "y": cPostY }));
}

canvas.addEventListener("mousemove", mouseMove, false);
window.addEventListener('resize', windowResize);
//start_microphone()
start_websocket();
mainLoop();


  /*
  const oscillator = audioCtx.createOscillator();
  const dutyCycle = 0.25;
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 0.3
  const real = new Float32Array([0, 1]);
  const imag = new Float32Array([0, Math.sin(Math.PI * dutyCycle)]);
  const pulseWave = audioCtx.createPeriodicWave(real, imag);
  oscillator.frequency.value = 20;
  //oscillator.type = 'sine';
  oscillator.setPeriodicWave(pulseWave);
  oscillator.connect(gainNode).connect(analyser).connect(audioCtx.destination)
  //analyser.connect(audioCtx.destination);
  analyser.fftSize = 2048;
  const bufferLength = analyser.fftSize;
  dataArray = new Uint8Array(bufferLength);
 // oscillator.start();
  analyser.getByteTimeDomainData(dataArray);
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048; 
  source.connect(analyser);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(dataArray);
  */
