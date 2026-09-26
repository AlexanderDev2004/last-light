/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    let lobbies
    try {
      lobbies = app.findCollectionByNameOrId('lobbies')
    } catch {
      lobbies = new Collection({
        name: 'lobbies',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          { name: 'code', type: 'text', required: true, max: 12 },
          { name: 'name', type: 'text', required: true, max: 120 },
          { name: 'gmId', type: 'text', required: true, max: 64 },
          { name: 'maxPlayers', type: 'number', required: true },
          {
            name: 'status',
            type: 'select',
            required: true,
            values: ['waiting', 'playing'],
          },
          { name: 'gameId', type: 'text', required: false, max: 64 },
          new JSONField({ name: 'players', required: false, maxSize: 200000 }),
        ],
      })
    }
    app.save(lobbies)

    let sessions
    try {
      sessions = app.findCollectionByNameOrId('game_sessions')
    } catch {
      sessions = new Collection({
        name: 'game_sessions',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          { name: 'gameId', type: 'text', required: true, max: 64 },
          { name: 'lobbyCode', type: 'text', required: true, max: 12 },
          { name: 'candlesLit', type: 'number', required: true },
          { name: 'ended', type: 'bool', required: false },
          new JSONField({ name: 'players', required: false, maxSize: 500000 }),
          new JSONField({ name: 'truths', required: false, maxSize: 500000 }),
          new JSONField({ name: 'log', required: false, maxSize: 500000 }),
        ],
      })
    }
    app.save(sessions)
    return null
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('game_sessions'))
    } catch {}
    try {
      app.delete(app.findCollectionByNameOrId('lobbies'))
    } catch {}
    return null
  },
)
