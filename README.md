# birdog

A simple CLI using the ProPublica database to track the voting records of members of the US Congress.

## Install &amp; configure

Install via npm:

```
npm i -g birdog
```

This app requires an API key for ProPublica's Congress database. You can [request one here.](https://www.propublica.org/datastore/api/propublica-congress-api)

Once you have an API key, run `birdog config` and you will be prompted to enter it. You only need to do this once.

Run `birdog --help` for a full list of commands.

## Pulling legislative records

The main function of this application is to compare the voting records of members of Congress on different pieces of legislation.
Consider the following, using bills related to the repeal of the 2001 and 2002 Authorizations for Use of Military Force (AUMFs) as an example:

```
birdog records --votes hr256 hjres114-107 --cosponsors sjres10
```

If no congress is specified using the `--congress` option, `birdog` does its best to guess the current congress (in this case, 117).
So the above command pulls voting records for the original 2002 AUMF from the 107th Congress, [H.J.Res.114](https://www.congress.gov/bill/107th-congress/house-joint-resolution/114),
and [H.R.256](https://www.congress.gov/bill/117th-congress/house-bill/256), the most recent House bill to repeal the 2002 AUMF.

This command will also pull a list of cosponsors for [S.J.Res.10](https://www.congress.gov/bill/117th-congress/senate-joint-resolution/10),
the current Senate bill to repeal the 2002 AUMF, which has not been voted on yet. It will output a csv of those records to stdout, together with info about representatives'
districts and committee appointments. You can use the `-f` or `--file` option to output to a file instead.

By default, `birdog` will look for the most recent _decisive vote_ on a piece of legislation; i.e. a vote to pass or a vote to table.
However, you can also provide roll call numbers instead, to specify exactly which vote you want records for. `birdog` uses the `legislative-parser`
script to parse both bill names and roll call numbers. You can use any string that can be parsed by that script;
please refer to its [documentation](https://www.npmjs.com/package/legislative-parser) for more information.

## Managing the cache

`birdog` keeps a local cache of data on members of congress, in order to minimize API requests. The `records` command will always check for obvious changes to membership before it pulls voting records, so it will mostly stay up to date on its own. You can also run `birdog update` to download new information on every member of congress; this will take longer, but will ensure that the local data is fully up-to-date.

## Status

This is a very experimental version, published for testing. I may add more features and the entire API is subject to change.

### To-dos

- Convert to Typescript, probably using & contributing to the unofficial [ProPublica SDK](https://github.com/njgingrich/propublica-congress-sdk)
- Allow adding the results of a query directly to a shared database, i.e. Airtable or Google Sheets. Having a regularly-updated sheet is pretty important for legislative campaigns.
- Distribute as executable binaries. I have started exploring options using caxa, which is probably the best bet for a JavaScript CLI. Converting this project to Deno would help to, and may be more reliable, although the file size is currently considerably larger. Finally, I could rewrite this script in Go or another language suited to binary compilation and distribution. The main barrier to that at the moment is the [legislative-parser](https://github.com/dawaltconley/legislative-parser) dependency, which would need to be re-written in [pigeon](https://github.com/mna/pigeon) or something similar.
