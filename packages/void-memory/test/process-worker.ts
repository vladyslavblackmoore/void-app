import { openDatabase } from "../src/db"
import { createStore } from "../src/store"

const [path, name, countText, startText] = process.argv.slice(2)
const count = Number(countText)
const startAt = Number(startText)

const { db } = openDatabase(path)
const store = createStore(db)
const errors: string[] = []
const wins: string[] = []
let writes = 0

while (Date.now() < startAt) await Bun.sleep(1)

const began = performance.now()
for (let i = 0; i < count; i++) {
  try {
    store.remember(
      {
        nodes: [
          { id: `${name}-a-${i}`, kind: "fact", title: `fact ${name} ${i}`, body: "written under contention" },
          { id: `${name}-b-${i}`, kind: "fact", title: `note ${name} ${i}`, body: "второй узел" },
          { id: `${name}-c-${i}`, kind: "entity", title: `entity ${name} ${i}` },
        ],
        edges: [
          { src: `${name}-a-${i}`, dst: `${name}-b-${i}`, type: "relates_to" },
          { src: `${name}-b-${i}`, dst: `${name}-c-${i}`, type: "about" },
        ],
      },
      { agent: name },
    )
    writes++
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
  try {
    const result = store.task.claim(`t${i}`, { agent: name })
    if (result.claimed) wins.push(`t${i}`)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
}
const elapsed = performance.now() - began
db.close()
console.log(JSON.stringify({ name, errors, wins, writes, elapsed }))
