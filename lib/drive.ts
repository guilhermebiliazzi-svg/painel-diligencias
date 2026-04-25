// lib/drive.ts
// Helpers para listar arquivos do Google Drive em uma pasta.
// Usa Service Account via GOOGLE_DRIVE_CREDENTIALS_JSON (env var).

import { google } from 'googleapis';

let driveClient: ReturnType<typeof google.drive> | null = null;

function getDrive() {
  if (driveClient) return driveClient;

  const credsRaw = process.env.GOOGLE_DRIVE_CREDENTIALS_JSON;
  if (!credsRaw) {
    throw new Error('GOOGLE_DRIVE_CREDENTIALS_JSON nao configurado');
  }
  const creds = JSON.parse(credsRaw);

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

export type DriveFile = {
  id: string;
  name: string;
  parents?: string[];
  webViewLink?: string;
  createdTime?: string;
  mimeType?: string;
};

/**
 * Lista PDFs em uma pasta do Drive.
 */
export async function listPdfsInFolder(folderId: string): Promise<DriveFile[]> {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType='application/pdf'`,
    fields: 'files(id,name,parents,createdTime,webViewLink,mimeType)',
    pageSize: 100,
    orderBy: 'createdTime desc',
  });
  return (res.data.files ?? []) as DriveFile[];
}

/**
 * Lista PDFs em multiplas pastas do Drive numa unica chamada.
 */
export async function listPdfsInFolders(folderIds: string[]): Promise<DriveFile[]> {
  if (folderIds.length === 0) return [];
  const drive = getDrive();
  const clauses = folderIds.map((id) => `'${id}' in parents`).join(' or ');
  const res = await drive.files.list({
    q: `(${clauses}) and trashed=false and mimeType='application/pdf'`,
    fields: 'files(id,name,parents,createdTime,webViewLink,mimeType)',
    pageSize: 1000,
    orderBy: 'createdTime desc',
  });
  return (res.data.files ?? []) as DriveFile[];
}
