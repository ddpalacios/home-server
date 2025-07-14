 const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');


function create_grid(width, height, grid){
	for (var i=0; i<height;i++){
		var row = []
		for (var j=0; j<width; j++){
			row.push(0);
		}
			grid.push(row);
	}
}
function fill_grid(grid){
	for (var i=0; i<grid.length;i++){
		for (var j=0; j<grid[0].length; j++){
			var val = Math.round(Math.random());
			grid[i][j] = val;
		}
	}
}
function drawGrid(grid, r, c) {
    var cellSize = 2;
	const numRows = Math.floor(canvas.height / cellSize);
        const numCols = Math.floor(canvas.width / cellSize);
	
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < numRows; i++) {
	for (let j = 0; j < numCols; j++) {
	    if (grid[i][j] === 1) {
		ctx.fillStyle = 'white';
		ctx.fillRect(j * cellSize, i *
			     cellSize, cellSize, cellSize);
	    }
	}
    }
}


function main(){
	var width = 30;
	var height = 30;
	var grid = [];
	create_grid(width, height, grid);
	fill_grid(grid);
	console.log(grid);
	new_grid = []
	for (var i=0; i<grid.length;i++){
		var row = []
		for (var j=0; j<grid[0].length; j++){
			var left_neighbor = 0; 
			var right_neighbor = 0; 
			var top_neighbor = 0; 
			var bottom_neighbor = 0; 
			var top_left_neighbor = 0; 
			var top_right_neighbor = 0; 
			var bottom_right_neighbor = 0; 
			var bottom_left_neighbor = 0; 
			var current_value = grid[i][j];
			if ((j-1) >= 0){
				left_neighbor = grid[i][j-1];
			}if ((j+1) < grid[0].length -1) {
				right_neighbor = grid[i][j+1];
			}if ((i-1) >= 0){
				top_neighbor = grid[i-1][j];
				if (j-1 >=0){
					top_left_neighbor = grid[i-1][j-1];
				}
				if (j+1 < grid[0].length -1){
					top_right_neighbor = grid[i-1][j+1];
				}
			}if (i+1 < grid.length - 1){
				bottom_neighbor = grid[i+1][j];
				if (j-1 >=0){
					bottom_left_neighbor = grid[i+1][j-1];
				}
				if (j+1 < grid[0].length -1){
					bottom_right_neighbor = grid[i+1][j+1];
				}
			}
			var total_neighbors = left_neighbor + right_neighbor + top_neighbor + bottom_neighbor + top_right_neighbor + top_left_neighbor + bottom_left_neighbor + bottom_right_neighbor;

			if (current_value==1 && total_neighbors < 2){
				// Under Population
				row.push(0);
				continue;
			}if (current_value == 1 && total_neighbors > 3){
				//Over Population
				row.push(0);
				continue;
			}if (current_value == 1 && (total_neighbors == 2 || total_neighbors ==3)){
				// Stays Alive
				row.push(1);
				continue;
			}if (current_value == 0 && total_neighbors == 3){
				// Regenerates
				row.push(1);
				continue;
			}
			row.push(current_value);
			//console.log("Total Neighbors: "+total_neighbors);
		}
		new_grid.push(row);
		}
	console.log(new_grid);
	drawGrid(new_grid, height, width);
}
main();
