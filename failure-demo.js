function $(element) {
  return document.getElementById(element);
}

function successCallback(mediaStream) {
  $('record-button').classList.remove('faded');
}

function errorCallback(err) {
  $('record-button').classList.add('faded');
  console.log(err);
}

function buttonClick() {
  navigator.webkitGetUserMedia({audio: true}, successCallback, errorCallback);
}

function setup() {
  $('record-button').addEventListener('click', buttonClick);
}

document.addEventListener('DOMContentLoaded', setup);