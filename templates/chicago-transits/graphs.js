async function get_delay_summary(){
      var request = new Request('/blob-storage/gold/CTA/ctabustracker/delays', {
                          method: 'GET',
                          headers: new Headers({'Accept': 'application/json'})});
      var response = await fetch(request);
      let result = null
      if (response.ok){ 
          result = await response.json()
          result = result['values']
      }
      return result;

  }

async function get_bronze_predictions(){
      var request = new Request('/blob-storage/bronze/CTA/ctabustracker/predictions?rt=49', {
                          method: 'GET',
                          headers: new Headers({'Accept': 'application/json'})});
      var response = await fetch(request);
      let result = null
      if (response.ok){ 
          result = await response.json()
          result = result['values']
      }
      return result;

  }
async function plot_delay_summary(){
    var delays = await get_delay_summary()
    console.log(delays)
    labels = []
    y = []
    delays.forEach(element => {
      labels.push(element['pulldatetime'])
      y.push(element['total_delayed'])
    });
    console.log(labels)

    
    let ctx = document.getElementById('areaLineChart').getContext('2d');
    const areaLineChart = new Chart(ctx, {
      type: 'line', // Line chart type
      data: {
        labels: labels,
        datasets: [{
          label: 'Delayed Vehicals',
          data: y,
          borderColor: 'rgba(75, 192, 192, 1)', // Line color
          backgroundColor: 'rgba(255, 255, 255, 0.2)', // Fill color for the area
          borderWidth: 2,
          pointRadius: 5,

          fill: true // Enables the area fill
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
             labels: {
                    color: 'white', // Change legend text color
                    font: {
                        size: 18 // Optional: Adjust font size
                    }
                  },
            display: true,
            position: 'top'
          }
        },
        scales: {
          x: {
             ticks: {
                    color: 'white' // Change X-axis label color
                },
            
            title: {
              display: true,
              text: 'Date Time'
              ,color: '#ffffffff', // black
                font: {
                  size: 18,       // font size in pixels
                  weight: 'bold', // optional
              }
            }
          },
          y: {
              ticks: {
                    color: 'white' // Change X-axis label color
                },
            title: {
              display: false,
              text: 'Delays'
            },
            beginAtZero: true
            
          }
        }
      }
    });
  }
async function get_route_delay_summary(){
      var request = new Request('/blob-storage/gold/CTA/ctabustracker/route_delays', {
                          method: 'GET',
                          headers: new Headers({'Accept': 'application/json'})});
      var response = await fetch(request);
      let result = null
      if (response.ok){ 
          result = await response.json()
          result = result['values']
      }
      return result;

  }
function prettyPrintJson(obj) {
      let json = JSON.stringify(obj, null, 2);
      json = json
          .replace(/&/g, '&amp;') 
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|\b\d+\b)/g, match => {
          let color = '#ce9178';
          if (/^"/.test(match)) {
              color = /:$/.test(match) ? '#9cdcfe' : '#ce9178';
          } else if (/true|false/.test(match)) {
              color = '#569cd6';
          } else if (/null/.test(match)) {
              color = '#569cd6';
          } else if (/^[0-9]+$/.test(match)) {
              color = '#b5cea8';
          }
          return `<span style="color:${color}">${match}</span>`;
          });
          return json
  }
async function plot_route_delay_summary(){
      var rt_delays = await get_route_delay_summary()
      console.log(rt_delays)
      labels = []
      y = []
      rt_delays.forEach(element => {
        labels.push(element['rt'])
        y.push(element['total_delayed'])
      });
      console.log(labels)

      
      let ctx = document.getElementById('route_delays').getContext('2d');
      new Chart(ctx, {
        type: 'bar', 
        data: {
          labels: labels,
          datasets: [{
            label: 'Delayed Vehicals',
            data: y,
            borderColor: 'rgba(75, 192, 192, 1)', // Line color
            backgroundColor: 'rgba(75, 192, 192, 0.2)', // Fill color for the area
            borderWidth: 2,

            fill: true // Enables the area fill
          }]
        },
        options: {
    // indexAxis: 'y',
    elements: {
      bar: {
        borderWidth: 2,
      }
    },
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: false,
        text: 'Delayed Routes'
      }
    }
    , scales: {   
      y: {
        title: {
          display: true,
          text: 'TOTAL DELAYS',
          color: '#000000', // black
          font: {
            size: 18,       // font size in pixels
            weight: 'bold', // optional
        }
      }
      },
      x: {
        title: {
          display: true,
          text: 'ROUTE'
          ,color: '#000000', // black
          font: {
            size: 18,       // font size in pixels
            weight: 'bold', // optional
        }
        }
      }
    }
  },

      });
  }
