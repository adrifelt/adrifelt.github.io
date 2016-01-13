// Copyright 2016 Google. All rights reserved.
// Author: Adrienne Porter Felt <felt@chromium.org>

// *****************************************************************************
// This demo illustrates how to gather geolocation permission analytics. It uses
// two methods so that you can compare how well they work:
//
// (1) The callbackWatcher uses the geolocation error/success callbacks and
//     their values to determine what the permission state is.
// (2) The apiWatcher additionally uses the Permissions API, which is available
//     in newer versions of Chrome and Firefox.
//
// #2 is the recommended way to collect permission analytics, when supported.
//
// The requestDriver drives the demo by invoking the geolocation API and
// passing the callback results on to the apiWatcher and callbackWatcher.
// *****************************************************************************

// *****************************************************************************
// PERMISSIONS API WATCHER
// These methods track the permission state using the Permissions API.
// To track the user's flow, check the permission status several times:
//   -- Initially (on page load, or otherwise prior to the geolocation call)
//   -- In the error callback
//   -- When the page navigates
//   -- When the permission status changes
// *****************************************************************************
var apiWatcher = {};

// The apiWatcher can identify many more situations than the callbackWatcher.
apiWatcher.Status = {
  UNAVAILABLE: 0,           // Permission API not supported
  NOT_YET_PROMPTED: 1,      // User hasn't been asked about geolocation yet
  REQUESTED: 2,             // Permission decision is pending
  STARTING_GRANTED: 3,      // Permission was previously set to 'granted'
  STARTING_DENIED: 4,       // Permission was previously set to 'denied'
  GRANTED_FROM_STORAGE: 5,  // Call succeeded because STARTING_GRANTED
  DENIED_FROM_STORAGE: 6,   // Call failed because STARTING_DENIED
  USER_GRANTED: 7,          // User granted the permission after seeing a prompt
  USER_DENIED: 8,           // User denied the permission after seeing a prompt
  USER_DISMISSED: 9,        // User closed the prompt without responding
  BROWSER_BLOCKED: 10,      // Browser blocked; it didn't show permission dialog
                            // or check prior user preferences
  SETTINGS_GRANTED: 11,     // User enabled the permission from within settings
  SETTINGS_DENIED: 12,      // User disabled the permission from within settings
  SETTINGS_DEFAULT: 13,     // User reset the permission to 'prompt' next time
  FAST_NAVIGATE: 14,        // User navigated very quickly after prompt shown
  SLOW_NAVIGATE: 15,        // User navigated without making a decision
};

// Used to differentiate between an automated and human response to a dialog, in
// some situations where the Permissions API doesn't provide the information.
apiWatcher.THRESHOLD = 5;  // Milliseconds
apiWatcher.timestamp_ = 0;

// Compatibility information.
apiWatcher.queryAvailable_ = false;
apiWatcher.requestAvailable_ = false;
apiWatcher.revokeAvailable_ = false;

// Information needed to calculate the current state.
apiWatcher.pending_ = false;
apiWatcher.initialState_ = 'unknown';

/**
 * Check whether the permissions API is available, which must be done before
 * anything else.
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

  apiWatcher.checkInitialState();
  apiWatcher.updateUICompatibility();
}
document.addEventListener('DOMContentLoaded', apiWatcher.compatCheck);

/**
 * On page load, check whether the user has previously granted or denied the
 * permission request during a prior interaction with the website.
 */
apiWatcher.checkInitialState = function() {
  if (!apiWatcher.queryAvailable_)
    return;

  navigator.permissions.query({name:'geolocation'}).then(
    function(permissionStatus) {
      if (apiWatcher.initialState_ != 'unknown')
        return;
      var state = permissionStatus.state || permissionStatus.status;
      apiWatcher.initialState_ = state;
      if (state == 'granted')
        statusLog.recordApiStatus(apiWatcher.Status.STARTING_GRANTED);
      else if (state == 'denied')
        statusLog.recordApiStatus(apiWatcher.Status.STARTING_DENIED);
      else if (state == 'prompt')
        statusLog.recordApiStatus(apiWatcher.Status.NOT_YET_PROMPTED);
      permissionStatus.addEventListener('change', apiWatcher.recordPermissionChange);
    });
}

/**
 * Record a change to a permission that wasn't associated with a permission
 * request. (It must have come from the user messing with the settings.)
 * Note that this runs within the scope of the permissionStatus object that it
 * was attached to in checkInitialState.
 */
apiWatcher.recordPermissionChange = function() {
  if (apiWatcher.pending_)
    return;

  var state = this.state || this.status;
  if (state == 'granted')
    statusLog.recordApiStatus(apiWatcher.Status.SETTINGS_GRANTED);
  else if (state == 'denied')
    statusLog.recordApiStatus(apiWatcher.Status.SETTINGS_DENIED);
  else if (state == 'prompt')
    statusLog.recordApiStatus(apiWatcher.Status.SETTINGS_DEFAULT);
}

