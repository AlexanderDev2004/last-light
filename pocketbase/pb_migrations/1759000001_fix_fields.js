/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const lobbies = app.findCollectionByNameOrId('lobbies')
    lobbies.fields.addAt(1, new TextField({ name: 'code', required: true, max: 12 }))
    lobbies.fields.addAt(2, new TextField({ name: 'name', required: true, max: 120 }))
    lobbies.fields.addAt(3, new TextField({ name: 'gmId', required: true, max: 64 }))
    lobbies.fields.addAt(4, new NumberField({ name: 'maxPlayers', required: true }))
    lobbies.fields.addAt(
      5,
      new SelectField({ name: 'status', required: true, values: ['waiting', 'playing'] }),
    )
    lobbies.fields.addAt(6, new TextField({ name: 'gameId', required: false, max: 64 }))
    app.save(lobbies)

    const sessions = app.findCollectionByNameOrId('game_sessions')
    sessions.fields.addAt(1, new TextField({ name: 'gameId', required: true, max: 64 }))
    sessions.fields.addAt(2, new TextField({ name: 'lobbyCode', required: true, max: 12 }))
    sessions.fields.addAt(3, new NumberField({ name: 'candlesLit', required: true }))
    sessions.fields.addAt(4, new BoolField({ name: 'ended', required: false }))
    app.save(sessions)
    return null
  },
  () => null,
)
