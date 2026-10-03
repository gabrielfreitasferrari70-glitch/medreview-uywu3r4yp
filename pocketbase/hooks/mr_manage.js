// Operações de gestão MedReview; todas verificam ownership dentro do backend.
// v0.0.242: choices/reverse (múltipla escolha e reversas) — requer migration 0005.
routerAdd(
  'POST',
  '/backend/v1/mr/manage',
  (e) => {
    const userId = e.auth && e.auth.id ? e.auth.id : ''
    if (!userId) return e.unauthorizedError('Faça login para alterar sua biblioteca.')
    const body = e.requestInfo().body || {}
    const action = String(body.action || '')
    const ownDeck = (id) => {
      const deck = $app.findRecordById('mr_decks', String(id || ''))
      if (deck.getString('user_id') !== userId || deck.getBool('deleted'))
        throw new Error('deck_not_owned')
      return deck
    }
    const ownCard = (id) => {
      const card = $app.findRecordById('mr_cards', String(id || ''))
      if (card.getString('user_id') !== userId || card.getBool('deleted'))
        throw new Error('card_not_owned')
      return card
    }
    const cleanText = (value, max) =>
      String(value == null ? '' : value)
        .trim()
        .slice(0, max)
    try {
      if (action === 'deck_create') {
        const title = cleanText(body.title, 200)
        const kind = ['tutoria', 'prova', 'custom'].includes(body.kind) ? body.kind : 'custom'
        const mode = ['study', 'organizer'].includes(body.mode) ? body.mode : 'study'
        if (!title) return e.badRequestError('O nome da pasta é obrigatório.')
        let parent = null
        if (body.parent_id) parent = ownDeck(body.parent_id)
        const rows = $app.findRecordsByFilter('mr_decks', 'user_id = {:user}', 'order', 500, 0, {
          user: userId,
        })
        const col = $app.findCollectionByNameOrId('mr_decks')
        const deck = new Record(col)
        deck.set('user_id', userId)
        deck.set('title', title)
        deck.set('kind', kind)
        deck.set('mode', mode)
        deck.set('order', rows.length + 1)
        if (parent) deck.set('parent', parent.id)
        $app.save(deck)
        return e.json(201, { id: deck.id, title, kind, mode, parent: parent ? parent.id : '' })
      }

      if (action === 'deck_rename') {
        const deck = ownDeck(body.deck_id)
        const title = cleanText(body.title, 200)
        if (!title) return e.badRequestError('O nome da pasta é obrigatório.')
        deck.set('title', title)
        $app.save(deck)
        return e.json(200, { id: deck.id, title })
      }

      if (action === 'deck_delete') {
        const root = ownDeck(body.deck_id)
        const allDecks = $app.findRecordsByFilter(
          'mr_decks',
          'user_id = {:user}',
          'order',
          500,
          0,
          { user: userId },
        )
        const ids = {}
        ids[root.id] = true
        let changed = true
        while (changed) {
          changed = false
          for (let i = 0; i < allDecks.length; i++) {
            const parentId = allDecks[i].getString('parent')
            if (parentId && ids[parentId] && !ids[allDecks[i].id]) {
              ids[allDecks[i].id] = true
              changed = true
            }
          }
        }
        let deletedDecks = 0
        for (let i = 0; i < allDecks.length; i++) {
          if (!ids[allDecks[i].id]) continue
          allDecks[i].set('deleted', true)
          $app.save(allDecks[i])
          deletedDecks++
          const cards = $app.findRecordsByFilter(
            'mr_cards',
            'user_id = {:user} && deck = {:deck}',
            '-created',
            1000,
            0,
            { user: userId, deck: allDecks[i].id },
          )
          for (let j = 0; j < cards.length; j++) {
            if (!cards[j].getBool('deleted')) {
              cards[j].set('deleted', true)
              $app.save(cards[j])
            }
          }
        }
        return e.json(200, { ok: true, deletedDecks })
      }

      if (action === 'card_import_auto') {
        // Importação com pastas automáticas: cada item pode trazer folder_title;
        // pastas inexistentes são criadas sob o deck pai informado (ou raiz custom).
        const parentDeck = body.parent_deck_id ? ownDeck(body.parent_deck_id) : null
        const inputCards = Array.isArray(body.cards) ? body.cards : []
        if (!inputCards.length || inputCards.length > 250)
          return e.badRequestError('Envie entre 1 e 250 cartões por lote.')
        const allDecks = $app.findRecordsByFilter(
          'mr_decks',
          'user_id = {:user}',
          'order',
          500,
          0,
          { user: userId },
        )
        const byTitle = {}
        for (const d of allDecks) {
          if (!d.getBool('deleted')) byTitle[d.getString('title').toLowerCase()] = d
        }
        const createdDecks = {}
        const getOrCreateDeck = (title) => {
          const key = String(title).trim().toLowerCase()
          if (!key) return parentDeck || null
          if (byTitle[key]) return byTitle[key]
          const col = $app.findCollectionByNameOrId('mr_decks')
          const deck = new Record(col)
          deck.set('user_id', userId)
          deck.set('title', String(title).trim().slice(0, 200))
          deck.set('kind', parentDeck ? parentDeck.getString('kind') : 'custom')
          deck.set('order', allDecks.length + Object.keys(createdDecks).length + 1)
          if (parentDeck) deck.set('parent', parentDeck.id)
          $app.save(deck)
          // A pasta que recebeu o import com pastas automáticas vira organizadora.
          if (parentDeck && parentDeck.getString('mode') !== 'organizer') {
            parentDeck.set('mode', 'organizer')
            $app.save(parentDeck)
          }
          byTitle[key] = deck
          createdDecks[deck.id] = true
          return deck
        }
        const createdIds = []
        for (let i = 0; i < inputCards.length; i++) {
          const item = inputCards[i] || {}
          const q = String(item.q == null ? '' : item.q).trim()
          const a = String(item.a == null ? '' : item.a).trim()
          if (!q || !a) return e.badRequestError('Cada cartão precisa ter frente e verso.')
          if (q.length > 5000 || a.length > 20000)
            return e.badRequestError('Frente ou verso excede o limite de caracteres.')
          const deck = getOrCreateDeck(item.folder_title || '')
          if (!deck) return e.badRequestError('Informe a pasta de destino ou a coluna pasta.')
          const col = $app.findCollectionByNameOrId('mr_cards')
          const card = new Record(col)
          card.set('user_id', userId)
          card.set('deck', deck.id)
          card.set('q', q)
          card.set('a', a)
          card.set('group', cleanText(item.group, 200))
          card.set('ref', cleanText(item.ref, 500))
          card.set('suspended', false)
          card.set('deleted', false)
          $app.save(card)
          createdIds.push(card.id)
        }
        return e.json(201, {
          created: createdIds.length,
          ids: createdIds,
          createdDecks: Object.keys(createdDecks).length,
        })
      }

      if (action === 'card_create' || action === 'card_import') {
        const deck = ownDeck(body.deck_id)
        const inputCards = action === 'card_import' ? body.cards : [body.card || body]
        if (!Array.isArray(inputCards) || inputCards.length < 1 || inputCards.length > 250) {
          return e.badRequestError('Envie entre 1 e 250 cartões por lote.')
        }
        const createdIds = []
        for (let i = 0; i < inputCards.length; i++) {
          const item = inputCards[i] || {}
          const q = String(item.q == null ? '' : item.q).trim()
          const a = String(item.a == null ? '' : item.a).trim()
          if (!q || !a) return e.badRequestError('Cada cartão precisa ter frente e verso.')
          if (q.length > 5000 || a.length > 20000)
            return e.badRequestError('Frente ou verso excede o limite de caracteres.')
          const col = $app.findCollectionByNameOrId('mr_cards')
          const card = new Record(col)
          card.set('user_id', userId)
          card.set('deck', deck.id)
          card.set('q', q)
          card.set('a', a)
          card.set('group', cleanText(item.group, 200))
          card.set('ref', cleanText(item.ref, 500))
          card.set('suspended', false)
          card.set('deleted', false)
          if (item.diagramSvg) {
            card.set('diagram_svg', String(item.diagramSvg).slice(0, 20000))
            card.set('diagram_title', cleanText(item.diagramTitle, 200))
          }
          if (item.imageUrl && /^https?:\/\//i.test(String(item.imageUrl))) {
            card.set('diagram_svg', String(item.imageUrl).trim().slice(0, 2000))
            card.set('diagram_title', 'Imagem')
          }
          if (item.choices !== undefined && item.choices !== null) {
            let opts = item.choices
            if (typeof opts === 'string') {
              try {
                opts = JSON.parse(opts)
              } catch (_) {
                opts = []
              }
            }
            if (Array.isArray(opts)) {
              const bad = opts
                .map((o) =>
                  String(o == null ? '' : o)
                    .trim()
                    .slice(0, 300),
                )
                .filter(Boolean)
              card.set('choices', bad.slice(0, 6))
            }
          }
          if (item.reverse !== undefined) card.set('reverse', !!item.reverse)
          $app.save(card)
          createdIds.push(card.id)
        }
        return e.json(201, { created: createdIds.length, ids: createdIds })
      }

      if (action === 'card_update') {
        const card = ownCard(body.card_id)
        const q = String(body.q == null ? '' : body.q).trim()
        const a = String(body.a == null ? '' : body.a).trim()
        if (!q || !a) return e.badRequestError('Frente e verso são obrigatórios.')
        if (q.length > 5000 || a.length > 20000)
          return e.badRequestError('Frente ou verso excede o limite de caracteres.')
        card.set('q', q)
        card.set('a', a)
        card.set('group', cleanText(body.group, 200))
        card.set('ref', cleanText(body.ref, 500))
        if (body.imageUrl && /^https?:\/\//i.test(String(body.imageUrl))) {
          card.set('diagram_svg', String(body.imageUrl).trim().slice(0, 2000))
          card.set('diagram_title', 'Imagem')
        }
        if (body.choices !== undefined) {
          let opts = body.choices
          if (typeof opts === 'string') {
            try {
              opts = JSON.parse(opts)
            } catch (_) {
              opts = []
            }
          }
          if (Array.isArray(opts)) {
            const bad = opts
              .map((o) =>
                String(o == null ? '' : o)
                  .trim()
                  .slice(0, 300),
              )
              .filter(Boolean)
            card.set('choices', bad.slice(0, 6))
          } else card.set('choices', null)
        }
        if (body.reverse !== undefined) card.set('reverse', !!body.reverse)
        $app.save(card)
        return e.json(200, { id: card.id, ok: true })
      }

      if (action === 'card_suspend') {
        const card = ownCard(body.card_id)
        card.set('suspended', !!body.suspended)
        $app.save(card)
        return e.json(200, { id: card.id, suspended: card.getBool('suspended') })
      }

      if (action === 'card_delete') {
        const card = ownCard(body.card_id)
        card.set('deleted', true)
        $app.save(card)
        return e.json(200, { id: card.id, deleted: true })
      }

      if (action === 'card_move') {
        const card = ownCard(body.card_id)
        const deck = ownDeck(body.deck_id)
        card.set('deck', deck.id)
        $app.save(card)
        return e.json(200, { id: card.id, deck: deck.id })
      }

      if (action === 'deck_move') {
        // Mover pasta (e toda a subárvore) para dentro de outra pasta OU para o
        // nível inicial da própria seção (parent_id vazio).
        // Proteções: destino tem que ser próprio, não pode ser a própria pasta
        // nem nenhum descendente dela (evita ciclo na árvore).
        const moving = ownDeck(body.deck_id)
        const allDecks = $app.findRecordsByFilter(
          'mr_decks',
          'user_id = {:user}',
          'order',
          500,
          0,
          { user: userId },
        )
        const subtree = {}
        subtree[moving.id] = true
        let grew = true
        while (grew) {
          grew = false
          for (let i = 0; i < allDecks.length; i++) {
            const pid = allDecks[i].getString('parent')
            if (pid && subtree[pid] && !subtree[allDecks[i].id]) {
              subtree[allDecks[i].id] = true
              grew = true
            }
          }
        }
        let newKind = moving.getString('kind')
        let newParent = ''
        if (body.parent_id) {
          const target = ownDeck(body.parent_id)
          if (moving.id === target.id)
            return e.badRequestError('A pasta não pode ir para dentro dela mesma.')
          if (subtree[target.id])
            return e.badRequestError(
              'Destino inválido: a pasta destino está dentro da pasta que está sendo movida.',
            )
          newParent = target.id
          newKind = target.getString('kind')
        } else if (['tutoria', 'prova', 'custom'].includes(body.kind)) {
          newKind = body.kind
        }
        moving.set('parent', newParent)
        moving.set('kind', newKind)
        moving.set('order', allDecks.length + 1)
        // Mover para DENTRO de outra pasta = a pasta movida passa a ser uma
        // "subpasta" da destino: modo organizador não faz sentido aqui.
        if (newParent) moving.set('mode', 'study')
        $app.save(moving)
        // A subárvore inteira acompanha a seção (kind) da pasta movida.
        let movedKinds = 0
        for (let i = 0; i < allDecks.length; i++) {
          const id = allDecks[i].id
          if (id === moving.id || !subtree[id]) continue
          if (allDecks[i].getString('kind') !== newKind) {
            allDecks[i].set('kind', newKind)
            $app.save(allDecks[i])
            movedKinds++
          }
        }
        return e.json(200, {
          id: moving.id,
          parent: newParent,
          kind: moving.getString('kind'),
          movedKinds,
        })
      }

      if (action === 'deck_reset') {
        const root = ownDeck(body.deck_id)
        const allDecks = $app.findRecordsByFilter(
          'mr_decks',
          'user_id = {:user}',
          'order',
          500,
          0,
          { user: userId },
        )
        const ids = {}
        ids[root.id] = true
        let changed = true
        while (changed) {
          changed = false
          for (let i = 0; i < allDecks.length; i++) {
            const parentId = allDecks[i].getString('parent')
            if (parentId && ids[parentId] && !ids[allDecks[i].id]) {
              ids[allDecks[i].id] = true
              changed = true
            }
          }
        }
        const deckIds = Object.keys(ids)
        let clearedCards = 0
        for (let i = 0; i < deckIds.length; i++) {
          const cards = $app.findRecordsByFilter(
            'mr_cards',
            'user_id = {:user} && deck = {:deck}',
            '-created',
            1000,
            0,
            { user: userId, deck: deckIds[i] },
          )
          for (let j = 0; j < cards.length; j++) {
            const reviews = $app.findRecordsByFilter(
              'mr_reviews',
              'user_id = {:user} && card_ref = {:card}',
              '-reviewed_at',
              1000,
              0,
              { user: userId, card: cards[j].id },
            )
            for (let k = 0; k < reviews.length; k++) {
              try {
                $app.delete(reviews[k])
              } catch (delErr) {
                reviews[k].set('rating', 'again')
                reviews[k].set('state', 'new')
                reviews[k].set('stability', 0)
                reviews[k].set('difficulty', 0)
                reviews[k].set('due', new Date().toISOString().slice(0, 19).replace('T', ' '))
                $app.save(reviews[k])
              }
            }
            clearedCards++
          }
        }
        return e.json(200, { ok: true, clearedCards })
      }

      return e.badRequestError('Operação de gestão desconhecida.')
    } catch (err) {
      const message = err && err.message ? String(err.message) : String(err)
      if (message === 'deck_not_owned' || message === 'card_not_owned') {
        return e.forbiddenError('A pasta ou o cartão não pertence à sua conta.')
      }
      const errorId = 'manage-' + Date.now().toString(36)
      $app
        .logger()
        .error(
          'MedReview management failed',
          'errorId',
          errorId,
          'userId',
          userId,
          'action',
          action,
          'error',
          message.slice(0, 180),
        )
      return e.json(500, {
        error: 'manage_failed',
        errorId,
        message: 'Não foi possível salvar. Confira os dados e tente novamente.',
      })
    }
  },
  $apis.requireAuth(),
)