/**
 * Invoked as part of the geolocation error callback. The meaning of the success
 * depends on what the initial state was.
 */
apiWatcher.successCallback = function() {
  if (!apiWatcher.queryAvailable_)
    return;

  if (apiWatcher.initialState_ == 'prompt')
    statusLog.recordApiStatus(apiWatcher.Status.USER_GRANTED);
  else
    statusLog.recordApiStatus(apiWatcher.Status.GRANTED_FROM_STORAGE);
  apiWatcher.pending_ = false;
}

/**
 * Invoked as part of the geolocation error callback. The meaning of the error
 * depends on what the initial state was, the timing of the response, and the
 * new permission state.
 */
apiWatcher.failureCallback = function() {
  if (!apiWatcher.queryAvailable_)
    return;

  apiWatcher.pending_ = false;

  if (apiWatcher.initialState_ != 'prompt')
    statusLog.recordApiStatus(apiWatcher.Status.DENIED_FROM_STORAGE, delta);

  var delta = Date.now() - apiWatcher.timestamp_;
  navigator.permissions.query({name:'geolocation'}).then(
    function(permissionStatus) {
      var state = permissionStatus.state || permissionStatus.status;

      if (state == 'prompt' && delta > apiWatcher.THRESHOLD)
        statusLog.recordApiStatus(apiWatcher.Status.USER_DISMISSED, delta);
      else if (state == 'prompt' && delta <= apiWatcher.THRESHOLD)
        statusLog.recordApiStatus(apiWatcher.Status.BROWSER_BLOCKED, delta);
      else if (state == 'denied')
        statusLog.recordApiStatus(apiWatcher.Status.USER_DENIED, delta);
    });
}

/**
 * Invoked before requestDriver tries to invoke the geolocation function.
 */
apiWatcher.recordInvocation = function() {
  if (!apiWatcher.queryAvailable_)
    return;

  statusLog.recordApiStatus(apiWatcher.Status.REQUESTED);
  apiWatcher.pending_ = true;
  apiWatcher.timestamp_ = Date.now();

  // If the permission was requested on load, this could be happening before
  // checkInitialState has had a chance to run, so force-invoke it here.
  if (apiWatcher.initialState_ == 'unknown')
    apiWatcher.checkInitialState();
}

/**
 * Record when the user navigates without making a permission decision.
 * @return {null} To make the method execute in Chrome.
 */
apiWatcher.checkBeforeNavigate = function() {
  if (!apiWatcher.pending_ || !apiWatcher.queryAvailable_)
    return;

  var delta = Date.now() - apiWatcher.timestamp_;
  if (delta < apiWatcher.THRESHOLD)
    statusLog.recordApiStatus(apiWatcher.Status.FAST_NAVIGATE, delta);
  else
    statusLog.recordApiStatus(apiWatcher.Status.SLOW_NAVIGATE, delta);
  return null;
}
window.addEventListener('beforeunload', apiWatcher.checkBeforeNavigate);

/**
 * Update the demo UI based on which API methods are available.
 */
apiWatcher.updateUICompatibility = function() {
  if (!apiWatcher.queryAvailable_)
    statusLog.setPermissionStatus(apiWatcher.Status.UNAVAILABLE);

  statusLog.displayFeatureStatus(
      $('support-query'), apiWatcher.queryAvailable_);
  statusLog.displayFeatureStatus(
      $('support-request'), apiWatcher.requestAvailable_);
  statusLog.displayFeatureStatus(
      $('support-revoke'), apiWatcher.revokeAvailable_);
}

// *****************************************************************************
// CALLBACK WATCHER
// These methods track the permission state using geolocation callbacks and
// callback error codes. It relies on timing to differentiate between an
// automated response (without showing the user a prompt) and an actual user
// response to a dialog.
// *****************************************************************************

var callbackWatcher = {};

callbackWatcher.Status = {
  UNKNOWN: 0,         // Don't know the permission state.
  REQUESTED: 1,       // Geolocation API invoked.
  USER_GRANTED: 2,    // User granted the permission via a dialog.
  USER_DENIED: 3,     // User denied the permission via a dialog.
  AUTO_GRANTED: 4,    // Browser automatically granted the permission,
                      // possibly because the user approved it in the past.
  AUTO_DENIED: 5,     // Browser automatically denied the permission,
                      // possibly because the user denied it in the past.
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
    statusLog.recordCallbackStatus(callbackWatcher.Status.USER_GRANTED, delta);
  else
    statusLog.recordCallbackStatus(callbackWatcher.Status.AUTO_GRANTED, delta);

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
    statusLog.recordCallbackStatus(callbackWatcher.Status.USER_DENIED, delta);
  else
    statusLog.recordCallbackStatus(callbackWatcher.Status.AUTO_DENIED, delta);

  callbackWatcher.timestamp_ = 0;
  callbackWatcher.pending_ = false;
}

