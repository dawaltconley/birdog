const fs = require('fs');
const path = require('path');
const csv = require('csv-stringify');
const ProPublica = require(path.join(__dirname, '..', 'propublica.js'));
const keys = require(path.join(__dirname, '..', 'keys.js'));

exports.command = [ '$0', 'records' ];

exports.describe = 'get voting records for all members of congress';

exports.builder = {
    v: {
        alias: 'votes',
        describe: 'pull voting records from bill or roll call numbers',
        type: 'array',
        default: [],
        requiresArg: true
    },
    c: {
        alias: 'cosponsors',
        describe: 'pull cosponsors for legislation by bill number',
        type: 'array',
        default: [],
        requiresArg: true
    },
    f: {
        alias: 'file',
        describe: 'file path to write records to',
        type: 'string',
        requiresArg: true
    },
    congress: {
        describe: 'congress to use when pulling members and searching for bills',
        type: 'number',
        nargs: 1,
        default: ProPublica.guessSession().congress,
        requiresArg: true
    }
};

exports.handler = async argv => {
    console.info(argv);
    const pp = new ProPublica({
        key: await keys.get('propublica'),
        congress: argv.congress
    });

    let reps = pp.reps.length ? pp.reps : pp.updateMems();
    let cosponsors = argv.cosponsors.map(ref => pp.getCosponsors(ref));
    let votes = argv.votes.map(ref => pp.getVote(ref));

    [ reps, cosponsors, votes ] = await Promise.all([
        reps,
        Promise.all(cosponsors).then(r => r.flat()),
        Promise.all(votes).then(r => r.flat())
    ]);

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

    const stringifier = csv({
        header: true,
        columns: columns
    });
    const output = argv.file ? fs.createWriteStream(argv.file) : process.stdout;

    return new Promise((resolve, reject) => {
        stringifier.on('error', e => reject(e));
        stringifier.pipe(output);

        for (let rep of reps) {
            let role = rep.roles.find(role => role.congress == pp.congress);
            let district = role.district ? role.state+'-'+role.district : role.state;
            let repName = [ role.short_title, rep.first_name, rep.middle_name, rep.last_name, rep.suffix ];
            repName = repName.filter(n => n).join(' ');
            let repCommittees = role.committees
                .concat(role.subcommittees)
                .map(c => `${c.code} (${c.title})`)
                .join(',');

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

        stringifier.end();
        resolve();
    });
};
