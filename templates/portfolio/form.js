    document.getElementById("my-form").addEventListener("submit", async function(event) {
        event.preventDefault();
        const company_name = this.elements["company_name"].value;
        const company_email = this.elements["company_email"].value;
        const first_name = this.elements["first_name"].value;
        const last_name = this.elements["last_name"].value;
        const phone = this.elements["phone"].value;
        const project_details = this.elements["project_details"].value;
        const payload = {"values":[{
                              project_details: project_details
                              ,submit_date: Date().toLocaleString()
                              ,phone:phone
                              ,company_email:company_email
                              ,first_name: first_name
                              ,last_name: last_name
                              ,company_name: company_name
                          }
                  ]
        };
        var request = new Request('/blob-storage/email', {
                                    method: 'POST',
                                    headers: new Headers({
                                                'Accept': 'application/json'
                                            })
                ,body: JSON.stringify(payload)
                        });
          var response = await fetch(request);
          document.getElementById("send_button").innerHTML = "Form Submitted!"
          alert("Request sent! A confirmation email will be sent out to you soon.")
    });