const path =  require('path');

module.exports = {
    entry: ["./src/cli/CommunicationServer.ts"],
    output: {
        filename: 'commServer.bundle.js',
        path: path.resolve(__dirname,"dist")
    },
    module: {
        rules: [
            { test: /\.tsx?$/, loader: 'ts-loader',exclude: /node_modules/,},
            { test: /\.json/, loader: "json-loader", exclude:/node_modules/,}
        ]
    },
    resolve: {
        extensions: [".tsx", ".ts", ".js",".json"]
    },
    target: 'node',
    node: {
        __dirname: true
    },
    plugins: []
};