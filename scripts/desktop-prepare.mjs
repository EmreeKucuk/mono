import './desktop-icon.mjs';
import {createRequire} from 'node:module';
// Electron 44 lazily downloads its binary; ensure it exists before packaging.
createRequire(import.meta.url)('electron');

import './desktop-native.mjs';
