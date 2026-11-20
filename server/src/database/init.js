/** `npm run db:init` — creates the SQLite file and applies the schema. */
import { config } from '../config/env.js';
import { openDatabase } from './db.js';

const db = openDatabase(config.databasePath);
const version = db.pragma('user_version', { simple: true });
db.close();
console.log(`Database ready at ${config.databasePath} (schema v${version})`);
