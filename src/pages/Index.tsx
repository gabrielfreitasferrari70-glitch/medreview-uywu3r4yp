import { useEffect } from 'react'

// MedReview — loader FSRS-5: baixa o snapshot original do app e aplica
// recoloração roxo→verde + motor FSRS-5 + polish (transformações verificadas
// byte-a-byte contra a versão validada localmente).
const SNAPSHOT_URL =
  'https://skip-artifacts-snapshots.application.production.adapta.tools/user_3HTICEnYMM5WBBANnC92pS98buX/yisoxzvbrn3bl5lzd6jer67vtu/revisions/8307c45a-9eba-47b5-9ecf-ffa97e8a04a9/index.html'

type Edit = unknown[]

interface EditData {
  colors: string[][]
  edits: Edit[]
}

async function loadData(): Promise<EditData> {
  const rs = await Promise.all([
    fetch('/mr-p1.json', { cache: 'no-store' }),
    fetch('/mr-p2.json', { cache: 'no-store' }),
    fetch('/mr-p3.json', { cache: 'no-store' }),
  ])
  if (rs.some((r) => !r.ok)) throw new Error('falha ao carregar transformações')
  const parts = (await Promise.all(rs.map((r) => r.json()))) as EditData[]
  return {
    colors: parts[0].colors,
    edits: parts.flatMap((p) => p.edits),
  }
}

function transform(html: string, data: EditData): string {
  let out = html
  for (const pair of data.colors) {
    const a = pair[0]
    const b = pair[1]
    out = out.split(a).join(b)
    out = out.split(a.toUpperCase()).join(b.toUpperCase())
  }
  for (const e of data.edits) {
    const kind = e[0] as string
    if (kind === 'b') {
      const i = out.indexOf(e[1] as string)
      const j = out.indexOf(e[2] as string, i)
      out = out.slice(0, i) + (e[3] as string) + out.slice(j)
    } else {
      const search = e[1] as string
      const replace = e[2] as string
      if (e[3] === true) {
        out = out.split(search).join(replace)
      } else {
        out = out.replace(search, replace)
      }
    }
  }
  return out
}

export default function Index() {
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(SNAPSHOT_URL, { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error('snapshot HTTP ' + r.status)
        return r.text()
      }),
      loadData(),
    ])
      .then(([raw, data]) => {
        if (cancelled) return
        const html = transform(raw, data)
        document.open()
        document.write(html)
        document.close()
      })
      .catch((err) => {
        if (cancelled) return
        document.body.innerHTML =
          '<div style="font-family:system-ui;padding:2.5rem;text-align:center;">' +
          '<h1 style="color:#16a34a;">MedReview 🩺</h1>' +
          '<p>Não foi possível carregar o app: ' +
          String(err && err.message ? err.message : err) +
          '</p></div>'
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui', padding: '3rem 1rem', textAlign: 'center' }}>
      <h1 style={{ color: '#16a34a' }}>MedReview 🩺</h1>
      <p>Carregando app FSRS-5…</p>
    </div>
  )
}
