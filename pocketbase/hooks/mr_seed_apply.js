routerAdd(
  'POST',
  '/backend/v1/mr/seed/apply',
  (e) => {
    const userId = e.auth && e.auth.id ? e.auth.id : ''
    if (!userId) return e.unauthorizedError('Faça login para inicializar sua biblioteca.')
    try {
      const catalogRecord = $app.findFirstRecordByData(
        'mr_seed_catalog',
        'version',
        'medreview-seed-v1',
      )
      let catalog = JSON.parse(catalogRecord.getString('data'))
      if (typeof catalog === 'string') catalog = JSON.parse(catalog)
      if (!catalog || !Array.isArray(catalog.decks)) throw new Error('seed_catalog_invalid')
      const existingDecks = $app.findRecordsByFilter(
        'mr_decks',
        'user_id = {:user}',
        'order',
        500,
        0,
        { user: userId },
      )
      const existingCards = $app.findRecordsByFilter(
        'mr_cards',
        'user_id = {:user}',
        '-created',
        1000,
        0,
        { user: userId },
      )
      let hasLegacyContent = false
      for (let i = 0; i < existingDecks.length; i++) {
        if (!existingDecks[i].getBool('deleted') && !existingDecks[i].getString('seed_key'))
          hasLegacyContent = true
      }
      if (hasLegacyContent) {
        return e.json(409, {
          error: 'legacy_library_exists',
          message:
            'Esta conta já possui pastas sem chave de catálogo. Não duplicamos cartões existentes.',
        })
      }
      const deckBySeed = {}
      const cardBySeed = {}
      for (let i = 0; i < existingDecks.length; i++) {
        const seedKey = existingDecks[i].getString('seed_key')
        if (seedKey) deckBySeed[seedKey] = existingDecks[i]
      }
      for (let i = 0; i < existingCards.length; i++) {
        const seedKey = existingCards[i].getString('seed_key')
        if (seedKey) cardBySeed[seedKey] = existingCards[i]
      }
      let createdDecks = 0
      let createdCards = 0
      for (let i = 0; i < catalog.decks.length; i++) {
        const seedDeck = catalog.decks[i]
        let deck = deckBySeed[seedDeck.seed_key]
        if (!deck) {
          const deckCollection = $app.findCollectionByNameOrId('mr_decks')
          deck = new Record(deckCollection)
          deck.set('user_id', userId)
          deck.set('title', seedDeck.title)
          deck.set('kind', seedDeck.kind)
          deck.set('order', seedDeck.order)
          deck.set('seed_key', seedDeck.seed_key)
          $app.save(deck)
          deckBySeed[seedDeck.seed_key] = deck
          createdDecks++
        }
        const seedCards = Array.isArray(seedDeck.cards) ? seedDeck.cards : []
        for (let j = 0; j < seedCards.length; j++) {
          const seedCard = seedCards[j]
          if (cardBySeed[seedCard.seed_key]) continue
          const cardCollection = $app.findCollectionByNameOrId('mr_cards')
          const card = new Record(cardCollection)
          card.set('user_id', userId)
          card.set('deck', deck.id)
          card.set('q', seedCard.q)
          card.set('a', seedCard.a)
          card.set('group', seedCard.group || '')
          card.set('ref', seedCard.ref || '')
          card.set('suspended', false)
          card.set('seed_key', seedCard.seed_key)
          card.set('deleted', false)
          if (seedCard.diagramSvg) {
            card.set('diagram_svg', seedCard.diagramSvg)
            card.set('diagram_title', seedCard.diagramTitle || '')
          }
          $app.save(card)
          cardBySeed[seedCard.seed_key] = card
          createdCards++
        }
      }
      return e.json(200, {
        ok: true,
        createdDecks,
        createdCards,
        totalDecks: Object.keys(deckBySeed).length,
        totalCards: Object.keys(cardBySeed).length,
      })
    } catch (err) {
      const errorId = 'seed-apply-' + Date.now().toString(36)
      const message = err && err.message ? String(err.message) : String(err)
      $app
        .logger()
        .error(
          'MedReview seed apply failed',
          'errorId',
          errorId,
          'userId',
          userId,
          'error',
          message.slice(0, 180),
        )
      return e.json(500, {
        error: 'seed_apply_failed',
        errorId,
        message: 'Não foi possível inicializar os cartões. Tente novamente.',
      })
    }
  },
  $apis.requireAuth(),
)
