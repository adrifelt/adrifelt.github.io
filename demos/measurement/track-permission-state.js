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
// CONSTANTS
// Constants used by both the callbackWatcher and apiWatcher.
// *****************************************************************************

var geoConstants = {};

// Constants for the PermissionStatus API.
geoConstants.DENIED = 'denied';
geoConstants.GRANTED = 'granted';
geoConstants.PROMPT = 'prompt';
geoConstants.UNKNOWN = 'unknown';  // Used here but not part of the API spec.

// The timing threshold used to differentiate between an automated and human
// response to a dialog.
geoConstants.THRESHOLD = 10;  // Milliseconds

// Constants for the PositionError interface.
geoConstants.ErrorCode = {
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
};

// *****************************************************************************
// PERMISSIONS API WATCHER
// These methods track the permission state using the Permissions API.
// To track the user's flow, check the permission status several times:
//   -- Initially (some time prior to the geolocation call)
//   -- In the error callback
//   -- When the page navigates away (on unload)
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
  GRANTED_ELSEWHERE: 11,    // User enabled the permission somewhere else
  DENIED_ELSEWHERE: 12,     // User disabled the permission somewhere else
  RESET_ELSEWHERE: 13,      // User reset the permission to 'prompt' next time
  FAST_NAVIGATE: 14,        // User navigated very quickly after prompt shown
  SLOW_NAVIGATE: 15,        // User navigated without making a decision
  GRANTED_BUT_OS: 16,       // Permission granted from storage, but the call is
                            // failing due to missing OS-level permissions
  DEFERRED: 17,             // Status has potentially been changed elsewhere,
                            // but a pending request needs to be processed first
};

// Used to differentiate between an automated and human response to a dialog.
apiWatcher.timestamp_ = 0;

// Compatibility information.
apiWatcher.queryAvailable_ = false;
apiWatcher.requestAvailable_ = false;
apiWatcher.revokeAvailable_ = false;

// Information needed to calculate the current state, given the possibility for
// multiple queued requests and/or a change in another window.
apiWatcher.pending_ = 0;
apiWatcher.lastSavedState_ = geoConstants.UNKNOWN;
apiWatcher.deferredState_ = geoConstants.UNKNOWN;

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
      if (apiWatcher.lastSavedState_ != geoConstants.UNKNOWN)
        return;
      var state = permissionStatus.state || permissionStatus.status;
      apiWatcher.lastSavedState_ = state;
      if (state == geoConstants.GRANTED)
        statusLog.recordApiStatus(apiWatcher.Status.STARTING_GRANTED);
      else if (state == geoConstants.DENIED)
        statusLog.recordApiStatus(apiWatcher.Status.STARTING_DENIED);
      else if (state == geoConstants.PROMPT)
        statusLog.recordApiStatus(apiWatcher.Status.NOT_YET_PROMPTED);

      permissionStatus.addEventListener(
          'change', apiWatcher.recordPermissionChange);
    });
}


/**
 * Record a change to a permission that wasn't associated with a permission
 * request. (It must have come from the user messing with the settings.)
 * Note that this runs within the scope of the permissionStatus object that it
 * was attached to in checkInitialState.
 */
apiWatcher.recordPermissionChange = function() {
  var state = this.state || this.status;

  if (apiWatcher.pending_ > 0) {
    apiWatcher.deferredState_ = state;
    statusLog.recordApiStatus(apiWatcher.Status.DEFERRED);
    return;
  }

  if (state == geoConstants.GRANTED)
    statusLog.recordApiStatus(apiWatcher.Status.GRANTED_ELSEWHERE);
  else if (state == geoConstants.DENIED)
    statusLog.recordApiStatus(apiWatcher.Status.DENIED_ELSEWHERE);
  else if (state == geoConstants.PROMPT)
    statusLog.recordApiStatus(apiWatcher.Status.RESET_ELSEWHERE);
  apiWatcher.lastSavedState_ = state;
}


/**
 * Invoked when the permission is granted.
 */
