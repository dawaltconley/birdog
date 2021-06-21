# birdog

A simple CLI using the ProPublica database to track the voting records of members of the US Congress.

## Install &amp; Configure

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
the current Senate bill to repeal the 2002 AUMF, which has not been voted on yet. It will output a csv of those records to stdout, together with info about congressmembers'
districts and committee appointments. You can use the `-f` or `--file` option to output to a file instead.

By default, `birdog` will look for the most recent _decicive vote_ on a piece of legislation; i.e. a vote to pass or a vote to table.
However, you can also provide roll call numbers instead, to specify exactly which vote you want records for. `birdog` uses the `legislative-parser`
script to parse both bill names and roll call numbers. You can use any string that can be parsed by that script;
please refer to its [documentation](https://www.npmjs.com/package/legislative-parser) for more information.

## Status

This is a very experimental version, published for testing. I may add more features and the entire API is subject to change.
