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
    if (ws && typeof ws.send_payload === "function") {
        ws.send_payload({"mouse_x": Math.floor(mouse_x / pixel_size), 'mouse_y': Math.floor(mouse_y / pixel_size)}, "", 'tcp')
    }
    if (typeof renderFrame === "function") {
        renderFrame();
    }

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

function bodyStyleForId(bodyId) {
    const seed = Math.abs(parseInt(bodyId || 0, 10)) || 1;
    const hue = (seed * 47) % 360;
    const eyeOffset = ((seed % 7) - 3) * 0.04;
    return {
        hue,
        eyeOffset
    };
}



function renderFrame() {
 ctx.clearRect(0, 0, canvas.width, canvas.height);


    /* -----------------
    Added code block:
    Description: Render only bodies and radius offsets to avoid scanning the entire grid every frame.
    drawFoods();
    if (Array.isArray(bodies)) {
        consumeFoods(bodies);
        consumeFoods(bodies);
        bodies.forEach(body => {
            const centerX = body.pos_x * pixel_size + pixel_size / 2;
            const centerY = body.pos_y * pixel_size + pixel_size / 2;
            const radius = pixel_size * 1.6;
            if (Array.isArray(radiusOffsets)) {
                const ringRadius = (Math.max(0, currentRadius || 0) + 1.6) * pixel_size;
                ctx.save();
                ctx.strokeStyle = "rgba(148, 197, 255, 0.9)";
                ctx.lineWidth = Math.max(1.5, pixel_size * 0.22);
                ctx.shadowColor = "rgba(99, 179, 237, 0.75)";
                ctx.shadowBlur = pixel_size * 2.2;
                ctx.beginPath();
                ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                const ringGradient = ctx.createRadialGradient(
                    centerX,
                    centerY,
                    Math.max(1, ringRadius * 0.6),
                    centerX,
                    centerY,
                    ringRadius
                );
                ringGradient.addColorStop(0, "rgba(56, 189, 248, 0.0)");
                ringGradient.addColorStop(0.6, "rgba(56, 189, 248, 0.12)");
                ringGradient.addColorStop(1, "rgba(56, 189, 248, 0.0)");
                ctx.fillStyle = ringGradient;
                ctx.beginPath();
                ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.save();
            ctx.shadowColor = "rgba(56, 189, 248, 0.65)";
            ctx.shadowBlur = pixel_size * 1.9;
            const coreGradient = ctx.createRadialGradient(
                centerX - radius * 0.3,
                centerY - radius * 0.3,
                radius * 0.2,
                centerX,
                centerY,
                radius
            );
            coreGradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
            coreGradient.addColorStop(0.35, "rgba(56, 189, 248, 0.95)");
            coreGradient.addColorStop(1, "rgba(14, 116, 144, 0.95)");
            ctx.fillStyle = coreGradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }
    ----------------- */
    if (Array.isArray(bodies)) {
        bodies.forEach(body => {
            const centerX = body.pos_x * pixel_size + pixel_size / 2;
            const centerY = body.pos_y * pixel_size + pixel_size / 2;
            const radius = pixel_size * 3.2;
            const bodyId = body.body_id != null ? body.body_id : `${body.pos_x}:${body.pos_y}`;
            const style = bodyStyleForId(bodyId);

            if (Array.isArray(radiusOffsets)) {
                const ringRadius = (Math.max(0, currentRadius || 0) + 1.4) * pixel_size;
                ctx.save();
                ctx.strokeStyle = "rgba(148, 197, 255, 0.92)";
                ctx.lineWidth = Math.max(1.5, pixel_size * 0.22);
                ctx.shadowColor = "rgba(56, 189, 248, 0.85)";
                ctx.shadowBlur = pixel_size * 2.6;
                ctx.beginPath();
                ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                const ringGradient = ctx.createRadialGradient(
                    centerX,
                    centerY,
                    Math.max(1, ringRadius * 0.6),
                    centerX,
                    centerY,
                    ringRadius
                );
                ringGradient.addColorStop(0, "rgba(56, 189, 248, 0.0)");
                ringGradient.addColorStop(0.6, "rgba(56, 189, 248, 0.16)");
                ringGradient.addColorStop(1, "rgba(56, 189, 248, 0.0)");
                ctx.fillStyle = ringGradient;
                ctx.beginPath();
                ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.save();
            ctx.shadowColor = "rgba(56, 189, 248, 0.75)";
            ctx.shadowBlur = pixel_size * 2.4;
            const coreGradient = ctx.createRadialGradient(
                centerX - radius * 0.3,
                centerY - radius * 0.3,
                radius * 0.2,
                centerX,
                centerY,
                radius
            );
            coreGradient.addColorStop(0, "rgba(255, 255, 255, 0.98)");
            coreGradient.addColorStop(0.28, `hsla(${style.hue}, 90%, 78%, 0.98)`);
            coreGradient.addColorStop(0.6, `hsla(${style.hue}, 80%, 55%, 0.98)`);
            coreGradient.addColorStop(1, `hsla(${style.hue}, 70%, 25%, 0.98)`);
            ctx.fillStyle = coreGradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = Math.max(1.5, pixel_size * 0.22);
            ctx.strokeStyle = "rgba(224, 242, 254, 0.9)";
            ctx.stroke();
            ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
            ctx.beginPath();
            ctx.arc(centerX - radius * 0.32, centerY - radius * 0.32, radius * 0.28, 0, Math.PI * 2);
            ctx.fill();

            const eyeSpacing = radius * (0.55 + style.eyeOffset);
            const eyeRadius = radius * 0.22;
            const pupilRadius = radius * 0.11;
            const eyeY = centerY - radius * 0.1;
            const leftEyeX = centerX - eyeSpacing * 0.5;
            const rightEyeX = centerX + eyeSpacing * 0.5;
            const gazeX = Math.sin((body.pos_x + body.pos_y) * 0.35) * eyeRadius * 0.35;
            const gazeY = Math.cos((body.pos_x - body.pos_y) * 0.28) * eyeRadius * 0.35;

            ctx.shadowColor = "rgba(255, 255, 255, 0.4)";
            ctx.shadowBlur = pixel_size * 0.8;
            ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
            ctx.beginPath();
            ctx.arc(leftEyeX, eyeY, eyeRadius, 0, Math.PI * 2);
            ctx.arc(rightEyeX, eyeY, eyeRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
            ctx.beginPath();
            ctx.arc(leftEyeX + gazeX, eyeY + gazeY, pupilRadius, 0, Math.PI * 2);
            ctx.arc(rightEyeX + gazeX, eyeY + gazeY, pupilRadius, 0, Math.PI * 2);
            ctx.fill();

            const mouthY = centerY + radius * 0.32;
            const mouthRadius = radius * .6;
            if (body.isTopFitness) {
                ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
                ctx.beginPath();
                ctx.arc(centerX, mouthY, mouthRadius, 0, Math.PI);
                ctx.fill();
                ctx.strokeStyle = "rgba(15, 23, 42, 0.7)";
                ctx.lineWidth = Math.max(1, pixel_size * 0.1);
                ctx.beginPath();
                ctx.arc(centerX, mouthY, mouthRadius, 0, Math.PI);
                ctx.stroke();
                const toothCount = 5;
                const toothWidth = (mouthRadius * 1.4) / toothCount;
                const toothHeight = mouthRadius * 0.35;
                const toothTop = mouthY - toothHeight * 0.9;
                ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
                for (let t = 0; t < toothCount; t++) {
                    const toothCenter = centerX - (mouthRadius * 0.7) + toothWidth * (t + 0.5);
                    ctx.beginPath();
                    ctx.moveTo(toothCenter - toothWidth * 0.35, toothTop);
                    ctx.lineTo(toothCenter + toothWidth * 0.35, toothTop);
                    ctx.lineTo(toothCenter, toothTop + toothHeight);
                    ctx.closePath();
                    ctx.fill();
                }
            } else {
                ctx.strokeStyle = "rgba(15, 23, 42, 0.7)";
                ctx.lineWidth = Math.max(1, pixel_size * 0.1);
                ctx.beginPath();
                ctx.arc(centerX, mouthY, mouthRadius, 0.15 * Math.PI, 0.85 * Math.PI);
                ctx.stroke();
            }

            if (body.isTopFitness) {
                ctx.save();
                ctx.shadowColor = "rgba(251, 191, 36, 0.9)";
                ctx.shadowBlur = pixel_size * 3;
                ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
                ctx.lineWidth = Math.max(2, pixel_size * 0.28);
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius * 1.25, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                ctx.save();
                ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
                ctx.lineWidth = Math.max(3, pixel_size * 0.45);
                ctx.lineCap = "round";
                const armLength = radius * 0.95;
                const armY = centerY + radius * 0.15;
                ctx.beginPath();
                ctx.moveTo(centerX - radius * 0.95, armY);
                ctx.lineTo(centerX - radius * 0.95 - armLength * 0.6, armY - armLength * 0.25);
                ctx.lineTo(centerX - radius * 0.95 - armLength, armY + armLength * 0.2);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(centerX + radius * 0.95, armY);
                ctx.lineTo(centerX + radius * 0.95 + armLength * 0.6, armY - armLength * 0.25);
                ctx.lineTo(centerX + radius * 0.95 + armLength, armY + armLength * 0.2);
                ctx.stroke();

                ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
                ctx.beginPath();
                ctx.arc(centerX - radius * 0.95 - armLength, armY + armLength * 0.2, radius * 0.26, 0, Math.PI * 2);
                ctx.arc(centerX + radius * 0.95 + armLength, armY + armLength * 0.2, radius * 0.26, 0, Math.PI * 2);
                ctx.fill();

                const hatWidth = radius * 1.4;
                const hatHeight = radius * 0.55;
                const hatY = centerY - radius * 1.15;
                ctx.fillStyle = "rgba(236, 72, 153, 0.98)";
                ctx.beginPath();
                ctx.roundRect(centerX - hatWidth * 0.5, hatY - hatHeight, hatWidth, hatHeight, radius * 0.18);
                ctx.fill();
                ctx.fillStyle = "rgba(59, 130, 246, 0.95)";
                ctx.fillRect(centerX - hatWidth * 0.5, hatY - hatHeight * 0.3, hatWidth, hatHeight * 0.22);
                ctx.fillStyle = "rgba(236, 72, 153, 0.98)";
                ctx.beginPath();
                ctx.roundRect(centerX - hatWidth * 0.7, hatY - hatHeight * 0.05, hatWidth * 1.4, hatHeight * 0.18, radius * 0.12);
                ctx.fill();

                ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
                ctx.lineWidth = Math.max(3, pixel_size * 0.45);
                ctx.lineCap = "round";
                const legLength = radius * 0.9;
                const legY = centerY + radius * 0.95;
                ctx.beginPath();
                ctx.moveTo(centerX - radius * 0.4, legY);
                ctx.lineTo(centerX - radius * 0.55, legY + legLength);
                ctx.moveTo(centerX + radius * 0.4, legY);
                ctx.lineTo(centerX + radius * 0.55, legY + legLength);
                ctx.stroke();
                ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
                ctx.beginPath();
                ctx.arc(centerX - radius * 0.55, legY + legLength, radius * 0.26, 0, Math.PI * 2);
                ctx.arc(centerX + radius * 0.55, legY + legLength, radius * 0.26, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            ctx.restore();
        });
    }
    draw_host_cursor();
}

    canvas.addEventListener('mousedown', function(e) {
	getCursorPosition(canvas, e)
    })
    canvas.addEventListener("mousemove", mouseMove, false);
    // canvas.addEventListener("mousedown", getCursorPosition, false);

    renderFrame()

