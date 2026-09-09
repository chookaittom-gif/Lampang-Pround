import assert from 'node:assert/strict';
import { parseDriveAdapterResponse } from '../src/lib/drive-adapter.ts';

const parsed = parseDriveAdapterResponse({
  success: true,
  driveFileId: 'file_123-abc',
  mimeType: 'image/jpeg',
  fileSize: 42,
});

assert.equal(parsed.driveUrl, 'https://drive.google.com/file/d/file_123-abc/view');
assert.equal(parsed.thumbnailUrl, 'https://lh3.googleusercontent.com/d/file_123-abc=w800');
assert.equal(parsed.size, 42);
assert.throws(
  () => parseDriveAdapterResponse({ success: true, driveFileId: 'not valid', mimeType: 'image/jpeg', fileSize: 42 }),
  /invalid file ID/
);
assert.throws(
  () => parseDriveAdapterResponse({ success: true, driveFileId: 'ok', mimeType: 'text/plain', fileSize: 42 }),
  /invalid image MIME type/
);
console.log('PASS drive-adapter response contract');
