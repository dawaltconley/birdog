const fs = require('fs')
const csv = require('csv-stringify')
const ProPublica = require('../propublica')
const keys = require('../keys')

exports.command = ['$0', 'records']

exports.describe = 'get voting records for all members of congress'

exports.builder = yargs => {
  yargs
    .options({
      v: {
        alias: 'votes',
        describe: 'pull voting records from bill or roll call numbers',
        type: 'array',
        default: [],
        requiresArg: true,
      },
      c: {
        alias: 'cosponsors',
        describe: 'pull cosponsors for legislation by bill number',
        type: 'array',
        default: [],
        requiresArg: true,
      },
      f: {
        alias: 'file',
        describe: 'file path to write records to',
        type: 'string',
        requiresArg: true,
      },
      congress: {
        describe:
          'congress to use when pulling members and searching for bills',
        type: 'number',
        nargs: 1,
        default: ProPublica.guessSession().congress,
        requiresArg: true,
      },
    })
    .config('settings')
    .option({
      'save-settings': {
        describe: 'Path to save current arguments as a config file',
        type: 'string',
        nargs: 1,
        requiresArg: true,
      },
    })
}

const getVoteHeader = v => {
  let voteItem
  if (v.amendment && v.amendment.number && v.bill && v.bill.number) {
    voteItem = `${v.amendment.number} to ${v.bill.number}, "${v.bill.short_title}"`
  } else if (v.bill && v.bill.number) {
    voteItem = `${v.bill.number}, "${v.bill.short_title}"`
  } else {
    throw new Error('Unrecognized type of vote: ' + v.url)
  }
  return `Vote on ${voteItem}`
}

exports.handler = async argv => {
  if (argv.saveSettings) {
    const save = JSON.stringify(
      argv,
      ['votes', 'cosponsors', 'file', 'congress'],
      4
    )
    fs.writeFileSync(argv.saveSettings, save)
  }

  const pp = new ProPublica({
    key: await keys.get('propublica'),
    congress: argv.congress,
  })

  let reps = pp.updateMems()
  let cosponsors = argv.cosponsors.map(ref => pp.getCosponsors(ref))
  let votes = argv.votes.map(ref => pp.getVote(ref))

  ;[reps, cosponsors, votes] = await Promise.all([
    reps,
    Promise.all(cosponsors),
    Promise.all(votes),
  ])

  cosponsors = cosponsors.flat()
  votes = votes.reduce((columns, vote) => {
    if (!vote.length) return columns
    // votes are in reverse chron, so this will be the first item voted on
    const header = getVoteHeader(vote[vote.length - 1])
    const positions = [].concat(...vote.map(v => v.positions))
    return columns.concat({ header, positions })
  }, [])

  const columns = [
    'District',
    'Representative',
    'Party',
    'Chamber',
    'Website',
    'Phone',
    'Twitter',
    'Committees',
    'Votes with party',
    'Votes against party',
    ...cosponsors.map(bill => `Cosponsor of ${bill.number}, "${bill.title}"`),
    ...votes.map(v => v.header),
  ]

  const stringifier = csv({
    header: true,
    columns: columns,
  })
  const output = argv.file ? fs.createWriteStream(argv.file) : process.stdout

  return new Promise((resolve, reject) => {
    stringifier.on('error', e => reject(e))
    stringifier.pipe(output)

    for (let rep of reps) {
      let role = rep.roles.find(role => role.congress == pp.congress)
      let district = role.district
        ? role.state + '-' + role.district
        : role.state
      let repName = [
        role.short_title,
        rep.first_name,
        rep.middle_name,
        rep.last_name,
        rep.suffix,
      ]
      repName = repName.filter(n => n).join(' ')
      let repCommittees = role.committees
        .concat(role.subcommittees)
        .map(c => `${c.code} (${c.title})`)
        .join(',')

      stringifier.write([
        district, // 'District'
        repName, // 'Representative'
        role.party, // 'Party'
        role.chamber, // 'Chamber'
        rep.url, // 'Website'
        role.phone, // 'Phone'
        rep.twitter_account, // 'Twitter'
        repCommittees, // 'Committees'
        role.votes_with_party_pct, // 'Votes with party'
        role.votes_against_party_pct, // 'Votes against party'
        ...cosponsors.map(bill => {
          if (bill.sponsor_id === rep.id) return 'Original'
          if (bill.cosponsors.find(c => c.cosponsor_id === rep.id)) return 'Yes'
          return null
        }),
        ...votes.map(v => {
          let memVote = v.positions.find(p => p.member_id === rep.id)
          return memVote ? memVote.vote_position : null
        }),
      ])
    }

    stringifier.end()
    resolve()
  })
}
