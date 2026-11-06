/**
 * Backend base URLs the app tries in order.
 * Set EXPO_PUBLIC_API_URL (e.g. http://192.168.1.20:3000/api/v1) to point a real device at your machine.
 */
const fromEnv = process.env.EXPO_PUBLIC_API_URL;

export const API_CANDIDATES: string[] = [
  ...(fromEnv ? [fromEnv] : []),
  'http://10.0.2.2:3000/api/v1', // Android emulator -> host machine
  'http://localhost:3000/api/v1', // iOS simulator / web
];
