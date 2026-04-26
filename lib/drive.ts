// lib/drive.ts
// Helpers para listar arquivos do Google Drive em uma pasta.
// Usa fetch + Service Account JWT manual (sem dependencias extras).

import crypto from 'crypto';

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64UrlEncode(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const credsRaw = process.env.GOOGLE_DRIVE_CREDENTIALS_JSON;
  if (!credsRaw) {
    throw new Error('GOOGLE_DRIVE_CREDENTIALS_JSON nao configurado');
  }

  let creds: { client_email: string; private_key: string };
  try {
    creds = JSON.parse(credsRaw);
  } catch (e) {
    throw new Error('GOOGLE_DRIVE_CREDENTIALS_JSON invalido (nao eh JSON)');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = base64UrlEncode(signer.sign(creds.private_key));
  const jwt = `${unsigned}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OAuth Drive falhou: ${resp.status} ${t}`);
  }
  const data = (await resp.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export type DriveFile = {
  id: string;
  name: string;
  parents?: string[];
  webViewLink?: string;
  createdTime?: string;
  mimeType?: string;
};

async function driveList(query: string): Promise<DriveFile[]> {
  const token = await getAccessToken();
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'files(id,name,parents,createdTime,webViewLink,mimeType)');
  url.searchParams.set('pageSize', '1000');
  url.searchParams.set('orderBy', 'createdTime desc');

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Drive list falhou: ${resp.status} ${t}`);
  }
  const data = (await resp.json()) as { files?: DriveFile[] };
  return data.files ?? [];
}

/**
 * Lista PDFs em uma pasta do Drive.
 */
export async function listPdfsInFolder(folderId: string): Promise<DriveFile[]> {
  return driveList(
    `'${folderId}' in parents and trashed=false and mimeType='application/pdf'`
  );
}

/**
 * Lista PDFs em multiplas pastas do Drive numa unica chamada.
 */
export async function listPdfsInFolders(folderIds: string[]): Promise<DriveFile[]> {
  if (folderIds.length === 0) return [];
  const clauses = folderIds.map((id) => `'${id}' in parents`).join(' or ');
  return driveList(
    `(${clauses}) and trashed=false and mimeType='application/pdf'`
  );
}
