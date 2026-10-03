// Seed inicial MedReview — somente dados-base, servido a usuários autenticados.
// Importante: PocketBase JSON deve ser lido com getString(), não get() (que pode
// expor bytes como objeto indexado por caracteres e produzir o falso "seed vazio").
routerAdd(
  'GET',
  '/backend/v1/mr/seed',
  (e) => {
    let stage = 'find-seed-record'
    try {
      const rec = $app.findRecordById('medreview_state', 'alw0c9r44hr44yl')
      stage = 'read-json-field'
      const raw = rec.getString('data')
      if (!raw) throw new Error('seed_json_empty')
      let parsed = JSON.parse(raw)
      if (typeof parsed === 'string') parsed = JSON.parse(parsed)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('seed_json_shape_invalid')
      }
      stage = 'normalize-seed'
      const state = parsed && parsed.state ? parsed.state : parsed
      const tuts = (state && state.tutorias_numbered) || {}
      const provas = (state && state.provas) || {}
      const decks = []
      const tutKeys = Object.keys(tuts).sort((a, b) => {
        const na = parseInt(
          (String((tuts[a] && tuts[a].title) || '').match(/\d+/) || ['999'])[0],
          10,
        )
        const nb = parseInt(
          (String((tuts[b] && tuts[b].title) || '').match(/\d+/) || ['999'])[0],
          10,
        )
        return na - nb
      })
      tutKeys.forEach((key) => {
        const deck = tuts[key]
        if (!deck || !Array.isArray(deck.cards)) return
        const deckNumber = parseInt((String(key).match(/[0-9]+/) || ['0'])[0], 10)
        const seedKey = 'initial:tutoria:' + String(deckNumber).padStart(2, '0')
        decks.push({
          seed_key: seedKey,
          title: deck.title || key,
          kind: 'tutoria',
          cards: deck.cards.map((card, index) => {
            const output = {
              seed_key: seedKey + ':' + String(index + 1).padStart(3, '0'),
              q: card.q || '',
              a: card.a || '',
              group: card.group || '',
              ref: card.ref || '',
            }
            if (card.diagramSvg) {
              output.diagramSvg = card.diagramSvg
              output.diagramTitle = card.diagramTitle || ''
            }
            return output
          }),
        })
      })
      Object.keys(provas)
        .sort()
        .forEach((key, index) => {
          const deck = provas[key]
          if (!deck || !Array.isArray(deck.cards)) return
          const seedKey = 'initial:prova:' + String(index + 1).padStart(2, '0')
          decks.push({
            seed_key: seedKey,
            title: deck.title || key,
            kind: 'prova',
            cards: deck.cards.map((card, cardIndex) => {
              const output = {
                seed_key: seedKey + ':' + String(cardIndex + 1).padStart(3, '0'),
                q: card.q || '',
                a: card.a || '',
                group: card.group || '',
                ref: card.ref || '',
              }
              if (card.diagramSvg) {
                output.diagramSvg = card.diagramSvg
                output.diagramTitle = card.diagramTitle || ''
              }
              return output
            }),
          })
        })
      const totalCards = decks.reduce((count, deck) => count + deck.cards.length, 0)
      stage = 'validate-seed-count'
      if (totalCards !== 186) {
        const structure = {
          parsedType: typeof parsed,
          parsedKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 30) : [],
          stateKeys: state && typeof state === 'object' ? Object.keys(state).slice(0, 30) : [],
          tutoriaKeys: Object.keys(tuts).slice(0, 30),
          provaKeys: Object.keys(provas).slice(0, 20),
          perDeckCounts: decks.map((deck) => ({
            title: deck.title,
            kind: deck.kind,
            cards: deck.cards.length,
          })),
          decks: decks.length,
          cards: totalCards,
        }
        $app
          .logger()
          .error(
            'MedReview seed count mismatch',
            'stage',
            stage,
            'structure',
            JSON.stringify(structure),
          )
        return e.json(500, { error: 'seed_count_mismatch', structure })
      }
      return e.json(200, { schemaVersion: 1, decks, totalCards })
    } catch (err) {
      const errorId = 'seed-' + Date.now().toString(36)
      const errorText = err && err.message ? String(err.message) : String(err)
      $app
        .logger()
        .error(
          'MedReview seed route failed',
          'errorId',
          errorId,
          'stage',
          stage,
          'error',
          errorText.slice(0, 220),
        )
      return e.json(500, { error: 'seed_failed', errorId, stage, code: errorText.slice(0, 120) })
    }
  },
  $apis.requireAuth(),
)
