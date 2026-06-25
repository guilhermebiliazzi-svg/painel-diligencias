// Declaração mínima para o pacote html-to-docx, que não traz tipos próprios.
// Sem isto o build da Vercel falha com "Could not find a declaration file for module 'html-to-docx'".
// Colocar na RAIZ do projeto painel-diligencias (mesmo nível do package.json).
declare module 'html-to-docx';
