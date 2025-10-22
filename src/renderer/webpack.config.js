const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV || 'development',
    entry: './src/renderer/index.js',
    output: {
        path: path.resolve(__dirname, '../../build'),
        filename: 'bundle.js',
        clean: true
    },
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.(png|svg|jpg|jpeg|gif)$/i,
                type: 'asset/resource',
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/renderer/index.html',
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, '../../assets'),
                    to: path.resolve(__dirname, '../../build/assets'),
                },
            ],
        }),
    ],
    resolve: {
        extensions: ['.js', '.json'],
    },
    devServer: {
        static: {
            directory: path.join(__dirname, '../../build'),
        },
        compress: true,
        port: 8080,
        hot: true,
        open: false,
    },
    devtool: process.env.NODE_ENV === 'production' ? 'source-map' : 'eval-source-map',
};