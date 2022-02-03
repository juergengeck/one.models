/**
 * Read file from remote location via HTTPRequest
 *
 * @param url - A url to a remote location. If relative, it is relative to the loaded app.
 */
export async function fetchFile(url: string): Promise<string> {
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
}
