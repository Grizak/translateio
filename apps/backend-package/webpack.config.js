const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

const baseConfig = {
  target: "node",
  entry: "./src/index.ts",

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },

  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },

  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: false,
            drop_debugger: true,
          },
          format: {
            comments: false,
          },
        },
        extractComments: true,
      }),
    ],
  },

  mode: "production",

  externals: {
    express: "commonjs express",
    axios: "commonjs axios",
  },
};

// ----------------------
// COMMONJS BUILD
// ----------------------
const cjsConfig = {
  ...baseConfig,
  output: {
    filename: "bundle.cjs",
    path: path.resolve(__dirname, "dist/main/cjs"),
    clean: true,
    library: {
      type: "commonjs2",
    },
  },
};

// ----------------------
// ESM BUILD
// ----------------------
const esmConfig = {
  ...baseConfig,
  experiments: {
    outputModule: true,
  },
  output: {
    filename: "bundle.mjs",
    path: path.resolve(__dirname, "dist/main/esm"),
    clean: true,
    library: {
      type: "module",
    },
  },
};

module.exports = [cjsConfig, esmConfig];
