// Validación de la sesión que HIOFFICE pasa por su menú (single sign-on).
//
// El link del menú de HIOFFICE se configura así (HIOFFICE reemplaza las $$$…$$$ al abrirlo):
//   https://hioconciliacion.netlify.app/hio#t=$$$SESSION_TOKEN$$$&s=$$$SERVER_NAME$$$&e=$$$USER_EMAIL$$$
// Todo va después del "#": el token nunca llega a los logs del servidor (lo manda el
// navegador por POST a /api/auth/hio).
//
// NO se confía en la URL:
//   - server: solo *.hiopos.com (si no, alguien podría hacernos mandar el token a otro host).
//   - token:  GET entityLoader/company con ese token → companyId REAL de la empresa (401 = inválido).
// La empresa que devuelve HIOFFICE (companyId) es la que mapeamos al cliente (Tenant) de Conciliación.
// OJO: NUNCA llamar a session/logout con este token (cerraría la sesión del usuario en HIOFFICE).

const HOST_OK = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.hiopos\.com$/i

export class ErrorHio extends Error {}

/** Valida el token/servidor de HIOFFICE y devuelve el companyId real de la sesión. */
export async function empresaDeTokenHio(d: { token: string; server: string }): Promise<{ companyId: string; server: string }> {
  const token = d.token.trim()
  const server = d.server.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[:/].*$/, '')
  if (!token || token.includes('$$$') || token.length > 180)
    throw new ErrorHio('El link de HIOFFICE no trajo la sesión (revisá que tenga $$$SESSION_TOKEN$$$).')
  if (!HOST_OK.test(server)) throw new ErrorHio(`Servidor de HIOFFICE no permitido: "${server}"`)

  const r = await fetch(`https://${server}/ErpCloud/entityLoader/company`, {
    headers: { 'x-auth-token': token, accept: 'application/json' },
    cache: 'no-store',
  })
  if (r.status === 401 || r.status === 403)
    throw new ErrorHio('La sesión de HIOFFICE no es válida o venció: volvé a abrir desde el menú de HIOFFICE.')
  if (!r.ok) throw new ErrorHio(`HIOFFICE respondió ${r.status} al validar la sesión.`)

  const emp = (await r.json().catch(() => null)) as { companyId?: number | string } | null
  if (emp?.companyId == null) throw new ErrorHio('HIOFFICE no devolvió la empresa de la sesión.')
  return { companyId: String(emp.companyId), server }
}
