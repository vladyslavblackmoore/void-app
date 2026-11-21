import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite"

export type SQLQueryBindings = SQLInputValue

export interface RunResult {
  readonly changes: number
}

export interface Query<R, P extends readonly unknown[]> {
  get(...params: P): R | null
  all(...params: P): R[]
  run(...params: P): RunResult
}

export interface DatabaseOptions {
  readonly readonly?: boolean
  readonly timeout?: number
}

export interface Transaction<A extends unknown[], T> {
  (...args: A): T
  immediate(...args: A): T
}

const plain = <R>(row: unknown): R => ({ ...(row as object) }) as R

const bind = (params: readonly unknown[]): SQLInputValue[] => params as SQLInputValue[]

class Prepared<R, P extends readonly unknown[]> implements Query<R, P> {
  constructor(private readonly statement: StatementSync) {}

  get(...params: P): R | null {
    const row = this.statement.get(...bind(params))
    return row === undefined ? null : plain<R>(row)
  }

  all(...params: P): R[] {
    return this.statement.all(...bind(params)).map((row) => plain<R>(row))
  }

  run(...params: P): RunResult {
    return { changes: Number(this.statement.run(...bind(params)).changes) }
  }
}

export class Database {
  private readonly raw: DatabaseSync
  private readonly cache = new Map<string, Prepared<never, never>>()

  constructor(path: string, options: DatabaseOptions = {}) {
    this.raw = new DatabaseSync(path, { readOnly: options.readonly === true, timeout: options.timeout ?? 0 })
  }

  prepare<R = unknown, P extends readonly unknown[] = SQLQueryBindings[]>(sql: string): Query<R, P> {
    return new Prepared<R, P>(this.raw.prepare(sql))
  }

  query<R = unknown, P extends readonly unknown[] = SQLQueryBindings[]>(sql: string): Query<R, P> {
    const hit = this.cache.get(sql)
    if (hit) return hit as unknown as Query<R, P>
    const made = new Prepared<R, P>(this.raw.prepare(sql))
    this.cache.set(sql, made as unknown as Prepared<never, never>)
    return made
  }

  run(sql: string): void {
    this.raw.exec(sql)
  }

  transaction<A extends unknown[], T>(fn: (...args: A) => T): Transaction<A, T> {
    const wrap =
      (begin: string) =>
      (...args: A): T => {
        this.raw.exec(begin)
        try {
          const result = fn(...args)
          this.raw.exec("commit")
          return result
        } catch (error) {
          if (this.raw.isTransaction) this.raw.exec("rollback")
          throw error
        }
      }
    return Object.assign(wrap("begin"), { immediate: wrap("begin immediate") })
  }

  close(): void {
    this.raw.close()
  }
}
