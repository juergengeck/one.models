const path = require('path');

module.exports = {
    mode: 'production',
    entry: ['./src/cli/CommunicationServer.ts'],
    output: {
        filename: 'comm_server.bundle.js',
        path: path.resolve(__dirname)
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
                            configFile: 'tsconfig.commServer.json'
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