/**
 * Invoked before the requestDriver tries to invoke the geolocation function.
 */
callbackWatcher.recordInvocation = function() {
  statusLog.recordCallbackStatus(callbackWatcher.Status.REQUESTED);
  callbackWatcher.timestamp_ = Date.now();
  callbackWatcher.pending_ = true;
}

/**
 * Record when the user navigates without making a permission decision.
 * @return {null} To make the method execute in Chrome.
 */
callbackWatcher.checkBeforeNavigate = function() {
  if (!callbackWatcher.pending_)
    return;

  var delta = Date.now() - callbackWatcher.timestamp_;
  if (delta < callbackWatcher.THRESHOLD)
    statusLog.recordCallbackStatus(callbackWatcher.Status.FAST_NAVIGATE, delta);
  else
    statusLog.recordCallbackStatus(callbackWatcher.Status.SLOW_NAVIGATE, delta);
  return null;
}
window.addEventListener('beforeunload', callbackWatcher.checkBeforeNavigate);

/**
 * We can't know the initial status until actually trying to invoke the
 * geolocation function, so set the UI to initially say "unknown".
 */
callbackWatcher.setup = function() {
  statusLog.recordCallbackStatus(callbackWatcher.Status.UNKNOWN);
}
document.addEventListener('DOMContentLoaded', callbackWatcher.setup);

// *****************************************************************************
// REQUEST HANDLER
// The request handler methods set up the "request" buttons. It invokes the
// apiWatcher and callbackWatcher methods as appropriate.
// *****************************************************************************

var requestDriver = {};

requestDriver.STORAGE_KEY = 'request';
requestDriver.STORAGE_LOAD = 'onload';
requestDriver.STORAGE_CLICK = 'click';

/**
 * A wrapper to invoke both the apiWatcher and callbackWatcher callbacks.
 */
requestDriver.successCallback = function() {
  apiWatcher.successCallback();
  callbackWatcher.successCallback();

  if (apiWatcher.revokeAvailable_)
    requestDriver.setupRevocationButton();
}

/**
 * A wrapper to invoke both the apiWatcher and callbackWatcher callbacks.
 */
requestDriver.failureCallback = function() {
  apiWatcher.failureCallback();
  callbackWatcher.failureCallback();
}

/**
 * Tell the callbackWatcher and apiWatcher that we're about to invoke the
 * geolocation API.
 */
requestDriver.notifyInvocation = function() {
  apiWatcher.recordInvocation();
  callbackWatcher.recordInvocation();
}

/**
 * Try to read geolocation. This will trigger a permission check.
 */
requestDriver.initiateRequest = function() {
  requestDriver.notifyInvocation();
  navigator.geolocation.getCurrentPosition(
      requestDriver.successCallback, requestDriver.failureCallback);
}

/**
 * Make the "request" and "request onload" buttons work. Use local storage
 * to keep track of whether we should prompt on load.
 */
requestDriver.setup = function() {
  $('request-button').addEventListener('click', requestDriver.initiateRequest);

  // Some browsers don't support localStorage (e.g., in Incognito). The
  // request on load button won't work without localStorage.
  if (typeof(Storage) === 'undefined' || !localStorage) {
    statusLog.displayFeatureStatus($('support-storage'), false);
    $('request-onload-button').disabled = true;
    return;
  }

  statusLog.displayFeatureStatus($('support-storage'), true);
  $('request-onload-button').addEventListener('click', function() {
    localStorage.setItem(requestDriver.STORAGE_KEY,
                         requestDriver.STORAGE_LOAD);
    location.reload(false);
  });

  // Check whether this current page load was the result of a refresh.
  if (localStorage.getItem(requestDriver.STORAGE_KEY) ==
      requestDriver.STORAGE_LOAD) {
    localStorage.setItem(requestDriver.STORAGE_KEY,
                         requestDriver.STORAGE_CLICK);
    requestDriver.initiateRequest();
  }
}
document.addEventListener('DOMContentLoaded', requestDriver.setup);

/**
 * The revocation button allows you to reset the geolocation permission status,
 * which users can do from within settings or by clicking on the green lock.
 * The API is only available on very new browsers.
 */
requestDriver.setupRevocationButton = function() {
  $('revoke-button').removeAttribute('disabled');
  $('revoke-button').addEventListener('click', function() {
    navigator.permissions.revoke({name:'geolocation'});
    $('revoke-button').setAttribute('disabled', true);
  });
}

