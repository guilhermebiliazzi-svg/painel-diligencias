// Envio de e-mail via SMTP (Google Workspace — ville@remax.com.br).
// Config por variáveis de ambiente na Vercel:
//   SMTP_HOST   (padrão smtp.gmail.com)
//   SMTP_PORT   (padrão 465)
//   SMTP_USER   (a caixa, ex.: ville@remax.com.br)
//   SMTP_PASS   (senha de app do Google — 16 caracteres)
//   MAIL_FROM   (opcional; padrão = "Ville Jardins <SMTP_USER>")
import nodemailer from "nodemailer";

export function mailerConfigurado(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function remetente(): string {
  const user = process.env.SMTP_USER || "";
  return process.env.MAIL_FROM || (user ? `Ville Jardins <${user}>` : "");
}

export type Anexo = { filename: string; content: Buffer; contentType?: string };

export async function enviarEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Anexo[];
}): Promise<void> {
  if (!mailerConfigurado()) {
    throw new Error("SMTP não configurado (defina SMTP_USER e SMTP_PASS na Vercel).");
  }
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  // Google mostra a senha de app com espaços ("abcd efgh ijkl mnop"); a senha
  // real não tem espaços. Remove espaços do pass e apara o user por segurança.
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL; 587 = STARTTLS
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: remetente(),
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: (opts.attachments || []).map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType || "application/pdf",
    })),
  });
}
