import EventEmitter from 'events';

/**
 * This represents a Wbc Measurement.
 *
 * Q: Why would we use string for encoding the value?
 * A: - float would probably change the value if the value is not representable
 *    - number does not support decimal places
 *    - the communication / storage is string based, so why convert the value
 *      to a number / ... and then convert it back to a string with potential
 *      modifications?
 *    - This is medically relevant information, so try not to modify values,
 *      keep them as-is from start to end.
 */
export type WbcDiffMeasurement = {
    date: Date;
    wbcCount: string;
    wbcCountUnit: string;
    neuCount?: string;
    neuCountUnit?: string;
    neuCountUnsafe?: boolean;
    lymCount?: string;
    lymCountUnit?: string;
    lymCountUnsafe?: boolean;
    monCount?: string;
    monCountUnit?: string;
    monCountUnsafe?: boolean;
    eosCount?: string;
    eosCountUnit?: string;
    eosCountUnsafe?: boolean;
    basCount?: string;
    basCountUnit?: string;
    basCountUnsafe?: boolean;
};

/**
 * This model implements methods related to differential blood counts of white blood cells.
 */
export default class WbcDiffModel extends EventEmitter {
    constructor() {
        super();
        this.measurementList = [];
    }

    /**
     * Create a new response for a questionnaire.
     *
     * @param {string} data - The answers for the questionnaire
     */
    async postMeasurement(data: WbcDiffMeasurement): Promise<void> {
        data = Object.assign({}, data); // shallow copy, because we modify it
        // Verify the consistency of optional classes
        if (!(('neuCount' in data === 'neuCountUnit' in data) === 'neuCountUnsafe' in data)) {
            throw Error(
                'If one of the fields neuCount, neuCountUnit or neuCountUnsafe is specified, all need to be specified.'
            );
        }

        if (!(('lymCount' in data === 'lymCountUnit' in data) === 'lymCountUnsafe' in data)) {
            throw Error(
                'If one of the fields lymCount, lymCountUnit or lymCountUnsafe is specified, all need to be specified.'
            );
        }

        if (!(('monCount' in data === 'monCountUnit' in data) === 'monCountUnsafe' in data)) {
            throw Error(
                'If one of the fields monCount, monCountUnit or monCountUnsafe is specified, all need to be specified.'
            );
        }

        if (!(('eosCount' in data === 'eosCountUnit' in data) === 'eosCountUnsafe' in data)) {
            throw Error(
                'If one of the fields eosCount, eosCountUnit or eosCountUnsafe is specified, all need to be specified.'
            );
        }

        if (!(('basCount' in data === 'basCountUnit' in data) === 'basCountUnsafe' in data)) {
            throw Error(
                'If one of the fields basCount, basCountUnit or basCountUnsafe is specified, all need to be specified.'
            );
        }

        // Verify number format of *Count fields
        const numberRegex = /^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$/;

        if (!numberRegex.test(data.wbcCount)) {
            throw Error('The wbcCount number has wrong format.');
        }

        if (data.neuCount !== undefined) {
            if (!numberRegex.test(data.neuCount)) {
                throw Error('The neuCount field has wrong format.');
            }
        }

        if (data.lymCount !== undefined) {
            if (!numberRegex.test(data.lymCount)) {
                throw Error('The lymCount field has wrong format.');
            }
        }

        if (data.monCount !== undefined) {
            if (!numberRegex.test(data.monCount)) {
                throw Error('The monCount field has wrong format.');
            }
        }

        if (data.eosCount !== undefined) {
            if (!numberRegex.test(data.eosCount)) {
                throw Error('The eosCount field has wrong format.');
            }
        }

        if (data.basCount !== undefined) {
            if (!numberRegex.test(data.basCount)) {
                throw Error('The basCount field has wrong format.');
            }
        }

        // Verify the supported units(for now verifies 10^9/dL or 1000000000/dL both formats)
        // TODO: Verify the units when they are clear!
        const unitRegex = /^(1000000000)(\/)(dL)|^(10)(\^)(9)(\/)(dL)$/;

        if (!unitRegex.test(data.wbcCountUnit)) {
            throw Error('The wbcCountUnit number has wrong format.');
        }

        if (data.neuCountUnit !== undefined) {
            if (!unitRegex.test(data.neuCountUnit)) {
                throw Error('The neuCountUnit field has wrong format.');
            }
        }

        if (data.lymCountUnit !== undefined) {
            if (!unitRegex.test(data.lymCountUnit)) {
                throw Error('The lymCountUnit field has wrong format.');
            }
        }

        if (data.monCountUnit !== undefined) {
            if (!unitRegex.test(data.monCountUnit)) {
                throw Error('The monCountUnit field has wrong format.');
            }
        }

        if (data.eosCountUnit !== undefined) {
            if (!unitRegex.test(data.eosCountUnit)) {
                throw Error('The eosCountUnit field has wrong format.');
            }
        }

        if (data.basCountUnit !== undefined) {
            if (!unitRegex.test(data.basCountUnit)) {
                throw Error('The basCountUnit field has wrong format.');
            }
        }

        // Write the data to storage
        this.measurementList.push(data);
        this.emit('updated');
    }

    /** Get a list of responses. */
    async measurements(): Promise<WbcDiffMeasurement[]> {
        return [...this.measurementList].sort((a, b) => {
            return b.date.getTime() - a.date.getTime();
        });
    }

    private readonly measurementList: WbcDiffMeasurement[]; // List of measurements. Will be stored in one instance later
}
