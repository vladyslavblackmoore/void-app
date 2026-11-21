const cyrillic = /[Ѐ-ӿ]/

export const foldYo = (text: string): string => text.replace(/ё/g, "е").replace(/Ё/g, "Е")

export const tokenize = (text: string): string[] =>
  foldYo(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)

const quoteToken = (token: string): string => {
  if (cyrillic.test(token)) {
    const length = Array.from(token).length
    if (length >= 7) return `"${Array.from(token).slice(0, length - 2).join("")}"*`
    if (length >= 5) return `"${Array.from(token).slice(0, length - 1).join("")}"*`
  }
  return `"${token}"`
}

export const buildMatch = (text: string, joiner: "AND" | "OR" = "AND"): string | undefined => {
  const tokens = [...new Set(tokenize(text))]
  if (tokens.length === 0) return undefined
  return tokens.map(quoteToken).join(joiner === "AND" ? " " : " OR ")
}
