import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const loadEnvFile = (filename: string) => {
  const filePath = resolve(process.cwd(), filename);
  if (!existsSync(filePath)) return;

  const contents = readFileSync(filePath, 'utf8');
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

loadEnvFile('.env.local');
loadEnvFile('.env');

const serverUrl = process.env.CAPACITOR_SERVER_URL || undefined;

const config: CapacitorConfig = {
  appId: 'com.getout.app',
  appName: 'GetOut',
  webDir: 'capacitor-web',
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith('http://'),
      }
    : undefined,
  android: {
    allowMixedContent: Boolean(serverUrl && serverUrl.startsWith('http://')),
  },
};

export default config;
