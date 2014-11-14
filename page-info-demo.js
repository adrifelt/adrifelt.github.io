function handler(foo) {
  console.log('hello world');
}

function requestLocation() {
    navigator.geolocation.getCurrentPosition(handler);
}

function requestCamera() {
  navigator.webkitGetUserMedia({video: true}, handler, handler);
}

document.addEventListener('DOMContentLoaded', requestLocation);
document.addEventListener('click', requestCamera);
