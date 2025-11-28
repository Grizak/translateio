import TerserPlugin from "terser-webpack-plugin";
import path from "path";
import { fileURLToPath } from "url";
import copyPlugin from "copy-webpack-plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @typedef {import("webpack").Configuration} WebpackConfig */

/** @type {WebpackConfig} */
const baseConfig = {
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "dist/backend"),
  },
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
};

/** @type {WebpackConfig[]} */
export default [
  {
    ...baseConfig,
    target: "electron-main",
    entry: "./src/main.ts",
    output: {
      ...baseConfig.output,
      filename: "main.cjs",
    },
    externals: {
      ...baseConfig.externals,
      electron: "commonjs electron",
    },
    plugins: [
      // ...baseConfig.plugins,
      new copyPlugin({
        patterns: [{ from: "frontend", to: "frontend" }],
      }),
    ],
    // Alias @ point to src directory
    resolve: {
      ...baseConfig.resolve,
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  },
  {
    ...baseConfig,
    target: "electron-renderer",
    entry: "./src/preload.ts",
    output: {
      ...baseConfig.output,
      filename: "preload.js",
    },
  },
];
