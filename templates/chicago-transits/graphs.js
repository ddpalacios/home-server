async function get_delay_summary(){
      var request = new Request('/blob-storage/silver/CTA/ctabustracker/delays', {
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
      labels.push(element['Hour']+":"+element['Minute'])
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
          backgroundColor: 'rgba(75, 192, 192, 0.2)', // Fill color for the area
          borderWidth: 2,
          pointRadius: 10,

          fill: true // Enables the area fill
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Hour:Minute'
              ,color: '#000000', // black
          font: {
            size: 18,       // font size in pixels
            weight: 'bold', // optional
        }
            }
          },
          y: {
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
      var request = new Request('/blob-storage/silver/CTA/ctabustracker/route_delays', {
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
      var request = new Request('/blob-storage/silver/CTA/ctabustracker/stop_delays', {
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
      var request = new Request('/blob-storage/silver/CTA/ctabustracker/direction_delays', {
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
  type: 'pie', 
  data: {
    labels: labels,
    datasets: [{
      label: 'Delayed Vehicles',
      data: y,
      backgroundColor: [
        '#4bc0c0', '#ff6384', '#ffcd56', '#36a2eb', '#9966ff', '#ff9f40'
      ], // add more colors if needed
      // borderColor: '#000000', // optional border
      borderWidth: 2
    }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: {
            // size: 16, // legend font size
            // weight: 'bold'
          },
          color: '#000000' // legend font color
        }
      },
      title: {
        display: false,
        text: 'Delayed Routes',
        font: {
          size: 20,
          weight: 'bold'
        },
        color: '#000000'
      }
    }

  },

      });
  }
plot_route_delay_summary()
plot_stop_delay_summary()
plot_route_delay_summary()
plot_direction_delay_summary()
plot_delay_summary()