/*
 * This should have the following methods:
 * 1. Specify a number of bills, automatically search all mems of congress for
 *    the result of whatever the most recent action was
 *      - maybe, if it doesn't increase api calls, just get info on one bill at a time
 * 2. Get latest members
 * 3. Configure (profide api key)
 *
 * Main problems with the last one:
 * 1. couldn't find votes on specific ammendments or other actions
 * 2. slow, used many syncronous API calls, had to store data in local storage
 * 3. very specific to usage by DSA, didn't include MOCs without DSA chapters in district
 * 4. hardcoded things like congressional session, hard to automatically update MOCs on new session
 *
 * will take an opts object argument with the following options:
 * - key (also configurable in an instance)
 * - cosponsors (array of bill names)
 * - votes (array of bill names (last vote or vote to pass) or roll call numbers)
 * - *if* it can narrow the ammount of queries made, various fields to filter members
 */

// const fsp = require('fs').promises
const axios = require('axios');
const csv = require('csv-stringify');
const parseLeg = require('legislative-parser');

const chambers = [ 'house', 'senate' ];
const legTypes = [ 'bill', 'simple resolution', 'joint resolution', 'concurrent resolution' ];
// const states = fsp.readFile('states_hash.json').then(JSON.parse)

const isString = obj => typeof obj === 'string' || obj instanceof String;

const guessSession = (time=new Date()) => {
    const years = time.getFullYear() - 1997;
    return {
        congress: Math.floor(years / 2) + 105,
        session: Math.abs(years) % 2 + 1
    };
};

class MOCVote {
    constructor({ key, congress, session }={}) {
        if (!key) throw new Error(`Missing required config option 'key'. Must provide a valid ProPublica API key when configuring MOCVote.`);
        this._axios = axios.create({
            baseURL: 'https://api.propublica.org/congress/v1',
            headers: { 'X-API-Key': key }
        });

        const current = guessSession();
        this.congress = congress || current.congress;
        this.session = session || current.session;
        this.reps = [];
        this._retries = 0;
    }

    async updateMems(aggressive=false, { congress=this.congress }={}) {
        const updateTime = new Date();
        let members = chambers.map(c => this._axios.get(`/${congress}/${c.toLowerCase()}/members.json`));
        try {
            members = await Promise.all(members);
        } catch (e) {
            if (e.errors === 'The congress is not valid' && congress === this.congress) {
                if (this._retries < 2) {
                    this.congress--;
                    this._retries++;
                } else {
                    let current = await this._axios.get('/members/senate/RI/current.json'); // backup method of getting current congress by pulling from current mems of an arbitrary state
                    current = await this._axios.get(current.data.results[0].api_uri);
                    this.congress = current.data.results[0].roles[0].congress;
                }
                return this.updateMems(aggressive);
            }
            this._retries = 0;
            throw e;
        }
        members = [].concat(...members.map(r => r.data.results[0].members));
        this.reps = this.reps.filter(rep => { // filter out any saved rep not returned by the latest members query
            const memMatch = members.find(m => m.id === rep.id && (!aggressive || m.last_updated !== rep.last_updated)); // if aggresive, update all reps whose profile has been updated
            return memMatch && rep.roles[0].congress === congress && new Date(rep.roles[0].end_date) > updateTime; // return false if saved rep's term has expired
        });
        members = members
            .filter(m => !this.reps.find(rep => rep.id === m.id)) // only get info for reps not remaining in
            .map(m => this._axios.get(m.api_uri));
        members = await Promise.all(members);
        this.reps = this.reps.concat(...members.map(m => m.data.results[0]));
        return this.reps;
    }

    async getBill(ref) {
        const bill = isString(ref) ? parseLeg(ref.trim()) : ref;
        if (bill.type && !legTypes.includes(bill.type.toLowerCase()))
            throw new Error(`Must provide a legislation identifier to get cosponsors. Provide ${ref} had type: ${bill.type}`);
        const congress = bill.congress || this.congress;
        const response = await this._axios.get(`/${congress}/bills/${bill.id}.json`);
        return response.data.results;
    }

    async getBillsByKeyword(keyword) {
        const response = await this._axios.get(`/bills/subjects/${keyword}.json`);
        return response.data.results;
    }

    async getCosponsors(ref) {
        const bill = isString(ref) ? parseLeg(ref.trim()) : ref;
        if (bill.type && !legTypes.includes(bill.type.toLowerCase()))
            throw new Error(`Must provide a legislation identifier to get cosponsors. Provide ${ref} had type: ${bill.type}`);
        const congress = bill.congress || this.congress;
        const response = await this._axios.get(`/${congress}/bills/${bill.id}/cosponsors.json`);
        return response.data.results;
    }

