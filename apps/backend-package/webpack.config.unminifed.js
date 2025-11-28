import cfg from "./webpack.config.js";
const [cjsConfig, esmConfig] = cfg;

const noMinifyBaseConfig = {
  optimization: {
    minimize: false, // Disable minification
  },
};

const noMinifyCjsConfig = {
  ...cjsConfig,
  ...noMinifyBaseConfig,
};

const noMinifyEsmConfig = {
  ...esmConfig,
  ...noMinifyBaseConfig,
};

export default [noMinifyCjsConfig, noMinifyEsmConfig];
