/* globals google, document, userPosition, username, Chart, reportData, $ */
const initMap = () => {
  let map = new google.maps.Map(document.getElementById('map'), {
    center: {
      lat: -34.397,
      lng: 150.644
    },
    zoom: 6
  });

  let marker = new google.maps.Marker({
    position: userPosition,
    map,
    title: `@${username}`
  });
  marker;

  map.setCenter(userPosition);
};

if (document) {
  initMap;
}

Chart.defaults.global.defaultFontFamily = '-apple-system,system-ui,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
Chart.defaults.global.defaultFontColor = '#292b2c';

const filterIntOnly = (value, index, values) => {
  if (Math.floor(value) === value) {
    return value;
  }
  return null;
};

let _ = new Chart(document.getElementById('wins-loses'), {
  type: 'line',
  data: {
    labels: reportData.dates,
    datasets: [{
      yAxisID: 'B',
      label: 'K/D ratio',
      fill: false,
      backgroundColor: 'rgba(75,99,132,1)',
      borderColor: 'rgba(75,99,132,1)',
      data: reportData.kd_figures
    }, {
      label: 'Total wins',
      fill: true,
      backgroundColor: 'rgba(255,99,132,1)',
      borderColor: 'rgba(255,99,132,1)',
      data: reportData.wins_cum_figures
    }, {
      label: 'Total loses',
      fill: true,
      backgroundColor: 'rgba(75,192,192,1)',
      borderColor: 'rgba(75,192,192,1)',
      data: reportData.loses_cum_figures
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
      }, {
        id: 'B',
        type: 'linear',
        position: 'right',
        ticks: {
          max: 1,
          min: 0
        },
        stacked: false
      }]
    }
  }
});


$(() => {
  $('#game-record').DataTable({
    responsive: true,
    order: [
      [2, 'desc']
    ],
    columnDefs: [{
      type: 'currency',
      targets: 2,
      render: (data, type, row) => {
        return new Date(parseInt(data, 10)).toLocaleString('zh-TW', {
          timeZone: 'Asia/Hong_Kong'
        });
      }
    }]
  });
});


if (document) {
  _;
}
