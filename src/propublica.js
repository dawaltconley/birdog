const fs = require('fs')
const path = require('path')
const app = require('../package.json').name
const axios = require('axios')
const parseLeg = require('legislative-parser')
const maxAsync = require('@dawaltconley/max-async')

const chambers = ['house', 'senate']
const legTypes = [
  'bill',
  'simple resolution',
  'joint resolution',
  'concurrent resolution',
]

const isString = obj => typeof obj === 'string' || obj instanceof String

class Cache {
  constructor(...filePath) {
    this.path = path.resolve(
      __dirname,
      '..',
      '.cache',
      app,
      ...filePath.map(p => p.toString())
    )
    if (!this.modified)
      fs.mkdirSync(path.dirname(this.path), { recursive: true })

    this.write = this.write.bind(this)
    this.read = this.read.bind(this)
    this.delete = this.delete.bind(this)
  }

  get modified() {
    try {
      return fs.statSync(this.path).mtime
    } catch (e) {
      if (e.code === 'ENOENT') return 0
      throw e
    }
  }

  write(data, ...args) {
    return fs.promises.writeFile(this.path, JSON.stringify(data), ...args)
  }

  read() {
    return fs.promises
      .readFile(this.path)
      .then(JSON.parse)
      .catch(e => {
        if (e.code !== 'ENOENT') throw e
        return null
      })
  }

  delete() {
    return fs.promises.unlink(this.path).catch(e => {
      if (e.code !== 'ENOENT') throw e
      return null
    })
  }
}

class ProPublica {
  constructor({ key, congress, session } = {}) {
    if (!key)
      throw new Error(
        `Missing required config option 'key'. Must provide a valid ProPublica API key when configuring ${app}.`
      )
    this._axios = axios.create({
      baseURL: 'https://api.propublica.org/congress/v1',
      headers: { 'X-API-Key': key },
    })

    let current = ProPublica.guessSession()

    this.congress = congress || current.congress
    this.session =
      congress && congress !== current.congress // if another congress has been specified, do not guess the session
        ? session
        : current.session
    this.current =
      current.congress === this.congress && current.session === this.session

    this.repsCache = new Cache(this.congress, 'members.json')
    this.reps = this.repsCache.read()
    this._retries = 0

    this.updateMems = this.updateMems.bind(this)
    this.getBill = this.getBill.bind(this)
    this.getBillsByKeyword = this.getBillsByKeyword.bind(this)
    this.getCosponsors = this.getCosponsors.bind(this)
    this.getVote = this.getVote.bind(this)
  }

  static guessSession(time = new Date()) {
    const years = time.getFullYear() - 1997
    return {
      congress: Math.floor(years / 2) + 105,
      session: (Math.abs(years) % 2) + 1,
    }
  }

  /**
   * updates and returns the cache of MOC for a given session.
   * called internally by most methods before querying the ProPublica API
   *
   * @param {Object} [options]
   * @param {boolean} [options.aggressive] -
   */
  async updateMems({ aggressive = false } = {}) {
    // use cache if updated less than 24 hours ago

    // assuming we are not force-updating the cache (aggressive)
    // defer to cache if it is less than a day old
    // OR if the requested congress/session is older then the current one
    // i.e. its members are not going to change
    const updateTime = new Date()
    if (
      !aggressive &&
      (!this.current || updateTime - this.repsCache.modified < 86400000)
    ) {
      let reps = await Promise.resolve(this.reps)
      if (reps && reps.length) {
        this.reps = reps
        return reps
      }
    }

    // if cache is old, fetch latest member data from ProPublica
    let members = chambers.map(c =>
      this._axios.get(`/${this.congress}/${c.toLowerCase()}/members.json`)
    )
    try {
      members = await Promise.all(members)
      members = [].concat(...members.map(r => r.data.results[0].members))
    } catch (e) {
      if (e.errors === 'The congress is not valid' && this.current) {
        // attempt to id current congress if guessed value is invalid
        // TODO maybe incorporate into all _axios calls
        if (this._retries < 2) {
          this.congress--
          this._retries++
        } else {
          // backup method of getting current congress by pulling from current mems of an arbitrary state
          let current = await this._axios.get('/members/senate/RI/current.json')
          current = await this._axios.get(current.data.results[0].api_uri)
          this.congress = current.data.results[0].roles[0].congress
        }
        return this.updateMems(aggressive)
      }
      this._retries = 0
      throw e
    }

    // identify which cached members need updating
    this.reps = (await this.reps) || []
    this.reps = this.reps.filter(rep => {
      // filter out any saved rep not returned by the latest members query
      // if aggresive, update all reps whose profile has been updated

      // TODO there is some discrepancy between last_updated on the members API and individual member profiles
      // should handle this somehow?
      const memMatch = members.some(
        m =>
          m.id === rep.id &&
          (!aggressive || m.last_updated === rep.last_updated)
      )
      const role = rep.roles.find(r => r.congress === this.congress.toString())

      // TODO this may be unnecessary; mostly filters out ppl who have left
      const isActive = !this.current || new Date(role.end_date) > updateTime

      return memMatch && role && isActive
    })
    members = members // may want to do something to filter out reps who are no longer in office
      .filter(m => !this.reps.some(rep => rep.id === m.id)) // only get info for reps not remaining in local data
      .map(m => this._axios.get.bind(this._axios, m.api_uri))
    if (!members.length) return this.reps

    // update member data; cache and return updated data
    // undocumented rate limit, need to limit request batches ~50: https://github.com/propublica/congress-api-docs/issues/276
    members = await maxAsync(members, 50)
    this.reps = this.reps.concat(...members.map(m => m.data.results[0]))
    // write data to cache, while keeping in memory...
    // there may be an optimization that does this in the background without waiting to complete
    await this.repsCache.write(this.reps)
    return this.reps
  }

