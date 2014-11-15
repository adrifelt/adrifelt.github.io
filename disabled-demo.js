function $(element) {
  return document.getElementById(element);
}

function handler(foo) {
  console.log('hello world');
}

function reflectPermissionStatus(permission) {
  if (permission == 'granted') {
    $('notifications-toggle').checked = true;
    $('notifications').classList.remove('faded');
  } else if (permission == 'denied') {
    $('notifications-toggle').checked = false;
    $('notifications').classList.add('faded');
  } else {
    $('notifications-toggle').checked = false;
    $('notifications').classList.remove('faded');
  }
}

function toggleClicked() {
  if ($('notifications-toggle').checked) {
    $('notifications-toggle').checked = false;
    Notification.requestPermission(function(permission) {
      reflectPermissionStatus(permission);
    });
  }
}

function checkPermissionOnLoad() {
  reflectPermissionStatus(Notification.permission);
}

function setup() {
  $('notifications-toggle').addEventListener('click', toggleClicked);
  checkPermissionOnLoad();
}

document.addEventListener('DOMContentLoaded', setup);
