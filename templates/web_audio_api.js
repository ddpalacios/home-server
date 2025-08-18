let canvas = document.querySelector("#visualizer");
let ctx = canvas.getContext("2d");
const width = canvas.clientWidth;
const height = canvas.clientHeight;
const dpr = window.devicePixelRatio || 1;
canvas.width = width * dpr;
canvas.height = height * dpr;
ctx.scale(dpr, dpr);
var pixel_size = 5
var websocket_session = null;
var numRows =  Math.floor(canvas.height / pixel_size);
var numCols =Math.floor(canvas.width / pixel_size);
var big_canvas_grid = []
var rule = 30
var c_view_x = 0
var c_view_y = 0;
var message = [{'type': null, 'cords':[]}]
var mag_view_w =50
var mag_view_h = 50
var map = new Map();
var big_map = new Map();
var rect_color_map = new Map();


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
				}, 10); 
	}
	websocket_session.onmessage = (event) => {
			console.log("Message from server:", event.data);
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
                        }
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

function draw_small_grid_lines(){
    map = new Map();
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
function binaryToInt(binaryStr) {
    let result = 0;
    let length = binaryStr.length;

    for (let  i = 0; i < length; i++) {
        if (binaryStr[i] == '1') {
            result += Math.pow(2, length - 1 - i);
        }
    }
    return result;
}
function reset(){
            big_canvas_grid = []
            for (let i =0; i<numRows; i++){
                big_canvas_grid[i] = []
                for (let j =0; j<numCols; j++){
                    big_canvas_grid[i][j] = 0;
                    if (i == 0 && j == Math.floor(numCols*.5)){
                        big_canvas_grid[i][j] = 1
                    }
                }
            }
}
function check(e) {
        var code = e.keyCode;
            if (code == 38){
                console.log("Up");
                if (pixel_size-1 <=0 ){
                    return
                }
                pixel_size -=1
                numRows =  Math.floor(canvas.height / pixel_size);
                 numCols =Math.floor(canvas.width / pixel_size);
                for (let i =0; i<numRows; i++){
                big_canvas_grid[i] = []
                for (let j =0; j<numCols; j++){
                    big_canvas_grid[i][j] = 0;
                    if (i == 0 && j == Math.floor(numCols*.5)){
                        big_canvas_grid[i][j] = 1
                    }
                }
            }

             }
             if (code == 40){
                console.log("Down");
                pixel_size +=1
                numRows =  Math.floor(canvas.height / pixel_size);
                numCols =Math.floor(canvas.width / pixel_size);
                for (let i =0; i<numRows; i++){
                big_canvas_grid[i] = []
                for (let j =0; j<numCols; j++){
                    big_canvas_grid[i][j] = 0;
                    if (i == 0 && j == Math.floor(numCols*.5)){
                        big_canvas_grid[i][j] = 1
                    }
                }
            }


            }
            if (code == 39){
                console.log("Right");
                rule +=1
                for (let i =0; i<numRows; i++){
                big_canvas_grid[i] = []
                for (let j =0; j<numCols; j++){
                    big_canvas_grid[i][j] = 0;
                    if (i == 0 && j == Math.floor(numCols*.5)){
                        big_canvas_grid[i][j] = 1
                    }
                }
            }

            }  if (code == 37){
                console.log("Left");
                if (rule-1 <=0){
                    return
                }
                rule -=1
                for (let i =0; i<numRows; i++){
                big_canvas_grid[i] = []
                for (let j =0; j<numCols; j++){
                    big_canvas_grid[i][j] = 0;
                    if (i == 0 && j == Math.floor(numCols*.5)){
                        big_canvas_grid[i][j] = 1
                    }
                }
            }


            }

        }
function main(){
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (big_canvas_grid.length ==  0){
            for (let i =0; i<numRows; i++){
                big_canvas_grid[i] = []
                for (let j =0; j<numCols; j++){
                    big_canvas_grid[i][j] = 0;
                    if (i == 0 && j == Math.floor(numCols*.5)){
                        big_canvas_grid[i][j] = 1
                    }
                }
            }
        }
        draw_small_grid_lines()

        for (let i=1; i < numRows; i++){
            for (let j=0; j < numCols; j++){
                    var x = j * pixel_size
			        var y = i * pixel_size
                    let currVal = big_canvas_grid[i][j];
                    let left_neighbor = null;
                    let right_neighbor = null;
                    let top_neighbor = null; 
                    if (j-1 < 0){
                        left_neighbor = 0
                    }else{
                        left_neighbor = big_canvas_grid[i-1][j-1]
                    }
                    if (j+1 < canvas.width){
                        right_neighbor = big_canvas_grid[i-1][j+1]
                    }else{
                        right_neighbor = 0;
                    }
                    top_neighbor = big_canvas_grid[i-1][j]
                    let r = left_neighbor + ""+top_neighbor+""+right_neighbor
                    let result = binaryToInt(r)
                    let is_valid = 0;
                    if (result == 7){
                        is_valid = rule & 0x80
                    }if (result == 6){
                        is_valid = rule & 0x40
                    }if (result == 5){
                        is_valid = rule & 0x20
                    }if (result == 4){
                        is_valid = rule & 0x10
                    }if (result == 3){
                        is_valid = rule & 0x8
                    }if (result == 2){
                        is_valid = rule & 0x4
                    }if (result == 1){
                        is_valid = rule & 0x2
                    }if (result == 0){
                        is_valid = rule & 0x1
                    }
                    if (is_valid){
                        big_canvas_grid[i][j] = 1
                        ctx.fillStyle = 'green'
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

	requestAnimationFrame(main);


    }
start_websocket()
window.addEventListener('keydown',check,false);
main()
