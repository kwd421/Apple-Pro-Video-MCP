import { access, stat } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expandUserPath, assertPlainObject, InputError } from './paths.js';
import { defaultMotionTemplateRoots } from './motion.js';

const execFileAsync = promisify(execFile);

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(command) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/which', [command], { timeout: 3000 });
    return stdout.trim() || true;
  } catch {
    return false;
  }
}

export async function systemCapabilities() {
  const finalCutCandidates = ['/Applications/Final Cut Pro.app', '/System/Applications/Final Cut Pro.app'];
  const motionCandidates = ['/Applications/Motion.app', '/System/Applications/Motion.app'];

  const finalCutLocations = [];
  for (const path of finalCutCandidates) if (await exists(path)) finalCutLocations.push(path);
  const motionLocations = [];
  for (const path of motionCandidates) if (await exists(path)) motionLocations.push(path);

  const templateRoots = [];
  for (const path of defaultMotionTemplateRoots()) {
    if (await exists(path)) templateRoots.push(path);
  }

  return {
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    supportedPlatform: process.platform === 'darwin',
    commands: {
      open: await commandExists('open'),
      osascript: await commandExists('osascript'),
      mdfind: await commandExists('mdfind')
    },
    applications: {
      finalCutPro: finalCutLocations,
      motion: motionLocations
    },
    motionTemplateRoots: templateRoots
  };
}

export async function openFcpxmlInFinalCut(args) {
  assertPlainObject(args);
  if (process.platform !== 'darwin') {
    throw new InputError('finalcut_open_fcpxml is available only on macOS.');
  }
  const path = expandUserPath(args.path);
  if (!/\.(fcpxml|fcpxmld)$/i.test(path)) {
    throw new InputError('path must end in .fcpxml or .fcpxmld.');
  }
  const fileStat = await stat(path);
  if (!fileStat.isFile() && !fileStat.isDirectory()) {
    throw new InputError(`${path} is not a file or bundle.`);
  }

  const appName = args.appName === undefined ? 'Final Cut Pro' : args.appName;
  if (typeof appName !== 'string' || appName.trim() === '') {
    throw new InputError('appName must be a non-empty string.');
  }

  try {
    const { stderr } = await execFileAsync('/usr/bin/open', ['-a', appName, path], {
      timeout: 15000,
      maxBuffer: 1024 * 1024
    });
    return { launched: true, application: appName, path, stderr: stderr.trim() || null };
  } catch (error) {
    const detail = error?.stderr?.trim() || error?.message || String(error);
    throw new Error(`Failed to open ${path} in ${appName}: ${detail}`);
  }
}
