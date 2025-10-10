class Websocket_Session{
	#protocol
	constructor(sessionId, userId, username){
		this.sessionId = sessionId;
		this.userId = userId;
		this.username = username;
		this.session = null;
		this.#protocol = {
			"operation": null
            ,"request" : null
            ,'timestamp': new Date().toISOString()
            ,'sessionId': this.sessionId
			,'userId': this.userId
			,'username': this.username
            ,"content": null
            ,"is_notification": null
		}
	}

	send_message(message){
		let operation = "request";
		let request = "CTA";
		this.#protocol['operation'] = operation;
		this.#protocol['request'] = request;
		this.#protocol['content'] = message;
		this.session.send(JSON.stringify(this.#protocol))
	}
	initialize(){
		this.session = new WebSocket('wss://' + window.location.host  +'/websocket');
		this.session.onopen = async () => {
            console.log("Websocket connection established");
			let operation = "client";
			let request = "POST";
			this.#protocol['operation'] = operation;
			this.#protocol['request'] = request;
			this.session.send(JSON.stringify(this.#protocol))
        }
		this.session.onclose = () => {
            alert("Session Closed")
        }
	}
}