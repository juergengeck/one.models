/**
 * Converts Array Buffer to Hex
 * @param buffer
 */
export function arrayBufferToHex(buffer: ArrayBuffer): string {
    return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Converts Hex to Array Buffer
 * @param input
 */
export default function hexToArrayBuffer(input: string): ArrayBuffer {
    if (input.length % 2 !== 0) {
        throw new RangeError('Expected string to be an even number of characters');
    }

    const view = new Uint8Array(input.length / 2);

    for (let i = 0; i < input.length; i += 2) {
        view[i / 2] = parseInt(input.substring(i, i + 2), 16);
    }

    return view.buffer;
}
