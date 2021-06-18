const { prompt, whisper } = require('@dawaltconley/cue');
const keytar = require('keytar');
const TrackMOC = require('./index.js');
const fsp = require('fs').promises;

const fileExists = path => fsp.access(path)
    .then(() => true)
    .catch(e => e.code === 'ENOENT' ? false : e);

const getKey = async (service='api.propublica.org') => {
    let key = await keytar.findPassword(service);
    if (!key) {
        console.log(`Couldn't find key for ${service}. Please enter manually.`);
        let account = await prompt('Account:');
        key = await whisper('API Key:');
        await keytar.setPassword(service, account, key);
    }
    return key;
};

getKey().then(k => new TrackMOC({ key: k }))
    .then(async tracker => {
        if (await fileExists('./examples/members.json')) {
            console.log('local reps exist');
            let reps = await fsp.readFile('./examples/members.json');
            console.log('loaded reps');
            tracker.reps = JSON.parse(reps);
        }
        let members = await tracker.updateMems();
        let bill = tracker.getBill('hconres83-116');
        let cosponsors = tracker.getCosponsors('hr2590-117');
        let vote = tracker.getVote('h.1.468-116');
        let ndaaVote = tracker.getVote('hr2500-116');
        let iranBills = tracker.getBillsByKeyword('iran');
        let csv = tracker.getCSV({
            cosponsors: [ 'sjres10', 'hr256', 'hr3261', 'hr2014' ],
            votes: [ 'h.1.464-116', 'S.1.195-115', 'hr256' ]
        });

        [ bill, cosponsors, vote, ndaaVote, iranBills, csv ] = await Promise.all([ bill, cosponsors, vote, ndaaVote, iranBills, csv ]);

        let local = [];
        local.push(fsp.writeFile('./examples/members.json', JSON.stringify(members)));
        local.push(fsp.writeFile('./examples/bill.json', JSON.stringify(bill)));
        local.push(fsp.writeFile('./examples/cosponsors.json', JSON.stringify(cosponsors)));
        local.push(fsp.writeFile('./examples/vote.json', JSON.stringify(vote)));
        local.push(fsp.writeFile('./examples/ndaa.json', JSON.stringify(ndaaVote)));
        local.push(fsp.writeFile('./examples/iran.json', JSON.stringify(iranBills)));
        local.push(fsp.writeFile('./examples/aumf.csv', csv));
        return Promise.all(local);
    })
    .then(() => console.log('done'))
    .catch(e => console.error(e));