apiWatcher.successCallback = function() {
  if (!apiWatcher.queryAvailable_)
    return;

  if (apiWatcher.lastSavedState_ == geoConstants.PROMPT)
    statusLog.recordApiStatus(apiWatcher.Status.USER_GRANTED);
  else if (apiWatcher.lastSavedState_ == geoConstants.GRANTED)
    statusLog.recordApiStatus(apiWatcher.Status.GRANTED_FROM_STORAGE);

  apiWatcher.pending_--;
  apiWatcher.lastSavedState_ = geoConstants.GRANTED;
  apiWatcher.deferredState_ = geoConstants.UNKNOWN;  // Doesn't matter anymore.
}


/**
 * Invoked as part of the geolocation error callback. The meaning of the error
 * depends on what the initial state was, the timing of the response, the
 * new permission state, and the callback error code. We use the error callback
 * instead of the PermissionStatus onchange event because we use the error code.
 * @param {number} errorCode The error code from the callback.
 */
apiWatcher.failureCallback = function(errorCode) {
  if (!apiWatcher.queryAvailable_)
    return;

  apiWatcher.pending_--;

  var delta = Date.now() - apiWatcher.timestamp_;
  var lastSavedState = apiWatcher.lastSavedState_;
  var deferredState = apiWatcher.deferredState_;
  apiWatcher.deferredState_ = geoConstants.UNKNOWN;

  navigator.permissions.query({name:'geolocation'}).then(
    function(permissionStatus) {
      var state = permissionStatus.state || permissionStatus.status;
      var recordState = apiWatcher.Status.UNKNOWN;

      if (state == geoConstants.PROMPT) {
        if (delta > geoConstants.THRESHOLD)
          recordState = apiWatcher.Status.USER_DISMISSED;
        else
          recordState = apiWatcher.Status.BROWSER_BLOCKED;
      } else if (state == geoConstants.GRANTED) {
        if (deferredState == geoConstants.GRANTED &&
            errorCode == geoConstants.ErrorCode.PERMISSION_DENIED) {
          // User granted the permission elsewhere while the request was
          // pending in this window, then dismissed this window's request.
          statusLog.recordApiStatus(apiWatcher.Status.GRANTED_ELSEWHERE);
          recordState = apiWatcher.Status.USER_DISMISSED;
        } else if (errorCode != geoConstants.ErrorCode.PERMISSION_DENIED) {
          // User granted the permission, but it failed for other reasons.
          if (apiWatcher.lastSavedState_ == geoConstants.PROMPT)
            recordState = apiWatcher.Status.USER_GRANTED;
          else if (apiWatcher.lastSavedState_ == geoConstants.GRANTED)
            recordState = apiWatcher.Status.GRANTED_FROM_STORAGE;
        } else {
          recordState = apiWatcher.Status.GRANTED_BUT_OS;
        }
      } else if (state == geoConstants.DENIED) {
        if (apiWatcher.lastSavedState_ == geoConstants.DENIED)
          recordState = apiWatcher.Status.DENIED_FROM_STORAGE;
        else
          recordState = apiWatcher.Status.USER_DENIED;
      }

      statusLog.recordApiStatus(recordState, delta);
      apiWatcher.lastSavedState_ = state;
    });
}


/**
 * Invoked before requestDriver tries to invoke the geolocation function.
 */
apiWatcher.recordInvocation = function() {
  if (!apiWatcher.queryAvailable_)
    return;

  statusLog.recordApiStatus(apiWatcher.Status.REQUESTED);
  apiWatcher.pending_++;
  apiWatcher.timestamp_ = Date.now();

  // If the permission was requested on load, this could be happening before
  // checkInitialState has had a chance to run, so force-invoke it here.
  if (apiWatcher.lastSavedState_ == geoConstants.UNKNOWN)
    apiWatcher.checkInitialState();
}


/**
 * Record when the user navigates without making a permission decision.
 * @return {null} To make the method execute in Chrome.
 */
