const SNAPSHOT_URL =
  'https://skip-artifacts-snapshots.application.production.adapta.tools/user_3HTICEnYMM5WBBANnC92pS98buX/yisoxzvbrn3bl5lzd6jer67vtu/revisions/8307c45a-9eba-47b5-9ecf-ffa97e8a04a9/index.html'

async function main() {
  const res = await fetch(SNAPSHOT_URL)
  const html = await res.text()

  // Search for currentFolderContext definition
  const cfcMatch = html.match(/function\s+currentFolderContext[\s\S]{0,300}/)
  console.log('--- currentFolderContext ---')
  console.log(cfcMatch ? cfcMatch[0] : 'NOT FOUND')

  // Search for navigation / routing functions
  const navMatches = html.match(
    /function\s+(?:navigate|render|open|view|show)[\w]*\s*\([^)]*\)\s*\{[\s\S]{0,300}/g,
  )
  console.log('--- Nav functions ---')
  console.log(navMatches ? navMatches.slice(0, 10).join('\n---\n') : 'NOT FOUND')

  // Search for where folders are rendered or where buttons are
  const folderHeaderMatches = html.match(
    /class=["'][^"']*(?:folder|deck|header|action|title)[^"']*["']/gi,
  )
  console.log('--- Classes with folder/deck/header/action ---')
  const uniqueClasses = new Set()
  ;(folderHeaderMatches || []).forEach((m) => {
    const cls = m
      .replace(/class=["']|["']/gi, '')
      .trim()
      .split(/\s+/)
    cls.forEach((c) => uniqueClasses.add(c))
  })
  console.log(Array.from(uniqueClasses).join(', '))

  // Search for "Nova Carta" or how cards/folders are created
  const novaMatches = html.match(/.{0,100}Nova Carta.{0,100}/gi)
  console.log('--- Nova Carta matches ---')
  console.log(novaMatches ? novaMatches.slice(0, 5).join('\n') : 'NOT FOUND')

  // Search for "Nova Pasta"
  const pastaMatches = html.match(/.{0,100}Nova Pasta.{0,100}/gi)
  console.log('--- Nova Pasta matches ---')
  console.log(pastaMatches ? pastaMatches.slice(0, 5).join('\n') : 'NOT FOUND')

  // Find scripts functions
  const allFunctions = Array.from(html.matchAll(/function\s+([a-zA-Z0-9_$]+)\s*\(/g)).map(
    (m) => m[1],
  )
  console.log('--- All functions defined in snapshot ---')
  console.log(allFunctions.join(', '))

  // Fail on purpose to print to QA output
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