async function get_stop_delay_summary(){
      var request = new Request('/blob-storage/gold/CTA/ctabustracker/stop_delays', {
                          method: 'GET',
                          headers: new Headers({'Accept': 'application/json'})});
      var response = await fetch(request);
      let result = null
      if (response.ok){ 
          result = await response.json()
          result = result['values']
      }
      return result;

  }
async function plot_stop_delay_summary(){
      var rt_delays = await get_stop_delay_summary()
      console.log(rt_delays)
      labels = []
      y = []
      let top = 10
      let count =0;
      rt_delays.forEach(element => {
        if (count < top){
           labels.push(element['stpnm'])
            y.push(element['total_delayed'])
            count+=1

        
        }

      });
      console.log(labels)

      
      let ctx = document.getElementById('stop_delays').getContext('2d');
      new Chart(ctx, {
        type: 'bar', 
        data: {
          labels: labels,
          datasets: [{
            label: 'Delayed Vehicals',
            data: y,
            borderColor: 'rgba(75, 192, 192, 1)', // Line color
            backgroundColor: 'rgba(75, 192, 192, 0.2)', // Fill color for the area
            borderWidth: 2,
            pointRadius: 20,

            fill: true // Enables the area fill
          }]
        },
        options: {
    indexAxis: 'y',
    elements: {
      bar: {
        borderWidth: 2,
      }
    },
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: false,
        text: 'Delayed Routes'
      }
    }
    , scales: {   
      y: {
        title: {
          display: false,
          text: 'STOP NAME',
          color: '#000000', // black
          font: {
            size: 18,       // font size in pixels
            weight: 'bold', // optional
        }
      }
      },
      x: {
        title: {
          display: true,
          text: 'TOTAL DELAYS'
          ,color: '#000000', // black
          font: {
            size: 18,       // font size in pixels
            weight: 'bold', // optional
        }
        }
      }
    }
  },

      });
  }
async function get_direction_delay_summary(){
      var request = new Request('/blob-storage/gold/CTA/ctabustracker/direction_delays', {
                          method: 'GET',
                          headers: new Headers({'Accept': 'application/json'})});
      var response = await fetch(request);
      let result = null
      if (response.ok){ 
          result = await response.json()
          result = result['values']
      }
      return result;

  }
async function plot_direction_delay_summary(){
      var rt_delays = await get_direction_delay_summary()
      console.log(rt_delays)
      labels = []
      y = []
      let top = 10
      let count =0;
      rt_delays.forEach(element => {
        if (count < top){
           labels.push(element['rtdir'])
            y.push(element['total_delayed'])
            count+=1

        
        }

      });
      console.log(labels)
      let ctx = document.getElementById('direction_delays').getContext('2d');
      new Chart(ctx, {
        type: 'bar', 
        data: {
          labels: labels,
          datasets: [{
            label: 'Delayed Direction',
            data: y,
            borderColor: 'rgba(75, 192, 192, 1)', // Line color
            backgroundColor: 'rgba(75, 192, 192, 0.2)', // Fill color for the area
            borderWidth: 2,
            pointRadius: 20,

            fill: true // Enables the area fill
          }]
        },
        options: {
            indexAxis: 'y',
            elements: {
              bar: {
                borderWidth: 2,
              }
            },
            responsive: true,
            plugins: {
              legend: {
                position: 'top',
              },
              title: {
                display: false,
                text: 'Delayed Routes'
              }
            }
            , scales: {   
              y: {
                title: {
                  display: false,
                  text: 'STOP NAME',
                  color: '#000000', // black
                  font: {
                    size: 18,       // font size in pixels
                    weight: 'bold', // optional
                }
              }
              },
              x: {
                title: {
                  display: true,
                  text: 'TOTAL DELAYS'
                  ,color: '#000000', // black
                  font: {
                    size: 18,       // font size in pixels
                    weight: 'bold', // optional
                }
                }
              }
            }
          },
      });

  }
plot_route_delay_summary()
// plot_stop_delay_summary()
// plot_route_delay_summary()
plot_direction_delay_summary()
plot_delay_summary()

async function get_silver_predictions(){
      var request = new Request('/blob-storage/silver/CTA/ctabustracker/predictions', {
                          method: 'GET',
                          headers: new Headers({'Accept': 'application/json'})});
      var response = await fetch(request);
      let result = null
      if (response.ok){ 
          result = await response.json()
          result = result['values']
      }
      return result;

  }

async function main(){
  let bronze_predictions = await get_bronze_predictions();
  let delay_summary = await get_delay_summary();
  let predictions = await get_silver_predictions()
   document.getElementById('bronzejsonContainer').innerHTML = prettyPrintJson(bronze_predictions);
   document.getElementById('silverjsonContainer').innerHTML = prettyPrintJson(predictions);
   document.getElementById('goldjsonContainer').innerHTML = prettyPrintJson(delay_summary);
   
}
main()

