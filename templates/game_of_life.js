class Cell{
    constructor(xpos, ypos){
        this.xpos = xpos;
        this.ypos = ypos;
        this.isAlive = 0;
    }

    get_coordinates(){
        return JSON.stringify([this.xpos, this.ypos])
    }


    look_up(){
        var x_pos = 0
        var y_pos = -1
        return JSON.stringify([this.xpos + x_pos, this.ypos+y_pos])  
    }
    look_down(){
        var x_pos = 0
        var y_pos = 1
        return JSON.stringify([this.xpos + x_pos, this.ypos+y_pos])  

    }
    look_left(){
        var x_pos = -1
        var y_pos = 0
        return JSON.stringify([this.xpos + x_pos, this.ypos+y_pos])  

    }
    look_right(){
        var x_pos = 1
        var y_pos = 0
        return JSON.stringify([this.xpos + x_pos, this.ypos+y_pos])  

    }
    look_up_left(){
        var x_pos = -1
        var y_pos = -1
        return JSON.stringify([this.xpos + x_pos, this.ypos+y_pos])  

    }
    look_up_right(){
        var x_pos = 1
        var y_pos = -1
        return JSON.stringify([this.xpos + x_pos, this.ypos+y_pos])  

    }
    look_down_left(){
        var x_pos = -1
        var y_pos = 1
        return JSON.stringify([this.xpos + x_pos, this.ypos+y_pos])  

    }
    look_down_right(){
        var x_pos = 1
        var y_pos = 1
        return JSON.stringify([this.xpos + x_pos, this.ypos+y_pos])  

    }

}


class Grid{
    constructor(width, height){
        this.width = width;
        this.height = height;
        this.list_of_cells = {};
        this.matrix_grid = [];
        this.grid_dictionary = {};
        this.canvas = document.getElementById('myCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;

        this.create_gird();



    }
   check_grid_value_by_position(position){
        var result = this.grid_dictionary[position];
        if (result == null || result == undefined){
            return 0;
        }
        return result;


   }

    create_gird(){
        this.matrix_grid = []
        var matrix_height = this.height;
        var matrix_width = this.width;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (var row_height=0; row_height< matrix_height; row_height++){
            var row = [];
            for (var row_width=0; row_width < matrix_width; row_width++){

                var key = JSON.stringify([row_height, row_width]);
                var grid_value = this.grid_dictionary[key];

                if (grid_value != null || grid_value != undefined){
                    row.push(grid_value);

                }else{

                    this.grid_dictionary[key] = 0;
                    row.push(0);

                }

                
                var cellSize = this.canvas.width / this.width;
                this.ctx.beginPath();


                if (grid_value=== 1) {
                    this.ctx.fillStyle = 'pink'; // Color for 1
                } else {
                    this.ctx.fillStyle = 'black'; // Color for 0
                }
                this.ctx.fillRect(row_height * cellSize, row_width * cellSize, cellSize, cellSize);
                this.ctx.strokeRect(row_height * cellSize, row_width * cellSize, cellSize, cellSize); // Optional: draw border
                this.ctx.closePath();
            }
            this.matrix_grid.push(row)
        }
        return this.matrix_grid;
    }

    add_or_kill_cell(cell, isAlive){
        cell.isAlive = isAlive;
        this.grid_dictionary[cell.get_coordinates()] = cell.isAlive;
       

    }
    get_neighbor_count(cell){
        var neighbor_count = 0;
        var up_value = this.check_grid_value_by_position(cell.look_up());
        var down_value = this.check_grid_value_by_position(cell.look_down());
        var left_value = this.check_grid_value_by_position(cell.look_left());
        var right_value = this.check_grid_value_by_position(cell.look_right());
        var up_left_value = this.check_grid_value_by_position(cell.look_up_left());
        var up_right_value = this.check_grid_value_by_position(cell.look_up_right());
        var down_left_value = this.check_grid_value_by_position(cell.look_down_left());
        var down_right_value = this.check_grid_value_by_position(cell.look_down_right());

        neighbor_count =  up_value + down_value + down_left_value + down_right_value + up_left_value + up_right_value + left_value + right_value
        
        return neighbor_count



        

    }
    generate_list_of_cells_at_random_positions(pop_size){
        for (var i=0; i<pop_size; i++){
            for (var r=0; r < 100; r++){
                var random_x = Math.floor(Math.random() * this.width)
                var random_y = Math.floor(Math.random() * this.height)
                
                var key = JSON.stringify([random_x, random_y]);

                var grid_value = this.grid_dictionary[key];
                if (grid_value == 1){
                    continue;       
                }
                var cell = new Cell(random_x, random_y)
                this.list_of_cells[cell.get_coordinates()] = cell;
                this.add_or_kill_cell(cell, 1)
                break;
        }

        }
        var new_matrix_grid = this.create_gird()
        this.matrix_grid = new_matrix_grid;
        return this.matrix_grid;
        

    }
    scan_and_recreate_grid(){
        for (let key of Object.keys(this.list_of_cells)) {
            var cell = this.list_of_cells[key]
            var neighbor_count = this.get_neighbor_count(cell)
            if (cell.isAlive == 1){
                if (neighbor_count == 0 || neighbor_count == 1){
                    cell.isAlive = 0;
                    this.grid_dictionary[cell.get_coordinates()] = cell.isAlive;

            }
                else if (neighbor_count >= 3){
                    cell.isAlive = 0;
                    this.grid_dictionary[cell.get_coordinates()] = cell.isAlive;   
                }
            }else{
                if (neighbor_count == 3){
                    cell.isAlive = 1;
                    this.grid_dictionary[cell.get_coordinates()] = cell.isAlive;

                }
            
            }

        }
    
    return this.create_gird();

}

}

let lastUpdate = 0;
const updateInterval = 100; // Time in milliseconds between updates

function animate(grid, timestamp) {
    if (timestamp - lastUpdate > updateInterval) {
        grid.scan_and_recreate_grid();  // Update the grid
        lastUpdate = timestamp;
    }
    requestAnimationFrame((newTimestamp) => animate(grid, newTimestamp));
}

function main(){
    var matrix_height = 40;
    var matrix_width = 40;
    var grid = new Grid(matrix_width, matrix_height);
    grid.generate_list_of_cells_at_random_positions(1000)
    requestAnimationFrame((timestamp) => animate(grid, timestamp));
}

main();