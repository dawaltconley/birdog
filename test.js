const cmd = require('./commands/records.js').handler;

cmd({
    cosponsors: [ 'sjres10', 'hr256', 'hr3261', 'hr2014', 'hjres114-107', 'sjres46-107' ],
    votes: [ 'hr550-116', 'h.1.464-116', 'S.1.195-115', 'hr256', 'hjres114-107' ],
    file: './examples/aumf.csv'
});
