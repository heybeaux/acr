export * from './types.js';
export * from './runtime.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export const capabilitySchema = require('./capability.schema.json');
