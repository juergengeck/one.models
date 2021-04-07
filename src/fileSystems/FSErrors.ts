export const FS_INTERNAL_ERROR_CODE = 999

/**
 * FSE stands for 'File System Error'
 */
export const FS_ERRORS: {[key: string]: {message: string, linuxErrCode: number}} = {
    'FSE-ENOENT': {message: 'No such file or directory', linuxErrCode: -2},
    'FSE-EACCES-W': {message: 'Write permissions required', linuxErrCode: -13},
    'FSE-EACCES-R': {message: 'Read permissions required', linuxErrCode: -13},
    'FSE-EACCES-E': {message: 'Execute permissions required', linuxErrCode: -13},
    'FSE-ENOSYS': {message: 'Function not implemented', linuxErrCode: -38},
    'FSE-EXISTS': {message: 'Path already exists', linuxErrCode: -17},
    'FSE-MACH': {message: 'Hidden files and extended attributes are disabled on MacOS', linuxErrCode: -2},

    'FSE-CHUNK-R': {
        message: 'Reading file in chunks is not supported on other systems than node',
        linuxErrCode: FS_INTERNAL_ERROR_CODE
    },
    'FSE-OBJS': {
        message: 'Getting object size from data folder is not supported on other systems than node',
        linuxErrCode: FS_INTERNAL_ERROR_CODE
    },
    'FSE-MOUNT1': {message: 'The path was already mounted. Unmount it first', linuxErrCode: FS_INTERNAL_ERROR_CODE},
    'FSE-MOUNT2': {
        message: 'Cannot mount path under already mounted path. Unmount first',
        linuxErrCode: FS_INTERNAL_ERROR_CODE
    },
    'FSE-MOUNT3': {message: 'Cannot unmount path. Path not mounted', linuxErrCode: FS_INTERNAL_ERROR_CODE},
    'FSE-FSMAP': {
        message: 'Could not map call to the file system. File system not found',
        linuxErrCode: FS_INTERNAL_ERROR_CODE
    },
    'FSE-WRM1': {message: 'The given file mode was malformed', linuxErrCode: FS_INTERNAL_ERROR_CODE},
    'FSE-WRM2': {message: 'The given file permissions were malformed', linuxErrCode: FS_INTERNAL_ERROR_CODE},
    'FSE-UNK': {message: 'Unknown File System Error', linuxErrCode: FS_INTERNAL_ERROR_CODE}
};

