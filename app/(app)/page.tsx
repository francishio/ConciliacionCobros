// La home redirige a Conciliación (CONC HIO-PAS), que es lo que más se usa.
// (El dashboard anterior quedó sin usar; se puede retomar como panel general.)
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/conciliacion')
}
