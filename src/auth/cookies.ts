// Atributos de la cookie de sesión (cc_sesion).
//
// En producción la app se embebe en un iframe de HIOFFICE (contexto cross-site).
// Para que el navegador NO descarte la cookie dentro del iframe tiene que ser
// SameSite=None + Secure + Partitioned (CHIPS). Si fuera 'lax' (el default), el
// navegador la tira adentro del iframe y la sesión "no agarra" → rebote al login.
// En desarrollo (http://localhost) 'none'+Secure no sirve (no hay https) → 'lax'.
export function cookieSesion(maxAgeSeg: number) {
  const prod = process.env.NODE_ENV === 'production'
  const base = { httpOnly: true, path: '/', maxAge: maxAgeSeg }
  return prod
    ? { ...base, secure: true, sameSite: 'none' as const, partitioned: true }
    : { ...base, secure: false, sameSite: 'lax' as const }
}
