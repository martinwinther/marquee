import raw from './movies.txt?raw'
import { chunkMovies } from './chunk.js'

export const chunks = chunkMovies(raw)
