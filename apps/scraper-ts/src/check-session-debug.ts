
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const sessionPath = path.resolve(__dirname, '../sessions/default.session.json');
const encryptionKey = process.env.SESSION_ENCRYPTION_KEY || null;

function decrypt(data: string): string {
  if (!encryptionKey) return data;
  const [ivHex, encrypted] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(encryptionKey.padEnd(32, '0').slice(0, 32));
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

if (fs.existsSync(sessionPath)) {
  const content = fs.readFileSync(sessionPath, 'utf8');
  try {
    const raw = decrypt(content);
    const session = JSON.parse(raw);
    console.log('Session Found:');
    console.log('  Saved At:', session.savedAt);
    console.log('  Expires At:', session.expiresAt);
    console.log('  Current Time:', new Date().toISOString());
    console.log('  Expired?:', new Date(session.expiresAt) < new Date());
  } catch (e) {
    console.error('Failed to decrypt/parse session:', e);
  }
} else {
  console.log('Session file NOT found at:', sessionPath);
}
