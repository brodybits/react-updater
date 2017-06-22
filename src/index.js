/**
 * Module dependencies.
 */

import React, { Component } from 'react';
import { noop, stringify, stringifyFunction } from './utils';
import isPlainObject from 'is-plain-object';

/**
 * State property name.
 */

const STATE_PROPERTY_NAME = '@@STATE';

/**
 * Export `withUpdater`.
 */

export default initialState => {
  return WrappedComponent => {
    class WithUpdater extends Component {
      memoizedCallbackHandlers = {};

      constructor(props) {
        super(props);

        const state = typeof initialState === 'function'
          ? initialState(props)
          : initialState;

        this.state = isPlainObject(state)
          ? state
          : { [STATE_PROPERTY_NAME]: state };
      }

      /**
       * Clean up.
       */

      componentWillUnmount() {
        this.memoizedCallbackHandlers = null;
      }

      /**
       * Create callback handler.
       */

      createCallbackHandler = (name, createHandler) => {
        return (callback, ...params) => {
          if (process.env.NODE_ENV !== 'production' && !callback.name) {
            // eslint-disable-next-line no-console
            console.warn(
              'Callbacks handlers defined with anonymous functions should be' +
                ' avoided. This can lead to de-optimisations on components' +
                ' that rely on props equality.'
            );

            return noop;
          }

          const id = name + stringifyFunction(callback) + stringify(params);

          if (!this.memoizedCallbackHandlers[id]) {
            const handler = createHandler(callback, params);

            this.memoizedCallbackHandlers[id] = { callback, handler };

            return handler;
          }

          // We need to ensure the handler is updated for different callbacks.
          // Since we check for the callback.name property, if another callback
          // with the same `name` were passed, the returned handler would the
          // call the previous callback so we need to invalidate the cache.
          if (this.memoizedCallbackHandlers[id].callback !== callback) {
            this.memoizedCallbackHandlers[id] = {
              callback,
              handler: createHandler(callback, params)
            };
          }

          return this.memoizedCallbackHandlers[id].handler;
        };
      };

      /**
       * Wraps the callback handler and returns a new function that receives
       * additional arguments.
       */

      handle = this.createCallbackHandler('handle', (callback, params) => {
        return (...args) => callback(...params, ...args);
      });

      /**
       * Wraps the callback handler in a `setState` call and returns a new
       * function that receives the previous state and the given arguments.
       * Since this wraps the callback handler in a `setState` call, the handler
       * should always return a new state which can be an object or a single
       * value.
       */

      update = this.createCallbackHandler('update', (callback, params) => {
        return (...args) => {
          let event;

          // A synthetic event cannot be accessed in an asynchronous way -
          // e.g. inside `setState()` - so we need to call `event.persist()`
          // event to remove the synthetic event from the pool.
          // We clean up the event manually when the callback of `setState()` is
          // invoked.
          for (const arg of args) {
            if (arg && typeof arg.persist === 'function') {
              event = arg;
              event.persist();

              break;
            }
          }

          this.setState(
            state => {
              if (!(STATE_PROPERTY_NAME in state)) {
                return callback(state, ...params, ...args);
              }

              return {
                [STATE_PROPERTY_NAME]: callback(
                  state[STATE_PROPERTY_NAME],
                  ...params,
                  ...args
                )
              };
            },
            () => {
              if (event && typeof event.destructor === 'function') {
                event.destructor();
              }
            }
          );
        };
      });

      /**
       * Render.
       */

      render() {
        const state = !(STATE_PROPERTY_NAME in this.state)
          ? this.state
          : this.state[STATE_PROPERTY_NAME];

        return (
          <WrappedComponent
            {...this.props}
            handle={this.handle}
            state={state}
            update={this.update}
          />
        );
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      const wrappedComponentDisplayName =
        WrappedComponent.displayName || WrappedComponent.name || 'Component';

      WithUpdater.displayName = `withUpdater(${wrappedComponentDisplayName})`;
    }

    return WithUpdater;
  };
};
