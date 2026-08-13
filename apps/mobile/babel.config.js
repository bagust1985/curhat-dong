/**
 * Babel — E16-T01.
 *
 * `jsxImportSource: nativewind` is what turns `className` into styles on React
 * Native; without it every className is silently ignored and the app renders
 * unstyled with no error.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
