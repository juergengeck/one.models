const path = require('path');

module.exports = {
    mode: 'production',
    output: {
        path: path.resolve(__dirname)
    },
    entry: {
        comm_server: {
            import: './src/tools/CommunicationServer.ts',
            filename: '[name].bundle.js'
        },
        password_recovery_server: {
            import: './src/tools/PasswordRecoveryService/PasswordRecoveryServer.ts',
            filename: '[name].bundle.js'
        }
    },
    devtool: 'inline-source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: 'tsconfig.comm_server.json'
                        }
                    }
                ],
                exclude: /node_modules/
            }
        ]
    },

    resolve: {
        extensions: ['.ts', '.js']
    },
    target: 'node',
    node: {
        __dirname: true
    },
    plugins: []
};
