import { Capacitor } from '@capacitor/core'
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import { CREATE_SCHEMA_SQL, DB_NAME, DB_VERSION, DEFAULT_PROJECT_NAME } from './schema'

let sqliteConnection: SQLiteConnection | null = null
let dbConnection: SQLiteDBConnection | null = null
let initPromise: Promise<SQLiteDBConnection> | null = null

async function setupWebSqliteStore(connection: SQLiteConnection): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') return

  const { defineCustomElements } = await import('jeep-sqlite/loader')
  defineCustomElements(window)

  if (!document.querySelector('jeep-sqlite')) {
    const jeepEl = document.createElement('jeep-sqlite')
    jeepEl.setAttribute('wasm-path', '/assets/sql-wasm.wasm')
    document.body.appendChild(jeepEl)
    await customElements.whenDefined('jeep-sqlite')
  }

  await connection.initWebStore()
}

async function openVaultConnection(): Promise<SQLiteDBConnection> {
  if (!sqliteConnection) {
    sqliteConnection = new SQLiteConnection(CapacitorSQLite)
  }

  await setupWebSqliteStore(sqliteConnection)

  const consistency = await sqliteConnection.checkConnectionsConsistency()
  const isOpen = (await sqliteConnection.isConnection(DB_NAME, false)).result

  const connection =
    consistency.result && isOpen
      ? await sqliteConnection.retrieveConnection(DB_NAME, false)
      : await sqliteConnection.createConnection(
          DB_NAME,
          false,
          'no-encryption',
          DB_VERSION,
          false,
        )

  await connection.open()
  await connection.execute(CREATE_SCHEMA_SQL)
  await ensureDefaultProjectRow(connection)

  if (Capacitor.getPlatform() === 'web') {
    await persistVaultWebStore()
  }

  return connection
}

/** Persist in-memory web DB to IndexedDB after writes. */
export async function persistVaultWebStore(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web' || !sqliteConnection) return
  await sqliteConnection.saveToStore(DB_NAME)
}

async function ensureDefaultProjectRow(db: SQLiteDBConnection): Promise<void> {
  const result = await db.query('SELECT COUNT(*) AS count FROM projects')
  const count = Number(result.values?.[0]?.count ?? 0)
  if (count > 0) return

  const id = crypto.randomUUID()
  const createdAt = Date.now()
  await db.run(
    'INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)',
    [id, DEFAULT_PROJECT_NAME, createdAt],
  )
}

/** Open SQLite and apply schema. Must complete before the React tree mounts. */
export async function initVaultDatabase(): Promise<SQLiteDBConnection> {
  if (dbConnection) return dbConnection
  if (initPromise) return initPromise

  initPromise = openVaultConnection()
  try {
    dbConnection = await initPromise
    return dbConnection
  } catch (error) {
    initPromise = null
    throw error
  }
}

export function isVaultDatabaseReady(): boolean {
  return dbConnection !== null
}

/** Returns the open connection or throws — never null. */
export function getVaultDatabase(): SQLiteDBConnection {
  if (!dbConnection) {
    throw new Error('Vault database is not initialized. Call initVaultDatabase() first.')
  }
  return dbConnection
}
