
// ######## HexString type definition and helpers ########

/**
 * This type represents a hexadecimal string.
 *
 * This hexadecimal string is expected to have an even number of elements, so
 * that it can be converted to binary representation (2 hexadecimal bytes result
 * in one byte in binary representation
 *
 * Note that this is a type that cannot be constructed, just casted to. (string is
 * not an object). This is a Typescript trick to have a special kind of strings.
 */
export type HexString = string & {
    _: 'HexString';
};

/**
 * Regular expression for testing HexString string.
 */
export const HexStringRegex = /^([0-9a-fA-F]{2})*$/;

/**
 * Check if the passed input string is a hexadecimal string.
 *
 * @param input - the string to test.
 */
function isHexString(input: string): input is HexString {
    return HexStringRegex.test(input);
}

/**
 * Ensure that the passed string is a hexadecimal string.
 *
 * @param input - the string to test.
 */
function ensureHexString(input: string): HexString {
    if (!isHexString(input)) {
        throw new Error('Passed string is not a hex string.');
    }
    return input;
}

// ######## conversion functions ########

/**
 * Converts contents of ArrayBuffer to a hexadecimal string.
 *
 * @param buffer - The ArrayBuffer to convert to a hex string.
 */
export function arrayBufferToHex(buffer: ArrayBuffer): HexString {
    return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('') as HexString;
}

/**
 * Converts a hexadecimal string to an ArrayBuffer.
 *
 * @param input - The string that shall be converted. It must consist of an even number of the characters 0-9, a-f, A-F.
 */
export default function hexToArrayBuffer(input: HexString): ArrayBuffer {
    if (input.length % 2 !== 0) {
        throw new RangeError('Expected string to be an even number of characters');
    }

    const view = new Uint8Array(input.length / 2);

    for (let i = 0; i < input.length; i += 2) {
        view[i / 2] = parseInt(input.substring(i, i + 2), 16);
    }

    return view.buffer;
}

/**
 * Converts a hexadecimal string to an ArrayBuffer with an additional regex test.
 *
 * @param input - The string that shall be converted. It must consist of an even number of the characters 0-9, a-f, A-F.
 */
export function hexToArrayBufferWithCheck(input: string): ArrayBuffer {
    return hexToArrayBuffer(ensureHexString(input));
}
