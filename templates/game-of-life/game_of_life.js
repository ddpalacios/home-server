function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }


class GameOfLife{
    constructor(grid, numRows, numCols, pixel_size){
        this.grid = grid;
        this.numRows = numRows;
        this.numCols = numCols;
        this.pixel_size = pixel_size;
    }
    initialize(){
        if (this.grid.length ==  0){
                // initial grid
                for (let i =0; i<this.numRows; i++){
                    this.grid[i] = []
                    for (let j =0; j<this.numCols; j++){
                        this.grid[i][j] = 0;
                    }
                }
            }
    }
    countNeighbors(row, col) {
        let count = 0;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const r = row + i;
                const c = col + j;
                if (r >= 0 && r < this.numRows && c >= 0 &&
                c < this.numCols && !(i === 0 && j === 0)) {
                count += this.grid[r][c];
                }
            }
        }
        return count;
    }
    updateGrid() {
        var newGrid = [];
        for (let i = 0; i < this.numRows; i++) {
            newGrid[i] = [];
            for (let j = 0; j < this.numCols; j++) {
                const neighbors = this.countNeighbors(i, j);
                if (this.grid[i][j] === 2){
                    newGrid[i][j] = this.grid[i][j];
                    continue;
                }
                if ((this.grid[i][j] === 1) && (neighbors < 2 || neighbors > 3)) {
                newGrid[i][j] = 0;
                } else if (this.grid[i][j] === 0 && neighbors === 3) {
                newGrid[i][j] = 1;
                } else {
                newGrid[i][j] = this.grid[i][j];
                }
            }
        }
        this.grid = newGrid;
        return this.grid
    }
    draw_grid(){
        let rgb = "red"
        ctx.fillStyle =rgb

        let active_cells_cords = []
        for (let i =0; i<this.numRows; i++){
            for (let j =0; j<this.numCols; j++){
                var x = j * this.pixel_size
                var y = i * this.pixel_size
                 if (this.grid[i][j] ==2){
                    ctx.fillStyle ="blue"
                        ctx.fillRect(x, y , this.pixel_size, this.pixel_size);
                        active_cells_cords.push({
                            'x':x
                            ,'y':y
                        })
                }
                if (this.grid[i][j] ==1){
                        rgb = "red"
                        ctx.fillStyle =rgb
  
                        ctx.fillRect(x, y , this.pixel_size, this.pixel_size);
                        active_cells_cords.push({
                            'x':x
                            ,'y':y
                        })
                }
            }
        }
        return active_cells_cords
    }
}

// function draw_small_grid_lines(){
// 	ctx.beginPath();
// 		ctx.lineWidth = "1";
// 		ctx.strokeStyle = "red";
// 		var s = pixel_size*2 
// 		for (let i=0; i<mag_view_h; i++){
// 			for (let j=0; j<mag_view_w; j++){
// 				ctx.rect(mouse_x+(s*j) ,  mouse_y+(s*i), s, s);
// 		}
// 	}
// 		ctx.stroke();
// 		ctx.closePath();

// 	}

	// function getCursorPosition(canvas, event) {
	// const rect = canvas.getBoundingClientRect()
	// var x = event.clientX - rect.left
	// var y = event.clientY - rect.top
	// var current_x = Math.floor(x/pixel_size)
	// var current_y = Math.floor(y/pixel_size)
	// for (let i=0; i<10; i++){
	// 		for (let j=0; j<10; j++){
	// 			big_canvas_grid[current_y+i][ current_x + j] =1
	// 			// client_cords.push({'x': current_x + j, 'y': current_y+i})
	// 			}
	// 	}
	// }


// function mouseMove(e){
// 	e.preventDefault();
// 	cPostX = e.pageX - canvas.offsetLeft;
// 	cPostY = e.pageY - canvas.offsetTop;
// 	mouse_x = cPostX;
// 	mouse_y = cPostY;
//     if (websocket != null){
//         console.log("SENDING MOUSE CORDS")
//         websocket.send_coordinates(mouse_x, mouse_y)
//     }
	// var current_x = Math.floor(mouse_x/pixel_size)
	// var current_y = Math.floor(mouse_y/pixel_size)
	//  big_canvas_grid[current_y][current_x] = 1
	// // for (let i=0; i<mag_view_h; i++){
	// // 		for (let j=0; j<mag_view_w; j++){
    // //             big_canvas_grid[current_y+i][ current_x + j] =1
	// // 			}
	// // 	}

// 	}
// function countNeighbors(row, col) {
//         let count = 0;
//         for (let i = -1; i <= 1; i++) {
//         for (let j = -1; j <= 1; j++) {
//             const r = row + i;
//             const c = col + j;
//             if (r >= 0 && r < numRows && c >= 0 &&
//             c < numCols && !(i === 0 && j === 0)) {
//             count += big_canvas_grid[r][c];
//             }
//         }
//         }
//         return count;
// }
// function updateGrid() {
//         var newGrid = [];
//         for (let i = 0; i < numRows; i++) {
//             newGrid[i] = [];
//             for (let j = 0; j < numCols; j++) {
//                 const neighbors = countNeighbors(i, j);
//                 if ((big_canvas_grid[i][j] === 1) && (neighbors < 2 || neighbors > 3)) {
//                 newGrid[i][j] = 0;
//                 } else if (big_canvas_grid[i][j] === 0 && neighbors === 3) {
//                 newGrid[i][j] = 1;
//                 } else {
//                 newGrid[i][j] = big_canvas_grid[i][j];
//                 }
//             }
//         }
//         big_canvas_grid = newGrid;

//         return big_canvas_grid
// }
// function start(){
// 	 ctx.clearRect(0, 0, canvas.width, canvas.height);
// 	 draw_small_grid_lines()
	// if (big_canvas_grid.length ==  0){
    //                 // initial grid
    //                 for (let i =0; i<numRows; i++){
    //                     big_canvas_grid[i] = []
    //                     for (let j =0; j<numCols; j++){
    //                         big_canvas_grid[i][j] = 0;
    //                     }
    //                 }
    //             }
//         big_canvas_grid = updateGrid() 

        // for (let i =0; i<numRows; i++){
        //     for (let j =0; j<numCols; j++){
        //         var x = j * pixel_size
        //         var y = i * pixel_size
        //         if (big_canvas_grid[i][j] ==1){
        //                 ctx.fillStyle = 'rgba(38, 130, 235, 1)'
        //                 ctx.fillRect(x, y , pixel_size, pixel_size);
        //         }
        //     }
//         }

// 	requestAnimationFrame(start);
// }
// canvas.addEventListener("mousemove", mouseMove, false);

// canvas.addEventListener('mousedown', function(e) {
// 	getCursorPosition(canvas, e)
// })
window.addEventListener("resize", resizeCanvas);
    resizeCanvas(); 

// start()