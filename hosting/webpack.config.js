// @ts-check

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

/** @type {import('webpack').RuleSetRule[]} */
const commonRules = [
  {
    test: /\.tsx?$/,
    use: ["babel-loader"],
  },
];

/** @type {import('webpack').Configuration[]} */
module.exports = [
  {
    mode: process.env.NODE_ENV === "production" ? "production" : "development",
    entry: {
      index: "./index",
    },
    externalsPresets: {
      web: true,
    },
    resolve: {
      extensions: [".mjs", ".js", ".ts", ".tsx", ".json"],
    },
    context: path.resolve(__dirname, "src"),
    output: {
      filename: "[name]-[contenthash:7].js",
      path: path.resolve(__dirname, "dist", "ui"),
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: "[name]-[contenthash:7].css",
      }),
      new HtmlWebpackPlugin({
        filename: "index.html",
        inject: true,
        title: "work in progress",
        templateContent: [
          "<!doctype html>",
          "<head>",
          "<title>work in progress</title>",
          "</head>",
          '<div id=".bungie-api-webhooks"></div>',
        ].join("\n"),
      }),
    ],
    module: {
      rules: [
        ...commonRules,
        { test: /\.css$/i, use: [MiniCssExtractPlugin.loader, "css-loader"] },
      ],
    },
  },
  {
    mode: process.env.NODE_ENV === "production" ? "production" : "development",
    entry: {
      index: "./server",
    },
    externalsPresets: {
      node: true,
    },
    externals: {
      express: "express",
    },
    resolve: {
      extensions: [".mjs", ".js", ".ts", ".tsx", ".json"],
    },
    context: path.resolve(__dirname, "src"),
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname, "dist", "server"),
    },
    module: {
      rules: [...commonRules],
    },
  },
];
