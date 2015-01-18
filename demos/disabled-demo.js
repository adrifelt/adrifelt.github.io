function $(element) {
  return document.getElementById(element);
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

document.addEventListener('DOMContentLoaded', function() {
  $('notifications-toggle').addEventListener('click', toggleClicked);
  reflectPermissionStatus(Notification.permission);
});
