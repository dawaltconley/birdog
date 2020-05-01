const Secret = require('@dawaltconley/secret')
const TrackMOC = require('./index.js')

const proPublica = new Secret('https://api.propublica.org/congress/v1')

proPublica.get()
    .then(async ({ password }) => {
        const tracker = new TrackMOC({ key: password })
        const members = await tracker.updateMems()
        console.log(members)
    })
