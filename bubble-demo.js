function requestPermissions() {
  Notification.requestPermission();
  navigator.geolocation.getCurrentPosition(function(position) {});
}

document.addEventListener('DOMContentLoaded', requestPermissions);
