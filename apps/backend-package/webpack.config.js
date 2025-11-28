import { resolve, dirname } from "path";
import TerserPlugin from "terser-webpack-plugin";
import TscAliasPlugin from "./webpack/TscAliasPlugin.js";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    // Alias @ point to src directory
    alias: {
      "@": resolve(__dirname, "src"),
    },
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

  plugins: [new TscAliasPlugin()],
};

// ----------------------
// COMMONJS BUILD
// ----------------------
const cjsConfig = {
  ...baseConfig,
  output: {
    filename: "bundle.cjs",
    path: resolve(__dirname, "dist/main/cjs"),
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
    path: resolve(__dirname, "dist/main/esm"),
    clean: true,
    library: {
      type: "module",
    },
  },
};

export default [cjsConfig, esmConfig];
