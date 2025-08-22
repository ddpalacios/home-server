async function start_websocket(){
	if (websocket_session != null){return;}
	websocket_session = new WebSocket('wss://' + window.location.host  +'/life-of-sounds/websocket');
	websocket_session.onopen = () => {
	}
	websocket_session.onmessage = (event) => {
		console.error("Message from server", event.data, error);
	}
	websocket_session.onerror = (error) => {
		console.error("Websocket error:", error);
	}
	websocket_session.onclose = () => {
		console.log("Websocket connection closed");
	}			
}

function main(){

    }
main()
