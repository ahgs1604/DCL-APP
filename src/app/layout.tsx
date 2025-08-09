export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="es"><body style={{margin:0,fontFamily:'system-ui,sans-serif'}}>
  <header style={{padding:12,borderBottom:'1px solid #eee',display:'flex',gap:12}}>
    <a href="/"><b>DCL • Estimaciones & Inventario</b></a>
    <nav style={{display:'flex',gap:10}}>
      <a href="/(app)/estimations/new">Nueva estimación</a>
      <a href="/(app)/inventory">Inventario</a>
      <a href="/(app)/admin/concepts">Admin catálogo</a>
    </nav>
  </header>
  <main style={{padding:16}}>{children}</main>
  </body></html>);
}