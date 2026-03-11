let canvas = document.querySelector("#visualizer");
let frequency_canvas = document.querySelector("#frequency_chart");
let frequency_canvas_ctx = frequency_canvas.getContext("2d");
let ctx = canvas.getContext("2d");
let spectogram_canvas = document.querySelector("#spectogram_chart")
let spectogram_ctx = spectogram_canvas.getContext("2d",{ alpha: true });
let mel_spectogram_canvas = document.querySelector("#mel_spectogram_chart")
let mel_spectogram_ctx = mel_spectogram_canvas.getContext("2d",{ alpha: true });
const width = canvas.clientWidth;
const height = canvas.clientHeight;
var audioCtx;
console.log(width)
const dpr = window.devicePixelRatio || 1;
canvas.width = width * dpr;
canvas.height = height * dpr;
if (width >= 1280) {
    ctx.scale(dpr, dpr);
}

let pitchChart;
let dataArray;
let frequencyArray;
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
var avgFrequency =0
var rms = 0
var display_cords = []
var message = [{'type': null, 'cords':[]}]
var color =  "red";
var reset_grid = false
var bronze = { waveform: [] };
var silver = { waveform: [] };
var gold = []

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

function plot_frequency( ){
    if (analyser != null){
    let length = analyser.frequencyBinCount;
    frequency_canvas_ctx.fillStyle = "rgb(0 0 0)";
    analyser.getByteFrequencyData(frequencyArray);

    drawSpectrogram(frequencyArray,length)
    drawMelSpectrogram(frequencyArray, length, 2048)


    const barWidth = (frequency_canvas.width / length) * 3.5;
    let barHeight;
    let freq_x = 0;
    let freq_data = []
    for (let i = 0; i < length; i++) {
        barHeight = frequencyArray[i] / 2;
        freq_data.push({'x': freq_x, 'y': barHeight})
        freq_x += barWidth + 1;
    }

    let sum = 0;
    for (let i = 0; i < length; i++) {
        sum += frequencyArray[i]; 
    }
    avgFrequency = sum / length;
    updateFrequencySpectrum(freq_data) 
}
}

function createGrid() {
  if (analyser == null){
    return
  }
  analyser.getByteTimeDomainData(dataArray);

  var bufferLength = dataArray.length
  const WIDTH = numCols
  const HEIGHT = numRows
  const sliceWidth = WIDTH/ bufferLength;
  let x = 0;
  var arr = []
  var r = { waveform: [] }; 
  var t = { waveform: [] }; 

  for (let i = 0; i < bufferLength; i++) {
        const raw = dataArray[i];              
        const normalized = (raw - 128) / 128; 
        const v = raw / 128;                    
        const y = (v * HEIGHT) / 2;             

        r.waveform.push({ raw_signal: raw });   
        t.waveform.push({ standardized_signal: normalized, time_domain: x });
        arr.push({ x, y });                    

        x += sliceWidth;
        }
updatewavelength(arr)
  for (let i = 0; i < arr.length; i++) {
    const x_cord = Math.floor(arr[i].x);
    const y_cord = Math.floor(arr[i].y);
    big_canvas_grid[y_cord][x_cord] = 1;
    }

  bronze = r;
  silver = t;

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
function mainLoop(){
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	draw_big_grid_lines();
    createGrid()
	big_canvas_grid = updateGrid() 
	for (let i =0; i<numRows; i++){
		for (let j =0; j<numCols; j++){
			var x = j * pixel_size
			var y = i * pixel_size
			if (big_canvas_grid[i][j] ==1){
                    const baseR = 100;
                    const baseG = 150;
                    const baseB = 200;
                    const scale = Math.min(1, rms * 10);
                    const r = baseR + Math.floor(scale * (255 - baseR));
                    const g = baseG + Math.floor(scale * (255 - baseG));
                    const b = baseB + Math.floor(scale * (255 - baseB));
                    const color = `rgb(${r}, ${g}, ${b})`;
                    ctx.fillStyle = color;
					ctx.fillRect(x, y , pixel_size, pixel_size);
                    }
                }
            }
    rms = calculate_rms_value(silver['waveform'])
    updateRMS(rms*10) 
    plot_frequency()
	requestAnimationFrame(mainLoop);
}
async function start_microphone(){
  const constraints = { audio: true };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  const micGain = audioCtx.createGain();
  micGain.gain.value = 5// reduce input gain
  const filter = audioCtx.createBiquadFilter();
  source.connect(micGain).connect(analyser);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  frequencyArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(dataArray);
  analyser.getByteFrequencyData(frequencyArray);
};

function prettyPrintJson(obj) {
        let json = JSON.stringify(obj, null, 2);
        json = json
            .replace(/&/g, '&amp;') 
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|\b\d+\b)/g, match => {
            let color = '#ce9178';
            if (/^"/.test(match)) {
                color = /:$/.test(match) ? '#9cdcfe' : '#ce9178';
            } else if (/true|false/.test(match)) {
                color = '#569cd6';
            } else if (/null/.test(match)) {
                color = '#569cd6';
            } else if (/^[0-9]+$/.test(match)) {
                color = '#b5cea8';
            }
            return `<span style="color:${color}">${match}</span>`;
            });
            return json
}

function calculate_rms_value(values){
    let numerator = 0;
    values.forEach(element => {
        let standardized_sample = element['standardized_signal']

        standardized_sample =standardized_sample**2
        numerator+=standardized_sample
    });

    let average_value = numerator/values.length
    let rms = Math.sqrt(average_value)
    return rms
}
start_microphone()
mainLoop()

let intervalID = setInterval(() => {
    document.getElementById('bronzejsonContainer').innerHTML = prettyPrintJson(bronze);
    document.getElementById('silverjsonContainer').innerHTML = prettyPrintJson(silver);
    document.getElementById('goldjsonContainer').innerHTML = prettyPrintJson({'total_sample_size': silver['waveform'].length, "Intensity": rms, "Average_Frequency":avgFrequency  });
  
}, 1000); 
            