// *****************************************************************************
// STATUS LOGGER
// If this were real code, the status logger would (1) store the different
// statuses during the interaction, then (2) ping the analytics server on
// page unload with a JSON object or string with the statuses.
// Since this is a demo, we instead display the responses in the UI and console.
// *****************************************************************************

var statusLog = {};

/**
 * Display the apiWatcher's status on the UI and in the console.
 * @param {apiWatcher.Status} newStatus The desired status.
 * @param {number=} delta The time that passed (optional).
 */
statusLog.recordApiStatus = function(newStatus, delta) {
  var humanString = 'unavailable';
  if (newStatus == apiWatcher.Status.UNAVAILABLE)
    humanString = 'unavailable';
  else if (newStatus == apiWatcher.Status.NOT_YET_PROMPTED)
    humanString = 'default';
  else if (newStatus == apiWatcher.Status.REQUESTED)
    humanString = 'requested';
  else if (newStatus == apiWatcher.Status.STARTING_GRANTED)
    humanString = 'user previously granted';
  else if (newStatus == apiWatcher.Status.STARTING_DENIED)
    humanString = 'user previously denied';
  else if (newStatus == apiWatcher.Status.GRANTED_FROM_STORAGE)
    humanString = 'granted, due to saved decision';
  else if (newStatus == apiWatcher.Status.DENIED_FROM_STORAGE)
    humanString = 'denied, due to saved decision';
  else if (newStatus == apiWatcher.Status.USER_GRANTED)
    humanString = 'user granted';
  else if (newStatus == apiWatcher.Status.USER_DENIED)
    humanString = 'user denied';
  else if (newStatus == apiWatcher.Status.USER_DISMISSED)
    humanString = 'user dismissed';
  else if (newStatus == apiWatcher.Status.BROWSER_BLOCKED)
    humanString = 'browser blocked';
  else if (newStatus == apiWatcher.Status.SETTINGS_GRANTED)
    humanString = 'user granted in settings';
  else if (newStatus == apiWatcher.Status.SETTINGS_DENIED)
    humanString = 'user denied in settings';
  else if (newStatus == apiWatcher.Status.SETTINGS_DEFAULT)
    humanString = 'user cleared in settings';
  else if (newStatus == apiWatcher.Status.FAST_NAVIGATE)
    humanString = 'navigated too quickly to respond';
  else if (newStatus == apiWatcher.Status.SLOW_NAVIGATE)
    humanString = 'navigated without responding';

  var deltaString = '';
  if (delta) deltaString = ' (' + delta + 'ms)';

  $('status-permissions').innerText = humanString;
  console.log('Permission API: ' + humanString + deltaString);
}

/**
 * Display the callbackWatcher's status on the UI and in the console.
 * @param {callbackWatcher.Status} newStatus The desired status.
 * @param {number=} delta The time that passed (optional).
 */
statusLog.recordCallbackStatus = function(newStatus, delta) {
  var humanString = 'unavailable';
  if (newStatus == callbackWatcher.Status.UNKNOWN)
    humanString = 'unknown';
  else if (newStatus == callbackWatcher.Status.REQUESTED)
    humanString = 'requested';
  else if (newStatus == callbackWatcher.Status.USER_GRANTED)
    humanString = 'user granted';
  else if (newStatus == callbackWatcher.Status.USER_DENIED)
    humanString = 'user denied';
  else if (newStatus == callbackWatcher.Status.AUTO_GRANTED)
    humanString = 'auto granted';
  else if (newStatus == callbackWatcher.Status.AUTO_DENIED)
    humanString = 'auto denied';
  else if (newStatus == callbackWatcher.Status.FAST_NAVIGATE)
    humanString = 'navigated too quickly to respond';
  else if (newStatus == callbackWatcher.Status.SLOW_NAVIGATE)
    humanString = 'navigated without responding';

  var deltaString = '';
  if (delta) deltaString = ' (' + delta + 'ms)';

  $('status-callbacks').innerText = humanString;
  console.log('Callback tracking: ' + humanString + deltaString);
}

/**
 * Update the feature status pane.
 * @param {!Object} elem The feature status's DOM element.
 * @param {boolean} supported Whether the feature is supported.
 */
statusLog.displayFeatureStatus = function(elem, supported) {
  if (supported) {
    elem.innerText = 'supported';
    elem.classList.add('feature-supported');
  } else {
    elem.innerText = 'unsupported';
    elem.classList.add('feature-unsupported');
  }
}

statusLog.setPermissionStatus = function(message) {
  $('status-permissions').innerText = message;
}

function $(elementName) {
  return document.getElementById(elementName);
}
