let canvas = document.querySelector("#visualizer");
let ctx = canvas.getContext("2d");
let dataArray;
var grid = [];
let analyser;
canvas.style.background = "black"
const width = canvas.clientWidth;
const height = canvas.clientHeight;

const dpr = window.devicePixelRatio || 1;
canvas.width = width * dpr;
canvas.height = height * dpr;
ctx.scale(dpr, dpr);

const cellSize = 2;
const numRows =  Math.floor(canvas.height / cellSize);
const numCols = Math.floor(canvas.width / cellSize);

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
  var bufferLength = dataArray.length
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const sliceWidth = numCols / bufferLength;
  let x = 0;
  var arr = []

  for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * numRows) / 2;
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
		cords["y"] = set_y(y-1);
	 }
	 else if (y > prev_y){
		cords["y"] = set_y(y+1);
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
  
  //grid = [];
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


function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var canvas_cords = [];
    for (let i = 0; i < numRows; i++) {
	for (let j = 0; j < numCols; j++) {
	    if (grid[i][j] === 1) {
		const items = ['pink', 'white', 'green', 'white'];
		const randomItem = items[Math.floor(Math.random() * items.length)];
		ctx.fillStyle = randomItem;
		ctx.fillRect((j * cellSize), i *
			     cellSize, cellSize, cellSize);
		canvas_cords.push({"x": j, "y": i*cellSize})
	    }
	}
    }
	//console.log(canvas_cords);
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
  source.connect(analyser);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(dataArray);
};
start_microphone()


function mainLoop() {
    if (analyser != undefined){
	  createGrid();
	  updateGrid();
	  drawGrid();
	  /*
	  */
    }
    requestAnimationFrame(mainLoop);
}
function getCursorPosition(canvas, event) {
const rect = canvas.getBoundingClientRect()
const x = event.clientX - rect.left
const y = event.clientY - rect.top
console.log("x: " + x + " y: " + y + " width: "+ rect.width + " height: "+ rect.height)
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
createGrid();
};

window.addEventListener('resize', windowResize);

mainLoop();

/*
var websocket_session = null;

	function start_websocket(){
    if (websocket_session != null){return;}
		websocket_session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/websocket');
		websocket_session.onopen = () => {
			console.log("Websocket connection established");	
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
	*/

