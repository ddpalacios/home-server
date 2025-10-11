const rctx = document.getElementById('rms_chart').getContext('2d');

const rmsChart = new Chart(rctx, {
    type: 'bar',
    data: {
        labels: ['Volume'],
        datasets: [{
            label: 'Intensity',
            data: [0],
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderWidth: 2,
            fill: true
        }]
    },
    options: {
        responsive: true,
        animation: {
            duration: 200, 
        },
        plugins: {
            legend: { position: 'top' },
            title: { display: false }
        },
        scales: {
            y: {
                min: 0,
                max: 3, 
            },
            x: {
                title: { display: false }
            }
        }
    }
});

function updateRMS(rms) {
    rmsChart.data.datasets[0].data[0] = rms;
    rmsChart.update(); 
}


// Create chart once
const fctx = document.getElementById('frequency_chart').getContext('2d');

const freqChart = new Chart(fctx, {
  type: 'bar',
  data: {
    labels: Array.from({ length: 1024 }, (_, i) => i),
    datasets: [{
      label: 'Frequency Spectrum',
      data: Array(1024).fill(0),
      borderColor: 'blue',
      borderWidth: 10,
      pointRadius: 0,
      barPercentage: 6.0,        
      categoryPercentage: 1.0,   
    }]
  },
  options: {
    responsive: true,
    animation: {
      duration: 50,
      easing: 'easeOutCubic'
    },
    scales: {
      x: {
        display: true
         ,title: {
          display: true,
          text: 'Frequency'
        }
      },
      y: {
        min: 0,
        max: 80,
        title: {
          display: true,
          text: 'Amplitude'
        }
      }
    },
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: 'Live Frequency Spectrum'
      }
    }
  }
});

function updateFrequencySpectrum(freqArray) {
  if (!freqArray || freqArray.length === 0) return;

  const yValues = freqArray.map(p => p.y ?? 0);

  if (yValues.length !== freqChart.data.labels.length) {
    freqChart.data.labels = yValues.map((_, i) => i);
  }

  freqChart.data.datasets[0].data = yValues;
  freqChart.update();
}


// Create chart once
const wavectx = document.getElementById('wave_chart').getContext('2d');

const waveChart = new Chart(wavectx, {
  type: 'line',
  data: {
    labels: Array.from({ length: 1024 }, (_, i) => i),
    datasets: [{
      label: 'Waveform',
      data: Array(1024).fill(0),
      borderColor: 'black',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.65, // smooth curve
    }]
  },
  options: {
    responsive: true,
    animation: {
      duration: 200
    },
    elements: {
      line: {
        borderJoinStyle: 'round'
      }
    },
    scales: {
      x: {
        display: true,    
        grid: { display: true } 
      },
      y: {
        display: false,      
        grid: { display: false }

      }
    },
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: 'Live Audio Waveform',
        color: 'black',
        font: { size: 14 }
      }
    }
  }
});


function updatewavelength(wave) {
  if (!wave || wave.length === 0) return;

  const yValues = wave.map(p => p.y ?? 0);

  if (yValues.length !== waveChart.data.labels.length) {
    waveChart.data.labels = yValues.map((_, i) => i);
  }

  waveChart.data.datasets[0].data = yValues;
  waveChart.update();
}


function drawSpectrogram(freqData,bufferLength) {

  const imageData = spectogram_ctx.getImageData(1, 0, spectogram_canvas.width - 1, spectogram_canvas.height);
  spectogram_ctx.putImageData(imageData, 0, 0);

  for (let i = 0; i < bufferLength; i++) {
    const value = freqData[i];
    const percent = value / 255;
    const y = spectogram_canvas.height - (i / bufferLength) * spectogram_canvas.height;
    
    const hue = (1 - percent) * 250; 
    spectogram_ctx.fillStyle = `hsl(${hue}, 100%, ${percent *200 + 5}%)`;
    spectogram_ctx.fillRect(spectogram_canvas.width - 1, y, 1, spectogram_canvas.height / bufferLength);
  }
}

function drawMelSpectrogram(freqData, bufferLength, sampleRate) {


  // Shift image left by 1 pixel
  const imageData = mel_spectogram_ctx.getImageData(1, 0, mel_spectogram_canvas.width - 1, mel_spectogram_canvas.height);
  mel_spectogram_ctx.putImageData(imageData, 0, 0);

  // MEL parameters
  const melBins = 128; // typical number of mel bands
  const fMin = 0;
  const fMax = sampleRate / 2;

  // Helper: linear to mel
  const toMel = f => 2595 * Math.log10(1 + f / 700);
  const fromMel = m => 700 * (10 ** (m / 2595) - 1);

  // Build mel filter bank mapping
  const melMin = toMel(fMin);
  const melMax = toMel(fMax);
  const melPoints = Array.from({ length: melBins + 2 }, (_, i) =>
    fromMel(melMin + (i / (melBins + 1)) * (melMax - melMin))
  );

  const binFreqs = Array.from({ length: bufferLength }, (_, i) =>
    (i * sampleRate) / (2 * bufferLength)
  );

  const melValues = new Array(melBins).fill(0);

  // Apply simple triangular mel filterbanks
  for (let m = 1; m <= melBins; m++) {
    const f1 = melPoints[m - 1];
    const f2 = melPoints[m];
    const f3 = melPoints[m + 1];

    for (let i = 0; i < bufferLength; i++) {
      const freq = binFreqs[i];
      let weight = 0;
      if (freq >= f1 && freq <= f2) {
        weight = (freq - f1) / (f2 - f1);
      } else if (freq >= f2 && freq <= f3) {
        weight = (f3 - freq) / (f3 - f2);
      }
      melValues[m - 1] += freqData[i] * weight;
    }
  }

  // Normalize and draw each mel band
  for (let i = 0; i < melBins; i++) {
    const value = melValues[i] / 255;
    const percent = Math.min(1, Math.max(0, value));
    const y = mel_spectogram_canvas.height - (i / melBins) * mel_spectogram_canvas.height;
    const hue = (1 - percent) * 250;
    mel_spectogram_ctx.fillStyle = `hsl(${hue}, 100%, ${percent * 50 + 10}%)`;
    mel_spectogram_ctx.fillRect(mel_spectogram_canvas.width - 1, y, 1, mel_spectogram_canvas.height / melBins);
  }
}

