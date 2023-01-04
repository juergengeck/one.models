const filenameEscapeMap = new Map<string, string>([
    ['<', '﹤'],
    ['>', '﹥'],
    [':', 'ː'],
    ['"', '“'],
    ['/', '⁄'],
    ['\\', '∖'],
    ['|', '⼁'],
    ['?', '﹖'],
    ['*', '﹡']
]);

/**
 * Replaces all forbidden chars in a file name with utf8 equivalents.
 *
 * @param fileName
 */
export function escapeFileName(fileName: string): string {
    let fileNameEscaped = fileName;

    for (const [l, r] of filenameEscapeMap.entries()) {
        fileNameEscaped = fileNameEscaped.replaceAll(l, r);
    }

    return fileNameEscaped;
}

/**
 * Reverse of escapeFileName.
 *
 * @param fileName
 */
export function unEscapeFileName(fileName: string): string {
    let fileNameEscaped = fileName;

    for (const [l, r] of filenameEscapeMap.entries()) {
        fileNameEscaped = fileNameEscaped.replaceAll(r, l);
    }

    return fileNameEscaped;
}
