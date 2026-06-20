// Cliente del Bridge Hioffice (WebService de ICG/HIOPOS).
// Flujo: login → launch exportation → logout. La exportación devuelve uno o
// más documentos en Base64 (JSON/CSV/XML según cómo esté configurado el
// exportationId). Doc de referencia: "Bridge Hioffice - POSTMAN".
//
// Nota: es una API DISTINTA al PortalRest de gastronomia-app. No reutilizar
// aquel cliente.

const LOGIN_URL_DEFAULT = 'https://cloudlicense.icg.eu/services/cloud/getCustomerWithAuthToken'

export interface BridgeConfig {
  email: string
  password: string
  isoLanguage?: string // default 'ES'
  loginUrl?: string
  fetchImpl?: typeof fetch // inyectable para test
}

export interface BridgeSession {
  address: string // dir_cloudclient (servidor a llamar tras el login)
  authToken: string
  port: number
  secure: boolean
  baseUrl: string // construido a partir de address/port/secure
}

export interface ExportacionParams {
  exportationId: string | number // Integer = por tabla; String = por dashboard
  startDate: string // yyyy-mm-dd
  endDate: string // yyyy-mm-dd
  filters?: unknown[]
}

export type TipoDoc = 0 | 1 | 2 | 3 | 4 | 5 // 1=csv 2=pdf 3=txt 4=json 5=xml

export interface ExportedDoc {
  name: string
  type: TipoDoc
  dataBase64: string
  contenido: string // ya decodificado a utf-8
}

function extraerTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? m[1].trim() : undefined
}

export class HioposBridgeClient {
  private readonly f: typeof fetch

  constructor(private readonly cfg: BridgeConfig) {
    this.f = cfg.fetchImpl ?? fetch
  }

  async login(): Promise<BridgeSession> {
    const url = new URL(this.cfg.loginUrl ?? LOGIN_URL_DEFAULT)
    url.searchParams.set('email', this.cfg.email)
    url.searchParams.set('password', this.cfg.password)
    url.searchParams.set('isoLanguage', this.cfg.isoLanguage ?? 'ES')

    const res = await this.f(url.toString())
    if (!res.ok) throw new Error(`Login Bridge falló: ${res.status} ${res.statusText}`)
    const xml = await res.text()

    const authToken = extraerTag(xml, 'authToken')
    const address = extraerTag(xml, 'address')
    if (!authToken || !address) {
      throw new Error(`Respuesta de login sin authToken/address: ${xml.slice(0, 200)}`)
    }
    const port = Number(extraerTag(xml, 'port') ?? '443')
    const secure = (extraerTag(xml, 'secure') ?? 'true').toLowerCase() === 'true'
    const proto = secure ? 'https' : 'http'
    const esEstandar = (secure && port === 443) || (!secure && port === 80)
    const baseUrl = esEstandar ? `${proto}://${address}` : `${proto}://${address}:${port}`

    return { address, authToken, port, secure, baseUrl }
  }

  async launchExportation(session: BridgeSession, params: ExportacionParams): Promise<ExportedDoc[]> {
    const res = await this.f(`${session.baseUrl}/ErpCloud/exportation/launch`, {
      method: 'POST',
      headers: { 'x-auth-token': session.authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exportationId: String(params.exportationId),
        startDate: params.startDate,
        endDate: params.endDate,
        filters: params.filters ?? [],
      }),
    })
    if (!res.ok) throw new Error(`Exportación Bridge falló: ${res.status} ${res.statusText}`)

    const data = (await res.json()) as {
      exportedDocs?: { name: string; data: string; type: number }[]
    }
    return (data.exportedDocs ?? []).map((d) => ({
      name: d.name,
      type: d.type as TipoDoc,
      dataBase64: d.data,
      contenido: Buffer.from(d.data, 'base64').toString('utf8'),
    }))
  }

  async logout(session: BridgeSession): Promise<void> {
    const res = await this.f(`${session.baseUrl}/ErpCloud/session/logout`, {
      headers: { 'x-auth-token': session.authToken },
    })
    if (!res.ok) throw new Error(`Logout Bridge falló: ${res.status} ${res.statusText}`)
  }

  // Conveniencia: login → exportar → logout (logout best-effort).
  async exportar(params: ExportacionParams): Promise<ExportedDoc[]> {
    const session = await this.login()
    try {
      return await this.launchExportation(session, params)
    } finally {
      try {
        await this.logout(session)
      } catch {
        /* best-effort: no romper la ingesta si el logout falla */
      }
    }
  }
}
