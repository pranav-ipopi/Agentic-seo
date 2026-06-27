/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 2558:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/* @@package_name - v@@version - @@timestamp */
/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


if (!(globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.id)) {
  throw new Error("This script should only be loaded in a browser extension.");
}

if (!(globalThis.browser && globalThis.browser.runtime && globalThis.browser.runtime.id)) {
  const CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE = "The message port closed before a response was received.";
  const ERROR_TO_IGNORE = `A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received`;

  // Wrapping the bulk of this polyfill in a one-time-use function is a minor
  // optimization for Firefox. Since Spidermonkey does not fully parse the
  // contents of a function until the first time it's called, and since it will
  // never actually need to be called, this allows the polyfill to be included
  // in Firefox nearly for free.
  const wrapAPIs = extensionAPIs => {
    // NOTE: apiMetadata is associated to the content of the api-metadata.json file
    // at build time by replacing the following "include" with the content of the
    // JSON file.
    const apiMetadata = __webpack_require__(2058);

    if (Object.keys(apiMetadata).length === 0) {
      throw new Error("api-metadata.json has not been included in browser-polyfill");
    }

    /**
     * A WeakMap subclass which creates and stores a value for any key which does
     * not exist when accessed, but behaves exactly as an ordinary WeakMap
     * otherwise.
     *
     * @param {function} createItem
     *        A function which will be called in order to create the value for any
     *        key which does not exist, the first time it is accessed. The
     *        function receives, as its only argument, the key being created.
     */
    class DefaultWeakMap extends WeakMap {
      constructor(createItem, items = undefined) {
        super(items);
        this.createItem = createItem;
      }

      get(key) {
        if (!this.has(key)) {
          this.set(key, this.createItem(key));
        }

        return super.get(key);
      }
    }

    /**
     * Returns true if the given object is an object with a `then` method, and can
     * therefore be assumed to behave as a Promise.
     *
     * @param {*} value The value to test.
     * @returns {boolean} True if the value is thenable.
     */
    const isThenable = value => {
      return value && typeof value === "object" && typeof value.then === "function";
    };

    /**
     * Creates and returns a function which, when called, will resolve or reject
     * the given promise based on how it is called:
     *
     * - If, when called, `chrome.runtime.lastError` contains a non-null object,
     *   the promise is rejected with that value.
     * - If the function is called with exactly one argument, the promise is
     *   resolved to that value.
     * - Otherwise, the promise is resolved to an array containing all of the
     *   function's arguments.
     *
     * @param {object} promise
     *        An object containing the resolution and rejection functions of a
     *        promise.
     * @param {function} promise.resolve
     *        The promise's resolution function.
     * @param {function} promise.reject
     *        The promise's rejection function.
     * @param {object} metadata
     *        Metadata about the wrapped method which has created the callback.
     * @param {boolean} metadata.singleCallbackArg
     *        Whether or not the promise is resolved with only the first
     *        argument of the callback, alternatively an array of all the
     *        callback arguments is resolved. By default, if the callback
     *        function is invoked with only a single argument, that will be
     *        resolved to the promise, while all arguments will be resolved as
     *        an array if multiple are given.
     *
     * @returns {function}
     *        The generated callback function.
     */
    const makeCallback = (promise, metadata) => {
      // In case we encounter a browser error in the callback function, we don't
      // want to lose the stack trace leading up to this point. For that reason,
      // we need to instantiate the error outside the callback function.
      let error = new Error();
      return (...callbackArgs) => {
        if (extensionAPIs.runtime.lastError) {
          error.message = extensionAPIs.runtime.lastError.message;
          promise.reject(error);
        } else if (metadata.singleCallbackArg ||
                   (callbackArgs.length <= 1 && metadata.singleCallbackArg !== false)) {
          promise.resolve(callbackArgs[0]);
        } else {
          promise.resolve(callbackArgs);
        }
      };
    };

    const pluralizeArguments = (numArgs) => numArgs == 1 ? "argument" : "arguments";

    /**
     * Creates a wrapper function for a method with the given name and metadata.
     *
     * @param {string} name
     *        The name of the method which is being wrapped.
     * @param {object} metadata
     *        Metadata about the method being wrapped.
     * @param {integer} metadata.minArgs
     *        The minimum number of arguments which must be passed to the
     *        function. If called with fewer than this number of arguments, the
     *        wrapper will raise an exception.
     * @param {integer} metadata.maxArgs
     *        The maximum number of arguments which may be passed to the
     *        function. If called with more than this number of arguments, the
     *        wrapper will raise an exception.
     * @param {boolean} metadata.singleCallbackArg
     *        Whether or not the promise is resolved with only the first
     *        argument of the callback, alternatively an array of all the
     *        callback arguments is resolved. By default, if the callback
     *        function is invoked with only a single argument, that will be
     *        resolved to the promise, while all arguments will be resolved as
     *        an array if multiple are given.
     *
     * @returns {function(object, ...*)}
     *       The generated wrapper function.
     */
    const wrapAsyncFunction = (name, metadata) => {
      return function asyncFunctionWrapper(target, ...args) {
        if (args.length < metadata.minArgs) {
          throw new Error(`Expected at least ${metadata.minArgs} ${pluralizeArguments(metadata.minArgs)} for ${name}(), got ${args.length}`);
        }

        if (args.length > metadata.maxArgs) {
          throw new Error(`Expected at most ${metadata.maxArgs} ${pluralizeArguments(metadata.maxArgs)} for ${name}(), got ${args.length}`);
        }

        return new Promise((resolve, reject) => {
          if (metadata.fallbackToNoCallback) {
            // This API method has currently no callback on Chrome, but it return a promise on Firefox,
            // and so the polyfill will try to call it with a callback first, and it will fallback
            // to not passing the callback if the first call fails.
            try {
              target[name](...args, makeCallback({resolve, reject}, metadata));
            } catch (cbError) {
              console.warn(`${name} API method doesn't seem to support the callback parameter, ` +
                           "falling back to call it without a callback: ", cbError);

              target[name](...args);

              // Update the API method metadata, so that the next API calls will not try to
              // use the unsupported callback anymore.
              metadata.fallbackToNoCallback = false;
              metadata.noCallback = true;

              resolve();
            }
          } else if (metadata.noCallback) {
            target[name](...args);
            resolve();
          } else {
            target[name](...args, makeCallback({resolve, reject}, metadata));
          }
        });
      };
    };

    /**
     * Wraps an existing method of the target object, so that calls to it are
     * intercepted by the given wrapper function. The wrapper function receives,
     * as its first argument, the original `target` object, followed by each of
     * the arguments passed to the original method.
     *
     * @param {object} target
     *        The original target object that the wrapped method belongs to.
     * @param {function} method
     *        The method being wrapped. This is used as the target of the Proxy
     *        object which is created to wrap the method.
     * @param {function} wrapper
     *        The wrapper function which is called in place of a direct invocation
     *        of the wrapped method.
     *
     * @returns {Proxy<function>}
     *        A Proxy object for the given method, which invokes the given wrapper
     *        method in its place.
     */
    const wrapMethod = (target, method, wrapper) => {
      return new Proxy(method, {
        apply(targetMethod, thisObj, args) {
          return wrapper.call(thisObj, target, ...args);
        },
      });
    };

    let hasOwnProperty = Function.call.bind(Object.prototype.hasOwnProperty);

    /**
     * Wraps an object in a Proxy which intercepts and wraps certain methods
     * based on the given `wrappers` and `metadata` objects.
     *
     * @param {object} target
     *        The target object to wrap.
     *
     * @param {object} [wrappers = {}]
     *        An object tree containing wrapper functions for special cases. Any
     *        function present in this object tree is called in place of the
     *        method in the same location in the `target` object tree. These
     *        wrapper methods are invoked as described in {@see wrapMethod}.
     *
     * @param {object} [metadata = {}]
     *        An object tree containing metadata used to automatically generate
     *        Promise-based wrapper functions for asynchronous. Any function in
     *        the `target` object tree which has a corresponding metadata object
     *        in the same location in the `metadata` tree is replaced with an
     *        automatically-generated wrapper function, as described in
     *        {@see wrapAsyncFunction}
     *
     * @returns {Proxy<object>}
     */
    const wrapObject = (target, wrappers = {}, metadata = {}) => {
      let cache = Object.create(null);
      let handlers = {
        has(proxyTarget, prop) {
          return prop in target || prop in cache;
        },

        get(proxyTarget, prop, receiver) {
          if (prop in cache) {
            return cache[prop];
          }

          if (!(prop in target)) {
            return undefined;
          }

          let value = target[prop];

          if (typeof value === "function") {
            // This is a method on the underlying object. Check if we need to do
            // any wrapping.

            if (typeof wrappers[prop] === "function") {
              // We have a special-case wrapper for this method.
              value = wrapMethod(target, target[prop], wrappers[prop]);
            } else if (hasOwnProperty(metadata, prop)) {
              // This is an async method that we have metadata for. Create a
              // Promise wrapper for it.
              let wrapper = wrapAsyncFunction(prop, metadata[prop]);
              value = wrapMethod(target, target[prop], wrapper);
            } else {
              // This is a method that we don't know or care about. Return the
              // original method, bound to the underlying object.
              value = value.bind(target);
            }
          } else if (typeof value === "object" && value !== null &&
                     (hasOwnProperty(wrappers, prop) ||
                      hasOwnProperty(metadata, prop))) {
            // This is an object that we need to do some wrapping for the children
            // of. Create a sub-object wrapper for it with the appropriate child
            // metadata.
            value = wrapObject(value, wrappers[prop], metadata[prop]);
          } else if (hasOwnProperty(metadata, "*")) {
            // Wrap all properties in * namespace.
            value = wrapObject(value, wrappers[prop], metadata["*"]);
          } else {
            // We don't need to do any wrapping for this property,
            // so just forward all access to the underlying object.
            Object.defineProperty(cache, prop, {
              configurable: true,
              enumerable: true,
              get() {
                return target[prop];
              },
              set(value) {
                target[prop] = value;
              },
            });

            return value;
          }

          cache[prop] = value;
          return value;
        },

        set(proxyTarget, prop, value, receiver) {
          if (prop in cache) {
            cache[prop] = value;
          } else {
            target[prop] = value;
          }
          return true;
        },

        defineProperty(proxyTarget, prop, desc) {
          return Reflect.defineProperty(cache, prop, desc);
        },

        deleteProperty(proxyTarget, prop) {
          return Reflect.deleteProperty(cache, prop);
        },
      };

      // Per contract of the Proxy API, the "get" proxy handler must return the
      // original value of the target if that value is declared read-only and
      // non-configurable. For this reason, we create an object with the
      // prototype set to `target` instead of using `target` directly.
      // Otherwise we cannot return a custom object for APIs that
      // are declared read-only and non-configurable, such as `chrome.devtools`.
      //
      // The proxy handlers themselves will still use the original `target`
      // instead of the `proxyTarget`, so that the methods and properties are
      // dereferenced via the original targets.
      let proxyTarget = Object.create(target);
      return new Proxy(proxyTarget, handlers);
    };

    /**
     * Creates a set of wrapper functions for an event object, which handles
     * wrapping of listener functions that those messages are passed.
     *
     * A single wrapper is created for each listener function, and stored in a
     * map. Subsequent calls to `addListener`, `hasListener`, or `removeListener`
     * retrieve the original wrapper, so that  attempts to remove a
     * previously-added listener work as expected.
     *
     * @param {DefaultWeakMap<function, function>} wrapperMap
     *        A DefaultWeakMap object which will create the appropriate wrapper
     *        for a given listener function when one does not exist, and retrieve
     *        an existing one when it does.
     *
     * @returns {object}
     */
    const wrapEvent = wrapperMap => ({
      addListener(target, listener, ...args) {
        target.addListener(wrapperMap.get(listener), ...args);
      },

      hasListener(target, listener) {
        return target.hasListener(wrapperMap.get(listener));
      },

      removeListener(target, listener) {
        target.removeListener(wrapperMap.get(listener));
      },
    });

    const onRequestFinishedWrappers = new DefaultWeakMap(listener => {
      if (typeof listener !== "function") {
        return listener;
      }

      /**
       * Wraps an onRequestFinished listener function so that it will return a
       * `getContent()` property which returns a `Promise` rather than using a
       * callback API.
       *
       * @param {object} req
       *        The HAR entry object representing the network request.
       */
      return function onRequestFinished(req) {
        const wrappedReq = wrapObject(req, {} /* wrappers */, {
          getContent: {
            minArgs: 0,
            maxArgs: 0,
          },
        });
        listener(wrappedReq);
      };
    });

    const onMessageWrappers = new DefaultWeakMap(listener => {
      if (typeof listener !== "function") {
        return listener;
      }

      /**
       * Wraps a message listener function so that it may send responses based on
       * its return value, rather than by returning a sentinel value and calling a
       * callback. If the listener function returns a Promise, the response is
       * sent when the promise either resolves or rejects.
       *
       * @param {*} message
       *        The message sent by the other end of the channel.
       * @param {object} sender
       *        Details about the sender of the message.
       * @param {function(*)} sendResponse
       *        A callback which, when called with an arbitrary argument, sends
       *        that value as a response.
       * @returns {boolean}
       *        True if the wrapped listener returned a Promise, which will later
       *        yield a response. False otherwise.
       */
      return function onMessage(message, sender, sendResponse) {
        let didCallSendResponse = false;

        let wrappedSendResponse;
        let sendResponsePromise = new Promise(resolve => {
          wrappedSendResponse = function(response) {
            didCallSendResponse = true;
            resolve(response);
          };
        });

        let result;
        try {
          result = listener(message, sender, wrappedSendResponse);
        } catch (err) {
          result = Promise.reject(err);
        }

        const isResultThenable = result !== true && isThenable(result);

        // If the listener didn't returned true or a Promise, or called
        // wrappedSendResponse synchronously, we can exit earlier
        // because there will be no response sent from this listener.
        if (result !== true && !isResultThenable && !didCallSendResponse) {
          return false;
        }

        // A small helper to send the message if the promise resolves
        // and an error if the promise rejects (a wrapped sendMessage has
        // to translate the message into a resolved promise or a rejected
        // promise).
        const sendPromisedResult = (promise) => {
          promise.then(msg => {
            // send the message value.
            sendResponse(msg);
          }, error => {
            // Send a JSON representation of the error if the rejected value
            // is an instance of error, or the object itself otherwise.
            let message;
            if (error && (error instanceof Error ||
                typeof error.message === "string")) {
              message = error.message;
            } else {
              message = "An unexpected error occurred";
            }

            sendResponse({
              __mozWebExtensionPolyfillReject__: true,
              message,
            });
          }).catch(err => {
            // Print an error on the console if unable to send the response.
            console.error("Failed to send onMessage rejected reply", err);
          });
        };

        // If the listener returned a Promise, send the resolved value as a
        // result, otherwise wait the promise related to the wrappedSendResponse
        // callback to resolve and send it as a response.
        if (isResultThenable) {
          sendPromisedResult(result);
        } else {
          sendPromisedResult(sendResponsePromise);
        }

        // Let Chrome know that the listener is replying.
        return true;
      };
    });

    const wrappedSendMessageCallback = ({reject, resolve}, reply) => {
      if (extensionAPIs.runtime.lastError) {
        // Detect when none of the listeners replied to the sendMessage call and resolve
        // the promise to undefined as in Firefox.
        // See https://github.com/mozilla/webextension-polyfill/issues/130
        if (extensionAPIs.runtime.lastError.message === CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE || extensionAPIs.runtime.lastError.message.includes(ERROR_TO_IGNORE)) {
          resolve();
        } else {
          reject(new Error(extensionAPIs.runtime.lastError.message));
        }
      } else if (reply && reply.__mozWebExtensionPolyfillReject__) {
        // Convert back the JSON representation of the error into
        // an Error instance.
        reject(new Error(reply.message));
      } else {
        resolve(reply);
      }
    };

    const wrappedSendMessage = (name, metadata, apiNamespaceObj, ...args) => {
      if (args.length < metadata.minArgs) {
        throw new Error(`Expected at least ${metadata.minArgs} ${pluralizeArguments(metadata.minArgs)} for ${name}(), got ${args.length}`);
      }

      if (args.length > metadata.maxArgs) {
        throw new Error(`Expected at most ${metadata.maxArgs} ${pluralizeArguments(metadata.maxArgs)} for ${name}(), got ${args.length}`);
      }

      return new Promise((resolve, reject) => {
        const wrappedCb = wrappedSendMessageCallback.bind(null, {resolve, reject});
        args.push(wrappedCb);
        apiNamespaceObj.sendMessage(...args);
      });
    };

    const staticWrappers = {
      devtools: {
        network: {
          onRequestFinished: wrapEvent(onRequestFinishedWrappers),
        },
      },
      runtime: {
        onMessage: wrapEvent(onMessageWrappers),
        onMessageExternal: wrapEvent(onMessageWrappers),
        sendMessage: wrappedSendMessage.bind(null, "sendMessage", {minArgs: 1, maxArgs: 3}),
      },
      tabs: {
        sendMessage: wrappedSendMessage.bind(null, "sendMessage", {minArgs: 2, maxArgs: 3}),
      },
    };
    const settingMetadata = {
      clear: {minArgs: 1, maxArgs: 1},
      get: {minArgs: 1, maxArgs: 1},
      set: {minArgs: 1, maxArgs: 1},
    };
    apiMetadata.privacy = {
      network: {"*": settingMetadata},
      services: {"*": settingMetadata},
      websites: {"*": settingMetadata},
    };

    return wrapObject(extensionAPIs, staticWrappers, apiMetadata);
  };

  // The build process adds a UMD wrapper around this file, which makes the
  // `module` variable available.
  module.exports = wrapAPIs(chrome);
} else {
  module.exports = globalThis.browser;
}


/***/ }),

