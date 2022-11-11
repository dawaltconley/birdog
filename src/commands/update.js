import ProPublica from '../propublica.js'
import keys from '../keys.js'

const command = 'update'

const describe = 'refresh local cache of congressmembers'

const builder = {
  force: {
    describe: 'delete the local cache before updating',
    type: 'boolean',
  },
  congress: {
    describe: 'congress to use when pulling members',
    type: 'number',
    nargs: 1,
    default: ProPublica.guessSession().congress,
    requiresArg: true,
  },
}

const handler = async argv => {
  const pp = new ProPublica({
    key: await keys.get('propublica'),
    congress: argv.congress,
  })
  if (argv.force) await pp.repsCache.delete()
  console.log('updating')
  return pp.updateMems({ aggressive: true })
}

export default { command, describe, builder, handler }
