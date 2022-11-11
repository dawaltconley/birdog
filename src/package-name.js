import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const packagePath = path.resolve(__dirname, '..', 'package.json')

export default JSON.parse(fs.readFileSync(packagePath)).name
