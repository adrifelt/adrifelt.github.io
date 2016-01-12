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
    $('status-permissions').innerText = 'unavailable';
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

callbackWatcher.countSuccess = function() {
  console.log("Callback tracking: user granted permission");
}

callbackWatcher.countFailure = function() {
  console.log("Callback tracking: user denied permission");
}

callbackWatcher.countInvocation = function() {
  console.log("Callback tracking: requesting permission");
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

requestHandler.successCallback = function() {
  callbackWatcher.countSuccess();
}

requestHandler.failureCallback = function() {
  callbackWatcher.countFailure();
}

requestHandler.notifyInvocation = function() {
  callbackWatcher.countInvocation();
}

requestHandler.initiateRequest = function() {
  requestHandler.notifyInvocation();
  navigator.geolocation.getCurrentPosition(
      requestHandler.successCallback, requestHandler.errorCallback);
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