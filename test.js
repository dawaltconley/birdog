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
        let bill = await tracker.getBill('hconres83-116');
        let vote = await tracker.getVote('hconres83-116');
        console.dir({ bill }, { depth: null });
        let local = [];
        local.push(fsp.writeFile('./examples/members.json', JSON.stringify(members)));
        local.push(fsp.writeFile('./examples/bill.json', JSON.stringify(bill)));
        local.push(fsp.writeFile('./examples/vote.json', JSON.stringify(vote)));
        return Promise.all(local);
    })
    .then(() => console.log('done'))
    .catch(e => console.error(e));
