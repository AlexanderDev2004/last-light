/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const sessions = app.findCollectionByNameOrId('game_sessions')
    sessions.fields.add(
      new JSONField({ name: 'leaveRequests', required: false, maxSize: 200000 }),
    )
    app.save(sessions)
    return null
  },
  () => null,
)
