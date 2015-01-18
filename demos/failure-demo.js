function $(element) {
  return document.getElementById(element);
}

function successCallback(mediaStream) {
  $('record-button').classList.remove('faded');
}

function buttonClick() {
  navigator.webkitGetUserMedia(
      {audio: true},
      successCallback,
      function(err) {
        $('record-button').classList.add('faded');
        console.log(err);
      });
}

function setup() {
  $('record-button').addEventListener('click', buttonClick);
}

document.addEventListener('DOMContentLoaded', setup);