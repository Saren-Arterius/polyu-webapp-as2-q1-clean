/* globals $ */

$(() => {
  for (let i = 0; i < 5; i++) {
    $(`#ranking${i === 0 ? '' : i}`).DataTable({
      responsive: true,
      order: [
        [0, 'asc']
      ],
      columnDefs: [{
        targets: 2,
        render: (data, type, row) => {
          return new Date(parseInt(data, 10)).toLocaleString('zh-TW', {
            timeZone: 'Asia/Hong_Kong'
          });
        }
      }, {
        targets: 3,
        render: (data, type, row) => {
          return new Date(parseInt(data, 10)).toLocaleString('zh-TW', {
            timeZone: 'Asia/Hong_Kong'
          });
        }
      }]
    });
  }
});
