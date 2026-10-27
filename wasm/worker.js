// SPDX-License-Identifier: Apache-2.0
import {init, extractHTML, isProbablyReaderable} from './index.js';
// No DOM, eval, input page fetches, or input script execution.
const methods = {init, extractHTML, isProbablyReaderable};
let queue = Promise.resolve();
self.onmessage = ({data}) => {
  queue = queue.then(async () => {
    const {id, method, args} = data;
    try {
      if (!Object.hasOwn(methods, method) || !Array.isArray(args)) throw new TypeError('Invalid WASM Worker request.');
      const value = await methods[method](...args);
      self.postMessage({id, value});
    } catch (error) {
      self.postMessage({id, error: {name: error.name, message: error.message}});
    }
  });
};