  async getBill(ref) {
    const bill = isString(ref) ? parseLeg(ref.trim()) : ref
    if (bill.type && !legTypes.includes(bill.type.toLowerCase()))
      throw new Error(
        `Must provide a legislation identifier to get cosponsors. Provide ${ref} had type: ${bill.type}`
      )
    const congress = bill.congress || this.congress
    const response = await this._axios.get(`/${congress}/bills/${bill.id}.json`)
    return response.data.results
  }

  async getBillsByKeyword(keyword) {
    const response = await this._axios.get(`/bills/subjects/${keyword}.json`)
    return response.data.results
  }

  async getCosponsors(ref) {
    const bill = isString(ref) ? parseLeg(ref.trim()) : ref
    if (bill.type && !legTypes.includes(bill.type.toLowerCase()))
      throw new Error(
        `Must provide a legislation identifier to get cosponsors. Provide ${ref} had type: ${bill.type}`
      )
    const congress = bill.congress || this.congress
    const response = await this._axios.get(
      `/${congress}/bills/${bill.id}/cosponsors.json`
    )
    return response.data.results
  }

  async getVote(ref) {
    const leg = isString(ref) ? parseLeg(ref.trim()) : ref
    const congress = leg.congress || this.congress
    const session = leg.session || this.session

    if (leg.type === 'Vote' && !session) {
      // only possible if calling this method directly; the CLI will always specify a session
      throw new Error(
        'Unknown session: you must specify a session of congress to query votes by roll call.'
      )
    }

    if (legTypes.includes(leg.type.toLowerCase())) {
      const decidingVotes = []
      let bill = await this._axios.get(`/${congress}/bills/${leg.id}.json`)
      bill = bill.data.results[0]
      // warn and exit if bill has not been voted on
      if (!bill.votes.length) {
        console.warn(`The bill ${bill.number} has not been voted on.`)
        return []
      }
      for (const vote of bill.votes) {
        const isDecidingVote = getDecidingVote(bill.bill_type).includes(
          vote.question
        )
        if (isDecidingVote) decidingVotes.push(this._axios.get(vote.api_url))
      }
      // warn and exit if bill has been voted on, but no votes are decisive.
      if (!decidingVotes.length) {
        console.warn(`Couldn't identify a decisive vote for ${bill.number}.`)
        return []
      }
      let response = await Promise.all(decidingVotes)
      return response.map(v => v.data.results.votes.vote)
    } else if (leg.type.toLowerCase() === 'vote') {
      let response = await this._axios.get(
        `/${congress}/${leg.chamber.toLowerCase()}/sessions/${session}/votes/${
          leg.id
        }.json`
      )
      if (response.data.status === 'ERROR')
        for (const e of response.data.errors) throw new Error(e.error)
      return [response.data.results.votes.vote]
    } else {
      throw new Error(
        `Must provide either a legislation or vote identifier to get votes. Provide ${ref} had type: ${leg.type}`
      )
    }
  }
}

const getDecidingVote = type => {
  switch (type) {
    case 'hr':
    // fall through
    case 'hjres':
      return ['On Passage', 'On Motion to Suspend the Rules and Pass']
    case 'hconres':
    // fall through
    case 'hres':
      return [
        'On Agreeing to the Resolution',
        'On Motion to Suspend the Rules and Agree',
      ]
    case 's':
      return ['On Passage of the Bill']
    case 'sjres':
      return ['On the Joint Resolution']
    case 'sconres':
      return ['On the Concurrent Resolution']
    case 'sres':
      return ['On the Resolution']
  }
  throw new Error(
    `Bad legislation type ${type}, could not get question for deciding vote.`
  )
}

module.exports = ProPublica