/***/ 2181:
/***/ ((module) => {

(function webpackUniversalModuleDefinition(root, factory) {
	if(true)
		module.exports = factory();
	else {}
})(self, () => {
return /******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 7795:
/***/ ((module, __unused_webpack_exports, __nested_webpack_require_510__) => {

/* @@package_name - v@@version - @@timestamp */
/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


if (!(globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.id)) {
  throw new Error("This script should only be loaded in a browser extension.");
}

if (!(globalThis.browser && globalThis.browser.runtime && globalThis.browser.runtime.id)) {
  const CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE = "The message port closed before a response was received.";
  const ERROR_TO_IGNORE = `A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received`;

  // Wrapping the bulk of this polyfill in a one-time-use function is a minor
  // optimization for Firefox. Since Spidermonkey does not fully parse the
  // contents of a function until the first time it's called, and since it will
  // never actually need to be called, this allows the polyfill to be included
  // in Firefox nearly for free.
  const wrapAPIs = extensionAPIs => {
    // NOTE: apiMetadata is associated to the content of the api-metadata.json file
    // at build time by replacing the following "include" with the content of the
    // JSON file.
    const apiMetadata = __nested_webpack_require_510__(9438);

    if (Object.keys(apiMetadata).length === 0) {
      throw new Error("api-metadata.json has not been included in browser-polyfill");
    }

    /**
     * A WeakMap subclass which creates and stores a value for any key which does
     * not exist when accessed, but behaves exactly as an ordinary WeakMap
     * otherwise.
     *
     * @param {function} createItem
     *        A function which will be called in order to create the value for any
     *        key which does not exist, the first time it is accessed. The
     *        function receives, as its only argument, the key being created.
     */
    class DefaultWeakMap extends WeakMap {
      constructor(createItem, items = undefined) {
        super(items);
        this.createItem = createItem;
      }

      get(key) {
        if (!this.has(key)) {
          this.set(key, this.createItem(key));
        }

        return super.get(key);
      }
    }

    /**
     * Returns true if the given object is an object with a `then` method, and can
     * therefore be assumed to behave as a Promise.
     *
     * @param {*} value The value to test.
     * @returns {boolean} True if the value is thenable.
     */
    const isThenable = value => {
      return value && typeof value === "object" && typeof value.then === "function";
    };

    /**
     * Creates and returns a function which, when called, will resolve or reject
     * the given promise based on how it is called:
     *
     * - If, when called, `chrome.runtime.lastError` contains a non-null object,
     *   the promise is rejected with that value.
     * - If the function is called with exactly one argument, the promise is
     *   resolved to that value.
     * - Otherwise, the promise is resolved to an array containing all of the
     *   function's arguments.
     *
     * @param {object} promise
     *        An object containing the resolution and rejection functions of a
     *        promise.
     * @param {function} promise.resolve
     *        The promise's resolution function.
     * @param {function} promise.reject
     *        The promise's rejection function.
     * @param {object} metadata
     *        Metadata about the wrapped method which has created the callback.
     * @param {boolean} metadata.singleCallbackArg
     *        Whether or not the promise is resolved with only the first
     *        argument of the callback, alternatively an array of all the
     *        callback arguments is resolved. By default, if the callback
     *        function is invoked with only a single argument, that will be
     *        resolved to the promise, while all arguments will be resolved as
     *        an array if multiple are given.
     *
     * @returns {function}
     *        The generated callback function.
     */
    const makeCallback = (promise, metadata) => {
      // In case we encounter a browser error in the callback function, we don't
      // want to lose the stack trace leading up to this point. For that reason,
      // we need to instantiate the error outside the callback function.
      let error = new Error();
      return (...callbackArgs) => {
        if (extensionAPIs.runtime.lastError) {
          error.message = extensionAPIs.runtime.lastError.message;
          promise.reject(error);
        } else if (metadata.singleCallbackArg ||
                   (callbackArgs.length <= 1 && metadata.singleCallbackArg !== false)) {
          promise.resolve(callbackArgs[0]);
        } else {
          promise.resolve(callbackArgs);
        }
      };
    };

    const pluralizeArguments = (numArgs) => numArgs == 1 ? "argument" : "arguments";

    /**
     * Creates a wrapper function for a method with the given name and metadata.
     *
     * @param {string} name
     *        The name of the method which is being wrapped.
     * @param {object} metadata
     *        Metadata about the method being wrapped.
     * @param {integer} metadata.minArgs
     *        The minimum number of arguments which must be passed to the
     *        function. If called with fewer than this number of arguments, the
     *        wrapper will raise an exception.
     * @param {integer} metadata.maxArgs
     *        The maximum number of arguments which may be passed to the
     *        function. If called with more than this number of arguments, the
     *        wrapper will raise an exception.
     * @param {boolean} metadata.singleCallbackArg
     *        Whether or not the promise is resolved with only the first
     *        argument of the callback, alternatively an array of all the
     *        callback arguments is resolved. By default, if the callback
     *        function is invoked with only a single argument, that will be
     *        resolved to the promise, while all arguments will be resolved as
     *        an array if multiple are given.
     *
     * @returns {function(object, ...*)}
     *       The generated wrapper function.
     */
    const wrapAsyncFunction = (name, metadata) => {
      return function asyncFunctionWrapper(target, ...args) {
        if (args.length < metadata.minArgs) {
          throw new Error(`Expected at least ${metadata.minArgs} ${pluralizeArguments(metadata.minArgs)} for ${name}(), got ${args.length}`);
        }

        if (args.length > metadata.maxArgs) {
          throw new Error(`Expected at most ${metadata.maxArgs} ${pluralizeArguments(metadata.maxArgs)} for ${name}(), got ${args.length}`);
        }

        return new Promise((resolve, reject) => {
          if (metadata.fallbackToNoCallback) {
            // This API method has currently no callback on Chrome, but it return a promise on Firefox,
            // and so the polyfill will try to call it with a callback first, and it will fallback
            // to not passing the callback if the first call fails.
            try {
              target[name](...args, makeCallback({resolve, reject}, metadata));
            } catch (cbError) {
              console.warn(`${name} API method doesn't seem to support the callback parameter, ` +
                           "falling back to call it without a callback: ", cbError);

              target[name](...args);

              // Update the API method metadata, so that the next API calls will not try to
              // use the unsupported callback anymore.
              metadata.fallbackToNoCallback = false;
              metadata.noCallback = true;

              resolve();
            }
          } else if (metadata.noCallback) {
            target[name](...args);
            resolve();
          } else {
            target[name](...args, makeCallback({resolve, reject}, metadata));
          }
        });
      };
    };

    /**
     * Wraps an existing method of the target object, so that calls to it are
     * intercepted by the given wrapper function. The wrapper function receives,
     * as its first argument, the original `target` object, followed by each of
     * the arguments passed to the original method.
     *
     * @param {object} target
     *        The original target object that the wrapped method belongs to.
     * @param {function} method
     *        The method being wrapped. This is used as the target of the Proxy
     *        object which is created to wrap the method.
     * @param {function} wrapper
     *        The wrapper function which is called in place of a direct invocation
     *        of the wrapped method.
     *
     * @returns {Proxy<function>}
     *        A Proxy object for the given method, which invokes the given wrapper
     *        method in its place.
     */
    const wrapMethod = (target, method, wrapper) => {
      return new Proxy(method, {
        apply(targetMethod, thisObj, args) {
          return wrapper.call(thisObj, target, ...args);
        },
      });
    };

    let hasOwnProperty = Function.call.bind(Object.prototype.hasOwnProperty);

    /**
     * Wraps an object in a Proxy which intercepts and wraps certain methods
     * based on the given `wrappers` and `metadata` objects.
     *
     * @param {object} target
     *        The target object to wrap.
     *
     * @param {object} [wrappers = {}]
     *        An object tree containing wrapper functions for special cases. Any
     *        function present in this object tree is called in place of the
     *        method in the same location in the `target` object tree. These
     *        wrapper methods are invoked as described in {@see wrapMethod}.
     *
     * @param {object} [metadata = {}]
     *        An object tree containing metadata used to automatically generate
     *        Promise-based wrapper functions for asynchronous. Any function in
     *        the `target` object tree which has a corresponding metadata object
     *        in the same location in the `metadata` tree is replaced with an
     *        automatically-generated wrapper function, as described in
     *        {@see wrapAsyncFunction}
     *
     * @returns {Proxy<object>}
     */
    const wrapObject = (target, wrappers = {}, metadata = {}) => {
      let cache = Object.create(null);
      let handlers = {
        has(proxyTarget, prop) {
          return prop in target || prop in cache;
        },

        get(proxyTarget, prop, receiver) {
          if (prop in cache) {
            return cache[prop];
          }

          if (!(prop in target)) {
            return undefined;
          }

          let value = target[prop];

          if (typeof value === "function") {
            // This is a method on the underlying object. Check if we need to do
            // any wrapping.

            if (typeof wrappers[prop] === "function") {
              // We have a special-case wrapper for this method.
              value = wrapMethod(target, target[prop], wrappers[prop]);
            } else if (hasOwnProperty(metadata, prop)) {
              // This is an async method that we have metadata for. Create a
              // Promise wrapper for it.
              let wrapper = wrapAsyncFunction(prop, metadata[prop]);
              value = wrapMethod(target, target[prop], wrapper);
            } else {
              // This is a method that we don't know or care about. Return the
              // original method, bound to the underlying object.
              value = value.bind(target);
            }
          } else if (typeof value === "object" && value !== null &&
                     (hasOwnProperty(wrappers, prop) ||
                      hasOwnProperty(metadata, prop))) {
            // This is an object that we need to do some wrapping for the children
            // of. Create a sub-object wrapper for it with the appropriate child
            // metadata.
            value = wrapObject(value, wrappers[prop], metadata[prop]);
          } else if (hasOwnProperty(metadata, "*")) {
            // Wrap all properties in * namespace.
            value = wrapObject(value, wrappers[prop], metadata["*"]);
          } else {
            // We don't need to do any wrapping for this property,
            // so just forward all access to the underlying object.
            Object.defineProperty(cache, prop, {
              configurable: true,
              enumerable: true,
              get() {
                return target[prop];
              },
              set(value) {
                target[prop] = value;
              },
            });

            return value;
          }

          cache[prop] = value;
          return value;
        },

        set(proxyTarget, prop, value, receiver) {
          if (prop in cache) {
            cache[prop] = value;
          } else {
            target[prop] = value;
          }
          return true;
        },

        defineProperty(proxyTarget, prop, desc) {
          return Reflect.defineProperty(cache, prop, desc);
        },

        deleteProperty(proxyTarget, prop) {
          return Reflect.deleteProperty(cache, prop);
        },
      };

      // Per contract of the Proxy API, the "get" proxy handler must return the
      // original value of the target if that value is declared read-only and
      // non-configurable. For this reason, we create an object with the
      // prototype set to `target` instead of using `target` directly.
      // Otherwise we cannot return a custom object for APIs that
      // are declared read-only and non-configurable, such as `chrome.devtools`.
      //
      // The proxy handlers themselves will still use the original `target`
      // instead of the `proxyTarget`, so that the methods and properties are
      // dereferenced via the original targets.
      let proxyTarget = Object.create(target);
      return new Proxy(proxyTarget, handlers);
    };

    /**
     * Creates a set of wrapper functions for an event object, which handles
     * wrapping of listener functions that those messages are passed.
     *
     * A single wrapper is created for each listener function, and stored in a
     * map. Subsequent calls to `addListener`, `hasListener`, or `removeListener`
     * retrieve the original wrapper, so that  attempts to remove a
     * previously-added listener work as expected.
     *
     * @param {DefaultWeakMap<function, function>} wrapperMap
     *        A DefaultWeakMap object which will create the appropriate wrapper
     *        for a given listener function when one does not exist, and retrieve
     *        an existing one when it does.
     *
     * @returns {object}
     */
    const wrapEvent = wrapperMap => ({
      addListener(target, listener, ...args) {
        target.addListener(wrapperMap.get(listener), ...args);
      },

      hasListener(target, listener) {
        return target.hasListener(wrapperMap.get(listener));
      },

      removeListener(target, listener) {
        target.removeListener(wrapperMap.get(listener));
      },
    });

    const onRequestFinishedWrappers = new DefaultWeakMap(listener => {
      if (typeof listener !== "function") {
        return listener;
      }

      /**
       * Wraps an onRequestFinished listener function so that it will return a
       * `getContent()` property which returns a `Promise` rather than using a
       * callback API.
       *
       * @param {object} req
       *        The HAR entry object representing the network request.
       */
      return function onRequestFinished(req) {
        const wrappedReq = wrapObject(req, {} /* wrappers */, {
          getContent: {
            minArgs: 0,
            maxArgs: 0,
          },
        });
        listener(wrappedReq);
      };
    });

    const onMessageWrappers = new DefaultWeakMap(listener => {
      if (typeof listener !== "function") {
        return listener;
      }

      /**
       * Wraps a message listener function so that it may send responses based on
       * its return value, rather than by returning a sentinel value and calling a
       * callback. If the listener function returns a Promise, the response is
       * sent when the promise either resolves or rejects.
       *
       * @param {*} message
       *        The message sent by the other end of the channel.
       * @param {object} sender
       *        Details about the sender of the message.
       * @param {function(*)} sendResponse
       *        A callback which, when called with an arbitrary argument, sends
       *        that value as a response.
       * @returns {boolean}
       *        True if the wrapped listener returned a Promise, which will later
       *        yield a response. False otherwise.
       */
      return function onMessage(message, sender, sendResponse) {
        let didCallSendResponse = false;

        let wrappedSendResponse;
        let sendResponsePromise = new Promise(resolve => {
          wrappedSendResponse = function(response) {
            didCallSendResponse = true;
            resolve(response);
          };
        });

        let result;
        try {
          result = listener(message, sender, wrappedSendResponse);
        } catch (err) {
          result = Promise.reject(err);
        }

        const isResultThenable = result !== true && isThenable(result);

        // If the listener didn't returned true or a Promise, or called
        // wrappedSendResponse synchronously, we can exit earlier
        // because there will be no response sent from this listener.
        if (result !== true && !isResultThenable && !didCallSendResponse) {
          return false;
        }

        // A small helper to send the message if the promise resolves
        // and an error if the promise rejects (a wrapped sendMessage has
        // to translate the message into a resolved promise or a rejected
        // promise).
        const sendPromisedResult = (promise) => {
          promise.then(msg => {
            // send the message value.
            sendResponse(msg);
          }, error => {
            // Send a JSON representation of the error if the rejected value
            // is an instance of error, or the object itself otherwise.
            let message;
            if (error && (error instanceof Error ||
                typeof error.message === "string")) {
              message = error.message;
            } else {
              message = "An unexpected error occurred";
            }

            sendResponse({
              __mozWebExtensionPolyfillReject__: true,
              message,
            });
          }).catch(err => {
            // Print an error on the console if unable to send the response.
            console.error("Failed to send onMessage rejected reply", err);
          });
        };

        // If the listener returned a Promise, send the resolved value as a
        // result, otherwise wait the promise related to the wrappedSendResponse
        // callback to resolve and send it as a response.
        if (isResultThenable) {
          sendPromisedResult(result);
        } else {
          sendPromisedResult(sendResponsePromise);
        }

        // Let Chrome know that the listener is replying.
        return true;
      };
    });

    const wrappedSendMessageCallback = ({reject, resolve}, reply) => {
      if (extensionAPIs.runtime.lastError) {
        // Detect when none of the listeners replied to the sendMessage call and resolve
        // the promise to undefined as in Firefox.
        // See https://github.com/mozilla/webextension-polyfill/issues/130
        if (extensionAPIs.runtime.lastError.message === CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE || extensionAPIs.runtime.lastError.message.includes(ERROR_TO_IGNORE)) {
          resolve();
        } else {
          reject(new Error(extensionAPIs.runtime.lastError.message));
        }
      } else if (reply && reply.__mozWebExtensionPolyfillReject__) {
        // Convert back the JSON representation of the error into
        // an Error instance.
        reject(new Error(reply.message));
      } else {
        resolve(reply);
      }
    };

    const wrappedSendMessage = (name, metadata, apiNamespaceObj, ...args) => {
      if (args.length < metadata.minArgs) {
        throw new Error(`Expected at least ${metadata.minArgs} ${pluralizeArguments(metadata.minArgs)} for ${name}(), got ${args.length}`);
      }

      if (args.length > metadata.maxArgs) {
        throw new Error(`Expected at most ${metadata.maxArgs} ${pluralizeArguments(metadata.maxArgs)} for ${name}(), got ${args.length}`);
      }

      return new Promise((resolve, reject) => {
        const wrappedCb = wrappedSendMessageCallback.bind(null, {resolve, reject});
        args.push(wrappedCb);
        apiNamespaceObj.sendMessage(...args);
      });
    };

    const staticWrappers = {
      devtools: {
        network: {
          onRequestFinished: wrapEvent(onRequestFinishedWrappers),
        },
      },
      runtime: {
        onMessage: wrapEvent(onMessageWrappers),
        onMessageExternal: wrapEvent(onMessageWrappers),
        sendMessage: wrappedSendMessage.bind(null, "sendMessage", {minArgs: 1, maxArgs: 3}),
      },
      tabs: {
        sendMessage: wrappedSendMessage.bind(null, "sendMessage", {minArgs: 2, maxArgs: 3}),
      },
    };
    const settingMetadata = {
      clear: {minArgs: 1, maxArgs: 1},
      get: {minArgs: 1, maxArgs: 1},
      set: {minArgs: 1, maxArgs: 1},
    };
    apiMetadata.privacy = {
      network: {"*": settingMetadata},
      services: {"*": settingMetadata},
      websites: {"*": settingMetadata},
    };

    return wrapObject(extensionAPIs, staticWrappers, apiMetadata);
  };

  // The build process adds a UMD wrapper around this file, which makes the
  // `module` variable available.
  module.exports = wrapAPIs(chrome);
} else {
  module.exports = globalThis.browser;
}


/***/ }),

/***/ 9438:
/***/ ((module) => {

module.exports = /*#__PURE__*/JSON.parse('{"alarms":{"clear":{"minArgs":0,"maxArgs":1},"clearAll":{"minArgs":0,"maxArgs":0},"get":{"minArgs":0,"maxArgs":1},"getAll":{"minArgs":0,"maxArgs":0}},"bookmarks":{"create":{"minArgs":1,"maxArgs":1},"get":{"minArgs":1,"maxArgs":1},"getChildren":{"minArgs":1,"maxArgs":1},"getRecent":{"minArgs":1,"maxArgs":1},"getSubTree":{"minArgs":1,"maxArgs":1},"getTree":{"minArgs":0,"maxArgs":0},"move":{"minArgs":2,"maxArgs":2},"remove":{"minArgs":1,"maxArgs":1},"removeTree":{"minArgs":1,"maxArgs":1},"search":{"minArgs":1,"maxArgs":1},"update":{"minArgs":2,"maxArgs":2}},"browserAction":{"disable":{"minArgs":0,"maxArgs":1,"fallbackToNoCallback":true},"enable":{"minArgs":0,"maxArgs":1,"fallbackToNoCallback":true},"getBadgeBackgroundColor":{"minArgs":1,"maxArgs":1},"getBadgeText":{"minArgs":1,"maxArgs":1},"getPopup":{"minArgs":1,"maxArgs":1},"getTitle":{"minArgs":1,"maxArgs":1},"openPopup":{"minArgs":0,"maxArgs":0},"setBadgeBackgroundColor":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"setBadgeText":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"setIcon":{"minArgs":1,"maxArgs":1},"setPopup":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"setTitle":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true}},"browsingData":{"remove":{"minArgs":2,"maxArgs":2},"removeCache":{"minArgs":1,"maxArgs":1},"removeCookies":{"minArgs":1,"maxArgs":1},"removeDownloads":{"minArgs":1,"maxArgs":1},"removeFormData":{"minArgs":1,"maxArgs":1},"removeHistory":{"minArgs":1,"maxArgs":1},"removeLocalStorage":{"minArgs":1,"maxArgs":1},"removePasswords":{"minArgs":1,"maxArgs":1},"removePluginData":{"minArgs":1,"maxArgs":1},"settings":{"minArgs":0,"maxArgs":0}},"commands":{"getAll":{"minArgs":0,"maxArgs":0}},"contextMenus":{"remove":{"minArgs":1,"maxArgs":1},"removeAll":{"minArgs":0,"maxArgs":0},"update":{"minArgs":2,"maxArgs":2}},"cookies":{"get":{"minArgs":1,"maxArgs":1},"getAll":{"minArgs":1,"maxArgs":1},"getAllCookieStores":{"minArgs":0,"maxArgs":0},"remove":{"minArgs":1,"maxArgs":1},"set":{"minArgs":1,"maxArgs":1}},"devtools":{"inspectedWindow":{"eval":{"minArgs":1,"maxArgs":2,"singleCallbackArg":false}},"panels":{"create":{"minArgs":3,"maxArgs":3,"singleCallbackArg":true},"elements":{"createSidebarPane":{"minArgs":1,"maxArgs":1}}}},"downloads":{"cancel":{"minArgs":1,"maxArgs":1},"download":{"minArgs":1,"maxArgs":1},"erase":{"minArgs":1,"maxArgs":1},"getFileIcon":{"minArgs":1,"maxArgs":2},"open":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"pause":{"minArgs":1,"maxArgs":1},"removeFile":{"minArgs":1,"maxArgs":1},"resume":{"minArgs":1,"maxArgs":1},"search":{"minArgs":1,"maxArgs":1},"show":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true}},"extension":{"isAllowedFileSchemeAccess":{"minArgs":0,"maxArgs":0},"isAllowedIncognitoAccess":{"minArgs":0,"maxArgs":0}},"history":{"addUrl":{"minArgs":1,"maxArgs":1},"deleteAll":{"minArgs":0,"maxArgs":0},"deleteRange":{"minArgs":1,"maxArgs":1},"deleteUrl":{"minArgs":1,"maxArgs":1},"getVisits":{"minArgs":1,"maxArgs":1},"search":{"minArgs":1,"maxArgs":1}},"i18n":{"detectLanguage":{"minArgs":1,"maxArgs":1},"getAcceptLanguages":{"minArgs":0,"maxArgs":0}},"identity":{"launchWebAuthFlow":{"minArgs":1,"maxArgs":1}},"idle":{"queryState":{"minArgs":1,"maxArgs":1}},"management":{"get":{"minArgs":1,"maxArgs":1},"getAll":{"minArgs":0,"maxArgs":0},"getSelf":{"minArgs":0,"maxArgs":0},"setEnabled":{"minArgs":2,"maxArgs":2},"uninstallSelf":{"minArgs":0,"maxArgs":1}},"notifications":{"clear":{"minArgs":1,"maxArgs":1},"create":{"minArgs":1,"maxArgs":2},"getAll":{"minArgs":0,"maxArgs":0},"getPermissionLevel":{"minArgs":0,"maxArgs":0},"update":{"minArgs":2,"maxArgs":2}},"pageAction":{"getPopup":{"minArgs":1,"maxArgs":1},"getTitle":{"minArgs":1,"maxArgs":1},"hide":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"setIcon":{"minArgs":1,"maxArgs":1},"setPopup":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"setTitle":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"show":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true}},"permissions":{"contains":{"minArgs":1,"maxArgs":1},"getAll":{"minArgs":0,"maxArgs":0},"remove":{"minArgs":1,"maxArgs":1},"request":{"minArgs":1,"maxArgs":1}},"runtime":{"getBackgroundPage":{"minArgs":0,"maxArgs":0},"getPlatformInfo":{"minArgs":0,"maxArgs":0},"openOptionsPage":{"minArgs":0,"maxArgs":0},"requestUpdateCheck":{"minArgs":0,"maxArgs":0},"sendMessage":{"minArgs":1,"maxArgs":3},"sendNativeMessage":{"minArgs":2,"maxArgs":2},"setUninstallURL":{"minArgs":1,"maxArgs":1}},"sessions":{"getDevices":{"minArgs":0,"maxArgs":1},"getRecentlyClosed":{"minArgs":0,"maxArgs":1},"restore":{"minArgs":0,"maxArgs":1}},"storage":{"local":{"clear":{"minArgs":0,"maxArgs":0},"get":{"minArgs":0,"maxArgs":1},"getBytesInUse":{"minArgs":0,"maxArgs":1},"remove":{"minArgs":1,"maxArgs":1},"set":{"minArgs":1,"maxArgs":1}},"managed":{"get":{"minArgs":0,"maxArgs":1},"getBytesInUse":{"minArgs":0,"maxArgs":1}},"sync":{"clear":{"minArgs":0,"maxArgs":0},"get":{"minArgs":0,"maxArgs":1},"getBytesInUse":{"minArgs":0,"maxArgs":1},"remove":{"minArgs":1,"maxArgs":1},"set":{"minArgs":1,"maxArgs":1}}},"tabs":{"captureVisibleTab":{"minArgs":0,"maxArgs":2},"create":{"minArgs":1,"maxArgs":1},"detectLanguage":{"minArgs":0,"maxArgs":1},"discard":{"minArgs":0,"maxArgs":1},"duplicate":{"minArgs":1,"maxArgs":1},"executeScript":{"minArgs":1,"maxArgs":2},"get":{"minArgs":1,"maxArgs":1},"getCurrent":{"minArgs":0,"maxArgs":0},"getZoom":{"minArgs":0,"maxArgs":1},"getZoomSettings":{"minArgs":0,"maxArgs":1},"goBack":{"minArgs":0,"maxArgs":1},"goForward":{"minArgs":0,"maxArgs":1},"highlight":{"minArgs":1,"maxArgs":1},"insertCSS":{"minArgs":1,"maxArgs":2},"move":{"minArgs":2,"maxArgs":2},"query":{"minArgs":1,"maxArgs":1},"reload":{"minArgs":0,"maxArgs":2},"remove":{"minArgs":1,"maxArgs":1},"removeCSS":{"minArgs":1,"maxArgs":2},"sendMessage":{"minArgs":2,"maxArgs":3},"setZoom":{"minArgs":1,"maxArgs":2},"setZoomSettings":{"minArgs":1,"maxArgs":2},"update":{"minArgs":1,"maxArgs":2}},"topSites":{"get":{"minArgs":0,"maxArgs":0}},"webNavigation":{"getAllFrames":{"minArgs":1,"maxArgs":1},"getFrame":{"minArgs":1,"maxArgs":1}},"webRequest":{"handlerBehaviorChanged":{"minArgs":0,"maxArgs":0}},"windows":{"create":{"minArgs":0,"maxArgs":1},"get":{"minArgs":1,"maxArgs":2},"getAll":{"minArgs":0,"maxArgs":1},"getCurrent":{"minArgs":0,"maxArgs":1},"getLastFocused":{"minArgs":0,"maxArgs":1},"remove":{"minArgs":1,"maxArgs":1},"update":{"minArgs":2,"maxArgs":2}}}');

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nested_webpack_require_29608__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __nested_webpack_require_29608__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__nested_webpack_require_29608__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__nested_webpack_require_29608__.o(definition, key) && !__nested_webpack_require_29608__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__nested_webpack_require_29608__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__nested_webpack_require_29608__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __nested_webpack_exports__ = {};
// ESM COMPAT FLAG
__nested_webpack_require_29608__.r(__nested_webpack_exports__);

// EXPORTS
__nested_webpack_require_29608__.d(__nested_webpack_exports__, {
  account: () => (/* reexport */ account),
  experiments: () => (/* reexport */ experiments),
  sentry: () => (/* reexport */ sentry),
  telemetry: () => (/* reexport */ telemetry)
});

// EXTERNAL MODULE: ../../vendor/webextension-polyfill/src/browser-polyfill.js
var browser_polyfill = __nested_webpack_require_29608__(7795);
;// ./src/all/errors.js
/*
 * This file is part of eyeo's Web Extension Ad Blocking Toolkit (EWE),
 * Copyright (C) 2006-present eyeo GmbH
 *
 * EWE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * EWE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EWE.  If not, see <http://www.gnu.org/licenses/>.
 */

const ERROR_NO_CONNECTION = "Could not establish connection. " +
      "Receiving end does not exist.";
const ERROR_CLOSED_CONNECTION = "A listener indicated an asynchronous " +
      "response by returning true, but the message channel closed before a " +
      "response was received";
// https://bugzilla.mozilla.org/show_bug.cgi?id=1578697
const ERROR_MANAGER_DISCONNECTED = "Message manager disconnected";

/**
 * Reconstructs an error from a serializable error object
 *
 * @param {Object} errorData - Error object
 *
 * @returns {Error} error
 */
function fromSerializableError(errorData) {
  const error = new Error(errorData.message);
  error.cause = errorData.cause;
  error.name = errorData.name;
  error.stack = errorData.stack;

  return error;
}

/**
 * Filters out `browser.runtime.sendMessage` errors to do with the receiving end
 * no longer existing.
 *
 * @param {Promise} promise The promise that should have "no connection" errors
 *   ignored. Generally this would be the promise returned by
 *   `browser.runtime.sendMessage`.
 * @return {Promise} The same promise, but will resolve with `undefined` instead
 *   of rejecting if the receiving end no longer exists.
 */
function ignoreNoConnectionError(promise) {
  return promise.catch(error => {
    if (typeof error == "object" &&
        (error.message == ERROR_NO_CONNECTION ||
         error.message == ERROR_CLOSED_CONNECTION ||
         error.message == ERROR_MANAGER_DISCONNECTED)) {
      return;
    }

    throw error;
  });
}

/**
 * Creates serializable error object from given error
 *
 * @param {Error} error - Error
 *
 * @returns {Object} serializable error object
 */
function toSerializableError(error) {
  return {
    cause: error.cause instanceof Error ?
      toSerializableError(error.cause) :
      error.cause,
    message: error.message,
    name: error.name,
    stack: error.stack
  };
}

;// ./src/ui/sentry.js
/*
 * This file is part of eyeo's Web Extension Ad Blocking Toolkit (EWE),
 * Copyright (C) 2006-present eyeo GmbH
 *
 * EWE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * EWE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EWE.  If not, see <http://www.gnu.org/licenses/>.
 */





async function forwardError(error) {
  ignoreNoConnectionError(
    browser_polyfill.runtime.sendMessage({
      type: "ewe:sentry-error",
      error: toSerializableError(error)
    })
  );
}

/**
 * API to interact with the sentry module
 * @namespace sentry
 */
/* harmony default export */ const sentry = ({
  /**
   * Report error to Sentry
   *
   * @param {Error} error - Error to send to Sentry.
   */
  async reportError(error) {
    return await forwardError(error);
  },

  /**
   * Initialize and start Sentry
   */
  start() {
    self.addEventListener("error", event => {
      const {error} = event;
      if (!(error instanceof Error)) {
        return;
      }

      forwardError(error);
    });

    self.addEventListener("unhandledrejection", event => {
      const {reason} = event;
      if (!(reason instanceof Error)) {
        return;
      }

      forwardError(reason);
    });
  }
});

;// ./src/front/account.js
/*
 * This file is part of eyeo's Web Extension Ad Blocking Toolkit (EWE),
 * Copyright (C) 2006-present eyeo GmbH
 *
 * EWE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * EWE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EWE.  If not, see <http://www.gnu.org/licenses/>.
 */




/**
 * Sends a message to the service worker to call the user account API.
 * @param {string} methodName the method to call on the account API
 * @param {any[]} params the parameters to pass to the method
 * @returns {Promise<*>} the result of the API call.
 */
async function callAPI(methodName, ...params) {
  return await ignoreNoConnectionError(
    browser_polyfill.runtime.sendMessage({
      type: "ewe:api-call",
      apiName: "account",
      methodName,
      params
    })
  );
}

/**
 * API to interact with the user account module
 * @namespace account
 */
/* harmony default export */ const account = ({
  /**
   * Retrieves the user's profile information.
   * @ignore
   * @returns {Promise<UserProfile|null>}
   */
  async getProfile() {
    return await callAPI("getProfile");
  },

  /**
   * Checks if the user has an active premium subscription.
   *
   * @returns {Promise<boolean>} - True if the user has a premium subscription,
   *   false otherwise.
   */
  async hasPremium() {
    return await callAPI("hasPremium");
  },

  /**
   * Retrieves the user's trial status.
   *
   * @returns {Promise<boolean>} True if the user is on trial, false otherwise.
   */
  async isTrial() {
    return await callAPI("isTrial");
  },

  /**
   * Retrieves the user's preferences.
   *
   * @returns {Promise<Record<string, boolean>>} An object containing user
   *   preferences.
   */
  async getPreferences() {
    return await callAPI("getPreferences");
  },

  /**
   * Retrieves the user's trial days left.
   *
   * @returns {Promise<{ab: number, abp: number}>} An object containing trial
   *   days left for each product.
   */
  async getTrialDaysLeft() {
    return await callAPI("getTrialDaysLeft");
  }
});

;// ./src/front/experiments.js
/*
 * This file is part of eyeo's Web Extension Ad Blocking Toolkit (EWE),
 * Copyright (C) 2006-present eyeo GmbH
 *
 * EWE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * EWE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EWE.  If not, see <http://www.gnu.org/licenses/>.
 */




/**
 * Sends a message to the service worker to call the experiments API.
 * @param {string} methodName the method to call on the experiments API
 * @param {any[]} params the parameters to pass to the method
 * @returns {Promise<*>} the result of the API call.
 */
async function experiments_callAPI(methodName, ...params) {
  return await ignoreNoConnectionError(
    browser_polyfill.runtime.sendMessage({
      type: "ewe:api-call",
      apiName: "experiments",
      methodName,
      params
    })
  );
}

/**
 * API to interact with the experiments module
 * @namespace experiments
 */
/* harmony default export */ const experiments = ({
  /**
   * Retrieves the value of a feature flag
   * @ignore
   * @param {string} flagId - Identifier of the feature flag
   * @returns {Promise<*|null>} Value of the feature flag or null if not found
   */
  async getFlag(flagId) {
    return await experiments_callAPI("getFlag", flagId);
  },

  /**
   * Retrieves all the available experiment flags
   * @ignore
   * @returns {Promise<*|null>} Value of the feature flag or null if not found
   */
  async getFlags() {
    return await experiments_callAPI("getFlags");
  },

  /**
   * Retrieves all the experiment assignments
   * @ignore
   * @returns {Promise<Object.<string, string>>} Object specifying the assigned
   *   variant ID for each active assigned experiment ID
   */
  async getAssignments() {
    return await experiments_callAPI("getAssignments");
  }
});

;// ./events.js
/* harmony default export */ const events = ({
  adblock_ui: {
    options_clicked: {
      description: "User clicked the gear icon"
    },
    support_icon_clicked: {
      description: "User clicked the support icon on the header of the Adblock popup"
    },
    opt_out_acceptable_ads_clicked: {
      description: "The user clicked the opt-out link to disable Acceptable Ads on the getadblock.com installed page"
    },
    cm_pause_on_site: {
      description: "User right clicked on the page to open the context menu and selected 'Pause on this site' from the AdBlock section."
    },
    cm_pause_on_all_sites: {
      description: "User right clicked on the page to open the context menu and selected 'Pause on all sites' from the AdBlock section."
    },
    cm_resume_adblock: {
      description: "User right clicked on the page to open the context menu and selected 'Resume blocking ads' from the AdBlock section."
    },
    pause_on_site: {
      description: "User clicked 'Pause on this site' on the Adblock popup"
    },
    resume_adblock: {
      description: "User clicked 'Resume Ad blocking' on the Adblock popup"
    },
    popup_opened: {
      description: "User clicked the AdBlock toolbar icon to open the popup menu",
      data: {
        description: "Data about the popup opened event",
        type: "object",
        properties: {
          isBadgeTextNew: {
            description: "The 'new' badge is shown on the popup icon",
            type: "boolean"
          },
          reason: {
            description: "The reason why the 'new' badge was shown",
            type: "string"
          }
        }
      }
    },
    hide_on_this_page_clicked: {
      description: "User clicked on the three dots in the popup menu, then clicked the 'Hide something on this page' link"
    },
    titletext_clicked: {
      description: "User clicked the AdBlock logo in the popup menu header"
    },
    more_pause_options_clicked: {
      description: "User clicked on the three dots in the popup menu, then clicked 'More pause options' link"
    },
    help_flow_results: {
      description: "Emitted when a user completes the help flow in the popup. The flow presents different options based on the user's issue (e.g., ads not blocked, site broken, etc.), and the emitted event includes the path representing the sequence of choices the user made",
      data: {
        description: "Data about the help flow results",
        type: "object",
        properties: {
          helpFlowPath: {
            description: "The path of the help flow (e.g. 'start,seeAd,seeAdEverywhere,link')",
            type: "string"
          }
        }
      }
    },
    premium_options_clicked: {
      description: "Triggered when a premium user clicks the 'Premium' label in the popup header which is shown next to the Adblock logo. The label is only visible to premium users and opens the Premium tab in the settings page"
    },
    popup_sub_clicked_cookies_premium: {
      description: "Triggered when a premium user clicks the toggle to enable the Premium Cookie Blocking filter list in the popup. The list is not enabled automatically when upgrading to premium"
    },
    popup_sub_clicked_distraction_control: {
      description: "Triggered when a premium user clicks the toggle to enable the Premium Block Distractions filter list in the popup. The list is not enabled automatically when upgrading to premium"
    },
    skip_cookie_walls_learn_more_clicked: {
      description: "A free user clicked the Learn More button on the 'Skip Cookie Walls' section in the AdBlock popup"
    },
    block_distractions_learn_more_clicked: {
      description: "A free user clicked the Learn More button on the 'Block Distractions' section in the AdBlock popup"
    },
    options_page_tab_premium_cta: {
      description: "User interacted with a premium CTA on a premium tab in the options page",
      data: {
        description: "Data about which tab the user was viewing",
        type: "object",
        properties: {
          tab: {
            description: "The name of the tab being viewed when the CTA was clicked",
            type: "string",
            enum: ["premium", "themes", "image_swap", "premium_filters"]
          },
          action: {
            description: "Type of interaction with the Premium CTA",
            type: "string",
            enum: ["clicked"]
          }
        }
      }
    },
    options_page_tab: {
      description: "User clicked or opened a tab on the options page side bar",
      data: {
        description: "Data about the user interaction with the options page tab",
        type: "object",
        properties: {
          tab: {
            description: "The tab that the user interacted with",
            type: "string",
            enum: ["stats", "general", "filter_lists", "customize", "support", "premium", "themes", "image_swap", "premium_filters"]
          },
          action: {
            description: "Type of interaction with the options page tab",
            type: "string",
            enum: ["opened", "clicked"]
          }
        }
      }
    },
    vpn_cta: {
      description: "User interacted with AdBlock VPN promotional banner in the popup menu. This CTA promotes the VPN with 'Introducing AdBlock VPN' message",
      data: {
        description: "Data about the user interaction with the AdBlock VPN promotional banner",
        type: "object",
        properties: {
          action: {
            description: "Type of interaction with the AdBlock VPN promotional banner",
            type: "string",
            enum: ["seen", "clicked", "closed"]
          }
        }
      }
    },
    premium_themes_cta: {
      description: "User interacted with themes customization CTA in the popup menu, opening the themes section in options page",
      data: {
        description: "Information about the theme that was being promoted when clicked",
        type: "object",
        properties: {
          theme: {
            description: "The name of the theme being showcased when the user clicked",
            type: "string",
            enum: ["solarized", "solarized_light", "watermelon", "sunshine", "ocean"]
          },
          action: {
            description: "Type of interaction with the themes customization CTA",
            type: "string",
            enum: ["seen", "clicked", "closed"]
          }
        }
      }
    },
    free_dc_cta: {
      description: "User interacted with Distraction Control promotional banner in the popup menu. This CTA promotes the premium Distraction Control feature with 'Block Floating Videos' message",
      data: {
        description: "Data about the user interaction with the Distraction Control promotional banner",
        type: "object",
        properties: {
          action: {
            description: "Type of interaction with the Distraction Control promotional banner",
            type: "string",
            enum: ["seen", "clicked", "closed"]
          }
        }
      }
    },
    premium_dc_cta: {
      description: "Premium user interacted with the enhanced Distraction Control CTA in the popup menu. This CTA highlights 'New Premium feature available!' to promote advanced distraction blocking options",
      data: {
        description: "Data about the user interaction with the Distraction Control CTA",
        type: "object",
        properties: {
          action: {
            description: "Type of interaction with the Distraction Control CTA",
            type: "string",
            enum: ["seen", "clicked", "closed"]
          }
        }
      }
    },
    premium_upsell_cta: {
      description: "User interacted with Premium upsell upgrade banner in the popup menu. This CTA displays 'Upgrade your AdBlock' message to encourage premium subscription",
      data: {
        description: "Data about the user interaction with the Premium upsell upgrade banner",
        type: "object",
        properties: {
          action: {
            description: "Type of interaction with the Premium upsell upgrade banner",
            type: "string",
            enum: ["seen", "clicked", "closed"]
          }
        }
      }
    },
    premium_filter_list_cta: {
      description: "User interacted with Premium filter list banner in the popup menu. This CTA displays 'Upgrade your AdBlock' message to encourage premium subscription",
      data: {
        description: "Data about the user interaction with the premium filter list CTA",
        type: "object",
        properties: {
          action: {
            description: "Type of interaction with the premium filter list CTA",
            type: "string",
            enum: ["seen", "clicked"]
          }
        }
      }
    },
    data_collection_opt_out: {
      description: "User opted out of data collection in the options page"
    }
  },
  extensions_ui: {
    acceptable_ads_toggled: {
      description: "User toggled the Acceptable Ads checkbox on the extension options page. This is a shared event fired by both AB and ABP.",
      data: {
        description: "Data about the acceptable ads toggle interaction",
        type: "object",
        properties: {
          action: {
            description: "Whether the user opted in or out of acceptable ads",
            type: "string",
            enum: ["opted_in", "opted_out"]
          },
          source: {
            description: "Where the toggle occurred. This could be from the general or filter lists options tabs.",
            type: "string",
            enum: ["options_general", "options_filter_list"]
          }
        }
      }
    }
  },
  adblockplus_ui: {
    issue_report_submitted: {
      description: "Issue report was submitted"
    }
  },
  smart_allowlisting: {
    allowlisting_expired: {
      description: "An allowlisting filter expired automatically",
      data: {
        description: "Details about the filter at the time of expiration.",
        type: "object",
        properties: {
          allowlistExtendDuration: {
            description: "The number of milliseconds to extend the allowlisting filter's expiry when the user navigated to a URL that matches the filter.",
            type: "number"
          }
        }
      }
    },
    allowlisting_renewed: {
      description: "An allowlisting filter was renewed automatically",
      data: {
        description: "Details about the filter at the time of renewal.",
        type: "object",
        properties: {
          allowlistExtendDuration: {
            description: "The number of milliseconds to extend the allowlisting filter's expiry when the user navigated to a URL that matches the filter.",
            type: "number"
          }
        }
      }
    }
  },
  cdp: {
    built_cdp_payload: {
      description: "A payload has been built with the intention of sending it to CDP. This is debug information, and will temporarily include the eventStats until the CDP server is ready to ingest them.",
      data: {
        description: "Data about the built payload",
        type: "object",
        properties: {
          eventStats: {
            description: "Counts of behavior event logs since the last payload.",
            type: "any"
          },
          uncompressedPayloadSize: {
            description: "Size in bytes of the uncompressed and unencrypted payload.",
            type: "integer"
          }
        }
      }
    }
  },
  detection_snippets: {
    snippet_detection_event: {
      description: "Recorded when a snippet detects a condition on a page (e.g. wall detection). Each detection snippet calls this event from a single location with a unique type value. Other snippet concerns (blocking, breakage) should register separate events. Data is reliable from 2026-04-29 onwards; data before this date may have schema mismatches due to ongoing pipeline development.",
      data: {
        description: "Metadata about the detected condition",
        type: "object",
        properties: {
          type: {
            description: "Detection type identifier passed from the snippet filter, e.g. 'wall_detected'. Each snippet can have multiple types within a distinct type group for traceability.",
            type: "string"
          },
          domain: {
            description: "Domain where the condition was detected, e.g. 'example.com'",
            type: "string"
          },
          specifier: {
            description: "Optional additional context for filtering in BigQuery, e.g. the CSS selector that matched ('.overlay-wall-container') or a filter list identifier",
            type: ["string", "null"]
          }
        }
      }
    }
  },
  hit_snippets: {
    snippet_hit_event: {
      description: "Recorded when a snippet successfully executes on a page.",
      data: {
        description: "Metadata about the snippet execution",
        type: "object",
        properties: {
          filter: {
            description: "Snippet filter body, e.g. 'json-prune ads userId'",
            type: "string"
          },
          domain: {
            description: "Domain where the snippet fired (document.location.hostname of the frame)",
            type: "string"
          },
          topLevelDomain: {
            description: "Top-level page domain. Equals domain for main-frame snippets; differs for cross-origin iframe snippets.",
            type: "string"
          }
        }
      }
    }
  },
  snippets: {
    context_tampering: {
      description: "Recorded when the website is trying to disable the snippets"
    },
    local_storage_unavailable: {
      description: "The extension intended to use localStorage as a cache, but localStorage was unavailable",
      data: {
        description: "Metadata about the context where localStorage was unavailable",
        type: "object",
        properties: {
          isMainFrame: {
            description: "This occurred in the main frame, not in an iframe",
            type: "boolean"
          }
        }
      }
    },
    zero_delay_cleanup: {
      description: "Recorded when we cleaned up zero-delay storage key from previous extension versions.",
      data: {
        description: "Metadata about the cleanup operation",
        type: "object",
        properties: {
          key: {
            description: "The storage key that was cleaned up",
            type: "string"
          }
        }
      }
    },
    snippet_detection_domainless: {
      description: "Domain omitted intentionally to support user-level retention signals without per-domain identification. Introduced on 2026-04-29; no data exists before this date.",
      data: {
        description: "Metadata about the detected condition",
        type: "object",
        properties: {
          type: {
            description: "Detection type identifier passed from the snippet filter, e.g. 'wall_detected'.",
            type: "string"
          },
          specifier: {
            description: "Extra context from the detection snippet, e.g. a matched CSS selector or filter rule identifier. null when no specifier is available.",
            type: ["string", "null"]
          }
        }
      }
    }
  },
  youtube: {
    yt_site_navigation: {
      description: "Recorded 5 seconds after a user navigates to a YouTube page. This event is sent only once per session. Refreshing or opening a new tab will start a new session. Navigating through videos without refreshing (aka SPA navigation) will not trigger another event.",
      data: {
        description: "Data about the YouTube navigation event",
        type: "object",
        properties: {
          userLoggedIn: {
            description: "Indicates whether the user is logged in to a YouTube account. '1' for logged in, '0' for not logged in.",
            type: "string",
            enum: ["1", "0"]
          }
        }
      }
    },
    yt_site_ad_shown: {
      description: "Recorded when a video ad on YouTube stops playing, either because it was skipped, the user navigated away, or it finished playing",
      data: {
        description: "Data for the YouTube ad shown event",
        type: "object",
        properties: {
          isAllowListed: {
            description: "Indicates whether the page is allowlisted. '1' for allowlisted, '0' for not allowlisted.",
            type: "string",
            enum: ["1", "0"]
          },
          isPremium: {
            description: "Specifies whether the user has a Premium subscription. Used to be called 'p' in getadblock.logs_unified.logs_fact",
            type: "boolean"
          },
          adFormat: {
            description: "Format ID of the displayed ad. Used to be called 'category' in getadblock.logs_unified.logs_fact",
            type: "string"
          },
          totalAdDurationMs: {
            description: "Total duration of the ad, in milliseconds. Used to be called 'bc' in getadblock.logs_unified.logs_fact",
            type: "number"
          },
          adShownDurationMs: {
            description: "Actual playback duration of the ad, in milliseconds. Used to be called 'amount' in getadblock.logs_unified.logs_fact",
            type: "number"
          }
        }
      }
    },
    yt_site_ad_wall_detected: {
      description: "Recorded when the YouTube ad wall is detected and the page is not yet allowlisted.",
      data: {
        description: "Data for YouTube ad wall detection when the page is not yet allowlisted",
        type: "object",
        properties: {
          adwallCategory: {
            description: "The ad wall type: 'soft' (dismiss button) or 'hard' (no dismiss button).",
            type: "string",
            enum: ["soft", "hard"]
          },
          userLoggedIn: {
            description: "String flag indicating whether the user is logged in to a YouTube account ('1' if logged in, otherwise '0').",
            type: "string",
            enum: ["1", "0"]
          },
          isAllowListed: {
            description: "String flag indicating whether the page is allowlisted ('1' if allowlisted, otherwise '0'). Should always be '0' for this event.",
            type: "string",
            enum: ["1", "0"]
          },
          allowlistScope: {
            description: "Scope of the applied allowlist rule: 'video' (single video url) or 'tab' (all videos until the tab is closed).",
            type: "string",
            enum: ["video", "tab"]
          }
        }
      }
    },
    yt_site_already_allowlisted: {
      description: "Recorded when the YouTube ad wall is detected, but the page was already allowlisted.",
      data: {
        description: "Data for YouTube ad wall detection when the page is already allowlisted",
        type: "object",
        properties: {
          adwallCategory: {
            description: "The ad wall type: 'soft' (dismiss button) or 'hard' (no dismiss button).",
            type: "string",
            enum: ["soft", "hard"]
          },
          userLoggedIn: {
            description: "String flag indicating whether the user is logged in to a YouTube account ('1' if logged in, otherwise '0').",
            type: "string",
            enum: ["1", "0"]
          },
          isAllowListed: {
            description: "String flag indicating whether the page is allowlisted ('1' if allowlisted, otherwise '0'). Should always be '1' for this event.",
            type: "string",
            enum: ["1", "0"]
          },
          allowlistScope: {
            description: "Scope of the applied allowlist rule: 'video' (single video url) or 'tab' (all videos until the tab is closed).",
            type: "string",
            enum: ["video", "tab"]
          }
        }
      }
    },
    yt_auto_allowlisted: {
      description: "Recorded immediately after the extension automatically allowlists a YouTube page in response to an ad wall.",
      data: {
        description: "Data for the YouTube auto allowlisted event",
        type: "object",
        properties: {
          allowlistScope: {
            description: "Scope of the applied allowlist rule: 'video' (single video url) or 'tab' (all videos until the tab is closed).",
            type: "string",
            enum: ["video", "tab"]
          }
        }
      }
    },
    yt_site_toast_shown: {
      description: "Recorded when the YouTube 'ad blocker' toast notification appears in the DOM. This is an experiment ran by YouTube that only appears for certain adblocking users, warning them that their adblocker might be causing interruptions.",
      data: {
        description: "Data for the YouTube toast shown event",
        type: "object",
        properties: {
          isAllowListed: {
            description: "String flag indicating whether the page is allowlisted ('1' if allowlisted, otherwise '0').",
            type: "string",
            enum: ["1", "0"]
          },
          isPremium: {
            description: "Specifies whether the user has a Premium subscription",
            type: "boolean"
          }
        }
      }
    },
    yt_site_context_tampering: {
      description: "Recorded when the YouTube error_204 beacon indicates a possible script conflict that could interfere with the extension.",
      data: {
        description: "Data for the YouTube context tampering event",
        type: "object",
        properties: {
          isAllowListed: {
            description: "String flag indicating whether the page is allowlisted ('1' if allowlisted, otherwise '0').",
            type: "string",
            enum: ["1", "0"]
          },
          isPremium: {
            description: "Specifies whether the user has a Premium subscription",
            type: "boolean"
          },
          applicationVersion: {
            description: "YouTube client version from the client.version query param on the error_204 request.",
            type: "string"
          }
        }
      }
    },
    yt_site_yt_error: {
      description: "This event is triggered in the event of an error on YouTube. There could be multiple types of errors happening on the page, so we try to differentiate them via the category parameter.",
      data: {
        description: "Data for the YouTube error event",
        type: "object",
        properties: {
          category: {
            description: "Indicates the error type as defined in our extension code. It can be one of the following: 'uncaught_exception', 'player_error' or 'sww_error'.",
            type: "string",
            enum: ["uncaught_exception", "player_error", "sww_error"]
          },
          applicationVersion: {
            description: "The client version of the YouTube application (e.g., '2.20251020.01.00').",
            type: "string"
          },
          error: {
            description: "Indicates the exception type of JavaScript error, captured by the YouTube error handler (e.g., 'TypeError').",
            type: "string"
          },
          errorMsg: {
            description: "Either the stack trace of the error or an empty string.",
            type: "string"
          },
          isAllowListed: {
            description: "String flag indicating whether the site is allowlisted ('1' if allowlisted, otherwise '0').",
            type: "string",
            enum: ["1", "0"]
          },
          isPremium: {
            description: "Specifies whether the user has a Premium subscription.",
            type: "boolean"
          }
        }
      }
    }
  },
  conflict_detection: {
    bt_loader_blocked: {
      description: "Recorded on every website when the script from Blockthrough fails to load. BTLoader initiates ad recovery for users who allow Acceptable Ads, enabling monetization. This event indicates the script was blocked, which can happen when the user has disabled Acceptable Ads, installed another ad blocker that blocks BTLoader, or allowlisted the page. When BTLoader is blocked, ad recovery cannot occur and monetization is lost.",
      data: {
        description: "Data about why BTLoader was blocked",
        type: "object",
        properties: {
          isPageAllowlisted: {
            description: "Whether the page is allowlisted",
            type: "boolean"
          },
          aaListsStatus: {
            description: "The status of the Acceptable Ads lists. 0: none, 1: AA, 2: AA Privacy, 3: both",
            type: "number"
          },
          errorMsg: {
            description: "Browser string indicating the error that occurred",
            type: "string"
          }
        }
      }
    },
    bt_loader_success: {
      description: "Recorded on every website when the script from Blockthrough successfully loads. BTLoader initiates ad recovery for users who allow Acceptable Ads, enabling monetization. This event confirms that ad recovery can proceed normally on this page.",
      data: {
        description: "Data about the BTLoader success event",
        type: "object",
        properties: {
          isPageAllowlisted: {
            description: "Whether the page is allowlisted",
            type: "boolean"
          },
          aaListsStatus: {
            description: "The status of the Acceptable Ads lists. 0: none, 1: AA, 2: AA Privacy, 3: both",
            type: "number"
          }
        }
      }
    },
    aa_bait1_blocked: {
      description: "Acceptable Ads bait 1 was blocked",
      data: {
        description: "Data about why Acceptable Ads bait 1 was blocked",
        type: "object",
        properties: {
          isPageAllowlisted: {
            description: "Whether the page is allowlisted",
            type: "boolean"
          },
          aaListsStatus: {
            description: "The status of the Acceptable Ads lists. 0: none, 1: AA, 2: AA Privacy, 3: both",
            type: "number"
          },
          errorMsg: {
            description: "Browser string indicating the error that occurred",
            type: "string"
          }
        }
      }
    },
    aa_bait1_success: {
      description: "Acceptable Ads bait 1 was successfully loaded",
      data: {
        description: "Data about the Acceptable Ads bait 1 success event",
        type: "object",
        properties: {
          isPageAllowlisted: {
            description: "Whether the page is allowlisted",
            type: "boolean"
          },
          aaListsStatus: {
            description: "The status of the Acceptable Ads lists. 0: none, 1: AA, 2: AA Privacy, 3: both",
            type: "number"
          }
        }
      }
    },
    aa_bait2_blocked: {
      description: "Acceptable Ads bait 2 was blocked",
      data: {
        description: "Data about why Acceptable Ads bait 2 was blocked",
        type: "object",
        properties: {
          isPageAllowlisted: {
            description: "Whether the page is allowlisted",
            type: "boolean"
          },
          aaListsStatus: {
            description: "The status of the Acceptable Ads lists. 0: none, 1: AA, 2: AA Privacy, 3: both",
            type: "number"
          },
          errorMsg: {
            description: "Browser string indicating the error that occurred",
            type: "string"
          }
        }
      }
    },
    aa_bait2_success: {
      description: "Acceptable Ads bait 2 was successfully loaded",
      data: {
        description: "Data about the Acceptable Ads bait 2 success event",
        type: "object",
        properties: {
          isPageAllowlisted: {
            description: "Whether the page is allowlisted",
            type: "boolean"
          },
          aaListsStatus: {
            description: "The status of the Acceptable Ads lists. 0: none, 1: AA, 2: AA Privacy, 3: both",
            type: "number"
          }
        }
      }
    },
    aa_other_blocked: {
      description: "Acceptable Ads filters on Amazon, Yahoo, LinkedIn, Outlook were blocked",
      data: {
        description: "Data about why Acceptable Ads filters were blocked",
        type: "object",
        properties: {
          isPageAllowlisted: {
            description: "Whether the page is allowlisted",
            type: "boolean"
          },
          aaListsStatus: {
            description: "The status of the Acceptable Ads lists. 0: none, 1: AA, 2: AA Privacy, 3: both",
            type: "number"
          },
          errorMsg: {
            description: "Browser string indicating the error that occurred",
            type: "string"
          }
        }
      }
    },
    aa_other_success: {
      description: "Acceptable Ads filters on Amazon, Yahoo, LinkedIn, Outlook were successfully loaded",
      data: {
        description: "Data about the Acceptable Ads filters success event",
        type: "object",
        properties: {
          isPageAllowlisted: {
            description: "Whether the page is allowlisted",
            type: "boolean"
          },
          aaListsStatus: {
            description: "The status of the Acceptable Ads lists. 0: none, 1: AA, 2: AA Privacy, 3: both",
            type: "number"
          }
        }
      }
    }
  },
  cohorts: {
    facts_snapshot: {
      description: "Cohorts facts snapshot used for cohort estimation",
      data: {
        description: "The updated facts",
        type: "object",
        properties: {
          extName: {
            description: "The name of the extension",
            type: "string"
          },
          extVersion: {
            description: "The version of the extension",
            type: "string"
          },
          browserName: {
            description: "The name of the browser",
            type: "string"
          },
          browserLanguage: {
            description: "The language of the browser",
            type: "string"
          },
          countryCode: {
            description: "The 2-letter country code of the user",
            type: "string"
          },
          aaEnabled: {
            description: "Whether Acceptable Ads is enabled",
            type: "boolean"
          },
          installType: {
            description: "The installation type of the extension",
            type: "string"
          },
          hasPremium: {
            description: "Whether the user has a premium subscription",
            type: "boolean"
          },
          installDate: {
            description: "The timestamp when the extension was installed",
            type: "number"
          },
          blockedCount: {
            description: "The number of blocked requests",
            type: "number"
          }
        }
      }
    }
  },
  dnr_filters: {
    recreated_dnr_rules: {
      description: "On extension upgrade, our DNR filter management module will compare the dynamic DNR rules that the browser has with the filters that we know about. If these do not match, we recreate the DNR rules and log this report.",
      data: {
        description: "Report on the before and after state of the recreation",
        type: "object",
        properties: {
          recreateStats: {
            description: "Stats on how many DNR rules were recreated",
            type: "object",
            properties: {
              recreatedRulesCount: {
                description: "How many DNR rules were recreated",
                type: "integer"
              },
              removedRulesCount: {
                description: "How many existing DNR rules were removed",
                type: "integer"
              }
            }
          },
          checkResultBefore: {
            description: "Results of the data integrity check done before recreating the DNR rules.",
            type: "object",
            properties: {
              valid: {
                description: "True if the data integrity check passed. We only do the recreation if it failed, so this would be expected to always be false.",
                type: "boolean"
              },
              extraRulesInDNRCount: {
                description: "Count of the number of active dynamic DNR rules which we do not expect to see",
                type: "integer"
              },
              missingRulesInDNRCount: {
                description: "Count of the number of rules that our filters expected to exist but didn't",
                type: "integer"
              }
            }
          },
          checkResultAfter: {
            description: "Results of the data integrity check done after recreating the DNR rules.",
            type: "object",
            properties: {
              valid: {
                description: "True if the data integrity check passed. We expect this to be true after the rule recreation has run.",
                type: "boolean"
              },
              extraRulesInDNRCount: {
                description: "Count of the number of active dynamic DNR rules which we do not expect to see. We expect this to be 0 after the rule recreation has run.",
                type: "integer"
              },
              missingRulesInDNRCount: {
                description: "Count of the number of rules that our filters expected to exist but didn't. We expect this to be 0 after the rule recreation has run.",
                type: "integer"
              }
            }
          }
        }
      }
    },
    exceeded_static_rule_count_limit: {
      description: "Debug log when someone runs into the 'set of enabled rulesets exceeds the rule count limit' error when enabling static rulesets",
      data: {
        description: "Data on the current state of static rules and the rulesets being enabled or disabled. Rule counts refer to static DNR rules, bundled in the extension at build time in rulesets.",
        type: "object",
        properties: {
          enableRulesetIds: {
            description: "Ruleset IDs that were to be enabled",
            type: "array",
            items: {
              type: "string"
            }
          },
          enableRuleCount: {
            description: "Static rules that we are trying to enable",
            type: "integer"
          },
          disableRulesetIds: {
            description: "Ruleset IDs that were to be disabled",
            type: "array",
            items: {
              type: "string"
            }
          },
          disableRuleCount: {
            description: "Static rules that we are trying to disable",
            type: "integer"
          },
          currentEnabledRulesetIdsBefore: {
            description: "Currently enabled ruleset IDs, gathered before calling updateEnabledRulesets",
            type: "array",
            items: {
              type: "string"
            }
          },
          currentEnabledRulesetIdsAfter: {
            description: "Currently enabled ruleset IDs, gathered after calling updateEnabledRulesets",
            type: "array",
            items: {
              type: "string"
            }
          },
          currentEnabledRuleCountBefore: {
            description: "Used static rules, gathered before calling updateEnabledRulesets",
            type: "integer"
          },
          currentEnabledRuleCountAfter: {
            description: "Used static rules, gathered after calling updateEnabledRulesets",
            type: "integer"
          },
          availableRuleCountBefore: {
            description: "Available static rules, gathered before calling updateEnabledRulesets",
            type: "integer"
          },
          availableRuleCountAfter: {
            description: "Available static rules, gathered after calling updateEnabledRulesets",
            type: "integer"
          }
        }
      }
    }
  },
  in_product_messaging: {
    command_received: {
      description: "Extension received a valid IPM command from the remote config",
      data: {
        description: "IPM command ID",
        type: "string"
      }
    }
  },
  startup: {
    startup_error: {
      description: "Errors recorded during the initialization of the extension",
      data: {
        description: "Data about the initializion error",
        type: "object",
        properties: {
          errorMsg: {
            description: "The error message that was recorded",
            type: "string"
          },
          hasInternalError: {
            description: "Whether or not the error string matched 'internal error' which indicates that it is a browser error",
            type: "boolean"
          },
          timings: {
            description: "Profiling information about startup performance",
            type: "object",
            properties: {
              marks: {
                type: "array",
                description: "Specific points in time when something happened",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      description: "Name of the initialization step",
                      type: "string"
                    },
                    startTime: {
                      description: "Milliseconds elapsed since the service worker started",
                      type: "number"
                    }
                  }
                }
              },
              measures: {
                type: "array",
                description: "Measurements of how long steps took",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      description: "Name of the initialization step",
                      type: "string"
                    },
                    startTime: {
                      description: "When the measure started, in milliseconds elapsed since the service worker started",
                      type: "number"
                    },
                    duration: {
                      description: "Duration that the step took in milliseconds",
                      type: "number"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    subscriptions_reset: {
      description: "Event logged when subscriptions are reset to defaults due to zero enabled subscriptions",
      data: {
        description: "Debug metadata about the subscription reset",
        type: "object",
        properties: {
          subs: {
            description: "The total number of subscriptions after reset",
            type: "number"
          },
          enabledSubs: {
            description: "The number of enabled subscriptions after reset",
            type: "number"
          },
          enabledRulesets: {
            description: "The number of enabled DNR rulesets after reset",
            type: "number"
          },
          totalUserFilters: {
            description: "The total number of user filters after reset",
            type: "number"
          },
          dynamicRules: {
            description: "The number of dynamic DNR rules after reset",
            type: "number"
          },
          dataCorrupted: {
            description: "Whether the data is corrupted. True if the extension has detected that storage has thrown an error.",
            type: "boolean"
          },
          firstRun: {
            description: "Whether this is the first run of the extension based on the number of subscriptions and user filters.",
            type: "boolean"
          },
          reinitialized: {
            description: "Whether the extension was reinitialized before reset.",
            type: "boolean"
          },
          errorMsg: {
            description: "An error that occurred when readding subscriptions, if any",
            type: ["string", "null"]
          },
          lastErrorMsg: {
            description: "The last error in the browser runtime, if any",
            type: ["string", "null"]
          }
        }
      }
    }
  },
  customer_lifecycle: {
    new_install_normal: {
      description: "The extension was installed from the browser's official web store (Chrome Web Store, Firefox Add-ons, Microsoft Edge Add-ons)"
    },
    new_install_development: {
      description: "The extension was installed manually in development mode, either as an unpacked directory or from a local .zip/.crx/.xpi package"
    },
    new_install_admin: {
      description: "The extension was installed and managed by an administrator through a policy setting"
    },
    new_install_sideload: {
      description: "The extension was installed by other software on the user's computer"
    },
    new_install_other: {
      description: "The extension was installed through an unrecognized method not covered by other install types(normal/development/admin/sideload)"
    },
    new_install_unknown: {
      description: "The extension was installed but the installation type could not be determined"
    },
    trial_license_expired: {
      description: "The premium trial license has expired"
    }
  },
  new_tab: {
    command_ready: {
      description: "'create_tab' IPM command has passed all checks and new tab is going to be created at the next possible opportunity",
      data: {
        description: "IPM command ID",
        type: "string"
      }
    },
    tab_created: {
      description: "A tab has been created for the IPM command",
      data: {
        description: "IPM command ID",
        type: "string"
      }
    },
    tab_loaded: {
      description: "The contents of the tab for the IPM command have been loaded",
      data: {
        description: "IPM command ID",
        type: "string"
      }
    }
  },
  onpage_dialog: {
    command_ready: {
      description: "'create_on_page_dialog' IPM command has passed all checks and on-page dialog is going to be created at the next possible opportunity",
      data: {
        description: "IPM command ID",
        type: "string"
      }
    }
  },
  onpage_dialog_ui: {
    dialog_button_clicked: {
      description: "The user clicked on the button presented on the dialog",
      data: {
        description: "IPM command ID",
        type: "string"
      }
    },
    dialog_closed: {
      description: "The user closed the dialog by clicking the close icon in the dialog header",
      data: {
        description: "IPM command ID",
        type: "string"
      }
    },
    dialog_ignored: {
      description: "The user did not interact with the dialog while being injected into the page, and the dialog no longer can be interacted with",
      data: {
        description: "IPM command ID",
        type: "string"
      }
    },
    dialog_injected: {
      description: "The extension injected the dialog into the page and rendered it. This doesn't mean that the dialog is visible to the user, or that it looks as expected",
      data: {
        description: "IPM command ID",
        type: "string"
      }
    },
    dialog_display_duration: {
      description: "How long the dialog was visible in MS before it was dismissed",
      data: {
        description: "Information about the dismissal",
        type: "object",
        properties: {
          terminationCause: {
            description: "Termination reason closed: tab_navigated or tab_removed",
            type: "string"
          },
          durationMs: {
            description: "How long the OPD was displayed",
            type: "number"
          },
          ipmId: {
            description: "The ID of the IPM OPD campaign",
            type: "string"
          }
        }
      }
    }
  },
  test_ewe_background: {
    test_event: {
      description: "TEST: A logging test event for various types of data",
      data: {
        description: "Arbitrary test data",
        type: "any"
      }
    },
    test_event_no_data: {
      description: "TEST: A logging test event that has no associated data"
    }
  },
  test_ewe_content_api: {
    test_got_experiment_flag: {
      description: "TEST: In the content test script, an experiment was loaded",
      data: {
        description: "Information about the loaded experiment",
        type: "object",
        properties: {
          flagName: {
            description: "The flag name that was loaded",
            type: "string"
          },
          flag: {
            description: "The loaded value",
            type: "any"
          }
        }
      }
    }
  },
  test_ewe_ui_api: {
    test_message_received: {
      description:
        "TEST: A logger test event indicating the UI page received a request to log",
      data: {
        description: "The data sent to the test listener",
        type: "any"
      }
    },
    test_event: {
      description: "TEST: A logging test event for various types of data",
      data: {
        description: "Arbitrary test data",
        type: "any"
      }
    },
    test_event_no_data: {
      description: "TEST: A logging test event that has no associated data"
    }
  },
  reverse_trial: {
    dialog_shown: {
      description: "The reverse trial dialog was shown to the user",
      data: {
        description: "Details about the dialog shown",
        type: "object",
        properties: {
          touchPointStep: {
            description: "The touch point step number of the dialog shown",
            type: "number"
          },
          installDate: {
            description: "The timestamp when the extension was installed",
            type: "number"
          },
          reverseTrialStartDate: {
            description: "The timestamp when the reverse trial started",
            type: "number"
          }
        }
      }
    },
    dialog_skipped_yt_premium: {
      description: "The reverse trial dialog would have been shown but was skipped because the user has YouTube Premium",
      data: {
        description: "Details about the skipped dialog",
        type: "object",
        properties: {
          touchPointStep: {
            description: "The touch point step number of the dialog that was skipped",
            type: "number"
          },
          installDate: {
            description: "The timestamp when the extension was installed",
            type: "number"
          },
          reverseTrialStartDate: {
            description: "The timestamp when the reverse trial started",
            type: "number"
          }
        }
      }
    },
    dialog_should_still_show_checked: {
      description: "The service worker checked whether a visible reverse trial dialog should still be shown after the tab became active",
      data: {
        description: "Details about the check",
        type: "object",
        properties: {
          touchPointStep: {
            description: "The touch point step number of the dialog being checked",
            type: "number"
          },
          shouldStillShow: {
            description: "Whether the dialog should remain visible",
            type: "boolean"
          },
          installDate: {
            description: "The timestamp when the extension was installed",
            type: "number"
          },
          reverseTrialStartDate: {
            description: "The timestamp when the reverse trial started",
            type: "number"
          }
        }
      }
    },
    dialog_action: {
      description: "The user interacted with the reverse trial dialog",
      data: {
        description: "Details about the interaction",
        type: "object",
        properties: {
          action: {
            description: "Identifier of the clicked element: the i18n key of a configured ctaButton or link (e.g. 'mid_cta', 'mid_end_trial'), or an uppercase built-in value ('CLOSE' for the x button, 'AUTO_DISMISS' for the auto-dismiss timeout)",
            type: "string"
          },
          touchPointStep: {
            description: "The touch point step number of the dialog that was interacted with",
            type: "number"
          },
          installDate: {
            description: "The timestamp when the extension was installed",
            type: "number"
          },
          reverseTrialStartDate: {
            description: "The timestamp when the reverse trial started",
            type: "number"
          }
        }
      }
    },
    config_validation_failed: {
      description: "The remote reverse-trial OPD config failed validation. Fires at load time when the experiment flag is present but the schema is invalid (e.g. missing field, unknown action type, URL not on the allowlist), and at runtime when a NAVIGATE URL fails the allowlist check after template substitution. The full URL is intentionally not logged because template variables may contain PII.",
      data: {
        description: "Details about the validation failure.",
        type: "object",
        properties: {
          reason: {
            description: "Why validation failed. Load-time reasons include 'config_missing' (flag absent despite the user being in a reverse-trial variant), 'trial_duration_days_invalid', 'require_opt_in_invalid', 'steps_invalid', 'step_id_invalid', 'step_title_invalid', 'step_body_invalid', 'step_i18n_en_missing', 'step_i18n_key_missing_in_en', 'navigate_url_missing', 'navigate_url_not_allowlisted', 'action_type_unknown'. Runtime reason is 'url_validation_failed_after_substitution'.",
            type: "string"
          },
          hostname: {
            description: "Hostname of the failing URL for runtime URL validation failures; absent for load-time schema failures.",
            type: "string"
          }
        }
      }
    }
  },
  remote_config: {
    validation_error: {
      description: "The remote config failed validation and was not applied.",
      data: {
        description: "The error messages from the validator.",
        type: "array",
        items: {
          type: "string"
        }
      }
    },
    invalid_condition: {
      description: "The remote config contained conditions referencing facts or operators not recognized by this client version. The config was applied; affected conditions should be skipped at evaluation time.",
      data: {
        description: "The warning messages from the validator for each unrecognized fact or operator.",
        type: "array",
        items: {
          type: "string"
        }
      }
    }
  }
});

;// ./src/all/telemetry.js
/*
 * This file is part of eyeo's Web Extension Ad Blocking Toolkit (EWE),
 * Copyright (C) 2006-present eyeo GmbH
 *
 * EWE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * EWE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EWE.  If not, see <http://www.gnu.org/licenses/>.
 */



const DEBUG = 1;
const INFO = 2;
const BEHAVIOR = 3;
const WARN = 4;
const OFF = 5;

/**
 * Map of log names (eg 'debug') to their internal numeric representation. The
 * numbers represent a verbosity level, where 1 is the most verbose and 5 is the
 * least.
 */
const logLevelNamesToNumbers = {
  debug: DEBUG,
  info: INFO,
  behavior: BEHAVIOR,
  warn: WARN,
  off: OFF
};

/**
 * Map of log numeric representation back to their name. This can be used to
 * format log messages.
 */
const logLevelNumbersToNames = Object.fromEntries(
  Object.entries(logLevelNamesToNumbers).map(([key, value]) => [value, key])
);

function isPlainObject(obj) {
  if (obj === null || typeof obj !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(obj);
  return proto === Object.prototype || proto === null;
}

function isSerializableToJson(data, seen = new WeakSet()) {
  let type = typeof data;
  if (data === null || type == "undefined" || type == "string" || type == "boolean") {
    return true;
  }

  if (type == "number") {
    return Number.isFinite(data);
  }

  if (isPlainObject(data)) {
    if (seen.has(data)) {
      return false;
    }
    seen.add(data);
    return Object.values(data).every(x => isSerializableToJson(x, seen));
  }

  if (Array.isArray(data)) {
    if (seen.has(data)) {
      return false;
    }
    seen.add(data);
    return data.every(x => isSerializableToJson(x, seen));
  }

  return false;
}

function matchesEventSchema(data, dataSchema) {
  let dataType = typeof data;
  if (dataType === "undefined" || !dataSchema) {
    // if either is undefined (or null), then they must both be undefined.
    return (dataType === "undefined" || data === null) && !dataSchema;
  }

  let types = dataSchema.type;
  if (typeof types === "string") {
    types = [types];
  }

  let typeMatches = types.some(type => {
    switch (type) {
      case "any":
        return true;

      case "boolean":
      case "number":
      case "string":
        return dataType === type;

      case "null":
        return data === null;

      case "integer":
        return Number.isInteger(data);

      case "object":
        return isPlainObject(data) &&
          Object.keys(dataSchema.properties).every(key =>
            matchesEventSchema(data[key], dataSchema.properties[key])
          );

      case "array":
        return Array.isArray(data) && data.every(item =>
          matchesEventSchema(item, dataSchema.items)
        );
    }
    return false;
  });

  if (!typeMatches) {
    return false;
  }

  // After type validation passes, check enum constraint if defined
  if (typeof dataSchema.enum !== "undefined") {
    if (!dataSchema.enum.includes(data)) {
      return false;
    }
  }

  return true;
}

/**
 * Represents a logger. This will provide the API for the logger, and will
 * validate the logged events are as they appear in core/sdk/events.js, but will
 * not itself do any of the actual logging.
 *
 * This is not expected to be instantiated directly, but
 * should rather be extended. Child classes should implement the _validatedLog
 * function.
 *
 * @param {string} module The module that this logger is for.
 */
class AbstractLogger {
  constructor(module, defaultEvents = events) {
    this._module = module;
    this._events = defaultEvents;

    if (!this._events[this._module]) {
      console.error(`Unknown module: ${module}. ` +
                    "Did you remember to add it to core/sdk/events.js?");
    }
  }

  _log(level, event, data, ipmId) {
    if (!this._events[this._module]) {
      return;
    }

    if (!this._events[this._module][event]) {
      console.error(`Unknown event: ${event} in module: ${this._module}. ` +
        "Did you remember to add it to core/sdk/events.js?");
      return;
    }

    if (!isSerializableToJson(data)) {
      console.error(`Data for event: ${event} in module: ${this._module} cannot be serialized to JSON.`);
      return;
    }

    const dataSchema = this._events[this._module][event].data;
    if (!matchesEventSchema(data, dataSchema)) {
      console.error(`Data for event: ${event} in module: ${this._module} does not match the schema ` +
        "provided in core/sdk/events.js. ", {data, dataSchema});
      return;
    }

    const logTime = new Date().toISOString();
    this._validatedLog(logTime, level, event, data, ipmId);
  }

  _validatedLog(logTime, level, event, data, ipmId) {
  }

  /**
   * Creates a debug log.
   *
   * @param {string} event The name of the event to log. This should be unique.
   * @param {string|number|object|array|boolean|null} [data]
   *    The dynamic data relevant to the event.
   */
  debug(event, data) {
    this._log(DEBUG, event, data);
  }

  /**
   * Creates an info log.
   *
   * @param {string} event The name of the event to log. This should be unique.
   * @param {string|number|object|array|boolean|null} [data]
   *    The dynamic data relevant to the event.
   */
  info(event, data) {
    this._log(INFO, event, data);
  }

  /**
   * Creates a behaviour log.
   *
   * @param {string} event The name of the event to log. This should be unique.
   * @param {string|number|object|array|boolean|null} [data]
   *    The dynamic data relevant to the event.
   * @param {string} [ipmId] Optional suffix appended to the behaviour
   *   counter key. IPM events pass the campaign ID; detection snippets
   *   pass type:domain. Renamed to `keySuffix` in ServerLogger internals.
   */
  behavior(event, data, ipmId) {
    this._log(BEHAVIOR, event, data, ipmId);
  }

  /**
   * Creates a warn log.
   *
   * @param {string} event The name of the event to log. This should be unique.
   * @param {string|number|object|array|boolean|null} [data]
   *    The dynamic data relevant to the event.
   */
  warn(event, data) {
    this._log(WARN, event, data);
  }
}

;// ./src/front/telemetry.js
/*
 * This file is part of eyeo's Web Extension Ad Blocking Toolkit (EWE),
 * Copyright (C) 2006-present eyeo GmbH
 *
 * EWE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * EWE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EWE.  If not, see <http://www.gnu.org/licenses/>.
 */






/**
 * Represents a server logger. This is used to send data to our telemetry
 * server. The exact URL will be configured by the telemetry module in the
 * background script. Console logging is also provided for convenience.
 *
 * @param {string} module The module that this logger is for.
 */
class ServerLogger extends AbstractLogger {
  _validatedLog(logTime, level, event, data) {
    void ignoreNoConnectionError(
      browser_polyfill.runtime.sendMessage({
        type: "ewe:telemetry-log",
        logTime,
        module: this._module,
        level,
        event,
        data
      })
    );
  }
}

/**
 * API to interact with the telemetry module
 * @namespace telemetry
 */
/* harmony default export */ const telemetry = ({
  ServerLogger
});

;// ./src/ui/index.js
/*
 * This file is part of eyeo's Web Extension Ad Blocking Toolkit (EWE),
 * Copyright (C) 2006-present eyeo GmbH
 *
 * EWE is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * EWE is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with EWE.  If not, see <http://www.gnu.org/licenses/>.
 */






/******/ 	return __nested_webpack_exports__;
/******/ })()
;
});


/***/ }),

/***/ 2058:
/***/ ((module) => {

"use strict";
module.exports = /*#__PURE__*/JSON.parse('{"alarms":{"clear":{"minArgs":0,"maxArgs":1},"clearAll":{"minArgs":0,"maxArgs":0},"get":{"minArgs":0,"maxArgs":1},"getAll":{"minArgs":0,"maxArgs":0}},"bookmarks":{"create":{"minArgs":1,"maxArgs":1},"get":{"minArgs":1,"maxArgs":1},"getChildren":{"minArgs":1,"maxArgs":1},"getRecent":{"minArgs":1,"maxArgs":1},"getSubTree":{"minArgs":1,"maxArgs":1},"getTree":{"minArgs":0,"maxArgs":0},"move":{"minArgs":2,"maxArgs":2},"remove":{"minArgs":1,"maxArgs":1},"removeTree":{"minArgs":1,"maxArgs":1},"search":{"minArgs":1,"maxArgs":1},"update":{"minArgs":2,"maxArgs":2}},"browserAction":{"disable":{"minArgs":0,"maxArgs":1,"fallbackToNoCallback":true},"enable":{"minArgs":0,"maxArgs":1,"fallbackToNoCallback":true},"getBadgeBackgroundColor":{"minArgs":1,"maxArgs":1},"getBadgeText":{"minArgs":1,"maxArgs":1},"getPopup":{"minArgs":1,"maxArgs":1},"getTitle":{"minArgs":1,"maxArgs":1},"openPopup":{"minArgs":0,"maxArgs":0},"setBadgeBackgroundColor":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"setBadgeText":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"setIcon":{"minArgs":1,"maxArgs":1},"setPopup":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"setTitle":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true}},"browsingData":{"remove":{"minArgs":2,"maxArgs":2},"removeCache":{"minArgs":1,"maxArgs":1},"removeCookies":{"minArgs":1,"maxArgs":1},"removeDownloads":{"minArgs":1,"maxArgs":1},"removeFormData":{"minArgs":1,"maxArgs":1},"removeHistory":{"minArgs":1,"maxArgs":1},"removeLocalStorage":{"minArgs":1,"maxArgs":1},"removePasswords":{"minArgs":1,"maxArgs":1},"removePluginData":{"minArgs":1,"maxArgs":1},"settings":{"minArgs":0,"maxArgs":0}},"commands":{"getAll":{"minArgs":0,"maxArgs":0}},"contextMenus":{"remove":{"minArgs":1,"maxArgs":1},"removeAll":{"minArgs":0,"maxArgs":0},"update":{"minArgs":2,"maxArgs":2}},"cookies":{"get":{"minArgs":1,"maxArgs":1},"getAll":{"minArgs":1,"maxArgs":1},"getAllCookieStores":{"minArgs":0,"maxArgs":0},"remove":{"minArgs":1,"maxArgs":1},"set":{"minArgs":1,"maxArgs":1}},"devtools":{"inspectedWindow":{"eval":{"minArgs":1,"maxArgs":2,"singleCallbackArg":false}},"panels":{"create":{"minArgs":3,"maxArgs":3,"singleCallbackArg":true},"elements":{"createSidebarPane":{"minArgs":1,"maxArgs":1}}}},"downloads":{"cancel":{"minArgs":1,"maxArgs":1},"download":{"minArgs":1,"maxArgs":1},"erase":{"minArgs":1,"maxArgs":1},"getFileIcon":{"minArgs":1,"maxArgs":2},"open":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"pause":{"minArgs":1,"maxArgs":1},"removeFile":{"minArgs":1,"maxArgs":1},"resume":{"minArgs":1,"maxArgs":1},"search":{"minArgs":1,"maxArgs":1},"show":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true}},"extension":{"isAllowedFileSchemeAccess":{"minArgs":0,"maxArgs":0},"isAllowedIncognitoAccess":{"minArgs":0,"maxArgs":0}},"history":{"addUrl":{"minArgs":1,"maxArgs":1},"deleteAll":{"minArgs":0,"maxArgs":0},"deleteRange":{"minArgs":1,"maxArgs":1},"deleteUrl":{"minArgs":1,"maxArgs":1},"getVisits":{"minArgs":1,"maxArgs":1},"search":{"minArgs":1,"maxArgs":1}},"i18n":{"detectLanguage":{"minArgs":1,"maxArgs":1},"getAcceptLanguages":{"minArgs":0,"maxArgs":0}},"identity":{"launchWebAuthFlow":{"minArgs":1,"maxArgs":1}},"idle":{"queryState":{"minArgs":1,"maxArgs":1}},"management":{"get":{"minArgs":1,"maxArgs":1},"getAll":{"minArgs":0,"maxArgs":0},"getSelf":{"minArgs":0,"maxArgs":0},"setEnabled":{"minArgs":2,"maxArgs":2},"uninstallSelf":{"minArgs":0,"maxArgs":1}},"notifications":{"clear":{"minArgs":1,"maxArgs":1},"create":{"minArgs":1,"maxArgs":2},"getAll":{"minArgs":0,"maxArgs":0},"getPermissionLevel":{"minArgs":0,"maxArgs":0},"update":{"minArgs":2,"maxArgs":2}},"pageAction":{"getPopup":{"minArgs":1,"maxArgs":1},"getTitle":{"minArgs":1,"maxArgs":1},"hide":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"setIcon":{"minArgs":1,"maxArgs":1},"setPopup":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"setTitle":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true},"show":{"minArgs":1,"maxArgs":1,"fallbackToNoCallback":true}},"permissions":{"contains":{"minArgs":1,"maxArgs":1},"getAll":{"minArgs":0,"maxArgs":0},"remove":{"minArgs":1,"maxArgs":1},"request":{"minArgs":1,"maxArgs":1}},"runtime":{"getBackgroundPage":{"minArgs":0,"maxArgs":0},"getPlatformInfo":{"minArgs":0,"maxArgs":0},"openOptionsPage":{"minArgs":0,"maxArgs":0},"requestUpdateCheck":{"minArgs":0,"maxArgs":0},"sendMessage":{"minArgs":1,"maxArgs":3},"sendNativeMessage":{"minArgs":2,"maxArgs":2},"setUninstallURL":{"minArgs":1,"maxArgs":1}},"sessions":{"getDevices":{"minArgs":0,"maxArgs":1},"getRecentlyClosed":{"minArgs":0,"maxArgs":1},"restore":{"minArgs":0,"maxArgs":1}},"storage":{"local":{"clear":{"minArgs":0,"maxArgs":0},"get":{"minArgs":0,"maxArgs":1},"getBytesInUse":{"minArgs":0,"maxArgs":1},"remove":{"minArgs":1,"maxArgs":1},"set":{"minArgs":1,"maxArgs":1}},"managed":{"get":{"minArgs":0,"maxArgs":1},"getBytesInUse":{"minArgs":0,"maxArgs":1}},"sync":{"clear":{"minArgs":0,"maxArgs":0},"get":{"minArgs":0,"maxArgs":1},"getBytesInUse":{"minArgs":0,"maxArgs":1},"remove":{"minArgs":1,"maxArgs":1},"set":{"minArgs":1,"maxArgs":1}}},"tabs":{"captureVisibleTab":{"minArgs":0,"maxArgs":2},"create":{"minArgs":1,"maxArgs":1},"detectLanguage":{"minArgs":0,"maxArgs":1},"discard":{"minArgs":0,"maxArgs":1},"duplicate":{"minArgs":1,"maxArgs":1},"executeScript":{"minArgs":1,"maxArgs":2},"get":{"minArgs":1,"maxArgs":1},"getCurrent":{"minArgs":0,"maxArgs":0},"getZoom":{"minArgs":0,"maxArgs":1},"getZoomSettings":{"minArgs":0,"maxArgs":1},"goBack":{"minArgs":0,"maxArgs":1},"goForward":{"minArgs":0,"maxArgs":1},"highlight":{"minArgs":1,"maxArgs":1},"insertCSS":{"minArgs":1,"maxArgs":2},"move":{"minArgs":2,"maxArgs":2},"query":{"minArgs":1,"maxArgs":1},"reload":{"minArgs":0,"maxArgs":2},"remove":{"minArgs":1,"maxArgs":1},"removeCSS":{"minArgs":1,"maxArgs":2},"sendMessage":{"minArgs":2,"maxArgs":3},"setZoom":{"minArgs":1,"maxArgs":2},"setZoomSettings":{"minArgs":1,"maxArgs":2},"update":{"minArgs":1,"maxArgs":2}},"topSites":{"get":{"minArgs":0,"maxArgs":0}},"webNavigation":{"getAllFrames":{"minArgs":1,"maxArgs":1},"getFrame":{"minArgs":1,"maxArgs":1}},"webRequest":{"handlerBehaviorChanged":{"minArgs":0,"maxArgs":0}},"windows":{"create":{"minArgs":0,"maxArgs":1},"get":{"minArgs":1,"maxArgs":2},"getAll":{"minArgs":0,"maxArgs":1},"getCurrent":{"minArgs":0,"maxArgs":1},"getLastFocused":{"minArgs":0,"maxArgs":1},"remove":{"minArgs":1,"maxArgs":1},"update":{"minArgs":2,"maxArgs":2}}}');

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";

// NAMESPACE OBJECT: ./src/core/messaging/front/index.ts
var front_namespaceObject = {};
__webpack_require__.r(front_namespaceObject);
__webpack_require__.d(front_namespaceObject, {
  send: () => (send)
});

// NAMESPACE OBJECT: ./src/filters/shared/index.ts
var shared_namespaceObject = {};
__webpack_require__.r(shared_namespaceObject);
__webpack_require__.d(shared_namespaceObject, {
  FilterOrigin: () => (FilterOrigin)
});

// EXTERNAL MODULE: ../../node_modules/@eyeo/webext-ad-filtering-solution/dist/ewe-ui.js
var ewe_ui = __webpack_require__(2181);
;// CONCATENATED MODULE: ../../node_modules/dompurify/dist/purify.es.mjs
/*! @license DOMPurify 3.4.2 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.2/LICENSE */

const {
  entries,
  setPrototypeOf,
  isFrozen,
  getPrototypeOf,
  getOwnPropertyDescriptor
} = Object;
let {
  freeze,
  seal,
  create
} = Object; // eslint-disable-line import/no-mutable-exports
let {
  apply,
  construct
} = typeof Reflect !== 'undefined' && Reflect;
if (!freeze) {
  freeze = function freeze(x) {
    return x;
  };
}
if (!seal) {
  seal = function seal(x) {
    return x;
  };
}
if (!apply) {
  apply = function apply(func, thisArg) {
    for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
      args[_key - 2] = arguments[_key];
    }
    return func.apply(thisArg, args);
  };
}
if (!construct) {
  construct = function construct(Func) {
    for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
      args[_key2 - 1] = arguments[_key2];
    }
    return new Func(...args);
  };
}
const arrayForEach = unapply(Array.prototype.forEach);
const arrayLastIndexOf = unapply(Array.prototype.lastIndexOf);
const arrayPop = unapply(Array.prototype.pop);
const arrayPush = unapply(Array.prototype.push);
const arraySplice = unapply(Array.prototype.splice);
const arrayIsArray = Array.isArray;
const stringToLowerCase = unapply(String.prototype.toLowerCase);
const stringToString = unapply(String.prototype.toString);
const stringMatch = unapply(String.prototype.match);
const stringReplace = unapply(String.prototype.replace);
const stringIndexOf = unapply(String.prototype.indexOf);
const stringTrim = unapply(String.prototype.trim);
const numberToString = unapply(Number.prototype.toString);
const booleanToString = unapply(Boolean.prototype.toString);
const bigintToString = typeof BigInt === 'undefined' ? null : unapply(BigInt.prototype.toString);
const symbolToString = typeof Symbol === 'undefined' ? null : unapply(Symbol.prototype.toString);
const objectHasOwnProperty = unapply(Object.prototype.hasOwnProperty);
const objectToString = unapply(Object.prototype.toString);
const regExpTest = unapply(RegExp.prototype.test);
const typeErrorCreate = unconstruct(TypeError);
/**
 * Creates a new function that calls the given function with a specified thisArg and arguments.
 *
 * @param func - The function to be wrapped and called.
 * @returns A new function that calls the given function with a specified thisArg and arguments.
 */
function unapply(func) {
  return function (thisArg) {
    if (thisArg instanceof RegExp) {
      thisArg.lastIndex = 0;
    }
    for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
      args[_key3 - 1] = arguments[_key3];
    }
    return apply(func, thisArg, args);
  };
}
/**
 * Creates a new function that constructs an instance of the given constructor function with the provided arguments.
 *
 * @param func - The constructor function to be wrapped and called.
 * @returns A new function that constructs an instance of the given constructor function with the provided arguments.
 */
function unconstruct(Func) {
  return function () {
    for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
      args[_key4] = arguments[_key4];
    }
    return construct(Func, args);
  };
}
/**
 * Add properties to a lookup table
 *
 * @param set - The set to which elements will be added.
 * @param array - The array containing elements to be added to the set.
 * @param transformCaseFunc - An optional function to transform the case of each element before adding to the set.
 * @returns The modified set with added elements.
 */
function addToSet(set, array) {
  let transformCaseFunc = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : stringToLowerCase;
  if (setPrototypeOf) {
    // Make 'in' and truthy checks like Boolean(set.constructor)
    // independent of any properties defined on Object.prototype.
    // Prevent prototype setters from intercepting set as a this value.
    setPrototypeOf(set, null);
  }
  if (!arrayIsArray(array)) {
    return set;
  }
  let l = array.length;
  while (l--) {
    let element = array[l];
    if (typeof element === 'string') {
      const lcElement = transformCaseFunc(element);
      if (lcElement !== element) {
        // Config presets (e.g. tags.js, attrs.js) are immutable.
        if (!isFrozen(array)) {
          array[l] = lcElement;
        }
        element = lcElement;
      }
    }
    set[element] = true;
  }
  return set;
}
/**
 * Clean up an array to harden against CSPP
 *
 * @param array - The array to be cleaned.
 * @returns The cleaned version of the array
 */
function cleanArray(array) {
  for (let index = 0; index < array.length; index++) {
    const isPropertyExist = objectHasOwnProperty(array, index);
    if (!isPropertyExist) {
      array[index] = null;
    }
  }
  return array;
}
/**
 * Shallow clone an object
 *
 * @param object - The object to be cloned.
 * @returns A new object that copies the original.
 */
function clone(object) {
  const newObject = create(null);
  for (const [property, value] of entries(object)) {
    const isPropertyExist = objectHasOwnProperty(object, property);
    if (isPropertyExist) {
      if (arrayIsArray(value)) {
        newObject[property] = cleanArray(value);
      } else if (value && typeof value === 'object' && value.constructor === Object) {
        newObject[property] = clone(value);
      } else {
        newObject[property] = value;
      }
    }
  }
  return newObject;
}
/**
 * Convert non-node values into strings without depending on direct property access.
 *
 * @param value - The value to stringify.
 * @returns A string representation of the provided value.
 */
function stringifyValue(value) {
  switch (typeof value) {
    case 'string':
      {
        return value;
      }
    case 'number':
      {
        return numberToString(value);
      }
    case 'boolean':
      {
        return booleanToString(value);
      }
    case 'bigint':
      {
        return bigintToString ? bigintToString(value) : '0';
      }
    case 'symbol':
      {
        return symbolToString ? symbolToString(value) : 'Symbol()';
      }
    case 'undefined':
      {
        return objectToString(value);
      }
    case 'function':
    case 'object':
      {
        if (value === null) {
          return objectToString(value);
        }
        const valueAsRecord = value;
        const valueToString = lookupGetter(valueAsRecord, 'toString');
        if (typeof valueToString === 'function') {
          const stringified = valueToString(valueAsRecord);
          return typeof stringified === 'string' ? stringified : objectToString(stringified);
        }
        return objectToString(value);
      }
    default:
      {
        return objectToString(value);
      }
  }
}
/**
 * This method automatically checks if the prop is function or getter and behaves accordingly.
 *
 * @param object - The object to look up the getter function in its prototype chain.
 * @param prop - The property name for which to find the getter function.
 * @returns The getter function found in the prototype chain or a fallback function.
 */
function lookupGetter(object, prop) {
  while (object !== null) {
    const desc = getOwnPropertyDescriptor(object, prop);
    if (desc) {
      if (desc.get) {
        return unapply(desc.get);
      }
      if (typeof desc.value === 'function') {
        return unapply(desc.value);
      }
    }
    object = getPrototypeOf(object);
  }
  function fallbackValue() {
    return null;
  }
  return fallbackValue;
}
function isRegex(value) {
  try {
    regExpTest(value, '');
    return true;
  } catch (_unused) {
    return false;
  }
}

const html$1 = freeze(['a', 'abbr', 'acronym', 'address', 'area', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo', 'big', 'blink', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'content', 'data', 'datalist', 'dd', 'decorator', 'del', 'details', 'dfn', 'dialog', 'dir', 'div', 'dl', 'dt', 'element', 'em', 'fieldset', 'figcaption', 'figure', 'font', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'main', 'map', 'mark', 'marquee', 'menu', 'menuitem', 'meter', 'nav', 'nobr', 'ol', 'optgroup', 'option', 'output', 'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'search', 'section', 'select', 'shadow', 'slot', 'small', 'source', 'spacer', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'track', 'tt', 'u', 'ul', 'var', 'video', 'wbr']);
const svg$1 = freeze(['svg', 'a', 'altglyph', 'altglyphdef', 'altglyphitem', 'animatecolor', 'animatemotion', 'animatetransform', 'circle', 'clippath', 'defs', 'desc', 'ellipse', 'enterkeyhint', 'exportparts', 'filter', 'font', 'g', 'glyph', 'glyphref', 'hkern', 'image', 'inputmode', 'line', 'lineargradient', 'marker', 'mask', 'metadata', 'mpath', 'part', 'path', 'pattern', 'polygon', 'polyline', 'radialgradient', 'rect', 'stop', 'style', 'switch', 'symbol', 'text', 'textpath', 'title', 'tref', 'tspan', 'view', 'vkern']);
const svgFilters = freeze(['feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence']);
// List of SVG elements that are disallowed by default.
// We still need to know them so that we can do namespace
// checks properly in case one wants to add them to
// allow-list.
const svgDisallowed = freeze(['animate', 'color-profile', 'cursor', 'discard', 'font-face', 'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri', 'foreignobject', 'hatch', 'hatchpath', 'mesh', 'meshgradient', 'meshpatch', 'meshrow', 'missing-glyph', 'script', 'set', 'solidcolor', 'unknown', 'use']);
const mathMl$1 = freeze(['math', 'menclose', 'merror', 'mfenced', 'mfrac', 'mglyph', 'mi', 'mlabeledtr', 'mmultiscripts', 'mn', 'mo', 'mover', 'mpadded', 'mphantom', 'mroot', 'mrow', 'ms', 'mspace', 'msqrt', 'mstyle', 'msub', 'msup', 'msubsup', 'mtable', 'mtd', 'mtext', 'mtr', 'munder', 'munderover', 'mprescripts']);
// Similarly to SVG, we want to know all MathML elements,
// even those that we disallow by default.
const mathMlDisallowed = freeze(['maction', 'maligngroup', 'malignmark', 'mlongdiv', 'mscarries', 'mscarry', 'msgroup', 'mstack', 'msline', 'msrow', 'semantics', 'annotation', 'annotation-xml', 'mprescripts', 'none']);
const purify_es_text = freeze(['#text']);

const html = freeze(['accept', 'action', 'align', 'alt', 'autocapitalize', 'autocomplete', 'autopictureinpicture', 'autoplay', 'background', 'bgcolor', 'border', 'capture', 'cellpadding', 'cellspacing', 'checked', 'cite', 'class', 'clear', 'color', 'cols', 'colspan', 'controls', 'controlslist', 'coords', 'crossorigin', 'datetime', 'decoding', 'default', 'dir', 'disabled', 'disablepictureinpicture', 'disableremoteplayback', 'download', 'draggable', 'enctype', 'enterkeyhint', 'exportparts', 'face', 'for', 'headers', 'height', 'hidden', 'high', 'href', 'hreflang', 'id', 'inert', 'inputmode', 'integrity', 'ismap', 'kind', 'label', 'lang', 'list', 'loading', 'loop', 'low', 'max', 'maxlength', 'media', 'method', 'min', 'minlength', 'multiple', 'muted', 'name', 'nonce', 'noshade', 'novalidate', 'nowrap', 'open', 'optimum', 'part', 'pattern', 'placeholder', 'playsinline', 'popover', 'popovertarget', 'popovertargetaction', 'poster', 'preload', 'pubdate', 'radiogroup', 'readonly', 'rel', 'required', 'rev', 'reversed', 'role', 'rows', 'rowspan', 'spellcheck', 'scope', 'selected', 'shape', 'size', 'sizes', 'slot', 'span', 'srclang', 'start', 'src', 'srcset', 'step', 'style', 'summary', 'tabindex', 'title', 'translate', 'type', 'usemap', 'valign', 'value', 'width', 'wrap', 'xmlns']);
const svg = freeze(['accent-height', 'accumulate', 'additive', 'alignment-baseline', 'amplitude', 'ascent', 'attributename', 'attributetype', 'azimuth', 'basefrequency', 'baseline-shift', 'begin', 'bias', 'by', 'class', 'clip', 'clippathunits', 'clip-path', 'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'color-profile', 'color-rendering', 'cx', 'cy', 'd', 'dx', 'dy', 'diffuseconstant', 'direction', 'display', 'divisor', 'dur', 'edgemode', 'elevation', 'end', 'exponent', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'filterunits', 'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'fx', 'fy', 'g1', 'g2', 'glyph-name', 'glyphref', 'gradientunits', 'gradienttransform', 'height', 'href', 'id', 'image-rendering', 'in', 'in2', 'intercept', 'k', 'k1', 'k2', 'k3', 'k4', 'kerning', 'keypoints', 'keysplines', 'keytimes', 'lang', 'lengthadjust', 'letter-spacing', 'kernelmatrix', 'kernelunitlength', 'lighting-color', 'local', 'marker-end', 'marker-mid', 'marker-start', 'markerheight', 'markerunits', 'markerwidth', 'maskcontentunits', 'maskunits', 'max', 'mask', 'mask-type', 'media', 'method', 'mode', 'min', 'name', 'numoctaves', 'offset', 'operator', 'opacity', 'order', 'orient', 'orientation', 'origin', 'overflow', 'paint-order', 'path', 'pathlength', 'patterncontentunits', 'patterntransform', 'patternunits', 'points', 'preservealpha', 'preserveaspectratio', 'primitiveunits', 'r', 'rx', 'ry', 'radius', 'refx', 'refy', 'repeatcount', 'repeatdur', 'restart', 'result', 'rotate', 'scale', 'seed', 'shape-rendering', 'slope', 'specularconstant', 'specularexponent', 'spreadmethod', 'startoffset', 'stddeviation', 'stitchtiles', 'stop-color', 'stop-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke', 'stroke-width', 'style', 'surfacescale', 'systemlanguage', 'tabindex', 'tablevalues', 'targetx', 'targety', 'transform', 'transform-origin', 'text-anchor', 'text-decoration', 'text-rendering', 'textlength', 'type', 'u1', 'u2', 'unicode', 'values', 'viewbox', 'visibility', 'version', 'vert-adv-y', 'vert-origin-x', 'vert-origin-y', 'width', 'word-spacing', 'wrap', 'writing-mode', 'xchannelselector', 'ychannelselector', 'x', 'x1', 'x2', 'xmlns', 'y', 'y1', 'y2', 'z', 'zoomandpan']);
const mathMl = freeze(['accent', 'accentunder', 'align', 'bevelled', 'close', 'columnalign', 'columnlines', 'columnspacing', 'columnspan', 'denomalign', 'depth', 'dir', 'display', 'displaystyle', 'encoding', 'fence', 'frame', 'height', 'href', 'id', 'largeop', 'length', 'linethickness', 'lquote', 'lspace', 'mathbackground', 'mathcolor', 'mathsize', 'mathvariant', 'maxsize', 'minsize', 'movablelimits', 'notation', 'numalign', 'open', 'rowalign', 'rowlines', 'rowspacing', 'rowspan', 'rspace', 'rquote', 'scriptlevel', 'scriptminsize', 'scriptsizemultiplier', 'selection', 'separator', 'separators', 'stretchy', 'subscriptshift', 'supscriptshift', 'symmetric', 'voffset', 'width', 'xmlns']);
const xml = freeze(['xlink:href', 'xml:id', 'xlink:title', 'xml:space', 'xmlns:xlink']);

// eslint-disable-next-line unicorn/better-regex
const MUSTACHE_EXPR = seal(/\{\{[\w\W]*|[\w\W]*\}\}/gm); // Specify template detection regex for SAFE_FOR_TEMPLATES mode
const ERB_EXPR = seal(/<%[\w\W]*|[\w\W]*%>/gm);
const TMPLIT_EXPR = seal(/\$\{[\w\W]*/gm); // eslint-disable-line unicorn/better-regex
const DATA_ATTR = seal(/^data-[\-\w.\u00B7-\uFFFF]+$/); // eslint-disable-line no-useless-escape
const ARIA_ATTR = seal(/^aria-[\-\w]+$/); // eslint-disable-line no-useless-escape
const IS_ALLOWED_URI = seal(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i // eslint-disable-line no-useless-escape
);
const IS_SCRIPT_OR_DATA = seal(/^(?:\w+script|data):/i);
const ATTR_WHITESPACE = seal(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g // eslint-disable-line no-control-regex
);
const DOCTYPE_NAME = seal(/^html$/i);
const CUSTOM_ELEMENT = seal(/^[a-z][.\w]*(-[.\w]+)+$/i);

var EXPRESSIONS = /*#__PURE__*/Object.freeze({
    __proto__: null,
    ARIA_ATTR: ARIA_ATTR,
    ATTR_WHITESPACE: ATTR_WHITESPACE,
    CUSTOM_ELEMENT: CUSTOM_ELEMENT,
    DATA_ATTR: DATA_ATTR,
    DOCTYPE_NAME: DOCTYPE_NAME,
    ERB_EXPR: ERB_EXPR,
    IS_ALLOWED_URI: IS_ALLOWED_URI,
    IS_SCRIPT_OR_DATA: IS_SCRIPT_OR_DATA,
    MUSTACHE_EXPR: MUSTACHE_EXPR,
    TMPLIT_EXPR: TMPLIT_EXPR
});

/* eslint-disable @typescript-eslint/indent */
// https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
const NODE_TYPE = {
  element: 1,
  text: 3,
  // Deprecated
  progressingInstruction: 7,
  comment: 8,
  document: 9};
const getGlobal = function getGlobal() {
  return typeof window === 'undefined' ? null : window;
};
/**
 * Creates a no-op policy for internal use only.
 * Don't export this function outside this module!
 * @param trustedTypes The policy factory.
 * @param purifyHostElement The Script element used to load DOMPurify (to determine policy name suffix).
 * @return The policy created (or null, if Trusted Types
 * are not supported or creating the policy failed).
 */
const _createTrustedTypesPolicy = function _createTrustedTypesPolicy(trustedTypes, purifyHostElement) {
  if (typeof trustedTypes !== 'object' || typeof trustedTypes.createPolicy !== 'function') {
    return null;
  }
  // Allow the callers to control the unique policy name
  // by adding a data-tt-policy-suffix to the script element with the DOMPurify.
  // Policy creation with duplicate names throws in Trusted Types.
  let suffix = null;
  const ATTR_NAME = 'data-tt-policy-suffix';
  if (purifyHostElement && purifyHostElement.hasAttribute(ATTR_NAME)) {
    suffix = purifyHostElement.getAttribute(ATTR_NAME);
  }
  const policyName = 'dompurify' + (suffix ? '#' + suffix : '');
  try {
    return trustedTypes.createPolicy(policyName, {
      createHTML(html) {
        return html;
      },
      createScriptURL(scriptUrl) {
        return scriptUrl;
      }
    });
  } catch (_) {
    // Policy creation failed (most likely another DOMPurify script has
    // already run). Skip creating the policy, as this will only cause errors
    // if TT are enforced.
    console.warn('TrustedTypes policy ' + policyName + ' could not be created.');
    return null;
  }
};
const _createHooksMap = function _createHooksMap() {
  return {
    afterSanitizeAttributes: [],
    afterSanitizeElements: [],
    afterSanitizeShadowDOM: [],
    beforeSanitizeAttributes: [],
    beforeSanitizeElements: [],
    beforeSanitizeShadowDOM: [],
    uponSanitizeAttribute: [],
    uponSanitizeElement: [],
    uponSanitizeShadowNode: []
  };
};
function createDOMPurify() {
  let window = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : getGlobal();
  const DOMPurify = root => createDOMPurify(root);
  DOMPurify.version = '3.4.2';
  DOMPurify.removed = [];
  if (!window || !window.document || window.document.nodeType !== NODE_TYPE.document || !window.Element) {
    // Not running in a browser, provide a factory function
    // so that you can pass your own Window
    DOMPurify.isSupported = false;
    return DOMPurify;
  }
  let {
    document
  } = window;
  const originalDocument = document;
  const currentScript = originalDocument.currentScript;
  const {
    DocumentFragment,
    HTMLTemplateElement,
    Node,
    Element,
    NodeFilter,
    NamedNodeMap = window.NamedNodeMap || window.MozNamedAttrMap,
    HTMLFormElement,
    DOMParser,
    trustedTypes
  } = window;
  const ElementPrototype = Element.prototype;
  const cloneNode = lookupGetter(ElementPrototype, 'cloneNode');
  const remove = lookupGetter(ElementPrototype, 'remove');
  const getNextSibling = lookupGetter(ElementPrototype, 'nextSibling');
  const getChildNodes = lookupGetter(ElementPrototype, 'childNodes');
  const getParentNode = lookupGetter(ElementPrototype, 'parentNode');
  // As per issue #47, the web-components registry is inherited by a
  // new document created via createHTMLDocument. As per the spec
  // (http://w3c.github.io/webcomponents/spec/custom/#creating-and-passing-registries)
  // a new empty registry is used when creating a template contents owner
  // document, so we use that as our parent document to ensure nothing
  // is inherited.
  if (typeof HTMLTemplateElement === 'function') {
    const template = document.createElement('template');
    if (template.content && template.content.ownerDocument) {
      document = template.content.ownerDocument;
    }
  }
  let trustedTypesPolicy;
  let emptyHTML = '';
  const {
    implementation,
    createNodeIterator,
    createDocumentFragment,
    getElementsByTagName
  } = document;
  const {
    importNode
  } = originalDocument;
  let hooks = _createHooksMap();
  /**
   * Expose whether this browser supports running the full DOMPurify.
   */
  DOMPurify.isSupported = typeof entries === 'function' && typeof getParentNode === 'function' && implementation && implementation.createHTMLDocument !== undefined;
  const {
    MUSTACHE_EXPR,
    ERB_EXPR,
    TMPLIT_EXPR,
    DATA_ATTR,
    ARIA_ATTR,
    IS_SCRIPT_OR_DATA,
    ATTR_WHITESPACE,
    CUSTOM_ELEMENT
  } = EXPRESSIONS;
  let {
    IS_ALLOWED_URI: IS_ALLOWED_URI$1
  } = EXPRESSIONS;
  /**
   * We consider the elements and attributes below to be safe. Ideally
   * don't add any new ones but feel free to remove unwanted ones.
   */
  /* allowed element names */
  let ALLOWED_TAGS = null;
  const DEFAULT_ALLOWED_TAGS = addToSet({}, [...html$1, ...svg$1, ...svgFilters, ...mathMl$1, ...purify_es_text]);
  /* Allowed attribute names */
  let ALLOWED_ATTR = null;
  const DEFAULT_ALLOWED_ATTR = addToSet({}, [...html, ...svg, ...mathMl, ...xml]);
  /*
   * Configure how DOMPurify should handle custom elements and their attributes as well as customized built-in elements.
   * @property {RegExp|Function|null} tagNameCheck one of [null, regexPattern, predicate]. Default: `null` (disallow any custom elements)
   * @property {RegExp|Function|null} attributeNameCheck one of [null, regexPattern, predicate]. Default: `null` (disallow any attributes not on the allow list)
   * @property {boolean} allowCustomizedBuiltInElements allow custom elements derived from built-ins if they pass CUSTOM_ELEMENT_HANDLING.tagNameCheck. Default: `false`.
   */
  let CUSTOM_ELEMENT_HANDLING = Object.seal(create(null, {
    tagNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    allowCustomizedBuiltInElements: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: false
    }
  }));
  /* Explicitly forbidden tags (overrides ALLOWED_TAGS/ADD_TAGS) */
  let FORBID_TAGS = null;
  /* Explicitly forbidden attributes (overrides ALLOWED_ATTR/ADD_ATTR) */
  let FORBID_ATTR = null;
  /* Config object to store ADD_TAGS/ADD_ATTR functions (when used as functions) */
  const EXTRA_ELEMENT_HANDLING = Object.seal(create(null, {
    tagCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    }
  }));
  /* Decide if ARIA attributes are okay */
  let ALLOW_ARIA_ATTR = true;
  /* Decide if custom data attributes are okay */
  let ALLOW_DATA_ATTR = true;
  /* Decide if unknown protocols are okay */
  let ALLOW_UNKNOWN_PROTOCOLS = false;
  /* Decide if self-closing tags in attributes are allowed.
   * Usually removed due to a mXSS issue in jQuery 3.0 */
  let ALLOW_SELF_CLOSE_IN_ATTR = true;
  /* Output should be safe for common template engines.
   * This means, DOMPurify removes data attributes, mustaches and ERB
   */
  let SAFE_FOR_TEMPLATES = false;
  /* Output should be safe even for XML used within HTML and alike.
   * This means, DOMPurify removes comments when containing risky content.
   */
  let SAFE_FOR_XML = true;
  /* Decide if document with <html>... should be returned */
  let WHOLE_DOCUMENT = false;
  /* Track whether config is already set on this instance of DOMPurify. */
  let SET_CONFIG = false;
  /* Decide if all elements (e.g. style, script) must be children of
   * document.body. By default, browsers might move them to document.head */
  let FORCE_BODY = false;
  /* Decide if a DOM `HTMLBodyElement` should be returned, instead of a html
   * string (or a TrustedHTML object if Trusted Types are supported).
   * If `WHOLE_DOCUMENT` is enabled a `HTMLHtmlElement` will be returned instead
   */
  let RETURN_DOM = false;
  /* Decide if a DOM `DocumentFragment` should be returned, instead of a html
   * string  (or a TrustedHTML object if Trusted Types are supported) */
  let RETURN_DOM_FRAGMENT = false;
  /* Try to return a Trusted Type object instead of a string, return a string in
   * case Trusted Types are not supported  */
  let RETURN_TRUSTED_TYPE = false;
  /* Output should be free from DOM clobbering attacks?
   * This sanitizes markups named with colliding, clobberable built-in DOM APIs.
   */
  let SANITIZE_DOM = true;
  /* Achieve full DOM Clobbering protection by isolating the namespace of named
   * properties and JS variables, mitigating attacks that abuse the HTML/DOM spec rules.
   *
   * HTML/DOM spec rules that enable DOM Clobbering:
   *   - Named Access on Window (§7.3.3)
   *   - DOM Tree Accessors (§3.1.5)
   *   - Form Element Parent-Child Relations (§4.10.3)
   *   - Iframe srcdoc / Nested WindowProxies (§4.8.5)
   *   - HTMLCollection (§4.2.10.2)
   *
   * Namespace isolation is implemented by prefixing `id` and `name` attributes
   * with a constant string, i.e., `user-content-`
   */
  let SANITIZE_NAMED_PROPS = false;
  const SANITIZE_NAMED_PROPS_PREFIX = 'user-content-';
  /* Keep element content when removing element? */
  let KEEP_CONTENT = true;
  /* If a `Node` is passed to sanitize(), then performs sanitization in-place instead
   * of importing it into a new Document and returning a sanitized copy */
  let IN_PLACE = false;
  /* Allow usage of profiles like html, svg and mathMl */
  let USE_PROFILES = {};
  /* Tags to ignore content of when KEEP_CONTENT is true */
  let FORBID_CONTENTS = null;
  const DEFAULT_FORBID_CONTENTS = addToSet({}, ['annotation-xml', 'audio', 'colgroup', 'desc', 'foreignobject', 'head', 'iframe', 'math', 'mi', 'mn', 'mo', 'ms', 'mtext', 'noembed', 'noframes', 'noscript', 'plaintext', 'script', 'style', 'svg', 'template', 'thead', 'title', 'video', 'xmp']);
  /* Tags that are safe for data: URIs */
  let DATA_URI_TAGS = null;
  const DEFAULT_DATA_URI_TAGS = addToSet({}, ['audio', 'video', 'img', 'source', 'image', 'track']);
  /* Attributes safe for values like "javascript:" */
  let URI_SAFE_ATTRIBUTES = null;
  const DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, ['alt', 'class', 'for', 'id', 'label', 'name', 'pattern', 'placeholder', 'role', 'summary', 'title', 'value', 'style', 'xmlns']);
  const MATHML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
  /* Document namespace */
  let NAMESPACE = HTML_NAMESPACE;
  let IS_EMPTY_INPUT = false;
  /* Allowed XHTML+XML namespaces */
  let ALLOWED_NAMESPACES = null;
  const DEFAULT_ALLOWED_NAMESPACES = addToSet({}, [MATHML_NAMESPACE, SVG_NAMESPACE, HTML_NAMESPACE], stringToString);
  let MATHML_TEXT_INTEGRATION_POINTS = addToSet({}, ['mi', 'mo', 'mn', 'ms', 'mtext']);
  let HTML_INTEGRATION_POINTS = addToSet({}, ['annotation-xml']);
  // Certain elements are allowed in both SVG and HTML
  // namespace. We need to specify them explicitly
  // so that they don't get erroneously deleted from
  // HTML namespace.
  const COMMON_SVG_AND_HTML_ELEMENTS = addToSet({}, ['title', 'style', 'font', 'a', 'script']);
  /* Parsing of strict XHTML documents */
  let PARSER_MEDIA_TYPE = null;
  const SUPPORTED_PARSER_MEDIA_TYPES = ['application/xhtml+xml', 'text/html'];
  const DEFAULT_PARSER_MEDIA_TYPE = 'text/html';
  let transformCaseFunc = null;
  /* Keep a reference to config to pass to hooks */
  let CONFIG = null;
  /* Ideally, do not touch anything below this line */
  /* ______________________________________________ */
  const formElement = document.createElement('form');
  const isRegexOrFunction = function isRegexOrFunction(testValue) {
    return testValue instanceof RegExp || testValue instanceof Function;
  };
  /**
   * _parseConfig
   *
   * @param cfg optional config literal
   */
  // eslint-disable-next-line complexity
  const _parseConfig = function _parseConfig() {
    let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    if (CONFIG && CONFIG === cfg) {
      return;
    }
    /* Shield configuration object from tampering */
    if (!cfg || typeof cfg !== 'object') {
      cfg = {};
    }
    /* Shield configuration object from prototype pollution */
    cfg = clone(cfg);
    PARSER_MEDIA_TYPE =
    // eslint-disable-next-line unicorn/prefer-includes
    SUPPORTED_PARSER_MEDIA_TYPES.indexOf(cfg.PARSER_MEDIA_TYPE) === -1 ? DEFAULT_PARSER_MEDIA_TYPE : cfg.PARSER_MEDIA_TYPE;
    // HTML tags and attributes are not case-sensitive, converting to lowercase. Keeping XHTML as is.
    transformCaseFunc = PARSER_MEDIA_TYPE === 'application/xhtml+xml' ? stringToString : stringToLowerCase;
    /* Set configuration parameters */
    ALLOWED_TAGS = objectHasOwnProperty(cfg, 'ALLOWED_TAGS') && arrayIsArray(cfg.ALLOWED_TAGS) ? addToSet({}, cfg.ALLOWED_TAGS, transformCaseFunc) : DEFAULT_ALLOWED_TAGS;
    ALLOWED_ATTR = objectHasOwnProperty(cfg, 'ALLOWED_ATTR') && arrayIsArray(cfg.ALLOWED_ATTR) ? addToSet({}, cfg.ALLOWED_ATTR, transformCaseFunc) : DEFAULT_ALLOWED_ATTR;
    ALLOWED_NAMESPACES = objectHasOwnProperty(cfg, 'ALLOWED_NAMESPACES') && arrayIsArray(cfg.ALLOWED_NAMESPACES) ? addToSet({}, cfg.ALLOWED_NAMESPACES, stringToString) : DEFAULT_ALLOWED_NAMESPACES;
    URI_SAFE_ATTRIBUTES = objectHasOwnProperty(cfg, 'ADD_URI_SAFE_ATTR') && arrayIsArray(cfg.ADD_URI_SAFE_ATTR) ? addToSet(clone(DEFAULT_URI_SAFE_ATTRIBUTES), cfg.ADD_URI_SAFE_ATTR, transformCaseFunc) : DEFAULT_URI_SAFE_ATTRIBUTES;
    DATA_URI_TAGS = objectHasOwnProperty(cfg, 'ADD_DATA_URI_TAGS') && arrayIsArray(cfg.ADD_DATA_URI_TAGS) ? addToSet(clone(DEFAULT_DATA_URI_TAGS), cfg.ADD_DATA_URI_TAGS, transformCaseFunc) : DEFAULT_DATA_URI_TAGS;
    FORBID_CONTENTS = objectHasOwnProperty(cfg, 'FORBID_CONTENTS') && arrayIsArray(cfg.FORBID_CONTENTS) ? addToSet({}, cfg.FORBID_CONTENTS, transformCaseFunc) : DEFAULT_FORBID_CONTENTS;
    FORBID_TAGS = objectHasOwnProperty(cfg, 'FORBID_TAGS') && arrayIsArray(cfg.FORBID_TAGS) ? addToSet({}, cfg.FORBID_TAGS, transformCaseFunc) : clone({});
    FORBID_ATTR = objectHasOwnProperty(cfg, 'FORBID_ATTR') && arrayIsArray(cfg.FORBID_ATTR) ? addToSet({}, cfg.FORBID_ATTR, transformCaseFunc) : clone({});
    USE_PROFILES = objectHasOwnProperty(cfg, 'USE_PROFILES') ? cfg.USE_PROFILES && typeof cfg.USE_PROFILES === 'object' ? clone(cfg.USE_PROFILES) : cfg.USE_PROFILES : false;
    ALLOW_ARIA_ATTR = cfg.ALLOW_ARIA_ATTR !== false; // Default true
    ALLOW_DATA_ATTR = cfg.ALLOW_DATA_ATTR !== false; // Default true
    ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false; // Default false
    ALLOW_SELF_CLOSE_IN_ATTR = cfg.ALLOW_SELF_CLOSE_IN_ATTR !== false; // Default true
    SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false; // Default false
    SAFE_FOR_XML = cfg.SAFE_FOR_XML !== false; // Default true
    WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false; // Default false
    RETURN_DOM = cfg.RETURN_DOM || false; // Default false
    RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false; // Default false
    RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false; // Default false
    FORCE_BODY = cfg.FORCE_BODY || false; // Default false
    SANITIZE_DOM = cfg.SANITIZE_DOM !== false; // Default true
    SANITIZE_NAMED_PROPS = cfg.SANITIZE_NAMED_PROPS || false; // Default false
    KEEP_CONTENT = cfg.KEEP_CONTENT !== false; // Default true
    IN_PLACE = cfg.IN_PLACE || false; // Default false
    IS_ALLOWED_URI$1 = isRegex(cfg.ALLOWED_URI_REGEXP) ? cfg.ALLOWED_URI_REGEXP : IS_ALLOWED_URI; // Default regexp
    NAMESPACE = typeof cfg.NAMESPACE === 'string' ? cfg.NAMESPACE : HTML_NAMESPACE; // Default HTML namespace
    MATHML_TEXT_INTEGRATION_POINTS = objectHasOwnProperty(cfg, 'MATHML_TEXT_INTEGRATION_POINTS') && cfg.MATHML_TEXT_INTEGRATION_POINTS && typeof cfg.MATHML_TEXT_INTEGRATION_POINTS === 'object' ? clone(cfg.MATHML_TEXT_INTEGRATION_POINTS) : addToSet({}, ['mi', 'mo', 'mn', 'ms', 'mtext']); // Default built-in map
    HTML_INTEGRATION_POINTS = objectHasOwnProperty(cfg, 'HTML_INTEGRATION_POINTS') && cfg.HTML_INTEGRATION_POINTS && typeof cfg.HTML_INTEGRATION_POINTS === 'object' ? clone(cfg.HTML_INTEGRATION_POINTS) : addToSet({}, ['annotation-xml']); // Default built-in map
    const customElementHandling = objectHasOwnProperty(cfg, 'CUSTOM_ELEMENT_HANDLING') && cfg.CUSTOM_ELEMENT_HANDLING && typeof cfg.CUSTOM_ELEMENT_HANDLING === 'object' ? clone(cfg.CUSTOM_ELEMENT_HANDLING) : create(null);
    CUSTOM_ELEMENT_HANDLING = create(null);
    if (objectHasOwnProperty(customElementHandling, 'tagNameCheck') && isRegexOrFunction(customElementHandling.tagNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.tagNameCheck = customElementHandling.tagNameCheck; // Default undefined
    }
    if (objectHasOwnProperty(customElementHandling, 'attributeNameCheck') && isRegexOrFunction(customElementHandling.attributeNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.attributeNameCheck = customElementHandling.attributeNameCheck; // Default undefined
    }
    if (objectHasOwnProperty(customElementHandling, 'allowCustomizedBuiltInElements') && typeof customElementHandling.allowCustomizedBuiltInElements === 'boolean') {
      CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements = customElementHandling.allowCustomizedBuiltInElements; // Default undefined
    }
    if (SAFE_FOR_TEMPLATES) {
      ALLOW_DATA_ATTR = false;
    }
    if (RETURN_DOM_FRAGMENT) {
      RETURN_DOM = true;
    }
    /* Parse profile info */
    if (USE_PROFILES) {
      ALLOWED_TAGS = addToSet({}, purify_es_text);
      ALLOWED_ATTR = create(null);
      if (USE_PROFILES.html === true) {
        addToSet(ALLOWED_TAGS, html$1);
        addToSet(ALLOWED_ATTR, html);
      }
      if (USE_PROFILES.svg === true) {
        addToSet(ALLOWED_TAGS, svg$1);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }
      if (USE_PROFILES.svgFilters === true) {
        addToSet(ALLOWED_TAGS, svgFilters);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }
      if (USE_PROFILES.mathMl === true) {
        addToSet(ALLOWED_TAGS, mathMl$1);
        addToSet(ALLOWED_ATTR, mathMl);
        addToSet(ALLOWED_ATTR, xml);
      }
    }
    /* Always reset function-based ADD_TAGS / ADD_ATTR checks to prevent
     * leaking across calls when switching from function to array config */
    EXTRA_ELEMENT_HANDLING.tagCheck = null;
    EXTRA_ELEMENT_HANDLING.attributeCheck = null;
    /* Merge configuration parameters */
    if (objectHasOwnProperty(cfg, 'ADD_TAGS')) {
      if (typeof cfg.ADD_TAGS === 'function') {
        EXTRA_ELEMENT_HANDLING.tagCheck = cfg.ADD_TAGS;
      } else if (arrayIsArray(cfg.ADD_TAGS)) {
        if (ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS) {
          ALLOWED_TAGS = clone(ALLOWED_TAGS);
        }
        addToSet(ALLOWED_TAGS, cfg.ADD_TAGS, transformCaseFunc);
      }
    }
    if (objectHasOwnProperty(cfg, 'ADD_ATTR')) {
      if (typeof cfg.ADD_ATTR === 'function') {
        EXTRA_ELEMENT_HANDLING.attributeCheck = cfg.ADD_ATTR;
      } else if (arrayIsArray(cfg.ADD_ATTR)) {
        if (ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR) {
          ALLOWED_ATTR = clone(ALLOWED_ATTR);
        }
        addToSet(ALLOWED_ATTR, cfg.ADD_ATTR, transformCaseFunc);
      }
    }
    if (objectHasOwnProperty(cfg, 'ADD_URI_SAFE_ATTR') && arrayIsArray(cfg.ADD_URI_SAFE_ATTR)) {
      addToSet(URI_SAFE_ATTRIBUTES, cfg.ADD_URI_SAFE_ATTR, transformCaseFunc);
    }
    if (objectHasOwnProperty(cfg, 'FORBID_CONTENTS') && arrayIsArray(cfg.FORBID_CONTENTS)) {
      if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
        FORBID_CONTENTS = clone(FORBID_CONTENTS);
      }
      addToSet(FORBID_CONTENTS, cfg.FORBID_CONTENTS, transformCaseFunc);
    }
    if (objectHasOwnProperty(cfg, 'ADD_FORBID_CONTENTS') && arrayIsArray(cfg.ADD_FORBID_CONTENTS)) {
      if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
        FORBID_CONTENTS = clone(FORBID_CONTENTS);
      }
      addToSet(FORBID_CONTENTS, cfg.ADD_FORBID_CONTENTS, transformCaseFunc);
    }
    /* Add #text in case KEEP_CONTENT is set to true */
    if (KEEP_CONTENT) {
      ALLOWED_TAGS['#text'] = true;
    }
    /* Add html, head and body to ALLOWED_TAGS in case WHOLE_DOCUMENT is true */
    if (WHOLE_DOCUMENT) {
      addToSet(ALLOWED_TAGS, ['html', 'head', 'body']);
    }
    /* Add tbody to ALLOWED_TAGS in case tables are permitted, see #286, #365 */
    if (ALLOWED_TAGS.table) {
      addToSet(ALLOWED_TAGS, ['tbody']);
      delete FORBID_TAGS.tbody;
    }
    if (cfg.TRUSTED_TYPES_POLICY) {
      if (typeof cfg.TRUSTED_TYPES_POLICY.createHTML !== 'function') {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');
      }
      if (typeof cfg.TRUSTED_TYPES_POLICY.createScriptURL !== 'function') {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');
      }
      // Overwrite existing TrustedTypes policy.
      trustedTypesPolicy = cfg.TRUSTED_TYPES_POLICY;
      // Sign local variables required by `sanitize`.
      emptyHTML = trustedTypesPolicy.createHTML('');
    } else {
      // Uninitialized policy, attempt to initialize the internal dompurify policy.
      if (trustedTypesPolicy === undefined) {
        trustedTypesPolicy = _createTrustedTypesPolicy(trustedTypes, currentScript);
      }
      // If creating the internal policy succeeded sign internal variables.
      if (trustedTypesPolicy !== null && typeof emptyHTML === 'string') {
        emptyHTML = trustedTypesPolicy.createHTML('');
      }
    }
    // Prevent further manipulation of configuration.
    // Not available in IE8, Safari 5, etc.
    if (freeze) {
      freeze(cfg);
    }
    CONFIG = cfg;
  };
  /* Keep track of all possible SVG and MathML tags
   * so that we can perform the namespace checks
   * correctly. */
  const ALL_SVG_TAGS = addToSet({}, [...svg$1, ...svgFilters, ...svgDisallowed]);
  const ALL_MATHML_TAGS = addToSet({}, [...mathMl$1, ...mathMlDisallowed]);
  /**
   * @param element a DOM element whose namespace is being checked
   * @returns Return false if the element has a
   *  namespace that a spec-compliant parser would never
   *  return. Return true otherwise.
   */
  const _checkValidNamespace = function _checkValidNamespace(element) {
    let parent = getParentNode(element);
    // In JSDOM, if we're inside shadow DOM, then parentNode
    // can be null. We just simulate parent in this case.
    if (!parent || !parent.tagName) {
      parent = {
        namespaceURI: NAMESPACE,
        tagName: 'template'
      };
    }
    const tagName = stringToLowerCase(element.tagName);
    const parentTagName = stringToLowerCase(parent.tagName);
    if (!ALLOWED_NAMESPACES[element.namespaceURI]) {
      return false;
    }
    if (element.namespaceURI === SVG_NAMESPACE) {
      // The only way to switch from HTML namespace to SVG
      // is via <svg>. If it happens via any other tag, then
      // it should be killed.
      if (parent.namespaceURI === HTML_NAMESPACE) {
        return tagName === 'svg';
      }
      // The only way to switch from MathML to SVG is via`
      // svg if parent is either <annotation-xml> or MathML
      // text integration points.
      if (parent.namespaceURI === MATHML_NAMESPACE) {
        return tagName === 'svg' && (parentTagName === 'annotation-xml' || MATHML_TEXT_INTEGRATION_POINTS[parentTagName]);
      }
      // We only allow elements that are defined in SVG
      // spec. All others are disallowed in SVG namespace.
      return Boolean(ALL_SVG_TAGS[tagName]);
    }
    if (element.namespaceURI === MATHML_NAMESPACE) {
      // The only way to switch from HTML namespace to MathML
      // is via <math>. If it happens via any other tag, then
      // it should be killed.
      if (parent.namespaceURI === HTML_NAMESPACE) {
        return tagName === 'math';
      }
      // The only way to switch from SVG to MathML is via
      // <math> and HTML integration points
      if (parent.namespaceURI === SVG_NAMESPACE) {
        return tagName === 'math' && HTML_INTEGRATION_POINTS[parentTagName];
      }
      // We only allow elements that are defined in MathML
      // spec. All others are disallowed in MathML namespace.
      return Boolean(ALL_MATHML_TAGS[tagName]);
    }
    if (element.namespaceURI === HTML_NAMESPACE) {
      // The only way to switch from SVG to HTML is via
      // HTML integration points, and from MathML to HTML
      // is via MathML text integration points
      if (parent.namespaceURI === SVG_NAMESPACE && !HTML_INTEGRATION_POINTS[parentTagName]) {
        return false;
      }
      if (parent.namespaceURI === MATHML_NAMESPACE && !MATHML_TEXT_INTEGRATION_POINTS[parentTagName]) {
        return false;
      }
      // We disallow tags that are specific for MathML
      // or SVG and should never appear in HTML namespace
      return !ALL_MATHML_TAGS[tagName] && (COMMON_SVG_AND_HTML_ELEMENTS[tagName] || !ALL_SVG_TAGS[tagName]);
    }
    // For XHTML and XML documents that support custom namespaces
    if (PARSER_MEDIA_TYPE === 'application/xhtml+xml' && ALLOWED_NAMESPACES[element.namespaceURI]) {
      return true;
    }
    // The code should never reach this place (this means
    // that the element somehow got namespace that is not
    // HTML, SVG, MathML or allowed via ALLOWED_NAMESPACES).
    // Return false just in case.
    return false;
  };
  /**
   * _forceRemove
   *
   * @param node a DOM node
   */
  const _forceRemove = function _forceRemove(node) {
    arrayPush(DOMPurify.removed, {
      element: node
    });
    try {
      // eslint-disable-next-line unicorn/prefer-dom-node-remove
      getParentNode(node).removeChild(node);
    } catch (_) {
      remove(node);
    }
  };
  /**
   * _removeAttribute
   *
   * @param name an Attribute name
   * @param element a DOM node
   */
  const _removeAttribute = function _removeAttribute(name, element) {
    try {
      arrayPush(DOMPurify.removed, {
        attribute: element.getAttributeNode(name),
        from: element
      });
    } catch (_) {
      arrayPush(DOMPurify.removed, {
        attribute: null,
        from: element
      });
    }
    element.removeAttribute(name);
    // We void attribute values for unremovable "is" attributes
    if (name === 'is') {
      if (RETURN_DOM || RETURN_DOM_FRAGMENT) {
        try {
          _forceRemove(element);
        } catch (_) {}
      } else {
        try {
          element.setAttribute(name, '');
        } catch (_) {}
      }
    }
  };
  /**
   * _initDocument
   *
   * @param dirty - a string of dirty markup
   * @return a DOM, filled with the dirty markup
   */
  const _initDocument = function _initDocument(dirty) {
    /* Create a HTML document */
    let doc = null;
    let leadingWhitespace = null;
    if (FORCE_BODY) {
      dirty = '<remove></remove>' + dirty;
    } else {
      /* If FORCE_BODY isn't used, leading whitespace needs to be preserved manually */
      const matches = stringMatch(dirty, /^[\r\n\t ]+/);
      leadingWhitespace = matches && matches[0];
    }
    if (PARSER_MEDIA_TYPE === 'application/xhtml+xml' && NAMESPACE === HTML_NAMESPACE) {
      // Root of XHTML doc must contain xmlns declaration (see https://www.w3.org/TR/xhtml1/normative.html#strict)
      dirty = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + dirty + '</body></html>';
    }
    const dirtyPayload = trustedTypesPolicy ? trustedTypesPolicy.createHTML(dirty) : dirty;
    /*
     * Use the DOMParser API by default, fallback later if needs be
     * DOMParser not work for svg when has multiple root element.
     */
    if (NAMESPACE === HTML_NAMESPACE) {
      try {
        doc = new DOMParser().parseFromString(dirtyPayload, PARSER_MEDIA_TYPE);
      } catch (_) {}
    }
    /* Use createHTMLDocument in case DOMParser is not available */
    if (!doc || !doc.documentElement) {
      doc = implementation.createDocument(NAMESPACE, 'template', null);
      try {
        doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;
      } catch (_) {
        // Syntax error if dirtyPayload is invalid xml
      }
    }
    const body = doc.body || doc.documentElement;
    if (dirty && leadingWhitespace) {
      body.insertBefore(document.createTextNode(leadingWhitespace), body.childNodes[0] || null);
    }
    /* Work on whole document or just its body */
    if (NAMESPACE === HTML_NAMESPACE) {
      return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? 'html' : 'body')[0];
    }
    return WHOLE_DOCUMENT ? doc.documentElement : body;
  };
  /**
   * Creates a NodeIterator object that you can use to traverse filtered lists of nodes or elements in a document.
   *
   * @param root The root element or node to start traversing on.
   * @return The created NodeIterator
   */
  const _createNodeIterator = function _createNodeIterator(root) {
    return createNodeIterator.call(root.ownerDocument || root, root,
    // eslint-disable-next-line no-bitwise
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION, null);
  };
  /**
   * _isClobbered
   *
   * @param element element to check for clobbering attacks
   * @return true if clobbered, false if safe
   */
  const _isClobbered = function _isClobbered(element) {
    return element instanceof HTMLFormElement && (typeof element.nodeName !== 'string' || typeof element.textContent !== 'string' || typeof element.removeChild !== 'function' || !(element.attributes instanceof NamedNodeMap) || typeof element.removeAttribute !== 'function' || typeof element.setAttribute !== 'function' || typeof element.namespaceURI !== 'string' || typeof element.insertBefore !== 'function' || typeof element.hasChildNodes !== 'function');
  };
  /**
   * Checks whether the given object is a DOM node.
   *
   * @param value object to check whether it's a DOM node
   * @return true is object is a DOM node
   */
  const _isNode = function _isNode(value) {
    return typeof Node === 'function' && value instanceof Node;
  };
  function _executeHooks(hooks, currentNode, data) {
    arrayForEach(hooks, hook => {
      hook.call(DOMPurify, currentNode, data, CONFIG);
    });
  }
  /**
   * _sanitizeElements
   *
   * @protect nodeName
   * @protect textContent
   * @protect removeChild
   * @param currentNode to check for permission to exist
   * @return true if node was killed, false if left alive
   */
  const _sanitizeElements = function _sanitizeElements(currentNode) {
    let content = null;
    /* Execute a hook if present */
    _executeHooks(hooks.beforeSanitizeElements, currentNode, null);
    /* Check if element is clobbered or can clobber */
    if (_isClobbered(currentNode)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Now let's check the element's type and name */
    const tagName = transformCaseFunc(currentNode.nodeName);
    /* Execute a hook if present */
    _executeHooks(hooks.uponSanitizeElement, currentNode, {
      tagName,
      allowedTags: ALLOWED_TAGS
    });
    /* Detect mXSS attempts abusing namespace confusion */
    if (SAFE_FOR_XML && currentNode.hasChildNodes() && !_isNode(currentNode.firstElementChild) && regExpTest(/<[/\w!]/g, currentNode.innerHTML) && regExpTest(/<[/\w!]/g, currentNode.textContent)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Remove risky CSS construction leading to mXSS */
    if (SAFE_FOR_XML && currentNode.namespaceURI === HTML_NAMESPACE && tagName === 'style' && _isNode(currentNode.firstElementChild)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Remove any occurrence of processing instructions */
    if (currentNode.nodeType === NODE_TYPE.progressingInstruction) {
      _forceRemove(currentNode);
      return true;
    }
    /* Remove any kind of possibly harmful comments */
    if (SAFE_FOR_XML && currentNode.nodeType === NODE_TYPE.comment && regExpTest(/<[/\w]/g, currentNode.data)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Remove element if anything forbids its presence */
    if (FORBID_TAGS[tagName] || !(EXTRA_ELEMENT_HANDLING.tagCheck instanceof Function && EXTRA_ELEMENT_HANDLING.tagCheck(tagName)) && !ALLOWED_TAGS[tagName]) {
      /* Check if we have a custom element to handle */
      if (!FORBID_TAGS[tagName] && _isBasicCustomElement(tagName)) {
        if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, tagName)) {
          return false;
        }
        if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(tagName)) {
          return false;
        }
      }
      /* Keep content except for bad-listed elements */
      if (KEEP_CONTENT && !FORBID_CONTENTS[tagName]) {
        const parentNode = getParentNode(currentNode) || currentNode.parentNode;
        const childNodes = getChildNodes(currentNode) || currentNode.childNodes;
        if (childNodes && parentNode) {
          const childCount = childNodes.length;
          for (let i = childCount - 1; i >= 0; --i) {
            const childClone = cloneNode(childNodes[i], true);
            parentNode.insertBefore(childClone, getNextSibling(currentNode));
          }
        }
      }
      _forceRemove(currentNode);
      return true;
    }
    /* Check whether element has a valid namespace */
    if (currentNode instanceof Element && !_checkValidNamespace(currentNode)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Make sure that older browsers don't get fallback-tag mXSS */
    if ((tagName === 'noscript' || tagName === 'noembed' || tagName === 'noframes') && regExpTest(/<\/no(script|embed|frames)/i, currentNode.innerHTML)) {
      _forceRemove(currentNode);
      return true;
    }
    /* Sanitize element content to be template-safe */
    if (SAFE_FOR_TEMPLATES && currentNode.nodeType === NODE_TYPE.text) {
      /* Get the element's text content */
      content = currentNode.textContent;
      arrayForEach([MUSTACHE_EXPR, ERB_EXPR, TMPLIT_EXPR], expr => {
        content = stringReplace(content, expr, ' ');
      });
      if (currentNode.textContent !== content) {
        arrayPush(DOMPurify.removed, {
          element: currentNode.cloneNode()
        });
        currentNode.textContent = content;
      }
    }
    /* Execute a hook if present */
    _executeHooks(hooks.afterSanitizeElements, currentNode, null);
    return false;
  };
  /**
   * _isValidAttribute
   *
   * @param lcTag Lowercase tag name of containing element.
   * @param lcName Lowercase attribute name.
   * @param value Attribute value.
   * @return Returns true if `value` is valid, otherwise false.
   */
  // eslint-disable-next-line complexity
  const _isValidAttribute = function _isValidAttribute(lcTag, lcName, value) {
    /* FORBID_ATTR must always win, even if ADD_ATTR predicate would allow it */
    if (FORBID_ATTR[lcName]) {
      return false;
    }
    /* Make sure attribute cannot clobber */
    if (SANITIZE_DOM && (lcName === 'id' || lcName === 'name') && (value in document || value in formElement)) {
      return false;
    }
    const nameIsPermitted = ALLOWED_ATTR[lcName] || EXTRA_ELEMENT_HANDLING.attributeCheck instanceof Function && EXTRA_ELEMENT_HANDLING.attributeCheck(lcName, lcTag);
    /* Allow valid data-* attributes: At least one character after "-"
        (https://html.spec.whatwg.org/multipage/dom.html#embedding-custom-non-visible-data-with-the-data-*-attributes)
        XML-compatible (https://html.spec.whatwg.org/multipage/infrastructure.html#xml-compatible and http://www.w3.org/TR/xml/#d0e804)
        We don't need to check the value; it's always URI safe. */
    if (ALLOW_DATA_ATTR && !FORBID_ATTR[lcName] && regExpTest(DATA_ATTR, lcName)) ; else if (ALLOW_ARIA_ATTR && regExpTest(ARIA_ATTR, lcName)) ; else if (!nameIsPermitted || FORBID_ATTR[lcName]) {
      if (
      // First condition does a very basic check if a) it's basically a valid custom element tagname AND
      // b) if the tagName passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
      // and c) if the attribute name passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.attributeNameCheck
      _isBasicCustomElement(lcTag) && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, lcTag) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(lcTag)) && (CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.attributeNameCheck, lcName) || CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.attributeNameCheck(lcName, lcTag)) ||
      // Alternative, second condition checks if it's an `is`-attribute, AND
      // the value passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
      lcName === 'is' && CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, value) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(value))) ; else {
        return false;
      }
      /* Check value is safe. First, is attr inert? If so, is safe */
    } else if (URI_SAFE_ATTRIBUTES[lcName]) ; else if (regExpTest(IS_ALLOWED_URI$1, stringReplace(value, ATTR_WHITESPACE, ''))) ; else if ((lcName === 'src' || lcName === 'xlink:href' || lcName === 'href') && lcTag !== 'script' && stringIndexOf(value, 'data:') === 0 && DATA_URI_TAGS[lcTag]) ; else if (ALLOW_UNKNOWN_PROTOCOLS && !regExpTest(IS_SCRIPT_OR_DATA, stringReplace(value, ATTR_WHITESPACE, ''))) ; else if (value) {
      return false;
    } else ;
    return true;
  };
  /* Names the HTML spec reserves from valid-custom-element-name; these must
   * never be treated as basic custom elements even when a permissive
   * CUSTOM_ELEMENT_HANDLING.tagNameCheck is configured. */
  const RESERVED_CUSTOM_ELEMENT_NAMES = addToSet({}, ['annotation-xml', 'color-profile', 'font-face', 'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri', 'missing-glyph']);
  /**
   * _isBasicCustomElement
   * checks if at least one dash is included in tagName, and it's not the first char
   * for more sophisticated checking see https://github.com/sindresorhus/validate-element-name
   *
   * @param tagName name of the tag of the node to sanitize
   * @returns Returns true if the tag name meets the basic criteria for a custom element, otherwise false.
   */
  const _isBasicCustomElement = function _isBasicCustomElement(tagName) {
    return !RESERVED_CUSTOM_ELEMENT_NAMES[stringToLowerCase(tagName)] && regExpTest(CUSTOM_ELEMENT, tagName);
  };
  /**
   * _sanitizeAttributes
   *
   * @protect attributes
   * @protect nodeName
   * @protect removeAttribute
   * @protect setAttribute
   *
   * @param currentNode to sanitize
   */
  const _sanitizeAttributes = function _sanitizeAttributes(currentNode) {
    /* Execute a hook if present */
    _executeHooks(hooks.beforeSanitizeAttributes, currentNode, null);
    const {
      attributes
    } = currentNode;
    /* Check if we have attributes; if not we might have a text node */
    if (!attributes || _isClobbered(currentNode)) {
      return;
    }
    const hookEvent = {
      attrName: '',
      attrValue: '',
      keepAttr: true,
      allowedAttributes: ALLOWED_ATTR,
      forceKeepAttr: undefined
    };
    let l = attributes.length;
    /* Go backwards over all attributes; safely remove bad ones */
    while (l--) {
      const attr = attributes[l];
      const {
        name,
        namespaceURI,
        value: attrValue
      } = attr;
      const lcName = transformCaseFunc(name);
      const initValue = attrValue;
      let value = name === 'value' ? initValue : stringTrim(initValue);
      /* Execute a hook if present */
      hookEvent.attrName = lcName;
      hookEvent.attrValue = value;
      hookEvent.keepAttr = true;
      hookEvent.forceKeepAttr = undefined; // Allows developers to see this is a property they can set
      _executeHooks(hooks.uponSanitizeAttribute, currentNode, hookEvent);
      value = hookEvent.attrValue;
      /* Full DOM Clobbering protection via namespace isolation,
       * Prefix id and name attributes with `user-content-`
       */
      if (SANITIZE_NAMED_PROPS && (lcName === 'id' || lcName === 'name') && stringIndexOf(value, SANITIZE_NAMED_PROPS_PREFIX) !== 0) {
        // Remove the attribute with this value
        _removeAttribute(name, currentNode);
        // Prefix the value and later re-create the attribute with the sanitized value
        value = SANITIZE_NAMED_PROPS_PREFIX + value;
      }
      // Else: already prefixed, leave the attribute alone — the prefix is
      // itself the clobbering protection, and re-applying it is incorrect.
      /* Work around a security issue with comments inside attributes */
      if (SAFE_FOR_XML && regExpTest(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      /* Make sure we cannot easily use animated hrefs, even if animations are allowed */
      if (lcName === 'attributename' && stringMatch(value, 'href')) {
        _removeAttribute(name, currentNode);
        continue;
      }
      /* Did the hooks approve of the attribute? */
      if (hookEvent.forceKeepAttr) {
        continue;
      }
      /* Did the hooks approve of the attribute? */
      if (!hookEvent.keepAttr) {
        _removeAttribute(name, currentNode);
        continue;
      }
      /* Work around a security issue in jQuery 3.0 */
      if (!ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(/\/>/i, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      /* Sanitize attribute content to be template-safe */
      if (SAFE_FOR_TEMPLATES) {
        arrayForEach([MUSTACHE_EXPR, ERB_EXPR, TMPLIT_EXPR], expr => {
          value = stringReplace(value, expr, ' ');
        });
      }
      /* Is `value` valid for this attribute? */
      const lcTag = transformCaseFunc(currentNode.nodeName);
      if (!_isValidAttribute(lcTag, lcName, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      /* Handle attributes that require Trusted Types */
      if (trustedTypesPolicy && typeof trustedTypes === 'object' && typeof trustedTypes.getAttributeType === 'function') {
        if (namespaceURI) ; else {
          switch (trustedTypes.getAttributeType(lcTag, lcName)) {
            case 'TrustedHTML':
              {
                value = trustedTypesPolicy.createHTML(value);
                break;
              }
            case 'TrustedScriptURL':
              {
                value = trustedTypesPolicy.createScriptURL(value);
                break;
              }
          }
        }
      }
      /* Handle invalid data-* attribute set by try-catching it */
      if (value !== initValue) {
        try {
          if (namespaceURI) {
            currentNode.setAttributeNS(namespaceURI, name, value);
          } else {
            /* Fallback to setAttribute() for browser-unrecognized namespaces e.g. "x-schema". */
            currentNode.setAttribute(name, value);
          }
          if (_isClobbered(currentNode)) {
            _forceRemove(currentNode);
          } else {
            arrayPop(DOMPurify.removed);
          }
        } catch (_) {
          _removeAttribute(name, currentNode);
        }
      }
    }
    /* Execute a hook if present */
    _executeHooks(hooks.afterSanitizeAttributes, currentNode, null);
  };
  /**
   * _sanitizeShadowDOM
   *
   * @param fragment to iterate over recursively
   */
  const _sanitizeShadowDOM2 = function _sanitizeShadowDOM(fragment) {
    let shadowNode = null;
    const shadowIterator = _createNodeIterator(fragment);
    /* Execute a hook if present */
    _executeHooks(hooks.beforeSanitizeShadowDOM, fragment, null);
    while (shadowNode = shadowIterator.nextNode()) {
      /* Execute a hook if present */
      _executeHooks(hooks.uponSanitizeShadowNode, shadowNode, null);
      /* Sanitize tags and elements */
      _sanitizeElements(shadowNode);
      /* Check attributes next */
      _sanitizeAttributes(shadowNode);
      /* Deep shadow DOM detected */
      if (shadowNode.content instanceof DocumentFragment) {
        _sanitizeShadowDOM2(shadowNode.content);
      }
    }
    /* Execute a hook if present */
    _executeHooks(hooks.afterSanitizeShadowDOM, fragment, null);
  };
  // eslint-disable-next-line complexity
  DOMPurify.sanitize = function (dirty) {
    let cfg = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    let body = null;
    let importedNode = null;
    let currentNode = null;
    let returnNode = null;
    /* Make sure we have a string to sanitize.
      DO NOT return early, as this will return the wrong type if
      the user has requested a DOM object rather than a string */
    IS_EMPTY_INPUT = !dirty;
    if (IS_EMPTY_INPUT) {
      dirty = '<!-->';
    }
    /* Stringify, in case dirty is an object */
    if (typeof dirty !== 'string' && !_isNode(dirty)) {
      dirty = stringifyValue(dirty);
      if (typeof dirty !== 'string') {
        throw typeErrorCreate('dirty is not a string, aborting');
      }
    }
    /* Return dirty HTML if DOMPurify cannot run */
    if (!DOMPurify.isSupported) {
      return dirty;
    }
    /* Assign config vars */
    if (!SET_CONFIG) {
      _parseConfig(cfg);
    }
    /* Clean up removed elements */
    DOMPurify.removed = [];
    /* Check if dirty is correctly typed for IN_PLACE */
    if (typeof dirty === 'string') {
      IN_PLACE = false;
    }
    if (IN_PLACE) {
      /* Do some early pre-sanitization to avoid unsafe root nodes */
      const nn = dirty.nodeName;
      if (typeof nn === 'string') {
        const tagName = transformCaseFunc(nn);
        if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
          throw typeErrorCreate('root node is forbidden and cannot be sanitized in-place');
        }
      }
    } else if (dirty instanceof Node) {
      /* If dirty is a DOM element, append to an empty document to avoid
         elements being stripped by the parser */
      body = _initDocument('<!---->');
      importedNode = body.ownerDocument.importNode(dirty, true);
      if (importedNode.nodeType === NODE_TYPE.element && importedNode.nodeName === 'BODY') {
        /* Node is already a body, use as is */
        body = importedNode;
      } else if (importedNode.nodeName === 'HTML') {
        body = importedNode;
      } else {
        // eslint-disable-next-line unicorn/prefer-dom-node-append
        body.appendChild(importedNode);
      }
    } else {
      /* Exit directly if we have nothing to do */
      if (!RETURN_DOM && !SAFE_FOR_TEMPLATES && !WHOLE_DOCUMENT &&
      // eslint-disable-next-line unicorn/prefer-includes
      dirty.indexOf('<') === -1) {
        return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? trustedTypesPolicy.createHTML(dirty) : dirty;
      }
      /* Initialize the document to work on */
      body = _initDocument(dirty);
      /* Check we have a DOM node from the data */
      if (!body) {
        return RETURN_DOM ? null : RETURN_TRUSTED_TYPE ? emptyHTML : '';
      }
    }
    /* Remove first element node (ours) if FORCE_BODY is set */
    if (body && FORCE_BODY) {
      _forceRemove(body.firstChild);
    }
    /* Get node iterator */
    const nodeIterator = _createNodeIterator(IN_PLACE ? dirty : body);
    /* Now start iterating over the created document */
    while (currentNode = nodeIterator.nextNode()) {
      /* Sanitize tags and elements */
      _sanitizeElements(currentNode);
      /* Check attributes next */
      _sanitizeAttributes(currentNode);
      /* Shadow DOM detected, sanitize it */
      if (currentNode.content instanceof DocumentFragment) {
        _sanitizeShadowDOM2(currentNode.content);
      }
    }
    /* If we sanitized `dirty` in-place, return it. */
    if (IN_PLACE) {
      return dirty;
    }
    /* Return sanitized string or DOM */
    if (RETURN_DOM) {
      if (SAFE_FOR_TEMPLATES) {
        body.normalize();
        let html = body.innerHTML;
        arrayForEach([MUSTACHE_EXPR, ERB_EXPR, TMPLIT_EXPR], expr => {
          html = stringReplace(html, expr, ' ');
        });
        body.innerHTML = html;
      }
      if (RETURN_DOM_FRAGMENT) {
        returnNode = createDocumentFragment.call(body.ownerDocument);
        while (body.firstChild) {
          // eslint-disable-next-line unicorn/prefer-dom-node-append
          returnNode.appendChild(body.firstChild);
        }
      } else {
        returnNode = body;
      }
      if (ALLOWED_ATTR.shadowroot || ALLOWED_ATTR.shadowrootmode) {
        /*
          AdoptNode() is not used because internal state is not reset
          (e.g. the past names map of a HTMLFormElement), this is safe
          in theory but we would rather not risk another attack vector.
          The state that is cloned by importNode() is explicitly defined
          by the specs.
        */
        returnNode = importNode.call(originalDocument, returnNode, true);
      }
      return returnNode;
    }
    let serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
    /* Serialize doctype if allowed */
    if (WHOLE_DOCUMENT && ALLOWED_TAGS['!doctype'] && body.ownerDocument && body.ownerDocument.doctype && body.ownerDocument.doctype.name && regExpTest(DOCTYPE_NAME, body.ownerDocument.doctype.name)) {
      serializedHTML = '<!DOCTYPE ' + body.ownerDocument.doctype.name + '>\n' + serializedHTML;
    }
    /* Sanitize final string template-safe */
    if (SAFE_FOR_TEMPLATES) {
      arrayForEach([MUSTACHE_EXPR, ERB_EXPR, TMPLIT_EXPR], expr => {
        serializedHTML = stringReplace(serializedHTML, expr, ' ');
      });
    }
    return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? trustedTypesPolicy.createHTML(serializedHTML) : serializedHTML;
  };
  DOMPurify.setConfig = function () {
    let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    _parseConfig(cfg);
    SET_CONFIG = true;
  };
  DOMPurify.clearConfig = function () {
    CONFIG = null;
    SET_CONFIG = false;
  };
  DOMPurify.isValidAttribute = function (tag, attr, value) {
    /* Initialize shared config vars if necessary. */
    if (!CONFIG) {
      _parseConfig({});
    }
    const lcTag = transformCaseFunc(tag);
    const lcName = transformCaseFunc(attr);
    return _isValidAttribute(lcTag, lcName, value);
  };
  DOMPurify.addHook = function (entryPoint, hookFunction) {
    if (typeof hookFunction !== 'function') {
      return;
    }
    arrayPush(hooks[entryPoint], hookFunction);
  };
  DOMPurify.removeHook = function (entryPoint, hookFunction) {
    if (hookFunction !== undefined) {
      const index = arrayLastIndexOf(hooks[entryPoint], hookFunction);
      return index === -1 ? undefined : arraySplice(hooks[entryPoint], index, 1)[0];
    }
    return arrayPop(hooks[entryPoint]);
  };
  DOMPurify.removeHooks = function (entryPoint) {
    hooks[entryPoint] = [];
  };
  DOMPurify.removeAllHooks = function () {
    hooks = _createHooksMap();
  };
  return DOMPurify;
}
var purify = createDOMPurify();


//# sourceMappingURL=purify.es.mjs.map

// EXTERNAL MODULE: ../../node_modules/webextension-polyfill/src/browser-polyfill.js
var browser_polyfill = __webpack_require__(2558);
var browser_polyfill_default = /*#__PURE__*/__webpack_require__.n(browser_polyfill);
;// CONCATENATED MODULE: ./src/core/messaging/front/utils.ts

async function send(type, args = {}) {
    return await browser_polyfill_default().runtime.sendMessage({ ...args, type });
}

;// CONCATENATED MODULE: ./src/core/messaging/front/index.ts


;// CONCATENATED MODULE: ../../node_modules/@eyeo-fragments/filter-experiments/dist/shared/sync-filters.types.js
const ORIGIN_ID = "experiment";

;// CONCATENATED MODULE: ./src/filters/shared/filter.types.ts

var FilterOrigin;
(function (FilterOrigin) {
    FilterOrigin["popup"] = "popup";
    FilterOrigin["web"] = "web";
    FilterOrigin["devtools"] = "devtools";
    FilterOrigin["wizard"] = "wizard";
    FilterOrigin["youtube"] = "youtube";
    FilterOrigin["customize"] = "customize";
    FilterOrigin["context"] = "context";
    FilterOrigin[FilterOrigin["experiment"] = ORIGIN_ID] = "experiment";
})(FilterOrigin || (FilterOrigin = {}));

;// CONCATENATED MODULE: ./src/filters/shared/index.ts


;// CONCATENATED MODULE: ./src/globals/front/index.ts




function start() {
    if (self.modulesAsGlobal) {
        return;
    }
    self.modulesAsGlobal = { messaging: front_namespaceObject, filters: shared_namespaceObject, ewe: ewe_ui };
    Object.assign(self, {
        DOMPurify: purify,
        ewe: ewe_ui,
    });
}
start();

})();

/******/ })()
;
//# sourceMappingURL=globals-front.js.map