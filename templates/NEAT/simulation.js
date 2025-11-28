let initialized = false

// class Simultation{
//     constructor(){
//         this.networks = {}
//         this.body_id = 0;
//     }
//     generate_inputs(row, col) {
//         let inputs = {0: 0, 1:0, 2:0, 3:0,4:0,5:0,6:0,7:0}
//         for (let i = -1; i <= 1; i++) {
//             for (let j = -1; j <= 1; j++) {
//                 const r = row + i;
//                 const c = col + j;
//                 if (r >= 0 && r < gol.numRows && c >= 0 && c < gol.numCols && !(i === 0 && j === 0)) {
//                     let val = 0
//                     let idx = 0;
//                     if (i == -1 && j == 0){
//                         // up
//                         idx = 0
//                     }
//                     else if (i == -1 && j == -1){
//                         // up-left
//                         idx = 1

//                     }
//                     else if (i == -1 && j == 1){
//                         // up right
//                         idx = 2

//                     }
//                     else if (i == 0 && j == -1){
//                         //left
//                         idx = 3
//                     }
//                     else if (i == 0 && j == 1){
//                         //right
//                         idx = 4
//                     }
//                     else if (i == 1 && j == 0){
//                         //down
//                         idx = 5
//                     }
//                     else if (i == 1 && j == -1){
//                         //down-left
//                         idx = 6
//                     }
//                     else if (i == 1 && j == 1){
//                         //down-right
//                         idx = 7
//                     }
//                      val= gol.grid[r][c];
//                      inputs[idx] = val

//                 }
//             }
//         }
//         return inputs;
//     }
//     generate(pop_size){
//          for (let i=0; i<pop_size; i++){
//             let rand_x = Math.floor(Math.random() * numCols);
//             let rand_y = Math.floor(Math.random() * numRows);
//             if (gol.grid[rand_y][rand_x] == 1 || gol.grid[rand_y][rand_x] == 2){
//                 continue
//             }
//                 gol.grid[rand_y][rand_x] = 2
//                 let inputs = this.generate_inputs(rand_y, rand_x)
//                 this.networks[this.body_id] = {
//                                             'body_id': this.body_id
//                                             ,'pos_x': rand_x
//                                             ,'pos_y': rand_y
//                                             ,'inputs': inputs
//                                         }
//                 this.body_id+=1
//         }

//     }
// }
// let sim = new Simultation()

function getCursorPosition(canvas, e) {
    const rect = canvas.getBoundingClientRect(); // canvas position + size
    mouse_x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse_y = (e.clientY - rect.top) * (canvas.height / rect.height);
    var current_x = Math.floor(mouse_x/pixel_size)
    var current_y = Math.floor(mouse_y/pixel_size)
    console.log(current_x, current_y)
    ws.send_payload({"mouse_x": Math.floor(mouse_x / pixel_size), 'mouse_y': Math.floor(mouse_y / pixel_size)}, "", 'tcp')

    // const rect = canvas.getBoundingClientRect()
    // var x = event.clientX - rect.left
    // var y = event.clientY - rect.top
    // var current_x = Math.floor(x/pixel_size)
    // var current_y = Math.floor(y/pixel_size)
    // let active_cells = []
    // console.log(current_x, current_y)
    // for (let i=0; i<mag_view_h*10; i++){
    //         for (let j=0; j<mag_view_w*10; j++){
    //             if (gol.grid[current_y+i][current_x + j] == 2){
    //                 continue
    //             }
    //             gol.grid[current_y+i][current_x + j] =1
    //             }
    //     }
}     

function mouseMove(e){
    const rect = canvas.getBoundingClientRect(); // canvas position + size
    mouse_x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse_y = (e.clientY - rect.top) * (canvas.height / rect.height);
    var current_x = Math.floor(mouse_x/pixel_size)
    var current_y = Math.floor(mouse_y/pixel_size)

}
function draw_host_cursor() {
    ctx.beginPath();
    ctx.lineWidth = "1";
    ctx.strokeStyle = "red";

    let drawX = Math.floor(mouse_x / pixel_size) * pixel_size;
    let drawY = Math.floor(mouse_y / pixel_size) * pixel_size;
    // console.log(drawX, drawY)

    ctx.rect(drawX, drawY, pixel_size, pixel_size);
    ctx.stroke();
    ctx.closePath();

}
function sendmouseCords() {
    // ws.send_payload({"mouse_x": Math.floor(mouse_x / pixel_size), 'mouse_y': Math.floor(mouse_y / pixel_size)}, "", 'tcp')

}



function draw(){
 ctx.clearRect(0, 0, canvas.width, canvas.height);


    for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[0].length; x++) {
            if (grid[y][x] === 5) {
                ctx.fillStyle = "red";
                ctx.fillRect(x * pixel_size, y * pixel_size, pixel_size, pixel_size);
            }
            if (grid[y][x] === 4) {
                ctx.fillStyle = "pink";
                ctx.fillRect(x * pixel_size, y * pixel_size, pixel_size, pixel_size);
            }
            if (grid[y][x] === 2) {
                ctx.fillStyle = "blue";
                ctx.fillRect(x * pixel_size, y * pixel_size, pixel_size, pixel_size);
            }
            if (grid[y][x] === 1) {
                ctx.fillStyle = "green";
                ctx.fillRect(x * pixel_size, y * pixel_size, pixel_size, pixel_size);
            }
        }
    }
    draw_host_cursor()

    requestAnimationFrame(draw);
    // ctx.clearRect(0, 0, canvas.width, canvas.height);
    // draw_host_cursor();
    // // gol.initialize();
    // // gol.updateGrid();
    // gol.draw_grid(););
}

    canvas.addEventListener('mousedown', function(e) {
	getCursorPosition(canvas, e)
    })
    canvas.addEventListener("mousemove", mouseMove, false);
    // canvas.addEventListener("mousedown", getCursorPosition, false);

    draw()