    async getVote(ref) {
        const leg = isString(ref) ? parseLeg(ref.trim()) : ref;
        const congress = leg.congress || this.congress;
        const session = leg.session || this.session;
        if (legTypes.includes(leg.type.toLowerCase())) {
            const decidingVotes = [];
            let bill = await this._axios.get(`/${congress}/bills/${leg.id}.json`);
            bill = bill.data.results[0];
            // warn and exit if bill has not been voted on
            if (!bill.votes.length) {
                console.warn(`The bill ${bill.number} has not been voted on.`);
                return [];
            }
            for (const vote of bill.votes) {
                const isDecidingVote = getDecidingVote(bill.bill_type).includes(vote.question);
                if (isDecidingVote)
                    decidingVotes.push(this._axios.get(vote.api_url));
            }
            // warn and exit if bill has been voted on, but no votes are decisive.
            if (!decidingVotes.length) {
                console.warn(`Couldn't identify a decisive vote for ${bill.number}.`);
                return [];
            }
            let response = await Promise.all(decidingVotes);
            return response.map(v => v.data.results.votes.vote);
        } else if (leg.type.toLowerCase() === 'vote') {
            let response = await this._axios.get(`/${congress}/${leg.chamber.toLowerCase()}/sessions/${session}/votes/${leg.id}.json`);
            if (response.data.status === 'ERROR')
                for (const e of response.data.errors)
                    throw new Error(e.error);
            return [ response.data.results.votes.vote ];
        } else {
            throw new Error(`Must provide either a legislation or vote identifier to get votes. Provide ${ref} had type: ${leg.type}`);
        }
    }

    async getCSV(opts={}) {
        let {
            cosponsors = [],
            votes = [],
            // keywords = [], // could add later, but would result in a very long spreadsheet
            delimiter = ',',
            subDelimiter = delimiter
        } = opts;

        let congress = this.congress;

        let reps = this.reps.length ? this.reps : this.updateMems();
        cosponsors = Promise.all(cosponsors.map(ref => this.getCosponsors(ref))); // need way to override default congress of these methods without modifying congress of class obj
        votes = Promise.all(votes.map(ref => this.getVote(ref)));

        [ reps, cosponsors, votes ] = await Promise.all([ reps, cosponsors, votes ]);

        cosponsors = cosponsors.flat(); // needed because currently the methods are returning (mostly single-item) arrays
        votes = votes.flat();

        let header = [
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
            ...votes.map(v => {
                let voteItem;
                if (v.amendment && v.amendment.number && v.bill && v.bill.number) {
                    voteItem = `${v.amendment.number} to ${v.bill.number}, "${v.bill.short_title}"`;
                } else if (v.bill && v.bill.number) {
                    voteItem = `${v.bill.number}, "${v.bill.short_title}"`;
                } else {
                    throw new Error('Unrecognized type of vote: ' + v.url);
                }
                return `Vote on ${voteItem}`;
            })
        ];

        let options = {
            delimiter: delimiter,
            header: true,
            columns: header
        };
        let data = [];

        for (let rep of reps) {
            let role = rep.roles.find(role => role.congress == congress);
            let district = role.district ? role.state+'-'+role.district : role.state;
            let repName = [ role.short_title, rep.first_name, rep.middle_name, rep.last_name, rep.suffix ];
            repName = repName.filter(n => n).join(' ');
            let repCommittees = role.committees
                .concat(role.subcommittees)
                .map(c => `${c.code} (${c.title})`)
                .join(subDelimiter);

            data.push([
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
                    if (bill.sponsor_id === rep.id)
                        return 'Original';
                    if (bill.cosponsors.find(c => c.cosponsor_id === rep.id))
                        return 'Yes';
                    return null;
                }),
                ...votes.map(v => {
                    let memVote = v.positions.find(p => p.member_id === rep.id);
                    return memVote ? memVote.vote_position : null;
                })
            ]);
        }

        return new Promise((resolve, reject) =>
            csv(data, options, (err, output) =>
                err ? reject(err) : resolve(output)));
    }
}

const getDecidingVote = type => {
    switch (type) {
        case 'hr':
            // fall through
        case 'hjres':
            return [ 'On Passage', 'On Motion to Suspend the Rules and Pass' ];
        case 'hconres':
            // fall through
        case 'hres':
            return [ 'On Agreeing to the Resolution', 'On Motion to Suspend the Rules and Agree' ];
        case 's':
            return [ 'On Passage of the Bill' ];
        case 'sjres':
            return [ 'On the Joint Resolution' ];
        case 'sconres':
            return [ 'On the Concurrent Resolution' ];
        case 'sres':
            return [ 'On the Resolution' ];
    }
    throw new Error(`Bad legislation type ${type}, could not get question for deciding vote.`);
};

module.exports = MOCVote;
