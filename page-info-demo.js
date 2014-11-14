function handler(foo) {
  console.log('hello world');
}

function requestPermissions() {
  navigator.webkitGetUserMedia({video: true}, handler, handler);
  navigator.geolocation.getCurrentPosition(handler);
}

requestPermissions();
