var clicks = 0;

function handler(foo) {
  console.log('hello world');
}

function requestPermissions() {
  clicks++;
  if (clicks%2)
    navigator.webkitGetUserMedia({video: true}, handler, handler);
  else
    navigator.geolocation.getCurrentPosition(handler);
}

document.addEventListener('click', requestPermissions);