apiWatcher.checkBeforeNavigate = function() {
  if (apiWatcher.pending_ == 0 || !apiWatcher.queryAvailable_)
    return;

  if (apiWatcher.deferredState_ != geoConstants.UNKNOWN)
    statusLog.recordApiStatus(apiWatcher.deferredState_);

  var delta = Date.now() - apiWatcher.timestamp_;
  if (delta < geoConstants.THRESHOLD)
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
    statusLog.recordApiStatus(apiWatcher.Status.UNAVAILABLE);

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
  USER_FAILED: 6,     // User granted the permission in the browser but the
                      // request was unable to complete
  AUTO_FAILED: 7,     // Request was unable to complete and the user never saw
                      // the prompt
  FAST_NAVIGATE: 8,   // Navigated away from the page shortly after request.
  SLOW_NAVIGATE: 9,   // Navigated away from the page without a response.
};

// Used to differentiate between an automated and human response to a dialog.
callbackWatcher.timestamp_ = 0;

// Used to identify situations where the user navigates the page without
// responding to the dialog.
callbackWatcher.pending_ = 0;


/**
 * Invoked as part of the geolocation success callback. Record the success, and
 * compare it to the user-response timing threshold.
 */
callbackWatcher.successCallback = function() {
  var delta = Date.now() - callbackWatcher.timestamp_;
  if (delta > geoConstants.THRESHOLD)
    statusLog.recordCallbackStatus(callbackWatcher.Status.USER_GRANTED, delta);
  else
    statusLog.recordCallbackStatus(callbackWatcher.Status.AUTO_GRANTED, delta);

  callbackWatcher.timestamp_ = 0;
  callbackWatcher.pending_--;
}


/**
 * Invoked as part of the geolocation error callback. Record the failure, and
 * compare it to the user-response timing threshold.
 * @param {number} errorCode The error code from the callback.
 */
callbackWatcher.failureCallback = function(errorCode) {
  callbackWatcher.timestamp_ = 0;
  callbackWatcher.pending_--;

  // If POSITION_UNAVAILABLE or TIMEOUT, the permission has been granted but
  // the request cannot be fulfilled.
  var permissionFailure =
      (errorCode == geoConstants.ErrorCode.PERMISSION_DENIED);

  var delta = Date.now() - callbackWatcher.timestamp_;
  if (delta > geoConstants.THRESHOLD) {
    statusLog.recordCallbackStatus(
        permissionFailure ?
          callbackWatcher.Status.USER_DENIED :
          callbackWatcher.Status.USER_FAILED,
        delta);
  } else if (permissionFailure) {
    statusLog.recordCallbackStatus(callbackWatcher.Status.AUTO_DENIED, delta);
  } else {
    statusLog.recordCallbackStatus(callbackWatcher.Status.AUTO_FAILED, delta);
  }
}


/**
 * Invoked before the requestDriver tries to invoke the geolocation function.
 */
callbackWatcher.recordInvocation = function() {
  statusLog.recordCallbackStatus(callbackWatcher.Status.REQUESTED);
  callbackWatcher.timestamp_ = Date.now();
  callbackWatcher.pending_++;
}


/**
 * Record when the user navigates without making a permission decision.
 * @return {null} To make the method execute in Chrome.
 */
callbackWatcher.checkBeforeNavigate = function() {
  if (callbackWatcher.pending_ == 0)
    return;

  var delta = Date.now() - callbackWatcher.timestamp_;
  if (delta < geoConstants.THRESHOLD)
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
  callbackWatcher.successCallback();
  apiWatcher.successCallback();
}


/**
 * A wrapper to invoke both the apiWatcher and callbackWatcher callbacks.
 * @param {Object} positionError Geolocation API PositionError.
 */
