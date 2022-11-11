import keys from '../keys.js'

const command = 'config'

const describe = 'set up using API keys'

const builder = {}

const handler = () => keys.prompt('propublica')

export default { command, describe, builder, handler }
