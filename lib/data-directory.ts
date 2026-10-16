import path from 'node:path';

/**
 * Use a mounted disk in production (for example, /data on Sevalla) so the
 * Vimeo library, OAuth connection, and contact submissions survive deploys.
 * Local development continues to use the project's ignored data directory.
 */
export const dataDirectory = path.resolve(process.env.DATA_DIRECTORY || path.join(process.cwd(), 'data'));
