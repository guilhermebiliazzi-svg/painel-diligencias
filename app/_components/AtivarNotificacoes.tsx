'use client';
// 09/11: liga as notificações de lead novo neste celular (Web Push). Funciona junto com o WhatsApp.
import { useEffect, useState } from 'react';

type Estado = 'carregando' | 'sem-suporte' | 'iphone-instalar' | 'bloqueado' | 'desligado' | 'ligado';

function chaveBytes(b64u: string) {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export default function AtivarNotificacoes() {
  const [estado, setEstado] = useState<Estado>('carregando');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const instalado = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setEstado(ios && !instalado ? 'iphone-instalar' : 'sem-suporte'); return;
      }
      if (Notification.permission === 'denied') { setEstado('bloqueado'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') {
        // reenvia a inscrição (o celular pode ter trocado o endereço)
        fetch('/api/push/inscrever', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub) }).catch(() => {});
        setEstado('ligado');
      } else setEstado('desligado');
    })().catch(() => setEstado('sem-suporte'));
  }, []);

  async function ligar() {
    setOcupado(true); setMsg('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setEstado(perm === 'denied' ? 'bloqueado' : 'desligado'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const { publica } = await (await fetch('/api/push/chave')).json();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(publica) }));
      const r = await fetch('/api/push/inscrever', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'falha ao gravar');
      setEstado('ligado'); setMsg('Pronto! Os leads novos vão tocar neste aparelho.');
    } catch (e) {
      setMsg('Não consegui ligar: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setOcupado(false); }
  }

  async function testar() {
    setOcupado(true); setMsg('');
    try {
      const j = await (await fetch('/api/push/teste', { method: 'POST' })).json();
      setMsg(j.ok ? 'Teste enviado. Deve aparecer em alguns segundos.' : 'O teste não saiu. Tente desligar e ligar de novo.');
    } finally { setOcupado(false); }
  }

  async function desligar() {
    setOcupado(true); setMsg('');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/inscrever', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setEstado('desligado'); setMsg('Notificações desligadas neste aparelho.');
    } finally { setOcupado(false); }
  }

  if (estado === 'carregando' || estado === 'sem-suporte') return null;
  const botao = 'rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50';
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Notificação de lead novo no celular</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {estado === 'ligado' && 'Ligada neste aparelho. Chega junto com o WhatsApp.'}
            {estado === 'desligado' && 'Receba um aviso aqui quando a Eva te oferecer um lead, além do WhatsApp.'}
            {estado === 'bloqueado' && 'As notificações estão bloqueadas para o painel. Libere nas configurações do celular (Notificações) e recarregue.'}
            {estado === 'iphone-instalar' && 'No iPhone: abra o painel no Safari, toque em Compartilhar → "Adicionar à Tela de Início" e entre pelo ícone. Aí aparece o botão para ligar.'}
          </p>
        </div>
        <div className="flex gap-2">
          {estado === 'desligado' && <button onClick={ligar} disabled={ocupado} className={botao + ' bg-blue-600 text-white hover:bg-blue-700'}>Ativar notificações</button>}
          {estado === 'ligado' && <>
            <button onClick={testar} disabled={ocupado} className={botao + ' border border-slate-200 text-slate-700 hover:bg-slate-50'}>Enviar teste</button>
            <button onClick={desligar} disabled={ocupado} className={botao + ' text-slate-500 hover:text-slate-800'}>Desligar</button>
          </>}
        </div>
      </div>
      {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
    </section>
  );
}
