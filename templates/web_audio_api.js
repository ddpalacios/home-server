let canvas = document.querySelector("#visualizer");
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
let canvasCtx = canvas.getContext("2d");
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

function visualize(timestamp, dataArray, bufferLength) {
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
  canvasCtx.fillStyle = "black";
  canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

  canvasCtx.lineWidth = 1;
  canvasCtx.strokeStyle = "pink";
  canvasCtx.beginPath();

  const sliceWidth = WIDTH / bufferLength;
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

  canvasCtx.stroke();
}

async function main(){
  start_websocket()
  const constraints = { audio: true };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048; 
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  function draw(timestamp) {
    analyser.getByteTimeDomainData(dataArray);
    visualize(timestamp, dataArray, dataArray.length);
    requestAnimationFrame(draw);
  }
  draw();
  const mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = function (e) {
    if (websocket_session.readyState === WebSocket.OPEN) {
      websocket_session.send(e.data); 
    }
  };
  mediaRecorder.start(10); 
}
window.addEventListener("load", () => {
  main().catch(err => {
    console.error("Audio setup failed:", err);
  });
});
