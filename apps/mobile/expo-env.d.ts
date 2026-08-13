/// <reference types="expo/types" />

/**
 * `TextDecoder` is provided by the Expo runtime (SDK 50+ polyfills it on
 * Hermes) but is not in the React Native type surface, which targets no DOM
 * lib. Declared here rather than pulling the whole DOM lib in, which would also
 * make `document` and `window` type-check on a platform that has neither.
 */
declare class TextDecoder {
  decode(input?: Uint8Array, options?: { stream?: boolean }): string;
}
