'use client'

// Cartel flotante que ofrece instalar la app (PWA). En Chrome/Edge dispara el
// diálogo nativo; en iPhone (sin API de instalación) explica cómo hacerlo a mano.
import { useEffect, useState } from 'react'

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const CLAVE_OCULTO = 'concilia:ocultar-instalar'

// sessionStorage (no localStorage) a propósito: cerrar el cartel lo saca ahora,
// pero vuelve a ofrecerse la próxima vez que entren por el navegador. Mientras no
// esté instalada, el ofrecimiento sigue teniendo sentido.
function leerOculto(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_OCULTO) === '1'
  } catch {
    return false
  }
}
function guardarOculto() {
  try {
    sessionStorage.setItem(CLAVE_OCULTO, '1')
  } catch {
    /* storage bloqueado: sigue visible, no es grave */
  }
}
function yaEstaInstalada(): boolean {
  if (typeof window === 'undefined') return false
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  return Boolean(standalone || iosStandalone)
}
function esIPhone(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function IconoCompartirIOS() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block align-text-bottom">
      <path d="M12 15V3m0 0L8 7m4-4 4 4" />
      <path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    </svg>
  )
}

export function InstalarApp() {
  const [mostrar, setMostrar] = useState(false)
  const [enIPhone, setEnIPhone] = useState(false)
  const [evento, setEvento] = useState<EventoInstalacion | null>(null)

  useEffect(() => {
    if (yaEstaInstalada() || leerOculto()) return

    if (esIPhone()) {
      setEnIPhone(true)
      setMostrar(true)
      return
    }

    const alPoderInstalar = (e: Event) => {
      e.preventDefault()
      setEvento(e as EventoInstalacion)
      if (leerOculto()) return
      setMostrar(true)
    }
    const alInstalar = () => setMostrar(false)

    window.addEventListener('beforeinstallprompt', alPoderInstalar)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alPoderInstalar)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  if (!mostrar) return null

  function ocultar() {
    guardarOculto()
    setMostrar(false)
  }
  async function instalar() {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    guardarOculto()
    setMostrar(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4" role="dialog" aria-label="Instalar aplicación">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-hiopos.png" alt="HIOPOS" className="mb-1.5 h-4 w-auto" />
            <div className="text-[13px] font-semibold text-slate-800">Instalá la app</div>
            <div className="mt-0.5 text-[12px] text-slate-500">
              Se abre a pantalla completa y de un toque, sin buscar la pestaña.
            </div>
          </div>
          <button onClick={ocultar} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar" title="Ahora no">
            ✕
          </button>
        </div>

        {enIPhone ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
            En Safari, tocá <IconoCompartirIOS /> <strong>Compartir</strong> y elegí{' '}
            <strong>Añadir a pantalla de inicio</strong>.
          </p>
        ) : (
          <div className="mt-3 flex gap-2">
            <button onClick={instalar} className="pc-btn flex-1 px-4 py-2 text-[13px]">
              Instalar
            </button>
            <button onClick={ocultar} className="px-3 py-2 text-[12px] text-slate-500 hover:text-slate-700">
              Ahora no
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
