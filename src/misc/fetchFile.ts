/**
 * Read file from remote location via HTTPRequest
 *
 * @param url - A url to a remote location. If relative, it is relative to the loaded app.
 */
import {platform} from '@refinio/one.core/lib/system/platform';
import {PLATFORMS} from '@refinio/one.core/lib/platforms';

export async function fetchFile(url: string): Promise<string> {
    // @ts-ignore
    if (platform === PLATFORMS.BROWSER) {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.onerror = function () {
                reject(`Error retrieving file: ${url}`);
            };
            request.onload = function () {
                // 200 should be okay, all the other 2xx and 304 don't apply for a simple get call.
                if (request.status === 200) {
                    resolve(request.responseText);
                } else {
                    reject(
                        new Error(`Status code: ${request.status}, Message ${request.responseText}`)
                    );
                }
            };
            request.open('get', url, true);
            request.send();
        });
        // @ts-ignore
    } else if (platform === PLATFORMS.NODE_JS) {
        return new Promise<string>((resolve, reject) => {
            const urlp = new URL(url);
            if (urlp.protocol !== 'https' && urlp.protocol !== 'http') {
                throw new Error('Only https and http is supported.');
            }

            const http = require(urlp.protocol);
            const options = {
                hostname: urlp.hostname,
                port: urlp.port,
                path: urlp.pathname,
                method: 'GET'
            };

            const req = http.request(options, async (res: any) => {
                let data = '';
                for await (const chunk of res) {
                    data += chunk;
                }

                if (res.statusCode === 200) {
                    resolve(data);
                } else {
                    reject(new Error(`Status code: ${res.statusCode}, Message ${data}`));
                }
            });

            req.on('error', (error: any) => {
                reject(new Error(error));
            });

            req.end();
        });
    } else {
        throw new Error('Unsupported platform');
    }
}

/**
 * Post json to a remote location via HTTPRequest
 *
 * @param url
 * @param jsonContent
 */
export async function postJson(url: string, jsonContent: string): Promise<void> {
    // @ts-ignore
    if (platform === PLATFORMS.BROWSER) {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.onerror = function () {
                reject(`Error retrieving file: ${url}`);
            };
            request.onload = function () {
                // 201 should be okay for posting
                if (request.status === 201) {
                    resolve();
                } else {
                    reject(
                        new Error(`Status code: ${request.status}, Message ${request.responseText}`)
                    );
                }
            };
            request.open('post', url, true);
            request.setRequestHeader('Content-Type', 'application/json');
            request.send(jsonContent);
        });
        // @ts-ignore
    } else if (platform === PLATFORMS.NODE_JS) {
        return new Promise<void>((resolve, reject) => {
            const urlp = new URL(url);
            if (urlp.protocol !== 'https:' && urlp.protocol !== 'http:') {
                throw new Error('Only https and http is supported.');
            }

            const http = require(urlp.protocol.slice(0, -1));
            const options = {
                hostname: urlp.hostname,
                port: urlp.port,
                path: urlp.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            const req = http.request(options, async (res: any) => {
                let data = '';
                for await (const chunk of res) {
                    data += chunk;
                }

                if (res.statusCode === 201) {
                    resolve();
                } else {
                    reject(new Error(`Status code: ${res.statusCode}, Message ${data}`));
                }
            });

            req.on('error', (error: any) => {
                reject(new Error(error));
            });

            req.write(jsonContent);
            req.end();
        });
    } else {
        throw new Error('Unsupported platform');
    }
}
