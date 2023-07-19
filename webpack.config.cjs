const path = require('path');
const webpack = require('webpack');

module.exports = {
    mode: 'production',
    output: {
        path: path.resolve(__dirname)
    },
    entry: {
        comm_server: {
            import: './lib/tools/CommunicationServer.js',
            filename: '[name].bundle.js'
        },
        password_recovery_server: {
            import: './lib/tools/PasswordRecoveryService/PasswordRecoveryServer.js',
            filename: '[name].bundle.js'
        },
        generate_identity: {
            import: './lib/tools/identity/GenerateIdentity.js',
            filename: '[name].bundle.js'
        }
    },
    devtool: 'inline-source-map',
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules|utf-8-validate|bufferutil/
            }
        ]
    },

    resolve: {
        extensions: ['.js']
    },
    target: 'node',
    node: {
        __dirname: true
    },
    plugins: []
};
