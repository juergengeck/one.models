const path = require('path');

module.exports = {
    mode: 'development',
    entry: ['./src/cli/CommunicationServer.ts'],
    output: {
        filename: 'commServer.bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
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
            },
            {test: /\.json/, loader: 'json-loader', exclude: /node_modules/}
        ]
    },

    resolve: {
        extensions: ['.tsx', '.ts', '.js', '.json']
    },
    target: 'node',
    node: {
        __dirname: true
    },
    plugins: []
};
