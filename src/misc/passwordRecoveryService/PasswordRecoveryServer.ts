import http from 'http';

function parseCommandLine(argv: string[]): {port: number} {
    if (argv.length > 3) {
        console.error(`usage: ${argv[0]} ${argv[1]} [port]`);
        process.exit(1);
    }

    const params = {
        port: 80
    };

    if (argv.length === 3) {
        params.port = parseInt(argv[2]);
    }

    return params;
}

const cmdArgs = parseCommandLine(process.argv);

const server = http.createServer(async (req, res) => {
    if (req.url === '/passwordRecoveryRequests' && req.method === 'POST') {
        res.writeHead(201, {'Content-Type': 'plain/text'});
        res.write('Thanks for submitting a password recovery request.');
        res.end();
    }

    // If no route present
    else {
        res.writeHead(404, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({message: 'Route not found'}));
    }
});

server.listen(cmdArgs.port, () => {
    console.log(`server started on port: ${cmdArgs.port}`);
});

process.on('SIGINT', () => {
    server.close(err => {
        if (err) {
            console.error(err);
        }
    });
});