requestDriver.failureCallback = function(positionError) {
  apiWatcher.failureCallback(positionError.code);
  callbackWatcher.failureCallback(positionError.code);
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
  else if (newStatus == apiWatcher.Status.GRANTED_ELSEWHERE)
    humanString = 'user granted elsewhere';
  else if (newStatus == apiWatcher.Status.DENIED_ELSEWHERE)
    humanString = 'user denied elsewhere';
  else if (newStatus == apiWatcher.Status.RESET_ELSEWHERE)
    humanString = 'user cleared elsewhere';
  else if (newStatus == apiWatcher.Status.FAST_NAVIGATE)
    humanString = 'navigated too quickly to respond';
  else if (newStatus == apiWatcher.Status.SLOW_NAVIGATE)
    humanString = 'navigated without responding';
  else if (newStatus == apiWatcher.Status.GRANTED_BUT_OS)
    humanString = 'location disabled by OS';

  var deltaString = '';
  if (delta) deltaString = ' (' + delta + 'ms)';

  $('status-permissions').textContent = humanString;
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
  else if (newStatus == callbackWatcher.Status.USER_FAILED)
    humanString = 'user granted, but failed';
  else if (newStatus == callbackWatcher.Status.AUTO_FAILED)
    humanString = 'failed without interaction';
  else if (newStatus == callbackWatcher.Status.FAST_NAVIGATE)
    humanString = 'navigated too quickly to respond';
  else if (newStatus == callbackWatcher.Status.SLOW_NAVIGATE)
    humanString = 'navigated without responding';

  var deltaString = '';
  if (delta) deltaString = ' (' + delta + 'ms)';

  $('status-callbacks').textContent = humanString;
  console.log('Callback tracking: ' + humanString + deltaString);
}


/**
 * Update the feature status pane.
 * @param {!Object} elem The feature status's DOM element.
 * @param {boolean} supported Whether the feature is supported.
 */
statusLog.displayFeatureStatus = function(elem, supported) {
  if (supported) {
    elem.textContent = 'supported';
    elem.classList.add('feature-supported');
  } else {
    elem.textContent = 'unsupported';
    elem.classList.add('feature-unsupported');
  }
}

statusLog.setPermissionStatus = function(message) {
  $('status-permissions').textContent = message;
}

// *****************************************************************************
// REVOCATION
// This adds a "Revoke" button on systems where it's available, as a
// convenience for testing. It resets the permission state to the default.
// *****************************************************************************

var revoke = {};

/**
 * Enable the revocation button if possible, when the permission is granted.
 */
revoke.maybeEnableButton = function() {
  if (!navigator.permissions || !navigator.permissions.query ||
      !navigator.permissions.revoke)
    return;

  navigator.permissions.query({name:'geolocation'}).then(
    function(permissionStatus) {
      revoke.updateButtonState(
          permissionStatus.state || permissionStatus.status);
      permissionStatus.addEventListener('change', function() {
        revoke.updateButtonState(this.state || this.status);
      });
    });
}
document.addEventListener('DOMContentLoaded', revoke.maybeEnableButton);


/**
 * Do the actual revocation on button click.
 */
revoke.handleClick = function() {
  navigator.permissions.revoke({name:'geolocation'});
}


/**
 * Enable or disable the UI according to the permission state.
 * @param {Object} permissionState The state of the permission.
 */
revoke.updateButtonState = function(permissionState) {
  if (permissionState == geoConstants.GRANTED) {
    $('revoke-button').removeAttribute('disabled');
    $('revoke-button').addEventListener('click', revoke.handleClick);
  } else {
    $('revoke-button').setAttribute('disabled', true);
    $('revoke-button').removeEventListener('click', revoke.handleClick);
  }
}


// *****************************************************************************
// NAVIGATION
// This adds fragment navigation button for testing.
// *****************************************************************************

var navExample = {};

/**
 *
 */
navExample.setupButtons = function() {
  $('fragment-button').addEventListener('click', function() {
    var number = Math.floor(Math.random() * 100);
    window.location.hash = 'example' + number;
  });
}
document.addEventListener('DOMContentLoaded', navExample.setupButtons);


function $(elementName) {
  return document.getElementById(elementName);
}
