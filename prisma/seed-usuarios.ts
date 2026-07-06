// Seed de usuarios iniciales. Idempotente: si el usuario ya existe, NO toca su
// contraseña. Para los nuevos, genera una contraseña y la imprime una sola vez.
// Ejecutar (con el dev frenado): npx tsx ./prisma/seed-usuarios.ts
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { adminDb } from '../src/db/admin'

function generarPassword(): string {
  return crypto.randomBytes(9).toString('base64url') // ~12 chars
}

async function crearSiNoExiste(
  email: string,
  rol: 'SUPERADMIN' | 'CLIENTE',
  tenantId: string | null,
  nombre: string,
) {
  const existe = await adminDb.usuario.findUnique({ where: { email }, select: { rol: true } })
  if (existe) {
    console.log(`=  ${email} ya existe (${existe.rol}) — sin cambios`)
    return
  }
  const pass = generarPassword()
  const passwordHash = await bcrypt.hash(pass, 10)
  await adminDb.usuario.create({ data: { email, passwordHash, rol, tenantId, nombre } })
  console.log(`+  ${email} (${rol})  ·  contraseña: ${pass}`)
}

async function main() {
  console.log('== Seed de usuarios ==')
  await crearSiNoExiste('frodriguez@icgargentina.com.ar', 'SUPERADMIN', null, 'Francisco (ICG)')

  const rochino = await adminDb.tenant.findFirst({ where: { nombre: 'Rochino' }, select: { id: true } })
  if (rochino) {
    await crearSiNoExiste('rochino@rochino.com', 'CLIENTE', rochino.id, 'Rochino')
  } else {
    console.log('!  No existe el tenant "Rochino" — salteo el usuario cliente.')
  }
  console.log('\nGuardá las contraseñas mostradas; se pueden cambiar luego.')
  process.exit(0)
}

main().catch((e) => {
  console.error('ERROR:', e)
  process.exit(1)
})
