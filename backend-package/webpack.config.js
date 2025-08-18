const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
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

  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
    clean: true, // Clean the output directory before emit
  },

  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: false, // Set to true to remove console.log statements
            drop_debugger: true,
          },
          format: {
            comments: false, // Remove comments from output
          },
        },
        extractComments: false, // Don't create separate license file
      }),
    ],
  },

  mode: "production",

  // Optional: Add source maps for debugging
  devtool: "source-map",

  // Development server configuration (optional)
  devServer: {
    static: {
      directory: path.join(__dirname, "dist"),
    },
    compress: true,
    port: 9000,
    open: true,
  },
};
