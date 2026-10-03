// Seed inicial MedReview — somente dados-base, servido a usuários autenticados.
// Importante: PocketBase JSON deve ser lido com getString(), não get() (que pode
// expor bytes como objeto indexado por caracteres e produzir o falso "seed vazio").
routerAdd(
  'GET',
  '/backend/v1/mr/seed',
  (e) => {
    try {
      const rec = $app.findRecordById('medreview_state', 'alw0c9r44hr44yl')
      const raw = rec.getString('data')
      let parsed = JSON.parse(raw)
      if (typeof parsed === 'string') parsed = JSON.parse(parsed)
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
        const deckNumber = parseInt((String(key).match(/\\d+/) || ['0'])[0], 10)
        const seedKey = 'initial:tutoria:' + String(deckNumber).padStart(2, '0')
        decks.push({
          seed_key: seedKey,
          title: deck.title || key,
          kind: 'tutoria',
          cards: deck.cards.map((card, index) => ({
            seed_key: seedKey + ':' + String(index + 1).padStart(3, '0'),
            q: card.q || '',
            a: card.a || '',
            group: card.group || '',
            ref: card.ref || '',
            ...(card.diagramSvg
              ? { diagramSvg: card.diagramSvg, diagramTitle: card.diagramTitle || '' }
              : {}),
          })),
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
            cards: deck.cards.map((card, cardIndex) => ({
              seed_key: seedKey + ':' + String(cardIndex + 1).padStart(3, '0'),
              q: card.q || '',
              a: card.a || '',
              group: card.group || '',
              ref: card.ref || '',
              ...(card.diagramSvg
                ? { diagramSvg: card.diagramSvg, diagramTitle: card.diagramTitle || '' }
                : {}),
            })),
          })
        })
      const totalCards = decks.reduce((count, deck) => count + deck.cards.length, 0)
      if (totalCards !== 186) {
        $app
          .logger()
          .error('MedReview seed count mismatch', 'decks', decks.length, 'cards', totalCards)
        return e.internalServerError('O pacote inicial de cartões está incompleto.')
      }
      return e.json(200, { schemaVersion: 1, decks, totalCards })
    } catch (err) {
      $app
        .logger()
        .error(
          'MedReview seed route failed',
          'error',
          err && err.message ? err.message : String(err),
        )
      return e.internalServerError('Não foi possível carregar os cartões iniciais.')
    }
  },
  $apis.requireAuth(),
)
