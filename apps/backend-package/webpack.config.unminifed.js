const baseConfig = require("./webpack.config.js");

module.exports = [
  {
    ...baseConfig[0],
    optimization: {
      ...baseConfig[0].optimization,
      minimize: false, // Disable minification
    },
  },
  {
    ...baseConfig[1],
    optimization: {
      ...baseConfig[1].optimization,
      minimize: false, // Disable minification
    },
  },
];
