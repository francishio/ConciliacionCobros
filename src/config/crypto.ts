// Cifrado simétrico para secretos guardados en la base (credenciales del Bridge,
// tokens de pasarela). AES-256-GCM con clave en env CONFIG_ENC_KEY (32 bytes hex).
// Formato almacenado: "iv:tag:ciphertext", cada parte en base64.
//
// Si se pierde/rota la clave, los secretos guardados dejan de descifrarse (hay
// que volver a cargarlos). Por eso CONFIG_ENC_KEY se setea una vez y no cambia.
import crypto from 'crypto'

function clave(): Buffer {
  const hex = process.env.CONFIG_ENC_KEY
  if (!hex) throw new Error('Falta CONFIG_ENC_KEY en el entorno (32 bytes en hex).')
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== 32) throw new Error('CONFIG_ENC_KEY debe ser de 32 bytes (64 hex).')
  return buf
}

export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', clave(), iv)
  const enc = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, enc].map((b) => b.toString('base64')).join(':')
}

export function descifrar(payload: string): string {
  const [iv, tag, enc] = payload.split(':').map((s) => Buffer.from(s, 'base64'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', clave(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
