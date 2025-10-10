class Websocket_Session{
	#protocol
	constructor(){
		this.session = null;
		this.#protocol = {
			"operation": null
            ,"request" : null
            ,'timestamp': new Date().toISOString()
		}
	}
	close_all_connections(){
		let operation = "session";
		let request = "DELETE";
		this.#protocol['operation'] = operation;
		this.#protocol['request'] = request;
		this.session.send(JSON.stringify(this.#protocol))
	}
	send_payload(payload, send_to,socketId){
		let operation = "send";
		let request = "PAYLOAD";
		let prot = {
			'operation': operation,
			'send_to':send_to,
			'socketId': socketId
			,'request': request
			,'content': payload
		}
		// console.log("SENDING", prot);
		this.session.send(JSON.stringify(prot))
	}
	initialize(){
		this.session = new WebSocket('wss://' + window.location.host  +'/websocket_session');
		this.session.onopen = async () => {
			console.log("Websocket connection established");
        }
		this.session.onclose = () => {
            alert("Session Closed")
        }
	}
}
