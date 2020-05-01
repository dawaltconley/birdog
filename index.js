const axios = require('axios')
const parseLeg = require('legislative-parser')

const chambers = [ 'house', 'senate' ]
const legTypes = [ 'bill', 'simple resolution', 'joint resolution', 'concurrent resolution' ]

const guessSession = (time=new Date()) => {
    const years = time.getFullYear() - 1997
    return {
        congress: Math.floor(years / 2) + 105,
        session: years % 2 + 1
    }
}

class MOCVote {
    constructor({ key, congress, session }={}) {
        if (!key) throw new Error(`Missing required config option 'key'. Must provide a valid ProPublica API key when configuring MOCVote.`)
        this._axios = axios.create({
            baseURL: 'https://api.propublica.org/congress/v1',
            headers: { 'X-API-Key': key }
        })

        const current = guessSession()
        this.congress = congress || current.congress
        this.session = session || current.session
        this.reps = []
        this._retries = 0
    }

    async updateMems(aggressive=false, { congress=this.congress }={}) {
        const updateTime = new Date()
        let members = chambers.map(c => this._axios.get(`/${congress}/${c.toLowerCase()}/members.json`))
        try {
            members = await Promise.all(members)
        } catch (e) {
            if (e.errors === 'The congress is not valid' && congress === this.congress) {
                if (this._retries < 2) {
                    this.congress--
                    this._retries++
                } else {
                    let current = await this._axios.get('/members/senate/RI/current.json') // backup method of getting current congress by pulling from current mems of an arbitrary state
                    current = await this._axios.get(current.data.results[0].api_uri)
                    this.congress = current.data.results[0].roles[0].congress
                }
                return this.updateMems(aggressive)
            }
            this._retries = 0
            throw e
        }
        members = [].concat(...members.map(r => r.data.results[0].members))
        this.reps = this.reps.filter(rep => { // filter out any saved rep not returned by the latest members query
            const memMatch = members.find(m => m.id === rep.id && (!aggressive || m.last_updated !== rep.last_updated)) // if aggresive, update all reps whose profile has been updated
            return memMatch && rep.roles[0].congress === congress && new Date(rep.roles[0].end_date) > updateTime // return false if saved rep's term has expired
        })
        members = members
            .filter(m => !this.reps.find(rep => rep.id === m.id)) // only get info for reps not remaining in {
            .map(m => this._axios.get(m.api_uri))
        members = await Promise.all(members)
        this.reps = this.reps.concat(...members.map(m => m.data.results[0]))
        return this.reps
    }

    async getCosponsors(ref) {
        const bill = typeof ref === 'string' || ref instanceof String
            ? parseLeg(ref.trim())
            : ref
        if (bill.type && !legTypes.includes(bill.type.toLowerCase()))
            throw new Error(`Must provide a legislation identifier to get cosponsors. Provide ${ref} had type: ${bill.type}`)
        const congress = bill.congress || this.congress
        return this._axios.get(`/${congress}/bills/${bill.id}/cosponsors.json`)
    }

    async getVote(ref) {
        const leg = parseLeg(ref.trim())
        const congress = leg.congress || this.congress
        const session = leg.session || this.session
        if (leg.type.toLowerCase() === 'vote') {
            return this._axios.get(`/${congress}/votes/${session}/votes/${leg.id}.json`)
        } else {
            throw new Error(`Must provide either a legislation or vote identifier to get votes. Provide ${ref} had type: ${leg.type}`)
        }
    }
}

module.exports = MOCVote
