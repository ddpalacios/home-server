class Websocket_Session{
	#protocol
	constructor(app){
		this.#protocol = {
			"operation": null
            ,"request" : null
            ,'timestamp': new Date().toISOString()
            ,'app': app
			,'send_to':null
		}
	}
	close_all_connections(){
		let operation = "session";
		let request = "DELETE";
		this.#protocol['operation'] = operation;
		this.#protocol['request'] = request;
		this.session.send(JSON.stringify(this.#protocol))
	}
	send_coordinates(x, y){
		let operation = "coordinates";
		let request = "MOUSE";
		this.#protocol['operation'] = operation;
		this.#protocol['request'] = request;
		this.#protocol['content'] = {"x": x, 'y': y};

		this.session.send(JSON.stringify(this.#protocol))

		


	}
	async get_clients(){
		var request = new Request('game-of-life/client?sessionId='+this.sessionId, {
					method: 'GET',
					headers: new Headers({
								'Accept': 'application/json'
							})
		});
        var clients = null;
        var response = await fetch(request);
        if (response.ok){ 
            clients = await response.json()
        }
        return clients;
	}
	send_payload(payload, socketId, sendTo){
		let operation = "send";
		let request = "PAYLOAD";
		let prot = {
			'operation': operation
			,'request': request
			,'content': payload
			,'socketId': socketId
			,'send_to':sendTo
		}
		this.session.send(JSON.stringify(prot))
	}

	send_message(username,message, is_notification){
		let operation = "message";
		let request = "POST";
		this.#protocol['operation'] = operation;
		this.#protocol['request'] = request;
		this.#protocol['username'] = username;
		this.#protocol['content'] = message;
		this.#protocol['is_notification'] = is_notification;
		this.session.send(JSON.stringify(this.#protocol))
	}
	initialize(url){
		const endpoint = (typeof url === "string" && url.length > 0)
			? url
			: ('wss://' + window.location.host  +'/connect');
		this.session = new WebSocket(endpoint);
		this.session.onopen = async () => {
			console.log("Websocket connection established");
        }
		this.session.onclose = () => {
            alert("Session Closed")
        }
	}
}
