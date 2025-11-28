
var food_x = 900
var food_y = 500
async function post_canvas_size(socketId){
    console.log("Canvas Width", canvas.width, 'HEIGHT:', canvas.height)
    if (socketId == null || socketId == undefined){
        alert("No Socket Found")
        return
    }

          var request = new Request('/neat/initialize', {
                                method: 'POST',
                                headers: new Headers({
                                            'Accept': 'application/json'
                                        })
			       ,body: JSON.stringify({
					       "canvas_width":canvas.width
                           ,"canvas_height": canvas.height
                           ,'food_x': food_x
                           ,'food_y': food_y
                           ,'pixel_size': pixel_size
                           ,'socketId': socketId
				       })
                    });
           fetch(request);
    }

function resizeCanvas() {
    console.log("Resized")
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // drawBox();
}

function drawBox(x,y,pixel_size) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "red";
    ctx.fillRect(x, y, pixel_size, pixel_size);

    ctx.fillStyle = "teal";
    ctx.fillRect(food_x, food_y, pixel_size, pixel_size);
}



document.addEventListener("keydown", (e) => {
    switch (e.key) {
        case "ArrowUp":
        case "w": y -= speed; break;
        case "ArrowDown":
        case "s": y += speed; break;
        case "ArrowLeft":
        case "a": x -= speed; break;
        case "ArrowRight":
        case "d": x += speed; break;
    }

    // x = Math.max(0, Math.min(canvas.width - pixel_size, x));
    // y = Math.max(0, Math.min(canvas.height - pixel_size, y));
    // let left_distance_pixels = x 
    // let right_distance_pixels =  ((canvas.width - pixel_size) - x)
    // let up_distance_pixels = y  
    // let down_distance_pixels = ((canvas.height - pixel_size) - y) 
    // console.log("Canvas Width", canvas.width, 'HEIGHT:', canvas.height)

    // let left_distance_pixels = x / canvas.width
    // let right_distance_pixels =  ((canvas.width - pixel_size) - x) / canvas.width
    // let up_distance_pixels = y  / canvas.height
    // let down_distance_pixels = ((canvas.height - pixel_size) - y) / canvas.height
    // console.log(left_distance_pixels, right_distance_pixels, up_distance_pixels, down_distance_pixels)
    // console.log(x, y,canvas.width - pixel_size,canvas.height - pixel_size)

    // drawBox();
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
