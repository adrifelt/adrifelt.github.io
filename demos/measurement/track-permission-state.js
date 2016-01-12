// Copyright 2016 Google. All rights reserved.
// Author: felt@chromium.org

// This demo illustrates how to gather geolocation permission analytics. It uses
// two methods so that you can compare how well they work:
//
// (1) The callbackWatcher uses the geolocation error/success callbacks and
//     their values to determine what the permission state is.
// (2) The apiWatcher additionally uses the Permissions API, which is available
//     in newer versions of Chrome and Firefox. It can identify more states than
//     the callbackWatcher.
//
// The requestHandler drives the demo by invoking the geolocation API and
// passing the callback results on to the apiWatcher and callbackWatcher.

// *****************************************************************************
// PERMISSIONS API WATCHER
// These methods track the permission state using the Permissions API.
// *****************************************************************************
var apiWatcher = apiWatcher || {};

apiWatcher.queryAvailable_ = false;
apiWatcher.requestAvailable_ = false;
apiWatcher.revokeAvailable_ = false;

/**
 * Check whether the permissions API is available, and toggle the available
 * features accordingly.
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
// These methods track the permission state using geolocation callbacks and
// callback error codes. It relies on timing to differentiate between an
// automated response (without showing the user a prompt) and an actual user
// response to a dialog.
// *****************************************************************************

var callbackWatcher = callbackWatcher || {};

callbackWatcher.Status = {
  UNKNOWN: 0,         // Don't know the permission state.
  REQUESTED: 1,       // Geolocation API invoked.
  USER_GRANTED: 2,    // User granted the permission via a dialog.
  USER_DENIED: 3,     // User denied the permission via a dialog.
  AUTO_GRANTED: 4,    // Browser automatically granted the permission.
  AUTO_DENIED: 5,     // Browser automatically denied the permission.
  FAST_NAVIGATE: 6,   // Navigated away from the page shortly after request.
  SLOW_NAVIGATE: 7,   // Navigated away from the page without a response.
};

// Used to differentiate between an automated and human response to a dialog.
callbackWatcher.THRESHOLD = 5;  // Milliseconds
callbackWatcher.timestamp_ = 0;

// Used to identify situations where the user navigates the page without
// responding to the dialog.
callbackWatcher.pending_ = false;

/**
 * Invoked as part of the geolocation success callback. Record the success, and
 * compare it to the user-response timing threshold.
 */
callbackWatcher.successCallback = function() {
  var delta = Date.now() - callbackWatcher.timestamp_;
  if (delta > callbackWatcher.THRESHOLD)
    uiHelper.recordCallbackStatus(callbackWatcher.Status.USER_GRANTED, delta);
  else
    uiHelper.recordCallbackStatus(callbackWatcher.Status.AUTO_GRANTED, delta);

  callbackWatcher.timestamp_ = 0;
  callbackWatcher.pending_ = false;
}

/**
 * Invoked as part of the geolocation error callback. Record the failure, and
 * compare it to the user-response timing threshold.
 */
callbackWatcher.failureCallback = function() {
  var delta = Date.now() - callbackWatcher.timestamp_;
  if (delta > callbackWatcher.THRESHOLD)
    uiHelper.recordCallbackStatus(callbackWatcher.Status.USER_DENIED, delta);
  else
    uiHelper.recordCallbackStatus(callbackWatcher.Status.AUTO_DENIED, delta);

  callbackWatcher.timestamp_ = 0;
  callbackWatcher.pending_ = false;
}

/**
 * Invoked before the requestHandler tries to invoke the geolocation function.
 */
callbackWatcher.recordInvocation = function() {
  uiHelper.recordCallbackStatus(callbackWatcher.Status.REQUESTED);
  callbackWatcher.timestamp_ = Date.now();
  callbackWatcher.pending_ = true;
}

/**
 * We can't know the initial status until actually trying to invoke the
 * geolocation function, so set the UI to initially say "unknown".
 */
callbackWatcher.setup = function() {
  uiHelper.recordCallbackStatus(callbackWatcher.Status.UNKNOWN);
}
document.addEventListener('DOMContentLoaded', callbackWatcher.setup);

callbackWatcher.checkBeforeNavigate = function() {
  if (!callbackWatcher.pending_)
    return;

  var delta = Date.now() - callbackWatcher.timestamp_;
  if (delta > callbackWatcher.THRESHOLD)
    uiHelper.recordCallbackStatus(callbackWatcher.Status.FAST_NAVIGATE, delta);
  else
    uiHelper.recordCallbackStatus(callbackWathcer.Status.SLOW_NAVIGATE, delta);
}

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
  callbackWatcher.successCallback();
}

/**
 * A wrapper to invoke both the apiWatcher and callbackWatcher callbacks.
 */
requestHandler.failureCallback = function() {
  callbackWatcher.failureCallback();
}

/**
 * Tell the callbackWatcher and apiWatcher that we're about to invoke the
 * geolocation API.
 */
requestHandler.notifyInvocation = function() {
  callbackWatcher.recordInvocation();
}

/**
 * Try to read geolocation. This will trigger a permission check.
 */
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
// The UI helper provides utility methods for displaying the permission status.
// *****************************************************************************

var uiHelper = uiHelper || {};

uiHelper.setPermissionStatus = function(message) {
  $('status-permissions').innerText = message;
}

/**
 * If this were real code, this would store the values and then ping the
 * analytics server with the user's responses on page unload. Since this is a
 * demo, instead we display the response on the UI and in the console.
 * @param {callbackWatcher.Status} newStatus The desired status.
 * @param {number=} delta The time that passed (optional).
 */
uiHelper.recordCallbackStatus = function(newStatus, delta) {
  var humanString = "unavailable";
  if (newStatus == callbackWatcher.Status.UNKNOWN)
    humanString = "unknown";
  else if (newStatus == callbackWatcher.Status.REQUESTED)
    humanString = "requested";
  else if (newStatus == callbackWatcher.Status.USER_GRANTED)
    humanString = "user granted";
  else if (newStatus == callbackWatcher.Status.USER_DENIED)
    humanString = "user denied";
  else if (newStatus == callbackWatcher.Status.AUTO_GRANTED)
    humanString = "auto granted";
  else if (newStatus == callbackWatcher.Status.AUTO_DENIED)
    humanString = "auto denied";
  else if (newStatus == callbackWatcher.Status.FAST_NAVIGATE)
    humanString = "navigated too quickly for responding";
  else if (newStatus == callbackWatcher.Status.SLOW_NAVIGATE)
    humanString = "navigated without responding";

  var deltaString = "";
  if (delta) deltaString = " (" + delta + "ms)";

  $('status-callbacks').innerText = humanString;
  console.log("Callback tracking: " + humanString + deltaString);
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

function $(elementName) {
  return document.getElementById(elementName);
}
