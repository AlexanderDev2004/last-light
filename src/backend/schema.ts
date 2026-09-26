import { defineRelations } from 'drizzle-orm'
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

// ---- Lobby ----

export const Lobbies = pgTable('lobbies', {
  id: text('id').primaryKey(), // 6-char room code, e.g. XC9K2Q
  name: text('name').notNull(),
  gmId: text('gm_id').notNull(),
  maxPlayers: integer('max_players').notNull().default(5),
  status: text('status').notNull().default('waiting'), // waiting | playing
  gameId: text('game_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const LobbyPlayers = pgTable(
  'lobby_players',
  {
    lobbyId: text('lobby_id')
      .notNull()
      .references(() => Lobbies.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    name: text('name').notNull(),
    isGm: boolean('is_gm').notNull().default(false),
    isReady: boolean('is_ready').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.lobbyId, t.clientId] })],
)

// ---- Game session (companion) ----

export const GameSessions = pgTable('game_sessions', {
  gameId: text('game_id').primaryKey(),
  lobbyId: text('lobby_id')
    .notNull()
    .references(() => Lobbies.id, { onDelete: 'cascade' }),
  candlesLit: integer('candles_lit').notNull().default(10),
  ended: boolean('ended').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const SessionPlayers = pgTable(
  'session_players',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => GameSessions.gameId, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    name: text('name').notNull(),
    isGm: boolean('is_gm').notNull().default(false),
    virtue: text('virtue').notNull().default(''),
    vice: text('vice').notNull().default(''),
    moment: text('moment').notNull().default(''),
    brink: text('brink').notNull().default(''),
    burnedVirtue: boolean('burned_virtue').notNull().default(false),
    burnedVice: boolean('burned_vice').notNull().default(false),
    burnedMoment: boolean('burned_moment').notNull().default(false),
    burnedBrink: boolean('burned_brink').notNull().default(false),
    hopeDie: boolean('hope_die').notNull().default(false),
    alive: boolean('alive').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.clientId] })],
)

export const Truths = pgTable('truths', {
  id: text('id').primaryKey(),
  gameId: text('game_id')
    .notNull()
    .references(() => GameSessions.gameId, { onDelete: 'cascade' }),
  author: text('author').notNull(),
  text: text('text').notNull(),
  candleLeft: integer('candle_left').notNull().default(10),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const SessionLog = pgTable('session_log', {
  id: serial('id').primaryKey(),
  gameId: text('game_id')
    .notNull()
    .references(() => GameSessions.gameId, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const relations = defineRelations(
  { Lobbies, LobbyPlayers, GameSessions, SessionPlayers, Truths, SessionLog },
  () => ({}),
)
