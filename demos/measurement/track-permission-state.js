// Copyright 2016 Google. All rights reserved.

function $(elementName) {
  return document.getElementById(elementName);
}

// *****************************************************************************
// PERMISSIONS API WATCHER
// These methods track the permission state using the Permissions API.
// *****************************************************************************
var apiWatcher = apiWatcher || {};

apiWatcher.queryAvailable_ = false;
apiWatcher.requestAvailable_ = false;
apiWatcher.revokeAvailable_ = false;

/**
 * Check whether the permissions API is available, and update the UI
 * accordingly.
 */
apiWatcher.compatCheck = function() {
  if (navigator.permissions) {
    if (navigator.permissions.query)
      apiWatcher.queryAvailable_ = true;
    if (navigator.permissions.request)
      apiWatcher.requestAvailable_ = true;
    if (navigator.permissions.revoke)
      apiWatcher.revokeAvailable_ = true;
  }

  if (!apiWatcher.queryAvailable_)
    uiHelper.setPermissionStatus('unavailable');
  if (!apiWatcher.revokeAvailable_)
    $('revoke-button').disabled = true;

  uiHelper.displayFeatureStatus($('support-query'), apiWatcher.queryAvailable_);
  uiHelper.displayFeatureStatus(
      $('support-request'), apiWatcher.requestAvailable_);
  uiHelper.displayFeatureStatus(
      $('support-revoke'), apiWatcher.revokeAvailable_);
}
document.addEventListener('DOMContentLoaded', apiWatcher.compatCheck);

// *****************************************************************************
// CALLBACK WATCHER
// These methods track the permission state using geolocation callbacks.
// *****************************************************************************

var callbackWatcher = callbackWatcher || {};

callbackWatcher.Status = {
  UNKNOWN: 0,
  REQUESTED: 1,
  USER_GRANTED: 2,
  USER_DENIED: 3,
  AUTO_GRANTED: 4,
  AUTO_DENIED: 5,
};

callbackWatcher.THRESHOLD = 5;  // Milliseconds
callbackWatcher.timestamp_ = 0;

callbackWatcher.countSuccess = function() {
  console.log("Callback tracking: user granted permission");
  uiHelper.setCallbackStatus(callbackWatcher.Status.USER_GRANTED);
}

callbackWatcher.countFailure = function() {
  var delta = Date.now() - callbackWatcher.timestamp_;
  if (delta > callbackWatcher.THRESHOLD) {
    uiHelper.setCallbackStatus(callbackWatcher.Status.USER_DENIED);
    console.log("Callback tracking: user denied permission (" + delta + "ms)");
  } else {
    uiHelper.setCallbackStatus(callbackWatcher.Status.AUTO_DENIED);
    console.log("Callback tracking: browser auto-denied permission (" +
                delta + "ms)");
  }
  timestamp_ = 0;
}

callbackWatcher.countInvocation = function() {
  console.log("Callback tracking: requesting permission");
  uiHelper.setCallbackStatus(callbackWatcher.Status.REQUESTED);
  callbackWatcher.timestamp_ = Date.now();
}

callbackWatcher.setup = function() {
  uiHelper.setCallbackStatus(callbackWatcher.Status.UNKNOWN);
}
document.addEventListener('DOMContentLoaded', callbackWatcher.setup);

// *****************************************************************************
// REQUEST HANDLER
// The request handler methods set up the "request" buttons. It invokes the
// apiWatcher and callbackWatcher methods as appropriate.
// *****************************************************************************

var requestHandler = requestHandler || {};

requestHandler.STORAGE_KEY = "request";
requestHandler.STORAGE_LOAD = "onload";
requestHandler.STORAGE_CLICK = "click";

/**
 * A wrapper to invoke both the apiWatcher and callbackWatcher callbacks.
 */
requestHandler.successCallback = function() {
  callbackWatcher.countSuccess();
}

/**
 * A wrapper to invoke both the apiWatcher and callbackWatcher callbacks.
 */
requestHandler.failureCallback = function() {
  callbackWatcher.countFailure();
}

/**
 * Tell the callbackWatcher and apiWatcher that we're about to invoke the
 * geolocation API.
 */
requestHandler.notifyInvocation = function() {
  callbackWatcher.countInvocation();
}

// Try to read geolocation.
requestHandler.initiateRequest = function() {
  requestHandler.notifyInvocation();
  navigator.geolocation.getCurrentPosition(
      requestHandler.successCallback, requestHandler.failureCallback);
}

/**
 * Make the "request" and "request onload" buttons work. Use local storage
 * to keep track of whether we should prompt on load.
 */
requestHandler.setup = function() {
  $('request-button').addEventListener('click', requestHandler.initiateRequest);

  // Some browsers don't support localStorage (e.g., in Incognito). The
  // request on load button won't work without localStorage.
  if (typeof(Storage) === "undefined" || !localStorage) {
    uiHelper.displayFeatureStatus($('support-storage'), false);
    $('request-onload-button').disabled = true;
    return;
  }

  uiHelper.displayFeatureStatus($('support-storage'), true);
  $('request-onload-button').addEventListener('click', function() {
    localStorage.setItem(requestHandler.STORAGE_KEY,
                         requestHandler.STORAGE_LOAD);
    location.reload(false);
  });

  // Check whether this current page load was the result of a refresh.
  if (localStorage.getItem(requestHandler.STORAGE_KEY) ==
      requestHandler.STORAGE_LOAD) {
    localStorage.setItem(requestHandler.STORAGE_KEY,
                         requestHandler.STORAGE_CLICK);
    requestHandler.initiateRequest();
  }
}
document.addEventListener('DOMContentLoaded', requestHandler.setup);

// *****************************************************************************
// UI HELPER
// The UI helper provides utility methods.
// *****************************************************************************

var uiHelper = uiHelper || {};

uiHelper.setPermissionStatus = function(message) {
  $('status-permissions').innerText = message;
}

/**
 * Convert the callback status to a human-readable string, and display it.
 */
uiHelper.setCallbackStatus = function(message) {
  var humanString = "unavailable";
  if (message == callbackWatcher.Status.UNKNOWN)
    humanString = "unknown";
  else if (message == callbackWatcher.Status.REQUESTED)
    humanString = "requested";
  else if (message == callbackWatcher.Status.USER_GRANTED)
    humanString = "user granted";
  else if (message == callbackWatcher.Status.USER_DENIED)
    humanString = "user denied";
  else if (message == callbackWatcher.Status.AUTO_GRANTED)
    humanString = "auto granted";
  else if (message == callbackWatcher.Status.AUTO_DENIED)
    humanString = "auto denied";

  $('status-callbacks').innerText = humanString;
}

/**
 * Update the feature status pane.
 * @param {!Object} elem The feature status's DOM element.
 * @param {boolean} supported Whether the feature is supported.
 */
uiHelper.displayFeatureStatus = function(elem, supported) {
  if (supported) {
    elem.innerText = 'supported';
    elem.classList.add('feature-supported');
  } else {
    elem.innerText = 'unsupported';
    elem.classList.add('feature-unsupported');
  }
}
