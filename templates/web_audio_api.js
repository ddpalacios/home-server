const audioCtx = new AudioContext();
const canvas = document.querySelector("#visualizer");
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
const canvasCtx = canvas.getContext("2d");
const analyser = audioCtx.createAnalyser();
analyser.minDecibels = -90;
analyser.maxDecibels = -10;
analyser.smoothingTimeConstant = 0.85;

  function visualize() {
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;


      analyser.fftSize = 2048;
      const bufferLength = analyser.fftSize;
      console.log(bufferLength);

      // We can use Float32Array instead of Uint8Array if we want higher precision
      // const dataArray = new Float32Array(bufferLength);
      const dataArray = new Uint8Array(bufferLength);

      canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

      const draw = () => {
        drawVisual = requestAnimationFrame(draw);

        analyser.getByteTimeDomainData(dataArray);

        canvasCtx.fillStyle = "black"
        canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = "pink"

        canvasCtx.beginPath();

        const sliceWidth = (WIDTH * 1.0) / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * HEIGHT) / 2;

          if (i === 0) {
            canvasCtx.moveTo(x, y);
          } else {
            canvasCtx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        canvasCtx.lineTo(WIDTH, HEIGHT / 2);
        canvasCtx.stroke();
      };

      draw();
  }

async function main(){
 
    const constraints = { audio: true };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    visualize()
}
main()