// 09/11: Web Push (notificação no celular) sem biblioteca externa.
// Criptografia do conteúdo: RFC 8291 (aes128gcm). Identificação do servidor: VAPID (RFC 8292, JWT ES256).
import crypto from 'node:crypto';

export type Inscricao = { endpoint: string; p256dh: string; auth: string };
export type Vapid = { publica: string; privada: string; contato: string };

const b64u = (b: Buffer) => b.toString('base64url');
const deB64u = (s: string) => Buffer.from(s, 'base64url');

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, len: number): Buffer {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  return crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);
}

// Conteúdo cifrado para uma inscrição (um único registro). salt/chave efêmera podem ser fixados só em teste.
export function cifrar(payload: Buffer, ins: Inscricao, teste?: { salt: Buffer; privEfemera: Buffer }): Buffer {
  const uaPub = deB64u(ins.p256dh);
  const authSecret = deB64u(ins.auth);
  const ecdh = crypto.createECDH('prime256v1');
  if (teste) ecdh.setPrivateKey(teste.privEfemera); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const segredo = ecdh.computeSecret(uaPub);
  const salt = teste?.salt ?? crypto.randomBytes(16);
  const ikm = hkdf(authSecret, segredo, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const corpo = Buffer.concat([c.update(Buffer.concat([payload, Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, corpo]);
}

function jwtVapid(endpoint: string, v: Vapid): string {
  const pub = deB64u(v.publica);
  const chave = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: v.privada, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  const cab = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corpo = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.contato })));
  const ass = crypto.sign('sha256', Buffer.from(cab + '.' + corpo), { key: chave, dsaEncoding: 'ieee-p1363' });
  return cab + '.' + corpo + '.' + b64u(ass);
}

// Envia; devolve o status HTTP do serviço de push (201 = aceito; 404/410 = inscrição morta).
export async function enviarPush(ins: Inscricao, dados: unknown, v: Vapid, ttl = 3600): Promise<number> {
  const corpo = cifrar(Buffer.from(JSON.stringify(dados)), ins);
  const r = await fetch(ins.endpoint, {
    method: 'POST',
    headers: {
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(ttl),
      urgency: 'high',
      authorization: `vapid t=${jwtVapid(ins.endpoint, v)}, k=${v.publica}`,
    },
    body: new Uint8Array(corpo),
    cache: 'no-store',
  });
  return r.status;
}
