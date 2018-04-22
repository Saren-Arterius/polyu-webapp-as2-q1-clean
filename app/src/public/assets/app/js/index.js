/* globals document, Chart, reportData, socket, $ */

Chart.defaults.global.defaultFontFamily = '-apple-system,system-ui,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
Chart.defaults.global.defaultFontColor = '#292b2c';

const filterIntOnly = (value, index, values) => {
  if (Math.floor(value) === value) {
    return value;
  }
  return null;
};

let _ = new Chart(document.getElementById('users'), {
  type: 'line',
  data: {
    labels: reportData.dates,
    datasets: [{
      label: 'Total users',
      fill: false,
      backgroundColor: 'rgba(75,192,192,1)',
      borderColor: 'rgba(75,192,192,1)',
      data: reportData.users_cum_figures
    }]
  },
  options: {
    tooltips: {
      mode: 'index',
      intersect: false
    },
    hover: {
      mode: 'nearest',
      intersect: true
    },
    scales: {
      yAxes: [{
        ticks: {
          min: 0,
          callback: filterIntOnly
        },
        stacked: true
      }]
    }
  }
});

_ = new Chart(document.getElementById('games'), {
  type: 'line',
  data: {
    labels: reportData.dates,
    datasets: [{
      label: 'Total games played',
      fill: false,
      backgroundColor: 'rgba(255,99,132,1)',
      borderColor: 'rgba(255,99,132,1)',
      data: reportData.games_cum_figures
    }]
  },
  options: {
    tooltips: {
      mode: 'index',
      intersect: false
    },
    hover: {
      mode: 'nearest',
      intersect: true
    },
    scales: {
      yAxes: [{
        ticks: {
          min: 0,
          callback: filterIntOnly
        },
        stacked: true
      }]
    }
  }
});

socket.emit('join', {type: 'dashboard', value: ''});
socket.on('info', (data) => {
  $('#online-users').text(data.online_users);
});
