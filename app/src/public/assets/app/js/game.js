/* globals $ */

$(() => {
  $('#game-list').DataTable({
    responsive: true,
    aaSorting: [],
    columnDefs: [{
      targets: 2,
      render: (data, type, row) => {
        return new Date(parseInt(data, 10)).toLocaleString('zh-TW', {
          timeZone: 'Asia/Hong_Kong'
        });
      }
    }]
  });
});
