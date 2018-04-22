/* globals navigator, $, blockUI, unblockUI, alert */
const getCurrentPositionPromise = () => {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject);
  });
};

const readLocation = async () => {
  blockUI();
  try {
    let {
      coords
    } = await getCurrentPositionPromise();
    $('#latlng').val(`${coords.latitude},${coords.longitude}`);
  } catch (e) {
    alert('Geolocation request denied by browser');
  } finally {
    unblockUI();
  }
};

readLocation;
