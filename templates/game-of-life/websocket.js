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
			,'send_to':'ws'
            ,"content": null
            ,"is_notification": null
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
	send_payload(payload){
		let operation = "send";
		let request = "PAYLOAD";
		let prot = {
			'operation': operation
			,'request': request
			,'content': payload
			,'userId': this.userId
			,'send_to':'ws'
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
	initialize(){
		this.session = new WebSocket('wss://' + window.location.host  +'/game-of-life/session?Id='+this.sessionId);
		this.session.onopen = async () => {
			console.log("Websocket connection established");
			let operation = "client";
			let request = "POST";
			this.#protocol['operation'] = operation;
			this.#protocol['request'] = request;
			this.session.send(JSON.stringify(this.#protocol))
			let clients = await this.get_clients()
			all_clients = clients
			 clients['values'].forEach(client => {
				connected_clients.set(client['userId'], {'x': 0, 'y':0})
			});
			stage(clients)
        }
		this.session.onclose = () => {
            alert("Session Closed")
        }
	}
}